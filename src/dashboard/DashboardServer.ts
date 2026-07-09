import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AuditConfig, AuditResult } from '../types/index.js';
import { Logger } from '../utils/Logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Served when the compiled React bundle is missing next to this file. */
const MISSING_BUILD_PAGE = `<!DOCTYPE html>
<html lang="en">
  <head><meta charset="UTF-8" /><title>dsaudit — dashboard build missing</title></head>
  <body style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; line-height: 1.6;">
    <h1>Dashboard build missing</h1>
    <p>The compiled dashboard was not found. Build it with:</p>
    <pre style="background:#f4f4f5;padding:1rem;border-radius:6px;">npm run build</pre>
    <p>Then re-run the audit. The JSON results are still available at
      <a href="/audit/results.json">/audit/results.json</a>.</p>
  </body>
</html>`;

export class DashboardServer {
  private config: AuditConfig;
  public results: AuditResult;
  private app: express.Application;
  private logger: Logger;
  private server: ReturnType<express.Application['listen']> | undefined;
  public progressClients: Set<express.Response> = new Set();
  // Event buffer for replaying missed events to late-connecting clients
  private eventBuffer: Array<{ data: unknown; timestamp: number }> = [];
  private readonly MAX_BUFFER_SIZE = 50;
  private readonly EVENT_EXPIRY_MS = 60000; // 1 minute
  private routesReady: Promise<void>;
  private auditRunning = false;

  constructor(config: AuditConfig, results: AuditResult) {
    this.config = config;
    this.results = results;
    this.app = express();
    this.logger = new Logger();
    this.setupMiddleware();
    this.routesReady = this.setupRoutes().catch(err => {
      this.logger.error(`Failed to setup routes: ${err}`);
    });
  }

  /** Directory the report generator writes into: `<projectPath>/<outputPath>`. */
  private outputDir(): string {
    return path.join(this.config.projectPath, this.config.outputPath || 'audit');
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async loadLatestResults(): Promise<void> {
    try {
      const resultsPath = path.join(this.outputDir(), 'results.json');
      if (await this.fileExists(resultsPath)) {
        const content = await fs.readFile(resultsPath, 'utf-8');
        const diskResults = JSON.parse(content) as AuditResult;
        // Disk results are the source of truth when available
        this.logger.info(`Loading results from disk (${diskResults.timestamp})`);
        this.results = diskResults;
      }
    } catch (error) {
      this.logger.warn(`Could not load results from disk: ${error}`);
      // Continue with the in-memory results
    }
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
  }

  private async setupRoutes(): Promise<void> {
    // API endpoints
    this.app.get('/api/results', async (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      if (req.query.refresh === 'true') {
        await this.loadLatestResults();
      }
      res.json(this.results);
    });

    // Server-Sent Events endpoint for progress updates
    this.app.get('/api/progress', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      // Send initial connection message
      res.write('data: {"type": "connected"}\n\n');

      this.progressClients.add(res);
      this.logger.info(`Client connected. Total clients: ${this.progressClients.size}`);

      // Replay buffered events to catch up late-connecting clients
      const now = Date.now();
      const validEvents = this.eventBuffer.filter(e => now - e.timestamp < this.EVENT_EXPIRY_MS);
      if (validEvents.length > 0) {
        this.logger.info(`Replaying ${validEvents.length} buffered events to new client`);
        validEvents.forEach(event => {
          try {
            res.write(`data: ${JSON.stringify(event.data)}\n\n`);
          } catch {
            // Ignore write errors during replay
          }
        });
      }

      // Heartbeat to keep the connection alive
      const heartbeat = setInterval(() => {
        try {
          res.write(': heartbeat\n\n');
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);

      req.on('close', () => {
        clearInterval(heartbeat);
        this.progressClients.delete(res);
        this.logger.info(`Client disconnected. Total clients: ${this.progressClients.size}`);
      });
    });

    // Start a new audit from the dashboard
    this.app.post('/api/start-audit', async (req, res) => {
      if (this.auditRunning) {
        res.status(409).json({
          error: 'Audit already running',
          message: 'An audit is already in progress. Watch the Live Progress view for updates.',
        });
        return;
      }

      try {
        this.logger.info('Starting new audit via API...');

        const { AuditEngine } = await import('../core/AuditEngine.js');
        const engine = new AuditEngine(this.config);

        // Derived from the config, never hardcoded
        const totalCategories = Object.values(this.config.modules).filter(Boolean).length;
        let completedCount = 0;

        engine.on('audit:start', () => {
          completedCount = 0;
          this.sendProgressUpdate({
            type: 'audit:start',
            totalCategories,
            progress: 0,
            message: 'Starting design system audit...',
          });
        });

        engine.on('category:start', categoryId => {
          this.sendProgressUpdate({
            type: 'category:start',
            category: categoryId,
            progress: Math.round((completedCount / totalCategories) * 100),
            message: `Auditing ${categoryId}...`,
          });
        });

        engine.on('category:complete', (categoryId, result) => {
          completedCount++;
          this.sendProgressUpdate({
            type: 'category:complete',
            category: categoryId,
            result,
            progress: Math.round((completedCount / totalCategories) * 100),
            message: `Completed ${categoryId} (Score: ${result.score})`,
          });
        });

        engine.on('category:error', (categoryId, error) => {
          completedCount++;
          this.sendProgressUpdate({
            type: 'category:error',
            category: categoryId,
            error: error instanceof Error ? error.message : String(error),
            progress: Math.round((completedCount / totalCategories) * 100),
          });
        });

        // AI judge phase — forwarded so the client can show a review phase
        engine.on('ai:start', () => {
          this.sendProgressUpdate({ type: 'ai:start', message: 'AI judge review started...' });
        });

        engine.on('ai:category', categoryId => {
          this.sendProgressUpdate({
            type: 'ai:category',
            category: categoryId,
            message: `AI judge reviewing ${categoryId}...`,
          });
        });

        engine.on('ai:complete', () => {
          this.sendProgressUpdate({ type: 'ai:complete', message: 'AI judge review complete' });
        });

        engine.on('ai:error', error => {
          this.sendProgressUpdate({
            type: 'ai:error',
            error: error instanceof Error ? error.message : String(error),
            message: 'AI judge review failed — scores are deterministic only',
          });
        });

        engine.on('audit:complete', result => {
          this.results = result;
        });

        // Run in the background; persist reports so disk stays in sync
        this.auditRunning = true;
        engine
          .run()
          .then(async result => {
            try {
              const { ReportGenerator } = await import('../core/ReportGenerator.js');
              await new ReportGenerator(this.config).generate(result);
            } catch (reportError) {
              this.logger.warn(`Report generation failed: ${reportError}`);
            }
            this.sendProgressUpdate({
              type: 'audit:complete',
              progress: 100,
              result,
              message: 'Audit completed successfully!',
            });
          })
          .catch(error => {
            this.logger.error(`Audit failed: ${error}`);
            this.sendProgressUpdate({
              type: 'audit:error',
              error: error instanceof Error ? error.message : String(error),
            });
          })
          .finally(() => {
            this.auditRunning = false;
          });

        res.json({
          success: true,
          totalCategories,
          message: 'Audit started. Watch the Live Progress view for updates.',
        });
      } catch (error) {
        this.auditRunning = false;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to start audit: ${message}`);
        res.status(500).json({ error: 'Failed to start audit', message });
      }
    });

    // Generated audit files (written by ReportGenerator into the output dir)
    this.app.get('/audit/report.md', async (req, res) => {
      try {
        const reportPath = path.join(this.outputDir(), 'report.md');
        if (await this.fileExists(reportPath)) {
          const content = await fs.readFile(reportPath, 'utf-8');
          res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
          res.send(content);
        } else {
          res
            .status(404)
            .send('Markdown report not found. Run an audit first to generate the report.');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error serving markdown report: ${message}`);
        res.status(500).send('Error loading markdown report');
      }
    });

    this.app.get('/audit/results.json', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.json(this.results);
    });

    // React app (built by vite into dist/dashboard/app) — or an honest error
    // page when the build is missing
    const reactBuildDir = path.join(__dirname, 'app');
    const reactBuildPath = path.join(reactBuildDir, 'index.html');
    const hasReactBuild = await this.fileExists(reactBuildPath);

    if (hasReactBuild) {
      this.app.use(
        express.static(reactBuildDir, {
          maxAge: '1d',
          setHeaders: (res, filePath) => {
            if (filePath.endsWith('.css')) {
              res.setHeader('Content-Type', 'text/css');
            } else if (filePath.endsWith('.js')) {
              res.setHeader('Content-Type', 'application/javascript');
            }
          },
        })
      );

      // SPA catch-all (must come after API routes)
      this.app.use(async (req, res, next) => {
        if (req.path.startsWith('/api/')) {
          return next();
        }
        try {
          const html = await fs.readFile(reactBuildPath, 'utf-8');
          res.send(html);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Error serving React app: ${message}`);
          res.status(500).send('Error loading dashboard');
        }
      });
    } else {
      this.app.use((req, res, next) => {
        if (req.path.startsWith('/api/') || req.path.startsWith('/audit/')) {
          return next();
        }
        res.status(503).send(MISSING_BUILD_PAGE);
      });
    }
  }

  async start(): Promise<void> {
    await this.routesReady;
    const port = this.config.dashboard.port;

    return new Promise((resolve, reject) => {
      let settled = false;

      this.server = this.app.listen(port, () => {
        // Don't resolve immediately: on some platforms a conflicting bind
        // emits 'listening' first and 'error' (EADDRINUSE) a tick later.
        setTimeout(() => {
          if (!settled) {
            settled = true;
            this.logger.success(`Dashboard running at http://localhost:${port}`);
            resolve();
          }
        }, 100);
      });

      this.server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          this.logger.error(
            `Port ${port} is already in use — pass a different port in config.dashboard.port ` +
              `(.dsaudit.json) or stop the process using it.`
          );
        } else {
          this.logger.error(`Dashboard server error: ${error.message}`);
        }
        this.server?.close();
        if (!settled) {
          settled = true;
          reject(error);
        }
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
    }
    // Close all SSE connections
    this.progressClients.forEach(client => {
      client.end();
    });
    this.progressClients.clear();
  }

  /** Broadcast a progress event to all connected SSE clients. */
  sendProgressUpdate(data: { type: string; [key: string]: unknown }): void {
    this.logger.info(`Sending progress update: ${data.type} to ${this.progressClients.size} clients`);

    // Buffer the event for late-connecting clients
    this.eventBuffer.push({ data, timestamp: Date.now() });
    if (this.eventBuffer.length > this.MAX_BUFFER_SIZE) {
      this.eventBuffer = this.eventBuffer.slice(-this.MAX_BUFFER_SIZE);
    }
    // A new audit invalidates prior events
    if (data.type === 'audit:start') {
      this.eventBuffer = [{ data, timestamp: Date.now() }];
    }

    const message = `data: ${JSON.stringify(data)}\n\n`;
    this.progressClients.forEach(client => {
      try {
        client.write(message);
      } catch {
        this.progressClients.delete(client);
      }
    });
  }
}

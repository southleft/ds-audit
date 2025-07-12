import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import type { AuditConfig, AuditResult } from '../types/index.js';
import { Logger } from '../utils/Logger.js';

export class DashboardServer {
  private config: AuditConfig;
  private results: AuditResult;
  private app: express.Application;
  private logger: Logger;
  private server: any;

  constructor(config: AuditConfig, results: AuditResult) {
    this.config = config;
    this.results = results;
    this.app = express();
    this.logger = new Logger();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    // Serve static files if we add them later
  }

  private setupRoutes(): void {
    // API endpoints
    this.app.get('/api/results', (req, res) => {
      res.json(this.results);
    });

    this.app.get('/api/config', (req, res) => {
      res.json({
        projectPath: this.config.projectPath,
        modules: this.config.modules,
      });
    });

    // Serve static files
    this.app.get('/dashboard.js', async (req, res) => {
      try {
        const jsPath = path.join(process.cwd(), 'src/dashboard/dashboard.js');
        const js = await fs.readFile(jsPath, 'utf-8');
        res.type('application/javascript').send(js);
      } catch (error) {
        res.status(500).send('Error loading dashboard script');
      }
    });

    // Serve the dashboard HTML
    this.app.get('/', async (req, res) => {
      try {
        const htmlPath = path.join(process.cwd(), 'src/dashboard/dashboard-template.html');
        const html = await fs.readFile(htmlPath, 'utf-8');
        res.send(html);
      } catch (error) {
        res.status(500).send('Error loading dashboard');
      }
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.config.dashboard.port, () => {
        this.logger.success(`Dashboard running at http://localhost:${this.config.dashboard.port}`);
        
        if (this.config.dashboard.autoOpen) {
          this.openBrowser(`http://localhost:${this.config.dashboard.port}`);
        }
        
        resolve();
      });
    });
  }


  private async openBrowser(url: string): Promise<void> {
    const { exec } = await import('child_process');
    const start = process.platform === 'darwin' ? 'open' : 
                  process.platform === 'win32' ? 'start' : 'xdg-open';
    
    exec(`${start} ${url}`);
  }

  stop(): void {
    if (this.server) {
      this.server.close();
    }
  }
}
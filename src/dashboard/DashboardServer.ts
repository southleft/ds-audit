import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AuditConfig, AuditResult } from '../types/index.js';
import { Logger } from '../utils/Logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Removed the problematic findDashboardFile function
/* function findDashboardFile(filename: string): string | null {
  
  // First, let's understand our environment
  console.log(`[DEBUG] Looking for ${filename}:`);
  console.log(`[DEBUG] __dirname: ${__dirname}`);
  console.log(`[DEBUG] __filename: ${__filename}`);
  console.log(`[DEBUG] process.cwd(): ${process.cwd()}`);
  // console.log(`[DEBUG] require.main?.filename: ${require.main?.filename}`); // Not available in ES modules
  
  // Direct path should work since __dirname is correct
  const directPath = path.join(__dirname, filename);
  console.log(`[DEBUG] Direct path: ${directPath}`);
  
  try {
    // Let's check if the file exists at the direct path
    const stats = fsSync.statSync(directPath);
    console.log(`[DEBUG] File found! Stats:`, { size: stats.size, isFile: stats.isFile() });
    return directPath;
  } catch (e: any) {
    console.log(`[DEBUG] Direct path failed:`, e.message);
    console.log(`[DEBUG] Error code:`, e.code);
  }
  
  // If direct path fails, let's check what files ARE in the directory
  try {
    const files = fsSync.readdirSync(__dirname);
    console.log(`[DEBUG] Files in __dirname:`, files);
  } catch (e: any) {
    console.log(`[DEBUG] Cannot read __dirname:`, e.message);
  }
  
  // Try alternative paths
  const possiblePaths = [
    // Check if somehow we're looking in the wrong place
    path.resolve(__dirname, filename),
    // Check parent directories
    path.join(__dirname, '..', 'dashboard', filename),
    path.join(__dirname, '..', '..', 'dist', 'dashboard', filename),
    // Absolute path to the known location
    `/Users/tjpitre/Sites/dsaudit/dist/dashboard/${filename}`
  ];
  
  console.log(`[DEBUG] Trying alternative paths...`);
  for (const possiblePath of possiblePaths) {
    try {
      const exists = fsSync.existsSync(possiblePath);
      console.log(`[DEBUG] Checking: ${possiblePath} - ${exists ? 'EXISTS' : 'NOT FOUND'}`);
      if (exists) {
        return possiblePath;
      }
    } catch (e) {
      console.log(`[DEBUG] Error checking ${possiblePath}: ${e}`);
    }
  }
  
  return null;
} */

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
        // Use enhanced dashboard JS
        const jsPath = path.join(__dirname, 'dashboard-enhanced.js');
        const js = await fs.readFile(jsPath, 'utf-8');
        res.type('application/javascript').send(js);
      } catch (error: any) {
        this.logger.error(`Error loading dashboard script: ${error.message}`);
        this.logger.error(`Attempted path: ${path.join(__dirname, 'dashboard.js')}`);
        res.status(500).send('Error loading dashboard script');
      }
    });
    
    // Serve new sidebar dashboard JS
    this.app.get('/dashboard-sidebar.js', async (req, res) => {
      try {
        const jsPath = path.join(__dirname, 'dashboard-sidebar.js');
        const js = await fs.readFile(jsPath, 'utf-8');
        res.type('application/javascript').send(js);
      } catch (error: any) {
        this.logger.error(`Error loading sidebar dashboard script: ${error.message}`);
        res.status(500).send('Error loading dashboard script');
      }
    });

    // Serve the dashboard HTML
    this.app.get('/', async (req, res) => {
      try {
        // Use new sidebar dashboard template
        const htmlPath = path.join(__dirname, 'dashboard-sidebar.html');
        const html = await fs.readFile(htmlPath, 'utf-8');
        res.send(html);
      } catch (error: any) {
        this.logger.error(`Error loading dashboard HTML: ${error.message}`);
        this.logger.error(`Attempted path: ${path.join(__dirname, 'dashboard-template.html')}`);
        this.logger.error(`__dirname: ${__dirname}`);
        
        // Let's debug what files are actually there
        try {
          const files = await fs.readdir(__dirname);
          this.logger.error(`Files in dashboard directory: ${files.join(', ')}`);
        } catch (e) {
          this.logger.error(`Cannot read directory: ${e}`);
        }
        
        // Send a more helpful error page
        res.status(500).send(`
          <html>
            <body>
              <h1>Dashboard Loading Error</h1>
              <p>Unable to load dashboard files.</p>
              <pre>${error.message}</pre>
              <p>Debug info:</p>
              <ul>
                <li>__dirname: ${__dirname}</li>
                <li>cwd: ${process.cwd()}</li>
              </ul>
            </body>
          </html>
        `);
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
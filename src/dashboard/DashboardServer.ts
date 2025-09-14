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
    // Check from project root
    path.join(process.cwd(), 'dist', 'dashboard', filename)
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
  public results: AuditResult;
  private app: express.Application;
  private logger: Logger;
  private server: any;
  public progressClients: Set<express.Response> = new Set();

  constructor(config: AuditConfig, results: AuditResult) {
    this.config = config;
    this.results = results;
    this.app = express();
    this.logger = new Logger();
    this.setupMiddleware();
    this.setupRoutes().catch(err => {
      this.logger.error(`Failed to setup routes: ${err}`);
    });
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async loadLatestResults(): Promise<void> {
    try {
      // Try to load results from the audit directory
      const resultsPath = path.join(this.config.projectPath, 'audit', 'results.json');
      if (await this.fileExists(resultsPath)) {
        const content = await fs.readFile(resultsPath, 'utf-8');
        const diskResults = JSON.parse(content) as AuditResult;
        
        // Always prefer disk results when available - they are the source of truth
        this.logger.info(`Loading results from disk (${diskResults.timestamp})`);
        this.results = diskResults;
      } else {
        // Also try the current working directory's audit folder
        const cwdResultsPath = path.join(process.cwd(), 'audit', 'results.json');
        if (await this.fileExists(cwdResultsPath)) {
          const content = await fs.readFile(cwdResultsPath, 'utf-8');
          const diskResults = JSON.parse(content) as AuditResult;
          this.logger.info(`Loading results from current directory (${diskResults.timestamp})`);
          this.results = diskResults;
        }
      }
    } catch (error) {
      this.logger.warn(`Could not load results from disk: ${error}`);
      // Continue with the results passed to constructor
    }
  }

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: '1mb' })); // Increase payload limit for chat
    // Serve static files if we add them later
  }

  private async setupRoutes(): Promise<void> {
    // API endpoints
    this.app.get('/api/results', async (req, res) => {
      // Add headers to prevent caching
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      // Only load from disk on initial request or if explicitly requested
      if (req.query.refresh === 'true') {
        await this.loadLatestResults();
      }
      res.json(this.results);
    });

    this.app.get('/api/config', (req, res) => {
      res.json({
        projectPath: this.config.projectPath,
        modules: this.config.modules,
      });
    });
    
    // Server-Sent Events endpoint for progress updates
    this.app.get('/api/progress', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      // Send initial connection message
      res.write('data: {"type": "connected"}\n\n');
      
      // Add client to the set
      this.progressClients.add(res);
      this.logger.info(`Client connected. Total clients: ${this.progressClients.size}`);
      
      // Send heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          res.write(': heartbeat\n\n');
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);
      
      // Remove client on disconnect
      req.on('close', () => {
        clearInterval(heartbeat);
        this.progressClients.delete(res);
        this.logger.info(`Client disconnected. Total clients: ${this.progressClients.size}`);
      });
    });

    // Chat API endpoint
    this.app.post('/api/chat', async (req, res) => {
      try {
        const { message, context } = req.body;
        
        // Load API key from .env file
        let apiKey = this.config.ai?.apiKey;
        if (!apiKey) {
          // Try to load from .env file
          const envPath = path.join(this.config.projectPath, '.env');
          try {
            const { default: dotenv } = await import('dotenv');
            const envContent = await fs.readFile(envPath, 'utf-8');
            const parsed = dotenv.parse(envContent);
            apiKey = parsed.ANTHROPIC_API_KEY;
            this.logger.info(`Loaded API key from .env: ${apiKey ? 'Found (length: ' + apiKey.length + ')' : 'Not found'}`);
          } catch (error) {
            this.logger.warn(`Could not load .env file for API key: ${error}`);
          }
        } else {
          this.logger.info(`Using API key from config: ${apiKey ? 'Found (length: ' + apiKey.length + ')' : 'Not found'}`);
        }
        
        // Check if AI is configured
        if (!this.config.ai?.enabled || !apiKey) {
          res.status(503).json({ 
            error: 'AI service not configured',
            response: 'AI chat requires an API key to be configured. Please ensure you have ANTHROPIC_API_KEY set in your .env file.'
          });
          return;
        }
        
        // Validate API key format
        if (apiKey && !apiKey.startsWith('sk-ant-')) {
          this.logger.warn(`Invalid API key format detected. Key starts with: ${apiKey.substring(0, 10)}`);
          res.status(503).json({ 
            error: 'Invalid API key format',
            response: `The API key appears to be invalid. Anthropic API keys must start with 'sk-ant-api...'. Your key starts with '${apiKey.substring(0, 10)}...' which appears to be an OpenAI key format. Please update your .env file with a valid Anthropic API key.`
          });
          return;
        }
        
        // Create AIService instance to handle the chat
        const { AIService } = await import('../core/AIService.js');
        const aiService = new AIService(apiKey, this.config.ai?.model || 'claude-sonnet-4-20250514');
        
        // Generate contextual response using Claude API
        const response = await aiService.generateChatResponse(message, context, this.results);
        
        res.json({ response });
      } catch (error: any) {
        this.logger.error(`Chat API error: ${error}`);
        res.status(500).json({ 
          error: 'Internal server error',
          response: 'I apologize, but I encountered an error processing your request. Please try again later.'
        });
      }
    });

    // Start audit API endpoint
    this.app.post('/api/start-audit', async (req, res) => {
      try {
        this.logger.info('Starting new audit via API...');
        
        // Import AuditEngine
        const { AuditEngine } = await import('../core/AuditEngine.js');
        
        // Create new audit engine with current config
        const engine = new AuditEngine(this.config);
        
        // Set up progress tracking
        let completedCount = 0;
        const totalCategories = 7; // Known number of categories
        
        engine.on('audit:start', () => {
          completedCount = 0;
          this.sendProgressUpdate({ type: 'audit:start', progress: 0 });
        });
        
        engine.on('category:start', (categoryId) => {
          this.sendProgressUpdate({ 
            type: 'category:start', 
            category: categoryId,
            progress: Math.round((completedCount / totalCategories) * 100)
          });
        });
        
        engine.on('category:complete', (categoryId, result) => {
          completedCount++;
          this.sendProgressUpdate({ 
            type: 'category:complete', 
            category: categoryId,
            result,
            progress: Math.round((completedCount / totalCategories) * 100)
          });
        });
        
        engine.on('audit:complete', (result) => {
          this.results = result; // Update stored results
          this.sendProgressUpdate({ type: 'audit:complete', progress: 100, result });
        });
        
        // Start audit in background
        engine.run().catch(error => {
          this.logger.error(`Audit failed: ${error}`);
          this.sendProgressUpdate({ type: 'audit:error', error: error.message });
        });
        
        res.json({ 
          success: true, 
          message: 'Audit started successfully. Check progress page for updates.' 
        });
        
      } catch (error: any) {
        this.logger.error(`Failed to start audit: ${error}`);
        res.status(500).json({ 
          error: 'Failed to start audit',
          message: error.message 
        });
      }
    });

    // Audit file routes
    this.app.get('/audit/report.md', async (req, res) => {
      try {
        const projectPath = this.config.projectPath || process.cwd();
        const reportPath = path.join(projectPath, 'dsaudit-report.md');
        
        if (await this.fileExists(reportPath)) {
          const content = await fs.readFile(reportPath, 'utf-8');
          res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
          res.send(content);
        } else {
          res.status(404).send('Markdown report not found. Run an audit first to generate the report.');
        }
      } catch (error: any) {
        this.logger.error(`Error serving markdown report: ${error.message}`);
        res.status(500).send('Error loading markdown report');
      }
    });

    this.app.get('/audit/results.json', (req, res) => {
      try {
        res.setHeader('Content-Type', 'application/json');
        res.json(this.results);
      } catch (error: any) {
        this.logger.error(`Error serving JSON results: ${error.message}`);
        res.status(500).json({ error: 'Error loading JSON results' });
      }
    });

    // Check if React build exists
    const reactBuildPath = path.join(__dirname, 'index.html');
    const useReactApp = await this.fileExists(reactBuildPath);

    if (useReactApp) {
      // Serve React app static files with proper headers
      this.app.use(express.static(__dirname, {
        maxAge: '1d',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
          } else if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
          }
        }
      }));
      
      // Catch-all for React SPA (must be last after all other routes)
      this.app.use(async (req, res, next) => {
        // Skip API routes - they should be handled above
        if (req.path.startsWith('/api/')) {
          return next();
        }
        
        try {
          const html = await fs.readFile(reactBuildPath, 'utf-8');
          res.send(html);
        } catch (error: any) {
          this.logger.error(`Error serving React app: ${error.message}`);
          res.status(500).send('Error loading dashboard');
        }
      });
    } else {
      // Fall back to legacy dashboard
      this.app.get('/dashboard.js', async (req, res) => {
        try {
          const jsPath = path.join(__dirname, 'dashboard-sidebar.js');
          const js = await fs.readFile(jsPath, 'utf-8');
          res.type('application/javascript').send(js);
        } catch (error: any) {
          this.logger.error(`Error loading dashboard script: ${error.message}`);
          res.status(500).send('Error loading dashboard script');
        }
      });
      
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

      this.app.get('/', async (req, res) => {
        try {
          const htmlPath = path.join(__dirname, 'dashboard-sidebar.html');
          const html = await fs.readFile(htmlPath, 'utf-8');
          res.send(html);
        } catch (error: any) {
          this.logger.error(`Error loading dashboard HTML: ${error.message}`);
          res.status(500).send(`
            <html>
              <body>
                <h1>Dashboard Loading Error</h1>
                <p>Unable to load dashboard files.</p>
                <pre>${error.message}</pre>
              </body>
            </html>
          `);
        }
      });
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.config.dashboard.port, () => {
        this.logger.success(`Dashboard running at http://localhost:${this.config.dashboard.port}`);
        
        // Don't auto-open here - let the init command handle it
        // if (this.config.dashboard.autoOpen) {
        //   this.openBrowser(`http://localhost:${this.config.dashboard.port}`);
        // }
        
        resolve();
      });
    });
  }


  private async openBrowser(url: string): Promise<void> {
    const { spawn } = await import('child_process');
    const start = process.platform === 'darwin' ? 'open' :
                  process.platform === 'win32' ? 'start' : 'xdg-open';

    // Use spawn to avoid command injection - pass URL as separate argument
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
    } else {
      spawn(start, [url], { detached: true, stdio: 'ignore' });
    }
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

  // Method to send progress updates to all connected clients
  sendProgressUpdate(data: any): void {
    this.logger.info(`Sending progress update: ${data.type} to ${this.progressClients.size} clients`);
    const message = `data: ${JSON.stringify(data)}\n\n`;
    this.progressClients.forEach(client => {
      try {
        client.write(message);
      } catch (error) {
        // Remove dead connections
        this.progressClients.delete(client);
      }
    });
  }
  
  private generateContextualResponse(message: string, context: any): string {
    const lowerMessage = message.toLowerCase();
    
    // Check for score-related questions
    if (lowerMessage.includes('score') || lowerMessage.includes('grade')) {
      return `Your design system has an overall score of ${context.overallScore}/100. Here's the breakdown by category:\n\n${
        context.categories.map((c: any) => `• ${c.name}: ${c.score}/100`).join('\n')
      }\n\nThe areas that need the most attention are those with scores below 60. Would you like specific recommendations for improving any particular category?`;
    }
    
    // Check for recommendation questions
    if (lowerMessage.includes('recommend') || lowerMessage.includes('improve') || lowerMessage.includes('fix')) {
      return `Based on your audit results, here are the top recommendations:\n\n${
        context.topRecommendations.map((r: string, i: number) => `${i + 1}. ${r}`).join('\n')
      }\n\nFocus on the lowest-scoring categories first for the biggest impact. Would you like detailed steps for any of these recommendations?`;
    }
    
    // Check for specific category questions
    const categoryNames = context.categories.map((c: any) => c.name.toLowerCase());
    const mentionedCategory = categoryNames.find((name: string) => lowerMessage.includes(name));
    
    if (mentionedCategory) {
      const category = context.categories.find((c: any) => c.name.toLowerCase() === mentionedCategory);
      return `The ${category.name} category scored ${category.score}/100 with ${category.findings} findings.\n\nThis category evaluates ${this.getCategoryDescription(category.name)}.\n\nWould you like specific action items to improve this score?`;
    }
    
    // Default response
    return `I can help you understand your design system audit results. You can ask me about:\n\n• Your overall score and grades\n• Specific category scores and what they mean\n• Recommendations for improvement\n• Best practices for design systems\n• How to prioritize fixes\n\nWhat would you like to know more about?`;
  }
  
  private getCategoryDescription(name: string): string {
    const descriptions: Record<string, string> = {
      'Component Library': 'the structure, organization, and quality of your component library including TypeScript support, testing coverage, and documentation',
      'Design Tokens': 'your design token architecture, semantic naming, theming support, and integration with design tools',
      'Documentation': 'the completeness and quality of your documentation including API docs, usage examples, and contribution guidelines',
      'Governance': 'your versioning strategy, contribution process, code review practices, and design system team structure',
      'Tooling': 'your build setup, linting configuration, development environment, and CI/CD integration',
      'Performance': 'bundle sizes, build times, runtime performance, and optimization strategies',
      'Accessibility': 'ARIA compliance, keyboard navigation, screen reader support, and inclusive design practices'
    };
    return descriptions[name] || 'various aspects of your design system';
  }
}
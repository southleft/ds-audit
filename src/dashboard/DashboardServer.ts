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
    
    // Chat API endpoint
    this.app.post('/api/chat', async (req, res) => {
      try {
        const { message, context } = req.body;
        
        // Check if AI is configured
        if (!this.config.ai?.enabled || !this.config.ai?.apiKey) {
          res.status(503).json({ 
            error: 'AI service not configured',
            response: 'AI chat requires an API key to be configured. Please ensure AI is enabled in your audit configuration.'
          });
          return;
        }
        
        // Create AIService instance to handle the chat
        const { AIService } = await import('../core/AIService.js');
        const aiService = new AIService(this.config.ai.apiKey, this.config.ai.model);
        
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
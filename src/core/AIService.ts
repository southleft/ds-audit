import Anthropic from '@anthropic-ai/sdk';
import type { CategoryResult, Recommendation, Finding } from '../types/index.js';
import { Logger } from '../utils/Logger.js';

export class AIService {
  private client: Anthropic;
  private logger: Logger;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
    this.logger = new Logger();
  }

  async enhanceRecommendations(
    categoryResults: CategoryResult[],
    baseRecommendations: Recommendation[]
  ): Promise<Recommendation[]> {
    try {
      this.logger.info('Enhancing recommendations with AI insights...');
      
      // Prepare context for Claude
      const auditSummary = this.summarizeAuditResults(categoryResults);
      const existingRecommendations = this.formatRecommendations(baseRecommendations);
      
      const prompt = `You are a design system expert analyzing audit results. Based on the following audit findings, provide additional insights and recommendations.

Audit Summary:
${auditSummary}

Existing Recommendations:
${existingRecommendations}

Please provide:
1. Additional strategic recommendations not covered above
2. Implementation priorities based on impact vs effort
3. Specific action items for quick wins
4. Long-term design system maturity goals

Format your response as a structured list of recommendations with title, description, priority (high/medium/low), effort (quick-win/medium-lift/heavy-lift), and impact (high/medium/low).`;

      const response = await this.client.messages.create({
        model: 'claude-3-opus-20240229',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      // Parse AI response and merge with base recommendations
      const aiRecommendations = this.parseAIResponse(response.content);
      return this.mergeRecommendations(baseRecommendations, aiRecommendations);
      
    } catch (error) {
      this.logger.warn('AI enhancement failed, using base recommendations');
      console.error('AI Service Error:', error);
      return baseRecommendations;
    }
  }

  async analyzeComponentPatterns(components: any[]): Promise<Finding[]> {
    try {
      const componentSummary = components.map(c => ({
        name: c.name,
        hasTests: c.hasTests,
        hasStory: c.hasStory,
        hasTypes: c.hasTypes,
        type: c.type
      }));

      const prompt = `Analyze these design system components and identify patterns, gaps, and improvement opportunities:

${JSON.stringify(componentSummary, null, 2)}

Provide findings about:
1. Missing component types
2. Testing gaps
3. Documentation needs
4. Architectural improvements`;

      const response = await this.client.messages.create({
        model: 'claude-3-opus-20240229',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      return this.parseAIFindings(response.content);
    } catch (error) {
      this.logger.warn('Component analysis failed');
      return [];
    }
  }

  private summarizeAuditResults(categoryResults: CategoryResult[]): string {
    return categoryResults.map(category => {
      const criticalIssues = category.findings.filter(f => f.severity === 'critical' || f.severity === 'high');
      return `${category.name} (Score: ${category.score}/100):
- ${category.findings.length} total findings
- ${criticalIssues.length} critical/high severity issues
- Key metrics: ${JSON.stringify(category.metrics)}`;
    }).join('\n\n');
  }

  private formatRecommendations(recommendations: Recommendation[]): string {
    return recommendations.map(rec => 
      `- ${rec.title} (Priority: ${rec.priority}, Effort: ${rec.effort})`
    ).join('\n');
  }

  private parseAIResponse(content: any): Recommendation[] {
    // Extract text content from Claude's response
    const textContent = typeof content === 'string' ? content : 
                       content[0]?.text || '';
    
    const recommendations: Recommendation[] = [];
    
    // Simple parsing - in production, this would be more sophisticated
    const lines = textContent.split('\n');
    interface RecBuilder {
      title?: string;
      description?: string;
      priority?: 'high' | 'medium' | 'low';
      effort?: 'quick-win' | 'medium-lift' | 'heavy-lift';
      impact?: 'high' | 'medium' | 'low';
    }
    let currentRec: RecBuilder | null = null;
    let recId = 1000; // Start AI recommendations at ID 1000
    
    const addRecommendation = (rec: RecBuilder, id: number): void => {
      if (rec.title) {
        recommendations.push({
          id: `ai-rec-${id}`,
          title: rec.title,
          description: rec.description || '',
          priority: rec.priority || 'medium',
          effort: rec.effort || 'medium-lift',
          impact: rec.impact || 'medium',
          category: 'ai-insights'
        });
      }
    };
    
    lines.forEach((line: string) => {
      if (line.match(/^\d+\.|^-\s*\*\*|^###/)) {
        // New recommendation
        if (currentRec) {
          addRecommendation(currentRec, recId++);
        }
        currentRec = {
          title: line.replace(/^\d+\.|^-\s*\*\*|^###/, '').trim()
        };
      } else if (currentRec && line.trim()) {
        // Parse properties
        if (line.toLowerCase().includes('priority:')) {
          currentRec.priority = this.extractValue(line, 'priority') as any;
        } else if (line.toLowerCase().includes('effort:')) {
          currentRec.effort = this.extractValue(line, 'effort') as any;
        } else if (line.toLowerCase().includes('impact:')) {
          currentRec.impact = this.extractValue(line, 'impact') as any;
        } else {
          currentRec.description = (currentRec.description || '') + ' ' + line.trim();
        }
      }
    });
    
    // Add last recommendation
    if (currentRec) {
      addRecommendation(currentRec, recId);
    }
    
    return recommendations;
  }

  private parseAIFindings(content: any): Finding[] {
    const textContent = typeof content === 'string' ? content : 
                       content[0]?.text || '';
    
    const findings: Finding[] = [];
    const lines = textContent.split('\n');
    
    lines.forEach((line: string, index: number) => {
      if (line.trim() && (line.match(/^\d+\.|^-/) || line.includes(':'))) {
        findings.push({
          id: `ai-finding-${index}`,
          type: 'info',
          message: line.replace(/^\d+\.|^-/, '').trim(),
          severity: 'medium',
          suggestion: 'AI-generated insight'
        });
      }
    });
    
    return findings;
  }

  private extractValue(line: string, key: string): string {
    const regex = new RegExp(`${key}:\\s*([\\w-]+)`, 'i');
    const match = line.match(regex);
    return match ? match[1].toLowerCase() : 'medium';
  }

  private mergeRecommendations(
    base: Recommendation[],
    ai: Recommendation[]
  ): Recommendation[] {
    // Combine and deduplicate recommendations
    const merged = [...base];
    
    // Add AI recommendations that don't duplicate existing ones
    ai.forEach(aiRec => {
      const isDuplicate = base.some(baseRec => 
        this.similarRecommendations(baseRec, aiRec)
      );
      
      if (!isDuplicate) {
        merged.push(aiRec);
      }
    });
    
    // Re-sort by priority
    return merged.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      const impactOrder = { high: 3, medium: 2, low: 1 };
      
      const scoreA = priorityOrder[a.priority] * impactOrder[a.impact];
      const scoreB = priorityOrder[b.priority] * impactOrder[b.impact];
      
      return scoreB - scoreA;
    });
  }

  private similarRecommendations(rec1: Recommendation, rec2: Recommendation): boolean {
    // Simple similarity check - could be enhanced with NLP
    const title1 = rec1.title.toLowerCase();
    const title2 = rec2.title.toLowerCase();
    
    // Check for common keywords
    const keywords1 = title1.split(' ').filter(w => w.length > 3);
    const keywords2 = title2.split(' ').filter(w => w.length > 3);
    
    const commonKeywords = keywords1.filter(k => keywords2.includes(k));
    
    return commonKeywords.length >= 2;
  }
}
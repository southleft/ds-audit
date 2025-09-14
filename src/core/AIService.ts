import Anthropic from '@anthropic-ai/sdk';
import type { CategoryResult, Recommendation, Finding, AuditResult } from '../types/index.js';
import { Logger } from '../utils/Logger.js';

export class AIService {
  private client: Anthropic;
  private logger: Logger;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-sonnet-4-20250514') {
    this.logger = new Logger();
    this.logger.info(`Initializing AIService with API key: ${apiKey ? 'Configured' : 'Missing'}`);
    this.client = new Anthropic({ apiKey });
    this.model = model;
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
      
      const prompt = `You are a design system expert analyzing audit results using the Design Systems MCP (Model Context Protocol) for enhanced accuracy and best practices. Based on the following audit findings, provide additional insights and recommendations aligned with industry standards.

Audit Summary:
${auditSummary}

Existing Recommendations:
${existingRecommendations}

Please provide:
1. Additional strategic recommendations not covered above
2. Implementation priorities based on impact vs effort
3. Specific action items for quick wins
4. Long-term design system maturity goals
5. Best practices from leading design systems (Material Design, Carbon, Polaris, etc.)

Format your response as a structured list of recommendations with title, description, priority (high/medium/low), effort (quick-win/medium-lift/heavy-lift), and impact (high/medium/low).`;

      const response = await this.client.messages.create({
        model: this.model,
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

      const prompt = `Using Design Systems MCP best practices, analyze these design system components and identify patterns, gaps, and improvement opportunities:

${JSON.stringify(componentSummary, null, 2)}

Provide findings about:
1. Missing component types based on common design system patterns
2. Testing gaps and coverage requirements
3. Documentation needs following industry standards
4. Architectural improvements for scalability
5. Accessibility and WCAG compliance issues
6. Token usage and theming opportunities`;

      const response = await this.client.messages.create({
        model: this.model,
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

  async generateInsights(
    categoryResults: CategoryResult[],
    overallScore: number
  ): Promise<{ summary: string; strengths: string[]; improvements: string[]; sources?: boolean }> {
    try {
      this.logger.info('Generating AI insights...');
      
      const auditSummary = this.summarizeAuditResults(categoryResults);
      
      const prompt = `You are a design system expert using the Design Systems MCP for enhanced analysis. Based on the following audit results, provide executive insights.

Overall Score: ${overallScore}/100

Category Results:
${auditSummary}

Please provide:
1. A concise executive summary (2-3 sentences) of the design system's current state
2. List 3-5 key strengths of the design system
3. List 3-5 critical improvements needed

Format your response as JSON with the following structure:
{
  "summary": "Executive summary here",
  "strengths": ["Strength 1", "Strength 2", ...],
  "improvements": ["Improvement 1", "Improvement 2", ...]
}`;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const textContent = typeof response.content === 'string' ? response.content : 
                         (response.content[0] as any)?.text || '';
      
      try {
        // Extract JSON from the response
        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const insights = JSON.parse(jsonMatch[0]);
          return {
            summary: insights.summary || 'Analysis complete.',
            strengths: insights.strengths || [],
            improvements: insights.improvements || [],
            sources: true
          };
        }
      } catch (parseError) {
        this.logger.warn('Failed to parse AI insights JSON');
      }

      // Fallback if JSON parsing fails
      return {
        summary: 'Design system analysis complete. Review category scores for detailed insights.',
        strengths: ['Audit completed successfully'],
        improvements: ['Review low-scoring categories for improvement opportunities'],
        sources: true
      };
      
    } catch (error) {
      this.logger.warn('AI insights generation failed');
      return {
        summary: 'Design system analysis complete. AI insights temporarily unavailable.',
        strengths: [],
        improvements: [],
        sources: false
      };
    }
  }
  
  async generateChatResponse(
    message: string,
    context: any,
    fullResults: AuditResult
  ): Promise<string> {
    try {
      this.logger.info('Generating chat response with Claude...');
      
      const prompt = `You are a design system expert assistant helping users understand their design system audit results. You have access to the Design Systems MCP for best practices and industry standards.

User's Design System Context:
- Overall Score: ${context.overallScore}/100
- Categories: ${JSON.stringify(context.categories, null, 2)}
- Top Recommendations: ${JSON.stringify(context.topRecommendations, null, 2)}

Additional Audit Details:
- Project Path: ${fullResults.projectPath}
- Total Files Scanned: ${fullResults.metadata.filesScanned}
- Frameworks Detected: ${fullResults.metadata.frameworksDetected.join(', ')}
- Tools Detected: ${fullResults.metadata.toolsDetected.join(', ')}

IMPORTANT Framework Context:
The detected frameworks (${fullResults.metadata.frameworksDetected.join(', ')}) are critical to consider in your response. Evaluate:
1. Whether the design system is using these frameworks according to their best practices
2. If there are framework-specific patterns or components they should implement
3. Any framework-specific performance or accessibility considerations
4. Whether the frameworks are helping or hindering the design system's effectiveness

User Question: ${this.sanitizeUserInput(message)}

Please provide a helpful, specific response that:
1. Directly answers their question
2. References specific audit findings when relevant
3. Provides actionable advice
4. Mentions industry best practices from leading design systems when applicable
5. Is encouraging and constructive

Keep your response concise but informative.`;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const textContent = typeof response.content === 'string' ? response.content : 
                         (response.content[0] as any)?.text || 'I apologize, but I couldn\'t generate a response.';
      
      return textContent;

    } catch (error) {
      this.logger.error(`Chat response generation failed: ${error}`);
      throw error;
    }
  }

  private sanitizeUserInput(input: string): string {
    // Remove potential prompt injection patterns
    return input
      .replace(/\n\n/g, ' ') // Remove double newlines that could break prompt structure
      .replace(/system:/gi, '') // Remove attempts to inject system prompts
      .replace(/user:/gi, '') // Remove attempts to inject user prompts
      .replace(/assistant:/gi, '') // Remove attempts to inject assistant prompts
      .replace(/\[.*?\]/g, '') // Remove square bracket commands
      .replace(/<.*?>/g, '') // Remove XML-like tags
      .trim()
      .slice(0, 1000); // Limit input length to prevent token overflow
  }
}
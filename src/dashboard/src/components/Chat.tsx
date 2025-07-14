import React, { useState, useRef, useEffect } from 'react';
import { Title, TextInput, Button, Card, Text, Group, ScrollArea, Loader, Badge } from '@mantine/core';
import ReactMarkdown from 'react-markdown';
import { AuditResult } from '@types';
import { sendChatMessage } from '../utils/api';
import './Chat.css';

interface ChatProps {
  auditResult: AuditResult;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const Chat: React.FC<ChatProps> = ({ auditResult }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: `Hi! I'm Claude, your AI assistant. I can help you understand your design system audit results. 

I have access to your audit data showing:
- Overall score: ${auditResult.overallScore} (Grade ${auditResult.overallGrade})
- ${auditResult.categories.length} categories analyzed
- ${auditResult.metadata?.filesScanned || 0} files scanned

Feel free to ask me questions like:
- "How many React components were detected?"
- "Which components are missing tests?"
- "What styling methods were most common?"
- "What are the most critical issues to fix?"`,
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    // More reliable scroll to bottom using setTimeout to ensure DOM updates
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
      // Fallback to the original method
      if (scrollAreaRef.current) {
        const scrollArea = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (scrollArea) {
          scrollArea.scrollTop = scrollArea.scrollHeight;
        }
      }
    }, 100);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Create a summary context instead of sending full audit result
      const summaryContext = {
        overallScore: auditResult.overallScore,
        overallGrade: auditResult.overallGrade,
        projectPath: auditResult.projectPath,
        timestamp: auditResult.timestamp,
        metadata: auditResult.metadata,
        categories: auditResult.categories.map(cat => ({
          name: cat.name,
          score: cat.score,
          grade: cat.grade,
          weight: cat.weight,
          findingsCount: cat.findings?.length || 0,
          recommendationsCount: cat.recommendations?.length || 0,
          description: cat.description
        })),
        topRecommendations: auditResult.recommendations?.slice(0, 5) || [],
        highPriorityCount: auditResult.recommendations?.filter(r => r.priority === 'high').length || 0,
        previousMessages: messages.slice(-3).map(m => ({ role: m.role, content: m.content.substring(0, 200) }))
      };

      const response = await sendChatMessage(input, summaryContext);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please make sure the API is configured correctly.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const suggestedQuestions = [
    "What are the top 3 issues I should fix first?",
    "How is my component documentation?",
    "What's my accessibility score?",
    "Are there any missing design tokens?"
  ];

  return (
    <div className="chat-container">
      <Title order={2} mb="xl">Chat with Claude</Title>

      <Card className="chat-card">
        <ScrollArea h={500} ref={scrollAreaRef} className="messages-area">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`message ${message.role}`}
            >
              <div className="message-header">
                <Badge
                  size="sm"
                  variant={message.role === 'user' ? 'filled' : 'light'}
                  color={message.role === 'user' ? 'blue' : 'violet'}
                >
                  {message.role === 'user' ? 'You' : 'Claude'}
                </Badge>
                <Text size="xs" c="dimmed">
                  {message.timestamp.toLocaleTimeString()}
                </Text>
              </div>
              <div className="message-content">
                {message.role === 'assistant' ? (
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <Text style={{ marginBottom: '0.5rem' }}>{children}</Text>,
                      h1: ({ children }) => <Text size="xl" fw={700} mb="sm">{children}</Text>,
                      h2: ({ children }) => <Text size="lg" fw={600} mb="sm">{children}</Text>,
                      h3: ({ children }) => <Text size="md" fw={600} mb="xs">{children}</Text>,
                      ul: ({ children }) => <ul style={{ paddingLeft: '1rem', marginBottom: '0.5rem' }}>{children}</ul>,
                      ol: ({ children }) => <ol style={{ paddingLeft: '1rem', marginBottom: '0.5rem' }}>{children}</ol>,
                      li: ({ children }) => <li style={{ marginBottom: '0.25rem' }}>{children}</li>,
                      code: ({ children }) => (
                        <Text component="code" style={{ 
                          backgroundColor: 'var(--mantine-color-gray-1)', 
                          padding: '0.125rem 0.25rem', 
                          borderRadius: '0.25rem',
                          fontFamily: 'monospace',
                          fontSize: '0.875rem'
                        }}>
                          {children}
                        </Text>
                      ),
                      strong: ({ children }) => <Text component="strong" fw={600}>{children}</Text>,
                      em: ({ children }) => <Text component="em" style={{ fontStyle: 'italic' }}>{children}</Text>
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                ) : (
                  <Text style={{ whiteSpace: 'pre-wrap' }}>{message.content}</Text>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="message assistant">
              <div className="message-header">
                <Badge size="sm" variant="light" color="violet">
                  Claude
                </Badge>
              </div>
              <Group gap="xs">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">Thinking...</Text>
              </Group>
            </div>
          )}
          <div ref={messagesEndRef} />
        </ScrollArea>

        <div className="input-area">
          <TextInput
            placeholder="Ask about your audit results..."
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
            rightSection={
              <Button
                size="sm"
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
              >
                Send
              </Button>
            }
            rightSectionWidth={80}
          />
        </div>
      </Card>

      <Card className="suggestions-card" mt="md">
        <Text size="sm" fw={600} mb="sm">Suggested Questions:</Text>
        <Group gap="xs">
          {suggestedQuestions.map((question, idx) => (
            <Button
              key={idx}
              size="xs"
              variant="light"
              onClick={() => setInput(question)}
            >
              {question}
            </Button>
          ))}
        </Group>
      </Card>
    </div>
  );
};

export default Chat;
import React, { useState, useRef, useEffect } from 'react';
import { Title, TextInput, Button, Card, Text, Group, ScrollArea, Loader, Badge } from '@mantine/core';
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

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollArea = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollArea) {
        scrollArea.scrollTop = scrollArea.scrollHeight;
      }
    }
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
      const response = await sendChatMessage(input, {
        auditResult,
        previousMessages: messages.slice(-5) // Send last 5 messages for context
      });

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
              <Text className="message-content" style={{ whiteSpace: 'pre-wrap' }}>
                {message.content}
              </Text>
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
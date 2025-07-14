import { AuditResult } from '@types';

const API_BASE_URL = '/api';

export async function fetchAuditResults(): Promise<AuditResult> {
  const response = await fetch(`${API_BASE_URL}/results`);
  if (!response.ok) {
    throw new Error('Failed to fetch audit results');
  }
  return response.json() as Promise<AuditResult>;
}

export async function fetchConfig(): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/config`);
  if (!response.ok) {
    throw new Error('Failed to fetch configuration');
  }
  return response.json();
}

export async function sendChatMessage(message: string, context: any): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, context }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to send chat message');
  }
  
  const data = await response.json() as { response: string };
  return data.response;
}
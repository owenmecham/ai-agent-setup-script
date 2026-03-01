import pino from 'pino';

const logger = pino({ name: 'bop-consumer' });

export interface BopConsumerConfig {
  apiKey: string;
  baseUrl: string;
}

export class BopConsumer {
  private config: BopConsumerConfig;

  constructor(config: BopConsumerConfig) {
    this.config = config;
  }

  async discoverServices(query?: string): Promise<Array<{
    id: string;
    name: string;
    description: string;
    provider: string;
  }>> {
    const url = new URL('/api/services', this.config.baseUrl);
    if (query) url.searchParams.set('q', query);

    const response = await fetch(url, {
      headers: { 'X-API-Key': this.config.apiKey },
    });

    if (!response.ok) throw new Error(`BOP service discovery failed: ${response.status}`);
    const data = (await response.json()) as { services: Array<{ id: string; name: string; description: string; provider: string }> };
    return data.services;
  }

  async requestTask(serviceId: string, input: Record<string, unknown>): Promise<{
    taskId: string;
    status: string;
    result?: unknown;
  }> {
    const response = await fetch(`${this.config.baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.config.apiKey,
      },
      body: JSON.stringify({ serviceId, input }),
    });

    if (!response.ok) throw new Error(`BOP task request failed: ${response.status}`);
    return (await response.json()) as { taskId: string; status: string; result?: unknown };
  }

  async getTaskStatus(taskId: string): Promise<{
    taskId: string;
    status: string;
    result?: unknown;
    error?: string;
  }> {
    const response = await fetch(`${this.config.baseUrl}/api/tasks/${taskId}`, {
      headers: { 'X-API-Key': this.config.apiKey },
    });

    if (!response.ok) throw new Error(`BOP task status check failed: ${response.status}`);
    return (await response.json()) as { taskId: string; status: string; result?: unknown; error?: string };
  }
}

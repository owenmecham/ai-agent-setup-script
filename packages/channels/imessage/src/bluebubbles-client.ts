import pino from 'pino';

const logger = pino({ name: 'bluebubbles-client' });

export interface BlueBubblesConfig {
  url: string;
  password: string;
}

export class BlueBubblesClient {
  private baseUrl: string;
  private password: string;

  constructor(config: BlueBubblesConfig) {
    this.baseUrl = config.url.replace(/\/$/, '');
    this.password = config.password;
  }

  async sendMessage(chatGuid: string, text: string): Promise<void> {
    const url = `${this.baseUrl}/api/v1/message/text`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatGuid,
        tempGuid: `temp-${Date.now()}`,
        message: text,
        method: 'private-api',
        password: this.password,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error({ chatGuid, status: response.status, error }, 'Failed to send iMessage');
      throw new Error(`BlueBubbles send failed: ${response.status} ${error}`);
    }

    logger.info({ chatGuid }, 'Sent iMessage');
  }

  async getChats(): Promise<unknown[]> {
    const url = `${this.baseUrl}/api/v1/chat?password=${encodeURIComponent(this.password)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to get chats: ${response.status}`);
    const data = (await response.json()) as { data: unknown[] };
    return data.data;
  }

  async getMessages(chatGuid: string, limit: number = 25): Promise<unknown[]> {
    const url = `${this.baseUrl}/api/v1/chat/${encodeURIComponent(chatGuid)}/message?password=${encodeURIComponent(this.password)}&limit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to get messages: ${response.status}`);
    const data = (await response.json()) as { data: unknown[] };
    return data.data;
  }
}

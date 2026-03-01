interface BufferedMessage {
  id: string;
  conversationId: string;
  sender: string;
  content: string;
  timestamp: Date;
  channel: string;
}

export class ShortTermMemory {
  private buffers = new Map<string, BufferedMessage[]>();
  private maxSize: number;

  constructor(maxSize: number = 50) {
    this.maxSize = maxSize;
  }

  add(message: BufferedMessage): void {
    const buffer = this.buffers.get(message.conversationId) ?? [];
    buffer.push(message);
    if (buffer.length > this.maxSize) {
      buffer.shift();
    }
    this.buffers.set(message.conversationId, buffer);
  }

  getRecent(conversationId: string, limit?: number): BufferedMessage[] {
    const buffer = this.buffers.get(conversationId) ?? [];
    if (limit) {
      return buffer.slice(-limit);
    }
    return [...buffer];
  }

  getAll(): BufferedMessage[] {
    const all: BufferedMessage[] = [];
    for (const buffer of this.buffers.values()) {
      all.push(...buffer);
    }
    return all;
  }

  clear(conversationId?: string): void {
    if (conversationId) {
      this.buffers.delete(conversationId);
    } else {
      this.buffers.clear();
    }
  }

  size(conversationId?: string): number {
    if (conversationId) {
      return this.buffers.get(conversationId)?.length ?? 0;
    }
    let total = 0;
    for (const buffer of this.buffers.values()) {
      total += buffer.length;
    }
    return total;
  }
}

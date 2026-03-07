import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import pino from 'pino';

const logger = pino({ name: 'mcp-client' });

export interface McpServerConfig {
  name: string;
  transport: 'stdio' | 'http';
  url?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
}

interface ManagedClient {
  config: McpServerConfig;
  client: Client;
  transport: StdioClientTransport;
  tools: Array<{ name: string; description: string; inputSchema?: unknown }>;
}

export class McpClientManager {
  private clients = new Map<string, ManagedClient>();

  async connect(config: McpServerConfig): Promise<void> {
    if (this.clients.has(config.name)) {
      logger.warn({ name: config.name }, 'MCP client already connected');
      return;
    }

    if (config.transport === 'stdio') {
      if (!config.command) throw new Error(`MCP server ${config.name}: stdio transport requires command`);

      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args ?? [],
      });

      const client = new Client({ name: 'murph', version: '0.1.0' }, { capabilities: {} });
      await client.connect(transport);

      // Discover tools
      const toolsResult = await client.listTools();
      const tools = toolsResult.tools.map((t) => ({
        name: t.name,
        description: t.description ?? '',
        inputSchema: t.inputSchema,
      }));

      this.clients.set(config.name, { config, client, transport, tools });
      logger.info({ name: config.name, toolCount: tools.length }, 'MCP client connected');
    } else {
      logger.warn({ name: config.name }, 'HTTP transport not yet implemented');
    }
  }

  async disconnect(name: string): Promise<void> {
    const managed = this.clients.get(name);
    if (!managed) return;

    try {
      await managed.client.close();
    } catch (err) {
      logger.error({ err, name }, 'Error disconnecting MCP client');
    }

    this.clients.delete(name);
    logger.info({ name }, 'MCP client disconnected');
  }

  async disconnectAll(): Promise<void> {
    for (const name of this.clients.keys()) {
      await this.disconnect(name);
    }
  }

  getTools(serverName?: string): Array<{ server: string; name: string; description: string; inputSchema?: unknown }> {
    const result: Array<{ server: string; name: string; description: string; inputSchema?: unknown }> = [];

    for (const [name, managed] of this.clients) {
      if (serverName && name !== serverName) continue;
      for (const tool of managed.tools) {
        result.push({
          server: name,
          name: `${name}.${tool.name}`,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
      }
    }

    return result;
  }

  async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const managed = this.clients.get(serverName);
    if (!managed) throw new Error(`MCP server not connected: ${serverName}`);

    const result = await managed.client.callTool({ name: toolName, arguments: args });
    return result;
  }

  isConnected(name: string): boolean {
    return this.clients.has(name);
  }

  listServers(): string[] {
    return Array.from(this.clients.keys());
  }
}

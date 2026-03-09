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
  env?: Record<string, string>;
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
        env: { ...process.env, ...(config.env ?? {}) } as Record<string, string>,
        stderr: 'pipe',
      });

      // Capture stderr for diagnostics
      let stderrOutput = '';
      let stderrEnded = false;
      const stderrStream = transport.stderr;
      if (stderrStream) {
        const readable = stderrStream as import('node:stream').Readable;
        readable.on('data', (chunk: Buffer) => {
          stderrOutput += chunk.toString();
        });
        readable.on('end', () => {
          stderrEnded = true;
        });
      }

      // Capture transport-level errors (spawn failures, stdin/stdout errors)
      const transportErrors: string[] = [];
      transport.onerror = (error: Error) => {
        transportErrors.push(error.message);
      };

      // Capture exit code — override start() to hook the ChildProcess 'close'
      // event before the SDK nulls _process (stdio.js:83-84)
      let exitCode: number | null = null;
      let exitSignal: string | null = null;
      let rawStdout = '';
      const originalStart = transport.start.bind(transport);
      transport.start = async function () {
        await originalStart();
        const proc = (transport as any)._process as
          | import('node:child_process').ChildProcess
          | undefined;
        if (proc) {
          proc.stdout?.on('data', (chunk: Buffer) => {
            rawStdout += chunk.toString();
          });
          proc.on('close', (code: number | null, signal: string | null) => {
            exitCode = code;
            exitSignal = signal;
          });
        }
      };

      const client = new Client({ name: 'murph', version: '0.1.0' }, { capabilities: {} });
      try {
        await client.connect(transport);
      } catch (err) {
        // Wait for stderr to drain — the pipe may not have flushed yet
        if (stderrStream && !stderrEnded) {
          await new Promise<void>((resolve) => {
            const readable = stderrStream as import('node:stream').Readable;
            readable.on('end', resolve);
            setTimeout(resolve, 500);
          });
        }

        // Always log diagnostic context on failure
        const diag: Record<string, unknown> = {
          server: config.name,
          command: config.command,
          args: config.args ?? [],
          stdout: rawStdout.trim() || '(empty)',
          stderr: stderrOutput.trim() || '(empty)',
        };
        if (exitCode !== null) diag.exitCode = exitCode;
        if (exitSignal) diag.exitSignal = exitSignal;
        // Filter out JSON parse errors — redundant once we have raw stdout
        const nonParseErrors = transportErrors.filter(
          (msg) => !/JSON/.test(msg) && !/parse/i.test(msg),
        );
        if (nonParseErrors.length > 0) diag.transportErrors = nonParseErrors;

        logger.error(diag, 'MCP server failed to connect');
        throw err;
      }

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

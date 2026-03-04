import { spawn } from 'node:child_process';
import type { AgentContext, ClaudeBridgeResponse } from './types.js';
import { createLogger } from './logger.js';

const logger = createLogger('claude-bridge');

const RESPONSE_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    response: { type: 'string', description: 'The text response to send to the user' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          parameters: { type: 'object' },
        },
        required: ['name', 'parameters'],
      },
    },
  },
  required: ['response', 'actions'],
});

export class ClaudeBridge {
  private model: string;

  constructor(model: string = 'sonnet') {
    this.model = model;
  }

  setModel(model: string): void {
    this.model = model;
  }

  async reason(context: AgentContext, userMessage: string): Promise<ClaudeBridgeResponse> {
    const prompt = this.buildPrompt(context, userMessage);

    logger.info({ conversationId: context.conversationId }, 'Calling Claude CLI for reasoning');

    const result = await this.callClaude([
      '-p',
      '--model', this.model,
      '--output-format', 'json',
    ], prompt);

    try {
      const parsed = JSON.parse(result);
      return {
        response: parsed.response ?? result,
        actions: parsed.actions ?? [],
      };
    } catch {
      return { response: result, actions: [] };
    }
  }

  async generateCode(sandboxDir: string, instructions: string): Promise<string> {
    logger.info({ sandboxDir }, 'Calling Claude CLI for code generation');

    return this.callClaude([
      '-p',
      '--model', this.model,
      '--allowedTools', 'Edit,Write,Bash,Read,Glob,Grep',
    ], instructions);
  }

  private buildPrompt(context: AgentContext, userMessage: string): string {
    const parts: string[] = [];

    parts.push('You are Murph, a personal AI assistant. Respond helpfully and take actions when appropriate.');
    parts.push('');

    if (context.recentMessages.length > 0) {
      parts.push('## Recent Conversation');
      for (const msg of context.recentMessages) {
        parts.push(`${msg.sender}: ${msg.content}`);
      }
      parts.push('');
    }

    if (context.semanticMemories.length > 0) {
      parts.push('## Relevant Memories');
      for (const mem of context.semanticMemories) {
        parts.push(`- ${mem.summary}`);
      }
      parts.push('');
    }

    if (context.knowledgeChunks.length > 0) {
      parts.push('## Knowledge Base Context');
      for (const chunk of context.knowledgeChunks) {
        parts.push(`[${chunk.source}: ${chunk.documentTitle}]`);
        parts.push(chunk.content);
        parts.push('');
      }
    }

    if (context.entities.length > 0) {
      parts.push('## Known Entities');
      for (const entity of context.entities) {
        parts.push(`- ${entity.name} (${entity.type})`);
      }
      parts.push('');
    }

    if (context.availableTools.length > 0) {
      parts.push('## Available Actions');
      parts.push('You can request these actions by including them in the "actions" array of your JSON response.');
      for (const tool of context.availableTools) {
        parts.push(`- ${tool.name}: ${tool.description}`);
      }
      parts.push('');
    }

    parts.push('## User Message');
    parts.push(userMessage);
    parts.push('');
    parts.push('Respond with JSON containing "response" (your text reply) and "actions" (array of actions to take, each with "name" and "parameters"). If no actions needed, use an empty array.');

    return parts.join('\n');
  }

  private callClaude(args: string[], stdin: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('claude', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          logger.error({ code, stderr }, 'Claude CLI exited with error');
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
        } else {
          // Claude CLI with --output-format json wraps result in a JSON object
          try {
            const parsed = JSON.parse(stdout);
            // The actual result text is in the 'result' field
            resolve(parsed.result ?? stdout);
          } catch {
            resolve(stdout);
          }
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
      });

      proc.stdin.write(stdin);
      proc.stdin.end();
    });
  }
}

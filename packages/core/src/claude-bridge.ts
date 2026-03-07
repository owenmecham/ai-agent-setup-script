import { spawn } from 'node:child_process';
import type { AgentContext, AgentStep, ClaudeBridgeResponse } from './types.js';
import { createLogger } from './logger.js';

const logger = createLogger('claude-bridge');

export class ClaudeBridge {
  private model: string;

  constructor(model: string = 'sonnet') {
    this.model = model;
  }

  getModel(): string {
    return this.model;
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
      const cleaned = this.stripCodeFences(result);
      const parsed = JSON.parse(cleaned);
      return {
        response: parsed.response ?? result,
        actions: parsed.actions ?? [],
      };
    } catch {
      return { response: result, actions: [] };
    }
  }

  async reasonWithResults(
    context: AgentContext,
    userMessage: string,
    previousResponse: string,
    actionResults: AgentStep[],
  ): Promise<ClaudeBridgeResponse> {
    const prompt = this.buildFollowUpPrompt(context, userMessage, previousResponse, actionResults);

    logger.info({ conversationId: context.conversationId }, 'Calling Claude CLI for follow-up reasoning');

    const result = await this.callClaude([
      '-p',
      '--model', this.model,
      '--output-format', 'json',
    ], prompt);

    try {
      const cleaned = this.stripCodeFences(result);
      const parsed = JSON.parse(cleaned);
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

    parts.push('You are Murph, a personal AI assistant running as a **non-interactive subprocess**.');
    parts.push('You have NO built-in tools — no WebFetch, no WebSearch, no Bash, no file tools.');
    parts.push('Your ONLY way to interact with the outside world is by including entries in the "actions" array of your JSON response, using the Available Actions listed below.');
    parts.push('');
    parts.push('You MUST respond with valid JSON: {"response": "...", "actions": [...]}');
    parts.push('Each action needs "name" (exact match from Available Actions) and "parameters" (object).');
    parts.push('If no actions are needed, use an empty array.');
    parts.push('');
    parts.push('If you have an action that can accomplish what the user is asking, use it confidently. If no relevant action exists, explain what capability would be needed and suggest the user configure it.');
    parts.push('');

    if (context.userProfile) {
      const p = context.userProfile;
      const profileLines: string[] = [];
      if (p.name) profileLines.push(`Name: ${p.name}`);
      if (p.location) profileLines.push(`Location: ${p.location}`);
      if (p.profession) profileLines.push(`Profession: ${p.profession}`);
      if (p.hobbies && p.hobbies.length > 0) profileLines.push(`Hobbies: ${p.hobbies.join(', ')}`);
      if (p.bio) profileLines.push(`Bio: ${p.bio}`);
      const socials: string[] = [];
      if (p.social_twitter) socials.push(`Twitter: ${p.social_twitter}`);
      if (p.social_linkedin) socials.push(`LinkedIn: ${p.social_linkedin}`);
      if (p.social_github) socials.push(`GitHub: ${p.social_github}`);
      if (p.social_instagram) socials.push(`Instagram: ${p.social_instagram}`);
      if (p.social_facebook) socials.push(`Facebook: ${p.social_facebook}`);
      if (socials.length > 0) profileLines.push(`Social: ${socials.join(', ')}`);

      if (profileLines.length > 0) {
        parts.push('## User Profile');
        parts.push(...profileLines);
        parts.push('');
      }
    }

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
      parts.push('');
      for (const tool of context.availableTools) {
        let paramSummary = '(none)';
        if (tool.parameterSchema) {
          const schema = tool.parameterSchema;
          const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
          const required = (schema.required as string[]) ?? [];
          if (properties && Object.keys(properties).length > 0) {
            const paramParts: string[] = [];
            for (const [param, def] of Object.entries(properties)) {
              const isRequired = required.includes(param);
              const typeStr = def.type ? ` ${def.type}` : '';
              paramParts.push(`${param}${typeStr}${isRequired ? ', req' : ''}`);
            }
            paramSummary = paramParts.join('; ');
          }
        }
        parts.push(`- **${tool.name}**: ${tool.description}`);
        parts.push(`  Params: ${paramSummary}`);
      }
      parts.push('');

      // Compact Playwright usage hint
      const hasPlaywright = context.availableTools.some((t) => t.name.includes('playwright') || t.name.includes('browser_'));
      if (hasPlaywright) {
        parts.push('**Browsing pattern**: browser_navigate → browser_snapshot → read content → interact if needed → snapshot again.');
        parts.push('');
      }
    }

    parts.push('## User Message');
    parts.push(userMessage);
    parts.push('');
    parts.push('Respond with JSON containing "response" (your text reply) and "actions" (array of actions to take, each with "name" and "parameters"). If no actions needed, use an empty array.');

    return parts.join('\n');
  }

  private buildFollowUpPrompt(
    context: AgentContext,
    userMessage: string,
    previousResponse: string,
    actionResults: AgentStep[],
  ): string {
    const base = this.buildPrompt(context, userMessage);
    const parts: string[] = [base, ''];

    parts.push('## Your Previous Response');
    parts.push(previousResponse);
    parts.push('');

    parts.push('## Action Results');
    for (const step of actionResults) {
      parts.push(`### ${step.action} — ${step.success ? 'SUCCESS' : 'FAILED'}`);
      if (step.error) {
        parts.push(`Error: ${step.error}`);
      }
      if (step.data !== undefined) {
        const dataStr = typeof step.data === 'string' ? step.data : JSON.stringify(step.data, null, 2);
        const truncated = dataStr.length > 10_000 ? dataStr.slice(0, 10_000) + '\n... (truncated)' : dataStr;
        parts.push(`Data:\n${truncated}`);
      }
      parts.push('');
    }

    parts.push('Based on the action results above, provide an updated response to the user. If you need to take further actions, include them in the "actions" array. If all tasks are complete, use an empty actions array.');
    parts.push('');
    parts.push('Respond with JSON containing "response" (your text reply) and "actions" (array of actions to take, each with "name" and "parameters"). If no actions needed, use an empty array.');

    return parts.join('\n');
  }

  private stripCodeFences(text: string): string {
    const trimmed = text.trim();
    const match = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
    return match ? match[1].trim() : trimmed;
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

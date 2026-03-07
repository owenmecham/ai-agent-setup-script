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

    parts.push('You are Murph, a personal AI assistant. Respond helpfully and take actions when appropriate.');
    parts.push('');
    parts.push('When you need to interact with the outside world — browse the web, fetch data, automate a browser, or perform any external task — use the Available Actions listed below. Include actions in the "actions" array of your JSON response with the correct "name" and "parameters".');
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
      parts.push('These are your tools for interacting with the outside world. Use them by including entries in the "actions" array of your JSON response with the correct "name" and "parameters".');
      parts.push('');
      for (const tool of context.availableTools) {
        parts.push(`### ${tool.name}`);
        parts.push(tool.description);
        if (tool.parameterSchema) {
          const schema = tool.parameterSchema;
          const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
          const required = (schema.required as string[]) ?? [];
          if (properties && Object.keys(properties).length > 0) {
            parts.push('Parameters:');
            for (const [param, def] of Object.entries(properties)) {
              const isRequired = required.includes(param);
              const typeStr = def.type ? ` (${def.type})` : '';
              const reqStr = isRequired ? ' [required]' : ' [optional]';
              const descStr = def.description ? ` — ${def.description}` : '';
              parts.push(`  - ${param}${typeStr}${reqStr}${descStr}`);
            }
          }
        }
        parts.push('');
      }

      // Add Playwright usage hints when browser tools are detected
      const hasPlaywright = context.availableTools.some((t) => t.name.includes('playwright') || t.name.includes('browser_'));
      if (hasPlaywright) {
        parts.push('### Web Browsing Patterns');
        parts.push('To browse the web with Playwright, use this multi-step pattern:');
        parts.push('1. Navigate to a URL with browser_navigate');
        parts.push('2. Take a snapshot of the page with browser_snapshot to see its content');
        parts.push('3. Extract the information you need from the snapshot');
        parts.push('4. If needed, interact with elements (click, fill) and snapshot again');
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

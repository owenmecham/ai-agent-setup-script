import type { McpClientManager } from './client-manager.js';

export interface ProxiedTool {
  name: string;
  description: string;
  execute: (params: Record<string, unknown>) => Promise<{
    actionId: string;
    success: boolean;
    data?: unknown;
    error?: string;
  }>;
}

export function createToolProxies(manager: McpClientManager): ProxiedTool[] {
  const tools = manager.getTools();
  return tools.map((tool) => {
    const [serverName, ...toolParts] = tool.name.split('.');
    const toolName = toolParts.join('.');

    return {
      name: `mcp.${tool.name}`,
      description: `[MCP:${serverName}] ${tool.description}`,
      execute: async (params) => {
        try {
          const result = await manager.callTool(serverName, toolName, params);
          return {
            actionId: '',
            success: true,
            data: result,
          };
        } catch (err) {
          return {
            actionId: '',
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    };
  });
}

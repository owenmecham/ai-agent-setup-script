'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EditableField } from '../../components/editable-field';
import { ApprovalEditor } from '../../components/approval-editor';
import { MCPEditor } from '../../components/mcp-editor';

interface Config {
  agent: {
    name: string;
    model: string;
    max_budget_per_message_usd: number;
    timezone: string;
  };
  security: {
    dashboard_port: number;
    approval_defaults: Record<string, 'auto' | 'notify' | 'require'>;
  };
  memory: {
    short_term_buffer_size: number;
    flush_interval_seconds: number;
    semantic_search_limit: number;
    knowledge_search_limit: number;
    max_context_tokens: number;
  };
  logging: {
    level: string;
    file: string;
  };
  mcp_servers: Array<{
    name: string;
    transport: 'stdio' | 'http';
    url?: string;
    command?: string;
    args?: string[];
    headers?: Record<string, string>;
  }>;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const res = await fetch('/api/config');
      return res.json() as Promise<Config>;
    },
  });

  const updateConfig = async (updates: Record<string, unknown>) => {
    await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    queryClient.invalidateQueries({ queryKey: ['config'] });
  };

  if (isLoading || !config) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-6">Settings</h2>
        <p className="text-zinc-500 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Settings</h2>

      <div className="space-y-6">
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Agent Configuration</h3>
          <div className="space-y-1">
            <EditableField
              label="Agent Name"
              value={config.agent.name}
              onSave={(v) => updateConfig({ agent: { name: v } })}
            />
            <EditableField
              label="Model"
              value={config.agent.model}
              onSave={(v) => updateConfig({ agent: { model: v } })}
            />
            <EditableField
              label="Max Budget/Message"
              value={String(config.agent.max_budget_per_message_usd)}
              type="number"
              onSave={(v) => updateConfig({ agent: { max_budget_per_message_usd: parseFloat(v) } })}
            />
            <EditableField
              label="Timezone"
              value={config.agent.timezone}
              onSave={(v) => updateConfig({ agent: { timezone: v } })}
            />
          </div>
        </div>

        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Approval Defaults</h3>
          <p className="text-sm text-zinc-500 mb-4">
            Configure approval levels for each action type.
            <strong className="text-zinc-300"> require</strong> = wait for user approval,
            <strong className="text-zinc-300"> notify</strong> = execute + alert,
            <strong className="text-zinc-300"> auto</strong> = silent execution.
          </p>
          <ApprovalEditor
            approvalDefaults={config.security.approval_defaults}
            onSave={async (defaults) => {
              await fetch('/api/config/approvals', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ approval_defaults: defaults }),
              });
              queryClient.invalidateQueries({ queryKey: ['config'] });
            }}
          />
        </div>

        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Memory Settings</h3>
          <div className="space-y-1">
            <EditableField
              label="Short-term Buffer Size"
              value={String(config.memory.short_term_buffer_size)}
              type="number"
              onSave={(v) => updateConfig({ memory: { short_term_buffer_size: parseInt(v) } })}
            />
            <EditableField
              label="Flush Interval (seconds)"
              value={String(config.memory.flush_interval_seconds)}
              type="number"
              onSave={(v) => updateConfig({ memory: { flush_interval_seconds: parseInt(v) } })}
            />
            <EditableField
              label="Semantic Search Limit"
              value={String(config.memory.semantic_search_limit)}
              type="number"
              onSave={(v) => updateConfig({ memory: { semantic_search_limit: parseInt(v) } })}
            />
            <EditableField
              label="Knowledge Search Limit"
              value={String(config.memory.knowledge_search_limit)}
              type="number"
              onSave={(v) => updateConfig({ memory: { knowledge_search_limit: parseInt(v) } })}
            />
            <EditableField
              label="Max Context Tokens"
              value={String(config.memory.max_context_tokens)}
              type="number"
              onSave={(v) => updateConfig({ memory: { max_context_tokens: parseInt(v) } })}
            />
          </div>
        </div>

        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Logging</h3>
          <div className="space-y-1">
            <EditableField
              label="Level"
              value={config.logging.level}
              onSave={(v) => updateConfig({ logging: { level: v } })}
            />
            <EditableField
              label="File"
              value={config.logging.file}
              onSave={(v) => updateConfig({ logging: { file: v } })}
            />
          </div>
        </div>

        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">MCP Servers</h3>
          <MCPEditor
            servers={config.mcp_servers}
            onSave={async (servers) => {
              await updateConfig({ mcp_servers: servers });
            }}
          />
        </div>
      </div>
    </div>
  );
}

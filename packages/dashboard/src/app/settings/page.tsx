'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EditableField } from '../../components/editable-field';
import { ApprovalEditor } from '../../components/approval-editor';
import { MCPEditor } from '../../components/mcp-editor';
import { TagListEditor } from '../../components/tag-list-editor';

interface Config {
  agent: {
    name: string;
    model: string;
    max_budget_per_message_usd: number;
    timezone: string;
    welcome_quotes: string[];
  };
  security: {
    dashboard_port: number;
    approval_defaults: Record<string, 'auto' | 'notify' | 'require'>;
  };
  channels: {
    imessage: { enabled: boolean; allowed_senders: string[] };
    telegram: { enabled: boolean; allowed_user_ids: number[] };
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
    env?: Record<string, string>;
  }>;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: config, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const res = await fetch('/api/config');
      return res.json() as Promise<Config>;
    },
  });

  const [googleAuthLoading, setGoogleAuthLoading] = useState(false);
  const [googleCredForm, setGoogleCredForm] = useState({ clientId: '', clientSecret: '' });
  const [googleCredSaving, setGoogleCredSaving] = useState(false);
  const [googleCredError, setGoogleCredError] = useState<string | null>(null);
  const [googleCredSuccess, setGoogleCredSuccess] = useState(false);
  const [showCredForm, setShowCredForm] = useState(false);
  const [agentRestarting, setAgentRestarting] = useState(false);
  const prevAuthenticatedRef = useRef<boolean | null>(null);
  const [plaudInstallLoading, setPlaudInstallLoading] = useState(false);

  const { data: plaudStatus, refetch: refetchPlaud } = useQuery({
    queryKey: ['plaud-status'],
    queryFn: async () => {
      const res = await fetch('/api/plaud-status');
      return res.json() as Promise<{
        desktopInstalled: boolean;
        mcpInstalled: boolean;
        uvInstalled: boolean;
        connected: boolean;
      }>;
    },
    refetchInterval: 30000,
  });

  const [googleFastPoll, setGoogleFastPoll] = useState(false);

  const { data: googleStatus, refetch: refetchGoogle } = useQuery({
    queryKey: ['google-auth'],
    queryFn: async () => {
      const res = await fetch('/api/google-auth');
      const data = await res.json() as {
        installed: boolean;
        authenticated: boolean;
        email: string | null;
        error: string | null;
        hasClientCredentials: boolean;
        authInProgress: boolean;
        authUrl: string | null;
        authError: string | null;
      };
      // Update fast-polling based on auth state
      setGoogleFastPoll(data.authInProgress);
      return data;
    },
    // Poll every 2s during auth, otherwise every 30s
    refetchInterval: googleAuthLoading || googleFastPoll ? 2000 : 30000,
  });

  // Auto-restart agent when auth completes (transition from false -> true)
  useEffect(() => {
    const current = googleStatus?.authenticated ?? false;
    if (prevAuthenticatedRef.current !== null && current && !prevAuthenticatedRef.current) {
      // Auth just completed — restart agent to pick up fresh MCP connections
      setAgentRestarting(true);
      setGoogleAuthLoading(false);
      fetch('/api/agent/restart', { method: 'POST' })
        .then(() => {
          setTimeout(() => setAgentRestarting(false), 5000);
        })
        .catch(() => setAgentRestarting(false));
    }
    prevAuthenticatedRef.current = current;
  }, [googleStatus?.authenticated]);

  const { data: avatarStatus } = useQuery({
    queryKey: ['avatar'],
    queryFn: async () => {
      const res = await fetch('/api/avatar');
      return res.json() as Promise<{ hasCustom: boolean; timestamp?: number }>;
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

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('avatar', file);
    await fetch('/api/avatar', { method: 'POST', body: formData });
    queryClient.invalidateQueries({ queryKey: ['avatar'] });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAvatarReset = async () => {
    await fetch('/api/avatar', { method: 'DELETE' });
    queryClient.invalidateQueries({ queryKey: ['avatar'] });
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

          <div className="mt-4 pt-4 border-t border-zinc-800/50">
            <label className="text-sm text-zinc-400 block mb-2">Agent Avatar</label>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded text-sm transition-colors"
              >
                Upload Avatar
              </button>
              {avatarStatus?.hasCustom && (
                <button
                  onClick={handleAvatarReset}
                  className="text-sm text-zinc-600 hover:text-red-400 transition-colors"
                >
                  Reset to Default
                </button>
              )}
              {avatarStatus?.hasCustom && (
                <span className="text-xs text-zinc-500">Custom avatar active</span>
              )}
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Channel Access</h3>
          <p className="text-sm text-zinc-500 mb-4">
            Control which users can interact with the agent via each channel.
            An empty list means all senders are allowed.
          </p>

          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-medium text-zinc-300 mb-2">iMessage Allowed Senders</h4>
              <TagListEditor
                values={config.channels?.imessage?.allowed_senders ?? []}
                onSave={async (values) => {
                  await updateConfig({ channels: { imessage: { allowed_senders: values } } });
                }}
                placeholder="+18014401419 or email@example.com"
                emptyMessage="All senders allowed"
              />
            </div>

            <div>
              <h4 className="text-sm font-medium text-zinc-300 mb-2">Telegram Allowed User IDs</h4>
              <TagListEditor
                values={(config.channels?.telegram?.allowed_user_ids ?? []).map(String)}
                onSave={async (values) => {
                  await updateConfig({
                    channels: { telegram: { allowed_user_ids: values.map((v) => parseInt(v, 10)) } },
                  });
                }}
                placeholder="123456789"
                emptyMessage="All users allowed"
              />
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Google Workspace</h3>
          <p className="text-sm text-zinc-500 mb-4">
            Connect your Google account to enable Gmail, Calendar, Tasks, and Drive via the Google MCP server.
          </p>

          {/* Status indicator */}
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-2 h-2 rounded-full ${
              agentRestarting ? 'bg-yellow-500 animate-pulse' :
              googleStatus?.authenticated ? 'bg-green-500' :
              googleStatus?.authInProgress ? 'bg-blue-500 animate-pulse' :
              googleStatus?.installed ? 'bg-yellow-500' :
              'bg-zinc-600'
            }`} />
            <span className="text-sm">
              {agentRestarting
                ? 'Restarting agent to connect Google services...'
                : googleStatus?.authenticated
                  ? `Connected${googleStatus.email ? ` — ${googleStatus.email}` : ''}`
                  : googleStatus?.authInProgress
                    ? 'Authentication in progress...'
                    : !googleStatus?.installed
                      ? 'gws CLI not installed'
                      : 'Not authenticated'}
            </span>
          </div>

          {/* State: gws not installed */}
          {!googleStatus?.installed && (
            <div className="space-y-2">
              <p className="text-sm text-zinc-500">
                Install gws CLI:{' '}
                <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-xs">
                  npm install -g @googleworkspace/cli
                </code>
              </p>
              <p className="text-xs text-zinc-600">
                Or run from terminal: <code className="bg-zinc-800/50 px-1 py-0.5 rounded">pnpm murph google-auth</code>
              </p>
            </div>
          )}

          {/* State: Agent restarting */}
          {googleStatus?.installed && agentRestarting && (
            <p className="text-sm text-zinc-400">
              The agent is restarting to pick up the new Google connection. This happens automatically.
            </p>
          )}

          {/* State: Auth in progress */}
          {googleStatus?.installed && !agentRestarting && googleStatus?.authInProgress && (
            <div className="space-y-3">
              {googleStatus.authUrl ? (
                <div className="space-y-2">
                  <p className="text-sm text-zinc-300">
                    Complete authorization in your browser. If it didn&apos;t open automatically, click the link below:
                  </p>
                  <a
                    href={googleStatus.authUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-400 hover:text-blue-300 underline break-all block"
                  >
                    Open Google Authorization
                  </a>
                </div>
              ) : googleStatus.authError ? (
                <p className="text-sm text-red-400">{googleStatus.authError}</p>
              ) : (
                <p className="text-sm text-zinc-400">Starting authentication...</p>
              )}
              <button
                onClick={async () => {
                  await fetch('/api/google-auth', { method: 'DELETE' });
                  setGoogleAuthLoading(false);
                  await refetchGoogle();
                }}
                className="text-sm text-zinc-500 hover:text-red-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* State: Authenticated */}
          {googleStatus?.installed && !agentRestarting && !googleStatus?.authInProgress && googleStatus?.authenticated && (
            <div className="space-y-3">
              <div className="text-sm text-zinc-400">
                <p className="font-medium text-zinc-300 mb-2">Available services:</p>
                <ul className="list-disc list-inside space-y-1 text-zinc-500">
                  <li>Gmail — read, search, send email</li>
                  <li>Calendar — view and manage events</li>
                  <li>Tasks — manage task lists</li>
                  <li>Drive — search, read, and manage files</li>
                </ul>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={async () => {
                    setGoogleAuthLoading(true);
                    const res = await fetch('/api/google-auth', { method: 'POST' });
                    const data = await res.json();
                    if (data.error) setGoogleAuthLoading(false);
                    await refetchGoogle();
                  }}
                  disabled={googleAuthLoading}
                  className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {googleAuthLoading ? 'Starting...' : 'Re-authenticate'}
                </button>
                <button
                  onClick={() => setShowCredForm(!showCredForm)}
                  className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Change OAuth Credentials
                </button>
              </div>
            </div>
          )}

          {/* State: Has CLI, not authenticated, no auth in progress */}
          {googleStatus?.installed && !agentRestarting && !googleStatus?.authInProgress && !googleStatus?.authenticated && (
            <div className="space-y-3">
              <button
                onClick={async () => {
                  setGoogleAuthLoading(true);
                  const res = await fetch('/api/google-auth', { method: 'POST' });
                  const data = await res.json();
                  if (data.error) setGoogleAuthLoading(false);
                  await refetchGoogle();
                }}
                disabled={googleAuthLoading}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded text-sm transition-colors"
              >
                {googleAuthLoading ? 'Starting...' : 'Connect Google Account'}
              </button>
              <p className="text-xs text-zinc-600">
                Or run from terminal: <code className="bg-zinc-800/50 px-1 py-0.5 rounded">pnpm murph google-auth</code>
              </p>
            </div>
          )}
        </div>

        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Plaud</h3>
          <p className="text-sm text-zinc-500 mb-4">
            Connect Plaud Desktop to access recordings and transcripts via the Plaud MCP server.
          </p>

          <div className="flex items-center gap-3 mb-4">
            <div className={`w-2 h-2 rounded-full ${
              plaudStatus?.mcpInstalled && plaudStatus?.connected ? 'bg-green-500' :
              plaudStatus?.mcpInstalled ? 'bg-yellow-500' :
              'bg-zinc-600'
            }`} />
            <span className="text-sm">
              {plaudStatus?.mcpInstalled && plaudStatus?.connected
                ? 'Connected'
                : plaudStatus?.mcpInstalled
                  ? 'MCP installed — Plaud Desktop not running'
                  : plaudStatus?.desktopInstalled
                    ? 'Plaud Desktop installed — MCP server not installed'
                    : 'Not installed'}
            </span>
          </div>

          {plaudStatus?.mcpInstalled && plaudStatus?.connected ? (
            <div className="space-y-3">
              <div className="text-sm text-zinc-400">
                <p className="font-medium text-zinc-300 mb-2">Available via MCP:</p>
                <ul className="list-disc list-inside space-y-1 text-zinc-500">
                  <li>Browse recordings and transcripts</li>
                  <li>Search transcript content</li>
                  <li>Get AI-generated summaries</li>
                </ul>
              </div>
              <button
                onClick={() => refetchPlaud()}
                className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Check Connection
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {!plaudStatus?.desktopInstalled && (
                <p className="text-sm text-zinc-500">
                  1. Install Plaud Desktop:{' '}
                  <a
                    href="https://global.plaud.ai/pages/app-download"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300"
                  >
                    Download
                  </a>
                </p>
              )}
              {plaudStatus?.desktopInstalled && !plaudStatus?.mcpInstalled && (
                <button
                  onClick={async () => {
                    setPlaudInstallLoading(true);
                    try {
                      await fetch('/api/plaud-status', { method: 'POST' });
                      await refetchPlaud();
                    } finally {
                      setPlaudInstallLoading(false);
                    }
                  }}
                  disabled={plaudInstallLoading || !plaudStatus?.uvInstalled}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded text-sm transition-colors"
                >
                  {plaudInstallLoading ? 'Installing...' : 'Install Plaud MCP'}
                </button>
              )}
              {plaudStatus?.desktopInstalled && !plaudStatus?.uvInstalled && (
                <p className="text-sm text-zinc-500">
                  uv required:{' '}
                  <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-xs">brew install uv</code>
                </p>
              )}
              <p className="text-xs text-zinc-600">
                Or run from terminal: <code className="bg-zinc-800/50 px-1 py-0.5 rounded">pnpm murph setup-plaud</code>
              </p>
            </div>
          )}
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
          <h3 className="text-lg font-semibold mb-4">Welcome Quotes</h3>
          <p className="text-sm text-zinc-500 mb-4">
            Customize the quotes shown on the chat welcome screen. These can be daily affirmations, principles, or themed quotes.
          </p>
          <TagListEditor
            values={config.agent.welcome_quotes ?? []}
            onSave={async (values) => {
              await updateConfig({ agent: { welcome_quotes: values } });
            }}
            placeholder="Enter a quote..."
            multiline
          />
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

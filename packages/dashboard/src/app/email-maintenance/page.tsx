'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TagListEditor } from '../../components/tag-list-editor';

// --- Types ---

interface EmailMaintenanceConfig {
  enabled: boolean;
  goal: string;
  model: 'haiku' | 'sonnet' | 'opus';
  cadence: '15m' | '30m' | '1h' | '6h' | 'daily';
  next_steps: string;
  gmail_query: string;
  lookback_window: '1h' | '6h' | '24h' | '3d' | '7d';
  max_emails_per_run: number;
  only_unread: boolean;
  scan_labels: string[];
  snippet_length: number;
  mark_read: boolean;
  archive: boolean;
  apply_label: string;
  auto_tasking: boolean;
  task_list: string;
  reply_enabled: boolean;
  reply_mode: 'draft' | 'send';
  forward_to: string;
  calendar_aware: boolean;
  max_budget_per_run_usd: number;
  batch_size: number;
  run_window_start: string;
  run_window_end: string;
  notify_channel: 'dashboard' | 'imessage' | 'telegram' | 'none';
  notify_on: 'always' | 'matches_only' | 'errors_only';
  privacy_keywords: string[];
}

interface RunRecord {
  id: string;
  status: string;
  dry_run: boolean;
  goal: string | null;
  model: string | null;
  emails_scanned: number;
  emails_matched: number;
  emails_archived: number;
  emails_marked_read: number;
  emails_labeled: number;
  emails_replied: number;
  emails_forwarded: number;
  tasks_created: number;
  summary: string | null;
  details: unknown;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

interface WorkflowTemplate {
  title: string;
  icon: string;
  description: string;
  goal: string;
  next_steps: string;
  toggles: Partial<EmailMaintenanceConfig>;
}

// --- Templates ---

const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    title: 'Property Underwriting',
    icon: '🏠',
    description: 'Analyze property listings against underwriting criteria',
    goal: 'Analyze incoming property listings and real estate deals. Evaluate each against standard underwriting criteria: cap rate > 7%, cash-on-cash return > 10%, debt service coverage > 1.25, occupancy > 90%. Flag properties that meet thresholds.',
    next_steps: 'For qualifying properties, draft a reply to the sender expressing interest and propose a meeting time based on my calendar openings in the next 5 business days. Create a Google Task with the property details and underwriting numbers.',
    toggles: { reply_enabled: true, reply_mode: 'draft', calendar_aware: true, auto_tasking: true },
  },
  {
    title: 'Receipt & Invoice Scanner',
    icon: '🧾',
    description: 'Categorize receipts and flag large charges',
    goal: 'Find all receipts, invoices, and billing statements. Categorize each by type (subscription, one-time purchase, utility, insurance). Flag any amount over $500 or unfamiliar charges.',
    next_steps: 'Create a Google Task for any invoice with a payment due date. Archive all processed receipts. Apply the "Receipts" label.',
    toggles: { archive: true, auto_tasking: true, apply_label: 'Receipts' },
  },
  {
    title: 'Newsletter Digest',
    icon: '📰',
    description: 'Summarize and archive newsletters',
    goal: 'Identify all newsletter and marketing emails. Summarize each in 1-2 sentences capturing the key takeaway.',
    next_steps: 'Archive all newsletters after summarizing. Mark as read.',
    toggles: { archive: true, mark_read: true },
  },
  {
    title: 'Lead Qualification',
    icon: '🎯',
    description: 'Score and route incoming leads',
    goal: 'Score incoming leads and inquiries on a scale of 1-10 based on: urgency, budget indicators, fit with my services, and response window.',
    next_steps: 'For leads scoring 7+, draft a personalized reply acknowledging their inquiry and suggesting next steps. Create a Google Task for follow-up within 48 hours. Forward high-score leads to my assistant.',
    toggles: { reply_enabled: true, reply_mode: 'draft', auto_tasking: true },
  },
  {
    title: 'Security Monitor',
    icon: '🔒',
    description: 'Monitor security alerts and suspicious activity',
    goal: 'Monitor for security alerts: suspicious login attempts, password reset requests, two-factor authentication codes, account compromise warnings, and unusual activity notifications.',
    next_steps: 'Flag critical security alerts immediately. Create a high-priority task for any account compromise warnings. Mark informational alerts as read.',
    toggles: { mark_read: true, auto_tasking: true, notify_channel: 'imessage' as const, notify_on: 'always' as const },
  },
  {
    title: 'Meeting Action Items',
    icon: '📋',
    description: 'Extract action items from meeting-related emails',
    goal: 'Scan emails that reference recent meetings, calls, or appointments. Identify commitments, action items, deadlines, and follow-up requests.',
    next_steps: 'Create a Google Task for each action item with the deadline from the email. Check my calendar to confirm I have time allocated.',
    toggles: { auto_tasking: true, calendar_aware: true },
  },
];

// --- Component ---

export default function EmailMaintenancePage() {
  const queryClient = useQueryClient();
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [templateModal, setTemplateModal] = useState<WorkflowTemplate | null>(null);

  const { data: fullConfig, isLoading: configLoading } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const res = await fetch('/api/config');
      return res.json();
    },
  });

  const config: EmailMaintenanceConfig | undefined = fullConfig?.email_maintenance;

  const { data: runsData } = useQuery({
    queryKey: ['email-maintenance-runs', page],
    queryFn: async () => {
      const res = await fetch(`/api/email-maintenance/runs?limit=10&offset=${page * 10}`);
      return res.json() as Promise<{ runs: RunRecord[]; total: number }>;
    },
    refetchInterval: 10000,
  });

  const updateConfig = useCallback(async (updates: Partial<EmailMaintenanceConfig>) => {
    await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_maintenance: updates }),
    });
    queryClient.invalidateQueries({ queryKey: ['config'] });
  }, [queryClient]);

  const triggerMutation = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const res = await fetch('/api/email-maintenance/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: dryRun }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-maintenance-runs'] });
    },
  });

  const applyTemplate = async (template: WorkflowTemplate) => {
    await updateConfig({
      goal: template.goal,
      next_steps: template.next_steps,
      ...template.toggles,
    });
    setTemplateModal(null);
  };

  if (configLoading || !config) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-6">Email Maintenance</h2>
        <p className="text-zinc-500 text-sm">Loading...</p>
      </div>
    );
  }

  const runs = runsData?.runs ?? [];
  const totalRuns = runsData?.total ?? 0;
  const totalPages = Math.ceil(totalRuns / 10);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Email Maintenance</h2>
        <div className="flex gap-3">
          <button
            onClick={() => triggerMutation.mutate(true)}
            disabled={triggerMutation.isPending}
            className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {triggerMutation.isPending ? 'Running...' : 'Test Run'}
          </button>
          <button
            onClick={() => triggerMutation.mutate(false)}
            disabled={triggerMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {triggerMutation.isPending ? 'Running...' : 'Run Now'}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Card 1: Sample Workflows */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Sample Workflows</h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {WORKFLOW_TEMPLATES.map((template) => (
              <button
                key={template.title}
                onClick={() => setTemplateModal(template)}
                className="bg-zinc-800 hover:bg-zinc-700 rounded-lg p-4 text-left transition-colors"
              >
                <div className="text-2xl mb-2">{template.icon}</div>
                <div className="text-sm font-medium text-zinc-200">{template.title}</div>
                <div className="text-xs text-zinc-500 mt-1">{template.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Template Confirmation Modal */}
        {templateModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 max-w-md mx-4">
              <h3 className="text-lg font-semibold mb-2">Apply "{templateModal.title}"?</h3>
              <p className="text-sm text-zinc-400 mb-4">
                This will overwrite your current goal and next steps.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setTemplateModal(null)}
                  className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => applyTemplate(templateModal)}
                  className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Apply Template
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Card 2: Core Configuration */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Core Configuration</h3>
          <div className="space-y-4">
            <ToggleField
              label="Enabled"
              value={config.enabled}
              onChange={(v) => updateConfig({ enabled: v })}
            />
            <TextareaField
              label="Goal"
              value={config.goal}
              rows={6}
              placeholder="Describe what you want the email scanner to look for..."
              onSave={(v) => updateConfig({ goal: v })}
            />
            <SelectField
              label="Model"
              value={config.model}
              options={[
                { value: 'haiku', label: 'Haiku (fast/cheap)' },
                { value: 'sonnet', label: 'Sonnet (balanced)' },
                { value: 'opus', label: 'Opus (complex reasoning)' },
              ]}
              onChange={(v) => updateConfig({ model: v as EmailMaintenanceConfig['model'] })}
            />
            <div>
              <label className="text-sm text-zinc-400 block mb-2">Cadence</label>
              <div className="flex gap-2">
                {(['15m', '30m', '1h', '6h', 'daily'] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => updateConfig({ cadence: c })}
                    className={`px-3 py-1.5 rounded text-sm transition-colors ${
                      config.cadence === c
                        ? 'bg-blue-600 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <TextareaField
              label="Next Steps"
              value={config.next_steps}
              rows={4}
              placeholder="What should happen with matching emails..."
              onSave={(v) => updateConfig({ next_steps: v })}
            />
          </div>
        </div>

        {/* Card 3: Email Scanning */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Email Scanning</h3>
          <div className="space-y-4">
            <InputField
              label="Gmail Search Filter"
              value={config.gmail_query}
              placeholder="from:realtor.com OR label:leads"
              onSave={(v) => updateConfig({ gmail_query: v })}
            />
            <SelectField
              label="Lookback Window"
              value={config.lookback_window}
              options={[
                { value: '1h', label: '1 hour' },
                { value: '6h', label: '6 hours' },
                { value: '24h', label: '24 hours' },
                { value: '3d', label: '3 days' },
                { value: '7d', label: '7 days' },
              ]}
              onChange={(v) => updateConfig({ lookback_window: v as EmailMaintenanceConfig['lookback_window'] })}
            />
            <InputField
              label="Max Emails Per Run"
              value={String(config.max_emails_per_run)}
              type="number"
              onSave={(v) => updateConfig({ max_emails_per_run: parseInt(v) })}
            />
            <ToggleField
              label="Only Unread"
              value={config.only_unread}
              onChange={(v) => updateConfig({ only_unread: v })}
            />
            <div>
              <label className="text-sm text-zinc-400 block mb-2">Scan Labels</label>
              <TagListEditor
                values={config.scan_labels}
                onSave={async (values) => { await updateConfig({ scan_labels: values }); }}
                placeholder="INBOX, Leads, etc."
                emptyMessage="Scanning INBOX by default"
              />
            </div>
            <div>
              <InputField
                label="Snippet Length"
                value={String(config.snippet_length)}
                type="number"
                onSave={(v) => updateConfig({ snippet_length: parseInt(v) })}
              />
              <p className="text-xs text-zinc-600 mt-1">
                How much of each email body to send for analysis. Higher = more accurate but costs more.
              </p>
            </div>
          </div>
        </div>

        {/* Card 4: Actions & Permissions */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Actions & Permissions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ToggleField
              label="Mark as Read"
              value={config.mark_read}
              onChange={(v) => updateConfig({ mark_read: v })}
            />
            <ToggleField
              label="Archive"
              value={config.archive}
              onChange={(v) => updateConfig({ archive: v })}
            />
            <div className="space-y-2">
              <ToggleField
                label="Apply Label"
                value={!!config.apply_label}
                onChange={(v) => updateConfig({ apply_label: v ? 'Processed/Murph' : '' })}
              />
              {config.apply_label && (
                <InputField
                  label="Label Name"
                  value={config.apply_label}
                  onSave={(v) => updateConfig({ apply_label: v })}
                />
              )}
            </div>
            <div className="space-y-2">
              <ToggleField
                label="Auto-Tasking"
                value={config.auto_tasking}
                onChange={(v) => updateConfig({ auto_tasking: v })}
              />
              {config.auto_tasking && (
                <InputField
                  label="Task List"
                  value={config.task_list}
                  onSave={(v) => updateConfig({ task_list: v })}
                />
              )}
            </div>
            <div className="space-y-2">
              <ToggleField
                label="Reply"
                value={config.reply_enabled}
                onChange={(v) => updateConfig({ reply_enabled: v })}
              />
              {config.reply_enabled && (
                <SelectField
                  label="Reply Mode"
                  value={config.reply_mode}
                  options={[
                    { value: 'draft', label: 'Draft Only' },
                    { value: 'send', label: 'Auto-Send' },
                  ]}
                  onChange={(v) => updateConfig({ reply_mode: v as 'draft' | 'send' })}
                />
              )}
              {config.reply_enabled && (
                <p className="text-xs text-zinc-600">
                  Draft creates a Gmail draft for your review. Auto-Send sends immediately.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <ToggleField
                label="Forward"
                value={!!config.forward_to}
                onChange={(v) => updateConfig({ forward_to: v ? '' : '' })}
              />
              <InputField
                label="Forward To"
                value={config.forward_to}
                placeholder="assistant@example.com"
                onSave={(v) => updateConfig({ forward_to: v })}
              />
            </div>
            <div>
              <ToggleField
                label="Calendar Aware"
                value={config.calendar_aware}
                onChange={(v) => updateConfig({ calendar_aware: v })}
              />
              <p className="text-xs text-zinc-600 mt-1">
                When enabled, the AI checks your calendar for openings before suggesting meeting times in replies.
              </p>
            </div>
          </div>
        </div>

        {/* Card 5: Cost, Schedule & Notifications */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Cost, Schedule & Notifications</h3>
          <div className="space-y-4">
            <InputField
              label="Max Budget Per Run ($)"
              value={String(config.max_budget_per_run_usd)}
              type="number"
              onSave={(v) => updateConfig({ max_budget_per_run_usd: parseFloat(v) })}
            />
            <InputField
              label="Batch Size"
              value={String(config.batch_size)}
              type="number"
              onSave={(v) => updateConfig({ batch_size: parseInt(v) })}
            />
            <div className="grid grid-cols-2 gap-4">
              <InputField
                label="Run Window Start"
                value={config.run_window_start}
                placeholder="08:00"
                onSave={(v) => updateConfig({ run_window_start: v })}
              />
              <InputField
                label="Run Window End"
                value={config.run_window_end}
                placeholder="18:00"
                onSave={(v) => updateConfig({ run_window_end: v })}
              />
            </div>
            <p className="text-xs text-zinc-600 -mt-2">
              Only run during these hours in your timezone. Leave empty to always run.
            </p>
            <SelectField
              label="Notify Channel"
              value={config.notify_channel}
              options={[
                { value: 'dashboard', label: 'Dashboard Only' },
                { value: 'imessage', label: 'iMessage' },
                { value: 'telegram', label: 'Telegram' },
                { value: 'none', label: 'None' },
              ]}
              onChange={(v) => updateConfig({ notify_channel: v as EmailMaintenanceConfig['notify_channel'] })}
            />
            <SelectField
              label="Notify When"
              value={config.notify_on}
              options={[
                { value: 'always', label: 'Always' },
                { value: 'matches_only', label: 'Matches Only' },
                { value: 'errors_only', label: 'Errors Only' },
              ]}
              onChange={(v) => updateConfig({ notify_on: v as EmailMaintenanceConfig['notify_on'] })}
            />
          </div>
        </div>

        {/* Card 6: Privacy */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Privacy</h3>
          <p className="text-sm text-zinc-500 mb-4">
            Emails containing these keywords are excluded from AI processing entirely.
          </p>
          <TagListEditor
            values={config.privacy_keywords}
            onSave={async (values) => { await updateConfig({ privacy_keywords: values }); }}
            placeholder="Bank, Medical, SSN"
          />
        </div>

        {/* Card 7: Run History */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800">
          <div className="p-6 border-b border-zinc-800">
            <h3 className="text-lg font-semibold">Run History</h3>
          </div>
          {runs.length === 0 ? (
            <p className="p-6 text-zinc-500 text-sm">No runs yet.</p>
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-800 text-left">
                    <th className="px-4 py-3 text-xs text-zinc-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-xs text-zinc-500 uppercase">Started</th>
                    <th className="px-4 py-3 text-xs text-zinc-500 uppercase">Duration</th>
                    <th className="px-4 py-3 text-xs text-zinc-500 uppercase">Scanned</th>
                    <th className="px-4 py-3 text-xs text-zinc-500 uppercase">Matched</th>
                    <th className="px-4 py-3 text-xs text-zinc-500 uppercase">Actions</th>
                    <th className="px-4 py-3 text-xs text-zinc-500 uppercase">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <RunRow
                      key={run.id}
                      run={run}
                      expanded={expandedRun === run.id}
                      onToggle={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                    />
                  ))}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="p-4 border-t border-zinc-800 flex items-center justify-between">
                  <button
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-30 transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-zinc-500">
                    Page {page + 1} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                    className="text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-30 transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Run Row ---

function RunRow({ run, expanded, onToggle }: { run: RunRecord; expanded: boolean; onToggle: () => void }) {
  const statusColor = run.status === 'completed' ? 'bg-green-500'
    : run.status === 'failed' ? 'bg-red-500'
    : run.status === 'running' ? 'bg-yellow-500'
    : 'bg-zinc-500';

  const duration = run.completed_at
    ? `${Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)}s`
    : 'Running...';

  const actionSummary = [
    run.emails_archived > 0 ? `${run.emails_archived} archived` : '',
    run.emails_marked_read > 0 ? `${run.emails_marked_read} read` : '',
    run.emails_labeled > 0 ? `${run.emails_labeled} labeled` : '',
    run.emails_replied > 0 ? `${run.emails_replied} replied` : '',
    run.emails_forwarded > 0 ? `${run.emails_forwarded} fwd` : '',
    run.tasks_created > 0 ? `${run.tasks_created} tasks` : '',
  ].filter(Boolean).join(', ') || '-';

  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer"
      >
        <td className="px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${statusColor}`} />
            {run.dry_run && (
              <span className="bg-blue-900 text-blue-300 text-xs px-1.5 py-0.5 rounded">Test</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-zinc-400">
          {new Date(run.started_at).toLocaleString()}
        </td>
        <td className="px-4 py-3 text-sm text-zinc-400 font-mono">{duration}</td>
        <td className="px-4 py-3 text-sm text-zinc-400">{run.emails_scanned}</td>
        <td className="px-4 py-3 text-sm text-zinc-400">{run.emails_matched}</td>
        <td className="px-4 py-3 text-sm text-zinc-400">{actionSummary}</td>
        <td className="px-4 py-3 text-sm text-zinc-400 max-w-xs truncate">
          {run.error ? <span className="text-red-400">{run.error}</span> : run.summary ?? '-'}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-zinc-800/20">
          <td colSpan={7} className="px-4 py-4">
            <RunDetails run={run} />
          </td>
        </tr>
      )}
    </>
  );
}

function RunDetails({ run }: { run: RunRecord }) {
  const details = Array.isArray(run.details) ? run.details : [];

  if (details.length === 0 && !run.error) {
    return <p className="text-sm text-zinc-500">No details available.</p>;
  }

  return (
    <div className="space-y-3">
      {run.error && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-3">
          <p className="text-sm text-red-400">{run.error}</p>
        </div>
      )}
      {run.summary && (
        <p className="text-sm text-zinc-300">{run.summary}</p>
      )}
      {details.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-zinc-300">Per-Email Details</h4>
          {details.map((detail: any, idx: number) => (
            <div key={idx} className="bg-zinc-800/50 rounded p-3 text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-zinc-200">{detail.subject}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  detail.matches_goal ? 'bg-green-900 text-green-300' : 'bg-zinc-700 text-zinc-400'
                }`}>
                  {detail.matches_goal ? 'Match' : 'No match'}
                </span>
              </div>
              <p className="text-zinc-500 text-xs">{detail.reason}</p>
              {detail.actions?.length > 0 && (
                <p className="text-zinc-400 text-xs mt-1">Actions: {detail.actions.join(', ')}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Form Components ---

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-zinc-300">{label}</label>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          value ? 'bg-blue-600' : 'bg-zinc-700'
        }`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          value ? 'translate-x-5' : ''
        }`} />
      </button>
    </div>
  );
}

function InputField({ label, value, type, placeholder, onSave }: {
  label: string;
  value: string;
  type?: string;
  placeholder?: string;
  onSave: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setLocal(value); setDirty(false); }, [value]);

  return (
    <div>
      <label className="text-sm text-zinc-400 block mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          type={type ?? 'text'}
          value={local}
          onChange={(e) => { setLocal(e.target.value); setDirty(true); }}
          onBlur={() => { if (dirty && local !== value) { onSave(local); setDirty(false); } }}
          onKeyDown={(e) => { if (e.key === 'Enter' && dirty) { onSave(local); setDirty(false); } }}
          placeholder={placeholder}
          className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 flex-1 focus:outline-none focus:border-zinc-500"
        />
      </div>
    </div>
  );
}

function TextareaField({ label, value, rows, placeholder, onSave }: {
  label: string;
  value: string;
  rows?: number;
  placeholder?: string;
  onSave: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setLocal(value); setDirty(false); }, [value]);

  return (
    <div>
      <label className="text-sm text-zinc-400 block mb-1">{label}</label>
      <textarea
        value={local}
        onChange={(e) => { setLocal(e.target.value); setDirty(true); }}
        rows={rows ?? 3}
        placeholder={placeholder}
        className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 w-full focus:outline-none focus:border-zinc-500 resize-none"
      />
      {dirty && (
        <button
          onClick={() => { onSave(local); setDirty(false); }}
          className="mt-2 bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded text-sm font-medium transition-colors"
        >
          Save
        </button>
      )}
    </div>
  );
}

function SelectField({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-sm text-zinc-400 block mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

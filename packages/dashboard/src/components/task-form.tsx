'use client';

import { useState } from 'react';

interface TaskFormProps {
  onSubmit: (task: {
    name: string;
    cronExpression: string;
    action: string;
    parameters: Record<string, unknown>;
    enabled: boolean;
  }) => Promise<void>;
  onCancel: () => void;
  initialValues?: {
    name?: string;
    cronExpression?: string;
    action?: string;
    parameters?: string;
    enabled?: boolean;
  };
}

export function TaskForm({ onSubmit, onCancel, initialValues }: TaskFormProps) {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [cronExpression, setCronExpression] = useState(initialValues?.cronExpression ?? '');
  const [action, setAction] = useState(initialValues?.action ?? '');
  const [params, setParams] = useState(initialValues?.parameters ?? '{}');
  const [enabled, setEnabled] = useState(initialValues?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim() || !cronExpression.trim() || !action.trim()) {
      setError('Name, cron expression, and action are required.');
      return;
    }

    let parsedParams: Record<string, unknown>;
    try {
      parsedParams = JSON.parse(params);
    } catch {
      setError('Parameters must be valid JSON.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name, cronExpression, action, parameters: parsedParams, enabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-900/50 border border-red-800 rounded p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div>
        <label className="block text-xs text-zinc-500 uppercase mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Daily Report"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 uppercase mb-1">Cron Expression</label>
        <input
          type="text"
          value={cronExpression}
          onChange={(e) => setCronExpression(e.target.value)}
          placeholder="e.g., 0 9 * * * (every day at 9am)"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 font-mono focus:outline-none focus:border-zinc-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 uppercase mb-1">Action</label>
        <input
          type="text"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="e.g., gmail.send"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 font-mono focus:outline-none focus:border-zinc-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 uppercase mb-1">Parameters (JSON)</label>
        <textarea
          value={params}
          onChange={(e) => setParams(e.target.value)}
          rows={3}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 font-mono focus:outline-none focus:border-zinc-500"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="task-enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="rounded bg-zinc-800 border-zinc-700"
        />
        <label htmlFor="task-enabled" className="text-sm text-zinc-300">Enabled</label>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded text-sm font-medium"
        >
          {saving ? 'Saving...' : 'Save Task'}
        </button>
        <button
          onClick={onCancel}
          className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

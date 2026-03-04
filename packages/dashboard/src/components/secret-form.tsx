'use client';

import { useState } from 'react';

interface SecretFormProps {
  onSubmit: (name: string, value: string) => Promise<void>;
  onCancel: () => void;
}

export function SecretForm({ onSubmit, onCancel }: SecretFormProps) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim() || !value.trim()) {
      setError('Both name and value are required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit(name.trim(), value);
      setName('');
      setValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to store secret');
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
        <label className="block text-xs text-zinc-500 uppercase mb-1">Secret Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
          placeholder="e.g., TELEGRAM_BOT_TOKEN"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 font-mono focus:outline-none focus:border-zinc-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 uppercase mb-1">Value</label>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter secret value"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={saving || !name.trim() || !value.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded text-sm font-medium"
        >
          {saving ? 'Saving...' : 'Add Secret'}
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

'use client';

import { useState } from 'react';

type ApprovalLevel = 'auto' | 'notify' | 'require';

interface ApprovalEditorProps {
  approvalDefaults: Record<string, ApprovalLevel>;
  onSave: (defaults: Record<string, ApprovalLevel>) => Promise<void>;
}

const LEVEL_COLORS: Record<ApprovalLevel, string> = {
  require: 'text-red-400',
  notify: 'text-yellow-400',
  auto: 'text-green-400',
};

export function ApprovalEditor({ approvalDefaults, onSave }: ApprovalEditorProps) {
  const [defaults, setDefaults] = useState(approvalDefaults);
  const [newAction, setNewAction] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const handleLevelChange = (action: string, level: ApprovalLevel) => {
    setDefaults((prev) => ({ ...prev, [action]: level }));
    setDirty(true);
  };

  const handleRemove = (action: string) => {
    setDefaults((prev) => {
      const next = { ...prev };
      delete next[action];
      return next;
    });
    setDirty(true);
  };

  const handleAdd = () => {
    if (!newAction.trim()) return;
    setDefaults((prev) => ({ ...prev, [newAction.trim()]: 'require' }));
    setNewAction('');
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(defaults);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {Object.entries(defaults).map(([action, level]) => (
        <div key={action} className="flex items-center justify-between py-1.5">
          <span className="text-sm font-mono text-zinc-300">{action}</span>
          <div className="flex items-center gap-2">
            <select
              value={level}
              onChange={(e) => handleLevelChange(action, e.target.value as ApprovalLevel)}
              className={`bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm ${LEVEL_COLORS[level]} focus:outline-none`}
            >
              <option value="auto">auto</option>
              <option value="notify">notify</option>
              <option value="require">require</option>
            </select>
            <button
              onClick={() => handleRemove(action)}
              className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
            >
              Remove
            </button>
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/50">
        <input
          type="text"
          value={newAction}
          onChange={(e) => setNewAction(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="action.name"
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 flex-1 focus:outline-none focus:border-zinc-500 font-mono"
        />
        <button
          onClick={handleAdd}
          disabled={!newAction.trim()}
          className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 px-3 py-1 rounded text-sm"
        >
          Add
        </button>
      </div>

      {dirty && (
        <div className="pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded text-sm font-medium"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  );
}

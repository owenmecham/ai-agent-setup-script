'use client';

import { useState } from 'react';

interface TagListEditorProps {
  values: string[];
  onSave: (values: string[]) => Promise<void>;
  placeholder?: string;
  emptyMessage?: string;
  multiline?: boolean;
}

export function TagListEditor({ values, onSave, placeholder, emptyMessage, multiline }: TagListEditorProps) {
  const [items, setItems] = useState(values);
  const [newValue, setNewValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const handleAdd = () => {
    const trimmed = newValue.trim();
    if (!trimmed) return;
    setItems((prev) => [...prev, trimmed]);
    setNewValue('');
    setDirty(true);
  };

  const handleRemove = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(items);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-2">
      {items.length === 0 && emptyMessage && (
        <p className="text-sm text-zinc-500 italic">{emptyMessage}</p>
      )}

      {items.map((item, index) => (
        <div key={index} className="flex items-start justify-between gap-2 py-1.5">
          <span className={`text-sm text-zinc-300 ${multiline ? 'whitespace-pre-wrap' : 'font-mono'} flex-1 break-words`}>
            {item}
          </span>
          <button
            onClick={() => handleRemove(index)}
            className="text-xs text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0"
          >
            Remove
          </button>
        </div>
      ))}

      <div className="flex items-start gap-2 pt-2 border-t border-zinc-800/50">
        {multiline ? (
          <textarea
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={2}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 flex-1 focus:outline-none focus:border-zinc-500 resize-none"
          />
        ) : (
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 flex-1 focus:outline-none focus:border-zinc-500 font-mono"
          />
        )}
        <button
          onClick={handleAdd}
          disabled={!newValue.trim()}
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

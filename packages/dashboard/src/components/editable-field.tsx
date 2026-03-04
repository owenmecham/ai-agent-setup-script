'use client';

import { useState, useRef, useEffect } from 'react';

interface EditableFieldProps {
  label: string;
  value: string;
  type?: 'text' | 'number';
  onSave: (value: string) => Promise<void> | void;
}

export function EditableField({ label, value, type = 'text', onSave }: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const handleSave = async () => {
    if (editValue === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(editValue);
      setEditing(false);
    } catch {
      setEditValue(value);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(value);
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-between py-2 border-b border-zinc-800/50 group">
      <span className="text-sm text-zinc-300">{label}</span>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type={type}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') handleCancel();
            }}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 w-48 focus:outline-none focus:border-zinc-500"
            disabled={saving}
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs text-green-400 hover:text-green-300"
          >
            Save
          </button>
          <button
            onClick={handleCancel}
            className="text-xs text-zinc-500 hover:text-zinc-400"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-500 font-mono">{value}</span>
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-zinc-600 hover:text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Edit
          </button>
        </div>
      )}
    </div>
  );
}

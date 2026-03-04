'use client';

import { useState } from 'react';

interface MCPServer {
  name: string;
  transport: 'stdio' | 'http';
  url?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
}

interface MCPEditorProps {
  servers: MCPServer[];
  onSave: (servers: MCPServer[]) => Promise<void>;
}

export function MCPEditor({ servers, onSave }: MCPEditorProps) {
  const [list, setList] = useState(servers);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTransport, setNewTransport] = useState<'stdio' | 'http'>('stdio');
  const [newCommand, setNewCommand] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const handleRemove = (index: number) => {
    setList((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  };

  const handleAdd = () => {
    if (!newName.trim()) return;

    const server: MCPServer = {
      name: newName.trim(),
      transport: newTransport,
    };

    if (newTransport === 'stdio' && newCommand.trim()) {
      server.command = newCommand.trim();
    }
    if (newTransport === 'http' && newUrl.trim()) {
      server.url = newUrl.trim();
    }

    setList((prev) => [...prev, server]);
    setNewName('');
    setNewCommand('');
    setNewUrl('');
    setShowAdd(false);
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(list);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {list.length === 0 && !showAdd && (
        <p className="text-sm text-zinc-500">No MCP servers configured.</p>
      )}

      {list.map((server, i) => (
        <div key={i} className="flex items-center justify-between py-1.5 border-b border-zinc-800/50">
          <div>
            <span className="text-sm font-mono text-zinc-300">{server.name}</span>
            <span className="text-xs text-zinc-500 ml-2">({server.transport})</span>
            {server.command && <span className="text-xs text-zinc-600 ml-2">{server.command}</span>}
            {server.url && <span className="text-xs text-zinc-600 ml-2">{server.url}</span>}
          </div>
          <button
            onClick={() => handleRemove(i)}
            className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
          >
            Remove
          </button>
        </div>
      ))}

      {showAdd ? (
        <div className="space-y-2 p-3 bg-zinc-800/50 rounded-lg">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Server name"
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
          />
          <select
            value={newTransport}
            onChange={(e) => setNewTransport(e.target.value as 'stdio' | 'http')}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 focus:outline-none"
          >
            <option value="stdio">stdio</option>
            <option value="http">http</option>
          </select>
          {newTransport === 'stdio' ? (
            <input
              type="text"
              value={newCommand}
              onChange={(e) => setNewCommand(e.target.value)}
              placeholder="Command (e.g., npx -y @modelcontextprotocol/server)"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            />
          ) : (
            <input
              type="text"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="URL (e.g., http://localhost:8080)"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            />
          )}
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 py-1 rounded text-sm"
            >
              Add Server
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="bg-zinc-800 hover:bg-zinc-700 px-3 py-1 rounded text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="bg-zinc-800 hover:bg-zinc-700 px-3 py-1 rounded text-sm"
        >
          + Add MCP Server
        </button>
      )}

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

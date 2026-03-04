'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { SecretForm } from '../../components/secret-form';

export default function SecretsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: secrets, isLoading } = useQuery({
    queryKey: ['secrets'],
    queryFn: async () => {
      const res = await fetch('/api/secrets');
      return res.json() as Promise<string[]>;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (name: string) => {
      await fetch(`/api/secrets/${encodeURIComponent(name)}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['secrets'] });
      setConfirmDelete(null);
    },
  });

  const handleAdd = async (name: string, value: string) => {
    await fetch('/api/secrets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, value }),
    });
    queryClient.invalidateQueries({ queryKey: ['secrets'] });
    setShowForm(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Secrets</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium"
          >
            Add Secret
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Add New Secret</h3>
          <SecretForm onSubmit={handleAdd} onCancel={() => setShowForm(false)} />
        </div>
      )}

      <div className="bg-zinc-900 rounded-xl border border-zinc-800">
        {isLoading ? (
          <p className="p-6 text-zinc-500 text-sm">Loading...</p>
        ) : !secrets?.length ? (
          <p className="p-6 text-zinc-500 text-sm">No secrets stored yet.</p>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {secrets.map((name) => (
              <div key={name} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-mono text-zinc-300">{name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-600">********</span>
                  {confirmDelete === name ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">Delete?</span>
                      <button
                        onClick={() => deleteMutation.mutate(name)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="text-xs text-zinc-500 hover:text-zinc-400"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(name)}
                      className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

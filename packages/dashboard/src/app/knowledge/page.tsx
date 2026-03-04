'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

interface KnowledgeDoc {
  id: string;
  title: string;
  source: string;
  sourcePath: string;
  indexedAt: string;
  updatedAt: string;
}

export default function KnowledgePage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: documents, isLoading } = useQuery({
    queryKey: ['knowledge-documents', search],
    queryFn: async () => {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await fetch(`/api/knowledge${params}`);
      return res.json() as Promise<KnowledgeDoc[]>;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/knowledge/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-documents'] });
      setConfirmDelete(null);
    },
  });

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Knowledge Base</h2>

      <div className="mb-4 flex gap-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search knowledge base..."
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
        />
      </div>

      <div className="bg-zinc-900 rounded-xl border border-zinc-800">
        {isLoading ? (
          <p className="p-6 text-zinc-500 text-sm">Loading...</p>
        ) : !documents?.length ? (
          <p className="p-6 text-zinc-500 text-sm">
            {search ? 'No documents match your search.' : 'No documents indexed yet.'}
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th className="px-4 py-3 text-xs text-zinc-500 uppercase">Title</th>
                <th className="px-4 py-3 text-xs text-zinc-500 uppercase">Source</th>
                <th className="px-4 py-3 text-xs text-zinc-500 uppercase">Indexed</th>
                <th className="px-4 py-3 text-xs text-zinc-500 uppercase w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-sm">{doc.title}</td>
                  <td className="px-4 py-3 text-sm text-zinc-400">{doc.source}</td>
                  <td className="px-4 py-3 text-sm text-zinc-500">
                    {new Date(doc.indexedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {confirmDelete === doc.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => deleteMutation.mutate(doc.id)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-xs text-zinc-500 hover:text-zinc-400"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(doc.id)}
                        className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

'use client';

import { useQuery } from '@tanstack/react-query';

export default function KnowledgePage() {
  const { data: documents, isLoading } = useQuery({
    queryKey: ['knowledge-documents'],
    queryFn: async () => {
      const res = await fetch('/api/knowledge');
      return res.json();
    },
  });

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Knowledge Base</h2>

      <div className="mb-4 flex gap-4">
        <input
          type="text"
          placeholder="Search knowledge base..."
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
        />
        <button className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-sm">
          Search
        </button>
      </div>

      <div className="bg-zinc-900 rounded-xl border border-zinc-800">
        {isLoading ? (
          <p className="p-6 text-zinc-500 text-sm">Loading...</p>
        ) : !documents?.length ? (
          <p className="p-6 text-zinc-500 text-sm">No documents indexed yet.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th className="px-4 py-3 text-xs text-zinc-500 uppercase">Title</th>
                <th className="px-4 py-3 text-xs text-zinc-500 uppercase">Source</th>
                <th className="px-4 py-3 text-xs text-zinc-500 uppercase">Indexed</th>
              </tr>
            </thead>
            <tbody>
              {(documents as Array<{ id: string; title: string; source: string; indexedAt: string }>).map((doc) => (
                <tr key={doc.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-sm">{doc.title}</td>
                  <td className="px-4 py-3 text-sm text-zinc-400">{doc.source}</td>
                  <td className="px-4 py-3 text-sm text-zinc-500">
                    {new Date(doc.indexedAt).toLocaleDateString()}
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

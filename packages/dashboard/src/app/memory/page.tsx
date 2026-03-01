export default function MemoryPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Memory</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Conversations</h3>
          <p className="text-zinc-500 text-sm">No conversations yet.</p>
        </div>

        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4">Known Entities</h3>
          <p className="text-zinc-500 text-sm">No entities stored yet.</p>
        </div>
      </div>

      <div className="mt-6 bg-zinc-900 rounded-xl border border-zinc-800 p-6">
        <h3 className="text-lg font-semibold mb-4">Semantic Memories</h3>
        <p className="text-zinc-500 text-sm">No semantic memories yet.</p>
      </div>
    </div>
  );
}

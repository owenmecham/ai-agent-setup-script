'use client';

import { useQuery } from '@tanstack/react-query';

export default function SchedulerPage() {
  const { data: tasks, isLoading } = useQuery({
    queryKey: ['scheduled-tasks'],
    queryFn: async () => {
      const res = await fetch('/api/scheduler');
      return res.json();
    },
  });

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Scheduled Tasks</h2>

      <div className="mb-4">
        <button className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium">
          New Task
        </button>
      </div>

      <div className="bg-zinc-900 rounded-xl border border-zinc-800">
        {isLoading ? (
          <p className="p-6 text-zinc-500 text-sm">Loading...</p>
        ) : !tasks?.length ? (
          <p className="p-6 text-zinc-500 text-sm">No scheduled tasks.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th className="px-4 py-3 text-xs text-zinc-500 uppercase">Name</th>
                <th className="px-4 py-3 text-xs text-zinc-500 uppercase">Schedule</th>
                <th className="px-4 py-3 text-xs text-zinc-500 uppercase">Status</th>
                <th className="px-4 py-3 text-xs text-zinc-500 uppercase">Last Run</th>
              </tr>
            </thead>
            <tbody>
              {(tasks as Array<{ id: string; name: string; cronExpression: string; enabled: boolean; lastRunAt: string | null }>).map((task) => (
                <tr key={task.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-sm">{task.name}</td>
                  <td className="px-4 py-3 text-sm text-zinc-400 font-mono">{task.cronExpression}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs ${task.enabled ? 'bg-green-900 text-green-300' : 'bg-zinc-800 text-zinc-500'}`}>
                      {task.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-500">
                    {task.lastRunAt ? new Date(task.lastRunAt).toLocaleString() : 'Never'}
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

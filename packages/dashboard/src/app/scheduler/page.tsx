'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { TaskForm } from '../../components/task-form';

interface ScheduledTask {
  id: string;
  name: string;
  cronExpression: string;
  action: string;
  parameters: Record<string, unknown>;
  enabled: boolean;
  lastRunAt: string | null;
}

export default function SchedulerPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['scheduled-tasks'],
    queryFn: async () => {
      const res = await fetch('/api/scheduler');
      return res.json() as Promise<ScheduledTask[]>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (task: {
      name: string;
      cronExpression: string;
      action: string;
      parameters: Record<string, unknown>;
      enabled: boolean;
    }) => {
      await fetch('/api/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-tasks'] });
      setShowForm(false);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await fetch(`/api/scheduler/${id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-tasks'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/scheduler/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-tasks'] });
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Scheduled Tasks</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium"
          >
            New Task
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Create Scheduled Task</h3>
          <TaskForm
            onSubmit={async (task) => {
              await createMutation.mutateAsync(task);
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

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
                <th className="px-4 py-3 text-xs text-zinc-500 uppercase">Action</th>
                <th className="px-4 py-3 text-xs text-zinc-500 uppercase">Status</th>
                <th className="px-4 py-3 text-xs text-zinc-500 uppercase">Last Run</th>
                <th className="px-4 py-3 text-xs text-zinc-500 uppercase w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-sm">{task.name}</td>
                  <td className="px-4 py-3 text-sm text-zinc-400 font-mono">{task.cronExpression}</td>
                  <td className="px-4 py-3 text-sm text-zinc-400 font-mono">{task.action}</td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      onClick={() => toggleMutation.mutate({ id: task.id, enabled: !task.enabled })}
                      className={`px-2 py-0.5 rounded text-xs cursor-pointer ${
                        task.enabled ? 'bg-green-900 text-green-300' : 'bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      {task.enabled ? 'Active' : 'Disabled'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-500">
                    {task.lastRunAt ? new Date(task.lastRunAt).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      onClick={() => deleteMutation.mutate(task.id)}
                      className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      Delete
                    </button>
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

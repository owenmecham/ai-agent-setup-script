'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ToggleSwitch } from '../../components/toggle-switch';

interface Integration {
  name: string;
  enabled: boolean;
  description: string;
  settings: Record<string, unknown>;
}

export default function IntegrationsPage() {
  const queryClient = useQueryClient();

  const { data: integrations, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const res = await fetch('/api/integrations');
      return res.json() as Promise<Integration[]>;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ name, enabled }: { name: string; enabled: boolean }) => {
      await fetch(`/api/integrations/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Integrations</h2>

      {isLoading ? (
        <p className="text-zinc-500 text-sm">Loading...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(integrations ?? []).map((integration) => (
            <div key={integration.name} className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold capitalize">{integration.name}</h3>
                <ToggleSwitch
                  enabled={integration.enabled}
                  onChange={(enabled) => toggleMutation.mutate({ name: integration.name, enabled })}
                  disabled={toggleMutation.isPending}
                />
              </div>
              <p className="text-sm text-zinc-500">{integration.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

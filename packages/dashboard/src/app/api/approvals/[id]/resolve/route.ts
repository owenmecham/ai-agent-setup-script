import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { approved } = await request.json();

    // Connect to agent via IPC to resolve approval
    const { createConnection } = await import('node:net');
    const { homedir } = await import('node:os');
    const { join } = await import('node:path');

    const socketPath = join(homedir(), '.murph', 'agent.sock');

    return new Promise<Response>((resolve) => {
      const requestId = crypto.randomUUID();
      const socket = createConnection(socketPath, () => {
        const ipcRequest = {
          id: requestId,
          method: 'approvals.resolve',
          params: { requestId: id, approved, resolvedBy: 'dashboard-user' },
        };
        socket.write(JSON.stringify(ipcRequest) + '\n');
      });

      let buffer = '';
      socket.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const response = JSON.parse(line);
            if (response.id !== requestId) continue;
            socket.destroy();
            resolve(NextResponse.json(response.result ?? { ok: true }));
            return;
          } catch {
            // Continue buffering
          }
        }
      });

      socket.on('error', () => {
        resolve(NextResponse.json(
          { error: 'Failed to connect to agent. Is the agent running?' },
          { status: 503 }
        ));
      });

      setTimeout(() => {
        socket.destroy();
        resolve(NextResponse.json({ error: 'Timeout connecting to agent' }, { status: 504 }));
      }, 5000);
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to resolve approval' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { message, conversationId, model } = await request.json();

  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  try {
    // Connect to agent via IPC
    const { createConnection } = await import('node:net');
    const { homedir } = await import('node:os');
    const { join } = await import('node:path');

    const socketPath = join(homedir(), '.murph', 'agent.sock');

    return new Promise<Response>((resolve) => {
      const socket = createConnection(socketPath, () => {
        const ipcRequest = {
          id: crypto.randomUUID(),
          method: 'chat.send',
          params: {
            message,
            conversationId: conversationId ?? crypto.randomUUID(),
            ...(model && { model }),
          },
        };
        socket.write(JSON.stringify(ipcRequest) + '\n');
      });

      let buffer = '';
      socket.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const response = JSON.parse(line);
            socket.destroy();
            if (response.error) {
              resolve(NextResponse.json({ error: response.error }, { status: 500 }));
            } else {
              resolve(NextResponse.json(response.result));
            }
            return;
          } catch {
            // Continue buffering
          }
        }
      });

      socket.on('error', () => {
        resolve(NextResponse.json(
          { response: `Echo: ${message}`, note: 'Agent not running. Showing echo response.' },
        ));
      });

      setTimeout(() => {
        socket.destroy();
        resolve(NextResponse.json(
          { response: `Echo: ${message}`, note: 'Agent response timed out. Showing echo response.' },
        ));
      }, 30000);
    });
  } catch {
    return NextResponse.json({
      response: `Echo: ${message}`,
      note: 'Agent not available. Showing echo response.',
    });
  }
}

import { NextRequest } from 'next/server';

export async function GET(_request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`),
      );

      // Try to connect to agent IPC for real-time events
      try {
        const { createConnection } = await import('node:net');
        const { homedir } = await import('node:os');
        const { join } = await import('node:path');

        const socketPath = join(homedir(), '.murph', 'agent.sock');
        const listRequestId = crypto.randomUUID();

        const socket = createConnection(socketPath, () => {
          // Request existing pending approvals on connection
          socket.write(JSON.stringify({
            id: listRequestId,
            method: 'approvals.list',
            params: {},
          }) + '\n');
        });

        let buffer = '';
        socket.on('data', (data) => {
          buffer += data.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const msg = JSON.parse(line);

              // Handle response to our approvals.list request
              if (msg.id === listRequestId && msg.result) {
                const pending = Array.isArray(msg.result) ? msg.result : [];
                for (const approval of pending) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: 'approval', ...approval })}\n\n`)
                  );
                }
                continue;
              }

              // Handle real-time broadcast events
              if (msg.event === 'approval-required') {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: 'approval', ...msg.data })}\n\n`)
                );
              }
            } catch {
              // Ignore
            }
          }
        });

        socket.on('close', () => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'disconnected' })}\n\n`)
          );
        });

        socket.on('error', () => {
          // Agent not running, just keep alive
        });
      } catch {
        // No IPC connection available
      }

      // Keep-alive ping every 30 seconds
      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(interval);
        }
      }, 30000);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

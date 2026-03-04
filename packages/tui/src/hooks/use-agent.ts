import { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { IPCClient } from '@murph/core';

interface AgentState {
  connected: boolean;
  reconnecting: boolean;
  error: string | null;
  client: IPCClient;
}

const client = new IPCClient();

export function useAgent() {
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const connect = async () => {
      setReconnecting(true);
      setError(null);
      try {
        await client.connectWithRetry(5, 2000);
        if (mountedRef.current) {
          setConnected(true);
          setReconnecting(false);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Connection failed');
          setReconnecting(false);
          setConnected(false);
        }
      }
    };

    client.on('connected', () => {
      if (mountedRef.current) {
        setConnected(true);
        setReconnecting(false);
        setError(null);
      }
    });

    client.on('disconnected', () => {
      if (mountedRef.current) {
        setConnected(false);
        // Auto-reconnect
        setTimeout(connect, 3000);
      }
    });

    connect();

    return () => {
      mountedRef.current = false;
      client.disconnect();
    };
  }, []);

  return { connected, reconnecting, error, client };
}

export function getIPCClient(): IPCClient {
  return client;
}

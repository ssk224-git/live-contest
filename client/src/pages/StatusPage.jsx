// Shows whether the REST API and the socket connection work (milestone M0 check).
import { useEffect, useState } from 'react';
import { SERVER_URL } from '../lib/config.js';
import { socket, ensureConnected, emitAck } from '../lib/socket.js';

export default function StatusPage() {
  const [api, setApi] = useState('checking…');
  const [sock, setSock] = useState('connecting…');

  // Ask /api/health once when the page opens.
  useEffect(() => {
    fetch(`${SERVER_URL}/api/health`)
      .then((r) => r.json())
      .then((d) => setApi(d.ok ? `API ok${d.db ? ' (database connected)' : ' (no database)'}` : 'API error'))
      .catch(() => setApi('API unreachable'));
  }, []);

  // Connect the socket and do one ping/pong.
  useEffect(() => {
    const onConnect = async () => {
      const reply = await emitAck('ping');
      setSock(reply?.pong ? 'socket connected' : 'socket error');
    };
    const onDisconnect = () => setSock('socket disconnected');
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    ensureConnected();
    if (socket.connected) onConnect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-bold">Live Contest</h1>
      <ul className="mt-4 space-y-2 text-lg">
        <li data-testid="api-status">{api}</li>
        <li data-testid="socket-status">{sock}</li>
      </ul>
    </main>
  );
}

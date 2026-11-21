// /host/:code: the host's live screen. Joins the room as host, then shows the quiz or contest screen.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { socket, ensureConnected, emitAck } from '../lib/socket.js';
import { getToken } from '../lib/api.js';
import { syncClock } from '../lib/useCountdown.js';
import HostQuiz from './HostQuiz.jsx';
import HostContest from './HostContest.jsx';

export default function HostPage() {
  const { code } = useParams();
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');

  // Join as host now, and again after any reconnect (the server sends a fresh snapshot).
  useEffect(() => {
    let alive = true;
    async function join() {
      const reply = await emitAck('host:join', { code, token: getToken() });
      if (!alive) return;
      if (!reply?.ok) return setError(reply?.error || 'Could not open this room');
      syncClock(reply.serverNow);
      setSnapshot({ ...reply.state, receivedAt: Date.now() });
    }
    socket.on('connect', join);
    ensureConnected();
    if (socket.connected) join();
    return () => {
      alive = false;
      socket.off('connect', join);
    };
  }, [code]);

  if (error) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-lg text-rose-700">{error}</p>
        <Link to="/dashboard" className="btn-secondary mt-4">
          Back to dashboard
        </Link>
      </div>
    );
  }
  if (!snapshot) return <p className="p-8 text-slate-500">Opening room {code}…</p>;
  return snapshot.kind === 'quiz' ? <HostQuiz snapshot={snapshot} /> : <HostContest snapshot={snapshot} />;
}

// /play/:code: a student's screen. Joins with the nickname (and playerId after a refresh),
// then shows the quiz or contest screen.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { socket, ensureConnected, emitAck } from '../lib/socket.js';
import { syncClock } from '../lib/useCountdown.js';
import { loadNickname, saveNickname, loadPlayerId, savePlayerId } from '../lib/player.js';
import PlayQuiz from './PlayQuiz.jsx';
import PlayContest from './PlayContest.jsx';

export default function PlayPage() {
  const { code } = useParams();
  const [nickname, setNickname] = useState(loadNickname());
  const [joined, setJoined] = useState(null); // { kind, publicId, nickname, state, receivedAt }
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);

  // Joins (or rejoins with the saved playerId, keeping score and progress).
  const join = useCallback(async () => {
    if (!nickname && !loadPlayerId(code)) return;
    const reply = await emitAck('player:join', { code, nickname, playerId: loadPlayerId(code) });
    if (!reply?.ok) return setError(reply?.error || 'Could not join');
    savePlayerId(code, reply.playerId);
    saveNickname(reply.nickname);
    syncClock(reply.serverNow);
    setError('');
    setJoined({ kind: reply.kind, publicId: reply.publicId, nickname: reply.nickname, state: reply.state, receivedAt: Date.now() });
  }, [code, nickname]);

  // Join now, and again automatically after the connection comes back.
  useEffect(() => {
    const onConnect = () => {
      setOffline(false);
      join();
    };
    const onDisconnect = () => setOffline(true);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    ensureConnected();
    if (socket.connected) join();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [join]);

  if (error && !joined) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-lg text-rose-700">{error}</p>
        <Link to="/" className="btn-secondary mt-4">
          Back
        </Link>
      </div>
    );
  }

  // Opened the link directly without a nickname: ask for one.
  if (!nickname && !loadPlayerId(code)) return <NicknameForm code={code} onDone={setNickname} />;
  if (!joined) return <p className="p-8 text-slate-500">Joining {code}…</p>;

  return (
    <>
      {offline && (
        <div className="sticky top-0 z-50 bg-amber-500 px-3 py-1.5 text-center text-sm font-semibold text-white">
          Connection lost. Reconnecting… your progress is safe.
        </div>
      )}
      {joined.kind === 'quiz' ? <PlayQuiz joined={joined} /> : <PlayContest joined={joined} />}
    </>
  );
}

// Asks for a nickname when the student opened /play/CODE directly.
function NicknameForm({ code, onDone }) {
  const [name, setName] = useState('');
  return (
    <form
      className="mx-auto mt-16 max-w-sm card space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        saveNickname(name.trim());
        onDone(name.trim());
      }}
    >
      <h1 className="text-xl font-bold">Join {code}</h1>
      <input className="input" placeholder="Your nickname" value={name} onChange={(e) => setName(e.target.value.slice(0, 20))} required autoFocus />
      <button className="btn-primary w-full" disabled={!name.trim()}>
        Join
      </button>
    </form>
  );
}

// Wires up every Socket.IO event. Joining (host or student) is shared by both event types;
// the quiz- and contest-specific events live in quizSocket.js and contestSocket.js.
import { readToken } from '../middleware/auth.js';
import { config } from '../config.js';
import { getRoom, rooms, deleteRoom, cleanNickname, addOrRejoinPlayer } from './rooms.js';
import * as quiz from './quizSocket.js';
import * as contest from './contestSocket.js';

// Per event type: how to build a player, the state snapshots, and join/leave hooks.
const KINDS = {
  quiz: {
    makePlayer: quiz.makeQuizPlayer,
    hostState: quiz.quizHostState,
    playerState: quiz.quizPlayerState,
    onJoined: quiz.onQuizPlayerJoined,
    onLeft: quiz.onQuizPlayerLeft,
  },
  contest: {
    makePlayer: contest.makeContestPlayer,
    hostState: contest.contestHostState,
    playerState: contest.contestPlayerState,
    onJoined: contest.onContestPlayerJoined,
    onLeft: contest.onContestPlayerLeft,
  },
};

const FINISHED_ROOM_TTL_MS = 10 * 60 * 1000; // keep a finished room 10 min (for late screens / reconnects)
const ABANDONED_ROOM_TTL_MS = 30 * 60 * 1000; // delete a room whose host has been gone 30 min (unless running)

// Join attempts per socket: at most 10 per minute (stops scripts hammering room codes).
function joinAllowed(socket) {
  const now = Date.now();
  socket.data.joins = (socket.data.joins || []).filter((t) => now - t < 60_000);
  if (socket.data.joins.length >= 10) return false;
  socket.data.joins.push(now);
  return true;
}

// The room this socket hosts (and of the right kind), or null.
function hostRoom(socket, kind) {
  if (socket.data.role !== 'host') return null;
  const room = getRoom(socket.data.code);
  return room && (!kind || room.kind === kind) ? room : null;
}

// { room, player } for this student's socket, or null.
function playerRoom(socket, kind) {
  if (socket.data.role !== 'player') return null;
  const room = getRoom(socket.data.code);
  const player = room?.players.get(socket.data.playerId);
  return room && player && (!kind || room.kind === kind) ? { room, player } : null;
}

// If two students pick the same name, the second becomes "Riya (2)" so leaderboards stay readable.
function uniqueNickname(room, name) {
  const taken = new Set([...room.players.values()].map((p) => p.nickname.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; ; n += 1) {
    const candidate = `${name.slice(0, 15)} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

// Called once from index.js with the Socket.IO server.
export function attachSockets(io) {
  io.on('connection', (socket) => {
    // Every event in this app is (payload, ack): the client always sends a payload object first.
    socket.on('ping', (payload, ack) => reply(ack, { pong: true, serverNow: Date.now() }));

    // Host opens the live screen. The login token proves they own the room.
    socket.on('host:join', (payload, ack) => {
      const user = readToken(payload?.token);
      const room = getRoom(payload?.code);
      if (!user) return reply(ack, { ok: false, error: 'Please log in again' });
      if (!room) return reply(ack, { ok: false, error: 'This room no longer exists' });
      if (room.hostUserId !== user.id) return reply(ack, { ok: false, error: 'You are not the host of this room' });
      socket.data = { role: 'host', code: room.code };
      socket.join(room.code); // everything sent to the room
      socket.join(`${room.code}:host`); // host-only messages
      room.hostOnline = true;
      reply(ack, { ok: true, serverNow: Date.now(), state: KINDS[room.kind].hostState(room) });
    });

    // Student joins with a code and nickname (and their secret playerId if they are rejoining).
    socket.on('player:join', (payload, ack) => {
      if (!joinAllowed(socket)) return reply(ack, { ok: false, error: 'Too many attempts. Wait a minute.' });
      const room = getRoom(payload?.code);
      if (!room) return reply(ack, { ok: false, error: 'No live event with that code' });
      const kind = KINDS[room.kind];
      const rejoining = payload?.playerId && room.players.has(payload.playerId);

      if (!rejoining) {
        if (room.phase === 'finished') return reply(ack, { ok: false, error: 'This event has already finished' });
        if (room.players.size >= config.maxPlayersPerRoom) return reply(ack, { ok: false, error: 'This room is full' });
      }
      const { name, error } = cleanNickname(payload?.nickname);
      if (!rejoining && error) return reply(ack, { ok: false, error });

      const { player, rejoined } = addOrRejoinPlayer(
        room,
        { playerId: rejoining ? payload.playerId : undefined, nickname: rejoining ? undefined : uniqueNickname(room, name), socketId: socket.id },
        kind.makePlayer,
      );
      socket.data = { role: 'player', code: room.code, playerId: player.playerId };
      socket.join(room.code);
      kind.onJoined(room, player, rejoined);
      reply(ack, {
        ok: true,
        kind: room.kind,
        playerId: player.playerId,
        publicId: player.publicId,
        nickname: player.nickname,
        rejoined,
        serverNow: Date.now(),
        state: kind.playerState(room, player),
      });
    });

    quiz.registerQuizHandlers(io, socket, { hostRoom, playerRoom });
    contest.registerContestHandlers(io, socket, { hostRoom, playerRoom });

    // A dropped connection: mark the student offline (they can rejoin with their playerId).
    socket.on('disconnect', () => {
      const room = getRoom(socket.data?.code);
      if (!room) return;
      if (socket.data.role === 'host') {
        const stillHere = io.sockets.adapter.rooms.get(`${room.code}:host`)?.size > 0;
        if (!stillHere) {
          room.hostOnline = false;
          room.hostLeftAt = Date.now();
        }
        return;
      }
      const player = room.players.get(socket.data.playerId);
      if (player && player.socketId === socket.id) {
        player.connected = false;
        KINDS[room.kind].onLeft(room, player);
      }
    });
  });

  // Once a minute, forget rooms that finished long ago or whose host left long ago.
  setInterval(() => sweepRooms(), 60_000).unref();
}

// Deletes old rooms so memory does not grow forever.
export function sweepRooms(now = Date.now()) {
  for (const room of rooms.values()) {
    const finishedLongAgo = room.phase === 'finished' && now - room.endedAt > FINISHED_ROOM_TTL_MS;
    const abandoned = !room.hostOnline && room.phase !== 'running' && now - room.hostLeftAt > ABANDONED_ROOM_TTL_MS;
    if (finishedLongAgo || abandoned) deleteRoom(room.code);
  }
}

// Calls the client's ack callback if it sent one.
function reply(ack, value) {
  if (typeof ack === 'function') ack(value);
}

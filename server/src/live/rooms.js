// Every live event (quiz or contest) is a "room" kept in server memory, found by its 6-letter code.
// Nothing here touches the database: a finished room is saved once, by the game code.
import { randomInt, randomUUID } from 'node:crypto';

// No 0/O or 1/I/L, so codes are easy to read out loud and type on a phone.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Makes a random 6-character room code like "K7QMZ2".
export function randomCode() {
  let code = '';
  for (let i = 0; i < 6; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export const rooms = new Map(); // code -> room

// Creates a room with an unused code. `fields` holds the kind-specific state (quiz or contest).
export function createRoom({ kind, hostUserId, title, ...fields }) {
  let code;
  do code = randomCode();
  while (rooms.has(code));
  const room = {
    code,
    kind, // "quiz" or "contest"
    hostUserId,
    title,
    phase: 'lobby',
    createdAt: Date.now(),
    startedAt: null,
    endedAt: null,
    players: new Map(), // playerId -> player
    hostOnline: false,
    hostLeftAt: Date.now(),
    timer: null, // the setTimeout for the current question / contest end
    cleanupTimer: null,
    ...fields,
  };
  rooms.set(code, room);
  return room;
}

export const getRoom = (code) => rooms.get(String(code || '').toUpperCase());

// Removes a room and stops its timers.
export function deleteRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  clearTimeout(room.timer);
  clearTimeout(room.cleanupTimer);
  rooms.delete(code);
}

// Nickname rules: 1-20 visible characters, no control characters.
export function cleanNickname(raw) {
  const name = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) return { error: 'Type a nickname' };
  if (name.length > 20) return { error: 'Nickname must be 20 characters or fewer' };
  return { name };
}

// Adds a student, or reattaches one who refreshed (same secret playerId).
// playerId is a secret (it lets you rejoin as that player), so we never broadcast it.
// publicId is safe to share: the client uses it to find "me" in leaderboards.
export function addOrRejoinPlayer(room, { playerId, nickname, socketId }, makePlayer) {
  const existing = playerId && room.players.get(playerId);
  if (existing) {
    existing.socketId = socketId;
    existing.connected = true;
    return { player: existing, rejoined: true };
  }
  const player = {
    playerId: randomUUID(),
    publicId: randomUUID().slice(0, 8),
    nickname,
    socketId,
    connected: true,
    joinedAt: Date.now(),
    ...makePlayer(),
  };
  room.players.set(player.playerId, player);
  return { player, rejoined: false };
}

// Number of students currently connected.
export const onlineCount = (room) => [...room.players.values()].filter((p) => p.connected).length;

// What a student's browser remembers. sessionStorage is per tab, so two tabs in the same
// browser can be two different students (and a refresh keeps the same student).

const NICK_KEY = 'lc-nickname';

export const saveNickname = (name) => sessionStorage.setItem(NICK_KEY, name);
export const loadNickname = () => sessionStorage.getItem(NICK_KEY) || '';

// The server gives each student a playerId on first join; we send it back to rejoin after a refresh.
export const savePlayerId = (code, id) => sessionStorage.setItem(`lc-player-${code}`, id);
export const loadPlayerId = (code) => sessionStorage.getItem(`lc-player-${code}`) || undefined;

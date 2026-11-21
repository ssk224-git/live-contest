// Where the server lives. Set VITE_SERVER_URL on Vercel; locally it defaults to port 5002.
export const SERVER_URL = (import.meta.env.VITE_SERVER_URL || 'http://localhost:5002').replace(/\/$/, '');

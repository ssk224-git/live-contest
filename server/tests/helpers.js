// Test helpers: start the real Express app on a random port, connected to a separate
// test database ("live-contest-test"), so tests never touch real data.
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';

// The same Atlas cluster, but the database name is swapped for live-contest-test.
export function testDbUri() {
  if (!config.mongoUri) return null;
  const url = new URL(config.mongoUri);
  url.pathname = '/live-contest-test';
  return url.toString();
}

// Starts the app. Returns { base, close }. Skips (returns null) when there is no database configured.
export async function startTestServer() {
  const uri = testDbUri();
  if (!uri) return null;
  if (!config.jwtSecret) config.jwtSecret = 'test-secret';
  if (mongoose.connection.readyState !== 1) await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://localhost:${server.address().port}`;
  return {
    base,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await mongoose.disconnect();
    },
  };
}

// Small fetch wrapper: api(base, 'POST', '/api/x', body, token) -> { status, body }.
export async function api(base, method, path, body, token) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed, headers: res.headers };
}

// Registers a fresh host with a random email. Returns { token, user, email }.
export async function registerHost(base, name = 'Test Host') {
  const email = `test-${randomUUID()}@example.com`;
  const { status, body } = await api(base, 'POST', '/api/auth/register', { name, email, password: 'password123' });
  if (status !== 201) throw new Error(`register failed: ${status} ${JSON.stringify(body)}`);
  return { ...body, email };
}

// Deletes the users these tests created (and everything they own).
export async function cleanupHosts(emails) {
  const users = await mongoose.connection.db.collection('users').find({ email: { $in: emails } }).toArray();
  const ids = users.map((u) => u._id);
  for (const name of ['quizzes', 'contests', 'sessions']) {
    await mongoose.connection.db.collection(name).deleteMany({ owner: { $in: ids } });
  }
  await mongoose.connection.db.collection('users').deleteMany({ _id: { $in: ids } });
}

// A valid hand-written quiz body.
export const sampleQuiz = () => ({
  title: 'Capitals',
  topic: 'Geography',
  difficulty: 'easy',
  questions: [
    { text: 'What is the capital of France?', options: ['Paris', 'Rome', 'Berlin', 'Madrid'], correctIndex: 0, timeLimitSec: 20 },
    { text: 'What is the capital of Japan?', options: ['Seoul', 'Tokyo', 'Beijing', 'Osaka'], correctIndex: 1, timeLimitSec: 15 },
  ],
});

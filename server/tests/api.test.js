// API tests for host accounts and quiz CRUD, against a real test database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, api, registerHost, cleanupHosts, sampleQuiz } from './helpers.js';

let srv;
const emails = [];

before(async () => {
  srv = await startTestServer();
});

after(async () => {
  if (!srv) return;
  await cleanupHosts(emails);
  await srv.close();
});

test('register, login and /me', async (t) => {
  if (!srv) return t.skip('MONGODB_URI not set');
  const host = await registerHost(srv.base, 'Alice');
  emails.push(host.email);
  assert.ok(host.token);
  assert.equal(host.user.name, 'Alice');
  assert.equal(host.user.passwordHash, undefined, 'never send the hash');

  const dup = await api(srv.base, 'POST', '/api/auth/register', { name: 'A', email: host.email, password: 'password123' });
  assert.equal(dup.status, 409);

  const bad = await api(srv.base, 'POST', '/api/auth/login', { email: host.email, password: 'wrong-password' });
  assert.equal(bad.status, 401);

  const good = await api(srv.base, 'POST', '/api/auth/login', { email: host.email, password: 'password123' });
  assert.equal(good.status, 200);

  const me = await api(srv.base, 'GET', '/api/auth/me', null, good.body.token);
  assert.equal(me.body.user.email, host.email);

  const noToken = await api(srv.base, 'GET', '/api/quizzes');
  assert.equal(noToken.status, 401);
});

test('quiz create, list, edit, delete; another host gets 403', async (t) => {
  if (!srv) return t.skip('MONGODB_URI not set');
  const alice = await registerHost(srv.base, 'Alice');
  const bob = await registerHost(srv.base, 'Bob');
  emails.push(alice.email, bob.email);

  const created = await api(srv.base, 'POST', '/api/quizzes', sampleQuiz(), alice.token);
  assert.equal(created.status, 201);
  const id = created.body.quiz._id;

  const list = await api(srv.base, 'GET', '/api/quizzes', null, alice.token);
  assert.equal(list.body.quizzes.length, 1);
  assert.equal(list.body.quizzes[0].questionCount, 2);

  const edited = { ...sampleQuiz(), title: 'World capitals' };
  const put = await api(srv.base, 'PUT', `/api/quizzes/${id}`, edited, alice.token);
  assert.equal(put.status, 200);
  assert.equal(put.body.quiz.title, 'World capitals');

  // Bob cannot read, edit or delete Alice's quiz.
  assert.equal((await api(srv.base, 'GET', `/api/quizzes/${id}`, null, bob.token)).status, 403);
  assert.equal((await api(srv.base, 'PUT', `/api/quizzes/${id}`, edited, bob.token)).status, 403);
  assert.equal((await api(srv.base, 'DELETE', `/api/quizzes/${id}`, null, bob.token)).status, 403);
  assert.equal((await api(srv.base, 'GET', '/api/quizzes', null, bob.token)).body.quizzes.length, 0);

  assert.equal((await api(srv.base, 'DELETE', `/api/quizzes/${id}`, null, alice.token)).status, 204);
  assert.equal((await api(srv.base, 'GET', `/api/quizzes/${id}`, null, alice.token)).status, 404);
  assert.equal((await api(srv.base, 'GET', '/api/quizzes/not-an-id', null, alice.token)).status, 404);
});

test('contests: at most 4 problems, owner-only, verified badge resets when tests change', async (t) => {
  if (!srv) return t.skip('MONGODB_URI not set');
  const { sampleContestData } = await import('../scripts/sampleData.js');
  const alice = await registerHost(srv.base, 'Alice');
  const bob = await registerHost(srv.base, 'Bob');
  emails.push(alice.email, bob.email);

  const body = sampleContestData();
  const five = { ...body, problems: [...body.problems, ...body.problems, body.problems[0]] };
  const tooMany = await api(srv.base, 'POST', '/api/contests', five, alice.token);
  assert.equal(tooMany.status, 400);
  assert.match(tooMany.body.error, /At most 4 problems/);

  // A client cannot just claim "verified": without a matching fingerprint it is reset.
  body.problems[0].verification = { status: 'verified', notes: [] };
  const created = await api(srv.base, 'POST', '/api/contests', body, alice.token);
  assert.equal(created.status, 201);
  assert.equal(created.body.contest.problems[0].verification.status, 'unverified');
  const id = created.body.contest._id;

  assert.equal((await api(srv.base, 'GET', `/api/contests/${id}`, null, bob.token)).status, 403);
  assert.equal((await api(srv.base, 'GET', '/api/contests', null, alice.token)).body.contests[0].problemCount, 2);
  assert.equal((await api(srv.base, 'DELETE', `/api/contests/${id}`, null, alice.token)).status, 204);
});

test('invalid quiz bodies are rejected with 400', async (t) => {
  if (!srv) return t.skip('MONGODB_URI not set');
  const host = await registerHost(srv.base);
  emails.push(host.email);
  const quiz = sampleQuiz();
  quiz.questions[0].options = ['A', 'a', 'B', 'C']; // duplicate after lowercasing
  const res = await api(srv.base, 'POST', '/api/quizzes', quiz, host.token);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /different/);

  const three = sampleQuiz();
  three.questions[1].options = ['A', 'B', 'C'];
  assert.equal((await api(srv.base, 'POST', '/api/quizzes', three, host.token)).status, 400);
});

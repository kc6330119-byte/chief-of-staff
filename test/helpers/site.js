// Test harness. Each test file gets its own scratch copy of the data folder and its own running
// copy of the Rust core behind the test server (test-server/, a loopback HTTP wrapper that is never
// part of the app), started with MC_ROOT and PORT set. The core is built once per test process.
// Tests only make HTTP requests and read the saved files; they never import the core's code.
//
// If the site is rewritten, the only part that may need changing is the `api` adapter at the
// bottom of this file, which maps what the spec talks about onto request paths.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// The data the tests copy: the repository's own sample workspace, or MC_TEST_DATA.
export const SOURCE_DATA = path.resolve(SITE_DIR, process.env.MC_TEST_DATA || 'sample-workspace');

// The only files the site may write (SPEC.md, Safety; notes/notes.json since step 8).
export const WRITABLE = ['actions/ledger.json', 'notes/notes.json', 'library/books.json', 'corrections/corrections.json'];

// The action ledger: the only place the app records an item's status (step 4).
export const LEDGER = 'actions/ledger.json';

// My notes between meetings (step 8): written only by the app, created on the first note.
export const NOTES = 'notes/notes.json';

// The file that marks a workspace as the sample, which turns demo mode on (core/src/lib.rs, SAMPLE_MARKER).
const SAMPLE_MARKER = '.sample-workspace';

const TARGET_DIR = process.env.CARGO_TARGET_DIR || path.join(SITE_DIR, 'target');
const SERVER_BIN = path.join(TARGET_DIR, 'debug', 'chief-of-staff-test-server');

let built = false;
function buildCore() {
  if (built) return;
  const res = spawnSync('cargo', ['build', '--quiet', '-p', 'chief-of-staff-test-server'], { cwd: SITE_DIR, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`cargo build failed.\n${res.error?.message || ''}${res.stdout}${res.stderr}`);
  built = true;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export function copyData({ prepare, demo = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-site-test-'));
  fs.cpSync(SOURCE_DATA, root, { recursive: true });
  // Start every run with no ledger, no notes and no board from an earlier version; a test that wants one writes it.
  fs.rmSync(path.join(root, 'actions'), { recursive: true, force: true });
  fs.rmSync(path.join(root, 'notes'), { recursive: true, force: true });
  fs.rmSync(path.join(root, 'board'), { recursive: true, force: true });
  // Demo mode follows the data: the copy is marked as the sample, or the marker is removed.
  if (demo) fs.writeFileSync(path.join(root, SAMPLE_MARKER), 'This folder is the Chief of Staff for Managers sample workspace.\n');
  else fs.rmSync(path.join(root, SAMPLE_MARKER), { force: true });
  if (prepare) prepare(root);
  return root;
}

export function snapshot(root) {
  const out = {};
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else out[path.relative(root, abs).split(path.sep).join('/')] = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    }
  };
  walk(root);
  return out;
}

export function changedFiles(before, after) {
  const names = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...names].filter((n) => before[n] !== after[n]).sort();
}

// Starting the test server. Now and then macOS leaves a newly started process asleep in its loader, before
// any of its code runs; such a server never answers. So each attempt gets a time limit, a server that
// doesn't come up is killed rather than left running (a left-over child keeps the test file from ever
// exiting), and a fresh one is started on a new port. "Up" means it answers /api/config for this test's
// own data folder, so a port that another test's server took in the meantime is never mistaken for ours.
const START_ATTEMPTS = 3;
const ATTEMPT_MS = 8000;

function endGroup(child) {
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
  return child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise((r) => child.once('exit', r));
}

async function launch(root, env) {
  const port = await freePort();
  const child = spawn(SERVER_BIN, [], {
    cwd: SITE_DIR,
    env: { ...process.env, MC_ROOT: root, PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // own process group, so stop() ends everything it started
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  const base = `http://localhost:${port}`;
  const deadline = Date.now() + ATTEMPT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) return { why: `it exited (code ${child.exitCode})`, output };
    try {
      const res = await fetch(`${base}/api/config`);
      const config = await res.json().catch(() => null);
      if (res.ok && config && config.dataRoot === path.basename(root)) return { child, port, base, output: () => output };
      if (res.ok) { await endGroup(child); return { why: `port ${port} answered for another data folder`, output }; }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  await endGroup(child);
  return { why: `no answer within ${ATTEMPT_MS / 1000} s`, output };
}

export async function startSite({ prepare, demo = true, env = {} } = {}) {
  buildCore();
  const root = copyData({ prepare, demo });
  const failures = [];
  let started = null;
  for (let attempt = 1; attempt <= START_ATTEMPTS && !started; attempt++) {
    const result = await launch(root, env);
    if (result.child) started = result;
    else failures.push(`attempt ${attempt}: ${result.why}${result.output ? `\n${result.output}` : ''}`);
  }
  if (!started) {
    fs.rmSync(root, { recursive: true, force: true });
    throw new Error(`The site did not start.\n${failures.join('\n')}`);
  }
  const { child, port, base, output } = started;
  // Visible in the test output when a retry was needed, so it is never silent.
  if (failures.length) console.log(`# test server needed ${failures.length + 1} attempts: ${failures.map((f) => f.split('\n')[0]).join('; ')}`);

  const request = async (method, p, body, headers = {}) => {
    const res = await fetch(base + p, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json', ...headers } : headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, ok: res.ok, text, json };
  };

  const site = {
    root,
    port,
    base,
    output,
    get: (p, headers) => request('GET', p, undefined, headers),
    post: (p, body, headers) => request('POST', p, body, headers),
    put: (p, body) => request('PUT', p, body),
    del: (p) => request('DELETE', p),
    file: (rel) => fs.readFileSync(path.join(root, rel), 'utf8'),
    json: (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')),
    exists: (rel) => fs.existsSync(path.join(root, rel)),
    async stop() {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
      const exited = child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise((r) => child.once('exit', r));
      // A server that doesn't stop within 3 s is killed, so the test file can always exit.
      const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } }, 3000);
      await exited;
      clearTimeout(timer);
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
  site.api = api(site);
  return site;
}

// ---------- adapter: spec concepts -> HTTP requests ----------

function must(res, what) {
  if (!res.ok) throw new Error(`${what} failed (${res.status}): ${res.text.slice(0, 300)}`);
  return res.json;
}

function api(site) {
  return {
    // Everything the browser loads to show a page, as one string ("the page output").
    async pageShell() {
      const parts = [await site.get('/')];
      for (const m of parts[0].text.matchAll(/(?:src|href)="([^"]+)"/g)) {
        if (!/^(data:|#|https?:)/.test(m[1])) parts.push(await site.get('/' + m[1].replace(/^\.?\//, '')));
      }
      return parts;
    },
    config: async () => must(await site.get('/api/config'), 'config'),

    // Meetings
    meetingsRaw: () => site.get('/api/meetings'),
    meetings: async () => must(await site.get('/api/meetings'), 'meetings').meetings,
    tracked: async () => must(await site.get('/api/meetings'), 'meetings').tracked,
    meetingRaw: (file, { showPrivate = false } = {}) =>
      site.get(`/api/meeting?file=${encodeURIComponent(file)}${showPrivate ? '&private=1' : ''}`),

    // Board. Every card is addressed by its ID: A-… for an action item, C-… for a card of my own.
    // Moving into Done closes a card and moving it out reopens it; editCard changes any of
    // { due, note } (due: null clears my change) and, for my own cards, { title, owner, meeting }.
    boardRaw: () => site.get('/api/board'),
    board: async () => must(await site.get('/api/board'), 'board'),
    card: async (id) => must(await site.get('/api/board'), 'board').cards.find((c) => c.id === id),
    addCard: (card) => site.post('/api/board/cards', card),
    editCard: (id, changes) => site.put(`/api/board/cards/${encodeURIComponent(id)}`, changes),
    moveCard: (id, column, beforeId = null) => site.post(`/api/board/cards/${encodeURIComponent(id)}/move`, { column, beforeId }),
    acceptCard: (id) => site.post(`/api/board/cards/${encodeURIComponent(id)}/accept`, {}),
    deleteCard: (id) => site.del(`/api/board/cards/${encodeURIComponent(id)}`),
    ledger: () => (site.exists(LEDGER) ? site.json(LEDGER) : null),

    // Today (step 6). Each action answers with the whole Today view and the item as it is now, under "item".
    // act is close, reopen, keep (Keep open / Keep closed: the report has been seen) or due ({ due }).
    todayRaw: () => site.get('/api/today'),
    today: async () => must(await site.get('/api/today'), 'today'),
    todayAct: (id, act, body = {}) => site.post(`/api/today/items/${encodeURIComponent(id)}/${act}`, body),

    // Library
    library: async () => must(await site.get('/api/library'), 'library'),
    addBook: (book) => site.post('/api/library/books', book),
    editBook: (index, book) => site.put(`/api/library/books/${index}`, book),
    notesRaw: (file) => site.get(`/api/library/notes?file=${encodeURIComponent(file)}`),

    // Agents
    agents: async () => must(await site.get('/api/agents'), 'agents'),

    // People. showPrivate asks for the text of my notes between meetings, as the "Show private notes" switch does.
    peopleRaw: ({ showPrivate = false } = {}) => site.get(`/api/people${showPrivate ? '?private=1' : ''}`),
    people: async ({ showPrivate = false } = {}) => must(await site.get(`/api/people${showPrivate ? '?private=1' : ''}`), 'people'),
    personRaw: (name, { showPrivate = false } = {}) => site.get(`/api/people/${encodeURIComponent(name)}${showPrivate ? '?private=1' : ''}`),

    // Notes between meetings (step 8). Each answers with the note as saved; its text only when showPrivate.
    addNote: (note, { showPrivate = false } = {}) => site.post(`/api/notes${showPrivate ? '?private=1' : ''}`, note),
    editNote: (id, changes, { showPrivate = false } = {}) => site.put(`/api/notes/${encodeURIComponent(id)}${showPrivate ? '?private=1' : ''}`, changes),
    deleteNote: (id) => site.del(`/api/notes/${encodeURIComponent(id)}`),
    notes: () => (site.exists(NOTES) ? site.json(NOTES) : null),

    // Corrections
    corrections: async () => must(await site.get('/api/corrections'), 'corrections'),
    addCorrection: (entry) => site.post('/api/corrections', entry),

    // Every read the site offers, for "is this text anywhere it shouldn't be" checks.
    async everyDefaultResponse() {
      const out = [...(await this.pageShell())];
      out.push(await this.meetingsRaw());
      for (const m of await this.meetings()) out.push(await this.meetingRaw(m.file));
      out.push(await this.boardRaw(), await site.get('/api/library'), await site.get('/api/agents'), await site.get('/api/corrections'), await this.peopleRaw(), await this.todayRaw());
      // Each person's page (step 7), which holds my notes between meetings (step 8).
      for (const p of (await this.people()).groups.flatMap((g) => g.people)) out.push(await this.personRaw(p.name));
      return out;
    },
  };
}

// The private-note texts, read straight from the meeting files in the data copy.
export function privateNoteTexts(root) {
  const dir = path.join(root, 'meeting-notes');
  const notes = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      const m = line.match(/manager-only note:?\**:?\s*(.+)$/i);
      if (m) notes.push({ file: f, text: m[1].trim() });
    }
  }
  return notes;
}

// SPEC.md "Safety" and "Run": what the site may write, what it refuses, and that it stays local.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { LEDGER, WRITABLE, changedFiles, snapshot, startSite } from './helpers/site.js';

describe('writes', () => {
  let site;
  before(async () => { site = await startSite(); });
  after(async () => { await site?.stop(); });

  test('after using every page, only the four allowed files have changed', async () => {
    const before = snapshot(site.root);
    const { api } = site;

    // Read every page, then make every kind of change the site offers.
    await api.everyDefaultResponse();
    for (const m of await api.meetings()) await api.meetingRaw(m.file, { showPrivate: true });
    await api.moveCard('A-260505-1', 'done');
    await api.moveCard('A-260505-1', 'doing');
    await api.editCard('A-260505-1', { due: '2026-10-01', note: 'A note' });
    await api.editCard('A-260505-1', { due: null });
    await api.acceptCard('A-260728-6');
    const mine = (await api.addCard({ title: 'Own card' })).json.card;
    await api.editCard(mine.id, { title: 'Own card, edited' });
    await api.deleteCard(mine.id);
    await api.addBook({ title: 'Radical Candor', author: 'Kim Scott', read: 'No', used_by: [] });
    await api.addCorrection({ date: '2026-10-01', where: 'w', what: 'x', caught_by: 'Me', decision: 'd', rule: 'r' });
    const note = (await api.addNote({ person: 'Sam Torres', text: 'A note', meeting: '2026-09-15_kevin-sam_1on1.md' })).json.note;
    await api.editNote(note.id, { text: 'A note, edited' });
    await api.addNote({ person: 'Riley Brooks', text: 'Another note' });
    await api.deleteNote(note.id);
    for (const p of ['Sam Torres', 'Riley Brooks']) await api.personRaw(p, { showPrivate: true });

    const changed = changedFiles(before, snapshot(site.root));
    assert.deepEqual(changed.filter((f) => !WRITABLE.includes(f)), [], 'nothing else was written or left behind');
    assert.deepEqual(changed, [...WRITABLE].sort());
  });

  test('paths outside the data root are refused', async () => {
    for (const p of [
      '/api/meeting?file=../CLAUDE.md',
      '/api/meeting?file=..%2F..%2Fetc%2Fpasswd',
      '/api/meeting?file=%2Fetc%2Fpasswd',
      '/api/library/notes?file=../../etc/passwd',
      '/..%2Fpackage.json',
      '/%2e%2e/%2e%2e/etc/passwd',
    ]) {
      const res = await site.get(p);
      assert.ok(res.status >= 400, `${p} -> ${res.status}`);
      assert.doesNotMatch(res.text, /root:|"name": "chief-of-staff"/);
    }
  });
});

describe('an unreadable ledger is never overwritten', () => {
  const BROKEN = '{"version": 1, "items": { "A-260505-1": {"column": "done"';
  let site;
  before(async () => {
    site = await startSite({
      prepare(root) {
        fs.mkdirSync(path.join(root, 'actions'));
        fs.writeFileSync(path.join(root, LEDGER), BROKEN);
      },
    });
  });
  after(async () => { await site?.stop(); });

  test('the Board says "could not read" and refuses every change', async () => {
    const res = await site.api.boardRaw();
    assert.equal(res.ok, false);
    assert.match(res.text, /actions\/ledger\.json could not read/);
    for (const write of [
      await site.api.moveCard('A-260505-1', 'doing'),
      await site.api.editCard('A-260505-1', { note: 'x' }),
      await site.api.acceptCard('A-260728-6'),
      await site.api.addCard({ title: 'Own card' }),
    ]) assert.equal(write.ok, false, write.text.slice(0, 200));
    assert.equal(site.file(LEDGER), BROKEN);
  });

  test('the Meetings page still opens, and says the ledger could not be read', async () => {
    const res = await site.api.meetingsRaw();
    assert.equal(res.status, 200);
    assert.ok(res.json.warnings.some((w) => w.file === LEDGER && /could not read/.test(w.message)), JSON.stringify(res.json.warnings.filter((w) => w.file === LEDGER)));
    assert.ok(res.json.tracked.every((r) => r.closed === null));
    assert.ok(res.json.tracked.every((r) => r.chip === null), 'and no chips (step 5)');
  });
});

describe('local only', () => {
  let site;
  before(async () => { site = await startSite(); });
  after(async () => { await site?.stop(); });

  test('the pages load nothing from the network', async () => {
    const shell = (await site.api.pageShell()).map((r) => r.text).join('\n');
    assert.doesNotMatch(shell, /(src|href)\s*=\s*["']?(https?:)?\/\//i, 'no external scripts, styles or fonts');
    assert.doesNotMatch(shell, /@import\s+url\(\s*["']?https?:/i);
    assert.doesNotMatch(shell, /fetch\(\s*["'`]https?:/i);
  });

  test('it listens on 127.0.0.1 only', async (t) => {
    const external = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
    if (!external) return t.skip('no non-loopback address on this machine');
    const reached = await new Promise((resolve) => {
      const sock = net.connect({ host: external.address, port: site.port });
      sock.setTimeout(1500);
      sock.on('connect', () => { sock.destroy(); resolve(true); });
      sock.on('error', () => resolve(false));
      sock.on('timeout', () => { sock.destroy(); resolve(false); });
    });
    assert.equal(reached, false, `not reachable on ${external.address}`);
  });

  test('other websites can\'t read or write through it', async () => {
    // fetch() replaces a custom Host header, so this request goes through node:http.
    const wrongHost = await new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port: site.port, path: '/api/meetings', headers: { Host: `evil.example:${site.port}` } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      }).on('error', reject);
    });
    assert.equal(wrongHost, 403, 'a page on another host name (DNS rebinding) is refused');
    const crossSite = await site.post('/api/board/cards/A-260505-1/move', { column: 'done' }, { Origin: 'https://evil.example' });
    assert.equal(crossSite.status, 403);
    const formPost = await fetch(`${site.base}/api/board/cards/A-260505-1/move`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{"column":"done"}' });
    assert.ok(formPost.status >= 400);
    assert.equal(site.exists(LEDGER), false, 'nothing was written');
  });
});

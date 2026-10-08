// Corrections log.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startSite } from './helpers/site.js';

let site;
before(async () => { site = await startSite(); });
after(async () => { await site?.stop(); });

const entry = {
  date: '2026-10-01',
  where: 'Mission Control site, tests',
  what: 'The first test run used the real data folder.',
  caught_by: 'Me',
  decision: 'Tests now run against a scratch copy.',
  rule: 'Tests never touch the real data folder.',
};

test('the total matches the file, and partial dates are shown as written', async () => {
  const file = site.json('corrections/corrections.json');
  const view = await site.api.corrections();
  assert.equal(view.total, file.entries.length);
  assert.equal(view.entries.length, file.entries.length);
  const partial = file.entries.find((e) => /^\d{4}-\d{2}$/.test(e.date));
  if (partial) assert.ok(view.entries.some((e) => e.date === partial.date));
});

test('adding an entry appends it and keeps the rest of the file', async () => {
  const before = site.json('corrections/corrections.json');
  const res = await site.api.addCorrection(entry);
  assert.equal(res.status, 200);
  const after = site.json('corrections/corrections.json');
  assert.equal(after.entries.length, before.entries.length + 1);
  assert.deepEqual(after.entries.slice(0, -1), before.entries);
  assert.deepEqual(after.entries.at(-1), entry);
  assert.equal(after.note, before.note);
  assert.equal(res.json.total, before.entries.length + 1);
});

test('bad entries are refused and the file is left alone', async () => {
  const before = site.file('corrections/corrections.json');
  assert.equal((await site.api.addCorrection(entry)).status, 400, 'duplicate');
  assert.equal((await site.api.addCorrection({ ...entry, what: 'x', date: '2026-13-01' })).status, 400);
  assert.equal((await site.api.addCorrection({ ...entry, what: 'x', date: '2999-01-01' })).status, 400);
  assert.equal((await site.api.addCorrection({ ...entry, what: 'x', rule: '' })).status, 400);
  assert.equal(site.file('corrections/corrections.json'), before);
});

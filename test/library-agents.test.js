// Library and Agents.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { startSite } from './helpers/site.js';

describe('library', () => {
  let site;
  before(async () => { site = await startSite(); });
  after(async () => { await site?.stop(); });

  test('lists every book with its fields', async () => {
    const lib = await site.api.library();
    assert.equal(lib.books.length, site.json('library/books.json').length);
    const carnegie = lib.books.find((b) => /Win Friends/.test(b.title));
    assert.equal(carnegie.rating, 5);
    assert.equal(carnegie.read, 'Yes');
    assert.equal(carnegie.dateRead, '2021-05-15');
    assert.deepEqual(carnegie.usedBy, ['Coach']);
    assert.equal(carnegie.notes.path, 'library/carnegie-notes.md');
  });

  test('adding a book saves it to books.json', async () => {
    const res = await site.api.addBook({ title: 'Radical Candor', author: 'Kim Scott', read: 'Yes', date_read: '2024-03-01', rating: 4, used_by: [], notes: null });
    assert.equal(res.status, 200);
    const saved = site.json('library/books.json').at(-1);
    assert.equal(saved.title, 'Radical Candor');
    assert.equal(saved.rating, 4);
  });

  test('editing a book keeps fields the form doesn\'t show', async () => {
    const books = site.json('library/books.json');
    const i = books.findIndex((b) => /7 Habits/.test(b.title));
    const year = books[i].year;
    const res = await site.api.editBook(i, {
      original: { title: books[i].title, author: books[i].author },
      title: books[i].title, author: books[i].author, read: 'Yes', date_read: books[i].date_read, rating: 5, used_by: ['Coach'], notes: books[i].notes,
    });
    assert.equal(res.status, 200);
    const saved = site.json('library/books.json')[i];
    assert.equal(saved.rating, 5);
    assert.equal(saved.year, year);
  });

  test('bad input is refused and books.json is left alone', async () => {
    const before = site.file('library/books.json');
    const bad = [
      { title: 'Radical Candor', author: 'Kim Scott', read: 'No', used_by: [] }, // duplicate
      { title: 'X', author: 'Y', read: 'Yes', rating: 7, used_by: [] },
      { title: 'X', author: 'Y', read: 'No', date_read: '2024-01-01', used_by: [] },
      { title: 'X', author: 'Y', read: 'Yes', date_read: '2999-01-01', used_by: [] },
      { title: 'X', author: 'Y', read: 'Yes', used_by: [], notes: 'goals/harborline-sre-goals-2026.md' },
    ];
    for (const b of bad) assert.equal((await site.api.addBook(b)).status, 400, JSON.stringify(b));
    assert.equal(site.file('library/books.json'), before);
  });

  test('only notes files listed in books.json can be shown', async () => {
    assert.equal((await site.api.notesRaw('carnegie-notes.md')).status, 200);
    fs.writeFileSync(path.join(site.root, 'library', 'unlisted.md'), '# not my notes');
    assert.notEqual((await site.api.notesRaw('unlisted.md')).status, 200);
    assert.notEqual((await site.api.notesRaw('../CLAUDE.md')).status, 200);
  });
});

describe('library check marks', () => {
  let site;
  before(async () => {
    site = await startSite({
      prepare(root) {
        // Covey's notes are now "used by" an agent whose Sources line doesn't name them.
        const f = path.join(root, 'library', 'books.json');
        const books = JSON.parse(fs.readFileSync(f, 'utf8'));
        books.find((b) => /7 Habits/.test(b.title)).used_by = ['Blind spot check'];
        fs.writeFileSync(f, JSON.stringify(books, null, 2));
      },
    });
  });
  after(async () => { await site?.stop(); });

  test('a disagreement is marked on that row, and no file changes', async () => {
    const before = [site.file('library/books.json'), site.file('.claude/agents/blind-spot-check.md')];
    const lib = await site.api.library();
    const covey = lib.books.find((b) => /7 Habits/.test(b.title));
    assert.equal(covey.checks.length, 1);
    assert.match(covey.checks[0], /Blind spot check/);
    assert.match(covey.checks[0], /covey-notes\.md/);
    for (const b of lib.books.filter((x) => x !== covey)) assert.deepEqual(b.checks, [], `${b.title} has no check`);
    assert.deepEqual([site.file('library/books.json'), site.file('.claude/agents/blind-spot-check.md')], before);
  });
});

describe('agents', () => {
  let site;
  before(async () => {
    site = await startSite({
      prepare(root) {
        const f = path.join(root, 'CLAUDE.md');
        fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/^Last reviewed:.*$/m, 'Last reviewed: 2026-01-15'));
      },
    });
  });
  after(async () => { await site?.stop(); });

  test('one card for the coach and one per agent file, with every field', async () => {
    const { cards, agentsFolderFound } = await site.api.agents();
    assert.equal(agentsFolderFound, true);
    const agentFiles = fs.readdirSync(path.join(site.root, '.claude', 'agents')).filter((f) => f.endsWith('.md'));
    assert.equal(cards.length, 1 + agentFiles.length);
    // The coach and five agents (step 10: the three from extras/ joined the sample).
    assert.deepEqual(cards.map((c) => c.name), ['Coach', 'Blind spot check', 'Commitment tracker', 'Negotiation prep', 'One on one prep', 'Risk radar']);
    for (const c of cards) {
      assert.ok(c.purposeHtml && c.sourcesHtml && c.lastReviewed && c.rulesHtml.length, `${c.name} has every field`);
    }
  });

  test('"Review due" after 30 days', async () => {
    const { cards } = await site.api.agents();
    assert.equal(cards.find((c) => c.name === 'Coach').reviewDue, true);
  });
});

describe('agents without an agents folder', () => {
  let site;
  before(async () => { site = await startSite({ prepare: (root) => fs.rmSync(path.join(root, '.claude'), { recursive: true, force: true }) }); });
  after(async () => { await site?.stop(); });

  test('shows the coach only and says the folder is missing', async () => {
    const { cards, agentsFolderFound } = await site.api.agents();
    assert.equal(agentsFolderFound, false);
    assert.deepEqual(cards.map((c) => c.name), ['Coach']);
  });
});

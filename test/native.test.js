// Fixes made in the Rust core after the "parity" tag (SPEC.md, decisions 37-43), and later decisions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { startSite } from './helpers/site.js';

const meeting = (title, date, sections) => `# ${title} | ${date}

**Date:** ${date} | **Duration:** 1m
**Attendees:** Kevin Collins (SRE Manager), Sam Ortiz (SRE)
**Company:** Harborline Cloud | **Type:** 1:1

---

${sections}
`;

let site;
before(async () => {
  site = await startSite({
    prepare(root) {
      const notes = path.join(root, 'meeting-notes');
      fs.writeFileSync(path.join(notes, '2026-10-12_native-b_1on1.md'), meeting('Native B', 'October 12, 2026', `## Action Items

| # | Action Item | Owner | Status |
|---|---|---|---|

## Open Items from Earlier Meetings

| From | Item | Owner | Status now |
|---|---|---|---|
| Feb 30 | Item first seen on a date that doesn't exist | Sam Ortiz | Open |
`));
      // A file name that starts with a date that doesn't exist.
      fs.writeFileSync(path.join(notes, '2026-02-30_native-c_1on1.md'), meeting('Native C', 'February 30, 2026', '## Action Items\n'));
      // A "Last reviewed" date that doesn't exist.
      const claude = path.join(root, 'CLAUDE.md');
      fs.writeFileSync(claude, fs.readFileSync(claude, 'utf8').replace(/^Last reviewed:.*$/m, 'Last reviewed: 2026-02-30'));
      // "$" patterns in a header field.
      const dana = path.join(notes, '2026-09-22_dana-kevin_1on1.md');
      // (A function, because a replacement string would itself treat "$" patterns specially.)
      fs.writeFileSync(dana, fs.readFileSync(dana, 'utf8').replace('**Company:** Harborline Cloud', () => '**Company:** Harborline Cloud $$ $& $\' $`'));
      // A book whose title can't be read.
      const booksFile = path.join(root, 'library', 'books.json');
      const books = JSON.parse(fs.readFileSync(booksFile, 'utf8'));
      books.push({ title: 123, author: 'Nobody', read: 'No', used_by: [] });
      fs.writeFileSync(booksFile, JSON.stringify(books, null, 2));
    },
  });
});
after(async () => { await site?.stop(); });

const decode = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

test('a new correction needs a full date, YYYY-MM-DD', async () => {
  const before = site.file('corrections/corrections.json');
  const entry = { where: 'w', what: 'x', caught_by: 'Me', decision: 'd', rule: 'r' };
  for (const date of ['2026-09', '2026']) {
    const res = await site.api.addCorrection({ ...entry, date });
    assert.equal(res.status, 400, date);
    assert.match(res.json.error, /YYYY-MM-DD/);
  }
  assert.equal(site.file('corrections/corrections.json'), before);
});

test('a date that doesn\'t exist is refused everywhere, never rolled over', async () => {
  const tracked = await site.api.tracked();
  const feb30 = tracked.find((r) => /^Item first seen on a date that doesn't exist/.test(r.text));
  assert.equal(feb30.firstSeen, null);
  assert.equal(feb30.firstSeenText, 'Feb 30');
  assert.equal(feb30.ageDays, null);

  const meetings = await site.api.meetings();
  assert.equal(meetings.find((m) => m.file === '2026-02-30_native-c_1on1.md').date, null);

  const coach = (await site.api.agents()).cards.find((c) => c.name === 'Coach');
  assert.equal(coach.lastReviewed, null);

  const books = site.file('library/books.json');
  assert.equal((await site.api.addBook({ title: 'X', author: 'Y', read: 'Yes', date_read: '2026-02-30', used_by: [] })).status, 400);
  assert.equal(site.file('library/books.json'), books);
  const log = site.file('corrections/corrections.json');
  assert.equal((await site.api.addCorrection({ date: '2026-02-30', where: 'w', what: 'x', caught_by: 'Me', decision: 'd', rule: 'r' })).status, 400);
  assert.equal(site.file('corrections/corrections.json'), log);
});

test('editing a book whose title can\'t be read says so', async () => {
  const lib = await site.api.library();
  const book = lib.books.find((b) => b.title && b.title.cnr);
  const before = site.file('library/books.json');
  // What the Library form sends for this book: the unreadable title as it received it.
  const res = await site.api.editBook(book.index, {
    original: { title: book.title, author: book.author }, title: 'Fixed', author: 'Nobody', read: 'No', used_by: [], notes: null,
  });
  assert.equal(res.status, 409);
  assert.match(res.json.error, /title could not be read/);
  assert.equal(site.file('library/books.json'), before);
});

test('"$$", "$&", "$\'" and "$`" in a meeting header come through unchanged', async () => {
  const res = await site.api.meetingRaw('2026-09-22_dana-kevin_1on1.md');
  assert.equal(res.status, 200);
  assert.ok(decode(res.json.html).includes('Harborline Cloud $$ $& $\' $`'), 'the header text is as written');
});

test('a ledger entry stored as a list gets an error that says what is wrong', async () => {
  const file = path.join(site.root, 'actions', 'ledger.json');
  const text = '{"version": 1, "items": {"A-260505-1": ["not", "an", "entry"]}}';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  const res = await site.api.boardRaw();
  assert.equal(res.status, 409);
  assert.match(res.json.error, /entry A-260505-1 is a list/);
  assert.equal((await site.api.moveCard('A-260505-1', 'doing')).status, 409);
  assert.equal(fs.readFileSync(file, 'utf8'), text);
  fs.rmSync(path.dirname(file), { recursive: true });
});

test('error messages say "app", not "site"', async () => {
  const res = await site.post('/api/board/cards', { title: 'x' }, { Origin: 'https://evil.example' });
  assert.equal(res.status, 403);
  assert.equal(res.json.error, 'Writes are only accepted from this app');
  // "Refused: the app never writes …" can't be reached over HTTP; core/src/store.rs tests it.
});

test('the page title and brand are the app name, written once in app/tauri.conf.json', async () => {
  const name = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'app', 'tauri.conf.json'), 'utf8')).productName;
  const [page] = await site.api.pageShell();
  assert.ok(page.text.includes(`<title>${name}</title>`), 'title');
  assert.ok(page.text.includes(`<span class="brand-name">${name}</span>`), 'brand');
  assert.ok(!page.text.includes('__'), 'no placeholder left');
});

// Decision 76: a meeting opens when its file is one of the summaries listed from meeting-notes/, whatever
// characters its name has. Before 0.1.1 the name had to match ^[\w.-]+\.md$, so a summary saved under a
// transcript's name with spaces was listed but could not be opened.
describe('a summary whose file name has spaces, an apostrophe, an ampersand and an accented letter', () => {
  const NAME = "2026-10-05_kevin & sam's café 1on1.md";
  const NOTE = 'Sam asked to keep the café plan quiet until Friday.';
  const NOT_MD = 'agenda for café.txt';
  let odd;
  before(async () => {
    odd = await startSite({
      prepare(root) {
        const notes = path.join(root, 'meeting-notes');
        fs.writeFileSync(path.join(notes, NAME), meeting('Kevin & Sam: Café 1:1', 'October 5, 2026', `## Action Items

| ID | Action Item | Owner | Due | Due date | Status |
|---|---|---|---|---|---|
| A-261005-1 | Book the café for the team lunch | Sam Ortiz | Not set |  | Agreed |
| A-261005-2 | Send Sam's notes to the team | Kevin Collins | Not set |  | Agreed |

## Notes

- **Manager-only note:** ${NOTE}
`));
        fs.writeFileSync(path.join(notes, NOT_MD), 'Agenda text that must never be returned.\n');
      },
    });
  });
  after(async () => { await odd?.stop(); });

  test('is listed, opens, shows its header fields and hides its Manager-only note with the switch off', async () => {
    const listed = (await odd.api.meetings()).find((m) => m.file === NAME);
    assert.ok(listed, 'listed on the Meetings page');
    assert.equal(listed.date, '2026-10-05');

    const res = await odd.api.meetingRaw(NAME);
    assert.equal(res.status, 200, res.text.slice(0, 200));
    const m = res.json;
    assert.equal(m.file, NAME);
    assert.equal(m.date, '2026-10-05');
    assert.equal(m.title, 'Kevin & Sam: Café 1:1 | October 5, 2026');
    assert.deepEqual(m.people, ['Kevin Collins', 'Sam Ortiz']);
    assert.equal(m.type, '1:1');
    const html = decode(m.html);
    for (const field of ['Date', 'Duration', 'Attendees', 'Company', 'Type']) assert.ok(html.includes(`<dt>${field}</dt>`), field);
    assert.ok(html.includes('Sam Ortiz (SRE)</dd>'), 'attendees shown');
    assert.equal(m.privateNotes, 1);
    assert.ok(!html.includes(NOTE), 'the Manager-only note is hidden');

    const shown = await odd.api.meetingRaw(NAME, { showPrivate: true });
    assert.equal(shown.status, 200);
    assert.ok(decode(shown.json.html).includes(NOTE), 'and shown with the switch on');
  });

  test('its action items are on the Board, and the card links back to it', async () => {
    const cards = (await odd.api.board()).cards.filter((c) => c.meeting === NAME);
    assert.deepEqual(cards.map((c) => c.id), ['A-261005-1', 'A-261005-2']);
    assert.deepEqual(cards.map((c) => c.title), ['Book the café for the team lunch', "Send Sam's notes to the team"]);
    for (const c of cards) {
      assert.equal(c.meetingDate, '2026-10-05');
      // The card's link is #/meetings/<encodeURIComponent(card.meeting)>, which asks for exactly this name.
      const back = await odd.api.meetingRaw(c.meeting);
      assert.equal(back.status, 200);
      assert.equal(back.json.file, NAME);
    }
    // A card added by hand can name it too.
    const added = await odd.api.addCard({ title: 'Own card', meeting: NAME });
    assert.equal(added.status, 200, added.text.slice(0, 200));
    assert.equal(added.json.card.meeting, NAME);
    // And its items are tracked, with the summary as their source.
    const tracked = await odd.api.tracked();
    assert.deepEqual(tracked.find((r) => r.key === `${NAME}#1`).sources.map((s) => s.file), [NAME]);
  });

  test('names that are not a summary in meeting-notes/ are refused with 4xx and no file content', async () => {
    const claude = fs.readFileSync(path.join(odd.root, 'CLAUDE.md'), 'utf8').split('\n').find((l) => l.trim().length > 20);
    for (const [file, mustNotShow] of [
      ['../CLAUDE.md', claude],
      [path.join(odd.root, 'meeting-notes', NAME), NOTE],
      [path.join(odd.root, 'CLAUDE.md'), claude],
      [`../meeting-notes/${NAME}`, NOTE],
      [`./${NAME}`, NOTE],
      ['2026-10-06_nobody_1on1.md', null],
      [NOT_MD, 'Agenda text'],
      ['', null],
    ]) {
      const res = await odd.api.meetingRaw(file, { showPrivate: true });
      assert.ok(res.status >= 400 && res.status < 500, `${file} -> ${res.status}`);
      assert.equal(res.json?.noSummary, file, `${file}: says which name is not a summary`);
      assert.equal(res.json.error, `There is no summary named "${file}" in meeting-notes/.`);
      if (mustNotShow) assert.ok(!res.text.includes(mustNotShow), `${file}: no file content`);
      assert.ok(!/Kevin & Sam: Café|"html"/.test(res.text), `${file}: no meeting returned`);
    }
  });
});

// Decision 77: a folder inside meeting-notes/ whose name ends in .md is not a summary. Before, it was listed,
// and reading it as a file made the Meetings page answer 500.
describe('a folder in meeting-notes/ whose name ends in .md', () => {
  const FOLDER = 'old summaries.md';
  let withFolder;
  before(async () => {
    withFolder = await startSite({
      prepare(root) {
        fs.mkdirSync(path.join(root, 'meeting-notes', FOLDER));
        fs.writeFileSync(path.join(root, 'meeting-notes', FOLDER, '2026-01-05_inside_1on1.md'), meeting('Inside', 'January 5, 2026', '## Action Items\n'));
      },
    });
  });
  after(async () => { await withFolder?.stop(); });

  test('is not listed, is not opened, and the Meetings page and the Board load', async () => {
    const res = await withFolder.api.meetingsRaw();
    assert.equal(res.status, 200, res.text.slice(0, 200));
    assert.ok(!res.json.meetings.some((m) => m.file === FOLDER), 'not listed');
    assert.equal(res.json.meetings.length, (await withFolder.api.meetings()).length);
    const open = await withFolder.api.meetingRaw(FOLDER);
    assert.equal(open.status, 404);
    assert.equal(open.json.noSummary, FOLDER);
    assert.equal((await withFolder.api.boardRaw()).status, 200);
    assert.ok((await withFolder.api.board()).cards.length > 0);
    assert.equal((await withFolder.api.addCard({ title: 'x', meeting: FOLDER })).status, 400);
  });
});

// The Board and the action ledger (step 4). Every action item with a usable ID is on the Board; what I do with it
// is recorded in actions/ledger.json, the only place the app records status. What the summaries report never
// moves a card; it is shown as a tag. board/board.json from an earlier version is neither read nor written.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { openPage } from './helpers/page.js';
import { LEDGER, changedFiles, snapshot, startSite } from './helpers/site.js';

const NOTES = 'meeting-notes';
// In the sample, "today" is the newest meeting's date.
const AS_OF = '2026-09-22';

const column = (view, id) => view.cards.filter((c) => c.column === id).map((c) => c.id);
const writeLedger = (ledger) => (root) => {
  fs.mkdirSync(path.join(root, 'actions'), { recursive: true });
  fs.writeFileSync(path.join(root, LEDGER), typeof ledger === 'string' ? ledger : JSON.stringify(ledger, null, 2));
};

describe('the sample, before any change', () => {
  let site;
  before(async () => { site = await startSite(); });
  after(async () => { await site?.stop(); });

  test('opening the Board writes nothing', async () => {
    const before = snapshot(site.root);
    assert.equal((await site.api.boardRaw()).status, 200);
    await openPage(site, '#/board');
    await openPage(site, '#/meetings');
    assert.deepEqual(changedFiles(before, snapshot(site.root)), []);
    assert.equal(site.exists('actions'), false, 'no actions/ folder either');
  });

  test('every action item with a usable ID is on the Board, in To do, with no import', async () => {
    const view = await site.api.board();
    const tracked = await site.api.tracked();
    const ids = tracked.filter((r) => r.kind === 'action item').map((r) => r.id).sort();
    assert.equal(ids.length, 55);
    const items = view.cards.filter((c) => !c.own);
    assert.deepEqual(items.map((c) => c.id).sort(), ids);
    for (const c of items) assert.equal(c.column, 'todo', c.id);
    assert.equal(view.noUsableId, 0);
    assert.deepEqual(view.notOnBoard, []);
    assert.equal(view.oldBoardFile, null);
    assert.equal((await site.post('/api/board/import', { includeSuggested: true })).status, 404, 'there is no import');
  });

  test('with no ledger, To do lists the items oldest first', async () => {
    const todo = (await site.api.board()).cards.filter((c) => c.column === 'todo');
    const dates = todo.map((c) => c.meetingDate);
    assert.deepEqual(dates, [...dates].sort());
    assert.deepEqual(todo.slice(0, 3).map((c) => c.id), ['A-260505-1', 'A-260505-2', 'A-260505-3']);
  });

  test('a card shows its item: title, owner, first meeting, and the summary\'s due words and date', async () => {
    const card = await site.api.card('A-260908-5');
    assert.equal(card.own, false);
    assert.equal(card.title, "Riley's first primary on-call week, with Praveen as secondary");
    assert.equal(card.owner, 'Riley Brooks');
    assert.equal(card.meeting, '2026-09-08_kevin-praveen_1on1.md');
    assert.equal(card.meetingDate, '2026-09-08');
    assert.equal(card.summaryDue, 'Week of Sep 14');
    assert.equal(card.summaryDueDate, '2026-09-18');
    assert.equal(card.myDue, null);
    assert.equal(card.dueDate, '2026-09-18');
    assert.equal(card.closed, null);
    assert.equal(card.note, null);
    assert.equal(card.suggested, false);
  });

  test('suggested items are hidden until "Show suggested" is on; a suggestion offers only Accept', async () => {
    const card = await site.api.card('A-260728-6');
    assert.equal(card.suggested, true);
    assert.equal(card.accepted, null);

    const page = await openPage(site, '#/board');
    assert.doesNotMatch(page.html(), /Something went wrong/);
    assert.equal(page.cardHtml('A-260728-6'), undefined, 'hidden on load');
    assert.ok(page.cardHtml('A-260505-1'), 'an ordinary item is shown');
    await page.choose('show-suggested', true);
    const shown = page.cardHtml('A-260728-6');
    assert.ok(shown, 'shown with the switch on');
    assert.match(shown, /data-act="accept"/);
    assert.doesNotMatch(shown, /data-act="(move|edit|delete|close|reopen)"/);
    assert.doesNotMatch(page.cardHtml('A-260505-1'), /data-act="accept"/);
  });

  test('the Owner filter lists the owners of action items: the five names in people.md', async () => {
    const five = (await site.api.people()).people.map((p) => p.name).sort();
    assert.deepEqual([...(await site.api.board()).owners].sort(), five);
    const page = await openPage(site, '#/board');
    assert.deepEqual(page.options('board-owner').filter(Boolean).sort(), five);
    await page.choose('board-owner', 'Riley Brooks');
    assert.ok(page.cardHtml('A-260908-5'), "Riley's item is shown");
    assert.equal(page.cardHtml('A-260505-1'), undefined, "Kevin's is not");
  });

  test('what the summaries report never moves a card: it shows as "Reported done" or "Reported dropped" with the date', async () => {
    const done = await site.api.card('A-260728-1');
    assert.equal(done.column, 'todo');
    assert.deepEqual(done.reported, { state: 'done', date: '2026-09-22' });
    const dropped = await site.api.card('A-260505-2');
    assert.equal(dropped.column, 'todo');
    assert.deepEqual(dropped.reported, { state: 'dropped', date: '2026-07-28' });
    assert.equal((await site.api.card('A-260505-1')).reported, null, 'an item reported Open has no tag');

    const page = await openPage(site, '#/board');
    // Drawn as the card's chip (step 5): the day without the year when it is the as-of year.
    assert.match(page.cardHtml('A-260728-1'), /<span class="chip chip-soon">Reported done Sep 22<\/span>/);
    assert.match(page.cardHtml('A-260505-2'), /<span class="chip chip-soon">Reported dropped Jul 28<\/span>/);
    assert.doesNotMatch(page.cardHtml('A-260505-1'), /Reported/);
  });
});

describe('changes, recorded in actions/ledger.json', () => {
  let site;
  before(async () => { site = await startSite(); });
  after(async () => { await site?.stop(); });

  test('the first change creates the ledger, holding only that change', async () => {
    assert.equal(site.exists(LEDGER), false);
    const res = await site.api.moveCard('A-260505-1', 'doing');
    assert.equal(res.status, 200, res.text.slice(0, 200));
    assert.equal(res.json.card.id, 'A-260505-1');
    assert.equal(res.json.card.column, 'doing');
    const ledger = site.api.ledger();
    assert.equal(ledger.version, 1);
    assert.deepEqual(Object.keys(ledger.items), ['A-260505-1']);
    assert.deepEqual(ledger.items['A-260505-1'], { column: 'doing' });
    assert.deepEqual(column(await site.api.board(), 'doing'), ['A-260505-1']);
  });

  test('a drop lands before the chosen card, in another column or the same one', async () => {
    const [a, , c] = column(await site.api.board(), 'todo');
    assert.equal((await site.api.moveCard(c, 'todo', a)).status, 200);
    const todo = column(await site.api.board(), 'todo');
    assert.equal(todo.indexOf(c), todo.indexOf(a) - 1);

    assert.equal((await site.api.moveCard('A-260505-3', 'doing', 'A-260505-1')).status, 200);
    assert.deepEqual(column(await site.api.board(), 'doing'), ['A-260505-3', 'A-260505-1']);
  });

  test('every open card has a Close button and every card in Done a Reopen button', async () => {
    assert.equal((await site.api.moveCard('A-260728-2', 'done')).status, 200);
    const view = await site.api.board();
    const page = await openPage(site, '#/board');
    let open = 0;
    let done = 0;
    for (const c of view.cards.filter((x) => !x.suggested)) {
      const html = page.cardHtml(c.id);
      assert.ok(html, `${c.id} is drawn`);
      if (c.column === 'done') {
        done++;
        assert.match(html, /data-act="reopen"/, c.id);
        assert.doesNotMatch(html, /data-act="close"/, c.id);
      } else {
        open++;
        assert.match(html, /data-act="close"/, c.id);
        assert.doesNotMatch(html, /data-act="reopen"/, c.id);
      }
    }
    assert.ok(open > 0 && done > 0, `open ${open}, done ${done}`);
  });

  test('Close is the same as moving to Done; Reopen moves the card to To do', async () => {
    const id = 'A-260728-3';
    const page = await openPage(site, '#/board');
    await page.clickCard(id, 'close');
    assert.deepEqual(site.api.ledger().items[id], { column: 'done', closed: AS_OF });
    let view = await site.api.board();
    assert.equal(column(view, 'done')[0], id, 'at the top of Done (step 5)');
    assert.match(page.cardHtml(id), /data-act="reopen"/, 'the page redrew it with Reopen');
    assert.doesNotMatch(page.cardHtml(id), /data-act="close"/);

    await page.clickCard(id, 'reopen');
    assert.deepEqual(site.api.ledger().items[id], { column: 'todo' });
    view = await site.api.board();
    assert.equal(column(view, 'todo')[0], id, 'at the top of To do (step 5)');
    assert.match(page.cardHtml(id), /data-act="close"/);
  });

  test('moving into Done closes with today\'s date; moving out reopens, clears the date and keeps the note', async () => {
    assert.equal((await site.api.editCard('A-260505-1', { note: 'Dana has the merge list.' })).status, 200);
    const closed = await site.api.moveCard('A-260505-1', 'done');
    assert.equal(closed.status, 200);
    assert.equal(closed.json.card.closed, AS_OF);
    assert.deepEqual(site.api.ledger().items['A-260505-1'], { column: 'done', note: 'Dana has the merge list.', closed: AS_OF });

    // Reordering inside Done keeps it closed on the same date.
    await site.api.moveCard('A-260728-2', 'done');
    assert.equal((await site.api.moveCard('A-260505-1', 'done', null)).status, 200);
    assert.equal((await site.api.card('A-260505-1')).closed, AS_OF);

    const reopened = await site.api.moveCard('A-260505-1', 'doing');
    assert.equal(reopened.json.card.closed, null);
    assert.equal(reopened.json.card.note, 'Dana has the merge list.');
    assert.deepEqual(site.api.ledger().items['A-260505-1'], { column: 'doing', note: 'Dana has the merge list.' });
  });

  test('my due date is stored in the ledger; the summary\'s date and words stay; clearing my change goes back', async () => {
    const id = 'A-260908-5';
    const res = await site.api.editCard(id, { due: '2026-09-25' });
    assert.equal(res.status, 200, res.text.slice(0, 200));
    assert.equal(site.api.ledger().items[id].due, '2026-09-25');
    let card = await site.api.card(id);
    assert.equal(card.myDue, '2026-09-25');
    assert.equal(card.dueDate, '2026-09-25');
    assert.equal(card.summaryDue, 'Week of Sep 14');
    assert.equal(card.summaryDueDate, '2026-09-18');
    const page = await openPage(site, '#/board');
    assert.match(page.cardHtml(id), /Due Sep 25/);
    assert.match(page.cardHtml(id), /Week of Sep 14/);
    assert.match(page.cardHtml(id), /summary: Sep 18/);

    assert.equal((await site.api.editCard(id, { due: null })).status, 200);
    assert.equal('due' in site.api.ledger().items[id], false);
    card = await site.api.card(id);
    assert.equal(card.myDue, null);
    assert.equal(card.dueDate, '2026-09-18');
  });

  test('a note is saved; an empty note removes it', async () => {
    const id = 'A-260728-5';
    assert.equal((await site.api.editCard(id, { note: '  Backfill req is with HR.  ' })).status, 200);
    assert.equal(site.api.ledger().items[id].note, 'Backfill req is with HR.');
    assert.equal((await site.api.card(id)).note, 'Backfill req is with HR.');
    assert.match((await openPage(site, '#/board')).cardHtml(id), /Backfill req is with HR\./);
    assert.equal((await site.api.editCard(id, { note: '' })).status, 200);
    assert.equal('note' in site.api.ledger().items[id], false);
    assert.equal((await site.api.card(id)).note, null);
  });

  test('an action item\'s title and owner come from the summary: they can\'t be edited, and the card can\'t be deleted', async () => {
    const before = site.file(LEDGER);
    assert.equal((await site.api.editCard('A-260505-3', { title: 'changed' })).status, 403);
    assert.equal((await site.api.editCard('A-260505-3', { owner: 'Dana Whitfield' })).status, 403);
    assert.equal((await site.api.deleteCard('A-260505-3')).status, 403);
    assert.equal(site.file(LEDGER), before);
    assert.ok(await site.api.card('A-260505-3'));
  });

  test('a suggestion has one action, Accept; after that it behaves like any item', async () => {
    const id = 'A-260728-6';
    const before = site.file(LEDGER);
    assert.equal((await site.api.moveCard(id, 'doing')).status, 409);
    assert.equal((await site.api.editCard(id, { note: 'x' })).status, 409);
    assert.equal(site.file(LEDGER), before);

    const res = await site.api.acceptCard(id);
    assert.equal(res.status, 200, res.text.slice(0, 200));
    assert.deepEqual(site.api.ledger().items[id], { accepted: AS_OF });
    const card = await site.api.card(id);
    assert.equal(card.suggested, false);
    assert.equal(card.accepted, AS_OF);
    assert.equal((await site.api.moveCard(id, 'doing')).status, 200);

    const page = await openPage(site, '#/board');
    assert.ok(page.cardHtml(id), 'shown with "Show suggested" off');
    assert.doesNotMatch(page.cardHtml(id), /data-act="accept"/);
    assert.equal((await site.api.acceptCard('A-260505-3')).status, 409, 'only a suggestion can be accepted');
  });

  test('my own cards: added at the top of the column with a C- id, edited, closed and deleted in the ledger', async () => {
    const add = await site.api.addCard({ title: 'Book Q4 skip-levels', owner: 'Kevin Collins', column: 'todo' });
    assert.equal(add.status, 200, add.text.slice(0, 200));
    const id = add.json.card.id;
    assert.match(id, /^C-[\w-]+$/);
    assert.equal(add.json.card.own, true);
    assert.equal(column(await site.api.board(), 'todo')[0], id, 'first in its column');
    const entry = site.api.ledger().items[id];
    assert.equal(entry.title, 'Book Q4 skip-levels');
    assert.equal(entry.owner, 'Kevin Collins');
    assert.equal(entry.column, 'todo');

    assert.equal((await site.api.editCard(id, { title: 'Book Q4 skip-levels (all three)', owner: 'Kevin Collins', due: '2026-10-02', note: 'Ask Dana first.' })).status, 200);
    const card = await site.api.card(id);
    assert.equal(card.title, 'Book Q4 skip-levels (all three)');
    assert.equal(card.dueDate, '2026-10-02');
    assert.equal(card.note, 'Ask Dana first.');
    assert.equal((await site.api.moveCard(id, 'done')).json.card.closed, AS_OF);

    assert.equal((await site.api.deleteCard(id)).status, 200);
    assert.equal(id in site.api.ledger().items, false);
    assert.equal(await site.api.card(id), undefined);
  });

  test('an own card\'s owner adds no name to the Owner filter', async () => {
    const add = await site.api.addCard({ title: 'Call the vendor', owner: 'Pat Nobody' });
    assert.equal(add.status, 200);
    assert.ok(!(await site.api.board()).owners.includes('Pat Nobody'));
    assert.equal((await site.api.deleteCard(add.json.card.id)).status, 200);
  });

  test('bad input is refused and the ledger is left alone', async () => {
    const before = site.file(LEDGER);
    assert.equal((await site.api.addCard({ title: '   ' })).status, 400);
    assert.equal((await site.api.addCard({ title: 'x', meeting: '../CLAUDE.md' })).status, 400);
    assert.equal((await site.api.moveCard('A-260505-3', 'someday')).status, 400);
    assert.equal((await site.api.moveCard('A-260505-3', 'todo', 'A-999999-1')).status, 409);
    assert.equal((await site.api.moveCard('A-999999-1', 'doing')).status, 404);
    assert.equal((await site.api.editCard('A-260505-3', { due: '2026-02-30' })).status, 400);
    assert.equal((await site.api.editCard('A-260505-3', { due: 'next Friday' })).status, 400);
    assert.equal((await site.api.editCard('A-260505-3', { note: 'x'.repeat(2001) })).status, 400);
    assert.equal(site.file(LEDGER), before);
  });

  test('the Meetings page shows the "Closed <date>" chip for an item closed in the ledger, and nothing else changes', async () => {
    const before = await site.api.tracked();
    assert.equal((await site.api.moveCard('A-260505-3', 'done')).status, 200);
    const after = await site.api.tracked();
    const row = after.find((r) => r.id === 'A-260505-3');
    assert.equal(row.closed, AS_OF);
    for (const r of after.filter((x) => x.id !== 'A-260505-3' && x.id !== 'A-260728-2')) assert.equal(r.closed, null, r.id ?? r.text);
    assert.deepEqual(row.chip, { rule: 'closed', tone: 'neutral', text: 'Closed Sep 22' });
    // Only the closed item's chip changes with it.
    const strip = (rows) => rows.map(({ closed, chip, ...rest }) => (rest.id === 'A-260505-3' ? rest : { ...rest, chip }));
    assert.deepEqual(strip(after), strip(before), 'the rows are otherwise as they were');

    const page = await openPage(site, '#/meetings');
    const shown = page.rows('tracked-body').find((r) => r.includes('>A-260505-3<'));
    assert.match(shown, /<span class="chip chip-neutral">Closed Sep 22<\/span>/);
    assert.doesNotMatch(page.rows('tracked-body').find((r) => r.includes('>A-260505-4<')), /Closed/);
  });
});

describe('a ledger written earlier: closes, entries for IDs in no summary, and fields the app doesn\'t know', () => {
  let site;
  before(async () => {
    site = await startSite({
      prepare: writeLedger({
        version: 1,
        kept: 'a field the app does not know',
        items: {
          // Closed before Sep 22; the Sep 22 summary still reports it Open.
          'A-260505-1': { column: 'done', closed: '2026-08-01', color: 'blue' },
          // Closed on Sep 22, the day the summary reports it Done: no tag.
          'A-260728-1': { column: 'done', closed: '2026-09-22' },
          'A-250101-1': { column: 'doing', note: 'From a summary I deleted', extra: 1 },
        },
      }),
    });
  });
  after(async () => { await site?.stop(); });

  test('an item in Done that a summary dated after the close reports as Open shows "Still mentioned <date>"', async () => {
    const card = await site.api.card('A-260505-1');
    assert.equal(card.column, 'done');
    assert.equal(card.stillMentioned, '2026-09-22');
    assert.equal(card.reported, null);
    assert.match((await openPage(site, '#/board')).cardHtml('A-260505-1'), /<span class="chip chip-late">Still mentioned Sep 22<\/span>/);
  });

  test('no tag when the ledger and the summaries agree', async () => {
    const card = await site.api.card('A-260728-1');
    assert.equal(card.column, 'done');
    assert.equal(card.reported, null);
    assert.equal(card.stillMentioned, null);
    assert.doesNotMatch((await openPage(site, '#/board')).cardHtml('A-260728-1'), /Reported|Still mentioned/);
  });

  test('an entry whose ID is in no summary is kept and listed under "Not found in any summary"', async () => {
    const view = await site.api.board();
    assert.equal(view.cards.find((c) => c.id === 'A-250101-1'), undefined, 'not a card');
    assert.deepEqual(view.notOnBoard.map((e) => [e.id, e.reason]), [['A-250101-1', 'in no summary']]);
    assert.equal(view.notOnBoard[0].note, 'From a summary I deleted');
    const page = await openPage(site, '#/board');
    assert.match(page.html(), /Not found in any summary[^]*A-250101-1/);

    assert.equal((await site.api.moveCard('A-260505-2', 'doing')).status, 200);
    assert.deepEqual(site.api.ledger().items['A-250101-1'], { column: 'doing', note: 'From a summary I deleted', extra: 1 }, 'never removed');
  });

  test('fields the app doesn\'t know are kept, and nothing but the ledger is left in actions/', async () => {
    assert.equal((await site.api.moveCard('A-260505-1', 'todo')).status, 200);
    const ledger = site.api.ledger();
    assert.equal(ledger.kept, 'a field the app does not know');
    assert.deepEqual(ledger.items['A-260505-1'], { column: 'todo', color: 'blue' });
    assert.deepEqual(fs.readdirSync(path.join(site.root, 'actions')), ['ledger.json'], 'no temporary file left behind');
  });
});

describe('a workspace with board/board.json from an earlier version', () => {
  const OLD_BOARD = `${JSON.stringify({
    version: 1,
    cards: [{ id: 'old-1', column: 'done', source: 'import', key: '2026-05-05_kevin-sam_1on1.md#1', title: 'Bring the duplicates to Dana', owner: 'Kevin Collins' }],
    deletedImports: ['2026-05-05_kevin-sam_1on1.md#2'],
  }, null, 2)}\n`;
  let site;
  before(async () => {
    site = await startSite({
      prepare(root) {
        fs.mkdirSync(path.join(root, 'board'));
        fs.writeFileSync(path.join(root, 'board', 'board.json'), OLD_BOARD);
      },
    });
  });
  after(async () => { await site?.stop(); });

  test('the Board says in one line that it is from an earlier version and not used, and never changes it', async () => {
    const view = await site.api.board();
    assert.equal(view.oldBoardFile, 'board/board.json');
    // It is not read: its Done card and its deleted card are To do items like any other.
    assert.equal(view.cards.find((c) => c.id === 'A-260505-1').column, 'todo');
    assert.ok(view.cards.find((c) => c.id === 'A-260505-2'));
    const page = await openPage(site, '#/board');
    assert.equal((page.html().match(/board\/board\.json/g) || []).length, 1, 'named once');
    assert.match(page.html(), /board\/board\.json<\/code> is from an earlier version[^<]*and is not used/);

    assert.equal((await site.api.moveCard('A-260505-1', 'doing')).status, 200);
    assert.equal(site.file('board/board.json'), OLD_BOARD);
    assert.ok(site.exists(LEDGER));
  });
});

describe('rows without a usable ID', () => {
  const header = (title, date) => `# ${title} | ${date}\n\n**Date:** ${date} | **Duration:** 1m\n**Attendees:** Kevin Collins (SRE Manager), Sam Torres (SRE II)\n**Company:** Harborline Cloud | **Type:** 1:1\n\n`;
  const ACTIONS = '## Action Items\n\n| ID | Action Item | Owner | Due | Due date | Status |\n|---|---|---|---|---|---|\n';
  let site;
  before(async () => {
    site = await startSite({
      prepare(root) {
        const put = (file, text) => fs.writeFileSync(path.join(root, NOTES, file), text);
        put('2026-10-05_kevin-sam_1on1.md', header('Kevin & Sam', 'October 5, 2026') + ACTIONS + [
          '| A-261005-1 | A row with a good ID | Sam Torres | Not set |  | Open |',
          '|  | A row with no ID | Kevin Collins | Not set |  | Open |',
          '| A-2610-3 | A row whose ID has the wrong shape | Kevin Collins | Not set |  | Open |',
          '| A-261005-4 | The first row with a repeated ID | Kevin Collins | Not set |  | Open |',
          "| A-261004-5 | A row whose ID has another day's date | Kevin Collins | Not set |  | Open |",
        ].join('\n') + '\n');
        put('2026-10-05_kevin-riley_1on1.md', header('Kevin & Riley', 'October 5, 2026') + ACTIONS
          + '| A-261005-4 | The second row with the repeated ID | Riley Brooks | Not set |  | Open |\n');
        put('2026-10-01_kevin-praveen_1on1.md', header('Kevin & Praveen', 'October 1, 2026')
          + '## Action Items\n\n| # | Action Item | Owner | Due | Status |\n|---|---|---|---|---|\n| 1 | Old format, one | Praveen Iyer | Not set | Open |\n| 2 | Old format, two | Praveen Iyer | Not set | Open |\n');
        // The ID was usable when it was moved; a later summary used it again.
        writeLedger({ version: 1, items: { 'A-261005-4': { column: 'doing' }, 'A-250101-1': { column: 'todo' } } })(root);
      },
    });
  });
  after(async () => { await site?.stop(); });

  test('are not on the Board; the Board says how many and links to Meetings', async () => {
    const view = await site.api.board();
    const titles = view.cards.map((c) => c.title);
    assert.ok(titles.includes('A row with a good ID'));
    assert.ok(titles.includes("A row whose ID has another day's date"), 'a flagged but usable ID is on the Board');
    for (const t of ['A row with no ID', 'A row whose ID has the wrong shape', 'The first row with a repeated ID', 'The second row with the repeated ID', 'Old format, one', 'Old format, two']) {
      assert.ok(!titles.includes(t), `"${t}" is not on the Board`);
    }
    assert.equal(view.noUsableId, 6);
    const page = await openPage(site, '#/board');
    assert.match(page.html(), /6 action items have no usable ID[^]*?href="#\/meetings"/);
  });

  test('an entry with no card shows its real reason; a repeated ID is not listed as "Not found in any summary"', async () => {
    const view = await site.api.board();
    assert.deepEqual(view.notOnBoard.map((e) => [e.id, e.reason]).sort(), [
      ['A-250101-1', 'in no summary'],
      ['A-261005-4', 'its ID is used twice in the summaries'],
    ]);
    const page = await openPage(site, '#/board');
    const group = (id) => (page.html().match(new RegExp(`<div[^>]*id="${id}"[^>]*>([^]*?)</div>`)) || [])[1] || '';
    assert.match(group('ledger-no-summary'), /Not found in any summary[^]*A-250101-1[^]*in no summary/);
    assert.doesNotMatch(group('ledger-no-summary'), /A-261005-4/);
    assert.match(group('ledger-duplicate'), /A-261005-4[^]*its ID is used twice in the summaries/);
    assert.doesNotMatch(group('ledger-duplicate'), /A-250101-1/);
  });
});

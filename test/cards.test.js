// Board cards (step 5): one chip per card, decided by the core; an action item's card opens in place to change
// its due date and note; Close and Reopen put a card at the top of its new column. The Meetings page shows the
// same chip on a tracked row as on its Board card.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { openPage } from './helpers/page.js';
import { LEDGER, startSite } from './helpers/site.js';

// In the sample, "today" is the newest meeting's date. The fixtures below add no later meeting.
const AS_OF = '2026-09-22';

const header = (title, date) => `# ${title} | ${date}\n\n**Date:** ${date} | **Duration:** 1m\n**Attendees:** Kevin Collins (SRE Manager), Sam Torres (SRE II)\n**Company:** Harborline Cloud | **Type:** 1:1\n\n---\n\n`;
const ACTIONS = '## Action Items\n\n| ID | Action Item | Owner | Due | Due date | Status |\n|---|---|---|---|---|---|\n';
const EARLIER = '\n## Open Items from Earlier Meetings\n\n| ID | From | Item | Owner | Age | Status now |\n|---|---|---|---|---|---|\n';
const row = (id, text, due = 'Not set', dueDate = '', status = 'Open') => `| ${id} | ${text} | Kevin Collins | ${due} | ${dueDate} | ${status} |`;
const later = (id, status) => `| ${id} | Aug 22, 2026 | Mentioned again | Kevin Collins | 31 days | ${status} |`;

function writeFixtures(root) {
  const put = (file, text) => fs.writeFileSync(path.join(root, 'meeting-notes', file), text);
  put('2026-08-22_chips-old_1on1.md', header('Chips: old', 'August 22, 2026') + ACTIONS + [
    row('A-260822-1', 'Still mentioned after I closed it'),
    row('A-260822-2', 'Reported done while past due', 'Sep 1', '2026-09-01'),
    row('A-260822-3', 'Open a long time with no due date'),
    row('A-260822-4', 'Reported dropped'),
    row('A-260822-5', 'Closed while past due', 'Sep 1', '2026-09-01'),
    row('A-260822-6', 'Still mentioned, closed and past due', 'Sep 1', '2026-09-01'),
    row('A-260822-7', 'A suggestion reported done *(suggested)*', 'Next 1:1', '', 'Suggested'),
  ].join('\n') + '\n');
  // First seen exactly 30 days before the as-of date: not "more than 30".
  put('2026-08-23_chips-recent_1on1.md', header('Chips: recent', 'August 23, 2026') + ACTIONS
    + row('A-260823-1', 'Thirty days old with no due date') + '\n');
  put('2026-09-22_chips_1on1.md', header('Chips: today', 'September 22, 2026') + ACTIONS + [
    row('A-260922c-1', 'Past due a week', 'Sep 15', '2026-09-15'),
    row('A-260922c-2', 'Past due a day', 'Sep 21', '2026-09-21'),
    row('A-260922c-3', 'Due today', 'Today', '2026-09-22'),
    row('A-260922c-4', 'Due in a week', 'Next Tuesday', '2026-09-29'),
    row('A-260922c-5', 'Due in eight days', 'End of September', '2026-09-30'),
    row('A-260922c-6', 'No due date'),
    row('A-260922c-7', 'My date wins over the summary', 'End of September', '2026-09-30'),
    row('A-260922c-8', 'A suggestion *(suggested)*', 'Next 1:1', '', 'Suggested'),
    row('A-260922c-9', 'Closed today', 'Next week', '2026-09-29'),
    row('A-260922c-10', 'Due next year', 'January 5', '2027-01-05'),
  ].join('\n') + '\n' + EARLIER + [
    later('A-260822-1', 'Open. Still on it.'),
    later('A-260822-2', 'Done. Finished.'),
    later('A-260822-4', 'Dropped. Not needed.'),
    later('A-260822-6', 'Open. Still going.'),
    later('A-260822-7', 'Done. Did it anyway.'),
  ].join('\n') + '\n');
  fs.mkdirSync(path.join(root, 'actions'), { recursive: true });
  fs.writeFileSync(path.join(root, LEDGER), JSON.stringify({
    version: 1,
    items: {
      'A-260822-1': { column: 'done', closed: '2026-09-01' },
      'A-260822-5': { column: 'done', closed: '2026-09-10' },
      'A-260822-6': { column: 'done', closed: '2026-09-01' },
      'A-260922c-7': { due: '2026-09-20' },
      'A-260922c-9': { column: 'done', closed: '2026-09-22' },
      'C-0000000a': { title: 'My card, open a long time', created: '2026-08-01T09:00:00.000Z', column: 'todo' },
      'C-0000000b': { title: 'My card, due soon', created: '2026-09-20T09:00:00.000Z', due: '2026-09-25', column: 'doing' },
      'C-0000000c': { title: 'My card, closed', created: '2026-09-20T09:00:00.000Z', due: '2026-09-01', column: 'done', closed: '2026-09-21' },
      'C-0000000d': { title: 'My card, no due date', created: '2026-09-20T09:00:00.000Z', column: 'todo' },
    },
  }, null, 2));
}

const LATE = 'late';
const SOON = 'soon';
const NEUTRAL = 'neutral';

describe('the chip: the core decides one per card, the first rule that matches wins', () => {
  let site;
  let view;
  before(async () => {
    site = await startSite({ prepare: writeFixtures });
    view = await site.api.board();
  });
  after(async () => { await site?.stop(); });

  const chip = (id) => {
    const card = view.cards.find((c) => c.id === id);
    assert.ok(card, `${id} is on the Board`);
    return card.chip;
  };
  const expect = (id, rule, tone, text) => assert.deepEqual(chip(id), { rule, tone, text }, id);

  test('every card has exactly one chip', () => {
    assert.equal(view.asOf, AS_OF);
    for (const c of view.cards) {
      assert.ok(c.chip && typeof c.chip.text === 'string' && c.chip.text, `${c.id} has a chip`);
      assert.ok([LATE, SOON, NEUTRAL].includes(c.chip.tone), `${c.id}: tone ${c.chip.tone}`);
    }
  });

  test('a. in Done, a later summary still reports it open: "Still mentioned <date>", late colours', () => {
    expect('A-260822-1', 'still-mentioned', LATE, 'Still mentioned Sep 22');
  });

  test('b. a summary reports it done or dropped: "Reported done <date>" or "Reported dropped <date>", soon colours', () => {
    expect('A-260822-2', 'reported', SOON, 'Reported done Sep 22');
    expect('A-260822-4', 'reported', SOON, 'Reported dropped Sep 22');
  });

  test('c. in Done: "Closed <date>", neutral; my own cards too', () => {
    expect('A-260922c-9', 'closed', NEUTRAL, 'Closed Sep 22');
    expect('C-0000000c', 'closed', NEUTRAL, 'Closed Sep 21');
  });

  test('d. the due date is before the as-of date: "Past due N days", late colours', () => {
    expect('A-260922c-1', 'past-due', LATE, 'Past due 7 days');
    expect('A-260922c-2', 'past-due', LATE, 'Past due 1 day');
  });

  test('e. due within the next 7 days: "Due today" or "Due in N days", soon colours; my own cards too', () => {
    expect('A-260922c-3', 'due-soon', SOON, 'Due today');
    expect('A-260922c-4', 'due-soon', SOON, 'Due in 7 days');
    expect('C-0000000b', 'due-soon', SOON, 'Due in 3 days');
  });

  test('f. no due date and first seen more than 30 days ago: "Open N days", neutral; my own cards count from when they were created', () => {
    expect('A-260822-3', 'open-long', NEUTRAL, 'Open 31 days');
    expect('C-0000000a', 'open-long', NEUTRAL, 'Open 52 days');
  });

  test('g. otherwise: "Due <date>" or "No due date", neutral', () => {
    expect('A-260922c-5', 'due', NEUTRAL, 'Due Sep 30');
    expect('A-260922c-10', 'due', NEUTRAL, 'Due Jan 5, 2027');
    expect('A-260922c-6', 'due', NEUTRAL, 'No due date');
    expect('A-260823-1', 'due', NEUTRAL, 'No due date');
    expect('C-0000000d', 'due', NEUTRAL, 'No due date');
  });

  test('the due date is mine if I set one, otherwise the summary\'s', () => {
    // The summary says Sep 30 (rule g); my date, Sep 20, is past due.
    expect('A-260922c-7', 'past-due', LATE, 'Past due 2 days');
  });

  test('a suggestion I have not accepted shows "Suggested", whatever else is true of it', () => {
    expect('A-260922c-8', 'suggested', NEUTRAL, 'Suggested');
    expect('A-260822-7', 'suggested', NEUTRAL, 'Suggested');
  });

  test('the first rule that matches wins', () => {
    // a over c and d: in Done, still mentioned, and its due date has passed.
    expect('A-260822-6', 'still-mentioned', LATE, 'Still mentioned Sep 22');
    // c over d: in Done with a due date that has passed.
    expect('A-260822-5', 'closed', NEUTRAL, 'Closed Sep 10');
    // b over d: reported done, and its due date has passed.
    expect('A-260822-2', 'reported', SOON, 'Reported done Sep 22');
    // A closed own card with a past due date is c, not d.
    expect('C-0000000c', 'closed', NEUTRAL, 'Closed Sep 21');
  });

  test('once a suggestion is accepted, the rules apply to it as to any item', async () => {
    const res = await site.api.acceptCard('A-260822-7');
    assert.equal(res.status, 200, res.text.slice(0, 200));
    assert.deepEqual(res.json.card.chip, { rule: 'reported', tone: SOON, text: 'Reported done Sep 22' });
  });

  test('the Board draws the core\'s chip, one per card, with its colours, and the ID in full', async () => {
    const page = await openPage(site, '#/board');
    await page.choose('show-suggested', true);
    const fresh = await site.api.board();
    for (const c of fresh.cards) {
      const html = page.cardHtml(c.id);
      assert.ok(html, `${c.id} is drawn`);
      const chips = [...html.matchAll(/<span class="chip chip-(\w+)"[^>]*>([^<]*)<\/span>/g)];
      assert.equal(chips.length, 1, `${c.id} has one chip`);
      assert.equal(chips[0][1], c.chip.tone, c.id);
      assert.equal(chips[0][2].replace(/&#39;/g, "'"), c.chip.text, c.id);
      if (!c.own) assert.match(html, new RegExp(`<span class="card-id">${c.id}</span>`), `${c.id}: the ID`);
    }
  });

  test('the Meetings page shows the same chip on a tracked row as on its Board card, and no "Closed" tag', async () => {
    const board = await site.api.board();
    const tracked = await site.api.tracked();
    for (const r of tracked) {
      const card = r.id && board.cards.find((c) => c.id === r.id && !c.own);
      if (card) assert.deepEqual(r.chip, card.chip, r.id);
      else assert.equal(r.chip, null, `${r.id ?? r.text.slice(0, 40)}: not on the Board, no chip`);
    }
    const page = await openPage(site, '#/meetings');
    await page.choose('hide-suggested', false);
    const shown = page.rows('tracked-body').find((x) => x.includes('>A-260922c-9<'));
    assert.match(shown, /<span class="chip chip-neutral"[^>]*>Closed Sep 22<\/span>/);
    assert.doesNotMatch(page.html(), /tag-closed/);
    assert.match(page.rows('tracked-body').find((x) => x.includes('>A-260822-1<')), /<span class="chip chip-late"[^>]*>Still mentioned Sep 22<\/span>/);
  });
});

describe('an action item\'s card opens in place', () => {
  let site;
  let page;
  let dialogOpened;
  before(async () => {
    site = await startSite();
    page = await openPage(site, '#/board');
    dialogOpened = 0;
    page.el('card-dialog').showModal = () => { dialogOpened++; };
  });
  after(async () => { await site?.stop(); });

  const editors = () => (page.el('board').innerHTML.match(/id="card-edit-due"/g) || []).length;

  test('Edit opens the card in place with the due date, the words said in the meeting and the note; no dialog', async () => {
    const id = 'A-260908-5';
    assert.doesNotMatch(page.cardHtml(id), /card-edit-due/, 'closed to begin with');
    await page.clickCard(id, 'edit');
    assert.equal(dialogOpened, 0, 'no dialog for an action item');
    const html = page.cardHtml(id);
    assert.match(html, /<label for="card-edit-due"[^>]*>Due date<\/label>/);
    assert.match(html, /<input[^>]*type="date"[^>]*id="card-edit-due"|<input[^>]*id="card-edit-due"[^>]*type="date"/);
    assert.match(html, /Said in the meeting: “Week of Sep 14”/);
    assert.match(html, /<label for="card-edit-note"[^>]*>Note<\/label>/);
    assert.match(html, /data-act="save"/);
    assert.doesNotMatch(html, /data-act="use-summary"/, 'no "Use the summary\'s date" until I have changed it');
    assert.equal(page.el('card-edit-due').value, '2026-09-18', 'the date shown is the summary\'s');
    assert.equal(editors(), 1);
  });

  test('Save stores my due date and note in the ledger and closes the card', async () => {
    const id = 'A-260908-5';
    page.el('card-edit-due').value = '2026-09-25';
    page.el('card-edit-note').value = 'Praveen asked to swap weeks.';
    await page.clickCard(id, 'save');
    assert.deepEqual(site.api.ledger().items[id], { due: '2026-09-25', note: 'Praveen asked to swap weeks.' });
    assert.equal(editors(), 0, 'closed after saving');
    assert.equal(dialogOpened, 0);
    assert.match(page.cardHtml(id), /Praveen asked to swap weeks\./);
  });

  test('Save with only the note changed leaves the due date alone', async () => {
    const id = 'A-260728-5';
    await page.clickCard(id, 'edit');
    assert.equal(page.el('card-edit-due').value, '', 'no due date in the summary');
    page.el('card-edit-note').value = 'Backfill req is with HR.';
    await page.clickCard(id, 'save');
    assert.deepEqual(site.api.ledger().items[id], { note: 'Backfill req is with HR.' });
  });

  test('"Use the summary\'s date" shows once I have changed the date, and goes back to it', async () => {
    const id = 'A-260908-5';
    await page.clickCard(id, 'edit');
    assert.equal(page.el('card-edit-due').value, '2026-09-25', 'my date is shown');
    assert.match(page.cardHtml(id), /<button[^>]*data-act="use-summary"[^>]*>Use the summary’s date<\/button>/);
    assert.match(page.cardHtml(id), /Said in the meeting: “Week of Sep 14”/);
    await page.clickCard(id, 'use-summary');
    assert.equal(page.el('card-edit-due').value, '2026-09-18', 'the summary\'s date is back in the field');
    await page.clickCard(id, 'save');
    const entry = site.api.ledger().items[id];
    assert.equal('due' in entry, false, 'my change is cleared');
    assert.equal(entry.note, 'Praveen asked to swap weeks.', 'the note is kept');
    assert.equal((await site.api.card(id)).dueDate, '2026-09-18');
  });

  test('one card open at a time', async () => {
    await page.clickCard('A-260505-1', 'edit');
    assert.match(page.cardHtml('A-260505-1'), /card-edit-due/);
    await page.clickCard('A-260505-3', 'edit');
    assert.match(page.cardHtml('A-260505-3'), /card-edit-due/);
    assert.doesNotMatch(page.cardHtml('A-260505-1'), /card-edit-due/);
    assert.equal(editors(), 1);
    // Edit again on the open card closes it.
    await page.clickCard('A-260505-3', 'edit');
    assert.equal(editors(), 0);
  });

  test('my own cards keep their dialog', async () => {
    const add = await site.api.addCard({ title: 'Book Q4 skip-levels' });
    assert.equal(add.status, 200);
    const own = add.json.card.id;
    const fresh = await openPage(site, '#/board');
    let opened = 0;
    fresh.el('card-dialog').showModal = () => { opened++; };
    // The stand-in document has no form fields of its own; the dialog's form gets plain ones.
    const field = () => ({ value: '', innerHTML: '', focus() {} });
    Object.assign(fresh.el('card-form'), { title: field(), owner: field(), meeting: field(), column: field(), due: field(), note: field() });
    await fresh.clickCard(own, 'edit');
    assert.equal(opened, 1, 'the dialog opens');
    assert.doesNotMatch(fresh.el('board').innerHTML, /card-edit-due/, 'and nothing opens in place');
  });
});

describe('Close and Reopen put the card at the top', () => {
  let site;
  before(async () => { site = await startSite(); });
  after(async () => { await site?.stop(); });

  const column = (view, id) => view.cards.filter((c) => c.column === id).map((c) => c.id);

  test('Close puts a card at the top of Done; Reopen puts it at the top of To do', async () => {
    // Done and To do already hold cards, so "top" and "end" differ.
    assert.equal((await site.api.moveCard('A-260505-2', 'done')).status, 200);
    assert.equal((await site.api.moveCard('A-260728-2', 'done')).status, 200);
    const page = await openPage(site, '#/board');
    const id = 'A-260908-5';

    await page.clickCard(id, 'close');
    let view = await site.api.board();
    assert.deepEqual(column(view, 'done'), [id, 'A-260505-2', 'A-260728-2']);
    assert.equal(site.api.ledger().items[id].closed, AS_OF);
    assert.match(page.cardHtml(id), /data-act="reopen"/);

    await page.clickCard(id, 'reopen');
    view = await site.api.board();
    assert.equal(column(view, 'todo')[0], id);
    assert.deepEqual(column(view, 'done'), ['A-260505-2', 'A-260728-2']);
    assert.deepEqual(site.api.ledger().items[id], { column: 'todo' });
  });

  test('the top is the top of the whole column, also when the Owner filter hides cards', async () => {
    const page = await openPage(site, '#/board');
    await page.choose('board-owner', 'Riley Brooks');
    const id = 'A-260908-5';
    await page.clickCard(id, 'close');
    const view = await site.api.board();
    assert.equal(column(view, 'done')[0], id, 'above the cards of other owners');
  });
});

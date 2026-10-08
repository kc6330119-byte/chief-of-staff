// The Today page (step 6): the core works out which items count, the groups and their order, the people rows and
// their flags, and the counts; the page only draws them. Keep open and Keep closed record in the ledger that a
// report has been seen, and its chip goes away everywhere until a later summary reports it again.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { openPage } from './helpers/page.js';
import { LEDGER, privateNoteTexts, startSite } from './helpers/site.js';

// The fixture's newest meeting is Sep 22, 2026, a Tuesday: in the sample, "today".
const AS_OF = '2026-09-22';
const PRIVATE = 'Praveen mentioned a family matter; keep it out of everything.';

const header = (title, date, attendees) => `# ${title} | ${date}\n\n**Date:** ${date} | **Duration:** 1m\n**Attendees:** ${attendees}\n**Company:** Harborline Cloud | **Type:** 1:1\n\n---\n\n`;
const ACTIONS = '## Action Items\n\n| ID | Action Item | Owner | Due | Due date | Status |\n|---|---|---|---|---|---|\n';
const EARLIER = '\n## Open Items from Earlier Meetings\n\n| ID | From | Item | Owner | Age | Status now |\n|---|---|---|---|---|---|\n';
const rows = (list) => list.map((r) => `| ${r.join(' | ')} |`).join('\n') + '\n';

const PEOPLE = [
  '| Kevin Collins | SRE Manager | me | Kevin |',
  "| Dana Whitfield | Kevin's manager | manager | Dana |",
  '| Sam Torres | SRE II | report | Sam |',
  '| Riley Brooks | SRE I | report | Riley |',
  '| Praveen Iyer | Senior SRE | report | Praveen |',
  '| Alex Kim | SRE I | report | Alex |',
];
const writePeople = (root, list) => fs.writeFileSync(path.join(root, 'people.md'), `# People\n\n| Name | Role | Relationship | Also called |\n|---|---|---|---|\n${list.join('\n')}\n`);

const M_PRAVEEN = '2026-07-01_kevin-praveen_1on1.md';
const M_SAM = '2026-08-23_kevin-sam_1on1.md';
const M_RILEY = '2026-09-15_kevin-riley_1on1.md';
const M_DANA = '2026-09-22_dana-kevin_1on1.md';

// A workspace of its own: the sample's summaries are replaced by four, so every group can be checked exactly.
function writeFixture(root) {
  const notes = path.join(root, 'meeting-notes');
  for (const f of fs.readdirSync(notes)) fs.rmSync(path.join(notes, f));
  const put = (file, text) => fs.writeFileSync(path.join(notes, file), text);
  writePeople(root, PEOPLE);
  put(M_PRAVEEN, header('Kevin & Praveen: 1:1', 'July 1, 2026', 'Kevin Collins (SRE Manager), Praveen Iyer (Senior SRE)') + ACTIONS + rows([
    ['A-260701-1', 'Praveen: an old item with no due date', 'Praveen Iyer', 'Not set', '', 'Agreed'],
    ['A-260701-2', 'Kevin: an old item with no due date', 'Kevin Collins', 'Not set', '', 'Open'],
    ['A-260701-3', 'Kevin: long past due', 'Kevin', 'July 10', '2026-07-10', 'Open'],
    ['A-260701-4', 'Kevin: reported done later', 'Kevin Collins', 'Not set', '', 'Open'],
    ['A-260701-5', 'Kevin: closed, still mentioned, to keep closed', 'Kevin Collins', 'Not set', '', 'Open'],
    ['A-260701-6', 'Kevin: a suggestion *(suggested)*', 'Kevin Collins', 'Next 1:1', '', 'Suggested'],
    ['A-260701-7', 'Kevin: closed, still mentioned, to reopen', 'Kevin Collins', 'Not set', '', 'Open'],
  ]) + `\n## Notes\n\n- **Manager-only note:** ${PRIVATE}\n`);
  put(M_SAM, header('Kevin & Sam: 1:1', 'August 23, 2026', 'Kevin Collins (SRE Manager), Sam Torres (SRE II)') + ACTIONS + rows([
    ['A-260823-1', 'Sam: thirty days old, no due date', 'Sam Torres', 'Not set', '', 'Agreed'],
    ['A-260823-2', 'Kevin: past due a day', 'Kevin Collins', 'Sep 21', '2026-09-21', 'Open'],
    ['A-260823-3', 'Kevin: due in three days', 'Kevin Collins', 'Friday', '2026-09-25', 'Open'],
    ['A-260823-4', 'Kevin: due next month', 'Kevin Collins', 'End of October', '2026-10-30', 'Open'],
    ['A-260823-5', 'Sam: reported dropped later', 'Sam Torres', 'Not set', '', 'Agreed'],
    ['A-260823-6', 'Sam: due in eight days', 'Sam Torres', 'End of September', '2026-09-30', 'Agreed'],
    ['A-260823-7', 'Sam: due in six days', 'Sam Torres', 'Monday', '2026-09-28', 'Agreed'],
  ]));
  put(M_RILEY, header('Kevin & Riley: 1:1', 'September 15, 2026', 'Kevin Collins (SRE Manager), Riley Brooks (SRE I)') + ACTIONS + rows([
    ['A-260915-1', 'Riley: past due two days', 'Riley Brooks', 'Sep 20', '2026-09-20', 'Agreed'],
    ['A-260915-2', 'Riley: due today', 'Riley', 'Today', '2026-09-22', 'Agreed'],
    ['A-260915-3', 'Riley: due in a week', 'Riley Brooks', 'Next Tuesday', '2026-09-29', 'Agreed'],
    ['A-260915-4', 'Kevin: due tomorrow', 'Kevin Collins', 'Wednesday', '2026-09-23', 'Open'],
  ]) + EARLIER + rows([
    ['A-260701-4', 'Jul 1, 2026', 'Kevin: reported done later', 'Kevin Collins', '11 weeks', 'Done. Finished on **Sep 12**, approved by Dana.'],
  ]));
  put(M_DANA, header('Dana & Kevin: 1:1 with Manager', 'September 22, 2026', "Dana Whitfield (Kevin's manager), Kevin Collins (SRE Manager)") + ACTIONS + rows([
    ['A-260922-1', 'Dana: due in two days', 'Dana Whitfield', 'Thursday', '2026-09-24', 'Agreed'],
    ['A-260922-2', 'Kevin: due today, with words', 'Kevin Collins', 'This week', '2026-09-22', 'Open'],
  ]) + EARLIER + rows([
    ['A-260701-5', 'Jul 1, 2026', 'Kevin: closed, still mentioned, to keep closed', 'Kevin Collins', '12 weeks', 'Open. Still on it.'],
    ['A-260701-7', 'Jul 1, 2026', 'Kevin: closed, still mentioned, to reopen', 'Kevin Collins', '12 weeks', 'Open. Not finished after all.'],
    ['A-260823-5', 'Aug 23, 2026', 'Sam: reported dropped later', 'Sam Torres', '4 weeks', 'Dropped. No longer needed.'],
  ]));
  fs.mkdirSync(path.join(root, 'actions'), { recursive: true });
  fs.writeFileSync(path.join(root, LEDGER), JSON.stringify({
    version: 1,
    items: {
      'A-260701-5': { column: 'done', closed: '2026-09-10' },
      'A-260701-7': { column: 'done', closed: '2026-09-10' },
      'C-00000001': { title: 'My card: past due, no owner', created: '2026-09-01T09:00:00.000Z', due: '2026-09-20', column: 'todo' },
      'C-00000002': { title: "My card: Sam's, due tomorrow", owner: 'Sam', meeting: M_SAM, meetingDate: '2026-08-23', created: '2026-09-01T09:00:00.000Z', due: '2026-09-23', column: 'doing' },
      'C-00000003': { title: 'My card: closed', created: '2026-09-01T09:00:00.000Z', due: '2026-09-01', column: 'done', closed: '2026-09-05' },
    },
  }, null, 2));
}

const I_OWE = ['A-260701-3', 'C-00000001', 'A-260823-2', 'A-260922-2', 'A-260915-4', 'A-260823-3', 'A-260701-2'];
const OWED = ['A-260915-1', 'A-260915-2', 'C-00000002', 'A-260922-1', 'A-260823-7', 'A-260915-3', 'A-260701-1'];
const CONFIRM = ['A-260701-4', 'A-260701-5', 'A-260701-7', 'A-260823-5'];

const group = (view, key) => view.groups.find((g) => g.key === key);
const ids = (view, key) => group(view, key)?.items.map((i) => i.id);
const item = (view, id) => view.groups.flatMap((g) => g.items).find((i) => i.id === id);

// ---------- the page: rows, buttons and clicks in the stand-in document ----------
const sectionHtml = (page, key) => page.el('today-body').innerHTML.split(/<section\b/).find((s) => s.includes(`id="group-${key}"`));
const rowIds = (page, key) => [...(sectionHtml(page, key) || '').matchAll(/<li class="today-row[^"]*" data-id="([^"]+)"/g)].map((m) => m[1]);
const rowHtml = (page, id) => page.el('today-body').innerHTML.split(/<li class="today-row/).slice(1).find((r) => r.includes(`data-id="${id}"`));
const buttons = (html) => [...html.matchAll(/<button\b[^>]*data-act="([\w-]+)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2].trim()]);
async function click(page, id, act) {
  const html = rowHtml(page, id);
  if (!html) throw new Error(`row ${id} is not drawn`);
  if (!new RegExp(`data-act="${act}"`).test(html)) throw new Error(`row ${id} has no ${act} button`);
  const row = { dataset: { id } };
  const button = { dataset: { act }, disabled: false, closest: (sel) => (sel.startsWith('button') ? button : sel === '.today-row' ? row : null) };
  await page.el('today-body').fire('click', { target: button });
}
const waitFor = async (f, what) => {
  for (let i = 0; i < 100; i++) { if (f()) return; await new Promise((r) => setTimeout(r, 20)); }
  throw new Error(`timed out waiting for ${what}`);
};

describe('which items count, and the groups in order', () => {
  let site;
  let view;
  before(async () => {
    site = await startSite({ prepare: writeFixture });
    view = await site.api.today();
  });
  after(async () => { await site?.stop(); });

  test('the groups, in order: I owe, Owed to me, Needs your confirmation; the as-of date is the newest meeting\'s', () => {
    assert.equal(view.status, 'ok');
    assert.equal(view.asOf, AS_OF);
    assert.equal(view.asOfIsNewestMeeting, true);
    assert.equal(view.me, 'Kevin Collins');
    assert.equal(view.meProblem, null);
    assert.deepEqual(view.groups.map((g) => g.key), ['i-owe', 'owed-to-me', 'confirm']);
  });

  test('I owe: my items whose chip is Past due, Due today, Due in N days or Open N days; most overdue, then soonest, then oldest', () => {
    assert.deepEqual(ids(view, 'i-owe'), I_OWE);
    assert.deepEqual(group(view, 'i-owe').items.map((i) => i.chip.text), [
      'Past due 74 days', 'Past due 2 days', 'Past due 1 day', 'Due today', 'Due in 1 day', 'Due in 3 days', 'Open 83 days',
    ]);
    // An own card with no owner is mine; an owner written as an "Also called" name is the Name.
    assert.equal(item(view, 'C-00000001').mine, true);
    assert.equal(item(view, 'A-260701-3').owner, 'Kevin Collins');
    for (const i of group(view, 'i-owe').items) assert.equal(i.mine, true, i.id);
  });

  test('Owed to me: the same rules for every other owner', () => {
    assert.deepEqual(ids(view, 'owed-to-me'), OWED);
    assert.deepEqual(group(view, 'owed-to-me').items.map((i) => i.chip.text), [
      'Past due 2 days', 'Due today', 'Due in 1 day', 'Due in 2 days', 'Due in 6 days', 'Due in 7 days', 'Open 83 days',
    ]);
    assert.deepEqual(group(view, 'owed-to-me').items.map((i) => i.owner), [
      'Riley Brooks', 'Riley Brooks', 'Sam Torres', 'Dana Whitfield', 'Sam Torres', 'Riley Brooks', 'Praveen Iyer',
    ]);
  });

  test('left out: Due <date> more than 7 days out, "No due date" seen 30 days or less, Done, and suggestions not accepted', () => {
    const all = view.groups.flatMap((g) => g.items.map((i) => i.id));
    for (const id of ['A-260823-4', 'A-260823-6', 'A-260823-1', 'C-00000003', 'A-260701-6']) assert.ok(!all.includes(id), id);
  });

  test('Needs your confirmation: any owner, chip Reported done, Reported dropped or Still mentioned; oldest report first', () => {
    assert.deepEqual(ids(view, 'confirm'), CONFIRM);
    assert.deepEqual(group(view, 'confirm').items.map((i) => i.chip.text), [
      'Reported done Sep 15', 'Still mentioned Sep 22', 'Still mentioned Sep 22', 'Reported dropped Sep 22',
    ]);
    // What the summary said, word for word, and the meeting that said it.
    assert.deepEqual(item(view, 'A-260701-4').report, {
      date: '2026-09-15', file: M_RILEY, status: 'Done. Finished on Sep 12, approved by Dana.', statusHtml: 'Done. Finished on <strong>Sep 12</strong>, approved by Dana.',
    });
    assert.equal(item(view, 'A-260701-5').report.file, M_DANA);
    assert.equal(item(view, 'A-260701-5').report.status, 'Open. Still on it.');
    assert.equal(item(view, 'A-260823-5').owner, 'Sam Torres');
  });

  test('the counts', () => {
    assert.deepEqual(view.counts, { iOwe: 7, owedToMe: 7, open: 0, confirm: 4, total: 18 });
  });

  test('People: one row per report, in people.md order, with the last meeting, Owes you and You owe', () => {
    assert.deepEqual(view.people.reports.map((p) => p.name), ['Sam Torres', 'Riley Brooks', 'Praveen Iyer', 'Alex Kim']);
    const p = Object.fromEntries(view.people.reports.map((r) => [r.name, r]));
    assert.deepEqual(p['Sam Torres'].lastMeeting, { date: '2026-08-23', file: M_SAM });
    assert.equal(p['Sam Torres'].daysSince, 30);
    assert.equal(p['Sam Torres'].role, 'SRE II');
    // Sam's open items: A-260823-1, -5 (reported dropped, still not in Done), -6, -7 and my card C-00000002.
    assert.equal(p['Sam Torres'].owesYou, 5);
    // Mine from the Aug 23 meeting Sam attended: A-260823-2, -3, -4. My card with no meeting doesn't count.
    assert.equal(p['Sam Torres'].youOwe, 3);
    assert.equal(p['Riley Brooks'].owesYou, 3);
    assert.equal(p['Riley Brooks'].youOwe, 1);
    // Praveen: A-260701-2, -3 and -4; -5 and -7 are in Done and the suggestion -6 doesn't count.
    assert.equal(p['Praveen Iyer'].owesYou, 1);
    assert.equal(p['Praveen Iyer'].youOwe, 3);
    assert.equal(p['Alex Kim'].lastMeeting, null);
    assert.equal(p['Alex Kim'].owesYou, 0);
    assert.equal(p['Alex Kim'].youOwe, 0);
  });

  test('flags: "No 1:1 in N days" past 30 days, "No 1:1 yet", and "Busy week" at 3 or more items past due or due within 7 days', () => {
    const flags = Object.fromEntries(view.people.reports.map((r) => [r.name, r.flags.map((f) => f.text)]));
    // Sam met 30 days ago (not more than 30) and has 2 items due within 7 days; the third is 8 days out.
    assert.deepEqual(flags['Sam Torres'], []);
    assert.deepEqual(flags['Riley Brooks'], ['Busy week']);
    assert.deepEqual(flags['Praveen Iyer'], ['No 1:1 in 83 days']);
    assert.deepEqual(flags['Alex Kim'], ['No 1:1 yet']);
    assert.equal(view.people.flagCount, 3);
  });

  test('the foot: things that could not be read (as on Meetings) and agents with a review due (as on Agents)', async () => {
    const meetings = (await site.get('/api/meetings')).json;
    const agents = await site.api.agents();
    assert.equal(view.foot.couldNotRead, meetings.warnings.length);
    assert.equal(view.foot.couldNotRead, 0);
    assert.equal(view.foot.agentsReviewDue, agents.cards.filter((c) => c.reviewDue).length);
  });

  test('opening Today writes nothing', async () => {
    const before = site.file(LEDGER);
    await site.api.today();
    await openPage(site, '#/today');
    assert.equal(site.file(LEDGER), before);
  });
});

describe('the page draws what the core decided', () => {
  let site;
  let page;
  before(async () => {
    site = await startSite({ prepare: writeFixture });
    page = await openPage(site, '#/today');
  });
  after(async () => { await site?.stop(); });

  test('the header: the as-of date with its weekday, that it is the newest meeting\'s, and one sentence with the three counts', () => {
    const sub = page.el('today-sub').innerHTML;
    assert.match(sub, /Tuesday, Sep 22, 2026/);
    assert.match(sub, /newest meeting/);
    assert.match(sub, /Seven for you, seven owed to you, four to confirm\./);
    assert.match(page.html(), /<button[^>]*id="today-reload"[^>]*>Reload<\/button>/);
  });

  test('the groups in order, each row in the core\'s order', () => {
    const body = page.el('today-body').innerHTML;
    const order = ['I owe', 'Owed to me', 'Needs your confirmation', 'People'].map((h) => body.indexOf(`>${h}</h2>`));
    assert.ok(order.every((i) => i >= 0), JSON.stringify(order));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.deepEqual(rowIds(page, 'i-owe'), I_OWE);
    assert.deepEqual(rowIds(page, 'owed-to-me'), OWED);
    assert.deepEqual(rowIds(page, 'confirm'), CONFIRM);
  });

  test('an I owe row: the chip, the title, the ID, the due line, the first meeting; Re-date and Close', () => {
    const row = rowHtml(page, 'A-260922-2');
    assert.match(row, /<span class="chip chip-soon">Due today<\/span>/);
    assert.match(row, />Kevin: due today, with words</);
    assert.match(row, />A-260922-2</);
    assert.match(row, /Due Tue, Sep 22, said “This week”/);
    assert.match(row, new RegExp(`From <a href="#/meetings/${encodeURIComponent(M_DANA)}"[^>]*>Dana &amp; Kevin: 1:1 with Manager, Sep 22</a>`));
    assert.deepEqual(buttons(row), [['redate', 'Re-date'], ['close', 'Close']]);
  });

  test('"Set a date" when there is none; the words "Not set" are not repeated', () => {
    const row = rowHtml(page, 'A-260701-2');
    assert.deepEqual(buttons(row), [['redate', 'Set a date'], ['close', 'Close']]);
    assert.match(row, /No due date/);
    assert.doesNotMatch(row, /Not set|[Ss]aid/);
  });

  test('an Owed to me row also shows the owner; its one action is Close', () => {
    const row = rowHtml(page, 'A-260915-1');
    assert.match(row, /Riley Brooks/);
    assert.match(row, /<span class="chip chip-late">Past due 2 days<\/span>/);
    assert.deepEqual(buttons(row), [['close', 'Close']]);
  });

  test('a confirmation row shows what the summary said, word for word, with a link to that meeting', () => {
    const reported = rowHtml(page, 'A-260701-4');
    assert.match(reported, /Sep 15 summary: Done\. Finished on <strong>Sep 12<\/strong>, approved by Dana\./);
    assert.match(reported, new RegExp(`<a href="#/meetings/${encodeURIComponent(M_RILEY)}"`));
    assert.match(reported, />You</);
    assert.deepEqual(buttons(reported), [['keep', 'Keep open'], ['close', 'Close']]);
    const still = rowHtml(page, 'A-260701-5');
    assert.match(still, /Sep 22 summary: Open\. Still on it\./);
    assert.match(still, /You closed it on Sep 10/);
    assert.deepEqual(buttons(still), [['keep', 'Keep closed'], ['reopen', 'Reopen']]);
    assert.match(rowHtml(page, 'A-260823-5'), /Sam Torres/);
  });

  test('People: last meeting and days ago, Owes you and You owe, flags, and a link to the person\'s page', () => {
    const people = sectionHtml(page, 'people');
    assert.match(people, /3 flags/);
    const sam = people.split('<li class="today-person"').find((p) => p.includes('Sam Torres'));
    assert.match(sam, /Last meeting Aug 23, 30 days ago/);
    assert.match(sam, /Owes you 5 · You owe 3/);
    assert.match(sam, /href="#\/people\/Sam%20Torres"/);
    const praveen = people.split('<li class="today-person"').find((p) => p.includes('Praveen Iyer'));
    assert.match(praveen, /<span class="chip chip-late">No 1:1 in 83 days<\/span>/);
    const alex = people.split('<li class="today-person"').find((p) => p.includes('Alex Kim'));
    assert.match(alex, /No 1:1 yet/);
    assert.match(people.split('<li class="today-person"').find((p) => p.includes('Riley Brooks')), /Busy week/);
  });

  test('the foot: that nothing failed; agents with a review due, with a link to Agents', () => {
    const foot = page.el('today-body').innerHTML.split('class="today-foot"')[1];
    assert.ok(foot, 'the foot is drawn');
    assert.match(foot, /Could not read: nothing\./);
    assert.match(foot, /href="#\/agents"/);
    assert.match(foot, /review due/);
  });

  test('the sidebar\'s Today item shows the total of groups 1 to 3', () => {
    assert.equal(page.el('today-count').textContent, '18');
    assert.equal(page.el('today-count').hidden, false);
  });

  test('Reload reads everything again', async () => {
    const ledger = site.api.ledger();
    ledger.items['A-260823-2'] = { column: 'done', closed: AS_OF };
    fs.writeFileSync(path.join(site.root, LEDGER), JSON.stringify(ledger, null, 2));
    assert.ok(rowIds(page, 'i-owe').includes('A-260823-2'));
    await page.el('today-reload').fire('click');
    assert.ok(!rowIds(page, 'i-owe').includes('A-260823-2'));
    assert.match(page.el('today-sub').innerHTML, /Six for you/);
    assert.equal(page.el('today-count').textContent, '17');
  });
});

describe('the actions', () => {
  let site;
  let page;
  before(async () => {
    site = await startSite({ prepare: writeFixture });
    page = await openPage(site, '#/today');
  });
  after(async () => { await site?.stop(); });

  test('Close closes the item at the top of Done; the row updates in place and one line says what happened', async () => {
    const id = 'A-260823-2';
    await click(page, id, 'close');
    assert.deepEqual(site.api.ledger().items[id], { column: 'done', closed: AS_OF });
    assert.equal((await site.api.board()).cards.find((c) => c.column === 'done').id, id, 'at the top of Done');
    assert.deepEqual(rowIds(page, 'i-owe'), I_OWE, 'the row stays where it was');
    assert.match(rowHtml(page, id), /<span class="chip chip-neutral">Closed Sep 22<\/span>/);
    assert.deepEqual(buttons(rowHtml(page, id)), [['reopen', 'Reopen']]);
    assert.equal(page.el('today-status').textContent, 'Closed “Kevin: past due a day”.');
    assert.match(page.el('today-sub').innerHTML, /Six for you/);
    assert.equal(page.el('today-count').textContent, '17');
    assert.ok(!ids(await site.api.today(), 'i-owe').includes(id), 'the core no longer counts it');
  });

  test('Reopen on a closed row puts it back at the top of To do', async () => {
    const id = 'A-260823-2';
    await click(page, id, 'reopen');
    assert.deepEqual(site.api.ledger().items[id], { column: 'todo' });
    assert.equal((await site.api.board()).cards.find((c) => c.column === 'todo').id, id);
    assert.match(rowHtml(page, id), /Past due 1 day/);
    assert.equal(page.el('today-status').textContent, 'Reopened “Kevin: past due a day”. It is at the top of To do.');
  });

  test('Re-date opens a date field in the row with Save and Cancel; Save stores my due date', async () => {
    const id = 'A-260823-3';
    await click(page, id, 'redate');
    const row = rowHtml(page, id);
    assert.match(row, /<input[^>]*type="date"[^>]*id="today-due"/);
    assert.equal(page.el('today-due').value, '2026-09-25', 'the date that counts now');
    assert.deepEqual(buttons(row).filter(([a]) => a.endsWith('-due')), [['save-due', 'Save'], ['cancel-due', 'Cancel']]);
    page.el('today-due').value = '2026-10-15';
    await click(page, id, 'save-due');
    assert.deepEqual(site.api.ledger().items[id], { due: '2026-10-15' });
    assert.doesNotMatch(rowHtml(page, id), /id="today-due"/, 'the field closes');
    assert.match(rowHtml(page, id), /<span class="chip chip-neutral">Due Oct 15<\/span>/, 'the row updates in place');
    assert.match(rowHtml(page, id), /Due Oct 15 \(mine; summary: Sep 25, “Friday”\)/);
    assert.equal(page.el('today-status').textContent, 'New due date for “Kevin: due in three days”: Oct 15.');
    assert.ok(!ids(await site.api.today(), 'i-owe').includes(id), 'more than 7 days out: no longer counted');
  });

  test('a date back to the summary\'s clears mine', async () => {
    const id = 'A-260823-3';
    await click(page, id, 'redate');
    page.el('today-due').value = '2026-09-25';
    await click(page, id, 'save-due');
    // As on the Board: my change is removed and the entry is left empty.
    assert.deepEqual(site.api.ledger().items[id], {});
    assert.match(rowHtml(page, id), /Due in 3 days/);
  });

  test('Cancel closes the field and saves nothing', async () => {
    const id = 'A-260915-4';
    const before = site.file(LEDGER);
    await click(page, id, 'redate');
    page.el('today-due').value = '2026-12-01';
    await click(page, id, 'cancel-due');
    assert.doesNotMatch(rowHtml(page, id), /id="today-due"/);
    assert.equal(site.file(LEDGER), before);
  });

  test('Set a date: an empty date is not saved; a date is', async () => {
    const id = 'A-260701-2';
    await click(page, id, 'redate');
    assert.equal(page.el('today-due').value, '');
    const before = site.file(LEDGER);
    await click(page, id, 'save-due');
    assert.equal(site.file(LEDGER), before);
    assert.match(page.html(), /Choose a date/);
    page.el('today-due').value = '2026-09-24';
    await click(page, id, 'save-due');
    assert.deepEqual(site.api.ledger().items[id], { due: '2026-09-24' });
    assert.match(rowHtml(page, id), /Due in 2 days/);
  });

  test('an own card re-dates and closes like an action item', async () => {
    const res = await site.api.todayAct('C-00000001', 'due', { due: '2026-09-26' });
    assert.equal(res.status, 200, res.text.slice(0, 200));
    assert.equal(res.json.item.chip.text, 'Due in 4 days');
    assert.equal(site.api.ledger().items['C-00000001'].due, '2026-09-26');
    const closed = await site.api.todayAct('C-00000001', 'close');
    assert.equal(closed.json.item.column, 'done');
  });

  test('Close on an Owed to me row', async () => {
    const id = 'A-260915-1';
    await click(page, id, 'close');
    assert.deepEqual(site.api.ledger().items[id], { column: 'done', closed: AS_OF });
    assert.match(rowHtml(page, id), /Closed Sep 22/);
  });

  test('Close on a reported row closes it; Reopen on a still-mentioned row reopens it', async () => {
    await click(page, 'A-260823-5', 'close');
    assert.deepEqual(site.api.ledger().items['A-260823-5'], { column: 'done', closed: AS_OF });
    await click(page, 'A-260701-7', 'reopen');
    assert.deepEqual(site.api.ledger().items['A-260701-7'], { column: 'todo' });
    const view = await site.api.today();
    assert.ok(!ids(view, 'confirm').includes('A-260823-5'));
    assert.ok(!ids(view, 'confirm').includes('A-260701-7'));
  });

  test('Keep open records that I have seen the report of that date; the row and the chip go away on Today, the Board and Meetings', async () => {
    const id = 'A-260701-4';
    await click(page, id, 'keep');
    assert.deepEqual(site.api.ledger().items[id], { reportSeen: '2026-09-15' });
    assert.equal(rowIds(page, 'confirm').includes(id), false, 'the row goes away');
    assert.equal(page.el('today-status').textContent, 'Kept “Kevin: reported done later” open. The Sep 15 report won’t be shown again.');
    const view = await site.api.today();
    assert.ok(!ids(view, 'confirm').includes(id));
    const card = (await site.api.board()).cards.find((c) => c.id === id);
    assert.equal(card.reported, null);
    assert.equal(card.chip.rule, 'open-long');
    assert.equal(card.column, 'todo', 'nothing else changes');
    assert.deepEqual((await site.api.tracked()).find((r) => r.id === id).chip, card.chip);
    // It is still mine and open a long time, so it now counts under I owe.
    assert.ok(ids(view, 'i-owe').includes(id));
  });

  test('Keep closed does the same for a still-mentioned item', async () => {
    const id = 'A-260701-5';
    await click(page, id, 'keep');
    assert.deepEqual(site.api.ledger().items[id], { column: 'done', closed: '2026-09-10', reportSeen: AS_OF });
    assert.equal(rowIds(page, 'confirm').includes(id), false);
    assert.equal(page.el('today-status').textContent, 'Kept “Kevin: closed, still mentioned, to keep closed” closed. The Sep 22 report won’t be shown again.');
    const card = (await site.api.board()).cards.find((c) => c.id === id);
    assert.equal(card.stillMentioned, null);
    assert.deepEqual(card.chip, { rule: 'closed', tone: 'neutral', text: 'Closed Sep 10' });
    assert.deepEqual((await site.api.tracked()).find((r) => r.id === id).chip, card.chip);
    assert.ok(!view(await site.api.today()).includes(id), 'and nowhere on Today');
    function view(v) { return v.groups.flatMap((g) => g.items.map((i) => i.id)); }
  });

  test('Keep is refused for an item with no report, and nothing is written', async () => {
    const before = site.file(LEDGER);
    const res = await site.api.todayAct('A-260922-2', 'keep');
    assert.equal(res.status, 409);
    assert.equal(site.file(LEDGER), before);
    assert.equal((await site.api.todayAct('A-260701-6', 'close')).status, 409, 'a suggestion not accepted can\'t be closed from Today');
    assert.equal((await site.api.todayAct('A-999999-1', 'close')).status, 404);
  });

  test('a later summary that reports it again brings the row and the chip back', async () => {
    fs.writeFileSync(path.join(site.root, 'meeting-notes', '2026-09-29_kevin-praveen_1on1.md'),
      header('Kevin & Praveen: 1:1', 'September 29, 2026', 'Kevin Collins (SRE Manager), Praveen Iyer (Senior SRE)') + ACTIONS + EARLIER + rows([
        ['A-260701-4', 'Jul 1, 2026', 'Kevin: reported done later', 'Kevin Collins', '13 weeks', 'Done. Reported again.'],
        ['A-260701-5', 'Jul 1, 2026', 'Kevin: closed, still mentioned, to keep closed', 'Kevin Collins', '13 weeks', 'Open. Mentioned again.'],
      ]));
    const view = await site.api.today();
    assert.ok(ids(view, 'confirm').includes('A-260701-4'));
    assert.ok(ids(view, 'confirm').includes('A-260701-5'));
    assert.equal(item(view, 'A-260701-4').chip.text, 'Reported done Sep 29');
    assert.equal(item(view, 'A-260701-5').chip.text, 'Still mentioned Sep 29');
    const board = await site.api.board();
    assert.equal(board.cards.find((c) => c.id === 'A-260701-4').chip.text, 'Reported done Sep 29');
    assert.equal(board.cards.find((c) => c.id === 'A-260701-5').chip.text, 'Still mentioned Sep 29');
  });
});

describe('People with no flags', () => {
  let site;
  before(async () => {
    site = await startSite({
      prepare(root) {
        writeFixture(root);
        // Only Riley is a report: met 7 days ago, and with Riley's past-due item closed, 2 items in the week.
        writePeople(root, [PEOPLE[0], PEOPLE[1], '| Riley Brooks | SRE I | report | Riley |']);
        const ledger = JSON.parse(fs.readFileSync(path.join(root, LEDGER), 'utf8'));
        ledger.items['A-260915-1'] = { column: 'done', closed: '2026-09-21' };
        fs.writeFileSync(path.join(root, LEDGER), JSON.stringify(ledger));
      },
    });
  });
  after(async () => { await site?.stop(); });

  test('the group\'s header says so in one line', async () => {
    const view = await site.api.today();
    assert.equal(view.people.flagCount, 0);
    assert.deepEqual(view.people.reports.map((r) => [r.name, r.flags]), [['Riley Brooks', []]]);
    const page = await openPage(site, '#/today');
    const people = sectionHtml(page, 'people');
    assert.match(people, /No flags: every report has met with you in the last 30 days, and none has a busy week\./);
    assert.doesNotMatch(people, /chip-late/);
  });
});

describe('when something is missing', () => {
  describe('no people.md', () => {
    let site;
    before(async () => {
      site = await startSite({ prepare: (root) => { writeFixture(root); fs.rmSync(path.join(root, 'people.md')); } });
    });
    after(async () => { await site?.stop(); });

    test('groups 1 and 2 become one group, "Open items", with a line naming people.md; the People group shows the same line', async () => {
      const view = await site.api.today();
      assert.equal(view.me, null);
      assert.deepEqual(view.meProblem, { reason: 'no-file', file: 'people.md', count: 0 });
      assert.deepEqual(view.groups.map((g) => g.key), ['open', 'confirm']);
      // The same rules and order for every owner; owners are as written. Equal dates go by ID.
      assert.deepEqual(ids(view, 'open'), [
        'A-260701-3', 'A-260915-1', 'C-00000001', 'A-260823-2',
        'A-260915-2', 'A-260922-2', 'A-260915-4', 'C-00000002', 'A-260922-1', 'A-260823-3', 'A-260823-7', 'A-260915-3',
        'A-260701-1', 'A-260701-2',
      ]);
      assert.equal(item(view, 'A-260701-3').owner, 'Kevin');
      assert.deepEqual(view.counts, { iOwe: 0, owedToMe: 0, open: 14, confirm: 4, total: 18 });
      assert.equal(view.people, null);

      const page = await openPage(site, '#/today');
      const line = 'There is no <code>people.md</code> in this workspace, so Today can’t tell which items are yours.';
      assert.ok(sectionHtml(page, 'open').includes(line), sectionHtml(page, 'open').slice(0, 400));
      assert.ok(sectionHtml(page, 'people').includes(line));
      assert.doesNotMatch(page.el('today-body').innerHTML, />I owe<|>Owed to me</);
      assert.match(sectionHtml(page, 'open'), />Open items</);
      // Each row names its owner; the actions are Close and Re-date, since it can't tell whose an item is.
      assert.match(rowHtml(page, 'A-260915-1'), /Riley Brooks/);
      assert.deepEqual(buttons(rowHtml(page, 'A-260915-1')), [['redate', 'Re-date'], ['close', 'Close']]);
      assert.match(page.el('today-sub').innerHTML, /Fourteen open items, four to confirm\./);
      assert.equal(page.el('today-count').textContent, '18');
    });
  });

  for (const [name, people, problem] of [
    ['no row marked "me"', [PEOPLE[0].replace('| me |', '| peer |'), ...PEOPLE.slice(1)], { reason: 'no-me', file: 'people.md', count: 0 }],
    ['two rows marked "me"', [PEOPLE[0], PEOPLE[1].replace('| manager |', '| me |'), ...PEOPLE.slice(2)], { reason: 'several', file: 'people.md', count: 2 }],
  ]) {
    describe(name, () => {
      let site;
      before(async () => { site = await startSite({ prepare: (root) => { writeFixture(root); writePeople(root, people); } }); });
      after(async () => { await site?.stop(); });

      test('"Open items", and the People group shows the same line naming people.md', async () => {
        const view = await site.api.today();
        assert.deepEqual(view.meProblem, problem);
        assert.deepEqual(view.groups.map((g) => g.key), ['open', 'confirm']);
        assert.equal(view.people, null);
        const page = await openPage(site, '#/today');
        const line = problem.reason === 'no-me'
          ? '<code>people.md</code> has no row marked “me”, so Today can’t tell which items are yours.'
          : '<code>people.md</code> has 2 rows marked “me”, so Today can’t tell which items are yours.';
        assert.ok(sectionHtml(page, 'open').includes(line));
        assert.ok(sectionHtml(page, 'people').includes(line));
      });
    });
  }

  describe('a ledger that can\'t be read', () => {
    const BROKEN = '{"version": 1, "items": { "A-260701-2": {"column": "done"';
    let site;
    before(async () => {
      site = await startSite({ prepare: (root) => { writeFixture(root); fs.writeFileSync(path.join(root, LEDGER), BROKEN); } });
    });
    after(async () => { await site?.stop(); });

    test('Today shows that warning and the foot only', async () => {
      const view = await site.api.today();
      assert.equal(view.status, 'ledger-unreadable');
      assert.match(view.ledgerError, /^actions\/ledger\.json could not read: .+ Nothing will be saved until it is fixed\.$/);
      assert.deepEqual(view.groups, []);
      assert.equal(view.people, null);
      assert.equal(view.foot.couldNotRead, (await site.get('/api/meetings')).json.warnings.length);
      const page = await openPage(site, '#/today');
      const body = page.el('today-body').innerHTML;
      assert.match(body, /actions\/ledger\.json could not read/);
      assert.match(body, /class="today-foot"/);
      // The foot counts what could not be read, the ledger among it, with a link to Meetings.
      assert.match(body, new RegExp(`${view.foot.couldNotRead} things? could not be read: <a href="#/meetings">see Meetings</a>`));
      assert.doesNotMatch(body, /<section\b|today-row/);
      assert.equal(page.el('today-count').hidden, true);
    });

    test('and refuses every action, leaving the file as it was', async () => {
      for (const act of ['close', 'reopen', 'keep']) assert.equal((await site.api.todayAct('A-260701-2', act)).status, 409, act);
      assert.equal((await site.api.todayAct('A-260701-2', 'due', { due: '2026-10-01' })).status, 409);
      assert.equal(site.file(LEDGER), BROKEN);
    });
  });

  for (const [name, prepare] of [
    ['no summaries yet', (root) => { for (const f of fs.readdirSync(path.join(root, 'meeting-notes'))) fs.rmSync(path.join(root, 'meeting-notes', f)); }],
    ['no meeting-notes folder', (root) => fs.rmSync(path.join(root, 'meeting-notes'), { recursive: true })],
  ]) {
    describe(name, () => {
      let site;
      before(async () => { site = await startSite({ prepare }); });
      after(async () => { await site?.stop(); });

      test('one line saying how to start, and nothing else', async () => {
        const view = await site.api.today();
        assert.equal(view.status, 'no-summaries');
        assert.deepEqual(view.groups, []);
        const page = await openPage(site, '#/today');
        const body = page.el('today-body').innerHTML;
        assert.match(body, /No meeting summaries yet\. Save a summary in <code>meeting-notes\/<\/code> and it shows up here\./);
        assert.doesNotMatch(body, /<section\b|today-foot|today-row/);
        assert.doesNotMatch(page.html(), /today-reload/);
        assert.equal(page.el('today-sub').innerHTML, '');
      });
    });
  }
});

describe('the app opens on Today; the sidebar count; what is never on Today', () => {
  let site;
  before(async () => { site = await startSite(); });
  after(async () => { await site?.stop(); });

  test('Today is first in the sidebar, and the app opens on it', async () => {
    const [shell] = await site.api.pageShell();
    const links = [...shell.text.matchAll(/<a href="(#\/\w+)" data-page="(\w+)"/g)].map((m) => m[2]);
    assert.equal(links[0], 'today');
    assert.match(shell.text, /<a href="#\/today" data-page="today">[^]*?<span class="nav-label">Today<\/span>[^]*?<span class="nav-count nav-badge" id="today-count" hidden><\/span>/);
    for (const hash of ['', '#/', '#/nowhere']) {
      const page = await openPage(site, hash);
      assert.equal(page.body.dataset.page, 'today', hash);
      assert.match(page.html(), /<h1>Today<\/h1>/, hash);
    }
  });

  test('on every other page the sidebar\'s Today item shows the same total', async () => {
    const { counts } = await site.api.today();
    assert.ok(counts.total > 0);
    const page = await openPage(site, '#/board');
    await waitFor(() => page.el('today-count').textContent !== '', 'the Today count');
    assert.equal(page.el('today-count').textContent, String(counts.total));
    assert.equal(counts.total, counts.iOwe + counts.owedToMe + counts.confirm);
  });

  test('no Manager-only note text, no rating or ranking: in the answer or on the page', async () => {
    const res = await site.api.todayRaw();
    const page = await openPage(site, '#/today');
    const notes = privateNoteTexts(site.root);
    assert.ok(notes.length > 0);
    for (const n of notes) {
      assert.ok(!res.text.includes(n.text.slice(0, 40)), `the answer holds ${n.file}'s note`);
      assert.ok(!page.html().includes(n.text.slice(0, 40)), `the page shows ${n.file}'s note`);
    }
    assert.doesNotMatch(res.text, /\b(ratings?|rank(ed|ing)?|scores?)\b/i);
    assert.doesNotMatch(page.el('today-body').innerHTML, /★|\b(ratings?|rank(ed|ing)?|scores?)\b/i);
  });

  test('in the sample the header says the date is the newest meeting\'s, Sep 22, 2026', async () => {
    const page = await openPage(site, '#/today');
    assert.match(page.el('today-sub').innerHTML, /^Tuesday, Sep 22, 2026, the date of the newest meeting\. /);
  });

  test('#/meetings?attendee=<name> opens Meetings filtered to that attendee', async () => {
    const page = await openPage(site, '#/meetings?attendee=Riley%20Brooks');
    assert.deepEqual([...page.el('meeting-list').innerHTML.matchAll(/href="#\/meetings\/([^"]+)"/g)].map((m) => decodeURIComponent(m[1])), ['2026-09-10_kevin-riley_1on1.md']);
    assert.match(page.html(), /<option value="Riley Brooks" selected>/);
  });
});

describe('a workspace that is not the sample', () => {
  let site;
  before(async () => { site = await startSite({ demo: false }); });
  after(async () => { await site?.stop(); });

  test('the as-of date is today, with its weekday', async () => {
    const view = await site.api.today();
    assert.equal(view.asOfIsNewestMeeting, false);
    const page = await openPage(site, '#/today');
    const weekday = new Date(`${view.asOf}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long' });
    assert.match(page.el('today-sub').innerHTML, new RegExp(`^${weekday}, `));
    assert.doesNotMatch(page.el('today-sub').innerHTML, /newest meeting/);
  });
});

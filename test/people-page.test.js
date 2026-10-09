// The People page (step 7): one row per person in people.md, under headings by relationship, with the same counts
// and flags as Today, worked out by the same code; a page for each person with what they owe, what I owe them and
// the meetings they attended; and the names found in the summaries that people.md does not have. The core works it
// all out and the page only draws. people.md is never written.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { openPage } from './helpers/page.js';
import { LEDGER, privateNoteTexts, startSite } from './helpers/site.js';

// The fixture's newest meeting is Sep 22, 2026: in the sample, "today".
const AS_OF = '2026-09-22';
const PRIVATE = 'Sam talked about a health matter; keep it out of everything.';

const header = (title, date, attendees, type = '1:1') => `# ${title} | ${date}\n\n**Date:** ${date} | **Duration:** 1m\n**Attendees:** ${attendees}\n**Company:** Harborline Cloud | **Type:** ${type}\n\n---\n\n`;
const ACTIONS = '## Action Items\n\n| ID | Action Item | Owner | Due | Due date | Status |\n|---|---|---|---|---|---|\n';
const EARLIER = '\n## Open Items from Earlier Meetings\n\n| ID | From | Item | Owner | Age | Status now |\n|---|---|---|---|---|---|\n';
const rows = (list) => list.map((r) => `| ${r.join(' | ')} |`).join('\n') + '\n';

const PEOPLE = [
  '| Kevin Collins | SRE Manager | me | Kevin |',
  '| Sam Torres | SRE II | report | Sam, Sammy |',
  "| Dana Whitfield | Kevin's manager | manager | Dana |",
  '| Riley Brooks | SRE I | report | Riley |',
  '| Jordan Lee | Platform lead | peer | Jordan |',
  '| Alex Kim | SRE I | report | Alex |',
  '| Pat Quinn | Recruiter | other |  |',
];
const PEOPLE_FILE = `# People\n\n| Name | Role | Relationship | Also called |\n|---|---|---|---|\n${PEOPLE.join('\n')}\n`;

const M_SAM_OLD = '2026-07-01_kevin-sam_1on1.md';
const M_SAM = '2026-08-20_kevin-sam_1on1.md';
const M_TEAM = '2026-09-15_team-sync.md';
const M_DANA = '2026-09-22_dana-kevin_1on1.md';

function writeFixture(root) {
  const notes = path.join(root, 'meeting-notes');
  for (const f of fs.readdirSync(notes)) fs.rmSync(path.join(notes, f));
  const put = (file, text) => fs.writeFileSync(path.join(notes, file), text);
  fs.writeFileSync(path.join(root, 'people.md'), PEOPLE_FILE);
  put(M_SAM_OLD, header('Kevin & Sam: 1:1', 'July 1, 2026', 'Kevin Collins (SRE Manager), Sam Torres (SRE II)') + ACTIONS + rows([
    ['A-260701-1', 'Sam: an old item with no due date', 'Sam Torres', 'Not set', '', 'Agreed'],
    ['A-260701-2', 'Kevin: for Sam, closed since', 'Kevin Collins', 'Not set', '', 'Open'],
    ['A-260701-3', 'Kevin: a suggestion not accepted *(suggested)*', 'Kevin Collins', 'Next 1:1', '', 'Suggested'],
    ['A-260701-4', 'Sam: a suggestion I accepted *(suggested)*', 'Sam Torres', 'Not set', '', 'Suggested'],
  ]) + `\n## Notes\n\n- **Manager-only note:** ${PRIVATE}\n`);
  // Sam is written by an "Also called" name here, as an attendee and as an owner.
  put(M_SAM, header('Kevin & Sam: 1:1', 'August 20, 2026', 'Kevin Collins (SRE Manager), Sammy (SRE II)') + ACTIONS + rows([
    ['A-260820-1', 'Sam: due in three days', 'Sammy', 'Friday', '2026-09-25', 'Agreed'],
    ['A-260820-2', 'Kevin: past due two days', 'Kevin', 'Sep 20', '2026-09-20', 'Open'],
    ['A-260820-3', 'Sam: due in five days', 'Sam Torres', 'Sunday', '2026-09-27', 'Agreed'],
    ['A-260820-4', 'Sam: past due a day', 'Sam Torres', 'Sep 21', '2026-09-21', 'Agreed'],
  ]));
  put(M_TEAM, header('Team sync', 'September 15, 2026', 'Kevin Collins (SRE Manager), Riley Brooks (SRE I), Jordan Lee (Platform lead), Morgan Diaz (Vendor)', 'Team sync') + ACTIONS + rows([
    ['A-260915-1', 'Riley: due today', 'Riley', 'Today', '2026-09-22', 'Agreed'],
    ['A-260915-2', 'Jordan: due next week', 'Jordan Lee', 'Next Tuesday', '2026-09-29', 'Agreed'],
    ['A-260915-3', 'Kevin: send the notes to Jordan and Riley', 'Kevin Collins', 'Not set', '', 'Open'],
    ['A-260915-4', 'Casey: an owner not in people.md', 'Casey Nguyen', 'Not set', '', 'Agreed'],
    ['A-260915-5', 'Riley and Taylor: two owners', 'Riley Brooks and Taylor Fox', 'Not set', '', 'Agreed'],
  ]) + EARLIER + rows([
    // Background, not an action item: its owner is not a name to add to people.md.
    ['', 'Before these meetings', 'Some background', 'Unassigned until today', '', 'Open. Picked up today.'],
  ]));
  put(M_DANA, header('Dana & Kevin: 1:1 with Manager', 'September 22, 2026', "Dana Whitfield (Kevin's manager), Kevin Collins (SRE Manager)", '1:1 with manager') + ACTIONS + rows([
    ['A-260922-1', 'Dana: due Thursday', 'Dana Whitfield', 'Thursday', '2026-09-24', 'Agreed'],
    ['A-260922-2', 'Kevin: for Dana, early October', 'Kevin Collins', 'Early October', '2026-10-05', 'Open'],
  ]));
  fs.mkdirSync(path.join(root, 'actions'), { recursive: true });
  fs.writeFileSync(path.join(root, LEDGER), JSON.stringify({
    version: 1,
    items: {
      'A-260701-2': { column: 'done', closed: '2026-09-01' },
      'A-260701-4': { accepted: '2026-07-02' },
      'C-00000001': { title: 'My card: prep for Sam', meeting: M_SAM, meetingDate: '2026-08-20', created: '2026-09-01T09:00:00.000Z', due: '2026-10-01', column: 'todo' },
      'C-00000002': { title: "My card: Sam's, end of the month", owner: 'Sam', created: '2026-09-01T09:00:00.000Z', due: '2026-09-30', column: 'doing' },
    },
  }, null, 2));
}

const THEY_OWE_SAM = ['A-260820-4', 'A-260820-1', 'A-260820-3', 'C-00000002', 'A-260701-1', 'A-260701-4'];
const YOU_OWE_SAM = ['A-260820-2', 'C-00000001'];

const enc = encodeURIComponent;
const row = (view, name) => view.groups.flatMap((g) => g.people).find((p) => p.name === name);
const personRaw = (site, name) => site.get(`/api/people/${enc(name)}`);
const person = async (site, name) => {
  const res = await personRaw(site, name);
  assert.equal(res.status, 200, res.text.slice(0, 300));
  return res.json;
};
const ids = (list) => list.map((i) => i.id);

// ---------- the page in the stand-in document ----------
const sectionHtml = (page, id) => page.html().split(/<section\b/).find((s) => s.includes(`id="${id}"`)) || '';
const personRow = (page, name) => page.el('people-body').innerHTML.split('<li class="today-person').slice(1).find((r) => r.includes(`>${name}<`));
const rowIds = (page, key) => [...sectionHtml(page, `group-${key}`).matchAll(/<li class="today-row[^"]*" data-id="([^"]+)"/g)].map((m) => m[1]);
const itemRow = (page, id) => page.el('person-body').innerHTML.split(/<li class="today-row/).slice(1).find((r) => r.includes(`data-id="${id}"`));
const buttons = (html) => [...html.matchAll(/<button\b[^>]*data-act="([\w-]+)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2].trim()]);
async function click(page, id, act) {
  const html = itemRow(page, id);
  if (!html) throw new Error(`row ${id} is not drawn`);
  if (!new RegExp(`data-act="${act}"`).test(html)) throw new Error(`row ${id} has no ${act} button`);
  const r = { dataset: { id } };
  const button = { dataset: { act }, disabled: false, closest: (sel) => (sel.startsWith('button') ? button : sel === '.today-row' ? r : null) };
  await page.el('person-body').fire('click', { target: button });
}

describe('the list: what the core works out', () => {
  let site;
  let view;
  before(async () => {
    site = await startSite({ prepare: writeFixture });
    view = await site.api.people();
  });
  after(async () => { await site?.stop(); });

  test('what /api/people gave before is still there, unchanged', () => {
    assert.equal(view.file, 'people.md');
    assert.equal(view.fileFound, true);
    assert.deepEqual(view.warnings, []);
    assert.deepEqual(view.people.map((p) => p.name), ['Kevin Collins', 'Sam Torres', 'Dana Whitfield', 'Riley Brooks', 'Jordan Lee', 'Alex Kim', 'Pat Quinn']);
    assert.deepEqual(view.people[1], { name: 'Sam Torres', role: 'SRE II', relationship: 'report', alsoCalled: ['Sam', 'Sammy'] });
  });

  test('"me" is on its own, at the top; the others are under Reports, Manager, Peers and Others, each in the file\'s order', () => {
    assert.equal(view.status, 'ok');
    assert.equal(view.asOf, AS_OF);
    assert.equal(view.me, 'Kevin Collins');
    assert.deepEqual(view.you, { name: 'Kevin Collins', role: 'SRE Manager' });
    assert.deepEqual(view.groups.map((g) => [g.key, g.heading, g.people.map((p) => p.name)]), [
      ['report', 'Reports', ['Sam Torres', 'Riley Brooks', 'Alex Kim']],
      ['manager', 'Manager', ['Dana Whitfield']],
      ['peer', 'Peers', ['Jordan Lee']],
      ['other', 'Others', ['Pat Quinn']],
    ]);
  });

  test('each row: the role, the last meeting with me and how many days ago, Owes you and You owe', () => {
    const sam = row(view, 'Sam Torres');
    assert.equal(sam.role, 'SRE II');
    assert.equal(sam.relationship, 'report');
    assert.deepEqual(sam.lastMeeting, { date: '2026-08-20', file: M_SAM });
    assert.equal(sam.daysSince, 33);
    // Sam's open items, an "Also called" owner and my card with owner "Sam" among them; the accepted suggestion counts.
    assert.equal(sam.owesYou, 6);
    // Mine from meetings Sam attended: A-260820-2 and my card from that meeting. A-260701-2 is closed; A-260701-3 is a
    // suggestion I have not accepted.
    assert.equal(sam.youOwe, 2);

    const dana = row(view, 'Dana Whitfield');
    assert.deepEqual(dana.lastMeeting, { date: '2026-09-22', file: M_DANA });
    assert.equal(dana.daysSince, 0);
    assert.equal(dana.owesYou, 1);
    assert.equal(dana.youOwe, 1);

    const jordan = row(view, 'Jordan Lee');
    assert.deepEqual(jordan.lastMeeting, { date: '2026-09-15', file: M_TEAM });
    assert.equal(jordan.owesYou, 1);
    assert.equal(jordan.youOwe, 1);

    const pat = row(view, 'Pat Quinn');
    assert.equal(pat.lastMeeting, null);
    assert.equal(pat.daysSince, null);
    assert.equal(pat.owesYou, 0);
    assert.equal(pat.youOwe, 0);
  });

  test('the flags are Today\'s, for reports only', () => {
    const flags = Object.fromEntries(view.groups.flatMap((g) => g.people).map((p) => [p.name, p.flags.map((f) => f.text)]));
    assert.deepEqual(flags, {
      'Sam Torres': ['No 1:1 in 33 days', 'Busy week'],
      'Riley Brooks': [],
      'Alex Kim': ['No 1:1 yet'],
      // Not reports: no flags, though Pat has never met with me.
      'Dana Whitfield': [],
      'Jordan Lee': [],
      'Pat Quinn': [],
    });
  });

  test('the same counts and flags as Today, from the same code', async () => {
    const today = await site.api.today();
    for (const r of today.people.reports) {
      const p = row(view, r.name);
      assert.deepEqual(
        { lastMeeting: p.lastMeeting, daysSince: p.daysSince, owesYou: p.owesYou, youOwe: p.youOwe, flags: p.flags },
        { lastMeeting: r.lastMeeting, daysSince: r.daysSince, owesYou: r.owesYou, youOwe: r.youOwe, flags: r.flags },
        r.name,
      );
    }
  });

  test('"Not in people.md": names on Attendees lines or as owners that the file does not have, each as written', () => {
    // Sammy and Kevin are "Also called" names; "Unassigned until today" owns a background row, not an action item.
    assert.deepEqual(view.notInPeople, ['Casey Nguyen', 'Morgan Diaz', 'Taylor Fox']);
  });
});

describe('the list: what the page draws', () => {
  let site;
  let page;
  before(async () => {
    site = await startSite({ prepare: writeFixture });
    page = await openPage(site, '#/people');
  });
  after(async () => { await site?.stop(); });

  test('the page opens from #/people, with its heading', () => {
    assert.equal(page.body.dataset.page, 'people');
    assert.match(page.html(), /<h1>People<\/h1>/);
  });

  test('the "me" row is at the top, labelled "You", with no link', () => {
    const body = page.el('people-body').innerHTML;
    const you = personRow(page, 'Kevin Collins');
    assert.ok(you, 'drawn');
    assert.match(you, />You</);
    assert.doesNotMatch(you, /href=/);
    assert.ok(body.indexOf('Kevin Collins') < body.indexOf('>Reports<'));
  });

  test('the headings in order, and the rows under each in the file\'s order', () => {
    const body = page.el('people-body').innerHTML;
    const at = (s) => body.indexOf(s);
    const order = ['>Reports<', '>Sam Torres<', '>Riley Brooks<', '>Alex Kim<', '>Manager<', '>Dana Whitfield<', '>Peers<', '>Jordan Lee<', '>Others<', '>Pat Quinn<', '>Not in people.md<'].map(at);
    assert.ok(order.every((i) => i >= 0), JSON.stringify(order));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
  });

  test('a row: name, role, last meeting and days ago, Owes you and You owe, the flags, and a link to the person\'s page', () => {
    const sam = personRow(page, 'Sam Torres');
    assert.match(sam, /SRE II/);
    assert.match(sam, /Last meeting Aug 20, 33 days ago/);
    assert.match(sam, /Owes you 6 · You owe 2/);
    assert.match(sam, /<span class="chip chip-late">No 1:1 in 33 days<\/span>/);
    assert.match(sam, /<span class="chip chip-late">Busy week<\/span>/);
    assert.match(sam, /href="#\/people\/Sam%20Torres"/);
    assert.match(personRow(page, 'Dana Whitfield'), /Last meeting Sep 22, today/);
    assert.match(personRow(page, 'Alex Kim'), /No 1:1 yet/);
    assert.match(personRow(page, 'Pat Quinn'), /No meeting with you yet/);
    assert.doesNotMatch(personRow(page, 'Pat Quinn'), /chip/);
  });

  // The parts of a row, in order, by class: the same for every counted row, flags or none, notes or none, so the
  // columns line up down the page.
  const CELLS = /class="(today-person-name|today-person-fact person-last|today-person-fact person-counts|today-flags|today-open)"/g;
  const cells = (html) => [...html.matchAll(CELLS)].map((m) => m[1]);

  test('every counted row has the same parts in the same order, whether or not it has a flag', () => {
    const want = ['today-person-name', 'today-person-fact person-last', 'today-person-fact person-counts', 'today-flags', 'today-open'];
    assert.match(personRow(page, 'Sam Torres'), /chip/);
    assert.doesNotMatch(personRow(page, 'Dana Whitfield'), /chip/);
    for (const name of ['Sam Torres', 'Riley Brooks', 'Alex Kim', 'Dana Whitfield', 'Jordan Lee', 'Pat Quinn']) {
      assert.deepEqual(cells(personRow(page, name)), want, name);
    }
  });

  test('the styles give each part of a row its own column, the same in every row', () => {
    const css = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    // The first rule whose selector list includes sel.
    const rule = (sel) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => m[1].split(',').map((x) => x.trim()).includes(sel))?.[2] || '';
    assert.match(rule('.today-person'), /display: grid/);
    // Fixed tracks: no column sized by its content, so a row with chips is laid out as one without.
    const tracks = rule('.today-person').match(/grid-template-columns: ([^;]+)/)?.[1] || '';
    assert.ok(tracks && !/\bauto\b|min-content|max-content|fit-content/.test(tracks), tracks);
    for (const sel of ['.today-person-name', '.person-last', '.person-counts', '.today-person .today-flags', '.today-person .today-open']) {
      assert.match(rule(sel), /grid-column: /, sel);
    }
  });

  test('"Not in people.md" lists each name as written', () => {
    const section = sectionHtml(page, 'people-not-in');
    assert.deepEqual([...section.matchAll(/<li>([^<]+)<\/li>/g)].map((m) => m[1]), ['Casey Nguyen', 'Morgan Diaz', 'Taylor Fox']);
  });

  test('no score, rating or ranking of a person; no Manager-only note', async () => {
    const res = await site.api.peopleRaw();
    for (const text of [res.text, page.el('app').innerHTML]) {
      assert.doesNotMatch(text, /★|\b(ratings?|rank(ed|ing)?|scores?)\b/i);
      assert.ok(!text.includes(PRIVATE.slice(0, 40)));
    }
  });
});

describe('one person\'s page: what the core works out', () => {
  let site;
  let sam;
  before(async () => {
    site = await startSite({ prepare: writeFixture });
    sam = await person(site, 'Sam Torres');
  });
  after(async () => { await site?.stop(); });

  test('the header: name, role, relationship, other names and the flags', () => {
    assert.equal(sam.status, 'ok');
    assert.equal(sam.asOf, AS_OF);
    assert.deepEqual(
      { name: sam.person.name, role: sam.person.role, relationship: sam.person.relationship, alsoCalled: sam.person.alsoCalled },
      { name: 'Sam Torres', role: 'SRE II', relationship: 'report', alsoCalled: ['Sam', 'Sammy'] },
    );
    assert.deepEqual(sam.person.flags.map((f) => f.text), ['No 1:1 in 33 days', 'Busy week']);
  });

  test('"They owe": their open items, the dated ones first, soonest at the top, then the oldest; as many as Owes you', async () => {
    assert.deepEqual(ids(sam.theyOwe), THEY_OWE_SAM);
    assert.equal(sam.theyOwe.length, row(await site.api.people(), 'Sam Torres').owesYou);
    for (const it of sam.theyOwe) {
      assert.equal(it.owner, 'Sam Torres', it.id);
      assert.equal(it.mine, false, it.id);
    }
    assert.equal(sam.theyOwe.find((i) => i.id === 'A-260820-4').chip.text, 'Past due 1 day');
  });

  test('"You owe them": my open items from meetings they attended; as many as You owe', async () => {
    assert.deepEqual(ids(sam.youOwe), YOU_OWE_SAM);
    assert.equal(sam.youOwe.length, row(await site.api.people(), 'Sam Torres').youOwe);
    for (const it of sam.youOwe) assert.equal(it.mine, true, it.id);
  });

  test('"Meetings": every summary they attended, newest first, also when written by another name', async () => {
    assert.deepEqual(sam.attended.map((m) => m.file), [M_SAM, M_SAM_OLD]);
    assert.deepEqual(sam.attended[0], { file: M_SAM, date: '2026-08-20', title: 'Kevin & Sam: 1:1 | August 20, 2026', type: '1:1' });
    assert.deepEqual((await person(site, 'Riley Brooks')).attended.map((m) => m.file), [M_TEAM]);
  });

  test('a suggestion I have not accepted never appears', async () => {
    const everything = [];
    for (const p of ['Sam Torres', 'Riley Brooks', 'Dana Whitfield', 'Jordan Lee']) {
      const v = await person(site, p);
      everything.push(...ids(v.theyOwe), ...ids(v.youOwe));
    }
    assert.ok(!everything.includes('A-260701-3'));
    assert.ok(ids(sam.theyOwe).includes('A-260701-4'), 'an accepted one does');
  });

  test('a manager, a peer and someone else have a page too, with no flags', async () => {
    const dana = await person(site, 'Dana Whitfield');
    assert.deepEqual(ids(dana.theyOwe), ['A-260922-1']);
    assert.deepEqual(ids(dana.youOwe), ['A-260922-2']);
    assert.deepEqual(dana.person.flags, []);
    const jordan = await person(site, 'Jordan Lee');
    assert.deepEqual(ids(jordan.theyOwe), ['A-260915-2']);
    assert.deepEqual(ids(jordan.youOwe), ['A-260915-3']);
    const pat = await person(site, 'Pat Quinn');
    assert.deepEqual([pat.theyOwe, pat.youOwe, pat.attended], [[], [], []]);
  });

  test('an "Also called" name opens the same page; a name not in people.md, and "me", have none', async () => {
    assert.equal((await person(site, 'Sammy')).person.name, 'Sam Torres');
    for (const name of ['Morgan Diaz', 'Kevin Collins', '../people.md']) {
      const res = await personRaw(site, name);
      assert.equal(res.status, 404, name);
      assert.equal(res.json.noPerson, name);
    }
  });

  test('no Manager-only note, no score, rating or ranking', async () => {
    const res = await personRaw(site, 'Sam Torres');
    assert.ok(!res.text.includes(PRIVATE.slice(0, 40)));
    assert.doesNotMatch(res.text, /\b(ratings?|rank(ed|ing)?|scores?)\b/i);
  });
});

describe('one person\'s page: what the page draws, and Close and Re-date', () => {
  let site;
  let page;
  before(async () => {
    site = await startSite({ prepare: writeFixture });
    page = await openPage(site, `#/people/${enc('Sam Torres')}`);
  });
  after(async () => { await site?.stop(); });

  test('the header and the three sections, in order', () => {
    assert.equal(page.body.dataset.page, 'people');
    const html = page.html();
    assert.match(html, /<h1>Sam Torres<\/h1>/);
    assert.match(html, /SRE II · Report · Also called Sam, Sammy/);
    assert.match(page.el('person-flags').innerHTML, /<span class="chip chip-late">No 1:1 in 33 days<\/span><span class="chip chip-late">Busy week<\/span>/);
    assert.match(html, /<a class="back" href="#\/people">← People<\/a>/);
    const order = ['>They owe<', '>You owe them<', '>Meetings<'].map((h) => html.indexOf(h));
    assert.ok(order.every((i) => i >= 0), JSON.stringify(order));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
  });

  test('"They owe": drawn like Today\'s Owed to me rows, with Close', () => {
    assert.deepEqual(rowIds(page, 'they-owe'), THEY_OWE_SAM);
    const r = itemRow(page, 'A-260820-4');
    assert.match(r, /<span class="chip chip-late">Past due 1 day<\/span>/);
    assert.match(r, />Sam: past due a day</);
    // The page is Sam's, so the rows don't name Sam again; written as "Sammy" in the summary, still not shown.
    assert.doesNotMatch(r, /today-owner|Sam Torres/);
    assert.doesNotMatch(itemRow(page, 'A-260820-1'), /today-owner|Sammy/);
    assert.match(r, />A-260820-4</);
    assert.match(r, new RegExp(`From <a href="#/meetings/${enc(M_SAM)}"[^>]*>Kevin &amp; Sam: 1:1, <span class="nowrap">Aug 20</span></a>`));
    assert.deepEqual(buttons(r), [['close', 'Close']]);
  });

  test('"You owe them": drawn like Today\'s I owe rows, with Re-date and Close', () => {
    assert.deepEqual(rowIds(page, 'you-owe'), YOU_OWE_SAM);
    const r = itemRow(page, 'A-260820-2');
    assert.match(r, /<span class="chip chip-late">Past due 2 days<\/span>/);
    assert.doesNotMatch(r, /today-owner/);
    assert.match(r, /Due Sun, Sep 20|Due Sep 20/);
    assert.deepEqual(buttons(r), [['redate', 'Re-date'], ['close', 'Close']]);
    assert.match(itemRow(page, 'C-00000001'), /Your card/);
  });

  test('"Meetings": every summary they attended, newest first, each a link', () => {
    const links = [...sectionHtml(page, 'group-meetings').matchAll(/href="#\/meetings\/([^"?]+)"/g)].map((m) => decodeURIComponent(m[1]));
    assert.deepEqual(links, [M_SAM, M_SAM_OLD]);
  });

  test('Close on a They owe row closes it at the top of Done; the row stays with Reopen, and one line says so', async () => {
    const id = 'A-260820-1';
    await click(page, id, 'close');
    assert.deepEqual(site.api.ledger().items[id], { column: 'done', closed: AS_OF });
    assert.equal((await site.api.board()).cards.find((c) => c.column === 'done').id, id);
    assert.deepEqual(rowIds(page, 'they-owe'), THEY_OWE_SAM, 'the row stays where it was');
    assert.match(itemRow(page, id), /Closed Sep 22/);
    assert.deepEqual(buttons(itemRow(page, id)), [['reopen', 'Reopen']]);
    assert.equal(page.el('person-status').textContent, 'Closed “Sam: due in three days”.');
    assert.equal((await person(site, 'Sam Torres')).theyOwe.length, 5);
  });

  test('Reopen puts it back at the top of To do', async () => {
    const id = 'A-260820-1';
    await click(page, id, 'reopen');
    assert.deepEqual(site.api.ledger().items[id], { column: 'todo' });
    assert.match(itemRow(page, id), /Due in 3 days/);
  });

  test('Re-date on a You owe row stores my due date', async () => {
    const id = 'A-260820-2';
    await click(page, id, 'redate');
    assert.match(itemRow(page, id), /<input[^>]*type="date"[^>]*id="today-due"/);
    assert.equal(page.el('today-due').value, '2026-09-20');
    page.el('today-due').value = '2026-10-02';
    await click(page, id, 'save-due');
    assert.deepEqual(site.api.ledger().items[id], { due: '2026-10-02' });
    assert.doesNotMatch(itemRow(page, id), /id="today-due"/);
    assert.match(itemRow(page, id), /Due Oct 2/);
    assert.equal(page.el('person-status').textContent, 'New due date for “Kevin: past due two days”: Oct 2.');
  });

  test('Close on a You owe row', async () => {
    await click(page, 'C-00000001', 'close');
    assert.equal(site.api.ledger().items['C-00000001'].column, 'done');
  });

  test('the actions are refused for a suggestion not accepted, and an unknown action is not found', async () => {
    const before = site.file(LEDGER);
    assert.equal((await site.post(`/api/people/${enc('Sam Torres')}/items/A-260701-3/close`, {})).status, 409);
    assert.equal((await site.post(`/api/people/${enc('Sam Torres')}/items/A-260820-3/keep`, {})).status, 404);
    assert.equal(site.file(LEDGER), before);
  });

  test('a name not in people.md shows a plain notice and the link back, not an error', async () => {
    const other = await openPage(site, `#/people/${enc('Morgan Diaz')}`);
    assert.doesNotMatch(other.html(), /Something went wrong/);
    assert.match(other.html(), /id="no-person"[^>]*>[^]*Morgan Diaz/);
    assert.match(other.html(), /<a class="back" href="#\/people">← People<\/a>/);
  });
});

describe('Today\'s Team health leads to People, and People to each person\'s page', () => {
  let site;
  before(async () => { site = await startSite({ prepare: writeFixture }); });
  after(async () => { await site?.stop(); });

  test('Team health\'s people rows and "View People" link to #/people; each report there links to #/people/<name>', async () => {
    const page = await openPage(site, '#/today');
    const team = page.el('today-body').innerHTML.split('id="group-team"')[1];
    for (const id of ['team-heavy', 'team-missed']) assert.match(team, new RegExp(`id="${id}" href="#/people"`), id);
    assert.match(team, /<a class="btn team-view" href="#\/people">View People<\/a>/);
    const people = await openPage(site, '#/people');
    for (const name of ['Sam Torres', 'Riley Brooks', 'Alex Kim']) assert.match(people.el('people-body').innerHTML, new RegExp(`href="#/people/${enc(name)}"`), name);
  });
});

describe('a workspace without people.md', () => {
  let site;
  before(async () => { site = await startSite({ prepare: (root) => { writeFixture(root); fs.rmSync(path.join(root, 'people.md')); } }); });
  after(async () => { await site?.stop(); });

  test('the page says so and shows the four column names it needs', async () => {
    const view = await site.api.people();
    assert.equal(view.fileFound, false);
    assert.deepEqual(view.columns, ['Name', 'Role', 'Relationship', 'Also called']);
    assert.deepEqual(view.groups, []);
    const page = await openPage(site, '#/people');
    const html = page.html();
    assert.doesNotMatch(html, /Something went wrong/);
    assert.match(html, /id="people-missing"[^>]*>[^]*There is no <code>people\.md<\/code> in this workspace/);
    for (const c of ['Name', 'Role', 'Relationship', 'Also called']) assert.match(page.el('people-missing').innerHTML || html, new RegExp(`<th[^>]*>${c}</th>`), c);
  });

  test('"Not in people.md" lists every name found, since the file has none', async () => {
    const view = await site.api.people();
    assert.deepEqual(view.notInPeople, ['Casey Nguyen', 'Dana Whitfield', 'Jordan Lee', 'Kevin', 'Kevin Collins', 'Morgan Diaz', 'Riley', 'Riley Brooks', 'Sam Torres', 'Sammy', 'Taylor Fox']);
  });

  test('a person\'s page names the missing file', async () => {
    const res = await personRaw(site, 'Sam Torres');
    assert.equal(res.status, 404);
    assert.match(res.json.error, /people\.md/);
  });

  test('the app never creates or writes people.md', async () => {
    await site.api.everyDefaultResponse();
    await openPage(site, '#/people');
    await site.post('/api/today/items/A-260820-1/close', {});
    assert.equal(site.exists('people.md'), false);
  });
});

describe('people.md is never written', () => {
  let site;
  before(async () => { site = await startSite({ prepare: writeFixture }); });
  after(async () => { await site?.stop(); });

  test('opening the pages and acting on rows leaves it as it was', async () => {
    await openPage(site, '#/people');
    const page = await openPage(site, `#/people/${enc('Sam Torres')}`);
    await click(page, 'A-260820-4', 'close');
    await click(page, 'A-260820-2', 'redate');
    page.el('today-due').value = '2026-10-09';
    await click(page, 'A-260820-2', 'save-due');
    assert.equal(site.file('people.md'), PEOPLE_FILE);
  });
});

describe('the sample', () => {
  let site;
  before(async () => { site = await startSite(); });
  after(async () => { await site?.stop(); });

  test('every name in the sample\'s summaries is in its people.md', async () => {
    assert.deepEqual((await site.api.people()).notInPeople, []);
  });

  test('no person\'s page holds a Manager-only note', async () => {
    const notes = privateNoteTexts(site.root);
    assert.ok(notes.length > 0);
    for (const p of (await site.api.people()).groups.flatMap((g) => g.people)) {
      const res = await personRaw(site, p.name);
      const page = await openPage(site, `#/people/${enc(p.name)}`);
      for (const n of notes) {
        assert.ok(!res.text.includes(n.text.slice(0, 40)), `${p.name}: the answer holds ${n.file}'s note`);
        assert.ok(!page.html().includes(n.text.slice(0, 40)), `${p.name}: the page shows ${n.file}'s note`);
      }
    }
  });
});

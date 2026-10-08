// Step 7: Corrections moves into Agents, as its second section, "Rules learned". What is stored and written is
// unchanged, and so are the element ids the tests and check:app look up. The sidebar is Today, Meetings, Board,
// People, Agents, Library; the old address #/corrections opens Agents at that section.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { openPage } from './helpers/page.js';
import { SITE_DIR, startSite } from './helpers/site.js';

const ENTRY = {
  date: '2026-10-01',
  where: 'Agents page, Rules learned',
  what: 'A correction added from the Agents page.',
  caught_by: 'Me',
  decision: 'Keep adding them here.',
  rule: 'Corrections live with the agents they shape.',
};

// The ids the tests and tools/check-app-probe.js look up on the corrections section.
const IDS = ['add-correction', 'corrections-total', 'corrections-total-label', 'corrections-warnings', 'corrections-missing',
  'corrections-status', 'corrections-table', 'corrections-body', 'correction-dialog', 'correction-form', 'correction-error', 'caught-by-options'];

describe('the sidebar and the welcome window', () => {
  let site;
  before(async () => { site = await startSite(); });
  after(async () => { await site?.stop(); });

  test('the sidebar is Today, Meetings, Board, People, Agents, Library; Corrections is not in it', async () => {
    const [shell] = await site.api.pageShell();
    const links = [...shell.text.matchAll(/<a href="(#\/[\w-]+)" data-page="([\w-]+)">[^]*?<span class="nav-label">([^<]+)<\/span>/g)];
    assert.deepEqual(links.map((m) => [m[1], m[2], m[3]]), [
      ['#/today', 'today', 'Today'],
      ['#/meetings', 'meetings', 'Meetings'],
      ['#/board', 'board', 'Board'],
      ['#/people', 'people', 'People'],
      ['#/agents', 'agents', 'Agents'],
      ['#/library', 'library', 'Library'],
    ]);
    assert.doesNotMatch(shell.text, /#\/corrections|>Corrections</);
  });

  test('the welcome window names the pages as they are now', () => {
    const html = fs.readFileSync(path.join(SITE_DIR, 'public', 'welcome.html'), 'utf8');
    const first = html.match(/<div class="welcome-text" id="first-launch">\s*<p>([^]*?)<\/p>/)[1];
    assert.match(first, /Today, Meetings, Board, People, Agents and Library/);
    assert.doesNotMatch(first, /corrections/i);
    // Still two sentences, as check:app counts them.
    assert.equal([...html.matchAll(/<p>/g)].length >= 2, true);
  });
});

describe('Agents, with "Rules learned"', () => {
  let site;
  before(async () => { site = await startSite(); });
  after(async () => { await site?.stop(); });

  test('the Agents page has two sections: the agents, then "Rules learned" with everything the Corrections page had', async () => {
    const page = await openPage(site, '#/agents');
    const html = page.html();
    assert.equal(page.body.dataset.page, 'agents');
    assert.match(html, /<h1>Agents<\/h1>/);
    const agents = html.indexOf('class="agent-grid"');
    const rules = html.indexOf('<h2 id="rules-learned-h">Rules learned</h2>');
    assert.ok(agents >= 0 && rules > agents, `${agents} < ${rules}`);
    assert.match(html, /<section[^>]*id="rules-learned"/);
    for (const id of IDS) assert.match(html, new RegExp(`id="${id}"`), id);
    const view = await site.api.corrections();
    assert.equal(page.el('corrections-total').textContent, view.total);
    assert.equal(page.rows('corrections-body').length, view.entries.length);
    assert.match(html, /What went wrong, who caught it, what I decided, and the rule it became\. Newest first\./);
  });

  test('#/corrections opens Agents at "Rules learned"', async () => {
    const page = await openPage(site, '#/corrections');
    assert.equal(page.body.dataset.page, 'agents');
    assert.match(page.html(), /<h1>Agents<\/h1>/);
    assert.match(page.html(), /id="rules-learned"/);
    assert.equal(page.el('rules-learned').scrolledTo, true);
  });

  test('a correction is added from the Agents page, and stored exactly as before', async () => {
    const page = await openPage(site, '#/agents');
    const before = site.json('corrections/corrections.json');
    const form = page.el('correction-form');
    for (const [k, v] of Object.entries(ENTRY)) form[k] = { value: v, focus() {} };
    await form.fire('submit');
    assert.equal(page.el('corrections-status').textContent, 'Entry added.');
    const after = site.json('corrections/corrections.json');
    assert.deepEqual(after.entries.slice(0, -1), before.entries);
    assert.deepEqual(after.entries.at(-1), ENTRY);
    assert.equal(after.note, before.note);
    assert.equal(page.el('corrections-total').textContent, before.entries.length + 1);
  });
});

describe('Rules learned when the file is missing or can\'t be read', () => {
  let missing;
  let unreadable;
  before(async () => {
    missing = await startSite({ prepare: (root) => fs.rmSync(path.join(root, 'corrections', 'corrections.json')) });
    unreadable = await startSite({ prepare: (root) => fs.writeFileSync(path.join(root, 'corrections', 'corrections.json'), '{ this is not JSON') });
  });
  after(async () => { await missing?.stop(); await unreadable?.stop(); });

  test('a missing file: a plain notice naming it in the section; the agents are still shown', async () => {
    const page = await openPage(missing, '#/corrections');
    assert.match(page.el('corrections-missing').innerHTML, /There is no <code>corrections\/corrections\.json<\/code>/);
    assert.equal(page.el('corrections-table').hidden, true);
    assert.doesNotMatch(page.html(), /notice-error/);
    assert.match(page.html(), /class="agent-card/);
    assert.equal(missing.exists('corrections/corrections.json'), false);
  });

  test('a file that can\'t be read: an error in the section, not over the whole page; the file is left alone', async () => {
    const page = await openPage(unreadable, '#/agents');
    assert.match(page.html(), /<div class="notice notice-error"[^>]*>[^]*corrections\/corrections\.json could not read/);
    assert.match(page.html(), /class="agent-card/);
    assert.equal(unreadable.file('corrections/corrections.json'), '{ this is not JSON');
  });
});

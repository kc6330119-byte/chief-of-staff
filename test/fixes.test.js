// Step 6, part 1: four small fixes. The edit button is an inline SVG pencil in the text colour; a meeting's tables
// fill their panel; due words that are exactly "Not set" are not repeated as "Said"; dates in the Meetings table
// never wrap. Layout itself is measured in the app window by tools/check-app.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { openPage } from './helpers/page.js';
import { SITE_DIR, startSite } from './helpers/site.js';

const CSS = fs.readFileSync(path.join(SITE_DIR, 'public', 'styles.css'), 'utf8');
const rule = (selector) => {
  const at = CSS.indexOf(`${selector} {`);
  assert.ok(at >= 0, `styles.css has a rule for ${selector}`);
  return CSS.slice(at, CSS.indexOf('}', at));
};
const PENCIL = /<svg\b[^>]*aria-hidden="true"[^>]*>[^]*?<\/svg>/;

let site;
before(async () => { site = await startSite(); });
after(async () => { await site?.stop(); });

describe('1. the edit button is an inline SVG pencil in the normal text colour', () => {
  test('on every Board card', async () => {
    const page = await openPage(site, '#/board');
    const cards = page.cards();
    assert.ok(cards.length > 0);
    for (const card of cards) {
      const btn = card.match(/<button\b[^>]*data-act="edit"[^>]*>([^]*?)<\/button>/);
      assert.ok(btn, 'an edit button');
      assert.match(btn[0], /class="icon-btn edit-btn"/);
      assert.match(btn[1], PENCIL);
      assert.doesNotMatch(btn[1], /✎/);
    }
  });

  test('in the Library', async () => {
    const page = await openPage(site, '#/library');
    const rows = page.rows('library-body');
    assert.ok(rows.length > 0);
    for (const row of rows) {
      const btn = row.match(/<button\b[^>]*data-edit="\d+"[^>]*>([^]*?)<\/button>/);
      assert.ok(btn, 'an edit button');
      assert.match(btn[0], /class="icon-btn edit-btn"/);
      assert.match(btn[1], PENCIL);
      assert.doesNotMatch(btn[1], /✎/);
    }
    assert.doesNotMatch(page.html(), /✎/);
  });

  test('drawn in the text colour, not the faint one', () => {
    assert.match(rule('.icon-btn.edit-btn'), /color:\s*var\(--text\)/);
  });
});

describe('2. a meeting\'s tables fill their panel', () => {
  test('each table sits in its own scrolling block and is as wide as it', async () => {
    const res = await site.api.meetingRaw('2026-09-22_dana-kevin_1on1.md');
    const html = res.json.html;
    const tables = html.match(/<table>/g) || [];
    assert.ok(tables.length >= 2, 'Action Items and Open Items from Earlier Meetings');
    assert.equal((html.match(/<div class="table-scroll"><table>/g) || []).length, tables.length);
    assert.equal((html.match(/<\/table><\/div>/g) || []).length, tables.length);
    assert.match(rule('.prose .table-scroll'), /overflow-x:\s*auto/);
    const table = rule('.prose table');
    assert.match(table, /width:\s*100%/);
    assert.doesNotMatch(table, /display:\s*block/);
  });

  test('raw HTML in a summary is still shown as text', async () => {
    const res = await site.api.meetingRaw('2026-09-22_dana-kevin_1on1.md');
    assert.doesNotMatch(res.json.html, /<div class="table-scroll"><\/div>/);
  });
});

describe('3. due words that are exactly "Not set" are not repeated', () => {
  test('a Board card says "No due date" and no "Said" text', async () => {
    const page = await openPage(site, '#/board');
    // A-260728-1: the summary's Due is "Not set" and it has no date.
    const card = page.cardHtml('A-260728-1');
    assert.doesNotMatch(card, /Not set|[Ss]aid/);
    // Other words are still repeated, even when they start with "Not set".
    assert.match(page.cardHtml('A-260910-1'), /Said “Not set \(immediately implied\)”/);
    assert.match(page.cardHtml('A-260908-5'), /said “Week of Sep 14”/);
  });

  test('the card opened in place says nothing was said', async () => {
    const page = await openPage(site, '#/board');
    await page.clickCard('A-260728-5', 'edit');
    assert.match(page.cardHtml('A-260728-5'), /Nothing was said in the meeting about a due date\./);
    assert.doesNotMatch(page.cardHtml('A-260728-5'), /Not set/);
  });
});

describe('4. dates in the Meetings table never wrap', () => {
  test('the due date and the first-seen date are each kept on one line', async () => {
    const page = await openPage(site, '#/meetings');
    const row = page.rows('tracked-body').find((r) => r.includes('>A-260505-3<'));
    assert.match(row, /<span class="date">May 8, 2026<\/span>/);
    assert.match(row, /<span class="date">May 5, 2026<\/span>/);
    assert.match(rule('.tracked .date'), /white-space:\s*nowrap/);
  });
});

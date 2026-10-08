// Step 10: the three agents and the weekly brief are part of the sample, and each card's rules start collapsed
// behind "Rules (N)", the browser's own disclosure element. That a click or a key opens one card and leaves the
// others closed is checked in the real window by tools/check-app.mjs; here, what the page draws makes that so:
// one <details> per card, none open, none grouped with another.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { openPage } from './helpers/page.js';
import { SITE_DIR, startSite } from './helpers/site.js';

const SAMPLE = path.join(SITE_DIR, 'sample-workspace');
const AGENT_FILES = ['blind-spot-check.md', 'commitment-tracker.md', 'negotiation-prep.md', 'one-on-one-prep.md', 'risk-radar.md'];
const NAMES = ['Coach', 'Blind spot check', 'Commitment tracker', 'Negotiation prep', 'One on one prep', 'Risk radar'];

// The cards as drawn, one string per card.
const cardsOf = (html) => html.split(/<article class="agent-card\b/).slice(1).map((c) => c.split('</article>')[0]);
const rulesBlock = (card) => card.match(/<details class="agent-rules"[^>]*>[^]*?<\/details>/)?.[0] ?? null;

describe('the sample has five agents and the weekly brief', () => {
  test('.claude/agents/ holds the two agents it had and the three that were in extras/', () => {
    const files = fs.readdirSync(path.join(SAMPLE, '.claude', 'agents')).sort();
    assert.deepEqual(files, AGENT_FILES);
  });

  test('CLAUDE.md ends with the weekly-brief section, after "When Kevin asks for one of his agents"', () => {
    const claude = fs.readFileSync(path.join(SAMPLE, 'CLAUDE.md'), 'utf8');
    const heads = [...claude.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    assert.deepEqual(heads.slice(-2), ['When Kevin asks for one of his agents', 'When Kevin asks for the weekly brief']);
    assert.match(claude, /- Don't save the brief unless Kevin asks\.\n$/);
  });

  test('the repository has no extras/ folder, and the README points to none', () => {
    assert.equal(fs.existsSync(path.join(SITE_DIR, 'extras')), false);
    assert.doesNotMatch(fs.readFileSync(path.join(SITE_DIR, 'README.md'), 'utf8'), /extras\//);
  });

  test('the old icon source is gone', () => {
    assert.equal(fs.existsSync(path.join(SITE_DIR, 'app', 'icon-source.png')), false);
  });
});

describe('the Agents page and the Library with five agents', () => {
  let site;
  before(async () => { site = await startSite(); });
  after(async () => { await site?.stop(); });

  test('the coach and five agents, every field read, nothing it could not read', async () => {
    const view = await site.api.agents();
    assert.deepEqual(view.cards.map((c) => c.name), NAMES);
    assert.deepEqual(view.warnings, []);
    for (const c of view.cards) assert.ok(c.purposeHtml && c.sourcesHtml && c.lastReviewed && c.rulesHtml.length, `${c.name} has every field`);
  });

  test('the new agents read no library file, and no book\'s "Used by" disagrees with an agent\'s Sources line', async () => {
    const { cards } = await site.api.agents();
    for (const name of ['Commitment tracker', 'One on one prep', 'Risk radar']) {
      assert.doesNotMatch(cards.find((c) => c.name === name).sources, /library\//, name);
    }
    const lib = await site.api.library();
    assert.deepEqual(lib.agents, NAMES);
    for (const b of lib.books) {
      assert.deepEqual(b.checks, [], `${b.title} has no check mark`);
      for (const u of b.usedBy) assert.ok(lib.agents.includes(u), `${b.title}: "${u}" is a card on the Agents page`);
    }
  });

  test('every card starts closed: the rules are behind "Rules (N)", N is the number of rules, and nothing is open', async () => {
    const { cards } = await site.api.agents();
    const drawn = cardsOf((await openPage(site, '#/agents')).html());
    assert.equal(drawn.length, cards.length);
    drawn.forEach((html, i) => {
      const block = rulesBlock(html);
      assert.ok(block, `${cards[i].name} has its rules in a disclosure`);
      assert.doesNotMatch(block.match(/^<details[^>]*>/)[0], /\sopen\b/, `${cards[i].name} starts closed`);
      const summary = block.match(/<summary[^>]*>([^]*?)<\/summary>/)?.[1].replace(/<[^>]+>/g, '').trim();
      assert.equal(summary, `Rules (${cards[i].rulesHtml.length})`);
      assert.equal(block.match(/<li>/g)?.length, cards[i].rulesHtml.length, `${cards[i].name}: every rule is inside`);
      assert.equal(html.split(block).join('').match(/<li>/g), null, `${cards[i].name}: no rule outside the disclosure`);
    });
  });

  test('the shown parts stay outside the rules: name, file, review mark, Purpose, Sources, Last reviewed and Tools', async () => {
    const { cards } = await site.api.agents();
    const drawn = cardsOf((await openPage(site, '#/agents')).html());
    drawn.forEach((html, i) => {
      const outside = html.replace(rulesBlock(html), '');
      const parts = ['class="agent-name"', 'class="agent-file"', 'class="badge', '<dt>Purpose</dt>', '<dt>Sources it may read</dt>', '<dt>Last reviewed</dt>'];
      // The coach has no tools: line, so its card has no Tools line.
      if (cards[i].tools) parts.push('<dt>Tools</dt>');
      for (const part of parts) assert.ok(outside.includes(part), `${cards[i].name}: ${part}`);
    });
  });

  test('each card opens on its own: one disclosure per card, none tied to another, no script that opens them', async () => {
    const html = (await openPage(site, '#/agents')).html();
    const blocks = cardsOf(html).map(rulesBlock);
    assert.equal(new Set(blocks).size, blocks.length);
    // A shared name attribute would make them an accordion, where opening one closes the rest.
    for (const b of blocks) assert.doesNotMatch(b.match(/^<details[^>]*>/)[0], /\sname=/);
    assert.doesNotMatch(fs.readFileSync(path.join(SITE_DIR, 'public', 'app.js'), 'utf8'), /agent-rules[^\n]*\.open\s*=/);
  });
});

describe('a card whose rules could not be read', () => {
  let site;
  before(async () => {
    site = await startSite({
      prepare(root) {
        const f = path.join(root, '.claude', 'agents', 'risk-radar.md');
        fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/^(\d+)\. /gm, '- '));
      },
    });
  });
  after(async () => { await site?.stop(); });

  test('shows "could not read" on the closed card, with no disclosure to open', async () => {
    const drawn = cardsOf((await openPage(site, '#/agents')).html());
    const risk = drawn.find((h) => h.includes('risk-radar.md'));
    assert.equal(rulesBlock(risk), null);
    assert.match(risk, /<h4>Rules<\/h4>\s*<p><span class="cnr">could not read<\/span><\/p>/);
    for (const h of drawn.filter((x) => x !== risk)) assert.ok(rulesBlock(h));
  });
});

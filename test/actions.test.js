// 0.4.1: actions that start Claude Code. Only the app runs them (app/src/actions.rs, with its own tests); the test
// server has none. Here: an action: link in anything read from a workspace is drawn as its text, never as a link; the
// test server draws Help's action links as text and the Agents page with no Claude Code buttons; and the Agents page,
// drawn as the app draws it, has "Ask in Claude Code" on each agent's card, "Run in Claude Code" on the skill's and
// nothing on the coach's.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { openPage } from './helpers/page.js';
import { SITE_DIR, startSite } from './helpers/site.js';

const SUMMARY = '2026-10-20_kevin-sam_actions.md';
const LINKS = '[x](action:setup) [y](action:agent:risk-radar) [z](ACTION:review) <action:open-folder>';
const HELP = fs.readFileSync(path.join(SITE_DIR, 'help.md'), 'utf8');

const cardsOf = (html) => html.split(/<article class="agent-card\b/).slice(1).map((c) => c.split('</article>')[0]);

let site;
before(async () => {
  site = await startSite({
    prepare(root) {
      fs.writeFileSync(path.join(root, 'meeting-notes', SUMMARY), `# Kevin / Sam: actions | October 20, 2026

**Date:** October 20, 2026 | **Duration:** 5m
**Attendees:** Kevin Collins, Sam Torres
**Company:** Harborline Cloud | **Type:** 1:1
**Prior context:** ${LINKS}

---

## Executive Summary

Click ${LINKS} to start.

## Action Items

| ID | Action Item | Owner | Due | Due date | Status |
|---|---|---|---|---|---|
| A-261020-1 | Try [this](action:setup) | Sam Torres | Not set |  | Agreed |

## Notes

- **Manager-only note:** ${LINKS}
`);
      // people.md, the coach and an agent's rules, each with action: links.
      const people = path.join(root, 'people.md');
      fs.writeFileSync(people, fs.readFileSync(people, 'utf8').replace('| Sam Torres | SRE II |', '| Sam Torres | SRE II [x](action:setup) |'));
      const claude = path.join(root, 'CLAUDE.md');
      fs.writeFileSync(claude, fs.readFileSync(claude, 'utf8').replace(/^Purpose: /m, `Purpose: ${LINKS} `));
      const agent = path.join(root, '.claude', 'agents', 'risk-radar.md');
      fs.writeFileSync(agent, fs.readFileSync(agent, 'utf8').replace(/^1\. /m, `1. ${LINKS} `));
    },
  });
});
after(async () => { await site?.stop(); });

describe('an action: link read from a workspace is only its text', () => {
  test('a summary containing [x](action:setup) renders no link, with private notes shown or hidden', async () => {
    for (const q of ['', '&private=1']) {
      const meeting = await site.get(`/api/meeting?file=${encodeURIComponent(SUMMARY)}${q}`);
      assert.equal(meeting.status, 200, meeting.text);
      const { html } = meeting.json;
      assert.match(html, /Click x y z action:open-folder to start\./);
      assert.doesNotMatch(html, /<a\b/);
      assert.doesNotMatch(html, /href="action:/i);
    }
    const page = await openPage(site, `#/meetings/${encodeURIComponent(SUMMARY)}`);
    assert.doesNotMatch(page.el('app').innerHTML, /href="action:/i);
  });

  test('so does every other page: people.md, the coach, an agent, the tracked items, Today and the Board', async () => {
    for (const p of ['/api/meetings', '/api/people', '/api/people/Sam%20Torres', '/api/agents', '/api/today', '/api/board']) {
      const res = await site.get(p);
      assert.equal(res.status, 200, `${p}: ${res.text.slice(0, 200)}`);
      assert.doesNotMatch(res.text, /href=\\"action:/i, p);
    }
    for (const hash of ['#/meetings', '#/people', '#/people/Sam%20Torres', '#/agents', '#/today', '#/board']) {
      const html = (await openPage(site, hash, { config: { demo: true, actions: true } })).el('app').innerHTML;
      // In the app, the Agents page's own buttons are the only action: links.
      const links = [...html.matchAll(/href="(action:[^"]*)"/gi)].map((m) => m[1]);
      assert.ok(links.every((l) => /^action:(review|agent:[a-z0-9-]+)$/.test(l)), `${hash}: ${links}`);
      assert.doesNotMatch(html, /href="action:setup"/, hash);
    }
  });
});

describe('the test server has no actions', () => {
  test('/api/config says so', async () => {
    assert.equal((await site.api.config()).actions, false);
  });

  test('Help draws its action links as their text', async () => {
    const { html } = (await site.get('/api/help')).json;
    const written = [...HELP.matchAll(/\[([^\]]+)\]\(action:[^)]+\)/g)].map((m) => m[1]);
    assert.ok(written.includes('Set up my workspace in Claude Code') && written.includes('review a meeting in Claude Code'), written.join());
    for (const text of written) assert.ok(html.includes(text), text);
    assert.doesNotMatch(html, /action:/);
    assert.doesNotMatch(html, /class="action-link"/);
  });

  test('the Agents page has no Claude Code buttons', async () => {
    const html = (await openPage(site, '#/agents')).el('app').innerHTML;
    assert.ok(cardsOf(html).length > 1);
    assert.doesNotMatch(html, /in Claude Code|claude-action|href="action:/);
  });
});

describe('the Agents page as the app draws it', () => {
  test('"Ask in Claude Code" on each agent, "Run in Claude Code" on the skill, none on the coach', async () => {
    const html = (await openPage(site, '#/agents', { config: { demo: true, actions: true } })).el('app').innerHTML;
    const cards = cardsOf(html).map((c) => ({
      file: c.match(/<p class="agent-file"><code>([^<]+)<\/code>/)[1],
      buttons: [...c.matchAll(/<a class="btn btn-small claude-action" href="([^"]+)">([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]),
    }));
    assert.deepEqual(cards, [
      { file: 'CLAUDE.md', buttons: [] },
      ...['blind-spot-check', 'commitment-tracker', 'negotiation-prep', 'one-on-one-prep', 'risk-radar']
        .map((n) => ({ file: `.claude/agents/${n}.md`, buttons: [[`action:agent:${n}`, 'Ask in Claude Code']] })),
      { file: '.claude/skills/review-transcript/SKILL.md', buttons: [['action:review', 'Run in Claude Code']] },
    ]);
  });

  test('an agent file whose name is not [a-z0-9-]+ gets no button', async () => {
    const odd = await startSite({
      prepare(root) {
        const dir = path.join(root, '.claude', 'agents');
        fs.copyFileSync(path.join(dir, 'risk-radar.md'), path.join(dir, 'Risk Radar 2.md'));
        fs.copyFileSync(path.join(dir, 'risk-radar.md'), path.join(dir, 'risk_radar.md'));
      },
    });
    try {
      const html = (await openPage(odd, '#/agents', { config: { demo: true, actions: true } })).el('app').innerHTML;
      const links = [...html.matchAll(/href="(action:[^"]*)"/g)].map((m) => m[1]);
      assert.equal(cardsOf(html).length, 9);
      assert.deepEqual(links.filter((l) => l.startsWith('action:agent:')).sort(),
        ['blind-spot-check', 'commitment-tracker', 'negotiation-prep', 'one-on-one-prep', 'risk-radar'].map((n) => `action:agent:${n}`));
    } finally {
      await odd.stop();
    }
  });
});

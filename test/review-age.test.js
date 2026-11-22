// 0.4.2: "today" is a value the test server fixes (MC_TODAY), never the real date. In the sample, the Agents page's
// review age counts to the sample's as-of date (its newest meeting), like everything else there; a "Last reviewed"
// after that date is 0 days and not due. A workspace of your own counts to today, as before.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { everyAnswer } from './helpers/answers.js';
import { SITE_DIR, startSite } from './helpers/site.js';

const DATES = ['2026-10-20', '2027-06-01'];
const SAMPLE_AS_OF = '2026-09-22';
const days = (from, to) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;

// Each site in turn, stopped after `fn` has read it.
async function at(today, demo, fn) {
  const site = await startSite({ today, demo });
  try {
    return await fn(site);
  } finally {
    await site.stop();
  }
}

test('the sample\'s answers from every API are byte-identical with today fixed at 2026-10-20 and at 2027-06-01', async () => {
  const [a, b] = await Promise.all(DATES.map((d) => at(d, true, everyAnswer)));
  assert.ok(Object.keys(a).length > 30, Object.keys(a).length);
  assert.deepEqual(Object.keys(a), Object.keys(b));
  for (const p of Object.keys(a)) assert.equal(a[p], b[p], p);
});

test('in the sample, review age counts to its newest meeting: every review date is after it, so 0 days, and none is due', async () => {
  for (const today of DATES) {
    await at(today, true, async (site) => {
      const view = (await site.get('/api/agents')).json;
      assert.equal(view.today, SAMPLE_AS_OF, today);
      assert.equal(view.cards.length, 7, 'the coach, five agents and the skill');
      for (const c of view.cards) {
        assert.ok(c.lastReviewed > SAMPLE_AS_OF, `${c.file}: ${c.lastReviewed}`);
        assert.deepEqual([c.daysSince, c.reviewDue], [0, false], `${c.file} at ${today}`);
      }
      const foot = (await site.get('/api/today')).json.foot;
      assert.equal(foot.agentsReviewDue, 0, today);
    });
  }
});

test('in the sample, a review date before its newest meeting counts the days to it', async () => {
  const site = await startSite({
    today: '2027-06-01',
    prepare(root) {
      const file = path.join(root, '.claude', 'agents', 'risk-radar.md');
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^Last reviewed: .*$/m, 'Last reviewed: 2026-08-01'));
    },
  });
  try {
    const card = (await site.get('/api/agents')).json.cards.find((c) => c.file === '.claude/agents/risk-radar.md');
    assert.deepEqual([card.daysSince, card.reviewDue], [days('2026-08-01', SAMPLE_AS_OF), true]);
    assert.equal((await site.get('/api/today')).json.foot.agentsReviewDue, 1);
  } finally {
    await site.stop();
  }
});

test('a workspace of your own counts review age to today, as before: a later date is fewer days ahead, not 0', async () => {
  for (const today of DATES) {
    await at(today, false, async (site) => {
      const view = (await site.get('/api/agents')).json;
      assert.equal(view.today, today);
      for (const c of view.cards) {
        const n = days(c.lastReviewed, today);
        assert.deepEqual([c.daysSince, c.reviewDue], [n, n > 30], `${c.file} at ${today}`);
      }
      const due = view.cards.filter((c) => c.reviewDue).length;
      assert.equal((await site.get('/api/today')).json.foot.agentsReviewDue, due, today);
    });
  }
  // The skill was reviewed on 2026-11-21: 32 days ahead of 2026-10-20, and long due by 2027-06-01.
  const skill = (view) => view.cards.find((c) => c.role === 'skill');
  assert.equal(skill(await at('2026-10-20', false, async (s) => (await s.get('/api/agents')).json)).daysSince, -32);
  assert.equal(skill(await at('2027-06-01', false, async (s) => (await s.get('/api/agents')).json)).reviewDue, true);
});

test('only the test server reads MC_TODAY: the core, the app and the pages never name it', () => {
  const files = (dir) => fs.readdirSync(path.join(SITE_DIR, dir), { recursive: true }).filter((f) => /\.(rs|js|html)$/.test(f)).map((f) => path.join(dir, f));
  for (const f of [...files('core/src'), ...files('app/src'), ...files('public')]) {
    assert.doesNotMatch(fs.readFileSync(path.join(SITE_DIR, f), 'utf8'), /MC_TODAY/, f);
  }
  assert.match(fs.readFileSync(path.join(SITE_DIR, 'test-server', 'src', 'main.rs'), 'utf8'), /std::env::var\("MC_TODAY"\)/);
});

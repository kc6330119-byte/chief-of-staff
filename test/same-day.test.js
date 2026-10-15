// 0.3.3: two rules for the coach, in the sample's and the starter's CLAUDE.md: a letter after the date for a second
// meeting's IDs on the same day, and shared copies of a summary kept out of meeting-notes/. Nothing else in either file
// changes apart from "Last reviewed", and the app answers for the sample exactly as it did in 0.3.2.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { SITE_DIR, startSite } from './helpers/site.js';

const SAMPLE = path.join(SITE_DIR, 'sample-workspace');
const STARTER = path.join(SITE_DIR, 'starter-workspace');

const LETTER_RULE = `- If another summary in meeting-notes/ already uses IDs for this date, add the next
  letter after the date: A-YYMMDDb-n, then A-YYMMDDc-n. Never reuse an ID.
`;
const SHARED_RULE = `- Keep shared or exported copies of a summary out of meeting-notes/ (for example in
  shared/). Every file in meeting-notes/ is read as its own meeting.
`;
const ID_RULE = `- Give every new action item an ID: A-YYMMDD-n, the meeting date and its row number.
  Never change or reuse an ID.
`;
const REVIEWED_032 = 'Last reviewed: 2026-10-08\n';
const REVIEWED_033 = 'Last reviewed: 2026-10-14\n';

// The SHA-256 of each CLAUDE.md as committed in 0.3.2 (f7abe43).
const SHA_032 = {
  sample: 'dde4aaba589658171a3f3a720e185a2a140b5c256ec4f639e3fd2100c1eb86bc',
  starter: '0986827e495ba568943bc23467e30f20ac77dded71ab835cc03efde8772e1d33',
};

const read = (dir) => fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
// The file without the two new lines and with 0.3.2's "Last reviewed".
const as032 = (text) => text.replace(LETTER_RULE, '').replace(SHARED_RULE, '').replace(REVIEWED_033, REVIEWED_032);
// The "## Action items" section, up to the next heading.
const actionItems = (text) => text.match(/^## Action items\n[\s\S]*?(?=^## )/m)[0];

describe('both CLAUDE.md files have the two rules, and nothing else changed', () => {
  for (const [name, dir] of [['sample', SAMPLE], ['starter', STARTER]]) {
    test(`${name}: the letter rule comes right after the ID rule, and the shared-copies rule ends Action items`, () => {
      const section = actionItems(read(dir));
      assert.ok(section.includes(ID_RULE + LETTER_RULE), section);
      assert.ok(section.endsWith(SHARED_RULE + '\n'), section);
      assert.equal(read(dir).split(LETTER_RULE).length, 2);
      assert.equal(read(dir).split(SHARED_RULE).length, 2);
    });

    test(`${name}: "Last reviewed" is 2026-10-14`, () => {
      assert.match(read(dir), /^Last reviewed: 2026-10-14$/m);
    });

    test(`${name}: without the two lines and with 0.3.2's "Last reviewed", the file is 0.3.2's byte for byte`, () => {
      assert.equal(sha(as032(read(dir))), SHA_032[name]);
    });
  }
});

// Every read the app offers, for the sample's data.
async function everyAnswer(site) {
  const paths = ['/api/config', '/api/today', '/api/today?week=this', '/api/today?week=last', '/api/meetings', '/api/board',
    '/api/library', '/api/corrections', '/api/agents', '/api/people', '/api/people?private=1', '/api/help'];
  for (const m of (await site.get('/api/meetings')).json.meetings) {
    paths.push(`/api/meeting?file=${encodeURIComponent(m.file)}`, `/api/meeting?file=${encodeURIComponent(m.file)}&private=1`);
  }
  for (const f of fs.readdirSync(path.join(site.root, 'library')).filter((x) => x.endsWith('.md')).sort()) {
    paths.push(`/api/library/notes?file=${encodeURIComponent(f)}`);
  }
  for (const p of (await site.get('/api/people')).json.groups.flatMap((g) => g.people)) {
    paths.push(`/api/people/${encodeURIComponent(p.name)}`, `/api/people/${encodeURIComponent(p.name)}?private=1`);
  }
  const root = path.basename(site.root);
  const out = {};
  for (const p of paths) {
    const res = await site.get(p);
    // Each copy lives in its own scratch folder, whose name /api/config reports.
    out[p] = `${res.status} ${res.text.split(root).join('<root>')}`;
  }
  return out;
}

describe('the sample\'s answers from every API are 0.3.2\'s', () => {
  const put = (text) => (root) => fs.writeFileSync(path.join(root, 'CLAUDE.md'), text);
  let now;
  let old;
  let oldToday;
  before(async () => {
    const sites = [
      await startSite(),
      await startSite({ prepare: put(as032(read(SAMPLE))) }),
      // 0.3.2's file with only "Last reviewed" moved to 0.3.3's date.
      await startSite({ prepare: put(as032(read(SAMPLE)).replace(REVIEWED_032, REVIEWED_033)) }),
    ];
    try {
      [now, old, oldToday] = await Promise.all(sites.map(everyAnswer));
    } finally {
      await Promise.all(sites.map((s) => s.stop()));
    }
  });

  test('every read covers each meeting, person and notes file', () => {
    assert.ok(Object.keys(now).length > 30, Object.keys(now).length);
    assert.deepEqual(Object.keys(now), Object.keys(old));
    for (const [p, answer] of Object.entries(now)) assert.match(answer, /^200 /, p);
  });

  test('every answer but the Agents page\'s is byte-identical to 0.3.2\'s', () => {
    for (const p of Object.keys(now).filter((x) => x !== '/api/agents')) assert.equal(now[p], old[p], p);
  });

  test('with "Last reviewed" alone moved to the same date, every answer, Agents too, is byte-identical', () => {
    assert.deepEqual(now, oldToday);
  });

  test('on the Agents page, only the coach\'s "Last reviewed" differs from 0.3.2', () => {
    const json = (answer) => JSON.parse(answer.slice(4));
    const a = json(now['/api/agents']);
    const b = json(old['/api/agents']);
    const coachA = a.cards.find((c) => c.file === 'CLAUDE.md');
    const coachB = b.cards.find((c) => c.file === 'CLAUDE.md');
    assert.equal(coachA.lastReviewed, '2026-10-14');
    assert.equal(coachB.lastReviewed, '2026-10-08');
    for (const c of [coachA, coachB]) for (const k of ['lastReviewed', 'lastReviewedText', 'daysSince']) delete c[k];
    assert.deepEqual(a, b);
  });
});

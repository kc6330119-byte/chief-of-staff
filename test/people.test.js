// people.md (step 3): who is who, read from the workspace root. The app reads it and never writes it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { openPage } from './helpers/page.js';
import { startSite } from './helpers/site.js';

const PEOPLE_HEADER = '| Name | Role | Relationship | Also called |\n|---|---|---|---|\n';
const writePeople = (rows) => (root) => fs.writeFileSync(path.join(root, 'people.md'), `# People\n\n${PEOPLE_HEADER}${rows.join('\n')}\n`);

describe('the sample people.md', () => {
  let site;
  before(async () => { site = await startSite(); });
  after(async () => { await site?.stop(); });

  test('/api/people returns the list, in file order', async () => {
    const view = await site.api.people();
    assert.equal(view.file, 'people.md');
    assert.equal(view.fileFound, true);
    assert.deepEqual(view.warnings, []);
    assert.deepEqual(view.people, [
      { name: 'Kevin Collins', role: 'SRE Manager', relationship: 'me', alsoCalled: ['Kevin'] },
      { name: 'Dana Whitfield', role: "Kevin's manager", relationship: 'manager', alsoCalled: ['Dana'] },
      { name: 'Praveen Iyer', role: 'Senior SRE', relationship: 'report', alsoCalled: ['Praveen'] },
      { name: 'Sam Torres', role: 'SRE II', relationship: 'report', alsoCalled: ['Sam'] },
      { name: 'Riley Brooks', role: 'SRE I', relationship: 'report', alsoCalled: ['Riley'] },
    ]);
  });
});

describe('"Also called"', () => {
  let site;
  before(async () => {
    site = await startSite({
      prepare(root) {
        writePeople([
          '| Kevin Collins | SRE Manager | me | Kevin |',
          '| Sam Torres | SRE II | report | Sammy, S.T. |',
        ])(root);
        fs.writeFileSync(path.join(root, 'meeting-notes', '2026-10-05_kevin-sam_1on1.md'), `# Kevin & Sam | October 5, 2026

**Date:** October 5, 2026 | **Duration:** 1m
**Attendees:** Kevin Collins (SRE Manager), Sam Torres (SRE II)
**Company:** Harborline Cloud | **Type:** 1:1

## Action Items

| ID | Action Item | Owner | Due | Due date | Status |
|---|---|---|---|---|---|
| A-261005-1 | Owned by a nickname | Sammy | Not set |  | Open |
| A-261005-2 | Owned by the other nickname | S.T. | Not set |  | Open |
`);
      },
    });
  });
  after(async () => { await site?.stop(); });

  test('each name in "Also called" resolves to the Name', async () => {
    const view = await site.api.people();
    assert.deepEqual(view.people.find((p) => p.name === 'Sam Torres').alsoCalled, ['Sammy', 'S.T.']);
    const tracked = await site.api.tracked();
    for (const id of ['A-261005-1', 'A-261005-2']) {
      const item = tracked.find((r) => r.id === id);
      assert.equal(item.owner, 'Sam Torres', id);
      assert.deepEqual(item.problems, [], id);
    }
  });
});

describe('a workspace without people.md', () => {
  let site;
  before(async () => { site = await startSite({ prepare: (root) => fs.rmSync(path.join(root, 'people.md')) }); });
  after(async () => { await site?.stop(); });

  test('/api/people names the missing file', async () => {
    const view = await site.api.people();
    assert.equal(view.fileFound, false);
    assert.equal(view.file, 'people.md');
    assert.deepEqual(view.people, []);
  });

  test('the Meetings page shows a notice naming people.md, and owners are not flagged', async () => {
    const data = (await site.get('/api/meetings')).json;
    assert.ok(data.tracked.length > 0);
    assert.ok(!data.warnings.some((w) => /people\.md/.test(w.message)), 'no owner is flagged against a file that is not there');
    const page = await openPage(site, '#/meetings');
    assert.doesNotMatch(page.html(), /Something went wrong/);
    assert.match(page.html(), /notice[^]*people\.md/);
  });

  test('the app never creates or writes people.md', async () => {
    await site.api.everyDefaultResponse();
    assert.equal((await site.api.moveCard('A-260505-1', 'done')).status, 200);
    await openPage(site, '#/meetings');
    await openPage(site, '#/board');
    assert.equal(site.exists('people.md'), false);
  });
});

describe('the "me" row', () => {
  let none;
  let two;
  before(async () => {
    none = await startSite({ prepare: writePeople(['| Kevin Collins | SRE Manager | report | Kevin |', '| Sam Torres | SRE II | report | Sam |']) });
    two = await startSite({ prepare: writePeople(['| Kevin Collins | SRE Manager | me | Kevin |', '| Sam Torres | SRE II | me | Sam |']) });
  });
  after(async () => { await none?.stop(); await two?.stop(); });

  test('no "me" row is flagged', async () => {
    const view = await none.api.people();
    assert.ok(view.warnings.some((w) => w.file === 'people.md' && /"me"/.test(w.message)), JSON.stringify(view.warnings));
  });

  test('more than one "me" row is flagged', async () => {
    const view = await two.api.people();
    assert.ok(view.warnings.some((w) => w.file === 'people.md' && /"me"/.test(w.message)), JSON.stringify(view.warnings));
  });
});

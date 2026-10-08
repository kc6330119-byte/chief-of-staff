// The Help page (0.2.0): help.md at the repository's root, drawn at #/help by the core as a summary is. It is the
// same for every workspace, reads nothing in it, writes nothing and links nowhere outside the app.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { openPage } from './helpers/page.js';
import { SITE_DIR, changedFiles, snapshot, startSite } from './helpers/site.js';

// The page's sections, in this order.
const SECTIONS = ['Getting started', 'Make it your own', 'Everyday use', 'FAQ', 'Troubleshooting'];
const SOURCE = fs.readFileSync(path.join(SITE_DIR, 'help.md'), 'utf8');

const decode = (s) => s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const headings = (html, level) => [...html.matchAll(new RegExp(`<h${level}>(.*?)</h${level}>`, 'g'))].map((m) => decode(m[1]));

let site;
let page;
let html;
let untouched;
before(async () => {
  site = await startSite();
  untouched = snapshot(site.root);
  page = await openPage(site, '#/help');
  html = page.el('app').innerHTML;
});
after(async () => { await site?.stop(); });

// The FAQ explains the words "could not read", so what is checked is the app's mark for them and its list of problems.
test('the Help page draws, with no "could not read" and no error', () => {
  assert.equal(page.body.dataset.page, 'help');
  assert.match(html, /<article class="prose help" id="help-article">/);
  assert.doesNotMatch(html, /class="cnr"/);
  assert.doesNotMatch(html, /class="notice/);
  assert.doesNotMatch(html, /Something went wrong/);
  assert.doesNotMatch(site.output(), /could not read/i);
});

test('it has the five sections, in order', () => {
  assert.deepEqual(headings(html, 2), SECTIONS);
});

test('every heading in help.md is on the page, in order', () => {
  const written = [...SOURCE.matchAll(/^(#{1,3}) (.+)$/gm)].map((m) => [m[1].length, m[2].replace(/`/g, '')]);
  const drawn = [...html.matchAll(/<h([1-3])>(.*?)<\/h\1>/g)].map((m) => [Number(m[1]), decode(m[2])]);
  assert.ok(written.length > SECTIONS.length);
  assert.deepEqual(drawn, written);
});

test('it links nowhere outside the app', () => {
  assert.doesNotMatch(SOURCE, /https?:\/\//);
  assert.doesNotMatch(html, /href="(?!#)/);
});

test('it is the same for every workspace, and opening it writes nothing', async () => {
  const empty = await startSite({ prepare(root) { for (const f of fs.readdirSync(root)) fs.rmSync(path.join(root, f), { recursive: true, force: true }); } });
  try {
    assert.equal((await empty.get('/api/help')).text, (await site.get('/api/help')).text);
  } finally {
    await empty.stop();
  }
  assert.deepEqual(changedFiles(untouched, snapshot(site.root)), []);
});

test('the Help link is in the sidebar foot', async () => {
  const shell = (await site.get('/')).text;
  const foot = shell.slice(shell.indexOf('class="sidebar-foot"'));
  assert.match(foot, /<a class="help-link" href="#\/help" data-page="help">[^]*?<span>Help<\/span>/);
  // The sidebar's pages are unchanged; Help is not one of them.
  assert.doesNotMatch(shell.slice(shell.indexOf('class="site-nav"'), shell.indexOf('class="sidebar-foot"')), /#\/help/);
});

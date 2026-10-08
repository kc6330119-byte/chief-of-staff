// The app check (SPEC.md, decision 53). Builds the app twice (a probe build that a script can drive, and the
// normal release build), runs a session of reads and saves in the real window, restarts it, and checks:
//   - what changed outside the workspace: only the settings file, holding the folder path and nothing else
//   - what changed inside the workspace: only actions/ledger.json, notes/notes.json, books.json and corrections.json
//   - the app opens on Today; at 1440 and 1100 px Today draws its groups with nothing overflowing and no chip or
//     title cut off; Close on Today closes the item and the row updates in place
//   - the sidebar is Today, Meetings, Board, People, Agents, Library; at 1440 and 1100 px People, one person's page
//     and Agents (with "Rules learned") are drawn with nothing overflowing and nothing cut off, and People's columns
//     line up whether or not a row has a flag; #/corrections opens
//     Agents at "Rules learned"
//   - Agents shows the coach and every agent file (five in the sample); each card's rules start closed behind
//     "Rules (N)", a click opens one card and leaves the others closed, and all are closed again after a page load;
//     screenshots of the page with every card closed and with one open
//   - the edit button is a pencil in the text colour, a meeting's tables fill their block, and a date in the Meetings
//     table never wraps
//   - no listening port or socket for the app's process, every page loads, the Board shows the action items with
//     no import and opening it writes nothing, moves, Close and Reopen land in the ledger, saves land in the
//     files, an age or an ID in the Meetings table never wraps, at 1440 and 1100 px no card's ID or title is cut off
//     and nothing overflows its column, Close and Reopen put a card at the top, an action item opens in place, the private-notes switch is off after a reload and a restart, web links leave the window, the
//     content security policy blocks anything from elsewhere, and no page shows "Invalid Date"
//   - a summary named with spaces, an apostrophe, an ampersand and an accented letter opens from the Meetings
//     page and from its Board card, and a name that is not a summary shows a plain notice
//   - the Help link in the sidebar foot opens the Help page with its five sections, nothing marked "could not read" and
//     no link out of the app; the File menu has New Workspace… just above Open Sample Workspace… (the Save panel itself is
//     not driven); screenshots of the Help page, the welcome window and the File menu
//   - notes between meetings: a note added on a person's page and one on a meeting's page (with the meeting and its one
//     other attendee filled in) land in notes/notes.json; with the switch off they show as "private note", the switch
//     shows the text and hides it again; the Board card and the Today row of the note's item carry the "1 note" marker
//     and the People row the count, never the text; at 1440 and 1100 px nothing in the notes sections overflows; after
//     a restart the notes are there with the switch off
//
//   node tools/check-app.mjs            build both, then check
//   node tools/check-app.mjs --no-build check the bundles already built
//
// It touches only this folder and the app's own settings folder, which it puts back as it found it.
// Screenshots and the report go to target/app-check/.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appBundle, buildApp } from './build-app.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONF = JSON.parse(fs.readFileSync(path.join(REPO, 'app', 'tauri.conf.json'), 'utf8'));
const NAME = CONF.productName;
const ID = CONF.identifier;
const EXE = 'chief-of-staff';
const DATA = path.resolve(REPO, process.env.MC_TEST_DATA || 'sample-workspace');
const OUT = path.join(REPO, 'target', 'app-check');
const WS = path.join(OUT, 'workspace');
const SHOTS = path.join(OUT, 'shots');
const HOME = os.homedir();
const SETTINGS_DIR = path.join(HOME, 'Library', 'Application Support', ID);
const SETTINGS = path.join(SETTINGS_DIR, 'settings.json');
const WRITABLE = ['actions/ledger.json', 'notes/notes.json', 'library/books.json', 'corrections/corrections.json'];
// The two notes between meetings the session adds, each with a word found nowhere else in the workspace.
const NOTE_TEXT = 'Tamarind: checked in the app window.\nA second line, kept as written.';
const MEETING_NOTE = 'Tangelo: added from a meeting page in the app window.';
const appPath = (profile) => appBundle(profile);
const exePath = (profile) => path.join(appPath(profile), 'Contents', 'MacOS', EXE);

const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- build ----------
const timings = {};
function build(label, args) {
  const t = Date.now();
  const res = buildApp(args, { stdio: ['ignore', 'pipe', 'pipe'], identity: null });
  timings[label] = `${((Date.now() - t) / 1000).toFixed(1)} s`;
  if (res.status !== 0) { console.error(res.stdout, res.stderr); process.exit(1); }
}
if (!process.argv.includes('--no-build')) {
  build('probe build (debug)', ['--debug', '--features', 'probe']);
  build('release build', []);
}
const windowId = path.join(REPO, 'target', 'probe', 'window-id');
fs.mkdirSync(path.dirname(windowId), { recursive: true });
if (sh('swiftc', ['-O', '-o', windowId, path.join(REPO, 'tools', 'window-id.swift')]).status !== 0) throw new Error('could not build window-id');

// ---------- the workspace: demo data, the stress cases, and dates that don't exist ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });
fs.cpSync(DATA, WS, { recursive: true });
fs.rmSync(path.join(WS, 'actions'), { recursive: true, force: true });
fs.rmSync(path.join(WS, 'board'), { recursive: true, force: true });
fs.cpSync(path.join(REPO, 'tools', 'compare-stress'), WS, { recursive: true });
fs.writeFileSync(path.join(WS, '.sample-workspace'), 'Marks this copy as the sample, so the demo badge shows.\n');
const header = (title, date) => `# ${title} | ${date}\n\n**Date:** ${date} | **Duration:** 1m\n**Attendees:** Kevin Collins, Sam Ortiz\n**Company:** Harborline Cloud | **Type:** 1:1\n\n---\n\n`;
fs.writeFileSync(path.join(WS, 'meeting-notes', '2026-10-12_check_1on1.md'), header('Check', 'October 12, 2026')
  + '## Action Items\n\n| # | Action Item | Owner | Status |\n|---|---|---|---|\n\n## Open Items from Earlier Meetings\n\n| From | Item | Owner | Status now |\n|---|---|---|---|\n| Feb 30 | First seen on a date that does not exist | Sam Ortiz | Open |\n');
fs.writeFileSync(path.join(WS, 'meeting-notes', '2026-02-30_check_1on1.md'), header('Check C', 'February 30, 2026') + '## Action Items\n');
// A summary whose file name has spaces, an apostrophe, an ampersand and an accented letter (decision 76). It is the
// newest meeting with a private note, so the private-notes switch checks below run on it too.
const ODD_NAME = "2026-10-13_kevin & sam's café check.md";
const ODD_NOTE = 'Sam asked to keep the café plan quiet until Friday.';
fs.writeFileSync(path.join(WS, 'meeting-notes', ODD_NAME), header('Kevin & Sam: Café check', 'October 13, 2026')
  + '## Action Items\n\n| ID | Action Item | Owner | Due | Due date | Status |\n|---|---|---|---|---|---|\n| A-261013-1 | Book the café for the team lunch | Sam Ortiz | Not set |  | Agreed |\n\n'
  + `## Notes\n\n- **Manager-only note:** ${ODD_NOTE}\n`);
const claude = path.join(WS, 'CLAUDE.md');
fs.writeFileSync(claude, fs.readFileSync(claude, 'utf8').replace(/^Last reviewed:.*$/m, 'Last reviewed: 2026-02-30'));

// ---------- snapshots ----------
function hashTree(root, { skip = [] } = {}) {
  const out = {};
  const walk = (p) => {
    let st;
    try { st = fs.lstatSync(p); } catch { return; }
    const rel = path.relative(root, p) || '.';
    if (skip.some((s) => rel === s || rel.startsWith(`${s}/`))) return;
    if (st.isDirectory()) { out[`${rel}/`] = 'dir'; for (const e of fs.readdirSync(p)) walk(path.join(p, e)); }
    else out[rel] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  };
  walk(root);
  return out;
}
const changed = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).sort();

// Everywhere an app, WebKit or macOS keeps per-app files, under the bundle id, the program name and the app name.
const getconf = (k) => sh('getconf', [k]).stdout.trim();
const L = path.join(HOME, 'Library');
const outsidePlaces = [ID, EXE, NAME].flatMap((n) => [
  `${L}/Application Support/${n}`, `${L}/Caches/${n}`, `${L}/WebKit/${n}`, `${L}/HTTPStorages/${n}`,
  `${L}/HTTPStorages/${n}.binarycookies`, `${L}/Cookies/${n}.binarycookies`, `${L}/Preferences/${n}.plist`,
  `${L}/Saved Application State/${n}.savedState`, `${L}/Logs/${n}`, `${L}/Application Scripts/${n}`, `${L}/Containers/${n}`,
  path.join(getconf('DARWIN_USER_CACHE_DIR'), n), path.join(getconf('DARWIN_USER_TEMP_DIR'), n),
]);
const snapOutside = () => Object.assign({}, ...outsidePlaces.map((p) => Object.fromEntries(Object.entries(hashTree(p)).map(([k, v]) => [path.join(p, k), v]))));
const snapRepo = () => ({ ...hashTree(REPO, { skip: ['target', 'node_modules', '.git'] }), ...Object.fromEntries(Object.entries(hashTree(DATA)).map(([k, v]) => [`demo:${k}`, v])) });

// The settings folder is put back as it was found.
const savedSettings = fs.existsSync(SETTINGS_DIR) ? hashTreeContents(SETTINGS_DIR) : null;
function hashTreeContents(dir) {
  return Object.fromEntries(fs.readdirSync(dir).map((f) => [f, fs.readFileSync(path.join(dir, f))]));
}
fs.rmSync(SETTINGS_DIR, { recursive: true, force: true });

// ---------- run the app ----------
const events = [];
const lsofs = {};
const meetingRequests = [];
async function run(profile, label, env, { timeout = 180000, untilWindow = false } = {}) {
  const child = spawn(exePath(profile), [], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  const lsof = (when) => {
    const all = sh('lsof', ['-nP', '-a', '-p', String(child.pid), '-i']).stdout.trim();
    const listen = sh('lsof', ['-nP', '-a', '-p', String(child.pid), '-iTCP', '-sTCP:LISTEN']).stdout.trim();
    lsofs[`${label} (${when})`] = { sockets: all || 'none', listening: listen || 'none' };
  };
  const screenshot = (name) => {
    const id = sh(windowId, [String(child.pid)]).stdout.trim();
    if (id) sh('screencapture', ['-x', '-o', '-l', id, path.join(SHOTS, `${label}-${name}.png`)]);
  };
  const onLine = (line) => {
    // The File menu's items, as the app built them.
    const menu = line.match(/^\[probe\] file-menu (\[.*\])$/);
    if (menu) events.push({ run: label, what: 'file-menu', data: JSON.parse(menu[1]) });
    // The File menu is open over the window: the open menu's own window, and the screen around the app's windows,
    // then the app is ended.
    if (line === '[probe] file-menu-shown') {
      setTimeout(() => {
        const menuId = sh(windowId, [String(child.pid), '--menu']).stdout.trim();
        if (menuId) sh('screencapture', ['-x', '-o', '-l', menuId, path.join(SHOTS, 'file-menu.png')]);
        const bounds = sh(windowId, [String(child.pid), '--bounds']).stdout.trim();
        if (bounds) sh('screencapture', ['-x', '-R', bounds, path.join(SHOTS, 'file-menu-in-window.png')]);
        child.kill('SIGTERM');
      }, 1500);
    }
    // What the core received for each meeting, exactly as the window sent it.
    const asked = line.match(/^\[probe\] GET (\/api\/meeting\?\S*) -> (\d+)/);
    if (asked) meetingRequests.push({ run: label, target: asked[1], status: Number(asked[2]) });
    const m = line.match(/^\[probe\] GET \/__probe\/([\w-]+)\?(\S*) -> /);
    if (!m) return;
    const data = JSON.parse(decodeURIComponent(m[2]) || 'null');
    events.push({ run: label, what: m[1], data });
    if (m[1] === 'shot') screenshot(data);
    if (m[1] === 'ready') lsof('pages loaded');
  };
  let buf = '';
  const feed = (d) => { log += d; buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1); } };
  child.stdout.on('data', feed);
  child.stderr.on('data', feed);
  const exited = new Promise((r) => child.once('exit', r));
  if (untilWindow) {
    for (let i = 0; i < 100 && !sh(windowId, [String(child.pid)]).stdout.trim(); i++) await sleep(150);
    await sleep(2500);
    lsof('window open');
    screenshot('window');
    child.kill('SIGTERM');
  }
  const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
  await exited;
  clearTimeout(timer);
  fs.writeFileSync(path.join(OUT, `${label}.log`), log);
  return log;
}

const probeScript = (mode) => {
  const p = path.join(OUT, `probe-${mode}.js`);
  fs.writeFileSync(p, fs.readFileSync(path.join(REPO, 'tools', 'check-app-probe.js'), 'utf8').replace('__MODE__', mode)
    .replace("'__ODD_NAME__'", JSON.stringify(ODD_NAME))
    .replace("'__NOTE_TEXT__'", JSON.stringify(NOTE_TEXT)).replace("'__MEETING_NOTE__'", JSON.stringify(MEETING_NOTE)));
  return p;
};

const repoBefore = snapRepo();
const wsBefore = hashTree(WS);
const outsideBefore = snapOutside();
// First launch: no settings file, so the welcome window; Choose Folder… "picks" the workspace.
await run('debug', 'welcome', { MC_PROBE: probeScript('welcome'), MC_PROBE_PICK: WS }, { timeout: 60000 });
// The session opens the workspace through the same code as the folder picker, which writes the settings file.
await run('debug', 'session', { MC_PROBE_WORKSPACE: WS, MC_PROBE: probeScript('session') });
// The restart opens the remembered folder from the settings file.
await run('debug', 'restart', { MC_PROBE: probeScript('restart') });
const outsideAfter = snapOutside();
const wsAfter = hashTree(WS);
const settingsText = fs.existsSync(SETTINGS) ? fs.readFileSync(SETTINGS, 'utf8') : null;

// A remembered folder that is gone: the welcome window names it, and Quit ends the app.
const gone = `${WS}-moved-away`;
// The welcome window shows a folder as the window title does: the home folder as "~".
const shownPath = (p) => (p.startsWith(`${HOME}/`) ? `~/${p.slice(HOME.length + 1)}` : p);
const goneSettings = `${JSON.stringify({ workspace: gone }, null, 2)}\n`;
fs.writeFileSync(SETTINGS, goneSettings);
const missingStart = Date.now();
await run('debug', 'missing', { MC_PROBE: probeScript('missing') }, { timeout: 60000 });
const missingResult = { exitedWithin: `${((Date.now() - missingStart) / 1000).toFixed(1)} s`, folderCreated: fs.existsSync(gone), settingsUnchanged: fs.readFileSync(SETTINGS, 'utf8') === goneSettings };
fs.writeFileSync(SETTINGS, settingsText);

// A workspace without books.json and corrections.json, and one where both can't be read.
const wsMissing = `${WS}-without-files`;
const wsUnreadable = `${WS}-unreadable-files`;
for (const [dir, write] of [[wsMissing, null], [wsUnreadable, '{ this is not JSON']]) {
  fs.cpSync(WS, dir, { recursive: true });
  // No ledger, so the visit to the Board in that run shows whether opening it writes one.
  fs.rmSync(path.join(dir, 'actions'), { recursive: true, force: true });
  for (const f of ['library/books.json', 'corrections/corrections.json']) {
    fs.rmSync(path.join(dir, f), { force: true });
    if (write) fs.writeFileSync(path.join(dir, f), write);
  }
}
await run('debug', 'missing-files', { MC_PROBE_WORKSPACE: wsMissing, MC_PROBE: probeScript('missing-files') }, { timeout: 60000 });
await run('debug', 'unreadable-files', { MC_PROBE_WORKSPACE: wsUnreadable, MC_PROBE: probeScript('unreadable-files') }, { timeout: 60000 });
const filesCreated = ['library/books.json', 'corrections/corrections.json'].filter((f) => fs.existsSync(path.join(wsMissing, f)));
const ledgerAfterOpeningBoard = fs.existsSync(path.join(wsMissing, 'actions', 'ledger.json'));
const unreadableKept = ['library/books.json', 'corrections/corrections.json'].every((f) => fs.readFileSync(path.join(wsUnreadable, f), 'utf8') === '{ this is not JSON');

// The File menu, opened over the Help page, for its screenshot.
await run('debug', 'file-menu', { MC_PROBE_WORKSPACE: WS, MC_PROBE: probeScript('file-menu') }, { timeout: 60000 });

// The normal build's welcome window, for the screenshot.
fs.rmSync(SETTINGS);
await run('release', 'release-welcome', {}, { untilWindow: true });
fs.writeFileSync(SETTINGS, settingsText);

// The normal build: no probe, opened from the settings file as a person would see it.
await run('release', 'release', {}, { untilWindow: true });
const outsideAfterRelease = snapOutside();
const repoAfter = snapRepo();

// Put the settings folder back.
fs.rmSync(SETTINGS_DIR, { recursive: true, force: true });
if (savedSettings) { fs.mkdirSync(SETTINGS_DIR, { recursive: true }); for (const [f, b] of Object.entries(savedSettings)) fs.writeFileSync(path.join(SETTINGS_DIR, f), b); }

// ---------- results ----------
const ev = (what, run = 'session') => events.filter((e) => e.what === what && e.run === run).map((e) => e.data);
const one = (what, run) => ev(what, run)[0];
const pages = ev('page');
const outsideChanged = changed(outsideBefore, outsideAfter).filter((k) => !k.endsWith('/'));
const outsideDirsCreated = changed(outsideBefore, outsideAfter).filter((k) => k.endsWith('/'));
let settingsValue = null;
try { settingsValue = JSON.parse(settingsText); } catch { /* reported below */ }
const wsChanged = changed(wsBefore, wsAfter).filter((k) => !k.endsWith('/'));
let savedNotes = [];
try { savedNotes = JSON.parse(fs.readFileSync(path.join(WS, 'notes', 'notes.json'), 'utf8')).notes; } catch { /* reported below */ }
const csp = one('csp');
// The cards the Agents page should show: the coach, then each agent file in name order, named as the core names them
// (the name: line, hyphens as spaces, first letter capital).
const agentNames = ['Coach', ...fs.readdirSync(path.join(WS, '.claude', 'agents')).filter((f) => f.endsWith('.md')).sort().map((f) => {
  const name = fs.readFileSync(path.join(WS, '.claude', 'agents', f), 'utf8').match(/^---\n[^]*?^name:\s*(.+)$/m)?.[1].trim() || f.slice(0, -3);
  const spaced = name.replace(/[-_]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
})];
const agentCards = one('agent-cards');
// The check's header has no "Prior context" line, so that field shows "could not read", as on the other check meetings.
const ODD_FIELDS = ['Date: October 13, 2026', 'Duration: 1m', 'Attendees: Kevin Collins, Sam Ortiz', 'Company: Harborline Cloud', 'Type: 1:1', 'Prior context: could not read'];
const verdict = (ok) => (ok ? 'pass' : 'FAIL');
// The folder that holds home folders ("/Users" on a Mac), worked out here so this file doesn't spell it out.
const HOMES = `${path.dirname(os.homedir())}/`;
const homePaths = fs.readFileSync(exePath('release')).toString('latin1').split(HOMES).length - 1;
const lsofClean = Object.values(lsofs).every((l) => l.sockets === 'none' && l.listening === 'none');
const HELP_SECTIONS = ['Getting started', 'Make it your own', 'Everyday use', 'FAQ', 'Troubleshooting'];
const help = one('help');
const fileMenu = one('file-menu');
const shotsTaken = fs.readdirSync(SHOTS);

const checklist = {
  'no listening port for the app\'s process (lsof)': verdict(lsofClean && Object.keys(lsofs).length >= 3),
  'works with Wi-Fi off': 'needs Kevin (the app opened no socket at all; see lsof)',
  'welcome window: the app name, the two sentences and the four buttons': verdict(
    one('welcome', 'welcome')?.name === NAME && one('welcome', 'welcome')?.text.length === 2
    && one('welcome', 'welcome')?.buttons.join('|') === 'Choose Folder…|New Workspace…|Open Sample…|Quit'),
  'welcome window: the main button is "Open Sample…" on first launch and "Choose Folder…" when the folder is missing': verdict(
    one('welcome', 'welcome')?.primary.join() === 'Open Sample…' && one('welcome', 'welcome')?.focused === 'Open Sample…'
    && one('welcome', 'missing')?.primary.join() === 'Choose Folder…' && one('welcome', 'missing')?.focused === 'Choose Folder…'),
  'welcome window: Choose Folder… opens the workspace and remembers it': verdict(
    !!one('main-after-welcome', 'welcome') && events.some((e) => e.run === 'restart' && e.what === 'ready')),
  'missing folder: the welcome window names it, Quit ends the app, nothing is created': verdict(
    one('welcome', 'missing')?.text.some((t) => t === shownPath(gone)) && one('welcome-click', 'missing') === 'Quit'
    && !missingResult.folderCreated && missingResult.settingsUnchanged),
  'the pages can\'t call the app (no Tauri permissions)': verdict([one('welcome', 'welcome'), one('main-after-welcome', 'welcome'), one('welcome', 'missing')]
    .every((x) => x && (x.appCalls.bridge === false || ['dialog', 'opener', 'fs'].every((k) => x.appCalls[k].startsWith('refused'))))),
  'a workspace without books.json or corrections.json shows a plain notice naming the file, not an error': verdict(
    ['library', 'corrections'].every((p) => {
      const r = one('missing-files', 'missing-files')?.[p];
      return r && !r.error && r.tableShown === false && r.notice?.includes(p === 'library' ? 'library/books.json' : 'corrections/corrections.json');
    })),
  'a books.json or corrections.json that can\'t be read is still an error, and is not overwritten': verdict(
    ['library', 'corrections'].every((p) => /could not read/.test(one('unreadable-files', 'unreadable-files')?.[p]?.error || '')) && unreadableKept),
  'every page loads': verdict(pages.length > 0 && pages.every((p) => !p.error)),
  'the Help link in the sidebar foot opens the Help page: its five sections, nothing marked "could not read", no link out': verdict(
    help?.link === 'Help' && help.hash === '#/help' && help.page === 'help' && help.current === 'page'
    && help.sections.join() === HELP_SECTIONS.join() && help.marks === 0 && !help.error && help.linksOut.length === 0 && !help.wide),
  'the File menu has New Workspace… just above Open Sample Workspace…': verdict(
    fileMenu?.includes('New Workspace…') && fileMenu.indexOf('Open Sample Workspace…') === fileMenu.indexOf('New Workspace…') + 1),
  'screenshots of the Help page, the welcome window and the File menu': verdict(
    ['session-help.png', 'welcome-welcome.png', 'release-welcome-window.png', 'file-menu.png'].every((f) => shotsTaken.includes(f))),
  'the app opens on Today, the first page in the sidebar': verdict(one('ready')?.page === 'today' && one('ready')?.firstNav === 'today'),
  'the sidebar is Today, Meetings, Board, People, Agents, Library': verdict(
    one('ready')?.nav?.join() === 'Today,Meetings,Board,People,Agents,Library'),
  'People, one person\'s page and Agents at 1440 px and at 1100 px wide: drawn, nothing overflows, nothing cut off': verdict(
    ['people', 'person', 'agents'].every((n) => [1440, 1100].every((w) => ev('section-layout').some((x) => x.name === n && Math.abs(x.width - w) <= 1
      && x.rows > 0 && x.problemCount === 0
      && (n !== 'person' || ['They owe', 'You owe them', 'Meetings'].every((h) => x.blocks.includes(h)))
      && (n !== 'agents' || x.blocks.join() === 'Agents and the coach,Rules learned'))))),
  'People at 1440 px and at 1100 px wide: the columns line up down the page, in rows with a flag and rows without': verdict(
    [1440, 1100].every((w) => ev('people-columns').some((x) => Math.abs(x.width - w) <= 1 && x.rows > 1
      && Object.values(x.lefts).every((l) => l.length === 1 && l[0] >= 0)))),
  '#/corrections opens Agents at "Rules learned", with the ids the checks look up': verdict(
    one('corrections-moved')?.page === 'agents' && one('corrections-moved')?.current === 'agents' && one('corrections-moved')?.heading === 'Rules learned'
    && one('corrections-moved')?.scrolled > 0 && one('corrections-moved')?.ids.length === 0
    // At the top of the window, or as far down as the page goes when the section is shorter than the window.
    && (Math.abs(one('corrections-moved')?.rulesTop ?? 999) < 80 || one('corrections-moved')?.scrolled >= one('corrections-moved')?.maxScroll - 1)),
  [`Agents shows the coach and ${agentNames.length - 1} agents (five in the sample): ${agentNames.join(', ')}`]: verdict(
    agentCards?.closed.map((c) => c.name).join() === agentNames.join()),
  'Agents: every card\'s rules start closed behind "Rules (N)", N the number of rules': verdict(
    agentCards?.closed.length > 0 && agentCards.closed.every((c) => c.open === false && !c.rulesShown && c.rules > 0 && c.summary === `Rules (${c.rules})`)),
  'Agents: a click opens one card\'s rules and leaves the others closed, a second click closes it, and the control takes the keyboard focus': verdict(
    agentCards?.opened >= 0 && agentCards.focused
    && agentCards.oneOpen.every((c, i) => c.open === (i === agentCards.opened) && c.rulesShown === (i === agentCards.opened))
    && agentCards.closedAgain.every((c) => c.open === false)),
  'Agents: after leaving the page and coming back, every card is closed again': verdict(
    agentCards?.afterReturn.length === agentNames.length && agentCards.afterReturn.every((c) => c.open === false)),
  'Today at 1440 px and at 1100 px wide: its groups are drawn, nothing overflows its group, and no chip, title or ID is cut off': verdict(
    [1440, 1100].every((w) => ev('today-layout').some((x) => Math.abs(x.width - w) <= 1 && x.groups.length >= 3 && x.rows > 0 && x.problemCount === 0))),
  'Close on Today closes the item; its row stays in place with Reopen, and one line says what happened': verdict(
    one('today-closed')?.column === 'done' && one('today-closed')?.inPlace === true && one('today-closed')?.reopenButton === true
    && /^Closed “/.test(one('today-closed')?.status || '')),
  'the edit button is an SVG pencil in the text colour, on Board cards and in the Library, at both widths': verdict(
    ev('edit-buttons').length === 4 && ev('edit-buttons').every((x) => x.count > 0 && x.notPencil === 0 && x.notTextColour === 0)),
  'a meeting\'s tables fill their block': verdict(ev('meeting-tables').length > 0 && ev('meeting-tables').every((x) => x.notFilling === 0)),
  'a date in the Meetings table never wraps, at 1440 px and at 1100 px wide': verdict(
    [1440, 1100].every((w) => ev('date-cells').some((x) => x.width === w && x.count > 0 && x.wrapped.length === 0))),
  'a card moves and the move is saved; a drag into Done closes it': verdict(one('card-moved')?.column === 'doing'
    && one('card-dragged')?.column === 'done' && /^\d{4}-\d{2}-\d{2}$/.test(one('card-dragged')?.closed || '')),
  'Close moves a card to Done with a closed date, and Reopen moves it to To do and clears the date': verdict(
    one('card-closed')?.column === 'done' && /^\d{4}-\d{2}-\d{2}$/.test(one('card-closed')?.closed || '')
    && one('card-reopened')?.column === 'todo' && one('card-reopened')?.closed === null),
  'an age in the Meetings table never wraps': verdict(one('age-cells')?.count > 0 && one('age-cells')?.wrapped.length === 0),
  'an ID in the Meetings table never wraps, at 1440 px and at 1100 px wide': verdict(
    [1440, 1100].every((w) => ev('id-cells').some((x) => x.width === w && x.count > 0 && x.wrapped.length === 0))),
  'at 1440 px and at 1100 px wide, no card\'s ID or title is cut off and nothing overflows its column (suggestions hidden and shown)': verdict(
    ev('board-layout').length === 4 && [1440, 1100].every((w) => ev('board-layout').filter((x) => Math.abs(x.width - w) <= 1).length === 2)
    && ev('board-layout').every((x) => x.columns === 3 && x.cards > 0 && x.problemCount === 0)),
  'Close puts a card at the top of Done, and Reopen at the top of To do': verdict(
    one('card-closed')?.topOfDone === one('card-closed')?.id && one('card-closed')?.doneCards > 1
    && one('card-reopened')?.topOfTodo === one('card-reopened')?.id),
  'an action item opens in place, with no dialog, and its due date and note save from there': verdict(
    one('card-edited')?.inCard === true && one('card-edited')?.dialogOpen === false && one('card-edited')?.focused === 'card-edit-due'
    && one('card-edited')?.openCards === 1 && one('card-edited')?.myDue === '2026-10-30' && one('card-edited')?.note === 'Checked in the app window.'
    && one('card-edited')?.closedAfterSave === true),
  'a book and a correction save': verdict(one('book-saved')?.status === 'Book added.' && one('correction-saved')?.status === 'Entry added.'),
  'the private-notes switch is off after a reload and after a restart': verdict(
    one('switch-on-load')?.on === false && one('switch-turned-on')?.on === true && one('switch-turned-on')?.privateNotesShown > 0
    && one('switch-after-reload')?.on === false && one('switch-after-reload')?.privateNotesShown === 0
    && one('switch-after-restart', 'restart')?.on === false && one('switch-after-restart', 'restart')?.privateNotesShown === 0),
  'a summary named with spaces, an apostrophe, an ampersand and an accented letter opens from the Meetings page and from its Board card, with its header fields and its private note hidden': verdict(
    [one('odd-meeting'), one('odd-meeting-from-board')].every((v) => v && !v.error && v.hash === `#/meetings/${ODD_NAME}`
      && v.heading === 'Kevin & Sam: Café check | October 13, 2026' && v.fields.join('|') === ODD_FIELDS.join('|')
      && v.on === false && v.privateNotesShown === 0 && v.privateStatus === '1 private note hidden')
    && one('odd-meeting').listed && one('odd-meeting-from-board').cards > 0
    && meetingRequests.some((r) => r.status === 200 && new URLSearchParams(r.target.split('?')[1]).get('file') === ODD_NAME)),
  'adding a note on a person\'s page saves it to notes/notes.json with its meeting and item; with the switch off it shows as "private note" and the box is empty again': verdict(
    one('note-added-person')?.status === 'Note added.' && one('note-added-person').rows >= 1 && one('note-added-person').privateLabel
    && one('note-added-person').textOnPage === false && one('note-added-person').boxEmpty
    && savedNotes.some((n) => n.person === one('note-added-person').person && n.item === one('note-added-person').item
      && n.meeting === (one('note-added-person').meeting || null) && n.text === NOTE_TEXT)),
  'adding a note on a meeting\'s page: the meeting and its one other attendee are filled in, and the note shows as "private note"': verdict(
    one('note-added-meeting')?.status === 'Note added.' && one('note-added-meeting').prefilled === one('note-added-meeting').person
    && one('note-added-meeting').privateLabel && one('note-added-meeting').textOnPage === false
    && savedNotes.some((n) => n.meeting === one('note-added-meeting').file && n.person === one('note-added-meeting').person && n.text === MEETING_NOTE)),
  'the switch shows a note\'s text with its line breaks, and hides it again': verdict(
    one('note-switch-on')?.on === true && one('note-switch-on').textAsWritten === true && one('note-switch-on').editButtons > 0
    && one('note-switch-off')?.on === false && one('note-switch-off').privateLabel && one('note-switch-off').textOnPage === false
    && one('note-switch-off').editButtons === 0),
  'the markers: "1 note" on the item\'s Board card and Today row, linking to the person\'s page, and the count on the People row, never the text': verdict(
    ['note-marker-board', 'note-marker-today'].every((w) => one(w)?.found && one(w).text === '1 note'
      && one(w).href === `#/people/${encodeURIComponent(one('note-added-person')?.person || '')}` && one(w).holdsText === false)
    && /^\d+ notes? since the last meeting$/.test(one('note-count-people')?.text || '') && one('note-count-people').pageHoldsText === false),
  'the notes sections on a person\'s page and a meeting\'s page at 1440 px and at 1100 px wide, a card and a Today row with a marker: nothing overflows, nothing cut off': verdict(
    ['person-notes', 'meeting-notes'].every((n) => [1440, 1100].every((w) => ev('section-layout').some((x) => x.name === n && Math.abs(x.width - w) <= 1
      && x.rows > 0 && x.problemCount === 0 && x.blocks.includes(n === 'person-notes' ? 'Notes between meetings' : 'Since this meeting'))))
    && one('board-layout-notes')?.problemCount === 0 && one('today-layout-notes')?.problemCount === 0),
  'after a restart the notes are still there, with the switch off and their text hidden': verdict(
    one('notes-after-restart', 'restart')?.rows > 0 && one('notes-after-restart', 'restart').privateLabels === one('notes-after-restart', 'restart').rows
    && one('notes-after-restart', 'restart').on === false && one('notes-after-restart', 'restart').textOnPage === false),
  'a name that is not a summary shows a plain notice naming it and the link back, not an error': verdict(
    ev('no-summary').length === 2 && ev('no-summary').every((v) => !v.error && v.notice === `There is no summary named "${v.name}" in meeting-notes/.`
      && v.backLink === '← All meetings')),
  'external links open in the browser and not in the app window': verdict(one('external-link')?.stayed === true && one('external-window-open')?.stayed === true),
  'an impossible date never shows "Invalid Date"': verdict(pages.length > 0 && pages.every((p) => !p.invalidDate)),
  'the Board shows the action items in To do with no import, and opening it writes nothing': verdict(
    one('board-open')?.cards > 0 && one('board-open')?.todo === one('board-open')?.cards && one('board-open')?.importButton === false
    && one('missing-files', 'missing-files')?.board?.cards > 0 && !one('missing-files', 'missing-files')?.board?.error && !ledgerAfterOpeningBoard),
  'the sample workspace ships without board.json, actions/ledger.json or notes/notes.json': verdict(
    ['board/board.json', 'actions/ledger.json', 'notes/notes.json'].every((f) => !fs.existsSync(path.join(REPO, 'sample-workspace', f))
      && !fs.existsSync(path.join(appPath('release'), 'Contents', 'Resources', 'sample-workspace', f)))),
  'only the settings file changed outside the workspace, holding the folder path and nothing else': verdict(
    outsideChanged.length === 1 && outsideChanged[0] === SETTINGS
    && settingsValue && Object.keys(settingsValue).join() === 'workspace' && settingsValue.workspace === WS),
  'no screenshot shows a private note': verdict(ev('shot-refused').length === 0 && !fs.readdirSync(SHOTS).some((f) => /private/i.test(f))),
  'only the four allowed files changed in the workspace, and the session created notes/notes.json': verdict(
    wsChanged.every((f) => WRITABLE.includes(f)) && wsChanged.includes('notes/notes.json') && savedNotes.length === 2),
  'the content security policy blocks other origins and inline scripts': verdict(csp && !csp.inlineScriptRan && csp.violations.length >= 3),
  [`the release binary contains no "${HOMES}"`]: verdict(homePaths === 0),
  'the repository and the sample workspace are unchanged': verdict(changed(repoBefore, repoAfter).length === 0),
};

const report = {
  app: NAME, bundleId: ID, timings,
  homePathsInReleaseBinary: homePaths,
  binaryBytes: fs.statSync(exePath('release')).size,
  bundleSize: Object.fromEntries(['debug', 'release'].map((p) => [p, sh('du', ['-sh', appPath(p)]).stdout.split('\t')[0]])),
  checklist,
  details: {
    errors: events.filter((e) => e.what === 'error'),
    pages: pages.map((p) => `${p.name}: ${p.error ? `ERROR ${p.error}` : 'ok'}${p.invalidDate ? ' INVALID DATE' : ''} (could not read ×${p.couldNotRead}, demo badge ${p.demoBadge ? 'on' : 'off'}, title "${p.title}")`),
    welcome: { firstLaunch: one('welcome', 'welcome'), afterChoose: one('main-after-welcome', 'welcome'), missing: one('welcome', 'missing'), missingResult },
    help,
    fileMenu,
    boardOpen: one('board-open'),
    ageCells: one('age-cells'),
    idCells: ev('id-cells'),
    dateCells: ev('date-cells'),
    todayLayout: ev('today-layout'),
    sectionLayout: ev('section-layout'),
    peopleColumns: ev('people-columns'),
    correctionsMoved: one('corrections-moved'),
    agentCards,
    todayClosed: one('today-closed'),
    editButtons: ev('edit-buttons'),
    meetingTables: ev('meeting-tables'),
    opensOn: one('ready'),
    boardLayout: ev('board-layout'),
    cardEdited: one('card-edited'),
    missingFiles: { ...one('missing-files', 'missing-files'), filesCreatedByAdding: filesCreated, ledgerAfterOpeningBoard },
    unreadableFiles: one('unreadable-files', 'unreadable-files'),
    moves: { button: one('card-moved'), drag: one('card-dragged'), close: one('card-closed'), reopen: one('card-reopened') },
    saves: { book: one('book-saved'), correction: one('correction-saved') },
    privateSwitch: { onLoad: one('switch-on-load'), turnedOn: one('switch-turned-on'), afterReload: one('switch-after-reload'), afterRestart: one('switch-after-restart', 'restart') },
    notes: {
      addedOnPersonPage: one('note-added-person'), addedOnMeetingPage: one('note-added-meeting'),
      switchOn: one('note-switch-on'),
      switchOff: one('note-switch-off'), markers: { board: one('note-marker-board'), today: one('note-marker-today'), people: one('note-count-people') },
      layout: { sections: ev('section-layout').filter((x) => /notes$/.test(x.name)), board: one('board-layout-notes'), today: one('today-layout-notes') },
      afterRestart: one('notes-after-restart', 'restart'), saved: savedNotes.length,
    },
    oddName: {
      file: ODD_NAME, fromMeetingsPage: one('odd-meeting'), fromBoard: one('odd-meeting-from-board'), notASummary: ev('no-summary'),
      // The requests the core received from the window for these names, as sent.
      requests: meetingRequests.filter((r) => /caf|CLAUDE|nobody/i.test(decodeURIComponent(r.target))),
    },
    links: { click: one('external-link'), windowOpen: one('external-window-open') },
    csp,
    lsof: lsofs,
    outsideChangedDuringSession: outsideChanged,
    outsideFoldersCreatedDuringSession: outsideDirsCreated,
    outsideChangedByReleaseRun: changed(outsideAfter, outsideAfterRelease),
    settingsFile: settingsText,
    workspaceChanged: wsChanged,
    screenshots: fs.readdirSync(SHOTS).sort(),
  },
};
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(Object.values(checklist).some((v) => v === 'FAIL') ? 1 : 0);

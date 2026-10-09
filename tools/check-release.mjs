// npm run check:release: proves the .dmg made by `npm run package` and the app inside it (SPEC.md, decision 69).
// One line per check; the exit code is 1 if any fails. The app checked is the copy inside the .dmg, which is
// what people download. Gatekeeper and the staple checks may ask Apple's servers; nothing is uploaded.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { DMG } from './package.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONF = JSON.parse(fs.readFileSync(path.join(REPO, 'app', 'tauri.conf.json'), 'utf8'));
const sh = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' });
const both = (r) => `${r.stdout}${r.stderr}`;

if (!fs.existsSync(DMG)) { console.error(`No .dmg at ${path.relative(REPO, DMG)}. Run: npm run package`); process.exit(1); }

const mount = path.join(REPO, 'target', 'dist', 'check-mount');
fs.mkdirSync(mount, { recursive: true });
const attach = sh('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mount, DMG]);
if (attach.status !== 0) { console.error(`The .dmg could not be opened:\n${both(attach)}`); process.exit(1); }

const results = [];
// Details show paths from the repository, never a home folder. A check given as a function returns ok, or
// [ok, detail]; if it throws, it fails with the error, and the checks after it still run and print.
const check = (label, ok, detail = '') => {
  if (typeof ok === 'function') {
    try { [ok, detail = ''] = [ok()].flat(); } catch (e) { [ok, detail] = [false, e.message]; }
  }
  results.push({ label, ok: Boolean(ok), detail: String(detail).replaceAll(`${REPO}/`, '') });
};
try {
  const app = path.join(mount, `${CONF.productName}.app`);
  const exe = path.join(app, 'Contents', 'MacOS', 'chief-of-staff');
  check('the .dmg holds the app and a shortcut to Applications',
    fs.existsSync(exe) && fs.lstatSync(path.join(mount, 'Applications')).isSymbolicLink() && fs.readlinkSync(path.join(mount, 'Applications')) === '/Applications');

  // 1. Signatures, strictly.
  const appSig = sh('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
  check('the app\'s signature verifies (codesign --verify --deep --strict)', appSig.status === 0, appSig.status ? both(appSig).trim().split('\n').pop() : '');
  const dmgSig = sh('codesign', ['--verify', '--strict', '--verbose=2', DMG]);
  check('the .dmg\'s signature verifies (codesign --verify --strict)', dmgSig.status === 0, dmgSig.status ? both(dmgSig).trim().split('\n').pop() : '');

  // 2. Gatekeeper.
  const gkApp = both(sh('spctl', ['--assess', '--type', 'execute', '--verbose=4', app]));
  check('Gatekeeper accepts the app as "Notarized Developer ID"', /accepted/.test(gkApp) && /source=Notarized Developer ID/.test(gkApp), gkApp.trim().split('\n').slice(-1)[0]);
  const gkDmg = both(sh('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=4', DMG]));
  check('Gatekeeper accepts the .dmg as "Notarized Developer ID"', /accepted/.test(gkDmg) && /source=Notarized Developer ID/.test(gkDmg), gkDmg.trim().split('\n').slice(-1)[0]);

  // 3. Staples.
  const stApp = sh('xcrun', ['stapler', 'validate', app]);
  check('the app\'s stapled ticket validates', stApp.status === 0, stApp.status ? both(stApp).trim().split('\n').pop() : '');
  const stDmg = sh('xcrun', ['stapler', 'validate', DMG]);
  check('the .dmg\'s stapled ticket validates', stDmg.status === 0, stDmg.status ? both(stDmg).trim().split('\n').pop() : '');

  // 4. Both chip types.
  const archs = sh('lipo', ['-archs', exe]).stdout.trim().split(/\s+/).sort();
  check('the app holds Apple silicon and Intel code (lipo: arm64, x86_64)', archs.join() === 'arm64,x86_64', archs.join(' '));

  // 5. No home path and no probe, in any file of the app or the .dmg's contents.
  const files = [];
  const walk = (p) => { const st = fs.lstatSync(p); if (st.isDirectory()) for (const e of fs.readdirSync(p)) walk(path.join(p, e)); else if (st.isFile()) files.push(p); };
  walk(mount);
  const holding = (needle) => files.filter((f) => fs.readFileSync(f).includes(needle)).map((f) => path.relative(mount, f));
  // The folder that holds home folders ("/Users" on a Mac), worked out here so this file doesn't spell it out.
  const homes = `${path.dirname(os.homedir())}/`;
  const home = holding(homes);
  check(`nothing in the app or the .dmg holds "${homes}"`, home.length === 0, home.join(', '));
  const probe = [...holding('MC_PROBE'), ...holding('/__probe/')];
  check('nothing in the app or the .dmg holds the probe', probe.length === 0, probe.join(', '));

  // 6. Bundle id and minimum macOS, as decided in app/tauri.conf.json.
  const plist = path.join(app, 'Contents', 'Info.plist');
  const read = (key) => sh('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist]).stdout.trim();
  const id = read('CFBundleIdentifier');
  check(`the bundle id is ${CONF.identifier}`, id === CONF.identifier, id);
  const minOs = read('LSMinimumSystemVersion');
  check(`the minimum macOS version is ${CONF.bundle.macOS.minimumSystemVersion}`, minOs === CONF.bundle.macOS.minimumSystemVersion, minOs);

  // 7. The sample inside: the three book-notes files are placeholders, there is no board.json or notes file, and its
  //    ledger is the repository's (0.3.0).
  const sample = path.join(app, 'Contents', 'Resources', 'sample-workspace');
  check('the sample has the three book-notes files as placeholders', () => {
    const books = JSON.parse(fs.readFileSync(path.join(sample, 'library', 'books.json'), 'utf8'));
    const notes = [...new Set(books.map((b) => b.notes).filter((n) => typeof n === 'string'))];
    const placeholders = notes.filter((n) => fs.existsSync(path.join(sample, n)) && /^# My notes on .*\n\nPlaceholder\./.test(fs.readFileSync(path.join(sample, n), 'utf8')));
    return [notes.length === 3 && placeholders.length === 3, `${placeholders.length} of ${notes.length}`];
  });
  check('the sample has no board.json', !fs.existsSync(path.join(sample, 'board', 'board.json')));
  check('the sample has actions/ledger.json, the same as the repository\'s', () => {
    const shipped = path.join(sample, 'actions', 'ledger.json');
    return fs.existsSync(shipped) && fs.readFileSync(shipped, 'utf8') === fs.readFileSync(path.join(REPO, 'sample-workspace', 'actions', 'ledger.json'), 'utf8');
  });
  check('the sample has no notes/notes.json', !fs.existsSync(path.join(sample, 'notes', 'notes.json')));
  // 8. The sample's coach and five agents, and the weekly brief as the last section of its CLAUDE.md (step 10).
  const AGENTS = ['blind-spot-check.md', 'commitment-tracker.md', 'negotiation-prep.md', 'one-on-one-prep.md', 'risk-radar.md'];
  const agentsDir = path.join(sample, '.claude', 'agents');
  const agents = fs.existsSync(agentsDir) ? fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md')).sort() : [];
  check('the sample has the coach (CLAUDE.md) and five agents in .claude/agents/', fs.existsSync(path.join(sample, 'CLAUDE.md')) && agents.join() === AGENTS.join(), agents.join(', '));
  const coach = fs.existsSync(path.join(sample, 'CLAUDE.md')) ? fs.readFileSync(path.join(sample, 'CLAUDE.md'), 'utf8') : '';
  const heads = [...coach.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  check('the sample\'s CLAUDE.md ends with the weekly brief, after "When Kevin asks for one of his agents"',
    heads.slice(-2).join('|') === 'When Kevin asks for one of his agents|When Kevin asks for the weekly brief', heads.slice(-2).join(' | '));
  // 9. The sample's transcript to try (0.2.0).
  const TRANSCRIPT = 'transcripts/Riley 1-1 - 20260929.txt';
  check(`the sample has ${TRANSCRIPT}, as in the repository`,
    () => fs.readFileSync(path.join(sample, TRANSCRIPT), 'utf8') === fs.readFileSync(path.join(REPO, 'sample-workspace', TRANSCRIPT), 'utf8'));

  // 10. The starter workspace that File ▸ New Workspace… copies (0.2.0).
  const starter = path.join(app, 'Contents', 'Resources', 'starter-workspace');
  const starterAgentsDir = path.join(starter, '.claude', 'agents');
  check('the starter has the coach (CLAUDE.md), five agents in .claude/agents/ and people.md', () => {
    const found = fs.readdirSync(starterAgentsDir).filter((f) => f.endsWith('.md')).sort();
    return [fs.existsSync(path.join(starter, 'CLAUDE.md')) && fs.existsSync(path.join(starter, 'people.md')) && found.join() === AGENTS.join(), found.join(', ')];
  });
  check('the starter has a README.txt in goals/, meeting-notes/ and transcripts/, and nothing else there', () => {
    const wrong = ['goals', 'meeting-notes', 'transcripts'].filter((d) => fs.readdirSync(path.join(starter, d)).join() !== 'README.txt');
    return [wrong.length === 0, wrong.join(', ')];
  });
  check('the starter has corrections/corrections.json with no entries and no note', () => {
    const text = fs.readFileSync(path.join(starter, 'corrections', 'corrections.json'), 'utf8');
    const log = JSON.parse(text);
    return [Object.keys(log).join() === 'entries' && Array.isArray(log.entries) && log.entries.length === 0, text.trim()];
  });
  check('the starter has no .sample-workspace file', () => fs.existsSync(starter) && !fs.existsSync(path.join(starter, '.sample-workspace')));
  // The sample's people, from its people.md (full names, first names and "Also called"), and its company, from its
  // template (in full and its first word). A surname alone is not looked for: the library names Jim Collins.
  check('the starter names no person or company from the sample, in any file or file name', () => {
    const cells = fs.readFileSync(path.join(sample, 'people.md'), 'utf8').split('\n')
      .filter((l) => l.startsWith('|') && !/^\|\s*(Name|-)/.test(l))
      .flatMap((l) => { const c = l.split('|').map((x) => x.trim()); return [c[1], ...c[4].split(',')]; });
    const company = fs.readFileSync(path.join(sample, 'templates', 'meeting-summary-template.md'), 'utf8').match(/^\*\*Company:\*\* (.+?) \|/m)[1];
    const names = [...new Set([...cells, company].flatMap((n) => [n, n.trim().split(/\s+/)[0]]).map((n) => n.trim()).filter(Boolean))];
    if (names.length < 10) return [false, `only ${names.length} names found in the sample: ${names.join(', ')}`];
    const esc = (n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hits = [];
    const walkStarter = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const abs = path.join(d, e.name);
        const rel = path.relative(starter, abs);
        const text = e.isDirectory() ? '' : fs.readFileSync(abs, 'utf8');
        for (const n of names) if (new RegExp(`\\b${esc(n)}\\b`, 'i').test(`${rel}\n${text}`)) hits.push(`${rel}: ${n}`);
        if (e.isDirectory()) walkStarter(abs);
      }
    };
    walkStarter(starter);
    return [hits.length === 0, hits.join('; ')];
  });

  // 11. The Help page's text (0.2.0).
  check('the app has help.md, the same as the repository\'s',
    () => fs.readFileSync(path.join(app, 'Contents', 'Resources', 'help.md'), 'utf8') === fs.readFileSync(path.join(REPO, 'help.md'), 'utf8'));
} finally {
  sh('hdiutil', ['detach', mount]);
  fs.rmSync(mount, { recursive: true, force: true });
}

console.log(`check:release: ${path.relative(REPO, DMG)}`);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}${!r.ok && r.detail ? `  (${r.detail})` : ''}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} of ${results.length} checks failed.` : `All ${results.length} checks passed.`);
process.exit(failed ? 1 : 0);

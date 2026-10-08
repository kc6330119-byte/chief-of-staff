// npm run package: the release .app (universal, signed by tools/build-app.mjs) and a .dmg holding it next to a
// shortcut to Applications, in target/dist/ (SPEC.md, decisions 67 and 68).
//
// With a Developer ID, both are notarized with `xcrun notarytool submit … --keychain-profile mc-notary --wait`
// (the credentials stay in the keychain; nothing here sees them) and stapled, in this order: the app is
// notarized and stapled first, so the copy inside the .dmg carries its ticket; then the .dmg is made from it,
// signed, notarized and stapled. Both then open on a Mac that is offline.
//
//   npm run package               build, then make the .dmg
//   npm run package -- --no-build make the .dmg from the app already built
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appBundle, buildApp, developerId } from './build-app.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONF = JSON.parse(fs.readFileSync(path.join(REPO, 'app', 'tauri.conf.json'), 'utf8'));
const DIST = path.join(REPO, 'target', 'dist');
const APP = appBundle('release');
export const DMG = path.join(DIST, `${CONF.productName.replaceAll(' ', '-')}-${CONF.version}-universal.dmg`);

const run = (cmd, args, opts = {}) => {
  const res = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (res.status !== 0) throw new Error(`${cmd} ${args[0]} failed:\n${res.stdout}${res.stderr}`);
  return res.stdout;
};
const step = (m) => console.log(`\n== ${m}`);
const NOTARY_PROFILE = 'mc-notary';

/// Sends a file to Apple's notary service and waits; anything but "Accepted" stops the script, with the log.
function notarize(file) {
  step(`Notarizing ${path.basename(file)}`);
  const res = spawnSync('xcrun', ['notarytool', 'submit', file, '--keychain-profile', NOTARY_PROFILE, '--wait', '--output-format', 'json'], { encoding: 'utf8' });
  let result = null;
  try { result = JSON.parse(res.stdout); } catch { /* reported below */ }
  if (!result || result.status !== 'Accepted') {
    if (result?.id) {
      const log = path.join(DIST, `notary-log-${result.id}.json`);
      spawnSync('xcrun', ['notarytool', 'log', result.id, '--keychain-profile', NOTARY_PROFILE, log], { encoding: 'utf8' });
      console.error(`The notary service answered "${result.status}". Its log: ${path.relative(REPO, log)}`);
    } else {
      console.error(`notarytool failed:\n${res.stdout}${res.stderr}`);
    }
    process.exit(1);
  }
  console.log(`Accepted (submission ${result.id}).`);
}

function staple(file) {
  run('xcrun', ['stapler', 'staple', file]);
  run('xcrun', ['stapler', 'validate', file]);
  console.log(`Stapled ${path.basename(file)}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const identity = developerId();
  if (!process.argv.includes('--no-build')) {
    step('Building the universal app');
    if (buildApp([], { identity }).status !== 0) process.exit(1);
  }
  if (!fs.existsSync(APP)) { console.error(`No app at ${path.relative(REPO, APP)}.`); process.exit(1); }
  fs.mkdirSync(DIST, { recursive: true });

  if (identity) {
    const zip = path.join(DIST, 'app-for-notary.zip');
    fs.rmSync(zip, { force: true });
    run('ditto', ['-c', '-k', '--keepParent', APP, zip]);
    notarize(zip);
    fs.rmSync(zip, { force: true });
    staple(APP);
  }

  step('Making the .dmg');
  const staging = path.join(DIST, 'staging');
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  // ditto keeps the signature, the extended attributes and a stapled ticket as they are.
  run('ditto', [APP, path.join(staging, path.basename(APP))]);
  fs.symlinkSync('/Applications', path.join(staging, 'Applications'));
  fs.rmSync(DMG, { force: true });
  run('hdiutil', ['create', '-volname', CONF.productName, '-srcfolder', staging, '-fs', 'HFS+', '-format', 'UDZO', '-ov', DMG]);
  fs.rmSync(staging, { recursive: true, force: true });
  if (identity) {
    run('codesign', ['--force', '--sign', identity, '--timestamp', DMG]);
    console.log('Signed the .dmg with the Developer ID Application identity.');
    notarize(DMG);
    staple(DMG);
  } else {
    console.log('No Developer ID Application identity: nothing is notarized and the .dmg is not signed. They are for this Mac only.');
  }
  const size = (p) => spawnSync('du', ['-sh', p], { encoding: 'utf8' }).stdout.split('\t')[0].trim();
  console.log(`\n${path.relative(REPO, APP)}: ${size(APP)}\n${path.relative(REPO, DMG)}: ${size(DMG)}`);
}

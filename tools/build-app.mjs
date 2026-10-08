// Builds the release app (SPEC.md, decisions 58 and 64). Source paths that Rust writes into the binary (panic
// locations) are written as "~/…" for the home folder and "./…" for this folder, so the binary holds no
// home-folder path. The prefixes are worked out here at build time, never written into a committed file.
//
// Signing: with a "Developer ID Application" identity in the keychain, the app is signed with it (hardened
// runtime, secure timestamp); the identity is found here with `security find-identity`, so no name or team
// id is written into a committed file. Without one, the app is signed ad-hoc and this says so, so anyone can
// build from source. MC_ADHOC=1 forces ad-hoc signing.
//
// One universal app: release builds hold Apple silicon and Intel code (decision 66). Debug builds, such as
// the app check's probe build, are for this Mac only.
//
//   npm run build:app            the release bundle in target/release/bundle/macos/
//   npm run build:app -- --debug  extra arguments go to `tauri build`
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UNIVERSAL = 'universal-apple-darwin';

/// Where a build's .app ends up. Release builds are universal.
export function appBundle(profile = 'release') {
  const conf = JSON.parse(readFileSync(path.join(REPO, 'app', 'tauri.conf.json'), 'utf8'));
  const dir = profile === 'release' ? path.join(UNIVERSAL, 'release') : profile;
  return path.join(process.env.CARGO_TARGET_DIR || path.join(REPO, 'target'), dir, 'bundle', 'macos', `${conf.productName}.app`);
}

/// The SHA-1 of the first valid "Developer ID Application" identity, or null.
export function developerId() {
  if (process.env.MC_ADHOC === '1') return null;
  const out = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' }).stdout || '';
  const line = out.split('\n').find((l) => l.includes('"Developer ID Application:'));
  return line ? line.trim().split(/\s+/)[1] : null;
}

export function buildEnv({ identity = developerId() } = {}) {
  // rustc applies the last matching prefix, so the more specific one (this folder) comes last.
  const remap = [`--remap-path-prefix=${os.homedir()}=~`, `--remap-path-prefix=${REPO}=.`];
  const env = { ...process.env, RUSTFLAGS: [process.env.RUSTFLAGS, ...remap].filter(Boolean).join(' ') };
  // Overrides "signingIdentity": "-" (ad-hoc) in tauri.conf.json for this build only.
  if (identity) env.APPLE_SIGNING_IDENTITY = identity;
  return env;
}

export function buildApp(args = [], { stdio = 'inherit', identity = developerId() } = {}) {
  const say = (m) => (stdio === 'inherit' ? console.log(m) : null);
  say(identity
    ? 'Signing with the Developer ID Application identity found in the keychain.'
    : 'No Developer ID Application identity found (or MC_ADHOC=1): signing ad-hoc. This build runs on this Mac but is not for distribution.');
  const target = args.includes('--debug') ? [] : ['--target', UNIVERSAL];
  return spawnSync('npx', ['tauri', 'build', '--bundles', 'app', ...target, ...args], { cwd: path.join(REPO, 'app'), env: buildEnv({ identity }), stdio, encoding: 'utf8' });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(buildApp(process.argv.slice(2)).status ?? 1);
}

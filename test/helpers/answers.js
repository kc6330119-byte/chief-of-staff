// Every read the app offers, for a running test server: each page's answer, each meeting with and without private
// notes, each library notes file and each person. Keyed by path, each value is the status and the body, with the
// scratch folder's name (which /api/config reports) written <root>.
import fs from 'node:fs';
import path from 'node:path';

export async function everyAnswer(site) {
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

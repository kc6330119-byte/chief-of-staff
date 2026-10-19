// 0.4.0 step 2 moved the transcript review out of CLAUDE.md into the review-transcript skill, word for word. These put
// it back: CLAUDE.md as it was in step 1, rebuilt from today's CLAUDE.md and SKILL.md, so a test can show that nothing
// was reworded and that the app answers as it did.
import fs from 'node:fs';
import path from 'node:path';

export const SKILL = '.claude/skills/review-transcript/SKILL.md';

// What step 2 added to the moved text, and what it added to CLAUDE.md.
export const LAST_STEP = '9. The app checks the summary when you save it. If it reports anything, fix it and save again.\n';
export const PLACEHOLDER_RULE = `- If a table has no rows, leave it with its header rows only. Never add a placeholder
  row such as "None": every row in Action Items is read as an item.
`;
export const STANDING_RULES = `## Standing rules
1. Use only information dated on or before the meeting. Ignore anything later.
2. Mark anything that wasn't said in the meeting as "(suggested)". Don't invent facts.
3. Never record health details. Keep observations about someone's wellbeing brief and factual in a single
   "Manager-only note".
4. You report; you never close an item.
5. To review a transcript, use the review-transcript skill in .claude/skills/review-transcript/.

`;

// Step 3 of the starter's "Setting up this workspace", before and after 0.4.0 step 3 added the skill to it.
export const SETUP_STEP3_BEFORE = `3. In this file and in every agent in .claude/agents/, replace "the manager" with the
   manager's first name where it names them, keeping the grammar right. Put the company
   name in templates/meeting-summary-template.md in place of <Company>.
`;
export const SETUP_STEP3 = `3. In this file, in every agent in .claude/agents/ and in the review-transcript skill in
   .claude/skills/, replace "the manager" with the manager's first name where it names
   them, keeping the grammar right. Put the company name in
   templates/meeting-summary-template.md in place of <Company>.
`;

// The SHA-256 of each CLAUDE.md as committed in step 1 (41db239), which 0.3.3 left as it is.
export const SHA_STEP1 = {
  sample: '81ac0fb7cd858e7adf44624e757665fea42a05cf7fa73a252e3cfd6887306bcf',
  starter: '9a586f7c2b377d7dfb2ec0781f6a7fc431e8f981bf1c01cbe4e78bd28f0f7bec',
};

const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');

// The skill's sections from its first heading: the review steps, Dates and Action items.
export function skillSections(dir) {
  const skill = read(dir, SKILL);
  return skill.slice(skill.search(/^## /m));
}

// Step 1's CLAUDE.md: without the Standing rules and the skills folder in Sources, reviewed on 2026-10-14, and with
// the skill's sections, less the two lines step 2 added, back before "Notes between meetings"; and in the starter,
// setup step 3 as it was before step 3 of 0.4.0.
export function claudeAsInStep1(dir) {
  const moved = skillSections(dir).replace(LAST_STEP, '').replace(PLACEHOLDER_RULE, '');
  return read(dir, 'CLAUDE.md')
    .replace(STANDING_RULES, '')
    .replace('templates/, .claude/skills/, library/', 'templates/, library/')
    .replace(/^Last reviewed: 2026-10-18$/m, 'Last reviewed: 2026-10-14')
    .replace(SETUP_STEP3, SETUP_STEP3_BEFORE)
    .replace('## Notes between meetings\n', `${moved}\n## Notes between meetings\n`);
}

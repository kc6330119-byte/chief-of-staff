# Help

The app shows what is in your workspace: a folder of plain files on this Mac. Claude Code, run in the same
folder, writes your meeting summaries. The app reads them and keeps track of what is still open.

## Getting started

### Open the sample

1. Click **Open Sample…** on the welcome window, or choose **File > Open Sample Workspace…**
2. Choose where to save the copy and give it a name.
3. The app opens the copy and remembers it for next time.

The sample is a made-up team at a made-up company. While it is open, the sidebar shows "Recreated demo
data". In the sample, Today and the ages count from the date of its newest meeting, not from today, so
it reads the same on any day.

The sample comes with `actions/ledger.json`, in which four items are already closed, on Sep 16 and Sep 22.
So Completed on Today and the activity chart have something to show.

A copy never replaces a file or folder that is already there. If the name is taken, nothing is copied, and
you choose a new name.

The window title shows which folder is open.

### What the pages show

- **Today**: a briefing for the day. It counts to the date at the top: today, or in the sample the date
  of its newest meeting.
  - **The tiles.** **Due today**, **Overdue** and **Due this week** count open items, whoever owns them,
    due on that date, before it, or from it to Friday. Overdue also says how many are over 30 days past
    due. Click one of these three to show only its items in the list. Click it again, or **Show
    everything**, to see them all. **Completed** counts the items closed in the week you pick, and opens
    the Board. **Team alerts** counts your reports with a flag on People, and opens People. A report gets
    a flag after more than 30 days without a meeting with you, or none yet, or when three or more of their
    open items are past due or due within a week.
  - **Needs you now** lists your items and the items owed to you that are past due, due within a week, or
    open more than 30 days. Then it lists the items where a later summary disagrees with your Board. It
    shows the first seven: click **Show all** for the rest. Each row has its buttons: **Close**, and
    **Re-date** (or **Set a date**) on your own items. Where a summary disagrees, the buttons are **Close**
    and **Keep open**, or **Reopen** and **Keep closed**. A row you act on stays where it is, with
    **Reopen** after a Close, until you click **Reload**. After Keep open or Keep closed, it goes.
  - **Team health**: Heavy loads (reports with three or more open items past due or due within a week),
    Overdue, owed to you, No 1:1 in 30+ days, and Awaiting your input (the items where a summary
    disagrees with your Board). Click Overdue, owed to you or Awaiting your input to go to the item's row.
    **View People** opens People.
  - **Week**: This week or Last week, each Monday to Sunday. It changes Completed, the reflections and the
    week in numbers. Everything else stays counted to the date at the top. Today starts on This week each
    time you open it.
  - **What went well** and **What I could do better**: the Coach's own bold headlines, word for word, from
    the "What went well:" and "Could do better:" points in Other Insights of that week's summaries. Click
    one to read the whole point, or its date to open the meeting. Nothing from a Manager-only note is
    shown.
  - **In numbers**: Closed, the items closed that week; Closed on time, how many of those with a due date
    were closed by it; Your overdue items, the open items you own that are past due; and 1:1 coverage, how
    many of your reports you met in the last 14 days. The last two always count to the date at the top. With Last week picked,
    they say "as of" that date.
  - **Weekly activity**: a chart of six weeks, each starting Monday. For each week: the items Created at
    that week's meetings, the items Completed, and the items Overdue (open and past due at the week's
    end). Point at a week to see its numbers.
- **Meetings**: every summary, newest first. Click one to read it. Above the list, "Tracked items across
  all meetings" shows each action item with its ID, owner, age and latest status. **Hide closed** hides the
  items closed on your Board, and those whose latest summary says done or dropped.
- **Board**: three columns, To do, Doing and Done. Every action item with an ID is a card. It stays in To
  do until you move it. Drag a card, or use its arrows. A card in Done is closed.
- **People**: you, then your reports, your manager, peers and others, in the order of `people.md`. Each
  row shows the last meeting with you, what they owe you and what you owe them. Click a name for that
  person's page.
- **Agents**: the coach (`CLAUDE.md`) and each agent in `.claude/agents/`, one card each. The page only
  shows them. Below the cards, "Rules learned" is your log of corrections.
- **Library**: your books, your ratings and your own notes on them.

### Review the sample transcript

The sample has one transcript that has not been reviewed yet.

1. Open Terminal. Go to the sample folder, the one in the window title, and start Claude Code with
   `claude`.
2. Type: `Review the transcript transcripts/Riley 1-1 - 20260929.txt`
3. Claude Code reads the transcript, the goals and the earlier meetings with Riley. It saves a summary in
   `meeting-notes/` and shows a short version in the chat.
4. In the app, click **Meetings**. If Meetings is already showing, choose **View > Reload** (⌘R).

The new summary is at the top of the list. Its action items are on Today and the Board straight away.
Because the sample counts to its newest meeting, Today now counts to this one.

## Make it your own

### Start a new workspace

1. Choose **File > New Workspace…**, or click **New Workspace…** on the welcome window.
2. Choose where to save it and give it a name.
3. The app opens the new workspace and says what to do next.

A new workspace never replaces a file or folder that is already there. If the name is taken, nothing is
made, and you choose a new name.

It holds the coach (`CLAUDE.md`), five agents in `.claude/agents/`, the summary template in `templates/`,
book notes in `library/` and a `people.md` with one row for you. The folders `goals/`, `meeting-notes/` and
`transcripts/` are empty except for a short `README.txt` in each. It is not the sample, so there is no
"Recreated demo data" badge, and ages count to today.

### Set it up with Claude Code

In Terminal, go to the new folder and start Claude Code with `claude`. Then type: `Set up my workspace`

The coach asks one question at a time:

- your full name and the name you go by
- your role
- your company
- the people you meet with: each person's full name, their role, how they relate to you (report,
  manager, peer or other), and any other name they are called

Then it:

- writes `people.md` from your answers, with your own row marked "me"
- puts your first name in `CLAUDE.md` and in each agent, where they say "the manager"
- puts your company in the summary template
- offers to start a goals file in `goals/` for each report, with only what you tell it
- lists every file it changed, then removes the setup steps from `CLAUDE.md`

It never invents people, roles or goals. If you skip a question, that part stays as it was.

Start a new Claude Code session when it is done. Claude Code reads `CLAUDE.md` when a session starts.

The book notes in `library/` are placeholders. The coach coaches you from your notes there, so replace
them with your own.

### If you started from a copy of the sample

A new workspace is cleaner. If you want to keep using a copy of the sample, change these by hand or with
Claude Code:

- [ ] `people.md`: put your own people in it, and mark yourself "me".
- [ ] `templates/meeting-summary-template.md`: change the Company line from Harborline Cloud to your
  company.
- [ ] `CLAUDE.md`: it names Kevin and Harborline Cloud at the top, and Kevin in later rules. Change them to
  your name and company.
- [ ] `.claude/agents/`: each agent names Kevin in its `description:` line. Change it to your name.
- [ ] `goals/` and `meeting-notes/`: remove the sample's goals file and its summaries. The coach and the
  agents read them. Remove the sample transcript from `transcripts/` too.
- [ ] `.sample-workspace`: delete this file. Then choose **View > Reload** (⌘R). The badge goes, and ages
  count to today. The file is hidden: in Finder, press Command-Shift-period to see it.

## Everyday use

### Review a meeting

1. Put the transcript in `transcripts/`, one file per meeting.
2. In Claude Code, in your workspace folder, type: `Review the transcript transcripts/<its file name>`
3. In the app, click **Meetings**, or choose **View > Reload** (⌘R) if it is already showing.

The coach writes the summary in the template's format. It gives each new action item an ID, such as
A-261005-1: the meeting date and the item's row number. Each item has one owner, spelled as in
`people.md`. If a name is not in `people.md`, the coach asks.

The coach only reports. An earlier item goes under "Open Items from Earlier Meetings" with Open, Done or
Dropped. Only you close an item, in the app.

### How the meeting date is found

- The coach takes the date from inside the transcript, not from its file name. It reads the date in
  whatever form the transcript writes it.
- If the date could be read two ways, such as 03/08/2026, or there is no date, the coach asks you.
- If the date inside and a date in the file name disagree, it uses the one inside and tells you.
- It names the summary with the date first, such as `2026-08-03_Weekly_Sync.md`. The app takes the
  meeting's date from the start of that name.

### Close, Reopen, Keep open and Keep closed

- **Close** marks an item done. It moves to Done on the Board. Close is on Today, on a person's page, and
  on each Board card (the round button). Dragging a card into Done closes it too.
- **Reopen** puts a closed item back at the top of To do.
- **Re-date** (or **Set a date**) on Today sets your own due date for one of your items. On the Board,
  click a card's pencil to set your date or a note. **Use the summary’s date** drops your date.

A summary never closes or reopens anything. When a later summary disagrees with your Board, the item shows
at the end of "Needs you now" on Today, and "Awaiting your input" counts it:

- A summary says it is done or dropped, but it is still open in the app. Click **Close**, or **Keep open**.
- You closed it, but a later summary still mentions it as open. Click **Reopen**, or **Keep closed**.

Keep open and Keep closed leave the item as it is, and that report is not shown again. A newer summary
that disagrees shows it again.

### Your own cards

On the Board, click **Add card**. Give it a title. Owner, meeting, due date and note are optional. A card
with you or no one as owner counts as yours on Today. Click the pencil to change it, or the ✕ to delete it.
Only your own cards can be deleted.

### Notes between meetings

Add a short note on a person's page, under "Notes between meetings", or on a meeting's page, under "Since
this meeting". A note has a date (today, or earlier), one person, the text, and if you like a meeting and
one action item. Click **Add note** to save it.

A note's text is private. It shows as "private note" until you turn on **Show private notes**. The switch
is on Meetings, on a meeting's page and on a person's page. It is off each time the app starts or a page is
reloaded. Edit and Delete appear only while the text is shown.

A Board card or a Today row with notes shows "1 note" (or more). Click it to go to that person's page.

The coach reads your notes before it writes the next summary with that person. It never presents a note as
something said in the meeting.

### Search

The Search box is at the top of Today. As you type, ignoring capitals, it finds:

- action items, by ID, title or owner, and your own cards, by title or owner
- meetings, by title, date or attendee
- people in `people.md`, by name, role or any name under Also called

Click a result to open its meeting, the Board (for your own card) or the person's page. Press Escape to
clear the box. Search never searches the text of a note between meetings, a card's note, or a Manager-only
note. Suggested items are not searched until you accept them.

### Run an agent

Ask for an agent by name in Claude Code. For example (people in the sample):
`Use the one-on-one-prep agent. I'm meeting Sam.`

| Agent | What it does |
|---|---|
| `commitment-tracker` | Lists what you have committed to and not closed. |
| `one-on-one-prep` | Briefs you before a one-on-one with one person. |
| `risk-radar` | Lists the work risks stated in your meetings and how each has changed. |
| `negotiation-prep` | Prepares you before you make a request or negotiate with someone. |
| `blind-spot-check` | Checks a plan or a draft message against your own coaching points. |

The agents only read files. Each answers in the chat, and the coach shows the answer as the agent wrote
it.

### The weekly brief

Type, for example (people in the sample): `Give me the weekly brief. I'm meeting Sam and Riley this week.`
Name the people you are meeting, or leave that part out.

The coach runs commitment-tracker and risk-radar, and one-on-one-prep once for each person you name. Then
it writes one page: Priorities, Decisions needed, Collisions and Proposed escalations. It never sends
anything, and it saves the brief only if you ask. It is a draft: read it before you use it.

With the sample, add "as of" and the date of its newest meeting: `as of Sep 22, 2026`, or `as of Sep 29,
2026` once you have reviewed the Riley transcript. The agents then leave out anything dated after it, and
commitment-tracker counts ages to that date instead of today.

## FAQ

### What does "could not read" mean?

The app could not read a table, a field or a date reliably, so it shows "could not read" in that place
instead of guessing. To see why, open the line at the top of the page that says how many things could not
be read. It lists each file and the reason. On Today, the last line says how many and links to Meetings.

### What does "Suggested" mean?

The coach marks anything that was not said in the meeting as "(suggested)". The app keeps these items
apart from what was agreed:

- On the Board they are hidden until you tick **Show suggested**. Their one action is **Accept**. After
  that, the item is a card like any other.
- They are not on Today until you accept them.
- On Meetings, **Hide suggested** hides them from the tracked items. It is on when the page opens.

### Where does my data live?

In your workspace folder, as plain files. The app keeps nothing else, except one small file that remembers
which folder to open: `~/Library/Application Support/com.practicalaishift.chiefofstaff/settings.json`. It
holds the folder's path and nothing more.

### Which files does the app write?

Only these four, in the workspace:

- `actions/ledger.json`: what you close, reopen, re-date, accept and keep, your own cards, and the order of
  the Board. In a new workspace it is made the first time you change something. The sample comes with one.
- `notes/notes.json`: your notes between meetings. It is made with your first note.
- `library/books.json`: your books, from the Library page.
- `corrections/corrections.json`: your log under "Rules learned" on the Agents page.

Opening a page writes nothing. The app never writes a summary, `people.md`, `CLAUDE.md` or an agent.

### What stays private?

- In a summary, anything marked "Manager-only note" is hidden until you turn on **Show private notes**.
  So is the text of your notes between meetings.
- The coach keeps notes about someone's wellbeing brief, puts them only in a Manager-only note, and never
  records health details.
- The weekly brief never copies the text of your notes. It says only that a note exists, and its date.
- The app opens no network port and makes no network calls.

Claude Code is a separate program. Meeting notes and goals about real people are personnel data: check
your employer's rules before you use them with any AI tool.

## Troubleshooting

### An item doesn't close

- **It is suggested.** Accept it on the Board first. Tick **Show suggested** to see it.
- **It has no usable ID.** The Board says how many action items have no usable ID, and on Meetings such a
  row shows "no ID" or an ID that is not in the form A-YYMMDD-n. Ask Claude Code to give the item an ID in
  that form.
- **A summary says it is done.** That is a report, not a close. Close it yourself, on Today in "Needs you
  now".
- **The app can't save.** If `actions/ledger.json` can't be read, the app says so and saves nothing until
  the file is fixed.

### A person is missing from People

People lists only the people in `people.md`. Names from the summaries that are not there are listed at
the bottom, under "Not in people.md". Add a row for the person with Name, Role, Relationship and Also
called. Relationship is one of me, report, manager, peer or other. Put any other spelling of their name
under Also called, separated by commas.

The app never writes `people.md`. Edit it in a text editor, or ask Claude Code. Then choose **View >
Reload** (⌘R).

### An agent card looks wrong

A card is built from parts of its file: the `name:` line, the lines that start with `Purpose:`,
`Sources:` and `Last reviewed:`, and the first numbered list, shown as Rules. If one is missing, the card
says "could not read" there, and the top of the page says why. To fix the card, ask Claude Code to put the
missing part back.

- "Review due" shows when Last reviewed is more than 30 days old. "Review date unknown" means the date is
  missing or can't be read.
- In a new workspace, the Coach card's rules are the setup steps until "Set up my workspace" is done.
- The page reads the files each time it opens. After a change, click another page and back, or choose
  **View > Reload** (⌘R).

### An old copy of the sample has only two agents

An older copy of the sample has only negotiation-prep and blind-spot-check. To add the others:

1. Choose **File > Open Sample Workspace…** and save a new copy. The app opens it.
2. Copy `commitment-tracker.md`, `one-on-one-prep.md` and `risk-radar.md` from the new copy's
   `.claude/agents/` into your old copy's `.claude/agents/`. `.claude` is hidden: in Finder, press
   Command-Shift-period to see it.
3. For the weekly brief, copy the last section of the new copy's `CLAUDE.md`, "When Kevin asks for the
   weekly brief", to the end of yours. Copy the section above it, "When Kevin asks for one of his
   agents", too if yours doesn't have it.
4. Choose **File > Choose Workspace…** (⌘O) to open your old copy again. Then start a new Claude Code
   session in it.

### Starting over

The app never deletes a workspace. To start fresh, choose **File > New Workspace…** or **File > Open
Sample Workspace…**, and the app opens the new folder and remembers it. Your old folder stays as it was.
Open it again with **File > Choose Workspace…** (⌘O), or delete it in Finder.

To clear only what you did in the app on items and cards, delete `actions/ledger.json`. Every action item
goes back to To do, open, with no date of yours, and your own cards are gone. This can't be undone.

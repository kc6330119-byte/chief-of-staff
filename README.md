# Chief of Staff for Managers

A Mac app for a manager's meetings. It shows what is in a workspace: a folder of plain files that Claude Code
keeps for you. Meeting summaries in Markdown, the people you meet, the books you draw on, the assistant's own
instructions and agents, and a log of corrections. The files are the source of truth. The app reads them and
writes only four of them: what you close and re-date, your notes between meetings, your book list and the
corrections log.

A Rust core reads and writes the files and answers every request. The interface is drawn with HTML, CSS and
JavaScript inside a native macOS window (the system's own WebKit, through Tauri). There is no server, no
browser and no network port.

Version 0.3.0, built from Mission Control Native 0.1.1.

## Download

Download `Chief-of-Staff-for-Managers-0.3.0-universal.dmg` from [the latest release][latest]. It runs on
macOS 13 or later, on Apple silicon and Intel Macs.

1. Open the `.dmg`. A window shows the app and a shortcut to Applications.
2. Drag "Chief of Staff for Managers" onto Applications.
3. Eject the disk image, then open the app from Applications.

The app and the `.dmg` are signed with a Developer ID and notarized by Apple, and the notarization ticket is
stapled to both. The first time you open the app, macOS asks you to confirm, and says that Apple checked it
for malicious software and found none. The stapled ticket lets it open on a Mac that is offline.

[latest]: https://github.com/kc6330119-byte/chief-of-staff/releases/latest

## Opening a workspace

On first launch the app asks for your workspace folder. You can:

- **Choose Folder…** to open your own workspace.
- **New Workspace…** to start your own workspace in a folder you name: see "Start your own workspace"
  below.
- **Open Sample…** to save a copy of the sample workspace to a folder you name, and open it. The sample is
  fictional: an invented company and team, and one real name, the manager's. Its three book-notes files are
  placeholders. Its `actions/ledger.json` has four items already closed, on Sep 16 and Sep 22, so Today's
  Completed tile and activity chart have something to show. While it is open, the sidebar shows "Recreated
  demo data". The sample never replaces a file or folder that already exists.
- **Quit.**

The app remembers the folder. To switch, use File ▸ Choose Workspace… (⌘O), File ▸ New Workspace… or
File ▸ Open Sample Workspace…, and the window title shows which folder is open.

If a folder has no `meeting-notes`, `CLAUDE.md`, `library` or `corrections`, the app warns that it may not be
a workspace before it opens it.

## Start your own workspace

1. Choose File ▸ New Workspace…, or click **New Workspace…** on the welcome window, and name the folder. The
   app makes it and opens it. It holds the coach, the five agents, the summary template, the placeholder book
   notes, an empty corrections log and a `people.md` with one row for you, and nothing from the sample.
2. In Terminal, go to the new folder, start `claude` and type `Set up my workspace`. The coach asks for your
   name, role, company and the people you meet with, then writes `people.md` and puts your name and company
   in the coach, the agents and the template.

Then start a new Claude Code session in the folder.

## The pages

The sidebar holds six pages. The app opens on Today. Below them, **Help** opens the Help page: getting
started, everyday use, an FAQ and troubleshooting. `help.md` in this repository is the same text.

- **Today**: a briefing, counted to the as-of date (today, or the sample's newest meeting). Five tiles: Due
  today, Overdue and Due this week, each of which filters the list, then Completed and Team alerts. "Needs you
  now" lists your items and those owed to you that are past due, due within a week or open more than 30
  days, then the items a later summary disagrees with your Board about: Close, Re-date, Keep open, Keep
  closed and Reopen work here. Team health shows heavy loads, overdue items owed to you, reports with no 1:1
  in 30+ days, and how many items await your input. A Week picker, This week or Last week, starts on This
  week each time and changes Completed, the reflections (the Coach's own bold headlines from that week's
  summaries, word for word) and the week in numbers; Your overdue items and 1:1 coverage stay as of
  the as-of date, and say so. A chart shows six weeks of items created, completed and overdue. Search, at
  the top, finds action items, meetings and people, and never searches a note's text or a Manager-only
  note. If `people.md` has no single person marked "me", the list holds those items whoever owns them, and
  Team health says why it can't be shown. The sidebar's Today item shows how many rows need you.
- **Meetings**: every summary, newest first, and "Tracked items across all meetings": each action item with its
  ID, owner, first-seen date, age and latest status, word for word. Filters: Hide closed (closed on the
  Board, or reported done or dropped in a summary), Hide suggested, and owner. The list of summaries has its own filter, Attendee, which shows only the meetings that
  person attended.
- **Board**: To do, Doing, Done. Every action item with a usable ID is a card, in To do until you move it.
  Moving a card into Done closes it; moving it out reopens it. Drag cards, or use the arrows and the Close and
  Reopen buttons. An action item opens in place for your own due date and a note; "Use the summary's date"
  drops yours. Add, edit and delete your own cards. Suggested items are hidden until "Show suggested", and
  have one action, Accept. What a summary reports never moves a card; it shows as a tag.
- **People**: you at the top, then reports, your manager, peers and others, in `people.md` order. Each row
  shows the last meeting with you, what they owe you and what you owe them, how many of your notes about
  them are dated since that meeting and, for reports, two flags: no 1:1 for more than 30 days (or none yet),
  and a busy week (three or more of their open items past due or due within seven days). Names in the summaries that are not
  in `people.md` are listed below. One person's page has what they owe you, what you owe them (with Close and
  Re-date), "Notes between meetings" and the meetings they attended.
- **Agents**: the coach (`CLAUDE.md`) and each agent in `.claude/agents/`, read-only, with a "Review due" mark
  after 30 days. The rules on each card are collapsed until you open them: click "Rules (N)", or use the
  keyboard. Each card opens on its own, and all are closed again when the page loads. Below them, "Rules learned": the corrections log, where you add a correction.
- **Library**: your books, your ratings and your own notes. The sample contains no text from any book, and
  the Library shows only what is in your own notes files.

Anything marked "Manager-only note" in a summary, and the text of your notes between meetings, stays hidden
until you turn on "Show private notes". The switch is off each time the app starts or a page is reloaded.

When a table, field or date can't be read reliably, the app shows "could not read" and lists the problem.
It never guesses.

### Notes between meetings

On a person's page, or on a meeting's page under "Since this meeting", you can add a short note: a date (today
by default, never later; see "Ages and dates"), one person from `people.md`, the text (up to 2,000 characters), and optionally a
meeting that person attended and one action item. Edit and Delete need the text shown. Without `people.md`,
notes can't be added and the box says why. Board cards and Today rows show "1 note" (or more), linking to the
person.

The notes are yours. The coach reads them before it writes a summary, never presents one as something said
in the meeting, and never puts one in Action Items. A work fact from a note, such as an item that is done or a
date that has moved, may go in that item's row under Open Items from Earlier Meetings as "Kevin noted on
<date>: …". Anything else goes only in the Manager-only note.

### Ages and dates

Ages count to today. In the sample, which holds the file `.sample-workspace`, they count to the newest
meeting's date instead, so the sample reads the same on any day.

## Using it with Claude Code

The summaries and the coaching come from Claude Code, run in the same folder. You need Claude Code installed
and signed in.

1. In Terminal, go to your workspace folder and start `claude`. The app's window title shows which folder
   that is.
2. `CLAUDE.md` is the coach. It is active as soon as the session opens. The agents are the files in
   `.claude/agents/`; the sample has five, described in "The agents" below. To see which ones a
   session has, ask `Which agents in .claude/agents can you use in this project?`

### Prompts to try

| To do this | Type this |
|---|---|
| Turn a transcript into a meeting summary | `Review the transcript transcripts/2026-10-05_kevin-sam_1on1.txt` |
| Prepare before you ask someone for something | `Use the negotiation-prep agent. I want to ask Praveen to run pairing sessions with Riley.` |
| Check a plan against your own coaching points | `Use the blind-spot-check agent on this plan: <your plan or draft message>` |

After a review, click Meetings in the app to see the new summary. If the page is already showing, reload it
with View ▸ Reload (⌘R). Its action items are on Today and the Board straight away.

### The summary format

The template is `templates/meeting-summary-template.md`. The coach gives every new action item an ID,
A-YYMMDD-n (the meeting date and its row number), and never changes or reuses one. Each item has one owner,
spelled as in `people.md`, the words said about when it is due, and a due date only when those words fix a
day. An earlier item is never listed again as new: it goes under Open Items from Earlier Meetings with its
ID, and its "Status now" starts with Open, Done or Dropped. The coach reports; only you close an item, in the
app.

The app follows an item by its ID. A row with no ID is shown on Meetings as "no ID" and can't be on the
Board.

### Before you start

- The sample has one transcript to try, `transcripts/Riley 1-1 - 20260929.txt`. A new workspace has an empty
  `transcripts/` folder: put your transcripts in it.
- The coach reads the meeting date from inside the transcript, in whatever form it is written, and saves the
  summary as YYYY-MM-DD_<transcript name>.md. The app reads the meeting's date from the start of that name. If
  the date is unclear, the coach asks.
- `people.md` lists everyone in your meetings: Name, Role, Relationship (me, report, manager, peer or
  other) and Also called. Mark yourself "me". The coach asks about any name it can't find there. Today and
  People need it to tell what you owe from what is owed to you.
- The sample's book notes are placeholders. Expect the coach to say so until you write your own notes in
  `library/`.
- The sample is written for a fictional team. To make it yours, follow "Changing the coach and the agents"
  and "Your own goals" below, put your own people in `people.md`, and remove the sample's summaries from
  `meeting-notes/`. The coach and the agents read the summaries there.
- The sidebar shows "Recreated demo data" while the workspace holds a file named `.sample-workspace`. Delete
  that file, then reload with View ▸ Reload (⌘R), to remove the badge. It is hidden: in Finder, press
  Command-Shift-period to show it.
- For real work, a new workspace is cleaner than converting the sample: see "Start your own workspace"
  above.

### Changing the coach and the agents

The coach is `CLAUDE.md`. Each agent is a file in `.claude/agents/`. Change them in a Claude Code session or
in any text editor. No special wording is needed: name the one you mean and say what should change, for
example `Change the negotiation-prep agent so it asks me for a deadline first.`

The Agents page reads these files each time it loads. A change shows when you click to another page and
back, or reload with View ▸ Reload (⌘R). Each card is built from set parts of the file:

| On the card | Comes from |
|---|---|
| Name | the `name:` line at the top of an agent file, with hyphens shown as spaces: `negotiation-prep` shows as "Negotiation prep". Without that line, the file name. The coach is always named "Coach". |
| Tools | the `tools:` line at the top of an agent file. Without it, the card has no Tools line. |
| Purpose, Sources it may read, Last reviewed | the lines that start with `Purpose:`, `Sources:` and `Last reviewed:` |
| Rules | the first numbered list in the file, with the line just above it as a caption. Collapsed behind "Rules (N)" until you open it. |

If Purpose, Sources, Last reviewed or the rules are missing, the card says "could not read" in that place
and the page lists the problem at the top. The coach or agent still works in Claude Code. To keep the card
whole, add this to your request:

`Keep the Purpose, Sources and Last reviewed lines and the numbered rules. Set Last reviewed to today's date
as YYYY-MM-DD.`

- "Review due" shows when the Last reviewed date is more than 30 days old. If the date is missing or can't
  be read, the card shows "Review date unknown" instead. The date changes only when someone edits it.
- Claude Code decides when to use an agent from the `description:` line at the top of its file. If you
  change what an agent is for, change that line too, and say when to use it.
- A new `.md` file in `.claude/agents/` gets its own card. Remove a file and its card goes.
- The Library page uses the same names and Sources lines. If you rename an agent, a book whose "Used by"
  still has the old name shows it with a "?". If a book's "Used by" and an agent's Sources line disagree
  about the book's notes file, the book gets a ⚑ check mark. Edit the book or the Sources line to match.
- Start a new Claude Code session after a change. Claude Code reads `CLAUDE.md` when a session starts.
- The sample's `CLAUDE.md` opens by naming its manager, Kevin, and a fictional company, Harborline Cloud.
  Kevin's name is also in later rules of `CLAUDE.md`, in the weekly-brief section, in each agent's
  `description:` line and in the summary template. Change these to your own name, role and company first.

### Your own goals

The app does not show goals. Claude Code reads them: the coach when it reviews a transcript, and the
negotiation-prep and one-on-one-prep agents.

- Put goals in `goals/` as text (`.md`) files, one per person or one for the team. The sample has one file
  for a whole team. Copy its layout, then remove it once your own files are in place, so fictional goals
  are not mixed with yours.
- If your goals are PDFs, convert them once. Put the PDFs in a folder of their own in the workspace, such
  as `goals-source/`, and ask for each one: `Read goals-source/<name>.pdf and write goals/<name>.md in the
  layout of the sample goals file. Copy the goals, weights, measures and dated check-ins exactly. Add
  nothing.` Then check each file against its PDF. Tables are where a conversion goes wrong.
- Text files matter for two reasons. Claude Code's search works on text and does not look inside a PDF.
  And the coach uses only check-ins dated on or before the meeting, so it has to be able to read the dates.
- With one file per person, change step 1 of `CLAUDE.md` from "the goals file" to "the goals files for the
  people in the meeting".
- Goals, meeting notes and your notes between meetings about real people are personnel data. Check your
  employer's rules before you put them through any AI tool, and keep them out of anything you share.

### The agents

The sample's `.claude/agents/` holds five agents. Each one only reads files and answers in the chat.

| Agent | What it does |
|---|---|
| `negotiation-prep` | Prepares you before you make a request or negotiate with someone. |
| `blind-spot-check` | Checks a plan or a draft message against your own recurring coaching points. |
| `commitment-tracker` | Lists what you have committed to in your meetings and have not closed. |
| `one-on-one-prep` | Briefs you before a one-on-one: what's open, what you owe them, what they owe you, and what to ask. |
| `risk-radar` | Lists the work risks stated in your meetings and how each one has changed. |

The weekly brief is not an agent but the last section of `CLAUDE.md`, "When Kevin asks for the weekly brief",
so it has no card of its own: it runs the agents and writes one page of priorities, decisions needed,
collisions and a draft escalation. The Coach card doesn't show its rules either, because a card shows only
the first numbered list in its file and the weekly-brief rules are a bulleted list further down.

#### What they read

commitment-tracker, one-on-one-prep, risk-radar and the weekly brief work from the action items:

- Every action item has an ID, such as A-260505-1. They follow an item from meeting to meeting by its ID,
  never by its wording.
- Whether an item is open or closed comes from `actions/ledger.json`, the file the app writes when you close
  an item on Today, the Board or a person's page. An item is closed only when the ledger has it in Done. With
  no entry, or no ledger, it is open. When a summary and the ledger disagree, they show both.
- commitment-tracker and one-on-one-prep read `people.md` to know who is who. You are the person marked "me"
  there.
- one-on-one-prep also reads `notes/notes.json`, the notes you write in the app between meetings. Under "My
  notes since then" it prints your notes about that person, dated after your last meeting, word for word in
  the chat.
- The weekly brief never copies a note's text. It says only that a note exists, and its date.
- None of them repeats anything from a Manager-only note.
- None of them reads a book's notes in `library/`.

#### Prompts to try

With the sample, give an "as of" date. The sample's newest meeting is Sep 22, 2026, and without a date the
agents count ages to today.

    Use the commitment-tracker agent. What do I owe, as of Sep 22, 2026?
    Use the risk-radar agent. What are the risks, as of Sep 22, 2026?
    Use the one-on-one-prep agent. I'm meeting Sam. As of Sep 22, 2026.
    Give me the weekly brief as of Sep 22, 2026. I'm meeting Sam and Riley this week.

#### Adding them to a workspace you already have

A workspace made from an earlier sample has only `negotiation-prep` and `blind-spot-check`. To add the
others, make a copy of the sample with File ▸ Open Sample Workspace… (or use `sample-workspace/` in this
repository), then:

1. Copy `commitment-tracker.md`, `one-on-one-prep.md` and `risk-radar.md` from the sample's
   `.claude/agents/` into your workspace's `.claude/agents/`. `.claude/` is hidden: in Finder, press
   Command-Shift-period to show it.
2. For the weekly brief, copy the section "When Kevin asks for the weekly brief", from its heading to the
   end of the sample's `CLAUDE.md`, to the end of your `CLAUDE.md`. It refers to the two rules in the section
   "When Kevin asks for one of his agents", so keep that section above it, and copy it too if yours doesn't
   have it.
3. Start a new Claude Code session in the workspace. To check that it has the new agents, ask
   `Which agents in .claude/agents can you use in this project?`

The Agents page shows a card for each new agent when you click to another page and back, or reload with
View ▸ Reload (⌘R).

#### What was tested

In October 2026 with Claude Code 2.1.293, on a copy of the sample with a small test ledger and one test
note, two answers from commitment-tracker, one from one-on-one-prep and two weekly briefs were checked
against the six summaries and the ledger. Each brief runs the agents itself.

What the tests found, and what was changed:

- The tracker ended one answer with full file paths. A rule was added: name a file by its file name only, and
  don't end with a list of the files used.
- The first brief used "his" for a person the summaries call "they". A rule was added: use "he", "she" or
  "they" only where the agents' answers do.
- It asked again about a decision already made. A rule was added: an item you have already kept open is not
  a decision.
- It treated a due date set in the app as a conflict. A rule was added: a due date you set in the app is your
  choice, not a conflict.
- It listed suggestions that had not been accepted. A rule was added: leave them out of "Decisions needed".

After the last run, one more rule was added to the brief: the source tags go after the draft message, never
inside it. That rule has not been run again.

#### What to know

- The weekly brief is a draft. Read it before you use it, and check any message it drafts before you send it.
- The agents name Kevin, as the sample does: in each `description:` line and in the weekly-brief section.
  Change these to your own name. The agents find you in `people.md` as the person marked "me".
- Items marked "(suggested)" are kept apart from what you agreed to, unless the ledger shows you accepted
  them on the Board.
- risk-radar lists work risks only. It is told never to list a risk about a person.
- Meeting notes and goals about real people are personnel data. Check your employer's rules before you put
  them through any AI tool.

## What it reads and writes

It reads `meeting-notes/*.md`, `people.md`, `CLAUDE.md`, `.claude/agents/*.md`, `library/books.json` and the
notes files it lists, `corrections/corrections.json`, `actions/ledger.json` and `notes/notes.json`.

It writes only four files in the workspace:

- `actions/ledger.json`: what you close, reopen, re-date, accept and keep, and the order of the Board's
  columns. In a new workspace it is created on the first change; the sample comes with one. Opening a page
  writes nothing.
- `notes/notes.json`: your notes between meetings. Created on the first note.
- `library/books.json`
- `corrections/corrections.json`

It never writes a summary, `people.md`, `CLAUDE.md` or an agent. Each save goes to a temporary file that is
then renamed over the old one, and fields the app doesn't use are kept as they were. If one of these files
can't be read, the app says so and refuses to save it rather than overwrite it.

`board/board.json`, from Mission Control, is no longer read or written. If a workspace has one, the Board
says so once.

Outside the workspace it writes one small file, holding the workspace folder's path and nothing else:
`~/Library/Application Support/com.practicalaishift.chiefofstaff/settings.json`.

## Privacy and the network

The app opens no network port and makes no network calls. Its pages can load nothing from outside the app,
and links to websites open in your default browser, not in the app. Manager-only notes and the text of your
notes between meetings are removed by the core before a page receives them, unless you turn the switch on.

## Build from source

You need macOS 13 or later, [Rust](https://rustup.rs) and Node.js 22 (for the Tauri command-line tool and
the tests). A universal build also needs the Intel target: `rustup target add x86_64-apple-darwin`.

```sh
npm install
npm test              # the test suite (see below)
npm run app           # run the app while developing
npm run build:app     # the release app, universal, in target/universal-apple-darwin/release/bundle/macos/
npm run check:app     # builds the app and checks it in a real window (takes a few minutes)
```

`npm run check:app` opens the app window several times and takes screenshots of it. Leave the screen
uncovered, with nothing over the window, until it finishes.

`npm run build:app` signs the app with a "Developer ID Application" identity if one is in your keychain, and
otherwise signs it ad-hoc and says so; an ad-hoc build runs on the Mac that built it. `npm run package` makes
the `.dmg` in `target/dist/`, and with a Developer ID also notarizes and staples it, using a notarytool
keychain profile named `mc-notary`. `npm run check:release` checks the result. The app runs on macOS 13 or
later.

### Tests

`npm test` runs the test suite against the Rust core, using the sample workspace in `sample-workspace/` as
its data (set `MC_TEST_DATA` to use another folder). The tests reach the core through a small test server
that listens on 127.0.0.1 while they run; it is never part of the app.

`SPEC.md` is the spec of Mission Control Native 0.1.1, kept as it was, with every decision made while
building it.

## Known limits

- In a folder with no `library/books.json` or `corrections/corrections.json`, the Library page or "Rules
  learned" shows a notice naming the missing file. Adding a book or a correction there is refused, and the
  app does not create those files. A copy of the sample and a new workspace both provide them.
- A page does not update by itself when a file changes on disk. Click another page and back, or use View ▸
  Reload (⌘R).
- The Meetings page lists only files in `meeting-notes/` whose names end in `.md`.
- A notes file in `library/` is listed only if its name uses letters, digits, `.`, `-` and `_`. A notes file
  whose name has a space or an accented letter is not shown.

## As is

This app is shared as it is, with no support and no warranty. Questions, issues and pull requests may go
unanswered.

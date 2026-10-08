> History: this is the spec of Mission Control Native 0.1.1, kept as it was. Chief of Staff for Managers 0.1.0 was built from it.

# Mission Control site: build spec

## Goal
A local website that shows what is in my Mission Control workspace. The files are the source of truth.
The site reads them and saves only three things: the board, the book list and the corrections log.

## Run
- Node.js 22. `npm install`, then `npm start` serves http://localhost:3000.
- Listen on 127.0.0.1 only. No database, no build step, no accounts.
- Plain HTML, CSS and JavaScript in the browser. No CDNs and no network calls: it must work offline.
- Data root: ../mission-control-demo by default, or the MC_ROOT environment variable.

## Data it reads
- meeting-notes/*.md, CLAUDE.md, .claude/agents/*.md
- library/books.json and the notes files in library/ that it lists
- corrections/corrections.json
- board/board.json (create it if missing)

## Pages
1. Meetings. List the summaries newest first (date, people, type). Click one to read it as rendered Markdown.
   At the top, "Open items across all meetings": one row per open item, with owner, first seen, age in days
   and latest status, built from each summary's "Action Items" and "Open Items from Earlier Meetings" tables.
   Hide every "Manager-only note" by default, behind a "Show private notes" switch that is off on load.
2. Board. Three columns: To do, Doing, Done. An "Import action items" button adds cards from the summaries
   without duplicates (key: meeting file + item number). Each card shows the owner and links to its meeting.
   Drag and drop, plus left/right buttons for keyboard use. I can add, edit and delete my own cards.
   Save to board/board.json.
3. Library. A table from books.json: title, author, my rating (1-5), read (yes/no), date read, used by
   (which agent), and a link to my notes file. Sort by any column. A form adds or edits a book.
   Show my notes only. Never store or display text from the books themselves.
4. Agents. One card for CLAUDE.md (the coach) and one per file in .claude/agents/. Show the name, purpose,
   sources it may read, rules, and the "Last reviewed:" date from the file. Mark "Review due" after 30 days.
   Read-only.
5. Corrections. A table from corrections.json: date, where, what happened, who caught it, my decision, and
   the rule it became. A form adds an entry. Show the total at the top.

## Look
- Dark navy theme (#0B1220 background), one sky-blue accent, Inter if installed or the system font.
- Readable in a 1080p screen recording: 16 px base text or larger, generous spacing.
- Header: "Mission Control", the five page links, and a small "Local only" chip.
  When MC_DEMO=1, also show a "Recreated demo data" badge.

## Safety
- Write only board/board.json, library/books.json and corrections/corrections.json. Never change or delete
  meeting notes, goals or instruction files.
- Refuse any path outside the data root.

## Checks
- `npm test` confirms: 6 meetings are listed; the open-items roll-up includes "Ask Dana for a two-week
  alert-hygiene sprint", first seen Jul 28, 2026; no "Manager-only note" text is in the default page output.
- If a table or field can't be parsed reliably, show "could not read" and tell me. Don't guess.

## Steps (stop after each for my review)
1. Server and the Meetings page.
2. Board.
3. Library and Agents.
4. Corrections, the look, tests and a README.

## Decisions (2026-10-02)
1. Roll-up matching is conservative: rows are merged only when they come from the same meeting date and the
   text matches closely. Anything uncertain stays as its own row, tagged "unmatched". Each row lists the
   meetings it came from.
2. The section is renamed "Tracked items across all meetings". It lists every tracked item with its latest
   status word for word and does not decide what is closed. A "Hide closed" filter, off by default, hides only
   statuses that start with "Closed" or "Done".
   The test changes to: the alert-hygiene sprint item is listed, first seen Jul 28, 2026, and its latest status
   starts with "Closed".
3. Age in days: when MC_DEMO=1, count to the newest meeting and label it "as of <date>". Otherwise count to today.
4. Kevin creates the two agent files and adds Purpose, Sources and Last reviewed lines to CLAUDE.md before
   step 3. On the Agents page a missing field shows "could not read" and a missing folder shows a plain message.
5. Board: imported cards can be moved and deleted but not edited; only hand-added cards can be edited. A deleted
   imported card stays deleted on re-import. Import leaves out "(suggested)" items by default, with an "Include
   suggested items" checkbox, and tags them when included. Each card shows its meeting date. All imported cards
   start in To do.
6. Defaults:
   - Manager-only notes are removed on the server unless the switch asks for them, so they never reach the
     browser by default.
   - Markdown is rendered with the `marked` package from node_modules, with raw HTML escaped.
   - Library: "used by" is a set of checkboxes for Coach plus the agents that are found. The notes link opens
     inside the site, and fields the table doesn't show (such as year) are kept when a book is saved.
   - Corrections: partial dates such as "2026-09" are shown as written, and the file's top-level "note" is kept.
   - The data root resolves relative to the site folder.
   - Saves write a temporary file and rename it over the target. No backup files.
   - Dark theme from step 1, with styling finished in step 4. 18 px base text.

## Decisions (step 1 review, 2026-10-02)
7. No further merging of tracked items. Rows that look like the same item stay separate; the matching from
   decision 1 is not widened. Duplicates will be fixed at the source with stable item IDs.
8. Tracked-items table: rows whose first-seen date could not be read sort to the bottom. No inner scroll box:
   the page scrolls, the header row stays sticky, and every column (including "From meetings") is fully visible
   with no sideways scroll at 1280 px and wider.
9. Filters next to "Hide closed": "Hide suggested" (on by default) and an Owner dropdown built from the owners
   in the data (default "Everyone"; a row with several owners matches any of them; owners are the names outside
   parentheses). The table shows "Showing X of N" so nothing is hidden silently.
10. A meeting page shows its header fields (Date, Duration, Attendees, Company, Type, Prior context) one per
    line. A missing field shows "could not read".
11. The site does not write to corrections/corrections.json until the Corrections page (step 4).

## Decisions (step 2 review, 2026-10-02)
12. Board cards are compact: the title is at normal weight, clamped to two lines, with the full text shown on
    hover (laid over the card) and on keyboard focus (expanded in place). Owner and meeting date share one line
    with the move, edit and delete controls. Aim: at least eight cards visible per column at 1080 px high.
13. The board uses the full window width. The three columns fill the window height and scroll their own cards,
    so every column is always a drop target. The page itself does not scroll.
14. Board Owner dropdown: same as the Meetings page (default "Everyone", same owner rules). It only filters
    what is shown and never changes board.json. The page shows "Showing X of N cards". Moves are saved as
    "before card X" rather than a position, so drops land correctly while the filter is on.
15. A card added by hand goes to the top of its column.
16. No "Restore deleted cards" control. Imported card text stays frozen as it was at import.

## Decisions (step 3 build, 2026-10-02; for review)
17. Library notes open inside the site, and only files that books.json lists as a book's notes can be shown.
    Any other file in library/ is refused. The form has no field for text from a book.
18. Library form rules: title and author are required, and the same title and author can't be added twice.
    Rating is 1–5 or empty. A book marked unread can't have a rating or a date read, and a date read can't be
    in the future. "Used by" offers the Coach plus each agent, and keeps any existing name even if no agent
    matches it (such names show with a "?" in the table). New books are saved without a "year" field.
    An edit is refused if books.json changed since the page loaded.
19. Agents: an agent's name comes from its frontmatter "name" and is shown in the form books.json uses
    ("negotiation-prep" becomes "Negotiation prep"). The rules are the file's first numbered list, with the
    line before it as a caption. Tools are shown when the frontmatter lists them. "Review due" counts from
    today's date, also in demo mode.

## Decisions (step 4, 2026-10-02)
20. blind-spot-check keeps its "Coaching opportunity" Sources wording; the May 5 summary predates the
    labelling rule.
21. Corrections: newest first. Full dates are formatted like the rest of the site; partial dates such as
    "2026-09" are shown as written. The form needs all six fields. A date may be YYYY-MM-DD or YYYY-MM,
    not in the future. An exact repeat (same date, where and what happened) is refused. Entries are appended,
    and the file's "note" is kept and shown in small print under the table.
22. Look pass: the sky-blue accent is the only accent colour (green status colours were replaced). Yellow is
    kept only for warnings and "could not read", and red only for delete. Library Title column widened so
    every current title fits in two lines at 1280 px and wider. Agents field labels sit above their values.
23. Library check marks compare only file paths written out in a Sources line (e.g. library/x.md); a folder
    such as "library/" doesn't count. A Sources line that names a notes file no book lists is reported in a
    note under the table. Nothing is written.
24. Tests start the site with `npm start` on a scratch copy of the data folder and check only HTTP responses
    and saved files. All request paths are in one adapter (test/helpers/site.js).

## Decisions (native app, 2026-10-03)
25. The site becomes a native Mac app built with Tauri. The logic moves from Node to a Rust core (core/). The
    five pages keep their HTML, CSS and JavaScript. The app opens no network port and needs no server. This
    replaces the "Run" section, the `marked` default in decision 6, the site-folder default for the data root,
    and decision 24.
26. Tests: the five test/*.test.js files stay byte for byte unchanged; only test/helpers/site.js may change.
    They reach the core through test-server/, a loopback HTTP wrapper used only by the tests and never part
    of the app. Routes, request checks and the page files live in the core, so the test server and the app
    answer the same way. The checks for "127.0.0.1 only", the Host header and cross-site writes therefore
    test the test server; the app's "no port at all" is checked separately in the app step.
27. Markdown is rendered with comrak. As before, raw HTML and scripts in a note are escaped and shown as
    text, never run; images show only their alt text; links other than http(s), mailto, # and relative
    paths show as text. The output matches what marked produced apart from line breaks between tags and
    entities such as `&copy;` written as the character.
28. Data folder: the app asks for it on first launch and remembers it in ~/Library/Application Support. The
    settings file holds the folder path and nothing else. The app shows the current workspace path, and a
    menu item chooses a different one. If the remembered folder is missing, the app asks again and never
    creates it.
29. Demo mode is automatic, never a toggle: it is on when the workspace has a `.sample-workspace` file at
    its top level, so the "Recreated demo data" badge follows the data. This replaces MC_DEMO in decision 3
    and in "Look".
30. Sample workspace: a copy of mission-control-demo without .DS_Store, board.json, transcripts, agendas,
    reruns and agent-drafts.md, with the `.sample-workspace` file. "Open sample" copies it to a folder Kevin
    picks and never overwrites an existing folder. The three book-notes files are kept easy to swap for
    placeholders; that choice is still open.
31. Signing: ad-hoc for the build steps on this Mac. No .dmg is built for other people until there is a
    Developer ID; the published build will be signed, notarized and universal (Apple silicon and Intel).
    Right-click > Open no longer bypasses the Gatekeeper warning on current macOS.
32. The "Local only" chip's tooltip reads "Runs on this Mac. No server, no network calls."
33. Known bug, kept in step 1 so Node and Rust behave the same: the Library form limits "Date read" by the
    UTC date while the core checks the local date, so on a US evening the form offers tomorrow and the save
    is refused. It is fixed in its own commit at the start of the app step.
    Fixed 2026-10-03: both forms take today's date from the computer's calendar, as the core does.
34. A book's rating must be sent as a number or as text. Node's Number() also turned true into 1 and [3]
    into 3; the core refuses those. The Library form only sends "" or "1" to "5".
35. The core answers one request at a time, as the single-threaded Node server did, so two saves never
    interleave.
36. The app name is not final and is kept in one place.

## Comparing with the Node version
`node tools/compare.mjs` runs the Node "before" (server.js, lib/) and the Rust core side by side on scratch copies
of the data and prints what differs; add `tools/compare-stress` to include the stress cases. At the "parity" tag
nothing differs but whitespace in HTML; every later difference should match a decision in this file.

## Decisions (fixes after the "parity" tag, 2026-10-03)
Made in the Rust core only; server.js and lib/ stay as the "before". test/native.test.js has one test per fix.
37. Tracked-item matching treats "constructor" as an ordinary word. The Node code counted it as a month name.
38. A new correction needs a full date, YYYY-MM-DD, that is real and not in the future. Entries already in the
    file with a partial date such as "2026-09" are still shown as written (decision 21). The form's hint says
    YYYY-MM-DD.
39. A date that doesn't exist, such as Feb 30, is refused wherever the core reads a date, never rolled over:
    a tracked item's first-seen date shows "could not read"; a meeting whose file name starts with such a date
    has no date (its header date is not used instead, since the two can't both be right); "Last reviewed",
    "date read" and correction dates are refused. All 226 dates in mission-control-demo are real.
40. Editing a book whose title or author can't be read is refused with a message that says which field could
    not be read and asks for it to be fixed in books.json.
41. Header fields on a meeting page show their text as written, including "$$", "$&", "$'" and "$`".
42. A board card stored as a list is reported as "card N is a list, not an object with an id, column and
    title".
43. Messages say "app": "Writes are only accepted from this app" and "Refused: the app never writes …".
44. A "Manager-only note" inside a book-notes file is always removed from the notes page. There is no switch
    to show it there.
45. The rating rule stays as decision 34: a rating is sent as a number or as text.

## Decisions (step 2, the app, 2026-10-03)
46. The app is app/, a Tauri 2 crate in the same Cargo workspace. Its request handler only turns the window's
    request into a core Request, calls Core::handle and turns the Response back. Routes, checks and rules stay
    in the core, including the app's request policy (`Policy::app_scheme`) and the content security policy.
47. The pages load from the app's own scheme, `mc://localhost`, answered by the core. There is no
    frontendDist and no devUrl, so neither `npm run app` (development) nor the built app starts a dev server
    or opens a port. In the Mac app build, no HTTP client or server crate is compiled in; tokio is built
    without its networking feature.
48. Every response carries a content security policy from the core: `default-src` the page's own origin,
    images also from `data:` (the favicon), and no plugins, base URL changes, form posts or framing. In the
    app the page's origin is `mc://localhost`; the test server sends the same policy with its own origin.
    It blocks scripts, styles, images and requests from anywhere else, and inline scripts.
49. The window keeps no website data on disk (WebKit's non-persistent store). Tauri's file-drop handler is
    off, so drags inside the page (the Board) stay with the page and a file dropped on the window does
    nothing. The window shows only `mc://localhost`: http(s) links and `window.open` open in the default
    browser; mailto: and every other scheme do nothing.
50. Permissions: the folder picker and the save panel (dialog plugin) and opening http(s) links (opener
    plugin) are used from Rust only. The page gets no Tauri permissions at all: there is no capabilities
    file. No shell, no updater, no telemetry. The dialog plugin brings the fs plugin along as a dependency;
    with no capabilities, the page can't reach it.
51. Workspace: on first launch, or when the remembered folder is missing, the app asks with three buttons:
    Choose Folder…, Open Sample…, Quit (in its welcome window, decision 57). A chosen folder that has none of meeting-notes, CLAUDE.md,
    library/books.json, .claude/agents or corrections/corrections.json gets a warning first, because opening
    the Board would create board/board.json in it. The window title shows "<app name> — <folder>", with the
    home folder as "~". File ▸ Choose Workspace… (⌘O) and File ▸ Open Sample Workspace… switch folders; the
    window then shows Meetings. View ▸ Reload (⌘R) reloads the page, which turns the private-notes switch off.
    Closing the window ends the app (Tauri's default for the last window). settings.json is `{"workspace": "<path>"}`, written to a temporary file
    in its folder and renamed over it.
52. The sample workspace is sample-workspace/ in the repository, made by `node tools/make-sample.mjs` from
    mission-control-demo, with the three book-notes files as placeholders; `--real-notes` swaps in the real
    ones. It ships inside the app. "Open Sample" asks for a new folder name with the save panel and creates
    that folder; if anything is already there, nothing is copied.
53. The app check: `npm run check:app` (tools/check-app.mjs) builds the app with the `probe` feature and the
    normal release build, drives a session of reads and saves in the real window, restarts it, and checks
    that the only file changed outside the workspace is the settings file and that it holds only the folder
    path, plus the checklist from the step 2 brief. It is not part of `npm test` because it builds the app
    and opens a window. The `probe` feature exists only in builds made for this check.
54. The app's name and bundle id are written once, in app/tauri.conf.json (productName, identifier). The window
    title, the menus, the sample folder's default name, and the pages' title and brand all come from there,
    so a rename is one edit. The HTML keeps the literal "Mission Control" in the title and the brand (and in
    a `class="app-name"` span in the welcome window), so the Node version looks as it did before the native
    build; the core writes the app's name over exactly those. The working name avoids macOS's own
    Mission Control. Text that says "Mission Control workspace" names the folder, not the app, and stays.
55. The app needs macOS 13 or later. Apple silicon only for now, ad-hoc signed, and no .dmg (decision 31; see 66).

## Decisions (step 2 review, 2026-10-03)
56. A board with no cards at all shows one line in its To do column: "No cards yet. Use “Import action items”
    to add the action items from your meeting notes." The other columns say "No cards", and a filter that
    hides every card still says "No cards for this owner". The sample workspace ships without board.json;
    the app check confirms both.
57. The welcome and missing-folder prompts are a small window of the app's own (public/welcome.html and
    welcome.js, in the pages' stylesheet, served by the core): the app's name, the same two sentences, and
    the three buttons. The buttons are plain links to /welcome/choose, /welcome/sample and /welcome/quit.
    The welcome window's navigation handler in Rust catches those addresses before they load and does the
    action, so the page has no Tauri permissions and calls nothing. Before a workspace is open, the core
    serves only its pages (`pages_only`), and API requests get 503. Closing the welcome window ends the
    app; it closes itself once the main window is open. Dialogs (folder picker, save panel, warnings) open
    as sheets on whichever window is showing. The app check confirms both variants, Choose Folder… and
    Quit, and that every Tauri command from the page is refused.
58. Release builds go through `npm run build:app` (tools/build-app.mjs), which `npm run check:app` also uses.
    It passes rustc `--remap-path-prefix` for the home folder (written "~") and this folder (written "."),
    worked out at build time, so the binary's panic-location strings hold no home-folder path and no
    committed file holds one either. Cargo's `trim-paths` would do this from Cargo.toml but is not stable in
    Cargo 1.99. Development builds are left alone. The development fallback to the repository's
    sample-workspace/ is compiled only into debug builds. The app check fails if the release binary
    contains the home-folders path ("/Users" followed by a slash).
59. The release profile is set for a small binary: symbols stripped, whole-program LTO, one codegen unit,
    `opt-level = "z"`. Panics still unwind, because the core answers 500 by catching a panic. Measured on
    this Mac: the binary went from 14,672,848 to 4,859,344 bytes (bundle 14.6 MB → 5.0 MB). Level 3 gave
    7.8 MB and "s" 6.5 MB; "z" costs about 4 ms per request against 2 ms at level 3 (the demo data's
    meetings, one meeting and library pages), which no one will notice.
60. The workspace is chosen once the app has finished starting (Tauri's `RunEvent::Ready`), not during its
    setup. I moved it there while chasing a first-launch prompt that seemed missing; the prompt was there
    all along (it was a system alert, which my window search didn't see). It stays because windows and
    dialogs are then made by an app that is already running.
61. The icon is the pages' brand mark: a sky-blue dot with a soft ring on a navy rounded square, drawn at
    1024 px (app/icon-source.png). The Mac sizes in app/icons/ are made from it with `npx tauri icon`;
    only the files a Mac build uses are kept.

## Known limits (2026-10-03)
- macOS makes an empty folder for the app in the user's cache folder
  (`$(getconf DARWIN_USER_CACHE_DIR)<bundle id>/com.apple.metalfe/`, its graphics shader
  cache) the first time the app draws. No files are written there. The app can't prevent it, and it is
  left as it is.
- The dialog plugin brings Tauri's file-system plugin along as a compiled-in dependency. It is never
  registered and the page has no permissions, so a call to it from the page answers "Plugin not found"
  (the app check tries one).
- Open Sample uses the macOS save panel. If the name typed already exists, the panel first asks
  "Replace?", and then the app refuses anyway and copies nothing, so a person can be asked twice.
62. `npm run measure` (tools/measure.mjs) prints one table comparing the Node version and the release bundle on
    the Mac it runs on: what each needs on disk, launch to first page (5 runs, median and range), memory with
    the Meetings page showing, and lines of code. Every number is measured at run time, and a line under the
    table says how. The first page is timed from outside the app, with nothing added to it: the script adds
    one unreadable row to a scratch copy of the data, and both versions print a "could not read" line for it
    while answering the Meetings page's data request. The browser tab the Node version needs is not counted
    in time or memory, and the table says so. It uses no network.

## Decisions (step 3, the package, 2026-10-04)
63. The bundle id is `com.practicalaishift.missioncontrolnative`, set in app/tauri.conf.json only. The settings
    folder moves with it: ~/Library/Application Support/com.practicalaishift.missioncontrolnative/. A
    settings folder under the earlier working id is not read or moved, so a Mac that ran an earlier build
    opens the welcome window once and asks for the workspace again.
64. `npm run build:app` signs with the first "Developer ID Application" identity that `security find-identity`
    finds in the keychain (passed to Tauri as APPLE_SIGNING_IDENTITY, by its SHA-1), with the hardened
    runtime and a secure timestamp. No name or team id is written into a committed file; the bundle's
    copyright line was removed for the same reason. Without such an identity, or with MC_ADHOC=1, it signs
    ad-hoc and says so. `npm run check:app` always builds ad-hoc, since it runs the app on this Mac only.
65. The test helper starts each test server with a time limit of 8 s and up to 3 attempts. macOS now and then
    leaves a newly started test server asleep in its loader before any of its code runs (seen once in a
    normal run and once while running three suites at once). Before, the helper gave up after 15 s but left
    that process running, and its open pipe kept the test file from ever exiting. Now a server that doesn't
    come up is killed and a fresh one starts on a new port; "up" means it answers /api/config for the test's
    own data folder; stop() kills a server that hasn't ended within 3 s; and a retry is printed in the test
    output. Only test/helpers/site.js changed.
66. Release builds are one universal app, Apple silicon and Intel (`tauri build --target universal-apple-darwin`),
    in target/universal-apple-darwin/release/bundle/macos/. Debug builds stay for this Mac only. The Rust
    target x86_64-apple-darwin must be installed (`rustup target add x86_64-apple-darwin`).
67. `npm run package` (tools/package.mjs) makes target/dist/<name>-<version>-universal.dmg holding the app and a
    shortcut to Applications. It is made with hdiutil from a staging folder, not with Tauri's dmg builder,
    which drives Finder by script (an Automation permission prompt) and rebuilds the .app (which would undo
    stapling the app before it goes into the .dmg). With a Developer ID the .dmg is signed; without one it is
    left unsigned and the script says so.
68. Notarization uses `xcrun notarytool submit … --keychain-profile mc-notary --wait`, never Tauri's own
    notarization (which wants a password in the environment). The app is zipped, notarized and stapled
    first; the .dmg is then made from the stapled app, signed, notarized and stapled. So the .dmg and the
    app copied out of it both carry their tickets and open on a Mac that is offline. A rejection stops the
    script and saves the notary log in target/dist/.
69. `npm run check:release` (tools/check-release.mjs) mounts the .dmg read-only and checks it and the app inside
    it, one line per check: strict signature verification (app and .dmg), Gatekeeper's verdict "Notarized
    Developer ID" (app and .dmg), the stapled tickets, both chip types, no home-folders path and no probe in any file,
    the bundle id and minimum macOS version as written in app/tauri.conf.json, and the sample's three
    placeholder notes and missing board.json.
70. The tests, the app check, the measuring script and the comparison use the repository's own
    sample-workspace/ as their data, unless MC_TEST_DATA names another folder, so the repository works on its
    own. tools/make-sample.mjs still needs the full demo workspace and says so when it is missing.
71. `npm run publish-folder` (tools/publish.mjs) makes ../mission-control-native-publish/ from the committed
    files (git archive HEAD): no git history, no .DS_Store, target/ or node_modules/. It runs `npm test`
    inside it with only its own files (its data is sample-workspace/; Cargo's build output stays in this
    repository's target/), checks the run changed nothing there, and scans every file's name and contents
    for the home-folders path ("/Users" and a slash), the Mac's user name, and extra words from MC_SCAN_TERMS or a hidden `--ask` prompt. Extra
    words are never printed or saved; the scan reports hit counts and file names only. It replaces only a
    folder it made itself.
72. A copy of the repository has no empty folders, so sample-workspace/ has no board/ folder; the app makes it
    when the Board first opens. The test helper makes board/ in each scratch copy, as a real workspace has,
    because two tests write board/board.json in their setup. tools/make-sample.mjs leaves the empty folder
    out too, so the local sample matches the committed one. The scripts never spell out the home-folders
    path; they work it out at run time, so the publish scan finds it nowhere.

## Decisions (second-Mac review, 2026-10-04)
73. In the welcome window, "Open Sample…" is the main button (blue, and focused, so Return opens it) on first
    launch; when a remembered folder is missing, "Choose Folder…" is. The app check confirms both.
74. The warning for a folder with no workspace files shows the folder with "~", ends with "Open Sample… gives
    you a working example to try first.", and has Cancel as its default: Cancel is the first button (Return)
    and is titled Cancel (Escape); "Use This Folder" takes a click. A Rust unit test in app/src/workspace.rs
    pins the text and the button order; a native dialog can't be read by the app check.
75. A workspace without library/books.json or corrections/corrections.json is not an error: the Library or
    Corrections page shows a plain notice naming the file it reads ("There is no library/books.json in this
    workspace, so there are no books to show."), as the Agents page does for a missing agents folder. A
    file that is there but can't be read is still an error and is not overwritten. Adding a book or a
    correction in such a workspace is refused as before, with "library/books.json not found" or
    "corrections/corrections.json not found" in the form; the saving rules are unchanged. The app check
    confirms all of this.

## Decisions (0.1.1, 2026-10-05)
76. A meeting opens when its file name is one of the summaries listed from meeting-notes/ (the `.md` files
    there), the rule the Board already used for a card's meeting. Before, the name had to match
    `^[\w.-]+\.md$`, so a summary saved under a transcript's name with a space, an apostrophe, an ampersand or
    an accented letter was listed but answered "Invalid meeting file name". It is safe because the name is
    only compared with the names read from that one folder, never resolved as a path: "..", "/", an absolute
    path, a file in the folder that doesn't end in `.md` and a name that isn't there can't match, and nothing
    is read for them. A listed file is still read through the data root's checks, so a symlink in
    meeting-notes/ that points outside is refused. Any name that isn't a summary answers 404
    `{ error: 'There is no summary named "<name>" in meeting-notes/.', noSummary: "<name>" }`, and the page
    shows that sentence as a plain notice with the link back to all meetings, not "Something went wrong."
    The Node version keeps the old pattern and its answers (400 "Invalid meeting file name", 404 "File not
    found"); it never sends `noSummary`, so the shared app.js shows its error as before. tools/compare.mjs
    reports the five meeting refusals it sends as differences: `../CLAUDE.md`, `..%2F..%2Fetc%2Fpasswd`,
    `%2Fetc%2Fpasswd` and no name (Node 400, Rust 404), and `nope.md` (both 404, different body).
    test/native.test.js opens such a summary, imports its action items and follows the card back to it,
    and checks the refusals; the app check opens it in the real window from the Meetings page and from its
    Board card, and opens two names that aren't summaries.
77. Only files are summaries. A folder inside meeting-notes/ whose name ends in `.md` is not listed and not
    opened (404 with `noSummary`), and the Meetings page and the Board load. Before, it was listed and reading
    it made the Meetings page answer 500. The Node version is unchanged. A test in test/native.test.js.
78. Step 8 of sample-workspace/CLAUDE.md says the summary keeps the transcript's file name "but ending in
    .md", since the app lists only `.md` files. The sample's CLAUDE.md now differs from mission-control-demo's
    by this one phrase. The sample was edited by hand, not remade with tools/make-sample.mjs, because the
    demo folder has changed since the sample was made.
79. `npm run publish-folder` also works when ../mission-control-native-publish is a git repository (it has a
    .git): the .git is kept as it is and everything else is replaced by the committed files, so a file removed
    here disappears there too. The script runs no git command in that folder: nothing is added, committed,
    tagged or pushed. The file count, the scan and the "test run changed nothing" check leave out that .git.
    A folder without .git is replaced as before, and only if this script made it.

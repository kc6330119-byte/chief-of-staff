// Run inside the app window by tools/check-app.mjs (app built with --features probe). It uses the pages the
// way a person would: clicks, form fields, the switch, a reload. It reports by requesting /__probe/<what>,
// which the app prints. MODE is replaced by the check script: "session", "restart", "welcome", "missing",
// "missing-files", "unreadable-files", "file-menu", "briefing" (the sample as shipped, for Today's values) or "starter".
// PRIVATE_TEXTS is replaced with the starts of the Manager-only notes and the note between meetings in the briefing
// workspace, none of which may show on Today.
// ODD_NAME is replaced with the file name of a summary that has spaces, an apostrophe, an ampersand and an
// accented letter (decision 76). NOTE_TEXT and MEETING_NOTE are the texts of the two notes between meetings it adds
// (step 8), each with a word found nowhere else.
(async () => {
  if (window.__probed) return;
  window.__probed = true;
  const MODE = '__MODE__';
  const ODD_NAME = '__ODD_NAME__';
  const NOTE_TEXT = '__NOTE_TEXT__';
  const MEETING_NOTE = '__MEETING_NOTE__';
  const PRIVATE_TEXTS = '__PRIVATE_TEXTS__';
  const NOTE_WORD = NOTE_TEXT.split(':')[0];
  const MEETING_WORD = MEETING_NOTE.split(':')[0];
  const report = (what, data) => fetch(`/__probe/${what}?${encodeURIComponent(JSON.stringify(data ?? null))}`).catch(() => {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (f, label, ms = 8000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { const v = f(); if (v) return v; await sleep(50); }
    throw new Error(`timed out waiting for ${label}`);
  };
  const app = document.getElementById('app');
  const go = async (hash) => {
    location.hash = hash;
    await sleep(80);
    await waitFor(() => !app.querySelector('.loading'), `${hash} to load`);
    await sleep(150);
  };
  const pageState = (name) => ({
    name,
    error: app.querySelector('.notice-error')?.textContent.trim() || null,
    invalidDate: document.body.innerText.includes('Invalid Date'),
    couldNotRead: (document.body.innerText.match(/could not read/g) || []).length,
    title: document.title,
    demoBadge: !document.getElementById('demo-badge').hidden,
    textLength: app.innerText.length,
  });
  // A screenshot is never taken while a private note is on the page or the switch is on.
  const shot = async (name) => {
    const privateOnScreen = !!document.querySelector('.private-note') || document.getElementById('private-switch')?.checked === true;
    if (privateOnScreen) { await report('shot-refused', { name }); return; }
    await report('shot', name);
    await sleep(1200);
  };
  const json = async (path) => (await fetch(path, { cache: 'no-store' })).json();
  const violations = [];
  document.addEventListener('securitypolicyviolation', (e) => violations.push({ directive: e.violatedDirective, blocked: e.blockedURI }));
  const privateMeeting = async () => {
    for (const m of (await json('/api/meetings')).meetings) {
      if ((await json(`/api/meeting?file=${encodeURIComponent(m.file)}`)).privateNotes > 0) return m.file;
    }
    return null;
  };
  const switchState = () => ({ on: document.getElementById('private-switch')?.checked ?? null, privateNotesShown: app.querySelectorAll('.private-note').length });

  // The window's inner width, set through the app (the page can't resize its own window).
  const resize = async (width, height = 900) => {
    await fetch(`/__probe/resize?${encodeURIComponent(JSON.stringify([width, height]))}`).catch(() => {});
    await waitFor(() => Math.abs(window.innerWidth - width) <= 1, `the window to be ${width} px wide`);
    await sleep(400);
  };
  // The Board's layout: no card's ID or title is cut off, and nothing overflows its card or its column.
  const boardLayout = () => {
    const problems = [];
    const within = (a, b) => a.left >= b.left - 0.5 && a.right <= b.right + 0.5;
    const name = (el) => el.getAttribute('class') || el.tagName.toLowerCase();
    let cards = 0;
    for (const col of app.querySelectorAll('.column')) {
      const cr = col.getBoundingClientRect();
      for (const card of col.querySelectorAll('.card')) {
        cards++;
        const r = card.getBoundingClientRect();
        const id = card.dataset.id;
        if (!within(r, cr)) problems.push(`${id}: the card overflows its column`);
        for (const el of card.querySelectorAll('*')) {
          const er = el.getBoundingClientRect();
          if (er.width > 0 && !within(er, r)) problems.push(`${id}: ${name(el)} overflows its card`);
        }
        for (const sel of ['.card-id', '.card-title']) {
          const el = card.querySelector(sel);
          if (!el) { if (sel === '.card-title' || !card.classList.contains('card-own')) problems.push(`${id}: no ${sel}`); continue; }
          if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) problems.push(`${id}: ${sel} is cut off`);
        }
      }
    }
    return { width: window.innerWidth, columns: app.querySelectorAll('.column').length, cards, problems: problems.slice(0, 20), problemCount: problems.length };
  };
  // Today's layout (0.3.0): the page never scrolls sideways; the tiles and every panel sit inside the page, nothing in
  // one runs outside it, every row sits inside its panel, and no chip, title, count or heading is cut off. Team health
  // is beside the list, or below it when there isn't room.
  const todayLayout = () => {
    const problems = [];
    const within = (a, b) => a.left >= b.left - 0.5 && a.right <= b.right + 0.5;
    const name = (el) => el.id || el.getAttribute('class') || el.tagName.toLowerCase();
    if (document.documentElement.scrollWidth > window.innerWidth + 1) problems.push(`the page is ${document.documentElement.scrollWidth} px wide`);
    const page = app.getBoundingClientRect();
    const panels = [...app.querySelectorAll('.today-head, .tile, .brief-panel')];
    for (const p of panels) {
      const pr = p.getBoundingClientRect();
      if (!within(pr, page)) problems.push(`${name(p)} overflows the page`);
      for (const el of p.querySelectorAll('*')) {
        const er = el.getBoundingClientRect();
        if (er.width > 0 && !el.closest('.search-results') && !within(er, pr)) problems.push(`${name(p)}: ${name(el)} overflows it`);
      }
    }
    let rows = 0;
    for (const row of app.querySelectorAll('.today-row')) {
      rows++;
      const r = row.getBoundingClientRect();
      if (!within(r, row.closest('.brief-panel').getBoundingClientRect())) problems.push(`${row.dataset.id}: the row overflows its panel`);
      for (const el of row.querySelectorAll('*')) {
        const er = el.getBoundingClientRect();
        if (er.width > 0 && !within(er, r)) problems.push(`${row.dataset.id}: ${name(el)} overflows its row`);
      }
    }
    for (const el of app.querySelectorAll('.chip, .today-title, h1, h2, .tile-label, .tile-count, .tile-sub, .team-name, .team-sub, .reflection-text, .number-value, .number-note')) {
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) problems.push(`${name(el.closest('[id]') || el)}: ${name(el)} is cut off`);
    }
    // A meeting link's date never breaks: "Sep 15" sits on one line, and is kept there by white-space: nowrap.
    const dates = [...app.querySelectorAll('.today-row a[href^="#/meetings/"]')].map((a) => a.querySelector('.nowrap'));
    const wrapped = dates.filter((d) => !d || getComputedStyle(d).whiteSpace !== 'nowrap' || lines(d) > 1).map((d) => d?.textContent ?? 'no date part');
    const now = document.getElementById('group-now')?.getBoundingClientRect();
    const team = document.getElementById('group-team')?.getBoundingClientRect();
    return {
      width: window.innerWidth,
      meetingDates: { count: dates.length, wrapped },
      tiles: app.querySelectorAll('.brief-tiles .tile').length,
      panels: [...app.querySelectorAll('.brief-panel')].map((p) => p.querySelector('h2')?.textContent.trim()),
      rows,
      teamBeside: !!(now && team) && team.left >= now.right - 0.5 && team.top < now.bottom,
      teamBelow: !!(now && team) && team.top >= now.bottom - 0.5,
      sub: document.getElementById('today-sub')?.textContent.trim() || null,
      count: document.getElementById('today-count')?.textContent || null,
      problems: problems.slice(0, 20),
      problemCount: problems.length,
    };
  };
  // Today's whole list, past the first seven.
  const showAllToday = async () => {
    const more = document.getElementById('now-more');
    if (more && /^Show all/.test(more.textContent.trim())) { more.click(); await sleep(150); }
  };
  // What Today shows: the tiles as label, count and second line; the list; the filter line; the reflections; the numbers.
  const tileValues = () => Object.fromEntries([...app.querySelectorAll('.brief-tiles .tile')].map((t) => [t.id.replace('tile-', ''),
    [t.querySelector('.tile-label').textContent.trim(), t.querySelector('.tile-count').textContent.trim(), t.querySelector('.tile-sub').textContent.trim()]]));
  const todayRows = () => [...app.querySelectorAll('#group-now .today-row')].map((r) => r.dataset.id);
  // The window shows only so much: a second screenshot with the lower panels in view.
  const shotLower = async (name, id) => {
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
    await sleep(250);
    await shot(name);
    window.scrollTo(0, 0);
    await sleep(100);
  };
  const reflectionDates = () => [...app.querySelectorAll('.reflection-date')].map((a) => [decodeURIComponent(a.getAttribute('href')), a.textContent.trim()]);

  // People, a person's page and Agents: the page never scrolls sideways; every row, card and section head sits inside
  // its block, nothing in one runs outside it, and no chip, title or ID is cut off.
  const sectionLayout = (name) => {
    const problems = [];
    const within = (a, b) => a.left >= b.left - 0.5 && a.right <= b.right + 0.5;
    const label = (el) => el.getAttribute('class') || el.tagName.toLowerCase();
    if (document.documentElement.scrollWidth > window.innerWidth + 1) problems.push(`the page is ${document.documentElement.scrollWidth} px wide`);
    const blocks = [...app.querySelectorAll('.today-group, .page-section')];
    let rows = 0;
    for (const block of blocks) {
      const br = block.getBoundingClientRect();
      for (const row of block.querySelectorAll('.today-row, .today-person, .person-meeting, .people-not-in li, .agent-card, .section-head, .note-row, .note-box')) {
        rows++;
        const r = row.getBoundingClientRect();
        const id = row.dataset.id || row.querySelector('.today-title, .agent-name, h2')?.textContent.trim() || row.textContent.trim().slice(0, 40);
        if (!within(r, br)) problems.push(`${id}: ${label(row)} overflows its block`);
        for (const el of row.querySelectorAll('*')) {
          const er = el.getBoundingClientRect();
          if (er.width > 0 && !within(er, r)) problems.push(`${id}: ${label(el)} overflows its ${label(row)}`);
        }
        for (const el of row.querySelectorAll('.chip, .today-title, .today-id, .you-label, .badge, .note-marker, .note-date')) {
          if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) problems.push(`${id}: ${label(el)} is cut off`);
        }
      }
    }
    return {
      name, width: window.innerWidth,
      blocks: blocks.map((b) => b.querySelector('h2')?.textContent.trim() || b.getAttribute('aria-label') || '?'),
      rows, problems: problems.slice(0, 20), problemCount: problems.length,
    };
  };
  // The People page's columns: in every counted row, each part starts at the same place, whether or not the row has
  // a flag.
  const peopleColumns = () => {
    const parts = ['.today-person-name', '.person-last', '.person-counts', '.today-flags', '.today-open'];
    const rows = [...app.querySelectorAll('.today-person')].filter((r) => r.querySelector('.person-last'));
    return {
      width: window.innerWidth,
      rows: rows.length,
      withFlags: rows.filter((r) => r.querySelector('.today-flags .chip')).length,
      lefts: Object.fromEntries(parts.map((sel) => [sel, [...new Set(rows.map((r) => Math.round(r.querySelector(sel)?.getBoundingClientRect().left ?? -1)))]])),
    };
  };
  // The edit buttons on a page: each holds an SVG pencil and is drawn in the page's text colour.
  const editButtons = (sel) => {
    const text = getComputedStyle(document.body).color;
    const buttons = [...app.querySelectorAll(sel)];
    return {
      count: buttons.length,
      notPencil: buttons.filter((b) => !b.querySelector('svg') || b.textContent.includes('✎')).length,
      notTextColour: buttons.filter((b) => getComputedStyle(b).color !== text).length,
    };
  };
  // A cell's boxes (one per element and per line of text) counted by the lines they sit on.
  const lines = (td) => { const r = document.createRange(); r.selectNodeContents(td); return new Set([...r.getClientRects()].filter((b) => b.width > 0).map((b) => Math.round(b.top))).size; };

  // The page must not be able to call the app: every Tauri command is refused.
  const appCalls = async () => {
    const t = window.__TAURI_INTERNALS__;
    if (!t || typeof t.invoke !== 'function') return { bridge: false };
    const attempt = async (cmd, args) => { try { await t.invoke(cmd, args); return 'ALLOWED'; } catch (e) { return `refused: ${String(e).slice(0, 90)}`; } };
    return {
      bridge: true,
      dialog: await attempt('plugin:dialog|open', { options: { directory: true } }),
      opener: await attempt('plugin:opener|open_url', { url: 'https://example.com/from-the-page' }),
      fs: await attempt('plugin:fs|read_text_file', { path: '/etc/hosts' }),
    };
  };

  try {
    if (document.body.classList.contains('welcome')) {
      const shown = (sel) => [...document.querySelectorAll(sel)].filter((el) => !el.closest('[hidden]'));
      await report('welcome', {
        mode: MODE,
        name: document.getElementById('welcome-name').textContent,
        title: document.title,
        text: shown('.welcome-text p').map((p) => p.textContent.trim()),
        buttons: shown('.welcome-actions a').map((a) => a.textContent.trim()),
        primary: [...document.querySelectorAll('.welcome-actions .btn-primary')].map((a) => a.textContent.trim()),
        focused: document.activeElement?.textContent.trim() ?? null,
        appCalls: await appCalls(),
      });
      await shot(MODE === 'missing' ? 'welcome-missing-folder' : 'welcome');
      const button = document.querySelector(MODE === 'missing' ? 'a[href="/welcome/quit"]' : 'a[href="/welcome/choose"]');
      await report('welcome-click', button.textContent.trim());
      button.click();
      return;
    }
    await waitFor(() => document.querySelector('.site-nav'), 'the page');
    if (MODE === 'missing-files' || MODE === 'unreadable-files') {
      const page = async (hash, missingId, tableId) => {
        await go(hash);
        return {
          error: app.querySelector('.notice-error')?.textContent.trim() || null,
          notice: document.getElementById(missingId)?.textContent.trim() || null,
          tableShown: document.getElementById(tableId) ? !document.getElementById(tableId).hidden : null,
        };
      };
      await go('#/board');
      const board = { cards: app.querySelectorAll('.card').length, error: app.querySelector('.notice-error')?.textContent.trim() || null };
      const library = await page('#/library', 'library-missing', 'library-table');
      const corrections = await page('#/corrections', 'corrections-missing', 'corrections-table');
      const result = { board, library, corrections };
      if (MODE === 'missing-files') {
        // What adding does today in such a workspace (the saving rules are unchanged).
        await go('#/library');
        document.getElementById('add-book').click();
        const bf = document.getElementById('book-form');
        bf.title.value = 'Radical Candor';
        bf.author.value = 'Kim Scott';
        bf.querySelector('[name=read][value=No]').checked = true;
        bf.requestSubmit();
        await waitFor(() => document.getElementById('book-error').textContent || document.getElementById('library-status').textContent, 'the book answer');
        result.addBook = document.getElementById('book-error').textContent || document.getElementById('library-status').textContent;
        await go('#/corrections');
        document.getElementById('add-correction').click();
        const cf = document.getElementById('correction-form');
        for (const [k, v] of [['where', 'App check'], ['what', 'Adding to a workspace without the log.'], ['caught_by', 'check-app'], ['decision', 'See what happens.'], ['rule', 'None.']]) cf[k].value = v;
        cf.requestSubmit();
        await waitFor(() => document.getElementById('correction-error').textContent || document.getElementById('corrections-status').textContent, 'the correction answer');
        result.addCorrection = document.getElementById('correction-error').textContent || document.getElementById('corrections-status').textContent;
      }
      await report(MODE, result);
      await report('done');
      return;
    }
    // The File menu, opened over the Help page for its screenshot. The app holds it open until it is ended.
    if (MODE === 'file-menu') {
      await go('#/help');
      await report('show-file-menu');
      return;
    }
    if (MODE === 'welcome') {
      await report('main-after-welcome', { url: location.href, appCalls: await appCalls() });
      await report('done');
      return;
    }
    await waitFor(() => document.body.dataset.page, 'the first page');
    await report('ready', {
      url: location.href, mode: MODE, page: document.body.dataset.page, firstNav: document.querySelector('.site-nav a')?.dataset.page,
      nav: [...document.querySelectorAll('.site-nav a')].map((a) => a.querySelector('.nav-label')?.textContent.trim()),
    });

    // ---- Today on the sample as shipped (0.3.0): the tiles' values, a tile's filter, Search, the week, the chart, no
    // private text, at 1440 and 1100 px; the session's own workspace has later check meetings, so its values differ ----
    if (MODE === 'briefing') {
      await resize(1440);
      await go('#/today');
      const result = { tiles: tileValues(), rows: todayRows(), greeting: document.getElementById('today-greeting').textContent };
      await report('today-layout', todayLayout());
      await shot('today');
      await shotLower('today-lower', 'reflections-went-well');
      // A filter tile, then a second click.
      document.getElementById('tile-overdue').click();
      await sleep(200);
      result.filtered = { rows: todayRows(), named: document.getElementById('now-filter')?.textContent.replace(/\s+/g, ' ').trim() || null, pressed: document.getElementById('tile-overdue').getAttribute('aria-pressed') };
      document.getElementById('tile-overdue').click();
      await sleep(200);
      result.cleared = { rows: todayRows(), named: !!document.getElementById('now-filter'), pressed: document.getElementById('tile-overdue').getAttribute('aria-pressed') };
      // The chart.
      result.chart = { weeks: [...app.querySelectorAll('.chart-week')].map((t) => t.textContent.trim()), points: app.querySelectorAll('.chart-point').length,
        labelled: [...app.querySelectorAll('.chart-point')].filter((p) => /^(Created|Completed|Overdue), week of .+: \d+$/.test(p.getAttribute('aria-label') || '')).length };
      // Search, typed as a person would, then Escape.
      const box = document.getElementById('today-search');
      box.focus();
      box.value = 'riley';
      box.dispatchEvent(new Event('input', { bubbles: true }));
      await waitFor(() => !document.getElementById('today-search-results').hidden && document.querySelector('.search-count'), 'the search results');
      const groupText = (id) => [...document.querySelectorAll(`#search-${id} li`)].map((li) => li.textContent.replace(/\s+/g, ' ').trim());
      result.search = { items: groupText('items'), meetings: groupText('meetings'), people: groupText('people') };
      await shot('today-search');
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(100);
      result.search.cleared = box.value === '' && document.getElementById('today-search-results').hidden;
      // Everything opened: the whole list and every reflection, in full; then no private text anywhere on the page.
      const openAll = async () => {
        await showAllToday();
        for (const b of [...app.querySelectorAll('[data-brief="more"]')]) if (/more$/.test(b.textContent.trim())) b.click();
        await sleep(100);
        for (const b of [...app.querySelectorAll('.reflection-text[aria-expanded="false"]')]) { b.click(); await sleep(20); }
        await sleep(100);
      };
      await openAll();
      const leaks = () => PRIVATE_TEXTS.filter((t) => document.body.innerText.includes(t));
      result.privateThisWeek = leaks();
      // The second lines of Your overdue items and 1:1 coverage.
      const numberNotes = () => ['your-overdue', 'coverage'].map((id) => document.querySelector(`#number-${id} .number-note`)?.textContent.trim() ?? null);
      result.thisWeekNotes = numberNotes();
      // Last week.
      const week = document.getElementById('today-week');
      week.value = 'last';
      week.dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(() => /^Last week/.test(document.getElementById('h-numbers')?.textContent || ''), 'last week');
      await sleep(200);
      result.lastWeek = { completed: tileValues().completed, heading: document.getElementById('h-numbers').textContent.trim(), reflections: reflectionDates(), notes: numberNotes() };
      await openAll();
      result.privateLastWeek = leaks();
      window.scrollTo(0, 0);
      // Back to the first seven and nothing opened, for the screenshot.
      await go('#/board');
      await go('#/today');
      document.getElementById('today-week').value = 'last';
      document.getElementById('today-week').dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(() => /^Last week/.test(document.getElementById('h-numbers')?.textContent || ''), 'last week again');
      await sleep(200);
      await shot('today-last-week');
      await shotLower('today-last-week-lower', 'reflections-went-well');
      await go('#/board');
      await go('#/today');
      result.thisWeekReflections = reflectionDates();
      result.weekAfterReturn = document.getElementById('today-week').value;
      await resize(1100);
      await go('#/today');
      await report('today-layout', todayLayout());
      await shot('today-1100');
      await shotLower('today-1100-team', 'group-team');
      await shotLower('today-1100-lower', 'reflections-went-well');
      await resize(1440);
      await report('briefing', result);
      await report('done');
      return;
    }
    // ---- the starter workspace: Today with no summaries ----
    if (MODE === 'starter') {
      await go('#/today');
      const now = document.getElementById('group-now');
      await report('starter', {
        ...pageState('today'),
        tiles: tileValues(),
        empty: now?.querySelector('#now-empty')?.textContent.replace(/\s+/g, ' ').trim() || null,
        help: now?.querySelector('a[href="#/help"]')?.textContent.trim() || null,
        rows: todayRows().length,
        points: app.querySelectorAll('.chart-point').length,
        reflections: [...app.querySelectorAll('.reflections-none')].map((p) => p.textContent.trim()),
        bad: /undefined|NaN|Something went wrong/.test(document.body.innerText),
      });
      await shot('today');
      await report('done');
      return;
    }

    if (MODE === 'restart') {
      await go(`#/meetings/${encodeURIComponent(await privateMeeting())}`);
      await report('switch-after-restart', switchState());
      // The notes added in the session are still there, with the switch off and their text hidden.
      const people = (await json('/api/people')).groups.flatMap((g) => g.people);
      const someone = people.find((p) => p.notesSince > 0);
      if (someone) await go(`#/people/${encodeURIComponent(someone.name)}`);
      const section = document.getElementById('group-notes');
      await report('notes-after-restart', {
        person: someone?.name || null,
        rows: section?.querySelectorAll('.note-row').length ?? 0,
        privateLabels: section?.querySelectorAll('.note-private').length ?? 0,
        on: document.getElementById('private-switch')?.checked ?? null,
        textOnPage: document.body.innerText.includes(NOTE_WORD) || document.body.innerText.includes(MEETING_WORD),
      });
      await report('done');
      return;
    }

    if (sessionStorage.getItem('probe-phase') !== 'reloaded') {
      // ---- every page, at 1440 px and at 1100 px wide; for one person's page, the first report with open items ----
      const reports = (await json('/api/people')).groups.find((g) => g.key === 'report')?.people || [];
      const someone = reports.find((p) => p.owesYou + p.youOwe > 0) || reports[0];
      const PAGES = [['#/today', 'today'], ['#/meetings', 'meetings'], ['#/board', 'board'], ['#/people', 'people'],
        [`#/people/${encodeURIComponent(someone?.name || '')}`, 'person'], ['#/agents', 'agents'], ['#/library', 'library']];
      for (const width of [1440, 1100]) {
        await resize(width);
        for (const [hash, name] of PAGES) {
          await go(hash);
          if (width === 1440) await report('page', pageState(name));
          if (name === 'today') await report('today-layout', todayLayout());
          if (['people', 'person', 'agents'].includes(name)) await report('section-layout', sectionLayout(name));
          if (name === 'people') await report('people-columns', peopleColumns());
          if (name === 'library') await report('edit-buttons', { page: 'library', width, ...editButtons('#library-body .edit-btn') });
          // An age and an ID in the tracked table are each one line. Boxes are counted by the lines they sit on,
          // so a span on one line is not mistaken for a wrap.
          if (name === 'meetings') {
            const cells = [...app.querySelectorAll('#tracked-body td.num')];
            const ids = [...app.querySelectorAll('#tracked-body td.id')];
            if (width === 1440) await report('age-cells', { count: cells.length, wrapped: cells.filter((td) => lines(td) > 1).map((td) => td.textContent), windowWidth: window.innerWidth });
            await report('id-cells', { width, count: ids.length, wrapped: ids.filter((td) => lines(td) > 1).map((td) => td.textContent.trim()) });
            const dates = [...app.querySelectorAll('#tracked-body .date')];
            await report('date-cells', { width, count: dates.length, wrapped: dates.filter((d) => lines(d) > 1).map((d) => d.textContent.trim()) });
          }
          // The Board is measured with the suggestions shown too, so every card is drawn; then put back as it was.
          if (name === 'board') {
            await report('edit-buttons', { page: 'board', width, ...editButtons('.card [data-act=edit]') });
            await report('board-layout', { ...boardLayout(), suggested: false });
            const toggle = document.getElementById('show-suggested');
            toggle.click();
            await sleep(300);
            await report('board-layout', { ...boardLayout(), suggested: true });
            toggle.click();
            await sleep(300);
          }
          await shot(width === 1440 ? name : `${name}-${width}`);
        }
      }
      await resize(1440);
      for (const [i, m] of (await json('/api/meetings')).meetings.entries()) {
        await go(`#/meetings/${encodeURIComponent(m.file)}`);
        await report('page', pageState(`meeting ${m.file}`));
        const tables = [...app.querySelectorAll('.prose .table-scroll')];
        if (tables.length) {
          await report('meeting-tables', {
            file: m.file, count: tables.length,
            notFilling: tables.filter((w) => w.querySelector('table').getBoundingClientRect().width < w.clientWidth - 1).length,
          });
        }
        if (i === 0) await shot('meeting');
      }
      for (const [i, f] of (await json('/api/library')).notesFiles.entries()) {
        await go(`#/library/notes/${encodeURIComponent(f)}`);
        await report('page', pageState(`notes ${f}`));
        if (i === 0) await shot('library-notes');
      }

      // ---- Help: the link in the sidebar foot opens the Help page, drawn whole; and the File menu's items ----
      const helpLink = document.querySelector('.sidebar-foot a.help-link');
      helpLink?.click();
      await sleep(80);
      await waitFor(() => !app.querySelector('.loading'), 'the Help page to load');
      await sleep(150);
      window.scrollTo(0, 0);
      await report('page', pageState('help'));
      await report('help', {
        link: helpLink?.textContent.trim() || null,
        hash: location.hash,
        page: document.body.dataset.page,
        current: helpLink?.getAttribute('aria-current') || null,
        sections: [...app.querySelectorAll('#help-article h2')].map((h) => h.textContent.trim()),
        marks: app.querySelectorAll('.cnr, .notice').length,
        error: app.querySelector('.notice-error')?.textContent.trim() || null,
        linksOut: [...app.querySelectorAll('#help-article a')].map((a) => a.getAttribute('href')).filter((h) => !h.startsWith('#')),
        wide: document.documentElement.scrollWidth > window.innerWidth + 1,
      });
      await shot('help');
      await report('menu');

      // ---- a summary whose name has spaces, an apostrophe, an ampersand and an accented letter: opened by
      // clicking its link on the Meetings page, as a person would ----
      const oddHref = `#/meetings/${encodeURIComponent(ODD_NAME)}`;
      const meetingView = () => ({
        hash: decodeURIComponent(location.hash),
        error: app.querySelector('.notice-error')?.textContent.trim() || null,
        heading: app.querySelector('.prose h1')?.textContent.trim() || null,
        fields: [...app.querySelectorAll('.meeting-fields dt')].map((dt) => `${dt.textContent.trim()}: ${dt.nextElementSibling?.textContent.trim()}`),
        privateStatus: app.querySelector('.private-status')?.textContent.trim() || null,
        ...switchState(),
      });
      await go('#/meetings');
      const listed = app.querySelector(`a.meeting-card[href="${CSS.escape(oddHref)}"]`);
      const sourceLinks = app.querySelectorAll(`td.sources a[href="${CSS.escape(oddHref)}"]`).length;
      listed?.click();
      await sleep(80);
      await waitFor(() => !app.querySelector('.loading'), 'the summary to load');
      await sleep(150);
      await report('odd-meeting', { listed: !!listed, trackedSourceLinks: sourceLinks, ...meetingView() });
      await shot('meeting-odd-name');

      // ---- the old Corrections address opens Agents at "Rules learned" ----
      await go('#/corrections');
      await sleep(300);
      const rulesTop = document.getElementById('rules-learned')?.getBoundingClientRect().top ?? null;
      await report('corrections-moved', {
        page: document.body.dataset.page,
        current: document.querySelector('.site-nav a[aria-current="page"]')?.dataset.page || null,
        heading: document.getElementById('rules-learned-h')?.textContent.trim() || null,
        rulesTop, scrolled: window.scrollY, maxScroll: document.documentElement.scrollHeight - window.innerHeight,
        ids: ['add-correction', 'corrections-total', 'corrections-table', 'corrections-body', 'correction-form'].filter((id) => !document.getElementById(id)),
      });
      await shot('agents-rules-learned');

      // ---- Agents: every card's rules start closed behind "Rules (N)"; a click opens one card and leaves the others
      // closed, a second click closes it; the control takes the keyboard focus; leaving and coming back closes all ----
      const agentCards = () => [...app.querySelectorAll('.agent-card')].map((card) => {
        const d = card.querySelector('details.agent-rules');
        return {
          name: card.querySelector('.agent-name')?.textContent.trim() || null,
          summary: d?.querySelector('summary')?.textContent.trim() ?? null,
          rules: d?.querySelectorAll('ol.rules > li').length ?? 0,
          open: d ? d.open : null,
          // WebKit still gives the list inside a closed <details> a box, so what is shown is measured on the
          // disclosure itself: whether it reaches below its "Rules (N)" line.
          rulesShown: !!d && d.getBoundingClientRect().bottom - d.querySelector('summary').getBoundingClientRect().bottom > 10,
        };
      });
      await go('#/agents');
      window.scrollTo(0, 0);
      await sleep(150);
      const cardsClosed = agentCards();
      await shot('agents-closed');
      // A new agent's card, so the screenshot shows one of them open.
      const openedCard = [...app.querySelectorAll('.agent-card')].findIndex((c) => c.querySelector('.agent-name')?.textContent.trim() === 'Commitment tracker');
      const rulesToggle = app.querySelectorAll('.agent-card')[openedCard]?.querySelector('details.agent-rules summary');
      rulesToggle?.focus();
      const focused = !!rulesToggle && document.activeElement === rulesToggle && rulesToggle.tabIndex >= 0;
      rulesToggle?.click();
      await sleep(250);
      const cardsOneOpen = agentCards();
      await shot('agents-one-open');
      rulesToggle?.click();
      await sleep(250);
      const cardsClosedAgain = agentCards();
      rulesToggle?.click();
      await sleep(150);
      await go('#/today');
      await go('#/agents');
      await report('agent-cards', { opened: openedCard, focused, closed: cardsClosed, oneOpen: cardsOneOpen, closedAgain: cardsClosedAgain, afterReturn: agentCards() });

      // ---- names that are not a summary in meeting-notes/: a plain notice and the link back ----
      for (const name of ["2026-10-14_nobody's café summary.md", '../CLAUDE.md']) {
        await go(`#/meetings/${encodeURIComponent(name)}`);
        await report('no-summary', {
          name,
          error: app.querySelector('.notice-error')?.textContent.trim() || null,
          notice: document.getElementById('no-summary')?.textContent.trim() || null,
          backLink: app.querySelector('a.back[href="#/meetings"]')?.textContent.trim() || null,
          textLength: app.innerText.length,
        });
        if (name === '../CLAUDE.md') await shot('meeting-no-summary');
      }

      // ---- board: the action items are there with no import; move with the → button, a drag to Done,
      // then Close and Reopen ----
      const boardCard = async (id) => (await json('/api/board')).cards.find((c) => c.id === id);
      await go('#/board');
      await report('board-open', {
        cards: app.querySelectorAll('.card').length,
        todo: app.querySelectorAll('.column[data-column=todo] .card').length,
        importButton: !!document.getElementById('import-btn'),
      });
      await shot('board-open');
      const first = app.querySelector('.column[data-column=todo] .card');
      const movedId = first.dataset.id;
      first.querySelector('button[data-act=move][data-to=doing]').click();
      await waitFor(() => app.querySelector(`.column[data-column=doing] .card[data-id="${movedId}"]`), 'the moved card');
      await report('card-moved', { id: movedId, column: (await boardCard(movedId)).column });
      const dragged = app.querySelector('.column[data-column=todo] .card');
      const draggedId = dragged.dataset.id;
      const done = app.querySelector('.column[data-column=done] .cards');
      const box = done.getBoundingClientRect();
      const dt = new DataTransfer();
      dragged.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      await sleep(100);
      for (const type of ['dragover', 'drop']) done.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX: box.x + 20, clientY: box.y + 10, dataTransfer: dt }));
      dragged.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
      await waitFor(() => app.querySelector(`.column[data-column=done] .card[data-id="${draggedId}"]`), 'the dragged card');
      const afterDrag = await boardCard(draggedId);
      await report('card-dragged', { id: draggedId, column: afterDrag.column, closed: afterDrag.closed });
      const toClose = app.querySelector('.column[data-column=todo] .card');
      const closedId = toClose.dataset.id;
      toClose.querySelector('button[data-act=close]').click();
      await waitFor(() => app.querySelector(`.column[data-column=done] .card[data-id="${closedId}"] [data-act=reopen]`), 'the closed card');
      const afterClose = await boardCard(closedId);
      const firstIn = async (col) => (await json('/api/board')).cards.find((c) => c.column === col)?.id;
      await report('card-closed', { id: closedId, column: afterClose.column, closed: afterClose.closed, doneCards: (await json('/api/board')).cards.filter((c) => c.column === 'done').length, topOfDone: await firstIn('done') });
      await shot('board-after-moves');
      app.querySelector(`.column[data-column=done] .card[data-id="${closedId}"] [data-act=reopen]`).click();
      await waitFor(() => app.querySelector(`.column[data-column=todo] .card[data-id="${closedId}"] [data-act=close]`), 'the reopened card');
      const afterReopen = await boardCard(closedId);
      await report('card-reopened', { id: closedId, column: afterReopen.column, closed: afterReopen.closed, topOfTodo: await firstIn('todo') });

      // ---- an action item opens in place: no dialog; its due date and note save ----
      const editCard = app.querySelector('.column[data-column=todo] .card-item');
      const editId = editCard.dataset.id;
      editCard.querySelector('[data-act=edit]').click();
      await waitFor(() => document.getElementById('card-edit-due'), 'the card to open');
      await sleep(200);
      const opened = {
        id: editId,
        dialogOpen: document.getElementById('card-dialog').open,
        inCard: !!app.querySelector(`.card[data-id="${CSS.escape(editId)}"] #card-edit-due`),
        focused: document.activeElement?.id || null,
        openCards: app.querySelectorAll('.card-edit').length,
      };
      await shot('board-card-open');
      document.getElementById('card-edit-due').value = '2026-10-30';
      document.getElementById('card-edit-note').value = 'Checked in the app window.';
      app.querySelector(`.card[data-id="${CSS.escape(editId)}"] [data-act=save]`).click();
      await waitFor(() => !document.getElementById('card-edit-due'), 'the card to close after saving');
      const saved = await boardCard(editId);
      await report('card-edited', { ...opened, myDue: saved.myDue, note: saved.note, closedAfterSave: !document.getElementById('card-edit-due') });

      // ---- a card imported from that summary links back to it ----
      const oddCards = app.querySelectorAll(`.card a[href="${CSS.escape(oddHref)}"]`);
      const oddCardCount = oddCards.length;
      oddCards[0]?.click();
      await sleep(80);
      await waitFor(() => !app.querySelector('.loading'), 'the summary from the board');
      await sleep(150);
      await report('odd-meeting-from-board', { cards: oddCardCount, ...meetingView() });

      // ---- library: add a book through the form ----
      await go('#/library');
      document.getElementById('add-book').click();
      const bf = document.getElementById('book-form');
      bf.title.value = 'Radical Candor';
      bf.author.value = 'Kim Scott';
      const yes = bf.querySelector('[name=read][value=Yes]');
      yes.checked = true;
      yes.dispatchEvent(new Event('change', { bubbles: true }));
      bf.date_read.value = '2024-03-01';
      bf.rating.value = '4';
      bf.requestSubmit();
      await waitFor(() => document.getElementById('library-status').textContent === 'Book added.' || document.getElementById('book-error').textContent, 'the book');
      await report('book-saved', { status: document.getElementById('library-status').textContent, error: document.getElementById('book-error').textContent, max: bf.date_read.max });

      // ---- corrections: add an entry through the form ----
      await go('#/corrections');
      document.getElementById('add-correction').click();
      const cf = document.getElementById('correction-form');
      const presetDate = cf.date.value;
      cf.where.value = 'App check';
      cf.what.value = 'Checked that a correction saves from the app window.';
      cf.caught_by.value = 'check-app';
      cf.decision.value = 'Keep the check.';
      cf.rule.value = 'Run the app check before each step review.';
      cf.requestSubmit();
      await waitFor(() => document.getElementById('corrections-status').textContent === 'Entry added.' || document.getElementById('correction-error').textContent, 'the correction');
      await report('correction-saved', { status: document.getElementById('corrections-status').textContent, error: document.getElementById('correction-error').textContent, presetDate });

      // ---- Today: Close on the first row I owe; the row stays where it is and one line says what happened ----
      await go('#/today');
      const MINE = '#group-now .today-row[data-group="i-owe"], #group-now .today-row[data-group="open"]';
      const firstRow = app.querySelector(MINE);
      if (firstRow) {
        const todayId = firstRow.dataset.id;
        const rowsBefore = [...app.querySelectorAll(MINE)].map((r) => r.dataset.id);
        firstRow.querySelector('[data-act=close]').click();
        await waitFor(() => document.getElementById('today-status').textContent.startsWith('Closed'), 'the Today close');
        const rowsAfter = [...app.querySelectorAll(MINE)].map((r) => r.dataset.id);
        const row = app.querySelector(`.today-row[data-id="${CSS.escape(todayId)}"]`);
        await report('today-closed', {
          id: todayId, column: (await boardCard(todayId))?.column,
          inPlace: rowsBefore.join() === rowsAfter.join(),
          reopenButton: !!row?.querySelector('[data-act=reopen]'),
          status: document.getElementById('today-status').textContent,
        });
        await shot('today-after-close');
      } else {
        await report('today-closed', null);
      }

      // ---- notes between meetings (step 8): one added on a person's page and one on a meeting's page, the switch
      // showing and hiding the text, and the markers on the Board, Today and People ----
      // The person: someone whose page offers an item that Today lists, so the marker shows on both.
      const todayIds = (await json('/api/today')).groups.flatMap((g) => g.items.map((i) => i.id));
      let notePerson = null;
      let noteItem = null;
      for (const p of (await json('/api/people')).groups.flatMap((g) => g.people)) {
        const hit = (await json(`/api/people/${encodeURIComponent(p.name)}`)).notes.items.find((i) => todayIds.includes(i.id));
        if (hit) { notePerson = p.name; noteItem = hit.id; break; }
      }
      const notesSection = () => document.getElementById('group-notes');
      await go(`#/people/${encodeURIComponent(notePerson)}`);
      const noteMeeting = [...document.getElementById('note-meeting').options].map((o) => o.value).find(Boolean) || '';
      document.getElementById('note-meeting').value = noteMeeting;
      document.getElementById('note-item').value = noteItem;
      document.getElementById('note-text').value = NOTE_TEXT;
      // As typed: the page keeps the box's fields from their input events.
      for (const id of ['note-meeting', 'note-item', 'note-text']) document.getElementById(id).dispatchEvent(new Event('input', { bubbles: true }));
      app.querySelector('#group-notes [data-act="note-add"]').click();
      await waitFor(() => document.getElementById('person-status').textContent === 'Note added.' || document.getElementById('note-error')?.textContent, 'the note');
      await report('note-added-person', {
        person: notePerson, item: noteItem, meeting: noteMeeting,
        status: document.getElementById('person-status').textContent, error: document.getElementById('note-error')?.textContent || null,
        rows: notesSection().querySelectorAll('.note-row').length, privateLabel: !!notesSection().querySelector('.note-private'),
        textOnPage: document.body.innerText.includes(NOTE_WORD), boxEmpty: document.getElementById('note-text').value === '',
      });
      document.getElementById('private-switch').click();
      await waitFor(() => notesSection()?.querySelector('.note-text'), 'the note text');
      await report('note-switch-on', {
        // Whether the text shown is the note as written, line breaks and all; the text itself is never reported.
        on: document.getElementById('private-switch').checked, textAsWritten: notesSection().querySelector('.note-text').textContent === NOTE_TEXT,
        editButtons: notesSection().querySelectorAll('[data-act="note-edit"]').length,
      });
      document.getElementById('private-switch').click();
      await waitFor(() => notesSection()?.querySelector('.note-private') && !notesSection().querySelector('.note-text'), 'the note hidden again');
      await report('note-switch-off', {
        on: document.getElementById('private-switch').checked, privateLabel: !!notesSection().querySelector('.note-private'),
        textOnPage: document.body.innerText.includes(NOTE_WORD), editButtons: notesSection().querySelectorAll('[data-act="note-edit"]').length,
      });

      // A meeting with exactly one attendee besides me: the meeting and that person are filled in.
      let oneToOne = null;
      for (const m of (await json('/api/meetings')).meetings) {
        const v = await json(`/api/meeting?file=${encodeURIComponent(m.file)}`);
        if (v.notes?.person) { oneToOne = { file: m.file, person: v.notes.person }; break; }
      }
      await go(`#/meetings/${encodeURIComponent(oneToOne.file)}`);
      const prefilled = document.getElementById('note-person')?.value ?? null;
      document.getElementById('note-text').value = MEETING_NOTE;
      document.getElementById('note-text').dispatchEvent(new Event('input', { bubbles: true }));
      app.querySelector('#group-since [data-act="note-add"]').click();
      await waitFor(() => document.getElementById('since-status')?.textContent === 'Note added.' || document.getElementById('note-error')?.textContent, 'the meeting note');
      const since = document.getElementById('group-since');
      await report('note-added-meeting', {
        ...oneToOne, prefilled, status: document.getElementById('since-status')?.textContent || null, error: document.getElementById('note-error')?.textContent || null,
        rows: since.querySelectorAll('.note-row').length, privateLabel: !!since.querySelector('.note-private'),
        textOnPage: document.body.innerText.includes(MEETING_WORD),
      });

      // The markers, and the count on the People row: never the text.
      const marker = (el) => {
        const m = el?.querySelector('.note-marker');
        return { found: !!el, text: m?.textContent.trim() || null, href: m?.getAttribute('href') || null, holdsText: el ? el.innerText.includes(NOTE_WORD) : null };
      };
      await go('#/board');
      await report('note-marker-board', { id: noteItem, ...marker(app.querySelector(`.card[data-id="${CSS.escape(noteItem)}"]`)) });
      await report('board-layout-notes', boardLayout());
      await shot('board-note-marker');
      await go('#/today');
      await showAllToday();
      await report('note-marker-today', { id: noteItem, ...marker(app.querySelector(`.today-row[data-id="${CSS.escape(noteItem)}"]`)) });
      await report('today-layout-notes', todayLayout());
      await shot('today-note-marker');
      await go('#/people');
      const personRow = [...app.querySelectorAll('.today-person')].find((r) => r.querySelector('.today-title')?.textContent.trim() === notePerson);
      await report('note-count-people', { person: notePerson, text: personRow?.querySelector('.note-count')?.textContent.trim() || null, pageHoldsText: document.body.innerText.includes(NOTE_WORD) });
      await shot('people-note-count');

      // The two notes sections at both widths, with the switch off.
      for (const width of [1440, 1100]) {
        await resize(width);
        await go(`#/people/${encodeURIComponent(notePerson)}`);
        await report('section-layout', sectionLayout('person-notes'));
        notesSection()?.scrollIntoView({ block: 'start' });
        await sleep(200);
        await shot(width === 1440 ? 'person-notes' : 'person-notes-1100');
        await go(`#/meetings/${encodeURIComponent(oneToOne.file)}`);
        await report('section-layout', sectionLayout('meeting-notes'));
        document.getElementById('group-since')?.scrollIntoView({ block: 'start' });
        await sleep(200);
        await shot(width === 1440 ? 'meeting-since' : 'meeting-since-1100');
      }
      await resize(1440);

      // ---- private notes: off on load, on with the switch, off again after a reload ----
      await go(`#/meetings/${encodeURIComponent(await privateMeeting())}`);
      await report('switch-on-load', switchState());
      document.getElementById('private-switch').click();
      await waitFor(() => app.querySelector('.private-note'), 'the private note');
      await report('switch-turned-on', switchState());
      sessionStorage.setItem('probe-phase', 'reloaded');
      location.reload();
      return;
    }

    // ---- after the reload ----
    sessionStorage.removeItem('probe-phase');
    await waitFor(() => document.getElementById('private-switch'), 'the meeting after the reload');
    await sleep(300);
    await report('switch-after-reload', switchState());

    // ---- links to websites open in the browser, not in this window ----
    const before = location.href;
    const a = Object.assign(document.createElement('a'), { href: 'https://example.com/', textContent: 'example' });
    app.append(a);
    a.click();
    await sleep(1200);
    await report('external-link', { stayed: location.href === before, href: location.href });
    window.open('https://example.com/', '_blank');
    await sleep(1200);
    await report('external-window-open', { stayed: location.href === before });
    a.remove();

    // ---- content security policy: nothing from elsewhere, no inline script ----
    new Image().src = 'https://example.com/csp-check.png';
    fetch('https://example.com/csp-check').catch(() => {});
    const s = document.createElement('script');
    s.textContent = 'window.__inlineRan = true;';
    document.body.append(s);
    await sleep(1200);
    await report('csp', { violations, inlineScriptRan: window.__inlineRan === true });
  } catch (e) {
    await report('error', String((e && e.stack) || e));
  }
  await report('done');
})();

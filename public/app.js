// Chief of Staff front end: a small hash router and one render function per page.
const app = document.getElementById('app');

// Page state lives in memory only, so every switch is back to its default on reload.
const state = { config: null, showPrivate: false, hideClosed: false, hideSuggested: true, owner: '', attendee: '', boardOwner: '', boardShowSuggested: false };

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const COULD_NOT_READ = '<span class="cnr">could not read</span>';

// Today on this computer's calendar, as YYYY-MM-DD. The core checks "not in the future" against the same date.
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(iso, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!iso) return COULD_NOT_READ;
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
}

// A day on a card, as the chips write it: "Sep 22", with the year when it is not the as-of date's year.
function fmtDay(iso, asOf) {
  return fmtDate(iso, iso && asOf && iso.slice(0, 4) === asOf.slice(0, 4) ? { month: 'short', day: 'numeric' } : undefined);
}

// The chip the core chose for an item: the page only draws it.
const chipHtml = (chip) => (chip ? `<span class="chip chip-${esc(chip.tone)}">${esc(chip.text)}</span>` : '');

// The words a summary gave for an item's due date, or null. "Not set" says nothing was said, so it is not repeated.
const saidWords = (c) => (c.summaryDue && c.summaryDue !== 'Not set' ? c.summaryDue : null);

// A meeting named for a link: the summary's title up to its date, then the day, e.g. "Kevin & Sam: Bi-Weekly 1:1, Sep 15".
function meetingLabel(file, date, meetings, asOf) {
  const m = meetings.find((x) => x.file === file);
  const name = (m?.title || '').split(' | ')[0].trim();
  return [name, date ? fmtDay(date, asOf) : ''].filter(Boolean).join(', ') || file;
}

// The edit button's icon: a pencil drawn in the text colour.
const PENCIL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"></path><path d="M13.5 6.5l4 4"></path></svg>';

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { data });
  return data;
}

function showError(err) {
  app.innerHTML = `<div class="notice notice-error"><strong>Something went wrong.</strong> ${esc(err.message)}</div>`;
}

function warningsPanel(warnings) {
  if (!warnings?.length) return '';
  return `
    <details class="notice notice-warn">
      <summary><strong>${warnings.length} thing${warnings.length === 1 ? '' : 's'} could not be read.</strong> Shown as "could not read" below.</summary>
      <ul>${warnings.map((w) => `<li><code>${esc(w.file)}</code>: ${esc(w.message)}</li>`).join('')}</ul>
    </details>`;
}

// A page whose file isn't in the workspace shows this plain notice instead of an error, as the Agents page
// does for a missing agents folder. A file that is there but can't be read is still an error.
function missingFile(file, what) {
  return `<div class="notice">There is no <code>${esc(file)}</code> in this workspace, so there are ${what} to show.</div>`;
}

// A meeting name that is not one of the summaries in meeting-notes/ (the core says so with noSummary) shows this
// plain notice instead of an error, as missingFile does for a missing file.
function noSummary(err) {
  if (typeof err.data?.noSummary !== 'string') return false;
  app.innerHTML = `
    <p><a class="back" href="#/meetings">← All meetings</a></p>
    <div class="notice" id="no-summary">There is no summary named "<code>${esc(err.data.noSummary)}</code>" in <code>meeting-notes/</code>.</div>`;
  return true;
}

function privateSwitch() {
  return `
    <label class="switch">
      <input type="checkbox" id="private-switch" role="switch" ${state.showPrivate ? 'checked' : ''}>
      <span class="switch-track" aria-hidden="true"></span>
      <span>Show private notes</span>
    </label>`;
}

// ---------- item rows: Today and a person's page ----------

const shortTitle = (it) => (it.title.length > 60 ? it.title.slice(0, 57) + '…' : it.title);

// A date on a row, with its weekday when it falls within the coming week.
function rowWhen(iso, asOf) {
  const n = daysFrom(asOf, iso);
  if (n < 0 || n > 7) return fmtDay(iso, asOf);
  return fmtDate(iso, { weekday: 'short', month: 'short', day: 'numeric', ...(iso.slice(0, 4) === asOf.slice(0, 4) ? {} : { year: 'numeric' }) });
}

// The due line: my date beside the summary's, or the summary's date, and the words said for it.
function dueLine(it, asOf) {
  const said = saidWords(it) ? `“${esc(saidWords(it))}”` : '';
  if (it.myDue) {
    const summary = [it.summaryDueDate ? fmtDay(it.summaryDueDate, asOf) : '', said].filter(Boolean).join(', ');
    return `Due ${rowWhen(it.myDue, asOf)} (mine${summary ? `; summary: ${summary}` : ''})`;
  }
  if (it.dueDate) return `Due ${rowWhen(it.dueDate, asOf)}${said ? `, said ${said}` : ''}`;
  return `No due date${said ? `, said ${said}` : ''}`;
}

function rowMeetingLink(file, date, ctx) {
  return `<a href="#/meetings/${encodeURIComponent(file)}" title="Open the ${esc(fmtDate(date))} meeting">${esc(meetingLabel(file, date, ctx.meetings, ctx.asOf))}</a>`;
}

// The buttons follow the item as it is now. A report asks to be confirmed; a closed row can be reopened. With keep
// false (a person's page) a report is not asked about: the row has Close, as any other.
function rowActions(it, key, keep) {
  const name = `${it.own ? '' : `${esc(it.id)}, `}“${esc(shortTitle(it))}”`;
  const btn = (act, label, primary) => `<button type="button" class="btn${primary ? ' btn-primary' : ''}" data-act="${act}" aria-label="${label} ${name}">${label}</button>`;
  if (keep && it.chip.rule === 'reported') return btn('keep', 'Keep open') + btn('close', 'Close', true);
  if (keep && it.chip.rule === 'still-mentioned') return btn('keep', 'Keep closed') + btn('reopen', 'Reopen', true);
  if (it.column === 'done') return btn('reopen', 'Reopen');
  // Re-date is for my own items, and for every item when Today can't tell whose an item is.
  const redate = it.mine || key === 'open' ? btn('redate', it.dueDate ? 'Re-date' : 'Set a date') : '';
  return redate + btn('close', 'Close', key !== 'owed-to-me');
}

function dueEditorHtml(it, editing) {
  return `
    <div class="today-edit">
      <label for="today-due">${it.dueDate ? 'New due date' : 'Due date'}</label>
      <input type="date" id="today-due" value="${esc(editing.due)}">
      <button type="button" class="btn btn-primary" data-act="save-due">Save</button>
      <button type="button" class="btn" data-act="cancel-due">Cancel</button>
      ${editing.error ? `<p class="form-error" role="alert">${esc(editing.error)}</p>` : ''}
    </div>`;
}

// One item's row. The key is the group it is drawn in: i-owe, owed-to-me, open or confirm. ctx holds the as-of date,
// the meetings (to name the one an item came from), the row whose date field is open, whether to ask about reports,
// and whether to name the owner (not on a person's page, which is theirs).
function itemRowHtml(it, key, ctx) {
  const day = (iso) => fmtDay(iso, ctx.asOf);
  const confirm = key === 'confirm';
  const done = it.column === 'done';
  const owner = it.mine && confirm ? 'You' : it.owner ? esc(it.owner) : 'No owner';
  const meta = [
    key === 'i-owe' || ctx.owner === false ? '' : `<span class="today-owner">${owner}</span>`,
    it.own ? 'Your card' : `<span class="today-id">${esc(it.id)}</span>`,
    confirm ? (done ? (it.closed ? `You closed it on ${day(it.closed)}` : 'Closed on your Board') : 'Open on your Board') : done ? '' : dueLine(it, ctx.asOf),
    confirm || !it.meeting ? '' : `From ${rowMeetingLink(it.meeting, it.meetingDate, ctx)}`,
    noteMarkerHtml(it.notes),
  ].filter(Boolean).join(' · ');
  const quote = it.report
    ? `<p class="today-quote">${day(it.report.date)} summary: ${it.report.statusHtml} ${it.report.file ? rowMeetingLink(it.report.file, it.report.date, ctx) : ''}</p>`
    : '';
  return `
    <li class="today-row${done ? ' is-done' : ''}" data-id="${esc(it.id)}">
      <div class="today-chip">${chipHtml(it.chip)}</div>
      <div class="today-main">
        <p class="today-title">${esc(it.title)}</p>
        <p class="today-meta">${meta}</p>
        ${quote}
      </div>
      <div class="today-actions">${rowActions(it, key, ctx.keep !== false)}</div>
      ${ctx.editing?.id === it.id ? dueEditorHtml(it, ctx.editing) : ''}
    </li>`;
}

// The line that says what an action did, from the item before and as it is now.
function actionMessage(action, before, item, asOf) {
  const day = (iso) => fmtDay(iso, asOf);
  const title = `“${shortTitle(before)}”`;
  if (action === 'close') return `Closed ${title}.`;
  if (action === 'reopen') return `Reopened ${title}. It is at the top of To do.`;
  if (action === 'due') {
    return item.myDue ? `New due date for ${title}: ${day(item.myDue)}.`
      : `${title} is back to the summary’s date${item.dueDate ? `, ${day(item.dueDate)}` : ''}.`;
  }
  const reported = before.report?.date ?? before.reported?.date ?? before.stillMentioned;
  return `Kept ${title} ${before.column === 'done' ? 'closed' : 'open'}. The ${day(reported)} report won’t be shown again.`;
}

// The clicks and keys on a page's item rows. Re-date opens a date field in the row (one at a time) with Save and
// Cancel; Close, Reopen and Keep go to rows.act. rows holds the page's own parts: itemById(id), act(id, action,
// payload), draw(), and editing, the open date field with what is typed in it.
function wireItemRows(body, rows) {
  const focusRow = (id, act) => {
    const row = body.querySelector(`.today-row[data-id="${CSS.escape(id)}"]`);
    (row?.querySelector(`[data-act="${act}"]`) || row?.querySelector('button'))?.focus();
  };
  const closeField = (id) => { rows.editing = null; rows.draw(); focusRow(id, 'redate'); };

  async function saveDue(it) {
    const due = document.getElementById('today-due').value;
    if (!due) { rows.editing = { ...rows.editing, due: '', error: 'Choose a date, or Cancel.' }; rows.draw(); return; }
    if (due === (it.myDue || it.summaryDueDate || '')) { closeField(it.id); return; }
    // Back to the summary's date clears my change; any other date is mine.
    await rows.act(it.id, 'due', { due: it.myDue && due === (it.summaryDueDate || '') ? null : due });
  }

  body.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn || btn.disabled) return;
    const id = btn.closest('.today-row')?.dataset.id;
    const it = id && rows.itemById(id);
    if (!it) return;
    const action = btn.dataset.act;
    if (action === 'redate') {
      if (rows.editing?.id === id) { closeField(id); return; }
      rows.editing = { id, due: it.myDue || it.summaryDueDate || '', error: '' };
      rows.draw();
      document.getElementById('today-due').focus();
      return;
    }
    if (action === 'cancel-due') { closeField(id); return; }
    if (action === 'save-due') { await saveDue(it); return; }
    if (['close', 'reopen', 'keep'].includes(action)) await rows.act(id, action);
  });
  body.addEventListener('input', (e) => { if (rows.editing && e.target.id === 'today-due') rows.editing.due = e.target.value; });
  body.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && rows.editing) { e.preventDefault(); closeField(rows.editing.id); }
  });
  return { focusRow };
}

// ---------- notes between meetings: a person's page, a meeting's page, the People page ----------

// "?private=1" when "Show private notes" is on: a note's text is in an answer only when asked for, as Manager-only
// notes are.
const privateQuery = () => (state.showPrivate ? '?private=1' : '');

// The marker on a Board card or a Today row whose item has notes: how many, linking to the person's page (the People
// page when people.md no longer has them). Never the text.
function noteMarkerHtml(n) {
  if (!n) return '';
  return `<a class="note-marker" href="${n.personKnown ? personHref(n.person) : '#/people'}">${plural(n.count, 'note', 'notes')}</a>`;
}

const noteMeetingLabel = (m, asOf) => [(m.title || '').split(' | ')[0].trim(), m.date ? fmtDay(m.date, asOf) : ''].filter(Boolean).join(', ') || m.file;
const noteOption = (value, label, selected) => `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;
const itemLabel = (i) => `${i.id} · ${shortTitle(i)}`;

// The choices for a note's meeting or item: those offered, and the one it names now when that is no longer offered,
// so an edit never drops it unasked.
function noteChoices(offered, current, label, goneLabel) {
  const list = offered.map((x) => [x.value, label(x)]);
  if (current && !list.some(([v]) => v === current)) list.push([current, goneLabel(current)]);
  return list;
}

// One note: its day, its person (where the page is not theirs), what it relates to, and its text, or "private note"
// with the switch off. A meeting or an item that is no longer in the summaries is named without a link. Edit and
// Delete only while the text is shown.
function noteRowHtml(n, ui, o, block) {
  const asOf = block.asOf;
  const head = [`<span class="note-date">${fmtDay(n.date, asOf)}</span>`];
  if (o.showPerson) {
    head.push(n.personKnown ? `<a class="note-person" href="${personHref(n.person)}">${esc(n.person)}</a>` : `<span class="note-person">${esc(n.person)}</span>`);
  }
  if (n.meeting && !o.hideMeeting) {
    head.push(n.meeting.found ? `From <a href="#/meetings/${encodeURIComponent(n.meeting.file)}">${esc(noteMeetingLabel(n.meeting, asOf))}</a>`
      : `From <span class="note-gone">${esc(n.meeting.file)}</span>, no longer in <code>meeting-notes/</code>`);
  }
  if (n.item) {
    head.push(n.item.found ? `About <a href="#/meetings/${encodeURIComponent(n.item.meeting)}">${esc(n.item.id)}</a> “${esc(shortTitle(n.item))}”`
      : `About <span class="note-gone">${esc(n.item.id)}</span>, no longer in the summaries`);
  }
  const editing = ui.editing?.id === n.id ? ui.editing : null;
  const deleting = ui.deleting === n.id;
  const name = `the ${fmtDate(n.date)} note${o.showPerson ? ` about ${n.person}` : ''}`;
  const actions = n.textShown && !editing && !deleting ? `
    <div class="note-actions">
      <button type="button" class="btn btn-small" data-act="note-edit" aria-label="Edit ${esc(name)}">Edit</button>
      <button type="button" class="btn btn-small" data-act="note-delete" aria-label="Delete ${esc(name)}">Delete</button>
    </div>` : '';
  let below = '';
  if (editing) {
    const meetings = o.box === 'person' ? `
      <label class="field"><span>Meeting <span class="muted">(optional)</span></span>
        <select id="note-edit-meeting">${[['', 'None'], ...noteChoices(block.meetings.map((m) => ({ ...m, value: m.file })), n.meeting?.file, (m) => `${fmtDate(m.date)} · ${noteMeetingLabel(m, asOf)}`, (f) => `${f} (no longer in meeting-notes/)`)]
          .map(([v, l]) => noteOption(v, l, v === editing.meeting)).join('')}</select>
      </label>` : '';
    const offered = o.box === 'person' ? block.items : o.box === 'meeting' ? (block.people.find((p) => p.name === n.person)?.items || []) : null;
    const items = offered ? `
      <label class="field"><span>Item <span class="muted">(optional)</span></span>
        <select id="note-edit-item">${[['', 'None'], ...noteChoices(offered.map((i) => ({ ...i, value: i.id })), n.item?.id, itemLabel, (id) => (n.item?.found ? `${id} · ${shortTitle(n.item)}` : `${id} (no longer in the summaries)`))]
          .map(([v, l]) => noteOption(v, l, v === editing.item)).join('')}</select>
      </label>` : '';
    below = `
      <div class="note-edit">
        <div class="note-fields">
          <label class="field"><span>Date</span><input type="date" id="note-edit-date" value="${esc(editing.date)}" max="${esc(asOf)}"></label>
          ${meetings}${items}
        </div>
        <label class="field"><span>Note</span><textarea id="note-edit-text" rows="4" maxlength="2000">${esc(editing.text)}</textarea></label>
        <p class="form-error" id="note-edit-error" role="alert">${esc(editing.error)}</p>
        <div class="note-buttons">
          <button type="button" class="btn btn-primary" data-act="note-save">Save</button>
          <button type="button" class="btn" data-act="note-cancel">Cancel</button>
        </div>
      </div>`;
  } else if (deleting) {
    below = `
      <div class="note-confirm">
        <span>Delete this note for good?</span>
        <button type="button" class="btn btn-danger" data-act="note-delete-confirm">Delete</button>
        <button type="button" class="btn" data-act="note-cancel">Cancel</button>
      </div>`;
  }
  return `
    <li class="note-row" data-id="${esc(n.id)}">
      <div class="note-main">
        <p class="note-head">${head.join('<span class="sep" aria-hidden="true"> · </span>')}</p>
        ${n.textShown ? `<p class="note-text">${esc(n.text)}</p>` : '<p class="note-private">private note</p>'}
      </div>
      ${actions}
      ${below}
    </li>`;
}

// The "Add note" box. On a person's page the person is theirs and the meeting is one they attended; on a meeting's page
// the meeting is that one and the person one of its attendees. The items are their open ones and mine from meetings
// they attended.
function noteBoxHtml(block, ui, o) {
  if (block.error) return '';
  if (!block.canAdd) {
    const why = block.peopleFound === false ? `There is no <code>${esc(block.peopleFile)}</code> in this workspace, so notes can’t be added.` : esc(block.cantAdd || '');
    return `<p class="note-cant" id="note-cant">${why}</p>`;
  }
  if (o.box === 'meeting' && !block.people.length) {
    return `<p class="note-cant" id="note-cant">No one at this meeting besides you is in <code>${esc(block.peopleFile)}</code>, so a note can’t be added here.</p>`;
  }
  const b = ui.box;
  const asOf = block.asOf;
  const items = o.box === 'meeting' ? (block.people.find((p) => p.name === b.person)?.items || []) : block.items;
  const first = o.box === 'meeting' ? `
    <label class="field"><span>Person</span>
      <select id="note-person">${(block.person ? [] : [['', 'Choose…']]).concat(block.people.map((p) => [p.name, p.name])).map(([v, l]) => noteOption(v, l, v === b.person)).join('')}</select>
    </label>` : `
    <label class="field"><span>Meeting <span class="muted">(optional)</span></span>
      <select id="note-meeting">${[['', 'None'], ...block.meetings.map((m) => [m.file, `${fmtDate(m.date)} · ${noteMeetingLabel(m, asOf)}`])].map(([v, l]) => noteOption(v, l, v === b.meeting)).join('')}</select>
    </label>`;
  return `
    <div class="note-box" role="group" aria-labelledby="h-${o.id}-add">
      <h3 id="h-${o.id}-add">Add note</h3>
      <div class="note-fields">
        <label class="field"><span>Date</span><input type="date" id="note-date" value="${esc(b.date)}" max="${esc(asOf)}"></label>
        ${first}
        <label class="field"><span>Item <span class="muted">(optional)</span></span>
          <select id="note-item">${[['', 'None'], ...items.map((i) => [i.id, itemLabel(i)])].map(([v, l]) => noteOption(v, l, v === b.item)).join('')}</select>
        </label>
      </div>
      <label class="field"><span>Note <span class="muted">· private: shown only with “Show private notes” on</span></span>
        <textarea id="note-text" rows="3" maxlength="2000" placeholder="What was said, and what happens next">${esc(b.text)}</textarea>
      </label>
      <p class="form-error" id="note-error" role="alert">${esc(ui.error)}</p>
      <div class="note-buttons"><button type="button" class="btn btn-primary" data-act="note-add">Add note</button></div>
    </div>`;
}

// A page's notes section and its clicks. o: id and heading of the section; box, 'person', 'meeting' or null (no box);
// person or meeting, the page's own; showPerson and hideMeeting, what each row names; empty, the line when there are
// none; statusId, a status line inside the section; block(), the notes as last read; reload(), which reads the page
// again and draws it; draw(); setStatus(message, isError).
function notesPart(o) {
  const ui = { box: null, editing: null, deleting: null, error: '' };
  const freshBox = () => {
    const b = o.block();
    return { date: b.asOf, person: o.person ?? b.person ?? '', meeting: '', item: '', text: '' };
  };

  function html() {
    const block = o.block();
    if (!ui.box) ui.box = freshBox();
    const n = block.list.length;
    const sub = block.error ? '' : n ? `${plural(n, 'note', 'notes')}, newest first` : o.empty;
    return `
      <section class="today-group notes-group" id="${o.id}" aria-labelledby="h-${o.id}">
        <div class="today-group-head">
          <h2 id="h-${o.id}">${o.heading}</h2>
          ${sub ? `<span class="today-group-sub">${sub}</span>` : ''}
        </div>
        ${o.statusId ? `<p class="board-status note-status" id="${o.statusId}" role="status" aria-live="polite"></p>` : ''}
        ${block.error ? `<div class="notice notice-warn note-notice">${esc(block.error)}</div>` : ''}
        ${n ? `<ol class="note-rows">${block.list.map((x) => noteRowHtml(x, ui, o, block)).join('')}</ol>` : ''}
        ${o.box ? noteBoxHtml(block, ui, o) : ''}
      </section>`;
  }

  // What is typed survives a redraw: the fields are filled from the state after each draw.
  function afterDraw() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
    if (o.box && o.block().canAdd) {
      set('note-date', ui.box.date);
      set('note-text', ui.box.text);
      set('note-item', ui.box.item);
      if (o.box === 'person') set('note-meeting', ui.box.meeting);
      else set('note-person', ui.box.person);
    }
    if (ui.editing) {
      set('note-edit-date', ui.editing.date);
      set('note-edit-text', ui.editing.text);
      if (o.box === 'person') set('note-edit-meeting', ui.editing.meeting);
      if (o.box) set('note-edit-item', ui.editing.item);
    }
  }

  const read = (id) => document.getElementById(id)?.value ?? '';
  // Kept as typed, so a redraw (an action on a row, the switch) doesn't lose it.
  const FIELDS = {
    'note-date': () => [ui.box, 'date'], 'note-text': () => [ui.box, 'text'], 'note-item': () => [ui.box, 'item'],
    'note-meeting': () => [ui.box, 'meeting'], 'note-person': () => [ui.box, 'person'],
    'note-edit-date': () => [ui.editing, 'date'], 'note-edit-text': () => [ui.editing, 'text'],
    'note-edit-meeting': () => [ui.editing, 'meeting'], 'note-edit-item': () => [ui.editing, 'item'],
  };
  function keep(el) {
    const [target, key] = FIELDS[el?.id]?.() || [];
    if (target) target[key] = el.value;
  }

  async function add() {
    const b = ui.box;
    for (const id of ['note-date', 'note-text', 'note-item', o.box === 'person' ? 'note-meeting' : 'note-person']) keep({ id, value: read(id) });
    const body = {
      date: b.date, text: b.text, item: b.item || null,
      person: o.box === 'person' ? o.person : b.person,
      meeting: (o.box === 'person' ? b.meeting : o.meeting) || null,
    };
    try {
      await api(`/api/notes${privateQuery()}`, { method: 'POST', body });
    } catch (err) {
      ui.error = err.message;
      o.draw();
      document.getElementById('note-text')?.focus();
      return;
    }
    ui.box = freshBox();
    ui.error = '';
    await o.reload();
    o.setStatus('Note added.');
  }

  async function save() {
    const e = ui.editing;
    for (const id of ['note-edit-date', 'note-edit-text', ...(o.box === 'person' ? ['note-edit-meeting'] : []), ...(o.box ? ['note-edit-item'] : [])]) keep({ id, value: read(id) });
    const body = { date: e.date, text: e.text };
    if (o.box === 'person') body.meeting = e.meeting || null;
    if (o.box) body.item = e.item || null;
    try {
      await api(`/api/notes/${encodeURIComponent(e.id)}${privateQuery()}`, { method: 'PUT', body });
    } catch (err) {
      e.error = err.message;
      o.draw();
      return;
    }
    ui.editing = null;
    await o.reload();
    o.setStatus('Note saved.');
  }

  async function remove(id) {
    try {
      await api(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (err) {
      ui.deleting = null;
      o.draw();
      o.setStatus(err.message, true);
      return;
    }
    ui.deleting = null;
    await o.reload();
    o.setStatus('Note deleted.');
  }

  // One save at a time, so a double click doesn't add a note twice.
  let busy = false;
  const once = async (f) => {
    if (busy) return;
    busy = true;
    try { await f(); } finally { busy = false; }
  };

  function wire(container) {
    container.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-act]');
      const act = btn?.dataset.act;
      if (!act?.startsWith('note-') || btn.disabled) return;
      const id = btn.closest('.note-row')?.dataset.id;
      const n = id ? o.block().list.find((x) => x.id === id) : null;
      if (act === 'note-add') await once(add);
      if (act === 'note-edit' && n) {
        ui.deleting = null;
        ui.editing = { id, date: n.date, meeting: n.meeting?.file || '', item: n.item?.id || '', text: n.text ?? '', error: '' };
        o.draw();
        document.getElementById('note-edit-text')?.focus();
      }
      if (act === 'note-save' && ui.editing?.id === id) await once(save);
      if (act === 'note-delete' && n) { ui.editing = null; ui.deleting = id; o.draw(); }
      if (act === 'note-delete-confirm' && ui.deleting === id) await once(() => remove(id));
      if (act === 'note-cancel') { ui.editing = null; ui.deleting = null; o.draw(); }
    });
    container.addEventListener('input', (e) => keep(e.target));
    container.addEventListener('change', (e) => {
      keep(e.target);
      // The items offered follow the person chosen.
      if (e.target.id === 'note-person') { ui.box.item = ''; o.draw(); }
    });
  }

  // The switch changed: a note being edited or deleted needs its text, so that is closed.
  const reset = () => { ui.editing = null; ui.deleting = null; };
  return { html, afterDraw, wire, reset };
}

// ---------- Today ----------

// The groups' headings. Which items are in each, and their order, come from the core.
const TODAY_GROUPS = { 'i-owe': 'I owe', 'owed-to-me': 'Owed to me', open: 'Open items', confirm: 'Needs your confirmation' };
const NUMBER_WORDS = ['nothing', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const inWords = (n) => NUMBER_WORDS[n] ?? String(n);
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const daysFrom = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

// Why it can't be told which items are mine, naming people.md.
function meProblemLine(p, cant = 'Today can’t tell which items are yours') {
  const file = `<code>${esc(p.file)}</code>`;
  const why = p.reason === 'no-file' ? `There is no ${file} in this workspace`
    : p.reason === 'no-me' ? `${file} has no row marked “me”`
    : `${file} has ${p.count} rows marked “me”`;
  return `${why}, so ${cant}.`;
}

async function renderToday() {
  let view = await api('/api/today');
  const hasReload = view.status !== 'no-summaries';
  app.innerHTML = `
    <header class="page-head today-head">
      <div>
        <h1>Today</h1>
        <p class="page-sub" id="today-sub"></p>
        <p class="board-status" id="today-status" role="status" aria-live="polite"></p>
      </div>
      ${hasReload ? '<button type="button" class="btn" id="today-reload">Reload</button>' : ''}
    </header>
    <div class="today" id="today-body"></div>`;

  const body = document.getElementById('today-body');
  const statusEl = document.getElementById('today-status');
  const setStatus = (msg, isError = false) => {
    statusEl.textContent = msg;
    statusEl.classList.toggle('is-error', isError);
  };
  // A row I act on stays where it was, showing the item as it is now, until Reload: its group, its place, the item.
  // Keep open and Keep closed are the exception: their row goes away.
  const lingering = new Map();
  // The IDs in each group as last drawn, for a row's place.
  let drawn = {};

  const groupItems = (key) => {
    const list = (view.groups.find((g) => g.key === key)?.items || []).filter((it) => !lingering.has(it.id));
    const kept = [...lingering.entries()].filter(([, l]) => l.group === key).sort((a, b) => a[1].index - b[1].index);
    for (const [, l] of kept) list.splice(Math.min(l.index, list.length), 0, l.item);
    return list;
  };
  const itemById = (id) => lingering.get(id)?.item ?? view.groups.flatMap((g) => g.items).find((it) => it.id === id);
  const groupOf = (id) => lingering.get(id)?.group ?? Object.keys(drawn).find((k) => drawn[k].includes(id));

  function groupHtml(key, line, note, rows) {
    return `
      <section class="today-group" id="group-${key}" aria-labelledby="h-${key}">
        <div class="today-group-head">
          <h2 id="h-${key}">${key === 'people' ? 'People' : TODAY_GROUPS[key]}</h2>
          ${line ? `<span class="today-group-sub">${line}</span>` : ''}
        </div>
        ${note ? `<p class="today-note">${note}</p>` : ''}
        ${rows ? `<ol class="today-rows">${rows}</ol>` : ''}
      </section>`;
  }

  function groupLine(key, n) {
    if (key === 'i-owe') return n ? `${plural(n, 'item', 'items')} where you are the owner` : 'Nothing of yours is past due, due this week or open more than 30 days.';
    if (key === 'owed-to-me') return n ? `${plural(n, 'item', 'items')} where someone else is the owner` : 'Nothing owed to you is past due, due this week or open more than 30 days.';
    if (key === 'open') return n ? `${plural(n, 'item', 'items')} past due, due this week or open more than 30 days` : 'Nothing is past due, due this week or open more than 30 days.';
    return n ? `${plural(n, 'item', 'items')} where a later meeting disagrees with your Board` : 'Nothing to confirm.';
  }

  function peopleHtml() {
    if (view.meProblem) return groupHtml('people', '', meProblemLine(view.meProblem), '');
    const { reports, flagCount } = view.people;
    const line = !reports.length ? 'No one in <code>people.md</code> is marked “report”.'
      : flagCount ? plural(flagCount, 'flag', 'flags')
      : 'No flags: every report has met with you in the last 30 days, and none has a busy week.';
    return groupHtml('people', line, '', reports.map((p) => personRowHtml(p, view.asOf)).join(''));
  }

  function footHtml() {
    const f = view.foot;
    const read = f.couldNotRead
      ? `${plural(f.couldNotRead, 'thing', 'things')} could not be read: <a href="#/meetings">see Meetings</a>.`
      : 'Could not read: nothing.';
    const agents = f.agentsReviewDue === null ? 'The agents could not be read: <a href="#/agents">see Agents</a>.'
      : f.agentsReviewDue ? `<a href="#/agents">${plural(f.agentsReviewDue, 'agent has', 'agents have')} a review due</a>.`
      : 'No agent has a review due: <a href="#/agents">see Agents</a>.';
    return `<p class="today-foot">${read} ${agents}</p>`;
  }

  // The as-of date with its weekday, and one sentence with the three counts.
  function subHtml() {
    if (view.status !== 'ok') return '';
    const date = fmtDate(view.asOf, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
    const c = view.counts;
    const counts = view.meProblem
      ? `${c.open ? `${inWords(c.open)} open item${c.open === 1 ? '' : 's'}` : 'no open items'}, ${inWords(c.confirm)} to confirm`
      : `${inWords(c.iOwe)} for you, ${inWords(c.owedToMe)} owed to you, ${inWords(c.confirm)} to confirm`;
    return `${date}${view.asOfIsNewestMeeting ? ', the date of the newest meeting' : ''}. ${capitalize(counts)}.`;
  }

  function bodyHtml() {
    if (view.status === 'no-summaries') {
      return '<p class="today-start">No meeting summaries yet. Save a summary in <code>meeting-notes/</code> and it shows up here.</p>';
    }
    if (view.status === 'ledger-unreadable') return `<div class="notice notice-warn">${esc(view.ledgerError)}</div>${footHtml()}`;
    drawn = {};
    const ctx = { asOf: view.asOf, meetings: view.meetings, editing: rows.editing };
    const groups = view.groups.map((g) => {
      const items = groupItems(g.key);
      drawn[g.key] = items.map((it) => it.id);
      const n = g.key === 'open' ? view.counts.open : g.key === 'confirm' ? view.counts.confirm : g.key === 'i-owe' ? view.counts.iOwe : view.counts.owedToMe;
      const note = g.key === 'open' ? meProblemLine(view.meProblem) : '';
      return groupHtml(g.key, groupLine(g.key, n), note, items.map((it) => itemRowHtml(it, g.key, ctx)).join(''));
    });
    return groups.join('') + peopleHtml() + footHtml();
  }

  function draw() {
    showTodayCount(view);
    document.getElementById('today-sub').innerHTML = subHtml();
    body.innerHTML = bodyHtml();
    // What was typed in the date field survives a redraw.
    if (rows.editing) document.getElementById('today-due').value = rows.editing.due;
  }

  // Every action answers with the whole of Today and the item as it is now.
  async function act(id, action, payload = {}) {
    const before = itemById(id);
    const key = groupOf(id);
    const index = Math.max(0, drawn[key]?.indexOf(id) ?? 0);
    let res;
    try {
      res = await api(`/api/today/items/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: payload });
    } catch (err) {
      if (rows.editing?.id === id) { rows.editing.error = err.message; draw(); } else setStatus(err.message, true);
      return;
    }
    view = res;
    if (action === 'keep' || !res.item) lingering.delete(id);
    else lingering.set(id, { group: key, index, item: res.item });
    rows.editing = null;
    draw();
    refreshOpenCount();
    setStatus(actionMessage(action, before, res.item, view.asOf));
    if (action !== 'keep') focusRow(id, action === 'close' ? 'reopen' : 'close');
  }

  const rows = { editing: null, itemById, act, draw };
  const { focusRow } = wireItemRows(body, rows);

  // Reload reads everything again; the rows I acted on go to where they now belong.
  if (hasReload) {
    document.getElementById('today-reload').addEventListener('click', async () => {
      try {
        view = await api('/api/today');
      } catch (err) {
        setStatus(err.message, true);
        return;
      }
      lingering.clear();
      rows.editing = null;
      setStatus('');
      draw();
      refreshOpenCount();
    });
  }

  draw();
}

// ---------- Meetings ----------

async function renderMeetings(params = {}) {
  // #/meetings?attendee=<name> opens it with that attendee chosen.
  if (params.attendee !== undefined) state.attendee = params.attendee;
  const data = await api('/api/meetings');
  const asOf = data.asOfIsNewestMeeting
    ? `as of ${fmtDate(data.asOf)}, the newest meeting`
    : `as of today, ${fmtDate(data.asOf)}`;
  const attendees = [...new Set(data.meetings.flatMap((m) => m.people || []))].sort();
  if (!data.owners.includes(state.owner)) state.owner = '';
  if (!attendees.includes(state.attendee)) state.attendee = '';
  // Owners are checked against people.md; without it they are shown as written.
  const peopleMissing = data.peopleFile?.fileFound === false
    ? `<div class="notice">There is no <code>${esc(data.peopleFile.file)}</code> in this workspace, so owners are shown as written and not checked.</div>`
    : '';

  app.innerHTML = `
    <div class="page-head">
      <h1>Meetings</h1>
      ${privateSwitch()}
    </div>
    ${warningsPanel(data.warnings)}
    ${peopleMissing}

    <section class="panel" aria-labelledby="tracked-h">
      <div class="panel-head">
        <div>
          <h2 id="tracked-h">Tracked items across all meetings</h2>
          <p class="muted"><strong id="tracked-count" class="count"></strong> · age in days ${esc(asOf)} · latest status word for word</p>
        </div>
        <div class="filters">
          <label class="check">
            <input type="checkbox" id="hide-closed" ${state.hideClosed ? 'checked' : ''}>
            Hide done and dropped
          </label>
          <label class="check">
            <input type="checkbox" id="hide-suggested" ${state.hideSuggested ? 'checked' : ''}>
            Hide suggested
          </label>
          <label class="select">
            Owner
            <select id="owner-filter">
              <option value="">Everyone</option>
              ${data.owners.map((o) => `<option value="${esc(o)}" ${o === state.owner ? 'selected' : ''}>${esc(o)}</option>`).join('')}
            </select>
          </label>
        </div>
      </div>
      <div class="table-wrap tracked-wrap">
        <table class="data tracked">
          <colgroup>
            <col class="c-id"><col class="c-item"><col class="c-owner"><col class="c-due"><col class="c-first"><col class="c-age"><col class="c-status"><col class="c-from">
          </colgroup>
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">Item</th>
              <th scope="col">Owner</th>
              <th scope="col">Due date</th>
              <th scope="col">First seen</th>
              <th scope="col" class="num">Age</th>
              <th scope="col">Latest status</th>
              <th scope="col">From meetings</th>
            </tr>
          </thead>
          <tbody id="tracked-body"></tbody>
        </table>
      </div>
      <p class="muted small legend">
        <span class="tag tag-suggested">suggested</span> not said in the meeting ·
        <span class="muted">no ID</span> not tracked across meetings ·
        <span class="tag tag-problem">check</span> something in the row doesn't fit the summary format; the problem is listed under the item
      </p>
    </section>

    <section aria-labelledby="summaries-h">
      <div class="summaries-head">
        <h2 id="summaries-h">Summaries <span class="muted">· newest first</span></h2>
        <label class="select">
          Attendee
          <select id="attendee-filter">
            <option value="">Everyone</option>
            ${attendees.map((a) => `<option value="${esc(a)}" ${a === state.attendee ? 'selected' : ''}>${esc(a)}</option>`).join('')}
          </select>
        </label>
      </div>
      <ul class="meeting-list" id="meeting-list"></ul>
    </section>`;

  // The Attendee filter only narrows the list of summaries; the tracked table has its own Owner filter.
  const renderMeetingList = () => {
    const shown = data.meetings.filter((m) => !state.attendee || (m.people || []).includes(state.attendee));
    document.getElementById('meeting-list').innerHTML = shown.map((m) => `
      <li>
        <a class="meeting-card" href="#/meetings/${encodeURIComponent(m.file)}">
          <span class="meeting-date">${fmtDate(m.date)}</span>
          <span class="meeting-people">${m.people ? esc(m.people.join(', ')) : COULD_NOT_READ}</span>
          <span class="meeting-type">${m.type ? esc(m.type) : COULD_NOT_READ}</span>
        </a>
      </li>`).join('') || '<li class="muted">No summaries with this attendee.</li>';
  };
  renderMeetingList();

  // An earlier-items row with no ID is background, not an action item: its "From" is shown as written.
  const background = (r) => r.kind === 'earlier item' && !r.id;
  const renderRows = () => {
    const rows = data.tracked.filter((r) =>
      !(state.hideClosed && r.state !== 'open') &&
      !(state.hideSuggested && r.suggested) &&
      !(state.owner && r.owner !== state.owner));
    document.getElementById('tracked-count').textContent = `Showing ${rows.length} of ${data.tracked.length}`;
    document.getElementById('tracked-body').innerHTML = rows.map((r) => `
      <tr class="${r.state !== 'open' ? 'is-closed' : ''}">
        <td class="id">${r.id ? esc(r.id) : '<span class="muted">no ID</span>'}</td>
        <td class="item">
          <span>${r.textHtml}</span>
          ${chipHtml(r.chip)}
          ${r.suggested && r.chip?.rule !== 'suggested' ? '<span class="tag tag-suggested">suggested</span>' : ''}
          ${r.problems.length ? '<span class="tag tag-problem">check</span>' : ''}
          ${r.problems.length ? `<ul class="problems">${r.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
        </td>
        <td>${r.owner ? esc(r.owner) : COULD_NOT_READ}</td>
        <td>${r.dueDate ? `<span class="date">${fmtDate(r.dueDate)}</span>` : ''}${r.due ? `<div class="muted small">${esc(r.due)}</div>` : ''}</td>
        <td>${background(r) ? `<span class="from-text">${esc(r.firstSeenText)}</span>`
          : r.firstSeen ? `<span class="date">${fmtDate(r.firstSeen)}</span>` : `${COULD_NOT_READ}<div class="muted small">${esc(r.firstSeenText)}</div>`}</td>
        <td class="num">${r.ageDays ?? (background(r) ? '<span class="muted">—</span>' : COULD_NOT_READ)}</td>
        <td class="status">${r.latestStatusHtml}</td>
        <td class="sources">${r.sources.map((s) => `<a href="#/meetings/${encodeURIComponent(s.file)}" title="${esc(s.kind)} in ${esc(s.file)}">${fmtDate(s.date, { month: 'short', day: 'numeric' })}</a>`).join('')}</td>
      </tr>`).join('');
  };
  renderRows();

  document.getElementById('hide-closed').addEventListener('change', (e) => { state.hideClosed = e.target.checked; renderRows(); });
  document.getElementById('hide-suggested').addEventListener('change', (e) => { state.hideSuggested = e.target.checked; renderRows(); });
  document.getElementById('owner-filter').addEventListener('change', (e) => { state.owner = e.target.value; renderRows(); });
  document.getElementById('attendee-filter').addEventListener('change', (e) => { state.attendee = e.target.value; renderMeetingList(); });
  document.getElementById('private-switch').addEventListener('change', (e) => { state.showPrivate = e.target.checked; });
}

async function renderMeeting(file) {
  const load = () => api(`/api/meeting?file=${encodeURIComponent(file)}${state.showPrivate ? '&private=1' : ''}`);
  let m;
  try { m = await load(); } catch (err) { if (noSummary(err)) return; throw err; }

  // The bar, the summary and "Since this meeting" are placed once; the switch reads the meeting again and redraws them.
  app.innerHTML = `
    <div class="reader-bar">
      <a class="back" href="#/meetings">← All meetings</a>
      <div class="reader-private"><span class="private-status" id="private-status" hidden></span>${privateSwitch()}</div>
    </div>
    <article class="prose" id="meeting-article"></article>
    <div class="meeting-since" id="meeting-since"></div>`;

  const sinceEl = document.getElementById('meeting-since');
  const since = notesPart({
    id: 'group-since', heading: 'Since this meeting', box: 'meeting', meeting: file, showPerson: true, hideMeeting: true,
    empty: 'No notes name this meeting yet.', statusId: 'since-status',
    block: () => m.notes,
    reload: async () => { m = await load(); draw(); },
    draw: () => draw(),
    setStatus: (msg, isError = false) => {
      const el = document.getElementById('since-status');
      el.textContent = msg;
      el.classList.toggle('is-error', isError);
    },
  });

  function draw() {
    const status = document.getElementById('private-status');
    const n = m.privateNotes;
    status.hidden = !n;
    status.textContent = !n ? '' : state.showPrivate ? `Showing ${n} private note${n === 1 ? '' : 's'}` : `${n} private note${n === 1 ? '' : 's'} hidden`;
    status.classList.toggle('is-shown', Boolean(n) && state.showPrivate);
    document.getElementById('meeting-article').innerHTML = m.html;
    sinceEl.innerHTML = since.html();
    since.afterDraw();
  }

  since.wire(sinceEl);
  document.getElementById('private-switch').addEventListener('change', async (e) => {
    state.showPrivate = e.target.checked;
    since.reset();
    try { m = await load(); draw(); } catch (err) { if (!noSummary(err)) showError(err); }
  });
  draw();
}

// ---------- Board ----------

// Why a ledger entry has no card, as the core says it, and the heading it is listed under.
const NOT_ON_BOARD = [
  ['no-summary', 'in no summary', 'Not found in any summary'],
  ['duplicate', 'its ID is used twice in the summaries', 'ID used twice in the summaries'],
  ['bad-id', 'its ID is not in the form A-YYMMDD-n', 'ID not in the form A-YYMMDD-n'],
];

async function renderBoard() {
  let view = await api('/api/board');
  const columns = view.columns;

  app.innerHTML = `
    <header class="page-head board-head">
      <div>
        <h1>Board</h1>
        <p class="page-sub board-count" id="board-count"></p>
        <p class="board-status" id="board-status" role="status" aria-live="polite"></p>
      </div>
      <div class="board-tools">
        <label class="select">
          Owner
          <select id="board-owner"></select>
        </label>
        <label class="check">
          <input type="checkbox" id="show-suggested" ${state.boardShowSuggested ? 'checked' : ''}>
          Show suggested
        </label>
        <button type="button" class="btn btn-primary" id="add-btn">Add card</button>
      </div>
    </header>
    <div id="board-notices"></div>
    <div class="board" id="board"></div>

    <dialog class="dialog" id="card-dialog" aria-labelledby="card-dialog-h">
      <form id="card-form" novalidate>
        <h2 id="card-dialog-h">Add card</h2>
        <label class="field">
          <span>Title</span>
          <textarea name="title" rows="3" maxlength="500" required></textarea>
        </label>
        <label class="field">
          <span>Owner <span class="muted">(optional)</span></span>
          <input name="owner" list="owner-options" maxlength="120" autocomplete="off">
          <datalist id="owner-options"></datalist>
        </label>
        <label class="field">
          <span>Meeting <span class="muted">(optional)</span></span>
          <select name="meeting"></select>
        </label>
        <label class="field" id="column-field">
          <span>Column</span>
          <select name="column">${columns.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
        </label>
        <label class="field">
          <span>Due date <span class="muted">(optional)</span></span>
          <input type="date" name="due">
        </label>
        <label class="field">
          <span>Note <span class="muted">(optional)</span></span>
          <textarea name="note" rows="3" maxlength="2000"></textarea>
        </label>
        <p class="form-error" id="card-error" role="alert"></p>
        <div class="dialog-actions">
          <button type="button" class="btn" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    </dialog>

    <dialog class="dialog" id="confirm-dialog" aria-labelledby="confirm-h">
      <h2 id="confirm-h">Delete this card?</h2>
      <p id="confirm-title" class="confirm-title"></p>
      <p class="muted">This card was added by you and will be removed for good.</p>
      <p class="form-error" id="confirm-error" role="alert"></p>
      <div class="dialog-actions">
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="button" class="btn btn-danger" id="confirm-delete">Delete</button>
      </div>
    </dialog>`;

  const boardEl = document.getElementById('board');
  const statusEl = document.getElementById('board-status');
  const ownerSelect = document.getElementById('board-owner');
  const setStatus = (msg, isError = false) => {
    statusEl.textContent = msg;
    statusEl.classList.toggle('is-error', isError);
  };

  const columnIndex = (id) => columns.findIndex((c) => c.id === id);
  const columnName = (id) => columns[columnIndex(id)]?.name || id;
  const shortTitle = (c) => (c.title.length > 60 ? c.title.slice(0, 57) + '…' : c.title);
  // The filters only change what is shown; the ledger is never touched by them.
  const isShown = (c) => (state.boardShowSuggested || !c.suggested) && (!state.boardOwner || c.owner === state.boardOwner);
  const day = (iso) => fmtDay(iso, view.asOf);

  // The action item open in place, with what has been typed in it so far. One card at a time.
  let editing = null;

  function drawOwnerOptions() {
    if (state.boardOwner && !view.owners.includes(state.boardOwner)) state.boardOwner = '';
    ownerSelect.innerHTML = '<option value="">Everyone</option>' +
      view.owners.map((o) => `<option value="${esc(o)}" ${o === state.boardOwner ? 'selected' : ''}>${esc(o)}</option>`).join('');
  }

  // board/board.json from an earlier version, rows that can't be on the Board, and ledger entries with no card.
  function drawNotices() {
    const parts = [];
    if (view.oldBoardFile) {
      parts.push(`<p class="board-note" id="old-board"><code>${esc(view.oldBoardFile)}</code> is from an earlier version of the app and is not used.</p>`);
    }
    const n = view.noUsableId;
    if (n) {
      parts.push(`<p class="board-note" id="no-id">${n} action item${n === 1 ? ' has' : 's have'} no usable ID, so ${n === 1 ? 'it is' : 'they are'} not on the Board. <a href="#/meetings">See Meetings</a></p>`);
    }
    const k = view.notOnBoard.length;
    if (k) {
      const groups = NOT_ON_BOARD.map(([key, reason, heading]) => {
        const entries = view.notOnBoard.filter((e) => e.reason === reason);
        if (!entries.length) return '';
        return `<div class="ledger-group" id="ledger-${key}"><h3>${esc(heading)}</h3><ul>${entries.map((e) => `<li><code>${esc(e.id)}</code> · ${esc(e.reason)} · ${esc(columnName(e.column))}${e.closed ? ` · closed ${fmtDate(e.closed)}` : ''}${e.note ? ` · ${esc(e.note)}` : ''}</li>`).join('')}</ul></div>`;
      }).join('');
      parts.push(`<details class="board-note" id="not-on-board"><summary>${k} ledger entr${k === 1 ? 'y has' : 'ies have'} no card on the Board</summary>${groups}</details>`);
    }
    document.getElementById('board-notices').innerHTML = parts.join('');
  }

  // The due line under the title. The summary's date and words stay beside mine; what the chip already says is
  // not said again.
  function dueText(c) {
    const said = saidWords(c) ? `“${esc(saidWords(c))}”` : '';
    if (c.column === 'done') return c.chip.rule === 'closed' || !c.closed ? '' : `Closed ${day(c.closed)}`;
    if (c.myDue) {
      const summary = [c.summaryDueDate ? day(c.summaryDueDate) : '', said].filter(Boolean).join(', ');
      return `Due ${day(c.myDue)} <span class="card-mine">(mine${summary ? `; summary: ${summary}` : ''})</span>`;
    }
    if (c.dueDate) return c.chip.rule === 'due' ? (said ? `Said ${said}` : '') : `Due ${day(c.dueDate)}${said ? `, said ${said}` : ''}`;
    return said ? `Said ${said}` : c.chip.rule === 'due' ? '' : 'No due date';
  }

  // "From <meeting>", linking to the card's first meeting.
  function meetingLink(c) {
    if (!c.meeting) return '';
    const label = meetingLabel(c.meeting, c.meetingDate, view.meetings, view.asOf);
    return `From <a href="#/meetings/${encodeURIComponent(c.meeting)}" title="Open the ${esc(fmtDate(c.meetingDate))} meeting">${esc(label)}</a>`;
  }

  const CIRCLE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle></svg>';
  const CHECKED = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M8 12.5l2.8 2.8L16 9.5"></path></svg>';

  // An action item opened in place: my due date, the words said in the meeting, and a note.
  function editorHtml(c) {
    const said = saidWords(c) ? `Said in the meeting: “${esc(saidWords(c))}”` : 'Nothing was said in the meeting about a due date.';
    return `
      <div class="card-edit">
        <div class="edit-field">
          <label for="card-edit-due">Due date</label>
          <input type="date" id="card-edit-due" value="${esc(editing.due)}">
          <p class="edit-hint">${said}</p>
        </div>
        <div class="edit-field">
          <label for="card-edit-note">Note</label>
          <textarea id="card-edit-note" rows="2" maxlength="2000" placeholder="Why it moved, or what closed it">${esc(editing.note)}</textarea>
        </div>
        <p class="form-error" id="card-edit-error" role="alert"></p>
        <div class="edit-actions">
          <button type="button" class="btn btn-primary" data-act="save">Save</button>
          ${c.myDue ? '<button type="button" class="btn" data-act="use-summary">Use the summary’s date</button>' : ''}
        </div>
      </div>`;
  }

  function cardHtml(c) {
    const col = columnIndex(c.column);
    const left = columns[col - 1];
    const right = columns[col + 1];
    const short = esc(shortTitle(c));
    // The round button and the others name the item: its ID and title, or the title of a card of my own.
    const name = c.own ? `“${short}”` : `${esc(c.id)}, “${short}”`;
    const open = editing?.id === c.id;
    const done = c.column === 'done';
    const round = c.suggested ? '' : done
      ? `<button type="button" class="round-btn is-done" data-act="reopen" aria-label="Reopen ${name}" title="Reopen">${CHECKED}</button>`
      : `<button type="button" class="round-btn" data-act="close" aria-label="Close ${name}" title="Close">${CIRCLE}</button>`;
    const meta = [
      `<span class="card-owner">${c.owner ? esc(c.owner) : 'No owner'}</span>`,
      dueText(c),
      meetingLink(c),
      noteMarkerHtml(c.notes),
    ].filter(Boolean).join('<span class="sep" aria-hidden="true"> · </span>');
    // A suggestion has one action, Accept.
    const actions = c.suggested
      ? `<button type="button" class="btn btn-small" data-act="accept" aria-label="Accept ${name}">Accept</button>`
      : `
        <button type="button" class="icon-btn" data-act="move" data-to="${left?.id || ''}" ${left ? '' : 'disabled'}
          title="${left ? `Move to ${esc(left.name)}` : ''}"
          aria-label="${left ? `Move ${name} to ${esc(left.name)}` : 'Already in the first column'}">←</button>
        <button type="button" class="icon-btn" data-act="move" data-to="${right?.id || ''}" ${right ? '' : 'disabled'}
          title="${right ? `Move to ${esc(right.name)}` : ''}"
          aria-label="${right ? `Move ${name} to ${esc(right.name)}` : 'Already in the last column'}">→</button>
        <button type="button" class="icon-btn edit-btn" data-act="edit" title="Edit" aria-label="Edit ${name}"${c.own ? '' : ` aria-expanded="${open}"`}>${PENCIL}</button>
        ${c.own ? `<button type="button" class="icon-btn icon-danger" data-act="delete" title="Delete" aria-label="Delete ${name}">✕</button>` : ''}`;
    return `
      <li class="card card-${c.own ? 'own' : 'item'}${done ? ' is-done' : ''}${open ? ' is-editing' : ''}" draggable="${c.suggested || open ? 'false' : 'true'}" data-id="${esc(c.id)}">
        <div class="card-top">
          ${chipHtml(c.chip)}
          ${c.own ? '<span class="card-yours">yours</span>' : `<span class="card-id">${esc(c.id)}</span>`}
        </div>
        <div class="card-main">
          ${round}
          <div class="card-body">
            <p class="card-title">${esc(c.title)}</p>
            <p class="card-meta">${meta}</p>
            ${c.note && !open ? `<p class="card-note">Note: ${esc(c.note)}</p>` : ''}
          </div>
        </div>
        ${open ? editorHtml(c) : ''}
        <div class="card-actions">${actions}</div>
      </li>`;
  }

  function emptyText(col, all) {
    if (all.length) return 'No cards for these filters';
    if (!view.cards.length && col.id === 'todo') return 'No action items yet. They come from the Action Items tables in your meeting summaries.';
    return 'No cards';
  }

  function draw() {
    drawNotices();
    showOpenCount(view);
    if (editing && !view.cards.some((c) => c.id === editing.id && !c.own && !c.suggested)) editing = null;
    const shown = view.cards.filter(isShown);
    document.getElementById('board-count').textContent = `Showing ${shown.length} of ${view.cards.length} cards`;
    // Keep each column's scroll position across redraws.
    const scrolls = Object.fromEntries([...boardEl.querySelectorAll('.column')].map((c) => [c.dataset.column, c.querySelector('.cards').scrollTop]));
    boardEl.innerHTML = columns.map((col) => {
      const all = view.cards.filter((c) => c.column === col.id);
      const cards = all.filter(isShown);
      const count = cards.length === all.length ? `${all.length}` : `${cards.length} of ${all.length}`;
      return `
        <section class="column" data-column="${col.id}" aria-labelledby="col-${col.id}">
          <h2 id="col-${col.id}">${esc(col.name)} <span class="column-count">${count}</span></h2>
          <ol class="cards">
            ${cards.map(cardHtml).join('') || `<li class="column-empty">${emptyText(col, all)}</li>`}
          </ol>
        </section>`;
    }).join('');
    boardEl.querySelectorAll('.column').forEach((c) => { c.querySelector('.cards').scrollTop = scrolls[c.dataset.column] || 0; });
    // What was typed in the open card survives a redraw.
    if (editing) {
      document.getElementById('card-edit-due').value = editing.due;
      document.getElementById('card-edit-note').value = editing.note;
    }
    fitBoard();
  }

  const resizeObserver = new ResizeObserver(() => fitBoard());
  resizeObserver.observe(boardEl);

  // The columns fill the rest of the window and scroll their own cards.
  function fitBoard() {
    boardEl.style.setProperty('--board-top', `${boardEl.getBoundingClientRect().top + window.scrollY}px`);
  }

  // Every change answers with the whole Board; on an error, what is really saved is shown again.
  async function mutate(request, { focus } = {}) {
    try {
      view = await request();
      drawOwnerOptions();
      draw();
      if (focus) focus();
      return view;
    } catch (err) {
      setStatus(err.message, true);
      try { view = await api('/api/board'); drawOwnerOptions(); draw(); } catch { /* keep the error visible */ }
      return null;
    }
  }

  // Focus goes to a button on the card after it moves: the same arrow, or the given action.
  function focusOn(id, pick) {
    return () => {
      const card = boardEl.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
      if (!card) return;
      card.scrollIntoView({ block: 'nearest' });
      pick(card)?.focus();
    };
  }

  function moveCard(id, column, beforeId = null, { focus } = {}) {
    return mutate(() => api(`/api/board/cards/${encodeURIComponent(id)}/move`, { method: 'POST', body: { column, beforeId } }), { focus });
  }

  // The first card of a column, counting cards the filters hide: Close and Reopen put a card above it.
  const topOf = (column, id) => view.cards.find((c) => c.column === column && c.id !== id)?.id ?? null;

  ownerSelect.addEventListener('change', () => { state.boardOwner = ownerSelect.value; draw(); });
  document.getElementById('show-suggested').addEventListener('change', (e) => { state.boardShowSuggested = e.target.checked; draw(); });

  // ----- an action item, opened in place -----
  function openEditor(card) {
    if (editing?.id === card.id) { closeEditor(); return; }
    // The date shown is the one that counts: mine if I set one, otherwise the summary's.
    editing = { id: card.id, due: card.myDue || card.summaryDueDate || '', note: card.note || '' };
    draw();
    document.getElementById('card-edit-due').focus();
  }

  function closeEditor() {
    const id = editing?.id;
    editing = null;
    draw();
    if (id) focusOn(id, (el) => el.querySelector('[data-act="edit"]'))();
  }

  async function saveEditor(card) {
    const due = document.getElementById('card-edit-due').value;
    const body = { note: document.getElementById('card-edit-note').value };
    // Back to the summary's date clears my change; any other new date is mine. An unchanged date is left alone.
    if (card.myDue && due === (card.summaryDueDate || '')) body.due = null;
    else if (due !== (card.myDue || card.summaryDueDate || '')) body.due = due || null;
    try {
      view = await api(`/api/board/cards/${encodeURIComponent(card.id)}`, { method: 'PUT', body });
    } catch (err) {
      document.getElementById('card-edit-error').textContent = err.message;
      return;
    }
    editing = null;
    drawOwnerOptions();
    draw();
    setStatus(`Saved “${shortTitle(card)}”.`);
    focusOn(card.id, (el) => el.querySelector('[data-act="edit"]'))();
  }

  // What is typed in the open card is kept, so a redraw (a filter, another card's move) doesn't lose it.
  boardEl.addEventListener('input', (e) => {
    if (!editing) return;
    if (e.target.id === 'card-edit-due') editing.due = e.target.value;
    if (e.target.id === 'card-edit-note') editing.note = e.target.value;
  });
  boardEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editing) { e.preventDefault(); closeEditor(); }
  });

  // ----- add / edit my own cards -----
  const dialog = document.getElementById('card-dialog');
  const form = document.getElementById('card-form');
  const formError = document.getElementById('card-error');
  let editingOwn = null;

  function openCardDialog(card) {
    editingOwn = card;
    document.getElementById('card-dialog-h').textContent = card ? 'Edit card' : 'Add card';
    document.getElementById('column-field').hidden = Boolean(card);
    const owners = [...new Set([...view.meetings.flatMap((m) => m.people || []), ...view.owners])].sort();
    document.getElementById('owner-options').innerHTML = owners.map((o) => `<option value="${esc(o)}">`).join('');
    form.meeting.innerHTML = '<option value="">None</option>' + view.meetings
      .map((m) => `<option value="${esc(m.file)}">${fmtDate(m.date)} · ${esc((m.people || []).join(', '))}</option>`).join('');
    form.title.value = card?.title || '';
    form.owner.value = card?.owner || '';
    form.meeting.value = card?.meeting || '';
    form.column.value = 'todo';
    form.due.value = card?.myDue || '';
    form.note.value = card?.note || '';
    formError.textContent = '';
    dialog.showModal();
    form.title.focus();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.title.value.trim()) { formError.textContent = 'Give the card a title.'; form.title.focus(); return; }
    const body = { due: form.due.value || null, note: form.note.value, title: form.title.value, owner: form.owner.value, meeting: form.meeting.value || null };
    if (!editingOwn) body.column = form.column.value;
    try {
      view = editingOwn
        ? await api(`/api/board/cards/${encodeURIComponent(editingOwn.id)}`, { method: 'PUT', body })
        : await api('/api/board/cards', { method: 'POST', body });
      drawOwnerOptions();
      draw();
      dialog.close();
      const hidden = !isShown(view.card) ? ' It is hidden by the filters.' : '';
      setStatus((editingOwn ? 'Saved.' : 'Card added at the top of its column.') + hidden);
      if (!editingOwn && !hidden) boardEl.querySelector(`[data-column="${view.card.column}"] .cards`).scrollTop = 0;
    } catch (err) {
      formError.textContent = err.message;
    }
  });

  document.getElementById('add-btn').addEventListener('click', () => openCardDialog(null));

  // ----- delete (my own cards only) -----
  const confirmDialog = document.getElementById('confirm-dialog');
  let deletingId = null;
  function openConfirm(card) {
    deletingId = card.id;
    document.getElementById('confirm-title').textContent = card.title;
    document.getElementById('confirm-error').textContent = '';
    confirmDialog.showModal();
    confirmDialog.querySelector('[data-close]').focus();
  }
  document.getElementById('confirm-delete').addEventListener('click', async () => {
    try {
      view = await api(`/api/board/cards/${encodeURIComponent(deletingId)}`, { method: 'DELETE' });
      drawOwnerOptions();
      draw();
      confirmDialog.close();
      setStatus('Card deleted.');
      document.getElementById('add-btn').focus();
    } catch (err) {
      document.getElementById('confirm-error').textContent = err.message;
    }
  });

  for (const d of [dialog, confirmDialog]) {
    d.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) d.close(); });
  }

  // ----- card buttons -----
  boardEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn || btn.disabled) return;
    const id = btn.closest('.card').dataset.id;
    const card = view.cards.find((c) => c.id === id);
    if (!card) return;
    const act = btn.dataset.act;
    if (act === 'move' && btn.dataset.to) {
      const goingLeft = columnIndex(btn.dataset.to) < columnIndex(card.column);
      await moveCard(id, btn.dataset.to, null, {
        focus: focusOn(id, (el) => {
          const arrows = [...el.querySelectorAll('[data-act="move"]')];
          const same = arrows[goingLeft ? 0 : 1];
          return same && !same.disabled ? same : arrows.find((b) => !b.disabled);
        }),
      });
    }
    // Close moves the card to the top of Done; Reopen moves it to the top of To do.
    if (act === 'close') {
      if (editing?.id === id) editing = null;
      if (await moveCard(id, 'done', topOf('done', id), { focus: focusOn(id, (el) => el.querySelector('[data-act="reopen"]')) })) {
        setStatus(`Closed “${shortTitle(card)}”. It is at the top of Done.`);
      }
    }
    if (act === 'reopen' && await moveCard(id, 'todo', topOf('todo', id), { focus: focusOn(id, (el) => el.querySelector('[data-act="close"]')) })) {
      setStatus(`Reopened “${shortTitle(card)}”. It is at the top of To do.`);
    }
    if (act === 'accept') {
      const accepted = await mutate(() => api(`/api/board/cards/${encodeURIComponent(id)}/accept`, { method: 'POST', body: {} }),
        { focus: focusOn(id, (el) => el.querySelector('[data-act="close"]')) });
      if (accepted) setStatus(`Accepted “${shortTitle(card)}”. It is now a card like any other.`);
    }
    // An action item opens in place; my own cards keep their dialog.
    if (act === 'edit') {
      if (card.own) openCardDialog(card);
      else openEditor(card);
    }
    if (act === 'save' && editing?.id === id) await saveEditor(card);
    if (act === 'use-summary' && editing?.id === id) {
      editing.due = card.summaryDueDate || '';
      document.getElementById('card-edit-due').value = editing.due;
      document.getElementById('card-edit-due').focus();
    }
    if (act === 'delete') openConfirm(card);
  });

  // ----- drag and drop -----
  let dragId = null;
  const marker = document.createElement('li');
  marker.className = 'drop-marker';
  marker.setAttribute('aria-hidden', 'true');

  // The visible card the drop lands in front of (null = end of the column), not counting the dragged card.
  function dropBefore(list, y) {
    const cards = [...list.querySelectorAll('.card')].filter((el) => el.dataset.id !== dragId);
    return cards.find((el) => {
      const r = el.getBoundingClientRect();
      return y < r.top + r.height / 2;
    }) || null;
  }

  boardEl.addEventListener('dragstart', (e) => {
    const card = e.target.closest?.('.card');
    if (!card || card.getAttribute('draggable') !== 'true') return;
    dragId = card.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
    boardEl.classList.add('is-dragging');
    requestAnimationFrame(() => card.classList.add('dragging'));
  });

  boardEl.addEventListener('dragover', (e) => {
    const column = e.target.closest('.column');
    if (!column || !dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const list = column.querySelector('.cards');
    const before = dropBefore(list, e.clientY);
    list.querySelector('.column-empty')?.setAttribute('hidden', '');
    if (before) list.insertBefore(marker, before);
    else list.appendChild(marker);
    boardEl.querySelectorAll('.column').forEach((c) => c.classList.toggle('drop-target', c === column));
  });

  boardEl.addEventListener('drop', (e) => {
    const column = e.target.closest('.column');
    if (!column || !dragId) return;
    e.preventDefault();
    const before = dropBefore(column.querySelector('.cards'), e.clientY);
    const id = dragId;
    cleanupDrag();
    moveCard(id, column.dataset.column, before ? before.dataset.id : null);
  });

  function cleanupDrag() {
    dragId = null;
    marker.remove();
    boardEl.classList.remove('is-dragging');
    boardEl.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
    boardEl.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
    boardEl.querySelectorAll('.column-empty[hidden]').forEach((el) => el.removeAttribute('hidden'));
  }
  boardEl.addEventListener('dragend', cleanupDrag);

  drawOwnerOptions();
  draw();
}

// ---------- Library ----------

const CNR = (v) => v && typeof v === 'object' && v.cnr;

const LIBRARY_COLUMNS = [
  { key: 'title', label: 'Title', value: (b) => (CNR(b.title) ? null : b.title.toLowerCase()) },
  { key: 'author', label: 'Author', value: (b) => (CNR(b.author) ? null : b.author.toLowerCase()) },
  { key: 'rating', label: 'My rating', value: (b) => (CNR(b.rating) ? null : b.rating) },
  { key: 'read', label: 'Read', value: (b) => (CNR(b.read) ? null : b.read) },
  { key: 'dateRead', label: 'Date read', value: (b) => (CNR(b.dateRead) ? null : b.dateRead) },
  { key: 'usedBy', label: 'Used by', value: (b) => (CNR(b.usedBy) || !b.usedBy.length ? null : b.usedBy.join(', ').toLowerCase()) },
  { key: 'notes', label: 'My notes', value: (b) => b.notes?.file || null },
];

// Empty values always sort last, whichever direction is chosen.
function sortBooks(books, { key, dir }) {
  if (!key) return books;
  const col = LIBRARY_COLUMNS.find((c) => c.key === key);
  return [...books].sort((a, b) => {
    const x = col.value(a), y = col.value(b);
    if (x === null && y === null) return a.index - b.index;
    if (x === null) return 1;
    if (y === null) return -1;
    const cmp = typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
    return (dir === 'desc' ? -cmp : cmp) || a.index - b.index;
  });
}

function ratingHtml(r) {
  if (CNR(r)) return COULD_NOT_READ;
  if (r === null) return '<span class="muted">Not rated</span>';
  return `<span class="stars" role="img" aria-label="${r} out of 5">${'★'.repeat(r)}<span class="stars-off">${'★'.repeat(5 - r)}</span></span>`;
}

async function renderLibrary() {
  let view = await api('/api/library');
  state.librarySort ??= { key: null, dir: 'asc' };

  app.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Library</h1>
        <p class="muted page-sub">My ratings and my own notes. The app shows only what is in your own notes files.</p>
      </div>
      <button type="button" class="btn btn-primary" id="add-book">Add book</button>
    </div>
    <div id="library-warnings"></div>
    <div id="library-missing"></div>
    <p class="board-status" id="library-status" role="status" aria-live="polite"></p>
    <div class="table-wrap" id="library-table">
      <table class="data library">
        <thead><tr id="library-head"></tr></thead>
        <tbody id="library-body"></tbody>
      </table>
    </div>
    <div id="library-other-checks"></div>
    <p class="muted small legend" id="library-legend">A <span class="check-legend">⚑ check</span> mark means a book's Used by and an agent's Sources line disagree. It is shown only; neither file is changed.</p>

    <dialog class="dialog" id="book-dialog" aria-labelledby="book-dialog-h">
      <form id="book-form" novalidate>
        <h2 id="book-dialog-h">Add book</h2>
        <p class="form-note" id="book-cnr" hidden></p>
        <label class="field"><span>Title</span><input name="title" maxlength="300" required></label>
        <label class="field"><span>Author</span><input name="author" maxlength="200" required></label>
        <div class="field-row">
          <fieldset class="field">
            <legend>Read</legend>
            <div class="radios">
              <label class="check"><input type="radio" name="read" value="Yes"> Yes</label>
              <label class="check"><input type="radio" name="read" value="No"> No</label>
            </div>
          </fieldset>
          <label class="field"><span>Date read</span><input type="date" name="date_read"></label>
          <label class="field"><span>My rating</span>
            <select name="rating">
              <option value="">Not rated</option>
              ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}">${n} – ${'★'.repeat(n)}</option>`).join('')}
            </select>
          </label>
        </div>
        <fieldset class="field">
          <legend>Used by</legend>
          <div class="checks" id="used-by-options"></div>
        </fieldset>
        <label class="field"><span>My notes file</span><select name="notes"></select></label>
        <p class="form-error" id="book-error" role="alert"></p>
        <div class="dialog-actions">
          <button type="button" class="btn" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    </dialog>`;

  const statusEl = document.getElementById('library-status');

  function draw() {
    const missing = view.booksFileFound === false;
    document.getElementById('library-missing').innerHTML = missing ? missingFile(view.booksFile, 'no books') : '';
    document.getElementById('library-table').hidden = missing;
    document.getElementById('library-legend').hidden = missing;
    document.getElementById('library-warnings').innerHTML = warningsPanel(view.warnings);
    document.getElementById('library-other-checks').innerHTML = view.otherChecks?.length
      ? `<div class="notice"><strong>Check:</strong> <ul>${view.otherChecks.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>` : '';
    const known = new Set(view.agents);
    const sort = state.librarySort;
    document.getElementById('library-head').innerHTML = LIBRARY_COLUMNS.map((c) => {
      const active = sort.key === c.key;
      const aria = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
      return `<th scope="col" aria-sort="${aria}"><button type="button" class="sort-btn" data-sort="${c.key}">${esc(c.label)}<span class="sort-icon" aria-hidden="true">${active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span></button></th>`;
    }).join('') + '<th scope="col"><span class="visually-hidden">Edit</span></th>';

    document.getElementById('library-body').innerHTML = sortBooks(view.books, sort).map((b) => `
      <tr>
        <td class="book-title">
          <span>${CNR(b.title) ? COULD_NOT_READ : esc(b.title)}</span>
          ${b.checks?.length ? `
            <details class="check-mark">
              <summary><span aria-hidden="true">⚑</span> check<span class="visually-hidden">: ${b.checks.length} thing${b.checks.length === 1 ? '' : 's'} to look at</span></summary>
              <ul>${b.checks.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
            </details>` : ''}
        </td>
        <td>${CNR(b.author) ? COULD_NOT_READ : esc(b.author)}</td>
        <td class="nowrap">${ratingHtml(b.rating)}</td>
        <td>${CNR(b.read) ? COULD_NOT_READ : `<span class="pill ${b.read === 'Yes' ? 'pill-yes' : 'pill-no'}">${esc(b.read)}</span>`}</td>
        <td class="nowrap">${CNR(b.dateRead) ? COULD_NOT_READ : b.dateRead ? fmtDate(b.dateRead) : '<span class="muted">—</span>'}</td>
        <td>${CNR(b.usedBy) ? COULD_NOT_READ : b.usedBy.length
          ? b.usedBy.map((u) => known.has(u)
              ? `<span class="chip-agent">${esc(u)}</span>`
              : `<span class="chip-agent chip-unknown" title="No agent with this name on the Agents page">${esc(u)} ?</span>`).join(' ')
          : '<span class="muted">—</span>'}</td>
        <td class="notes-cell">${CNR(b.notes) ? COULD_NOT_READ
          : b.notes?.missing ? `<span class="cnr" title="${esc(b.notes.missing)}">file not found</span>`
          : b.notes ? `<a href="#/library/notes/${encodeURIComponent(b.notes.file)}">${esc(b.notes.file)}</a>`
          : '<span class="muted">—</span>'}</td>
        <td class="edit-cell"><button type="button" class="icon-btn edit-btn" data-edit="${b.index}" title="Edit" aria-label="Edit ${CNR(b.title) ? 'book' : esc(b.title)}">${PENCIL}</button></td>
      </tr>`).join('');
  }

  document.getElementById('library-head').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sort]');
    if (!btn) return;
    const key = btn.dataset.sort;
    state.librarySort = state.librarySort.key === key
      ? { key, dir: state.librarySort.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' };
    draw();
    document.querySelector(`[data-sort="${key}"]`).focus();
  });

  // ----- add / edit form -----
  const dialog = document.getElementById('book-dialog');
  const form = document.getElementById('book-form');
  const formError = document.getElementById('book-error');
  let editing = null;

  function syncReadFields() {
    const unread = form.read.value === 'No';
    form.date_read.disabled = unread;
    form.rating.disabled = unread;
    if (unread) { form.date_read.value = ''; form.rating.value = ''; }
  }
  form.addEventListener('change', (e) => { if (e.target.name === 'read') syncReadFields(); });

  function openBookDialog(book) {
    editing = book;
    document.getElementById('book-dialog-h').textContent = book ? 'Edit book' : 'Add book';
    const value = (v, fallback) => (CNR(v) ? fallback : v ?? fallback);
    const unreadable = book ? ['title', 'author', 'rating', 'read', 'dateRead', 'usedBy', 'notes'].filter((k) => CNR(book[k])) : [];
    const note = document.getElementById('book-cnr');
    note.hidden = !unreadable.length;
    note.textContent = unreadable.length ? `Some fields could not be read (${unreadable.join(', ')}). They start empty here, and saving replaces them.` : '';

    form.title.value = book ? value(book.title, '') : '';
    form.author.value = book ? value(book.author, '') : '';
    const read = book ? value(book.read, '') : 'No';
    form.querySelectorAll('[name=read]').forEach((r) => { r.checked = r.value === read; });
    form.date_read.max = localToday();
    form.date_read.value = book ? value(book.dateRead, '') || '' : '';
    form.rating.value = book ? String(value(book.rating, '') ?? '') : '';
    const used = book ? value(book.usedBy, []) : [];
    // Keep any name already on the book, even one with no matching agent, so saving never drops it.
    const options = [...new Set([...view.agents, ...used])];
    document.getElementById('used-by-options').innerHTML = options.map((o) => `
      <label class="check"><input type="checkbox" name="used_by" value="${esc(o)}" ${used.includes(o) ? 'checked' : ''}> ${esc(o)}</label>`).join('');
    form.notes.innerHTML = '<option value="">None</option>' + view.notesFiles.map((f) => `<option value="library/${esc(f)}">${esc(f)}</option>`).join('');
    form.notes.value = book && book.notes && !CNR(book.notes) ? (book.notes.path || '') : '';
    syncReadFields();
    formError.textContent = '';
    dialog.showModal();
    form.title.focus();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      title: form.title.value,
      author: form.author.value,
      read: form.read.value,
      date_read: form.date_read.value || null,
      rating: form.rating.value || null,
      used_by: [...form.querySelectorAll('[name=used_by]:checked')].map((c) => c.value),
      notes: form.notes.value || null,
    };
    if (!body.title.trim() || !body.author.trim()) { formError.textContent = 'Title and author are required.'; return; }
    if (!body.read) { formError.textContent = 'Choose whether you have read it.'; return; }
    try {
      if (editing) body.original = { title: editing.title, author: editing.author };
      view = editing
        ? await api(`/api/library/books/${editing.index}`, { method: 'PUT', body })
        : await api('/api/library/books', { method: 'POST', body });
      dialog.close();
      draw();
      statusEl.textContent = editing ? 'Book saved.' : 'Book added.';
    } catch (err) {
      formError.textContent = err.message;
    }
  });

  dialog.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) dialog.close(); });
  document.getElementById('add-book').addEventListener('click', () => openBookDialog(null));
  document.getElementById('library-body').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-edit]');
    if (btn) openBookDialog(view.books.find((b) => b.index === Number(btn.dataset.edit)));
  });

  draw();
}

async function renderNotes(file) {
  const n = await api(`/api/library/notes?file=${encodeURIComponent(file)}`);
  app.innerHTML = `
    <p><a class="back" href="#/library">← Library</a></p>
    <div class="notes-head">
      <p class="muted">My notes on ${n.books.map((b) => `<strong>${esc(b.title)}</strong> (${esc(b.author)})`).join(', ')} · <code>${esc(n.path)}</code></p>
    </div>
    <article class="prose">${n.html}</article>`;
}

// ---------- People ----------

const personHref = (name) => `#/people/${encodeURIComponent(name)}`;

// A person's row, on Today and on the People page: the last meeting with me, what they owe me and I owe from
// meetings they attended, how many of my notes about them are dated since that meeting (under the counts), and the
// flags, as the core counts them. Every counted row has the same parts, so the columns line up. When nothing could be
// counted, only who they are.
function personRowHtml(p, asOf) {
  const ago = p.daysSince === 0 ? 'today' : p.daysSince === 1 ? '1 day ago' : `${p.daysSince} days ago`;
  const counted = p.owesYou !== null;
  const notes = p.notesSince ? `<p class="note-count">${plural(p.notesSince, 'note', 'notes')}${p.lastMeeting ? ' since the last meeting' : ', no meeting yet'}</p>` : '';
  return `
    <li class="today-person">
      <div class="today-person-name">
        <p class="today-title">${esc(p.name)}</p>
        ${p.role ? `<p class="today-role">${esc(p.role)}</p>` : ''}
      </div>
      ${counted ? `
        <p class="today-person-fact person-last">${p.lastMeeting ? `Last meeting ${fmtDay(p.lastMeeting.date, asOf)}, ${ago}` : 'No meeting with you yet'}</p>
        <div class="today-person-fact person-counts">
          <p>Owes you ${p.owesYou} · You owe ${p.youOwe}</p>
          ${notes}
        </div>
        <div class="today-flags">${p.flags.map((f) => `<span class="chip chip-late">${esc(f.text)}</span>`).join('')}</div>` : ''}
      <a class="today-open" href="${personHref(p.name)}" aria-label="Open ${esc(p.name)}’s page">Open</a>
    </li>`;
}

// The as-of date the counts on the People pages are worked out to.
function asOfLine(view) {
  return view.asOfIsNewestMeeting ? `as of ${fmtDate(view.asOf)}, the newest meeting` : `as of today, ${fmtDate(view.asOf)}`;
}

// What can't be counted, and why: the ledger can't be read, or people.md has no single "me".
function peopleNotices(view, cant) {
  if (view.ledgerError) return `<div class="notice notice-warn">${esc(view.ledgerError)}</div>`;
  if (view.meProblem) return `<div class="notice notice-warn">${meProblemLine(view.meProblem, cant)}</div>`;
  return '';
}

async function renderPeople() {
  const load = () => api(`/api/people${privateQuery()}`);
  let view = await load();
  // My notes about names people.md doesn't have are listed here, so the switch is here when there are any.
  const orphans = () => view.notesNotInPeople.length > 0 || Boolean(view.notesError);
  app.innerHTML = `
    <header class="page-head people-head">
      <div>
        <h1>People</h1>
        <p class="page-sub">From <code>${esc(view.file)}</code>, in its order. Meetings and open items ${esc(asOfLine(view))}.</p>
        <p class="board-status" id="people-status" role="status" aria-live="polite"></p>
      </div>
      ${view.notesNotInPeople.length ? privateSwitch() : ''}
    </header>
    <div class="today" id="people-body"></div>`;
  const body = document.getElementById('people-body');
  const setStatus = (msg, isError = false) => {
    const el = document.getElementById('people-status');
    el.textContent = msg;
    el.classList.toggle('is-error', isError);
  };

  const section = (id, heading, sub, inner) => `
    <section class="today-group" id="${id}" aria-labelledby="h-${id}">
      <div class="today-group-head">
        <h2 id="h-${id}">${heading}</h2>
        ${sub ? `<span class="today-group-sub">${sub}</span>` : ''}
      </div>
      ${inner}
    </section>`;

  // Without people.md: what it needs. The app never writes it.
  const missing = `
    <div class="notice people-missing" id="people-missing">
      <p>There is no <code>${esc(view.file)}</code> in this workspace, so there is no one to list. Add it to the workspace folder, with a table that has these four columns:</p>
      <div class="table-wrap"><table class="data people-columns"><thead><tr>${view.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead></table></div>
      <p class="muted">Relationship is one of me, report, manager, peer or other, with one row marked “me”. The app reads <code>${esc(view.file)}</code> and never writes it.</p>
    </div>`;

  const notes = notesPart({
    id: 'people-notes-not-in', heading: `Notes for names not in ${esc(view.file)}`, box: null, showPerson: true,
    empty: '',
    block: () => ({ list: view.notesNotInPeople, error: view.notesError, asOf: view.asOf, canAdd: false }),
    reload: async () => { view = await load(); draw(); },
    draw: () => draw(),
    setStatus,
  });

  function draw() {
    const you = view.you ? `
      <section class="today-group" id="people-you" aria-label="You">
        <ol class="today-rows">
          <li class="today-person is-you">
            <div class="today-person-name">
              <p class="today-title">${esc(view.you.name)}</p>
              ${view.you.role ? `<p class="today-role">${esc(view.you.role)}</p>` : ''}
            </div>
            <span class="you-label">You</span>
          </li>
        </ol>
      </section>` : '';

    const groups = view.groups.map((g) => section(`people-${g.key}`, esc(g.heading), plural(g.people.length, 'person', 'people'),
      `<ol class="today-rows">${g.people.map((p) => personRowHtml(p, view.asOf)).join('')}</ol>`));

    const n = view.notInPeople.length;
    const notIn = section('people-not-in', `Not in ${esc(view.file)}`,
      n ? `${plural(n, 'name', 'names')} on Attendees lines or as owners of action items, as written. Add them to <code>${esc(view.file)}</code> to see them here.`
        : `Every name on an Attendees line or owning an action item is in <code>${esc(view.file)}</code>.`,
      n ? `<ul class="people-not-in">${view.notInPeople.map((name) => `<li>${esc(name)}</li>`).join('')}</ul>` : '');

    body.innerHTML = [
      warningsPanel(view.warnings),
      view.fileFound ? peopleNotices(view, 'nothing is counted for anyone') : missing,
      you,
      ...groups,
      notIn,
      orphans() ? notes.html() : '',
    ].join('');
    notes.afterDraw();
  }

  notes.wire(body);
  document.getElementById('private-switch')?.addEventListener('change', async (e) => {
    state.showPrivate = e.target.checked;
    notes.reset();
    try { view = await load(); } catch (err) { setStatus(err.message, true); return; }
    draw();
  });
  draw();
}

// A name that is no one in people.md (the core says so with noPerson) shows this plain notice instead of an error.
function noPerson(err) {
  if (typeof err.data?.noPerson !== 'string') return false;
  app.innerHTML = `
    <p><a class="back" href="#/people">← People</a></p>
    <div class="notice" id="no-person">${esc(err.data.error)}</div>`;
  return true;
}

async function renderPerson(name) {
  // With "Show private notes" on, the page is read with the text of my notes about them.
  const load = () => api(`/api/people/${encodeURIComponent(name)}${privateQuery()}`);
  let view;
  try { view = await load(); } catch (err) { if (noPerson(err)) return; throw err; }
  const p = view.person;
  const sub = [p.role, p.relationship ? capitalize(p.relationship.toLowerCase()) : '', p.alsoCalled.length ? `Also called ${p.alsoCalled.join(', ')}` : '']
    .filter(Boolean).map(esc).join(' · ');
  app.innerHTML = `
    <p><a class="back" href="#/people">← People</a></p>
    <header class="page-head person-head">
      <div>
        <h1>${esc(p.name)}</h1>
        <p class="page-sub">${sub}</p>
        <div class="today-flags person-flags" id="person-flags"></div>
        <p class="board-status" id="person-status" role="status" aria-live="polite"></p>
      </div>
      ${privateSwitch()}
    </header>
    <div class="today" id="person-body"></div>`;

  const body = document.getElementById('person-body');
  const statusEl = document.getElementById('person-status');
  const setStatus = (msg, isError = false) => {
    statusEl.textContent = msg;
    statusEl.classList.toggle('is-error', isError);
  };
  // The two lists, by the key their rows are drawn with: They owe as Today's Owed to me, You owe them as I owe.
  const LISTS = [['they-owe', 'theyOwe', 'owed-to-me'], ['you-owe', 'youOwe', 'i-owe']];

  // A row I act on stays where it was, showing the item as it is now, until the page is opened again.
  const lingering = new Map();
  let drawn = {};
  const listItems = (field) => {
    const list = (view[field] || []).filter((it) => !lingering.has(it.id));
    const kept = [...lingering.entries()].filter(([, l]) => l.field === field).sort((a, b) => a[1].index - b[1].index);
    for (const [, l] of kept) list.splice(Math.min(l.index, list.length), 0, l.item);
    return list;
  };
  const itemById = (id) => lingering.get(id)?.item ?? [...(view.theyOwe || []), ...(view.youOwe || [])].find((it) => it.id === id);
  const fieldOf = (id) => lingering.get(id)?.field ?? Object.keys(drawn).find((f) => drawn[f].includes(id));

  function section(id, heading, sub, inner) {
    return `
      <section class="today-group" id="group-${id}" aria-labelledby="h-${id}">
        <div class="today-group-head">
          <h2 id="h-${id}">${heading}</h2>
          <span class="today-group-sub">${sub}</span>
        </div>
        ${inner}
      </section>`;
  }

  function bodyHtml() {
    const ctx = { asOf: view.asOf, meetings: view.meetings, editing: rows.editing, keep: false, owner: false };
    drawn = {};
    const lists = view.theyOwe === null ? peopleNotices(view, 'what is owed can’t be counted') : LISTS.map(([id, field, key]) => {
      const items = listItems(field);
      drawn[field] = items.map((it) => it.id);
      const n = view[field].length;
      const sub = field === 'theyOwe'
        ? (n ? `${plural(n, 'open item', 'open items')} where ${esc(p.name)} is the owner` : `Nothing open where ${esc(p.name)} is the owner.`)
        : (n ? `${plural(n, 'open item', 'open items')} of yours from meetings ${esc(p.name)} attended` : `Nothing of yours is open from a meeting ${esc(p.name)} attended.`);
      return section(id, field === 'theyOwe' ? 'They owe' : 'You owe them', sub,
        items.length ? `<ol class="today-rows">${items.map((it) => itemRowHtml(it, key, ctx)).join('')}</ol>` : '');
    }).join('');
    const m = view.attended.length;
    const meetings = section('meetings', 'Meetings',
      m ? `${plural(m, 'summary', 'summaries')} ${esc(p.name)} attended, newest first` : `No summary lists ${esc(p.name)} among the attendees.`,
      m ? `<ul class="person-meetings">${view.attended.map((x) => `
        <li>
          <a class="person-meeting" href="#/meetings/${encodeURIComponent(x.file)}">
            <span class="meeting-date">${fmtDate(x.date)}</span>
            <span class="person-meeting-title">${esc((x.title || '').split(' | ')[0] || x.file)}</span>
            <span class="meeting-type">${x.type ? esc(x.type) : COULD_NOT_READ}</span>
          </a>
        </li>`).join('')}</ul>` : '');
    return lists + notes.html() + meetings;
  }

  function draw() {
    document.getElementById('person-flags').innerHTML = view.person.flags.map((f) => `<span class="chip chip-late">${esc(f.text)}</span>`).join('');
    body.innerHTML = bodyHtml();
    // What was typed in the date field and in the notes survives a redraw.
    if (rows.editing) document.getElementById('today-due').value = rows.editing.due;
    notes.afterDraw();
  }

  // "Notes between meetings": my notes about them, and the box to add one.
  const notes = notesPart({
    id: 'group-notes', heading: 'Notes between meetings', box: 'person', person: p.name,
    empty: `No notes about ${esc(p.name)} yet.`,
    block: () => view.notes,
    reload: async () => { view = await load(); draw(); },
    draw: () => draw(),
    setStatus: (msg, isError = false) => setStatus(msg, isError),
  });

  // Every action answers with the person's page and the item as it is now.
  async function act(id, action, payload = {}) {
    const before = itemById(id);
    const field = fieldOf(id);
    const index = Math.max(0, drawn[field]?.indexOf(id) ?? 0);
    let res;
    try {
      res = await api(`/api/people/${encodeURIComponent(p.name)}/items/${encodeURIComponent(id)}/${action}${privateQuery()}`, { method: 'POST', body: payload });
    } catch (err) {
      if (rows.editing?.id === id) { rows.editing.error = err.message; draw(); } else setStatus(err.message, true);
      return;
    }
    view = res;
    if (res.item) lingering.set(id, { field, index, item: res.item });
    else lingering.delete(id);
    rows.editing = null;
    draw();
    refreshOpenCount();
    refreshTodayCount();
    setStatus(actionMessage(action, before, res.item, view.asOf));
    focusRow(id, action === 'close' ? 'reopen' : 'close');
  }

  const rows = { editing: null, itemById, act, draw };
  const { focusRow } = wireItemRows(body, rows);
  notes.wire(body);
  document.getElementById('private-switch').addEventListener('change', async (e) => {
    state.showPrivate = e.target.checked;
    notes.reset();
    try { view = await load(); } catch (err) { setStatus(err.message, true); return; }
    draw();
  });
  draw();
}

// ---------- Agents, and the rules learned ----------

// Two sections: the agents and the coach, read-only, and "Rules learned", the corrections log, where a correction is
// added. #/corrections, the old Corrections page, opens this page at "Rules learned". A log that can't be read is an
// error in its own section; the agents are still shown.
async function renderAgents() {
  const [data, rules] = await Promise.all([api('/api/agents'), api('/api/corrections').catch((err) => ({ error: err.message }))]);
  const field = (label, html) => `<dt>${label}</dt><dd>${html ?? COULD_NOT_READ}</dd>`;
  const agentCount = data.cards.filter((c) => c.role === 'agent').length;
  const folderNote = !data.agentsFolderFound
    ? `<div class="notice">There is no <code>${esc(data.agentsFolder)}/</code> folder in the data folder, so only the coach is shown.</div>`
    : !agentCount ? `<div class="notice">The <code>${esc(data.agentsFolder)}/</code> folder has no agent files.</div>` : '';

  app.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Agents</h1>
        <p class="muted page-sub">The coach and the agents, and the rules learned from what went wrong.</p>
      </div>
    </div>

    <section class="page-section" id="agents" aria-labelledby="agents-h">
      <div class="section-head">
        <div>
          <h2 id="agents-h">Agents and the coach</h2>
          <p class="muted">Read-only. From <code>CLAUDE.md</code> and <code>${esc(data.agentsFolder)}/</code>. “Review due” after ${data.reviewAfterDays} days.</p>
        </div>
      </div>
      ${warningsPanel(data.warnings)}
      ${folderNote}
      <div class="agent-grid">
        ${data.cards.map((c) => {
          const reviewed = c.lastReviewed
            ? `${fmtDate(c.lastReviewed)} <span class="muted">· ${c.daysSince === 0 ? 'today' : c.daysSince === 1 ? '1 day ago' : `${c.daysSince} days ago`}</span>`
            : null;
          const badge = !c.lastReviewed
            ? '<span class="badge badge-unknown">Review date unknown</span>'
            : c.reviewDue ? '<span class="badge badge-due">Review due</span>' : '<span class="badge badge-ok">Reviewed</span>';
          return `
            <article class="agent-card ${c.reviewDue ? 'is-due' : ''}">
              <header class="agent-head">
                <div>
                  <h3 class="agent-name">${c.name ? esc(c.name) : COULD_NOT_READ}</h3>
                  <p class="agent-file"><code>${esc(c.file)}</code>${c.role === 'coach' ? ' · the coach' : ''}</p>
                </div>
                ${badge}
              </header>
              <dl class="agent-fields">
                ${field('Purpose', c.purposeHtml)}
                ${field('Sources it may read', c.sourcesHtml)}
                ${field('Last reviewed', reviewed)}
                ${c.tools ? field('Tools', esc(c.tools)) : ''}
              </dl>
              ${c.rulesHtml.length ? `
                <details class="agent-rules">
                  <summary>Rules (${c.rulesHtml.length})</summary>
                  ${c.rulesCaption ? `<p class="muted rules-caption">${esc(c.rulesCaption)}</p>` : ''}
                  <ol class="rules">${c.rulesHtml.map((r) => `<li>${r}</li>`).join('')}</ol>
                </details>` : `<h4>Rules</h4>
              <p>${COULD_NOT_READ}</p>`}
            </article>`;
        }).join('')}
      </div>
    </section>

    <section class="page-section" id="rules-learned" aria-labelledby="rules-learned-h">
      ${rules.error ? `
        <div class="section-head"><div><h2 id="rules-learned-h">Rules learned</h2></div></div>
        <div class="notice notice-error"><strong>The rules learned can’t be shown.</strong> ${esc(rules.error)}</div>` : rulesLearnedHtml(rules)}
    </section>`;

  if (!rules.error) wireRulesLearned(rules);
}

function correctionDate(d) {
  if (CNR(d)) return COULD_NOT_READ;
  // Full dates are formatted like the rest of the site; partial ones ("2026-09") are shown as written.
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? fmtDate(d) : esc(d);
}

// What the Corrections page held, with its element ids: the count, the table, and the form to add a correction.
function rulesLearnedHtml(view) {
  return `
    <div class="section-head">
      <div>
        <h2 id="rules-learned-h">Rules learned</h2>
        <p class="muted">What went wrong, who caught it, what I decided, and the rule it became. Newest first.</p>
      </div>
      <button type="button" class="btn btn-primary" id="add-correction">Add entry</button>
    </div>
    <div class="total-row">
      <span class="total-num" id="corrections-total"></span>
      <span id="corrections-total-label"></span>
    </div>
    <div id="corrections-warnings"></div>
    <div id="corrections-missing"></div>
    <p class="board-status" id="corrections-status" role="status" aria-live="polite"></p>
    <div class="table-wrap" id="corrections-table">
      <table class="data corrections">
        <colgroup><col class="c-date"><col class="c-where"><col class="c-what"><col class="c-who"><col class="c-decision"><col class="c-rule"></colgroup>
        <thead><tr>
          <th scope="col">Date</th><th scope="col">Where</th><th scope="col">What happened</th>
          <th scope="col">Who caught it</th><th scope="col">My decision</th><th scope="col">The rule it became</th>
        </tr></thead>
        <tbody id="corrections-body"></tbody>
      </table>
    </div>
    ${view.note ? `<p class="muted small file-note">Note in the file: ${esc(view.note)}</p>` : ''}

    <dialog class="dialog dialog-wide" id="correction-dialog" aria-labelledby="correction-h">
      <form id="correction-form" novalidate>
        <h2 id="correction-h">Add a correction</h2>
        <div class="field-row field-row-2">
          <label class="field"><span>Date</span>
            <input name="date" maxlength="10" placeholder="YYYY-MM-DD" aria-describedby="date-hint">
            <small class="muted" id="date-hint">YYYY-MM-DD</small>
          </label>
          <label class="field"><span>Who caught it</span>
            <input name="caught_by" maxlength="200" list="caught-by-options" autocomplete="off">
            <datalist id="caught-by-options"></datalist>
          </label>
        </div>
        <label class="field"><span>Where</span><input name="where" maxlength="200" placeholder="Which video, scene or step"></label>
        <label class="field"><span>What happened</span><textarea name="what" rows="3" maxlength="1500"></textarea></label>
        <label class="field"><span>My decision</span><textarea name="decision" rows="2" maxlength="1500"></textarea></label>
        <label class="field"><span>The rule it became</span><textarea name="rule" rows="2" maxlength="500"></textarea></label>
        <p class="form-error" id="correction-error" role="alert"></p>
        <div class="dialog-actions">
          <button type="button" class="btn" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary">Add entry</button>
        </div>
      </form>
    </dialog>`;
}

function wireRulesLearned(view) {
  const cell = (v) => (CNR(v) ? COULD_NOT_READ : esc(v));

  function draw() {
    const missing = view.fileFound === false;
    document.getElementById('corrections-missing').innerHTML = missing ? missingFile(view.file, 'no corrections') : '';
    document.getElementById('corrections-table').hidden = missing;
    document.getElementById('corrections-total').textContent = view.total;
    document.getElementById('corrections-total-label').textContent = view.total === 1 ? 'correction logged' : 'corrections logged';
    document.getElementById('corrections-warnings').innerHTML = warningsPanel(view.warnings);
    const rows = [...view.entries].sort((a, b) => {
      const x = CNR(a.date) ? '' : a.date, y = CNR(b.date) ? '' : b.date;
      return y.localeCompare(x) || b.index - a.index;
    });
    document.getElementById('corrections-body').innerHTML = rows.map((e) => `
      <tr>
        <td class="nowrap">${correctionDate(e.date)}</td>
        <td>${cell(e.where)}</td>
        <td>${cell(e.what)}</td>
        <td>${cell(e.caught_by)}</td>
        <td>${cell(e.decision)}</td>
        <td class="rule">${cell(e.rule)}</td>
      </tr>`).join('');
  }

  const dialog = document.getElementById('correction-dialog');
  const form = document.getElementById('correction-form');
  const errorEl = document.getElementById('correction-error');

  document.getElementById('add-correction').addEventListener('click', () => {
    form.reset();
    form.date.value = localToday();
    const catchers = [...new Set(view.entries.map((e) => e.caught_by).filter((c) => typeof c === 'string'))].sort();
    document.getElementById('caught-by-options').innerHTML = catchers.map((c) => `<option value="${esc(c)}">`).join('');
    errorEl.textContent = '';
    dialog.showModal();
    form.where.focus();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(['date', 'where', 'what', 'caught_by', 'decision', 'rule'].map((f) => [f, form[f].value]));
    const missing = Object.entries(body).find(([, v]) => !v.trim());
    if (missing) { errorEl.textContent = 'Fill in every field.'; form[missing[0]].focus(); return; }
    try {
      view = await api('/api/corrections', { method: 'POST', body });
      dialog.close();
      draw();
      document.getElementById('corrections-status').textContent = 'Entry added.';
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
  dialog.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) dialog.close(); });

  draw();
}

// ---------- Help ----------

// help.md, drawn by the core as a summary is. It reads nothing from the workspace and writes nothing.
async function renderHelp() {
  const help = await api('/api/help');
  app.innerHTML = `<article class="prose help" id="help-article">${help.html}</article>`;
}

// ---------- router ----------

const pages = {
  today: renderToday,
  meetings: (arg, params) => (arg ? renderMeeting(arg) : renderMeetings(params)),
  board: renderBoard,
  people: (arg) => (arg ? renderPerson(arg) : renderPeople()),
  agents: renderAgents,
  library: (arg) => (arg?.startsWith('notes/') ? renderNotes(arg.slice(6)) : renderLibrary()),
  help: renderHelp,
};

// Old addresses that now open a section of another page: the Corrections page is "Rules learned" on Agents.
const MOVED = { corrections: ['agents', 'rules-learned'] };

// "#/page/arg?key=value": the app opens on Today. A summary's or a person's name in arg is encoded, so a "?" is never
// part of it.
async function route() {
  const [hashPath, query = ''] = location.hash.split('?');
  const [, asked = 'today', ...rest] = hashPath.split('/');
  const [page, section] = MOVED[asked] || [asked, null];
  const name = pages[page] ? page : 'today';
  const arg = rest.length ? decodeURIComponent(rest.join('/')) : null;
  const params = Object.fromEntries(query.split('&').filter(Boolean).map((p) => {
    const at = p.indexOf('=');
    return [p.slice(0, at < 0 ? p.length : at), at < 0 ? '' : decodeURIComponent(p.slice(at + 1).replace(/\+/g, ' '))];
  }));
  document.querySelectorAll('.site-nav a, .sidebar-foot a[data-page]').forEach((a) => {
    if (a.dataset.page === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.body.dataset.page = name;
  // The Board and Today show their own counts as they draw; elsewhere each is read again on each visit.
  if (name !== 'board') refreshOpenCount();
  if (name !== 'today') refreshTodayCount();
  app.innerHTML = '<p class="muted loading">Loading…</p>';
  try {
    await pages[name](arg, params);
  } catch (err) {
    showError(err);
  }
  const target = section && document.getElementById(section);
  if (target) target.scrollIntoView({ block: 'start' });
  else window.scrollTo(0, 0);
}

// The Board's open count in the sidebar: cards not in Done, leaving out suggestions not yet accepted (the core counts).
function showOpenCount(view) {
  const el = document.getElementById('board-open-count');
  el.hidden = typeof view?.openCount !== 'number';
  el.textContent = el.hidden ? '' : `${view.openCount} open`;
}
function refreshOpenCount() {
  api('/api/board').then(showOpenCount, () => showOpenCount(null));
}

// Today's count in the sidebar: the items in I owe, Owed to me (or Open items) and Needs your confirmation, as the core
// counts them. Hidden at zero and when Today can't list anything.
function showTodayCount(view) {
  const el = document.getElementById('today-count');
  const n = view?.status === 'ok' ? view.counts.total : 0;
  el.hidden = !n;
  el.textContent = n ? String(n) : '';
}
function refreshTodayCount() {
  api('/api/today').then(showTodayCount, () => showTodayCount(null));
}

// The app's name on two lines, as the sidebar shows it: "Chief of Staff" over "for Managers". A name with no
// " for " stays on one line.
function splitBrand() {
  const brand = document.querySelector('.sidebar .brand-name');
  const m = brand?.textContent.match(/^(.+?)\s+(for\s.+)$/);
  if (m) brand.innerHTML = `<span class="brand-line">${esc(m[1])}</span><span class="brand-sub">${esc(m[2])}</span>`;
}

async function start() {
  splitBrand();
  try {
    state.config = await api('/api/config');
    document.getElementById('demo-badge').hidden = !state.config.demo;
  } catch { /* the page still works without the badge */ }
  window.addEventListener('hashchange', route);
  route();
}

start();

// Runs the pages' own script (public/app.js) against a running test server, with a small stand-in for the
// browser's document. It is enough for checks on what a page shows and on its filters: each element is
// found by id, its innerHTML is a string, and a filter change calls the page's own listener. Layout, styles
// and dragging are not covered here; tools/check-app.mjs checks those in the real app window.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { SITE_DIR } from './site.js';

const SCRIPT = fs.readFileSync(path.join(SITE_DIR, 'public', 'app.js'), 'utf8');

function element(id) {
  const listeners = {};
  return {
    id,
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    hidden: false,
    dataset: {},
    style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    offsetHeight: 0,
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
    // Attributes the script sets after drawing (aria-expanded, say) are kept, so a test can read them.
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    removeAttribute(name) { delete this.attributes[name]; },
    focus() {},
    // A dialog opens and closes; scrolling to an element is noted, so a test can see where the page was taken.
    showModal() { this.open = true; },
    close() { this.open = false; },
    scrollIntoView() { this.scrolledTo = true; },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    // `target` is the event's target when given (a click on something inside this element); the other props are set on it,
    // and on the event too, so a key press can say which key.
    async fire(type, { target, ...props } = {}) {
      Object.assign(this, props);
      for (const fn of listeners[type] || []) await fn({ ...props, type, target: target ?? this, currentTarget: this, preventDefault() {} });
    },
  };
}

// The page's clock: noon on the test server's "today", so the page's own date (a form's default and latest date, the
// greeting) is the same on every run. A Date given a time is untouched.
function fixedDate(today) {
  const [y, m, d] = today.split('-').map(Number);
  const now = new Date(y, m - 1, d, 12).getTime();
  return class extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  };
}

// Opens `hash` (e.g. "#/meetings") and resolves once the page has drawn. `config` is what /api/config would have said;
// { actions: true } draws the page as the app does, with its Claude Code buttons.
export async function openPage(site, hash, { config = { demo: true } } = {}) {
  const elements = new Map();
  const byId = (id) => {
    if (!elements.has(id)) elements.set(id, element(id));
    return elements.get(id);
  };
  const document = {
    getElementById: byId,
    querySelector: (sel) => byId(`query:${sel}`),
    querySelectorAll: () => [],
    // An element made by the script but not yet placed; it has no id, so it is not found by one.
    createElement: (tag) => element(`new:${tag}`),
    documentElement: element('html'),
    body: element('body'),
  };
  const context = vm.createContext({
    document,
    location: { hash },
    fetch: (p, opts) => fetch(new URL(p, site.base + '/'), opts),
    ResizeObserver: class { observe() {} disconnect() {} },
    Date: fixedDate(site.today),
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    console,
    URL,
    CSS: { escape: (s) => String(s) },
    setTimeout,
    clearTimeout,
  });
  context.window = context;
  context.scrollY = 0;
  context.addEventListener = () => {};
  context.scrollTo = () => {};
  // The script ends by calling start(), which routes without waiting; route() is awaited here instead.
  vm.runInContext(SCRIPT.replace(/\nstart\(\);\s*$/, '\n'), context, { filename: 'app.js' });
  await vm.runInContext(`state.config = ${JSON.stringify(config)}; route()`, context);

  const page = {
    el: byId,
    // Opens another address in the same page, as following a link does; what the page keeps in its state stays. The
    // elements the last page drew are dropped, with their listeners, as a page drawn anew replaces them.
    async go(to) {
      for (const id of elements.keys()) if (id !== 'app') elements.delete(id);
      context.location.hash = to;
      await vm.runInContext('route()', context);
    },
    // document.body, where the router marks the page it opened (body.dataset.page).
    body: document.body,
    // Everything drawn so far: the page, plus whatever was drawn into its elements afterwards.
    html: () => [byId('app').innerHTML, ...[...elements.values()].filter((e) => e.id !== 'app').map((e) => e.innerHTML)].join('\n'),
    // The option values of a <select>, whether it was drawn with the page, drawn into one of its parts, or filled in
    // afterwards.
    options(id) {
      const own = byId(id).innerHTML;
      const source = own || (page.html().match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`)) || [])[1] || '';
      return [...source.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
    },
    // Chooses `value` in a select (or ticks a checkbox) and lets the page react, as a change event does.
    async choose(id, value) {
      const el = byId(id);
      await el.fire('change', typeof value === 'boolean' ? { checked: value } : { value });
    },
    // The table rows in an element's HTML, one string per <tr>.
    rows: (id) => byId(id).innerHTML.split(/<tr\b/).slice(1),
    // The Board's cards as drawn, one string per card, and the one with this ID (undefined if not drawn).
    cards: () => byId('board').innerHTML.split(/<li class="card\b/).slice(1),
    cardHtml: (id) => byId('board').innerHTML.split(/<li class="card\b/).slice(1).find((c) => c.includes(`data-id="${id}"`)),
    // Clicks the button marked data-act="<act>" on the card with this ID, as drawn, and waits for the page to react.
    async clickCard(id, act) {
      const html = page.cardHtml(id);
      if (!html) throw new Error(`card ${id} is not drawn`);
      const tag = html.match(new RegExp(`<button\\b[^>]*data-act="${act}"[^>]*>`));
      if (!tag) throw new Error(`card ${id} has no ${act} button`);
      const dataset = Object.fromEntries([...tag[0].matchAll(/data-([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
      const card = { dataset: { id } };
      const button = { dataset, disabled: /\sdisabled\b/.test(tag[0]), closest: (sel) => (sel === '.card' ? card : sel.startsWith('button') ? button : null) };
      await byId('board').fire('click', { target: button });
    },
  };
  return page;
}

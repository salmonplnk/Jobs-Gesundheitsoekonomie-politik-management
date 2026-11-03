const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.join(__dirname, '..');
const C = require('../js/job-core');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
const vacancy = { id: 'fixture', title: 'Projektleitung Gesundheitsökonomie', organization: 'Testorganisation', url: 'https://example.org/jobs/1', description: 'Projektmanagement und Datenanalyse im Gesundheitswesen.', location: 'Bern', pensum: '80–100%' };

async function setup({ account = null, state, cloudRead, rpc, fetcher, feedData, alerts: alertRows, alertError, profile, beforeScripts } = {}) {
  const errors = [], console = new VirtualConsole(); console.on('jsdomError', err => { errors.push(err.message); });
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'https://workspace.test', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console });
  const w = dom.window; w.structuredClone = structuredClone; w.TextEncoder = TextEncoder; w.AbortController = AbortController;
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
  w.confirm = () => true;
  const saved = state || C.emptyState();
  w.localStorage.setItem('healthjobs.workspace.v1.' + (account || 'guest'), JSON.stringify({ data: saved, revision: 0, dirty: false }));
  if (profile) { w.localStorage.setItem('userProfile', JSON.stringify(profile)); if (account) { w.localStorage.setItem('healthjobs:active-owner', account); } }
  const callbacks = [], remote = new Map(), calls = []; let user = account ? { id: account, email: account + '@example.org' } : null;
  const alertTable = (alertRows || []).map(row => ({ ...row }));
  const session = () => user ? { user, access_token: 'fixture-token' } : null;
  function alertResult(ctx) {
    if (alertError) return { data: null, error: alertError };
    if (ctx.op === 'insert') {
      if (alertTable.length >= 10) return { data: null, error: { message: 'ALERT_LIMIT_REACHED', code: '22023' } };
      if (ctx.payload.filters && Object.keys(ctx.payload.filters).some(k => !['q', 'focus', 'category', 'canton', 'seniority', 'employer', 'min_workload'].includes(k))) return { data: null, error: { message: 'INVALID_ALERT_FILTERS', details: 'x' } };
      const row = { id: 'alert-' + (alertTable.length + 1), active: true, last_sent_at: null, created_at: new Date().toISOString(), ...ctx.payload }; alertTable.push(row); return { data: row, error: null };
    }
    const target = alertTable.find(row => row.id === ctx.eq.id);
    if (ctx.op === 'update') { Object.assign(target, ctx.payload); return { data: target, error: null }; }
    if (ctx.op === 'delete') { alertTable.splice(alertTable.indexOf(target), 1); return { data: null, error: null }; }
    return { data: alertTable.map(row => ({ ...row })), error: null };
  }
  const client = {
    auth: { onAuthStateChange(fn) { callbacks.push(fn); queueMicrotask(() => fn('INITIAL_SESSION', session())); return { data: { subscription: { unsubscribe() {} } } }; }, getSession: async () => ({ data: { session: session() }, error: null }), signOut: async () => { user = null; callbacks.forEach(fn => fn('SIGNED_OUT', null)); return { error: null }; } },
    from(table) {
      const ctx = { table, op: 'select', eq: {} };
      const query = { select() { return this; }, eq(k, v) { ctx.eq[k] = v; return this; }, order() { return this; }, limit() { return this; }, maybeSingle() { return this; }, single() { ctx.single = true; return this; },
        insert(payload) { ctx.op = 'insert'; ctx.payload = payload; return this; }, update(payload) { ctx.op = 'update'; ctx.payload = payload; return this; }, upsert() { return this; }, delete() { ctx.op = 'delete'; return this; },
        then(yes, no) {
          calls.push(ctx);
          const result = table === 'job_workspaces' ? (cloudRead ? cloudRead() : { data: remote.get(user?.id) || null, error: null }) : table === 'job_alerts' ? alertResult(ctx) : { data: table === 'profiles' ? null : [], error: null };
          return Promise.resolve(result).then(yes, no);
        } };
      return query;
    },
    rpc: async (name, args) => {
      calls.push({ rpc: name, args });
      if (rpc) return rpc(name, args);
      if (name === 'unsubscribe_job_alert') { const row = alertTable.find(r => r.unsubscribe_token === args.token); if (row) row.active = false; return { data: row ? { unsubscribed: true, name: row.name } : { unsubscribed: false }, error: null }; }
      if (name !== 'save_job_workspace') return { data: true, error: null };
      const row = remote.get(user?.id); const revision = row?.revision || 0;
      if (args.expected_revision !== revision) return { data: null, error: { message: 'WORKSPACE_CONFLICT' } };
      const next = { data: args.payload, revision: revision + 1, updated_at: new Date().toISOString() }; remote.set(user.id, next); return { data: next, error: null };
    }
  };
  w.supabase = { createClient: () => client };
  w.fetch = (url, options) => {
    if (String(url).includes('/job-feed-data/data/job-feed/index.json')) return Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify(feedData || { version: 1, generated_at: new Date().toISOString(), run: {}, jobs: [], sources: [] }) });
    return fetcher ? fetcher(url, options) : Promise.reject(new Error('Unexpected network request'));
  };
  if (beforeScripts) beforeScripts(w);
  const files = ['auth.js', 'app.js', 'map-geography.js', 'map.js', 'profile.js', 'job-core.js', 'job-relevance.js', 'job-facts.js', 'feed.js', 'workspace.js', 'alerts.js', 'letters.js', 'matching.js', 'community.js'];
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), dom.getInternalVMContext(), { filename: file });
  await tick(); await tick(); await tick();
  return { dom, w, errors, client, remote, calls, alertTable, emitAccount(next) { user = next ? { id: next, email: next + '@example.org' } : null; callbacks.forEach(fn => fn(user ? 'SIGNED_IN' : 'SIGNED_OUT', session())); }, route(view, sub = '', param = '') { w.dispatchEvent(new w.CustomEvent('site:route', { detail: { view, sub, param, hash: '' } })); }, click(selector) { const el = w.document.querySelector(selector); assert.ok(el, selector); if (typeof el.click === 'function') el.click(); else el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); }, submit(selector, values) { const form = w.document.querySelector(selector); assert.ok(form, selector); for (const [name, value] of Object.entries(values)) form.elements.namedItem(name).value = value; form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); }, change(selector, value) { const el = w.document.querySelector(selector); assert.ok(el, selector); el.value = value; el.dispatchEvent(new w.Event('change', { bubbles: true })); } };
}

test('full script stack supports manual capture, filters, application notes, saved search and reload data', async t => {
  const x = await setup(); t.after(() => x.dom.window.close()); const { w } = x;
  x.click('[data-action=manual]');
  x.submit('[data-form=manual]', { url: vacancy.url, title: vacancy.title, organization: vacancy.organization, description: vacancy.description, pensum: vacancy.pensum, location: vacancy.location });
  assert.equal(w.document.querySelectorAll('#jwJobList .jw-card').length, 1);
  const jobId = w.document.querySelector('[data-action=detail]').dataset.id;
  assert.equal(w.HealthJobs.getApplication(jobId).stage, 'interested', 'manually captured jobs are saved');
  assert.equal(w.HealthJobs.isSaved(jobId), true);
  x.click(`[data-action=application][data-id="${jobId}"]`);
  x.submit('[data-form=application]', { stage: 'applied', notes: 'Unterlagen eingereicht', next_step: 'Nachfragen' });
  assert.equal(w.HealthJobs.getApplication(jobId).notes, 'Unterlagen eingereicht');
  x.click('[data-tab=searches]'); x.click('[data-action=save-search]'); x.submit('[data-form=save-search]', { name: 'HTA Bern' });
  assert.match(w.document.getElementById('jwContent').textContent, /HTA Bern/);
  const stored = JSON.parse(w.localStorage.getItem('healthjobs.workspace.v1.guest')).data;
  assert.equal(stored.applications[jobId].stage, 'applied'); assert.equal(stored.searchProfiles.length, 1);
  assert.deepEqual(x.errors, []);
});

test('applications board moves cards by select, arrow buttons and drag and drop and persists the stage', async t => {
  const state = C.emptyState(); C.ingest(state, [{ ...vacancy, deadline: '2020-01-01' }, { ...vacancy, id: 'second', url: 'https://example.org/jobs/2', title: 'Data Analyst' }]);
  state.applications.fixture = { stage: 'interested', next_step: 'CV anpassen', next_date: '2020-02-01' }; state.applications.second = { stage: 'preparing' };
  const x = await setup({ state }); t.after(() => x.dom.window.close()); const { w } = x;
  x.click('[data-tab=applications]');
  assert.equal(w.document.querySelectorAll('.jw-column').length, Object.keys(C.stages).length);
  const card = () => w.document.querySelector('[data-drag-id="fixture"]');
  assert.equal(card().closest('.jw-column').dataset.stage, 'interested');
  assert.match(card().textContent, /CV anpassen/); assert.match(card().textContent, /überfällig/);
  assert.ok(card().querySelector('.chip-danger'), 'overdue deadline uses the danger chip');
  assert.ok(card().querySelector('[data-action=move-prev]').disabled);
  w.document.querySelector('[data-stage-select="fixture"]').focus();
  x.change('[data-stage-select="fixture"]', 'applied');
  assert.equal(w.HealthJobs.getApplication('fixture').stage, 'applied');
  assert.ok(w.HealthJobs.getApplication('fixture').applied_at, 'moving to "Beworben" records the date');
  assert.equal(card().closest('.jw-column').dataset.stage, 'applied');
  assert.equal(w.document.activeElement, w.document.querySelector('[data-stage-select="fixture"]'), 'focus follows the moved card');
  x.click('[data-action=move-next][data-id="fixture"]');
  assert.equal(w.HealthJobs.getApplication('fixture').stage, 'interview');
  x.click('[data-action=move-prev][data-id="fixture"]');
  assert.equal(w.HealthJobs.getApplication('fixture').stage, 'applied');
  const fire = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true, cancelable: true }));
  fire(w.document.querySelector('[data-drag-id="second"]'), 'dragstart');
  const offer = w.document.querySelector('.jw-column[data-stage="offer"] .jw-column-body');
  fire(offer, 'dragover'); assert.ok(offer.closest('.jw-column').classList.contains('is-over'));
  fire(offer, 'drop');
  assert.equal(w.HealthJobs.getApplication('second').stage, 'offer');
  assert.match(w.document.getElementById('jwNotice').textContent, /Angebot/);
  const stored = JSON.parse(w.localStorage.getItem('healthjobs.workspace.v1.guest'));
  assert.equal(stored.data.applications.second.stage, 'offer'); assert.equal(stored.dirty, true);
  assert.deepEqual(x.errors, []);
});

test('filters stay hidden without jobs and progressive filters count active extras', async t => {
  const empty = await setup(); t.after(() => empty.dom.window.close());
  assert.equal(empty.w.document.querySelectorAll('#jobWorkspace [data-filter]').length, 0);
  const start = empty.w.document.querySelector('.jw-start'); assert.ok(start);
  assert.ok(start.querySelector('a[href="#stellen"]')); assert.ok(start.querySelector('[data-action=search-dialog]')); assert.ok(start.querySelector('[data-action=manual]'));
  assert.equal(empty.w.document.querySelector('.jw-stats'), null, 'no zero statistics');
  const state = C.emptyState(); C.ingest(state, [vacancy]); state.applications.fixture = { stage: 'interested' };
  const x = await setup({ state }); t.after(() => x.dom.window.close()); const { w } = x;
  assert.ok(w.document.querySelector('[data-filter=q]')); assert.ok(w.document.querySelector('[data-filter=sort]'));
  assert.equal(w.document.getElementById('jwMoreFilters').hidden, true);
  x.click('[data-action=more-filters]'); assert.equal(w.document.getElementById('jwMoreFilters').hidden, false);
  const role = w.document.querySelector('[data-filter=role]'); role.value = C.roles[1]; role.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.match(w.document.querySelector('[data-more-label]').textContent, /1 aktiv/);
  assert.match(w.document.querySelector('.jw-stats').textContent, /1 Stelle gemerkt/);
  assert.deepEqual(x.errors, []);
});

test('feed API saves, reports and un-saves public jobs without destroying application data', async t => {
  const stamp = new Date().toISOString();
  const publicJob = C.cleanJob({ ...vacancy, id: 'bag:abc', org_id: 'bag', fetched_at: stamp });
  const x = await setup(); t.after(() => x.dom.window.close()); const { w } = x;
  const events = []; w.addEventListener('healthjobs:saved-changed', e => events.push(e.detail));
  assert.equal(w.HealthJobs.isSaved('bag:abc'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(w.HealthJobs.toggleSaved({ ...publicJob }))), { saved: true, jobId: 'bag:abc' });
  assert.equal(w.HealthJobs.isSaved('bag:abc'), true); assert.equal(w.HealthJobs.getApplication('bag:abc').stage, 'interested');
  assert.deepEqual(JSON.parse(JSON.stringify(events.at(-1))), { jobId: 'bag:abc', saved: true });
  assert.equal(w.document.querySelector('#jwDialog[open]'), null, 'saving from the feed stays quiet');
  assert.equal(w.HealthJobs.toggleSaved({ ...publicJob }).saved, false);
  assert.equal(w.HealthJobs.getJob('bag:abc'), undefined, 'a plain feed bookmark leaves no trace');
  assert.deepEqual(JSON.parse(JSON.stringify(events.at(-1))), { jobId: 'bag:abc', saved: false });
  w.HealthJobs.toggleSaved({ ...publicJob });
  w.HealthJobs.patchApplication('bag:abc', { notes: 'Telefon mit HR' });
  const blocked = w.HealthJobs.toggleSaved({ ...publicJob });
  assert.equal(blocked.saved, true); assert.ok(blocked.blocked); assert.match(blocked.message, /Bewerbungen/);
  assert.equal(w.HealthJobs.getApplication('bag:abc').notes, 'Telefon mit HR');
  assert.throws(() => w.HealthJobs.toggleSaved({ ...publicJob, id: 'nope:1', org_id: 'nope', url: 'https://example.org/x' }), /Quelle/);
  assert.deepEqual(x.errors, []);
});

test('profile match is null without a profile and deterministic with one; profile saves notify the feed', async t => {
  const job = C.cleanJob({ ...vacancy, id: 'bag:abc', org_id: 'bag', seniority: 'senior', languages: 'DE' });
  const none = await setup(); t.after(() => none.dom.window.close());
  assert.equal(none.w.HealthJobs.getProfileMatch(job), null);
  const x = await setup({ profile: { desired_regions: ['BE'], workload_min: 60, workload_max: 100, experience: '5-10', keywords: 'Gesundheitsökonomie', languages: { de: 'muttersprachlich' }, updated_at: '2026-10-01T00:00:00Z' } });
  t.after(() => x.dom.window.close());
  const match = x.w.HealthJobs.getProfileMatch(job);
  assert.equal(match.score, 100); assert.equal(match.label, 'Sehr gute Passung');
  assert.ok(match.reasons.some(r => /Wunschregion \(BE\)/.test(r)));
  assert.deepEqual(x.w.HealthJobs.getProfileMatch(job), match);
  const zurich = x.w.HealthJobs.getProfileMatch({ ...job, id: 'bag:zh', location: 'Zürich' });
  assert.ok(zurich.score < match.score); assert.ok(zurich.reasons.some(r => /ausserhalb/.test(r)));
  let notified = 0; x.w.addEventListener('healthjobs:profile-changed', () => notified++);
  await x.w.saveProfile({ desired_regions: ['ZH'] });
  assert.equal(notified, 1);
  assert.ok(x.w.HealthJobs.getProfileMatch({ ...job, id: 'bag:zh', location: 'Zürich' }).reasons.some(r => /Wunschregion \(ZH\)/.test(r)));
  assert.deepEqual(x.errors, []);
});

test('onboarding reflects real progress and can be dismissed for good', async t => {
  const x = await setup(); t.after(() => x.dom.window.close()); const { w } = x;
  const panel = () => w.document.querySelector('.jw-onboarding');
  assert.ok(panel()); assert.equal(panel().querySelectorAll('.jw-step').length, 3); assert.match(panel().textContent, /0 von 3/);
  assert.ok(panel().querySelector('[data-action=onboarding-login]'), 'CV step asks for login first');
  await w.saveProfile({ desired_regions: ['BE'] });
  assert.match(panel().textContent, /1 von 3/); assert.ok(panel().querySelector('.jw-step.is-done'));
  x.click('[data-action=onboarding-dismiss]');
  assert.equal(panel(), null); assert.equal(w.localStorage.getItem('healthjobs.onboarding.v1'), 'dismissed');
  w.HealthJobs.render(); assert.equal(panel(), null);
});

test('job alerts: signed-out explanation, create, pause, edit, delete and limit errors', async t => {
  const guest = await setup(); t.after(() => guest.dom.window.close());
  guest.route('meine-suche', 'jobalarme');
  assert.equal(guest.w.document.querySelector('[data-tab=alerts]').getAttribute('aria-selected'), 'true');
  assert.ok(guest.w.document.querySelector('#jwAlerts [data-alert-action=login]'));
  guest.w.HealthJobs.openAlertDialog({ q: 'HTA' });
  assert.match(guest.w.document.querySelector('#jwAlertDialog').textContent, /Melde dich an/);

  const x = await setup({ account: 'user-a', beforeScripts: w => { w.location.hash = ''; } }); t.after(() => x.dom.window.close()); const { w } = x;
  await tick(); await tick();
  x.click('[data-tab=alerts]');
  assert.match(w.document.getElementById('jwAlerts').textContent, /Noch kein Jobalarm/);
  w.HealthJobs.openAlertDialog({ q: 'Tarife', canton: 'BE', seniority: 'Senior', focus: 'Gesundheitsökonomie / HTA', employer: 'bag', category: 'bund', bogus: 'x' });
  const form = w.document.querySelector('[data-alert-form]');
  assert.equal(form.elements.namedItem('q').value, 'Tarife'); assert.equal(form.elements.namedItem('canton').value, 'BE');
  assert.equal(form.elements.namedItem('seniority').value, 'senior'); assert.equal(form.elements.namedItem('employer').value, 'bag');
  form.elements.namedItem('min_workload').value = '60'; form.querySelector('[name=frequency][value=daily]').checked = true;
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await tick(); await tick();
  assert.equal(x.alertTable.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(x.alertTable[0].filters)), { q: 'Tarife', focus: 'Gesundheitsökonomie / HTA', category: 'bund', canton: 'BE', seniority: 'senior', employer: 'bag', min_workload: 60 });
  assert.equal(x.alertTable[0].frequency, 'daily'); assert.ok(x.alertTable[0].name, 'an empty name gets a readable suggestion');
  assert.equal(w.document.querySelector('#jwAlertDialog').hasAttribute('open'), false);
  const list = () => w.document.getElementById('jwAlerts');
  assert.match(list().textContent, /Bern/); assert.match(list().textContent, /ab 60 %/); assert.match(list().textContent, /Täglich/);
  assert.match(w.document.querySelector('#jwTab-alerts .jw-tab-count').textContent, /1/);
  x.click('[data-alert-action=toggle]'); await tick(); await tick();
  assert.equal(x.alertTable[0].active, false); assert.equal(list().querySelector('[role=switch]').getAttribute('aria-checked'), 'false');
  x.click('[data-alert-action=edit]');
  const edit = w.document.querySelector('[data-alert-form]'); edit.elements.namedItem('name').value = 'Mein Alarm';
  edit.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await tick(); await tick();
  assert.equal(x.alertTable[0].name, 'Mein Alarm'); assert.equal(x.alertTable.length, 1);
  x.click('[data-alert-action=delete]'); await tick(); await tick();
  assert.equal(x.alertTable.length, 0); assert.match(list().textContent, /Noch kein Jobalarm/);
  for (let i = 0; i < 10; i++) x.alertTable.push({ id: 'full-' + i, name: 'A' + i, filters: {}, frequency: 'weekly', active: true });
  await w.HealthJobAlerts.reload();
  assert.ok(list().querySelector('[data-alert-action=new]').disabled);
  assert.deepEqual(x.errors, []);
});

test('job alert backend errors are explained honestly', async t => {
  const x = await setup({ account: 'user-a', alertError: { code: 'PGRST205', message: "Could not find the table 'public.job_alerts' in the schema cache" } }); t.after(() => x.dom.window.close());
  await tick(); await tick();
  x.click('[data-tab=alerts]');
  assert.match(x.w.document.getElementById('jwAlerts').textContent, /noch nicht eingerichtet/);
  assert.deepEqual(x.errors, []);
});

test('unsubscribe link works without login and replaces the route', async t => {
  const replaced = [];
  const x = await setup({ alerts: [{ id: 'a1', name: 'HTA Bern', filters: {}, frequency: 'weekly', active: true, unsubscribe_token: '11111111-2222-3333-4444-555555555555' }], beforeScripts: w => { w.SiteRouter = { current: () => ({ view: 'meine-suche', sub: 'abmelden' }), replace: hash => replaced.push(hash) }; } });
  t.after(() => x.dom.window.close());
  x.route('meine-suche', 'abmelden', '11111111-2222-3333-4444-555555555555'); await tick(); await tick();
  assert.equal(x.alertTable[0].active, false);
  assert.match(x.w.document.getElementById('jwUnsub').textContent, /Du bist abgemeldet/);
  assert.match(x.w.document.getElementById('jwUnsub').textContent, /HTA Bern/);
  assert.deepEqual(replaced, ['#jobalarme']);
  x.route('meine-suche', 'abmelden', '99999999-2222-3333-4444-555555555555'); await tick(); await tick();
  assert.match(x.w.document.getElementById('jwUnsub').textContent, /nicht gefunden/);
  assert.deepEqual(x.errors, []);
});

test('letter drafts keep independent versions and cannot cross account switches', async t => {
  const state = C.emptyState(); C.ingest(state, [vacancy]);
  const x = await setup({ state }); t.after(() => x.dom.window.close());
  await x.w.openJobLetter('fixture');
  const editor = x.w.document.querySelector('#jlEditor'); assert.ok(editor);
  editor.value = 'Sehr geehrte Damen und Herren\nMeine erste Bewerbung.'; editor.dispatchEvent(new x.w.Event('input', { bubbles: true }));
  x.click('.jl-dialog [data-action=save]'); await tick();
  editor.value = 'Zweite Version'; editor.dispatchEvent(new x.w.Event('input', { bubbles: true }));
  x.click('.jl-dialog [data-action=save]'); await tick();
  assert.equal(x.w.HealthJobs.getDrafts('fixture').length, 2);
  x.emitAccount('second-user'); await tick();
  assert.equal(x.w.HealthJobs.getJob('fixture'), undefined);
  assert.equal(x.w.document.querySelector('.jl-dialog[open]'), null);
  assert.deepEqual(x.errors, []);
});

test('search processes all selected organizations in batches and stores source failures', async t => {
  const requested = [];
  const x = await setup({ account: 'user-a', fetcher: async (_url, req) => {
    const ids = JSON.parse(req.body).orgs.map(o => o.id); requested.push(...ids);
    return { ok: true, json: async () => ({ jobs: ids.map(org_id => ({ ...vacancy, id: org_id, org_id, url: 'https://example.org/jobs/' + org_id })), sources: ids.map(org_id => ({ org_id, status: org_id === 'bfs' ? 'error' : 'ok', job_count: 1, checked_at: new Date().toISOString() })) }) };
  } }); t.after(() => x.dom.window.close());
  const ids = ['bag', 'bsv', 'seco', 'bfs', 'kvg', 'obsan', 'swissmedic', 'gdk', 'suva', 'snf', 'ag'];
  await x.w.HealthJobs.startSearch(ids);
  assert.deepEqual(requested, ids); assert.match(x.w.document.getElementById('jwProgress').textContent, /11 von 11/);
  assert.match(x.w.document.getElementById('jwContent').textContent, /Abruf fehlgeschlagen/);
  assert.equal(x.w.HealthJobs.getJob('bfs').status, 'open');
});

test('cancelled request cannot finish or clear a newer search', async t => {
  const first = deferred(), second = deferred(); let calls = 0;
  const x = await setup({ account: 'user-a', fetcher: () => (++calls === 1 ? first.promise : second.promise) }); t.after(() => x.dom.window.close());
  const one = x.w.HealthJobs.startSearch(['bag']); await tick(); x.w.HealthJobs.cancelSearch();
  const two = x.w.HealthJobs.startSearch(['bsv']); await tick();
  first.resolve({ ok: true, json: async () => ({ jobs: [{ ...vacancy, id: 'old' }], sources: [{ org_id: 'bag', status: 'ok' }] }) }); await one;
  assert.match(x.w.document.getElementById('jwProgress').textContent, /Suche läuft/);
  assert.equal(x.w.HealthJobs.getJob('old'), undefined);
  second.resolve({ ok: true, json: async () => ({ jobs: [{ ...vacancy, id: 'new' }], sources: [{ org_id: 'bsv', status: 'ok' }] }) }); await two;
  assert.ok(x.w.HealthJobs.getJob('new'));
});

test('stale cloud read cannot overwrite a newer successful local save', async t => {
  const oldRead = deferred(); let reads = 0;
  const state = C.emptyState(); C.ingest(state, [vacancy]);
  const x = await setup({ account: 'user-a', state, cloudRead: () => ++reads === 1 ? oldRead.promise : { data: null, error: null } }); t.after(() => x.dom.window.close());
  x.w.HealthJobs.patchApplication('fixture', { notes: 'Newest note' }); await x.w.HealthJobs.sync();
  oldRead.resolve({ data: { data: C.emptyState(), revision: 0 }, error: null }); await tick(); await tick();
  assert.equal(x.w.HealthJobs.getApplication('fixture').notes, 'Newest note');
});

test('failed cloud save retains local changes and reports pending state', async t => {
  const state = C.emptyState(); C.ingest(state, [vacancy]);
  const x = await setup({ account: 'user-a', state, rpc: async () => ({ error: { message: 'Offline' } }) }); t.after(() => x.dom.window.close());
  x.w.HealthJobs.patchApplication('fixture', { notes: 'Keep me' }); await x.w.HealthJobs.sync();
  const stored = JSON.parse(x.w.localStorage.getItem('healthjobs.workspace.v1.user-a'));
  assert.equal(stored.dirty, true); assert.equal(stored.data.applications.fixture.notes, 'Keep me');
  assert.match(x.w.document.getElementById('jwSync').textContent, /Übertragung ausstehend/);
});

test('comparison, result filters and deliberately empty criteria work together', async t => {
  const state = C.emptyState(); C.ingest(state, [vacancy, { ...vacancy, id: 'second', url: 'https://example.org/jobs/2', title: 'Data Analyst', location: 'Zürich' }]);
  const x = await setup({ state }); t.after(() => x.dom.window.close());
  const { w } = x;
  for (const checkbox of w.document.querySelectorAll('[data-compare]')) { checkbox.checked = true; checkbox.dispatchEvent(new w.Event('change', { bubbles: true })); }
  x.click('[data-tab=compare]'); assert.equal(w.document.querySelectorAll('.jw-table thead th').length, 3);
  x.click('[data-tab=jobs]'); const search = w.document.querySelector('[data-filter=q]'); search.value = 'Data'; search.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.equal(w.document.querySelectorAll('#jwJobList .jw-card').length, 1);
  x.click('[data-action=filters-reset]'); x.click('[data-action=criteria]');
  x.submit('[data-form=criteria]', {});
  const saved = JSON.parse(w.localStorage.getItem('healthjobs.workspace.v1.guest')).data;
  assert.equal(saved.criteriaConfigured, true); assert.deepEqual(saved.criteria, []);
  assert.equal(w.document.querySelectorAll('#jwJobList .jw-card').length, 2);
});

test('map opens the real employer chooser with filtered IDs and cancellation keeps saved selection', async t => {
  const state = C.emptyState(); state.selectedOrgIds = ['suva']; let requests = 0;
  const x = await setup({ state, fetcher: async () => { requests++; throw new Error('Unexpected search'); } });
  t.after(() => x.dom.window.close());
  x.click('.city-bubble[data-loc="Bern"]'); x.click('.cat-chip[data-cat="versicherungen"]');
  x.click('#mapChooseEmployers');
  const checked = () => [...x.w.document.querySelectorAll('.jw-dialog [name=org]:checked')].map(el => el.value).sort();
  assert.deepEqual(checked(), ['atupri', 'kpt', 'visana']);
  x.click('[data-action=choose-none]'); assert.deepEqual(checked(), []);
  x.click('[data-action=choose-region]'); assert.deepEqual(checked(), ['atupri', 'kpt', 'visana']);
  x.w.document.querySelector('.jw-dialog').close();
  assert.deepEqual(JSON.parse(x.w.localStorage.getItem('healthjobs.workspace.v1.guest')).data.selectedOrgIds, ['suva']);
  x.click('#mapReset'); x.click('#mapChooseEmployers'); assert.equal(checked().length, 93);
  assert.equal(requests, 0); assert.deepEqual(x.errors, []);
});

test('map handoff during an active search explains the state and focuses pause without replacing the run', async t => {
  const pending = deferred(); let requests = 0;
  const x = await setup({ account: 'user-a', fetcher: () => { requests++; return pending.promise; } });
  t.after(() => x.dom.window.close());
  const run = x.w.HealthJobs.startSearch(['bag']); await tick();
  x.click('.city-bubble[data-loc="Basel"]'); x.click('#mapChooseEmployers');
  assert.match(x.w.document.getElementById('jwNotice').textContent, /bereits eine Suche/);
  assert.equal(x.w.document.activeElement.dataset.action, 'cancel');
  assert.equal(x.w.document.querySelector('.jw-dialog[open]'), null);
  assert.equal(requests, 1);
  pending.resolve({ ok: true, json: async () => ({ jobs: [], sources: [{ org_id: 'bag', status: 'empty' }] }) }); await run;
  assert.deepEqual(x.errors, []);
});

test('public feed loads without login and imports full text into the real workspace only on request', async t => {
  const stamp = new Date().toISOString();
  const item = { ...vacancy, id: 'bag:abc', org_id: 'bag', fetched_at: stamp, first_seen: stamp, last_seen: stamp, detail_file: './bag.json' };
  const source = { org_id: 'bag', name: 'BAG', url: 'https://jobs.admin.ch/', status: 'ok', coverage: 'complete', checked_at: stamp, last_success_at: stamp, last_complete_at: stamp, job_count: 1 };
  const full = { ...item, description: 'Vollständiger Originalbeschrieb mit Aufgaben und Anforderungen.', description_truncated: false };
  const unrelated = { ...item, id: 'bag:clinical', title: 'Dipl. Pflegefachperson', description: 'Pflege auf einer medizinischen Station.' };
  const requests = [];
  const x = await setup({ feedData: { version: 1, generated_at: stamp, run: { total_sources: 97, checked_sources: 1 }, jobs: [item, unrelated], sources: [{ ...source, job_count: 2 }] }, fetcher: async url => {
    requests.push(String(url));
    assert.match(String(url), /\/job-feed-data\/data\/job-feed\/bag\.json$/);
    return { ok: true, status: 200, text: async () => JSON.stringify({ version: 1, org_id: 'bag', source, jobs: [full] }) };
  } }); t.after(() => x.dom.window.close());
  assert.equal(x.w.document.querySelectorAll('#publicJobFeed .jf-job').length, 1);
  assert.equal(x.w.HealthJobs.getJob(item.id), undefined); assert.equal(requests.length, 0);
  assert.equal(x.w.PublicJobFeed.getJobs()[0].relevance.category, 'Gesundheitsökonomie / HTA');
  await x.w.PublicJobFeed.importJob(unrelated.id);
  assert.equal(x.w.HealthJobs.getJob(unrelated.id), undefined); assert.equal(requests.length, 0);
  await x.w.PublicJobFeed.importJob(item.id);
  assert.equal(requests.length, 1);
  assert.equal(x.w.HealthJobs.getJob(item.id).description, full.description);
  assert.equal(x.w.HealthJobs.isSaved(item.id), true);
  assert.equal(x.w.HealthJobs.getOwner(), null);
  assert.deepEqual(x.errors, []);
});

test('public imports preserve personal notes and newer or manual text, and reject conflicting identities', async t => {
  const item = { ...vacancy, id: 'bag:one', org_id: 'bag', fetched_at: '2026-09-23T10:00:00Z' };
  const manual = { ...item, id: 'manual', url: 'https://example.org/jobs/manual', source_type: 'manual', description: 'Mein Originaltext' };
  const state = C.emptyState(); C.ingest(state, [item, manual]);
  state.applications[item.id] = { stage: 'applied', notes: 'Meine Notizen' };
  const x = await setup({ state }); t.after(() => x.dom.window.close());
  const counts = x.w.HealthJobs.importPublicJobs([{ ...item, description: 'Veralteter Beschrieb', fetched_at: '2026-09-22T10:00:00Z' }]);
  assert.equal(counts.changed, 0); assert.equal(x.w.HealthJobs.getJob(item.id).description, item.description);
  x.w.HealthJobs.importPublicJobs([{ ...item, description: 'Aktualisierter Beschrieb', fetched_at: '2026-09-24T10:00:00Z' }]);
  assert.equal(x.w.HealthJobs.getJob(item.id).description, 'Aktualisierter Beschrieb');
  assert.equal(x.w.HealthJobs.getApplication(item.id).notes, 'Meine Notizen');
  x.w.HealthJobs.importPublicJobs([{ ...manual, id: 'bag:manual', source_type: 'scraped', description: 'Nicht überschreiben', fetched_at: '2026-09-24T10:00:00Z' }]);
  assert.equal(x.w.HealthJobs.getJob('manual').description, 'Mein Originaltext');
  assert.throws(() => x.w.HealthJobs.importPublicJobs([{ ...item, id: 'unknown:one', org_id: 'unknown' }]), /Quelle/);
  assert.throws(() => x.w.HealthJobs.importPublicJobs([{ ...item, url: 'https://example.org/different' }]), /anderen Link/);
  assert.equal(x.w.HealthJobs.getJob(item.id).url, item.url);
  assert.equal(x.w.HealthJobs.getJob('unknown:one'), undefined);
  assert.deepEqual(x.errors, []);
});

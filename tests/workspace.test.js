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

async function setup({ account = null, state, cloudRead, rpc, fetcher } = {}) {
  const errors = [], console = new VirtualConsole(); console.on('jsdomError', err => { errors.push(err.message); });
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'https://workspace.test', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console });
  const w = dom.window; w.structuredClone = structuredClone; w.TextEncoder = TextEncoder; w.AbortController = AbortController;
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
  w.confirm = () => true;
  const saved = state || C.emptyState();
  w.localStorage.setItem('healthjobs.workspace.v1.' + (account || 'guest'), JSON.stringify({ data: saved, revision: 0, dirty: false }));
  const callbacks = [], remote = new Map(); let user = account ? { id: account, email: account + '@example.org' } : null;
  const session = () => user ? { user, access_token: 'fixture-token' } : null;
  const client = {
    auth: { onAuthStateChange(fn) { callbacks.push(fn); queueMicrotask(() => fn('INITIAL_SESSION', session())); return { data: { subscription: { unsubscribe() {} } } }; }, getSession: async () => ({ data: { session: session() } }), signOut: async () => { user = null; callbacks.forEach(fn => fn('SIGNED_OUT', null)); return { error: null }; } },
    from(table) { const query = { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; }, maybeSingle() { return this; }, single() { return this; }, insert() { return this; }, upsert() { return this; }, delete() { return this; }, then(yes, no) {
      const result = table === 'job_workspaces' ? (cloudRead ? cloudRead() : { data: remote.get(user?.id) || null, error: null }) : { data: table === 'profiles' ? null : [], error: null };
      return Promise.resolve(result).then(yes, no);
    } }; return query; },
    rpc: async (name, args) => {
      if (rpc) return rpc(name, args);
      if (name !== 'save_job_workspace') return { data: true, error: null };
      const row = remote.get(user?.id); const revision = row?.revision || 0;
      if (args.expected_revision !== revision) return { data: null, error: { message: 'WORKSPACE_CONFLICT' } };
      const next = { data: args.payload, revision: revision + 1, updated_at: new Date().toISOString() }; remote.set(user.id, next); return { data: next, error: null };
    }
  };
  w.supabase = { createClient: () => client };
  w.fetch = fetcher || (async () => { throw new Error('Unexpected network request'); });
  const files = ['auth.js', 'app.js', 'map-geography.js', 'map.js', 'profile.js', 'job-core.js', 'workspace.js', 'letters.js', 'matching.js', 'community.js'];
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), dom.getInternalVMContext(), { filename: file });
  await tick(); await tick();
  return { dom, w, errors, client, remote, emitAccount(next) { user = next ? { id: next, email: next + '@example.org' } : null; callbacks.forEach(fn => fn(user ? 'SIGNED_IN' : 'SIGNED_OUT', session())); }, click(selector) { const el = w.document.querySelector(selector); assert.ok(el, selector); if (typeof el.click === 'function') el.click(); else el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); }, submit(selector, values) { const form = w.document.querySelector(selector); assert.ok(form, selector); for (const [name, value] of Object.entries(values)) form.elements.namedItem(name).value = value; form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); } };
}

test('full script stack supports manual capture, filters, application notes, saved search and reload data', async t => {
  const x = await setup(); t.after(() => x.dom.window.close()); const { w } = x;
  x.click('[data-action=manual]');
  x.submit('[data-form=manual]', { url: vacancy.url, title: vacancy.title, organization: vacancy.organization, description: vacancy.description, pensum: vacancy.pensum, location: vacancy.location });
  assert.equal(w.document.querySelectorAll('#jwJobList .jw-card').length, 1);
  const jobId = w.document.querySelector('[data-action=detail]').dataset.id;
  x.click('[data-action=save-job]'); assert.equal(w.HealthJobs.getApplication(jobId).stage, 'interested');
  x.click('[data-action=save-job]');
  x.submit('[data-form=application]', { stage: 'applied', notes: 'Unterlagen eingereicht', next_step: 'Nachfragen' });
  assert.equal(w.HealthJobs.getApplication(jobId).notes, 'Unterlagen eingereicht');
  x.click('[data-view=searches]'); x.click('[data-action=save-search]'); x.submit('[data-form=save-search]', { name: 'HTA Bern' });
  assert.match(w.document.getElementById('jwContent').textContent, /HTA Bern/);
  const stored = JSON.parse(w.localStorage.getItem('healthjobs.workspace.v1.guest')).data;
  assert.equal(stored.applications[jobId].stage, 'applied'); assert.equal(stored.searchProfiles.length, 1);
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
  x.click('[data-view=compare]'); assert.equal(w.document.querySelectorAll('.jw-table thead th').length, 3);
  x.click('[data-view=jobs]'); const search = w.document.querySelector('[data-filter=q]'); search.value = 'Data'; search.dispatchEvent(new w.Event('input', { bubbles: true }));
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
  x.click('#mapReset'); x.click('#mapChooseEmployers'); assert.equal(checked().length, 81);
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

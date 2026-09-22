const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
function harness(initial = {}) {
  const store = new Map(Object.entries(initial));
  const elements = new Map([['syncStatus', { textContent: '' }], ['profileSaveStatus', { textContent: '' }]]);
  const calls = [], events = [];
  let authCallback, user = null;
  const handlers = {
    write: async () => ({ error: null }),
    read: async () => ({ data: [], error: null }),
    rpc: async () => ({ error: null }),
  };
  function query(table) {
    const context = { table };
    const builder = {
      select: () => builder,
      eq: (key, value) => { context[key] = value; return builder; },
      order: () => builder,
      maybeSingle: () => handlers.read(context),
      then: (resolve, reject) => handlers.read(context).then(resolve, reject),
      upsert: payload => { calls.push({ type: 'upsert', table, payload }); return handlers.write(payload); },
      delete: () => { context.deleting = true; return builder; },
    };
    return builder;
  }
  const client = {
    auth: {
      onAuthStateChange: callback => { authCallback = callback; },
      getSession: async () => ({ data: { session: user ? { user, access_token: 'token-' + user.id } : null }, error: null }),
      signOut: async () => { user = null; authCallback('SIGNED_OUT', null); return { error: null }; },
    },
    from: query,
    rpc: (name, payload) => { calls.push({ type: 'rpc', name, payload }); return handlers.rpc(payload); },
    storage: { from: () => ({ remove: async () => ({ error: null }) }) },
  };
  const context = vm.createContext({
    console, AbortController, FormData, fetch: async () => { throw new Error('not mocked'); },
    localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key) },
    supabase: { createClient: () => client },
    document: { getElementById: key => elements.get(key) || null, querySelector: () => null, body: { style: {} } },
    window: { dispatchEvent: event => events.push(event), addEventListener: () => {}, location: { origin: 'https://example.test', pathname: '/' } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    setTimeout: callback => { /* status notices need no timer for these state tests */ return 0; },
    clearTimeout: () => {},
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/profile.js'), 'utf8'), context);
  return {
    context, store, calls, handlers, elements, events,
    login(id) { user = id ? { id, email: id + '@example.test' } : null; authCallback(id ? 'SIGNED_IN' : 'SIGNED_OUT', user ? { user } : null); },
    run: code => vm.runInContext(code, context),
  };
}

const tick = () => new Promise(resolve => setImmediate(resolve));

test('failed favorites stay pending and replacement writes run in order', async () => {
  const h = harness(); h.login('alice');
  let release;
  h.handlers.rpc = () => new Promise(resolve => { release = resolve; });
  const first = h.run("syncFavoritesToSupabase(['first'])");
  await tick();
  const second = h.run("syncFavoritesToSupabase(['second'])");
  await tick();
  assert.equal(h.calls.length, 1, 'second write must wait for the first');
  release({ error: { message: 'Offline' } });
  await first; await tick();
  assert.equal(h.calls.length, 2);
  assert.equal(h.store.get('healthjobs:pending:alice:favorites'), '["second"]');
  assert.match(h.elements.get('syncStatus').textContent, /ausstehend/);
  release({ error: null });
  await second;
  assert.equal(h.store.has('healthjobs:pending:alice:favorites'), false);
  assert.equal(h.calls[0].name, 'replace_favorites');
});

test('guest and account data do not merge and logout restores guest data', async () => {
  const h = harness({ favOrgs: '["guest"]', userProfile: '{"education":"guest"}' });
  h.login('alice');
  assert.equal(h.store.has('favOrgs'), false);
  h.handlers.read = async ({ table }) => ({ data: table === 'favorites' ? [{ org_id: 'alice-org' }] : { education: 'master' }, error: null });
  await h.run('syncFavoritesOnLogin()');
  await h.run('syncProfileOnLogin()');
  assert.equal(h.store.get('favOrgs'), '["alice-org"]');
  h.login(null);
  assert.equal(h.store.get('favOrgs'), '["guest"]');
  assert.equal(JSON.parse(h.store.get('userProfile')).education, 'guest');
  h.login('bob');
  assert.equal(h.store.has('userProfile'), false);
  assert.equal(h.store.has('favOrgs'), false);
  assert.equal(h.events.at(-1).detail.userId, 'bob');
});

test('late account reads cannot replace the next account profile', async () => {
  const h = harness(); h.login('alice');
  let release;
  h.handlers.read = () => new Promise(resolve => { release = resolve; });
  const pending = h.run('syncProfileOnLogin()');
  h.login('bob');
  release({ data: { education: 'alice-private' }, error: null });
  await pending;
  assert.equal(h.store.has('userProfile'), false);
});

test('profile submission remains usable after save and reset sends cleared fields', async () => {
  const h = harness(); h.login('alice');
  h.run("collectProfileData = () => ({education: 'master'}); populateProfile = () => {};");
  const button = { disabled: false, textContent: '' };
  h.context.profileEvent = { preventDefault() {}, target: { querySelector: () => button } };
  await h.run('submitProfile(profileEvent)');
  assert.equal(button.disabled, false);
  await h.run('submitProfile(profileEvent)');
  assert.equal(h.calls.filter(call => call.type === 'upsert').length, 2);
  await h.run('resetProfile()');
  const cleared = h.calls.at(-1).payload;
  assert.equal(cleared.education, '');
  assert.equal(cleared.field_of_study, '');
  assert.equal(cleared.desired_regions.length, 0);
  assert.equal(cleared.workload_min, 50);
});

test('failed profile writes are retained and never presented as saved', async () => {
  const h = harness(); h.login('alice');
  h.handlers.write = async () => ({ error: { message: 'Database offline' } });
  h.run("collectProfileData = () => ({education: 'master'})");
  const button = { disabled: false, textContent: '' };
  h.context.profileEvent = { preventDefault() {}, target: { querySelector: () => button } };
  await h.run('submitProfile(profileEvent)');
  assert.equal(button.disabled, false);
  assert.match(h.elements.get('profileSaveStatus').textContent, /Synchronisierung ausstehend/);
  assert.equal(JSON.parse(h.store.get('healthjobs:pending:alice:profile')).education, 'master');
});

test('CV replacement is allowed at six documents and failed replacement retains old CV', async () => {
  const h = harness(); h.login('alice');
  const docs = [{ id: 1, doc_type: 'cv', file_name: 'old.pdf' }, ...Array.from({ length: 5 }, (_, i) => ({ id: i + 2, doc_type: 'zeugnis' }))];
  h.store.set('userDocuments', JSON.stringify(docs));
  h.context.uploadFile = new File(['%PDF-test'], 'new.pdf', { type: 'application/pdf' });
  h.context.fetch = async () => ({ ok: false, json: async () => ({ error: 'Storage unavailable' }) });
  await h.run('handleDocUpload(uploadFile)');
  assert.deepEqual(JSON.parse(h.store.get('userDocuments')), docs);
  h.context.fetch = async () => ({ ok: true, json: async () => ({ id: 7, doc_type: 'cv', file_name: 'new.pdf', raw_text: 'New CV' }) });
  await h.run('handleDocUpload(uploadFile)');
  const saved = JSON.parse(h.store.get('userDocuments'));
  assert.equal(saved.length, 6);
  assert.equal(saved[0].id, 7);
  assert.equal(saved.filter(doc => doc.doc_type === 'cv').length, 1);
});

test('upload completion from a previous account cannot leak into a new account', async () => {
  const h = harness(); h.login('alice');
  let finish;
  h.context.uploadFile = new File(['%PDF-test'], 'private.pdf', { type: 'application/pdf' });
  h.context.fetch = () => new Promise(resolve => { finish = resolve; });
  const pending = h.run('handleDocUpload(uploadFile)');
  await tick();
  h.login('bob');
  finish({ ok: true, json: async () => ({ id: 8, doc_type: 'cv', file_name: 'private.pdf' }) });
  await pending;
  assert.equal(h.store.has('userDocuments'), false);
});

test('account documents restore from metadata on login', async () => {
  const h = harness(); h.login('alice');
  h.handlers.read = async ({ table, user_id }) => {
    assert.equal(table, 'cv_uploads');
    assert.equal(user_id, 'alice');
    return { data: [{ id: 1, file_name: 'cv.pdf', storage_path: 'cvs/alice/a.pdf', extracted_profile: { doc_type: 'cv', raw_text: 'Private' }, uploaded_at: '2026-09-22' }], error: null };
  };
  await h.run('syncDocumentsOnLogin()');
  assert.equal(JSON.parse(h.store.get('userDocuments'))[0].raw_text, 'Private');
  h.login(null);
  assert.equal(h.store.has('userDocuments'), false);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.join(__dirname, '..');

function setup(t, favorites = [], viewportWidth) {
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'https://map.test', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console,
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  if (viewportWidth != null) Object.defineProperty(w, 'innerWidth', { value: viewportWidth, configurable: true });
  w.localStorage.setItem('favOrgs', JSON.stringify(favorites));
  const context = dom.getInternalVMContext();
  for (const file of ['job-facts.js', 'app.js', 'map-geography.js', 'map.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), context, { filename: file });
  }
  const run = source => vm.runInContext(source, context);
  const find = selector => {
    const element = w.document.querySelector(selector);
    assert.ok(element, 'Element exists: ' + selector);
    return element;
  };
  const click = selector => find(selector).dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  const selected = () => Array.from(run('activeLocs'));
  const ids = () => Array.from(run('getFilteredOrganizations().map(org => org.id)'));
  const count = city => Number(find(`.city-bubble[data-loc="${city}"] .city-count`).textContent);
  const search = async value => {
    const input = find('#searchInput');
    input.value = value;
    input.dispatchEvent(new w.Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 180));
  };
  const summaryHasCount = expected => assert.match(find('#mapSummary').textContent, new RegExp('(?:^|\\D)' + expected + '(?:\\D|$)'));
  return { w, errors, run, find, click, selected, ids, count, search, summaryHasCount };
}

test('map counts canonical organizations once and separates region buckets from city markers', t => {
  const x = setup(t, ['bag', 'bsv', 'suva']);
  assert.equal(x.ids().length, 97);
  x.summaryHasCount(97);
  assert.equal(x.count('Bern'), 31);
  assert.equal(x.count('Zürich'), 16);
  assert.equal(x.w.document.querySelectorAll('#categories .org-row').length, 97);
  assert.equal(x.w.document.querySelectorAll('#categories .org-star[aria-pressed="true"]').length, 3);
  assert.equal(x.find('#favOnly .dir-favcount').textContent, '3');
  assert.equal(x.w.document.querySelector('#fav-sec, #onboardingHint, #employerDirectory .stats'), null);
  assert.equal(x.w.document.querySelector('.map-svg .city-bubble[data-loc="Westschweiz"]'), null);
  assert.equal(x.find('.map-region-btn[data-loc="Westschweiz"]').closest('svg'), null);
  assert.deepEqual(x.errors, []);
});

test('multiple region selection stays synchronized and removal preserves the other region', t => {
  const x = setup(t);
  x.click('.city-bubble[data-loc="Bern"]');
  x.click('#cantonChips [data-loc="Zürich"]');
  assert.deepEqual(x.selected().sort(), ['Bern', 'Zürich']);
  assert.equal(x.ids().length, 47);
  x.summaryHasCount(47);
  for (const city of ['Bern', 'Zürich']) {
    assert.equal(x.find(`.city-bubble[data-loc="${city}"]`).getAttribute('aria-pressed'), 'true');
    assert.equal(x.find(`#cantonChips [data-loc="${city}"]`).getAttribute('aria-pressed'), 'true');
  }
  // Counts on destinations show their availability, not the selected subset.
  assert.equal(x.count('Basel'), 10);
  x.click('#activeLocs [data-remove-loc="Bern"]');
  assert.deepEqual(x.selected(), ['Zürich']);
  assert.equal(x.ids().length, 16);
  assert.equal(x.find('.city-bubble[data-loc="Bern"]').getAttribute('aria-pressed'), 'false');
  assert.deepEqual(x.errors, []);
});

test('category and fuzzy search update markers, canonical matches and row visibility', async t => {
  const x = setup(t, ['bag', 'suva']);
  x.click('.cat-chip[data-cat="versicherungen"]');
  assert.equal(x.ids().length, 13);
  assert.equal(x.count('Bern'), 3);
  assert.equal(x.count('Neuenburg'), 0);
  for (const id of ['bag', 'suva']) assert.equal(x.find(`.org-row[data-id="${id}"]`).hidden, true, 'Excluded row is hidden: ' + id);
  assert.equal(x.find('.org-row[data-id="css"]').hidden, false);
  assert.equal(x.find('.dir-group[data-cat="bund"]').hidden, true);
  assert.equal(x.find('.dir-group[data-cat="versicherungen"] .dir-group-count').textContent, '13');
  await x.search('zuerich');
  assert.deepEqual(x.ids().sort(), ['helsana', 'sanitas']);
  assert.equal(x.count('Zürich'), 2);
  assert.equal(x.count('Bern'), 0);
  x.summaryHasCount(2);
  assert.deepEqual(x.errors, []);
});

test('reset clears locations, category and search after an empty result', async t => {
  const x = setup(t);
  x.click('.city-bubble[data-loc="Bern"]');
  x.click('.cat-chip[data-cat="bund"]');
  await x.search('no-organization-matches-this-phrase');
  assert.equal(x.ids().length, 0);
  x.summaryHasCount(0);
  assert.equal(x.find('#mapEmpty').hidden, false);
  assert.equal(x.find('#mapChooseEmployers').disabled, true);
  x.click('#mapReset');
  assert.deepEqual(x.selected(), []);
  assert.deepEqual(Array.from(x.run('activeCats')), []);
  assert.equal(x.find('#searchInput').value, '');
  assert.equal(x.ids().length, 97);
  assert.equal(x.find('#mapEmpty').hidden, true);
  assert.equal(x.find('#mapChooseEmployers').disabled, false);
  assert.equal(x.count('Bern'), 31);
  assert.deepEqual(x.errors, []);
});

test('markers support keyboard selection and map/list changes preserve selection', t => {
  const x = setup(t);
  const bern = x.find('.city-bubble[data-loc="Bern"]');
  assert.equal(bern.getAttribute('role'), 'button');
  assert.equal(bern.getAttribute('tabindex'), '0');
  bern.dispatchEvent(new x.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.deepEqual(x.selected(), ['Bern']);
  x.click('#mapViewList');
  assert.equal(x.find('#mapCanvas').hidden, true);
  assert.equal(x.find('#mapLocationList').hidden, false);
  assert.equal(x.find('#mapViewList').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(x.selected(), ['Bern']);
  x.click('#mapViewMap');
  assert.equal(x.find('#mapCanvas').hidden, false);
  assert.equal(x.find('#mapLocationList').hidden, true);
  assert.equal(x.find('#mapViewMap').getAttribute('aria-pressed'), 'true');
  // Obtain the current element so the assertion also works after a rerender.
  const space = new x.w.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
  x.find('.city-bubble[data-loc="Bern"]').dispatchEvent(space);
  assert.equal(space.defaultPrevented, true);
  assert.deepEqual(x.selected(), []);
  assert.deepEqual(x.errors, []);
});

test('a 390px viewport starts with the location list and keeps filters when opening the map', t => {
  const x = setup(t, [], 390);
  assert.equal(x.find('#mapLocationList').hidden, false);
  assert.equal(x.find('#mapCanvas').hidden, true);
  assert.equal(x.find('#mapViewList').getAttribute('aria-pressed'), 'true');
  x.click('#cantonChips [data-loc="Bern"]');
  x.click('.cat-chip[data-cat="versicherungen"]');
  assert.deepEqual(x.ids().sort(), ['atupri', 'kpt', 'visana']);
  x.click('#mapViewMap');
  assert.equal(x.find('#mapCanvas').hidden, false);
  assert.equal(x.find('#mapLocationList').hidden, true);
  assert.equal(x.find('#mapViewMap').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(x.selected(), ['Bern']);
  assert.deepEqual(x.ids().sort(), ['atupri', 'kpt', 'visana']);
  assert.equal(x.find('.city-bubble[data-loc="Bern"]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(x.errors, []);
});

test('map handoff includes only current searchable organizations without starting a search', async t => {
  const x = setup(t);
  const calls = [];
  x.w.HealthJobs = { openEmployerSelection: ids => calls.push(Array.from(ids)), startSearch: () => assert.fail('Map must open a chooser, not start a search') };
  x.click('#mapChooseEmployers');
  assert.equal(calls[0].length, 93);
  assert.equal(new Set(calls[0]).size, 93);
  x.click('.city-bubble[data-loc="Bern"]');
  x.click('#mapChooseEmployers');
  assert.equal(calls[1].length, 28);
  assert.ok(calls[1].includes('bag'));
  assert.ok(!calls[1].includes('hplus'));
  x.click('.cat-chip[data-cat="versicherungen"]');
  x.click('#mapChooseEmployers');
  assert.deepEqual(calls[2].sort(), ['atupri', 'kpt', 'visana']);
  await x.search('KPT');
  x.click('#mapChooseEmployers');
  assert.deepEqual(calls[3], ['kpt']);
  assert.deepEqual(x.errors, []);
});

test('favorite changes and directory rerenders retain map filters and canonical counts', t => {
  const x = setup(t);
  x.click('.city-bubble[data-loc="Bern"]');
  x.click('#categories .org-row[data-id="bag"] [data-fav]');
  assert.deepEqual(x.selected(), ['Bern']);
  assert.equal(x.ids().length, 31);
  x.summaryHasCount(31);
  assert.equal(x.count('Bern'), 31);
  assert.deepEqual(JSON.parse(x.w.localStorage.getItem('favOrgs')), ['bag']);
  assert.equal(x.find('.org-row[data-id="bag"] [data-fav]').getAttribute('aria-pressed'), 'true');
  assert.equal(x.w.document.activeElement, x.find('.org-row[data-id="bag"] [data-fav]'));
  assert.equal(x.find('.city-bubble[data-loc="Bern"]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(x.errors, []);
});

test('Westschweiz selection retains its existing distinct bucket and excludes Neuenburg', t => {
  const x = setup(t);
  x.click('.map-region-btn[data-loc="Westschweiz"]');
  assert.deepEqual(x.selected(), ['Westschweiz']);
  assert.equal(x.ids().length, 9);
  assert.ok(!x.ids().includes('bfs'));
  assert.equal(x.count('Neuenburg'), 2);
  x.click('.city-bubble[data-loc="Neuenburg"]');
  assert.equal(x.ids().length, 11);
  assert.ok(x.ids().includes('bfs'));
  assert.deepEqual(x.errors, []);
});

test('"Nur Favoriten" filters list, markers and handoff and is cleared by reset', t => {
  const x = setup(t, ['bag', 'css', 'usz']);
  x.click('#favOnly');
  assert.equal(x.find('#favOnly').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(x.ids().sort(), ['bag', 'css', 'usz']);
  assert.equal(x.w.document.querySelectorAll('#categories .org-row:not([hidden])').length, 3);
  assert.equal(x.count('Bern'), 1);
  assert.equal(x.count('Luzern'), 1);
  x.click('#mapReset');
  assert.equal(x.find('#favOnly').getAttribute('aria-pressed'), 'false');
  assert.equal(x.ids().length, 97);
  assert.deepEqual(x.errors, []);
});

test('rows link to profiles and career pages and show a placeholder until the feed loads', t => {
  const x = setup(t);
  const row = x.find('.org-row[data-id="bag"]');
  assert.equal(row.querySelector('.org-name').getAttribute('href'), '#arbeitgeber-bag');
  assert.equal(row.querySelector('.org-avatar').textContent, 'BAG');
  assert.match(row.querySelector('.org-career').getAttribute('href'), /^https:\/\/jobs\.admin\.ch/);
  assert.equal(row.querySelector('.org-jobs').textContent.trim().startsWith('–'), true);
  assert.equal(x.find('.org-row[data-id="hplus"] .org-career').tagName, 'SPAN');
  assert.equal(x.w.document.querySelector('.org-row img'), null, 'No third-party favicons');
  assert.deepEqual(x.errors, []);
});

function loadFeed(x, jobs, sources = []) {
  x.w.PublicJobFeed = { getAllJobs: () => jobs, getSources: () => sources };
  x.w.dispatchEvent(new x.w.CustomEvent('publicfeed:loaded', { detail: { count: jobs.length, generatedAt: '2026-11-03T00:00:00Z' } }));
}
const job = (id, org, location, extra = {}) => ({ id: `${org}:${id}`, org_id: org, org_ids: [org], title: `Stelle ${id}`, organization: org.toUpperCase(), location, status: 'open', first_seen: '2026-10-30T00:00:00Z', relevance: { category: 'Gesundheitspolitik' }, ...extra });

test('feed load switches the map to open jobs per anchor and documents unplaced jobs', t => {
  const x = setup(t);
  loadFeed(x, [
    job('a1', 'bag', 'Bern, CH'), job('a2', 'bag', 'Liebefeld, Espace Mittelland (BE, FR, JU, NE, SO), Schweiz'),
    job('b1', 'usz', 'Zürich, CH'), job('b2', 'zhaw', 'Winterthur, CH'), job('c1', 'chuv', 'Lausanne, CH'),
    job('d1', 'roche', 'CH'), job('e1', 'bss', '', { canton: null }), job('f1', 'novartis', 'Basel, Basel-Stadt, Schweiz', { canton: 'BS' })
  ]);
  assert.equal(x.run('mapCountMode'), 'jobs');
  assert.equal(x.find('#mapCountJobs').getAttribute('aria-pressed'), 'true');
  assert.equal(x.count('Bern'), 2);
  assert.equal(x.count('Zürich'), 1);
  assert.equal(x.count('Winterthur'), 1);
  assert.equal(x.count('Basel'), 2, 'Empty location inherits the employer seat (B,S,S. Basel)');
  assert.equal(x.find('.map-region-btn[data-loc="Westschweiz"] .map-region-count').textContent, '1');
  assert.match(x.find('.map-count-hint').textContent, /1 Stelle ohne eindeutigen Ort/);
  assert.match(x.find('.org-row[data-id="bag"] .org-jobs').textContent, /2\s+Stellen/);
  assert.equal(x.find('.org-row[data-id="bag"] .org-jobs').getAttribute('href'), '?ag=bag#stellen');
  assert.match(x.find('.org-row[data-id="kvg"] .org-jobs').textContent, /0/);
  // Category filter narrows job counts to those employers.
  x.click('.cat-chip[data-cat="spitaeler"]');
  assert.equal(x.count('Bern'), 0);
  assert.equal(x.count('Zürich'), 1);
  x.click('#mapCountOrgs');
  assert.equal(x.run('mapCountMode'), 'orgs');
  assert.equal(x.count('Zürich'), 2);
  assert.deepEqual(x.errors, []);
});

test('choosing a location offers its jobs and a canton-filtered feed link', t => {
  const x = setup(t);
  loadFeed(x, [job('a1', 'bag', 'Bern, CH'), job('a2', 'snf', 'Bern, CH'), job('c1', 'chuv', 'Lausanne, CH'), job('c2', 'hug', 'Genève, CH')]);
  assert.equal(x.find('#mapJobsOffer').hidden, true);
  x.click('.city-bubble[data-loc="Bern"]');
  const offer = x.find('#mapJobsOffer');
  assert.equal(offer.hidden, false);
  assert.ok(offer.querySelector('a[href="?kanton=BE#stellen"]'));
  assert.equal(offer.querySelectorAll('li a[href^="#stelle-"]').length, 2);
  assert.ok(offer.querySelector('a[href="#stelle-bag-a1"]'));
  x.click('.map-region-btn[data-loc="Westschweiz"]');
  assert.ok(offer.querySelector('a[href="?kanton=VD#stellen"]'));
  assert.ok(offer.querySelector('a[href="?kanton=GE#stellen"]'));
  // Directory follows the location filter.
  assert.equal(x.find('.org-row[data-id="bag"]').hidden, false);
  assert.equal(x.find('.org-row[data-id="usz"]').hidden, true);
  assert.deepEqual(x.errors, []);
});

test('hover tooltip lists at most three jobs of a location in jobs mode', t => {
  const x = setup(t);
  loadFeed(x, ['1', '2', '3', '4'].map(n => job('z' + n, 'usz', 'Zürich, CH')));
  x.find('.city-bubble[data-loc="Zürich"]').dispatchEvent(new x.w.Event('mouseenter'));
  const tip = x.find('#mapTip');
  assert.equal(tip.hidden, false);
  assert.equal(tip.querySelectorAll('li').length, 3);
  assert.match(tip.textContent, /4 offene Stellen/);
  x.find('.city-bubble[data-loc="Zürich"]').dispatchEvent(new x.w.Event('mouseleave'));
  assert.equal(tip.hidden, true);
  assert.deepEqual(x.errors, []);
});

test('employer profile route renders details, jobs, source status and history', t => {
  const x = setup(t, ['bag']);
  x.w.scrollTo = () => {};
  const route = detail => x.w.dispatchEvent(new x.w.CustomEvent('site:route', { detail: { view: 'arbeitgeber', hash: '', ...detail } }));
  const calls = [];
  x.w.HealthJobs = { openAlertDialog: p => calls.push(['alert', p]), openEmployerSelection: ids => calls.push(['select', Array.from(ids)]) };
  route({ sub: 'profil', param: 'bag' });
  assert.equal(x.find('#employerDirectory').hidden, true);
  assert.equal(x.find('#employerProfile').hidden, false);
  assert.equal(x.find('#empName').textContent, 'Bundesamt für Gesundheit (BAG)');
  assert.ok(x.find('.emp-job-list[aria-busy="true"]'));
  const now = Date.now();
  loadFeed(x, [
    job('n1', 'bag', 'Bern, CH', { first_seen: new Date(now - 5 * 864e5).toISOString() }),
    job('o1', 'bag', 'Bern, CH', { first_seen: new Date(now - 120 * 864e5).toISOString() })
  ], [{ org_id: 'bag', status: 'ok', coverage: 'complete', checked_at: '2026-11-02T23:52:38Z', raw_job_count: 17, relevant_job_count: 2 }]);
  const profile = x.find('#employerProfile');
  assert.equal(profile.querySelectorAll('.emp-job').length, 2);
  assert.equal(profile.querySelector('.emp-job').getAttribute('href'), '#stelle-bag-n1');
  assert.match(profile.querySelector('.emp-source').textContent, /vollständig geprüft/);
  assert.match(profile.querySelector('.emp-stat').textContent, /1\s*Stelle in den letzten 90 Tagen/);
  assert.equal(profile.querySelector('[data-fav="bag"]').getAttribute('aria-pressed'), 'true');
  x.click('#employerProfile [data-emp-action="alert"]');
  x.click('#employerProfile [data-emp-action="select"]');
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['alert', { employer: 'bag' }], ['select', ['bag']]]);
  x.click('#employerProfile [data-fav="bag"]');
  assert.deepEqual(JSON.parse(x.w.localStorage.getItem('favOrgs')), []);
  assert.equal(x.find('#employerProfile [data-fav="bag"]').getAttribute('aria-pressed'), 'false');
  route({ sub: '', param: '' });
  assert.equal(x.find('#employerDirectory').hidden, false);
  assert.equal(x.find('#employerProfile').hidden, true);
  route({ sub: 'profil', param: 'does-not-exist' });
  assert.match(x.find('#empName').textContent, /nicht gefunden/);
  assert.deepEqual(x.errors, []);
});

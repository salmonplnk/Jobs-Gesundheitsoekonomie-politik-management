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
  for (const file of ['app.js', 'map-geography.js', 'map.js']) {
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
  assert.equal(x.ids().length, 85);
  x.summaryHasCount(85);
  assert.equal(x.count('Bern'), 28);
  assert.equal(x.count('Zürich'), 11);
  assert.equal(x.w.document.querySelectorAll('#fav-grid .org-card').length, 3);
  assert.equal(x.w.document.querySelector('.map-svg .city-bubble[data-loc="Westschweiz"]'), null);
  assert.equal(x.find('.map-region-btn[data-loc="Westschweiz"]').closest('svg'), null);
  assert.deepEqual(x.errors, []);
});

test('multiple region selection stays synchronized and removal preserves the other region', t => {
  const x = setup(t);
  x.click('.city-bubble[data-loc="Bern"]');
  x.click('#cantonChips [data-loc="Zürich"]');
  assert.deepEqual(x.selected().sort(), ['Bern', 'Zürich']);
  assert.equal(x.ids().length, 39);
  x.summaryHasCount(39);
  for (const city of ['Bern', 'Zürich']) {
    assert.equal(x.find(`.city-bubble[data-loc="${city}"]`).getAttribute('aria-pressed'), 'true');
    assert.equal(x.find(`#cantonChips [data-loc="${city}"]`).getAttribute('aria-pressed'), 'true');
  }
  // Counts on destinations show their availability, not the selected subset.
  assert.equal(x.count('Basel'), 7);
  x.click('#activeLocs [data-remove-loc="Bern"]');
  assert.deepEqual(x.selected(), ['Zürich']);
  assert.equal(x.ids().length, 11);
  assert.equal(x.find('.city-bubble[data-loc="Bern"]').getAttribute('aria-pressed'), 'false');
  assert.deepEqual(x.errors, []);
});

test('category and fuzzy search update markers, canonical matches and favorite visibility', async t => {
  const x = setup(t, ['bag', 'suva']);
  x.click('.cat-chip[data-cat="versicherungen"]');
  assert.equal(x.ids().length, 13);
  assert.equal(x.count('Bern'), 3);
  assert.equal(x.count('Neuenburg'), 0);
  for (const id of ['bag', 'suva']) {
    const card = x.find(`#fav-grid .org-card[data-id="${id}"]`);
    assert.ok(card.hidden || card.style.display === 'none', 'Excluded favorite is hidden: ' + id);
  }
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
  assert.equal(x.ids().length, 85);
  assert.equal(x.find('#mapEmpty').hidden, true);
  assert.equal(x.find('#mapChooseEmployers').disabled, false);
  assert.equal(x.count('Bern'), 28);
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
  assert.equal(calls[0].length, 81);
  assert.equal(new Set(calls[0]).size, 81);
  x.click('.city-bubble[data-loc="Bern"]');
  x.click('#mapChooseEmployers');
  assert.equal(calls[1].length, 25);
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
  x.click('#categories .org-card[data-id="bag"] [data-fav]');
  assert.deepEqual(x.selected(), ['Bern']);
  assert.equal(x.ids().length, 28);
  x.summaryHasCount(28);
  assert.equal(x.count('Bern'), 28);
  assert.equal(x.w.document.querySelectorAll('#fav-grid .org-card[data-id="bag"]').length, 1);
  assert.equal(x.find('.city-bubble[data-loc="Bern"]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(x.errors, []);
});

test('Westschweiz selection retains its existing distinct bucket and excludes Neuenburg', t => {
  const x = setup(t);
  x.click('.map-region-btn[data-loc="Westschweiz"]');
  assert.deepEqual(x.selected(), ['Westschweiz']);
  assert.equal(x.ids().length, 8);
  assert.ok(!x.ids().includes('bfs'));
  assert.equal(x.count('Neuenburg'), 2);
  x.click('.city-bubble[data-loc="Neuenburg"]');
  assert.equal(x.ids().length, 10);
  assert.ok(x.ids().includes('bfs'));
  assert.deepEqual(x.errors, []);
});

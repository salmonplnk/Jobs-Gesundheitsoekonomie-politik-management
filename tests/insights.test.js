const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.join(__dirname, '..');

function setup(t) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'https://insights.test', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole,
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  const context = dom.getInternalVMContext();
  for (const file of ['app.js', 'job-relevance.js', 'job-facts.js', 'insights.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), context, { filename: file });
  }
  const load = (jobs, detail = { count: jobs.length, generatedAt: '2026-11-03T00:04:00Z' }) => {
    w.PublicJobFeed = { getAllJobs: () => jobs, getSources: () => [] };
    w.dispatchEvent(new w.CustomEvent('publicfeed:loaded', { detail }));
  };
  return { w, errors, load, mount: w.document.getElementById('marketInsights') };
}

const DAY = 864e5;
const now = Date.parse('2026-11-03T12:00:00Z');
const job = (id, extra = {}) => ({
  id: `bag:${id}`, org_id: 'bag', org_ids: ['bag'], category: 'bund', title: 'Wissenschaftliche Mitarbeiterin', location: 'Bern, CH',
  status: 'open', first_seen: new Date(now - 40 * DAY).toISOString(), relevance: { category: 'Gesundheitspolitik' }, description: '', ...extra
});

test('compute derives honest snapshot figures from open jobs', t => {
  const x = setup(t);
  const jobs = [
    job('a', { first_seen: new Date(now - 2 * DAY).toISOString(), pensum: '80–100%', description: 'Analysen mit R und Stata. Master in Gesundheitsökonomie. Bewerbungsfrist: 30.11.2026', title: 'Junior Analyst' }),
    job('b', { first_seen: new Date(now - 20 * DAY).toISOString(), workload_min: 100, workload_max: 100, description: 'Python, SQL; sehr gute Französischkenntnisse. Lohnklasse 23', org_id: 'usz', org_ids: ['usz'], category: 'spitaeler', location: 'Zürich, CH', title: 'Leiterin Data Science' }),
    job('c', { pensum: '50%', location: 'CH', relevance: { category: 'Gesundheitsdaten / Digital Health' }, description: 'Research & Development' }),
    job('d', { status: 'closed' })
  ];
  const s = x.w.MarketInsights.compute(jobs, now);
  assert.equal(s.total, 3);
  assert.equal(s.new7, 1);
  assert.equal(s.new30, 2);
  assert.equal(s.deadline, 1);
  assert.equal(s.salary, 1);
  const canton = Object.fromEntries(s.canton);
  assert.deepEqual(canton, { BE: 1, ZH: 1 });
  assert.equal(s.cantonUnknown, 1);
  const seniority = Object.fromEntries(s.seniority);
  assert.equal(seniority.junior, 1);
  assert.equal(seniority.lead, 1);
  assert.equal(s.seniorityUnknown, 1);
  assert.deepEqual(Object.fromEntries(s.pensum), { '90–100 %': 1, 'Spanne bis 100 %': 1, '60–80 %': 0, 'unter 60 %': 1, 'nicht angegeben': 0 });
  const keywords = Object.fromEntries(s.keywords);
  assert.equal(keywords.R, 1, 'standalone R counted, "Research & Development" not');
  assert.equal(keywords.Stata, 1);
  assert.equal(keywords.Python, 1);
  assert.equal(keywords.SQL, 1);
  assert.equal(keywords['Französisch'], 1);
  assert.equal(keywords.Master, 1);
  assert.equal(keywords['Gesundheitsökonomie'], 1);
  assert.deepEqual([...s.employers[0]], ['bag', 2]);
  assert.equal(Object.fromEntries(s.focus).Gesundheitspolitik, 2);
  assert.deepEqual(x.errors, []);
});

test('the Arbeitsmarkt view shows a loading state, then accessible charts linking to the filtered feed', t => {
  const x = setup(t);
  assert.ok(x.mount.querySelector('.view-head h2'));
  assert.ok(x.mount.querySelector('[aria-busy="true"]'));
  x.load([
    job('a', { description: 'Englisch und Python' }), job('b', { org_id: 'usz', org_ids: ['usz'], category: 'spitaeler', location: 'Zürich, CH' }),
    job('c', { relevance: { category: 'Gesundheitsökonomie / HTA' } })
  ]);
  const m = x.mount;
  assert.equal(m.querySelector('[aria-busy]'), null);
  assert.match(m.querySelector('.view-head').textContent, /nicht den gesamten Schweizer Arbeitsmarkt/);
  assert.ok(m.querySelector('.view-head a[href="#quellen"]'));
  assert.equal(m.querySelector('.mi-kpi strong').textContent, '3');
  const figures = m.querySelectorAll('figure.mi-chart');
  assert.ok(figures.length >= 7);
  for (const figure of figures) {
    const id = figure.getAttribute('aria-labelledby');
    assert.ok(id && figure.querySelector(`#${id}`), 'every chart is labelled by its caption');
  }
  const fach = m.querySelector('a.mi-row[href="?fach=Gesundheitspolitik#stellen"]');
  assert.ok(fach, 'Fachbereich bar links to the feed filter');
  assert.match(fach.textContent, /2/);
  assert.ok(m.querySelector('a.mi-row[href="?kanton=ZH#stellen"]'));
  assert.ok(m.querySelector('a.mi-row[href="?branche=spitaeler#stellen"]'));
  assert.ok(m.querySelector('a.mi-row[href="?ag=bag#stellen"]'));
  assert.ok(m.querySelector('a.mi-row[href="?q=Python#stellen"]'));
  // Bars are drawn to scale from zero: the longest bar is 100 %, half the count is 50 %.
  const widths = [...m.querySelectorAll('#miFocus ~ * .mi-fill, figure[aria-labelledby="miFocus"] .mi-fill')].map(el => parseFloat(el.style.width));
  assert.equal(Math.max(...widths), 100);
  assert.ok(widths.includes(50));
  assert.deepEqual(x.errors, []);
});

test('a failed feed load shows a message instead of numbers', t => {
  const x = setup(t);
  x.load([], { count: null });
  assert.match(x.mount.textContent, /nicht erreichbar/);
  assert.equal(x.mount.querySelector('.mi-kpi'), null);
  assert.deepEqual(x.errors, []);
});

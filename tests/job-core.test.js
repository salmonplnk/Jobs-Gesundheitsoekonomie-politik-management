const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/job-core.js');
const base = { title: 'Projektleiter Gesundheit', organization: 'Test', url: 'https://example.org/jobs/123', description: 'Projektmanagement und Gesundheitsökonomie. Erfahrung in Datenanalyse erwünscht.', pensum: '80–100%', location: 'Bern', remote_mode: 'hybrid' };

test('same vacancy keeps identity and history while failed sources never close it', () => {
  const s = C.emptyState();
  C.ingest(s, [base], [], '2026-09-01T00:00:00Z'); const original = Object.values(s.jobs)[0];
  C.ingest(s, [{ ...base, id: 'another-source-id', pensum: '60–80%' }], [], '2026-09-02T00:00:00Z');
  assert.equal(Object.keys(s.jobs).length, 1); assert.equal(s.jobs[original.id].first_seen, '2026-09-01T00:00:00Z');
  assert.deepEqual(s.jobs[original.id].change_fields, ['pensum']);
  C.ingest(s, [], [{ org_id: 'test', status: 'error' }]);
  assert.equal(s.jobs[original.id].status, 'open');
});
test('hash-based vacancy routes remain distinct; tracking parameters do not', () => {
  assert.notEqual(C.identity({ ...base, url: 'https://example.org/#/jobs/123' }), C.identity({ ...base, url: 'https://example.org/#/jobs/456' }));
  assert.equal(C.identity(base), C.identity({ ...base, url: base.url + '?utm_source=test' }));
});
test('unknown must criteria are not silently satisfied; workload uses range overlap', () => {
  const job = C.cleanJob(base);
  const criteria = [{ field: 'workload', value: '60–80%', mode: 'must', weight: 2 }, { field: 'languages', value: 'Französisch', mode: 'must', weight: 1 }];
  const m = C.evaluate(job, criteria);
  assert.equal(m.criteria[0].status, 'met'); assert.equal(m.criteria[1].status, 'unknown'); assert.equal(m.eligible, false); assert.equal(m.coverage, 67);
});
test('closed filter includes closed jobs and no-criteria clears eligibility restrictions', () => {
  const s = C.emptyState(); C.ingest(s, [{ ...base, status: 'closed' }]);
  assert.equal(C.filterJobs(Object.values(s.jobs), { freshness: 'closed' }, s, []).length, 1);
  assert.equal(C.filterJobs(Object.values(s.jobs), {}, s, []).length, 0);
});
test('malformed stored records and reserved identifiers cannot poison state', () => {
  const s = C.hydrate({ jobs: { nope: null }, searchProfiles: [{ id: 'p', name: 'Bad', orgIds: [], criteria: [null] }], criteria: [null] });
  assert.equal(Object.keys(s.jobs).length, 0); assert.deepEqual(s.searchProfiles[0].criteria, []);
  C.ingest(s, [{ ...base, id: '__proto__' }]);
  assert.equal(Object.keys(s.jobs).length, 1); assert.ok(Object.values(s.jobs)[0].id.startsWith('job_'));
  assert.equal(Object.prototype.title, undefined);
});
test('selected employers and intentionally empty criteria survive hydration', () => {
  const s = C.hydrate({ selectedOrgIds: ['bag', 'bfs'], criteriaConfigured: true, criteria: [] });
  assert.deepEqual(s.selectedOrgIds, ['bag', 'bfs']); assert.equal(s.criteriaConfigured, true);
});
test('backend enums are readable and language filtering is usable', () => {
  const j = C.cleanJob({ ...base, role: 'health-economics', languages: 'DE, FR', seniority: 'senior', employment_type: 'permanent' });
  assert.equal(j.role, 'Gesundheitsökonomie / HTA'); assert.equal(j.languages, 'Deutsch, Französisch');
  assert.equal(C.filterJobs([j], { languages: 'Französisch' }).length, 1);
});
test('seniority keys map to the agreed labels and back; old "entry" data stays readable', () => {
  const labels = { praktikum: 'Praktikum', trainee: 'Trainee', junior: 'Junior', senior: 'Senior', lead: 'Leitung', phd: 'PhD / Doktorat', entry: 'Berufseinstieg' };
  for (const [key, label] of Object.entries(labels)) {
    assert.equal(C.cleanJob({ ...base, seniority: key }).seniority, label);
    assert.equal(C.seniorityKey(label), key); assert.equal(C.seniorityKey(key), key);
  }
  assert.equal(C.seniorityKey('Irgendwas'), null);
});
test('deadline days parse ISO and Swiss dates only', () => {
  assert.equal(C.deadlineDay('2026-11-30'), '2026-11-30'); assert.equal(C.deadlineDay('3.1.2027'), '2027-01-03');
  assert.equal(C.deadlineDay('nach Vereinbarung'), null);
  assert.equal(C.daysUntil('2026-11-05', new Date(2026, 10, 3, 18)), 2); assert.equal(C.daysUntil('2026-11-01', new Date(2026, 10, 3)), -2);
});
test('profile match: null without settings, transparent reasons, exclusions and must-criteria cap the score', () => {
  const job = C.cleanJob({ ...base, seniority: 'senior', languages: 'DE, FR' });
  const cantonOf = loc => ({ Bern: 'BE', Zürich: 'ZH' })[loc] || null;
  assert.equal(C.profileMatch(job, {}), null);
  assert.equal(C.profileMatch(job, { workload_min: 50, workload_max: 100 }), null, 'untouched defaults are not a profile');
  const profile = { desired_regions: ['BE'], workload_min: 80, workload_max: 100, experience: '5-10', languages: { de: 'muttersprachlich', fr: 'fliessend' }, keywords: 'Datenanalyse', updated_at: '2026-10-01' };
  const good = C.profileMatch(job, profile, { cantonOf });
  assert.equal(good.score, 100); assert.equal(good.level, 'high'); assert.equal(good.compared, 5);
  assert.ok(good.reasons.includes('Arbeitsort in deiner Wunschregion (BE)'));
  const elsewhere = C.profileMatch({ ...job, location: 'Zürich' }, profile, { cantonOf });
  assert.equal(elsewhere.score, 73); assert.ok(elsewhere.reasons.includes('Arbeitsort ausserhalb deiner Wunschregion (ZH)'));
  const unknownPlace = C.profileMatch({ ...job, location: '' }, profile, { cantonOf });
  assert.equal(unknownPlace.score, 100, 'unknown facts are left out instead of counted as misses');
  const excluded = C.profileMatch(job, { ...profile, exclusions_freetext: 'Projektleiter' }, { cantonOf });
  assert.equal(excluded.score, 20); assert.equal(excluded.label, 'Ausschlusskriterium'); assert.match(excluded.reasons[0], /Projektleiter/i);
  const must = C.profileMatch(job, {}, { criteria: [{ field: 'remote_mode', label: 'Arbeitsmodell', value: 'remote', mode: 'must', weight: 3 }] });
  assert.equal(must.score, 0); assert.ok(must.reasons[0].includes('nicht erfüllt'));
});
test('alert preview matching follows the documented sender rules', () => {
  const job = { ...C.cleanJob({ ...base, seniority: 'junior', org_id: 'bag' }), org_ids: ['bag'], categories: ['bund'], relevance: { category: 'Gesundheitsökonomie / HTA' } };
  const ctx = { cantonOf: loc => loc === 'Bern' ? 'BE' : null };
  assert.equal(C.matchesAlert(job, {}, ctx), true);
  assert.equal(C.matchesAlert(job, { q: 'gesundheitsokonomie bern', canton: 'BE', seniority: 'junior', employer: 'bag', category: 'bund', focus: 'Gesundheitsökonomie / HTA', min_workload: 100 }, ctx), true);
  assert.equal(C.matchesAlert(job, { canton: 'ZH' }, ctx), false);
  assert.equal(C.matchesAlert(job, { seniority: 'senior' }, ctx), false);
  assert.equal(C.matchesAlert({ ...job, workload_min: null, workload_max: null }, { min_workload: 80 }, ctx), true, 'jobs without workload stay included');
  assert.equal(C.matchesAlert({ ...job, status: 'closed' }, {}, ctx), false);
});

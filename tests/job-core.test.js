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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ALERT_FOCUS_CATEGORIES, buildOrgIndex, cantonsFromLocation, escapeHtml, isAlertDue, jobCantons,
  jobMatchesFilters, normalizeAlertFilters, renderAlertEmail, selectNewJobs, formatPensum, formatDeadline,
} from '../supabase/functions/_shared/job-alerts.mjs';

const root = new URL('../', import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('data/organizations.json', root), 'utf8'));
const orgIndex = buildOrgIndex(catalog);

const NOW = Date.parse('2026-11-03T06:00:00Z');
const job = (over = {}) => ({
  id: 'bag:1', org_id: 'bag', org_ids: ['bag'], title: 'Gesundheitsökonom/in HTA', organization: 'Bundesamt für Gesundheit BAG',
  url: 'https://jobs.admin.ch/stelle/1', location: 'Bern, Schweiz', workload_min: 80, workload_max: 100, seniority: null,
  deadline: null, first_seen: '2026-11-02T17:20:00Z', status: 'open', description: 'Analysen zur Kostenentwicklung im Gesundheitswesen.',
  relevance: { category: 'Gesundheitsökonomie / HTA' }, ...over,
});
const alert = (over = {}) => ({
  id: 'a1', name: 'Bern HTA', filters: {}, frequency: 'daily', active: true, unsubscribe_token: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  last_sent_at: '2026-11-02T05:47:00Z', created_at: '2026-10-01T00:00:00Z', ...over,
});

test('focus categories stay in sync with js/job-relevance.js', () => {
  const source = readFileSync(new URL('js/job-relevance.js', root), 'utf8');
  for (const category of ALERT_FOCUS_CATEGORIES) assert.ok(source.includes(`'${category}'`), category);
});

test('filters are normalised: unknown keys, empty and invalid values are dropped', () => {
  assert.deepEqual(normalizeAlertFilters({ q: '  HTA ', canton: 'be', seniority: 'boss', evil: 1, min_workload: '80', employer: 'BAG!', focus: '' }),
    { q: 'HTA', canton: 'BE' });
  assert.deepEqual(normalizeAlertFilters(null), {});
  assert.deepEqual(normalizeAlertFilters({ min_workload: 60, employer: 'usz', category: 'spitaeler' }), { min_workload: 60, employer: 'usz', category: 'spitaeler' });
});

test('canton derivation from feed locations and catalog fallback', () => {
  assert.deepEqual([...cantonsFromLocation('Bern, Schweiz, Espace Mittelland (BE, FR, JU, NE, SO), Schweiz')], ['BE']);
  assert.deepEqual([...cantonsFromLocation('Küsnacht ZH, CH')], ['ZH']);
  assert.deepEqual([...cantonsFromLocation('Pfäffikon SZ, CH')], ['SZ']);
  assert.deepEqual([...cantonsFromLocation('Chesières (VD), CH')], ['VD']);
  assert.deepEqual([...cantonsFromLocation('Zürich (Nord), CH')], ['ZH']);
  assert.deepEqual([...cantonsFromLocation('Bodensee - St. Gallen, CH')], ['SG']);
  assert.deepEqual([...cantonsFromLocation('Landquart, Winterthur, Work@Home')].sort(), ['GR', 'ZH']);
  assert.equal(cantonsFromLocation('CH').size, 0);
  assert.deepEqual([...jobCantons(job({ location: 'CH', org_id: 'luks', org_ids: ['luks'] }), orgIndex)], ['LU']);
  assert.deepEqual([...jobCantons(job({ canton: 'ti', location: 'Bern' }), orgIndex)], ['TI']);
});

test('each filter narrows the match; all filters combine with AND', () => {
  const j = job();
  assert.ok(jobMatchesFilters(j, {}, orgIndex));
  assert.ok(jobMatchesFilters(j, { q: 'gesundheitsokonom kosten' }, orgIndex), 'diacritics-insensitive, all words');
  assert.ok(!jobMatchesFilters(j, { q: 'HTA Spital' }, orgIndex));
  assert.ok(jobMatchesFilters(j, { focus: 'Gesundheitsökonomie / HTA' }, orgIndex));
  assert.ok(!jobMatchesFilters(j, { focus: 'Gesundheitsdaten / Analytics' }, orgIndex));
  assert.ok(jobMatchesFilters(j, { category: 'bund' }, orgIndex));
  assert.ok(!jobMatchesFilters(j, { category: 'spitaeler' }, orgIndex));
  assert.ok(jobMatchesFilters(job({ org_id: 'x', org_ids: ['x', 'usz'] }), { category: 'spitaeler', employer: 'usz' }, orgIndex));
  assert.ok(!jobMatchesFilters(j, { employer: 'usz' }, orgIndex));
  assert.ok(jobMatchesFilters(j, { canton: 'BE' }, orgIndex));
  assert.ok(!jobMatchesFilters(j, { canton: 'ZH' }, orgIndex));
  assert.ok(!jobMatchesFilters(j, { seniority: 'senior' }, orgIndex), 'unknown seniority does not match');
  assert.ok(jobMatchesFilters(job({ seniority: 'senior' }), { seniority: 'senior' }, orgIndex));
  assert.ok(jobMatchesFilters(j, { min_workload: 100 }, orgIndex));
  assert.ok(!jobMatchesFilters(job({ workload_min: 40, workload_max: 60 }), { min_workload: 80 }, orgIndex));
  assert.ok(jobMatchesFilters(job({ workload_min: null, workload_max: null }), { min_workload: 80 }, orgIndex), 'unknown workload is kept');
  assert.ok(!jobMatchesFilters(j, { canton: 'BE', category: 'kantone' }, orgIndex));
});

test('due logic for daily and weekly alerts', () => {
  assert.ok(isAlertDue(alert({ last_sent_at: null }), NOW));
  assert.ok(isAlertDue(alert({ last_sent_at: '2026-11-02T05:47:00Z' }), NOW));
  assert.ok(!isAlertDue(alert({ last_sent_at: '2026-11-02T17:00:00Z' }), NOW));
  assert.ok(!isAlertDue(alert({ frequency: 'weekly', last_sent_at: '2026-10-30T05:47:00Z' }), NOW));
  assert.ok(isAlertDue(alert({ frequency: 'weekly', last_sent_at: '2026-10-27T05:47:00Z' }), NOW));
  assert.ok(!isAlertDue(alert({ active: false, last_sent_at: null }), NOW));
  assert.ok(!isAlertDue(alert({ frequency: 'hourly' }), NOW));
});

test('new-since: only jobs first seen after last_sent_at (or created_at), open, deduplicated', () => {
  const jobs = [
    job({ id: 'old', first_seen: '2026-11-01T05:00:00Z', url: 'https://x.ch/old' }),
    job({ id: 'edge', first_seen: '2026-11-02T05:47:00Z', url: 'https://x.ch/edge' }),
    job({ id: 'new1', first_seen: '2026-11-02T17:20:00Z', url: 'https://x.ch/1' }),
    job({ id: 'new1', first_seen: '2026-11-02T17:20:00Z', url: 'https://x.ch/1-dup-id' }),
    job({ id: 'new2', first_seen: '2026-11-03T05:20:00Z', url: 'https://x.ch/1/?utm=a' }),
    job({ id: 'new3', first_seen: '2026-11-03T05:21:00Z', url: 'https://x.ch/3' }),
    job({ id: 'closed', first_seen: '2026-11-03T05:20:00Z', status: 'closed', url: 'https://x.ch/c' }),
    job({ id: 'sent', first_seen: '2026-11-03T05:20:00Z', url: 'https://x.ch/s' }),
    job({ id: 'nodate', first_seen: null, url: 'https://x.ch/n' }),
    { id: 'broken' },
  ];
  const result = selectNewJobs({ jobs, alert: alert(), orgIndex, deliveredIds: ['sent'], now: NOW });
  assert.deepEqual(result.jobs.map(j => j.id), ['new3', 'new1']);
  assert.equal(result.total, 2);
  const fresh = selectNewJobs({ jobs, alert: alert({ last_sent_at: null, created_at: '2026-11-03T00:00:00Z' }), orgIndex, now: NOW });
  assert.deepEqual(fresh.jobs.map(j => j.id).sort(), ['new2', 'new3', 'sent']);
  assert.equal(selectNewJobs({ jobs, alert: alert({ filters: { canton: 'ZH' } }), orgIndex, now: NOW }).total, 0);
});

test('cap per mail keeps the total for "und N weitere"', () => {
  const jobs = Array.from({ length: 30 }, (_, i) => job({ id: `j${i}`, url: `https://x.ch/${i}`, first_seen: new Date(Date.parse('2026-11-03T00:00:00Z') + i * 60e3).toISOString() }));
  const { jobs: picked, total } = selectNewJobs({ jobs, alert: alert(), orgIndex, limit: 25, now: NOW });
  assert.equal(picked.length, 25);
  assert.equal(total, 30);
  assert.equal(picked[0].id, 'j29', 'newest first');
  const mail = renderAlertEmail({ alert: alert(), jobs: picked, total, siteUrl: 'https://site.example/', orgIndex });
  assert.equal(mail.subject, '30 neue Stellen: Bern HTA');
  assert.match(mail.text, /und 5 weitere Stellen/);
  assert.match(mail.html, /und 5 weitere Stellen/);
});

test('rendering escapes untrusted feed text and only links http(s) URLs', () => {
  const evil = job({ title: '<script>alert(1)</script> & "Chef"', organization: 'O\'Reilly <b>AG</b>', url: 'javascript:alert(1)', deadline: '2026-11-30', location: 'Zug' });
  const mail = renderAlertEmail({ alert: alert({ name: 'Mein <Alarm>\n' }), jobs: [evil], siteUrl: 'https://site.example', orgIndex });
  assert.ok(!mail.html.includes('<script>'));
  assert.ok(mail.html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Chef&quot;'));
  assert.ok(mail.html.includes('O&#39;Reilly &lt;b&gt;AG&lt;/b&gt;'));
  assert.ok(!mail.html.includes('javascript:'));
  assert.ok(!mail.text.includes('javascript:'));
  assert.equal(mail.subject, '1 neue Stelle: Mein <Alarm>');
  assert.ok(mail.html.includes('<title>1 neue Stelle: Mein &lt;Alarm&gt;</title>'));
  assert.match(mail.text, /Bewerbungsfrist: 30\.11\.2026/);
  assert.match(mail.text, /80–100%/);
  assert.equal(escapeHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
});

test('mail contains manage and token unsubscribe links, German wording without ß', () => {
  const mail = renderAlertEmail({ alert: alert({ filters: { canton: 'BE', category: 'bund', min_workload: 80 } }), jobs: [job()], siteUrl: 'https://site.example/app/', orgIndex });
  assert.equal(mail.unsubscribeUrl, 'https://site.example/app/#abmelden-7c9e6679-7425-40de-944b-e07fc1f90ae7');
  assert.equal(mail.manageUrl, 'https://site.example/app/#jobalarme');
  for (const body of [mail.html, mail.text]) {
    assert.ok(body.includes(mail.unsubscribeUrl));
    assert.ok(body.includes(mail.manageUrl));
    assert.ok(body.includes('https://jobs.admin.ch/stelle/1'));
    assert.ok(!body.includes('ß'));
  }
  assert.match(mail.text, /Kanton BE/);
  assert.match(mail.text, /Bund \/ bundesnahe Institutionen/);
  assert.match(mail.text, /Pensum ab 80%/);
  assert.equal(formatPensum({ pensum: '60 - 80 %' }), '60 - 80 %');
  assert.equal(formatPensum({ workload_min: 50, workload_max: 50 }), '50%');
  assert.equal(formatDeadline('2026-12-01T00:00:00Z'), '01.12.2026');
});

test('employer category and canton combine for hospital jobs', () => {
  const jobs = [job(), job({ id: 'kssg:1', org_id: 'kssg', org_ids: ['kssg'], location: 'St. Gallen, CH', relevance: { category: 'Management / Controlling Gesundheit' } })];
  const result = selectNewJobs({ jobs, alert: alert({ filters: { category: 'spitaeler', canton: 'SG' } }), orgIndex, now: NOW });
  assert.deepEqual(result.jobs.map(j => j.id), ['kssg:1']);
});

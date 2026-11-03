const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const F = require('../js/job-facts.js');
const ref = '2026-11-03T10:00:00.000Z';
const facts = (description, extra = {}) => F.extractFacts({ title: 'Wissenschaftliche/r Mitarbeiter/in', description, fetched_at: ref, ...extra }, extra.org);

test('application deadlines in German, French and English date formats', () => {
  assert.equal(facts('Bewerbungsfrist: 15. November 2026').deadline, '2026-11-15');
  assert.equal(facts('Bitte bewerben Sie sich bis spätestens 11.12.2026 online.').deadline, '2026-12-11');
  assert.equal(facts('Bewerbungen bis 5.1.27 an hr@example.ch').deadline, '2027-01-05');
  assert.equal(facts('Date limite de postulation : 30 novembre 2026').deadline, '2026-11-30');
  assert.equal(facts('Délai de postulation: 1er décembre 2026').deadline, '2026-12-01');
  assert.equal(facts('Application deadline: November 20, 2026').deadline, '2026-11-20');
  assert.equal(facts('deadline: 30 November 2026; first interviews in December').deadline, '2026-11-30');
  // Missing year: the next plausible occurrence after the observation date.
  assert.equal(facts('Anmeldeschluss 15. Januar').deadline, '2027-01-15');
  // JSON-LD validThrough is kept when plausible, ignored when it is a machine default.
  assert.equal(facts('Keine Frist im Text.', { deadline: '2026-11-20' }).deadline, '2026-11-20');
  assert.equal(facts('Keine Frist im Text.', { deadline: '2036-10-17' }).deadline, null);
  assert.equal(facts('Wir freuen uns auf Ihre Bewerbung.').deadline, null);
});

test('start dates: explicit dates, immediately and by agreement', () => {
  assert.equal(facts('Stellenantritt: 1. Januar 2027').start_date, '2027-01-01');
  assert.equal(facts('Eintritt per sofort oder nach Vereinbarung').start_date, 'sofort');
  assert.equal(facts('Wir suchen per sofort oder nach Vereinbarung eine Fachperson').start_date, 'sofort');
  assert.equal(facts('Eintrittsdatum : 1. Februar 2027 oder nach Vereinbarung').start_date, '2027-02-01');
  assert.equal(facts('Arbeitsbeginn: 01.03.2027').start_date, '2027-03-01');
  assert.equal(facts('Wir suchen per 1. März 2027 eine Projektleitung.').start_date, '2027-03-01');
  assert.equal(facts('Entrée en fonction : à convenir').start_date, 'nach Vereinbarung');
  assert.equal(facts('Eintritt: nach Vereinbarung').start_date, 'nach Vereinbarung');
  assert.equal(facts('Start date: as soon as possible').start_date, 'sofort');
  assert.equal(facts('Homeoffice nach Vereinbarung möglich.').start_date, null);
});

test('seniority uses one value set and maps the legacy entry value', () => {
  assert.deepEqual([...F.SENIORITY], ['praktikum', 'trainee', 'junior', 'senior', 'lead', 'phd']);
  const cases = {
    'PhD-Doktorand:in Versorgungsforschung': 'phd', 'Hochschulpraktikant/-in Heilmittelrecht': 'praktikum', 'Internship Market Access': 'praktikum',
    'Trainee Health Economics': 'trainee', 'Junior Data Analyst': 'junior', 'Leiter/-in Versorgungssicherheit': 'lead',
    'Head of Market Access': 'lead', 'Teamleiter:in Leistungscontrolling': 'lead', 'Senior Health Economist': 'senior',
    'Senior Projektleiter Gesundheit': 'senior', 'Projektleiter/in Tarife': null, 'Wissenschaftliche/r Mitarbeiter/in': null
  };
  for (const [title, expected] of Object.entries(cases)) assert.equal(F.normalizeSeniority(title), expected, title);
  assert.equal(F.normalizeSeniority('Praktikum Business Development', 'entry'), 'praktikum');
  assert.equal(F.normalizeSeniority('Fachperson Tarife', 'entry'), 'praktikum');
  assert.equal(F.normalizeSeniority('Fachperson Tarife', 'senior'), 'senior');
});

test('federal pay classes map to the official 2026 maxima; explicit CHF amounts are captured', () => {
  const federal = facts('Aufgaben ... Lohnklasse 23', { url: 'https://jobs.admin.ch/offene-stellen/x/2ce6bb8c-70e0-4779-bdaf-defec5367c38' });
  assert.equal(federal.salary_hint, 'Lohnklasse 23');
  assert.deepEqual(federal.salary_range, { min: null, max: 149807, currency: 'CHF', period: 'year', source: 'Lohnklasse 23 (Bund)' });
  assert.equal(facts('', { salary_hint: 'Lohnklasse 24', url: 'https://jobs.admin.ch/offene-stellen/y/z' }).salary_range.max, 158954);
  assert.equal(facts('Lohnklassen 20-22', { hiring_organization: 'Bundesamt für Gesundheit BAG' }).salary_range.source, 'Lohnklassen 20–22 (Bund)');
  // A cantonal pay class is reported, but never converted with the federal table.
  const cantonal = facts('Lohnklasse 18 gemäss kantonalem Reglement', { url: 'https://stellen.lu.ch/job/1' });
  assert.equal(cantonal.salary_hint, 'Lohnklasse 18');
  assert.equal(cantonal.salary_range, null);
  assert.equal(F.BUND_LOHNKLASSEN_2026.length, 39);
  assert.equal(F.BUND_LOHNKLASSEN_2026[1], 66517);
  assert.equal(F.BUND_LOHNKLASSEN_2026[38], 405656);
  assert.deepEqual(facts('Salaire: CHF 90’000 – 110’000 brut par an').salary_range, { min: 90000, max: 110000, currency: 'CHF', period: 'year', source: 'Inserat' });
  assert.equal(facts('Lohn: 95 000 bis 120 000 Fr.').salary_hint, "CHF 95'000–120'000 pro Jahr");
  assert.equal(facts('Lohn CHF 7’500.– pro Monat (13 Monatslöhne)').salary_range.period, 'month');
  assert.equal(facts('Kinderzulage CHF 50 per child; Weiterbildungsbudget CHF 2’000 pro Jahr').salary_range, null);
  assert.equal(facts('', { salary_hint: 'Keine Angabe' }).salary_hint, null);
});

test('canton codes from locations in several languages', () => {
  assert.equal(Object.keys(F.CANTONS).length, 26);
  assert.equal(F.CANTONS.VD, 'Waadt');
  const cases = { Bern: 'BE', 'Bern, Schweiz, Espace Mittelland (BE, FR, JU, NE, SO), Schweiz': 'BE', Lausanne: 'VD', 'Genève': 'GE', Genf: 'GE',
    'Zürich (Nord), CH': 'ZH', 'Chesières (VD), CH': 'VD', 'Basel': 'BS', 'Liestal': 'BL', 'St. Gallen': 'SG', 'Luzern / hybrid, Region Zentralschweiz, Schweiz': 'LU',
    'Opfikon': 'ZH', 'Liebefeld, Schweiz': 'BE', 'Lugano': 'TI', 'Sion': 'VS', 'Neuchâtel': 'NE', 'Home-Office': null, 'CH': null, '': null };
  for (const [location, code] of Object.entries(cases)) assert.equal(F.cantonFromLocation(location), code, location);
  assert.equal(F.extractFacts({ title: 'x', description: '', location: '' }, { loc: 'Basel' }).canton, 'BS');
});

test('one jobs.ch posting in several languages and repeated postings collapse to one entry', () => {
  const base = { org_id: 'kvg', organization: 'Insel Gruppe', title: 'Data Scientist (80-100%)', location: 'Bern, CH', description: 'Kurz.', first_seen: '2026-10-01T00:00:00Z', last_seen: '2026-11-01T00:00:00Z' };
  const jobs = [
    { ...base, id: 'kvg:1', url: 'https://www.jobs.ch/de/stellenangebote/detail/f6bacf9a-27d3-432a-9aea-89d33a864a1b' },
    { ...base, id: 'kvg:2', url: 'https://www.jobs.ch/fr/offres-emplois/detail/f6bacf9a-27d3-432a-9aea-89d33a864a1b', first_seen: '2026-09-15T00:00:00Z' },
    { ...base, id: 'insel:3', org_id: 'insel', url: 'https://www.jobs.ch/en/vacancies/detail/11111111-2222-3333-4444-555555555555', title: 'Data Scientist (w/m/d) 80–100 %', deadline: '2026-11-30' },
    { ...base, id: 'kvg:4', url: 'https://www.jobs.ch/de/stellenangebote/detail/99999999-2222-3333-4444-555555555555', title: 'Business Analyst' }
  ];
  assert.equal(F.canonicalJobKey(jobs[0].url), F.canonicalJobKey(jobs[1].url));
  assert.equal(F.canonicalJobKey('https://example.ch/de/jobs/12?lang=de'), F.canonicalJobKey('https://example.ch/fr/jobs/12?lang=fr'));
  const result = F.dedupeJobs(jobs);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'insel:3', 'the more complete record wins between equally new postings');
  assert.deepEqual(result[0].org_ids, ['insel', 'kvg']);
  assert.equal(result[0].first_seen, '2026-09-15T00:00:00Z');
  assert.deepEqual(result[0].duplicate_ids.sort(), ['kvg:1', 'kvg:2']);
  assert.equal(result[1].id, 'kvg:4');
  // Same generic title at the same employer but clearly different full texts stays separate.
  const long = text => text.repeat(40);
  const distinct = F.dedupeJobs([
    { ...base, id: 'a', url: 'https://bag.example/a', title: 'Wissenschaftliche/r Mitarbeiter/in', description: long('Arzneimittelvergütung Spezialitätenliste Preisüberprüfung ') },
    { ...base, id: 'b', url: 'https://bag.example/b', title: 'Wissenschaftliche/r Mitarbeiter/in', description: long('Übertragbare Krankheiten Surveillance Meldesystem Epidemiologie ') }
  ]);
  assert.equal(distinct.length, 2);
  assert.deepEqual(F.dedupeJobs(null), []);
});

test('browser build exposes the same API without module globals', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'job-facts.js'), 'utf8'), context);
  const api = vm.runInContext('globalThis.HealthJobFacts', context);
  assert.equal(typeof api.extractFacts, 'function');
  assert.equal(typeof api.dedupeJobs, 'function');
  assert.equal(api.extractFacts({ title: 'Head of HEOR', description: 'Bewerbungsfrist: 1.12.2026', location: 'Basel', fetched_at: ref }).canton, 'BS');
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = require('../js/job-relevance.js');
const job = (title, description = '', org_id = 'usz') => ({ title, description, org_id });

test('explicit health economics and HTA titles are in the core category', () => {
  for (const title of ['Gesundheitsökonom/in', 'Senior Health Economist', 'HEOR Research Analyst', 'HTA-Projektleitung', 'Gesundheitsoekonom']) {
    const x = R.classify(job(title, '', 'unknown'));
    assert.equal(x.eligible, true, title);
    assert.equal(x.category, R.CATEGORIES[0]);
    assert.equal(x.policy_version, 1);
    assert.ok(x.reasons.length && x.reasons.every(reason => typeof reason === 'string'));
    assert.equal('score' in x, false);
  }
});

test('actual reimbursement tasks can qualify an otherwise generic scientific title', () => {
  const x = R.classify(job('Wissenschaftliche/r Mitarbeiter/in Sektion Arzneimittelüberprüfungen periodisch',
    'Aufgaben\nFragen der Arzneimittelvergütung beurteilen. Grundlagen hinsichtlich pharmaökonomischer Fragestellungen erarbeiten.\nAnforderungen\nHochschulstudium der Pharmazie oder abgeschlossenes Studium mit Weiterbildung im Arzneimittelbereich.', 'bag'));
  assert.equal(x.eligible, true); assert.equal(x.category, R.CATEGORIES[0]);
});

test('health policy includes reimbursement, statutory work and supply planning', () => {
  const cases = [
    job('Market Access Manager', '', 'unknown'),
    job('Leiter/-in Versorgungssicherheit', 'Aufgaben\nVolksinitiative zur medizinischen Versorgungssicherheit und Rechtsetzungsarbeiten verantworten.', 'bag'),
    job('Jurist/-in Digitalisierung und Recht', 'Aufgaben\nRechtsetzungsgeschäfte bearbeiten. Digitale Transformation im Gesundheitsbereich juristisch beraten.', 'bag'),
    job('Leistungsmanager:in', 'Aufgaben\nIn Tarif- und Leistungserfassungsfragen beraten. Einführung des neuen ambulanten Tarifsystems begleiten.', 'insel')
  ];
  for (const j of cases) { const r = R.classify(j); assert.equal(r.eligible, true, j.title); assert.equal(r.category, R.CATEGORIES[1], j.title); }
});

test('population research and genuine health data analysis qualify', () => {
  for (const title of ['Epidemiologe/-in', 'Postdoc Versorgungsforschung', 'Researcher Public Health', 'One Health Delegierte']) {
    assert.equal(R.classify(job(title)).category, R.CATEGORIES[2]);
  }
  for (const title of ['Health Data Analyst', 'Data Engineer Medical Data Products', 'Hochschulpraktikant/-in Data Management']) {
    assert.equal(R.classify(job(title)).category, R.CATEGORIES[5]);
  }
});

test('nonclinical hospital economics and healthcare project work qualify', () => {
  const cases = [
    job('Institutsmanager:in Radiologie', 'Aufgaben\nBetriebswirtschaftliche Führung, Budgetanalyse und Controlling.\nAnforderungen\nBetriebswirtschaftsstudium.'),
    job('Senior Controller/in', 'Finanzplanung und wirtschaftliche Steuerung der Zulassungsbehörde.', 'swissmedic'),
    job('Administrative Standortleitung Ortho/Trauma', 'Aufgaben\nLeitung des administrativen Teams. Leistungsabrechnung sicherstellen.\nAnforderungen\nBetriebswirtschaftsstudium.', 'usb')
  ];
  for (const j of cases) assert.equal(R.classify(j).category, R.CATEGORIES[4], j.title);
  assert.equal(R.classify(job('Projektleitung Gesundheitsversorgung')).category, R.CATEGORIES[3]);
  assert.equal(R.classify(job('Teilprojektleitende:r Epic', 'Aufgaben\nEinführung des Klinikinformationssystems; klinische Prozesse vereinheitlichen.')).category, R.CATEGORIES[3]);
});

test('clinical professionals and clinical leadership remain excluded despite management language', () => {
  for (const title of ['Pflegefachperson', 'Teamleiter:in Pflege', 'Oberärztin / Oberarzt', 'Leitende Ärztin / Leitender Arzt', 'Stationsleitung', 'Fachfrau Gesundheit', 'Physiotherapeut/in', 'Teamleitung Ernährungsberatung', 'Hebamme oder Study Nurse', 'Leitung IVF-/Andrologielabor', 'Teamleiter Gesundheit', 'Psychologin Public Health', 'Pflegefachperson mit Schwerpunkt Gesundheitsökonomie', 'Spezialist Vertrauensärztlicher Dienst', 'Obligatorisches Krankenpflege-Praktikum Neurochirurgie']) {
    const x = R.classify(job(title, 'Gesundheitsmanagement, Strategie, Controlling und Projektmanagement gehören zu unseren Kernaufgaben.'));
    assert.equal(x.eligible, false, title);
  }
});

test('a reference to physician practices does not turn a health economist into a clinician', () => {
  assert.equal(R.classify(job('Gesundheitsökonom für Arztpraxen')).eligible, true);
});

test('hospital services, administration, sales, HR and payroll do not qualify', () => {
  for (const title of ['Payroll Specialist', 'Fachverantwortliche:r HR-Prozesse & Projekte', 'Teamleitung Time-Management', 'Leiterin Sekretariat', 'Mitarbeiter Empfang', 'Projektleitung Facility Management', 'Projektleiterin strategische Immobilienentwicklung', 'Junior Projektleiter/in Facility Management', 'Koch', 'Agenturleiter/in', 'Kundenberaterin', 'Leiter Patientenadministration', 'Sachbearbeiter Leistungsprüfung', 'Mediamatiker/in']) {
    assert.equal(R.classify(job(title, 'Arbeiten für das Gesundheitssystem. Gesundheitsdaten, Controlling und Projekte.')).eligible, false, title);
  }
});

test('generic IT operation and communication do not become health economics at a hospital', () => {
  const cases = [
    job('IT Application Manager:in CRM'), job('Data Platform Engineer'), job('Applikationsentwickler/in Datawarehouse'),
    job('Teilprojektleitende:r Technologie Epic', 'Einführung eines Klinikinformationssystems.'),
    job('Wirtschaftsinformatiker:in Prozessmanagement', 'Verantwortung für IT-Prozesse und IT Service Management.'),
    job('Business Analyst', 'Aufgaben\nDie digitale Kommunikation weiterentwickeln und die Webplattform durch UX-Methoden verbessern.', 'bag'),
    job('Projektmanager', 'Aufgaben\nIT-Infrastruktur und ServiceNow Prozesse betreuen.\nAnforderungen\nITIL Kenntnisse.')
  ];
  for (const j of cases) assert.equal(R.classify(j).eligible, false, j.title);
});

test('other insurance business lines are excluded even under a healthcare employer', () => {
  const x = R.classify(job('Strategic Product Manager',
    'Aufgaben\nTransformationsprojekte steuern und neue Geschäftsmöglichkeiten der Allbranchenversicherung entwickeln.\nAnforderungen\nBetriebswirtschaftliche Ausbildung.\nÜber den Arbeitgeber\nWir gestalten die Zukunft des Gesundheitswesens.', 'visana'));
  assert.equal(x.eligible, false);
});

test('benefits, employer boilerplate and catalog descriptions do not establish topic', () => {
  const description = 'Aufgaben\nArmutsmonitoring und allgemeine Sozialstatistik analysieren.\nAnforderungen\nÖkonomie oder Sozialwissenschaften.\nAngebot\nGesund am Arbeitsplatz. Wir unterstützen die Gesundheit.\nÜber den Arbeitgeber\nGesundheitspolitik, Gesundheitsdaten und Public Health.';
  const org = { id: 'bsv', name: 'Bundesamt für Sozialversicherungen', desc: 'Gesundheitspolitik, Gesundheitsmanagement, Gesundheitsdaten.' };
  assert.equal(R.classify(job('Wissenschaftliche/r Mitarbeiter/in', description, 'bsv'), org).eligible, false);
  assert.equal(R.classify(job('Data Analyst', description, 'bfs'), { id: 'bfs', name: 'Bundesamt für Statistik', desc: 'Gesundheitsstatistiken' }).eligible, false);
  assert.equal(R.classify(job('Projektleiter/in Verkehrsplanung', description, 'so')).eligible, false);
});

test('degree requirements alone do not turn unrelated research into public health', () => {
  assert.equal(R.classify(job('Wissenschaftliche Mitarbeiterin', 'Aufgaben\nAdministrative Bewilligungen bearbeiten.\nAnforderungen\nMaster Public Health, Pharmazie oder Medizin.', 'bag')).eligible, false);
  assert.equal(R.classify(job('Fachspezialist medizinische Leistungsbeurteilung', 'Aufgaben\nMedizinische Berichte und Leistungsanträge der Krankenversicherung analysieren.\nAnforderungen\nParamedizinische Ausbildung.', 'swica')).eligible, false);
  assert.equal(R.classify(job('Spezialistin', 'So gestaltest du Gesundheit mit\nInterne Abläufe dokumentieren.\nDas zeichnet dich aus\nErfahrung mit Verwaltung.\nWarum SWICA\nBetriebliches Gesundheitsmanagement und Gesundheitsförderung.', 'swica')).eligible, false);
});

test('an old truncated employer introduction cannot qualify an unrelated PhD', () => {
  const j = { ...job('PhD-Stelle: Klinische Pädiatrische Adipositasforschung & Kardiovaskuläre Phänotypisierung',
    'Die Insel Gruppe bildet das grösste medizinische Vollversorgungssystem der Schweiz. Im Gesundheitswesen fördern wir Forschung und Datenanalysen.', 'insel'), description_truncated: true };
  assert.equal(R.classify(j).eligible, false);
});

test('clinical case and trial coordination stay outside this subject profile', () => {
  for (const j of [
    job('Case Managerin / Case Manager', 'Aufgaben\nPatienten beraten, Austritte und Verlegungen planen.\nAnforderungen\nAbgeschlossene Ausbildung als Pflegefachperson HF/FH.'),
    job('Mitarbeiter*in Klinische Forschung (Monitoring/Projektmanagement)', 'Aufgaben\nStudienvisiten und Rekrutierung von Studienteilnehmenden.\nAnforderungen\nBerufserfahrung im Monitoring.'),
    job('Forschungskoordinatorin Radioonkologie', 'Aufgaben\nStudienvisiten koordinieren und Studiendaten dokumentieren.'),
    job('PhD Klinische Pädiatrische Adipositasforschung', 'Untersuchung der kardiovaskulären Phänotypisierung.')
  ]) assert.equal(R.classify(j).eligible, false, j.title);
});

test('mandatory nursing credentials override a controlling title in a real PDF vacancy', () => {
  const j = job('Fachspezialist/-in Pflegecontrolling 50 – 60%',
    'Ihr Verantwortungsbereich:\nPrüfung von Spitexverordnungen und Bedarfsabklärungen.\nBeurteilung von Pflegeplanungen und Leistungsnachweisen.\nÜberprüfung der WZW-Kriterien.\nAnalyse von Auffälligkeiten und Entwicklung von Kontrollprozessen.\nDas bringen Sie mit:\nDiplom Pflegefachfrau/-mann HF/FH und mehrjährige Berufserfahrung in der Spitex\nKenntnisse InterRAI HC und Bedarfsabklärungen\nErfahrung im Case Management oder Leistungsmanagement von Vorteil\nDas dürfen Sie von uns erwarten:\nInnovative Produkte im Gesundheitswesen.', 'egk');
  const r = R.classify(j);
  assert.equal(r.eligible, false);
  assert.match(r.reasons[0], /klinische Berufsqualifikation/);
  assert.equal(R.classify({ ...j, requirements: 'Diplom Pflegefachfrau HF/FH.' }).eligible, false);
});

test('optional nursing credentials and explicit economics alternatives do not block management roles', () => {
  for (const requirements of [
    'Diplom Pflegefachfrau HF/FH oder abgeschlossenes Studium in Betriebswirtschaft.',
    'Diplom Pflegefachfrau HF/FH ist von Vorteil.',
    'Abgeschlossenes Studium Betriebswirtschaft. Pflegefachliche Kenntnisse sind wünschenswert.'
  ]) assert.equal(R.classify({ ...job('Fachspezialist Pflegecontrolling', 'Strategisches Leistungscontrolling im Gesundheitswesen.', 'egk'), requirements }).eligible, true, requirements);
});

test('FMH tariff role requiring a medical degree is excluded despite its health-economics tasks', () => {
  const j = job('Experte/-in Stationäre Versorgung und Tarife (60 - 100 %)',
    'Was Sie bewegen\nSie erarbeiten Stellungnahmen zu stationären Tarifstrukturen und gesundheitsökonomischen Themen.\nWas Sie auszeichnet\nHochschulabschluss in Medizin sowie fundierte Berufserfahrung\nInteresse an Finanzierungs- und Tarifierungssystemen im Gesundheitswesen\nIdealerweise Erfahrung in Kodierung CHOP/ICD\nDarauf können Sie sich freuen\nEine verantwortungsvolle Aufgabe.', 'fmh');
  assert.equal(R.classify(j).eligible, false);
  assert.match(R.classify(j).reasons[0], /klinische Berufsqualifikation/);
  assert.equal(R.classify({ ...job('Epidemiologe/-in'), requirements: 'Akademischer Abschluss in Medizin oder Naturwissenschaften mit Weiterbildung in Epidemiologie oder Public Health.' }).eligible, true);
  assert.equal(R.classify({ ...job('Projektleitung Gesundheitsversorgung'), requirements: 'Masterabschluss in Medizin, Sozialwissenschaften, Public Health oder einem verwandten Fachgebiet.' }).eligible, true);
});

test('school internships and apprenticeships are distinct from graduate internships', () => {
  for (const title of ['WMS/HMS-Praktikant/-in Vollzug Gesundheitsberufe', 'Lernende ICT-Fachfrau', 'Duales Studium BWL-Gesundheitsmanagement']) {
    assert.equal(R.classify(job(title)).eligible, false, title);
  }
  assert.equal(R.classify(job('Hochschulpraktikant:in Health Data Analyst')).eligible, true);
});

test('unknown and ambiguous roles fail closed, ignoring claimed category and score', () => {
  for (const j of [null, {}, job('Mitarbeiter'), job('Projektleitung'), { ...job('Empfang'), role: 'Gesundheitsökonomie / HTA', relevance: { eligible: true }, score: 100 }]) {
    const r = R.classify(j); assert.equal(r.eligible, false); assert.equal(r.category, 'Ausserhalb des fachlichen Profils');
  }
});

test('browser global and Node entry point produce the same policy result', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/job-relevance.js'), 'utf8'), context);
  const input = job('Gesundheitsökonom/in');
  assert.deepEqual(JSON.parse(JSON.stringify(context.HealthJobRelevance.classify(input))), R.classify(input));
  assert.equal(context.HealthJobRelevance.POLICY_VERSION, R.POLICY_VERSION);
});

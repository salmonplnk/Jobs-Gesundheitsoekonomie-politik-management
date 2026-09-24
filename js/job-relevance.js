/* Shared, deterministic subject filter. This is not a personal suitability score. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HealthJobRelevance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const POLICY_VERSION = 1;
  const CATEGORIES = Object.freeze([
    'Gesundheitsökonomie / HTA', 'Gesundheitspolitik / Tarife',
    'Versorgungsforschung / Public Health', 'Projektmanagement Gesundheit',
    'Management / Controlling Gesundheit', 'Gesundheitsdaten / Analytics'
  ]);
  const OUTSIDE = 'Ausserhalb des fachlichen Profils';
  const clean = value => (typeof value === 'string' ? value : Array.isArray(value) ? value.join(' ') : '')
    .slice(0, 60000).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f\u00ad\u200b]/g, '')
    .replace(/ß/g, 'ss').replace(/&amp;/g, ' und ').replace(/<[^>]*>/g, ' ').replace(/[‐‑–—]/g, '-');
  const healthOrgs = new Set(('bag kvg obsan swissmedic gdk suva atupri concordia css groupemutuel helsana kpt oekk sanitas swica visana assura egk curafutura fmh hplus interpharma oaat santesuisse spitex pharmasuisse sbk chuv hirslanden insel ksa kssg ksw luks smn soh spitalwallis usb usz hug ksgr careum swisstph unilu wig zhaw alzheimer diabetes gfs krebsliga lungenliga pflegewegweiser rheumaliga suchtschweiz').split(' '));
  // Broad administrations, universities and insurers with several business lines are
  // intentionally not inferred from catalog descriptions (e.g. all cantonal jobs).
  const healthEmployer = /gesundheits(?:amt|departement|direktion|versicherung|observatorium)|bundesamt fur gesundheit|kranken(?:kasse|versicherung|haus)|(?:universitats|kantons)?spital|hospital|hopital|clinique|health (?:department|insurance|institute)|swissmedic|ins(?:el ?gruppe|elspital)|public health institute/;
  const economic = /gesundheits[oö]konom|gesundheitsoekonom|health econom|health,?\s+policy,?\s+and\s+economics|pharma[oö]konom|pharmacoeconom|\bheor\b|health technology assessment|\bhta\b|cost[- ]effectiveness|kosten[- ](?:wirksamkeit|nutzen)|economic evaluation|budget impact/;
  const policy = /gesundheitspolit|health polic|politique de sante|sante publique|gesundheitsrecht|heilmittelrecht|heilmittelgesetz|krankenversicherungsrecht|arzneimittelrecht|arzneimittelvergutung|leistungspflicht fur arzneimittel|spezialitatenliste|spitalplanung|versorgungsplanung|medizinische[nr]? versorgungssicherheit|\bmarket access\b|reimbursement|remboursement|\b(?:tarmed|tardoc|swissdrg|tarife|tarifmanagement|tarifstruktur|tarifsystem|tarifvertrag|tarifverhandlung|tarifierung)\w*|humanforschungs(?:gesetz|recht)|stammzellforschungsgesetz/;
  const publicHealth = /versorgungsforsch|health services research|public health|population health|one health|epidemiolog|gesundheitsberichterstattung|gesundheitsmonitoring|praventionsforsch|prevention research|gesundheitsforderung|prevention et promotion|surveillance|uberwachung(?:ssysteme)?[^.\n]{0,90}(?:krankheit|infektion|antibiotika)|antibiotikaresistenzuberwachung/;
  const healthDomain = /gesundheits(?:wesen|system|versorgung|politik|daten|bereich|wissenschaft|forderung|management|okonom)|health ?care|health (?:system|services|data|management|econom|polic)|medical data|klinische(?:n)? (?:daten|prozesse)|medizinische(?:n|r)? (?:daten|versorgung)|patient(?:en|innen)?(?:versorgung|sicherheit|prozesse|pfade|daten)|spital(?:planung|finanzierung|prozesse|organisation)|krankenversicherung|soins de sante|systeme de sante|ehealth|e-health|digisante|klinikinformationssystem|\bzkis\b/;
  const researchRole = /\bwissenschaftlich|research|forsch|phd|doctoral|postdoc|doktorand|epidemiolog|statisti|analyst|analyse|spezialist|fachperson|referent|praktik|consultant|berater/;
  const projectRole = /projekt(?:leit|manage|koord|mitarbeit|verantwort)|project (?:manag|lead|coordinat|officer)|programm(?:leit|manage|koord)|program(?:me)? (?:manag|lead)|process manag|prozessmanage|qualitatsmanage|quality manag|digital(?:e |isierungs)?transformation/;
  const managementRole = /controll|betriebswirtschaft|business (?:develop|analys)|unternehmensentwick|strategie|strategic|geschaftsfuhr|institutsmanage|klinikmanage|spitalmanage|health(?:care)? manage|gesundheitsmanage|management im gesundheitswesen|betriebsleit|geschaftsleit|direktor|director|chief (?:executive|operating|financial)|\b(?:ceo|coo|cfo)\b|administrative standortleitung|leistungen[^\n]{0,20}finanzen|leistungsmanage|medizincontroll/;
  const dataRole = /\bdata ?(?:analyst|scientist|science|analytics|engineer|management|manager)|daten(?:analys|wissenschaft|manage|auswert)|biostatist|statistiker|statistician|business intelligence|health informatics|gesundheitsdaten/;
  const clinicalTitle = /\barzt(?:in)?\b|(?:ober|assistenz|fach|chef|kantons|forschungs|vertrauens)arzt|\bmedecin|physician|\bnurs(?:e|ing)\b|krankenpflege|pflege[- ]praktik|pflegefach|pflegeexpert|pflegeassist|pflegehel|pflegehilfe|fach(?:frau|mann|person)[^\n]{0,12}gesundheit|\bfage\b|\b(?:mpa|mtra)\b|medizinische[^\n]{0,18}(?:praxis|assistenz)|therapeut|therapie|hebamme|sage[- ]femme|midwife|logopad|orthopt|radiologiefach|biomedizinische[^\n]{0,15}analyt|laborant|op[- ]technik|operationsfach|ernahrungsberat|psycholog|psychotherap|rettungssanitat|patientenbetreu/;
  const clinicalLeadership = /(?:leitung|leiter|lead|head|responsable)[^\n]{0,45}(?:pflege|station|intensiv|ambulatorium|operations|op[- ]|endoskopie|labor|gesundheitsberatung)|(?:stations|pflege|labor|bereichs)leitung|teamleit[^\n]{0,25}(?:pflege|ernahrung|radiologie)|leitung (?:dermato|sozialdienst)|teamleiter gesundheit/;
  const unrelatedRole = /administrative?[nrsm/ -]* assisten|studienadministration|studiensekretariat|prufungsverwaltung|payroll|lohnbuch|lohn(?:administration|spezialist)|human resource|\bhr[- :]|\bhr\b|recruit|personal(?:administration|sachbearbeit|dienst|referent)|time[- ]management|zeitwirtschaft|sekretariat|sekretar|rezeption|empfang|reception|hotellerie|kuche|koch|kuchin|gastronom|restaurant|reinigung|logistik|haus(?:dienst|wart|technik)|gebaude|facility|immobilien|areal[- ]|standortentwicklung|bauleiter|bauprojekt|unterhalt|verkehrsplan|strassenbau|gewasserschutz|landwirtschaft|staatsanwalt|gericht|kanzlei|\bkesb\b|berufsbeistand|kundenberat|verkaufs|vertrieb|agenturleiter|generalagentur|call[- ]center|contact[- ]center|mediamat|marketing|kommunikationsdesign|patienten(?:administration|aufnahme|empfang)|patienten und kurierservices|direktionsassisten|assistenz leitung|assistent[^\n]{0,12}leitung|sachbearbeit|leistungspruf|schaden[^\n]{0,12}versicherung/;
  const technicalRole = /(?:it|ict)[ -](?:support|service|system|infrastruktur)|service ?desk|help ?desk|desktop|network engineer|system engineer|systemadministrator|sysadmin|applikationsmanage|application manager|software (?:engineer|develop)|applikationsentwick|informatiker|datenbank[- ]spezialist|\bietl\b|identity and access|coredata automation|leitsystemtechnik|data platform engineer|technologie epic/;
  const juniorEducation = /\blehr(?:stelle|ling|beruf)|\blernende|\b(?:wms|hms)\b|schnupper|duales studium|dual study|ausbildungsplatz/;
  const unrelatedDomain = /allbranchenversicherung|sachversicherung|motorfahrzeug|landwirtschaft|gewasserschutz|strassenbau|verkehrsplanung|immobilienentwicklung|gebaudebau|bauprojekte|facility management|portfolio[- ]management[^.\n]{0,30}immobilien/;

  function jobSections(job) {
    const full = clean(job.description);
    // Benefits and employer introductions must not create topical evidence. The
    // adapters preserve section headings; generic HTML extraction preserves lines.
    const cutoff = /(?:^|\n)\s*(?:angebot|unser angebot(?: an dich)?|dafur stehen wir|this is what we stand for|uber uns|wir bieten(?: ihnen| dir)?|warum [^\n]{1,60}|was wir (?:dir|ihnen) bieten|das durfen sie von uns erwarten|darauf konnen sie sich freuen|deine vorteile|ihre vorteile|benefits|uber den arbeitgeber|(?:\w+ ){0,4}als arbeitgeber(?:in)?|kontakt|weitere informationen)\s*(?:\n|:|$)/m;
    const body = full.split(cutoff)[0];
    const requirementHeading = /(?:^|\n)\s*(?:anforderungen|profil|ihr profil|dein profil|das bring(?:en sie|st du) mit|das zeichnet dich aus|was sie mitbringen|was sie auszeichnet|was du fur diese stelle mitbringst|your profile|requirements|qualifications)\s*(?:\n|:|$)/m;
    const pieces = body.split(requirementHeading);
    let tasks = pieces[0];
    const taskHeading = /(?:^|\n)\s*(?:aufgaben(?:bereich)?|ihre aufgaben|deine aufgaben(?: und perspektiven)?|das sind deine aufgaben|ihr verantwortungsbereich|ihre neue herausforderung|was sie bewegen|was sie erwartet|das erwartet dich|your role|so gestaltest du gesundheit mit|your responsibilities)\s*(?:\n|:|$)/m;
    const taskParts = tasks.split(taskHeading);
    if (taskParts.length > 1) tasks = taskParts.slice(1).join('\n');
    else if (job.description_truncated === true) tasks = '';
    return { body, tasks, requirements: clean(job.requirements) || pieces.slice(1).join('\n') };
  }

  function requiresClinicalCredential(requirements) {
    return requirements.split(/\n|[.;](?:\s|$)/).some(line => {
      const credential = /(?:diplom|ausbildung|abschluss)[^\n]{0,100}pflegefach|pflegefach[^\n]{0,35}\b(?:hf|fh)\b|(?:abschluss|studium)[^\n]{0,60}\b(?:human)?medizin\b|medizinstudium|facharzttitel|arztliche approbation|registered nurse|nursing licen[cs]e/.test(line);
      if (!credential || /von vorteil|wunschenswert|idealerweise|optional|nicht erforderlich|nicht notwendig|kein(?:e|en)?\s+(?:diplom|ausbildung|abschluss)/.test(line)) return false;
      // A clinical pathway is not compulsory when the same requirement explicitly
      // accepts an economics/public-health degree as an alternative.
      return !/\b(?:oder|or|alternativ)\b|[,/]/.test(line) || !/betriebswirtschaft|wirtschaftswissenschaft|gesundheitsokonom|gesundheitsoekonom|public health|health econom|business administration|naturwissenschaft|mikrobiologie|biologie|sozialwissenschaft|politikwissenschaft|medizininformatik/.test(line);
    });
  }

  function classify(job, org = {}) {
    org = org && typeof org === 'object' ? org : {};
    const title = clean(job && job.title);
    const result = (eligible, category, reason, extra) => ({ eligible, category, reasons: extra ? [reason, extra] : [reason], policy_version: POLICY_VERSION });
    const exclude = reason => result(false, OUTSIDE, reason);
    if (!title.trim()) return exclude('Kein prüfbarer Stellentitel vorhanden.');
    const { body, tasks, requirements } = jobSections(job);
    const employer = clean(job.organization) || clean(org.name);
    const knownHealthEmployer = healthOrgs.has(job.org_id || org.id) || healthEmployer.test(employer);
    const titleEconomic = economic.test(title), titlePolicy = policy.test(title);
    const titleProject = projectRole.test(title), titleManagement = managementRole.test(title), titleData = dataRole.test(title);
    const roleText = title + '\n' + tasks;
    if (juniorEducation.test(title)) return exclude('Lehrstelle, Schulpraktikum oder Grundausbildung; keine Stelle im Fachprofil.');
    if (clinicalTitle.test(title) || clinicalLeadership.test(title)) return exclude('Klinische Versorgung oder Leitung eines klinischen Teams.');
    if (unrelatedRole.test(title)) return exclude('Service-, Verkaufs-, Personal- oder allgemeine Verwaltungsfunktion.');
    if (technicalRole.test(title) && !titleData) return exclude('Technischer IT-Betrieb oder Softwareentwicklung ohne fachliche Analysefunktion.');
    if (unrelatedDomain.test(title + '\n' + tasks)) return exclude('Die Aufgaben betreffen einen anderen Fachbereich als das Gesundheitswesen.');
    if (/case manag|entlassungsmanag|austrittsmanag/.test(title)) return exclude('Individuelle Fallbetreuung statt Gesundheitsökonomie oder Systemsteuerung.');
    if (requiresClinicalCredential(requirements)) return exclude('Die Stelle setzt eine klinische Berufsqualifikation zwingend voraus.');
    // A management title does not turn bedside work into health management.
    if (/pflegefach|pflege hf|pflege fh|facharzt|arztliche approbation/.test(requirements)
      && /patient[^.\n]{0,90}(?:betreu|behandl|berat)|studienvisiten|austritten und verlegungen/.test(tasks)) {
      return exclude('Patientennahe Tätigkeit mit erforderlicher klinischer Berufsqualifikation.');
    }
    if (titleEconomic) return result(true, CATEGORIES[0], 'Gesundheitsökonomie oder HTA ist ausdrücklich Teil der Funktion.');
    const healthInWork = healthDomain.test(roleText) || policy.test(roleText) || publicHealth.test(roleText);
    if (titlePolicy) return result(true, CATEGORIES[1], 'Gesundheitspolitik, Vergütung oder Regulierung ist ausdrücklich Teil der Funktion.');
    if (economic.test(tasks) && (researchRole.test(title) || titleProject || titleManagement)) {
      return result(true, CATEGORIES[0], 'Die Aufgaben enthalten gesundheitsökonomische Bewertungen oder Analysen.');
    }
    if (policy.test(tasks) && (researchRole.test(title) || titleProject || titleManagement || /jurist|recht|delegiert|leiter|leitung|koordinat/.test(title))) {
      return result(true, CATEGORIES[1], 'Die konkreten Aufgaben betreffen Gesundheitspolitik, Tarife oder Gesundheitsregulierung.');
    }
    if (/jurist|rechtswissenschaft|legal/.test(title) && healthDomain.test(tasks) && /rechtsetz|regulier|gesetz|juristisch/.test(tasks)) {
      return result(true, CATEGORIES[1], 'Juristische Gestaltung der Gesundheitspolitik oder Gesundheitsregulierung.');
    }
    if (publicHealth.test(roleText) && (researchRole.test(title) || titleProject || /public health|one health|versorgungsforsch|epidemiolog/.test(title))) {
      return result(true, CATEGORIES[2], 'Konkreter Bezug zu Versorgungsforschung, Epidemiologie oder Public Health.');
    }
    if (titleData && (knownHealthEmployer || healthInWork)) {
      return result(true, CATEGORIES[5], 'Datenanalyse oder Datenmanagement mit belegtem Gesundheitsbezug.',
        healthInWork ? 'Der Gesundheitsbezug steht im Titel oder in den Aufgaben.' : 'Die Funktion ist bei einer spezialisierten Gesundheitsorganisation angesiedelt.');
    }
    const specificHealthProject = knownHealthEmployer && /klinikinformationssystem|digisante|\bzkis\b/.test(body);
    if (titleProject && (healthInWork || specificHealthProject || (knownHealthEmployer && /prozessoptim|organisationsentwick|qualitatsentwick|versorgungs|patientenprozess|klinisch|spitalprozess|betriebswirtschaft|gesundheit/.test(tasks)))) {
      // Generic technical/infrastructure projects at a hospital are not enough.
      if (/it[- ]prozesse|it service management|infrastruktur|service ?now|\bitil\b|cmdb/.test(tasks + '\n' + requirements)
        && !healthDomain.test(tasks)) return exclude('Projekt betrifft internen IT-Betrieb ohne konkreten Gesundheitsprozess.');
      if (/klinische forschung|clinical (?:research|trial)|forschungskoordinator|studienkoordinat/.test(title)
        && !/versorgungsforsch|public health|health services|gesundheitsokonom/.test(roleText)) return exclude('Organisation klinischer Studien ohne Bezug zu Versorgungsforschung oder Gesundheitsökonomie.');
      return result(true, CATEGORIES[3], 'Nichtklinische Projekt- oder Prozessverantwortung im Gesundheitswesen.');
    }
    if (titleManagement && (knownHealthEmployer || healthInWork)) {
      if (/strategisch[^\n]{0,20}einkauf|strategic[^\n]{0,20}(?:purchas|procur)/.test(title)) return exclude('Beschaffung statt Gesundheitsökonomie oder Versorgungssteuerung.');
      if (/business analys/.test(title) && /webplattform|digitale kommunikation|ux[- ]method|kommunikationsplattform/.test(tasks)
        && !healthDomain.test(tasks)) return exclude('Analyse einer allgemeinen Kommunikationsplattform ohne Gesundheitsprozess.');
      return result(true, CATEGORIES[4], 'Betriebswirtschaftliche Steuerung, Strategie oder Controlling im Gesundheitswesen.');
    }
    // A generic research/project title can be supported by the actual work, but
    // mentions in a degree list or employer boilerplate alone are insufficient.
    if (researchRole.test(title) && healthDomain.test(tasks)
      && /gesundheitsdaten|versorgungsdaten|epidemiolog|wissenschaftlich|forschungs|statist|quantitati|qualitati|evaluat|indikator|datenauswert|datenanalys|modelli|surveillance|population|bevolkerung/.test(tasks)) {
      return result(true, CATEGORIES[2], 'Wissenschaftliche Analyse mit konkretem Bezug zur Gesundheitsversorgung.');
    }
    return exclude(knownHealthEmployer
      ? 'Gesundheitsarbeitgeber, aber keine ausreichend belegte Funktion im fachlichen Profil.'
      : 'Kein ausreichender Bezug der konkreten Funktion zu Gesundheitsökonomie, Gesundheitspolitik oder Gesundheitsmanagement.');
  }
  return Object.freeze({ POLICY_VERSION, CATEGORIES, classify });
});

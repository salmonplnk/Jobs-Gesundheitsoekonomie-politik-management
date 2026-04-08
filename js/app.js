/* ========================================
   DATA — all organisations
   ======================================== */
const DATA = [
  {
    key: 'bund', emoji: '🏛️', title: 'Bund / bundesnahe Institutionen',
    orgs: [
      { id:'bag', name:'Bundesamt für Gesundheit (BAG)', loc:'Bern',
        main:'https://www.bag.admin.ch', jobs:'https://jobs.admin.ch/?lang=de&f=verwaltungseinheit:1083353',
        desc:'Nationale Gesundheitspolitik, Prävention und Krankenversicherung.' },
      { id:'bsv', name:'Bundesamt für Sozialversicherungen (BSV)', loc:'Bern',
        main:'https://www.bsv.admin.ch', jobs:'https://jobs.admin.ch/?lang=de&f=verwaltungseinheit:1083356',
        desc:'AHV, IV, EL, BVG – das BSV gestaltet und überwacht die Sozialversicherungen.' },
      { id:'seco', name:'Staatssekretariat für Wirtschaft (SECO)', loc:'Bern',
        main:'https://www.seco.admin.ch', jobs:'https://jobs.admin.ch/?lang=de&f=verwaltungseinheit:1083355',
        desc:'Arbeitsmarktpolitik, Wirtschaftsanalysen und Konjunkturbeobachtung.' },
      { id:'bfs', name:'Bundesamt für Statistik (BFS)', loc:'Neuenburg',
        main:'https://www.bfs.admin.ch', jobs:'https://jobs.admin.ch/?lang=de&f=verwaltungseinheit:1083346',
        desc:'Gesundheitsstatistiken, Kostenanalysen, Bevölkerungssurveys.' },
      { id:'kvg', name:'Gemeinsame Einrichtung KVG', loc:'Bern',
        main:'https://www.kvg.org', jobs:'https://www.kvg.org/jobs/',
        desc:'Durchführung der obligatorischen Krankenversicherung.' },
      { id:'obsan', name:'Gesundheits­observatorium Obsan', loc:'Neuenburg',
        main:'https://www.obsan.admin.ch', jobs:'https://www.obsan.admin.ch/de/das-obsan/offene-stellen',
        desc:'Schweizerisches Gesundheitsobservatorium – Analysen & Daten.' },
      { id:'swissmedic', name:'Swissmedic', loc:'Bern',
        main:'https://www.swissmedic.ch', jobs:'https://www.swissmedic.ch/swissmedic/de/home/ueber-uns/offene-stellen.html',
        desc:'Zulassungs- und Aufsichtsbehörde für Heilmittel.' },
      { id:'gdk', name:'GDK Gesundheitsdirektoren', loc:'Bern',
        main:'https://www.gdk-cds.ch', jobs:'https://www.gdk-cds.ch/de/die-gdk/stellenangebote',
        desc:'Konferenz der kantonalen Gesundheitsdirektoren.' },
      { id:'suva', name:'Suva', loc:'Luzern',
        main:'https://www.suva.ch', jobs:'https://jobs.suva.ch/',
        desc:'Schweizerische Unfallversicherungsanstalt – Prävention, Versicherung, Rehabilitation.' },
      { id:'snf', name:'Schweizerischer Nationalfonds (SNF)', loc:'Bern',
        main:'https://www.snf.ch', jobs:'https://www.snf.ch/de/dQyZEssAGiiYhU5R/seite/ueberuns/offene-stellen',
        desc:'Förderung der wissenschaftlichen Forschung, inkl. Gesundheitsforschung.' },
    ]
  },
  {
    key: 'kantone', emoji: '🏔️', title: 'Kantonale Verwaltungen',
    orgs: [
      { id:'ag', name:'Aargau – DGS', loc:'Aarau',
        main:'https://www.ag.ch', jobs:'https://www.ag.ch/de/ueber-uns/jobs-karriere',
        desc:'Departement Gesundheit und Soziales Aargau.' },
      { id:'ar', name:'Appenzell Ausserrhoden', loc:'Herisau',
        main:'https://www.ar.ch', jobs:'https://ar.ch/verwaltung/departement-finanzen/personalamt/freie-stellen/',
        desc:'Departement Gesundheit und Soziales – Spitalverbund, Pflege, Prävention.' },
      { id:'ai', name:'Appenzell Innerrhoden', loc:'Appenzell',
        main:'https://www.ai.ch', jobs:'https://www.ai.ch/themen/arbeiten-bei-der-kantonalen-verwaltung/offene-stellen-1',
        desc:'Fachstelle Gesundheit – Spitex-Koordination, Altersplanung, Suchtprävention.' },
      { id:'be', name:'Bern – GSI', loc:'Bern',
        main:'https://www.be.ch', jobs:'https://www.gsi.be.ch/de/start/ueber-uns/offene-stellen.html',
        desc:'Gesundheits-, Sozial- & Integrationsdirektion Bern.' },
      { id:'bl', name:'Basel-Landschaft', loc:'Basel',
        main:'https://www.baselland.ch', jobs:'https://www.baselland.ch/politik-und-behorden/direktionen/finanz-und-kirchendirektion/personalamt/jobs/offene-stellen/',
        desc:'Volkswirtschafts- und Gesundheitsdirektion – Kantonsarzt, Spitalplanung, Langzeitpflege.' },
      { id:'bs', name:'Basel-Stadt', loc:'Basel',
        main:'https://www.bs.ch', jobs:'https://www.bs.ch/themen/arbeit-und-steuern/stellenbesetzung-arbeitslosigkeit/offene-stellen/offene-stellen-beim-kanton-basel-stadt',
        desc:'Gesundheitsdepartement – Kantonsspital, Gesundheitsschutz, Suchtberatung.' },
      { id:'gr', name:'Graubünden', loc:'Chur',
        main:'https://www.gr.ch', jobs:'https://www.gr.ch/stellen',
        desc:'Gesundheitsamt – Spitalplanung, Bergrettung, Psychiatrische Dienste, Altersversorgung.' },
      { id:'lu', name:'Luzern', loc:'Luzern',
        main:'https://www.lu.ch', jobs:'https://stellen.lu.ch/job',
        desc:'Gesundheits- und Sozialdepartement – Kantonsarzt, Lebensmittelsicherheit, Heilmittelkontrolle.' },
      { id:'sg', name:'St. Gallen', loc:'St. Gallen',
        main:'https://www.sg.ch', jobs:'https://www.sg.ch/ueber-den-kanton-st-gallen/arbeitgeber-kanton-stgallen/stellenportal.html',
        desc:'Gesundheitsdepartement – Psychiatrieverbund, Spitalplanung, Pflege Ostschweiz.' },
      { id:'so', name:'Solothurn', loc:'Solothurn',
        main:'https://www.so.ch', jobs:'https://karriere.so.ch/stellenmarkt/offene-stellen/',
        desc:'Departement des Innern – Kantonsarzt, Gesundheitsförderung, Spitex-Koordination.' },
      { id:'sz', name:'Schwyz', loc:'Schwyz',
        main:'https://www.sz.ch', jobs:'https://www.sz.ch/services/offene-stellen.html/8756-8761-10387',
        desc:'Amt für Gesundheit und Soziales – Spitalversorgung, Pflegeheimaufsicht, Prävention.' },
      { id:'tg', name:'Thurgau', loc:'Frauenfeld',
        main:'https://www.tg.ch', jobs:'https://stellen.tg.ch/',
        desc:'Amt für Gesundheit – Kantonsarzt, Spital Thurgau, Psychiatrische Dienste.' },
      { id:'ur', name:'Uri', loc:'Altdorf',
        main:'https://www.ur.ch', jobs:'https://www.ur.ch/stellen',
        desc:'Gesundheits-, Sozial- und Umweltdirektion – Kantonsspital Uri, Spitex, Altersheime.' },
      { id:'zh', name:'Zürich', loc:'Zürich',
        main:'https://www.zh.ch', jobs:'https://live.solique.ch/KTZH/de/ORG60/',
        desc:'Gesundheitsdirektion – grösster kantonaler Arbeitgeber, Psychiatrische Uniklinik, Kantonsarzt.' },
      { id:'zg', name:'Zug', loc:'Zug',
        main:'https://www.zg.ch', jobs:'https://www.zg.ch/de/offene-stellen',
        desc:'Direktion des Innern – Gesundheitsamt, Pflegeversorgung, Suchtprävention.' },
      { id:'ge', name:'Genf / Genève', loc:'Westschweiz',
        main:'https://www.ge.ch', jobs:'https://www.ge.ch/offres-emploi-etat-geneve/liste-offres',
        desc:'Département de la santé – HUG-Kooperation, Gesundheitsschutz, Prävention bilingue.' },
    ]
  },
  {
    key: 'versicherungen', emoji: '🛡️', title: 'Versicherungen',
    orgs: [
      { id:'atupri', name:'Atupri Gesundheitsversicherung', loc:'Bern',
        main:'https://www.atupri.ch', jobs:'https://www.atupri.ch/karriere-jobs',
        desc:'Digital fokussierte Gesundheitskasse.' },
      { id:'concordia', name:'Concordia', loc:'Luzern',
        main:'https://www.concordia.ch', jobs:'https://www.concordia.ch/de/ueber-uns/jobs/offene-stellen.html',
        desc:'Traditionsreiche Kasse mit starkem Netz.' },
      { id:'css', name:'CSS Versicherung', loc:'Luzern',
        main:'https://www.css.ch', jobs:'https://jobs.css.ch/',
        desc:'Grosse Schweizer Krankenkasse mit Sitz in Luzern.' },
      { id:'groupemutuel', name:'Groupe Mutuel', loc:'Westschweiz',
        main:'https://www.groupemutuel.ch', jobs:'https://groupemutuel.csod.com/ux/ats/careersite/4/home?c=groupemutuel',
        desc:'Grosser Westschweizer Kranken- & Unfallversicherer.' },
      { id:'helsana', name:'Helsana', loc:'Zürich',
        main:'https://www.helsana.ch', jobs:'https://www.helsana.ch/de/helsana-gruppe/jobs',
        desc:'Grösster Schweizer Krankenversicherer.' },
      { id:'helvetia', name:'Helvetia', loc:'St. Gallen',
        main:'https://www.helvetia.com', jobs:'https://jobs.helvetia.com/',
        desc:'Allbranchen-Versicherer mit Gesundheits-Zusatzangeboten.' },
      { id:'kpt', name:'KPT Krankenkasse', loc:'Bern',
        main:'https://www.kpt.ch', jobs:'https://www.kpt.ch/de/ueber-kpt/arbeiten-bei-der-kpt/offene-stellen',
        desc:'Digitale Krankenkasse aus Bern.' },
      { id:'oekk', name:'ÖKK', loc:'Winterthur',
        main:'https://www.oekk.ch', jobs:'https://www.oekk.ch/de/oekk/karriere/bewerben/offene-stellen',
        desc:'Kranken- und Unfallversicherung, regional verankert.' },
      { id:'sanitas', name:'Sanitas', loc:'Zürich',
        main:'https://www.sanitas.com', jobs:'https://www.sanitas.com/de/ueber-sanitas/arbeiten-bei-sanitas/offene-stellen.html',
        desc:'Krankenversicherung mit Fokus auf eHealth-Services.' },
      { id:'swica', name:'SWICA', loc:'Winterthur',
        main:'https://www.swica.ch', jobs:'https://www.swica.ch/de/kampagnen/intern/jobs/freie-stellen',
        desc:'Gesundheitsorganisation & Versicherer.' },
      { id:'visana', name:'Visana', loc:'Bern',
        main:'https://www.visana.ch', jobs:'https://jobs.visana.ch/',
        desc:'Kranken- und Unfallversicherung, Bern.' },
      { id:'assura', name:'Assura', loc:'Westschweiz',
        main:'https://www.assura.ch', jobs:'https://www.assura.ch/de/ueber-assura/karriere',
        desc:'Grosse Westschweizer Krankenkasse – günstig und schlank.' },
      { id:'egk', name:'EGK Gesundheitskasse', loc:'Solothurn',
        main:'https://www.egk.ch', jobs:'https://www.egk.ch/de/ueber-uns/offene-stellen',
        desc:'Krankenkasse mit Fokus auf Komplementärmedizin.' },
    ]
  },
  {
    key: 'branchen', emoji: '⚖️', title: 'Branchen- / Tariforganisationen',
    orgs: [
      { id:'curafutura', name:'curafutura / prio.swiss', loc:'Bern',
        main:'https://prio.swiss', jobs:'https://prio.swiss/jobs/',
        desc:'Verband der innovativen Krankenversicherer.' },
      { id:'fmh', name:'FMH Ärzteverband', loc:'Bern',
        main:'https://www.fmh.ch', jobs:'https://www.fmh.ch/ueber-die-fmh/offene-stellen.cfm',
        desc:'Dachverband der Schweizer Ärztinnen und Ärzte.' },
      { id:'hplus', name:'H+ Die Spitäler der Schweiz', loc:'Bern',
        main:'https://www.hplus.ch', jobs:'',
        desc:'Spitzenverband der Schweizer Spitäler & Kliniken.' },
      { id:'interpharma', name:'Interpharma', loc:'Basel',
        main:'https://www.interpharma.ch', jobs:'https://www.interpharma.ch/ueber-uns/',
        desc:'Verband der forschenden pharmazeutischen Firmen.' },
      { id:'oaat', name:'OAAT', loc:'Bern',
        main:'https://oaat-otma.ch', jobs:'',
        desc:'Tariforganisation ambulante Arzttarife.' },
      { id:'santesuisse', name:'santésuisse', loc:'Bern',
        main:'https://www.santesuisse.ch', jobs:'https://www.santesuisse.ch/de/ueber-santesuisse/offene-stellen/',
        desc:'Branchenverband der Schweizer Krankenversicherer.' },
      { id:'spitex', name:'Spitex Schweiz', loc:'Bern',
        main:'https://www.spitex.ch', jobs:'https://www.spitex.ch/Jobs/PgiA1/',
        desc:'Zentrales Stellenportal der Spitex-Organisationen.' },
      { id:'pharmasuisse', name:'pharmaSuisse', loc:'Bern',
        main:'https://www.pharmasuisse.org', jobs:'https://www.pharmasuisse.org/de/der-verband/jobs-und-karriere',
        desc:'Schweizerischer Apothekerverband – Standesvertretung & Weiterbildung.' },
      { id:'sbk', name:'SBK Pflegeverband', loc:'Bern',
        main:'https://sbk-asi.ch', jobs:'https://sbk-asi.ch/de/pflege-und-arbeit/arbeit/jobs',
        desc:'Schweizer Berufsverband der Pflegefachfrauen und Pflegefachmänner.' },
    ]
  },
  {
    key: 'spitaeler', emoji: '🏥', title: 'Leistungserbringer (Spitäler / Kliniken)',
    orgs: [
      { id:'chuv', name:'CHUV Lausanne', loc:'Westschweiz',
        main:'https://www.chuv.ch', jobs:'https://www.chuv.ch/fr/chuv-home/recrutement',
        desc:'Centre hospitalier universitaire vaudois.' },
      { id:'hirslanden', name:'Hirslanden Gruppe', loc:'Zürich',
        main:'https://www.hirslanden.ch', jobs:'https://careers.hirslanden.ch/',
        desc:'Grösste Privatklinikgruppe der Schweiz.' },
      { id:'insel', name:'Insel Gruppe Bern', loc:'Bern',
        main:'https://www.inselgruppe.ch', jobs:'https://jobs.inselgruppe.ch/?lang=de',
        desc:'Universitätsspital-Verbund Bern.' },
      { id:'ksa', name:'Kantonsspital Aarau', loc:'Aarau',
        main:'https://www.ksa.ch', jobs:'https://jobs.ksa.ch/',
        desc:'Zentrumsspital Kanton Aargau.' },
      { id:'kssg', name:'Kantonsspital St. Gallen', loc:'St. Gallen',
        main:'https://www.kssg.ch', jobs:'https://jobs.kssg.ch/',
        desc:'Maximalversorger Ostschweiz.' },
      { id:'ksw', name:'Kantonsspital Winterthur', loc:'Winterthur',
        main:'https://www.ksw.ch', jobs:'https://www.ksw.ch/jobs-karriere/jobs/offene-stellen/',
        desc:'Zentrum für das Zürcher Unterland.' },
      { id:'luks', name:'Luzerner Kantonsspital (LUKS)', loc:'Luzern',
        main:'https://www.luks.ch', jobs:'https://www.luks.ch/stellen-und-karriere/offene-stellen/',
        desc:'Grösstes Zentrumsspital der Zentralschweiz.' },
      { id:'smn', name:'Swiss Medical Network', loc:'Westschweiz',
        main:'https://www.swissmedical.net', jobs:'https://www.swissmedical.net/de/karriere/stellenangebote',
        desc:'Privatklinikgruppe Schweiz.' },
      { id:'soh', name:'Solothurner Spitäler (soH)', loc:'Solothurn',
        main:'https://www.solothurnerspitaeler.ch', jobs:'https://www.solothurnerspitaeler.ch/jobs-karriere/jobangebote',
        desc:'Regionale Gesundheitsversorgung Solothurn.' },
      { id:'spitalwallis', name:'Spital Wallis / Hôpital du Valais', loc:'Westschweiz',
        main:'https://www.hopitalduvalais.ch', jobs:'https://www.hopitalduvalais.ch/lhopital-du-valais/emploi/',
        desc:'Zweisprachiges Zentrumsspital Wallis.' },
      { id:'usb', name:'Universitätsspital Basel (USB)', loc:'Basel',
        main:'https://www.unispital-basel.ch', jobs:'https://www.unispital-basel.ch/jobs-und-karriere/Jobs',
        desc:'Zentrumsspital der Nordwestschweiz.' },
      { id:'usz', name:'UniversitätsSpital Zürich', loc:'Zürich',
        main:'https://www.usz.ch', jobs:'https://jobs.usz.ch/?lang=de',
        desc:'Höchstversorger und Forschungsspital Zürich.' },
      { id:'hug', name:'HUG – Hôpitaux Universitaires de Genève', loc:'Westschweiz',
        main:'https://www.hug.ch', jobs:'https://www.hug.ch/emploi',
        desc:'Universitätsspital Genf – grösstes Spital der Westschweiz.' },
      { id:'ksgr', name:'Kantonsspital Graubünden', loc:'Chur',
        main:'https://www.ksgr.ch', jobs:'https://www.ksgr.ch/karriere/offene-stellen',
        desc:'Zentrumsspital Graubünden in Chur.' },
    ]
  },
  {
    key: 'beratung', emoji: '🔬', title: 'Beratung / Forschung',
    orgs: [
      { id:'bss', name:'B,S,S. Volkswirtschaftliche Beratung', loc:'Basel',
        main:'https://www.bss-basel.ch', jobs:'https://www.bss-basel.ch/de/unternehmen/jobs/',
        desc:'Volkswirtschaftliche Beratung mit Gesundheitsökonomie-Fokus.' },
      { id:'careum', name:'Careum Stiftung', loc:'Zürich',
        main:'https://careum.ch', jobs:'https://careum.ch/ueber-uns/jobs',
        desc:'Bildung & Forschung im Gesundheitswesen.' },
      { id:'dayone', name:'DayOne Basel Area', loc:'Basel',
        main:'https://www.dayone.swiss', jobs:'https://www.dayone.swiss/about-us/careers/',
        desc:'Healthcare-Innovation-Hub Basel.' },
      { id:'infras', name:'INFRAS', loc:'Zürich',
        main:'https://www.infras.ch', jobs:'https://www.infras.ch/de/stellen/',
        desc:'Forschung & Beratung in Gesundheit, Umwelt, Verkehr.' },
      { id:'polynomics', name:'Polynomics', loc:'Winterthur',
        main:'https://www.polynomics.ch', jobs:'',
        desc:'Gesundheitsökonomische Beratung und Analysen.' },
      { id:'sotomo', name:'Sotomo', loc:'Zürich',
        main:'https://sotomo.ch', jobs:'https://sotomo.ch/site/jobs/',
        desc:'Sozial- & Politikforschung.' },
      { id:'swisstph', name:'Swiss TPH', loc:'Basel',
        main:'https://www.swisstph.ch', jobs:'https://jobs.swisstph.ch/Jobs/All',
        desc:'Global-Health-Institut Basel.' },
      { id:'unilu', name:'Uni Luzern FGW', loc:'Luzern',
        main:'https://www.unilu.ch', jobs:'https://www.unilu.ch/universitaet/personal/personaldienst/offene-stellen/',
        desc:'Universität Luzern – Fakultät Gesundheitswissenschaften.' },
      { id:'wig', name:'WIG – ZHAW Gesundheitsökonomie', loc:'Winterthur',
        main:'https://www.zhaw.ch/de/sml/institute-zentren/wig/', jobs:'https://www.zhaw.ch/de/jobs/offene-stellen',
        desc:'Winterthurer Institut für Gesundheitsökonomie.' },
      { id:'zhaw', name:'ZHAW Gesundheit', loc:'Winterthur',
        main:'https://www.zhaw.ch', jobs:'https://www.zhaw.ch/de/jobs/offene-stellen',
        desc:'ZHAW Departement Gesundheit – FH-Jobs Pflege & Therapien.' },
      { id:'ecoplan', name:'Ecoplan', loc:'Bern',
        main:'https://www.ecoplan.ch', jobs:'https://www.ecoplan.ch/de/ecoplan#offene-stellen',
        desc:'Wirtschafts- und Politikberatung, Gesundheitsökonomie & Sozialpolitik.' },
      { id:'interface', name:'Interface Politikstudien', loc:'Luzern',
        main:'https://www.interface-pol.ch', jobs:'https://www.interface-pol.ch/category/stellen',
        desc:'Politikstudien, Forschung & Beratung – u.a. Gesundheitspolitik.' },
    ]
  },
  {
    key: 'stiftungen', emoji: '💚', title: 'Stiftungen / Non-Profits',
    orgs: [
      { id:'alzheimer', name:'Alzheimer Schweiz', loc:'Bern',
        main:'https://www.alzheimer-schweiz.ch', jobs:'https://www.alzheimer-schweiz.ch/de/ueber-uns/offene-stellen',
        desc:'Unterstützung für Betroffene & Angehörige.' },
      { id:'diabetes', name:'Diabetes Schweiz', loc:'Bern',
        main:'https://www.diabetesschweiz.ch', jobs:'',
        desc:'Schweizerische Diabetes-Gesellschaft – Prävention & Betreuung.' },
      { id:'gfs', name:'Gesundheitsförderung Schweiz', loc:'Bern',
        main:'https://gesundheitsfoerderung.ch', jobs:'https://gesundheitsfoerderung.ch/stiftung/stellenangebote',
        desc:'Stiftung für Prävention & Betriebliche Gesundheitsförderung.' },
      { id:'krebsliga', name:'Krebsliga Schweiz', loc:'Bern',
        main:'https://www.krebsliga.ch', jobs:'https://www.krebsliga.ch/ueber-uns/jobs',
        desc:'Krebsprävention & Unterstützung.' },
      { id:'lungenliga', name:'Lungenliga Schweiz', loc:'Bern',
        main:'https://www.lungenliga.ch', jobs:'https://www.lungenliga.ch/ueber-uns/jobs',
        desc:'Hilfe bei Atemwegs- & Lungenerkrankungen.' },
      { id:'pflegewegweiser', name:'Pflegewegweiser', loc:'Bern',
        main:'https://pflegewegweiser.ch', jobs:'https://pflegewegweiser.ch/karriere/',
        desc:'Plattform für Pflege-Karrieren in der Schweiz.' },
      { id:'proinfirmis', name:'Pro Infirmis', loc:'Zürich',
        main:'https://www.proinfirmis.ch', jobs:'https://jobs.proinfirmis.ch/de',
        desc:'Fachorganisation für Menschen mit Behinderung.' },
      { id:'rheumaliga', name:'Rheumaliga Schweiz', loc:'Zürich',
        main:'https://www.rheumaliga.ch', jobs:'https://www.rheumaliga.ch/ueber-uns/organisation/offene-stellen',
        desc:'Betreuung & Forschung rheumatischer Erkrankungen.' },
      { id:'srk', name:'Schweizerisches Rotes Kreuz (SRK)', loc:'Bern',
        main:'https://www.redcross.ch', jobs:'https://www.redcross.ch/de/arbeiten-beim-srk-sinnvoll-und-herausfordernd',
        desc:'Humanitäre Hilfe, Pflege, Rettung.' },
      { id:'prosenectute', name:'Pro Senectute', loc:'Zürich',
        main:'https://www.prosenectute.ch', jobs:'https://www.prosenectute.ch/de/ueber-uns/pro-senectute-schweiz/stellen.html',
        desc:'Grösste Fachorganisation für Altersfragen in der Schweiz.' },
      { id:'suchtschweiz', name:'Sucht Schweiz / Addiction Suisse', loc:'Westschweiz',
        main:'https://www.suchtschweiz.ch', jobs:'https://www.suchtschweiz.ch/wofuer-wir-einstehen/arbeiten-bei-sucht-schweiz/',
        desc:'Prävention und Forschung zu Suchtproblemen.' },
    ]
  }
];
/* ======== Helpers ======== */
const LS_FAV = 'favOrgs';
const getFavs = () => JSON.parse(localStorage.getItem(LS_FAV) || '[]');
const saveFavs = f => {
  localStorage.setItem(LS_FAV, JSON.stringify(f));
  if (typeof syncFavoritesToSupabase === 'function' && isLoggedIn()) {
    syncFavoritesToSupabase(f);
  }
};
const allOrgs = () => DATA.flatMap(c => c.orgs);
const domain = url => { try { return new URL(url).hostname; } catch { return ''; } };
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ======== Dark Mode ======== */
const themeBtn = document.getElementById('themeToggle');
const isDark = localStorage.getItem('darkMode') === '1';
document.body.classList.toggle('dark', isDark);
themeBtn.textContent = isDark ? '☀️' : '🌙';
themeBtn.addEventListener('click', () => {
  const dark = document.body.classList.toggle('dark');
  localStorage.setItem('darkMode', dark ? '1' : '0');
  themeBtn.textContent = dark ? '☀️' : '🌙';
});

/* ======== Render Card ======== */
function cardHTML(org, isFav) {
  const d = domain(org.main);
  const favicon = d ? `https://www.google.com/s2/favicons?domain=${d}&sz=32` : '';
  return `
    <div class="org-card" data-id="${escapeHtml(org.id)}" data-loc="${escapeHtml(org.loc)}" data-search="${escapeHtml((org.name+' '+org.loc+' '+org.desc).toLowerCase())}">
      <div class="org-top">
        ${favicon ? `<img class="org-favicon" src="${favicon}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
        <span class="org-name">${escapeHtml(org.name)}</span>
        <span class="org-star ${isFav?'fav':''}" data-fav="${escapeHtml(org.id)}" role="button" aria-label="${isFav?'Favorit entfernen':'Als Favorit markieren'}: ${escapeHtml(org.name)}" tabindex="0">${isFav?'⭐':'☆'}</span>
      </div>
      <span class="org-loc">📍 ${escapeHtml(org.loc)}</span>
      <p class="org-desc">${escapeHtml(org.desc)}</p>
      <div class="org-links">
        <a class="org-link org-link-main" href="${escapeHtml(org.main)}" target="_blank" rel="noopener">🌐 Website</a>
        ${org.jobs ? `<a class="org-link org-link-jobs" href="${escapeHtml(org.jobs)}" target="_blank" rel="noopener">💼 Jobs</a>` : ''}
      </div>
    </div>`;
}

/* ======== Render All ======== */
function renderAll() {
  const favs = getFavs();
  const container = document.getElementById('categories');
  container.innerHTML = DATA.map(cat => `
    <section class="category" data-cat="${cat.key}">
      <div class="cat-header">
        <span class="cat-emoji">${cat.emoji}</span>
        <span class="cat-title">${cat.title}</span>
        <span class="cat-count">${cat.orgs.length}</span>
      </div>
      <div class="card-grid">
        ${cat.orgs.map(o => cardHTML(o, favs.includes(o.id))).join('')}
      </div>
    </section>
  `).join('');
  renderFavs();
  updateStats();
  filterAll();
}

/* ======== Favorites ======== */
function renderFavs() {
  const favs = getFavs();
  const sec = document.getElementById('fav-sec');
  const grid = document.getElementById('fav-grid');
  if (!favs.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  const orgs = allOrgs().filter(o => favs.includes(o.id));
  grid.innerHTML = orgs.map(o => cardHTML(o, true)).join('');
}

/* ======== Stats ======== */
function updateStats() {
  const total = allOrgs().length;
  const favCount = getFavs().length;
  document.getElementById('statOrgs').textContent = total;
  document.getElementById('statCats').textContent = DATA.length;
  document.getElementById('statFavs').textContent = favCount || '—';
  document.getElementById('orgCount').textContent = total;
  const catCountEl = document.getElementById('catCount');
  if (catCountEl) catCountEl.textContent = DATA.length;
}

/* ======== Onboarding ======== */
function showOnboarding() {
  const hint = document.getElementById('onboardingHint');
  if (!hint) return;
  if (localStorage.getItem('onboardingDismissed') === '1') return;
  if (getFavs().length > 0) return; // Don't show if user already has favorites
  hint.style.display = 'flex';
}
function dismissOnboarding() {
  localStorage.setItem('onboardingDismissed', '1');
  const hint = document.getElementById('onboardingHint');
  if (hint) hint.style.display = 'none';
}
showOnboarding();

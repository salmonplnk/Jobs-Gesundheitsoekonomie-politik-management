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
      { id:'swissdrg', name:'SwissDRG AG', loc:'Bern',
        main:'https://www.swissdrg.org', jobs:'https://www.swissdrg.org/de/ueber-uns/stellenangebote',
        desc:'Tarifstrukturen SwissDRG, TARPSY und ST Reha – Tarifentwicklung und Kostendaten.' },
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
      { id:'iqvia', name:'IQVIA Schweiz', loc:'Basel',
        main:'https://www.iqvia.com/locations/switzerland', jobs:'https://jobs.iqvia.com/en/jobs?k=health+economics',
        desc:'Real World Evidence, HEOR und Market-Access-Beratung für Life Sciences.' },
      { id:'deloitte', name:'Deloitte Schweiz', loc:'Zürich',
        main:'https://www.deloitte.com/ch/de.html', jobs:'https://apply.deloitte.ch/CHCareers/',
        desc:'Beratung Life Sciences & Health Care – Spitäler, Versicherer, Pharma.' },
      { id:'kpmg', name:'KPMG Schweiz', loc:'Zürich',
        main:'https://kpmg.com/ch/de.html', jobs:'https://jobs.kpmg.ch/?lang=en',
        desc:'Beratung Healthcare & Life Sciences, Spital- und Gesundheitsfinanzierung.' },
      { id:'ey', name:'EY Schweiz', loc:'Zürich',
        main:'https://www.ey.com/de_ch', jobs:'https://careers.ey.com/ey/search/?q=health&locationsearch=Switzerland',
        desc:'Beratung Health Sciences & Wellness, Digital Health und Gesundheitswesen.' },
      { id:'ispm', name:'ISPM – Universität Bern', loc:'Bern',
        main:'https://www.ispm.unibe.ch', jobs:'https://www.ispm.unibe.ch/about_us/job_openings/index_eng.html',
        desc:'Institut für Sozial- und Präventivmedizin – Epidemiologie, Public Health, Versorgungsforschung.' },
      { id:'ebpi', name:'EBPI – Universität Zürich', loc:'Zürich',
        main:'https://www.ebpi.uzh.ch', jobs:'https://www.uzh.ch/en/explore/work/jobs.html',
        desc:'Epidemiologie, Biostatistik und Prävention – inkl. Gesundheitsökonomie und Public Health.' },
      { id:'unisante', name:'Unisanté Lausanne', loc:'Westschweiz',
        main:'https://www.unisante.ch', jobs:'https://emploi.unisante.ch/offres',
        desc:'Centre universitaire de médecine générale et santé publique – Public Health und Versorgungsforschung.' },
      { id:'bfh', name:'BFH Gesundheit', loc:'Bern',
        main:'https://www.bfh.ch/gesundheit/de/', jobs:'https://www.bfh.ch/de/ueber-die-bfh/karriere/jobs/',
        desc:'Berner Fachhochschule, Departement Gesundheit – Forschung und Lehre.' },
    ]
  },
  {
    key: 'pharma', emoji: '💊', title: 'Pharma / Medtech (Market Access)',
    orgs: [
      { id:'roche', name:'Roche', loc:'Basel',
        main:'https://www.roche.com', jobs:'https://careers.roche.com/global/en/search-results?keywords=market%20access',
        desc:'Pharma Basel – Market Access, Pricing & Reimbursement, HEOR und Real World Evidence.' },
      { id:'novartis', name:'Novartis', loc:'Basel',
        main:'https://www.novartis.com/ch-de/', jobs:'https://www.novartis.com/careers/career-search?search_api_fulltext=market%20access&country%5B0%5D=LOC_CH',
        desc:'Pharma Basel – Value & Access, HEOR, Health Economics und Public Affairs.' },
      { id:'takeda', name:'Takeda Schweiz', loc:'Zürich',
        main:'https://www.takeda.com/de-ch/', jobs:'https://jobs.takeda.com/search-jobs/market%20access/Switzerland',
        desc:'Pharma mit Schweizer Sitz in Opfikon – Market Access, Pricing und Value.' },
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
const getFavs = () => {
  try { const value = JSON.parse(localStorage.getItem(LS_FAV) || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
};
const saveFavs = f => {
  localStorage.setItem(LS_FAV, JSON.stringify(f));
  if (typeof syncFavoritesToSupabase === 'function' && typeof isLoggedIn === 'function' && isLoggedIn()) {
    syncFavoritesToSupabase(f);
  }
};
const allOrgs = () => DATA.flatMap(c => c.orgs);
const orgById = id => allOrgs().find(org => org.id === id) || null;
const categoryOfOrg = id => DATA.find(cat => cat.orgs.some(org => org.id === id)) || null;
const domain = url => { try { return new URL(url).hostname; } catch { return ''; } };
function escapeHtml(str) {
  if (str == null || str === '') return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
/* Short labels for rows and chips; the full title stays in group headings. */
const CATEGORY_SHORT = {
  bund: 'Bund', kantone: 'Kantone', versicherungen: 'Versicherungen', branchen: 'Verbände',
  spitaeler: 'Spitäler & Kliniken', beratung: 'Beratung & Forschung', pharma: 'Pharma & Medtech', stiftungen: 'Stiftungen & NPO'
};
const categoryShort = key => CATEGORY_SHORT[key] || (DATA.find(cat => cat.key === key)?.title.split('/')[0].trim() ?? '');

/** Two to four letters for the generated avatar: an abbreviation in brackets
 *  ("… (BAG)"), an all-caps first word ("ÖKK") or the first two initials. */
function orgInitials(name) {
  const clean = String(name || '').replace(/[­​]/g, '');
  const abbr = clean.match(/\(([A-ZÄÖÜ][A-Za-zÄÖÜ]{1,4})\)/);
  if (abbr && abbr[1] === abbr[1].toUpperCase()) return abbr[1];
  const words = clean.replace(/\([^)]*\)/g, ' ').split(/[\s/–-]+/).map(w => w.replace(/[^A-Za-zÀ-ÿ]/g, '')).filter(Boolean)
    .filter(w => !/^(für|der|die|das|und|de|du|des|la|le|of|the)$/i.test(w));
  if (!words.length) return '?';
  if (words[0].length <= 4 && words[0] === words[0].toUpperCase() && words[0].length >= 2) return words[0];
  return (words[0][0] + (words[1] ? words[1][0] : words[0][1] || '')).toUpperCase();
}
const ICONS = {
  star: '<svg viewBox="0 0 24 24" aria-hidden="true" class="i-star"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  ext: '<span aria-hidden="true">↗</span>'
};

/* ======== Public feed state shared by directory, profile, map and insights ======== */
const DAY_MS = 24 * 60 * 60 * 1000;
const EmployerFeed = { status: 'pending', jobs: [], sources: new Map(), byOrg: new Map(), generatedAt: null };
const _factsCache = new WeakMap();
/** Facts merged by the feed win; older snapshots fall back to HealthJobFacts. */
function jobFacts(job) {
  if (!job || typeof job !== 'object') return {};
  if (_factsCache.has(job)) return _factsCache.get(job);
  const keys = ['deadline', 'start_date', 'seniority', 'salary_hint', 'salary_range', 'canton'];
  let derived = {};
  if (keys.some(key => job[key] == null) && window.HealthJobFacts?.extractFacts) {
    try { derived = window.HealthJobFacts.extractFacts(job, orgById(job.org_id) ? { ...orgById(job.org_id), category: categoryOfOrg(job.org_id)?.key } : null) || {}; } catch { derived = {}; }
  }
  const facts = Object.fromEntries(keys.map(key => [key, job[key] != null ? job[key] : derived[key] ?? null]));
  _factsCache.set(job, facts);
  return facts;
}
const jobOrgIds = job => Array.isArray(job.org_ids) && job.org_ids.length ? job.org_ids : job.org_id ? [job.org_id] : [];
const jobTime = job => Date.parse(job.first_seen) || 0;
function readPublicFeed() {
  const api = window.PublicJobFeed;
  let jobs = [], sources = [];
  try { jobs = typeof api?.getAllJobs === 'function' ? api.getAllJobs() : typeof api?.getJobs === 'function' ? api.getJobs() : []; } catch { jobs = []; }
  try { sources = typeof api?.getSources === 'function' ? api.getSources() : typeof api?.getSourceStatus === 'function' ? api.getSourceStatus() : []; } catch { sources = []; }
  EmployerFeed.jobs = (Array.isArray(jobs) ? jobs : []).filter(job => job && typeof job.id === 'string' && job.status !== 'closed')
    .sort((a, b) => jobTime(b) - jobTime(a) || a.id.localeCompare(b.id));
  EmployerFeed.sources = new Map((Array.isArray(sources) ? sources : []).filter(s => s && s.org_id).map(s => [s.org_id, s]));
  EmployerFeed.byOrg = new Map();
  for (const job of EmployerFeed.jobs) for (const id of jobOrgIds(job)) {
    if (!EmployerFeed.byOrg.has(id)) EmployerFeed.byOrg.set(id, []);
    EmployerFeed.byOrg.get(id).push(job);
  }
}
const jobsForOrg = id => EmployerFeed.byOrg.get(id) || [];
const feedReady = () => EmployerFeed.status === 'ready';

/* ======== Directory: compact list grouped by category ======== */
let _closedGroups = new Set();
function jobCountHTML(org) {
  if (!feedReady()) {
    return EmployerFeed.status === 'error'
      ? '<span class="org-jobs is-loading" title="Stellenstand nicht erreichbar"><span aria-hidden="true">–</span><span class="visually-hidden">Stellenzahl unbekannt</span></span>'
      : '<span class="org-jobs is-loading" title="Stellen werden geladen"><span aria-hidden="true">–</span><span class="visually-hidden">Stellen werden geladen</span></span>';
  }
  const n = jobsForOrg(org.id).length;
  const label = `${n} ${n === 1 ? 'Stelle' : 'Stellen'}`;
  return n
    ? `<a class="org-jobs" href="?ag=${encodeURIComponent(org.id)}#stellen" aria-label="${label} bei ${escapeHtml(org.name)} im Stellenfeed anzeigen"><strong>${n}</strong> <span>${n === 1 ? 'Stelle' : 'Stellen'}</span></a>`
    : `<span class="org-jobs is-empty"><strong>0</strong> <span>Stellen</span></span>`;
}
function rowHTML(org, cat, isFav) {
  return `<li class="org-row" data-id="${escapeHtml(org.id)}" data-loc="${escapeHtml(org.loc)}">
      <span class="org-avatar" data-cat="${escapeHtml(cat.key)}" aria-hidden="true">${escapeHtml(orgInitials(org.name))}</span>
      <span class="org-main">
        <a class="org-name" href="#arbeitgeber-${escapeHtml(org.id)}">${escapeHtml(org.name)}</a>
        <span class="org-meta">${escapeHtml(org.loc)}<span class="org-meta-cat"> · ${escapeHtml(categoryShort(cat.key))}</span></span>
      </span>
      ${jobCountHTML(org)}
      ${org.jobs ? `<a class="org-career" href="${escapeHtml(org.jobs)}" target="_blank" rel="noopener" aria-label="Karriereseite von ${escapeHtml(org.name)} (neues Fenster)">Karriereseite ${ICONS.ext}</a>` : '<span class="org-career is-none">Kein Portal</span>'}
      <button type="button" class="org-star" data-fav="${escapeHtml(org.id)}" aria-pressed="${isFav}" aria-label="${escapeHtml(org.name)} als Favorit merken" title="${isFav ? 'Favorit entfernen' : 'Als Favorit merken'}">${ICONS.star}</button>
    </li>`;
}
function renderAll() {
  const container = document.getElementById('categories');
  if (!container) return;
  container.querySelectorAll('details.dir-group').forEach(group => {
    if (group.open) _closedGroups.delete(group.dataset.cat); else _closedGroups.add(group.dataset.cat);
  });
  const favs = getFavs();
  const favOnlyOn = typeof favOnly !== 'undefined' && favOnly;
  container.innerHTML = `
    <div class="dir-head">
      <div>
        <h2 id="dirHeading">Verzeichnis</h2>
        <p id="dirCount" class="dir-count" aria-live="polite"></p>
      </div>
      <button type="button" class="dir-favonly" id="favOnly" aria-pressed="${favOnlyOn}">${ICONS.star}<span>Nur Favoriten</span><span class="dir-favcount">${favs.length}</span></button>
    </div>
    <p class="dir-empty" id="dirEmpty" hidden></p>
    ${DATA.map(cat => `
    <details class="dir-group" data-cat="${escapeHtml(cat.key)}"${_closedGroups.has(cat.key) ? '' : ' open'}>
      <summary><span class="dir-group-title">${escapeHtml(cat.title)}</span><span class="dir-group-count">${cat.orgs.length}</span></summary>
      <ul class="dir-list" role="list">
        ${cat.orgs.map(o => rowHTML(o, cat, favs.includes(o.id))).join('')}
      </ul>
    </details>`).join('')}`;
  updateStats();
  if (typeof filterAll === 'function') filterAll();
  if (_currentProfileId) renderEmployerProfile(_currentProfileId, { keepFocus: true });
}
/* Kept for older callers: favourites are now a filter of the directory list. */
function renderFavs() { renderAll(); }

function updateStats() {
  const orgCount = document.getElementById('orgCount');
  if (orgCount) orgCount.textContent = allOrgs().length;
  const catCountEl = document.getElementById('catCount');
  if (catCountEl) catCountEl.textContent = DATA.length;
}

/* The onboarding hint was removed; these stay harmless for old references. */
function showOnboarding() {}
function dismissOnboarding() { try { localStorage.setItem('onboardingDismissed', '1'); } catch {} }

/* ======== Favourite toggle (directory rows and profile) ======== */
function toggleFavorite(id) {
  if (!orgById(id)) return;
  const favs = getFavs();
  saveFavs(favs.includes(id) ? favs.filter(value => value !== id) : [...favs, id]);
  renderAll();
}
document.addEventListener('click', event => {
  const star = event.target.closest?.('[data-fav]');
  if (!star) return;
  event.preventDefault();
  const id = star.dataset.fav, inProfile = !!star.closest('#employerProfile');
  toggleFavorite(id);
  const selector = `${inProfile ? '#employerProfile' : '#categories'} [data-fav="${window.CSS?.escape ? window.CSS.escape(id) : id}"]`;
  document.querySelector(selector)?.focus({ preventScroll: true });
});

/* ======== Employer profile (#arbeitgeber-<id>) ======== */
let _currentProfileId = null, _lastProfileId = null;
const fmtDate = iso => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; };
const fmtDateTime = iso => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleString('de-CH', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; };
const jobHref = id => window.SiteRouter?.jobHash ? window.SiteRouter.jobHash(id) : `#stelle-${String(id).replace(':', '-')}`;

/** Plain-language status of the automatic collection for one employer. */
function sourceSummary(org) {
  const source = EmployerFeed.sources.get(org.id);
  if (!org.jobs || source?.no_portal || source?.has_portal === false) return { tone: 'muted', text: 'Für diesen Arbeitgeber ist kein Stellenportal hinterlegt. Offene Stellen werden deshalb nicht automatisch erfasst.' };
  if (!source) return { tone: 'muted', text: feedReady() ? 'Diese Karriereseite wurde noch nicht automatisch geprüft.' : 'Der Erfassungsstand wird geladen …' };
  const when = fmtDateTime(source.checked_at);
  const found = source.raw_job_count ? ` Dabei wurden ${source.raw_job_count} Inserate gelesen, davon ${source.relevant_job_count || 0} fachlich passend.` : '';
  const lastOk = source.last_success_at && source.last_success_at !== source.checked_at ? ` Letzter erfolgreicher Abruf: ${fmtDateTime(source.last_success_at)}.` : '';
  switch (source.status) {
    case 'ok': case 'empty':
      return source.coverage === 'complete'
        ? { tone: 'ok', text: `Die Karriereseite wurde am ${when} vollständig geprüft.${found}` }
        : { tone: 'ok', text: `Die Karriereseite wurde am ${when} geprüft; ob alle Seiten erfasst wurden, ist unklar.${found}` };
    case 'partial': return { tone: 'warn', text: `Am ${when} nur teilweise erfasst – einzelne Stellen können fehlen.${found}` };
    case 'error': return { tone: 'warn', text: `Der letzte Abruf${when ? ` am ${when}` : ''} ist fehlgeschlagen. Angezeigte Stellen stammen aus einem früheren Stand.${lastOk}` };
    case 'unsupported': return { tone: 'muted', text: 'Diese Karriereseite kann technisch noch nicht automatisch gelesen werden. Bitte direkt auf der Karriereseite nachsehen.' };
    default: return { tone: 'muted', text: 'Diese Karriereseite wurde noch nicht automatisch geprüft.' };
  }
}
function profileJobsHTML(org) {
  if (!feedReady()) {
    if (EmployerFeed.status === 'error') return '<p class="emp-note">Der aktuelle Stellenstand ist gerade nicht erreichbar. Bitte später erneut versuchen oder direkt die Karriereseite öffnen.</p>';
    return `<ul class="emp-job-list" aria-busy="true">${'<li class="emp-job-skel"><span class="skeleton" style="width:70%;height:1rem"></span><span class="skeleton" style="width:40%;height:.8rem"></span></li>'.repeat(3)}</ul>`;
  }
  const jobs = jobsForOrg(org.id);
  if (!jobs.length) return `<p class="emp-note">Im aktuellen Stand gibt es hier keine fachlich passenden offenen Stellen. ${org.jobs ? 'Andere Stellen findest du direkt auf der Karriereseite.' : ''}</p>`;
  return `<ul class="emp-job-list" role="list">${jobs.slice(0, 50).map(job => {
    const meta = [job.location || 'Ort nicht angegeben', job.pensum, job.relevance?.category].filter(Boolean).map(escapeHtml).join(' · ');
    const facts = jobFacts(job);
    return `<li><a class="emp-job" href="${escapeHtml(jobHref(job.id))}"><span class="emp-job-title">${escapeHtml(job.title)}</span><span class="emp-job-meta">${meta}</span></a><span class="emp-job-date">${job.first_seen ? `seit ${escapeHtml(new Date(job.first_seen).toLocaleDateString('de-CH'))}` : ''}${facts.deadline ? `<br>Frist ${escapeHtml(new Date(facts.deadline).toLocaleDateString('de-CH'))}` : ''}</span></li>`;
  }).join('')}</ul>${jobs.length > 1 ? `<p class="emp-more"><a href="?ag=${encodeURIComponent(org.id)}#stellen">Alle ${jobs.length} im Stellenfeed filtern →</a></p>` : ''}`;
}
function profileHistoryHTML(org) {
  if (!feedReady()) return '<p class="emp-note">Wird geladen …</p>';
  const since = Date.now() - 90 * DAY_MS;
  const recent = jobsForOrg(org.id).filter(job => jobTime(job) >= since).length;
  return `<p class="emp-stat"><strong>${recent}</strong> ${recent === 1 ? 'Stelle' : 'Stellen'} in den letzten 90 Tagen erstmals gefunden</p>
    <p class="emp-note">Grundlage ist der aktuelle Stand des Feeds: Gezählt werden nur Stellen, die heute noch offen sind. Bereits geschlossene Inserate sind nicht enthalten.</p>`;
}
function renderEmployerProfile(id, { keepFocus = false } = {}) {
  const mount = document.getElementById('employerProfile');
  if (!mount) return;
  const org = orgById(id), cat = categoryOfOrg(id);
  if (!org) {
    mount.innerHTML = `<div class="emp-profile"><a class="emp-back" href="#arbeitgeber">${ICONS.back}Alle Arbeitgeber</a><div class="view-head"><div><h2 id="empName" tabindex="-1">Arbeitgeber nicht gefunden</h2><p>Diesen Eintrag gibt es im Verzeichnis nicht (mehr). Vielleicht wurde er umbenannt.</p></div></div></div>`;
    return;
  }
  const isFav = getFavs().includes(org.id);
  const source = sourceSummary(org);
  const active = keepFocus ? document.activeElement : null;
  const activeKey = active && mount.contains(active) ? (active.dataset.fav ? '[data-fav]' : active.dataset.empAction ? `[data-emp-action="${active.dataset.empAction}"]` : null) : null;
  mount.innerHTML = `<article class="emp-profile" aria-labelledby="empName">
    <a class="emp-back" href="#arbeitgeber">${ICONS.back}Alle Arbeitgeber</a>
    <header class="emp-head">
      <span class="org-avatar org-avatar-lg" data-cat="${escapeHtml(cat.key)}" aria-hidden="true">${escapeHtml(orgInitials(org.name))}</span>
      <div class="emp-title">
        <p class="eyebrow">${escapeHtml(cat.title)}</p>
        <h2 id="empName" tabindex="-1">${escapeHtml(org.name)}</h2>
        <p class="emp-loc">${ICONS.pin}${escapeHtml(org.loc)}</p>
      </div>
      <button type="button" class="btn emp-fav org-star" data-fav="${escapeHtml(org.id)}" aria-pressed="${isFav}">${ICONS.star}<span>${isFav ? 'Gemerkt' : 'Merken'}</span></button>
    </header>
    <p class="emp-desc">${escapeHtml(org.desc)}</p>
    <div class="emp-actions">
      ${org.jobs ? `<a class="btn btn-primary" href="${escapeHtml(org.jobs)}" target="_blank" rel="noopener">Karriereseite ${ICONS.ext}</a>` : ''}
      <a class="btn" href="${escapeHtml(org.main)}" target="_blank" rel="noopener">Website ${ICONS.ext}</a>
      <button type="button" class="btn" data-emp-action="alert">${ICONS.bell}Jobalarm für diesen Arbeitgeber</button>
      ${org.jobs ? `<button type="button" class="btn" data-emp-action="select">${ICONS.plus}In meiner Suche verwenden</button>` : ''}
    </div>
    <div class="emp-grid">
      <section class="emp-jobs" aria-labelledby="empJobsHeading">
        <h3 id="empJobsHeading">Offene Stellen${feedReady() ? ` <span class="chip chip-brand">${jobsForOrg(org.id).length}</span>` : ''}</h3>
        ${profileJobsHTML(org)}
      </section>
      <aside class="emp-side">
        <section class="emp-box" aria-labelledby="empSourceHeading">
          <h3 id="empSourceHeading">Erfassung</h3>
          <p class="emp-source emp-source-${source.tone}">${escapeHtml(source.text)}</p>
          <p class="emp-note"><a href="#quellen">Alle Quellen &amp; Methode</a></p>
        </section>
        <section class="emp-box" aria-labelledby="empHistoryHeading">
          <h3 id="empHistoryHeading">Verlauf</h3>
          ${profileHistoryHTML(org)}
        </section>
      </aside>
    </div>
  </article>`;
  document.title = `${org.name} | Arbeitgeber | Burgener Gesundheitsjobs`;
  if (activeKey) mount.querySelector(activeKey)?.focus({ preventScroll: true });
}
function showEmployerRoute(route) {
  const profile = document.getElementById('employerProfile'), directory = document.getElementById('employerDirectory');
  if (!profile || !directory) return;
  if (route.sub === 'profil' && route.param) {
    const changed = _currentProfileId !== route.param;
    _currentProfileId = _lastProfileId = route.param;
    directory.hidden = true; profile.hidden = false;
    renderEmployerProfile(route.param);
    if (changed) {
      window.scrollTo(0, 0);
      document.getElementById('empName')?.focus({ preventScroll: true });
    }
  } else {
    const back = _currentProfileId;
    _currentProfileId = null;
    profile.hidden = true; profile.innerHTML = ''; directory.hidden = false;
    if (back) {
      const row = document.querySelector(`#categories .org-row[data-id="${back}"]`);
      if (row && row.offsetParent !== null) { row.scrollIntoView?.({ block: 'center' }); row.querySelector('.org-name')?.focus({ preventScroll: true }); }
    }
  }
}
window.addEventListener('site:route', event => {
  const route = event.detail || {};
  if (route.view === 'arbeitgeber') showEmployerRoute(route);
  else if (_currentProfileId) { _currentProfileId = null; }
});
document.addEventListener('click', event => {
  const button = event.target.closest?.('#employerProfile [data-emp-action]');
  if (!button || !_currentProfileId) return;
  const id = _currentProfileId, api = window.HealthJobs;
  if (button.dataset.empAction === 'alert') {
    if (typeof api?.openAlertDialog === 'function') api.openAlertDialog({ employer: id });
    else location.hash = '#jobalarme';
  } else if (button.dataset.empAction === 'select' && typeof api?.openEmployerSelection === 'function') {
    api.openEmployerSelection([id]);
  }
});

window.addEventListener('publicfeed:loaded', event => {
  const count = event.detail?.count;
  if (Number.isFinite(count)) { readPublicFeed(); EmployerFeed.status = 'ready'; EmployerFeed.generatedAt = event.detail?.generatedAt || null; }
  else if (EmployerFeed.status !== 'ready') EmployerFeed.status = 'error';
  renderAll();
});

/* Retired directory blocks (stats, onboarding, separate favourites box). */
['#employerDirectory .stats', '#onboardingHint', '#fav-sec'].forEach(selector => document.querySelector(selector)?.remove());

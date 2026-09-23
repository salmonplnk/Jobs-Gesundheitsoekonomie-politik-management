# Audit der Jobquellen

Prüfdatum: **22. September 2026 (UTC)**. Wiederhergestellt am 23. September 2026 aus den bereits erhobenen Recherchebefunden. Diese Wiederherstellung ist **keine erneute Liveprüfung**. Die damaligen Rohantworten stehen nach der Umgebungsbereinigung nicht mehr zur Verfügung; die belegten URLs und Beobachtungen sind hier und in den Overrides erhalten.

## Umfang und Statusverständnis

Alle 85 Organisationen wurden berücksichtigt: 81 gespeicherte Jobs-URLs wurden öffentlich per GET angefragt; bei vier fehlenden Jobs-URLs wurden die offiziellen Hauptseiten und öffentliche Suchergebnisse geprüft. Der Erstabruf ergab **75 HTTP-200-Antworten, fünf HTTP-Fehler und einen Timeout**. Vier Einträge hatten keinen Jobs-Link.

HTTP200 belegt Erreichbarkeit, nicht eine erfolgreiche Extraktion oder vollständige Stellenabdeckung. HTTP403 wird als Zugriff verweigert behandelt. Ein502 oder Timeout kann auch vom Abrufweg stammen und beweist keinen Websiteausfall. Sperren, Logins und CAPTCHAs wurden nicht umgangen. Erfolgreiche Extraktion, Pagination, Aktualität und Abdeckung werden vom Jobfeed separat berichtet.

47 Katalogeinträge erhalten verifizierte Overrides. Neun werden zusätzlich über enge Organisationsbegriffe begrenzt: BAG, BSV, SECO, BFS, Aargau DGS, Bern GSI, WIG, ZHAW Gesundheit und Universität Luzern Gesundheitsfakultät.

## Wichtige Korrekturen und Grenzen

- **SNF/KSGR:** Alte Stellenpfade lieferten404. Neue offizielle Portale sind https://talents.snf.ch/de/jobs und https://jobs.ksgr.ch/. Der direkte KSGR-Folgeabruf wurde mit403 verweigert; öffentlicher Webabruf bestätigte die JavaScript-Anwendung.
- **CHUV/BSS/santésuisse:** Alte Jobadressen leiteten auf allgemeine beziehungsweise sachfremde Seiten. Die Overrides enthalten belegte aktuelle Einstiege. BSS verweigerte den Abruf des richtigen Pfads mit403; daraus folgt keine leere Stellenliste.
- **santéservices:** Die offizielle Firmengeschichte unter https://www.santeservices.ch/santeservices/ dokumentierte seit1. Juli2026 die gemeinsame Marke von santésuisse, SVK, SASIS AG und santéservices. Das Portal https://www.santeservices.ch/offene-stellen/ ist der offizielle Nachfolge-Einstieg. Katalogname und Stellenarbeitgeber sind getrennt zu behandeln; `hiringOrganization` aus dem Inserat erhalten.
- **Bund:** Alle vier Amts-URLs lieferten dieselbe JavaScript-Anwendung (Careercenter1000624). Bestehende Verwaltungseinheitsfilter müssen die tatsächliche Datenauswahl begrenzen. Zusätzlich enge `scope_terms` prüfen; ein unveränderter Querystring beweist keine serverseitige Filterung.
- **Bern GSI:** Das publizierte iframe-Attribut enthielt eine verschachtelte URL im `filter_90`. Die Originalseite bleibt daher der Einstieg; nur der belegte Portalhost wird freigegeben. Direktionfilter1152068/1152071/1152072 vor Verwendung fachlich prüfen.
- **AG DGS, WIG, ZHAW und Uni Luzern:** Die verlinkten Stellenmärkte umfassen jeweils mehr als den benannten Katalogbereich. AG benötigt DGS-Zuordnung, WIG/ZHAW Instituts- beziehungsweise Departementszuordnung. Uni Luzern trennte einschlägige Stellen unter der HTML-Überschrift «Fakultät für Gesundheitswissenschaften und Medizin». Unklare Treffer nicht als eindeutig zugeordnet veröffentlichen; Ausschlüsse bedeuten partielle Abdeckung.
- **Spitex:** Laut Katalog ein Branchenportal mit unterschiedlichen Arbeitgebern. Der Stellenarbeitgeber darf nicht pauschal durch Spitex Schweiz ersetzt werden.
- **Pflegewegweiser:** Vollständige Stelleninhalte lagen in `.jobs-loxo__item[data-job-id][data-department][data-location]`. Keine Detail-URL erfinden; Quellseite oder vorhandene Anker verwenden. Die Organisation ist ein Leistungserbringer und keine allgemeine Nonprofit-Stellenplattform.
- **Careum:** Teilweise gzip-komprimierte Antwort. Vor HTML-Parsing dekomprimieren; unlesbarer komprimierter Rohtext ist kein Websitefehler. Beim Audit waren nur Initiativbewerbungen sichtbar.

## Vier Einträge ohne verifiziertes eigenes Stellenportal

| ID | Ergebnis vom22. September |
|---|---|
| hplus | Offizielle Hauptseite erreichbar; kein aktueller eigener Stellenlink verifiziert. Keine URL ergänzt. |
| oaat | Hauptseite geprüft. Indexierter alter Pfad https://oaat-otma.ch/ueber-uns/offene-stellen bestätigte404 per Direktabruf und Webabruf. |
| polynomics | Offizielle Hauptseite erreichbar; kein aktueller eigener Stellenlink verifiziert. |
| diabetes | Hauptseite geprüft. https://beratungssektion.diabetesschweiz.ch/news-agenda/news-inserate veröffentlicht fremde Spitalstellen; diese wurden nicht als eigene Diabetes-Schweiz-Vakanzen übernommen. |

## Alle Quellen nach Kataloggruppe

Die Statusspalte beschreibt den Erstabruf des ursprünglichen Kataloglinks am22. September. Ein separater Override kann auf eine verifizierte aktuelle Quelle zeigen. „Native HTML-Seite“ ist ein Parseransatz, keine Behauptung vorhandener oder vollständig erfasster Vakanzen.

### Bund / bundesnahe Institutionen

| ID | Ursprünglicher Jobs-Link | Erstabruf | Effektiver Einstieg / Ansatz |
|---|---|---|---|
| bag | [Katalog-URL](https://jobs.admin.ch/?lang=de&f=verwaltungseinheit:1083353) | HTTP200 | Prospective SPA; Verwaltungseinheit prüfen; scope_terms |
| bsv | [Katalog-URL](https://jobs.admin.ch/?lang=de&f=verwaltungseinheit:1083356) | HTTP200 | Prospective SPA; Verwaltungseinheit prüfen; scope_terms |
| seco | [Katalog-URL](https://jobs.admin.ch/?lang=de&f=verwaltungseinheit:1083355) | HTTP200 | Prospective SPA; Verwaltungseinheit prüfen; scope_terms |
| bfs | [Katalog-URL](https://jobs.admin.ch/?lang=de&f=verwaltungseinheit:1083346) | HTTP200 | Prospective SPA; Verwaltungseinheit prüfen; scope_terms |
| kvg | [Katalog-URL](https://www.kvg.org/jobs/) | HTTP200 | Native Stellenkarten und PDF-Detailverweise |
| obsan | [Katalog-URL](https://www.obsan.admin.ch/de/das-obsan/offene-stellen) | HTTP200 | Native HTML-Seite |
| swissmedic | [Katalog-URL](https://www.swissmedic.ch/swissmedic/de/home/ueber-uns/offene-stellen.html) | HTTP200 | Native konkrete Stellenlinks |
| gdk | [Katalog-URL](https://www.gdk-cds.ch/de/die-gdk/stellenangebote) | HTTP200 | Native HTML-Seite |
| suva | [Katalog-URL](https://jobs.suva.ch/) | HTTP200 | SAP SuccessFactors |
| snf | [Katalog-URL](https://www.snf.ch/de/dQyZEssAGiiYhU5R/seite/ueberuns/offene-stellen) | HTTP 404 | [Korrigierter Einstieg](https://talents.snf.ch/de/jobs) — Teamtailor; neuer Einstieg bestätigt |

### Kantonale Verwaltungen

| ID | Ursprünglicher Jobs-Link | Erstabruf | Effektiver Einstieg / Ansatz |
|---|---|---|---|
| ag | [Katalog-URL](https://www.ag.ch/de/ueber-uns/jobs-karriere) | HTTP200 | [Korrigierter Einstieg](https://www.ag.ch/de/ueber-uns/jobs-karriere/offene-stellen) — Offizieller JSON-Feed; DGS-Scope; scope_terms |
| ar | [Katalog-URL](https://ar.ch/verwaltung/departement-finanzen/personalamt/freie-stellen/) | HTTP200 | [Korrigierter Einstieg](https://live.solique.ch/kanton-appenzell-ausserrhoden/) — Solique-iframe |
| ai | [Katalog-URL](https://www.ai.ch/themen/arbeiten-bei-der-kantonalen-verwaltung/offene-stellen-1) | HTTP200 | Native HTML-Seite |
| be | [Katalog-URL](https://www.gsi.be.ch/de/start/ueber-uns/offene-stellen.html) | HTTP200 | Prospective; iframe-Query fehlerhaft, GSI-Scope; scope_terms |
| bl | [Katalog-URL](https://www.baselland.ch/politik-und-behorden/direktionen/finanz-und-kirchendirektion/personalamt/jobs/offene-stellen/) | HTTP 403 – Zugriff verweigert | 403 nicht als leer behandeln |
| bs | [Katalog-URL](https://www.bs.ch/themen/arbeit-und-steuern/stellenbesetzung-arbeitslosigkeit/offene-stellen/offene-stellen-beim-kanton-basel-stadt) | HTTP200 | [Korrigierter Einstieg](https://stellenmarkt.bs.ch/kbs/) — iframe-Ziel im Nuxt-Seitenzustand, native Liste |
| gr | [Katalog-URL](https://www.gr.ch/stellen) | HTTP200; Redirect | [Korrigierter Einstieg](https://apply.refline.ch/514915/search.html?lang=de) — Refline-Redirect |
| lu | [Katalog-URL](https://stellen.lu.ch/job) | HTTP200 | Refline-Hinweise im HTML |
| sg | [Katalog-URL](https://www.sg.ch/ueber-den-kanton-st-gallen/arbeitgeber-kanton-stgallen/stellenportal.html) | HTTP200 | [Korrigierter Einstieg](https://recruitingapp-2800.umantis.com/Jobs/All?CompanyID=1%7C24%7C25%7C26%7C27%7C28%7C29%7C30%7C31%7C32%7C33%7C34%7C35%7C36%7C37%7C38%7C39%7C40%7C41%7C42%7C43%7C44%7C45%7C46%7C47%7C48%7C49%7C50%7C51%7C52%7C53%7C54%7C55%7C56%7C57%7C58%7C59%7C61%7C62%7C63%7C64%7C65%7C66%7C67%7C68%7C69%7C70%7C71%7C72%7C73%7C75%7C76%7C77%7C78%7C79%7C80%7C81%7C82%7C83%7C84%7C85%7C86%7C87%7C88%7C89%7C90%7C91%7C92%7C94%7C96%7C98%7C100%7C102%7C104%7C106%7C108%7C110%7C132%7C134%7C136&DesignID=00) — Umantis-iframe; Query erhalten |
| so | [Katalog-URL](https://karriere.so.ch/stellenmarkt/offene-stellen/) | HTTP200 | [Korrigierter Einstieg](https://ktso.prospective.ch/?sort=-startDate) — Prospective-iframe |
| sz | [Katalog-URL](https://www.sz.ch/services/offene-stellen.html/8756-8761-10387) | HTTP200 | [Korrigierter Einstieg](https://sz.prospective.ch/) — Prospective-iframe |
| tg | [Katalog-URL](https://stellen.tg.ch/) | HTTP200 | Native Links auf Prospective-Jobdetails |
| ur | [Katalog-URL](https://www.ur.ch/stellen) | HTTP200 | Native HTML-Seite |
| zh | [Katalog-URL](https://live.solique.ch/KTZH/de/ORG60/) | HTTP200 | Solique mit ORG60-Scope im Pfad |
| zg | [Katalog-URL](https://www.zg.ch/de/offene-stellen) | HTTP200; Redirect | [Korrigierter Einstieg](https://zg.prospective.ch) — Prospective-iframe |
| ge | [Katalog-URL](https://www.ge.ch/offres-emploi-etat-geneve/liste-offres) | HTTP200 | Native französische Angebotsliste |

### Versicherungen

| ID | Ursprünglicher Jobs-Link | Erstabruf | Effektiver Einstieg / Ansatz |
|---|---|---|---|
| atupri | [Katalog-URL](https://www.atupri.ch/karriere-jobs) | HTTP200; Redirect | Umantis-Jobabo / Visana-Verweise; kein belegter eigener JSON-Feed |
| concordia | [Katalog-URL](https://www.concordia.ch/de/ueber-uns/jobs/offene-stellen.html) | HTTP200 | [Korrigierter Einstieg](https://jobs.concordia.ch/?lang=de) — Prospective-iframe |
| css | [Katalog-URL](https://jobs.css.ch/) | HTTP200 | Statische Prospective-Liste mit Pagination |
| groupemutuel | [Katalog-URL](https://groupemutuel.csod.com/ux/ats/careersite/4/home?c=groupemutuel) | HTTP200 | Cornerstone CSOD; dynamische Stellenliste |
| helsana | [Katalog-URL](https://www.helsana.ch/de/helsana-gruppe/jobs) | HTTP200; Redirect | [Korrigierter Einstieg](https://careers.helsana.ch/) — SAP SuccessFactors, aktueller Portalindex |
| helvetia | [Katalog-URL](https://jobs.helvetia.com/) | HTTP200 | Prospective SPA, Careercenter1002532 |
| kpt | [Katalog-URL](https://www.kpt.ch/de/ueber-kpt/arbeiten-bei-der-kpt/offene-stellen) | HTTP200; Redirect | [Korrigierter Einstieg](https://ohws.prospective.ch/public/v2/careercenter/1007102/?lang=de&f=30:1690495,1690493,1690494) — Prospective public/v2 iframe; Filter erhalten |
| oekk | [Katalog-URL](https://www.oekk.ch/de/oekk/karriere/bewerben/offene-stellen) | HTTP200 | [Korrigierter Einstieg](https://jobs.oekk.ch/Jobs/All?CompanyID=All&Reset=G) — Umantis /Jobs/All |
| sanitas | [Katalog-URL](https://www.sanitas.com/de/ueber-sanitas/arbeiten-bei-sanitas/offene-stellen.html) | HTTP200 | [Korrigierter Einstieg](https://jobs.sanitas.com/) — Statischer Prospective-Portalindex |
| swica | [Katalog-URL](https://www.swica.ch/de/kampagnen/intern/jobs/freie-stellen) | HTTP200; Redirect | [Korrigierter Einstieg](https://jobs.swica.ch/) — Next.js auf Hauptseite; öffentliches Jobportal |
| visana | [Katalog-URL](https://jobs.visana.ch/) | HTTP200 | Prospective SPA, Careercenter1004518 |
| assura | [Katalog-URL](https://www.assura.ch/de/ueber-assura/karriere) | Timeout im Abrufweg | Timeout belegt keinen Websiteausfall |
| egk | [Katalog-URL](https://www.egk.ch/de/ueber-uns/offene-stellen) | HTTP200; Redirect | [Korrigierter Einstieg](https://www.egk.ch/de/ihre-egk/ueber-uns/offene-stellen) — Native aktuelle Stellenansicht |

### Branchen- / Tariforganisationen

| ID | Ursprünglicher Jobs-Link | Erstabruf | Effektiver Einstieg / Ansatz |
|---|---|---|---|
| curafutura | [Katalog-URL](https://prio.swiss/jobs/) | HTTP200 | Native WordPress-Seite |
| fmh | [Katalog-URL](https://www.fmh.ch/ueber-die-fmh/offene-stellen.cfm) | HTTP200 | [Korrigierter Einstieg](https://karriere-fmh-siwf.abacuscity.ch/de/jobportal?jobportal_desc_filter_text=FMH&domain=FMH) — Abacus-iframe mit FMH-Filter |
| hplus | — | Kein Jobs-Link | Kein eigenes Portal verifiziert |
| interpharma | [Katalog-URL](https://www.interpharma.ch/ueber-uns/) | HTTP200 | Über-uns-Seite; keine Stellenliste verifiziert |
| oaat | — | Kein Jobs-Link | Kein eigenes Portal verifiziert |
| santesuisse | [Katalog-URL](https://www.santesuisse.ch/de/ueber-santesuisse/offene-stellen/) | HTTP200; Redirect | [Korrigierter Einstieg](https://www.santeservices.ch/offene-stellen/) — Offizielles santéservices-Nachfolgeportal; echten Arbeitgeber erhalten |
| spitex | [Katalog-URL](https://www.spitex.ch/Jobs/PgiA1/) | HTTP200; Redirect | [Korrigierter Einstieg](https://www.spitex.ch/de/arbeiten-bei-der-spitex) — Branchenportal; Inserat-Arbeitgeber erhalten |
| pharmasuisse | [Katalog-URL](https://www.pharmasuisse.org/de/der-verband/jobs-und-karriere) | HTTP200; Redirect | [Korrigierter Einstieg](https://pharmasuisse.org/de/der-verband/jobs-und-karriere) — Explizit keine aktuellen Vakanzen beim Audit |
| sbk | [Katalog-URL](https://sbk-asi.ch/de/pflege-und-arbeit/arbeit/jobs) | HTTP200 | Carejobs-Seite |

### Leistungserbringer (Spitäler / Kliniken)

| ID | Ursprünglicher Jobs-Link | Erstabruf | Effektiver Einstieg / Ansatz |
|---|---|---|---|
| chuv | [Katalog-URL](https://www.chuv.ch/fr/chuv-home/recrutement) | HTTP200; Redirect | [Korrigierter Einstieg](https://recrutement.chuv.ch/home.html#filter=p_web_site_id%3D5352%26p_published_to%3DWWW%26p_language%3DDEFAULT%26p_direct%3DY%26p_format%3DMOBILE%26p_search%3D) — Öffentliches Rekrutierungsportal + bestätigter Formular-JSON-Feed |
| hirslanden | [Katalog-URL](https://careers.hirslanden.ch/) | HTTP 502 im Abrufweg | 502 im Abrufweg, keine Ausfallbehauptung |
| insel | [Katalog-URL](https://jobs.inselgruppe.ch/?lang=de) | HTTP200 | JavaScript-Careercenter |
| ksa | [Katalog-URL](https://jobs.ksa.ch/) | HTTP200 | JavaScript-Careercenter1003009 |
| kssg | [Katalog-URL](https://jobs.kssg.ch/) | HTTP 502 im Abrufweg | [Korrigierter Einstieg](https://jobs.h-och.ch/) — Öffentliches SAP-Portal HOCH; direkter Abruf502 |
| ksw | [Katalog-URL](https://www.ksw.ch/jobs-karriere/jobs/offene-stellen/) | HTTP200 | [Korrigierter Einstieg](https://live.solique.ch/KSW/de/internet/#/) — Solique-iframe |
| luks | [Katalog-URL](https://www.luks.ch/stellen-und-karriere/offene-stellen/) | HTTP200 | [Korrigierter Einstieg](https://jobs.luks.ch/) — Gatsby-Jobsuchmodul; Prospective-Portalindex200 |
| smn | [Katalog-URL](https://www.swissmedical.net/de/karriere/stellenangebote) | HTTP200 | Paginierte Liste; SmartRecruiters SwissMedicalNetwork1 |
| soh | [Katalog-URL](https://www.solothurnerspitaeler.ch/jobs-karriere/jobangebote) | HTTP200 | Native Liste mit jobs.so-h.ch / Prospective-Details |
| spitalwallis | [Katalog-URL](https://www.hopitalduvalais.ch/lhopital-du-valais/emploi/) | HTTP200; Redirect | Verlinktes postulations.hopitalvs.ch / ServiceNow-Portal |
| usb | [Katalog-URL](https://www.unispital-basel.ch/jobs-und-karriere/Jobs) | HTTP200 | Öffentlicher JSON-Feed; Offset/Limit beachten |
| usz | [Katalog-URL](https://jobs.usz.ch/?lang=de) | HTTP200 | JavaScript-Portal |
| hug | [Katalog-URL](https://www.hug.ch/emploi) | HTTP200 | [Korrigierter Einstieg](https://careers.smartrecruiters.com/HUG) — SmartRecruiters-Kennung HUG |
| ksgr | [Katalog-URL](https://www.ksgr.ch/karriere/offene-stellen) | HTTP 404 | [Korrigierter Einstieg](https://jobs.ksgr.ch/) — Neue JavaScript-Stellenanwendung; Folgeabruf403 |

### Beratung / Forschung

| ID | Ursprünglicher Jobs-Link | Erstabruf | Effektiver Einstieg / Ansatz |
|---|---|---|---|
| bss | [Katalog-URL](https://www.bss-basel.ch/de/unternehmen/jobs/) | HTTP200; Redirect | [Korrigierter Einstieg](https://bss-basel.ch/de/ueber-uns/bei-uns-arbeiten) — Korrigierter offizieller Pfad verweigert Abruf403 |
| careum | [Katalog-URL](https://careum.ch/ueber-uns/jobs) | HTTP200; Redirect | [Korrigierter Einstieg](https://careum.ch/ueber-uns/arbeiten-bei-careum/offene-stellen) — Gzip dekomprimieren; nur Initiativbewerbung beim Audit |
| dayone | [Katalog-URL](https://www.dayone.swiss/about-us/careers/) | HTTP200 | Native WordPress-Seite |
| infras | [Katalog-URL](https://www.infras.ch/de/stellen/) | HTTP200 | Native Stellenansicht |
| polynomics | — | Kein Jobs-Link | Kein eigenes Portal verifiziert |
| sotomo | [Katalog-URL](https://sotomo.ch/site/jobs/) | HTTP200; Redirect | [Korrigierter Einstieg](https://sotomo.ch/de/jobs/) — Explizit keine aktuellen Vakanzen beim Audit |
| swisstph | [Katalog-URL](https://jobs.swisstph.ch/Jobs/All) | HTTP200 | Umantis |
| unilu | [Katalog-URL](https://www.unilu.ch/universitaet/personal/personaldienst/offene-stellen/) | HTTP200 | Gesundheitsfakultät als eigene HTML-Rubrik; Scope erforderlich; scope_terms |
| wig | [Katalog-URL](https://www.zhaw.ch/de/jobs/offene-stellen) | HTTP200 | Ungefilterter ZHAW-Markt; Instituts-Scope; scope_terms |
| zhaw | [Katalog-URL](https://www.zhaw.ch/de/jobs/offene-stellen) | HTTP200 | Ungefilterter ZHAW-Markt; Departements-Scope; scope_terms |
| ecoplan | [Katalog-URL](https://www.ecoplan.ch/de/ecoplan#offene-stellen) | HTTP200 | Explizit keine aktuellen Vakanzen beim Audit |
| interface | [Katalog-URL](https://www.interface-pol.ch/category/stellen) | HTTP200 | Explizit keine aktuellen Vakanzen beim Audit |

### Stiftungen / Non-Profits

| ID | Ursprünglicher Jobs-Link | Erstabruf | Effektiver Einstieg / Ansatz |
|---|---|---|---|
| alzheimer | [Katalog-URL](https://www.alzheimer-schweiz.ch/de/ueber-uns/offene-stellen) | HTTP200 | Native HTML-Seite |
| diabetes | — | Kein Jobs-Link | Kein eigenes Portal verifiziert |
| gfs | [Katalog-URL](https://gesundheitsfoerderung.ch/stiftung/stellenangebote) | HTTP200 | Externe Jobdetails auf my.jobalino.ch |
| krebsliga | [Katalog-URL](https://www.krebsliga.ch/ueber-uns/jobs) | HTTP200 | Veröffentlichter Ostendis-Loader |
| lungenliga | [Katalog-URL](https://www.lungenliga.ch/ueber-uns/jobs) | HTTP200 | Eigene Details + Ostendis-Publikationen |
| pflegewegweiser | [Katalog-URL](https://pflegewegweiser.ch/karriere/) | HTTP200 | Vollständige native .jobs-loxo__item-Karten |
| proinfirmis | [Katalog-URL](https://jobs.proinfirmis.ch/de) | HTTP200 | Öffentliches Stellenportal |
| rheumaliga | [Katalog-URL](https://www.rheumaliga.ch/ueber-uns/organisation/offene-stellen) | HTTP200; Redirect | [Korrigierter Einstieg](https://www.rheumaliga.ch/ueber-uns/jobs/offene-stellen.html) — Explizit keine aktuellen Vakanzen beim Audit |
| srk | [Katalog-URL](https://www.redcross.ch/de/arbeiten-beim-srk-sinnvoll-und-herausfordernd) | HTTP200 | Offizielle Verweise zu rexx.redcross.ch |
| prosenectute | [Katalog-URL](https://www.prosenectute.ch/de/ueber-uns/pro-senectute-schweiz/stellen.html) | HTTP200 | Native HTML-Seite |
| suchtschweiz | [Katalog-URL](https://www.suchtschweiz.ch/wofuer-wir-einstehen/arbeiten-bei-sucht-schweiz/) | HTTP200 | Native WordPress-Seite |

## Beobachtete Redirects

| ID | Ziel des ursprünglichen Links |
|---|---|
| gr | [https://apply.refline.ch/514915/search.html?lang=de](https://apply.refline.ch/514915/search.html?lang=de) |
| zg | [https://zg.ch/de/offene-stellen](https://zg.ch/de/offene-stellen) |
| atupri | [https://atupri.ch/karriere-jobs](https://atupri.ch/karriere-jobs) |
| helsana | [https://www.helsana.ch/de/helsana-gruppe/jobs.html](https://www.helsana.ch/de/helsana-gruppe/jobs.html) |
| kpt | [https://www.kpt.ch/de/jobs-karriere/offene-stellen](https://www.kpt.ch/de/jobs-karriere/offene-stellen) |
| swica | [https://www.swica.ch/de/ueber-swica/jobs/freie-stellen/job-finder](https://www.swica.ch/de/ueber-swica/jobs/freie-stellen/job-finder) |
| egk | [https://www.egk.ch/de/ihre-egk/ueber-uns/offene-stellen](https://www.egk.ch/de/ihre-egk/ueber-uns/offene-stellen) |
| santesuisse | [https://www.santeservices.ch/bildung/](https://www.santeservices.ch/bildung/) |
| spitex | [https://www.spitex.ch/de/arbeiten-bei-der-spitex](https://www.spitex.ch/de/arbeiten-bei-der-spitex) |
| pharmasuisse | [https://pharmasuisse.org/de/der-verband/jobs-und-karriere](https://pharmasuisse.org/de/der-verband/jobs-und-karriere) |
| chuv | [https://www.chuv.ch/fr/](https://www.chuv.ch/fr/) |
| spitalwallis | [https://www.hopitalduvalais.ch/lhopital-du-valais/emploi/employeur-attractif](https://www.hopitalduvalais.ch/lhopital-du-valais/emploi/employeur-attractif) |
| bss | [https://www.bss-basel.ch/de/](https://www.bss-basel.ch/de/) |
| careum | [https://careum.ch/ueber-uns/arbeiten-bei-careum](https://careum.ch/ueber-uns/arbeiten-bei-careum) |
| sotomo | [https://sotomo.ch/de/jobs/](https://sotomo.ch/de/jobs/) |
| rheumaliga | [https://www.rheumaliga.ch/ueber-uns/jobs/offene-stellen.html](https://www.rheumaliga.ch/ueber-uns/jobs/offene-stellen.html) |

## Verifizierte öffentliche JSON-Antworten

Die folgenden Pfade wurden aus veröffentlichtem Frontend beziehungsweise Suchformular abgeleitet und am22. September direkt als JSON bestätigt. Summen sind Momentaufnahmen des Audits und keine zugesicherte Anzahl im normalisierten Feed.

| Quelle | Endpoint und damaliger Befund |
|---|---|
| Aargau | https://www.ag.ch/io/jobs-proxy/jobs — HTTP200, `offset`, `total:69`, `jobs`. Die offizielle Stellenansicht veröffentlichte `data-api=/io/jobs-proxy` und `/io/jobs-frontend/asset-manifest.json`; das referenzierte Frontend lud `/jobs` und `/attributes`. Der gesamte Kantonsfeed benötigt DGS-Scoping. |
| USB | https://www.unispital-basel.ch/.rest/jobs/search?lang=de&offset=0&limit=20 — HTTP200, `medium_id:1005524`, `total:127`, `jobs`, Filterdaten. Das veröffentlichte Frontend verwendete außerdem `/.rest/delivery/jobFilters`; Seiten vollständig über Offset/Limit abrufen. |
| CHUV | https://recrutement.chuv.ch/utf8/ic_job_feeds.feed_engine?p_web_site_id=5352&p_published_to=WWW&p_language=DEFAULT&p_direct=Y&p_format=MOBILE&p_summary=Y&p_order=DATE_ON — HTTP200, `jobs`, `total`; Inserate mit `id`, `title`, `weblink`. Das öffentliche Formular nannte den Feedpfad und die Parameter. |

## Weitere öffentliche technische Belege

| Quelle | Beleg / Parseransatz |
|---|---|
| Solique | AR iframe https://live.solique.ch/kanton-appenzell-ausserrhoden/; KSW iframe https://live.solique.ch/KSW/de/internet/#/; Kanton Zürich bereits https://live.solique.ch/KTZH/de/ORG60/. |
| Prospective | SO iframe https://ktso.prospective.ch/?sort=-startDate; SZ https://sz.prospective.ch/; ZG https://zg.prospective.ch; Concordia https://jobs.concordia.ch/?lang=de; KPT veröffentlichte public/v2-Careercenter1007102 samtFilter. |
| LUKS | Öffentliches Gatsby-JSON https://www.luks.ch/page-data/stellen-und-karriere/offene-stellen/page-data.json bestätigte Jobsuchmodul; Portal https://jobs.luks.ch/ direkt HTTP200. |
| FMH | Offizielles Abacus-iframe https://karriere-fmh-siwf.abacuscity.ch/de/jobportal?jobportal_desc_filter_text=FMH&domain=FMH. FMH-Scope im gemeinsamen FMH/SIWF-System erhalten. |
| HUG / Swiss Medical Network | Offizielle Links zu SmartRecruiters mit Kennungen `HUG` beziehungsweise `SwissMedicalNetwork1`. |
| Krebsliga | Veröffentlichter Ostendis-Loader https://odm.ostendis.com/ojp/assets/loader mit öffentlicher Embed-Konfiguration. Keine ungeprüften API-Pfade ableiten. |
| Lungenliga / GFS / SRK | Offizielle Links zu `link.ostendis.com`, `my.jobalino.ch` beziehungsweise `rexx.redcross.ch`. |
| Wallis | Offizielle Arbeitgeberseite verlinkte https://postulations.hopitalvs.ch/ und https://vs.service-now.com/x/hdvi2/hvs-ats-portal/landing/params/language/fr/spref/. Nur Hosts freigegeben; kein unbestätigter JSON-Endpoint konstruiert. |

## Override-Schema

`data/job-source-overrides.json` enthält `version`, `checked_at` und `sources` mit Organisations-ID als Schlüssel. Jeder Override besitzt `evidence_urls` und `note`. Optional: `jobs`, `allowed_hosts`, `adapter`, `scope_terms`. `checked_at` bleibt2026-09-22; die Wiederherstellung am Folgetag ändert den Prüfzeitpunkt nicht.

Hostfreigaben gelten für belegte öffentliche Stellenquellen, nicht beliebige ATS-Kunden. Adapterwerte sind technische Hinweise und keine Erfolgsgarantie. `scope_terms` werden als enge Wort-/Phrasengrenzen im normalisierten vollständigen Stellentext einschließlich echtem Arbeitgeber geprüft. Unklare Zuordnung und ausgeschlossene Treffer sollen als partielle beziehungsweise unbekannte Abdeckung sichtbar bleiben, statt einen leeren oder vollständigen Bestand vorzutäuschen.

const {test}=require('node:test');
const assert=require('node:assert/strict');
const modulePromise=import('../supabase/functions/_shared/job-additional-ats-adapter.mjs');
const oekk={id:'oekk',name:'ÖKK',main:'https://www.oekk.ch/',jobs:'https://jobs.oekk.ch/Jobs/All?CompanyID=All&Reset=G',adapter:'umantis'};
const fmh={id:'fmh',name:'FMH',main:'https://www.fmh.ch/',jobs:'https://karriere-fmh-siwf.abacuscity.ch/de/jobportal?jobportal_desc_filter_text=FMH&domain=FMH'};
const hoch={id:'kssg',name:'HOCH',main:'https://www.h-och.ch/',jobs:'https://jobs.h-och.ch/'};
const ksw={id:'ksw',name:'KSW',main:'https://www.ksw.ch/',jobs:'https://live.solique.ch/KSW/de/internet/#/'};
const paragraphs='<p>Sie analysieren die Gesundheitsversorgung und entwickeln tragfähige Konzepte zur Finanzierung und Organisation der Leistungserbringung.</p><ul><li>Sie arbeiten mit Fachpersonen und Entscheidungsträgern eng zusammen und bereiten Analysen verständlich auf.</li></ul>';

test('HTML providers require the configured employer tenant and safe detail routes',async()=>{
 const a=await modulePromise;
 assert.equal(a.detectAdditionalAdapter(oekk).format,'html');assert.equal(a.detectAdditionalAdapter(fmh).kind,'abacus');
 assert.equal(a.detectAdditionalAdapter(ksw,'https://live.solique.ch/ksw/').kind,'solique');
 for(const url of ['https://live.solique.ch/other/','https://live.solique.ch.evil.ch/KSW/','https://live.solique.ch/KSW/job/details/123','http://live.solique.ch/KSW/'])assert.equal(a.detectAdditionalAdapter(ksw,url),null);
 assert.throws(()=>a.additionalFetchOrg({...a.detectAdditionalAdapter(fmh),apiUrl:'https://attacker.ch/'},fmh),/Quelle/);
});

test('Umantis follows published component pagination and preserves employer filters',async()=>{
 const a=await modulePromise;const org={...oekk,jobs:'https://jobs.oekk.ch/Jobs/All?CompanyID=12%7C24&DesignID=00'};
 const html='<html><a href="/Vacancies/1054/Description/1">Case Manager</a><span data-pagination-next-href="?tc115=p2&amp;_search_token115=1234"></span><table-navigation initial-data-string="{&quot;TableMaxEntries&quot;:&quot;1&quot;,&quot;TableTo&quot;:1,&quot;TableTotalLines&quot;:2}"></table-navigation></html>';
 const r=a.normalizeAdditionalPayload(a.detectAdditionalAdapter(org),html,org);
 assert.equal(r.links.length,1);assert.equal(r.listingLinks.length,1);assert.equal(r.expectedCount,2);assert.equal(r.hasPagination,true);assert.equal(r.complete,false);
 const u=new URL(r.listingLinks[0].url);assert.equal(u.searchParams.get('CompanyID'),'12|24');assert.equal(u.searchParams.get('DesignID'),'00');assert.equal(u.searchParams.get('tc115'),'p2');
 const second=a.detectAdditionalAdapter(org,u.href);assert.ok(second);assert.equal(a.detectAdditionalAdapter(org,u.href.replace('12%7C24','99')),null);
});

test('Umantis rejects foreign or changed-filter pagers and stops a short final page',async()=>{
 const a=await modulePromise;const html='<html><a href="/Vacancies/1/Description/1">Analyst</a><span data-pagination-next-href="?tc12=p2&amp;CompanyID=Other"></span><table-navigation initial-data-string="{&quot;TableMaxEntries&quot;:10}"></table-navigation></html>';
 const r=a.normalizeAdditionalPayload(a.detectAdditionalAdapter(oekk),html,oekk);assert.equal(r.links.length,1);assert.equal(r.listingLinks.length,0);assert.equal(r.complete,true);
 assert.equal(a.normalizeAdditionalPayload(a.detectAdditionalAdapter(oekk),'<html><h1>Stellenmarkt</h1></html>',oekk).explicitEmpty,false);
 assert.equal(a.normalizeAdditionalPayload(a.detectAdditionalAdapter(oekk),'<script>"Keine Stellen"</script>',oekk).explicitEmpty,false);
});

test('Umantis extracts complete visible cards without h1, including nested lists',async()=>{
 const a=await modulePromise;const html=`<html><body><div class="container_2"><div class="content"><div class="pubtitle"><p>Case Manager*in OKP</p></div><div class="arbeitsort_pensum">80-100%, Landquart</div><div>Das erwartet dich</div>${paragraphs}<div>Das bringst du mit</div><p>Erfahrung im Case Management und ein Hochschulabschluss.</p><div>Wir freuen uns auf deine Bewerbung.</div></div></div></body></html>`;
 const r=a.extractAdditionalVacancies(html,oekk,'https://jobs.oekk.ch/Vacancies/1054/Description/1',{fetchedAt:'2026-09-24T12:00:00Z'});
 assert.equal(r.jobs.length,1);assert.equal(r.jobs[0].title,'Case Manager*in OKP');assert.equal(r.jobs[0].location,'Landquart');assert.match(r.jobs[0].description,/Hochschulabschluss/);assert.equal(r.jobs[0].fetched_at,'2026-09-24T12:00:00Z');
 assert.deepEqual(a.extractAdditionalVacancies(html,oekk,'https://jobs.oekk.ch/Vacancies/1054/Application/CheckLogin/1').jobs,[]);
 assert.deepEqual(a.extractAdditionalVacancies(html,oekk,'https://other.umantis.com/Vacancies/1054/Description/1').jobs,[]);
});

test('Abacus follows published FMH domain selection and excludes SIWF rows',async()=>{
 const a=await modulePromise;const html='<html><a href="/de/job_1_1070/Tarife">Experte Tarife</a><a href="/de/job_1_6012/Zertifizierung">SIWF</a><a href="/de/jobform_1_1070/Tarife">Bewerben</a></html>';
 const r=a.normalizeAdditionalPayload(a.detectAdditionalAdapter(fmh),html,fmh);assert.equal(r.links.length,1);assert.match(r.links[0].url,/1070/);assert.equal(r.complete,true);
});

test('Abacus extracts title and all announcement sections without h1',async()=>{
 const a=await modulePromise;const html=`<html><body><div class="announcement-container"><div class="jobtitle">Experte stationäre Versorgung und Tarife 80%</div><div class="introduction">Die FMH ist der Berufsverband der Ärzteschaft.</div><div class="tasks"><h2>Was Sie bewegen</h2>${paragraphs}</div><div class="benefits"><h2>Was Sie auszeichnet</h2><p>Hochschulabschluss und analytische Fähigkeiten.</p></div><div class="requirements">Moderne Arbeitsplätze und Weiterbildung.</div><a href="/de/jobform_1_1070/test">Bewerben</a></div></body></html>`;
 const r=a.extractAdditionalVacancies(html,fmh,'https://karriere-fmh-siwf.abacuscity.ch/de/job_1_1070/Tarife');assert.equal(r.jobs.length,1);assert.match(r.jobs[0].description,/Weiterbildung/);assert.equal(r.jobs[0].workload_min,80);
});

test('SAP startrow pagination is distinct from detail links and preserves scope',async()=>{
 const a=await modulePromise;const org={...hoch,jobs:'https://jobs.h-och.ch/search/?optionsFacetsDD_department=Finanzen'};
 const html='<html>Ergebnisse 1 – 25 von 215<a href="/search/?startrow=25">2</a><a href="/search/?startrow=50">3</a><a href="/job/St-Gallen-Controller/1382998833/">Controller</a></html>';
 const r=a.normalizeAdditionalPayload(a.detectAdditionalAdapter(org),html,org);assert.equal(r.links.length,1);assert.equal(r.listingLinks.length,2);assert.equal(r.expectedCount,215);assert.equal(r.hasPagination,true);
 for(const link of r.listingLinks)assert.equal(new URL(link.url).searchParams.get('optionsFacetsDD_department'),'Finanzen');
});

test('SAP detail parser recognises actual HOCH requirement headings',async()=>{
 const a=await modulePromise;const html=`<html><body><h1>Ergebnis-Controller/in 100%</h1><span class="jobdescription"><h2>Deine Aufgaben und Perspektiven</h2>${paragraphs}<h2>Was du für diese Stelle mitbringst</h2><p>Ein abgeschlossenes Studium mit Schwerpunkt Betriebswirtschaft.</p><h2>Deine Bewerbung</h2><p>Eintritt nach Vereinbarung.</p></span></body></html>`;
 const r=a.extractAdditionalVacancies(html,hoch,'https://jobs.h-och.ch/job/St-Gallen-Controller/1382998833/');assert.equal(r.jobs.length,1);assert.match(r.jobs[0].description,/Betriebswirtschaft/);
});

test('Solique resolves relative listings against final response URL and keeps footer application evidence',async()=>{
 const a=await modulePromise;const list=a.normalizeAdditionalPayload(a.detectAdditionalAdapter(ksw),'<html><a href="job/details/4068688">Projektleiter</a><a href="/other/job/details/11">Other</a></html>',ksw,{pageUrl:'https://live.solique.ch/ksw/'});
 assert.equal(list.links.length,1);assert.equal(list.links[0].url,'https://live.solique.ch/ksw/job/details/4068688');
 const html=`<html><body><div class="content"><h1>Projektleiterin / Projektleiter</h1><h2>Deine Aufgaben</h2>${paragraphs}<h2>Dein Profil</h2><p>Hochschulabschluss und Erfahrung im Projektmanagement.</p></div><div class="content secondary"><h2>Deine Vorteile</h2><p>Weiterbildung und flexible Arbeitszeiten.</p></div><footer><a href="https://ksw-career.talent-soft.com/Pages/Offre/detailoffre.aspx?idOffre=900">Jetzt bewerben</a></footer></body></html>`;
 const r=a.extractAdditionalVacancies(html,ksw,'https://live.solique.ch/KSW/job/details/4068688/');assert.equal(r.jobs.length,1);assert.match(r.jobs[0].description,/flexible Arbeitszeiten/);
});

test('Known provider routes do not turn empty shells or incomplete descriptions into jobs',async()=>{
 const a=await modulePromise;assert.deepEqual(a.extractAdditionalVacancies('<h1>Analyst</h1><p>Bewerben</p>',hoch,'https://jobs.h-och.ch/job/Analyst/123/').jobs,[]);
 assert.deepEqual(a.extractAdditionalVacancies('<h1>Analyst</h1>'+paragraphs,hoch,'https://jobs.h-och.ch/').jobs,[]);
});

test('A full Umantis page with an unsafe next link remains incomplete',async()=>{
 const a=await modulePromise;const html='<html><a href="/Vacancies/1/Description/1">Analyst</a><span data-pagination-next-href="https://other.umantis.com/Jobs/All?tc12=p2"></span><table-navigation initial-data-string="{&quot;TableMaxEntries&quot;:1,&quot;TableTo&quot;:1,&quot;TableTotalLines&quot;:2}"></table-navigation></html>';
 const r=a.normalizeAdditionalPayload(a.detectAdditionalAdapter(oekk),html,oekk);assert.equal(r.links.length,1);assert.equal(r.hasPagination,true);assert.equal(r.listingLinks.length,0);assert.equal(r.complete,false);
});

test('SAP ignores sorting and language navigation as duplicate search traversals',async()=>{
 const a=await modulePromise;const html='<html><a href="/search/?locale=de_DE">Deutsch</a><a href="/search/?sortColumn=title&sortDirection=asc">Titel</a><a href="/search/">Offene Stellen</a><a href="/job/St-Gallen-Controller/123/">Controller</a></html>';
 const r=a.normalizeAdditionalPayload(a.detectAdditionalAdapter(hoch),html,hoch);assert.equal(r.listingLinks.length,1);assert.equal(r.links.length,1);
});

test('Provider workload headers become metadata and mixed contract terms stay explicit',async()=>{
 const a=await modulePromise;const html=`<html><body><h1>Projektleiterin / Projektleiter</h1><h3 class="workload">60 – 80%</h3><div><p>80 % befristet bis Ende 2027</p><p>anschliessend 60 % unbefristet</p><h2>Deine Aufgaben</h2>${paragraphs}<h2>Dein Profil</h2><p>Studium und Erfahrung im Projektmanagement.</p></div><footer>Jetzt bewerben</footer></body></html>`;
 const r=a.extractAdditionalVacancies(html,ksw,'https://live.solique.ch/KSW/job/details/4068688/');assert.equal(r.jobs.length,1);assert.equal(r.jobs[0].pensum,'60–80%');assert.equal(r.jobs[0].employment_type,null);assert.match(r.jobs[0].employment_type_raw,/80 % befristet bis Ende 2027 \/ anschliessend 60 % unbefristet/);
});

test('Uni Luzern uses the vacancy h1 instead of the page overview title and retains faculty scope',async()=>{
 const a=await modulePromise;const org={id:'unilu',name:'Universität Luzern',main:'https://www.unilu.ch',jobs:'https://www.unilu.ch/universitaet/personal/personaldienst/offene-stellen/'};
 const url='https://www.unilu.ch/universitaet/personal/personaldienst/offene-stellen/koordinator-in-center-for-health-policy-and-economics-60-70-2215045/';
 const html=`<html><body><h1>Offene Stellen</h1><div class="vacancy"><div class="faculty-institute">Fakultät für Gesundheitswissenschaften und Medizin</div><h1><span class="title">Koordinator/in Center for Health, Policy and Economics 60-70%</span></h1><div class="duties"><h4>Aufgabenbereich</h4>${paragraphs}</div><div class="requirements"><h4>Anforderungen</h4><p>Masterabschluss in Gesundheitswissenschaften oder Wirtschaftswissenschaften.</p></div><div class="deadline">Bewerben Sie sich online.</div></div></body></html>`;
 const r=a.extractAdditionalVacancies(html,org,url);assert.equal(r.jobs.length,1);assert.match(r.jobs[0].title,/Koordinator/);assert.match(r.jobs[0].description,/Fakultät für Gesundheitswissenschaften/);assert.equal(r.jobs[0].pensum,'60–70%');
 assert.deepEqual(a.extractAdditionalVacancies(html,org,org.jobs).jobs,[]);
 assert.deepEqual(a.extractAdditionalVacancies(html,{...org,id:'other'},url).jobs,[]);
});

test('ZHAW native JobPosting container supports Aufgaben and Profil without collecting site navigation',async()=>{
 const a=await modulePromise;const org={id:'wig',name:'WIG',main:'https://www.zhaw.ch',jobs:'https://www.zhaw.ch/de/jobs/offene-stellen'};
 const url='https://www.zhaw.ch/de/jobs/offene-stellen/stelleninserat/job/detail/3843954';
 const html=`<html><body><header>Studium Architektur Verkehr und fremde Stellen</header><div itemscope itemtype="http://schema.org/JobPosting" class="job-item"><h1 itemprop="title">Praktikant:in Management im Gesundheitswesen 100%</h1><h2>Aufgaben</h2>${paragraphs}<h2>Profil</h2><p>Studium Wirtschaftswissenschaften und sehr gute Deutschkenntnisse.</p><h2>Dafür stehen wir</h2><p>Winterthurer Institut für Gesundheitsökonomie WIG.</p><a href="https://apply.refline.ch/123">Jetzt online bewerben</a></div></body></html>`;
 const r=a.extractAdditionalVacancies(html,org,url);assert.equal(r.jobs.length,1);assert.match(r.jobs[0].description,/Winterthurer Institut/);assert.doesNotMatch(r.jobs[0].description,/fremde Stellen/);assert.equal(r.jobs[0].pensum,'100%');
 const head=html.replace('Praktikant:in Management im Gesundheitswesen 100%','Professor Health Economics 80–100%').replace('<h2>Aufgaben</h2>','<h2>Your role</h2>').replace('<h2>Profil</h2>','<h2>Your profile</h2>');assert.equal(a.extractAdditionalVacancies(head,org,url).jobs.length,1);
 assert.deepEqual(a.extractAdditionalVacancies(html,org,url.replace('www.zhaw.ch','www.zhaw.ch.attacker.ch')).jobs,[]);
});

test('santéservices full job articles accept Mission headings and the stated blockquote workload',async()=>{
 const a=await modulePromise;const org={id:'santesuisse',name:'santéservices',main:'https://www.santeservices.ch',jobs:'https://www.santeservices.ch/offene-stellen/'};
 const url='https://www.santeservices.ch/offene-stellen/expertin-wirtschaft-ambulante-tarife/';
 const html=`<html><body><article class="job type-job status-publish"><h1>Expert:in Wirtschaft | Ambulante Tarife</h1><blockquote>Expert:in Wirtschaft | Ambulante Tarife 60%</blockquote><h2>Deine Mission | Du…</h2>${paragraphs}<h2>Dein Profil | Du…</h2><p>Höhere Ausbildung in Ökonomie und Erfahrung in Tarifen.</p><h2>Unser Angebot | Wir…</h2><p>Flexible Arbeitszeit und Weiterbildung.</p><a href="https://link.ostendis.com/publicjob">Jetzt bewerben</a></article></body></html>`;
 const r=a.extractAdditionalVacancies(html,org,url);assert.equal(r.jobs.length,1);assert.equal(r.jobs[0].pensum,'60%');assert.match(r.jobs[0].description,/Flexible Arbeitszeit/);
 assert.deepEqual(a.extractAdditionalVacancies(html.replace('<h2>Dein Profil | Du…</h2>',''),org,url).jobs,[]);
 assert.deepEqual(a.extractAdditionalVacancies(html,org,org.jobs).jobs,[]);
});

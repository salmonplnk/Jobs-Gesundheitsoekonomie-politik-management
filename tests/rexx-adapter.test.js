const {test}=require('node:test');
const assert=require('node:assert/strict');
const adapters=import('../supabase/functions/_shared/job-rexx-adapter.mjs');
const org={id:'srk',name:'Schweizerisches Rotes Kreuz',main:'https://www.redcross.ch/',jobs:'https://rexx.redcross.ch/'};
const vacancy='<a href="/Fachspezialistin-Reporting-Datenmanagement-de-j1735.html">Fachspezialist:in Reporting &amp; Datenmanagement</a>';
const controls='<a href="/stellenangebote.html?reset_search=1">Zurücksetzen</a><a href="/stellenangebote.html?order%5Bdir%5D=asc&amp;order%5Bfield%5D=stellenbezeichnung">Stellenangebote</a>';

test('SRK Rexx adapter stays within the configured employer and public host',async()=>{
  const {detectRexxAdapter,normalizeRexxPage}=await adapters;
  assert.equal(detectRexxAdapter(org)?.kind,'rexx-html');
  for(const target of ['https://other.rexx-systems.com/','http://rexx.redcross.ch/','https://rexx.redcross.ch.evil.test/']) assert.equal(detectRexxAdapter(org,target),null);
  assert.equal(detectRexxAdapter({...org,id:'other'}),null);
  assert.throws(()=>normalizeRexxPage('',org,'https://other.rexx-systems.com/'));
});

test('Rexx sort/reset controls do not generate false partial employer-filter failures',async()=>{
  const {normalizeRexxPage}=await adapters;
  const parsed=normalizeRexxPage(`<table id="joboffers">${controls}${vacancy}</table>`,org,org.jobs);
  assert.equal(parsed.links.length,1);
  assert.equal(parsed.links[0].url,'https://rexx.redcross.ch/Fachspezialistin-Reporting-Datenmanagement-de-j1735.html');
  assert.equal(parsed.listingLinks.length,0); assert.equal(parsed.blockedEntries,0); assert.equal(parsed.listingEvidence,true);
  assert.equal(parsed.explicitEmpty,false);
});

test('actual pagination remains queued and listing filters remain intact',async()=>{
  const {normalizeRexxPage}=await adapters;
  const parsed=normalizeRexxPage(`${controls}${vacancy}<a rel="next" href="/stellenangebote.html?page=2">Weiter</a>`,org,org.jobs);
  assert.equal(parsed.paginationLinks.length,1); assert.equal(parsed.hasPagination,true);
  const scoped={...org,jobs:'https://rexx.redcross.ch/stellenangebote.html?department=health'};
  const filtered=normalizeRexxPage(`${vacancy}${controls}<a rel="next" href="/stellenangebote.html?page=2">Weiter</a>`,scoped,scoped.jobs);
  assert.equal(new URL(filtered.paginationLinks[0].url).searchParams.get('department'),'health'); assert.ok(filtered.blockedEntries>0);
});

test('Rexx full descriptions use existing validated extraction and blank tables stay unknown',async()=>{
  const {normalizeRexxPage}=await adapters;
  const node={'@type':'JobPosting',title:'Fachspezialist:in Reporting & Datenmanagement',description:'Sie verantworten das Reporting und die Leistungsdaten im Gesundheitswesen. Sie entwickeln Datenanalysen und beraten die Teams im Stab.',url:'https://rexx.redcross.ch/Fachspezialistin-Reporting-Datenmanagement-de-j1735.html'};
  const detail=normalizeRexxPage(`<script type="application/ld+json">${JSON.stringify(node)}</script>`,org,node.url,{detail:true});
  assert.equal(detail.jobs.length,1); assert.equal(detail.jobs[0].description,node.description);
  const blank=normalizeRexxPage('<table id="joboffers"></table>',org,org.jobs);
  assert.equal(blank.explicitEmpty,false); assert.equal(blank.listingEvidence,false);
  const empty=normalizeRexxPage('<table id="joboffers"><td>Keine offenen Stellen</td></table>',org,org.jobs);
  assert.equal(empty.explicitEmpty,true);
});

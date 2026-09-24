const {test}=require('node:test');
const assert=require('node:assert/strict');
const adapters=import('../supabase/functions/_shared/job-successfactors-adapter.mjs');
const org={id:'hirslanden',name:'Hirslanden',main:'https://www.hirslanden.ch/',jobs:'https://careers.mediclinic.com/Hirslanden/go/Search-By-Keyword-MCCH/5071201/',scope_terms:['Hirslanden']};
const row=i=>`<li class="job-tile job-id-${i}" data-url="/Hirslanden/job/Analyst-Gesundheitsdaten/${1000+i}/" data-row-index="${i}"><a class="jobTitle-link" href="/Hirslanden/job/Analyst-Gesundheitsdaten/${1000+i}/">Analyst Gesundheitsdaten ${i}</a></li>`;
const rows=(start,count)=>Array.from({length:count},(_,i)=>row(start+i)).join('');
const config=(total=75)=>`<script>j2w.SearchResults.init({apiEndpoint:"tile-search-results/category/5071201",searchQuery:"",jobRecordsPerPage:parseInt("50"),jobRecordsFound:parseInt("${total}")});</script>`;

test('SuccessFactors pins employer, category, provider host and valid cursors',async()=>{
  const {detectSuccessFactorsAdapter:detect}=await adapters;
  assert.equal(detect(org).offset,0);
  for(const url of ['https://careers.mediclinic.com/go/Search-By-Keyword-MCGS/5075401/','https://careers.mediclinic.com/Hirslanden/tile-search-results/category/5075401/?startrow=50','https://careers.mediclinic.com/Hirslanden/tile-search-results/category/5071201/?startrow=51','https://careers.mediclinic.com/Hirslanden/tile-search-results/category/5071201/?startrow=50&department=all']) assert.equal(detect(org,url),null);
  assert.equal(detect({...org,id:'other'}),null);
});

test('verified initial tile configuration queues public GET pagination and ignores global navigation',async()=>{
  const {normalizeSuccessFactorsPage:parse,detectSuccessFactorsAdapter:detect}=await adapters;
  const result=parse(config()+rows(1,50)+'<a href="/Group/job/Other/1001/">Analyst other company</a><a href="/Hirslanden/content/Job-Application-Tips/">Job Application Tips</a>',org,org.jobs);
  assert.equal(result.links.length,50); assert.equal(result.expectedCount,75); assert.equal(result.malformed,false);
  assert.equal(result.listingLinks.length,1); assert.equal(detect(org,result.listingLinks[0].url).offset,50);
  assert.equal(result.blockedEntries,0); assert.equal(result.hasPagination,true);
});

test('following fragments use sequential provider row indices and stop after a short page',async()=>{
  const {normalizeSuccessFactorsPage:parse}=await adapters;
  const url='https://careers.mediclinic.com/Hirslanden/tile-search-results/category/5071201/?startrow=50';
  const last=parse(rows(51,25),org,url);
  assert.equal(last.links.length,25); assert.equal(last.listingLinks.length,0); assert.equal(last.malformed,false);
  const full=parse(rows(51,50),org,url);
  assert.equal(new URL(full.listingLinks[0].url).searchParams.get('startrow'),'100');
  const exactEnd=parse(rows(51,50),org,url,{expectedCount:100});
  assert.equal(exactEnd.listingLinks.length,0);assert.equal(exactEnd.malformed,false);
  const repeated=parse(rows(1,50),org,url);
  assert.equal(repeated.malformed,true); assert.equal(repeated.listingLinks.length,0);
});

test('unknown or inconsistent pages never prove an empty board',async()=>{
  const {normalizeSuccessFactorsPage:parse}=await adapters;
  for(const html of ['', '<h1>Error</h1>',config(1),config(75)+rows(1,49),config(75).replace('5071201','5075401')+rows(1,50)]) {
    const result=parse(html,org,org.jobs);assert.equal(result.explicitEmpty,false);assert.equal(result.malformed,true);
  }
  const empty=parse(config(0),org,org.jobs);assert.equal(empty.explicitEmpty,true);assert.equal(empty.listingEvidence,true);
});

test('detail records retain their full source description',async()=>{
  const {normalizeSuccessFactorsPage:parse}=await adapters;
  const node={'@type':'JobPosting',title:'Analyst Gesundheitsdaten',description:'Sie entwickeln die Versorgungsanalysen der Hirslanden Kliniken und koordinieren die fachliche Auswertung. Ihr Profil umfasst ein Studium der Gesundheitsökonomie.',url:'https://careers.mediclinic.com/Hirslanden/job/Analyst-Gesundheitsdaten/1001/'};
  const result=parse(`<script type="application/ld+json">${JSON.stringify(node)}</script>`,org,node.url,{detail:true});
  assert.equal(result.jobs.length,1);assert.equal(result.jobs[0].description,node.description);
  const html=`<header>Cookie-Einstellungen und globale Navigation</header><h1>${node.title}</h1><span itemprop="description"><p>Arbeitsort: Hirslanden | Zürich</p><p>${node.description}</p><span>Ein verschachtelter Abschnitt <span>mit Anforderungen.</span></span><p>Letzter echter Absatz.</p></span><footer>Cookie Manager und andere Stellen</footer>`;
  const scoped=parse(html,org,node.url,{detail:true});
  assert.equal(scoped.jobs.length,1);assert.match(scoped.jobs[0].description,/Letzter echter Absatz/);assert.doesNotMatch(scoped.jobs[0].description,/Cookie|Navigation|andere Stellen/);assert.equal(scoped.jobs[0].location,'Zürich');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverJobDocuments, normalizeDocumentText, extractDocumentVacancy, DOCUMENT_LIMITS } from '../supabase/functions/_shared/job-document-adapter.mjs';
import { extractPdfText } from '../scripts/job-pdf-text.mjs';
import { extractVacancies } from '../supabase/functions/_shared/job-extraction.mjs';

const org = {id:'insurer',name:'Example Health Insurer',jobs:'https://health.ch/jobs/',main:'https://health.ch/'};
const url = 'https://health.ch/files/advert.pdf';
const fetchedAt = '2026-09-24T12:00:00.000Z';
const fixture = `Example Health Insurer funds accessible health services throughout Switzerland.
We are seeking a committed professional for a new role in our established team.
Project Manager Health Economics 80-100%
Your responsibilities
You develop health economic evaluations and coordinate research projects with our partners.
You provide evidence for tariff negotiations and present the results to decision makers.
Your profile
You have a degree in health economics and experience in quantitative research methods.
We offer flexible hours and a collaborative working environment in Bern.
Please send your application to the recruitment team. We look forward to meeting you.`;

// A tiny, synthetic two-page PDF with a real cross-reference table. No fixture
// copies employer text and the second page verifies that extraction is complete.
function makePdf(pages) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids = [];
  for (const lines of pages) {
    const pageId = objects.length + 1, contentId = pageId + 1;
    kids.push(`${pageId} 0 R`);
    const safe = value => value.replace(/([\\()])/g,'\\$1');
    const stream = `BT /F1 11 Tf 40 750 Td 15 TL ${lines.map((line,i) => `${i ? 'T* ' : ''}(${safe(line)}) Tj`).join('\n')} ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Count ${pages.length} /Kids [${kids.join(' ')}] >>`;
  let result = '%PDF-1.4\n', offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(result)); result += `${i+1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(result);
  result += `xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(result);
}

test('discovers advertised PDFs with generic labels but excludes brochures and foreign hosts',() => {
  const html = `<a href="/files/advert.pdf">Projektleiter/in Tarife 80-100%</a>
  <a href="/files/second.pdf">Stellenausschreibung</a>
  <a href="/files/job-inserat-123.pdf">Download</a>
  <a href="/files/annual.pdf">Geschäftsbericht 100%</a>
  <a href="https://foreign.ch/job-inserat.pdf">Analyst 80%</a>
  <footer><a href="/files/footer.pdf">Stellenausschreibung</a></footer>`;
  const result = discoverJobDocuments(html,org.jobs,org);
  assert.equal(result.length,3);
  assert.equal(result[1].label,'Stellenausschreibung');
  assert.equal(result[0].sourceUrl,org.jobs);
});

test('an unrendered Ostendis job list remains unresolved even beside a readable PDF or another empty section',() => {
  const embed='<script src="https://odm.ostendis.com/ojp/assets/loader"></script><div id="ostendisJobs" class="ost-jobs"> <!-- mount --> </div><script>OSTENDISJOBS.embed("#ostendisJobs", "public-place");</script>';
  const parsed=extractVacancies(`<h2>Head office</h2>${embed}<h2>Regional office</h2><a href="/files/advert.pdf">Project Manager Health Economics 80%</a><p>Keine offenen Stellen in unserer Verwaltung.</p>`,org,org.jobs);
  assert.equal(parsed.unresolvedEmbeddedListing,true);
  assert.equal(parsed.listingEvidence,true);
  assert.equal(parsed.explicitEmpty,false);
  assert.equal(parsed.unsupportedDetails.length,1);
  const rendered=extractVacancies(embed.replace(' <!-- mount --> ','<a href="/jobs/project-manager">Project Manager 80%</a>'),org,org.jobs);
  assert.equal(rendered.unresolvedEmbeddedListing,false);
  assert.equal(rendered.links.length,1);
  assert.equal(extractVacancies('<div id="ostendisJobs"></div>',org,org.jobs).unresolvedEmbeddedListing,false);
  assert.equal(extractVacancies(`<pre>OSTENDISJOBS.embed("#ostendisJobs", "public-place")</pre><div id="ostendisJobs"></div>`,org,org.jobs).unresolvedEmbeddedListing,false);
});

test('extracts a PDF vacancy with canonical identity and shared metadata',() => {
  const result = normalizeDocumentText(fixture,org,`${url}?utm_source=career`,{fetchedAt});
  assert.equal(result.rejected,0);
  assert.equal(result.jobs[0].title,'Project Manager Health Economics 80-100%');
  assert.equal(result.jobs[0].url,url);
  assert.equal(result.jobs[0].role,'health-economics');
  assert.equal(result.jobs[0].pensum,'80–100%');
  assert.equal(result.jobs[0].description_truncated,false);
  assert.equal(result.jobs[0].fetched_at,fetchedAt);
});

test('strips listing date and download suffix only from a title verified in the document',() => {
  const result = normalizeDocumentText(fixture,org,url,{label:'24.09.2026 Project Manager Health Economics 80-100% pdf · 1 MB'});
  assert.equal(result.jobs[0].title,'Project Manager Health Economics 80-100%');
  const changedLabel = normalizeDocumentText(fixture,org,url,{label:'Senior Controller Hospital 50%'});
  assert.equal(changedLabel.jobs[0].title,'Project Manager Health Economics 80-100%');
  const wrongWorkload = normalizeDocumentText(fixture,org,url,{label:'Project Manager Health Economics 50%'});
  assert.equal(wrongWorkload.jobs[0].title,'Project Manager Health Economics 80-100%');
  const cardLabel = normalizeDocumentText(fixture,org,url,{label:'•\n\n24.09.2026\n\nProject Manager Health Economics 80-100%\n\nExample Health Insurer | Bern\n\nMehr erfahren'});
  assert.equal(cardLabel.jobs[0].title,'Project Manager Health Economics 80-100%');
});

test('handles workload wrapped onto the next line and rejects a filename-derived title',() => {
  const wrapped = fixture.replace('Project Manager Health Economics 80-100%','Project Manager Health Economics\n80-100%');
  assert.equal(normalizeDocumentText(wrapped,org,url).jobs[0].title,'Project Manager Health Economics 80-100%');
  const genderWrapped = fixture.replace('Project Manager Health Economics 80-100%','Project Manager Health Economics\nm/w/d 80-100%');
  assert.equal(normalizeDocumentText(genderWrapped,org,url).jobs[0].title,'Project Manager Health Economics m/w/d 80-100%');
  const noTitle = fixture.replace('Project Manager Health Economics 80-100%','Our exciting opportunity');
  assert.equal(normalizeDocumentText(noTitle,org,'https://health.ch/jobs/project-manager-80.pdf').rejected,1);
  const ligatures = normalizeDocumentText(fixture.replace('Your profile','Your proﬁle'),org,url);
  assert.equal(ligatures.jobs.length,1);
  assert.match(ligatures.jobs[0].description,/Your profile/);
});

test('does not turn a brochure, a scanned image, an unsafe URL or missing application evidence into a job',() => {
  for (const [text,target] of [
    ['Annual report\n'.repeat(100),url],
    ['',url],
    [fixture,'https://foreign.ch/advert.pdf'],
    [fixture.replace('Please send your application to the recruitment team. We look forward to meeting you.','Contact our information desk for general details.'),url],
  ]) assert.equal(normalizeDocumentText(text,org,target).jobs.length,0);
});

test('marks a long description as truncated and rejects excessive extraction output',() => {
  const long = normalizeDocumentText(`${fixture}\n${'Additional duties and responsibilities. '.repeat(1000)}`,org,url);
  assert.equal(long.jobs[0].description_truncated,true);
  assert.match(long.jobs[0].description,/30’000/);
  assert.equal(normalizeDocumentText('x'.repeat(DOCUMENT_LIMITS.maxTextChars+1),org,url).rejected,1);
});

test('binary adapter verifies MIME, magic, size and completeness before invoking its reader',async () => {
  let reads = 0;
  const options = {extractText:async () => { reads++; return fixture; },fetchedAt};
  const good = {url,contentType:'application/pdf',bytes:Buffer.from('%PDF-1.4')};
  for (const bad of [{...good,contentType:'text/html'},{...good,bytes:Buffer.from('<html>')},{...good,truncated:true},{...good,bytes:new Uint8Array(DOCUMENT_LIMITS.maxBytes+1)}]) {
    assert.equal((await extractDocumentVacancy(bad,org,options)).jobs.length,0);
  }
  assert.equal(reads,0);
  assert.equal((await extractDocumentVacancy(good,org,options)).jobs.length,1);
  assert.equal(reads,1);
  assert.equal((await extractDocumentVacancy(good,org,{})).rejected,1);
});

test('native PDF reader extracts all pages from a synthetic PDF without shell or file paths',async t => {
  const lines = fixture.split('\n');
  const bytes = makePdf([lines.slice(0,6),lines.slice(6)]);
  let text;
  try { text = await extractPdfText(bytes); }
  catch (error) { if (error.cause?.code === 'ENOENT') { t.skip('Install poppler-utils for the native PDF integration test.'); return; } throw error; }
  assert.match(text,/Project Manager Health Economics/);
  assert.match(text,/Please send your application/);
  assert.equal((await extractDocumentVacancy({url,bytes,contentType:'application/pdf'},org,{extractText:extractPdfText})).jobs.length,1);
});

test('native PDF reader rejects corrupt PDFs and obeys an already-aborted signal',async t => {
  try { await extractPdfText(Buffer.from('%PDF-garbage')); assert.fail('Corrupt PDF unexpectedly parsed'); }
  catch (error) { if (error.cause?.code === 'ENOENT') { t.skip('Install poppler-utils for native PDF integration tests.'); return; } assert.match(error.message,/nicht sicher/); }
  const controller = new AbortController(); controller.abort();
  assert.throws(() => extractPdfText(makePdf([['test']]),{signal:controller.signal}),/abort/i);
});

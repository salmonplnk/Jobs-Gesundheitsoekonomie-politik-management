#!/usr/bin/env node
// Offline browser acceptance of the real static app. Run after:
// npm ci --ignore-scripts && npx playwright install --with-deps chromium
// node scripts/browser-smoke.mjs [--require-feed]
// Screenshots and report: browser-smoke/. No login, backend or AI requests.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'browser-smoke');
const report = { started_at: new Date().toISOString(), status: 'running', dataset: null, jobs: 0, sources: 0, checks: [], screenshots: [], scenarios: [], errors: [] };
let browser, server, fixture;

function record(name, detail = '') { report.checks.push({ name, detail, status: 'passed' }); }

async function loadDataset() {
  try {
    const index = JSON.parse(await readFile(resolve(root, 'data/job-feed/index.json'), 'utf8'));
    assert.equal(index.version, 1, 'Public feed schema version');
    assert.ok(Array.isArray(index.jobs) && index.jobs.length > 0, 'Public feed contains jobs');
    assert.ok(Array.isArray(index.sources), 'Public feed contains source statuses');
    report.dataset = 'live'; report.generated_at = index.generated_at; report.jobs = index.jobs.length; report.sources = index.sources.length;
    return;
  } catch (error) {
    if (error.code !== 'ENOENT' || process.argv.includes('--require-feed')) throw error;
  }
  const groups = JSON.parse(await readFile(resolve(root, 'data/organizations.json'), 'utf8'));
  const stamp = new Date().toISOString();
  const sources = groups.flatMap(group => group.orgs.map(org => ({ org_id: org.id, name: org.name, url: org.jobs || '', status: org.id === 'bag' ? 'ok' : 'pending', checked_at: org.id === 'bag' ? stamp : null, last_success_at: org.id === 'bag' ? stamp : null, job_count: org.id === 'bag' ? 27 : 0, coverage: org.id === 'bag' ? 'complete' : 'unknown' })));
  const jobs = Array.from({ length: 27 }, (_, i) => ({
    id: `bag:smoke${i}`, org_id: 'bag', title: `Browser-Test Gesundheitsökonomie ${i + 1}`,
    organization: 'Bundesamt für Gesundheit BAG', url: `https://example.org/jobs/browser-smoke-${i}`,
    location: 'Bern', pensum: '80–100%', role: 'Gesundheitsökonomie / HTA', status: 'open',
    description: 'Synthetisches Browser-Testinserat für die lokale Funktionsprüfung.',
    description_truncated: true, first_seen: stamp, last_seen: stamp, fetched_at: stamp, detail_file: './bag.json',
  }));
  fixture = new Map([
    ['/data/job-feed/index.json', { version: 1, generated_at: stamp, sources, jobs, run: { id: 'browser-smoke-fixture', status: 'complete', started_at: stamp, finished_at: stamp, checked_sources: 1, total_sources: sources.length } }],
    ['/data/job-feed/bag.json', { version: 1, org_id: 'bag', source: sources.find(source => source.org_id === 'bag'), jobs: jobs.map(job => ({ ...job, description: `${job.description} Volltext: Aufgaben, Anforderungen und Bewerbungsweg werden im persönlichen Gast-Workspace angezeigt.`, description_truncated: false })) }],
  ]);
  report.dataset = 'fixture'; report.jobs = jobs.length; report.sources = sources.length;
}

async function serve() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
  server = createServer(async (request, response) => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405).end(); return; }
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (fixture?.has(pathname)) {
        response.writeHead(200, { 'content-type': types['.json'], 'cache-control': 'no-store' });
        response.end(JSON.stringify(fixture.get(pathname))); return;
      }
      const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
      let body = await readFile(path);
      if (path === resolve(root, 'index.html')) {
        body = Buffer.from(body.toString().replace('<head>', '<head><script>window.HEALTH_JOBS_FEED_URL="/data/job-feed/index.json";</script>'));
      }
      response.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500).end(); }
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  return `http://127.0.0.1:${server.address().port}`;
}

async function inspectViewport(origin, name, viewport) {
  const result = { name, viewport, errors: [], warnings: [], unexpected_external_requests: [], failed_requests: [], screenshots: [] };
  report.scenarios.push(result);
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: 'light', locale: 'de-CH', reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin) { await route.continue(); return; }
    // The app deliberately supports an unavailable Supabase SDK in guest mode.
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname === '/npm/@supabase/supabase-js@2') {
      await route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* Offline browser smoke: guest mode. */' }); return;
    }
    if (url.hostname === 'fonts.googleapis.com' && request.resourceType() === 'stylesheet') {
      await route.fulfill({ status: 200, contentType: 'text/css', body: '/* System fonts in offline acceptance. */' }); return;
    }
    if (url.hostname === 'www.google.com' && url.pathname === '/s2/favicons' && request.resourceType() === 'image') {
      await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>' }); return;
    }
    result.unexpected_external_requests.push({ method: request.method(), url: request.url() });
    await route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => result.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') result.errors.push(message.text()); else if (message.type() === 'warning') result.warnings.push(message.text()); });
  page.on('requestfailed', request => result.failed_requests.push({ url: request.url(), error: request.failure()?.errorText }));
  const screenshot = async (part, theme) => {
    const filename = `${name}-${part}-${theme}.png`;
    if (part === 'feed') { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: resolve(output, filename), animations: 'disabled' }); }
    else { await page.locator('.map-section').screenshot({ path: resolve(output, filename), animations: 'disabled' }); }
    result.screenshots.push(filename); report.screenshots.push(filename);
  };
  const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name}: no horizontal page overflow`);
  try {
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.PublicJobFeed?.getJobs().length > 0 && window.HealthJobs);
    const allJobs = await page.evaluate(() => PublicJobFeed.getJobs());
    assert.equal(allJobs.length, report.jobs, 'Every published job is accepted by the frontend');
    assert.equal(await page.locator('.jf-job').count(), Math.min(25, allJobs.length), 'Feed page size');
    assert.equal(await page.locator('.jf-source').count(), 85, 'All 85 source statuses visible');
    assert.equal(await page.evaluate(() => HealthJobs.getOwner()), null, 'Anonymous workspace');
    assert.equal(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('sb-') && key.includes('auth-token'))), false);
    await noOverflow();
    await screenshot('feed', 'light');
    record(`${name}: public feed and source coverage`, `${allJobs.length} open jobs, 85 sources`);

    if (allJobs.length > 25) {
      const firstId = await page.locator('[data-feed-action="import"]').first().getAttribute('data-feed-id');
      await page.locator('[data-feed-action="next"]').click();
      assert.notEqual(await page.locator('[data-feed-action="import"]').first().getAttribute('data-feed-id'), firstId);
      assert.equal(await page.locator('.jf-job').count(), Math.min(25, allJobs.length - 25));
      await page.locator('[data-feed-action="previous"]').click();
      assert.equal(await page.locator('[data-feed-action="import"]').first().getAttribute('data-feed-id'), firstId);
      record(`${name}: feed pagination`);
    }
    const candidate = allJobs[0];
    await page.locator('#jfEmployer').selectOption(candidate.org_id);
    assert.ok((await page.evaluate(() => PublicJobFeed.getJobs())).every(job => job.org_ids.includes(candidate.org_id)));
    await page.locator('#jfQuery').fill(candidate.title.slice(0, 120));
    assert.ok((await page.evaluate(() => PublicJobFeed.getJobs())).some(job => job.id === candidate.id));
    await page.locator('#jfLocation').fill('BROWSER-SMOKE-NO-SUCH-LOCATION-483920');
    assert.equal(await page.locator('.jf-job').count(), 0);
    await page.locator('[data-feed-action="reset"]').click();
    assert.equal(await page.evaluate(() => PublicJobFeed.getJobs().length), allJobs.length);
    record(`${name}: employer, text and location filters; reset`);

    const importId = await page.locator('[data-feed-action="import"]').first().getAttribute('data-feed-id');
    await page.locator('[data-feed-action="import"]').first().click();
    await page.locator('#jwDialog[open]').waitFor({ state: 'visible' });
    const imported = await page.evaluate(id => HealthJobs.getJob(id), importId);
    assert.ok(imported?.description?.length, 'Full description imported into guest workspace');
    assert.equal(imported.id, importId);
    assert.equal(await page.locator('#jwDialog .jw-description').textContent(), imported.description);
    assert.match(await page.locator('#jfNotice').textContent(), /übernommen/);
    await page.locator('#jwDialog [data-action="close-dialog"]').click();
    record(`${name}: explicit full-text import`, `${importId}: ${imported.description.length} characters`);

    await page.locator('#organisationDirectory > summary').click();
    await page.locator('.map-section').waitFor({ state: 'visible' });
    assert.match(await page.locator('#mapSummary').textContent(), /85/);
    if (viewport.width < 600) {
      assert.equal(await page.locator('#mapLocationList').isVisible(), true, 'Mobile defaults to location list');
      await page.locator('#cantonChips [data-loc="Bern"]').click();
      await page.locator('#mapViewMap').click();
    } else {
      await page.locator('.city-bubble[data-loc="Bern"]').focus();
      await page.keyboard.press('Enter');
    }
    assert.equal(await page.locator('.city-bubble[data-loc="Bern"]').getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('#mapSummary').textContent(), /28/);
    await page.locator('#mapViewList').click();
    assert.equal(await page.locator('#cantonChips [data-loc="Bern"]').getAttribute('aria-pressed'), 'true');
    await page.locator('#cantonChips [data-loc="Zürich"]').click();
    assert.match(await page.locator('#mapSummary').textContent(), /39/);
    await page.locator('#searchInput').fill('BROWSER-SMOKE-NO-SUCH-ORGANISATION');
    await page.locator('#mapEmpty').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#mapChooseEmployers').isDisabled(), true);
    await page.locator('#mapReset').click();
    assert.match(await page.locator('#mapSummary').textContent(), /85/);
    await page.locator('#mapViewMap').click();
    assert.ok((await page.locator('#swissMapOutline').getAttribute('d'))?.length > 100, 'Swiss boundary path loaded');
    await noOverflow();
    await screenshot('map', 'light');
    record(`${name}: regional map, keyboard/list selection, search and reset`);

    await page.locator('#themeToggle').click();
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('dark')), true);
    await screenshot('feed', 'dark');
    await screenshot('map', 'dark');
    await noOverflow();
    record(`${name}: light and dark layout screenshots`);
    assert.deepEqual(result.errors, [], `${name}: no console errors or uncaught exceptions`);
    assert.deepEqual(result.unexpected_external_requests, [], `${name}: no backend, AI or other external requests`);
    assert.deepEqual(result.failed_requests, [], `${name}: no failed requests`);
  } catch (error) {
    await page.screenshot({ path: resolve(output, `${name}-failure.png`), animations: 'disabled' }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}

await mkdir(output, { recursive: true });
try {
  await loadDataset();
  const origin = await serve();
  browser = await chromium.launch({ headless: true });
  await inspectViewport(origin, 'desktop', { width: 1440, height: 1100 });
  await inspectViewport(origin, 'mobile', { width: 390, height: 844 });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = error.stack || String(error); report.errors.push(report.error); process.exitCode = 1;
} finally {
  await browser?.close();
  if (server) await new Promise(accept => server.close(accept));
  report.finished_at = new Date().toISOString();
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, dataset: report.dataset, jobs: report.jobs, sources: report.sources, checks: report.checks.length, screenshots: report.screenshots.length, report: 'browser-smoke/report.json', ...(report.error ? { error: report.error } : {}) }, null, 2));
}

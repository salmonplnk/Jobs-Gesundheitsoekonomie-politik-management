const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { letterDocx, letterHtml, fileName } = require('../js/letters.js');

function unzipStored(buffer) {
  const files = new Map(); let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(buffer.readUInt16LE(offset + 8), 0, 'OOXML entries are stored without unsupported compression');
    const size = buffer.readUInt32LE(offset + 18), nameLength = buffer.readUInt16LE(offset + 26), extra = buffer.readUInt16LE(offset + 28);
    const filename = buffer.subarray(offset + 30, offset + 30 + nameLength).toString();
    const start = offset + 30 + nameLength + extra, bytes = buffer.subarray(start, start + size);
    let crc = 0xffffffff;
    for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1; }
    assert.equal((crc ^ 0xffffffff) >>> 0, buffer.readUInt32LE(offset + 14), 'ZIP CRC matches content');
    files.set(filename, bytes.toString()); offset = start + size;
  }
  assert.equal(buffer.readUInt32LE(offset), 0x02014b50, 'central directory exists');
  assert.equal(buffer.readUInt32LE(buffer.length - 22), 0x06054b50, 'end of directory exists');
  assert.equal(buffer.readUInt16LE(buffer.length - 12), files.size);
  return files;
}

test('Word export contains a valid ZIP package with escaped Unicode text, styles and relationships', async () => {
  const blob = letterDocx('Zoë Müller & Co\n\n<Kein HTML>\nGrüsse à tous\u0001', 'fr');
  assert.match(blob.type, /wordprocessingml/);
  const files = unzipStored(Buffer.from(await blob.arrayBuffer()));
  assert.equal(files.size, 5);
  assert.match(files.get('[Content_Types].xml'), /wordprocessingml.document.main\+xml/);
  assert.match(files.get('_rels/.rels'), /Target="word\/document.xml"/);
  assert.match(files.get('word/_rels/document.xml.rels'), /Target="styles.xml"/);
  assert.match(files.get('word/document.xml'), /Zoë Müller &amp; Co/);
  assert.match(files.get('word/document.xml'), /&lt;Kein HTML&gt;/);
  assert.doesNotMatch(files.get('word/document.xml'), /\u0001/);
  assert.match(files.get('word/styles.xml'), /fr-CH/);
});

test('HTML export escapes text and title and produces a printable A4 document', () => {
  const html = letterHtml('<script>alert("oops")</script>\nA & B', '</title><img src=x>', 'de');
  assert.doesNotMatch(html, /<script|<img/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /A &amp; B/);
  assert.match(html, /size:A4/);
  assert.match(html, /lang="de-CH"/);
  assert.doesNotMatch(fileName({ organization: '../A/B', title: 'C:D' }, 'docx'), /[/:]/);
});

const source = fs.readFileSync(path.join(__dirname, '../supabase/functions/generate-cover-letter/index.ts'), 'utf8').replace(/^import .*\n/m, '');
const backendCode = stripTypeScriptTypes(source);
function backend(options = {}) {
  let handler;
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: options.unauthorized ? null : { id: 'owner' } }, error: null }) },
    rpc: async (name, params) => { calls.push({ name, params }); return { data: options.allowed ?? true, error: options.quotaError ? { code: 'DB_DOWN' } : null }; },
  };
  vm.runInNewContext(backendCode, {
    Response, Request, TextEncoder, AbortController, setTimeout, clearTimeout, Date,
    console: { error() {} }, createClient: () => client,
    Deno: { serve: callback => { handler = callback; }, env: { get: key => key === 'ANTHROPIC_API_KEY' ? 'test-key' : key === 'COVER_LETTER_MODEL' ? 'configured-model' : 'test' } },
    fetch: async (_url, init) => { calls.push({ request: JSON.parse(init.body) }); return new Response(JSON.stringify(options.modelResult || { content: [{ type: 'text', text: 'Meine Erfahrung unterstützt Ihre Arbeit.\n\nIch freue mich auf ein Gespräch.' }], stop_reason: 'end_turn' }), { status: options.providerStatus || 200 }); },
  });
  return { calls, request: (input, method = 'POST') => handler(new Request('https://example.test', { method, headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(input) } : {}) })) };
}
const input = () => ({ language: 'de', sender: { name: 'Zoë Müller', address: 'Beispielweg 1', postcode: '3000', city: 'Bern' }, recipient: {}, job: { title: 'Gesundheitsökonomin', organization: 'Beispielspital', location: 'Basel', pensum: '80%', description: 'Vollständige Aufgaben und Anforderungen. '.repeat(250) + 'LETZTE_ANFORDERUNG', requirements: 'Paneldaten analysieren.' }, documents: [{ name: 'CV', type: 'cv', text: 'Master Gesundheitsökonomie. Erfahrung mit Paneldaten.' }], experience: '' });

test('letter backend retains full posting, uses sender city and only confirmed recipient data', async () => {
  const h = backend(), data = input();
  const response = await h.request(data), result = await response.json();
  assert.equal(response.status, 200);
  const request = h.calls.find(call => call.request).request;
  assert.equal(request.model, 'configured-model');
  assert.equal(JSON.parse(request.messages[0].content).job.description, data.job.description);
  assert.match(request.system, /niemals als Qualifikation/);
  assert.match(result.letter, /Bern, \d/);
  assert.doesNotMatch(result.letter, /Basel/);
  assert.match(result.letter, /Beispielspital\n\nBewerbung/);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])), { name: 'consume_job_quota', params: { action_name: 'generate-cover-letter', max_requests: 10, window_seconds: 3600 } });
});

test('invalid evidence and excessively long full descriptions fail explicitly before quota/model calls', async () => {
  for (const invalid of [{ documents: [], experience: '' }, { sender: { name: 'Zoë', city: '' } }, { language: 'en' }, { job: { ...input().job, description: 'a'.repeat(80001) } }]) {
    const h = backend(), response = await h.request({ ...input(), ...invalid });
    assert.equal(response.status, 400);
    assert.equal(h.calls.length, 0);
  }
});

test('auth, quota failures and denied quota stop generation; incomplete provider output is rejected', async () => {
  for (const [options, status] of [[{ unauthorized: true }, 401], [{ quotaError: true }, 503], [{ allowed: false }, 429]]) {
    const h = backend(options), response = await h.request(input());
    assert.equal(response.status, status);
    assert.equal(h.calls.filter(call => call.request).length, 0);
  }
  const incomplete = backend({ modelResult: { content: [{ type: 'text', text: 'Teilbrief' }], stop_reason: 'max_tokens' } });
  assert.equal((await incomplete.request(input())).status, 502);
  assert.equal((await backend().request({}, 'GET')).status, 405);
});

test('French letters use supplied recipient and salutation without guessing titles', async () => {
  const data = input(); data.language = 'fr'; data.recipient = { name: 'Équipe RH', city: 'Genève', address: 'Rue des Exemples 2', postcode: '1200', salutation: 'Madame, Monsieur,' };
  const response = await backend().request(data), result = await response.json();
  assert.match(result.letter, /Bern, le \d/);
  assert.match(result.letter, /Beispielspital\nÉquipe RH\nRue des Exemples 2\n1200 Genève/);
  assert.match(result.letter, /Candidature au poste de/);
  assert.match(result.letter, /Avec mes salutations distinguées/);
});

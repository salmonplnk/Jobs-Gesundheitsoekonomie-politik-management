/* Application letters, saved versions and real OOXML export. */
(function (root) {
  'use strict';
  let active = null, opening = 0;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plain = value => Array.isArray(value) ? value.map(plain).join('\n') : value && typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '');
  const descriptionOf = job => plain(job.description || job.full_description || job.description_text || '');
  const safeUrl = value => { try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href : ''; } catch (_) { return ''; } };
  const userId = () => typeof root.HealthJobs?.getOwner === 'function' ? root.HealthJobs.getOwner() || 'guest' : typeof currentUser !== 'undefined' ? currentUser?.id || 'guest' : 'guest';
  const documentId = (doc, index) => String(doc.id || doc.upload_id || [doc.file_name || doc.name || doc.doc_type || 'document', doc.uploaded_at || index].join(':'));

  function fileName(job, extension) {
    const name = `Bewerbung_${job.organization || 'Stelle'}_${job.title || ''}`.normalize('NFKC').replace(/[^\p{L}\p{N}_ -]/gu, '_').trim().slice(0, 110);
    return `${name}_${new Date().toISOString().slice(0, 10)}.${extension}`;
  }
  function letterHtml(text, title, language) {
    return `<!doctype html><html lang="${language === 'fr' ? 'fr-CH' : 'de-CH'}"><head><meta charset="utf-8"><title>${escape(title)}</title><style>@page{size:A4;margin:25mm}body{max-width:165mm;margin:24px auto;color:#18242a;font:11pt/1.5 Arial,sans-serif}p{margin:0;min-height:1.5em;white-space:pre-wrap;overflow-wrap:anywhere}@media print{body{max-width:none;margin:0}}</style></head><body>${String(text).split(/\r?\n/).map(line => `<p>${escape(line)}</p>`).join('')}</body></html>`;
  }
  // Original ZIP writer: OOXML is a ZIP container, not renamed HTML.
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function zipFiles(files) {
    const encoder = new TextEncoder(), locals = [], directory = [];
    let offset = 0;
    for (const [path, text] of Object.entries(files)) {
      const name = encoder.encode(path), bytes = encoder.encode(text), crc = crc32(bytes);
      const header = new Uint8Array(30 + name.length), view = new DataView(header.buffer);
      view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true);
      view.setUint16(12, 33, true); view.setUint32(14, crc, true); view.setUint32(18, bytes.length, true);
      view.setUint32(22, bytes.length, true); view.setUint16(26, name.length, true); header.set(name, 30);
      const central = new Uint8Array(46 + name.length), cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true); cv.setUint16(14, 33, true); cv.setUint32(16, crc, true);
      cv.setUint32(20, bytes.length, true); cv.setUint32(24, bytes.length, true);
      cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); central.set(name, 46);
      locals.push(header, bytes); directory.push(central); offset += header.length + bytes.length;
    }
    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, directory.length, true); ev.setUint16(10, directory.length, true);
    ev.setUint32(12, directory.reduce((sum, item) => sum + item.length, 0), true); ev.setUint32(16, offset, true);
    return new Blob([...locals, ...directory, end], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  function letterDocx(text, language) {
    const xml = value => escape(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '');
    const paragraphs = String(text).split(/\r?\n/).map(line => `<w:p><w:r><w:t xml:space="preserve">${xml(line)}</w:t></w:r></w:p>`).join('');
    return zipFiles({
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'word/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/><w:lang w:val="${language === 'fr' ? 'fr-CH' : 'de-CH'}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`,
      'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`
    });
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function installStyles() {
    if (document.getElementById('jobLetterStyles')) return;
    const style = document.createElement('style'); style.id = 'jobLetterStyles';
    style.textContent = `.jl-dialog{box-sizing:border-box;margin:auto;width:min(1080px,96vw);max-height:92vh;border:1px solid #ccd8d9;border-radius:18px;padding:0;background:var(--card,#fff);color:var(--text,#182f39);box-shadow:0 24px 80px #071f3855}.jl-dialog::backdrop{background:#142b3c99}.jl-dialog header{background:none;color:var(--text,#182f39);text-align:left;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:22px 24px;border-bottom:1px solid #dae2e5}.jl-dialog h2{margin:0;font-size:1.4rem}.jl-dialog h3{font-size:1rem;margin:0 0 12px}.jl-dialog header p{margin:5px 0 0}.jl-close{color:inherit;border:0;background:none;font-size:24px;cursor:pointer;padding:4px 10px}.jl-layout>section{min-width:0}.jl-layout{display:grid;grid-template-columns:minmax(240px,1fr) minmax(340px,1.35fr);gap:22px;padding:24px}.jl-dialog label{display:block;font-size:.85rem;margin:10px 0 5px;font-weight:600}.jl-dialog input:not([type=checkbox]),.jl-dialog textarea,.jl-dialog select{box-sizing:border-box;width:100%;font:inherit;padding:9px;border:1px solid #aebec6;border-radius:7px;color:inherit;background:var(--card,#fff)}.jl-dialog input:focus,.jl-dialog textarea:focus,.jl-dialog select:focus,.jl-dialog button:focus-visible{outline:3px solid #36a3ad;outline-offset:2px}.jl-row{display:grid;grid-template-columns:1fr 2fr;gap:10px}.jl-dialog details{border:1px solid #d6e1e5;border-radius:9px;padding:12px;margin:14px 0}.jl-dialog summary{cursor:pointer;font-weight:600}.jl-source{white-space:pre-wrap;max-height:260px;overflow:auto;line-height:1.5;font-size:.84rem}.jl-evidence label{display:flex;align-items:flex-start;gap:8px;font-weight:400}.jl-evidence input{margin-top:3px}.jl-evidence small{display:block;color:var(--muted,#536770)}.jl-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.jl-actions button,.jl-primary{padding:9px 12px;border:1px solid #c1d1d8;background:var(--card,#fff);border-radius:8px;color:inherit;font:inherit;font-size:.84rem;cursor:pointer}.jl-primary{background:#176374!important;color:#fff!important;border-color:#176374!important}.jl-actions button:disabled{opacity:.5;cursor:wait}.jl-editor{min-height:530px;line-height:1.6;resize:vertical}.jl-status{min-height:22px;font-size:.85rem;line-height:1.5;white-space:pre-wrap}.jl-status[data-error=true]{color:#b12538}.jl-note{font-size:.8rem;color:var(--muted,#536770);line-height:1.5}.jl-dialog fieldset{border:0;padding:0;margin:0}.jl-dialog legend{font-weight:700;margin:18px 0 5px}.jl-unsaved{font-size:.78rem;color:#805318}body.dark .jl-unsaved{color:#edc484}body.dark .jl-status[data-error=true]{color:#ffb2ac}@media(max-width:760px){.jl-layout{grid-template-columns:1fr;padding:16px}.jl-dialog header{padding:16px}.jl-editor{min-height:420px}}`;
    document.head.append(style);
  }
  function status(message, error = false) {
    if (!active) return;
    const el = active.dialog.querySelector('#jlStatus'); el.textContent = message; el.dataset.error = String(error);
  }
  function value(id) { return active.dialog.querySelector(`#${id}`).value.trim(); }
  function formDraft() {
    return {
      name: value('jlVersionName') || `Entwurf ${new Date().toLocaleString('de-CH')}`,
      text: active.dialog.querySelector('#jlEditor').value, language: value('jlLanguage'),
      job_description: value('jlDescription'), description_complete: active.dialog.querySelector('#jlDescriptionComplete').checked,
      sender: { name: value('jlSenderName'), address: value('jlSenderAddress'), postcode: value('jlSenderPostcode'), city: value('jlSenderCity') },
      recipient: { name: value('jlRecipientName'), address: value('jlRecipientAddress'), postcode: value('jlRecipientPostcode'), city: value('jlRecipientCity'), salutation: value('jlSalutation') },
      selected_document_ids: [...active.dialog.querySelectorAll('[data-document-id]:checked')].map(el => el.dataset.documentId),
      experience: value('jlExperience'), created_at: new Date().toISOString()
    };
  }
  function signature(draft) { const { name, created_at, id, ...content } = draft; return JSON.stringify(content); }
  function markDirty() {
    if (!active) return;
    active.dirty = signature(formDraft()) !== active.savedSignature;
    active.dialog.querySelector('#jlUnsaved').textContent = active.dirty ? 'Änderungen noch nicht als Version gespeichert' : '';
  }
  function applyDraft(draft) {
    const dialog = active.dialog;
    const fields = { jlEditor: draft.text || '', jlLanguage: draft.language || 'de', jlVersionName: draft.name || '', jlExperience: draft.experience || '', jlSenderName: draft.sender?.name || '', jlSenderAddress: draft.sender?.address || '', jlSenderPostcode: draft.sender?.postcode || '', jlSenderCity: draft.sender?.city || '', jlRecipientName: draft.recipient?.name || '', jlRecipientAddress: draft.recipient?.address || '', jlRecipientPostcode: draft.recipient?.postcode || '', jlRecipientCity: draft.recipient?.city || '', jlSalutation: draft.recipient?.salutation || '' };
    for (const [id, text] of Object.entries(fields)) dialog.querySelector(`#${id}`).value = text;
    dialog.querySelector('#jlDescription').value = draft.job_description ?? descriptionOf(active.job);
    dialog.querySelector('#jlDescriptionComplete').checked = draft.description_complete ?? !active.job.description_truncated;
    dialog.querySelectorAll('[data-document-id]').forEach(el => { el.checked = (draft.selected_document_ids || []).includes(el.dataset.documentId); });
    active.savedSignature = signature(formDraft()); active.dirty = false; markDirty();
  }
  async function refreshVersions(selectedId) {
    const state = active, drafts = await root.HealthJobs.getDrafts(state.job.id);
    if (active !== state || state.owner !== userId()) return;
    state.drafts = [...(drafts || [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const select = state.dialog.querySelector('#jlVersions'); select.replaceChildren(new Option('Version auswählen …', ''));
    state.drafts.forEach((draft, index) => select.add(new Option(`${draft.name || 'Entwurf'} · ${new Date(draft.created_at).toLocaleString('de-CH')}`, String(index))));
    if (selectedId) { const index = state.drafts.findIndex(draft => draft.id === selectedId); if (index >= 0) select.value = String(index); }
  }
  async function saveVersion() {
    const state = active, button = state.dialog.querySelector('[data-action=save]');
    if (state.owner !== userId()) { closeLetter(true); return; }
    const draft = formDraft();
    if (!draft.text.trim()) { status('Schreibe oder generiere zuerst einen Entwurf.', true); return; }
    button.disabled = true;
    try {
      const saved = await root.HealthJobs.saveDraft(state.job.id, draft);
      if (active !== state || state.owner !== userId()) return;
      state.savedSignature = signature(draft); markDirty(); await refreshVersions(saved?.id);
      if (active !== state || state.owner !== userId()) return;
      try { await root.HealthJobs.saveSender(draft.sender); }
      catch (_) { if (active === state) status('Version gespeichert. Absender konnte nicht als Vorgabe gespeichert werden.', true); return; }
      if (active === state) status('Neue Version gespeichert. Frühere Versionen bleiben erhalten.');
    } catch (error) { if (active === state) status(error.message || 'Speichern fehlgeschlagen. Dein Entwurf bleibt im Editor.', true); }
    finally { if (active === state) button.disabled = false; }
  }
  async function generate() {
    const state = active, draft = formDraft();
    if (!draft.sender.name || !draft.sender.city) { status('Bitte Name und eigenen Wohnort für die Datumszeile eintragen.', true); return; }
    const documents = state.documents.filter(doc => draft.selected_document_ids.includes(doc._id)).map(doc => ({ id: doc._id, name: doc.file_name || doc.name || doc.doc_type, type: doc.doc_type, text: doc.raw_text || doc.text || '', employer: doc.employer || '', period: doc.period || '' }));
    if (!documents.some(doc => doc.text.trim()) && !draft.experience) { status('Wähle mindestens einen ausgelesenen Beleg oder ergänze eigene Erfahrungen.', true); return; }
    if (!draft.job_description) { status('Bitte ergänze den vollständigen Stellenbeschrieb oben. Manuelles Schreiben und Exportieren bleiben möglich.', true); return; }
    if (!draft.description_complete) { status('Bitte ergänze den vollständigen Stellenbeschrieb oben und bestätige seine Vollständigkeit.', true); return; }
    if (draft.text.trim() && state.dirty && !root.confirm('Der aktuelle Entwurf ist noch nicht gespeichert. Soll die Generierung ihn ersetzen?')) return;
    const button = state.dialog.querySelector('[data-action=generate]'); button.disabled = true;
    const locked = [...state.dialog.querySelectorAll('input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[data-action=save]:not(:disabled)')];
    locked.forEach(element => { element.disabled = true; });
    state.controller = new AbortController(); const timeout = setTimeout(() => state.controller?.abort(), 95000);
    status('Bewerbung wird aus Stellenbeschrieb und ausgewählten Belegen erstellt …');
    try {
      if (typeof supabaseClient === 'undefined' || !supabaseClient?.auth) throw new Error('Anmeldung ist zurzeit nicht verfügbar. Bitte lade die Seite erneut.');
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      if (active !== state) return;
      if (error || !session) { status('Bitte anmelden, um eine Bewerbung zu generieren.', true); return; }
      if (state.owner !== session.user.id) { closeLetter(true); return; }
      const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-cover-letter`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_KEY }, signal: state.controller.signal,
        body: JSON.stringify({ language: draft.language, sender: draft.sender, recipient: draft.recipient, documents, experience: draft.experience, job: { id: state.job.id, title: state.job.title, organization: state.job.organization, location: state.job.location, pensum: state.job.pensum, url: state.job.url || state.job.source_url, description: draft.job_description, requirements: plain(state.job.requirements) } })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.letter?.trim()) throw new Error(data.error || 'Die Generierung lieferte keinen Entwurf. Bitte erneut versuchen.');
      if (active !== state || state.owner !== userId()) return;
      state.dialog.querySelector('#jlEditor').value = data.letter;
      state.dialog.querySelector('#jlVersionName').value = `Entwurf ${new Date().toLocaleString('de-CH')}`;
      markDirty(); status('Entwurf erstellt. Prüfe die Aussagen und speichere deine Version.');
    } catch (error) { if (active === state) status(error.name === 'AbortError' ? 'Generierung abgebrochen oder Zeitlimit erreicht. Der bisherige Text bleibt erhalten.' : error.message || 'Netzwerkfehler. Bitte erneut versuchen.', true); }
    finally { clearTimeout(timeout); if (active === state) { button.disabled = false; locked.forEach(element => { element.disabled = false; }); state.controller = null; } }
  }
  function exportLetter(kind) {
    const draft = formDraft(), job = active.job;
    if (!draft.text.trim()) { status('Der Entwurf ist noch leer.', true); return; }
    if (kind === 'docx') download(letterDocx(draft.text, draft.language), fileName(job, 'docx'));
    if (kind === 'txt') download(new Blob([draft.text], { type: 'text/plain;charset=utf-8' }), fileName(job, 'txt'));
    if (kind === 'html') download(new Blob([letterHtml(draft.text, fileName(job, 'html'), draft.language)], { type: 'text/html;charset=utf-8' }), fileName(job, 'html'));
    if (kind === 'pdf') {
      const preview = root.open('', '_blank');
      if (!preview) { status('Bitte Pop-ups erlauben, um die Druckansicht zu öffnen.', true); return; }
      preview.opener = null; preview.document.open(); preview.document.write(letterHtml(draft.text, fileName(job, 'pdf'), draft.language)); preview.document.close();
      setTimeout(() => { if (!preview.closed) { preview.focus(); preview.print(); } }, 200);
      status('Im Druckdialog «Als PDF speichern» auswählen.');
    }
  }
  function closeLetter(force = false) {
    opening++;
    if (!active) return true;
    if (!force && active.dirty && !root.confirm('Ungespeicherte Änderungen verwerfen und schliessen?')) return false;
    const state = active; active = null; state.controller?.abort(); state.dialog.close(); state.dialog.remove();
    if (state.previousFocus?.isConnected) state.previousFocus.focus(); return true;
  }
  async function openJobLetter(jobId) {
    if (active && !closeLetter()) return;
    const token = ++opening, owner = userId();
    const job = await root.HealthJobs.getJob(jobId); if (!job || token !== opening || owner !== userId()) return;
    installStyles();
    const documents = (typeof getDocuments === 'function' ? getDocuments() : []).map((doc, index) => ({ ...doc, _id: documentId(doc, index) }));
    const sender = await root.HealthJobs.getSender() || {};
    if (token !== opening || owner !== userId()) return;
    const dialog = document.createElement('dialog'); dialog.className = 'jl-dialog'; dialog.setAttribute('aria-labelledby', 'jlTitle');
    const link = safeUrl(job.url || job.source_url);
    dialog.innerHTML = `<header><div><h2 id="jlTitle">Bewerbungsschreiben</h2><p>${escape(job.title)} · ${escape(job.organization)}</p></div><button type="button" class="jl-close" data-action="close" aria-label="Bewerbungsschreiben schliessen">×</button></header>
      <div class="jl-layout"><section aria-label="Angaben und Belege"><h3>Grundlage deines Schreibens</h3>
      <details><summary>Stellenbeschrieb prüfen und ergänzen</summary>${link ? `<p><a href="${escape(link)}" target="_blank" rel="noopener noreferrer">Originalinserat öffnen ↗</a></p>` : ''}${job.description_truncated ? '<p class="jl-note">Der erfasste Text wurde wegen seiner Länge gekürzt. Ersetze ihn durch den vollständigen Stellenbeschrieb und bestätige dies unten.</p>' : ''}<label for="jlDescription">Vollständiger Stellenbeschrieb für diesen Entwurf</label><textarea id="jlDescription" class="jl-source" rows="9" maxlength="80000"></textarea><label><input id="jlDescriptionComplete" type="checkbox"> Der vollständige Stellenbeschrieb ist enthalten</label>${job.requirements ? `<div class="jl-source">Anforderungen:\n${escape(plain(job.requirements))}</div>` : ''}</details>
      <label for="jlLanguage">Sprache</label><select id="jlLanguage"><option value="de">Deutsch (Schweiz)</option><option value="fr">Français (Suisse)</option></select>
      <fieldset><legend>Absender</legend><label for="jlSenderName">Vorname und Nachname</label><input id="jlSenderName" autocomplete="name" maxlength="200"><label for="jlSenderAddress">Strasse und Hausnummer</label><input id="jlSenderAddress" autocomplete="street-address" maxlength="300"><div class="jl-row"><div><label for="jlSenderPostcode">Postleitzahl</label><input id="jlSenderPostcode" autocomplete="postal-code" maxlength="30"></div><div><label for="jlSenderCity">Eigener Wohnort</label><input id="jlSenderCity" autocomplete="address-level2" maxlength="150"></div></div></fieldset>
      <details><summary>Empfänger und Anrede ergänzen</summary><p class="jl-note">Organisation: ${escape(job.organization)}. Trage nur bestätigte Angaben ein; leere Felder werden ausgelassen.</p><label for="jlRecipientName">Kontaktperson / Abteilung</label><input id="jlRecipientName" maxlength="200"><label for="jlRecipientAddress">Strasse und Hausnummer</label><input id="jlRecipientAddress" maxlength="300"><div class="jl-row"><div><label for="jlRecipientPostcode">Postleitzahl</label><input id="jlRecipientPostcode" maxlength="30"></div><div><label for="jlRecipientCity">Ort</label><input id="jlRecipientCity" maxlength="150"></div></div><label for="jlSalutation">Anrede (optional, in gewählter Sprache)</label><input id="jlSalutation" placeholder="z. B. Sehr geehrte Frau Meier" maxlength="200"></details>
      <fieldset class="jl-evidence"><legend>Erfahrungen gezielt auswählen</legend><p class="jl-note">Nur ausgewählte Belege und deine Ergänzungen werden für diesen Entwurf verwendet.</p>${documents.length ? documents.map(doc => `<label><input type="checkbox" data-document-id="${escape(doc._id)}" ${doc.raw_text || doc.text ? 'checked' : 'disabled'}><span>${escape(doc.file_name || doc.name || (doc.doc_type === 'cv' ? 'Lebenslauf' : doc.employer || 'Arbeitszeugnis'))}<small>${escape(doc.period || '')}${doc.raw_text || doc.text ? '' : ' Kein ausgelesener Text vorhanden'}</small></span></label>`).join('') : '<p class="jl-note">Noch keine Dokumente im Profil. Du kannst eigene Erfahrungen unten eintragen.</p>'}</fieldset>
      <label for="jlExperience">Eigene belegbare Erfahrungen und Motivation</label><textarea id="jlExperience" rows="5" maxlength="15000" placeholder="Welche konkreten Tätigkeiten, Ergebnisse oder Kompetenzen möchtest du hervorheben?"></textarea><div class="jl-actions"><button type="button" class="jl-primary" data-action="generate">Entwurf generieren</button></div><p class="jl-note">Stellenbeschrieb und ausgewählte Angaben werden zum Erstellen des Texts verarbeitet. Prüfe den fertigen Entwurf vor der Verwendung.</p></section>
      <section aria-label="Entwurf und Versionen"><label for="jlVersions">Gespeicherte Version laden</label><select id="jlVersions"><option value="">Version auswählen …</option></select><label for="jlEditor">Dein Bewerbungsschreiben</label><textarea id="jlEditor" class="jl-editor" spellcheck="true"></textarea><p id="jlUnsaved" class="jl-unsaved" aria-live="polite"></p><label for="jlVersionName">Name der neuen Version</label><input id="jlVersionName" maxlength="200" placeholder="z. B. Finale Fassung"><div class="jl-actions"><button type="button" class="jl-primary" data-action="save">Als neue Version speichern</button><button type="button" data-action="copy">Kopieren</button></div><div class="jl-actions"><button type="button" data-action="docx">Word (.docx)</button><button type="button" data-action="pdf">PDF via Drucken</button><button type="button" data-action="txt">Text (.txt)</button><button type="button" data-action="html">HTML (.html)</button></div><p id="jlStatus" class="jl-status" role="status" aria-live="polite"></p></section></div>`;
    active = { dialog, job: { ...job, id: job.id || jobId }, documents, owner: userId(), dirty: false, drafts: [], previousFocus: document.activeElement };
    const state = active; document.body.append(dialog);
    applyDraft({ sender: { ...sender, name: sender.name || documents.find(doc => doc.doc_type === 'cv')?.person_name || '' }, recipient: {}, text: '', language: 'de', selected_document_ids: documents.filter(doc => doc.raw_text || doc.text).map(doc => doc._id) });
    dialog.addEventListener('input', markDirty);
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeLetter(); });
    dialog.querySelector('#jlVersions').addEventListener('change', event => {
      if (event.target.value === '') return;
      if (active.dirty && !root.confirm('Ungespeicherte Änderungen durch diese Version ersetzen?')) { event.target.value = ''; return; }
      const draft = state.drafts[Number(event.target.value)]; if (draft) { applyDraft(draft); status('Gespeicherte Version geladen. Änderungen kannst du als neue Version sichern.'); }
    });
    dialog.addEventListener('click', async event => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'close') closeLetter();
      if (action === 'generate') await generate();
      if (action === 'save') await saveVersion();
      if (['docx', 'pdf', 'txt', 'html'].includes(action)) exportLetter(action);
      if (action === 'copy') { try { await navigator.clipboard.writeText(formDraft().text); status('Text kopiert.'); } catch (_) { status('Kopieren nicht möglich. Markiere und kopiere den Text im Editor.', true); } }
    });
    dialog.showModal();
    try { await refreshVersions(); if (active === state && state.owner === userId() && state.drafts.length && !state.dirty) { applyDraft(state.drafts[0]); dialog.querySelector('#jlVersions').value = '0'; } }
    catch (error) { if (active === state) status(error.message || 'Gespeicherte Versionen konnten nicht geladen werden.', true); }
  }
  root.openJobLetter = openJobLetter;
  root.HealthJobLetterExports = { letterDocx, letterHtml, fileName };
  if (typeof supabaseClient !== 'undefined' && supabaseClient?.auth) supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (_event === 'SIGNED_IN' || _event === 'SIGNED_OUT') opening++;
    if (active && active.owner !== (session?.user?.id || 'guest')) closeLetter(true);
  });
  root.addEventListener?.('healthjobs:auth', event => {
    opening++;
    if (active && active.owner !== (event.detail?.userId || 'guest')) closeLetter(true);
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HealthJobLetterExports;
})(typeof window === 'undefined' ? globalThis : window);

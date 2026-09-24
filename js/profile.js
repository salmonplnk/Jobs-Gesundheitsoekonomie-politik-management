/* ========================================
   PROFILE — Questionnaire & localStorage
   ======================================== */

const LS_PROFILE = 'userProfile';
const CANTONS = [
  'AG','AI','AR','BE','BL','BS','FR','GE','GL','GR','JU','LU',
  'NE','NW','OW','SG','SH','SO','SZ','TG','TI','UR','VD','VS','ZG','ZH'
];

function getProfile() {
  return readStoredJSON(LS_PROFILE, {});
}

async function saveProfile(data) {
  const enriched = { ...data, updated_at: new Date().toISOString() };
  localStorage.setItem(LS_PROFILE, JSON.stringify(enriched));
  if (typeof syncProfileToSupabase === 'function' && isLoggedIn()) {
    return syncProfileToSupabase(enriched);
  }
  return { synced: false, local: true };
}

function isProfileFilled() {
  const p = getProfile();
  return !!(p.education || p.field_of_study || p.experience || (p.desired_regions && p.desired_regions.length));
}

/* ======== Build Modal ======== */
function buildProfileModal() {
  if (document.getElementById('profileModal')) return;

  const modal = document.createElement('div');
  modal.id = 'profileModal';
  modal.className = 'profile-modal';
  modal.innerHTML = `
    <div class="profile-backdrop" onclick="closeProfile()"></div>
    <div class="profile-panel">
      <div class="profile-header">
        <h2>📋 Mein Profil</h2>
        <p>Alle Felder sind optional und überspringbar. Deine Angaben verbessern das KI-Matching.</p>
        <button class="profile-close" onclick="closeProfile()" aria-label="Schliessen">✕</button>
      </div>
      <form id="profileForm" class="profile-form" onsubmit="submitProfile(event)">

        <!-- Ausbildung -->
        <fieldset class="pf-field">
          <legend>🎓 Höchste Ausbildung</legend>
          <div class="pf-btn-group" data-name="education">
            <button type="button" class="pf-btn" data-value="lehre">Lehre / EFZ</button>
            <button type="button" class="pf-btn" data-value="bachelor">Bachelor</button>
            <button type="button" class="pf-btn" data-value="master">Master</button>
            <button type="button" class="pf-btn" data-value="phd">PhD / Dr.</button>
            <button type="button" class="pf-btn" data-value="andere">Andere</button>
          </div>
        </fieldset>

        <!-- Fachrichtung -->
        <fieldset class="pf-field">
          <legend>📚 Fachrichtung</legend>
          <input type="text" class="pf-input" name="field_of_study"
            placeholder="z.B. Pflege, Gesundheitsökonomie, Medizin, Public Health...">
        </fieldset>

        <!-- Berufserfahrung -->
        <fieldset class="pf-field">
          <legend>💼 Berufserfahrung</legend>
          <div class="pf-btn-group" data-name="experience">
            <button type="button" class="pf-btn" data-value="0-2">0–2 Jahre</button>
            <button type="button" class="pf-btn" data-value="2-5">2–5 Jahre</button>
            <button type="button" class="pf-btn" data-value="5-10">5–10 Jahre</button>
            <button type="button" class="pf-btn" data-value="10+">10+ Jahre</button>
          </div>
        </fieldset>

        <!-- Region -->
        <fieldset class="pf-field">
          <legend>🗺️ Gewünschte Region(en)</legend>
          <div class="pf-region-chips" id="regionChips">
            <button type="button" class="pf-chip" data-region="*">Ganze Schweiz</button>
            <button type="button" class="pf-chip" data-region="remote">Remote</button>
            ${CANTONS.map(c => `<button type="button" class="pf-chip" data-region="${c}">${c}</button>`).join('')}
          </div>
        </fieldset>

        <!-- Pensum -->
        <fieldset class="pf-field">
          <legend>⏱️ Pensum</legend>
          <div class="pf-range-row">
            <label>Min: <strong id="pensumMinVal">50</strong>%</label>
            <input type="range" class="pf-range" name="workload_min" min="10" max="100" step="10" value="50"
              oninput="constrainPensum('min', this.value)">
          </div>
          <div class="pf-range-row">
            <label>Max: <strong id="pensumMaxVal">100</strong>%</label>
            <input type="range" class="pf-range" name="workload_max" min="10" max="100" step="10" value="100"
              oninput="constrainPensum('max', this.value)">
          </div>
        </fieldset>

        <!-- Sprachen -->
        <fieldset class="pf-field">
          <legend>🌐 Sprachen</legend>
          <div class="pf-lang-grid" id="langGrid">
            ${['Deutsch','Französisch','Italienisch','Englisch'].map((lang, i) => {
              const keys = ['de','fr','it','en'];
              return `
              <div class="pf-lang-row">
                <span class="pf-lang-label">${lang}</span>
                <select class="pf-select" name="lang_${keys[i]}">
                  <option value="">—</option>
                  <option value="grundkenntnisse">Grundkenntnisse</option>
                  <option value="fliessend">Fliessend</option>
                  <option value="muttersprachlich">Muttersprachlich</option>
                </select>
              </div>`;
            }).join('')}
          </div>
        </fieldset>

        <!-- Stichwort -->
        <fieldset class="pf-field">
          <legend>🔍 Stichwort-Suche</legend>
          <input type="text" class="pf-input" name="keywords"
            placeholder="Was suchst du? z.B. Tarifwesen, Datenanalyse, Projektleitung...">
        </fieldset>

        <!-- Exklusionen -->
        <fieldset class="pf-field">
          <legend>🚫 Das möchte ich nicht</legend>
          <div class="pf-btn-group pf-multi" data-name="exclusions">
            <button type="button" class="pf-btn" data-value="administrativ">Administrativ</button>
            <button type="button" class="pf-btn" data-value="klinisch">Klinisch</button>
            <button type="button" class="pf-btn" data-value="forschung">Forschung</button>
            <button type="button" class="pf-btn" data-value="it">IT</button>
            <button type="button" class="pf-btn" data-value="management">Management</button>
          </div>
          <input type="text" class="pf-input pf-mt" name="exclusions_freetext"
            placeholder="Weitere Ausschlüsse (Freitext)...">
        </fieldset>

        <!-- Starttermin -->
        <fieldset class="pf-field">
          <legend>📅 Gewünschter Starttermin</legend>
          <div class="pf-btn-group" data-name="start_date">
            <button type="button" class="pf-btn" data-value="sofort">Sofort</button>
            <button type="button" class="pf-btn" data-value="1-3_monate">1–3 Monate</button>
            <button type="button" class="pf-btn" data-value="flexibel">Flexibel</button>
          </div>
        </fieldset>

        <!-- Dokumente (CV + Arbeitszeugnisse) -->
        <fieldset class="pf-field">
          <legend>📄 Dokumente für Matching & Bewerbungen</legend>
          ${isLoggedIn() ? `
          <div class="pf-cv-dropzone" id="cvDropzone">
            <div class="pf-cv-icon">📄</div>
            <p class="pf-cv-text">PDF hier hinziehen oder <strong>klicken</strong></p>
            <p class="pf-cv-sub">CV und Arbeitszeugnisse hochladen · Max. 5 MB pro Datei</p>
            <p class="pf-cv-sub">→ Besseres Matching + fertige Bewerbungsschreiben</p>
            <input type="file" id="cvFileInput" accept=".pdf,application/pdf" style="display:none">
          </div>
          <div class="pf-cv-status" id="cvStatus" style="display:none;"></div>
          <div class="pf-doc-list" id="docList"></div>
          <button type="button" class="pf-btn-secondary" onclick="refreshDocumentList()">Dokumentliste aktualisieren</button>
          ` : `
          <div class="pf-cv-placeholder">
            <p><a onclick="openAuthModal()" style="color:var(--accent);cursor:pointer;font-weight:600;">Anmelden</a> um Dokumente hochzuladen.</p>
            <p>CV + Arbeitszeugnisse → besseres Matching + Bewerbungsschreiben.</p>
          </div>`}
        </fieldset>

        <!-- Actions -->
        <p id="profileSaveStatus" role="status" aria-live="polite"></p>
        <div class="pf-actions">
          <button type="button" class="pf-btn-secondary" onclick="resetProfile()">Zurücksetzen</button>
          <button type="submit" class="pf-btn-primary">💾 Profil speichern</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  initProfileInteractions();
  initCvUpload();
}

/* ======== Pensum Constraint ======== */
function constrainPensum(which, val) {
  const form = document.getElementById('profileForm');
  if (!form) return;
  const minEl = form.querySelector('[name="workload_min"]');
  const maxEl = form.querySelector('[name="workload_max"]');
  let minVal = parseInt(minEl.value);
  let maxVal = parseInt(maxEl.value);
  if (which === 'min') {
    minVal = parseInt(val);
    if (minVal > maxVal) { maxVal = minVal; maxEl.value = maxVal; }
  } else {
    maxVal = parseInt(val);
    if (maxVal < minVal) { minVal = maxVal; minEl.value = minVal; }
  }
  document.getElementById('pensumMinVal').textContent = minVal;
  document.getElementById('pensumMaxVal').textContent = maxVal;
}

/* ======== Interactions ======== */
function initProfileInteractions() {
  // Single-select button groups
  document.querySelectorAll('#profileForm .pf-btn-group:not(.pf-multi)').forEach(group => {
    group.querySelectorAll('.pf-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const wasActive = btn.classList.contains('active');
        group.querySelectorAll('.pf-btn').forEach(b => b.classList.remove('active'));
        if (!wasActive) btn.classList.add('active');
      });
    });
  });

  // Multi-select button groups (exclusions)
  document.querySelectorAll('#profileForm .pf-btn-group.pf-multi').forEach(group => {
    group.querySelectorAll('.pf-btn').forEach(btn => {
      btn.addEventListener('click', () => btn.classList.toggle('active'));
    });
  });

  // Region chips (multi-select, "Ganze Schweiz" clears others)
  document.querySelectorAll('#regionChips .pf-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const region = chip.dataset.region;
      if (region === '*') {
        const wasActive = chip.classList.contains('active');
        document.querySelectorAll('#regionChips .pf-chip').forEach(c => c.classList.remove('active'));
        if (!wasActive) chip.classList.add('active');
      } else {
        document.querySelector('#regionChips .pf-chip[data-region="*"]').classList.remove('active');
        chip.classList.toggle('active');
      }
    });
  });
}

/* ======== Collect Form Data ======== */
function collectProfileData() {
  const form = document.getElementById('profileForm');
  const data = {};

  // Single-select groups
  document.querySelectorAll('#profileForm .pf-btn-group:not(.pf-multi)').forEach(group => {
    const name = group.dataset.name;
    const active = group.querySelector('.pf-btn.active');
    data[name] = active ? active.dataset.value : '';
  });

  // Multi-select groups
  document.querySelectorAll('#profileForm .pf-btn-group.pf-multi').forEach(group => {
    const name = group.dataset.name;
    data[name] = Array.from(group.querySelectorAll('.pf-btn.active')).map(b => b.dataset.value);
  });

  // Regions
  const activeRegions = Array.from(document.querySelectorAll('#regionChips .pf-chip.active')).map(c => c.dataset.region);
  data.desired_regions = activeRegions;

  // Text inputs
  data.field_of_study = form.querySelector('[name="field_of_study"]').value.trim();
  data.keywords = form.querySelector('[name="keywords"]').value.trim();
  data.exclusions_freetext = form.querySelector('[name="exclusions_freetext"]').value.trim();

  // Pensum
  data.workload_min = parseInt(form.querySelector('[name="workload_min"]').value);
  data.workload_max = parseInt(form.querySelector('[name="workload_max"]').value);

  // Languages
  data.languages = {};
  ['de','fr','it','en'].forEach(lang => {
    const val = form.querySelector(`[name="lang_${lang}"]`).value;
    if (val) data.languages[lang] = val;
  });

  return data;
}

/* ======== Populate Form from Saved Data ======== */
function populateProfile() {
  const data = getProfile();
  const form = document.getElementById('profileForm');
  if (!form) return;
  form.reset();
  form.querySelectorAll('.active').forEach(el => el.classList.remove('active'));
  form.querySelectorAll('.pf-btn-group').forEach(group => {
    const value = data[group.dataset.name];
    group.querySelectorAll('.pf-btn').forEach(btn => {
      btn.classList.toggle('active', Array.isArray(value) ? value.includes(btn.dataset.value) : value === btn.dataset.value);
    });
  });
  form.querySelectorAll('#regionChips .pf-chip').forEach(chip => {
    chip.classList.toggle('active', (data.desired_regions || []).includes(chip.dataset.region));
  });
  for (const name of ['field_of_study', 'keywords', 'exclusions_freetext']) {
    form.querySelector(`[name="${name}"]`).value = data[name] || '';
  }
  for (const [name, fallback, label] of [['workload_min', 50, 'pensumMinVal'], ['workload_max', 100, 'pensumMaxVal']]) {
    form.querySelector(`[name="${name}"]`).value = data[name] ?? fallback;
    document.getElementById(label).textContent = data[name] ?? fallback;
  }
  for (const lang of ['de', 'fr', 'it', 'en']) {
    form.querySelector(`[name="lang_${lang}"]`).value = data.languages?.[lang] || '';
  }
}

/* ======== Submit / Reset / Open / Close ======== */
async function submitProfile(e) {
  e.preventDefault();
  const btn = e.target.querySelector('[type="submit"]');
  if (btn?.disabled) return;
  const uid = currentUser?.id || null;
  if (btn) { btn.disabled = true; btn.textContent = 'Speichern…'; }
  try {
    const result = await saveProfile(collectProfileData());
    if ((currentUser?.id || null) !== uid) return;
    updateProfileButton();
    if (typeof buildMatchingSection === 'function') buildMatchingSection();
    const status = document.getElementById('profileSaveStatus');
    if (status) status.textContent = result.pending
      ? 'Lokal gesichert. Synchronisierung ausstehend; deine Änderungen bleiben erhalten.'
      : result.synced ? 'Profil gespeichert.' : 'Profil lokal gespeichert.';
    if (!result.pending) closeProfile();
  } catch (err) {
    const status = document.getElementById('profileSaveStatus');
    if (status) status.textContent = 'Profil konnte nicht gespeichert werden: ' + err.message;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Profil speichern'; }
  }
}

async function resetProfile() {
  // An explicit empty profile is a real update and must also clear remote fields.
  const uid = currentUser?.id || null;
  const result = await saveProfile({});
  if ((currentUser?.id || null) !== uid) return;
  populateProfile();
  updateProfileButton();
  if (typeof buildMatchingSection === 'function') buildMatchingSection();
  const status = document.getElementById('profileSaveStatus');
  if (status) status.textContent = result.pending ? 'Profil lokal zurückgesetzt. Synchronisierung ausstehend.' : 'Profil zurückgesetzt.';
}

function openProfile() {
  buildProfileModal();
  populateProfile();
  const btn = document.querySelector('#profileForm [type="submit"]');
  if (btn) { btn.disabled = false; btn.textContent = '💾 Profil speichern'; }
  document.getElementById('profileModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeProfile() {
  const modal = document.getElementById('profileModal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
}

function updateProfileButton() {
  const btn = document.getElementById('profileBtn');
  if (!btn) return;
  const filled = isProfileFilled();
  btn.classList.toggle('profile-filled', filled);
  btn.title = filled ? 'Profil bearbeiten' : 'Profil erstellen';
}

/* ======== Document Upload (CV + Arbeitszeugnisse) ======== */
const LS_DOCS = 'userDocuments';

function getDocuments() {
  return isLoggedIn() ? readStoredJSON(LS_DOCS, []) : [];
}
function saveDocuments(docs) {
  localStorage.setItem(LS_DOCS, JSON.stringify(docs));
  if (typeof rememberAccountData === 'function') rememberAccountData();
}

function initCvUpload() {
  const dropzone = document.getElementById('cvDropzone');
  const fileInput = document.getElementById('cvFileInput');
  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('pf-cv-dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('pf-cv-dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('pf-cv-dragover');
    if (e.dataTransfer.files[0]) handleDocUpload(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleDocUpload(fileInput.files[0]);
    fileInput.value = '';
  });

  renderDocList();
}

let _docUploadController = null;
let _documentGeneration = 0;
let _documentBusy = false;

function cancelDocumentUpload() {
  _documentGeneration++;
  _docUploadController?.abort();
  _docUploadController = null;
  _documentBusy = false;
}

async function refreshDocumentList() {
  if (_documentBusy) return;
  try { await syncDocumentsOnLogin(); }
  catch { showCvStatus('error', 'Dokumente konnten nicht geladen werden. Bitte erneut versuchen.'); }
}

function normalizedDocument(row) {
  const metadata = row.extracted_profile || row;
  return { ...metadata, id: row.id, file_name: row.file_name, storage_path: row.storage_path, uploaded_at: row.uploaded_at };
}

async function syncDocumentsOnLogin() {
  if (!currentUser || !supabaseClient) return;
  const uid = currentUser.id;
  const generation = _documentGeneration;
  const { data, error } = await supabaseClient.from('cv_uploads')
    .select('id,file_name,storage_path,extracted_profile,uploaded_at').eq('user_id', uid).order('uploaded_at', { ascending: false });
  if (error) {
    if (currentUser?.id === uid) showCvStatus('error', 'Dokumente konnten nicht geladen werden. Bitte erneut versuchen.');
    throw error;
  }
  if (currentUser?.id !== uid || generation !== _documentGeneration) return;
  const docs = (data || []).map(normalizedDocument);
  docs.sort((a, b) => Number(b.doc_type === 'cv') - Number(a.doc_type === 'cv'));
  saveDocuments(docs);
  renderDocList();
}

async function handleDocUpload(file) {
  if (_documentBusy) { showCvStatus('error', 'Bitte warte, bis der aktuelle Dokumentvorgang abgeschlossen ist.'); return; }
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    showCvStatus('error', 'Nur PDF-Dateien werden akzeptiert.'); return;
  }
  if (!file.size || file.size > 5 * 1024 * 1024) {
    showCvStatus('error', 'Bitte wähle eine PDF-Datei mit maximal 5 MB.'); return;
  }
  if (!isLoggedIn() || !supabaseClient) { showCvStatus('error', 'Bitte melde dich zuerst an.'); return; }
  // Capacity is checked after classification on the server: a CV may replace a CV even at six documents.
  const uid = currentUser.id;
  const generation = ++_documentGeneration;
  const controller = new AbortController();
  _docUploadController = controller;
  _documentBusy = true;
  showCvStatus('loading', `Analysiere «${file.name}»…`);
  try {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!session || session.user.id !== uid) throw new Error('Sitzung abgelaufen.');
    if (currentUser?.id !== uid || generation !== _documentGeneration) return;
    const formData = new FormData();
    formData.append('cv', file);
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/parse-cv`, {
      method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_KEY },
      body: formData, signal: controller.signal
    });
    const result = await resp.json();
    if (!resp.ok) throw new Error(result.error || 'Dokument konnte nicht gespeichert werden.');
    if (!result.id || !['cv', 'zeugnis', 'andere'].includes(result.doc_type)) throw new Error('Unvollständige Antwort. Bitte lade die Dokumentliste neu.');
    if (currentUser?.id !== uid || generation !== _documentGeneration) return;
    const docs = getDocuments().filter(doc => String(doc.id) !== String(result.id) && !(result.doc_type === 'cv' && doc.doc_type === 'cv'));
    const doc = normalizedDocument(result);
    if (doc.doc_type === 'cv') docs.unshift(doc); else docs.push(doc);
    saveDocuments(docs);
    renderDocList();
    showCvStatus('success', `${result.doc_type === 'cv' ? 'CV' : 'Dokument'} «${file.name}» gespeichert.`);
    if (typeof buildMatchingSection === 'function') buildMatchingSection();
  } catch (err) {
    if (currentUser?.id === uid && generation === _documentGeneration) {
      showCvStatus('error', err.name === 'AbortError' ? 'Upload abgebrochen.' : err.message || 'Upload fehlgeschlagen.');
    }
  } finally {
    if (generation === _documentGeneration) { _documentBusy = false; _docUploadController = null; }
  }
}

async function removeDocument(index) {
  if (_documentBusy) { showCvStatus('error', 'Bitte warte, bis der aktuelle Dokumentvorgang abgeschlossen ist.'); return; }
  const doc = getDocuments()[index];
  if (!doc || !currentUser || !supabaseClient) return;
  const uid = currentUser.id;
  const generation = ++_documentGeneration;
  _documentBusy = true;
  try {
    const client = await getAccountClient(uid);
    if (!client || generation !== _documentGeneration) return;
    if (doc.id) {
      const { error } = await client.from('cv_uploads').delete().eq('id', doc.id).eq('user_id', uid);
      if (error) throw error;
    }
    if (currentUser?.id !== uid || generation !== _documentGeneration) return;
    saveDocuments(getDocuments().filter(item => doc.id ? String(item.id) !== String(doc.id) : item !== doc && item.file_name !== doc.file_name));
    renderDocList();
    if (typeof buildMatchingSection === 'function') buildMatchingSection();
    if (doc.storage_path?.startsWith(`cvs/${uid}/`)) {
      const { error } = await client.storage.from('cv-uploads').remove([doc.storage_path]);
      if (error) {
        if (currentUser?.id === uid) showCvStatus('error', 'Aus der Dokumentliste entfernt. Die PDF-Datei konnte noch nicht gelöscht werden.');
        return;
      }
    }
    if (currentUser?.id === uid) showCvStatus('success', 'Dokument entfernt.');
  } catch (err) {
    if (currentUser?.id === uid) showCvStatus('error', 'Dokument konnte nicht entfernt werden: ' + err.message);
  } finally { if (generation === _documentGeneration) _documentBusy = false; }
}

function renderDocList() {
  const el = document.getElementById('docList');
  if (!el) return;
  const docs = getDocuments();
  if (!docs.length) { el.innerHTML = ''; return; }

  el.innerHTML = `<div class="pf-doc-header">📋 Meine Dokumente (${docs.length}):</div>` +
    docs.map((doc, i) => {
      const icon = doc.doc_type === 'cv' ? '📄' : doc.doc_type === 'zeugnis' ? '📜' : '📎';
      const typeLabel = doc.doc_type === 'cv' ? 'CV' : doc.doc_type === 'zeugnis' ? 'Zeugnis' : 'Dokument';
      const meta = doc.doc_type === 'zeugnis' && doc.employer
        ? `${escapeHtml(doc.employer)}${doc.period ? ' · ' + escapeHtml(doc.period) : ''}`
        : '';
      return `
        <div class="pf-doc-item">
          <div class="pf-doc-info">
            <span class="pf-doc-icon">${icon}</span>
            <div class="pf-doc-details">
              <strong>${typeLabel}:</strong> ${escapeHtml(doc.file_name)}
              ${doc.person_name ? `<span class="pf-doc-name"> · ${escapeHtml(doc.person_name)}</span>` : ''}
              ${meta ? `<div class="pf-doc-meta">${meta}</div>` : ''}
              <div class="pf-doc-summary">${escapeHtml(doc.summary || '')}</div>
            </div>
          </div>
          <button type="button" class="pf-doc-remove" onclick="removeDocument(${i})" title="Entfernen">✕</button>
        </div>`;
    }).join('');
}

let _cvStatusVersion = 0;
function showCvStatus(type, msg) {
  const el = document.getElementById('cvStatus');
  if (!el) return;
  const version = ++_cvStatusVersion;
  el.style.display = 'block';
  if (type === 'loading') {
    el.innerHTML = `<div class="pf-cv-loading"><div class="match-spinner" style="width:24px;height:24px;margin:0;"></div> ${escapeHtml(msg)}</div>`;
  } else if (type === 'error') {
    el.innerHTML = `<div class="pf-cv-error">❌ ${escapeHtml(msg)}</div>`;
  } else {
    el.innerHTML = `<div class="pf-cv-success">✅ ${escapeHtml(msg)}</div>`;
    setTimeout(() => { if (_cvStatusVersion === version) el.style.display = 'none'; }, 4000);
  }
}

/* ======== Init ======== */
updateProfileButton();
if (currentUser && _appReady) syncDocumentsOnLogin().catch(() => {});

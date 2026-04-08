/* ========================================
   PROFILE — Questionnaire & localStorage
   ======================================== */

const LS_PROFILE = 'userProfile';
const CANTONS = [
  'AG','AI','AR','BE','BL','BS','FR','GE','GL','GR','JU','LU',
  'NE','NW','OW','SG','SH','SO','SZ','TG','TI','UR','VD','VS','ZG','ZH'
];

function getProfile() {
  return JSON.parse(localStorage.getItem(LS_PROFILE) || '{}');
}

function saveProfile(data) {
  const enriched = { ...data, updated_at: new Date().toISOString() };
  localStorage.setItem(LS_PROFILE, JSON.stringify(enriched));
  if (typeof syncProfileToSupabase === 'function' && isLoggedIn()) {
    syncProfileToSupabase(enriched);
  }
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

        <!-- CV Upload -->
        <fieldset class="pf-field">
          <legend>📄 CV hochladen</legend>
          ${isLoggedIn() ? `
          <div class="pf-cv-dropzone" id="cvDropzone">
            <div class="pf-cv-icon">📄</div>
            <p class="pf-cv-text">PDF hier hinziehen oder <strong>klicken</strong></p>
            <p class="pf-cv-sub">Max. 5 MB · Claude füllt die Felder automatisch aus</p>
            <input type="file" id="cvFileInput" accept=".pdf,application/pdf" style="display:none">
          </div>
          <div class="pf-cv-status" id="cvStatus" style="display:none;"></div>
          <div class="pf-cv-review" id="cvReview" style="display:none;"></div>
          ` : `
          <div class="pf-cv-placeholder">
            <p><a onclick="openAuthModal()" style="color:var(--accent);cursor:pointer;font-weight:600;">Anmelden</a> um dein CV hochzuladen.</p>
            <p>Claude analysiert dein CV und füllt die Felder automatisch aus.</p>
          </div>`}
        </fieldset>

        <!-- Actions -->
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
  document.querySelectorAll('.pf-btn-group:not(.pf-multi)').forEach(group => {
    group.querySelectorAll('.pf-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const wasActive = btn.classList.contains('active');
        group.querySelectorAll('.pf-btn').forEach(b => b.classList.remove('active'));
        if (!wasActive) btn.classList.add('active');
      });
    });
  });

  // Multi-select button groups (exclusions)
  document.querySelectorAll('.pf-btn-group.pf-multi').forEach(group => {
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
  document.querySelectorAll('.pf-btn-group:not(.pf-multi)').forEach(group => {
    const name = group.dataset.name;
    const active = group.querySelector('.pf-btn.active');
    data[name] = active ? active.dataset.value : '';
  });

  // Multi-select groups
  document.querySelectorAll('.pf-btn-group.pf-multi').forEach(group => {
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
  if (!data || !data.updated_at) return;

  const form = document.getElementById('profileForm');
  if (!form) return;

  // Single-select groups
  ['education', 'experience', 'start_date'].forEach(name => {
    if (data[name]) {
      const group = document.querySelector(`.pf-btn-group[data-name="${name}"]`);
      if (group) {
        group.querySelectorAll('.pf-btn').forEach(b => b.classList.remove('active'));
        const btn = group.querySelector(`[data-value="${data[name]}"]`);
        if (btn) btn.classList.add('active');
      }
    }
  });

  // Multi-select (exclusions)
  if (data.exclusions && data.exclusions.length) {
    const group = document.querySelector('.pf-btn-group[data-name="exclusions"]');
    if (group) {
      data.exclusions.forEach(val => {
        const btn = group.querySelector(`[data-value="${val}"]`);
        if (btn) btn.classList.add('active');
      });
    }
  }

  // Regions
  if (data.desired_regions && data.desired_regions.length) {
    data.desired_regions.forEach(r => {
      const chip = document.querySelector(`#regionChips .pf-chip[data-region="${r}"]`);
      if (chip) chip.classList.add('active');
    });
  }

  // Text inputs
  if (data.field_of_study) form.querySelector('[name="field_of_study"]').value = data.field_of_study;
  if (data.keywords) form.querySelector('[name="keywords"]').value = data.keywords;
  if (data.exclusions_freetext) form.querySelector('[name="exclusions_freetext"]').value = data.exclusions_freetext;

  // Pensum
  if (data.workload_min) {
    form.querySelector('[name="workload_min"]').value = data.workload_min;
    document.getElementById('pensumMinVal').textContent = data.workload_min;
  }
  if (data.workload_max) {
    form.querySelector('[name="workload_max"]').value = data.workload_max;
    document.getElementById('pensumMaxVal').textContent = data.workload_max;
  }

  // Languages
  if (data.languages) {
    Object.entries(data.languages).forEach(([lang, val]) => {
      const sel = form.querySelector(`[name="lang_${lang}"]`);
      if (sel) sel.value = val;
    });
  }
}

/* ======== Submit / Reset / Open / Close ======== */
function submitProfile(e) {
  e.preventDefault();
  const data = collectProfileData();
  saveProfile(data);
  updateProfileButton();
  closeProfile();
}

function resetProfile() {
  localStorage.removeItem(LS_PROFILE);
  const form = document.getElementById('profileForm');
  if (form) form.reset();
  document.querySelectorAll('.pf-btn.active, .pf-chip.active').forEach(el => el.classList.remove('active'));
  document.getElementById('pensumMinVal').textContent = '50';
  document.getElementById('pensumMaxVal').textContent = '100';
  updateProfileButton();
}

function openProfile() {
  buildProfileModal();
  populateProfile();
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

/* ======== CV Upload ======== */
function initCvUpload() {
  const dropzone = document.getElementById('cvDropzone');
  const fileInput = document.getElementById('cvFileInput');
  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('pf-cv-dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('pf-cv-dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('pf-cv-dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleCvFile(file);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleCvFile(fileInput.files[0]);
  });
}

async function handleCvFile(file) {
  if (file.type !== 'application/pdf') {
    showCvStatus('error', 'Nur PDF-Dateien werden akzeptiert.');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showCvStatus('error', 'Datei zu gross. Maximal 5 MB.');
    return;
  }
  if (!isLoggedIn()) {
    showCvStatus('error', 'Bitte melde dich zuerst an.');
    return;
  }

  showCvStatus('loading', `Analysiere "${file.name}"...`);

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { showCvStatus('error', 'Sitzung abgelaufen. Bitte neu anmelden.'); return; }

    const formData = new FormData();
    formData.append('cv', file);

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/parse-cv`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_KEY
      },
      body: formData
    });

    const result = await resp.json();

    if (!resp.ok) {
      showCvStatus('error', result.error || 'Fehler beim Verarbeiten.');
      return;
    }

    if (result.extracted) {
      showCvReview(result.extracted, file.name);
    } else {
      showCvStatus('error', 'CV konnte nicht analysiert werden.');
    }
  } catch (err) {
    showCvStatus('error', 'Netzwerkfehler: ' + err.message);
  }
}

function showCvStatus(type, msg) {
  const el = document.getElementById('cvStatus');
  const review = document.getElementById('cvReview');
  if (!el) return;
  if (review) review.style.display = 'none';
  el.style.display = 'block';

  if (type === 'loading') {
    el.innerHTML = `<div class="pf-cv-loading"><div class="match-spinner" style="width:24px;height:24px;margin:0;"></div> ${escapeHtml(msg)}</div>`;
  } else if (type === 'error') {
    el.innerHTML = `<div class="pf-cv-error">❌ ${escapeHtml(msg)}</div>`;
  } else {
    el.innerHTML = `<div class="pf-cv-success">✅ ${escapeHtml(msg)}</div>`;
  }
}

function showCvReview(extracted, fileName) {
  const el = document.getElementById('cvReview');
  const status = document.getElementById('cvStatus');
  if (!el) return;
  if (status) status.style.display = 'none';
  el.style.display = 'block';

  const fields = [];
  if (extracted.education) fields.push(`<div class="pf-cv-field"><strong>🎓 Ausbildung:</strong> ${escapeHtml(extracted.education)}</div>`);
  if (extracted.field_of_study) fields.push(`<div class="pf-cv-field"><strong>📚 Fachrichtung:</strong> ${escapeHtml(extracted.field_of_study)}</div>`);
  if (extracted.experience) fields.push(`<div class="pf-cv-field"><strong>💼 Erfahrung:</strong> ${escapeHtml(extracted.experience)} Jahre</div>`);
  if (extracted.keywords) fields.push(`<div class="pf-cv-field"><strong>🔍 Skills:</strong> ${escapeHtml(extracted.keywords)}</div>`);
  if (extracted.languages) {
    const langs = Object.entries(extracted.languages)
      .filter(([,v]) => v)
      .map(([k,v]) => `${k.toUpperCase()}: ${v}`)
      .join(', ');
    if (langs) fields.push(`<div class="pf-cv-field"><strong>🌐 Sprachen:</strong> ${escapeHtml(langs)}</div>`);
  }
  if (extracted.summary) fields.push(`<div class="pf-cv-summary">${escapeHtml(extracted.summary)}</div>`);

  el.innerHTML = `
    <div class="pf-cv-review-box">
      <p class="pf-cv-review-title">✅ Claude hat folgende Daten aus "${escapeHtml(fileName)}" extrahiert:</p>
      ${fields.join('')}
      <div class="pf-cv-review-actions">
        <button type="button" class="pf-btn-primary" onclick="applyCvData(${escapeHtml(JSON.stringify(JSON.stringify(extracted)))})">✓ Übernehmen</button>
        <button type="button" class="pf-btn-secondary" onclick="dismissCvReview()">Verwerfen</button>
      </div>
    </div>`;
}

function applyCvData(jsonStr) {
  const data = JSON.parse(jsonStr);
  const form = document.getElementById('profileForm');
  if (!form) return;

  // Education
  if (data.education) {
    const group = document.querySelector('.pf-btn-group[data-name="education"]');
    if (group) {
      group.querySelectorAll('.pf-btn').forEach(b => b.classList.remove('active'));
      const btn = group.querySelector(`[data-value="${data.education}"]`);
      if (btn) btn.classList.add('active');
    }
  }

  // Experience
  if (data.experience) {
    const group = document.querySelector('.pf-btn-group[data-name="experience"]');
    if (group) {
      group.querySelectorAll('.pf-btn').forEach(b => b.classList.remove('active'));
      const btn = group.querySelector(`[data-value="${data.experience}"]`);
      if (btn) btn.classList.add('active');
    }
  }

  // Field of study
  if (data.field_of_study) {
    const input = form.querySelector('[name="field_of_study"]');
    if (input) input.value = data.field_of_study;
  }

  // Keywords
  if (data.keywords) {
    const input = form.querySelector('[name="keywords"]');
    if (input) input.value = data.keywords;
  }

  // Languages
  if (data.languages) {
    Object.entries(data.languages).forEach(([lang, val]) => {
      if (val) {
        const sel = form.querySelector(`[name="lang_${lang}"]`);
        if (sel) sel.value = val;
      }
    });
  }

  showCvStatus('success', 'Profil-Felder wurden ausgefüllt. Bitte prüfen und speichern.');
  const review = document.getElementById('cvReview');
  if (review) review.style.display = 'none';
}

function dismissCvReview() {
  const review = document.getElementById('cvReview');
  if (review) review.style.display = 'none';
}

/* ======== Init ======== */
updateProfileButton();

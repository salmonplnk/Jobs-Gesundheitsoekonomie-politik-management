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
              oninput="document.getElementById('pensumMinVal').textContent=this.value">
          </div>
          <div class="pf-range-row">
            <label>Max: <strong id="pensumMaxVal">100</strong>%</label>
            <input type="range" class="pf-range" name="workload_max" min="10" max="100" step="10" value="100"
              oninput="document.getElementById('pensumMaxVal').textContent=this.value">
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

        <!-- CV Upload (placeholder – needs Supabase Storage later) -->
        <fieldset class="pf-field">
          <legend>📄 CV hochladen (kommt bald)</legend>
          <div class="pf-cv-placeholder">
            <p>CV-Upload wird mit der Supabase-Integration freigeschaltet.</p>
            <p>Claude analysiert dein CV und füllt die Felder automatisch aus.</p>
          </div>
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

/* ======== Init ======== */
updateProfileButton();

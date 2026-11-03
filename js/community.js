/* ========================================
   COMMUNITY — Org & Category Suggestions
   ======================================== */

const CATEGORY_OPTIONS = [
  { key: 'bund', label: 'Bund / bundesnahe Institutionen' },
  { key: 'kantone', label: 'Kantonale Verwaltungen' },
  { key: 'versicherungen', label: 'Versicherungen' },
  { key: 'branchen', label: 'Branchen- / Tariforganisationen' },
  { key: 'spitaeler', label: 'Leistungserbringer (Spitäler / Kliniken)' },
  { key: 'beratung', label: 'Beratung / Forschung' },
  { key: 'stiftungen', label: 'Stiftungen / Non-Profits' },
  { key: 'pharma', label: 'Pharma / Medtech (Market Access)' }
];

const CANTON_OPTIONS = [
  'AG','AI','AR','BE','BL','BS','FR','GE','GL','GR','JU','LU',
  'NE','NW','OW','SG','SH','SO','SZ','TG','TI','UR','VD','VS','ZG','ZH'
];

/* ======== Org Suggestion Modal ======== */
function buildOrgModal() {
  if (document.getElementById('orgModal')) return;
  const modal = document.createElement('div');
  modal.id = 'orgModal';
  modal.className = 'auth-modal';
  modal.innerHTML = `
    <div class="auth-backdrop" onclick="closeOrgModal()"></div>
    <div class="profile-panel community-panel" role="dialog" aria-modal="true" aria-labelledby="orgModalTitle">
      <div class="profile-header">
        <h2 id="orgModalTitle">Unternehmen vorschlagen</h2>
        <p>Schlage eine Organisation vor, die auf der Plattform fehlt. Dein Vorschlag wird nach Prüfung freigeschaltet.</p>
        <button class="profile-close" onclick="closeOrgModal()" aria-label="Schliessen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
      <form id="orgForm" class="profile-form" onsubmit="submitOrg(event)">
        <fieldset class="pf-field">
          <legend>Name *</legend>
          <input type="text" class="pf-input" name="org_name" required placeholder="z.B. Universitätsspital Lausanne">
        </fieldset>
        <fieldset class="pf-field">
          <legend>Karriereseite URL *</legend>
          <input type="url" class="pf-input" name="org_url" required placeholder="https://www.beispiel.ch/jobs">
        </fieldset>
        <fieldset class="pf-field">
          <legend>Beschreibung</legend>
          <input type="text" class="pf-input" name="org_desc" placeholder="Kurze Beschreibung der Organisation...">
        </fieldset>
        <fieldset class="pf-field">
          <legend>Kategorie *</legend>
          <select class="pf-select" name="org_category" required>
            <option value="">Bitte wählen...</option>
            ${CATEGORY_OPTIONS.map(c => `<option value="${c.key}">${c.label}</option>`).join('')}
          </select>
        </fieldset>
        <div class="pf-two">
          <fieldset class="pf-field">
            <legend>Kanton</legend>
            <select class="pf-select" name="org_canton">
              <option value="">Optional...</option>
              ${CANTON_OPTIONS.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </fieldset>
          <fieldset class="pf-field">
            <legend>Stadt</legend>
            <input type="text" class="pf-input" name="org_city" placeholder="z.B. Lausanne">
          </fieldset>
        </div>
        <fieldset class="pf-field">
          <legend>Typ</legend>
          <div class="pf-btn-group" data-name="org_type">
            <button type="button" class="pf-btn" data-value="oeffentlich">Öffentlich</button>
            <button type="button" class="pf-btn" data-value="privat">Privat</button>
            <button type="button" class="pf-btn" data-value="non-profit">Non-Profit</button>
            <button type="button" class="pf-btn" data-value="startup">Startup</button>
          </div>
        </fieldset>
        <div class="auth-error" id="orgError"></div>
        <div class="auth-success" id="orgSuccess"></div>
        <div class="pf-actions">
          <button type="button" class="pf-btn-secondary" onclick="closeOrgModal()">Abbrechen</button>
          <button type="submit" class="pf-btn-primary" id="orgSubmitBtn">Vorschlag senden</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(modal);

  // Bind type buttons
  modal.querySelectorAll('.pf-btn-group .pf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.parentElement.querySelectorAll('.pf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.toggle('active');
    });
  });
}

function openOrgModal() {
  if (!isLoggedIn()) { openAuthModal(); return; }
  buildOrgModal();
  document.getElementById('orgModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeOrgModal() {
  const modal = document.getElementById('orgModal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
}

async function submitOrg(e) {
  e.preventDefault();
  const form = document.getElementById('orgForm');
  const btn = document.getElementById('orgSubmitBtn');
  const errEl = document.getElementById('orgError');
  const succEl = document.getElementById('orgSuccess');
  errEl.textContent = '';
  succEl.textContent = '';

  const name = form.querySelector('[name="org_name"]').value.trim();
  const url = form.querySelector('[name="org_url"]').value.trim();
  const description = form.querySelector('[name="org_desc"]').value.trim();
  const category = form.querySelector('[name="org_category"]').value;
  const canton = form.querySelector('[name="org_canton"]').value;
  const city = form.querySelector('[name="org_city"]').value.trim();
  const typeBtn = form.querySelector('.pf-btn-group .pf-btn.active');
  const org_type = typeBtn ? typeBtn.dataset.value : null;

  if (!name || !url || !category) {
    errEl.textContent = 'Bitte fülle alle Pflichtfelder aus.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Senden...';

  try {
    const { error } = await supabaseClient.from('community_orgs').insert({
      submitted_by: currentUser.id,
      name, url, description, category, canton, city, org_type
    });

    if (error) throw error;

    succEl.textContent = 'Danke! Dein Vorschlag wird geprüft und bald freigeschaltet.';
    form.reset();
    form.querySelectorAll('.pf-btn.active').forEach(b => b.classList.remove('active'));
    setTimeout(() => closeOrgModal(), 2500);
  } catch (err) {
    errEl.textContent = 'Fehler: ' + (err.message || 'Bitte versuche es erneut.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Vorschlag senden';
  }
}

/* ======== Category Suggestion Modal ======== */
function buildCatModal() {
  if (document.getElementById('catModal')) return;
  const modal = document.createElement('div');
  modal.id = 'catModal';
  modal.className = 'auth-modal';
  modal.innerHTML = `
    <div class="auth-backdrop" onclick="closeCatModal()"></div>
    <div class="auth-panel" role="dialog" aria-modal="true" aria-labelledby="catModalTitle">
      <button class="profile-close" onclick="closeCatModal()" aria-label="Schliessen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      <h2 id="catModalTitle">Kategorie vorschlagen</h2>
      <p class="auth-lead">
        Schlage eine neue Kategorie vor, die nach Prüfung im Community-Bereich erscheint.
      </p>
      <form id="catForm" onsubmit="submitCategory(event)">
        <input type="text" class="pf-input" name="cat_name" required placeholder="Kategorie-Name *">
        <input type="text" class="pf-input pf-mt" name="cat_desc" placeholder="Kurze Beschreibung (optional)">
        <div class="auth-error" id="catError"></div>
        <div class="auth-success" id="catSuccess"></div>
        <button type="submit" class="pf-btn-primary" id="catSubmitBtn">
          Vorschlag senden
        </button>
      </form>
    </div>`;
  document.body.appendChild(modal);
}

function openCatModal() {
  if (!isLoggedIn()) { openAuthModal(); return; }
  buildCatModal();
  document.getElementById('catModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCatModal() {
  const modal = document.getElementById('catModal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
}

async function submitCategory(e) {
  e.preventDefault();
  const form = document.getElementById('catForm');
  const btn = document.getElementById('catSubmitBtn');
  const errEl = document.getElementById('catError');
  const succEl = document.getElementById('catSuccess');
  errEl.textContent = '';
  succEl.textContent = '';

  const name = form.querySelector('[name="cat_name"]').value.trim();
  const description = form.querySelector('[name="cat_desc"]').value.trim();

  if (!name) { errEl.textContent = 'Bitte gib einen Namen ein.'; return; }

  const slug = name.toLowerCase().replace(/[^a-z0-9äöü]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  btn.disabled = true;
  btn.textContent = 'Senden...';

  try {
    const { error } = await supabaseClient.from('community_categories').insert({
      user_id: currentUser.id,
      name, slug, description
    });

    if (error) {
      if (error.message.includes('unique') || error.message.includes('duplicate')) {
        throw new Error('Eine Kategorie mit diesem Namen existiert bereits.');
      }
      throw error;
    }

    succEl.textContent = 'Danke! Dein Vorschlag wird geprüft.';
    form.reset();
    setTimeout(() => closeCatModal(), 2500);
  } catch (err) {
    errEl.textContent = err.message || 'Fehler beim Senden.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Vorschlag senden';
  }
}

/* ======== Community Section (approved orgs + suggestions) ======== */
async function loadCommunityOrgs() {
  const container = document.getElementById('communitySection');
  if (!container) return;

  if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
  try {
    const { data: orgs } = await supabaseClient
      .from('community_orgs')
      .select('*')
      .eq('approved', true)
      .order('created_at', { ascending: false });

    if (!orgs || orgs.length === 0) {
      container.innerHTML = '';
      return;
    }

    const rows = orgs.map(o => {
      const place = [o.city, o.canton].filter(Boolean).join(', ');
      return `
      <li class="org-row org-row-community" data-id="community-${escapeHtml(String(o.id))}">
        <span class="org-avatar" aria-hidden="true">${escapeHtml(orgInitials(o.name))}</span>
        <span class="org-main">
          <span class="org-name">${escapeHtml(o.name)}</span>
          <span class="org-meta">${place ? escapeHtml(place) + ' · ' : ''}Community-Vorschlag</span>
        </span>
        <span class="org-jobs is-loading" aria-hidden="true">–</span>
        ${o.url ? `<a class="org-career" href="${escapeHtml(o.url)}" target="_blank" rel="noopener">Karriereseite <span aria-hidden="true">↗</span></a>` : '<span class="org-career is-none">Kein Portal</span>'}
        <span class="org-star-placeholder" aria-hidden="true"></span>
      </li>`;
    }).join('');

    container.innerHTML = `
      <details class="dir-group dir-group-community">
        <summary><span class="dir-group-title">Community-Vorschläge</span><span class="dir-group-count">${orgs.length}</span></summary>
        <p class="dir-group-note">Geprüfte Vorschläge aus der Community. Sie sind noch nicht im Stellenabruf; die Filter oben gelten für sie nicht.</p>
        <ul class="dir-list" role="list">${rows}</ul>
      </details>`;
  } catch (err) {
    console.warn('Failed to load community orgs:', err.message);
  }
}

/* ======== Init ======== */
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (document.getElementById('orgModal')?.classList.contains('open')) closeOrgModal();
  if (document.getElementById('catModal')?.classList.contains('open')) closeCatModal();
});
loadCommunityOrgs();


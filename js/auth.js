/* ========================================
   AUTH — Supabase Client, Auth UI, Sync
   ======================================== */

const SUPABASE_URL = 'https://scqjkzodzsgkiqfevzzt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dKmLBiJZAxosz7sXIr0ueQ_CZ7u1M8O';
const supabaseClient = typeof supabase !== 'undefined' ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

let currentUser = null;
let _appReady = false;
let _authRevision = 0;
let _localOwner = localStorage.getItem('healthjobs:active-owner') || 'guest';
const _accountKeys = ['favOrgs', 'userProfile', 'userDocuments'];
const _saveQueues = new Map();
const _pendingKinds = ['favorites', 'profile'];
const _readFailures = new Set();

function accountKey(owner, key) { return `healthjobs:account:${owner}:${key}`; }
function pendingKey(uid, kind) { return `healthjobs:pending:${uid}:${kind}`; }
function readStoredJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
  catch { return fallback; }
}
function rememberAccountData() {
  for (const key of _accountKeys) {
    const value = localStorage.getItem(key);
    if (value !== null) localStorage.setItem(accountKey(_localOwner, key), value);
  }
}
function switchLocalAccount(uid) {
  const next = uid || 'guest';
  if (_localOwner === next) return;
  rememberAccountData();
  _localOwner = next;
  _readFailures.clear();
  localStorage.setItem('healthjobs:active-owner', next);
  for (const key of _accountKeys) {
    const value = localStorage.getItem(accountKey(next, key));
    if (value !== null && (key !== 'userDocuments' || uid)) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  }
  localStorage.removeItem('lastMatchResults');
  window._lastMatches = null;
  if (typeof cancelMatching === 'function') cancelMatching();
  if (typeof cancelDocumentUpload === 'function') cancelDocumentUpload();
  if (typeof closeProfile === 'function') closeProfile();
  document.getElementById('profileModal')?.remove();
}
function announceAuth() {
  window.dispatchEvent(new CustomEvent('healthjobs:auth', { detail: { userId: currentUser?.id || null } }));
}
function reportSyncStatus(message) {
  const status = document.getElementById('syncStatus');
  if (status) status.textContent = message;
}
function reportPendingSync() {
  const pending = currentUser && _pendingKinds.some(kind => localStorage.getItem(pendingKey(currentUser.id, kind)));
  reportSyncStatus(pending ? 'Änderungen lokal gesichert · Kontosynchronisierung ausstehend. Bei Verbindung erneut versuchen.' :
    _readFailures.size ? 'Kontodaten konnten teilweise nicht geladen werden. Lokale Änderungen bleiben erhalten.' : currentUser ? 'Favoriten & Profil mit deinem Konto synchronisiert' : 'Favoriten werden lokal im Browser gespeichert');
}

// Preserve anonymous favorites, but never expose unowned legacy CVs after logout.
if (_localOwner === 'guest') localStorage.removeItem('userDocuments');

function isLoggedIn() { return !!currentUser; }

/* ======== Error Messages (German) ======== */
const AUTH_ERRORS = {
  'Invalid login credentials': 'E-Mail oder Passwort falsch.',
  'User already registered': 'Diese E-Mail ist bereits registriert.',
  'Password should be at least 6 characters': 'Passwort muss mindestens 6 Zeichen lang sein.',
  'Email not confirmed': 'Bitte bestätige zuerst deine E-Mail-Adresse.',
  'Signup requires a valid password': 'Bitte gib ein gültiges Passwort ein.',
  'Unable to validate email address: invalid format': 'Ungültiges E-Mail-Format.',
  'Network request failed': 'Netzwerkfehler – bitte prüfe deine Internetverbindung.',
  'Failed to fetch': 'Netzwerkfehler – bitte prüfe deine Internetverbindung.',
  'Request timeout': 'Zeitüberschreitung – bitte versuche es erneut.',
  'Invalid auth token': 'Sitzung abgelaufen – bitte erneut anmelden.',
  'Session has expired': 'Sitzung abgelaufen – bitte erneut anmelden.',
  'Auth session missing!': 'Bitte melde dich erneut an.',
  'Email rate limit exceeded': 'Zu viele Versuche – bitte warte einen Moment.',
};
function translateError(msg) { return AUTH_ERRORS[msg] || msg; }

/* ========================================
   AUTH STATE
   ======================================== */
if (supabaseClient) supabaseClient.auth.onAuthStateChange((event, session) => {
  const nextUser = session?.user || null;
  const changed = (currentUser?.id || null) !== (nextUser?.id || null);
  currentUser = nextUser;
  if (changed || event === 'INITIAL_SESSION' || event === 'SIGNED_OUT') {
    _authRevision++;
    switchLocalAccount(currentUser?.id);
    updateAuthUI();
    announceAuth();
    if (_appReady) {
      // Supabase auth callbacks must not await other auth/client operations.
      setTimeout(() => refreshAccountData(), 0);
    }
  }
});

async function refreshAccountData() {
  if (typeof renderAll === 'function') renderAll();
  if (typeof updateProfileButton === 'function') updateProfileButton();
  if (typeof buildMatchingSection === 'function') buildMatchingSection();
  if (!currentUser) return;
  const revision = _authRevision;
  const results = await Promise.allSettled([
    syncFavoritesOnLogin(), syncProfileOnLogin(),
    typeof syncDocumentsOnLogin === 'function' ? syncDocumentsOnLogin() : Promise.resolve()
  ]);
  if (revision !== _authRevision) return;
  if (results[2]?.status === 'rejected') _readFailures.add('documents'); else _readFailures.delete('documents');
  if (typeof buildMatchingSection === 'function') buildMatchingSection();
  reportPendingSync();
}

// Called by map.js after init is complete.
function onAppReady() {
  _appReady = true;
  if (!supabaseClient) switchLocalAccount(null);
  announceAuth();
  refreshAccountData();
}
window.addEventListener('online', () => { if (_appReady) refreshAccountData(); });

/* ========================================
   HEADER UI
   ======================================== */
function updateAuthUI() {
  const area = document.getElementById('authArea');
  if (!area) return;

  if (currentUser) {
    const email = (currentUser.email || '').replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]));
    const short = email.length > 20 ? email.substring(0, 18) + '…' : email;
    area.innerHTML = `
      <span class="auth-email" title="${email}">${short}</span>
      <button class="auth-btn auth-logout" onclick="handleLogout()">Abmelden</button>`;
    // Update footer
    const sync = document.getElementById('syncStatus');
    if (sync) sync.textContent = 'Favoriten & Profil werden mit deinem Konto synchronisiert';
  } else {
    area.innerHTML = `<button class="auth-btn" onclick="openAuthModal()">Anmelden</button>`;
    const sync = document.getElementById('syncStatus');
    if (sync) sync.textContent = 'Favoriten werden lokal im Browser gespeichert';
  }
}

/* ========================================
   AUTH MODAL
   ======================================== */
let authMode = 'login'; // 'login' | 'register'

function buildAuthModal() {
  if (document.getElementById('authModal')) return;
  const modal = document.createElement('div');
  modal.id = 'authModal';
  modal.className = 'auth-modal';
  modal.innerHTML = `
    <div class="auth-backdrop" onclick="closeAuthModal()"></div>
    <div class="auth-panel">
      <button class="profile-close" onclick="closeAuthModal()" aria-label="Schliessen">✕</button>
      <h2 id="authTitle">🔐 Anmelden</h2>
      <form id="authForm" onsubmit="handleAuthSubmit(event)">
        <input type="email" class="pf-input" id="authEmail" placeholder="E-Mail-Adresse" required>
        <input type="password" class="pf-input pf-mt" id="authPassword" placeholder="Passwort" required minlength="6">
        <input type="password" class="pf-input pf-mt" id="authPasswordConfirm" placeholder="Passwort bestätigen"
          style="display:none">
        <div class="auth-error" id="authError"></div>
        <div class="auth-success" id="authSuccess"></div>
        <button type="submit" class="pf-btn-primary auth-submit" id="authSubmitBtn" style="width:100%;margin-top:.8rem;">
          Anmelden
        </button>
      </form>
      <div class="auth-forgot" id="authForgot">
        <a onclick="handleForgotPassword()">Passwort vergessen?</a>
      </div>
      <div class="auth-divider"><span>oder</span></div>
      <button class="auth-google-btn" onclick="handleGoogleLogin()">
        <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Mit Google anmelden
      </button>
      <div class="auth-toggle" id="authToggle">
        Noch kein Konto? <a onclick="toggleAuthMode()">Registrieren</a>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function openAuthModal() {
  buildAuthModal();
  authMode = 'login';
  updateAuthModalMode();
  clearAuthMessages();
  if (!supabaseClient) showAuthError('Anmeldung konnte nicht geladen werden. Bitte prüfe die Verbindung und lade die Seite neu.');
  document.getElementById('authModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('authEmail').focus();
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
}

function toggleAuthMode() {
  authMode = authMode === 'login' ? 'register' : 'login';
  updateAuthModalMode();
  clearAuthMessages();
}

function updateAuthModalMode() {
  const title = document.getElementById('authTitle');
  const btn = document.getElementById('authSubmitBtn');
  const confirm = document.getElementById('authPasswordConfirm');
  const toggle = document.getElementById('authToggle');
  const forgot = document.getElementById('authForgot');

  if (authMode === 'register') {
    title.textContent = '📝 Registrieren';
    btn.textContent = 'Konto erstellen';
    confirm.style.display = '';
    confirm.required = true;
    toggle.innerHTML = 'Bereits ein Konto? <a onclick="toggleAuthMode()">Anmelden</a>';
    forgot.style.display = 'none';
  } else {
    title.textContent = '🔐 Anmelden';
    btn.textContent = 'Anmelden';
    confirm.style.display = 'none';
    confirm.required = false;
    toggle.innerHTML = 'Noch kein Konto? <a onclick="toggleAuthMode()">Registrieren</a>';
    forgot.style.display = '';
  }
}

function clearAuthMessages() {
  document.getElementById('authError').textContent = '';
  document.getElementById('authSuccess').textContent = '';
}

function showAuthError(msg) {
  document.getElementById('authError').textContent = translateError(msg);
  document.getElementById('authSuccess').textContent = '';
}

function showAuthSuccess(msg) {
  document.getElementById('authSuccess').textContent = msg;
  document.getElementById('authError').textContent = '';
}

function setAuthLoading(loading) {
  const btn = document.getElementById('authSubmitBtn');
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.dataset.originalText = btn.textContent;
    btn.textContent = 'Laden…';
  } else {
    btn.textContent = btn.dataset.originalText || 'Anmelden';
  }
}

/* ======== Auth Handlers ======== */
async function handleAuthSubmit(e) {
  e.preventDefault();
  clearAuthMessages();
  if (!supabaseClient) { showAuthError('Anmeldung nicht verfügbar. Bitte lade die Seite neu.'); return; }
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  if (authMode === 'register' && password !== document.getElementById('authPasswordConfirm').value) {
    showAuthError('Passwörter stimmen nicht überein.'); return;
  }
  setAuthLoading(true);
  try {
    const result = authMode === 'register'
      ? await supabaseClient.auth.signUp({ email, password })
      : await supabaseClient.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    if (authMode === 'register' && !result.data?.session) {
      showAuthSuccess('Bitte bestätige deine E-Mail-Adresse über den Link im Postfach.');
    } else closeAuthModal();
  } catch (err) { showAuthError(err.message || 'Anmeldung fehlgeschlagen.'); }
  finally { setAuthLoading(false); }
}

async function handleGoogleLogin() {
  if (!supabaseClient) { showAuthError('Anmeldung nicht verfügbar. Bitte lade die Seite neu.'); return; }
  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname }
    });
    if (error) throw error;
  } catch (err) { showAuthError(err.message || 'Anmeldung fehlgeschlagen.'); }
}

async function handleLogout() {
  if (!supabaseClient) return;
  rememberAccountData();
  if (typeof cancelMatching === 'function') cancelMatching();
  if (typeof cancelDocumentUpload === 'function') cancelDocumentUpload();
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
  } catch (err) { reportSyncStatus('Abmelden fehlgeschlagen: ' + translateError(err.message)); }
}

async function handleForgotPassword() {
  const email = document.getElementById('authEmail').value.trim();
  if (!email) { showAuthError('Bitte gib deine E-Mail-Adresse ein.'); return; }
  if (!supabaseClient) { showAuthError('Anmeldung nicht verfügbar. Bitte lade die Seite neu.'); return; }
  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
    if (error) throw error;
    showAuthSuccess('Passwort-Reset E-Mail gesendet! Prüfe dein Postfach.');
  } catch (err) { showAuthError(err.message || 'Passwort-Reset fehlgeschlagen.'); }
}

/* ========================================
   FAVORITES SYNC
   ======================================== */
async function getAccountClient(uid) {
  if (!supabaseClient || currentUser?.id !== uid) return null;
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  if (!data.session || data.session.user.id !== uid || currentUser?.id !== uid) return null;
  return supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

// Per-account writes are serialized. The newest unconfirmed value remains on disk.
function queueAccountWrite(kind, payload) {
  if (!currentUser || !supabaseClient) return Promise.resolve({ synced: false, local: true });
  const uid = currentUser.id;
  const key = pendingKey(uid, kind);
  const serialized = JSON.stringify(payload);
  localStorage.setItem(key, serialized);
  rememberAccountData();
  reportPendingSync();
  const previous = _saveQueues.get(uid) || Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    if (currentUser?.id !== uid) return { synced: false, pending: true };
    try {
      // Fix the authorization header to this account for the entire operation.
      const client = await getAccountClient(uid);
      if (!client) return { synced: false, pending: true };
      const result = kind === 'favorites'
        ? await client.rpc('replace_favorites', { org_ids: payload })
        : await client.from('profiles').upsert({ ...payload, id: uid });
      if (result.error) throw result.error;
      if (localStorage.getItem(key) === serialized) localStorage.removeItem(key);
      if (currentUser?.id === uid) reportPendingSync();
      return { synced: true };
    } catch (err) {
      if (currentUser?.id === uid) reportPendingSync();
      return { synced: false, pending: true, error: err.message || 'Speichern fehlgeschlagen.' };
    }
  });
  _saveQueues.set(uid, task);
  return task;
}

function syncFavoritesToSupabase(favs) {
  return queueAccountWrite('favorites', [...new Set(favs.filter(id => typeof id === 'string'))]);
}

async function syncFavoritesOnLogin() {
  if (!currentUser || !supabaseClient) return;
  const uid = currentUser.id;
  const revision = _authRevision;
  const pending = readStoredJSON(pendingKey(uid, 'favorites'), null);
  if (pending) { await syncFavoritesToSupabase(pending); return; }
  const before = localStorage.getItem('favOrgs');
  try {
    const { data, error } = await supabaseClient.from('favorites').select('org_id').eq('user_id', uid);
    if (error) throw error;
    if (revision !== _authRevision || localStorage.getItem('favOrgs') !== before || localStorage.getItem(pendingKey(uid, 'favorites'))) return;
    localStorage.setItem('favOrgs', JSON.stringify((data || []).map(row => row.org_id)));
    rememberAccountData();
    _readFailures.delete('favorites');
    if (typeof renderAll === 'function') renderAll();
  } catch (err) { if (revision === _authRevision) { _readFailures.add('favorites'); reportPendingSync(); } }
}

/* ========================================
   PROFILE SYNC
   ======================================== */
function profileFields(data) {
  return {
    education: data.education ?? '', field_of_study: data.field_of_study ?? '',
    experience: data.experience ?? '', desired_regions: data.desired_regions ?? [],
    workload_min: data.workload_min ?? 50, workload_max: data.workload_max ?? 100,
    languages: data.languages ?? {}, keywords: data.keywords ?? '',
    exclusions: data.exclusions ?? [], exclusions_freetext: data.exclusions_freetext ?? '',
    start_date: data.start_date ?? '', updated_at: data.updated_at || new Date().toISOString()
  };
}
function syncProfileToSupabase(data) {
  return queueAccountWrite('profile', profileFields(data));
}

async function syncProfileOnLogin() {
  if (!currentUser || !supabaseClient) return;
  const uid = currentUser.id;
  const revision = _authRevision;
  const pending = readStoredJSON(pendingKey(uid, 'profile'), null);
  if (pending) { await syncProfileToSupabase(pending); return; }
  const before = localStorage.getItem('userProfile');
  try {
    const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error) throw error;
    if (revision !== _authRevision || localStorage.getItem('userProfile') !== before || localStorage.getItem(pendingKey(uid, 'profile'))) return;
    if (data) writeRemoteProfileToLocal(data);
    _readFailures.delete('profile');
    if (typeof updateProfileButton === 'function') updateProfileButton();
  } catch (err) { if (revision === _authRevision) { _readFailures.add('profile'); reportPendingSync(); } }
}

function writeRemoteProfileToLocal(data) {
  localStorage.setItem('userProfile', JSON.stringify(profileFields(data)));
  rememberAccountData();
}

/* ======== Init: update header on load ======== */
updateAuthUI();

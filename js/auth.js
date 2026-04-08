/* ========================================
   AUTH — Supabase Client, Auth UI, Sync
   ======================================== */

const SUPABASE_URL = 'https://scqjkzodzsgkiqfevzzt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dKmLBiJZAxosz7sXIr0ueQ_CZ7u1M8O';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let _appReady = false;

function isLoggedIn() { return !!currentUser; }

/* ======== Error Messages (German) ======== */
const AUTH_ERRORS = {
  'Invalid login credentials': 'E-Mail oder Passwort falsch.',
  'User already registered': 'Diese E-Mail ist bereits registriert.',
  'Password should be at least 6 characters': 'Passwort muss mindestens 6 Zeichen lang sein.',
  'Email not confirmed': 'Bitte bestätige zuerst deine E-Mail-Adresse.',
  'Signup requires a valid password': 'Bitte gib ein gültiges Passwort ein.',
  'Unable to validate email address: invalid format': 'Ungültiges E-Mail-Format.',
};
function translateError(msg) { return AUTH_ERRORS[msg] || msg; }

/* ========================================
   AUTH STATE
   ======================================== */
supabaseClient.auth.onAuthStateChange((event, session) => {
  currentUser = session?.user || null;
  updateAuthUI();

  if (event === 'SIGNED_IN' && _appReady) {
    syncFavoritesOnLogin();
    syncProfileOnLogin();
  }
  if (event === 'SIGNED_OUT') {
    if (typeof renderAll === 'function') renderAll();
    if (typeof updateProfileButton === 'function') updateProfileButton();
  }
});

// Called by map.js after init is complete
function onAppReady() {
  _appReady = true;
  if (currentUser) {
    syncFavoritesOnLogin();
    syncProfileOnLogin();
  }
}

/* ========================================
   HEADER UI
   ======================================== */
function updateAuthUI() {
  const area = document.getElementById('authArea');
  if (!area) return;

  if (currentUser) {
    const email = currentUser.email || '';
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
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;

  if (authMode === 'register') {
    const confirm = document.getElementById('authPasswordConfirm').value;
    if (password !== confirm) {
      showAuthError('Passwörter stimmen nicht überein.');
      return;
    }
    setAuthLoading(true);
    const { error } = await supabaseClient.auth.signUp({ email, password });
    setAuthLoading(false);
    if (error) {
      showAuthError(error.message);
    } else {
      showAuthSuccess('Konto erstellt! Du bist jetzt eingeloggt.');
      setTimeout(() => closeAuthModal(), 1500);
    }
  } else {
    setAuthLoading(true);
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    setAuthLoading(false);
    if (error) {
      showAuthError(error.message);
    } else {
      closeAuthModal();
    }
  }
}

async function handleGoogleLogin() {
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) showAuthError(error.message);
}

async function handleLogout() {
  try {
    await copyFavoritesToLocalStorage();
    await copyProfileToLocalStorage();
  } catch (err) {
    console.warn('Pre-logout sync failed:', err.message);
  }
  await supabaseClient.auth.signOut();
}

async function handleForgotPassword() {
  const email = document.getElementById('authEmail').value.trim();
  if (!email) {
    showAuthError('Bitte gib deine E-Mail-Adresse ein.');
    return;
  }
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  });
  if (error) {
    showAuthError(error.message);
  } else {
    showAuthSuccess('Passwort-Reset E-Mail gesendet! Prüfe dein Postfach.');
  }
}

/* ========================================
   FAVORITES SYNC
   ======================================== */
let _favSyncTimer = null;

function syncFavoritesToSupabase(favs) {
  clearTimeout(_favSyncTimer);
  _favSyncTimer = setTimeout(async () => {
    if (!currentUser) return;
    try {
      const uid = currentUser.id;
      await supabaseClient.from('favorites').delete().eq('user_id', uid);
      if (favs.length > 0) {
        await supabaseClient.from('favorites').insert(
          favs.map(id => ({ user_id: uid, org_id: id }))
        );
      }
    } catch (err) {
      console.warn('Favorites sync to Supabase failed:', err.message);
    }
  }, 500);
}

async function syncFavoritesOnLogin() {
  if (!currentUser) return;
  try {
    const localFavs = JSON.parse(localStorage.getItem('favOrgs') || '[]');
    const { data, error } = await supabaseClient
      .from('favorites').select('org_id').eq('user_id', currentUser.id);
    if (error) throw error;

    const remoteFavs = (data || []).map(r => r.org_id);
    const merged = [...new Set([...localFavs, ...remoteFavs])];

    // Write merged to localStorage
    localStorage.setItem('favOrgs', JSON.stringify(merged));

    // Write merged to Supabase (add missing ones)
    const toInsert = merged.filter(id => !remoteFavs.includes(id));
    if (toInsert.length > 0) {
      await supabaseClient.from('favorites').insert(
        toInsert.map(id => ({ user_id: currentUser.id, org_id: id }))
      );
    }

    // Re-render with merged data
    if (typeof renderAll === 'function') renderAll();
  } catch (err) {
    console.warn('Favorites sync on login failed, using localStorage:', err.message);
  }
}

async function copyFavoritesToLocalStorage() {
  if (!currentUser) return;
  try {
    const { data } = await supabaseClient
      .from('favorites').select('org_id').eq('user_id', currentUser.id);
    if (data) {
      localStorage.setItem('favOrgs', JSON.stringify(data.map(r => r.org_id)));
    }
  } catch (err) {
    console.warn('Copy favorites to localStorage failed:', err.message);
  }
}

/* ========================================
   PROFILE SYNC
   ======================================== */
async function syncProfileToSupabase(data) {
  if (!currentUser) return;
  try {
    const profileData = {
      id: currentUser.id,
      email: currentUser.email,
      education: data.education || null,
      field_of_study: data.field_of_study || null,
      experience: data.experience || null,
      desired_regions: data.desired_regions || [],
      workload_min: data.workload_min || 50,
      workload_max: data.workload_max || 100,
      languages: data.languages || {},
      keywords: data.keywords || null,
      exclusions: data.exclusions || [],
      exclusions_freetext: data.exclusions_freetext || null,
      start_date: data.start_date || null,
      updated_at: data.updated_at || new Date().toISOString()
    };
    await supabaseClient.from('profiles').upsert(profileData);
  } catch (err) {
    console.warn('Profile sync to Supabase failed:', err.message);
  }
}

async function syncProfileOnLogin() {
  if (!currentUser) return;
  try {
    const { data, error } = await supabaseClient
      .from('profiles').select('*').eq('id', currentUser.id).single();

    const localProfile = JSON.parse(localStorage.getItem('userProfile') || '{}');
    const remoteHasData = data && data.updated_at && (data.education || data.field_of_study || data.experience);
    const localHasData = localProfile.updated_at && (localProfile.education || localProfile.field_of_study || localProfile.experience);

    if (remoteHasData && localHasData) {
      // Both have data – use newer
      const remoteTime = new Date(data.updated_at).getTime();
      const localTime = new Date(localProfile.updated_at).getTime();
      if (remoteTime >= localTime) {
        writeRemoteProfileToLocal(data);
      } else {
        await syncProfileToSupabase(localProfile);
      }
    } else if (remoteHasData) {
      writeRemoteProfileToLocal(data);
    } else if (localHasData) {
      await syncProfileToSupabase(localProfile);
    }

    if (typeof updateProfileButton === 'function') updateProfileButton();
  } catch (err) {
    console.warn('Profile sync on login failed, using localStorage:', err.message);
  }
}

function writeRemoteProfileToLocal(data) {
  const profile = {
    education: data.education || '',
    field_of_study: data.field_of_study || '',
    experience: data.experience || '',
    desired_regions: data.desired_regions || [],
    workload_min: data.workload_min || 50,
    workload_max: data.workload_max || 100,
    languages: data.languages || {},
    keywords: data.keywords || '',
    exclusions: data.exclusions || [],
    exclusions_freetext: data.exclusions_freetext || '',
    start_date: data.start_date || '',
    updated_at: data.updated_at
  };
  localStorage.setItem('userProfile', JSON.stringify(profile));
}

async function copyProfileToLocalStorage() {
  if (!currentUser) return;
  try {
    const { data } = await supabaseClient
      .from('profiles').select('*').eq('id', currentUser.id).single();
    if (data) writeRemoteProfileToLocal(data);
  } catch (err) {
    console.warn('Copy profile to localStorage failed:', err.message);
  }
}

/* ======== Init: update header on load ======== */
updateAuthUI();

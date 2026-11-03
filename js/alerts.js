/* Job alerts ("Jobalarme"): list, create, edit, pause and delete rows of
   public.job_alerts, plus one-click unsubscribe from e-mail links.
   Contract: DOKUMENTATION.md, section "E-Mail-Jobalarme". Rendered inside the
   "Jobalarme" tab of "Meine Suche" (js/workspace.js). */
(function () {
  'use strict';
  const C = window.JobCore;
  const MAX_ALERTS = 10;
  const COLUMNS = 'id,name,filters,frequency,active,last_sent_at,created_at,updated_at';
  const SENIORITY = [['praktikum', 'Praktikum'], ['trainee', 'Trainee'], ['junior', 'Junior'], ['senior', 'Senior'], ['lead', 'Leitung'], ['phd', 'PhD / Doktorat']];
  const FREQUENCY = { weekly: 'Wöchentlich', daily: 'Täglich' };
  const WORKLOADS = [20, 40, 50, 60, 80, 100];
  const FILTER_LABELS = { q: 'Stichwort', focus: 'Fachbereich', category: 'Branche', canton: 'Kanton', seniority: 'Karrierestufe', employer: 'Arbeitgeber', min_workload: 'Mindestpensum' };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dateTime = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const icon = path => `<svg class="jw-i" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;
  const BELL = icon('<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>');
  const CLOSE = icon('<path d="M18 6 6 18M6 6l12 12"/>');

  const categories = () => Array.isArray(window.HealthJobRelevance?.CATEGORIES) ? window.HealthJobRelevance.CATEGORIES : [];
  const groups = () => typeof DATA !== 'undefined' && Array.isArray(DATA) ? DATA : [];
  const cantons = () => window.HealthJobFacts?.CANTONS || {};
  const orgs = () => groups().flatMap(g => (g.orgs || []).map(o => ({ ...o, category: g.key }))).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const baseClient = () => typeof supabaseClient !== 'undefined' && supabaseClient ? supabaseClient : null;
  const currentOwner = () => typeof currentUser !== 'undefined' && currentUser ? currentUser.id : null;

  let owner = currentOwner(), alerts = [], status = 'idle', loadError = '', message = '', epoch = 0, unsub = null, pendingPrefill = null;

  function missingBackend(error) {
    const text = `${error?.code || ''} ${error?.message || ''}`;
    return /PGRST20[25]|42P01|42883|does not exist|schema cache|Could not find the (?:table|function)/i.test(text);
  }
  function explain(error) {
    const text = String(error?.message || error || '');
    if (/ALERT_LIMIT_REACHED/.test(text)) return 'Du hast bereits zehn Jobalarme. Lösche oder ändere einen bestehenden Alarm.';
    if (/INVALID_ALERT_FILTERS/.test(text)) { const field = FILTER_LABELS[String(error?.details || '').trim()]; return `Ein Filter wurde nicht akzeptiert${field ? ` (${field})` : ''}. Bitte prüfe deine Eingaben.`; }
    if (/AUTH_REQUIRED|SESSION|JWT|not authenticated|401/i.test(text)) return 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.';
    if (missingBackend(error)) return 'Jobalarme sind auf diesem Server noch nicht eingerichtet.';
    if (/Failed to fetch|NetworkError|network|Load failed/i.test(text)) return 'Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung und versuche es erneut.';
    return 'Das hat nicht geklappt. ' + (text ? `(${text.slice(0, 200)})` : 'Bitte versuche es erneut.');
  }
  async function accountClient(uid) {
    if (typeof getAccountClient === 'function') { const client = await getAccountClient(uid); if (!client) throw new Error('SESSION'); return client; }
    const client = baseClient(); if (!client) throw new Error('Failed to fetch'); return client;
  }
  function changed() { window.dispatchEvent(new CustomEvent('healthjobs:alerts-changed', { detail: { count: alerts.length, status } })); }
  function rerender() { render(document.getElementById('jwAlerts')); }

  /* ---------- Data ---------- */
  async function load() {
    const run = ++epoch, uid = owner;
    if (!uid || !baseClient()) { alerts = []; status = 'idle'; rerender(); changed(); return; }
    status = 'loading'; loadError = ''; rerender();
    try {
      const client = await accountClient(uid);
      const { data, error } = await client.from('job_alerts').select(COLUMNS).eq('user_id', uid).order('created_at', { ascending: true });
      if (run !== epoch) return;
      if (error) throw error;
      alerts = Array.isArray(data) ? data.filter(row => row && typeof row.id === 'string') : []; status = 'ready';
    } catch (error) {
      if (run !== epoch) return;
      alerts = []; status = missingBackend(error) ? 'unavailable' : 'error'; loadError = explain(error);
    }
    rerender(); changed();
    if (status === 'ready' && pendingPrefill && document.querySelector('#jobWorkspace')) { const prefill = pendingPrefill; pendingPrefill = null; openDialog(prefill); }
  }
  async function save(values, existing) {
    const uid = owner, client = await accountClient(uid);
    const query = existing ? client.from('job_alerts').update(values).eq('id', existing.id) : client.from('job_alerts').insert(values);
    const { data, error } = await query.select(COLUMNS).single();
    if (error) throw error;
    if (uid !== owner) return null;
    const row = data && typeof data.id === 'string' ? data : { ...existing, ...values };
    alerts = existing ? alerts.map(a => a.id === existing.id ? row : a) : [...alerts, row];
    return row;
  }
  async function setActive(alertId, active) {
    const alert = alerts.find(a => a.id === alertId); if (!alert) return;
    const previous = alert.active; alert.active = active; message = ''; rerender();
    try {
      const client = await accountClient(owner);
      const { error } = await client.from('job_alerts').update({ active }).eq('id', alertId);
      if (error) throw error;
      message = active ? `«${displayName(alert)}» ist wieder aktiv.` : `«${displayName(alert)}» ist pausiert. Du erhältst dafür keine E-Mails.`;
    } catch (error) { alert.active = previous; message = explain(error); }
    rerender(); changed();
  }
  async function remove(alertId) {
    const alert = alerts.find(a => a.id === alertId); if (!alert) return;
    if (!confirm(`Jobalarm «${displayName(alert)}» löschen? Das lässt sich nicht rückgängig machen.`)) return;
    try {
      const client = await accountClient(owner);
      const { error } = await client.from('job_alerts').delete().eq('id', alertId);
      if (error) throw error;
      alerts = alerts.filter(a => a.id !== alertId); message = `«${displayName(alert)}» wurde gelöscht.`;
    } catch (error) { message = explain(error); }
    rerender(); changed();
    document.querySelector('#jwAlerts [data-alert-action="new"]')?.focus();
  }
  async function unsubscribe(token) {
    unsub = { state: 'loading', token }; rerender();
    const client = baseClient();
    if (!client) unsub = { state: 'error', token, message: 'Die Verbindung zum Server ist gerade nicht verfügbar. Bitte versuche es später erneut.' };
    else {
      try {
        const { data, error } = await client.rpc('unsubscribe_job_alert', { token });
        if (error) throw error;
        unsub = data?.unsubscribed ? { state: 'done', token, name: typeof data.name === 'string' ? data.name : '' } : { state: 'unknown', token };
      } catch (error) { unsub = { state: 'error', token, message: explain(error) }; }
    }
    rerender();
    document.getElementById('jwUnsub')?.focus();
    if (unsub.state === 'done' && owner) load();
    return { ...unsub };
  }

  /* ---------- Filters ---------- */
  const displayName = alert => alert?.name || suggestName(alert?.filters || {}) || 'Jobalarm';
  function filterParts(filters = {}) {
    const f = filters || {}, parts = [];
    if (f.q) parts.push(['Stichwort', `«${f.q}»`]);
    if (f.focus) parts.push(['Fachbereich', f.focus]);
    if (f.category) parts.push(['Branche', groups().find(g => g.key === f.category)?.title || f.category]);
    if (f.employer) parts.push(['Arbeitgeber', orgs().find(o => o.id === f.employer)?.name || f.employer]);
    if (f.canton) parts.push(['Kanton', cantons()[f.canton] || f.canton]);
    if (f.seniority) parts.push(['Karrierestufe', SENIORITY.find(([k]) => k === f.seniority)?.[1] || f.seniority]);
    if (f.min_workload) parts.push(['Pensum', `ab ${f.min_workload} %`]);
    return parts;
  }
  function suggestName(filters) { return filterParts(filters).slice(0, 3).map(([, v]) => v.replace(/[«»]/g, '')).join(' · ').slice(0, 120); }
  function cleanPrefill(raw = {}) {
    const p = raw && typeof raw === 'object' ? raw : {};
    const seniority = C?.seniorityKey ? C.seniorityKey(p.seniority) : p.seniority;
    const workload = Number(p.min_workload);
    return {
      name: typeof p.name === 'string' ? p.name.slice(0, 120) : '', q: typeof p.q === 'string' ? p.q.trim().slice(0, 200) : '',
      focus: categories().includes(p.focus) ? p.focus : '', category: groups().some(g => g.key === p.category) ? p.category : '',
      canton: Object.hasOwn(cantons(), p.canton) ? p.canton : '', seniority: seniority === 'entry' ? 'junior' : SENIORITY.some(([k]) => k === seniority) ? seniority : '',
      employer: orgs().some(o => o.id === p.employer) ? p.employer : '', min_workload: Number.isFinite(workload) && workload > 0 && workload <= 100 ? workload : '',
      frequency: p.frequency === 'daily' ? 'daily' : 'weekly'
    };
  }
  function readForm(form) {
    const get = name => String(form.elements.namedItem(name)?.value || '').trim();
    const filters = {};
    for (const key of ['q', 'focus', 'category', 'canton', 'seniority', 'employer']) { const value = get(key); if (value) filters[key] = value; }
    const workload = Number(get('min_workload')); if (workload) filters.min_workload = workload;
    return { name: get('name').slice(0, 120) || suggestName(filters) || null, filters, frequency: get('frequency') === 'daily' ? 'daily' : 'weekly' };
  }
  function previewText(filters) {
    const jobs = typeof window.PublicJobFeed?.getAllJobs === 'function' ? window.PublicJobFeed.getAllJobs() : null;
    if (!Array.isArray(jobs) || !jobs.length || !C?.matchesAlert) return '';
    const facts = window.HealthJobFacts, byOrg = new Map(orgs().map(o => [o.id, o.category]));
    const n = jobs.filter(job => C.matchesAlert(job, filters, { cantonOf: facts?.cantonFromLocation, categoryOf: id => byOrg.get(id) })).length;
    return n ? `Im aktuellen Stand passen ${n} ${n === 1 ? 'Stelle' : 'Stellen'} zu diesen Filtern. Per E-Mail kommen nur Stellen, die neu dazukommen.` : 'Im aktuellen Stand passt keine Stelle zu diesen Filtern. Du wirst benachrichtigt, sobald eine neue erscheint.';
  }

  /* ---------- Rendering ---------- */
  function unsubHtml() {
    if (!unsub) return '';
    const close = '<button type="button" class="btn btn-sm btn-ghost" data-alert-action="unsub-close">Schliessen</button>';
    if (unsub.state === 'loading') return '<section id="jwUnsub" class="jw-callout" tabindex="-1" role="status"><h3>Abmeldung wird verarbeitet …</h3></section>';
    if (unsub.state === 'done') return `<section id="jwUnsub" class="jw-callout is-ok" tabindex="-1" role="status"><h3>Du bist abgemeldet</h3><p>Der Jobalarm${unsub.name ? ` «${esc(unsub.name)}»` : ''} ist pausiert. Du erhältst dafür keine E-Mails mehr. Du kannst ihn jederzeit wieder aktivieren.</p><div class="jw-actions">${owner ? '' : '<button type="button" class="btn btn-sm btn-primary" data-alert-action="login">Anmelden, um Jobalarme zu verwalten</button>'}${close}</div></section>`;
    if (unsub.state === 'unknown') return `<section id="jwUnsub" class="jw-callout is-warn" tabindex="-1" role="status"><h3>Abmeldelink nicht gefunden</h3><p>Zu diesem Link gibt es keinen Jobalarm mehr. Vermutlich wurde er bereits gelöscht; dann werden dafür auch keine E-Mails mehr versendet.${owner ? ' Deine aktuellen Jobalarme siehst du unten.' : ' Melde dich an, um deine Jobalarme zu prüfen.'}</p><div class="jw-actions">${owner ? '' : '<button type="button" class="btn btn-sm btn-primary" data-alert-action="login">Anmelden</button>'}${close}</div></section>`;
    return `<section id="jwUnsub" class="jw-callout is-danger" tabindex="-1" role="alert"><h3>Abmeldung fehlgeschlagen</h3><p>${esc(unsub.message || 'Bitte versuche es erneut.')} Der Alarm ist noch nicht pausiert.</p><div class="jw-actions"><button type="button" class="btn btn-sm btn-primary" data-alert-action="unsub-retry">Erneut versuchen</button>${close}</div></section>`;
  }
  const intro = '<p>Neue Stellen aus dem öffentlichen Feed, die zu deinen Filtern passen, kommen täglich oder wöchentlich per E-Mail. Ohne neue Stellen gibt es keine Mail. Jede Mail enthält einen Abmeldelink.</p>';
  function listHtml() {
    const full = alerts.length >= MAX_ALERTS;
    const head = `<div class="jw-alerts-head"><div><h3>Deine Jobalarme</h3><p class="jw-small jw-muted">${alerts.length} von ${MAX_ALERTS} genutzt${full ? ' · Lösche einen Alarm, um einen neuen anzulegen.' : ''}</p></div><button type="button" class="btn btn-primary" data-alert-action="new"${full ? ' disabled' : ''}>${BELL}Neuer Jobalarm</button></div>`;
    const note = message ? `<p class="jw-notice" role="status">${esc(message)}</p>` : '';
    if (!alerts.length) return `${note}<div class="jw-empty jw-alerts-empty"><span class="jw-start-mark">${BELL}</span><h3>Noch kein Jobalarm</h3>${intro}<div class="jw-actions"><button type="button" class="btn btn-primary" data-alert-action="new">Ersten Jobalarm einrichten</button></div></div>`;
    return `${head}${note}<ul class="jw-alert-list">${alerts.map(alert => {
      const parts = filterParts(alert.filters), name = displayName(alert);
      return `<li class="jw-alert${alert.active ? '' : ' is-paused'}"><div class="jw-alert-main"><h4>${esc(name)}</h4><div class="jw-chips">${parts.length ? parts.map(([label, value]) => `<span class="chip"><span class="visually-hidden">${esc(label)}: </span>${esc(value)}</span>`).join('') : '<span class="chip">Alle neuen Stellen</span>'}</div><p class="jw-small jw-muted">${FREQUENCY[alert.frequency] || 'Wöchentlich'} · ${alert.last_sent_at ? `Zuletzt versendet ${esc(dateTime(alert.last_sent_at))}` : 'Noch keine Mail versendet'}</p></div>
        <div class="jw-alert-side"><button type="button" class="jw-switch" role="switch" aria-checked="${!!alert.active}" data-alert-action="toggle" data-alert-id="${esc(alert.id)}"><span class="jw-switch-track" aria-hidden="true"><span class="jw-switch-thumb"></span></span><span>${alert.active ? 'Aktiv' : 'Pausiert'}</span><span class="visually-hidden">: ${esc(name)}</span></button><button type="button" class="btn btn-sm" data-alert-action="edit" data-alert-id="${esc(alert.id)}">Bearbeiten<span class="visually-hidden">: ${esc(name)}</span></button><button type="button" class="btn btn-sm btn-ghost jw-danger-text" data-alert-action="delete" data-alert-id="${esc(alert.id)}">Löschen<span class="visually-hidden">: ${esc(name)}</span></button></div></li>`;
    }).join('')}</ul>`;
  }
  function html() {
    let body;
    if (!baseClient()) body = `<div class="jw-empty"><h3>Jobalarme sind gerade nicht verfügbar</h3><p>Die Verbindung zum Konto-Server konnte nicht hergestellt werden. Bitte prüfe deine Internetverbindung und lade die Seite neu.</p></div>`;
    else if (!owner) body = `<div class="jw-empty jw-alerts-empty"><span class="jw-start-mark">${BELL}</span><h3>Neue Stellen per E-Mail</h3>${intro}<p>Für Jobalarme brauchst du ein kostenloses Konto, damit die Mails an deine Adresse gehen. Abmelden geht jederzeit, auch ohne Anmeldung.</p><div class="jw-actions"><button type="button" class="btn btn-primary" data-alert-action="login">Anmelden</button></div></div>`;
    else if (status === 'unavailable') body = `<div class="jw-empty"><h3>Jobalarme sind noch nicht eingerichtet</h3><p>Auf diesem Server fehlt die Datenbankerweiterung für Jobalarme. Deine übrigen Daten sind davon nicht betroffen. Bitte versuche es später erneut.</p></div>`;
    else if (status === 'error') body = `<div class="jw-empty"><h3>Jobalarme konnten nicht geladen werden</h3><p>${esc(loadError)}</p><div class="jw-actions"><button type="button" class="btn btn-primary" data-alert-action="reload">Erneut versuchen</button></div></div>`;
    else if (status !== 'ready') body = '<div class="jw-alert-list" aria-busy="true"><span class="visually-hidden" role="status">Jobalarme werden geladen …</span><div class="skeleton jw-skel"></div><div class="skeleton jw-skel"></div></div>';
    else body = listHtml();
    return unsubHtml() + body;
  }
  function render(el) {
    if (!el) return;
    const active = el.contains(document.activeElement) ? document.activeElement : null, action = active?.dataset?.alertAction, alertId = active?.dataset?.alertId;
    el.innerHTML = html();
    if (action) el.querySelector(`[data-alert-action="${action}"]${alertId ? `[data-alert-id="${alertId.replace(/["\\]/g, '\\$&')}"]` : ''}`)?.focus({ preventScroll: true });
  }

  /* ---------- Dialog ---------- */
  function dialogShell(title, body) {
    document.getElementById('jwAlertDialog')?.remove();
    const d = document.createElement('dialog'); d.id = 'jwAlertDialog'; d.className = 'jw-dialog jw-dialog-narrow'; d.setAttribute('aria-labelledby', 'jwAlertDialogTitle');
    d.innerHTML = `<div class="jw-dialog-head"><h2 id="jwAlertDialogTitle">${esc(title)}</h2><button type="button" class="jw-icon-btn" data-alert-action="close" aria-label="Schliessen">${CLOSE}</button></div><div class="jw-dialog-body">${body}</div>`;
    document.body.appendChild(d); d.showModal(); return d;
  }
  const opt = (value, label, selected) => `<option value="${esc(value)}"${String(selected ?? '') === String(value) ? ' selected' : ''}>${esc(label)}</option>`;
  function openDialog(prefill = {}, existing = null) {
    if (!baseClient()) { dialogShell('Jobalarm einrichten', '<p>Jobalarme sind gerade nicht verfügbar, weil keine Verbindung zum Konto-Server besteht. Bitte lade die Seite neu.</p>'); return; }
    if (!owner) {
      pendingPrefill = prefill || {};
      dialogShell('Jobalarm einrichten', `${intro}<p>Melde dich an oder erstelle ein Konto. Danach öffnet sich dieser Jobalarm mit deinen Filtern wieder.</p><div class="jw-form-actions"><button type="button" class="btn btn-primary" data-alert-action="login">Anmelden</button></div>`);
      return;
    }
    if (status === 'loading' || status === 'idle') { pendingPrefill = prefill || {}; if (status === 'idle') load(); return; }
    if (status === 'unavailable') { dialogShell('Jobalarm einrichten', '<p>Jobalarme sind auf diesem Server noch nicht eingerichtet. Bitte versuche es später erneut.</p>'); return; }
    if (!existing && alerts.length >= MAX_ALERTS) { dialogShell('Jobalarm einrichten', `<p>Du hast bereits ${MAX_ALERTS} Jobalarme. Lösche oder ändere einen bestehenden Alarm.</p>`); return; }
    const v = cleanPrefill(existing ? { ...existing.filters, name: existing.name, frequency: existing.frequency } : prefill);
    const cantonList = Object.entries(cantons()).sort((a, b) => a[1].localeCompare(b[1], 'de'));
    const d = dialogShell(existing ? 'Jobalarm bearbeiten' : 'Neuer Jobalarm', `<form class="jw-form" data-alert-form${existing ? ` data-alert-id="${esc(existing.id)}"` : ''} novalidate>
      <label><span>Name <span class="jw-optional">(optional)</span></span><input name="name" maxlength="120" value="${esc(v.name)}" placeholder="z. B. HTA in Bern" autocomplete="off"></label>
      <label>Stichwort<input name="q" type="search" maxlength="200" value="${esc(v.q)}" placeholder="z. B. Tarife, Versorgungsforschung" autocomplete="off"><span class="jw-hint">Alle Wörter müssen in Titel, Arbeitgeber, Beschrieb oder Ort vorkommen.</span></label>
      <div class="jw-split"><label>Fachbereich<select name="focus">${opt('', 'Alle Fachbereiche', v.focus)}${categories().map(c => opt(c, c, v.focus)).join('')}</select></label><label>Branche<select name="category">${opt('', 'Alle Branchen', v.category)}${groups().map(g => opt(g.key, g.title, v.category)).join('')}</select></label></div>
      <div class="jw-split"><label>Region / Kanton<select name="canton">${opt('', 'Ganze Schweiz', v.canton)}${cantonList.map(([code, name]) => opt(code, `${name} (${code})`, v.canton)).join('')}</select></label><label>Karrierestufe<select name="seniority">${opt('', 'Alle Stufen', v.seniority)}${SENIORITY.map(([k, l]) => opt(k, l, v.seniority)).join('')}</select></label></div>
      <div class="jw-split"><label>Mindestpensum<select name="min_workload">${opt('', 'Egal', v.min_workload)}${WORKLOADS.map(n => opt(n, `ab ${n} %`, v.min_workload)).join('')}</select></label><label>Arbeitgeber<select name="employer">${opt('', 'Alle Arbeitgeber', v.employer)}${orgs().map(o => opt(o.id, o.name, v.employer)).join('')}</select></label></div>
      <fieldset class="jw-radios"><legend>Häufigkeit</legend><label><input type="radio" name="frequency" value="weekly"${v.frequency !== 'daily' ? ' checked' : ''}> Wöchentlich</label><label><input type="radio" name="frequency" value="daily"${v.frequency === 'daily' ? ' checked' : ''}> Täglich</label></fieldset>
      <p class="jw-alert-preview jw-small" data-alert-preview aria-live="polite"></p>
      <p class="jw-form-error" role="alert" hidden></p>
      <div class="jw-form-actions"><button type="button" class="btn btn-ghost" data-alert-action="close">Abbrechen</button><button type="submit" class="btn btn-primary">${existing ? 'Änderungen speichern' : 'Jobalarm speichern'}</button></div></form>`);
    const form = d.querySelector('form'), preview = d.querySelector('[data-alert-preview]');
    const update = () => { const text = previewText(readForm(form).filters); preview.textContent = text; preview.hidden = !text; };
    form.addEventListener('input', update); form.addEventListener('change', update); update();
    form.elements.namedItem(existing ? 'name' : 'q')?.focus();
  }
  async function submit(form) {
    const values = readForm(form), existing = alerts.find(a => a.id === form.dataset.alertId) || null;
    const errorEl = form.querySelector('.jw-form-error'), submitBtn = form.querySelector('[type=submit]');
    const fail = text => { errorEl.textContent = text; errorEl.hidden = false; };
    if (values.filters.q && values.filters.q.length > 200) { fail('Das Stichwort darf höchstens 200 Zeichen lang sein.'); return; }
    if (!existing && alerts.length >= MAX_ALERTS) { fail(explain({ message: 'ALERT_LIMIT_REACHED' })); return; }
    errorEl.hidden = true; submitBtn.disabled = true; const label = submitBtn.textContent; submitBtn.textContent = 'Wird gespeichert …';
    try {
      const row = existing ? await save({ name: values.name, filters: values.filters, frequency: values.frequency }, existing) : await save({ ...values, active: true }, null);
      if (!row) return;
      form.closest('dialog')?.close();
      message = existing ? `«${displayName(row)}» wurde gespeichert.` : `«${displayName(row)}» ist eingerichtet. Die erste Mail kommt, sobald neue passende Stellen erscheinen.`;
      rerender(); changed();
    } catch (error) { fail(explain(error)); }
    finally { submitBtn.disabled = false; submitBtn.textContent = label; }
  }

  /* ---------- Events ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest?.('[data-alert-action]'); if (!el || !(el.closest('#jwAlerts') || el.closest('#jwAlertDialog'))) return;
    e.preventDefault();
    const action = el.dataset.alertAction, alertId = el.dataset.alertId;
    if (action === 'close') el.closest('dialog')?.close();
    else if (action === 'login') { el.closest('dialog')?.close(); if (typeof openAuthModal === 'function') openAuthModal(); }
    else if (action === 'new') openDialog({});
    else if (action === 'edit') openDialog({}, alerts.find(a => a.id === alertId));
    else if (action === 'toggle') { const alert = alerts.find(a => a.id === alertId); if (alert) setActive(alertId, !alert.active); }
    else if (action === 'delete') remove(alertId);
    else if (action === 'reload') load();
    else if (action === 'unsub-retry' && unsub?.token) unsubscribe(unsub.token);
    else if (action === 'unsub-close') { unsub = null; rerender(); }
  });
  document.addEventListener('submit', e => {
    const form = e.target; if (!form.matches?.('[data-alert-form]')) return;
    e.preventDefault(); submit(form);
  });
  window.addEventListener('healthjobs:auth', e => {
    const next = e.detail?.userId || null;
    if (next === owner && status !== 'idle') return;
    owner = next; alerts = []; message = ''; status = 'idle'; epoch++;
    document.getElementById('jwAlertDialog')?.close();
    if (owner) load(); else { rerender(); changed(); }
  });

  window.HealthJobAlerts = {
    render, openDialog: prefill => openDialog(prefill || {}), unsubscribe, reload: load,
    count: () => status === 'ready' ? alerts.length : 0, isReady: () => status === 'ready',
    list: () => alerts.map(a => ({ ...a, filters: { ...a.filters } })), describe: filters => filterParts(filters).map(([label, value]) => `${label}: ${value}`)
  };
  if (owner) load();
})();

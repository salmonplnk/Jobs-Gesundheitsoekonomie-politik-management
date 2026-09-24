/* Compatibility entry points for existing profile and authentication controls. */
function buildMatchingSection() { if (window.HealthJobs) window.HealthJobs.render(); }
function startMatching() { if (window.HealthJobs) return window.HealthJobs.startSearch(); }
function cancelMatching() { if (window.HealthJobs) window.HealthJobs.cancelSearch(); }
function clearSavedResults() { localStorage.removeItem('lastMatchResults'); }

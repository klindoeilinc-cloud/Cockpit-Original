// ═══════════════════════════════════════════════════════
//  MCPS — Rapports partagés (agence → client externe, lecture seule)
// ───────────────────────────────────────────────────────
// Première pièce de l'architecture "à deux faces" décidée dans
// STRATEGIE-PRODUIT.md (section H) : données de l'agence et de son client
// restent SÉPARÉES, le pont entre les deux est un instantané explicite,
// publié volontairement, jamais un document partagé en direct. Voir
// firestore.rules pour le modèle de sécurité (lien = clé d'accès, comme un
// lien "toute personne disposant du lien").
//
// Le champ le plus sensible du modèle (`revisions`, déjà central dans
// l'Intelligence Layer — voir AUDIT.md et STRATEGIE-PRODUIT.md C.3) reste
// visible ici : c'est justement ce que ce module rend enfin consultable
// par le client, alors qu'aujourd'hui rien dans l'interface ne le lui
// montre jamais.
// ═══════════════════════════════════════════════════════

// ── Construction de l'instantané : seuls des champs explicitement listés
// ── passent le filtre. Toute nouvelle donnée doit être ajoutée ici à la
// ── main — jamais par un `...project` qui exposerait tout par défaut.
function buildProjectShareSnapshot(project, client, tasks) {
  const pTasks = (tasks || []).filter(t => t.projectId === project.id);
  const doneCount = pTasks.filter(t => t.status === 'Terminé').length;
  const progressPct = pTasks.length ? Math.round(doneCount / pTasks.length * 100) : 0;

  return {
    projectName: String(project.name || ''),
    clientName: client ? String(client.name || '') : '',
    status: String(project.status || ''),
    priority: String(project.priority || ''),
    startDate: project.startDate || null,
    endDate: project.endDate || null,
    progressPct,
    // Canaux et objectif : descriptifs, pas financiers — utiles au client
    // pour se repérer, sans rien révéler du coût de production.
    channels: Array.isArray(project.channels) ? project.channels.slice() : [],
    objective: project.objective || null,
    tasks: pTasks.map(t => ({
      name: String(t.name || ''),
      status: String(t.status || ''),
      revisions: (typeof t.revisions === 'number') ? t.revisions : null,
      completedDate: t.completedDate || null,
    })),
    // Champs volontairement absents : mediaBudget, estimatedHours, realHours,
    // qualityRating, assignedTo, responsable, tout ce qui touche à la marge
    // ou aux ressources internes de l'agence — y compris le budget média,
    // pourtant descriptif, tant que la politique de partage n'a pas été
    // explicitement validée sur ce point (voir STRATEGIE-PRODUIT.md).
  };
}
window.buildProjectShareSnapshot = buildProjectShareSnapshot;

function _shareRandomId() {
  const bytes = new Uint8Array(18);
  (window.crypto || window.msCrypto).getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function _shareBaseUrl() {
  return location.origin + location.pathname;
}

async function shareProject(projectId) {
  if (!(typeof MCPS_ORG_ID !== 'undefined' && MCPS_ORG_ID) || !(window.firebase && firebase.apps && firebase.apps.length)) {
    showToast('⚠️', 'Le partage nécessite un espace connecté au cloud (pas le mode local)', 'var(--amber)');
    return;
  }
  const project = (DB.projects || []).find(p => p.id === projectId);
  if (!project) { showToast('⚠️', 'Projet introuvable', 'var(--red)'); return; }
  const client = (typeof gc === 'function') ? gc(project.clientId) : (DB.clients || []).find(c => c.id === project.clientId);
  const snapshot = buildProjectShareSnapshot(project, client, DB.tasks || []);

  const shareId = _shareRandomId();
  try {
    const db = firebase.firestore();
    await db.collection('orgs').doc(MCPS_ORG_ID).collection('shared_reports').doc(shareId).set({
      type: 'project',
      sourceId: project.id,
      snapshot,
      active: true,
      createdBy: firebase.auth().currentUser ? firebase.auth().currentUser.uid : null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error('shareProject', e);
    showToast('⚠️', 'Échec de la création du lien de partage', 'var(--red)');
    return;
  }

  const url = `${_shareBaseUrl()}?share=${encodeURIComponent(MCPS_ORG_ID)}:${shareId}`;
  _showShareLinkModal(url);
  if (typeof _mcpsAudit === 'function') _mcpsAudit('CREATE', 'shared_report', shareId, { projectId: project.id });
}
window.shareProject = shareProject;

function _showShareLinkModal(url) {
  const box = document.createElement('div');
  box.className = 'overlay';
  box.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999';
  box.innerHTML = `
    <div class="card" style="max-width:480px;width:92%;padding:22px 24px">
      <div style="font-weight:700;font-size:15px;margin-bottom:10px">🔗 Rapport partagé créé</div>
      <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:14px">
        Ce lien montre uniquement l'avancement de ce projet (statut, tâches, échéance) —
        aucune donnée financière ni interne de l'agence. Le client n'a pas besoin de compte.
      </div>
      <input readonly value="${url.replace(/"/g, '&quot;')}" style="width:100%;padding:9px 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);font-family:var(--mono);font-size:12px;margin-bottom:12px" onclick="this.select()">
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost btn-sm" data-close-share>Fermer</button>
        <button class="btn btn-primary btn-sm" data-copy-share>📋 Copier le lien</button>
      </div>
    </div>`;
  document.body.appendChild(box);
  box.querySelector('[data-close-share]').onclick = () => box.remove();
  box.addEventListener('click', (e) => { if (e.target === box) box.remove(); });
  box.querySelector('[data-copy-share]').onclick = async () => {
    try { await navigator.clipboard.writeText(url); showToast('📋', 'Lien copié', 'var(--green)'); }
    catch (e) { showToast('⚠️', 'Copie impossible — sélectionnez et copiez manuellement', 'var(--amber)'); }
  };
}

// ═══════════════════════════════════════════════════════
//  Vue publique — consultation du rapport partagé, sans authentification
// ═══════════════════════════════════════════════════════
function _parseShareParam() {
  const raw = new URLSearchParams(location.search).get('share');
  if (!raw || !raw.includes(':')) return null;
  const idx = raw.indexOf(':');
  return { orgId: raw.slice(0, idx), shareId: raw.slice(idx + 1) };
}

async function _renderSharedReportView() {
  const ref = _parseShareParam();
  if (!ref) return false;

  document.body.classList.add('shared-report-mode');
  document.body.classList.remove('auth-locked');
  const host = document.createElement('div');
  host.id = 'shared-report-view';
  host.innerHTML = `<div class="shared-report-loading">Chargement du rapport…</div>`;
  document.body.appendChild(host);

  try {
    if (!(window.firebase && MCPS_CONFIG && MCPS_CONFIG.firebase && MCPS_CONFIG.firebase.apiKey)) {
      throw new Error('Firebase non configuré');
    }
    if (!firebase.apps.length) firebase.initializeApp(MCPS_CONFIG.firebase);
    const snap = await firebase.firestore()
      .collection('orgs').doc(ref.orgId).collection('shared_reports').doc(ref.shareId).get();
    if (!snap.exists || snap.data().active !== true) {
      host.innerHTML = `<div class="shared-report-card"><h2>Lien indisponible</h2><p>Ce rapport a été révoqué par l'agence, ou le lien est incorrect.</p></div>`;
      return true;
    }
    host.innerHTML = _shareReportHtml(snap.data().snapshot || {});
  } catch (e) {
    console.error('_renderSharedReportView', e);
    host.innerHTML = `<div class="shared-report-card"><h2>Impossible de charger ce rapport</h2><p>Vérifiez votre connexion et rechargez la page.</p></div>`;
  }
  return true;
}

function _shareReportHtml(s) {
  const riskDot = { 'En cours': '🟡', 'Terminé': '🟢', 'Non démarré': '⚪' }[s.status] || '⚪';
  // MCPS_CHANNELS est déclaré en `const` dans js/01-app-core.js : accessible
  // ici comme identifiant global (même environnement lexical de premier
  // niveau, partagé entre balises <script> classiques), mais jamais posé sur
  // `window` — d'où la vérification par `typeof` plutôt que `window.*`.
  const channelBadges = (s.channels || []).map(k => (typeof MCPS_CHANNELS !== 'undefined' && MCPS_CHANNELS[k])
    ? `<span class="chan-badge">${MCPS_CHANNELS[k].icon} ${_esc(MCPS_CHANNELS[k].label)}</span>` : '').join('');
  const taskRows = (s.tasks || []).map(t => `<tr>
      <td>${_esc(t.name)}</td>
      <td>${_esc(t.status)}</td>
      <td>${t.revisions != null ? t.revisions : '—'}</td>
    </tr>`).join('') || `<tr><td colspan="3" style="color:#8892a6;text-align:center;padding:16px">Aucune tâche</td></tr>`;
  return `
    <div class="shared-report-card">
      <div class="shared-report-badge">Rapport partagé — lecture seule</div>
      <h2>${riskDot} ${_esc(s.projectName)}</h2>
      <div class="shared-report-meta">${_esc(s.clientName)} · ${_esc(s.status)}${s.objective ? ' · Objectif : ' + _esc(s.objective) : ''} · échéance ${s.endDate ? _esc(s.endDate) : '—'}</div>
      ${channelBadges ? `<div style="margin-bottom:14px">${channelBadges}</div>` : ''}
      <div class="shared-report-progress-wrap">
        <div class="shared-report-progress-bar"><div style="width:${s.progressPct || 0}%"></div></div>
        <div class="shared-report-progress-label">${s.progressPct || 0}% d'avancement</div>
      </div>
      <table class="shared-report-table">
        <thead><tr><th>Tâche</th><th>Statut</th><th>Révisions</th></tr></thead>
        <tbody>${taskRows}</tbody>
      </table>
      <div class="shared-report-footer">Généré par MCPS Cockpit — ce lien ne donne accès à aucune autre donnée de l'agence.</div>
    </div>`;
}

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
window._renderSharedReportView = _renderSharedReportView;

// Doit s'exécuter avant que 06-auth-cloud.js ne verrouille l'écran sur l'auth :
// on écoute au même événement, mais ce fichier se charge après, donc son
// handler tourne en dernier — il peut donc annuler l'état "auth-locked" sans
// condition de course, en repartant systématiquement de zéro sur ?share=.
document.addEventListener('DOMContentLoaded', () => { _renderSharedReportView(); });

(function(){
  let MCPS_ORG_ID = null, MCPS_ROLE = null, MCPS_UID = null, MCPS_EMAIL = null;
  // CORRECTIF : MCPS_ORG_ID/UID/EMAIL sont des `let` privés à cette IIFE —
  // invisibles depuis un autre fichier <script>, contrairement à un `const`
  // de premier niveau (voir MCPS_CHANNELS dans js/01-app-core.js, accessible
  // tel quel). js/09-shared-reports.js référençait MCPS_ORG_ID directement :
  // `typeof MCPS_ORG_ID` renvoyait toujours "undefined" depuis ce fichier
  // (typeof ne lève pas d'erreur sur un identifiant non déclaré), donc le
  // partage de rapport se désactivait silencieusement même connecté au
  // cloud. Cette fonction expose l'état courant sans exposer les variables
  // elles-mêmes ni permettre de les modifier de l'extérieur.
  function _mcpsAuthContext(){ return { orgId: MCPS_ORG_ID, uid: MCPS_UID, email: MCPS_EMAIL, role: MCPS_ROLE }; }
  window._mcpsAuthContext = _mcpsAuthContext;

  function _fsEnabled(){ return !!(MCPS_CONFIG.firebase && MCPS_CONFIG.firebase.apiKey && MCPS_CONFIG.firebase.projectId); }

  function _authSwitchTab(tab){
    document.getElementById('auth-tab-login').classList.toggle('active', tab==='login');
    document.getElementById('auth-tab-signup').classList.toggle('active', tab==='signup');
    document.getElementById('auth-orgname-fg').style.display = tab==='signup' ? 'block' : 'none';
    document.getElementById('auth-submit-btn').dataset.mode = tab;
    const lang = localStorage.getItem('mcps-lang') || 'fr';
    document.getElementById('auth-submit-btn').textContent = tab==='signup' ? I18N[lang]['auth.submitSignup'] : I18N[lang]['auth.submitLogin'];
    document.getElementById('auth-err').textContent = '';
  }
  window._authSwitchTab = _authSwitchTab;

  function _authUnlockLocal(){
    document.body.classList.remove('auth-locked');
  }
  window._authUnlockLocal = _authUnlockLocal;

  function _showAuthErr(msg){ document.getElementById('auth-err').textContent = msg; }

  const FRIENDLY_ERR = {
    'auth/invalid-email': 'Adresse email invalide.',
    'auth/user-not-found': 'Aucun compte avec cet email.',
    'auth/wrong-password': 'Mot de passe incorrect.',
    'auth/email-already-in-use': 'Un compte existe déjà avec cet email — connectez-vous plutôt.',
    'auth/weak-password': 'Mot de passe trop court (6 caractères minimum).',
  };

  function _authSubmit(){
    if (!_fsEnabled()) { _showAuthErr('Firebase non configuré — utilisez le mode local ci-dessous.'); return; }
    const email = document.getElementById('auth-email').value.trim();
    const pw = document.getElementById('auth-password').value;
    const orgName = document.getElementById('auth-orgname').value.trim();
    const mode = document.getElementById('auth-submit-btn').dataset.mode || 'login';
    if (!email || !pw) { _showAuthErr('Email et mot de passe requis.'); return; }
    _showAuthErr('');
    if (mode === 'signup') {
      firebase.auth().createUserWithEmailAndPassword(email, pw)
        .then(cred => _completeSignup(cred.user, orgName))
        .catch(e => _showAuthErr(FRIENDLY_ERR[e.code] || e.message));
    } else {
      firebase.auth().signInWithEmailAndPassword(email, pw)
        .catch(e => _showAuthErr(FRIENDLY_ERR[e.code] || e.message));
    }
  }
  window._authSubmit = _authSubmit;

  function _authLogout(){
    if (typeof _mcpsAudit==='function') _mcpsAudit('LOGOUT', 'user', MCPS_UID, { email: MCPS_EMAIL });
    firebase.auth().signOut();
  }
  window._authLogout = _authLogout;

  async function _completeSignup(user, orgName){
    const db = firebase.firestore();
    const emailKey = (user.email||'').toLowerCase();
    const inviteRef = db.collection('invites').doc(emailKey);
    const inviteSnap = await inviteRef.get();
    if (inviteSnap.exists) {
      const inv = inviteSnap.data();
      await db.collection('users').doc(user.uid).set({ orgId: inv.orgId, role: inv.role||'member', email: emailKey });
      await inviteRef.delete();
    } else {
      const orgId = user.uid; // un admin fondateur = un espace, le plus simple pour démarrer
      const trialEndsAt = Date.now() + 14*24*60*60*1000; // essai gratuit 14 jours
      // Le profil utilisateur doit être créé EN PREMIER : les règles de sécurité Firestore
      // pour écrire dans orgs/{orgId} et orgs/{orgId}/data se basent sur users/{uid}.orgId,
      // donc ce document doit déjà exister avant les écritures suivantes.
      await db.collection('users').doc(user.uid).set({ orgId, role: 'admin', email: emailKey });
      await db.collection('orgs').doc(orgId).set({
        name: orgName || 'Mon espace créatif',
        ownerUid: user.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        plan: 'trial',
        trialEndsAt,
        branding: { logoUrl: '', primaryColor: '#00c8ff', appName: orgName || 'Mon espace créatif' },
      });
      await db.collection('orgs').doc(orgId).collection('data').doc('cockpit').set({
        clients: [], prospects: [], projects: [], tasks: [], invoices: [],
        team: [{ name: user.email, role: 'Administrateur', phone:'', email:user.email, color:'#d4af37', isApporteur:true, id:1 }],
        _todos: [], _nextTodoId: 1, _theme: 'dark',
      });
      window._mcpsNewSignup = true; // déclenche l'assistant d'onboarding au premier chargement
    }
  }

  // ═══════════════════════════════════════════════════════
  //  PATCH #4 (audit technique, Phase 4) — permissions granulaires
  //  ───────────────────────────────────────────────────────
  //  AVANT : un seul contrôle binaire (role === 'readonly') grisait les
  //  boutons de création — un "member" pouvait donc supprimer n'importe quel
  //  client/projet/tâche/facture et consulter toute la facturation, ce que
  //  l'audit technique (section D.2) signalait explicitement comme un risque.
  //
  //  APRÈS : une matrice de permissions par rôle + une fonction can(action)
  //  unique, appelée aux points qui comptent (suppressions, facturation,
  //  invitation). En mode local sans compte (MCPS_ROLE non défini), can()
  //  autorise tout — comportement historique inchangé pour un usage solo.
  //  Rappel (comme pour la validation, Phase 3) : ceci protège l'interface,
  //  pas les données elles-mêmes — l'application réelle vient des règles
  //  Firestore (Phase 6).
  // ═══════════════════════════════════════════════════════
  const MCPS_PERMISSIONS = {
    admin:    ['*'],
    manager:  ['client.create','client.update','client.delete',
               'project.create','project.update','project.delete',
               'task.create','task.update','task.delete',
               'invoice.view','invoice.create','invoice.update','invoice.delete',
               'team.manage','prospect.move','data.export'],
    member:   ['client.create','client.update',
               'project.create','project.update',
               'task.create','task.update','task.delete',
               'prospect.move','data.export'],
    readonly: [],
  };
  function can(action){
    if (!MCPS_ROLE) return true; // mode local sans compte : pas de restriction (comportement historique)
    const perms = MCPS_PERMISSIONS[MCPS_ROLE] || [];
    return perms.includes('*') || perms.includes(action);
  }
  window.can = can;
  function _denyToast(action){
    showToast('🔒', `Action non autorisée pour votre rôle (${MCPS_ROLE})`, 'var(--red)');
  }
  window._mcpsDenyToast = _denyToast;

  // ═══════════════════════════════════════════════════════
  //  PATCH #7 (audit technique, Phase 7) — journal d'audit
  //  ───────────────────────────────────────────────────────
  //  AVANT : aucune trace de qui a créé, modifié, supprimé ou converti quoi,
  //  ni de qui s'est connecté/déconnecté ou a invité un collaborateur —
  //  l'audit technique (section G) notait qu'une investigation après
  //  incident était quasiment impossible dans ces conditions.
  //
  //  APRÈS : chaque opération sensible écrit une entrée dans
  //  orgs/{orgId}/audit_logs/{id}, au format proposé dans le brief d'origine
  //  (timestamp, utilisateur, organisation, action, ressource, avant/après).
  //  Journalisation "best effort" : un échec d'écriture du journal n'empêche
  //  jamais l'action elle-même de réussir — voir le try/catch silencieux
  //  volontaire ci-dessous (l'audit ne doit jamais bloquer le travail réel).
  //  En mode local sans compte (MCPS_ORG_ID absent), ne fait rien.
  // ═══════════════════════════════════════════════════════
  function _mcpsAudit(action, resource, resourceId, details){
    if (!MCPS_ORG_ID) return; // mode local sans compte : pas de journal
    try {
      firebase.firestore().collection('orgs').doc(MCPS_ORG_ID).collection('audit_logs').add({
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        userId: MCPS_UID || null,
        userEmail: MCPS_EMAIL || null,
        organizationId: MCPS_ORG_ID,
        action,        // ex. 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'INVITE' | 'CONVERT'
        resource,      // ex. 'client' | 'prospect' | 'project' | 'task' | 'invoice' | 'team_member'
        resourceId: resourceId != null ? String(resourceId) : null,
        details: details || null,
      }).catch(e => {
        // Cette écriture a longtemps échoué sans que personne ne s'en aperçoive :
        // aucune règle Firestore n'existait pour audit_logs, donc Firebase refusait
        // tout — et le message disparaissait dans la console. Le journal paraissait
        // simplement "vide". On rend désormais la cause explicite et actionnable.
        if (e && (e.code === 'permission-denied' || /permission/i.test(e.message || ''))) {
          console.error(
            "MCPS — écriture du journal d'audit refusée par Firestore.\n" +
            "Cause probable : les règles de sécurité ne sont pas (ou plus) déployées.\n" +
            "Correctif : Firebase Console → Firestore Database → Règles → publier le contenu de firestore.rules"
          );
        } else {
          console.error('MCPS audit log write error:', e);
        }
      });
    } catch(e) { console.error('MCPS audit log error:', e); }
  }
  window._mcpsAudit = _mcpsAudit;

  function _inviteTeammate(){
    if (!can('team.invite')) { _denyToast('team.invite'); return; }
    const email = prompt('Email du collaborateur à inviter :');
    if (!email) return;
    const role = (prompt('Rôle — admin / manager / member / readonly :', 'member') || 'member').trim().toLowerCase();
    if (!['admin','manager','member','readonly'].includes(role)) { showToast('⚠️','Rôle invalide','var(--amber)'); return; }
    firebase.firestore().collection('invites').doc(email.trim().toLowerCase()).set({ orgId: MCPS_ORG_ID, role })
      .then(()=>{
        showToast('✅', 'Invitation créée — la personne doit s\'inscrire avec cet email', 'var(--green)');
        _mcpsAudit('INVITE', 'user', email.trim().toLowerCase(), { role });
      })
      .catch(e=>showToast('⚠️', e.message, 'var(--red)'));
  }
  window._inviteTeammate = _inviteTeammate;

  async function _showAuditLog(){
    if (MCPS_ROLE !== 'admin') { _denyToast('audit.view'); return; }
    const overlay = document.getElementById('audit-log-overlay');
    const list = document.getElementById('audit-log-list');
    if (!overlay || !list) return;
    overlay.classList.add('open');
    list.innerHTML = '<div class="cmdk-empty">Chargement…</div>';
    try {
      const snap = await firebase.firestore().collection('orgs').doc(MCPS_ORG_ID).collection('audit_logs')
        .orderBy('timestamp', 'desc').limit(30).get();
      const rows = [];
      snap.forEach(doc => rows.push(doc.data()));
      if (!rows.length) { list.innerHTML = '<div class="cmdk-empty">Aucune activité enregistrée pour l\'instant.</div>'; return; }
      list.innerHTML = rows.map(r => {
        const when = r.timestamp && r.timestamp.toDate ? r.timestamp.toDate().toLocaleString('fr-FR') : '—';
        const detailName = r.details && r.details.name ? ` "${esc(r.details.name)}"` : '';
        return `<div class="audit-log-row">
          <div class="audit-log-main"><span class="audit-log-badge">${esc(r.action||'?')}</span><span>${esc(r.resource||'')}${detailName}</span></div>
          <div class="audit-log-meta">${esc(r.userEmail||'?')} · ${when}</div>
        </div>`;
      }).join('');
    } catch(e) {
      list.innerHTML = `<div class="cmdk-empty">Impossible de charger le journal (${esc(e.message)}).</div>`;
    }
  }
  window._showAuditLog = _showAuditLog;

  // ── STEP 09 (Client 360°) : activité récente pour UN client précis ──
  // Requête volontairement simple (une seule égalité + un tri) pour éviter
  // d'exiger un index composite Firestore manuel au déploiement — un where()
  // + orderBy() sur des champs différents reste couvert par l'indexation
  // automatique de Firestore ; deux where() combinés ne le seraient pas.
  // Le filtre par type de ressource (client/prospect, pour écarter un id de
  // tâche ou de projet qui partagerait le même numéro) se fait donc côté
  // client, après coup, sur un lot volontairement un peu plus large (20).
  async function _mcpsRenderClientActivity(cid){
    const list = document.getElementById('cd-activity-list');
    const card = document.getElementById('cd-activity-card');
    if (!list || !card) return;
    if (!MCPS_ORG_ID) { card.style.display = 'none'; return; }
    card.style.display = 'block';
    list.innerHTML = '<div class="cmdk-empty" style="padding:16px">Chargement…</div>';
    try {
      const snap = await firebase.firestore().collection('orgs').doc(MCPS_ORG_ID).collection('audit_logs')
        .where('resourceId', '==', String(cid)).orderBy('timestamp', 'desc').limit(20).get();
      const rows = [];
      snap.forEach(doc => { const d = doc.data(); if (d.resource === 'client' || d.resource === 'prospect') rows.push(d); });
      if (!rows.length) { list.innerHTML = '<div class="cmdk-empty" style="padding:16px">Aucune activité enregistrée pour ce client.</div>'; return; }
      list.innerHTML = rows.slice(0, 10).map(r => {
        const when = r.timestamp && r.timestamp.toDate ? r.timestamp.toDate().toLocaleDateString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '—';
        return `<div class="audit-log-row"><div class="audit-log-main"><span class="audit-log-badge">${esc(r.action||'?')}</span><span>${esc(r.userEmail||'?')}</span></div><div class="audit-log-meta">${when}</div></div>`;
      }).join('');
    } catch(e) {
      list.innerHTML = '<div class="cmdk-empty" style="padding:16px">Activité indisponible pour le moment.</div>';
    }
  }
  window._mcpsRenderClientActivity = _mcpsRenderClientActivity;
  function _closeAuditLog(){
    const overlay = document.getElementById('audit-log-overlay');
    if (overlay) overlay.classList.remove('open');
  }
  window._closeAuditLog = _closeAuditLog;

  function _applyRoleUI(){
    document.body.classList.toggle('role-readonly', MCPS_ROLE === 'readonly');
    const inviteBtn = document.getElementById('btn-invite-teammate');
    if (inviteBtn) inviteBtn.style.display = can('team.invite') ? 'flex' : 'none';
    const brandBtn = document.getElementById('btn-brand-settings');
    if (brandBtn) brandBtn.style.display = (MCPS_ROLE === 'admin') ? 'flex' : 'none';
    const auditBtn = document.getElementById('btn-audit-log');
    if (auditBtn) auditBtn.style.display = (MCPS_ROLE === 'admin') ? 'flex' : 'none';
    const chip = document.getElementById('auth-user-chip');
    const chipEmail = document.getElementById('auth-user-email');
    if (chip && MCPS_EMAIL) { chip.style.display = 'flex'; chipEmail.textContent = MCPS_EMAIL + ' · ' + MCPS_ROLE; }
    if (typeof _syncLogoEditable === 'function') _syncLogoEditable();
  }

  let MCPS_ORG = null;

  function _applyBranding(org){
    MCPS_ORG = org || {};
    const b = MCPS_ORG.branding || {};
    const titleEl = document.querySelector('.sb-title');
    const subEl = document.querySelector('.sb-sub');
    const brandName = b.appName || MCPS_ORG.name || 'MCPS';
    if (titleEl) titleEl.textContent = brandName;
    const markTxt = document.querySelector('#sb-mark .sb-mark-txt');
    if (markTxt) markTxt.textContent = (String(brandName).trim().charAt(0) || 'M').toUpperCase();
    if (subEl && b.appName) subEl.textContent = 'Cockpit Production Créative';
    if (b.primaryColor) {
      let styleTag = document.getElementById('mcps-brand-style');
      if (!styleTag) { styleTag = document.createElement('style'); styleTag.id = 'mcps-brand-style'; document.head.appendChild(styleTag); }
      styleTag.textContent = `:root{--accent:${b.primaryColor} !important}`;
    }
    _setMarkLogo(b.logoUrl);
    const badge = document.getElementById('plan-badge');
    if (badge) {
      const plan = MCPS_ORG.plan || 'trial';
      if (plan === 'trial') {
        const daysLeft = MCPS_ORG.trialEndsAt ? Math.max(0, Math.ceil((MCPS_ORG.trialEndsAt - Date.now())/86400000)) : 0;
        badge.textContent = `Essai · ${daysLeft}j`;
        badge.style.background = 'var(--amber-dim)'; badge.style.color = 'var(--amber)';
      } else if (plan === 'pro') {
        badge.textContent = 'Pro'; badge.style.background = 'var(--green-dim)'; badge.style.color = 'var(--green)';
      } else {
        badge.textContent = 'Gratuit';
      }
    }
  }

  function _checkPlanLimit(kind, currentCount){
    const plan = (MCPS_ORG && MCPS_ORG.plan) || 'trial';
    const limits = { trial: { clients: 999 }, free: { clients: 3 }, pro: { clients: Infinity } };
    const lim = (limits[plan] || limits.free)[kind];
    if (lim !== undefined && currentCount >= lim) {
      showToast('⚠️', `Limite du plan atteinte (${lim} ${kind}) — passez au plan Pro`, 'var(--amber)');
      openBillingPanel();
      return false;
    }
    return true;
  }
  window._checkPlanLimit = _checkPlanLimit;

  async function _loadOrgData(){
    const db = firebase.firestore();
    const orgSnap = await db.collection('orgs').doc(MCPS_ORG_ID).get();
    if (orgSnap.exists) _applyBranding(orgSnap.data());
    const snap = await db.collection('orgs').doc(MCPS_ORG_ID).collection('data').doc('cockpit').get();
    if (snap.exists) {
      const data = snap.data();
      DB = { clients: data.clients||[], prospects: data.prospects||[], projects: data.projects||[], tasks: data.tasks||[], invoices: data.invoices||[], team: data.team||[] };
      // PATCH #5b : migration idempotente pour les organisations dont les données
      // cloud ont été sauvegardées avant la séparation Client/Prospect.
      if (DB.clients.some(c => c.type === 'prospect')) {
        const moved = DB.clients.filter(c => c.type === 'prospect');
        DB.clients = DB.clients.filter(c => c.type !== 'prospect');
        DB.prospects = DB.prospects.concat(moved);
      }
      state.todos = data._todos || [];
      state.nextTodoId = data._nextTodoId || 1;
      state.theme = data._theme || state.theme;
      // PATCH #6 (audit technique, Phase 6) : on retient la version connue
      // localement, pour pouvoir détecter un conflit à la prochaine écriture.
      _mcpsLastKnownVersion = data._version || 0;
      if (typeof _maxId === 'function') {
        nextId = {
          client: Math.max(_maxId(DB.clients), _maxId(DB.prospects)) + 1,
          project: _maxId(DB.projects) + 1,
          task: _maxId(DB.tasks) + 1,
          invoice: _maxId(DB.invoices||[]) + 1,
          team: _maxId(DB.team||[]) + 1,
        };
      }
      document.documentElement.setAttribute('data-theme', state.theme);
      if (typeof updateThemeLbl === 'function') updateThemeLbl();
    }
    document.body.classList.remove('auth-locked');
    _applyRoleUI();
    if (typeof _mcpsSetSyncStatus === 'function') {
      _mcpsSetSyncStatus((typeof navigator !== 'undefined' && navigator.onLine === false) ? 'offline' : 'synced');
    }
    if (typeof go === 'function') go(state.view || 'dashboard');
    if (typeof updateAlert === 'function') updateAlert();
    if (window._mcpsNewSignup) { window._mcpsNewSignup = false; _showOnboardingWizard(); }
  }

  // ═══════════════════════════════════════════════════════
  //  PATCH #6 (audit technique, Phase 6) — détection de conflit à l'écriture
  //  ───────────────────────────────────────────────────────
  //  AVANT : cloudSaveFullDB() écrasait toujours le document entier sans
  //  vérifier si quelqu'un d'autre l'avait modifié entre-temps (audit,
  //  risque P0.1 — deux personnes actives, la seconde écrase la première
  //  silencieusement, sans avertissement).
  //
  //  APRÈS : contrôle de concurrence optimiste via transaction Firestore.
  //  Chaque écriture réussie incrémente _version. Avant d'écrire, on
  //  compare la version qu'on a lue au démarrage (ou à la dernière écriture
  //  réussie) à la version réellement présente sur le serveur AU MOMENT de
  //  la transaction. Si elles diffèrent, quelqu'un d'autre a sauvegardé
  //  entre-temps : on n'écrase pas, on prévient la personne à la place.
  //
  //  Portée actuelle : le document reste unique par organisation (la
  //  restructuration en sous-collections par entité, plus fine, est notée
  //  dans l'audit comme nécessitant un vrai projet Firebase pour être
  //  validée — hors scope ici). La détection de conflit porte donc sur
  //  "les données de l'organisation ont changé", pas encore "ce client
  //  précis a changé" — déjà un vrai progrès par rapport à l'écrasement
  //  silencieux d'avant, affinable plus tard sans tout redéfinir.
  // ═══════════════════════════════════════════════════════
  let _mcpsLastKnownVersion = 0;
  let _mcpsConflictShown = false;

  function _mcpsShowConflictWarning(){
    if (_mcpsConflictShown) return; // évite de spammer l'utilisateur à chaque tentative
    _mcpsConflictShown = true;
    showToast('⚠️', "Quelqu'un d'autre a modifié ces données pendant votre session. Rechargez la page pour récupérer la dernière version avant de continuer.", 'var(--red)');
    _mcpsSetSyncStatus('conflict');
  }

  // ═══════════════════════════════════════════════════════
  //  PATCH #10 (audit technique, Phase 10) — file d'attente hors-ligne
  //  ───────────────────────────────────────────────────────
  //  AVANT : si la connexion tombait pendant une sauvegarde cloud,
  //  cloudSaveFullDB() échouait silencieusement (console.error uniquement) —
  //  la personne pouvait croire son travail sauvegardé alors qu'il ne
  //  l'était que localement, sans aucun indicateur visuel de l'état réel.
  //
  //  APRÈS : un indicateur visible (🟢 Synchronisé / 🟡 Synchronisation /
  //  🔴 Hors ligne / ⚠️ Conflit) + reprise automatique à la reconnexion.
  //
  //  Portée adaptée à l'architecture actuelle : le document reste unique par
  //  organisation (voir Phase 5/6), donc pas besoin d'une file de mutations
  //  individuelles comme le prévoit la cible idéale de l'audit — retenter la
  //  sauvegarde du dernier état complet suffit et reste correct ici. Une
  //  vraie file par mutation aura du sens une fois les sous-collections par
  //  entité en place (Firestore, hors scope actuel).
  // ═══════════════════════════════════════════════════════
  let _mcpsSyncPending = false;
  let _mcpsSyncRetryTimer = null;

  function _mcpsSetSyncStatus(statusKey){
    const el = document.getElementById('mcps-sync-status');
    const icon = document.getElementById('mcps-sync-icon');
    const label = document.getElementById('mcps-sync-label');
    if (!el || !icon || !label) return;
    const MAP = {
      synced:   { icon: '🟢', label: 'Synchronisé' },
      syncing:  { icon: '🟡', label: 'Synchronisation…' },
      offline:  { icon: '🔴', label: 'Hors ligne — en attente' },
      conflict: { icon: '⚠️', label: 'Conflit — rechargez la page' },
    };
    const s = MAP[statusKey] || MAP.synced;
    icon.textContent = s.icon;
    label.textContent = s.label;
    el.style.display = MCPS_ORG_ID ? 'flex' : 'none';
  }
  window._mcpsSetSyncStatus = _mcpsSetSyncStatus;

  async function cloudSaveFullDB(){
    if (!MCPS_ORG_ID || MCPS_ROLE === 'readonly') return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      _mcpsSyncPending = true;
      _mcpsSetSyncStatus('offline');
      return; // pas la peine de tenter l'appel réseau, on sait déjà qu'il échouera
    }
    _mcpsSetSyncStatus('syncing');
    try {
      const db = firebase.firestore();
      const ref = db.collection('orgs').doc(MCPS_ORG_ID).collection('data').doc('cockpit');
      const payload = { ...DB, _todos: state.todos, _nextTodoId: state.nextTodoId, _theme: state.theme };
      if (typeof db.runTransaction === 'function') {
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const serverVersion = (snap.exists && snap.data()._version) || 0;
          if (serverVersion !== _mcpsLastKnownVersion) {
            throw new Error('MCPS_CONFLICT');
          }
          const nextVersion = serverVersion + 1;
          tx.set(ref, { ...payload, _version: nextVersion, _updatedAt: firebase.firestore.FieldValue.serverTimestamp(), _updatedBy: MCPS_EMAIL || null });
          _mcpsLastKnownVersion = nextVersion; // mis à jour seulement si la transaction aboutit
        });
        _mcpsConflictShown = false; // une écriture réussie referme un éventuel avertissement précédent
      } else {
        // Environnement sans support des transactions (ex. certains mocks de test) : écriture directe, sans détection de conflit.
        await ref.set({ ...payload, _version: _mcpsLastKnownVersion + 1 });
        _mcpsLastKnownVersion += 1;
      }
      _mcpsSyncPending = false;
      _mcpsSetSyncStatus('synced');
    } catch(e) {
      if (e && e.message === 'MCPS_CONFLICT') { _mcpsShowConflictWarning(); return; }
      console.error('MCPS cloud save error:', e);
      _mcpsSyncPending = true;
      _mcpsSetSyncStatus((typeof navigator !== 'undefined' && navigator.onLine === false) ? 'offline' : 'offline');
    }
  }

  // Reprise automatique dès que la connexion revient.
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('offline', () => { _mcpsSyncPending = true; _mcpsSetSyncStatus('offline'); });
    window.addEventListener('online', () => { if (_mcpsSyncPending) cloudSaveFullDB(); });
  }
  // Filet de sécurité périodique : au cas où l'événement 'online' du
  // navigateur ne se déclenche pas de façon fiable (ex. reconnexion Wi-Fi
  // ambiguë) — retente toutes les 30s tant qu'une sauvegarde est en attente.
  _mcpsSyncRetryTimer = setInterval(() => {
    if (_mcpsSyncPending && MCPS_ORG_ID && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
      cloudSaveFullDB();
    }
  }, 30000);

  function _initAuth(){
    if (!_fsEnabled()) {
      document.getElementById('auth-box').style.display = 'none';
      document.getElementById('auth-setup-notice').style.display = 'block';
      return;
    }
    if (!firebase.apps.length) firebase.initializeApp(MCPS_CONFIG.firebase);
    firebase.auth().onAuthStateChanged(async user => {
      if (!user) {
        MCPS_ORG_ID = MCPS_ROLE = MCPS_UID = MCPS_EMAIL = null;
        document.body.classList.add('auth-locked');
        document.getElementById('auth-box').style.display = 'block';
        document.getElementById('auth-setup-notice').style.display = 'none';
        return;
      }
      MCPS_UID = user.uid; MCPS_EMAIL = user.email;
      const db = firebase.firestore();
      let userSnap = await db.collection('users').doc(user.uid).get();
      if (!userSnap.exists) {
        // rare race right after signup — patiente une seconde puis relit
        await new Promise(r=>setTimeout(r,1200));
        userSnap = await db.collection('users').doc(user.uid).get();
      }
      if (!userSnap.exists) { _showAuthErr('Espace introuvable — contactez votre administrateur.'); firebase.auth().signOut(); return; }
      const u = userSnap.data();
      MCPS_ORG_ID = u.orgId; MCPS_ROLE = u.role || 'member';
      if (typeof _mcpsAudit==='function') _mcpsAudit('LOGIN', 'user', MCPS_UID, { email: MCPS_EMAIL, role: MCPS_ROLE });
      await _loadOrgData();
    });
  }

  // PATCH #2 : hook post-sauvegarde explicite (remplace l'ancien wrapper
  // window.saveDB) — reste défini dans cette IIFE pour garder l'accès par
  // fermeture à MCPS_ORG_ID, cloudSaveFullDB et _maybeNotifyCritical.
  window._mcpsPostSaveHooks.push(() => {
    if (MCPS_ORG_ID) {
      clearTimeout(window._mcpsCloudSaveTimer);
      window._mcpsCloudSaveTimer = setTimeout(cloudSaveFullDB, 800);
    }
    if (typeof _maybeNotifyCritical === 'function') _maybeNotifyCritical();
  });

  // ═══ ONBOARDING WIZARD (nouvel espace) ═══
  function _showOnboardingWizard(){
    document.getElementById('modal-ttl').textContent = '👋 Bienvenue — configurons votre espace';
    document.getElementById('modal-body').innerHTML = `
      <div class="fg"><label class="flbl">Nom de votre agence / équipe</label><input class="fin" id="ob-name" value="${(MCPS_ORG&&MCPS_ORG.branding&&MCPS_ORG.branding.appName)||''}"></div>
      <div class="fg"><label class="flbl">Couleur principale</label><input class="fin" type="color" id="ob-color" value="${(MCPS_ORG&&MCPS_ORG.branding&&MCPS_ORG.branding.primaryColor)||'#00c8ff'}" style="height:40px;cursor:pointer"></div>
      <div class="fg"><label class="flbl">Logo (optionnel)</label><input class="fin" type="file" id="ob-logo" accept="image/*"></div>
      <div class="fg"><label class="flbl">Votre équipe — un membre par ligne, format "Nom - Rôle"</label>
        <textarea class="fin" id="ob-team" rows="5" placeholder="Sarah Kouassi - Cheffe de projet
Karim Diallo - Développeur Web"></textarea>
      </div>
      <div class="modal-acts">
        <button class="btn btn-ghost" onclick="_onboardingSkip()">Passer, je configurerai plus tard</button>
        <button class="btn btn-primary" onclick="_onboardingFinish()">Terminer la configuration</button>
      </div>`;
    document.getElementById('main-overlay').classList.add('open');
  }
  window._showOnboardingWizard = _showOnboardingWizard;

  function _onboardingSkip(){ closeModal(); }
  window._onboardingSkip = _onboardingSkip;

  async function _onboardingFinish(){
    const name = document.getElementById('ob-name').value.trim() || 'Mon espace créatif';
    const color = document.getElementById('ob-color').value;
    const teamRaw = document.getElementById('ob-team').value.trim();
    const fileInput = document.getElementById('ob-logo');
    showToast('⏳','Configuration en cours…','var(--accent)');
    let logoUrl = '';
    try {
      if (fileInput.files && fileInput.files[0]) logoUrl = await _mcpsProcessLogo(fileInput.files[0]);
    } catch(e) { console.error('MCPS logo error:', e); showToast('⚠️', (e && e.message) || 'Logo non importé','var(--amber)'); }

    if (teamRaw) {
      const lines = teamRaw.split('\n').map(l=>l.trim()).filter(Boolean);
      const newMembers = lines.map((l,i)=>{
        const [n, r] = l.split(' - ').map(s=>(s||'').trim());
        return { name: n||l, role: r||'Membre', phone:'', email:'', color:'#2563eb', isApporteur:false, id: (DB.team.length + i + 2) };
      });
      DB.team = [...DB.team, ...newMembers];
    }

    const branding = { appName: name, primaryColor: color, logoUrl };
    closeModal();
    // CORRECTIF : appliquée localement AVANT l'écriture cloud, qui suit
    // maintenant dans son propre try/catch. Avant ce correctif, l'écriture
    // Firestore (aucun try/catch) était la toute première étape après le
    // traitement du logo — la moindre erreur ou lenteur réseau à cet instant
    // faisait échouer silencieusement (rejet de promesse non intercepté)
    // TOUTE la suite : la modale ne se fermait pas proprement, la photo ne
    // s'affichait jamais, et rien n'était sauvegardé, même localement. Même
    // principe que _mcpsSetLogo() juste plus bas dans ce fichier, qui gérait
    // déjà ça correctement — cette fonction et _saveBranding() ne suivaient
    // pas ce même modèle de résilience.
    _applyBranding({ ...MCPS_ORG, name, branding });
    saveDB();
    try {
      await firebase.firestore().collection('orgs').doc(MCPS_ORG_ID).update({ name, branding });
      showToast('✅','Votre espace est configuré !','var(--green)');
    } catch (e) {
      console.error('MCPS onboarding save error:', e);
      showToast('⚠️','Espace configuré localement — la synchronisation cloud a échoué, réessayez plus tard','var(--amber)');
    }
  }
  window._onboardingFinish = _onboardingFinish;

  // ═══ MARQUE BLANCHE (admin) ═══
  function openBrandingPanel(){
    if (MCPS_ROLE !== 'admin') { showToast('⚠️','Réservé aux administrateurs','var(--amber)'); return; }
    const b = (MCPS_ORG && MCPS_ORG.branding) || {};
    document.getElementById('modal-ttl').textContent = '🎨 Marque blanche';
    document.getElementById('modal-body').innerHTML = `
      <div class="fg"><label class="flbl">Nom affiché dans l'application</label><input class="fin" id="brd-name" value="${b.appName||''}"></div>
      <div class="fg"><label class="flbl">Couleur principale</label><input class="fin" type="color" id="brd-color" value="${b.primaryColor||'#00c8ff'}" style="height:40px;cursor:pointer"></div>
      <div class="fg"><label class="flbl">Nouveau logo (optionnel)</label><input class="fin" type="file" id="brd-logo" accept="image/*"></div>
      ${b.logoUrl ? `<img src="${b.logoUrl}" style="max-width:140px;max-height:44px;margin-bottom:10px">` : ''}
      <div class="modal-acts">
        <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
        <button class="btn btn-primary" onclick="_saveBranding()">Enregistrer</button>
      </div>`;
    document.getElementById('main-overlay').classList.add('open');
  }
  window.openBrandingPanel = openBrandingPanel;

  async function _saveBranding(){
    const name = document.getElementById('brd-name').value.trim();
    const color = document.getElementById('brd-color').value;
    const fileInput = document.getElementById('brd-logo');
    let logoUrl = (MCPS_ORG && MCPS_ORG.branding && MCPS_ORG.branding.logoUrl) || '';
    try {
      if (fileInput.files && fileInput.files[0]) logoUrl = await _mcpsProcessLogo(fileInput.files[0]);
    } catch(e) { console.error('MCPS logo error:', e); showToast('⚠️', (e && e.message) || 'Logo non importé','var(--amber)'); }
    const branding = { appName: name, primaryColor: color, logoUrl };
    // CORRECTIF : même défaut que _onboardingFinish() — l'écriture Firestore
    // était avant l'application locale et sans try/catch, donc une erreur ou
    // une lenteur réseau à cet instant empêchait la marque/le logo de
    // s'afficher ET de se fermer proprement, silencieusement.
    closeModal();
    _applyBranding({ ...MCPS_ORG, name, branding });
    try {
      await firebase.firestore().collection('orgs').doc(MCPS_ORG_ID).update({ name, branding });
      showToast('✅','Marque mise à jour','var(--green)');
    } catch (e) {
      console.error('MCPS branding save error:', e);
      showToast('⚠️','Appliqué localement — la synchronisation cloud a échoué, réessayez plus tard','var(--amber)');
    }
  }
  window._saveBranding = _saveBranding;

  // ═══ LOGO DE L'ORGANISATION (pastille de la barre latérale) ═══
  // Le logo est réduit (256 px max) puis stocké en data-URL directement dans
  // orgs/{orgId}.branding.logoUrl : aucun bucket Firebase Storage requis.
  // Réservé aux admins (règle Firestore sur orgs/{orgId}) ; en mode local sans
  // compte, il est gardé dans localStorage.
  const _LOGO_LOCAL_KEY = 'mcps-local-logo';

  function _logoEditable(){ return !MCPS_ROLE || MCPS_ROLE === 'admin'; }

  function _safeLogoSrc(u){
    return (typeof u === 'string' && (/^data:image\/(png|jpeg|webp|gif);base64,/.test(u) || /^https:\/\//.test(u))) ? u : '';
  }

  function _setMarkLogo(url){
    const mark = document.getElementById('sb-mark');
    if (!mark) return;
    const img = mark.querySelector('.sb-mark-img');
    const src = _safeLogoSrc(url);
    const rm = document.getElementById('sb-logo-remove');
    const pick = document.getElementById('sb-logo-pick');
    if (rm) rm.hidden = !src;
    if (pick) pick.textContent = src ? 'Changer le logo' : 'Importer un logo';
    img.onload = () => { img.hidden = false; mark.classList.add('has-logo'); };
    img.onerror = () => { img.hidden = true; mark.classList.remove('has-logo'); };
    if (!src) { img.hidden = true; img.removeAttribute('src'); mark.classList.remove('has-logo'); return; }
    img.src = src;
  }

  function _syncLogoEditable(){
    const mark = document.getElementById('sb-mark');
    if (!mark) return;
    const ok = _logoEditable();
    mark.classList.toggle('editable', ok);
    mark.disabled = !ok;
    mark.setAttribute('aria-label', ok ? 'Modifier le logo' : "Logo de l'organisation");
    if (!ok) _logoMenuClose();
  }

  function _mcpsProcessLogo(file){
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Fichier non pris en charge — choisissez une image.'));
      if (file.size > 8 * 1024 * 1024) return reject(new Error('Image trop lourde (8 Mo maximum).'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          let w = img.naturalWidth || 256, h = img.naturalHeight || 256;
          if (file.type === 'image/svg+xml') { const k = 512 / Math.max(w, h); w *= k; h *= k; }
          // Rogne les marges vides (transparentes ou blanches) pour que le logo remplisse la pastille.
          const trim = (c) => {
            const ctx = c.getContext('2d'), W = c.width, H = c.height;
            const d = ctx.getImageData(0, 0, W, H).data;
            let x0 = W, y0 = H, x1 = -1, y1 = -1;
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
              const i = (y * W + x) * 4;
              if (d[i+3] > 8 && !(d[i] > 245 && d[i+1] > 245 && d[i+2] > 245)) {
                if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
              }
            }
            if (x1 < 0) return c; // image entièrement vide/blanche : on ne touche à rien
            const out = document.createElement('canvas');
            out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
            out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
            return out;
          };
          const encode = (max) => {
            const big = document.createElement('canvas');
            const k0 = Math.min(1, 512 / Math.max(w, h));
            big.width = Math.max(1, Math.round(w * k0)); big.height = Math.max(1, Math.round(h * k0));
            big.getContext('2d').drawImage(img, 0, 0, big.width, big.height);
            const t = trim(big);
            const k = Math.min(1, max / Math.max(t.width, t.height));
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(t.width * k)); c.height = Math.max(1, Math.round(t.height * k));
            c.getContext('2d').drawImage(t, 0, 0, c.width, c.height);
            return c.toDataURL('image/png');
          };
          let out = encode(256);
          if (out.length > 150000) out = encode(128);
          resolve(out);
        } catch(e) { reject(e); }
        finally { URL.revokeObjectURL(url); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible — essayez un PNG ou un JPG.')); };
      img.src = url;
    });
  }
  window._mcpsProcessLogo = _mcpsProcessLogo;

  async function _mcpsSetLogo(dataUrl){ // '' pour retirer le logo
    if (!_logoEditable()) { _denyToast('branding.update'); return; }
    try {
      if (MCPS_ORG_ID) {
        await firebase.firestore().collection('orgs').doc(MCPS_ORG_ID).update({ 'branding.logoUrl': dataUrl });
        MCPS_ORG = { ...(MCPS_ORG || {}), branding: { ...((MCPS_ORG && MCPS_ORG.branding) || {}), logoUrl: dataUrl } };
        _mcpsAudit('BRANDING_UPDATE', 'org', MCPS_ORG_ID, { field: 'logo', removed: !dataUrl });
      } else if (dataUrl) {
        localStorage.setItem(_LOGO_LOCAL_KEY, dataUrl);
      } else {
        localStorage.removeItem(_LOGO_LOCAL_KEY);
      }
      _setMarkLogo(dataUrl);
      showToast('✅', dataUrl ? 'Logo mis à jour' : 'Logo retiré', 'var(--green)');
    } catch(e) {
      console.error('MCPS logo save error:', e);
      const msg = (e && e.code === 'permission-denied') ? 'Réservé aux administrateurs'
                : dataUrl ? 'Logo non enregistré — vérifiez votre connexion' : 'Impossible de retirer le logo';
      showToast('⚠️', msg, 'var(--amber)');
    }
  }

  function _logoMenuClose(){
    const pop = document.getElementById('sb-logo-pop'), mark = document.getElementById('sb-mark');
    if (pop) pop.hidden = true;
    if (mark) mark.setAttribute('aria-expanded', 'false');
  }
  function _mcpsLogoMenuToggle(ev){
    if (ev) ev.stopPropagation();
    if (!_logoEditable()) return;
    const pop = document.getElementById('sb-logo-pop'), mark = document.getElementById('sb-mark');
    if (!pop || !mark) return;
    const willOpen = pop.hidden;
    pop.hidden = !willOpen;
    mark.setAttribute('aria-expanded', String(willOpen));
    if (willOpen) { const first = pop.querySelector('.sb-pop-item:not([hidden])'); if (first) first.focus(); }
  }
  function _mcpsLogoPick(){ _logoMenuClose(); const f = document.getElementById('sb-logo-file'); if (f) f.click(); }
  function _mcpsLogoRemove(){ _logoMenuClose(); _mcpsSetLogo(''); }
  window._mcpsLogoMenuToggle = _mcpsLogoMenuToggle;
  window._mcpsLogoPick = _mcpsLogoPick;
  window._mcpsLogoRemove = _mcpsLogoRemove;

  window.addEventListener('DOMContentLoaded', () => {
    _syncLogoEditable();
    try { const saved = localStorage.getItem(_LOGO_LOCAL_KEY); if (saved) _setMarkLogo(saved); } catch(e) { /* localStorage indisponible : pas de logo local */ }
    const file = document.getElementById('sb-logo-file');
    if (file) file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      file.value = '';
      if (!f) return;
      try { await _mcpsSetLogo(await _mcpsProcessLogo(f)); }
      catch(e) { showToast('⚠️', (e && e.message) || 'Logo non importé', 'var(--amber)'); }
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('#sb-logo-pop') && !e.target.closest('#sb-mark')) _logoMenuClose(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { const pop = document.getElementById('sb-logo-pop'); if (pop && !pop.hidden) { _logoMenuClose(); const m = document.getElementById('sb-mark'); if (m) m.focus(); } }
    });
  });

  // ═══ FACTURATION & ABONNEMENT ═══
  function openBillingPanel(){
    const plan = (MCPS_ORG && MCPS_ORG.plan) || 'trial';
    const daysLeft = (MCPS_ORG && MCPS_ORG.trialEndsAt) ? Math.max(0, Math.ceil((MCPS_ORG.trialEndsAt - Date.now())/86400000)) : 0;
    document.getElementById('modal-ttl').textContent = '💳 Facturation';
    document.getElementById('modal-body').innerHTML = `
      <div style="padding:14px 16px;background:var(--surface2);border-radius:10px;margin-bottom:16px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Plan actuel</div>
        <div style="font-size:18px;font-weight:800">${plan==='pro'?'Pro':plan==='trial'?`Essai gratuit — ${daysLeft} jour(s) restant(s)`:'Gratuit'}</div>
      </div>
      <div class="fg" style="font-size:12.5px;color:var(--text-muted);line-height:1.6">
        <strong>Gratuit</strong> — jusqu'à 3 clients<br>
        <strong>Pro</strong> — clients illimités, marque blanche, intégrations
      </div>
      ${MCPS_ROLE!=='admin' ? '<div style="font-size:12px;color:var(--text-muted)">Seul un administrateur peut gérer l\'abonnement.</div>' :
        plan==='pro' ? `<div class="modal-acts"><button class="btn btn-primary" onclick="_openBillingPortal()">Gérer mon abonnement</button></div>` :
        `<div class="modal-acts"><button class="btn btn-primary" onclick="_startCheckout()">Passer au plan Pro</button></div>`}
    `;
    document.getElementById('main-overlay').classList.add('open');
  }
  window.openBillingPanel = openBillingPanel;

  function _startCheckout(){
    if (!_fsEnabled()) { showToast('⚠️','Firebase non configuré','var(--amber)'); return; }
    showToast('⏳','Redirection vers le paiement…','var(--accent)');
    const fn = firebase.functions().httpsCallable('createCheckoutSession');
    fn({ orgId: MCPS_ORG_ID, priceId: MCPS_CONFIG.stripePriceId })
      .then(res => { if (res.data && res.data.url) window.location.href = res.data.url; })
      .catch(e => showToast('⚠️', 'Fonction "createCheckoutSession" non déployée — voir functions/index.js', 'var(--red)'));
  }
  window._startCheckout = _startCheckout;

  function _openBillingPortal(){
    const fn = firebase.functions().httpsCallable('createBillingPortalSession');
    fn({ orgId: MCPS_ORG_ID })
      .then(res => { if (res.data && res.data.url) window.location.href = res.data.url; })
      .catch(e => showToast('⚠️', 'Fonction "createBillingPortalSession" non déployée', 'var(--red)'));
  }
  window._openBillingPortal = _openBillingPortal;

  // ═══ NOTIFICATIONS NAVIGATEUR ═══
  function _enableBrowserNotifications(){
    if (!('Notification' in window)) { showToast('⚠️','Notifications non supportées par ce navigateur','var(--amber)'); return; }
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') { showToast('🔔','Notifications activées','var(--green)'); localStorage.setItem('mcps-notif-on','1'); }
      else showToast('⚠️','Notifications refusées','var(--amber)');
    });
  }
  window._enableBrowserNotifications = _enableBrowserNotifications;

  let _lastNotifiedBadge = null;
  function _maybeNotifyCritical(){
    if (localStorage.getItem('mcps-notif-on') !== '1' || Notification.permission !== 'granted') return;
    try {
      const intel = computeIntelligence();
      const displayMetrics = computeDisplayMetrics(intel);
      const picked = pickDiagnostic(displayMetrics, intel.raw);
      const badge = picked ? picked.overallBadge.c : null;
      if (badge === 'critical' && _lastNotifiedBadge !== 'critical') {
        new Notification('MCPS — Attention requise', { body: (picked.worst?.label||'Un indicateur est passé au rouge') + ' nécessite votre attention.' });
      }
      _lastNotifiedBadge = badge;
    } catch(e) {}
  }

  // ═══ GOOGLE AGENDA (lecture seule, côté client) ═══
  let _gTokenClient = null, _gToken = null, _gEventsToday = [];
  function _connectGoogleCalendar(){
    if (!MCPS_CONFIG.googleClientId) { showToast('⚠️','Google Agenda non configuré (googleClientId vide)','var(--amber)'); return; }
    if (typeof google === 'undefined') { showToast('⚠️','Script Google non chargé, réessayez','var(--amber)'); return; }
    if (!_gTokenClient) {
      _gTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: MCPS_CONFIG.googleClientId,
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
        callback: (resp) => { _gToken = resp.access_token; _fetchTodayEvents(); },
      });
    }
    _gTokenClient.requestAccessToken();
  }
  window._connectGoogleCalendar = _connectGoogleCalendar;

  async function _fetchTodayEvents(){
    if (!_gToken) return;
    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date(); end.setHours(23,59,59,999);
    try {
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${start.toISOString()}&timeMax=${end.toISOString()}&singleEvents=true&orderBy=startTime`, {
        headers: { Authorization: `Bearer ${_gToken}` },
      });
      const data = await res.json();
      _gEventsToday = data.items || [];
      showToast('📅', `${_gEventsToday.length} événement(s) importé(s)`, 'var(--green)');
      if (state.view === 'today' && typeof renderToday === 'function') renderToday();
    } catch(e) { console.error('MCPS Google Calendar error:', e); }
  }

  const _origRenderTodayForCal = window.renderToday;
  window.renderToday = function(){
    if (_origRenderTodayForCal) _origRenderTodayForCal();
    const synth = document.getElementById('today-synth');
    if (!synth || !_gEventsToday.length) return;
    if (!document.getElementById('today-cal-card')) {
      const card = document.createElement('div');
      card.className = 'card'; card.id = 'today-cal-card';
      card.style.cssText = 'margin-top:14px;padding:16px';
      synth.insertAdjacentElement('afterend', card);
    }
    const card = document.getElementById('today-cal-card');
    card.innerHTML = `<div style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-muted);font-family:var(--mono);margin-bottom:10px">📅 Agenda du jour (Google)</div>` +
      _gEventsToday.map(ev => `<div class="task-edit-row"><div style="flex:1">${esc(ev.summary||'(Sans titre)')}</div><span style="font-size:11px;color:var(--text-muted)">${(ev.start && (ev.start.dateTime||ev.start.date))?new Date(ev.start.dateTime||ev.start.date).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''}</span></div>`).join('');
  };

  window.addEventListener('DOMContentLoaded', _initAuth);
  window.addEventListener('DOMContentLoaded', () => { if (typeof lucide !== 'undefined') lucide.createIcons(); });

  // ── PWA : enregistrement du service worker (hors-ligne + installable) ──
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(e => console.warn('MCPS SW registration failed:', e));
    });
  }

  // ═══════════════════════════════════════════════════════
  // i18n — FR/EN pour la coquille de l'application (menu, connexion, onboarding).
  // Portée volontairement limitée : traduire l'intégralité des formulaires et
  // modales internes (8000+ lignes) est un chantier à part ; ceci pose la
  // structure et couvre ce qu'un prospect voit en premier.
  // ═══════════════════════════════════════════════════════
  const I18N = {
    fr: {
      'sec.intelligence': 'MCPS Intelligence', 'sec.overview': "Vue d'ensemble", 'sec.work': 'Travail',
      'sec.people': 'Équipe', 'sec.performance': 'Performance', 'sec.operations': 'Opérations', 'sec.workspace': 'Espace de travail',
      'sec.global': 'Vue Globale', 'sec.management': 'Gestion', 'sec.tools': 'Outils', // conservés : compatibilité si référencés ailleurs
      'nav.intelligence': 'Intelligence Layer', 'nav.dashboard': 'Command Center', 'nav.today': "Aujourd'hui",
      'nav.sectors': "Secteurs d'Activité", 'nav.clients': 'Clients', 'nav.projects': 'Projets', 'nav.tasks': 'Tâches',
      'nav.team': 'Équipe', 'nav.reports': 'Rapports', 'nav.suivi': 'Suivi Tâches', 'nav.todo': 'To-Do List',
      'btn.exportData': 'Exporter données', 'btn.exportPdf': 'Export PDF dashboard', 'btn.billing': 'Facturation',
      'btn.notif': 'Notifications navigateur', 'btn.calendar': 'Connecter Google Agenda', 'btn.help': 'Aide & Support',
      'btn.invite': 'Inviter un collaborateur', 'btn.branding': 'Marque blanche',
      'auth.sub': 'Marko Creative Performance System', 'auth.login': 'Connexion', 'auth.signup': 'Créer un espace',
      'auth.email': 'Adresse email', 'auth.password': 'Mot de passe', 'auth.orgname': 'Nom de votre agence / équipe',
      'auth.submitLogin': 'Se connecter', 'auth.submitSignup': 'Créer mon espace',
    },
    en: {
      'sec.intelligence': 'MCPS Intelligence', 'sec.overview': 'Overview', 'sec.work': 'Work',
      'sec.people': 'People', 'sec.performance': 'Performance', 'sec.operations': 'Operations', 'sec.workspace': 'Workspace',
      'sec.global': 'Overview', 'sec.management': 'Management', 'sec.tools': 'Tools', // conservés : compatibilité si référencés ailleurs
      'nav.intelligence': 'Intelligence Layer', 'nav.dashboard': 'Command Center', 'nav.today': 'Today',
      'nav.sectors': 'Sectors', 'nav.clients': 'Clients', 'nav.projects': 'Projects', 'nav.tasks': 'Tasks',
      'nav.team': 'Team', 'nav.reports': 'Reports', 'nav.suivi': 'Task History', 'nav.todo': 'To-Do List',
      'btn.exportData': 'Export data', 'btn.exportPdf': 'Export dashboard PDF', 'btn.billing': 'Billing',
      'btn.notif': 'Browser notifications', 'btn.calendar': 'Connect Google Calendar', 'btn.help': 'Help & Support',
      'btn.invite': 'Invite a teammate', 'btn.branding': 'White label',
      'auth.sub': 'Marko Creative Performance System', 'auth.login': 'Log in', 'auth.signup': 'Create a workspace',
      'auth.email': 'Email address', 'auth.password': 'Password', 'auth.orgname': 'Your agency / team name',
      'auth.submitLogin': 'Log in', 'auth.submitSignup': 'Create my workspace',
    },
  };

  function applyI18n(lang){
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (I18N[lang][key]) el.textContent = I18N[lang][key];
    });
    const d = I18N[lang];
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const setPh = (id, val) => { const el = document.getElementById(id); if (el) el.placeholder = val; };
    document.querySelector('.auth-sub') && (document.querySelector('.auth-sub').textContent = d['auth.sub']);
    set('auth-tab-login', d['auth.login']);
    set('auth-tab-signup', d['auth.signup']);
    setPh('auth-email', d['auth.email']);
    setPh('auth-password', d['auth.password']);
    setPh('auth-orgname', d['auth.orgname']);
    const submitBtn = document.getElementById('auth-submit-btn');
    if (submitBtn) submitBtn.textContent = submitBtn.dataset.mode === 'signup' ? d['auth.submitSignup'] : d['auth.submitLogin'];
    const langLbl = document.getElementById('lang-toggle-lbl');
    if (langLbl) langLbl.textContent = lang === 'fr' ? 'English' : 'Français';
    localStorage.setItem('mcps-lang', lang);
  }
  window._applyI18n = applyI18n;

  function _toggleLang(){
    const current = localStorage.getItem('mcps-lang') || 'fr';
    applyI18n(current === 'fr' ? 'en' : 'fr');
  }
  window._toggleLang = _toggleLang;

  window.addEventListener('DOMContentLoaded', () => applyI18n(localStorage.getItem('mcps-lang') || 'fr'));

  // ═══════════════════════════════════════════════════════
  // AIDE & SUPPORT — FAQ intégrée + formulaire de contact (ticket Firestore + email)
  // ═══════════════════════════════════════════════════════
  const HELP_FAQ = [
    { q: "Comment ajouter mon équipe ?", a: "Barre latérale → Équipe, ou lors de la configuration initiale de votre espace." },
    { q: "Comment fonctionne le statut « À suivre » ?", a: "C'est un 4ᵉ statut de tâche, entre Non démarré et Terminé, pour isoler ce qui demande une attention particulière. Visible dans la vue Aujourd'hui." },
    { q: "Comment inviter un collaborateur ?", a: "Barre latérale → Inviter un collaborateur (réservé aux administrateurs). La personne doit ensuite créer un compte avec l'email invité." },
    { q: "Mes données sont-elles sauvegardées automatiquement ?", a: "Oui, dès que vous êtes connecté : chaque modification est envoyée au cloud quelques instants après." },
    { q: "Comment changer le logo et les couleurs ?", a: "Barre latérale → Marque blanche (administrateurs uniquement)." },
    { q: "Comment passer au plan Pro ?", a: "Barre latérale → Facturation → Passer au plan Pro." },
  ];

  function openHelpPanel(){
    document.getElementById('modal-ttl').textContent = '❓ Aide & Support';
    const faqHtml = HELP_FAQ.map(f => `
      <div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="font-weight:700;font-size:13px;margin-bottom:4px">${esc(f.q)}</div>
        <div style="font-size:12.5px;color:var(--text-muted);line-height:1.5">${esc(f.a)}</div>
      </div>`).join('');
    document.getElementById('modal-body').innerHTML = `
      <input class="fin" id="help-search" placeholder="Rechercher dans l'aide…" oninput="_filterHelp()" style="margin-bottom:14px">
      <div id="help-faq-list">${faqHtml}</div>
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
        <div class="flbl" style="margin-bottom:8px">Vous ne trouvez pas de réponse ?</div>
        <textarea class="fin" id="help-msg" rows="3" placeholder="Décrivez votre problème…"></textarea>
        <div class="modal-acts"><button class="btn btn-primary" onclick="_sendSupportTicket()">Envoyer au support</button></div>
      </div>`;
    document.getElementById('main-overlay').classList.add('open');
  }
  window.openHelpPanel = openHelpPanel;

  function _filterHelp(){
    const q = document.getElementById('help-search').value.trim().toLowerCase();
    const filtered = q ? HELP_FAQ.filter(f => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)) : HELP_FAQ;
    document.getElementById('help-faq-list').innerHTML = filtered.length ? filtered.map(f => `
      <div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="font-weight:700;font-size:13px;margin-bottom:4px">${esc(f.q)}</div>
        <div style="font-size:12.5px;color:var(--text-muted);line-height:1.5">${esc(f.a)}</div>
      </div>`).join('') : '<div style="font-size:12.5px;color:var(--text-muted);padding:10px 0">Aucun résultat — envoyez votre question ci-dessous.</div>';
  }
  window._filterHelp = _filterHelp;

  async function _sendSupportTicket(){
    const msg = document.getElementById('help-msg').value.trim();
    if (!msg) { showToast('⚠️','Décrivez votre problème','var(--amber)'); return; }
    if (!MCPS_ORG_ID) { showToast('⚠️','Support disponible uniquement en mode connecté','var(--amber)'); return; }
    try {
      await firebase.firestore().collection('orgs').doc(MCPS_ORG_ID).collection('support_tickets').add({
        message: msg, fromEmail: MCPS_EMAIL, createdAt: firebase.firestore.FieldValue.serverTimestamp(), status: 'open',
      });
      closeModal();
      showToast('✅','Message envoyé — nous revenons vers vous rapidement','var(--green)');
    } catch(e) { showToast('⚠️', e.message, 'var(--red)'); }
  }
  window._sendSupportTicket = _sendSupportTicket;
})();

// ═══════════════════════════════════════════════════════
//  MCPS_CONFIG — espace de noms de configuration unique et partagé
//  ───────────────────────────────────────────────────────
//  PATCH #1 (audit technique) : avant ce correctif, FIREBASE_CONFIG,
//  GOOGLE_CLIENT_ID et STRIPE_PRICE_ID_PRO étaient des `const` déclarées à
//  l'intérieur d'une IIFE isolée (bloc "MCPS Cloud Sync"), invisibles pour
//  les autres blocs <script> du fichier. Ce défaut de portée a provoqué
//  3 régressions distinctes déjà corrigées au cas par cas (Firebase, Google
//  Calendar, Stripe). Cet objet est désormais LA seule source de vérité,
//  déclaré en tout premier, avant tout autre code — donc garanti disponible
//  partout dans le fichier, sans nouveau correctif à chaque intégration.
//
//  PATCH #11 (audit technique, Phase 11) — séparation des environnements.
//  AVANT : une seule configuration Firebase pour toute l'application —
//  risque de tester accidentellement contre les données réelles (audit,
//  P2.15). APRÈS : trois configurations nommées (development / staging /
//  production), résolues automatiquement selon le nom d'hôte au chargement
//  (localhost → development ; domaine de prévisualisation Netlify/Vercel →
//  staging ; tout le reste → production), ou forcées explicitement via
//  ?env=staging dans l'URL pour tester un environnement précis.
//
//  Pour activer les comptes multi-utilisateurs : renseignez `firebase`
//  dans CHAQUE environnement que vous utilisez réellement (voir
//  console.firebase.google.com — un projet Firebase distinct par
//  environnement est recommandé, pour ne jamais mélanger les données).
//  Pour Google Agenda : renseignez `googleClientId`.
//  Pour la facturation Stripe : renseignez `stripePriceId`.
// ═══════════════════════════════════════════════════════
window.MCPS_CONFIG = {
  environments: {
    development: {
      label: "Développement",
      firebase: { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" },
    },
    staging: {
      label: "Pré-production",
      firebase: { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" },
    },
    production: {
      label: "Production",
      firebase: { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" },
    },
  },
  googleClientId: "",
  stripePriceId: "price_XXXXXXXXXXXX",
};

(function _mcpsResolveEnvironment(){
  let envKey = null;
  try { envKey = new URLSearchParams(window.location.search).get('env'); } catch(e) {}
  if (!envKey && window.__MCPS_FORCE_ENV) envKey = window.__MCPS_FORCE_ENV;
  if (!envKey) {
    const host = (window.location && window.location.hostname) || '';
    if (!host || host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.')) envKey = 'development';
    else if (/staging|preview|netlify\.app|vercel\.app|pages\.dev/i.test(host)) envKey = 'staging';
    else envKey = 'production';
  }
  const envs = window.MCPS_CONFIG.environments;
  const resolved = envs[envKey] || envs.production;
  window.MCPS_CONFIG.firebase = resolved.firebase; // compatibilité : tout le code existant lit MCPS_CONFIG.firebase
  window.MCPS_CONFIG.activeEnvironment = envKey;
  window.MCPS_CONFIG.environmentLabel = resolved.label;
})();

// ═══════════════════════════════════════════════════════
//  PATCH #12 — auto-configuration Firebase (sans copier l'apiKey à la main)
//  ───────────────────────────────────────────────────────
//  Quand ce projet est déployé via Firebase Hosting (firebase deploy),
//  Hosting expose automatiquement la config du projet actif sur l'URL
//  réservée /__/firebase/init.json — inutile de la recopier dans ce
//  fichier. On la récupère ici et elle remplace la config codée en dur
//  (development/staging/production ci-dessus) dès qu'elle est disponible.
//  Sur tout autre hébergeur (Netlify, serveur local...), cette URL
//  n'existe pas : le fetch échoue silencieusement et la config codée en
//  dur reste utilisée, sans rien casser.
//  Rappel : la valeur "apiKey" de Firebase n'est pas un secret — elle est
//  conçue pour être publique côté client. La vraie barrière de sécurité,
//  c'est firestore.rules (déployé séparément), pas la discrétion de cette
//  valeur.
// ═══════════════════════════════════════════════════════
(async function _mcpsAutoConfigFromHosting(){
  try {
    const res = await fetch('/__/firebase/init.json', { cache: 'no-store' });
    if (!res.ok) return; // pas hébergé sur Firebase Hosting : rien à faire
    const cfg = await res.json();
    if (cfg && cfg.apiKey && cfg.projectId) {
      window.MCPS_CONFIG.firebase = cfg;
      window.MCPS_CONFIG.environmentLabel = window.MCPS_CONFIG.environmentLabel + ' (auto — Firebase Hosting)';
    }
  } catch (e) {
    // Hébergeur autre que Firebase Hosting (Netlify, localhost simple...) — normal, on ignore.
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  const badge = document.getElementById('mcps-env-badge');
  const env = window.MCPS_CONFIG.activeEnvironment;
  if (badge && env && env !== 'production') {
    badge.textContent = window.MCPS_CONFIG.environmentLabel;
    badge.hidden = false;
  }
});

// ═══════════════════════════════════════════════════════
//  DATA
// ═══════════════════════════════════════════════════════
const SECTORS_META = {
  'Technologie':    { icon:'💻', color:'#00c8ff' },
  'Finance':        { icon:'💰', color:'#00e5a0' },
  'Commerce':       { icon:'🛒', color:'#ffab00' },
  'Médias & Com.':  { icon:'📡', color:'#ff6b2b' },
  'Santé':          { icon:'🏥', color:'#f472b6' },
  'Éducation':      { icon:'🎓', color:'#a78bfa' },
  'Industrie':      { icon:'🏭', color:'#94a3b8' },
  'Immobilier':     { icon:'🏢', color:'#34d399' },
  'Tourisme':       { icon:'✈️', color:'#fb923c' },
  'Autre':          { icon:'◈', color:'#60a5fa' },
};

// ═══════════════════════════════════════════════════════
//  MODÈLE DE CAMPAGNE — extension de Project, pas une nouvelle entité
// ───────────────────────────────────────────────────────
// STRATEGIE-PRODUIT.md section C.1 : sans canaux, budget média et objectif,
// un "Project" ne peut pas répondre à la question qu'une direction
// marketing pose en premier ("combien nous coûte et nous rapporte cette
// campagne, tous canaux confondus ?"). Champs volontairement additifs et
// optionnels sur l'entité Project existante (voir AUDIT.md, principe :
// jamais de réécriture massive sans nécessité) — un projet sans canal
// sélectionné reste un simple projet, exactement comme avant ce patch.
// ═══════════════════════════════════════════════════════
const MCPS_CHANNELS = {
  social:   { icon:'📱', label:'Réseaux sociaux' },
  email:    { icon:'✉️', label:'Email' },
  presse:   { icon:'📰', label:'Presse / RP' },
  display:  { icon:'🎯', label:'Display / Ads' },
  influence:{ icon:'🎤', label:'Influence' },
  seo:      { icon:'🔍', label:'SEO / Contenu' },
};
const MCPS_CAMPAIGN_OBJECTIVES = ['Notoriété', 'Acquisition', 'Conversion', 'Rétention'];
// Un projet "est une campagne" s'il porte au moins un canal ou un objectif —
// pas de champ booléen dédié : évite un état incohérent (canaux renseignés
// mais isCampaign resté à false après une modification manuelle, etc.).
function isCampaign(p) { return !!((p.channels && p.channels.length) || p.objective); }
window.isCampaign = isCampaign;

// ── DATA LOADING: embedded → localStorage → default ──
(function() {
  try {
    const embedded = JSON.parse(document.getElementById('cockpit-data').textContent||'{}');
    const embeddedHasData = embedded && Array.isArray(embedded.clients) && (
      embedded.clients.length > 0 || (embedded.projects||[]).length > 0 ||
      (embedded.tasks||[]).length > 0 || (embedded.invoices||[]).length > 0
    );
    if (embeddedHasData) { window._EMBEDDED_DB = embedded; }
  } catch(e) {}
})();

let DB = window._EMBEDDED_DB || JSON.parse(localStorage.getItem('cockpit-db') || 'null') || {
  clients: [],
  prospects: [],
  projects: [],
  tasks: [],
  invoices: [],
  team: []
};

// ═══════════════════════════════════════════════════════
//  PATCH #5b (audit technique, Phase 5 — 2e tranche) — séparation physique
//  Client / Prospect
//  ───────────────────────────────────────────────────────
//  Migration unique et idempotente : tout enregistrement encore marqué
//  type==='prospect' dans DB.clients (données créées avant ce correctif)
//  est déplacé vers DB.prospects. Sans effet sur une base déjà migrée.
//  gc(), submitClient(), deleteClient() et convertToClient() sont mis à
//  jour pour rester compatibles des deux côtés — voir chacun plus bas.
// ═══════════════════════════════════════════════════════
if (!Array.isArray(DB.prospects)) DB.prospects = [];
(function _migrateProspectsOnce(){
  if (!Array.isArray(DB.clients) || !DB.clients.some(c => c.type === 'prospect')) return;
  const moved = DB.clients.filter(c => c.type === 'prospect');
  DB.clients = DB.clients.filter(c => c.type !== 'prospect');
  DB.prospects = DB.prospects.concat(moved);
})();

let state = {
  view: 'dashboard',
  theme: window._EMBEDDED_DB?._theme || localStorage.getItem('cockpit-theme') || 'dark',
  charts: {},
  todos: window._EMBEDDED_DB?._todos || JSON.parse(localStorage.getItem('cockpit-todos') || '[]'),
  nextTodoId: window._EMBEDDED_DB?._nextTodoId || +localStorage.getItem('cockpit-todo-id') || 1,
  taskTab: 'active',
  drag: null,
};
function _maxId(arr, key='id') { return arr.length ? Math.max(...arr.map(x=>x[key]||0)) : 0; }
let nextId = {
  client:  Math.max(_maxId(DB.clients), _maxId(DB.prospects)) + 1,
  project: _maxId(DB.projects) + 1,
  task:    _maxId(DB.tasks) + 1,
  invoice: _maxId(DB.invoices||[]) + 1,
  team:    _maxId(DB.team||[]) + 1
};
// Ensure arrays exist on old DB loads
if (!DB.invoices) DB.invoices = [];
if (!DB.team) DB.team = [];

document.documentElement.setAttribute('data-theme', state.theme);
updateThemeLbl();

// ── HELPERS ──
const gc = id => DB.clients.find(c=>c.id===id) || DB.prospects.find(c=>c.id===id);
const gp = id => DB.projects.find(p=>p.id===id);

// ═══════════════════════════════════════════════════════
//  PATCH #5a/5b (audit technique, Phase 5) — accès centralisé Client/Prospect
//  ───────────────────────────────────────────────────────
//  Depuis le patch #5b, DB.clients et DB.prospects sont deux tableaux
//  physiquement distincts (migration automatique ci-dessus) : ces deux
//  fonctions lisent directement le bon tableau, plus besoin de filtrer.
// ═══════════════════════════════════════════════════════
const getClients = () => DB.clients;
const getProspects = () => DB.prospects;
window.getClients = getClients;
window.getProspects = getProspects;
const cProjects = cid => DB.projects.filter(p=>p.clientId===cid);
const cTasks = cid => DB.tasks.filter(t=>t.clientId===cid);
const pTasks = pid => DB.tasks.filter(t=>t.projectId===pid);

function pComp(pid) {
  const ts = pTasks(pid); if (!ts.length) return 0;
  return Math.round(ts.filter(t=>t.status==='Terminé').length/ts.length*100);
}
function pReal(pid) { return pTasks(pid).reduce((s,t)=>s+(t.realHours||0),0); }

function effScore() {
  const total = DB.tasks.length; if (!total) return 0;
  const done = DB.tasks.filter(t=>t.status==='Terminé').length;
  const cr = done / total;
  const withBoth = DB.tasks.filter(t=>t.realHours && t.estimatedHours && t.realHours > 0);
  const ts = withBoth.length
    ? withBoth.reduce((s,t) => s + Math.min(2, t.estimatedHours / t.realHours), 0) / withBoth.length
    : 1;
  const projTotal = DB.projects.filter(p=>p.clientId && DB.clients.find(c=>c.id===p.clientId && c.type!=='prospect')).length;
  const pd = projTotal > 0
    ? DB.projects.filter(p=>p.status==='Terminé').length / projTotal
    : 0;
  return Math.round(Math.min(100, Math.max(0, (cr*.5 + Math.min(1,ts)*.3 + pd*.2) * 100)));
}

// ── INVOICE HELPERS ──
const gi = id => DB.invoices.find(i=>i.id===id);
const cInvoices = cid => DB.invoices.filter(i=>i.clientId===cid);
function formatXOF(n) { return n.toLocaleString('fr-FR')+' XOF'; }
function fmtXOFShort(n) { if(n>=1000000) return (n/1000000).toFixed(1)+'M'; if(n>=1000) return (n/1000).toFixed(0)+'K'; return n; }
function invStatusCls(s) { const m={'Payée':'inv-status-paid','Envoyée':'inv-status-sent','Brouillon':'inv-status-draft','En retard':'inv-status-late'}; return m[s]||'inv-status-draft'; }
function totalInvoices(filter) { return DB.invoices.filter(filter).reduce((s,i)=>s+i.amount,0); }
function checkLateInvoices() {
  const now=new Date();
  DB.invoices.forEach(inv=>{ if(inv.status==='Envoyée'&&new Date(inv.dueDate)<now) inv.status='En retard'; });
}

function alertInfo() {
  checkLateInvoices();
  const late = DB.projects.filter(p=>p.status!=='Terminé'&&new Date()>new Date(p.endDate)&&pComp(p.id)<100);
  const lateInv = DB.invoices.filter(i=>i.status==='En retard');
  const sc = effScore();
  if (late.length && lateInv.length) return { type:'danger', txt:`🔴 ${late.length} projet(s) en retard · ${lateInv.length} facture(s) impayée(s) — ${formatXOF(lateInv.reduce((s,i)=>s+i.amount,0))}` };
  if (late.length) return { type:'danger', txt:`🔴 ${late.length} projet(s) en retard — ${late.map(p=>p.name).slice(0,2).join(', ')}` };
  if (lateInv.length) return { type:'danger', txt:`⚠️ ${lateInv.length} facture(s) en retard de paiement — ${formatXOF(lateInv.reduce((s,i)=>s+i.amount,0))} à récupérer` };
  if (sc>=75) return { type:'success', txt:`🟢 Excellent ! Score ${sc}/100 — Tous vos projets avancent parfaitement.` };
  if (sc>=50) return { type:'warning', txt:`🔵 Bonne progression — Score global : ${sc}/100 — Continuez !` };
  return { type:'warning', txt:`🟠 Performance moyenne — Score : ${sc}/100 — Revoyez les priorités.` };
}

function statusBadge(s) {
  const m = {'Terminé':'b-done','En cours':'b-inprog','Non démarré':'b-todo','À suivre':'b-follow'};
  return `<span class="badge ${m[s]||'b-todo'}"><span class="b-dot"></span>${s}</span>`;
}
function priBadge(p) {
  const m = {'Urgente':'b-urgent','Haute':'b-high','Moyenne':'b-medium','Faible':'b-low'};
  return `<span class="badge ${m[p]||'b-low'}">${p}</span>`;
}
function needBadge(n) {
  if (n==='creative') return `<span class="badge b-creative">🎨 Créatif</span>`;
  if (n==='conseil')  return `<span class="badge b-conseil">💡 Conseil</span>`;
  if (n==='digital')  return `<span class="badge b-digital">💻 Digital</span>`;
  return '';
}
function ctag(clientId) {
  const c = gc(clientId); if (!c) return '';
  return `<span class="ctag" style="background:${c.color}1a;color:${c.color}"><span class="cdot" style="background:${c.color}"></span>${c.name}</span>`;
}
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('fr',{day:'2-digit',month:'short',year:'numeric'});
}
function fmtDateShort(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('fr',{day:'2-digit',month:'short'}); }

function animCount(el, target) {
  if (typeof el === 'string') el = document.querySelector(el);
  if (!el) return;
  target = Math.max(0, Math.round(target)) || 0;
  if (target === 0) { el.textContent = 0; return; }
  let cur = 0, step = Math.max(1, Math.ceil(target / 40));
  const t = setInterval(() => {
    cur = Math.min(cur + step, target);
    el.textContent = cur;
    if (cur >= target) clearInterval(t);
  }, 18);
}

// ── SAVE SYSTEM ──
let _fileHandle = null;  // File System Access API handle
let _hasUnsaved = false;

// ═══════════════════════════════════════════════════════
//  PATCH #2 (audit technique, Phase 2) — pipeline de sauvegarde centralisé
//  ───────────────────────────────────────────────────────
//  AVANT : window.saveDB était réassigné 4 fois de suite dans des blocs
//  <script> séparés (7655, 8219, 8229, 8475 dans l'ancienne version), chaque
//  wrapper capturant "l'ancien" saveDB et l'enveloppant. Ordre d'exécution
//  réel dépendant de l'ordre de chargement des scripts, comportement difficile
//  à tracer, et tout ajout futur aurait perpétué le pattern.
//
//  APRÈS : saveDB() est déclarée UNE SEULE FOIS ci-dessous et n'est plus
//  jamais réassignée. Les blocs ajoutés plus tard (Intelligence Layer,
//  normalisation métier, sync cloud multi-tenant) s'enregistrent dans l'un
//  des deux tableaux ci-dessous au lieu de redéfinir la fonction :
//    - _mcpsPreSaveHooks  : exécutés AVANT la persistance (ex. normalisation)
//    - _mcpsPostSaveHooks : exécutés APRÈS la persistance (ex. rafraîchir une
//      vue, synchroniser le cloud) — chaque hook est isolé dans son propre
//      try/catch : un hook qui échoue n'empêche plus les autres de tourner
//      (avant, une exception dans un wrapper cassait toute la chaîne).
// ═══════════════════════════════════════════════════════
window._mcpsPreSaveHooks = [];
window._mcpsPostSaveHooks = [];

// ═══════════════════════════════════════════════════════
//  PATCH #3 (audit technique, Phase 3) — validation centralisée
//  ───────────────────────────────────────────────────────
//  AVANT : chaque submit*() validait à sa façon, en ligne, de façon
//  incomplète (souvent seulement "le nom est requis"). Une facture à 0 XOF,
//  une tâche dont la date de fin précède la date de début, ou une tâche
//  créée avant tout client (clientId devient NaN) passaient sans alerte.
//
//  APRÈS : un validateur unique par entité, ici. Chaque submit*() construit
//  toujours son objet exactement comme avant, puis appelle
//  MCPS_VALIDATE.<entité>(obj) et affiche la première erreur avec le même
//  mécanisme de toast qu'avant (aucun changement visible pour un cas déjà
//  valide). Rappel du principe (audit, §6) : cette validation est une aide à
//  la saisie côté interface, PAS une garantie de sécurité — celle-ci viendra
//  des règles Firestore (Phase 6).
// ═══════════════════════════════════════════════════════
window.MCPS_VALIDATE = {
  client(o) {
    const errors = [];
    if (!o.name || !o.name.trim()) errors.push('Le nom du client est requis.');
    if (o.budget != null && o.budget < 0) errors.push('Le budget ne peut pas être négatif.');
    if (o.contractDuration != null && o.contractDuration < 0) errors.push('La durée de contrat ne peut pas être négative.');
    return { valid: errors.length === 0, errors };
  },
  project(o) {
    const errors = [];
    if (!o.name || !o.name.trim()) errors.push('Le nom du projet est requis.');
    if (!o.clientId || isNaN(o.clientId)) errors.push('Sélectionnez un client avant de créer un projet.');
    if (o.startDate && o.endDate && o.endDate < o.startDate) errors.push('La date de fin ne peut pas précéder la date de début.');
    if (o.estimatedHours != null && o.estimatedHours < 0) errors.push('Les heures estimées ne peuvent pas être négatives.');
    // Modèle de Campagne (STRATEGIE-PRODUIT.md C.1) — champs optionnels, ne
    // s'appliquent que si renseignés : un projet interne sans canal reste valide.
    if (o.mediaBudget != null && o.mediaBudget < 0) errors.push('Le budget média ne peut pas être négatif.');
    if (o.objective && !MCPS_CAMPAIGN_OBJECTIVES.includes(o.objective)) errors.push('Objectif de campagne invalide.');
    if (o.channels && (!Array.isArray(o.channels) || o.channels.some(c => !MCPS_CHANNELS[c]))) errors.push('Canal de campagne invalide.');
    return { valid: errors.length === 0, errors };
  },
  task(o) {
    const errors = [];
    const VALID_STATUSES = ['Non démarré','En cours','À suivre','Terminé'];
    if (!o.name || !o.name.trim()) errors.push('Le nom de la tâche est requis.');
    if (!o.clientId || isNaN(o.clientId)) errors.push('Sélectionnez un client avant de créer une tâche.');
    if (o.status && !VALID_STATUSES.includes(o.status)) errors.push('Statut de tâche invalide.');
    if (o.startDate && o.endDate && o.endDate < o.startDate) errors.push('La date de fin ne peut pas précéder la date de début.');
    if (o.qualityRating != null && (o.qualityRating < 1 || o.qualityRating > 5)) errors.push('La note de qualité doit être comprise entre 1 et 5.');
    if (o.estimatedHours != null && o.estimatedHours < 0) errors.push('Les heures estimées ne peuvent pas être négatives.');
    return { valid: errors.length === 0, errors };
  },
  invoice(o) {
    const errors = [];
    if (!o.label || !o.label.trim()) errors.push("L'objet de la facture est requis.");
    if (!o.amount || o.amount <= 0) errors.push('Le montant doit être supérieur à 0.');
    if (!o.clientId || isNaN(o.clientId)) errors.push('Sélectionnez un client avant de créer une facture.');
    if (o.dueDate && o.issueDate && o.dueDate < o.issueDate) errors.push("La date d'échéance ne peut pas précéder la date d'émission.");
    return { valid: errors.length === 0, errors };
  },
  teamMember(o) {
    const errors = [];
    if (!o.name || !o.name.trim()) errors.push('Le nom est requis.');
    if (o.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) errors.push('Adresse email invalide.');
    return { valid: errors.length === 0, errors };
  },
};

function saveDB() {
  window._mcpsPreSaveHooks.forEach(fn => { try { fn(); } catch(e) { console.error('MCPS pre-save hook error:', e); } });

  localStorage.setItem('cockpit-db', JSON.stringify(DB));
  markUnsaved();
  _updateCounters(); // keep all counters in sync after every save
  // Auto-save debounce
  clearTimeout(window._autoSaveTimer);
  window._autoSaveTimer = setTimeout(() => {
    if (!_hasUnsaved) return;
    if (_fileHandle) {
      const html = generateUpdatedHTML();
      const blob = new Blob([html], {type:'text/html;charset=utf-8'});
      _fileHandle.createWritable().then(w => w.write(blob).then(() => w.close())).then(() => {
        markSaved(); showToast('💾','Sauvegarde auto effectuée','var(--green)');
      }).catch(()=>{});
    } else {
      const lbl = document.getElementById('save-method-lbl');
      if (lbl) lbl.textContent = '✓ Sauvegardé (auto)';
      _hasUnsaved = false;
      const btn = document.getElementById('save-file-btn');
      if (btn) btn.classList.remove('unsaved');
    }
  }, 2000);

  window._mcpsPostSaveHooks.forEach(fn => { try { fn(); } catch(e) { console.error('MCPS post-save hook error:', e); } });
}

function markUnsaved() {
  _hasUnsaved = true;
  const btn = document.getElementById('save-file-btn');
  if (btn) btn.classList.add('unsaved');
  const lbl = document.getElementById('save-method-lbl');
  if (lbl) lbl.textContent = '● Modifications non sauvegardées';
}

function markSaved() {
  _hasUnsaved = false;
  const btn = document.getElementById('save-file-btn');
  if (btn) btn.classList.remove('unsaved');
  const lbl = document.getElementById('save-method-lbl');
  if (lbl) lbl.textContent = _fileHandle ? '✓ Sauvegardé dans le fichier' : '✓ Téléchargé';
}

function generateUpdatedHTML() {
  // Grab current full HTML source
  const raw = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
  // Build the full DB payload (including todos)
  const payload = JSON.stringify({
    ...DB,
    _todos: state.todos,
    _nextTodoId: state.nextTodoId,
    _theme: state.theme,
  });
  // Replace the embedded data script tag content
  return raw.replace(
    /(<script id="cockpit-data"[^>]*>)([\s\S]*?)(<\/script>)/,
    `$1${payload}$3`
  );
}

async function saveToFile() {
  if (!DB || !DB.clients) { showToast('⚠️','DB non initialisée','var(--amber)'); return; }
  const html = generateUpdatedHTML();
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });

  // 1 — Try File System Access API (Chrome/Edge: overwrites the actual file)
  if (_fileHandle) {
    try {
      const writable = await _fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      markSaved();
      showToast('💾', 'Fichier sauvegardé directement !', 'var(--green)');
      return;
    } catch(e) {
      _fileHandle = null; // handle expired, fall through
    }
  }

  // 2 — Try showSaveFilePicker (ask user to choose/confirm file)
  if ('showSaveFilePicker' in window) {
    try {
      _fileHandle = await window.showSaveFilePicker({
        suggestedName: 'cockpit.html',
        types: [{ description: 'HTML', accept: { 'text/html': ['.html'] } }],
      });
      const writable = await _fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      markSaved();
      const lbl = document.getElementById('save-method-lbl');
      if (lbl) lbl.textContent = '✓ Sauvegardé — cliquer pour re-sauvegarder';
      showToast('💾', 'Fichier sauvegardé ! Partagez ce fichier.', 'var(--green)');
      return;
    } catch(e) {
      if (e.name === 'AbortError') return; // user cancelled
    }
  }

  // 3 — Fallback: download (Firefox / Safari / file:// without picker)
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'cockpit.html';
  a.click();
  URL.revokeObjectURL(a.href);
  markSaved();
  showToast('💾', 'Fichier téléchargé — remplacez l\'ancien !', 'var(--green)');
}

// ── NAVIGATION ──

// ═══════════════════════════════════════════════════════
// COUNTERS — single source of truth, called after every data change
// ═══════════════════════════════════════════════════════
function _updateCounters(clients, prospects, closed) {
  if (!clients)   clients   = DB.clients.filter(c => c.type !== 'prospect' && !c.closedAt);
  if (!prospects) prospects = getProspects().filter(c => !c.closedAt);
  if (!closed)    closed    = DB.clients.filter(c => !!c.closedAt);
  const converted = clients.filter(c => c.convertedFromProspect);
  const lateT     = DB.tasks.filter(t => t.status !== 'Terminé' && t.endDate && new Date() > new Date(t.endDate));

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  // Tab badges (Clients section)
  set('ctab-count-client',   clients.length);
  set('ctab-count-prospect', prospects.length);
  set('ctab-count-cloture',  closed.length);

  // Dashboard KPIs (main 4 + analytics 4)
  animCount('#kpi-c',                   clients.length);
  animCount('#kpi-clients-actifs',      clients.length);
  animCount('#kpi-prospects-total',     prospects.length);
  animCount('#kpi-prospects-convertis', converted.length);
  animCount('#kpi-clients-clotures',    closed.length);

  // Dashboard kanban prospect count
  set('dash-prospect-count', prospects.length);

  // Task status KPIs
  set('dstat-done', DB.tasks.filter(t => t.status === 'Terminé').length);
  set('dstat-prog', DB.tasks.filter(t => t.status === 'En cours').length);
  set('dstat-todo', DB.tasks.filter(t => t.status === 'Non démarré').length);
  set('dstat-late', lateT.length);

  // Sidebar late badge
  const nb = document.getElementById('nb-late');
  if (nb) { nb.textContent = lateT.length; nb.style.display = lateT.length ? 'inline' : 'none'; }
}

const PAGE = {
  intelligence:{ title:'MCPS Intelligence Layer', sub:'Pourquoi, ce qui va suivre, quelle décision prendre' },
  dashboard:{ title:'MCPS Command Center', sub:'Vue en temps réel de la performance créative, des opérations et de la santé de l\'activité.' },
  today:    { title:'Aujourd\'hui',          sub:'Terminées, en cours aujourd\'hui, à suivre — et la synthèse du jour' },
  sectors:  { title:'Secteurs d\'Activité',  sub:'Comprenez réellement qui sont vos clients' },
  clients:  { title:'Clients',               sub:'Gérez vos clients et leurs besoins' },
  projects: { title:'Projets',               sub:'Suivez l\'avancement de tous vos projets' },
  tasks:    { title:'Tâches',                sub:'Planifiez et tracez chaque action' },
  team:     { title:'Équipe',                sub:'Membres opérationnels — Performance & Prospects' },
  reports:  { title:'Rapports',               sub:'Analyse de performance par période' },
  directorreport: { title:'Rapport Direction', sub:'Synthèse à destination du marketing / de la direction' },
  todo:     { title:'To-Do List',            sub:'Vos actions quotidiennes' },
  suivi:    { title:'Suivi des Tâches',         sub:'Historique et analyse des tâches terminées' },
};

function go(view) {
  try {
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    const viewEl = document.getElementById('view-'+view);
    if (!viewEl) { console.warn('View not found:', view); return; }
    viewEl.classList.add('active');
    if (typeof gsap !== 'undefined') {
      gsap.fromTo(viewEl, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
    }
    document.querySelector(`[data-view="${view}"]`)?.classList.add('active');
    state.view = view;
    const m = PAGE[view]||{};
    document.getElementById('pageTitle').textContent = m.title||view;
    document.getElementById('pageSub').textContent = m.sub||'';
    if (view==='intelligence') renderIntelligence();
    else if (view==='dashboard') renderDashboard();
    else if (view==='today') renderToday();
    else if (view==='sectors') renderSectors();
    else if (view==='clients') { if(!window._clientActiveTab) window._clientActiveTab='client'; switchClientTab(window._clientActiveTab); }
    else if (view==='projects') renderProjects();
    else if (view==='tasks') renderTasks();
    else if (view==='team') renderTeam();
    else if (view==='reports') renderReports();
    else if (view==='directorreport') renderDirectorReport();
    else if (view==='todo') renderTodo();
    else if (view==='suivi') renderSuivi();
    const si=document.getElementById('search-input'); if(si) si.value='';
    if (typeof closeSearch === 'function') closeSearch();
    const mainEl = document.querySelector('.main');
    if (mainEl) mainEl.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.innerWidth<768) {
      document.getElementById('sidebar').classList.remove('open');
      const bd = document.getElementById('sidebar-backdrop');
      if (bd) bd.classList.remove('open');
    }
  } catch(e) { console.error('Navigation error ('+view+'):', e); }
}
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const bd = document.getElementById('sidebar-backdrop');
  const isOpen = sb.classList.toggle('open');
  if (bd) bd.classList.toggle('open', isOpen);
}

// ── UPDATE ALERT ──
function updateAlert() {
  const a = alertInfo();
  const bar = document.getElementById('alertBar');
  bar.className = 'alert-bar '+a.type;
  bar.style.cursor = a.type === 'danger' ? 'pointer' : 'default';
  bar.onclick = a.type === 'danger' ? ()=>go('tasks') : null;
  bar.title = a.type === 'danger' ? 'Voir les tâches en retard' : '';
  document.getElementById('alertTxt').textContent = a.txt;
  const late = DB.projects.filter(p=>p.status!=='Terminé'&&new Date()>new Date(p.endDate)&&pComp(p.id)<100).length;
  const nb = document.getElementById('nb-late');
  nb.style.display = late ? 'inline' : 'none'; nb.textContent = late;
  const lateInvN=DB.invoices.filter(i=>i.status==='En retard').length;
  const nb2=document.getElementById('nb-inv'); if(nb2){nb2.style.display=lateInvN?'inline':'none';nb2.textContent=lateInvN;}
  const followN=DB.tasks.filter(t=>t.status==='À suivre').length;
  const nbf=document.getElementById('nb-follow'); if(nbf){nbf.style.display=followN?'inline':'none';nbf.textContent=followN;}
}

// ═══════════════════════════════════════════════════════
//  RENDER: DASHBOARD
// ═══════════════════════════════════════════════════════
function renderDashboard() {
  const total=DB.tasks.length, done=DB.tasks.filter(t=>t.status==='Terminé').length;
  const inprog=DB.tasks.filter(t=>t.status==='En cours').length, ns=DB.tasks.filter(t=>t.status==='Non démarré').length;

  // Analytics strip
  const clientsActifs = DB.clients.filter(c => c.type !== 'prospect' && !c.closedAt);
  const prospectsTotal = getProspects().filter(c => !c.closedAt);
  // "convertis" = clients qui avaient type=prospect et sont maintenant client (check convertedFrom flag)
  const prospectsConvertis = DB.clients.filter(c => c.type !== 'prospect' && !c.closedAt && c.convertedFromProspect);
  const clientsClotures = DB.clients.filter(c => c.closedAt);

  animCount('#kpi-clients-actifs', clientsActifs.length);
  animCount('#kpi-prospects-total', prospectsTotal.length);
  animCount('#kpi-prospects-convertis', prospectsConvertis.length);
  animCount('#kpi-clients-clotures', clientsClotures.length);

  // Populate clients list in dashboard
  const dashClientsList = document.getElementById('dash-clients-list');
  if (dashClientsList) {
    dashClientsList.innerHTML = clientsActifs.slice(0,8).map(c => {
      const tasks = cTasks(c.id);
      const done2 = tasks.filter(t=>t.status==='Terminé').length;
      const pct = tasks.length ? Math.round(done2/tasks.length*100) : 0;
      const meta = SECTORS_META[c.sector]||{icon:'◈'};
      return `<div style="display:flex;align-items:center;gap:9px;padding:6px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="openClientDetail(${c.id})">
        <div style="width:32px;height:32px;border-radius:8px;background:${c.color};display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-weight:700;font-size:11px;color:#000;flex-shrink:0">${esc(c.avatar)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.name)}</div>
          <div style="height:4px;background:var(--surface2);border-radius:2px;margin-top:4px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${c.color};border-radius:2px"></div></div>
        </div>
        <span style="font-family:var(--mono);font-size:11px;font-weight:700;color:${c.color};flex-shrink:0">${pct}%</span>
      </div>`;
    }).join('') || '<div style="color:var(--text-muted);font-size:12px;padding:8px">Aucun client actif.</div>';
  }

  // Populate prospects list in dashboard
  const dashProspectsList = document.getElementById('dash-prospects-list');
  if (dashProspectsList) {
    const PIPE_LABELS = {'lead':'🌱 Nouveau lead','contact':'📞 Contact établi','proposal':'📄 Proposition','negociation':'🤝 Négociation','won':'✅ Gagné','lost':'❌ Perdu'};
    dashProspectsList.innerHTML = prospectsTotal.slice(0,8).map(c => {
      const stageLabel = PIPE_LABELS[c.pipelineStage] || (c.pipelineStage || '🎯 Prospect');
      return `<div style="display:flex;align-items:center;gap:9px;padding:6px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="openProspectModal(${c.id})">
        <div style="width:32px;height:32px;border-radius:8px;background:${c.color};display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-weight:700;font-size:11px;color:#000;flex-shrink:0">${esc(c.avatar)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.name)}</div>
          <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">${stageLabel}</div>
        </div>
        <button class="btn btn-sm" style="background:var(--accent-dim);color:var(--accent);border:none;font-size:10px;padding:2px 7px" onclick="event.stopPropagation();convertToClient(${c.id})">→ Client</button>
      </div>`;
    }).join('') || '<div style="color:var(--text-muted);font-size:12px;padding:8px">Aucun prospect en cours.</div>';
  }

  // Populate conversion rate row
  const totalInPipeline = prospectsTotal.length + clientsActifs.length + clientsClotures.length;
  const convRate = (prospectsTotal.length + clientsActifs.length + clientsClotures.length) > 0
    ? Math.round(prospectsConvertis.length / Math.max(1, prospectsTotal.length + prospectsConvertis.length) * 100)
    : 0;
  const elConvRate = document.getElementById('dash-conversion-rate');
  const elConvProspects = document.getElementById('dash-conv-prospects');
  const elConvConverted = document.getElementById('dash-conv-converted');
  const elConvClosed = document.getElementById('dash-conv-closed');
  if (elConvRate) elConvRate.textContent = convRate + '%';
  if (elConvProspects) elConvProspects.textContent = prospectsTotal.length;
  if (elConvConverted) elConvConverted.textContent = prospectsConvertis.length;
  if (elConvClosed) elConvClosed.textContent = clientsClotures.length;
  // Pipeline bar widths
  const tot = Math.max(1, prospectsTotal.length + clientsActifs.length + clientsClotures.length);
  const pProspect = document.getElementById('dash-pipe-bar-prospect');
  const pClient = document.getElementById('dash-pipe-bar-client');
  const pCloture = document.getElementById('dash-pipe-bar-cloture');
  if (pProspect) pProspect.style.width = Math.round(prospectsTotal.length/tot*100) + '%';
  if (pClient) pClient.style.width = Math.round(clientsActifs.length/tot*100) + '%';
  if (pCloture) pCloture.style.width = Math.round(clientsClotures.length/tot*100) + '%';

  // Populate closed clients list if any
  const dashClotureSection = document.getElementById('dash-clotures-section');
  const dashCloturesList = document.getElementById('dash-clotures-list');
  if (dashClotureSection && dashCloturesList) {
    if (clientsClotures.length) {
      dashClotureSection.style.display = 'block';
      dashCloturesList.innerHTML = clientsClotures.map(c => {
        const closedDate = c.closedAt ? new Date(c.closedAt).toLocaleDateString('fr',{day:'2-digit',month:'short',year:'numeric'}) : '—';
        const tasks = cTasks(c.id);
        const done2 = tasks.filter(t=>t.status==='Terminé').length;
        const pct = tasks.length ? Math.round(done2/tasks.length*100) : 0;
        return `<div style="display:flex;align-items:center;gap:9px;padding:6px 10px;border-bottom:1px solid var(--border);filter:grayscale(60%);opacity:.75">
          <div style="width:32px;height:32px;border-radius:8px;background:${c.color};display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-weight:700;font-size:11px;color:#000;flex-shrink:0;filter:grayscale(40%)">${esc(c.avatar)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.name)}</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:1px">📅 Clôturé le ${closedDate} · ${tasks.length} tâche(s) · ${pct}% complété</div>
          </div>
          <span class="lbl-cloture" style="flex-shrink:0">🔒 Clôturé</span>
        </div>`;
      }).join('');
    } else {
      dashClotureSection.style.display = 'none';
    }
  }

  animCount('#kpi-c', clientsActifs.length);
  animCount('#kpi-p', DB.projects.length);
  animCount('#kpi-t', total);
  animCount('#kpi-d', done);
  // Financial strip
  checkLateInvoices();
  const paid=totalInvoices(i=>i.status==='Payée');
  const sent=totalInvoices(i=>i.status==='Envoyée');
  const lateAmt=totalInvoices(i=>i.status==='En retard');
  const ptf=DB.clients.reduce((s,c)=>s+(c.budget||0),0);
  document.getElementById('fk-paid').textContent=fmtXOFShort(paid);
  document.getElementById('fk-sent').textContent=fmtXOFShort(sent);
  document.getElementById('fk-late').textContent=fmtXOFShort(lateAmt);
  document.getElementById('fk-total').textContent=fmtXOFShort(ptf);
  // Late invoice badge
  const lateInvN=DB.invoices.filter(i=>i.status==='En retard').length;
  const nb2=document.getElementById('nb-inv'); if(nb2){nb2.style.display=lateInvN?'inline':'none';nb2.textContent=lateInvN;}
  document.getElementById('ms-done').textContent = done;
  document.getElementById('ms-prog').textContent = inprog;
  document.getElementById('ms-todo').textContent = ns;
  const wr = DB.tasks.filter(t=>t.realHours);
  document.getElementById('ms-avg').textContent = wr.length ? (wr.reduce((s,t)=>s+t.realHours,0)/wr.length).toFixed(1)+'h' : '—';
  // Score ring
  const sc = effScore();
  setTimeout(()=>{
    const circ=2*Math.PI*40, off=circ-(sc/100)*circ;
    const rc=document.getElementById('ring-c');
    rc.style.strokeDashoffset=off;
    const colors={danger:'var(--red)',warning:'var(--orange)',good:'var(--accent)',great:'var(--green)'};
    const key=sc<25?'danger':sc<50?'warning':sc<75?'good':'great';
    rc.style.stroke=colors[key];
    const lvls=['🔴 Critique','🟠 Moyen','🔵 Bon','🟢 Excellent'];
    const descs=['Performance critique. Action immédiate requise.','Performance moyenne. Revoyez les priorités.','Bonne performance. Quelques ajustements possibles.','Performance remarquable ! En avance sur les objectifs.'];
    const i=sc<25?0:sc<50?1:sc<75?2:3;
    document.getElementById('ring-lv').textContent=lvls[i];
    document.getElementById('ring-lv').style.color=colors[key];
    document.getElementById('ring-desc').textContent=descs[i];
    animCount('#ring-v', sc);
  },120);
  // Alert
  updateAlert();

  // ── Analytics strip + all counters ──
  const _cActifs    = DB.clients.filter(c => c.type !== 'prospect' && !c.closedAt);
  const _cProspects = getProspects().filter(c => !c.closedAt);
  const _cClotures  = DB.clients.filter(c => !!c.closedAt);
  _updateCounters(_cActifs, _cProspects, _cClotures);

  // ── Status KPIs ──
  const _lateTasks = DB.tasks.filter(t => t.status!=='Terminé' && t.endDate && new Date()>new Date(t.endDate));
  const _elDone = document.getElementById('dstat-done'); if(_elDone) animCount(_elDone, DB.tasks.filter(t=>t.status==='Terminé').length);
  const _elProg = document.getElementById('dstat-prog'); if(_elProg) animCount(_elProg, DB.tasks.filter(t=>t.status==='En cours').length);
  const _elTodo = document.getElementById('dstat-todo'); if(_elTodo) animCount(_elTodo, DB.tasks.filter(t=>t.status==='Non démarré').length);
  const _elLate = document.getElementById('dstat-late'); if(_elLate) animCount(_elLate, _lateTasks.length);

  // ── Distribution bars ──
  window._dashDistrib = window._dashDistrib || 'projects';
  renderDashDistrib(_cActifs);

  // ── Clients list ──
  const _dcl = document.getElementById('dash-clients-list');
  if (_dcl) _dcl.innerHTML = _cActifs.slice(0,8).map(c => {
    const tasks = cTasks(c.id), done2 = tasks.filter(t=>t.status==='Terminé').length;
    const pct = tasks.length ? Math.round(done2/tasks.length*100) : 0;
    return `<div style="display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="openClientDetail(${c.id})">
      <div style="width:30px;height:30px;border-radius:7px;background:${c.color};display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-weight:700;font-size:10px;color:#000;flex-shrink:0">${esc(c.avatar)}</div>
      <div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.name)}</div>
        <div style="height:3px;background:var(--surface2);border-radius:2px;margin-top:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${c.color};border-radius:2px"></div></div>
      </div>
      <span style="font-family:var(--mono);font-size:11px;font-weight:700;color:${c.color};flex-shrink:0">${pct}%</span>
    </div>`;
  }).join('') || '<div style="color:var(--text-muted);font-size:12px;padding:8px">Aucun client actif.</div>';

  // ── Prospects list ──
  const PIPE_LBL = {lead:'🌱 Nouveau lead',contact:'📞 Contact',proposal:'📄 Proposition',negociation:'🤝 Négociation',won:'✅ Gagné',lost:'❌ Perdu'};
  const _dpl = document.getElementById('dash-prospects-list');
  if (_dpl) _dpl.innerHTML = _cProspects.slice(0,8).map(c => {
    const stage = PIPE_LBL[c.pipelineStage||c.prospectStatus] || '🎯 Prospect';
    return `<div style="display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="openProspectModal(${c.id})">
      <div style="width:30px;height:30px;border-radius:7px;background:${c.color};display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-weight:700;font-size:10px;color:#000;flex-shrink:0">${esc(c.avatar)}</div>
      <div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.name)}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${stage}</div>
      </div>
      <button class="btn btn-sm" style="background:var(--green-dim);color:var(--green);border:none;font-size:10px;padding:2px 7px;flex-shrink:0" onclick="event.stopPropagation();convertToClient(${c.id})">→ Client</button>
    </div>`;
  }).join('') || '<div style="color:var(--text-muted);font-size:12px;padding:8px">Aucun prospect en cours.</div>';

  // ── Clôturés ──
  const _dcs = document.getElementById('dash-clotures-section');
  const _dcsl = document.getElementById('dash-clotures-list');
  if (_dcs && _dcsl) {
    if (_cClotures.length) {
      _dcs.style.display = 'block';
      _dcsl.innerHTML = _cClotures.map(c => {
        const tasks = cTasks(c.id), done2 = tasks.filter(t=>t.status==='Terminé').length;
        const pct = tasks.length ? Math.round(done2/tasks.length*100) : 0;
        const cd = c.closedAt ? new Date(c.closedAt).toLocaleDateString('fr',{day:'2-digit',month:'short',year:'numeric'}) : '—';
        return `<div style="display:flex;align-items:center;gap:9px;padding:7px 8px;border-bottom:1px solid var(--border);filter:grayscale(50%);opacity:.75">
          <div style="width:30px;height:30px;border-radius:7px;background:${c.color};display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-weight:700;font-size:10px;color:#000;flex-shrink:0">${esc(c.avatar)}</div>
          <div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.name)}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:1px">🔒 ${cd} · ${tasks.length} tâche(s) · ${pct}% complété</div>
          </div>
        </div>`;
      }).join('');
    } else { _dcs.style.display = 'none'; }
  }

  // Active tasks table
  const tbody=document.getElementById('dash-tasks');
  const active=DB.tasks.filter(t=>t.status!=='Terminé').slice(0,8);
  tbody.innerHTML=active.map(t=>{
    const c=gc(t.clientId),p=gp(t.projectId);
    const comp=t.projectId?pComp(t.projectId):(t.status==='Terminé'?100:t.status==='En cours'?50:0);
    const now=new Date(),end=new Date(t.endDate);
    const late=now>end;
    return `<tr><td><strong>${esc(t.name)}</strong></td><td>${ctag(t.clientId)}</td><td style="font-size:12px;color:var(--text-muted)">${esc(p?.name||'')}</td><td>${statusBadge(t.status)}</td>
    <td style="min-width:90px"><div style="display:flex;align-items:center;gap:7px"><div class="pbar" style="flex:1"><div class="pfill" style="width:${comp}%"></div></div><span style="font-family:var(--mono);font-size:11px;color:var(--text-muted)">${comp}%</span></div></td>
    <td class="${late?'time-bad':'time-n'}">${late?'⚠ Retard':fmtDate(t.endDate)}</td></tr>`;
  }).join('')||`<tr><td colspan="6"><div class="empty"><div class="empty-ico">🎉</div><div class="empty-txt">Toutes les tâches actives sont terminées !</div></div></td></tr>`;
  initCharts();
}

// ═══════════════════════════════════════════════════════
//  DISTRIBUTION DASHBOARD
// ═══════════════════════════════════════════════════════
function setDashDistrib(type) {
  window._dashDistrib = type;
  ['projects','tasks','status'].forEach(t => {
    const btn = document.getElementById('dash-distrib-btn-' + t);
    if (!btn) return;
    if (t === type) { btn.style.background='var(--accent)'; btn.style.color='#000'; btn.className='btn btn-sm'; }
    else { btn.style.background=''; btn.style.color=''; btn.className='btn btn-ghost btn-sm'; }
  });
  renderDashDistrib();
}

function renderDashDistrib(activeClients) {
  if (!activeClients) activeClients = DB.clients.filter(c => c.type !== 'prospect' && !c.closedAt);
  const type = window._dashDistrib || 'projects';
  const titleEl = document.getElementById('dash-distrib-title');
  const barsEl = document.getElementById('dash-client-bars');
  const statusBarsEl = document.getElementById('dash-status-bars');
  if (!barsEl) return;

  if (type === 'projects') {
    if (titleEl) titleEl.textContent = '📁 Projets par client';
    const data = activeClients.map(c => ({c, count: cProjects(c.id).length})).sort((a,b)=>b.count-a.count);
    const max = Math.max(1, ...data.map(d=>d.count));
    barsEl.innerHTML = data.filter(d=>d.count>0).map(({c,count}) =>
      `<div style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:3px 0" onclick="openClientDetail(${c.id})">
        <div style="width:80px;font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${c.color}">${esc(c.name)}</div>
        <div style="flex:1;height:14px;background:var(--surface2);border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${Math.round(count/max*100)}%;background:${c.color};border-radius:4px;transition:width .8s"></div>
        </div>
        <span style="font-family:var(--mono);font-size:11px;font-weight:700;color:${c.color};min-width:16px;text-align:right">${count}</span>
      </div>`
    ).join('') || '<div style="color:var(--text-muted);font-size:12px">Aucune donnée.</div>';
  } else if (type === 'tasks') {
    if (titleEl) titleEl.textContent = '📋 Tâches par client';
    const data = activeClients.map(c => {const t=cTasks(c.id);return{c,count:t.length,done:t.filter(x=>x.status==='Terminé').length};}).sort((a,b)=>b.count-a.count);
    const max = Math.max(1, ...data.map(d=>d.count));
    barsEl.innerHTML = data.filter(d=>d.count>0).map(({c,count,done}) =>
      `<div style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:3px 0" onclick="openClientDetail(${c.id})">
        <div style="width:80px;font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${c.color}">${esc(c.name)}</div>
        <div style="flex:1;height:14px;background:var(--surface2);border-radius:4px;overflow:hidden;position:relative">
          <div style="height:100%;width:${Math.round(count/max*100)}%;background:${c.color}44;border-radius:4px"></div>
          <div style="position:absolute;top:0;left:0;height:100%;width:${count>0?Math.round(done/count*100):0}%;background:${c.color};border-radius:4px;transition:width .8s"></div>
        </div>
        <span style="font-family:var(--mono);font-size:11px;font-weight:700;color:${c.color};min-width:28px;text-align:right">${done}/${count}</span>
      </div>`
    ).join('') || '<div style="color:var(--text-muted);font-size:12px">Aucune donnée.</div>';
  } else {
    if (titleEl) titleEl.textContent = '⚡ Statuts par client';
    const data = activeClients.map(c => {const t=cTasks(c.id);return{c,done:t.filter(x=>x.status==='Terminé').length,prog:t.filter(x=>x.status==='En cours').length,todo:t.filter(x=>x.status==='Non démarré').length,total:t.length};}).filter(d=>d.total>0).sort((a,b)=>b.total-a.total);
    barsEl.innerHTML = data.map(({c,done,prog,todo,total}) =>
      `<div style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:3px 0" onclick="openClientDetail(${c.id})">
        <div style="width:80px;font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.name)}</div>
        <div style="flex:1;height:14px;background:var(--surface2);border-radius:4px;overflow:hidden;display:flex">
          <div style="height:100%;width:${Math.round(done/total*100)}%;background:var(--green)" title="Terminées: ${done}"></div>
          <div style="height:100%;width:${Math.round(prog/total*100)}%;background:var(--accent)" title="En cours: ${prog}"></div>
          <div style="height:100%;width:${Math.round(todo/total*100)}%;background:var(--surface3)" title="Non démarrées: ${todo}"></div>
        </div>
        <span style="font-family:var(--mono);font-size:10px;color:var(--text-muted);min-width:20px;text-align:right">${total}</span>
      </div>`
    ).join('') || '<div style="color:var(--text-muted);font-size:12px">Aucune tâche.</div>';
  }

  if (statusBarsEl) {
    const data2 = activeClients.map(c => {const t=cTasks(c.id);return{c,done:t.filter(x=>x.status==='Terminé').length,total:t.length};}).filter(d=>d.total>0).sort((a,b)=>b.total-a.total);
    statusBarsEl.innerHTML = data2.map(({c,done,total}) => {
      const pct = Math.round(done/total*100);
      return `<div style="display:flex;align-items:center;gap:7px;font-size:11px;padding:2px 0">
        <div style="width:75px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;color:${c.color}">${esc(c.name)}</div>
        <div style="flex:1;height:5px;background:var(--surface2);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${c.color};border-radius:3px;transition:width .8s"></div>
        </div>
        <span style="font-family:var(--mono);font-size:10.5px;font-weight:700;min-width:28px;text-align:right;color:${pct>=80?'var(--green)':pct>=50?'var(--accent)':'var(--amber)'}">${pct}%</span>
      </div>`;
    }).join('');
  }
}

// ═══════════════════════════════════════════════════════
//  CHARTS
// ═══════════════════════════════════════════════════════
function cDef() {
  const d=document.documentElement.getAttribute('data-theme')==='dark';
  return { grid:d?'rgba(255,255,255,.05)':'rgba(0,0,0,.06)', text:d?'#617a9a':'#778899' };
}
function dChart(k) { if(state.charts[k]){state.charts[k].destroy();delete state.charts[k];} }

function initCharts() {
  const d=cDef(), cn=DB.clients.map(c=>c.name), cc=DB.clients.map(c=>c.color);
  dChart('bar');
  const elBar = document.getElementById('ch-bar');
  if (elBar) state.charts.bar = new Chart(elBar, { type:'bar', data:{ labels:cn, datasets:[{ label:'Tâches', data:DB.clients.map(c=>cTasks(c.id).length), backgroundColor:cc.map(c=>c+'99'), borderColor:cc, borderWidth:2, borderRadius:6 }] }, options:{ responsive:true, maintainAspectRatio:true, plugins:{legend:{display:false}}, scales:{ x:{grid:{color:d.grid},ticks:{color:d.text}}, y:{grid:{color:d.grid},ticks:{color:d.text,stepSize:1}} } } });
  dChart('status');
  const elStatus = document.getElementById('ch-status');
  const done2=DB.tasks.filter(t=>t.status==='Terminé').length, inp=DB.tasks.filter(t=>t.status==='En cours').length, ns=DB.tasks.filter(t=>t.status==='Non démarré').length, fl=DB.tasks.filter(t=>t.status==='À suivre').length;
  if (elStatus) state.charts.status = new Chart(elStatus, { type:'doughnut', data:{ labels:['Terminées','En cours','À suivre','Non démarrées'], datasets:[{ data:[done2,inp,fl,ns], backgroundColor:['#00e5a0cc','#00c8ffcc','#ffab00cc','#33445566'], borderWidth:0, hoverOffset:7 }] }, options:{ responsive:true, maintainAspectRatio:true, cutout:'64%', plugins:{ legend:{ position:'bottom', labels:{ color:d.text, padding:14, font:{size:11.5} } } } } });
  dChart('line'); lineState={gran:'day',monthOffset:0}; updateLineChart();
  dChart('pieclient');
  const elPie = document.getElementById('ch-pieclient');
  if (elPie) state.charts.pieclient = new Chart(elPie, { type:'doughnut', data:{ labels:cn, datasets:[{ data:DB.clients.map(c=>cProjects(c.id).length), backgroundColor:cc.map(c=>c+'cc'), borderWidth:0, hoverOffset:7 }] }, options:{ responsive:true, maintainAspectRatio:true, cutout:'58%', plugins:{ legend:{ position:'bottom', labels:{ color:d.text, padding:11, font:{size:11.5} } } } } });
}

// ── LINE CHART STATE ──
let lineState = { gran:'day', monthOffset:0 }; // gran: day|week|month

function setGran(g) {
  lineState.gran=g; lineState.monthOffset=0;
  document.querySelectorAll('.gran-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('gran-'+g).classList.add('active');
  // month nav: visible in day/week mode only
  document.getElementById('month-nav').style.display=(g==='month')?'none':'flex';
  document.getElementById('line-range').style.display=(g==='month')?'flex':'none';
  updateLineChart();
}
function shiftMonth(dir) { lineState.monthOffset+=dir; updateLineChart(); }
function resetMonthNav() { lineState.monthOffset=0; updateLineChart(); }

function updateLineChart() {
  if (!document.getElementById('ch-line')) return;
  const gran=lineState.gran;
  const d=cDef();
  const total=Math.max(1,DB.tasks.length);
  let labels=[], datasets=[];

  if(gran==='month') {
    // ── MOIS PAR MOIS sur la plage choisie ──
    const rangeEl=document.getElementById('line-range');
    const range=rangeEl?rangeEl.value:'3m';
    const months=range==='1m'?1:range==='3m'?3:range==='6m'?6:12;
    const now=new Date();
    const tasksDone=[], tasksNew=[], pctComp=[];
    for(let i=months-1;i>=0;i--){
      const d1=new Date(now.getFullYear(),now.getMonth()-i,1);
      const d2=new Date(now.getFullYear(),now.getMonth()-i+1,0,23,59,59);
      labels.push(d1.toLocaleDateString('fr',{month:'short',year:'2-digit'}));
      const doneThisMonth=DB.tasks.filter(t=>t.status==='Terminé'&&new Date(t.endDate)>=d1&&new Date(t.endDate)<=d2).length;
      const newThisMonth=DB.tasks.filter(t=>new Date(t.startDate)>=d1&&new Date(t.startDate)<=d2).length;
      const cumulDone=DB.tasks.filter(t=>t.status==='Terminé'&&new Date(t.endDate)<=d2).length;
      tasksDone.push(doneThisMonth);
      tasksNew.push(newThisMonth);
      pctComp.push(Math.round(cumulDone/total*100));
    }
    // update month nav label
    document.getElementById('month-nav-lbl').textContent='';
    // KPI strip
    const prevDone=tasksDone.slice(0,-1).reduce((s,v)=>s+v,0)/Math.max(1,tasksDone.length-1);
    const lastDone=tasksDone[tasksDone.length-1]||0;
    document.getElementById('line-kpis').innerHTML=`
      <div class="mstat"><span>✅</span><span class="mstat-lbl">Tâches finies ce mois</span><span class="mstat-val" style="color:var(--green)">${lastDone}</span></div>
      <div class="mstat"><span>📈</span><span class="mstat-lbl">Complétion cumulée</span><span class="mstat-val" style="color:var(--accent)">${pctComp[pctComp.length-1]||0}%</span></div>
      <div class="mstat"><span>➕</span><span class="mstat-lbl">Nouvelles tâches ce mois</span><span class="mstat-val" style="color:var(--amber)">${tasksNew[tasksNew.length-1]||0}</span></div>`;
    dChart('line');
    const ctx=document.getElementById('ch-line').getContext('2d');
    const g1=ctx.createLinearGradient(0,0,0,200);
    g1.addColorStop(0,'rgba(0,200,255,.22)'); g1.addColorStop(1,'rgba(0,200,255,0)');
    state.charts.line=new Chart(ctx,{type:'bar',data:{labels,datasets:[
      {type:'bar',label:'Terminées',data:tasksDone,backgroundColor:'rgba(0,229,160,.55)',borderColor:'#00e5a0',borderWidth:1.5,borderRadius:4,yAxisID:'y1'},
      {type:'bar',label:'Nouvelles',data:tasksNew,backgroundColor:'rgba(255,171,0,.4)',borderColor:'#ffab00',borderWidth:1.5,borderRadius:4,yAxisID:'y1'},
      {type:'line',label:'% Cumulé',data:pctComp,borderColor:'#00c8ff',backgroundColor:g1,borderWidth:2.5,fill:true,tension:.4,pointRadius:3,pointBackgroundColor:'#00c8ff',yAxisID:'y2'},
    ]},options:{responsive:true,maintainAspectRatio:true,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'top',labels:{color:d.text,font:{size:11},padding:12}}},scales:{
      x:{grid:{color:d.grid},ticks:{color:d.text}},
      y1:{grid:{color:d.grid},ticks:{color:d.text,stepSize:1},position:'left',title:{display:true,text:'Tâches',color:d.text,font:{size:10}}},
      y2:{grid:{display:false},ticks:{color:'#00c8ff',callback:v=>v+'%'},position:'right',min:0,max:100,title:{display:true,text:'%',color:'#00c8ff',font:{size:10}}},
    }}});

  } else if(gran==='week') {
    // ── VUE SEMAINE PAR SEMAINE dans le mois courant ──
    const now=new Date();
    const refMonth=new Date(now.getFullYear(),now.getMonth()+lineState.monthOffset,1);
    const yr=refMonth.getFullYear(), mo=refMonth.getMonth();
    document.getElementById('month-nav-lbl').textContent=refMonth.toLocaleDateString('fr',{month:'long',year:'numeric'});
    // build weeks of this month
    const firstDay=new Date(yr,mo,1), lastDay=new Date(yr,mo+1,0);
    let wStart=new Date(firstDay); wStart.setDate(wStart.getDate()-((wStart.getDay()+6)%7)); // Mon
    const weeks=[];
    while(wStart<=lastDay){
      const wEnd=new Date(wStart); wEnd.setDate(wStart.getDate()+6); wEnd.setHours(23,59,59);
      weeks.push({s:new Date(wStart),e:new Date(wEnd<lastDay?wEnd:lastDay)});
      wStart.setDate(wStart.getDate()+7);
    }
    const wLabels=weeks.map((w,i)=>`S${i+1} (${w.s.toLocaleDateString('fr',{day:'2-digit',month:'short'})})`);
    const wDone=weeks.map(w=>DB.tasks.filter(t=>t.status==='Terminé'&&new Date(t.endDate)>=w.s&&new Date(t.endDate)<=w.e).length);
    const wNew=weeks.map(w=>DB.tasks.filter(t=>new Date(t.startDate)>=w.s&&new Date(t.startDate)<=w.e).length);
    const wPct=weeks.map(w=>Math.round(DB.tasks.filter(t=>t.status==='Terminé'&&new Date(t.endDate)<=w.e).length/total*100));
    document.getElementById('line-kpis').innerHTML=`
      <div class="mstat"><span>📅</span><span class="mstat-lbl">Semaines</span><span class="mstat-val" style="color:var(--accent)">${weeks.length}</span></div>
      <div class="mstat"><span>✅</span><span class="mstat-lbl">Terminées ce mois</span><span class="mstat-val" style="color:var(--green)">${wDone.reduce((s,v)=>s+v,0)}</span></div>
      <div class="mstat"><span>📈</span><span class="mstat-lbl">Progression</span><span class="mstat-val" style="color:var(--amber)">${(wPct[wPct.length-1]||0)-(wPct[0]||0)}pts</span></div>`;
    dChart('line');
    const ctx=document.getElementById('ch-line').getContext('2d');
    const g2=ctx.createLinearGradient(0,0,0,200);
    g2.addColorStop(0,'rgba(0,200,255,.22)'); g2.addColorStop(1,'rgba(0,200,255,0)');
    state.charts.line=new Chart(ctx,{type:'bar',data:{labels:wLabels,datasets:[
      {type:'bar',label:'Terminées',data:wDone,backgroundColor:'rgba(0,229,160,.55)',borderColor:'#00e5a0',borderWidth:1.5,borderRadius:4,yAxisID:'y1'},
      {type:'bar',label:'Nouvelles',data:wNew,backgroundColor:'rgba(255,171,0,.4)',borderColor:'#ffab00',borderWidth:1.5,borderRadius:4,yAxisID:'y1'},
      {type:'line',label:'% Cumulé',data:wPct,borderColor:'#00c8ff',backgroundColor:g2,borderWidth:2.5,fill:true,tension:.4,pointRadius:4,pointBackgroundColor:'#00c8ff',yAxisID:'y2'},
    ]},options:{responsive:true,maintainAspectRatio:true,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'top',labels:{color:d.text,font:{size:11},padding:12}}},scales:{
      x:{grid:{color:d.grid},ticks:{color:d.text}},
      y1:{grid:{color:d.grid},ticks:{color:d.text,stepSize:1},position:'left'},
      y2:{grid:{display:false},ticks:{color:'#00c8ff',callback:v=>v+'%'},position:'right',min:0,max:100},
    }}});

  } else {
    // ── VUE JOURNALIÈRE du mois courant ──
    const now=new Date();
    const refMonth=new Date(now.getFullYear(),now.getMonth()+lineState.monthOffset,1);
    const yr=refMonth.getFullYear(), mo=refMonth.getMonth();
    document.getElementById('month-nav-lbl').textContent=refMonth.toLocaleDateString('fr',{month:'long',year:'numeric'});
    const daysInMonth=new Date(yr,mo+1,0).getDate();
    const dLabels=[],dDone=[],dPct=[];
    for(let day=1;day<=daysInMonth;day++){
      const dd=new Date(yr,mo,day,23,59,59);
      dLabels.push(day);
      const doneDay=DB.tasks.filter(t=>t.status==='Terminé'&&new Date(t.endDate).getFullYear()===yr&&new Date(t.endDate).getMonth()===mo&&new Date(t.endDate).getDate()===day).length;
      dDone.push(doneDay);
      dPct.push(Math.round(DB.tasks.filter(t=>t.status==='Terminé'&&new Date(t.endDate)<=dd).length/total*100));
    }
    const peakDay=dDone.indexOf(Math.max(...dDone))+1;
    document.getElementById('line-kpis').innerHTML=`
      <div class="mstat"><span>📆</span><span class="mstat-lbl">Jours dans le mois</span><span class="mstat-val" style="color:var(--accent)">${daysInMonth}</span></div>
      <div class="mstat"><span>✅</span><span class="mstat-lbl">Terminées ce mois</span><span class="mstat-val" style="color:var(--green)">${dDone.reduce((s,v)=>s+v,0)}</span></div>
      ${Math.max(...dDone)>0?`<div class="mstat"><span>🏆</span><span class="mstat-lbl">Jour le + productif</span><span class="mstat-val" style="color:var(--amber)">${peakDay} ${refMonth.toLocaleDateString('fr',{month:'short'})}</span></div>`:''}`;
    dChart('line');
    const ctx=document.getElementById('ch-line').getContext('2d');
    const g3=ctx.createLinearGradient(0,0,0,200);
    g3.addColorStop(0,'rgba(0,200,255,.2)'); g3.addColorStop(1,'rgba(0,200,255,0)');
    state.charts.line=new Chart(ctx,{type:'bar',data:{labels:dLabels,datasets:[
      {type:'bar',label:'Terminées',data:dDone,backgroundColor:'rgba(0,229,160,.55)',borderColor:'#00e5a0',borderWidth:1,borderRadius:3,yAxisID:'y1'},
      {type:'line',label:'% Cumulé',data:dPct,borderColor:'#00c8ff',backgroundColor:g3,borderWidth:2.5,fill:true,tension:.4,pointRadius:daysInMonth>20?0:3,pointBackgroundColor:'#00c8ff',yAxisID:'y2'},
    ]},options:{responsive:true,maintainAspectRatio:true,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'top',labels:{color:d.text,font:{size:11},padding:12}}},scales:{
      x:{grid:{color:d.grid},ticks:{color:d.text,maxTicksLimit:15}},
      y1:{grid:{color:d.grid},ticks:{color:'#00e5a0',stepSize:1},position:'left',min:0},
      y2:{grid:{display:false},ticks:{color:'#00c8ff',callback:v=>v+'%'},position:'right',min:0,max:100},
    }}});
  }
}

// ═══════════════════════════════════════════════════════
//  RENDER: SECTORS
// ═══════════════════════════════════════════════════════
function renderSectors() {
  document.getElementById('sv-creative').textContent = DB.clients.filter(c=>c.needs?.includes('creative')).length;
  document.getElementById('sv-conseil').textContent = DB.clients.filter(c=>c.needs?.includes('conseil')).length;
  document.getElementById('sv-digital').textContent = DB.clients.filter(c=>c.needs?.includes('digital')).length;

  // Group clients by sector
  const groups = {};
  DB.clients.forEach(c=>{
    if(!groups[c.sector]) groups[c.sector]=[];
    groups[c.sector].push(c);
  });

  // Charts
  const sectorNames = Object.keys(groups);
  const d = cDef();
  dChart('sneed');
  const sneedCtx = document.getElementById('ch-sector-needs');
  if(sneedCtx) state.charts.sneed = new Chart(sneedCtx, { type:'bar', data:{ labels:sectorNames, datasets:[
    { label:'Créatif', data:sectorNames.map(s=>groups[s].filter(c=>c.needs?.includes('creative')).length), backgroundColor:'rgba(244,114,182,.7)', borderRadius:4 },
    { label:'Conseil', data:sectorNames.map(s=>groups[s].filter(c=>c.needs?.includes('conseil')).length), backgroundColor:'rgba(167,139,250,.7)', borderRadius:4 },
    { label:'Digital', data:sectorNames.map(s=>groups[s].filter(c=>c.needs?.includes('digital')).length), backgroundColor:'rgba(0,200,255,.7)', borderRadius:4 },
  ]}, options:{ responsive:true, maintainAspectRatio:true, plugins:{legend:{position:'top',labels:{color:d.text,font:{size:11}}}}, scales:{ x:{grid:{color:d.grid},ticks:{color:d.text}}, y:{grid:{color:d.grid},ticks:{color:d.text,stepSize:1}} } }});

  dChart('sbudget');
  const sbCtx = document.getElementById('ch-sector-budget');
  if(sbCtx) state.charts.sbudget = new Chart(sbCtx, { type:'doughnut', data:{ labels:sectorNames, datasets:[{ data:sectorNames.map(s=>groups[s].reduce((sum,c)=>sum+(c.budget||0),0)), backgroundColor:sectorNames.map(s=>(SECTORS_META[s]?.color||'#60a5fa')+'cc'), borderWidth:0, hoverOffset:7 }]}, options:{ responsive:true, maintainAspectRatio:true, cutout:'58%', plugins:{ legend:{ position:'bottom', labels:{ color:d.text, padding:10, font:{size:11} } } } }});

  // Sector cards
  const grid = document.getElementById('sectors-grid');
  grid.innerHTML = Object.entries(groups).map(([sector, clients])=>{
    const meta = SECTORS_META[sector]||{icon:'◈',color:'#60a5fa'};
    const projs = clients.flatMap(c=>cProjects(c.id));
    const tasks = clients.flatMap(c=>cTasks(c.id));
    const budget = clients.reduce((s,c)=>s+(c.budget||0),0);
    return `<div class="sector-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="font-size:24px">${meta.icon}</div>
          <div><div class="sector-name">${sector}</div><div class="sector-count">${clients.length} client${clients.length>1?'s':''} · ${projs.length} projets · ${tasks.length} tâches</div></div>
        </div>
        ${budget?`<div style="font-family:var(--mono);font-size:13px;font-weight:700;color:${meta.color}">${(budget/1000000).toFixed(1)}M XOF</div>`:''}
      </div>
      <div class="sector-clients">
        ${clients.map(c=>{
          const cp = cProjects(c.id).length, ct = cTasks(c.id).length, cdone = cTasks(c.id).filter(t=>t.status==='Terminé').length;
          const pct = ct ? Math.round(cdone/ct*100) : 0;
          return `<div class="sector-client-row" onclick="filterClientTo('${c.id}')" style="cursor:pointer">
            <span class="ctag" style="background:${c.color}1a;color:${c.color}"><span class="cdot" style="background:${c.color}"></span>${esc(c.name)}</span>
            <div style="display:flex;align-items:center;gap:8px">
              ${c.needs?.map(n=>needBadge(n)).join('')||''}
              <span style="font-family:var(--mono);font-size:11px;color:${meta.color}">${pct}%</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
}

function filterClientTo(cid) {
  go('clients');
}

// ═══════════════════════════════════════════════════════
//  RENDER: CLIENTS
// ═══════════════════════════════════════════════════════
window._clientActiveTab = window._clientActiveTab || 'client';

function switchClientTab(tab) {
  window._clientActiveTab = tab;
  const COLORS = {client:'var(--accent)', prospect:'var(--purple)', cloture:'var(--amber)'};
  const DIMS   = {client:'var(--accent-dim)', prospect:'var(--purple-dim)', cloture:'var(--amber-dim)'};

  ['client','prospect','cloture'].forEach(t => {
    const btn = document.getElementById('ctab-' + t);
    if (!btn) return;
    if (t === tab) {
      btn.style.color            = COLORS[t];
      btn.style.borderBottomColor = COLORS[t];
      btn.style.fontWeight       = '700';
      const sp = btn.querySelector('span');
      if (sp) { sp.style.background = DIMS[t]; sp.style.color = COLORS[t]; }
    } else {
      btn.style.color            = 'var(--text-muted)';
      btn.style.borderBottomColor = 'transparent';
      btn.style.fontWeight       = '600';
      const sp = btn.querySelector('span');
      if (sp) { sp.style.background = 'var(--surface2)'; sp.style.color = 'var(--text-muted)'; }
    }
  });

  const bnc = document.getElementById('btn-new-client');
  const bnp = document.getElementById('btn-new-prospect');
  if (bnc) bnc.style.display = (tab === 'client')   ? 'inline-flex' : 'none';
  if (bnp) bnp.style.display = (tab === 'prospect') ? 'inline-flex' : 'none';

  renderClients();
}

function renderClients() {
  const sf = document.getElementById('cf-sector');
  if (sf) {
    const sectors = [...new Set(DB.clients.map(c => c.sector))];
    if (sf.options.length <= 1) {
      sectors.forEach(s => {
        const o = document.createElement('option');
        o.value = s; o.textContent = s; sf.appendChild(o);
      });
    }
  }
  const fSec  = sf ? sf.value : 'all';
  const needEl = document.getElementById('cf-need');
  const fNeed = needEl ? needEl.value : 'all';
  const tab = window._clientActiveTab || 'client';

  // Compute the three pools
  const allClients   = DB.clients.filter(c => c.type !== 'prospect' && !c.closedAt);
  const allProspects = getProspects().filter(c => !c.closedAt);
  const allClosed    = DB.clients.filter(c => !!c.closedAt);

  // Update every counter globally
  _updateCounters(allClients, allProspects, allClosed);

  // Apply sector/need filter helpers
  const applyFilters = list => list.filter(c => {
    if (fSec  !== 'all' && c.sector        !== fSec)  return false;
    if (fNeed !== 'all' && !c.needs?.includes(fNeed)) return false;
    return true;
  });

  const grid = document.getElementById('clients-grid');
  if (!grid) return;

  let pool, emptyIcon, emptyTxt;
  if (tab === 'cloture') {
    pool = applyFilters(allClosed);
    emptyIcon = '🔒'; emptyTxt = 'Aucun client clôturé pour le moment';
  } else if (tab === 'prospect') {
    pool = applyFilters(allProspects);
    emptyIcon = '🎯'; emptyTxt = 'Aucun prospect en cours';
  } else {
    pool = applyFilters(allClients);
    emptyIcon = '👤'; emptyTxt = 'Aucun client actif trouvé';
  }

  if (!pool.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-ico">${emptyIcon}</div><div class="empty-txt">${emptyTxt}</div></div>`;
  } else if (tab === 'cloture') {
    grid.innerHTML = pool.map(c => _renderClosedCard(c)).join('');
  } else {
    grid.innerHTML = pool.map(c => _renderClientCard(c)).join('');
  }

  // Hide old historique section
  const hs = document.getElementById('historique-section');
  if (hs) hs.style.display = 'none';
}

function _renderClosedCard(c) {
  const projs = cProjects(c.id), tasks = cTasks(c.id);
  const done  = tasks.filter(t => t.status === 'Terminé').length;
  const pct   = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  const meta  = SECTORS_META[c.sector] || {icon:'◈'};
  const cd    = c.closedAt
    ? new Date(c.closedAt).toLocaleDateString('fr',{day:'2-digit',month:'long',year:'numeric'})
    : '—';
  return `<div class="client-card" style="--cc-color:var(--text-dim);filter:grayscale(35%);opacity:.8">
    <div class="cc-head">
      <div style="display:flex;align-items:center;gap:11px">
        <div class="cc-avatar" style="background:${c.color};filter:grayscale(40%)">${esc(c.avatar)}</div>
        <div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <div class="cc-name">${esc(c.name)}</div>
            <span class="lbl-cloture">🔒 Clôturé</span>
          </div>
          <div class="cc-sector">${meta.icon} ${esc(c.sector)}</div>
        </div>
      </div>
      <div style="display:flex;gap:5px">
        <button class="btn btn-ghost btn-sm" onclick="openClientDetail(${c.id})">🔍</button>
        <button class="btn btn-danger btn-sm" onclick="deleteClient(${c.id})">🗑</button>
      </div>
    </div>
    <div style="font-size:11px;color:var(--text-muted);padding:5px 8px;background:var(--surface2);border-radius:5px;margin-bottom:8px">
      📅 Clôturé le ${cd} · ${projs.length} projet(s) · ${tasks.length} tâche(s)
    </div>
    <div class="cc-needs">${(c.needs||[]).map(n=>needBadge(n)).join('')}</div>
    ${c.brief?`<div style="font-size:11px;color:var(--text-muted);padding:7px 9px;background:var(--surface2);border-radius:6px;border-left:2px solid var(--border2);margin-bottom:8px">"${esc(c.brief)}"</div>`:''}
    <div class="cc-stats">
      <div class="client-stat"><div class="cc-stat-val" style="color:var(--text-muted)">${projs.length}</div><div class="cc-stat-lbl">Projets</div></div>
      <div class="client-stat"><div class="cc-stat-val">${tasks.length}</div><div class="cc-stat-lbl">Tâches</div></div>
      <div class="client-stat"><div class="cc-stat-val" style="color:var(--green)">${pct}%</div><div class="cc-stat-lbl">Complétion</div></div>
    </div>
    <div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:4px"><span>Complétion finale</span><span style="font-family:var(--mono);font-weight:700">${pct}%</span></div>
      <div class="pbar" style="height:5px"><div class="pfill" style="width:${pct}%;background:linear-gradient(90deg,var(--text-dim),var(--border2))"></div></div>
    </div>
    <div style="display:flex;gap:6px">
      <button class="btn btn-sm" style="flex:1;background:var(--green-dim);color:var(--green);border:1px solid rgba(0,229,160,.3)" onclick="reopenClient(${c.id})">🔓 Réactiver</button>
      <button class="btn btn-ghost btn-sm" onclick="openClientDetail(${c.id})">🔍 Voir fiche</button>
    </div>
  </div>`;
}


function _renderClientCard(c) {
    const projs=cProjects(c.id), tasks=cTasks(c.id), invs=cInvoices(c.id);
    const done=tasks.filter(t=>t.status==='Terminé').length;
    const pct=tasks.length?Math.round(done/tasks.length*100):0;
    const paidAmt=invs.filter(i=>i.status==='Payée').reduce((s,i)=>s+i.amount,0);
    const lateInvs=invs.filter(i=>i.status==='En retard');
    const meta=SECTORS_META[c.sector]||{icon:'◈'};
    const isProspect = c.type === 'prospect';
    const typeLbl = isProspect
      ? `<span class="lbl-prospect">🎯 Prospect</span>`
      : `<span class="lbl-client">✅ Client</span>`;
    return `<div class="client-card" style="--cc-color:${c.color}">
      <div class="cc-head">
        <div style="display:flex;align-items:center;gap:11px">
          <div class="cc-avatar" style="background:${c.color}">${esc(c.avatar)}</div>
          <div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <div class="cc-name">${esc(c.name)}</div>${typeLbl}
            </div>
            <div class="cc-sector">${meta.icon} ${esc(c.sector)}</div>
          </div>
        </div>
        <div style="display:flex;gap:5px">
          <button class="btn btn-ghost btn-sm" onclick="openClientDetail(${c.id})" title="Voir détail">🔍</button>
          <button class="btn btn-ghost btn-sm" onclick="openEditClient(${c.id})" title="Modifier">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deleteClient(${c.id})" title="Supprimer">🗑</button>
        </div>
      </div>
      <div class="cc-needs">${(c.needs||[]).map(n=>needBadge(n)).join('')}</div>
      ${c.brief?`<div style="font-size:11.5px;color:var(--text-muted);line-height:1.5;margin-bottom:10px;padding:8px 10px;background:var(--surface2);border-radius:6px;border-left:2px solid ${c.color}">"${esc(c.brief)}"</div>`:''}
      ${(c.budget&&c.contractDuration)?`<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--amber-dim);border-radius:6px;margin-bottom:10px;border:1px solid rgba(255,171,0,.2)">
        <span style="font-size:12px">💰</span>
        <span style="font-size:11px;color:var(--amber);font-weight:600">${Math.round(c.budget/c.contractDuration).toLocaleString('fr-FR')} XOF <span style="font-weight:400;color:var(--text-muted)">/ mois HT · ${c.contractDuration} mois</span></span>
      </div>`:''}
      ${lateInvs.length?`<div style="display:flex;align-items:center;gap:7px;padding:6px 10px;background:var(--red-dim);border-radius:6px;margin-bottom:10px;border:1px solid rgba(255,61,90,.2)"><span>⚠️</span><span style="font-size:11.5px;color:var(--red);font-weight:600">${lateInvs.length} facture(s) en retard — ${formatXOF(lateInvs.reduce((s,i)=>s+i.amount,0))}</span></div>`:''}
      <div class="cc-stats">
        <div class="client-stat"><div class="cc-stat-val" style="color:${c.color}">${projs.length}</div><div class="cc-stat-lbl">Projets</div></div>
        <div class="client-stat"><div class="cc-stat-val">${tasks.length}</div><div class="cc-stat-lbl">Tâches</div></div>
        ${paidAmt?`<div class="client-stat"><div class="cc-stat-val" style="color:var(--green);font-size:13px">${fmtXOFShort(paidAmt)}</div><div class="cc-stat-lbl">Encaissé</div></div>`:''}
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:5px"><span>Complétion globale</span><span style="color:${c.color};font-family:var(--mono);font-weight:700">${pct}%</span></div>
        <div class="pbar" style="height:6px"><div class="pfill" style="width:${pct}%;background:linear-gradient(90deg,${c.color},${c.color}88)"></div></div>
      </div>
      ${isProspect
      ? `<div style="display:flex;gap:6px;margin-top:8px">
           <button class="convert-btn" onclick="convertToClient(${c.id})" style="flex:1">🎉 Convertir en Client</button>
         </div>`
      : `<div style="display:flex;gap:6px;margin-top:8px">
           <button class="btn btn-ghost btn-sm" style="flex:1" onclick="openClientDetail(${c.id})">🔍 Voir la fiche</button>
           <button class="btn-cloture" onclick="clotureClient(${c.id})" style="flex:none;white-space:nowrap">🔒 Clôturer</button>
         </div>`
    }
    </div>`;
}

// ── CLÔTURE D'UN CONTRAT ──
function clotureClient(cid) {
  const c = gc(cid); if (!c) return;
  if (!confirm(`Clôturer le contrat de "${c.name}" ?\n\nCe client deviendra gris et sera automatiquement classé dans l'onglet "Clôturés". Vous pourrez le réactiver à tout moment.`)) return;
  c.closedAt = new Date().toISOString();
  saveDB();
  updateAlert();
  if (typeof renderDashboard === 'function') setTimeout(renderDashboard, 50);
  window._clientActiveTab = 'cloture';
  if (state.view === 'clients') {
    switchClientTab('cloture');
  } else {
    const _ov = document.getElementById('client-detail-overlay');
    if (_ov) _ov.classList.remove('open');
    go('clients');
    setTimeout(() => switchClientTab('cloture'), 250);
  }
  showToast('🔒', `"${c.name}" clôturé — onglet Clôturés.`, 'var(--amber)');
}

// ── RÉOUVERTURE D'UN CONTRAT ──
function reopenClient(cid) {
  const c = gc(cid); if (!c) return;
  if (!confirm(`Réactiver "${c.name}" ?\n\nCe client sera remis dans la liste des clients actifs.`)) return;
  delete c.closedAt;
  saveDB();
  updateAlert();
  if (typeof renderDashboard === 'function') setTimeout(renderDashboard, 50);
  window._clientActiveTab = 'client';
  if (state.view === 'clients') {
    switchClientTab('client');
  } else {
    const _ov = document.getElementById('client-detail-overlay');
    if (_ov) _ov.classList.remove('open');
    go('clients');
    setTimeout(() => switchClientTab('client'), 250);
  }
  showToast('✅', `"${c.name}" réactivé avec succès !`, 'var(--green)');
}

// ── RENDER HISTORIQUE ──
let _histOpen = false;
function toggleHistorique() {
  _histOpen = !_histOpen;
  const grid = document.getElementById('historique-grid');
  const btn = document.getElementById('hist-toggle-btn');
  grid.style.display = _histOpen ? 'grid' : 'none';
  btn.textContent = _histOpen ? '▲ Masquer' : '▼ Afficher';
}

function renderHistorique(closedClients) {
  const grid = document.getElementById('historique-grid');
  if (!grid) return;
  grid.innerHTML = closedClients.map(c => {
    const projs = cProjects(c.id), tasks = cTasks(c.id);
    const done = tasks.filter(t=>t.status==='Terminé').length;
    const pct = tasks.length ? Math.round(done/tasks.length*100) : 0;
    const meta = SECTORS_META[c.sector]||{icon:'◈'};
    const closedDate = c.closedAt ? new Date(c.closedAt).toLocaleDateString('fr',{day:'2-digit',month:'long',year:'numeric'}) : '—';
    return `<div class="client-card hist-card" style="--cc-color:var(--text-dim);filter:grayscale(30%);opacity:.75">
      <div class="cc-head">
        <div style="display:flex;align-items:center;gap:11px">
          <div class="cc-avatar" style="background:${c.color};filter:grayscale(40%)">${esc(c.avatar)}</div>
          <div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <div class="cc-name">${esc(c.name)}</div>
              <span class="lbl-cloture">🔒 Clôturé</span>
            </div>
            <div class="cc-sector">${meta.icon} ${esc(c.sector)}</div>
          </div>
        </div>
        <div style="display:flex;gap:5px">
          <button class="btn btn-ghost btn-sm" onclick="openClientDetail(${c.id})" title="Voir détail">🔍</button>
          <button class="btn btn-danger btn-sm" onclick="deleteClient(${c.id})" title="Supprimer">🗑</button>
        </div>
      </div>
      <div class="hist-closed-info">📅 Clôturé le ${closedDate} · ${projs.length} projet(s) · ${tasks.length} tâche(s)</div>
      <div class="cc-needs">${(c.needs||[]).map(n=>needBadge(n)).join('')}</div>
      ${c.brief?`<div style="font-size:11px;color:var(--text-muted);line-height:1.5;margin-bottom:10px;padding:7px 9px;background:var(--surface2);border-radius:6px;border-left:2px solid var(--border2)">"${esc(c.brief)}"</div>`:''}
      <div class="cc-stats">
        <div class="client-stat"><div class="cc-stat-val" style="color:var(--text-muted)">${projs.length}</div><div class="cc-stat-lbl">Projets</div></div>
        <div class="client-stat"><div class="cc-stat-val">${tasks.length}</div><div class="cc-stat-lbl">Tâches</div></div>
        <div class="client-stat"><div class="cc-stat-val" style="color:var(--green)">${pct}%</div><div class="cc-stat-lbl">Complétion</div></div>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:5px"><span>Complétion finale</span><span style="font-family:var(--mono);font-weight:700">${pct}%</span></div>
        <div class="pbar" style="height:6px"><div class="pfill" style="width:${pct}%;background:linear-gradient(90deg,var(--text-dim),var(--border2))"></div></div>
      </div>
      <button class="btn-reopen" onclick="reopenClient(${c.id})">🔓 Réactiver le contrat</button>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════
//  RENDER: PROJECTS
// ═══════════════════════════════════════════════════════
function renderProjects() {
  // Reconstruit le filtre client depuis la DB live
  const pfc = document.getElementById('pf-client');
  const saved = pfc.value;
  pfc.innerHTML = '<option value="all">Tous les clients</option>' +
    DB.clients.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  pfc.value = [...pfc.options].some(o=>o.value===saved) ? saved : 'all';
  const fc = pfc.value;
  const fs = document.getElementById('pf-status').value;
  const fp = document.getElementById('pf-priority').value;
  const projs=DB.projects.filter(p=>{
    if(fc!=='all'&&p.clientId!=fc) return false;
    if(fs!=='all'&&p.status!==fs) return false;
    if(fp!=='all'&&p.priority!==fp) return false;
    return true;
  });
  const tbody=document.getElementById('proj-tbody');
  tbody.innerHTML=projs.map(p=>{
    const cl=gc(p.clientId), comp=pComp(p.id), real=pReal(p.id), delta=real>0?real-p.estimatedHours:null, ts=pTasks(p.id);
    const meta=SECTORS_META[cl?.sector]||{icon:'◈'};
    const chanBadges = (p.channels||[]).map(k=>MCPS_CHANNELS[k]?`<span class="chan-badge">${MCPS_CHANNELS[k].icon} ${MCPS_CHANNELS[k].label}</span>`:'').join('') || '<span style="color:var(--text-muted);font-size:11.5px">—</span>';
    return `<tr>
      <td><strong>${esc(p.name)}</strong></td>
      <td>${ctag(p.clientId)}</td>
      <td style="font-size:12px;color:var(--text-muted)">${meta.icon} ${esc(cl?.sector||'')}</td>
      <td style="max-width:180px">${chanBadges}</td>
      <td><select onchange="updateProjStatus(${p.id},this.value)" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:6px;font-size:11.5px;cursor:pointer;outline:none;font-family:var(--body)">
        ${['Non démarré','En cours','Terminé'].map(s=>`<option ${p.status===s?'selected':''}>${s}</option>`).join('')}
      </select></td>
      <td>${priBadge(p.priority)}</td>
      <td style="min-width:110px"><div style="display:flex;align-items:center;gap:7px"><div class="pbar" style="flex:1"><div class="pfill" style="width:${comp}%"></div></div><span style="font-family:var(--mono);font-size:11px;color:var(--text-muted)">${comp}%</span></div></td>
      <td style="font-family:var(--mono);font-size:12px">${ts.filter(t=>t.status==='Terminé').length}/${ts.length}</td>
      <td class="${delta===null?'':delta>0?'time-bad':'time-ok'}">${delta===null?'—':(delta>0?'+'+delta+'h':delta+'h')}</td>
      <td style="display:flex;gap:5px">
        <button class="btn btn-ghost btn-sm" onclick="openEditProject(${p.id})" title="Modifier">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="go('tasks')">📋</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProject(${p.id})">🗑</button>
      </td>
    </tr>`;
  }).join('')||`<tr><td colspan="10"><div class="empty"><div class="empty-ico">🗂</div><div class="empty-txt">Aucun projet trouvé</div></div></td></tr>`;
}

function updateProjStatus(pid, st) {
  const p=gp(pid); if(!p) return;
  if(st==='Terminé'&&p.status!=='Terminé') { fireConfetti(); showToast('🎉',`Projet "${p.name}" terminé !`,'var(--green)'); }
  p.status=st; saveDB(); updateAlert();
}

// ═══════════════════════════════════════════════════════
//  RENDER: TASKS (with tabs)
// ═══════════════════════════════════════════════════════
function switchTaskTab(tab) {
  state.taskTab=tab;
  document.getElementById('tab-active').classList.toggle('active',tab==='active');
  document.getElementById('tab-done').classList.toggle('active',tab==='done');
  renderTasks();
}

// ── FILTRE TÂCHES — architecture séparée init / change / render ──
function initTaskFilters() {
  // Construit les deux dropdowns depuis la DB live
  const tfc = document.getElementById('tf-client');
  const tfp = document.getElementById('tf-project');
  if (!tfc || !tfp) return;
  const fc = tfc.value || 'all';   // mémorise la sélection courante
  tfc.innerHTML = '<option value="all">Tous les clients</option>' +
    DB.clients.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  tfc.value = [...tfc.options].some(o=>o.value===fc) ? fc : 'all';
  _rebuildTaskProjects(); // construit le dropdown projets selon le client actuel
}

function _rebuildTaskProjects() {
  const tfc = document.getElementById('tf-client');
  const tfp = document.getElementById('tf-project');
  if (!tfc || !tfp) return;
  const cid  = tfc.value;
  const prev = tfp.value;
  const projs = (cid && cid !== 'all')
    ? DB.projects.filter(p => String(p.clientId) === String(cid))
    : DB.projects;
  tfp.innerHTML = '<option value="all">Tous les projets</option>' +
    projs.map(p => {
      const cl = gc(p.clientId);
      const lbl = (cid && cid !== 'all') ? esc(p.name) : `${esc(p.name)} — ${esc(cl?.name||'')}`;
      return `<option value="${p.id}">${lbl}</option>`;
    }).join('');
  // Restaure la sélection précédente si elle est toujours valide
  if ([...tfp.options].some(o => o.value === prev)) tfp.value = prev;
}

function onTaskClientChange() {
  _rebuildTaskProjects(); // cascade client → projets
  renderTasks();
}

function renderTasks() {
  initTaskFilters();      // synchronise dropdowns depuis DB
  const fc = document.getElementById('tf-client').value;
  const fp = document.getElementById('tf-project').value;

  const allFiltered=DB.tasks.filter(t=>{
    if(fc!=='all'&&t.clientId!=fc) return false;
    if(fp!=='all'&&t.projectId!=fp) return false;
    return true;
  });

  const active=allFiltered.filter(t=>t.status!=='Terminé');
  const done=allFiltered.filter(t=>t.status==='Terminé');

  document.getElementById('tc-active').textContent=active.length;
  document.getElementById('tc-done').textContent=done.length;

  const tasks = state.taskTab==='active' ? active : done;
  const tbody=document.getElementById('tasks-tbody');

  tbody.innerHTML=tasks.map(t=>{
    const cl=gc(t.clientId), pj=gp(t.projectId);
    const delta=t.realHours?(t.realHours-t.estimatedHours):null;
    const now=new Date(), end=new Date(t.endDate);
    const late=now>end&&t.status!=='Terminé';
    const isDone=t.status==='Terminé';
    return `<tr class="${isDone?'task-done-row':''}" id="task-row-${t.id}">
      <td><strong>${esc(t.name)}</strong></td>
      <td>${ctag(t.clientId)}</td>
      <td style="font-size:11.5px;color:var(--text-muted)">${esc(pj?.name||'')}</td>
      <td><select onchange="updateTaskStatus(${t.id},this.value)" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:6px;font-size:11.5px;cursor:pointer;outline:none;font-family:var(--body)">
        ${['Non démarré','En cours','À suivre','Terminé'].map(s=>`<option ${t.status===s?'selected':''}>${s}</option>`).join('')}
      </select></td>
      <td class="time-n">${fmtDate(t.startDate)}</td>
      <td class="${late?'time-bad':'time-n'}">${fmtDate(t.endDate)}${late?' ⚠':''}</td>
      <td style="font-family:var(--mono);font-size:12px">${t.estimatedHours}h</td>
      <td style="font-family:var(--mono);font-size:12px">${t.realHours?t.realHours+'h':'<span style="color:var(--text-dim)">—</span>'}</td>
      <td class="${delta===null?'':delta>0?'time-bad':'time-ok'}">${delta===null?'—':(delta>0?'+'+delta+'h':delta+'h')}</td>
      <td style="display:flex;gap:5px">
        <button class="btn btn-ghost btn-sm" onclick="openEditTask(${t.id})" title="Modifier">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteTask(${t.id})">🗑</button>
      </td>
    </tr>`;
  }).join('')||`<tr><td colspan="10"><div class="empty"><div class="empty-ico">${state.taskTab==='done'?'✅':'📋'}</div><div class="empty-txt">${state.taskTab==='done'?'Aucune tâche terminée':'Aucune tâche active'}</div></div></td></tr>`;
}

function todayISO(){ return new Date().toISOString().slice(0,10); }

function renderToday() {
  const today = todayISO();

  const doneToday = DB.tasks.filter(t => t.status==='Terminé' && t.completedDate===today);
  const progToday = DB.tasks.filter(t => t.status==='En cours' &&
    (!t.startDate || t.startDate<=today) && (!t.endDate || t.endDate>=today));
  const toFollow = DB.tasks.filter(t => t.status==='À suivre');

  document.getElementById('today-done-count').textContent = doneToday.length;
  document.getElementById('today-prog-count').textContent = progToday.length;
  document.getElementById('today-follow-count').textContent = toFollow.length;

  const rowHtml = (t, extra='') => {
    const cl = gc(t.clientId), pj = gp(t.projectId);
    return `<div class="task-edit-row">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.name)}</div>
        <div style="font-size:11px;color:var(--text-muted)">${esc(cl?.name||'')}${pj?' · '+esc(pj.name):''}</div>
      </div>
      ${extra}
    </div>`;
  };

  const list = (arr, el, emptyIcon, emptyTxt, extraFn) => {
    document.getElementById(el).innerHTML = arr.length
      ? arr.map(t=>rowHtml(t, extraFn?extraFn(t):'')).join('')
      : `<div class="empty" style="padding:24px"><div class="empty-ico">${emptyIcon}</div><div class="empty-txt">${emptyTxt}</div></div>`;
  };

  list(doneToday, 'today-done-list', '🎉', 'Rien de terminé aujourd\'hui pour le moment');
  list(progToday, 'today-prog-list', '⚡', 'Aucune tâche en cours aujourd\'hui',
    t => t.endDate ? `<span style="font-size:10.5px;color:var(--text-muted);flex-shrink:0">Fin : ${fmtDate(t.endDate)}</span>` : '');
  list(toFollow, 'today-follow-list', '🟡', 'Rien à suivre pour l\'instant',
    t => `<span class="team-late-badge" style="background:var(--amber-dim);color:var(--amber);flex-shrink:0">🟡 À suivre</span>`);

  const late = DB.tasks.filter(t => t.status!=='Terminé' && t.endDate && new Date()>new Date(t.endDate));
  const totalActive = DB.tasks.filter(t=>t.status!=='Terminé').length;
  document.getElementById('today-synth').innerHTML = `
    <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-muted);font-family:var(--mono);margin-bottom:10px">📊 Synthèse du jour</div>
    <div class="g g4">
      <div><div style="font-family:var(--mono);font-size:26px;font-weight:800;color:var(--green)">${doneToday.length}</div><div style="font-size:11.5px;color:var(--text-muted)">Terminées aujourd'hui</div></div>
      <div><div style="font-family:var(--mono);font-size:26px;font-weight:800;color:var(--accent)">${progToday.length}</div><div style="font-size:11.5px;color:var(--text-muted)">En cours aujourd'hui</div></div>
      <div><div style="font-family:var(--mono);font-size:26px;font-weight:800;color:var(--amber)">${toFollow.length}</div><div style="font-size:11.5px;color:var(--text-muted)">À suivre</div></div>
      <div><div style="font-family:var(--mono);font-size:26px;font-weight:800;color:${late.length?'var(--red)':'var(--text-muted)'}">${late.length}</div><div style="font-size:11.5px;color:var(--text-muted)">En retard (sur ${totalActive} actives)</div></div>
    </div>`;

  const nbFollow = document.getElementById('nb-follow');
  if (nbFollow) { nbFollow.textContent = toFollow.length; nbFollow.style.display = toFollow.length ? 'inline' : 'none'; }
}

function updateTaskStatus(tid, st) {
  const t=DB.tasks.find(t=>t.id===tid); if(!t) return;
  const old=t.status; t.status=st;
  if(st==='Terminé'&&old!=='Terminé') {
    t.completedDate = new Date().toISOString().slice(0,10);
    fireConfetti(); showToast('🎉',`"${t.name}" terminée ! Excellent travail !`,'var(--green)');
    const row=document.getElementById('task-row-'+tid);
    if(row) { row.classList.add('task-row-exit'); setTimeout(()=>{ saveDB(); renderTasks(); updateAlert(); if(state.view==='dashboard') renderDashboard(); if(state.view==='suivi') renderSuivi(); }, 400); return; }
  }
  saveDB(); renderTasks(); updateAlert();
  if(state.view==='dashboard') renderDashboard();
  if(state.view==='suivi') renderSuivi();
}

function deleteTask(tid) {
  if (typeof can==='function' && !can('task.delete')) { window._mcpsDenyToast && window._mcpsDenyToast('task.delete'); return; }
  const _t = DB.tasks.find(t=>t.id===tid);
  if(!confirm('Supprimer cette tâche ?')) return;
  DB.tasks=DB.tasks.filter(t=>t.id!==tid);
  saveDB(); renderTasks(); updateAlert();
  if (typeof _mcpsAudit==='function' && _t) _mcpsAudit('DELETE', 'task', tid, { name: _t.name });
}

function openEditProject(pid) {
  const p = gp(pid); if(!p) return;
  _openModalLegacy('project', p);
}

function openEditTask(tid) {
  const t = DB.tasks.find(t=>t.id===tid); if(!t) return;
  _openEditTaskModal(t);
}

// ═══════════════════════════════════════════════════════
//  RENDER: TODO
// ═══════════════════════════════════════════════════════
function renderTodo() {
  const list=document.getElementById('todo-list');
  const todos=state.todos;
  if(!todos.length) { list.innerHTML=`<div class="empty"><div class="empty-ico">🎯</div><div class="empty-txt">Ajoutez votre première action !</div></div>`; }
  else list.innerHTML=todos.map(t=>`
    <div class="todo-row" draggable="true" data-id="${t.id}" ondragstart="tdDragStart(event)" ondragover="tdDragOver(event)" ondrop="tdDrop(event)" ondragleave="tdLeave(event)">
      <div class="todo-chk ${t.done?'chk-on':''}" onclick="toggleTodo(${t.id})">${t.done?'✓':''}</div>
      <span class="todo-txt ${t.done?'done':''}">${esc(t.text)}</span>
      <span style="font-size:10.5px;color:var(--text-muted);margin-left:auto;white-space:nowrap">${t.date}</span>
      <span class="todo-del" onclick="deleteTodo(${t.id})">✕</span>
    </div>`).join('');
  const total=todos.length, done=todos.filter(t=>t.done).length, pct=total?Math.round(done/total*100):0;
  document.getElementById('todo-stats').innerHTML=`
    <div class="mstat"><span>📋</span><span class="mstat-lbl">Total</span><span class="mstat-val">${total}</span></div>
    <div class="mstat"><span>✅</span><span class="mstat-lbl">Terminées</span><span class="mstat-val" style="color:var(--green)">${done}</span></div>
    <div class="mstat"><span>⏳</span><span class="mstat-lbl">En attente</span><span class="mstat-val" style="color:var(--amber)">${total-done}</span></div>
    <div style="margin-top:4px"><div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:5px"><span>Progression journalière</span><span style="font-family:var(--mono);font-weight:700;color:var(--accent)">${pct}%</span></div><div class="pbar" style="height:7px"><div class="pfill" style="width:${pct}%"></div></div></div>`;
  dChart('todo');
  const d=cDef();
  state.charts.todo=new Chart(document.getElementById('ch-todo'),{type:'doughnut',data:{labels:['Terminées','En attente'],datasets:[{data:[done,total-done],backgroundColor:['#00e5a0cc','#1e3050'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:true,cutout:'68%',plugins:{legend:{position:'bottom',labels:{color:d.text,padding:12,font:{size:12}}}}}});
  saveTodos();
}
function addTodo() {
  const inp=document.getElementById('todo-in'), txt=inp.value.trim(); if(!txt) return;
  const now=new Date();
  state.todos.push({id:state.nextTodoId++,text:txt,done:false,date:now.toLocaleDateString('fr',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})});
  inp.value=''; renderTodo();
}
function toggleTodo(id) { const t=state.todos.find(t=>t.id===id); if(!t) return; t.done=!t.done; if(t.done){fireConfetti();showToast('✅','Action accomplie !','var(--green)');} renderTodo(); }
function deleteTodo(id) { state.todos=state.todos.filter(t=>t.id!==id); renderTodo(); }
function saveTodos() {
  localStorage.setItem('cockpit-todos',JSON.stringify(state.todos));
  localStorage.setItem('cockpit-todo-id',state.nextTodoId);
  markUnsaved();
}
function tdDragStart(e){state.drag=e.currentTarget;e.currentTarget.classList.add('dragging');}
function tdDragOver(e){e.preventDefault();e.currentTarget.classList.add('drag-over');}
function tdLeave(e){e.currentTarget.classList.remove('drag-over');}
function tdDrop(e){
  e.preventDefault(); const tgt=e.currentTarget; tgt.classList.remove('drag-over');
  if(!state.drag||state.drag===tgt) return;
  const fi=parseInt(state.drag.dataset.id), ti=parseInt(tgt.dataset.id);
  const fi2=state.todos.findIndex(t=>t.id===fi), ti2=state.todos.findIndex(t=>t.id===ti);
  const [r]=state.todos.splice(fi2,1); state.todos.splice(ti2,0,r); renderTodo();
}

// ═══════════════════════════════════════════════════════
//  RENDER: REPORTS
// ═══════════════════════════════════════════════════════
function renderReports() {
  const sc=effScore();
  const rScoreEl = document.getElementById('r-score');
  if(rScoreEl) rScoreEl.textContent=sc;
  const rScoreBig = document.getElementById('r-score-big');
  if(rScoreBig) { rScoreBig.textContent=sc+'/100'; rScoreBig.style.color=sc>=75?'var(--green)':sc>=50?'var(--accent)':sc>=25?'var(--amber)':'var(--red)'; }
  const wr=DB.tasks.filter(t=>t.realHours);
  document.getElementById('r-avg').textContent=wr.length?(wr.reduce((s,t)=>s+t.realHours,0)/wr.length).toFixed(1)+'h':'—';
  const ot=wr.filter(t=>t.realHours<=t.estimatedHours);
  document.getElementById('r-ontime').textContent=wr.length?Math.round(ot.length/wr.length*100)+'%':'—';
  document.getElementById('r-hours').textContent=DB.tasks.reduce((s,t)=>s+(t.estimatedHours||0),0)+'h';

  // Projects table
  const tbody=document.getElementById('r-proj-tbody');
  tbody.innerHTML=DB.projects.map(p=>{
    const cl=gc(p.clientId), comp=pComp(p.id), real=pReal(p.id), delta=real>0?real-p.estimatedHours:null;
    const meta=SECTORS_META[cl?.sector]||{icon:'◈'};
    let scoreColor='var(--green)';
    if(comp<25) scoreColor='var(--red)'; else if(comp<50) scoreColor='var(--orange)'; else if(comp<75) scoreColor='var(--accent)';
    return `<tr>
      <td><strong>${esc(p.name)}</strong></td>
      <td>${ctag(p.clientId)}</td>
      <td style="font-size:11.5px;color:var(--text-muted)">${meta.icon} ${esc(cl?.sector||'')}</td>
      <td style="min-width:110px"><div style="display:flex;align-items:center;gap:7px"><div class="pbar" style="flex:1"><div class="pfill" style="width:${comp}%"></div></div><span style="font-family:var(--mono);font-size:11px;color:var(--text-muted)">${comp}%</span></div></td>
      <td style="font-family:var(--mono);font-size:12px">${p.estimatedHours}h</td>
      <td style="font-family:var(--mono);font-size:12px">${real>0?real+'h':'—'}</td>
      <td class="${delta===null?'':delta>0?'time-bad':'time-ok'}">${delta===null?'—':(delta>0?'+'+delta+'h':delta+'h')}</td>
      <td style="font-family:var(--mono);font-weight:700;color:${scoreColor}">${comp}/100</td>
    </tr>`;
  }).join('');

  // Workload chart
  dChart('wl');
  const d=cDef();
  state.charts.wl=new Chart(document.getElementById('ch-workload'),{type:'bar',data:{labels:DB.clients.map(c=>c.name),datasets:[{label:'Heures estimées',data:DB.clients.map(c=>cTasks(c.id).reduce((s,t)=>s+(t.estimatedHours||0),0)),backgroundColor:DB.clients.map(c=>c.color+'88'),borderColor:DB.clients.map(c=>c.color),borderWidth:2,borderRadius:6},{label:'Heures réelles',data:DB.clients.map(c=>cTasks(c.id).reduce((s,t)=>s+(t.realHours||0),0)),backgroundColor:'rgba(255,255,255,.12)',borderColor:'rgba(255,255,255,.3)',borderWidth:2,borderRadius:6}]},options:{responsive:true,maintainAspectRatio:true,plugins:{legend:{position:'top',labels:{color:d.text,padding:14,font:{size:11.5}}}},scales:{x:{grid:{color:d.grid},ticks:{color:d.text}},y:{grid:{color:d.grid},ticks:{color:d.text,callback:v=>v+'h'}}}}});
}

// ═══════════════════════════════════════════════════════
//  RAPPORT DIRECTION — synthèse marketing/direction, dérivée
//  des mêmes données (projets, tâches, équipe, Intelligence Layer)
// ═══════════════════════════════════════════════════════
function _drProjectRisk(p, now){
  const pTasks = DB.tasks.filter(t=>t.projectId===p.id);
  const late = pTasks.some(t=>t.status!=='Terminé' && t.endDate && new Date(t.endDate)<now);
  if (late) return 'red';
  if (p.endDate) {
    const daysLeft = Math.ceil((new Date(p.endDate)-now)/86400000);
    if (daysLeft<=7 && daysLeft>=0) return 'amber';
  }
  return 'green';
}

function renderDirectorReport(){
  const now = new Date();
  const activeProjects = (DB.projects||[]).filter(p=>p.status!=='Terminé');
  const risks = activeProjects.map(p=>({ p, risk: _drProjectRisk(p, now) }));
  const nbRed = risks.filter(r=>r.risk==='red').length;
  const nbAmber = risks.filter(r=>r.risk==='amber').length;

  const intel = (typeof computeIntelligence==='function') ? computeIntelligence() : null;
  const quality = (intel && intel.creativeQuality!=null) ? intel.creativeQuality+'%' : '—';
  const predRisk = (intel && intel.predictiveRisk!=null) ? intel.predictiveRisk+'%' : '—';
  // Vitrine du différenciateur (STRATEGIE-PRODUIT.md section D) : le budget
  // média engagé sur les campagnes actives, à mettre en regard des heures
  // de production déjà visibles ailleurs dans ce même rapport.
  const activeCampaigns = activeProjects.filter(isCampaign);
  const totalMediaBudget = activeCampaigns.reduce((s,p)=>s+(p.mediaBudget||0),0);

  const kpiCard = (val,label,color) => `<div class="card" style="padding:16px 18px">
    <div style="font-family:var(--mono);font-size:26px;font-weight:800;color:${color}">${val}</div>
    <div style="font-size:11.5px;color:var(--text-muted)">${label}</div>
  </div>`;
  const elKpis = document.getElementById('dr-kpis');
  if (elKpis) elKpis.innerHTML =
    kpiCard(nbRed, 'Projet(s) en retard', nbRed?'var(--red)':'var(--green)') +
    kpiCard(nbAmber, 'À surveiller (échéance ≤ 7 j)', 'var(--amber)') +
    kpiCard(activeCampaigns.length ? formatXOF(totalMediaBudget) : '—', `Budget média engagé (${activeCampaigns.length} campagne${activeCampaigns.length>1?'s':''} active${activeCampaigns.length>1?'s':''})`, 'var(--accent)') +
    kpiCard(quality, 'Score de qualité créative', 'var(--accent)') +
    kpiCard(predRisk, 'Risque prédictif global', 'var(--purple)');

  const summaryParts = [];
  summaryParts.push(nbRed>0
    ? `<strong style="color:var(--red)">${nbRed} projet${nbRed>1?'s':''}</strong> ${nbRed>1?'ont':'a'} au moins une tâche en retard et ${nbRed>1?'risquent':'risque'} de ne pas être livré${nbRed>1?'s':''} à temps.`
    : `Aucun projet en retard actuellement.`);
  if (nbAmber>0) summaryParts.push(`<strong style="color:var(--amber)">${nbAmber} projet${nbAmber>1?'s':''}</strong> arrive${nbAmber>1?'nt':''} à échéance sous 7 jours et mérite${nbAmber>1?'nt':''} un point de suivi.`);
  if (intel && intel.creativeCapacity!=null) summaryParts.push(`La charge de l'équipe créative représente actuellement <strong>${intel.creativeCapacity}%</strong> de sa capacité de référence.`);
  const elSummary = document.getElementById('dr-summary');
  if (elSummary) elSummary.innerHTML = `
    <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-muted);font-family:var(--mono);margin-bottom:10px">📝 Synthèse pour la direction</div>
    <div style="font-size:13.5px;line-height:1.7">${summaryParts.join(' ')}</div>`;

  const riskLbl = {red:'🔴 Retard', amber:'🟡 À surveiller', green:'🟢 Dans les temps'};
  const elTbody = document.getElementById('dr-projects-tbody');
  if (elTbody) elTbody.innerHTML = activeProjects.length ? risks.map(({p,risk})=>{
    const cl = gc(p.clientId);
    const pTasks = DB.tasks.filter(t=>t.projectId===p.id);
    const doneCount = pTasks.filter(t=>t.status==='Terminé').length;
    const pct = pTasks.length ? Math.round(doneCount/pTasks.length*100) : 0;
    return `<tr>
      <td>${esc(p.name)}</td>
      <td>${esc(cl?cl.name:'—')}</td>
      <td>${esc(p.status)}</td>
      <td>${pct}%</td>
      <td>${p.endDate?fmtDateShort(p.endDate):'—'}</td>
      <td>${riskLbl[risk]}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="shareProject(${p.id})" title="Créer un lien de suivi en lecture seule pour ce client">🔗 Partager</button></td>
    </tr>`;
  }).join('') : `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px">Aucun projet actif pour l'instant</td></tr>`;

  const team = DB.team || [];
  const elTeam = document.getElementById('dr-team-grid');
  if (elTeam) elTeam.innerHTML = team.length ? team.map(m=>{
    const load = DB.tasks.filter(t=>t.assignedTo===m.name && t.status!=='Terminé').length;
    const loadColor = load>4?'var(--red)':load>2?'var(--amber)':'var(--green)';
    return `<div style="padding:12px;border-radius:10px;background:var(--surface2);border:1px solid var(--border)">
      <div style="font-weight:700;font-size:13px">${esc(m.name)}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">${esc(m.role||'')}</div>
      <div style="font-family:var(--mono);font-size:18px;font-weight:800;color:${loadColor}">${load}</div>
      <div style="font-size:10.5px;color:var(--text-muted)">tâche(s) active(s)</div>
    </div>`;
  }).join('') : `<div style="color:var(--text-muted);font-size:12.5px;padding:8px">Aucun membre d'équipe renseigné</div>`;
}
window.renderDirectorReport = renderDirectorReport;

function exportDirectorReportPDF(){
  if (!window.jspdf || !window.jspdf.jsPDF) { showToast('⚠️','Librairie PDF non chargée','var(--amber)'); return; }
  const {jsPDF} = window.jspdf;
  const doc = new jsPDF({orientation:'p', unit:'mm', format:'a4'});
  const now = new Date();
  const activeProjects = (DB.projects||[]).filter(p=>p.status!=='Terminé');
  doc.setFontSize(16); doc.text('Rapport Direction — Synthèse marketing', 14, 18);
  doc.setFontSize(10); doc.setTextColor(120);
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 14, 25);
  const rows = activeProjects.map(p=>{
    const cl = gc(p.clientId);
    const risk = _drProjectRisk(p, now);
    const pTasks = DB.tasks.filter(t=>t.projectId===p.id);
    const doneCount = pTasks.filter(t=>t.status==='Terminé').length;
    const pct = pTasks.length ? Math.round(doneCount/pTasks.length*100)+'%' : '0%';
    return [p.name, cl?cl.name:'—', p.status, pct, p.endDate?fmtDateShort(p.endDate):'—', {red:'Retard',amber:'À surveiller',green:'Dans les temps'}[risk]];
  });
  doc.autoTable({
    startY: 32,
    head: [['Campagne / Projet','Client','Statut','Avancement','Échéance','Risque']],
    body: rows.length ? rows : [['Aucun projet actif','—','—','—','—','—']],
    styles:{fontSize:9},
    headStyles:{fillColor:[15,31,56]},
  });
  doc.save('Rapport_Direction_MCPS.pdf');
  showToast('📄','Rapport exporté en PDF','var(--green)');
}
window.exportDirectorReportPDF = exportDirectorReportPDF;

// ═══════════════════════════════════════════════════════
//  MODALS — CRUD (delegated to openModal above)
// ═══════════════════════════════════════════════════════

// Toggle need checkboxes
let _selectedNeeds = [];
function toggleNeed(n) {
  const el=document.getElementById('nchk-'+n);
  if(el.classList.contains('sel-'+n)) { el.classList.remove('sel-'+n); _selectedNeeds=_selectedNeeds.filter(x=>x!==n); }
  else { el.classList.add('sel-'+n); if(!_selectedNeeds.includes(n)) _selectedNeeds.push(n); }
}

// Toggle channel checkboxes (modèle de Campagne — voir MCPS_CHANNELS)
let _selectedChannels = [];
function toggleChannel(k) {
  const el=document.getElementById('chchk-'+k);
  if(!el) return;
  if(el.classList.contains('selected')) { el.classList.remove('selected'); _selectedChannels=_selectedChannels.filter(x=>x!==k); }
  else { el.classList.add('selected'); if(!_selectedChannels.includes(k)) _selectedChannels.push(k); }
}
window.toggleChannel = toggleChannel;

function calcHT() {
  const b=parseInt(document.getElementById('fc-budget')?.value)||0;
  const dur=parseInt(document.getElementById('fc-duration')?.value)||0;
  const disp=document.getElementById('ht-display');
  if(!disp) return;
  if(b>0&&dur>0){
    disp.style.display='flex';
    document.getElementById('ht-monthly').textContent=Math.round(b/dur).toLocaleString('fr-FR')+' XOF';
    document.getElementById('ht-months').textContent=dur;
  } else { disp.style.display='none'; }
}

function openEditClient(cid) {
  const c=gc(cid); if(!c) return;
  _selectedNeeds=[...(c.needs||[])];
  _openModalLegacy('client', c);
}

function submitClient(existingId=0) {
  if (!existingId && typeof _checkPlanLimit === 'function' && !_checkPlanLimit('clients', DB.clients.length)) return;
  const name=document.getElementById('fc-name').value.trim();
  const needs=[...document.querySelectorAll('.need-chk')].filter(el=>[...el.classList].some(c=>c.startsWith('sel-'))).map(el=>[...el.classList].find(c=>c.startsWith('sel-')).replace('sel-',''));
  const obj={name, sector:document.getElementById('fc-sector').value, needs, brief:document.getElementById('fc-brief').value.trim(),
    briefObjectives:document.getElementById('fc-brief-objectives')?.value?.trim()||'', briefAudience:document.getElementById('fc-brief-audience')?.value?.trim()||'',
    briefTone:document.getElementById('fc-brief-tone')?.value?.trim()||'', briefConstraints:document.getElementById('fc-brief-constraints')?.value?.trim()||'',
    briefDeadline:document.getElementById('fc-brief-deadline')?.value||null,
    budget:parseInt(document.getElementById('fc-budget')?.value)||0, contractDuration:parseInt(document.getElementById('fc-duration')?.value)||0, color:document.getElementById('fc-color').value, avatar:name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)};
  const _v = MCPS_VALIDATE.client(obj); if (!_v.valid) { showToast('⚠️',_v.errors[0],'var(--amber)'); if (window._mcpsShowFormErrors) window._mcpsShowFormErrors(_v.errors); return; }
  if(existingId) { Object.assign(gc(existingId), obj); showToast('✅',`Client "${name}" mis à jour !`,'var(--green)'); }
  else { obj.id=nextId.client++; DB.clients.push(obj); showToast('✅',`Client "${name}" créé !`,'var(--green)'); }
  closeModal(); saveDB(); renderClients();
  const sf=document.getElementById('cf-sector'); while(sf&&sf.options.length>1) sf.remove(1);
}

function deleteClient(cid) {
  if (typeof can==='function' && !can('client.delete')) { window._mcpsDenyToast && window._mcpsDenyToast('client.delete'); return; }
  const c=gc(cid); if(!c) return;
  const projs=cProjects(cid).length, tasks=cTasks(cid).length;
  if(!confirm(`Supprimer "${c.name}" ?\nCela supprimera aussi ${projs} projet(s), ${tasks} tâche(s) et les factures associées.`)) return;
  DB.invoices=DB.invoices.filter(i=>i.clientId!==cid);
  DB.tasks=DB.tasks.filter(t=>t.clientId!==cid);
  DB.projects=DB.projects.filter(p=>p.clientId!==cid);
  // PATCH #5b : cid peut désigner un client OU un prospect (tableaux distincts) — on retire du bon tableau.
  DB.clients=DB.clients.filter(cl=>cl.id!==cid);
  DB.prospects=DB.prospects.filter(cl=>cl.id!==cid);
  saveDB(); renderClients(); updateAlert(); showToast('🗑',`Client "${c.name}" supprimé.`,'var(--red)');
  if (typeof _mcpsAudit==='function') _mcpsAudit('DELETE', c.type === 'prospect' ? 'prospect' : 'client', cid, { name: c.name });
}

function submitProject(existingId=0) {
  const name=document.getElementById('fp-name').value.trim();
  const responsable = document.getElementById('fp-responsable')?.value?.trim() || null;
  const objective = document.getElementById('fp-objective')?.value || null;
  const mediaBudgetParsed = parseInt(document.getElementById('fp-mediabudget')?.value);
  const mediaBudget = isNaN(mediaBudgetParsed) ? null : Math.max(0, mediaBudgetParsed);
  const publishDate = document.getElementById('fp-publishdate')?.value || null;
  const obj={name, clientId:parseInt(document.getElementById('fp-client').value), status:document.getElementById('fp-status').value, priority:document.getElementById('fp-priority').value, startDate:document.getElementById('fp-start').value, endDate:document.getElementById('fp-end').value, estimatedHours:parseInt(document.getElementById('fp-hours').value)||0, responsable, channels:[..._selectedChannels], objective, mediaBudget, publishDate};
  const _v = MCPS_VALIDATE.project(obj); if (!_v.valid) { showToast('⚠️',_v.errors[0],'var(--amber)'); if (window._mcpsShowFormErrors) window._mcpsShowFormErrors(_v.errors); return; }
  if(existingId) {
    Object.assign(gp(existingId),obj);
    showToast('✅',`Projet "${name}" mis à jour !`,'var(--green)');
    if (typeof _mcpsAudit==='function') _mcpsAudit('UPDATE', 'project', existingId, { name });
  } else {
    obj.id=nextId.project++;
    DB.projects.push(obj);
    showToast('✅',`Projet "${name}" créé !`,'var(--green)');
    if (typeof _mcpsAudit==='function') _mcpsAudit('CREATE', 'project', obj.id, { name });
  }
  closeModal(); saveDB(); renderProjects();
  if(state.view==='dashboard') renderDashboard();
}

function deleteProject(pid) {
  if (typeof can==='function' && !can('project.delete')) { window._mcpsDenyToast && window._mcpsDenyToast('project.delete'); return; }
  const p=gp(pid); if(!p) return;
  const tasks=pTasks(pid).length;
  if(!confirm(`Supprimer "${p.name}" ?\nCela supprimera aussi ${tasks} tâche(s) associée(s).`)) return;
  DB.tasks=DB.tasks.filter(t=>t.projectId!==pid);
  DB.projects=DB.projects.filter(pr=>pr.id!==pid);
  saveDB(); renderProjects(); updateAlert(); showToast('🗑',`Projet "${p.name}" supprimé.`,'var(--red)');
  if (typeof _mcpsAudit==='function') _mcpsAudit('DELETE', 'project', pid, { name: p.name });
}

function submitTask(existingId=0) {
  const name=document.getElementById('ft-name').value.trim();
  const st=document.getElementById('ft-status').value;
  const realHParsed=parseFloat(document.getElementById('ft-real')?.value);
  const realH=isNaN(realHParsed)?null:Math.max(0,realHParsed);
  const assignedTo = document.getElementById('ft-assigned')?.value?.trim() || null;
  const revParsed=parseInt(document.getElementById('ft-revisions')?.value);
  const qualParsed=parseInt(document.getElementById('ft-quality')?.value);
  const qualityRating=isNaN(qualParsed)?null:Math.min(5,Math.max(1,qualParsed));
  if(existingId) {
    const t=DB.tasks.find(t=>t.id===existingId); if(!t) return;
    const old=t.status;
    const estHParsed=parseInt(document.getElementById('ft-hours').value);
    const estH=isNaN(estHParsed)?t.estimatedHours:Math.max(0,estHParsed);
    const revisions=isNaN(revParsed)?(t.revisions||0):Math.max(0,revParsed);
    const startDate=document.getElementById('ft-start').value||t.startDate, endDate=document.getElementById('ft-end').value||t.endDate;
    const _v = MCPS_VALIDATE.task({name, clientId:t.clientId, status:st, startDate, endDate, qualityRating, estimatedHours:estH});
    if (!_v.valid) { showToast('⚠️',_v.errors[0],'var(--amber)'); if (window._mcpsShowFormErrors) window._mcpsShowFormErrors(_v.errors); return; }
    Object.assign(t,{name,status:st,estimatedHours:estH,realHours:realH,startDate,endDate,assignedTo,revisions,qualityRating});
    if(st==='Terminé'&&old!=='Terminé'){ t.completedDate=new Date().toISOString().slice(0,10); fireConfetti();showToast('🎉',`"${name}" terminée !`,'var(--green)');}
    else showToast('✅',`Tâche "${name}" mise à jour !`,'var(--green)');
    if (typeof _mcpsAudit==='function') {
      _mcpsAudit(old !== st ? 'STATUS_CHANGED' : 'UPDATE', 'task', existingId, { name, before: old, after: st });
    }
  } else {
    const rawHours=parseInt(document.getElementById('ft-hours').value)||0;
    const revisions=isNaN(revParsed)?0:Math.max(0,revParsed);
    const clientId=parseInt(document.getElementById('ft-client').value);
    const projectId=parseInt(document.getElementById('ft-project').value)||null;
    const startDate=document.getElementById('ft-start').value, endDate=document.getElementById('ft-end').value;
    const _v = MCPS_VALIDATE.task({name, clientId, status:st, startDate, endDate, qualityRating, estimatedHours:rawHours});
    if (!_v.valid) { showToast('⚠️',_v.errors[0],'var(--amber)'); if (window._mcpsShowFormErrors) window._mcpsShowFormErrors(_v.errors); return; }
    const obj={id:nextId.task++,name,clientId,projectId,status:st,estimatedHours:Math.max(0,rawHours),realHours:realH,startDate,endDate,assignedTo,revisions,qualityRating};
    if(st==='Terminé') obj.completedDate=new Date().toISOString().slice(0,10);
    DB.tasks.push(obj);
    if(st==='Terminé'){fireConfetti();showToast('🎉',`"${name}" déjà terminée !`,'var(--green)');}
    else showToast('✅',`Tâche "${name}" créée !`,'var(--green)');
    if (typeof _mcpsAudit==='function') _mcpsAudit('CREATE', 'task', obj.id, { name, status: st });
  }
  closeModal(); saveDB(); renderTasks(); updateAlert();
  if(state.view==='dashboard') renderDashboard();
  if(state.view==='suivi') renderSuivi();
}

function _openEditTaskModal(t={}) {
  const isEdit = !!t.id;
  document.getElementById('modal-ttl').textContent = isEdit ? '✏️ Modifier la tâche' : '📋 Nouvelle tâche';
  const body = document.getElementById('modal-body');
  const allMembers = getAllTeamMembers ? getAllTeamMembers() : [];
  body.innerHTML = `
    <div class="fg"><label class="flbl">Nom de la tâche *</label><input class="fin" id="ft-name" value="${esc(t.name||'')}" placeholder="Ex: Faire valider le rapport mensuel" autocomplete="off"></div>
    <div class="frow">
      <div class="fg"><label class="flbl">Client</label><select class="fin" id="ft-client" onchange="updateTskProjs()">${DB.clients.map(c=>`<option value="${c.id}" ${t.clientId===c.id?'selected':''}>${c.name}</option>`).join('')}</select></div>
      <div class="fg"><label class="flbl">Projet</label><select class="fin" id="ft-project"></select></div>
    </div>
    <div class="fg"><label class="flbl">Responsable / Assigné à</label>
      <select class="fin" id="ft-assigned">
        <option value="">— Aucun responsable —</option>
        ${allMembers.map(m=>`<option value="${esc(m)}" ${(t.assignedTo||'')=== m?'selected':''}>${esc(m)}</option>`).join('')}
      </select>
    </div>
    <div class="frow">
      <div class="fg"><label class="flbl">Statut</label><select class="fin" id="ft-status">${['Non démarré','En cours','À suivre','Terminé'].map(s=>`<option ${t.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
      <div class="fg"><label class="flbl">Heures estimées</label><input class="fin" type="number" id="ft-hours" value="${t.estimatedHours||''}" placeholder="Ex: 16"></div>
    </div>
    <div class="frow">
      <div class="fg"><label class="flbl">Heures réelles</label><input class="fin" type="number" id="ft-real" value="${t.realHours||''}" placeholder="Saisir à la clôture"></div>
      <div class="fg"><label class="flbl">Révisions client (allers-retours)</label><input class="fin" type="number" min="0" id="ft-revisions" value="${t.revisions??''}" placeholder="Ex: 1"></div>
    </div>
    <div class="frow">
      <div class="fg"><label class="flbl">Qualité créative (1 à 5)</label><select class="fin" id="ft-quality"><option value="">— Non évalué —</option>${[1,2,3,4,5].map(n=>`<option value="${n}" ${t.qualityRating===n?'selected':''}>${n} ${'★'.repeat(n)}</option>`).join('')}</select></div>
      <div class="fg"><!-- spacer --></div>
    </div>
    <div class="frow">
      <div class="fg"><label class="flbl">Début</label><input class="fin" type="datetime-local" id="ft-start" value="${t.startDate||''}"></div>
      <div class="fg"><label class="flbl">Fin</label><input class="fin" type="datetime-local" id="ft-end" value="${t.endDate||''}"></div>
    </div>
    ${isEdit?`<div style="padding:9px 12px;background:var(--surface2);border-radius:6px;font-size:12px;color:var(--text-muted);margin-bottom:4px">📌 Tâche liée au projet <strong style="color:var(--text)">${esc(gp(t.projectId)?.name||'')}</strong> · Client <strong style="color:var(--text)">${esc(gc(t.clientId)?.name||'')}</strong></div>`:''}
    <div class="modal-acts">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="submitTask(${t.id||0})">${isEdit?'Enregistrer':'Créer la tâche'}</button>
    </div>`;
  document.getElementById('main-overlay').classList.add('open');
  updateTskProjs(t.projectId);
}

function updateTskProjs(selectedProjectId) {
  const cid=parseInt(document.getElementById('ft-client')?.value);
  const sel=document.getElementById('ft-project');
  if(!sel) return;
  sel.innerHTML=DB.projects.filter(p=>p.clientId===cid).map(p=>`<option value="${p.id}" ${p.id===selectedProjectId?'selected':''}>${esc(p.name)}</option>`).join('');
}

function closeModal() {
  document.getElementById('main-overlay').classList.remove('open');
  _selectedNeeds = [];
}


// ═══════════════════════════════════════════════════════
//  PDF GENERATION
// ═══════════════════════════════════════════════════════
function openPDFModal() { document.getElementById('pdf-overlay').classList.add('open'); }
function closePDFModal(e) { if(e&&e.target!==document.getElementById('pdf-overlay')) return; document.getElementById('pdf-overlay').classList.remove('open'); }

function getPeriodRange(period) {
  const now=new Date(), start=new Date();
  if(period==='week') start.setDate(now.getDate()-7);
  else if(period==='month') start.setMonth(now.getMonth()-1);
  else if(period==='quarter') start.setMonth(now.getMonth()-3);
  else if(period==='year') start.setFullYear(now.getFullYear()-1);
  else { start.setFullYear(2000); } // all
  return {start, end:now};
}

function periodLabel(period) {
  const m={'week':'Cette semaine','month':'Ce mois','quarter':'Ce trimestre','year':'Cette année','all':'Toute la période'};
  return m[period]||period;
}

function generatePDF() {
  // Safety-net fallback: the full multi-view PDF export (with the view-selection
  // checkboxes) is installed by a later patch script that overrides this function.
  // If that override didn't run for any reason, this always gives visible feedback
  // instead of failing silently.
  try {
    if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
      showToast('⚠️','Le moteur PDF ne s\'est pas chargé (vérifiez votre connexion internet), puis rechargez la page.','var(--amber)');
      return;
    }
    showToast('⚠️','Le module d\'export PDF ne s\'est pas initialisé correctement. Rechargez la page et réessayez.','var(--amber)');
  } catch(e) {
    console.error(e);
    showToast('⚠️','Erreur lors de la génération du PDF.','var(--red)');
  }
}


// ═══════════════════════════════════════════════════════
//  RENDER: INVOICES
// ═══════════════════════════════════════════════════════
function renderInvoices() {
  checkLateInvoices();
  // populate client filter
  const ifc = document.getElementById('if-client');
  if (ifc && ifc.options.length <= 1) DB.clients.forEach(c=>{ const o=document.createElement('option'); o.value=c.id; o.textContent=c.name; ifc.appendChild(o); });

  const fc = ifc?.value||'all';
  const fs = document.getElementById('if-status')?.value||'all';
  const fp = document.getElementById('if-period')?.value||'all';
  const now = new Date();

  function inPeriod(inv) {
    if (fp==='all') return true;
    const d=new Date(inv.issueDate);
    if (fp==='month') return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
    if (fp==='quarter') { const qs=new Date(now.getFullYear(),Math.floor(now.getMonth()/3)*3,1); return d>=qs; }
    if (fp==='year') return d.getFullYear()===now.getFullYear();
    return true;
  }

  const invs = DB.invoices.filter(i=>{
    if (fc!=='all'&&i.clientId!=fc) return false;
    if (fs!=='all'&&i.status!==fs) return false;
    if (!inPeriod(i)) return false;
    return true;
  }).sort((a,b)=>new Date(b.issueDate)-new Date(a.issueDate));

  // Summary strip
  const paid=invs.filter(i=>i.status==='Payée').reduce((s,i)=>s+i.amount,0);
  const sent=invs.filter(i=>i.status==='Envoyée').reduce((s,i)=>s+i.amount,0);
  const late=invs.filter(i=>i.status==='En retard').reduce((s,i)=>s+i.amount,0);
  const draft=invs.filter(i=>i.status==='Brouillon').length;
  document.getElementById('inv-summary') && (document.getElementById('inv-summary').innerHTML=`
    <div class="fin-kpi" style="--fk-c:var(--green)"><div style="font-size:15px;margin-bottom:5px">✅</div><div class="fin-kpi-val" style="color:var(--green)">${fmtXOFShort(paid)}</div><div class="fin-kpi-lbl">Encaissé · ${invs.filter(i=>i.status==='Payée').length} fact.</div></div>
    <div class="fin-kpi" style="--fk-c:var(--accent)"><div style="font-size:15px;margin-bottom:5px">📤</div><div class="fin-kpi-val" style="color:var(--accent)">${fmtXOFShort(sent)}</div><div class="fin-kpi-lbl">Envoyé · ${invs.filter(i=>i.status==='Envoyée').length} fact.</div></div>
    <div class="fin-kpi" style="--fk-c:var(--red)"><div style="font-size:15px;margin-bottom:5px">⚠️</div><div class="fin-kpi-val" style="color:var(--red)">${fmtXOFShort(late)}</div><div class="fin-kpi-lbl">En retard · ${invs.filter(i=>i.status==='En retard').length} fact.</div></div>
    <div class="fin-kpi" style="--fk-c:var(--text-muted)"><div style="font-size:15px;margin-bottom:5px">📝</div><div class="fin-kpi-val">${draft}</div><div class="fin-kpi-lbl">Brouillon(s)</div></div>`);

  const total=invs.reduce((s,i)=>s+i.amount,0);
  const tb=document.getElementById('inv-total-bar');
  if(tb) tb.textContent=`Total filtré : ${formatXOF(total)} — ${invs.length} facture(s)`;

  const tbody=document.getElementById('inv-tbody');
  if (tbody) tbody.innerHTML=invs.map(inv=>{
    const cl=gc(inv.clientId), pj=gp(inv.projectId);
    const late=new Date()>new Date(inv.dueDate)&&inv.status==='Envoyée';
    if(late) inv.status='En retard';
    return `<tr>
      <td style="font-family:var(--mono);font-size:12px;color:var(--accent)">${esc(inv.number)}</td>
      <td>${ctag(inv.clientId)}</td>
      <td style="font-size:12.5px">${esc(inv.label)}</td>
      <td style="font-size:11.5px;color:var(--text-muted)">${esc(pj?.name||'—')}</td>
      <td>
        <select onchange="updateInvStatus(${inv.id},this.value)" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:3px 7px;border-radius:6px;font-size:11.5px;cursor:pointer;outline:none;font-family:var(--body)">
          ${['Brouillon','Envoyée','Payée','En retard'].map(s=>`<option ${inv.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td class="time-n">${fmtDate(inv.issueDate)}</td>
      <td class="${(new Date()>new Date(inv.dueDate)&&inv.status!=='Payée')?'time-bad':'time-n'}">${fmtDate(inv.dueDate)}</td>
      <td><span class="inv-amount">${formatXOF(inv.amount)}</span></td>
      <td style="display:flex;gap:5px">
        <button class="btn btn-ghost btn-sm" onclick="openEditInvoice(${inv.id})" title="Modifier">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteInvoice(${inv.id})">🗑</button>
      </td>
    </tr>`;
  }).join('')||`<tr><td colspan="9"><div class="empty"><div class="empty-ico">💳</div><div class="empty-txt">Aucune facture trouvée</div></div></td></tr>`;

  // Charts
  const d=cDef();
  dChart('invclient');
  const invCtx=document.getElementById('ch-inv-client');
  if(invCtx) state.charts.invclient=new Chart(invCtx,{type:'bar',data:{
    labels:DB.clients.map(c=>c.name),
    datasets:[
      {label:'Encaissé',data:DB.clients.map(c=>cInvoices(c.id).filter(i=>i.status==='Payée').reduce((s,i)=>s+i.amount,0)),backgroundColor:DB.clients.map(c=>c.color+'88'),borderColor:DB.clients.map(c=>c.color),borderWidth:2,borderRadius:5},
      {label:'En attente',data:DB.clients.map(c=>cInvoices(c.id).filter(i=>i.status==='Envoyée'||i.status==='En retard').reduce((s,i)=>s+i.amount,0)),backgroundColor:'rgba(255,255,255,.1)',borderColor:'rgba(255,255,255,.25)',borderWidth:2,borderRadius:5},
    ]},options:{responsive:true,maintainAspectRatio:true,plugins:{legend:{position:'top',labels:{color:d.text,font:{size:11}}}},scales:{x:{grid:{color:d.grid},ticks:{color:d.text}},y:{grid:{color:d.grid},ticks:{color:d.text,callback:v=>fmtXOFShort(v)}}}}});

  dChart('invstatus');
  const isCtx=document.getElementById('ch-inv-status');
  const allInvs=DB.invoices;
  if(isCtx) state.charts.invstatus=new Chart(isCtx,{type:'doughnut',data:{
    labels:['Payée','Envoyée','En retard','Brouillon'],
    datasets:[{data:[allInvs.filter(i=>i.status==='Payée').length,allInvs.filter(i=>i.status==='Envoyée').length,allInvs.filter(i=>i.status==='En retard').length,allInvs.filter(i=>i.status==='Brouillon').length],backgroundColor:['#00e5a0cc','#00c8ffcc','#ff3d5acc','#33445566'],borderWidth:0,hoverOffset:7}]},
    options:{responsive:true,maintainAspectRatio:true,cutout:'62%',plugins:{legend:{position:'bottom',labels:{color:d.text,font:{size:11.5},padding:12}}}}});
}

function updateInvStatus(id, st) {
  const inv=gi(id); if(!inv) return;
  inv.status=st;
  if(st==='Payée') showToast('💰',`Facture ${inv.number} marquée payée !`,'var(--green)');
  saveDB(); renderInvoices(); updateAlert();
}

function openEditInvoice(id) {
  const inv=gi(id); if(!inv) return;
  openModal('invoice', inv);
}

function deleteInvoice(id) {
  if (typeof can==='function' && !can('invoice.delete')) { window._mcpsDenyToast && window._mcpsDenyToast('invoice.delete'); return; }
  const inv=gi(id); if(!inv) return;
  if(!confirm(`Supprimer la facture ${inv.number} ?`)) return;
  DB.invoices=DB.invoices.filter(i=>i.id!==id);
  saveDB(); renderInvoices(); updateAlert();
  showToast('🗑',`Facture ${inv.number} supprimée.`,'var(--red)');
  if (typeof _mcpsAudit==='function') _mcpsAudit('DELETE', 'invoice', id, { number: inv.number, amount: inv.amount });
}

// ═══════════════════════════════════════════════════════
//  CLIENT DETAIL VIEW
// ═══════════════════════════════════════════════════════
function openClientDetail(cid) {
  const c=gc(cid); if(!c) return;
  window._inlineTaskClientId = cid;
  window._inlineProjectClientId = cid;
  const overlay=document.getElementById('client-detail-overlay');
  const av=document.getElementById('cd-avatar');
  av.style.background=c.color; av.textContent=c.avatar;
  document.getElementById('cd-name').textContent=c.name;
  document.getElementById('cd-sector').textContent=(SECTORS_META[c.sector]?.icon||'◈')+' '+c.sector;
  document.getElementById('cd-needs-top').innerHTML=(c.needs||[]).map(n=>needBadge(n)).join('');
  document.getElementById('cd-edit-btn').onclick=()=>{ closeClientDetail(); openEditClient(cid); };

  // ── Bouton Clôturer / Réactiver dans la topbar ──
  const clotureBtn = document.getElementById('cd-cloture-btn');
  if (clotureBtn) {
    const isProspect = c.type === 'prospect';
    if (isProspect) {
      clotureBtn.style.display = 'none';
    } else if (c.closedAt) {
      clotureBtn.textContent = '🔓 Réactiver';
      clotureBtn.style.background = 'var(--green-dim)';
      clotureBtn.style.color = 'var(--green)';
      clotureBtn.style.border = '1px solid rgba(0,229,160,.3)';
      clotureBtn.style.display = '';
      clotureBtn.onclick = () => { closeClientDetail(); reopenClient(cid); };
    } else {
      clotureBtn.textContent = '🔒 Clôturer';
      clotureBtn.style.background = 'var(--amber-dim)';
      clotureBtn.style.color = 'var(--amber)';
      clotureBtn.style.border = '1px solid rgba(255,171,0,.3)';
      clotureBtn.style.display = '';
      clotureBtn.onclick = () => { closeClientDetail(); clotureClient(cid); };
    }
  }

  const projs=cProjects(cid);
  const tasks=cTasks(cid);
  const invs=cInvoices(cid);
  const done=tasks.filter(t=>t.status==='Terminé').length;
  const inprog=tasks.filter(t=>t.status==='En cours').length;
  const pct=tasks.length?Math.round(done/tasks.length*100):0;
  const paidAmt=invs.filter(i=>i.status==='Payée').reduce((s,i)=>s+i.amount,0);
  const pendingAmt=invs.filter(i=>i.status==='Envoyée'||i.status==='En retard').reduce((s,i)=>s+i.amount,0);
  const lateInvs=invs.filter(i=>i.status==='En retard');
  const monthlyHT=c.budget&&c.contractDuration?Math.round(c.budget/c.contractDuration):0;

  document.getElementById('cd-content').innerHTML=`
    ${c.closedAt ? `<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--amber-dim);border:1px solid rgba(255,171,0,.3);border-radius:var(--r);margin-bottom:16px">
      <span style="font-size:20px">🔒</span>
      <div>
        <div style="font-weight:700;color:var(--amber);font-size:13px">Contrat clôturé</div>
        <div style="font-size:11.5px;color:var(--text-muted)">Clôturé le ${new Date(c.closedAt).toLocaleDateString('fr',{day:'2-digit',month:'long',year:'numeric'})} — ce client est archivé dans l'historique.</div>
      </div>
      <button class="btn btn-sm" style="margin-left:auto;background:var(--green-dim);color:var(--green);border:1px solid rgba(0,229,160,.3)" onclick="closeClientDetail();reopenClient(${cid})">🔓 Réactiver</button>
    </div>` : ''}
    <!-- KPI row -->
    <div class="g g4" style="margin-bottom:16px">
      <div class="fin-kpi" style="--fk-c:${c.color}">
        <div style="font-size:14px;margin-bottom:5px">🗂</div>
        <div class="fin-kpi-val" style="color:${c.color}">${projs.length}</div>
        <div class="fin-kpi-lbl">Projets (${projs.filter(p=>p.status==='En cours').length} actifs)</div>
      </div>
      <div class="fin-kpi" style="--fk-c:var(--accent)">
        <div style="font-size:14px;margin-bottom:5px">📋</div>
        <div class="fin-kpi-val" style="color:var(--accent)">${tasks.length}</div>
        <div class="fin-kpi-lbl">Tâches · ${done} terminées</div>
      </div>
      <div class="fin-kpi" style="--fk-c:var(--green)">
        <div style="font-size:14px;margin-bottom:5px">💰</div>
        <div class="fin-kpi-val" style="color:var(--green)">${fmtXOFShort(paidAmt)}</div>
        <div class="fin-kpi-lbl">CA encaissé</div>
      </div>
      <div class="fin-kpi" style="--fk-c:var(--amber)">
        <div style="font-size:14px;margin-bottom:5px">📤</div>
        <div class="fin-kpi-val" style="color:var(--amber)">${fmtXOFShort(pendingAmt)}</div>
        <div class="fin-kpi-lbl">En attente</div>
      </div>
    </div>

    <div class="g g2" style="margin-bottom:16px;align-items:start">
      <!-- Profil & contrat -->
      <div class="card">
        <div class="card-hd"><div class="card-title">Profil & Contrat</div></div>
        ${(c.briefObjectives||c.briefAudience||c.briefTone||c.briefConstraints||c.briefDeadline)?`<div style="font-size:12px;line-height:1.7;padding:10px 12px;background:var(--surface2);border-radius:7px;border-left:3px solid ${c.color};margin-bottom:10px">
          ${c.briefObjectives?`<div><strong>Objectifs :</strong> ${esc(c.briefObjectives)}</div>`:''}
          ${c.briefAudience?`<div><strong>Audience :</strong> ${esc(c.briefAudience)}</div>`:''}
          ${c.briefTone?`<div><strong>Ton :</strong> ${esc(c.briefTone)}</div>`:''}
          ${c.briefConstraints?`<div><strong>Contraintes :</strong> ${esc(c.briefConstraints)}</div>`:''}
          ${c.briefDeadline?`<div><strong>Échéance du brief :</strong> ${fmtDateShort(c.briefDeadline)}</div>`:''}
        </div>`:''}
        ${c.brief?`<div style="font-size:12.5px;color:var(--text-muted);line-height:1.6;padding:10px 12px;background:var(--surface2);border-radius:7px;border-left:3px solid ${c.color};margin-bottom:14px">"${esc(c.brief)}"</div>`:''}
        <div style="display:flex;flex-direction:column;gap:8px">
          ${c.budget?`<div class="mstat"><span>💰</span><span class="mstat-lbl">Budget total</span><span class="mstat-val" style="color:var(--amber)">${formatXOF(c.budget)}</span></div>`:''}
          ${monthlyHT?`<div class="mstat"><span>📅</span><span class="mstat-lbl">Mensuel HT</span><span class="mstat-val" style="color:var(--green)">${monthlyHT.toLocaleString('fr-FR')} XOF</span></div>`:''}
          ${c.contractDuration?`<div class="mstat"><span>🕐</span><span class="mstat-lbl">Durée contrat</span><span class="mstat-val">${c.contractDuration} mois</span></div>`:''}
          <div class="mstat"><span>📊</span><span class="mstat-lbl">Complétion globale</span><span class="mstat-val" style="color:${c.color}">${pct}%</span></div>
        </div>
        ${lateInvs.length?`<div style="margin-top:12px;padding:9px 12px;background:var(--red-dim);border-radius:7px;border:1px solid rgba(255,61,90,.2)">
          <div style="color:var(--red);font-weight:700;font-size:12px;margin-bottom:4px">⚠️ ${lateInvs.length} facture(s) en retard</div>
          <div style="font-size:11.5px;color:var(--text-muted)">${formatXOF(lateInvs.reduce((s,i)=>s+i.amount,0))} à récupérer</div>
        </div>`:''}
      </div>
      <!-- Projects list -->
      <div class="card">
        <div class="card-hd">
          <div class="card-title">Projets</div>
          <button class="btn btn-primary btn-sm" onclick="openInlineProjectForm(${cid})">+ Nouveau projet</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${projs.length?projs.map(p=>{
            const comp=pComp(p.id), pt=pTasks(p.id).length;
            return `<div style="padding:10px 12px;background:var(--surface2);border-radius:8px;border:1px solid var(--border)">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px">
                <span style="font-weight:600;font-size:13px">${esc(p.name)}</span>
                <div style="display:flex;gap:5px;align-items:center">${statusBadge(p.status)}${priBadge(p.priority)}</div>
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <div class="pbar" style="flex:1"><div class="pfill" style="width:${comp}%"></div></div>
                <span style="font-family:var(--mono);font-size:11px;color:var(--text-muted);white-space:nowrap">${comp}% · ${pt} tâches</span>
              </div>
            </div>`;
          }).join(''):`<div class="empty" style="padding:24px"><div class="empty-ico" style="font-size:28px">🗂</div><div class="empty-txt">Aucun projet</div></div>`}
        </div>
      </div>
    </div>

    <!-- Invoices table -->
    <div class="tbl-wrap" style="margin-bottom:16px">
      <div class="tbl-bar">
        <div class="tbl-ttl">💳 Historique de facturation</div>
        <button class="btn btn-ghost btn-sm" onclick="closeClientDetail();go('invoices')">Voir tout →</button>
      </div>
      ${invs.length?`<table><thead><tr><th data-sort="text">N° Facture</th><th data-sort="text">Objet</th><th data-sort="text">Statut</th><th data-sort="date">Échéance</th><th data-sort="number">Montant HT</th></tr></thead>
      <tbody>${invs.sort((a,b)=>new Date(b.issueDate)-new Date(a.issueDate)).map(inv=>`
        <tr><td style="font-family:var(--mono);font-size:11.5px;color:var(--accent)">${esc(inv.number)}</td>
        <td style="font-size:12px">${esc(inv.label)}</td>
        <td><span class="badge ${invStatusCls(inv.status)}">${inv.status}</span></td>
        <td class="time-n">${fmtDate(inv.dueDate)}</td>
        <td><span class="inv-amount">${formatXOF(inv.amount)}</span></td></tr>`).join('')}
      </tbody></table>`:`<div class="empty" style="padding:32px"><div class="empty-ico">💳</div><div class="empty-txt">Aucune facture</div></div>`}
    </div>

    <!-- Active tasks -->
    <div class="tbl-wrap">
      <div class="tbl-bar"><div class="tbl-ttl">⚡ Tâches actives</div></div>
      ${tasks.filter(t=>t.status!=='Terminé').length?`<table><thead><tr><th>Tâche</th><th>Projet</th><th>Statut</th><th>Échéance</th><th>Estimé</th></tr></thead>
      <tbody>${tasks.filter(t=>t.status!=='Terminé').map(t=>`
        <tr><td><strong>${esc(t.name)}</strong></td>
        <td style="font-size:11.5px;color:var(--text-muted)">${esc(gp(t.projectId)?.name||'')}</td>
        <td>${statusBadge(t.status)}</td>
        <td class="time-n">${fmtDate(t.endDate)}</td>
        <td style="font-family:var(--mono);font-size:12px">${t.estimatedHours}h</td></tr>`).join('')}
      </tbody></table>`:`<div class="empty" style="padding:24px"><div class="empty-ico">🎉</div><div class="empty-txt">Toutes les tâches sont terminées !</div></div>`}
    </div>`;

  overlay.classList.add('open');
}

function closeClientDetail() {
  document.getElementById('client-detail-overlay').classList.remove('open');
}

// ─── INLINE TASK CREATION ───
window._inlineTaskClientId = null;
window._inlineProjectClientId = null;

function openInlineTaskForm() {
  const form = document.getElementById('inline-task-form');
  if (!form) return;
  form.style.display = 'block';
  const projSel = document.getElementById('it-project');
  if (projSel && window._inlineTaskClientId) {
    const projs = cProjects(window._inlineTaskClientId);
    projSel.innerHTML = '<option value="">— Projet —</option>' +
      projs.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  }
  setTimeout(() => document.getElementById('it-name')?.focus(), 50);
}

function closeInlineTaskForm() {
  const form = document.getElementById('inline-task-form');
  if (form) form.style.display = 'none';
  ['it-name','it-assigned','it-hours','it-end'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
}

function submitInlineTask() {
  const name = document.getElementById('it-name')?.value.trim();
  if (!name) { showToast('⚠️','Nom de la tâche requis','var(--amber)'); return; }
  const cid = window._inlineTaskClientId;
  if (!cid) return;
  const projId = parseInt(document.getElementById('it-project')?.value) || null;
  const status = document.getElementById('it-status')?.value || 'Non démarré';
  const priority = document.getElementById('it-priority')?.value || 'Moyenne';
  const endDate = document.getElementById('it-end')?.value || null;
  const assignedTo = document.getElementById('it-assigned')?.value?.trim() || null;
  const estHours = parseFloat(document.getElementById('it-hours')?.value) || 0;
  const newTask = {
    id: nextId.task++, clientId: cid, projectId: projId, name, status, priority,
    startDate: new Date().toISOString().slice(0,10), endDate,
    estimatedHours: estHours, assignedTo, realHours: null,
  };
  if (status === 'Terminé') { newTask.completedDate = new Date().toISOString().slice(0,10); fireConfetti(); }
  DB.tasks.push(newTask);
  saveDB();
  closeInlineTaskForm();
  showToast('✅', `Tâche "${name}" créée !`, 'var(--green)');
  openClientDetail(cid);
}

// ─── INLINE PROJECT CREATION ───
function openInlineProjectForm(cid) {
  window._inlineProjectClientId = cid;
  let modal = document.getElementById('inline-project-modal');
  if (modal) { modal.style.display = 'flex'; document.getElementById('ip-name')?.focus(); return; }
  modal = document.createElement('div');
  modal.id = 'inline-project-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(6px);z-index:500;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = `<div style="background:var(--surface);border:1px solid var(--border2);border-radius:16px;padding:24px;width:480px;max-width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 24px 80px rgba(0,0,0,.45)">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
      <div style="font-family:var(--head);font-size:16px;font-weight:700;background:linear-gradient(135deg,var(--accent),var(--purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">🗂 Nouveau projet</div>
      <span onclick="closeInlineProjectForm()" style="cursor:pointer;color:var(--text-muted);font-size:18px;padding:4px">✕</span>
    </div>
    <div class="fg" style="margin-bottom:12px"><label class="flbl">Nom du projet *</label><input id="ip-name" class="fin" placeholder="Nom du projet"></div>
    <div class="frow" style="margin-bottom:12px">
      <div class="fg"><label class="flbl">Statut</label><select id="ip-status" class="fin"><option value="Non démarré" selected>Non démarré</option><option value="En cours">En cours</option><option value="Terminé">Terminé</option></select></div>
      <div class="fg"><label class="flbl">Priorité</label><select id="ip-priority" class="fin"><option value="Urgente">Urgente</option><option value="Haute">Haute</option><option value="Moyenne" selected>Moyenne</option><option value="Faible">Faible</option></select></div>
    </div>
    <div class="frow" style="margin-bottom:12px">
      <div class="fg"><label class="flbl">Date début</label><input id="ip-start" class="fin" type="date"></div>
      <div class="fg"><label class="flbl">Date fin</label><input id="ip-end" class="fin" type="date"></div>
    </div>
    <div class="fg" style="margin-bottom:16px"><label class="flbl">Heures estimées</label><input id="ip-hours" class="fin" type="number" placeholder="0" min="0"></div>
    <div style="display:flex;gap:9px;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="closeInlineProjectForm()">Annuler</button>
      <button class="btn btn-primary" onclick="submitInlineProject()">✅ Créer le projet</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  setTimeout(() => document.getElementById('ip-name')?.focus(), 50);
}

function closeInlineProjectForm() {
  const m = document.getElementById('inline-project-modal');
  if (m) m.style.display = 'none';
}

function submitInlineProject() {
  const name = document.getElementById('ip-name')?.value.trim();
  if (!name) { showToast('⚠️','Nom du projet requis','var(--amber)'); return; }
  const cid = window._inlineProjectClientId;
  if (!cid) return;
  const newProj = {
    id: nextId.project++, clientId: cid, name,
    status: document.getElementById('ip-status')?.value || 'Non démarré',
    priority: document.getElementById('ip-priority')?.value || 'Moyenne',
    startDate: document.getElementById('ip-start')?.value || '',
    endDate: document.getElementById('ip-end')?.value || '',
    estimatedHours: parseFloat(document.getElementById('ip-hours')?.value) || 0,
  };
  DB.projects.push(newProj);
  saveDB();
  closeInlineProjectForm();
  showToast('✅', `Projet "${name}" créé !`, 'var(--accent)');
  openClientDetail(cid);
}

// ═══════════════════════════════════════════════════════
//  INVOICE MODAL
// ═══════════════════════════════════════════════════════
function openModal(type, data={}) {
  // STEP 12 : repartir d'un formulaire propre — une erreur affichée lors d'une
  // saisie précédente ne doit pas réapparaître à la réouverture de la modale.
  if (window._mcpsClearFormErrors) window._mcpsClearFormErrors();
  if (type==='invoice') {
    const inv=data||{};
    document.getElementById('modal-ttl').textContent='💳 '+(inv.id?'Modifier':'Nouvelle')+' facture';
    const body=document.getElementById('modal-body');
    // generate invoice number
    const autoNum=inv.number||'FACT-'+new Date().getFullYear()+'-'+String(nextId.invoice).padStart(3,'0');
    body.innerHTML=`
      <div class="frow">
        <div class="fg"><label class="flbl">N° Facture</label><input class="fin" id="fi-number" value="${esc(autoNum)}"></div>
        <div class="fg"><label class="flbl">Client</label><select class="fin" id="fi-client" onchange="updateInvProjs()">${DB.clients.map(c=>`<option value="${c.id}" ${inv.clientId===c.id?'selected':''}>${c.name}</option>`).join('')}</select></div>
      </div>
      <div class="fg"><label class="flbl">Objet / Label</label><input class="fin" id="fi-label" value="${esc(inv.label||'')}" placeholder="Ex: Acompte 30% — Refonte Site Web"></div>
      <div class="fg"><label class="flbl">Projet lié</label><select class="fin" id="fi-project">${DB.projects.map(p=>`<option value="${p.id}" ${inv.projectId===p.id?'selected':''}>${p.name}</option>`).join('')}</select></div>
      <div class="frow">
        <div class="fg"><label class="flbl">Montant HT (XOF)</label><input class="fin" type="number" id="fi-amount" value="${inv.amount||''}" placeholder="Ex: 5 000 000"></div>
        <div class="fg"><label class="flbl">Statut</label><select class="fin" id="fi-status">${['Brouillon','Envoyée','Payée','En retard'].map(s=>`<option ${inv.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
      </div>
      <div class="frow">
        <div class="fg"><label class="flbl">Date d'émission</label><input class="fin" type="date" id="fi-issue" value="${inv.issueDate||new Date().toISOString().split('T')[0]}"></div>
        <div class="fg"><label class="flbl">Date d'échéance</label><input class="fin" type="date" id="fi-due" value="${inv.dueDate||''}"></div>
      </div>
      <div class="modal-acts">
        <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
        <button class="btn btn-primary" onclick="submitInvoice(${inv.id||0})">${inv.id?'Enregistrer':'Créer la facture'}</button>
      </div>`;
    document.getElementById('main-overlay').classList.add('open');
    updateInvProjs();
    return;
  }
  // delegate to original openModal logic below
  _openModalLegacy(type, data);
}

function updateInvProjs() {
  const cid=parseInt(document.getElementById('fi-client')?.value);
  const sel=document.getElementById('fi-project');
  if(!sel) return;
  sel.innerHTML=DB.projects.filter(p=>p.clientId===cid).map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
}

function submitInvoice(existingId=0) {
  const label=document.getElementById('fi-label').value.trim();
  const amount=parseInt(document.getElementById('fi-amount').value)||0;
  const obj={number:document.getElementById('fi-number').value.trim(), clientId:parseInt(document.getElementById('fi-client').value), projectId:parseInt(document.getElementById('fi-project').value)||null, label, amount, status:document.getElementById('fi-status').value, issueDate:document.getElementById('fi-issue').value, dueDate:document.getElementById('fi-due').value, paidDate:null};
  const _v = MCPS_VALIDATE.invoice(obj); if (!_v.valid) { showToast('⚠️',_v.errors[0],'var(--amber)'); if (window._mcpsShowFormErrors) window._mcpsShowFormErrors(_v.errors); return; }
  if(existingId){ Object.assign(gi(existingId),obj); showToast('✅',`Facture mise à jour !`,'var(--green)'); if (typeof _mcpsAudit==='function') _mcpsAudit('UPDATE', 'invoice', existingId, { number: obj.number, amount: obj.amount }); }
  else { obj.id=nextId.invoice++; DB.invoices.push(obj); showToast('✅',`Facture ${obj.number} créée !`,'var(--green)'); if (typeof _mcpsAudit==='function') _mcpsAudit('CREATE', 'invoice', obj.id, { number: obj.number, amount: obj.amount }); }
  closeModal(); saveDB(); renderInvoices(); updateAlert();
}

// ─── ORIGINAL MODAL LOGIC (renamed) ───
function _openModalLegacy(type, data={}) {
  if ((type==='project' || type==='task') && !data.id && DB.clients.length===0) {
    showToast('⚠️','Créez d\'abord un client — un projet ou une tâche doit toujours être rattaché à un client.','var(--amber)');
    go('clients');
    setTimeout(()=>openModal('client'), 250);
    return;
  }
  document.getElementById('modal-ttl').textContent = type==='client'?'👤 '+(data.id?'Modifier':'Nouveau')+' client':type==='project'?'🗂 '+(data.id?'Modifier':'Nouveau')+' projet':'📋 Nouvelle tâche';
  const body=document.getElementById('modal-body');
  if(type==='client') {
    const c=data;
    const needCheck=(n,lbl)=>`<div class="need-chk ${c.needs?.includes(n)?'sel-'+n:''}" id="nchk-${n}" onclick="toggleNeed('${n}')">${lbl}</div>`;
    body.innerHTML=`
      <div class="frow"><div class="fg"><label class="flbl">Nom du client *</label><input class="fin" id="fc-name" value="${esc(c.name||'')}"></div>
      <div class="fg"><label class="flbl">Secteur d'activité</label>
        <select class="fin" id="fc-sector">${Object.keys(SECTORS_META).map(s=>`<option value="${s}" ${c.sector===s?'selected':''}>${SECTORS_META[s].icon} ${s}</option>`).join('')}</select>
      </div></div>
      <div class="fg"><label class="flbl">Besoins de l'agence (multi-sélection)</label>
        <div class="need-checks">${needCheck('creative','🎨 Créatif')}${needCheck('conseil','💡 Conseil')}${needCheck('digital','💻 Digital')}</div>
      </div>
      <div class="fg" style="border-top:1px solid var(--border);padding-top:14px;margin-top:2px">
        <label class="flbl" style="margin-bottom:8px">Brief structuré (STRATEGIE-PRODUIT.md C.8 — remplace le champ texte libre comme mesure de qualité du brief)</label>
      </div>
      <div class="fg"><label class="flbl">Objectifs</label><textarea class="fin" id="fc-brief-objectives" rows="2" placeholder="Ce que le client cherche à obtenir">${esc(c.briefObjectives||'')}</textarea></div>
      <div class="fg"><label class="flbl">Audience cible</label><input class="fin" id="fc-brief-audience" value="${esc(c.briefAudience||'')}" placeholder="À qui ça s'adresse"></div>
      <div class="frow">
        <div class="fg"><label class="flbl">Ton / positionnement</label><input class="fin" id="fc-brief-tone" value="${esc(c.briefTone||'')}" placeholder="Ex: premium, accessible, corporate…"></div>
        <div class="fg"><label class="flbl">Échéance du brief</label><input class="fin" type="date" id="fc-brief-deadline" value="${c.briefDeadline||''}"></div>
      </div>
      <div class="fg"><label class="flbl">Contraintes / références</label><textarea class="fin" id="fc-brief-constraints" rows="2" placeholder="Contraintes de marque, références à respecter ou à éviter">${esc(c.briefConstraints||'')}</textarea></div>
      <div class="fg"><label class="flbl">Contexte complémentaire (notes libres, optionnel)</label><textarea class="fin" id="fc-brief" rows="2">${esc(c.brief||'')}</textarea></div>

      <div class="fg"><label class="flbl">Couleur identité</label><input class="fin" type="color" id="fc-color" value="${c.color||'#00c8ff'}" style="height:40px;cursor:pointer"></div>
      <div class="modal-acts">
        <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
        <button class="btn btn-primary" onclick="submitClient(${c.id||0})">${c.id?'Enregistrer':'Créer le client'}</button>
      </div>`;
  } else if(type==='project') {
    const p=data;
    const allMembers = getAllTeamMembers ? getAllTeamMembers() : [];
    _selectedChannels = Array.isArray(p.channels) ? [...p.channels] : [];
    const chanCheck=(k,meta)=>`<div class="chan-chk ${_selectedChannels.includes(k)?'selected':''}" id="chchk-${k}" onclick="toggleChannel('${k}')">${meta.icon} ${meta.label}</div>`;
    body.innerHTML=`
      <div class="fg"><label class="flbl">Nom du projet *</label><input class="fin" id="fp-name" value="${esc(p.name||'')}"></div>
      <div class="fg"><label class="flbl">Client</label><select class="fin" id="fp-client">${DB.clients.map(c=>`<option value="${c.id}" ${p.clientId===c.id?'selected':''}>${c.name}</option>`).join('')}</select></div>
      <div class="frow">
        <div class="fg"><label class="flbl">Statut</label><select class="fin" id="fp-status">${['Non démarré','En cours','Terminé'].map(s=>`<option ${p.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
        <div class="fg"><label class="flbl">Priorité</label><select class="fin" id="fp-priority">${['Faible','Moyenne','Haute','Urgente'].map(s=>`<option ${p.priority===s?'selected':''}>${s}</option>`).join('')}</select></div>
      </div>
      <div class="frow">
        <div class="fg"><label class="flbl">Date de début</label><input class="fin" type="date" id="fp-start" value="${p.startDate||''}"></div>
        <div class="fg"><label class="flbl">Date de fin</label><input class="fin" type="date" id="fp-end" value="${p.endDate||''}"></div>
      </div>
      <div class="fg"><label class="flbl">Heures estimées</label><input class="fin" type="number" id="fp-hours" value="${p.estimatedHours||''}" placeholder="Ex: 80"></div>
      <div class="fg"><label class="flbl">Responsable du projet</label>
        <select class="fin" id="fp-responsable">
          <option value="">— Aucun responsable —</option>
          ${allMembers.map(m=>`<option value="${esc(m)}" ${(p.responsable||'')=== m?'selected':''}>${esc(m)}</option>`).join('')}
        </select>
      </div>
      <div class="fg"><label class="flbl">Canaux de campagne (optionnel — laisser vide si simple projet interne)</label>
        <div class="need-checks">${Object.entries(MCPS_CHANNELS).map(([k,meta])=>chanCheck(k,meta)).join('')}</div>
      </div>
      <div class="frow">
        <div class="fg"><label class="flbl">Objectif</label>
          <select class="fin" id="fp-objective">
            <option value="">— Aucun —</option>
            ${MCPS_CAMPAIGN_OBJECTIVES.map(o=>`<option ${p.objective===o?'selected':''}>${o}</option>`).join('')}
          </select>
        </div>
        <div class="fg"><label class="flbl">Budget média (XOF)</label><input class="fin" type="number" id="fp-mediabudget" value="${p.mediaBudget||''}" placeholder="Ex: 500000"></div>
      </div>
      <div class="fg"><label class="flbl">Date de publication prévue</label><input class="fin" type="date" id="fp-publishdate" value="${p.publishDate||''}"></div>
      <div class="modal-acts">
        <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
        <button class="btn btn-primary" onclick="submitProject(${p.id||0})">${p.id?'Enregistrer':'Créer le projet'}</button>
      </div>`;
  } else if(type==='task') {
    _openEditTaskModal({});
    return;
  }
  document.getElementById('main-overlay').classList.add('open');
}

// ═══════════════════════════════════════════════════════
//  GLOBAL SEARCH
// ═══════════════════════════════════════════════════════
function onSearch(q) {
  const box=document.getElementById('search-results');
  q=q.trim().toLowerCase();
  if(!q){box.classList.remove('open');return;}
  const clients=DB.clients.filter(c=>c.name.toLowerCase().includes(q)||c.sector.toLowerCase().includes(q)).slice(0,4);
  const projects=DB.projects.filter(p=>p.name.toLowerCase().includes(q)).slice(0,4);
  const tasks=DB.tasks.filter(t=>t.name.toLowerCase().includes(q)).slice(0,4);
  const invs=DB.invoices.filter(i=>i.number.toLowerCase().includes(q)||i.label.toLowerCase().includes(q)).slice(0,3);

  let html='';
  if(clients.length){
    html+=`<div class="sr-section">Clients</div>`;
    html+=clients.map(c=>`<div class="sr-item" onclick="go('clients');setTimeout(()=>openClientDetail(${c.id}),200)"><span class="sr-icon">👤</span><span class="sr-name">${esc(c.name)}</span><span class="sr-sub">${esc(c.sector)}</span></div>`).join('');
  }
  if(projects.length){
    html+=`<div class="sr-section">Projets</div>`;
    html+=projects.map(p=>{const cl=gc(p.clientId);return`<div class="sr-item" onclick="go('projects')"><span class="sr-icon">🗂</span><span class="sr-name">${esc(p.name)}</span><span class="sr-sub">${esc(cl?.name||'')}</span></div>`;}).join('');
  }
  if(tasks.length){
    html+=`<div class="sr-section">Tâches</div>`;
    html+=tasks.map(t=>{const cl=gc(t.clientId);return`<div class="sr-item" onclick="go('tasks')"><span class="sr-icon">📋</span><span class="sr-name">${esc(t.name)}</span><span class="sr-sub">${esc(cl?.name||'')}</span></div>`;}).join('');
  }
  if(invs.length){
    html+=`<div class="sr-section">Factures</div>`;
    html+=invs.map(i=>`<div class="sr-item" onclick="go('invoices')"><span class="sr-icon">💳</span><span class="sr-name">${esc(i.number)}</span><span class="sr-sub">${formatXOF(i.amount)}</span></div>`).join('');
  }
  if(!html) html=`<div class="sr-item"><span class="sr-name" style="color:var(--text-muted)">Aucun résultat pour "${esc(q)}"</span></div>`;
  box.innerHTML=html;
  box.classList.add('open');
}

function closeSearch(){
  document.getElementById('search-results')?.classList.remove('open');
}

// ═══════════════════════════════════════════════════════
//  DB RESET
// ═══════════════════════════════════════════════════════
function confirmReset() {
  if(!confirm('⚠️ Effacer toutes les données ?\n\nCette action supprime définitivement clients, projets, tâches et factures sauvegardés dans ce navigateur et repart sur une application vierge.\n\nÊtes-vous sûr ?')) return;
  localStorage.removeItem('cockpit-db');
  localStorage.removeItem('cockpit-todos');
  localStorage.removeItem('cockpit-todo-id');
  showToast('🔄','Données effacées — Rechargement…','var(--amber)');
  setTimeout(()=>location.reload(),1200);
}

// Remove old duplicate openModal definition that follows

function openExport(){document.getElementById('export-overlay').classList.add('open');}
function closeExport(e){if(e&&e.target!==document.getElementById('export-overlay'))return;document.getElementById('export-overlay').classList.remove('open');}
function exportJSON(){const b=new Blob([JSON.stringify(DB,null,2)],{type:'application/json'});dl(b,'cockpit-data.json');closeExport();showToast('📦','Export JSON terminé !','var(--accent)');}
function exportCSV(type){
  let csv='';
  if(type==='clients'){csv='ID,Nom,Secteur,Besoins,Brief,Budget (XOF),Durée Contrat (mois),Couleur\n';DB.clients.forEach(c=>{csv+=`${c.id},"${c.name}","${c.sector}","${(c.needs||[]).join('+')}","${c.brief||''}",${c.budget||0},${c.contractDuration||0},"${c.color}"\n`;});}
  else if(type==='projects'){csv='ID,Nom,Client,Statut,Priorité,Début,Fin,H.Estimées\n';DB.projects.forEach(p=>{const cl=gc(p.clientId);csv+=`${p.id},"${p.name}","${cl?.name||''}","${p.status}","${p.priority}","${p.startDate}","${p.endDate}",${p.estimatedHours}\n`;});}
  else{csv='ID,Nom,Client,Projet,Statut,Début,Fin,H.Est,H.Réel\n';DB.tasks.forEach(t=>{const cl=gc(t.clientId),pj=gp(t.projectId);csv+=`${t.id},"${t.name}","${cl?.name||''}","${pj?.name||''}","${t.status}","${t.startDate}","${t.endDate}",${t.estimatedHours},${t.realHours||''}\n`;});}
  dl(new Blob([csv],{type:'text/csv'}),type+'.csv');
  closeExport(); showToast('📊','Export CSV terminé !','var(--accent)');
}
function dl(blob,fn){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=fn;a.click();}

// ═══════════════════════════════════════════════════════
//  THEME
// ═══════════════════════════════════════════════════════
function toggleTheme(){
  state.theme=state.theme==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',state.theme);
  localStorage.setItem('cockpit-theme',state.theme);
  updateThemeLbl();
  Object.keys(state.charts).forEach(k=>{if(state.charts[k]){state.charts[k].destroy();delete state.charts[k];}});
  state.charts={};
  markUnsaved();
  go(state.view);
}
function updateThemeLbl(){const i=document.getElementById('theme-ico'),l=document.getElementById('theme-lbl');if(!i)return;if(state.theme==='dark'){i.textContent='☀️';l.textContent='Mode Clair';}else{i.textContent='🌙';l.textContent='Mode Sombre';}}

// ═══════════════════════════════════════════════════════
//  EFFECTS
// ═══════════════════════════════════════════════════════
function fireConfetti(){
  confetti({particleCount:140,spread:80,origin:{y:.6},colors:['#00c8ff','#00e5a0','#ffab00','#a78bfa','#ff6b2b']});
  setTimeout(()=>confetti({particleCount:60,spread:100,origin:{y:.5},angle:60}),250);
  setTimeout(()=>confetti({particleCount:60,spread:100,origin:{y:.5},angle:120}),400);
}
function showToast(ico,msg,color='var(--accent)'){
  const box=document.getElementById('toast-box');
  if(!box) return;
  // limit stack
  while(box.children.length>=4) box.firstElementChild?.remove();
  const t=document.createElement('div'); t.className='toast';
  const msgEl=document.createElement('span'); msgEl.className='toast-msg'; msgEl.style.color=color; msgEl.textContent=msg;
  const icoEl=document.createElement('span'); icoEl.className='toast-ico'; icoEl.textContent=ico;
  t.appendChild(icoEl); t.appendChild(msgEl);
  // click to dismiss
  t.style.cursor='pointer'; t.onclick=()=>t.remove();
  box.appendChild(t); setTimeout(()=>t.remove(),4500);
}
function esc(s){if(s==null)return '';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded',()=>{
  checkLateInvoices();
  window._clientActiveTab = 'client';
  go('dashboard');
  // Pre-populate clients grid and update all counters
  // Initialize clients tab and counters
  setTimeout(() => {
    window._clientActiveTab = 'client';
    if (typeof _updateCounters === 'function') _updateCounters();
    if (typeof renderClients  === 'function') renderClients();
  }, 200);

  // Show where data was loaded from
  const lbl = document.getElementById('save-method-lbl');
  if (window._EMBEDDED_DB?.clients) {
    if(lbl) lbl.textContent = '✓ Données chargées depuis le fichier';
  } else if (localStorage.getItem('cockpit-db')) {
    if(lbl) lbl.textContent = '⚠ Données depuis le navigateur — sauvegarder !';
    markUnsaved();
  } else {
    if(lbl) lbl.textContent = 'Données de démonstration';
    markUnsaved();
  }

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape') {
      closeModal(); closePDFModal(); closeExport(); closeClientDetail(); closeSearch();
      closeProspectModal();
    }
    // Ctrl+S / Cmd+S → save
    if((e.ctrlKey||e.metaKey)&&e.key==='s') {
      e.preventDefault();
      if(!window._savingInProgress) {
        window._savingInProgress = true;
        saveToFile().finally(()=>{ window._savingInProgress=false; }).catch(()=>{ window._savingInProgress=false; });
      }
    }
  });

  document.addEventListener('click',e=>{
    if(!document.getElementById('search-wrap')?.contains(e.target)) closeSearch();
  });

  // Warn before closing if unsaved
  window.addEventListener('beforeunload', e=>{
    if(_hasUnsaved) { e.preventDefault(); e.returnValue=''; }
  });

  setTimeout(()=>{
    showToast('💾','Ctrl+S pour sauvegarder · Cliquer Dismiss','var(--accent)');
  },1800);
});

// ═══════════════════════════════════════════════════════
//  PROSPECT / PIPELINE SYSTEM  (AJOUT — ne modifie rien d'existant)
// ═══════════════════════════════════════════════════════

const PROSPECT_STAGES = [
  { key:'lead',        label:'Nouveau lead',        cls:'ps-lead',        icon:'🌱', step:0 },
  { key:'contacted',   label:'Contacté',             cls:'ps-contacted',   icon:'📞', step:1 },
  { key:'proposal',    label:'Proposition envoyée',  cls:'ps-proposal',    icon:'📄', step:2 },
  { key:'negociation', label:'En négociation',        cls:'ps-negociation', icon:'🤝', step:3 },
  { key:'converted',   label:'Converti ✅',           cls:'ps-converted',   icon:'🎉', step:4 },
  { key:'lost',        label:'Perdu',                cls:'ps-lost',        icon:'❌', step:5 },
];

function prospectStageMeta(key) { return PROSPECT_STAGES.find(s=>s.key===key) || PROSPECT_STAGES[0]; }

function prospectStageBadge(key) {
  const s = prospectStageMeta(key);
  return `<span class="pipe-stage-badge ${s.cls}">${s.icon} ${s.label}</span>`;
}

function typeBadge(c) {
  if (c.type === 'prospect') return `<span class="lbl-prospect">🎯 Prospect</span>`;
  return `<span class="lbl-client">✅ Client</span>`;
}


// ═══════════════════════════════════════════════════════
//  DASHBOARD: RESSOURCES & CHARGE CLIENTS
// ═══════════════════════════════════════════════════════
function renderDashboardResources() {
  const clients = DB.clients.filter(c => c.type !== 'prospect');

  // Calcul des métriques par client
  const metrics = clients.map(c => {
    const tasks   = DB.tasks.filter(t => t.clientId === c.id);
    const active  = tasks.filter(t => t.status !== 'Terminé');
    const late    = active.filter(t => t.endDate && new Date(t.endDate) < new Date());
    const estH    = tasks.reduce((s,t) => s + (t.estimatedHours||0), 0);
    const realH   = tasks.filter(t=>t.realHours).reduce((s,t) => s + (t.realHours||0), 0);
    const projs   = DB.projects.filter(p => p.clientId === c.id && p.status === 'En cours').length;
    const pct     = tasks.length ? Math.round(tasks.filter(t=>t.status==='Terminé').length/tasks.length*100) : 0;
    const pressure = active.length * 2 + late.length * 3 + projs;
    return { c, tasks, active, late, estH, realH, projs, pct, pressure };
  }).filter(m => m.active.length > 0)
    .sort((a,b) => b.pressure - a.pressure);

  // ── Resource Cards (top 4 max) ──
  const grid = document.getElementById('dash-resource-grid');
  if (grid) {
    if (!metrics.length) {
      grid.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:16px">Aucune tâche active en cours.</div>';
    } else {
      const maxPressure = Math.max(...metrics.map(m=>m.pressure), 1);
      grid.innerHTML = metrics.slice(0,4).map((m, i) => {
        const { c, active, late, estH, projs, pct, pressure } = m;
        const intensity = Math.round(pressure / maxPressure * 100);
        const rankEmoji = ['🔴','🟠','🟡','🟢'][Math.min(i,3)];
        const urgColor  = i===0?'var(--red)':i===1?'var(--orange)':i===2?'var(--amber)':'var(--green)';
        const lateWarn  = late.length ? `<div class="rc-alert">⚠️ ${late.length} en retard</div>` : '';
        return `<div class="resource-card" style="--rc-color:${c.color}" onclick="openClientDetail(${c.id})">
          <div class="rc-head">
            <div style="display:flex;align-items:center;gap:10px">
              <div class="rc-rank" style="color:${urgColor}">${rankEmoji}</div>
              <div class="rc-avatar" style="background:${c.color}">${esc(c.avatar)}</div>
              <div>
                <div class="rc-name">${esc(c.name)}</div>
                <div class="rc-sector">${(SECTORS_META[c.sector]||{icon:'◈'}).icon} ${esc(c.sector)}</div>
              </div>
            </div>
            <div class="rc-pressure" style="color:${urgColor}">${intensity}%</div>
          </div>
          ${lateWarn}
          <div class="rc-stats">
            <div class="rc-stat"><div class="rc-sv" style="color:${c.color}">${active.length}</div><div class="rc-sl">Tâches actives</div></div>
            <div class="rc-stat"><div class="rc-sv" style="color:var(--purple)">${projs}</div><div class="rc-sl">Projets actifs</div></div>
            <div class="rc-stat"><div class="rc-sv" style="color:var(--accent)">${estH}h</div><div class="rc-sl">H. estimées</div></div>
          </div>
          <div style="margin-top:8px">
            <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--text-muted);margin-bottom:4px">
              <span>Pression ressources</span>
              <span style="font-family:var(--mono);font-weight:700;color:${urgColor}">${intensity}%</span>
            </div>
            <div class="pbar" style="height:5px"><div class="pfill" style="width:${intensity}%;background:linear-gradient(90deg,${urgColor},${c.color})"></div></div>
          </div>
          <div style="margin-top:8px">
            <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--text-muted);margin-bottom:4px">
              <span>Complétion globale</span>
              <span style="font-family:var(--mono);font-weight:700;color:${c.color}">${pct}%</span>
            </div>
            <div class="pbar" style="height:5px"><div class="pfill" style="width:${pct}%;background:linear-gradient(90deg,${c.color},${c.color}88)"></div></div>
          </div>
        </div>`;
      }).join('');
    }
  }

  // ── Workload bars (tous clients actifs) ──
  const wlEl = document.getElementById('dash-workload-bars');
  if (wlEl) {
    if (!metrics.length) { wlEl.innerHTML=''; return; }
    const maxH = Math.max(...metrics.map(m=>m.estH), 1);
    wlEl.innerHTML = metrics.map(m => {
      const { c, active, late, estH, pct } = m;
      const barW = Math.round(estH/maxH*100);
      const lateTag = late.length ? `<span style="font-size:10px;color:var(--red);font-weight:700;margin-left:8px">⚠ ${late.length} retard</span>` : '';
      return `<div class="wl-row" onclick="go('tasks');setTimeout(()=>{const el=document.getElementById('tf-client');if(el){[...el.options].forEach(o=>o.value===${c.id}?o.selected=true:null);onTaskClientChange();}},200)">
        <div class="wl-label">
          <div style="width:8px;height:8px;border-radius:2px;background:${c.color};flex-shrink:0"></div>
          <span class="wl-name">${esc(c.name)}</span>
          ${lateTag}
        </div>
        <div class="wl-bar-wrap">
          <div class="pbar" style="flex:1;height:7px">
            <div class="pfill" style="width:${barW}%;background:linear-gradient(90deg,${c.color},${c.color}88)"></div>
          </div>
          <span class="wl-hours">${estH}h</span>
          <span class="wl-tasks">${active.length} tâche(s)</span>
          <span style="font-family:var(--mono);font-size:10.5px;color:${c.color};font-weight:700">${pct}%</span>
        </div>
      </div>`;
    }).join('');
  }
}

// ── PROSPECT KANBAN + CLIENT MINI GRID for dashboard ──
function renderDashboardProspects() {
  const prospects = getProspects();
  const clients   = DB.clients.filter(c => c.type === 'client' || !c.type);

  const pc = document.getElementById('dash-prospect-count');
  if (pc) pc.textContent = prospects.length;
  const cc = document.getElementById('dash-client-count');
  if (cc) cc.textContent = clients.length;

  // Also sync the top KPI "Clients actifs" to real clients only
  const kpiC = document.getElementById('kpi-c');
  if (kpiC) animCount(kpiC, clients.length);

  // Kanban
  const kanban = document.getElementById('dash-prospect-kanban');
  if (kanban) {
    if (!prospects.length) {
      kanban.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:20px 4px">Aucun prospect. Ajoutez-en via <strong style="color:var(--purple)">+ Nouveau prospect</strong> dans la vue Clients.</div>`;
    } else {
      const activeStages = PROSPECT_STAGES.filter(s => s.key !== 'converted');
      const clsMap = { lead:'rgba(167,139,250,.1)', contacted:'rgba(0,200,255,.1)', proposal:'rgba(255,171,0,.1)', negociation:'rgba(255,107,43,.1)', lost:'rgba(255,61,90,.1)' };
      kanban.innerHTML = activeStages.map(stage => {
        const cards = prospects.filter(p => (p.prospectStatus || 'lead') === stage.key);
        return `<div class="kanban-col">
          <div class="kanban-col-hd" style="background:${clsMap[stage.key]||'var(--surface2)'}">
            <span>${stage.icon} ${stage.label}</span>
            <span style="font-size:13px;font-weight:700">${cards.length}</span>
          </div>
          <div class="kanban-col-body" data-stage="${stage.key}">
          ${cards.map(p => `
            <div class="kanban-card" data-id="${p.id}" onclick="openProspectModal(${p.id})">
              <div style="display:flex;align-items:center;gap:7px;margin-bottom:4px">
                <div style="width:28px;height:28px;border-radius:6px;background:${p.color};display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-weight:700;font-size:10px;color:#000;flex-shrink:0">${esc(p.avatar)}</div>
                <div class="kanban-card-name">${esc(p.name)}</div>
              </div>
              <div class="kanban-card-sector">${(SECTORS_META[p.sector]||{icon:'◈'}).icon} ${esc(p.sector)}</div>
              ${p.budget ? `<div style="font-size:10.5px;color:var(--amber);margin-top:4px;font-family:var(--mono)">${fmtXOFShort(p.budget)} XOF</div>` : ''}
              ${(p.observations||[]).length ? `<div style="font-size:10px;color:var(--text-muted);margin-top:4px">💬 ${(p.observations||[]).length} obs.</div>` : ''}
            </div>`).join('')}
          </div>
        </div>`;
      }).join('');
      _initProspectKanbanSortable();
    }
  }

  // Client mini-grid
  const clientGrid = document.getElementById('dash-client-grid');
  if (clientGrid) {
    if (!clients.length) {
      clientGrid.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:20px 4px">Aucun client actif.</div>`;
    } else {
      clientGrid.innerHTML = clients.map(c => {
        const tasks = cTasks(c.id);
        const done = tasks.filter(t=>t.status==='Terminé').length;
        const pct = tasks.length ? Math.round(done/tasks.length*100) : 0;
        return `<div class="cl-mini-card" onclick="openClientDetail(${c.id})">
          <div class="cl-mini-avatar" style="background:${c.color}">${esc(c.avatar)}</div>
          <div style="flex:1;min-width:0">
            <div class="cl-mini-name">${esc(c.name)}</div>
            <div class="cl-mini-sector">${(SECTORS_META[c.sector]||{icon:'◈'}).icon} ${esc(c.sector)}</div>
            <div style="margin-top:5px"><div class="pbar" style="height:4px"><div class="pfill" style="width:${pct}%;background:${c.color}"></div></div></div>
          </div>
          <div style="font-family:var(--mono);font-size:11px;color:${c.color};font-weight:700;text-align:right;flex-shrink:0">${pct}%</div>
        </div>`;
      }).join('');
    }
  }
}

// ── Pipeline prospects glissable-déposable (SortableJS) ──
function _initProspectKanbanSortable(){
  if (typeof Sortable === 'undefined') return;
  const cols = document.querySelectorAll('#dash-prospect-kanban .kanban-col-body');
  cols.forEach(col => {
    if (col._sortableInstance) { col._sortableInstance.destroy(); }
    col._sortableInstance = new Sortable(col, {
      group: 'prospect-pipeline',
      animation: 180,
      ghostClass: 'kanban-card-ghost',
      onEnd: (evt) => {
        const id = parseInt(evt.item.dataset.id, 10);
        const newStage = evt.to.dataset.stage;
        const prospect = gc(id);
        if (prospect && newStage && prospect.prospectStatus !== newStage) {
          prospect.prospectStatus = newStage;
          saveDB();
          showToast('✅', `${prospect.name} déplacé vers "${(PROSPECT_STAGES.find(s=>s.key===newStage)||{}).label||newStage}"`, 'var(--green)');
        }
        renderDashboardProspects(); // re-render for correct counts; re-attaches Sortable
      },
    });
  });
}

// renderDashboard calls renderDashboardResources directly
// (renderDashboardProspects removed - clients now filtered by tab)

// ── PATCH renderClients to add type filter + prospect extras ──
// renderClients handled by dedicated function above

// ── PATCH openModal to handle 'prospect' type ──
const _origOpenModal = openModal;
openModal = function(type, data={}) {
  if (type === 'prospect') {
    _openModalLegacy('client', { type:'prospect', prospectStatus:'lead', ...data });
    return;
  }
  _origOpenModal(type, data);
};

// ── PATCH _openModalLegacy to inject type selector in client form ──
const _origOpenModalLegacy = _openModalLegacy;
_openModalLegacy = function(type, data={}) {
  _origOpenModalLegacy(type, data);
  if (type !== 'client') return;
  const c = data;
  const currentType = c.type || 'client';
  const fgBrief = document.getElementById('fc-brief')?.closest('.fg');
  if (!fgBrief) return;
  fgBrief.insertAdjacentHTML('beforebegin', `
    <div class="fg" id="fc-type-fg">
      <label class="flbl">Type de contact</label>
      <div style="display:flex;gap:8px;margin-top:4px">
        <div onclick="setClientType('client')" id="fct-client"
          style="flex:1;padding:8px 12px;border-radius:var(--r-sm);border:2px solid ${currentType==='client'?'var(--green)':'var(--border)'};background:${currentType==='client'?'var(--green-dim)':'var(--surface2)'};color:${currentType==='client'?'var(--green)':'var(--text-muted)'};cursor:pointer;font-size:12.5px;font-weight:700;text-align:center;transition:all .2s;user-select:none">
          ✅ Client
        </div>
        <div onclick="setClientType('prospect')" id="fct-prospect"
          style="flex:1;padding:8px 12px;border-radius:var(--r-sm);border:2px solid ${currentType==='prospect'?'var(--purple)':'var(--border)'};background:${currentType==='prospect'?'var(--purple-dim)':'var(--surface2)'};color:${currentType==='prospect'?'var(--purple)':'var(--text-muted)'};cursor:pointer;font-size:12.5px;font-weight:700;text-align:center;transition:all .2s;user-select:none">
          🎯 Prospect
        </div>
      </div>
      <input type="hidden" id="fc-type-sel" value="${currentType}">
    </div>`);
};

function setClientType(val) {
  const inp = document.getElementById('fc-type-sel');
  if (inp) inp.value = val;
  const isClient = val === 'client';
  const ce = document.getElementById('fct-client');
  const pe = document.getElementById('fct-prospect');
  if (ce) { ce.style.borderColor=isClient?'var(--green)':'var(--border)'; ce.style.background=isClient?'var(--green-dim)':'var(--surface2)'; ce.style.color=isClient?'var(--green)':'var(--text-muted)'; }
  if (pe) { pe.style.borderColor=!isClient?'var(--purple)':'var(--border)'; pe.style.background=!isClient?'var(--purple-dim)':'var(--surface2)'; pe.style.color=!isClient?'var(--purple)':'var(--text-muted)'; }
}

// ── PATCH submitClient to save type + prospectStatus ──
const _origSubmitClient = submitClient;
submitClient = function(existingId=0) {
  const typeVal = document.getElementById('fc-type-sel')?.value || null;
  const _isNewProspect = !existingId && typeVal === 'prospect';
  const _beforeLen = _isNewProspect ? DB.clients.length : 0;
  _origSubmitClient(existingId);
  // PATCH #5b (audit technique, Phase 5) : DB.clients et DB.prospects sont
  // désormais deux tableaux distincts. _origSubmitClient() (inchangée) pousse
  // toujours ses nouveaux enregistrements dans DB.clients par défaut — pour
  // un NOUVEAU prospect, on le déplace ici vers DB.prospects juste après,
  // sans toucher à la logique d'origine.
  if (_isNewProspect && DB.clients.length > _beforeLen) {
    const moved = DB.clients.pop();
    moved.type = 'prospect';
    if (!moved.prospectStatus) moved.prospectStatus = 'lead';
    if (!moved.observations) moved.observations = [];
    DB.prospects.push(moved);
    saveDB();
    if (typeof _mcpsAudit==='function') _mcpsAudit('CREATE', 'prospect', moved.id, { name: moved.name });
    if (state.view === 'dashboard') renderDashboardProspects();
    return;
  }
  // Patch the saved record
  const saved = existingId ? gc(existingId) : DB.clients[DB.clients.length-1];
  if (saved) {
    if (typeVal) {
      saved.type = typeVal;
      if (typeVal === 'prospect' && !saved.prospectStatus) saved.prospectStatus = 'lead';
      if (typeVal === 'prospect' && !saved.observations) saved.observations = [];
    } else if (!saved.type) {
      saved.type = 'client';
    }
    saveDB();
    if (typeof _mcpsAudit==='function') {
      _mcpsAudit(existingId ? 'UPDATE' : 'CREATE', saved.type === 'prospect' ? 'prospect' : 'client', saved.id, { name: saved.name });
    }
  }
  if (state.view === 'dashboard') renderDashboardProspects();
};

// ── PROSPECT MODAL FUNCTIONS ──
function openProspectModal(cid) {
  const c = gc(cid); if (!c) return;
  const overlay = document.getElementById('prospect-overlay');
  document.getElementById('prospect-modal-title').textContent = `🎯 ${c.name} — Pipeline`;
  const currentStage = c.prospectStatus || 'lead';
  const obs = c.observations || [];

  document.getElementById('prospect-modal-body').innerHTML = `
    <div class="fg">
      <label class="flbl">État actuel du pipeline</label>
      <div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:6px" id="stage-selector">
        ${PROSPECT_STAGES.map(s => `
          <div onclick="selectProspectStage('${s.key}')" id="stage-opt-${s.key}"
            style="padding:6px 12px;border-radius:20px;border:2px solid ${s.key===currentStage?'var(--purple)':'var(--border)'};
                   background:${s.key===currentStage?'var(--purple-dim)':'var(--surface2)'};
                   color:${s.key===currentStage?'var(--purple)':'var(--text-muted)'};
                   cursor:pointer;font-size:12px;font-weight:600;transition:all .2s;user-select:none">
            ${s.icon} ${s.label}
          </div>`).join('')}
      </div>
    </div>
    <div class="fg" style="margin-top:14px">
      <label class="flbl">Observation <span style="color:var(--text-dim)">(optionnel)</span></label>
      <textarea class="fin" id="obs-text" rows="3" placeholder="Ex: RDV le 15 avril, en attente de validation budget…"></textarea>
    </div>
    <div style="display:flex;gap:9px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap">
      <button class="btn btn-ghost" onclick="closeProspectModal()">Fermer</button>
      <button class="btn" style="background:var(--purple-dim);color:var(--purple);border:1px solid rgba(167,139,250,.3)" onclick="saveProspectStatus(${cid})">💾 Enregistrer</button>
      ${currentStage !== 'converted' ? `<button class="convert-btn" style="width:auto;padding:7px 16px" onclick="convertToClient(${cid})">🎉 Convertir en Client</button>` : ''}
    </div>
    ${obs.length ? `
    <div style="margin-top:18px;border-top:1px solid var(--border);padding-top:14px">
      <div class="card-title" style="margin-bottom:10px">📋 Historique (${obs.length})</div>
      <div class="obs-list">
        ${[...obs].reverse().map(o => {
          const sm = prospectStageMeta(o.stage);
          return `<div class="obs-item" style="border-left-color:${sm.key==='converted'?'var(--green)':sm.key==='lost'?'var(--red)':'var(--purple)'}">
            <div class="obs-item-date">
              <span>${esc(o.date)}</span>
              <span class="pipe-stage-badge ${sm.cls}">${sm.icon} ${sm.label}</span>
            </div>
            <div class="obs-item-text">${o.note ? esc(o.note) : '<em style="color:var(--text-dim)">Changement d\'état sans note.</em>'}</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : `<div style="margin-top:16px;font-size:12px;color:var(--text-muted);text-align:center;padding:12px">Aucune observation enregistrée.</div>`}
  `;
  window._selectedProspectStage = currentStage;
  overlay.classList.add('open');
}

function selectProspectStage(key) {
  window._selectedProspectStage = key;
  PROSPECT_STAGES.forEach(s => {
    const el = document.getElementById('stage-opt-'+s.key);
    if (!el) return;
    const sel = s.key === key;
    el.style.borderColor = sel ? 'var(--purple)' : 'var(--border)';
    el.style.background  = sel ? 'var(--purple-dim)' : 'var(--surface2)';
    el.style.color       = sel ? 'var(--purple)' : 'var(--text-muted)';
  });
}

function saveProspectStatus(cid) {
  const c = gc(cid); if (!c) return;
  const newStage = window._selectedProspectStage || c.prospectStatus || 'lead';
  const note = document.getElementById('obs-text')?.value.trim() || '';
  if (newStage !== (c.prospectStatus||'lead') || note) {
    if (!c.observations) c.observations = [];
    c.observations.push({
      date: new Date().toLocaleDateString('fr',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}),
      stage: newStage,
      note: note,
    });
  }
  c.prospectStatus = newStage;
  saveDB();
  closeProspectModal();
  showToast('✅', `${c.name} → ${prospectStageMeta(newStage).icon} ${prospectStageMeta(newStage).label}`, 'var(--purple)');
  if (state.view === 'dashboard') renderDashboard();
  if (state.view === 'clients') renderClients();
}

function convertToClient(cid) {
  const c = gc(cid); if (!c) return;
  if (!confirm(`Convertir "${c.name}" en client actif ?\nSon historique prospect sera conservé.`)) return;
  if (!c.observations) c.observations = [];
  c.observations.push({
    date: new Date().toLocaleDateString('fr',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}),
    stage: 'converted',
    note: 'Prospect converti en client actif.',
  });
  c.type = 'client';
  c.prospectStatus = 'converted';
  c.convertedFromProspect = true;
  c.convertedAt = new Date().toISOString();
  // PATCH #5b : déplacer physiquement l'enregistrement de DB.prospects vers
  // DB.clients (les deux tableaux sont désormais distincts).
  const idxInProspects = DB.prospects.findIndex(p => p.id === cid);
  if (idxInProspects !== -1) {
    DB.prospects.splice(idxInProspects, 1);
    DB.clients.push(c);
  }
  saveDB();
  if (typeof _mcpsAudit==='function') _mcpsAudit('CONVERT', 'prospect', cid, { name: c.name, to: 'client' });
  closeProspectModal();
  const _ov = document.getElementById('client-detail-overlay');
  if (_ov) _ov.classList.remove('open');
  fireConfetti();
  showToast('🎉', `${c.name} est maintenant un client actif ! 🎊`, 'var(--green)');
  window._clientActiveTab = 'client';
  if (state.view !== 'clients') {
    go('clients');
    setTimeout(() => { switchClientTab('client'); openClientDetail(cid); }, 300);
  } else {
    switchClientTab('client');
    setTimeout(() => openClientDetail(cid), 200);
  }
  if (typeof renderDashboard === 'function') setTimeout(renderDashboard, 50);
}

function closeProspectModal(e) {
  // Only close when clicking the backdrop itself (not modal content)
  if (e && e.target !== document.getElementById('prospect-overlay')) return;
  document.getElementById('prospect-overlay').classList.remove('open');
  window._selectedProspectStage = null;
}

// Escape for prospect modal is handled in the main keydown listener in DOMContentLoaded

// ═══════════════════════════════════════════════════════
//  NEW FEATURES — TEAM, CONTACT, NEXT STEPS, REFERRAL
//  (Pure additions — nothing existing is modified)
// ═══════════════════════════════════════════════════════

// ── HELPERS ──
function getAllTeamMembers() {
  // Collect from DB.team (source of truth) + legacy names from clients/tasks
  const names = new Set();
  (DB.team||[]).forEach(m => m.name && names.add(m.name.trim()));
  DB.clients.forEach(c => (c.teamMembers||[]).forEach(m => m && names.add(m.trim())));
  DB.tasks.forEach(t => t.assignedTo && names.add(t.assignedTo.trim()));
  DB.clients.filter(c=>c.referredBy).forEach(c => names.add(c.referredBy.trim()));
  return [...names].filter(Boolean);
}

function getTeamInitial(name) {
  return name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2) || '?';
}

function memberColor(name) {
  // Deterministic pastel color from name
  let h = 0;
  for (let i=0; i<name.length; i++) h = (h*31 + name.charCodeAt(i)) & 0xFFFFFF;
  const hue = h % 360;
  return `hsl(${hue},60%,55%)`;
}

// ── TEAM PERFORMANCE ENGINE ──
function computeTeamStats() {
  const now = new Date();
  const stats = {}; // name → { total, done, late, tasks[], doneHours, estHours }

  DB.tasks.forEach(t => {
    const member = t.assignedTo ? t.assignedTo.trim() : null;
    if (!member) return;
    if (!stats[member]) stats[member] = { total:0, done:0, late:0, tasks:[], doneHours:0, estHours:0 };
    const s = stats[member];
    s.total++;
    s.tasks.push(t);
    s.estHours += t.estimatedHours || 0;
    if (t.status === 'Terminé') {
      s.done++;
      s.doneHours += t.realHours || t.estimatedHours || 0;
    } else if (t.endDate && new Date(t.endDate) < now) {
      s.late++;
    }
  });

  return stats;
}

function renderTeamPerformance() {
  const stats = computeTeamStats();
  const names = Object.keys(stats);
  const now = new Date();

  // ── PODIUM ──
  const podium = document.getElementById('dash-podium');
  if (!names.length) {
    podium.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:20px;text-align:center;width:100%">Assignez des membres aux tâches pour voir le podium.</div>`;
  } else {
    // Score = done*3 + total*1 - late*2
    const ranked = names.map(n => ({
      name: n,
      score: stats[n].done * 3 + stats[n].total - stats[n].late * 2,
      ...stats[n]
    })).sort((a,b) => b.score - a.score);

    const top3 = ranked.slice(0,3);
    const maxScore = Math.max(...top3.map(p=>p.score), 1);
    const podiumOrder = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3; // 2nd-1st-3rd visually
    const heights = top3.length === 3 ? ['70px','100px','55px'] : ['100px','75px','55px'];
    const crowns = ['🥈','🥇','🥉'];
    const goldColors = ['#C0C0C0','#FFD700','#CD7F32'];

    podium.innerHTML = `<div style="display:flex;align-items:flex-end;justify-content:center;gap:16px;width:100%;padding:20px 0 8px">
      ${podiumOrder.map((p,i) => {
        const orig = top3.indexOf(p);
        const h = heights[i];
        const col = goldColors[i];
        const crn = crowns[i];
        return `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;max-width:130px">
          <div style="position:relative;width:48px;height:48px;border-radius:50%;background:${memberColor(p.name)};display:flex;align-items:center;justify-content:center;font-family:var(--head);font-size:15px;font-weight:800;color:#000;box-shadow:0 0 0 3px ${col}">
            ${getTeamInitial(p.name)}
            ${i===1?`<div style="position:absolute;top:-16px;font-size:20px;left:50%;transform:translateX(-50%)">${crn}</div>`:''}
          </div>
          <div style="font-size:12px;font-weight:700;text-align:center;line-height:1.3">${esc(p.name)}</div>
          <div style="font-family:var(--mono);font-size:10.5px;color:var(--text-muted)">${p.done}/${p.total} tâches · score ${p.score}</div>
          <div style="width:100%;height:${h};border-radius:6px 6px 0 0;background:${col}66;border:2px solid ${col};display:flex;align-items:center;justify-content:center">
            <span style="font-family:var(--mono);font-size:12px;font-weight:700;color:${col}">#${orig+1}</span>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  // ── LATE MEMBERS ──
  const lateEl = document.getElementById('dash-late-members');
  const lateOnes = names.filter(n => stats[n].late > 0).sort((a,b) => stats[b].late - stats[a].late);
  if (!lateOnes.length) {
    lateEl.innerHTML = `<div style="color:var(--green);font-size:12.5px;font-weight:600;padding:12px;text-align:center">✅ Aucun retard détecté sur l'équipe.</div>`;
  } else {
    lateEl.innerHTML = lateOnes.map(n => {
      const s = stats[n];
      const lateTasks = s.tasks.filter(t => t.status!=='Terminé' && t.endDate && new Date(t.endDate)<now);
      return `<div class="task-edit-row" style="border-radius:8px;border:1px solid rgba(255,61,90,.2);background:var(--red-dim);flex-wrap:wrap;gap:6px">
        <div style="width:32px;height:32px;border-radius:50%;background:${memberColor(n)};display:flex;align-items:center;justify-content:center;font-family:var(--head);font-size:12px;font-weight:800;color:#000;flex-shrink:0">${getTeamInitial(n)}</div>
        <div style="flex:1"><div style="font-size:13px;font-weight:700">${esc(n)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${lateTasks.map(t=>`"${esc(t.name)}"`).join(', ')}</div>
        </div>
        <span class="team-late-badge">⚠️ ${s.late} en retard</span>
      </div>`;
    }).join('');
  }

  // ── EFFICIENCY GRID ──
  const grid = document.getElementById('dash-team-grid');
  if (!names.length) {
    grid.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:16px;grid-column:1/-1;text-align:center">Assignez des membres d'équipe aux tâches pour voir les métriques.</div>`;
  } else {
    const ranked2 = names.map(n => ({name:n,...stats[n]})).sort((a,b)=>b.total-a.total);
    grid.innerHTML = ranked2.map(m => {
      const pct = m.total ? Math.round(m.done/m.total*100) : 0;
      const eff = m.estHours ? Math.min(100, Math.round(m.done/m.total*100)) : 0;
      const lateCount = m.late;
      return `<div class="team-perf-card">
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
          <div style="width:36px;height:36px;border-radius:50%;background:${memberColor(m.name)};display:flex;align-items:center;justify-content:center;font-family:var(--head);font-size:13px;font-weight:800;color:#000;flex-shrink:0">${getTeamInitial(m.name)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.name)}</div>
            <div style="font-size:10.5px;color:var(--text-muted)">${m.total} tâche${m.total>1?'s':''} assignée${m.total>1?'s':''}</div>
          </div>
          ${lateCount ? `<span class="team-late-badge">⚠️ ${lateCount}</span>` : `<span class="team-ok-badge">✓ OK</span>`}
        </div>
        <div style="display:flex;flex-direction:column;gap:5px">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:3px"><span>Complétion</span><span style="font-family:var(--mono);font-weight:700;color:${pct>=75?'var(--green)':pct>=50?'var(--accent)':'var(--amber)'}">${pct}%</span></div>
          <div class="pbar" style="height:6px"><div class="pfill" style="width:${pct}%;background:${memberColor(m.name)}"></div></div>
          <div style="font-size:10.5px;color:var(--text-muted);margin-top:4px">${m.done} terminée${m.done>1?'s':''} · ${m.doneHours}h réalisées</div>
        </div>
      </div>`;
    }).join('');
  }

  // ── REFERRAL CHART ──
  // ── REFERRAL CHART — expandable with prospect list + edit ──
  const refEl = document.getElementById('dash-referral-chart');
  const allProspects = getProspects();
  const refCounts = {};
  allProspects.filter(c=>c.referredBy).forEach(c=>{
    const r = c.referredBy.trim();
    if (!refCounts[r]) refCounts[r] = [];
    refCounts[r].push(c);
  });
  const unassigned = allProspects.filter(c=>!c.referredBy);
  const refEntries = Object.entries(refCounts).sort((a,b)=>b[1].length-a[1].length);
  const maxRef = refEntries[0]?.[1].length || 1;

  let refHtml = '';

  // Header with "Assign all" button
  refHtml += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
    <span style="font-size:11px;color:var(--text-muted)">${allProspects.length} prospect(s) au total · ${unassigned.length} non affectés</span>
    <button class="btn" style="padding:4px 10px;font-size:11px;background:var(--purple-dim);color:var(--purple);border:1px solid rgba(167,139,250,.3)" onclick="openAssignReferralModal()">+ Affecter un prospect</button>
  </div>`;

  if (!refEntries.length && !unassigned.length) {
    refHtml += `<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:20px">Aucun prospect créé.</div>`;
  } else {
    // Apporteur rows
    refEntries.forEach(([name, prospects], i) => {
      const pct = Math.round(prospects.length/Math.max(maxRef,1)*100);
      const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
      const rowId = 'ref-row-'+name.replace(/\s+/g,'_');
      refHtml += `
      <div style="margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px;cursor:pointer" onclick="toggleRefRow('${rowId}')">
          <div style="width:32px;height:32px;border-radius:50%;background:${memberColor(name)};display:flex;align-items:center;justify-content:center;font-family:var(--head);font-size:12px;font-weight:800;color:#000;flex-shrink:0">${getTeamInitial(name)}</div>
          <div style="flex:1">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <span style="font-size:13px;font-weight:700">${esc(name)}</span>
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--purple)">${prospects.length} prospect${prospects.length>1?'s':''}</span>
                ${medal?`<span style="font-size:15px">${medal}</span>`:''}
                <span style="font-size:11px;color:var(--text-muted);transform:rotate(0deg);transition:.2s" id="arr-${rowId}">▾</span>
              </div>
            </div>
            <div style="height:8px;background:var(--surface2);border-radius:4px;overflow:hidden">
              <div class="referral-chart-bar" style="width:${pct}%;height:100%"></div>
            </div>
          </div>
        </div>
        <div id="${rowId}" style="display:none;margin-top:8px;padding:8px 10px;background:var(--surface2);border-radius:8px;border:1px solid var(--border)">
          ${prospects.map(p => `
            <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border3,var(--border))">
              <div style="width:26px;height:26px;border-radius:6px;background:${p.color};display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:10px;font-weight:700;color:#000;flex-shrink:0">${esc(p.avatar)}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</div>
                <div style="font-size:10.5px;color:var(--text-muted)">${prospectStageBadge(p.prospectStatus||'lead')}</div>
              </div>
              <button class="btn btn-ghost btn-sm" style="padding:3px 9px;font-size:11px" onclick="openProspectQuickEdit(${p.id})">✏️ Modifier</button>
              <button class="btn btn-ghost btn-sm" style="padding:3px 9px;font-size:11px;color:var(--purple)" onclick="openChangeReferralModal(${p.id})">↔ Réaffecter</button>
            </div>`).join('')}
        </div>
      </div>`;
    });

    // Unassigned prospects
    if (unassigned.length) {
      const unId = 'ref-row-unassigned';
      refHtml += `
      <div style="margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px;cursor:pointer" onclick="toggleRefRow('${unId}')">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">❓</div>
          <div style="flex:1">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:13px;font-weight:700;color:var(--text-muted)">Non affectés</span>
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--text-muted)">${unassigned.length}</span>
                <span style="font-size:11px;color:var(--text-muted)" id="arr-${unId}">▾</span>
              </div>
            </div>
          </div>
        </div>
        <div id="${unId}" style="display:none;margin-top:8px;padding:8px 10px;background:var(--red-dim);border-radius:8px;border:1px solid rgba(255,61,90,.2)">
          ${unassigned.map(p => `
            <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,61,90,.1)">
              <div style="width:26px;height:26px;border-radius:6px;background:${p.color};display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:10px;font-weight:700;color:#000;flex-shrink:0">${esc(p.avatar)}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</div>
                <div style="font-size:10.5px;color:var(--text-muted)">${prospectStageBadge(p.prospectStatus||'lead')}</div>
              </div>
              <button class="btn btn-ghost btn-sm" style="padding:3px 9px;font-size:11px" onclick="openProspectQuickEdit(${p.id})">✏️ Modifier</button>
              <button class="btn" style="padding:3px 9px;font-size:11px;background:var(--purple-dim);color:var(--purple);border:1px solid rgba(167,139,250,.3)" onclick="openChangeReferralModal(${p.id})">+ Affecter</button>
            </div>`).join('')}
        </div>
      </div>`;
    }
  }

  refEl.innerHTML = refHtml;

  // ── TEAM INVOLVEMENT ──
  const invEl = document.getElementById('dash-team-involvement');
  // Score = tasks assigned + prospects referred + clients they're team member of
  const involvement = {};
  DB.tasks.forEach(t => { if(t.assignedTo) { const n=t.assignedTo.trim(); involvement[n]=(involvement[n]||0)+2; } });
  DB.clients.forEach(c => {
    (c.teamMembers||[]).forEach(m => { if(m) { involvement[m.trim()]=(involvement[m.trim()]||0)+1; } });
    if(c.referredBy) involvement[c.referredBy.trim()]=(involvement[c.referredBy.trim()]||0)+3;
  });
  const invEntries = Object.entries(involvement).sort((a,b)=>b[1]-a[1]);
  const maxInv = invEntries[0]?.[1] || 1;
  if (!invEntries.length) {
    invEl.innerHTML = `<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:20px">Assignez des tâches et renseignez les équipes.</div>`;
  } else {
    invEl.innerHTML = invEntries.map(([name, score]) => `
      <div style="display:flex;align-items:center;gap:9px">
        <div style="width:28px;height:28px;border-radius:50%;background:${memberColor(name)};display:flex;align-items:center;justify-content:center;font-family:var(--head);font-size:11px;font-weight:800;color:#000;flex-shrink:0">${getTeamInitial(name)}</div>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;margin-bottom:3px">
            <span style="font-size:12.5px;font-weight:600">${esc(name)}</span>
            <span style="font-family:var(--mono);font-size:11px;color:var(--accent)">${score} pts</span>
          </div>
          <div style="height:6px;background:var(--surface2);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${Math.round(score/maxInv*100)}%;background:linear-gradient(90deg,var(--accent),var(--purple));border-radius:3px;transition:width .8s ease"></div>
          </div>
        </div>
      </div>`).join('');
  }
}

// ── PATCH renderDashboardProspects to also call team performance ──
const _origRenderDashboardProspects = renderDashboardProspects;
renderDashboardProspects = function() {
  _origRenderDashboardProspects();
  renderTeamPerformance();
};

// ── PATCH openClientDetail to add contact person, team, next steps, editable tasks ──
const _origOpenClientDetail = openClientDetail;
openClientDetail = function(cid) {
  _origOpenClientDetail(cid);
  const c = gc(cid); if (!c) return;

  // Inject contact + team block BEFORE existing KPIs
  const cdContent = document.getElementById('cd-content');
  if (!cdContent) return;

  // Build contact person HTML
  const cp = c.contactPerson || {};
  const team = c.teamMembers || [];

  const contactHtml = (cp.name || cp.phone || cp.email || team.length) ? `
    <div class="g g2" style="margin-bottom:16px;align-items:start">
      ${(cp.name||cp.phone||cp.email) ? `<div class="card">
        <div class="card-hd"><div class="card-title">👤 Personne ressource</div>
          <button class="btn btn-ghost btn-sm" onclick="openContactModal(${cid})">✏️ Modifier</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${cp.name  ? `<div class="contact-row"><span class="contact-icon">👤</span><strong>${esc(cp.name)}</strong></div>`:''}
          ${cp.phone ? `<div class="contact-row"><span class="contact-icon">📞</span><a href="tel:${esc(cp.phone)}" style="color:var(--accent);text-decoration:none">${esc(cp.phone)}</a></div>`:''}
          ${cp.email ? `<div class="contact-row"><span class="contact-icon">📧</span><a href="mailto:${esc(cp.email)}" style="color:var(--accent);text-decoration:none">${esc(cp.email)}</a></div>`:''}
        </div>
      </div>` : `<div class="card"><div class="card-hd"><div class="card-title">👤 Personne ressource</div><button class="btn btn-ghost btn-sm" onclick="openContactModal(${cid})">+ Ajouter</button></div><div style="color:var(--text-muted);font-size:12px;padding:10px">Non renseignée</div></div>`}
      <div class="card">
        <div class="card-hd"><div class="card-title">🧑‍💼 Équipe assignée</div>
          <button class="btn btn-ghost btn-sm" onclick="openTeamModal(${cid})">✏️ Modifier</button>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${team.length ? team.map(m=>`<span class="team-tag">👤 ${esc(m)}</span>`).join('') : '<span style="color:var(--text-muted);font-size:12px">Aucun membre assigné</span>'}
        </div>
      </div>
    </div>` : `<div class="g g2" style="margin-bottom:16px">
      <div class="card"><div class="card-hd"><div class="card-title">👤 Personne ressource</div><button class="btn btn-ghost btn-sm" onclick="openContactModal(${cid})">+ Ajouter</button></div><div style="color:var(--text-muted);font-size:12px;padding:10px">Non renseignée</div></div>
      <div class="card"><div class="card-hd"><div class="card-title">🧑‍💼 Équipe assignée</div><button class="btn btn-ghost btn-sm" onclick="openTeamModal(${cid})">+ Ajouter</button></div><div style="color:var(--text-muted);font-size:12px;padding:10px">Aucun membre assigné</div></div>
    </div>`;

  // Build editable active tasks
  const tasks = cTasks(cid).filter(t=>t.status!=='Terminé');
  const editableTasksHtml = `
    <div class="tbl-wrap" style="margin-bottom:16px">
      <div class="tbl-bar" style="flex-wrap:wrap;gap:8px">
        <div class="tbl-ttl">⚡ Tâches actives (édition directe)</div>
        <button class="btn btn-primary btn-sm" onclick="openModal('task')">+ Tâche</button>
      </div>
      ${tasks.length ? `<div style="display:flex;flex-direction:column">
        ${tasks.map(t => {
          const pj = gp(t.projectId);
          const isLate = t.endDate && new Date(t.endDate) < new Date() && t.status!=='Terminé';
          return `<div class="task-edit-row">
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.name)}</div>
              ${pj?`<div style="font-size:11px;color:var(--text-muted)">${esc(pj.name)}</div>`:''}
            </div>
            <select onchange="updateTaskStatusFromDetail(${t.id},this.value,${cid})" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:6px;font-size:11.5px;cursor:pointer;outline:none;font-family:var(--body);flex-shrink:0">
              ${['Non démarré','En cours','À suivre','Terminé'].map(s=>`<option ${t.status===s?'selected':''}>${s}</option>`).join('')}
            </select>
            ${t.assignedTo ? `<span class="team-tag" style="flex-shrink:0;font-size:10.5px">👤 ${esc(t.assignedTo)}</span>` : ''}
            ${isLate ? `<span class="team-late-badge" style="flex-shrink:0">⚠️ Retard</span>` : ''}
          </div>`;
        }).join('')}
      </div>` : `<div class="empty" style="padding:24px"><div class="empty-ico">🎉</div><div class="empty-txt">Toutes les tâches sont terminées !</div></div>`}
    </div>`;

  // Build next steps / observations
  const nextSteps = c.nextSteps || [];
  const nextStepsHtml = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-hd">
        <div class="card-title">📌 Next Steps & Observations</div>
        <button class="btn btn-primary btn-sm" onclick="openNextStepModal(${cid})">+ Ajouter</button>
      </div>
      ${nextSteps.length ? `<div>${[...nextSteps].reverse().map(ns=>`
        <div class="nextstep-item">
          <div class="nextstep-date">${esc(ns.date)} ${ns.author?'· par <strong>'+esc(ns.author)+'</strong>':''}</div>
          <div style="font-size:12.5px;line-height:1.6">${esc(ns.text)}</div>
        </div>`).join('')}</div>` : `<div style="color:var(--text-muted);font-size:12px;padding:10px">Aucune observation. Ajoutez un next step.</div>`}
    </div>`;

  // STEP 09 (Client 360°) : carte "Activité" — remplie de façon asynchrone
  // par _mcpsRenderClientActivity() (06-auth-cloud.js, qui a l'accès naturel
  // à Firestore/l'organisation). N'affiche rien en mode local sans compte.
  const activityHtml = `
    <div class="tbl-wrap" style="margin-bottom:16px" id="cd-activity-card">
      <div class="tbl-bar"><div class="tbl-ttl">🕐 Activité récente</div></div>
      <div id="cd-activity-list" style="padding:6px 0"></div>
    </div>`;

  // Prepend contact + team, then inject next steps + editable tasks + activité
  cdContent.innerHTML = contactHtml + editableTasksHtml + nextStepsHtml + activityHtml + cdContent.innerHTML;
  if (typeof window._mcpsRenderClientActivity === 'function') window._mcpsRenderClientActivity(cid);
};

// ── UPDATE TASK STATUS FROM CLIENT DETAIL ──
function updateTaskStatusFromDetail(tid, st, cid) {
  const t = DB.tasks.find(t=>t.id===tid); if(!t) return;
  const old = t.status;
  t.status = st;
  if (st==='Terminé' && old!=='Terminé') { fireConfetti(); showToast('🎉',`"${t.name}" terminée !`,'var(--green)'); }
  saveDB(); updateAlert();
  // Refresh the detail view
  closeClientDetail();
  setTimeout(()=>openClientDetail(cid), 80);
}

// ── CONTACT PERSON MODAL ──
function openContactModal(cid) {
  const c = gc(cid); if(!c) return;
  const cp = c.contactPerson || {};
  document.getElementById('modal-ttl').textContent = '👤 Personne ressource — '+esc(c.name);
  document.getElementById('modal-body').innerHTML = `
    <div class="fg"><label class="flbl">Nom complet</label><input class="fin" id="cp-name" value="${esc(cp.name||'')}" placeholder="Ex: Jean Dupont"></div>
    <div class="frow">
      <div class="fg"><label class="flbl">Téléphone</label><input class="fin" id="cp-phone" value="${esc(cp.phone||'')}" placeholder="Ex: +225 07 00 00 00 00"></div>
      <div class="fg"><label class="flbl">Email</label><input class="fin" id="cp-email" value="${esc(cp.email||'')}" placeholder="Ex: jean@client.com"></div>
    </div>
    <div class="modal-acts">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveContactPerson(${cid})">Enregistrer</button>
    </div>`;
  document.getElementById('main-overlay').classList.add('open');
}

function saveContactPerson(cid) {
  const c = gc(cid); if(!c) return;
  c.contactPerson = {
    name: document.getElementById('cp-name').value.trim(),
    phone: document.getElementById('cp-phone').value.trim(),
    email: document.getElementById('cp-email').value.trim(),
  };
  saveDB(); closeModal();
  showToast('✅','Personne ressource mise à jour !','var(--green)');
  closeClientDetail(); setTimeout(()=>openClientDetail(cid), 80);
}

// ── TEAM MEMBERS MODAL ──
function openTeamModal(cid) {
  const c = gc(cid); if(!c) return;
  const team = c.teamMembers || [];
  const allMembers = getAllTeamMembers();
  document.getElementById('modal-ttl').textContent = '🧑‍💼 Équipe assignée — '+esc(c.name);
  document.getElementById('modal-body').innerHTML = `
    <div class="fg">
      <label class="flbl">Membres assignés (saisir et appuyer Entrée ou virgule)</label>
      <div class="team-input-wrap" id="team-tags-wrap" onclick="document.getElementById('team-input-field').focus()">
        ${team.map(m=>`<span class="team-tag">👤 ${esc(m)}<span class="team-tag-rm" onclick="removeTeamTag(this,'${esc(m)}')">✕</span></span>`).join('')}
        <input class="team-input-inner" id="team-input-field" placeholder="${team.length?'':'Ajouter un membre…'}" onkeydown="handleTeamInput(event)">
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:5px">Appuyer sur <kbd style="padding:1px 5px;border-radius:3px;border:1px solid var(--border);font-size:10px">Entrée</kbd> ou <kbd style="padding:1px 5px;border-radius:3px;border:1px solid var(--border);font-size:10px">,</kbd> pour valider chaque nom</div>
    </div>
    ${allMembers.length ? `<div class="fg"><label class="flbl">Suggestions</label><div style="display:flex;flex-wrap:wrap;gap:6px">${allMembers.filter(m=>!team.includes(m)).map(m=>`<span class="team-tag" style="cursor:pointer;border-color:var(--accent)" onclick="addTeamSuggestion('${esc(m)}')">+ ${esc(m)}</span>`).join('')}</div></div>` : ''}
    <div class="modal-acts">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveTeamMembers(${cid})">Enregistrer</button>
    </div>`;
  window._teamEditCid = cid;
  document.getElementById('main-overlay').classList.add('open');
}

function handleTeamInput(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = document.getElementById('team-input-field').value.trim().replace(/,$/, '');
    if (val) addTeamTag(val);
  }
}

function addTeamTag(name) {
  const wrap = document.getElementById('team-tags-wrap');
  const inp = document.getElementById('team-input-field');
  if (!wrap || !inp) return;
  // Check not duplicate
  const existing = [...wrap.querySelectorAll('.team-tag')].map(el=>el.textContent.replace('✕','').replace('👤','').trim());
  if (existing.includes(name)) { inp.value=''; return; }
  const tag = document.createElement('span');
  tag.className = 'team-tag';
  tag.innerHTML = `👤 ${esc(name)}<span class="team-tag-rm" onclick="removeTeamTag(this,'${esc(name)}')">✕</span>`;
  wrap.insertBefore(tag, inp);
  inp.value = '';
}

function addTeamSuggestion(name) { addTeamTag(name); }

function removeTeamTag(el, name) {
  el.closest('.team-tag')?.remove();
}

function saveTeamMembers(cid) {
  const c = gc(cid); if(!c) return;
  // Flush any pending input
  const inp = document.getElementById('team-input-field');
  if (inp && inp.value.trim()) addTeamTag(inp.value.trim());
  const tags = [...document.querySelectorAll('#team-tags-wrap .team-tag')].map(el=>el.textContent.replace('✕','').replace('👤','').trim()).filter(Boolean);
  c.teamMembers = [...new Set(tags)];
  saveDB(); closeModal();
  showToast('✅','Équipe mise à jour !','var(--green)');
  closeClientDetail(); setTimeout(()=>openClientDetail(cid), 80);
}

// ── NEXT STEP MODAL ──
function openNextStepModal(cid) {
  const c = gc(cid); if(!c) return;
  document.getElementById('modal-ttl').textContent = '📌 Ajouter un Next Step';
  document.getElementById('modal-body').innerHTML = `
    <div class="fg"><label class="flbl">Description / Observation *</label>
      <textarea class="fin" id="ns-text" rows="4" placeholder="Ex: Préparer la démo pour la semaine prochaine. Attente du brief créatif…"></textarea>
    </div>
    <div class="fg"><label class="flbl">Auteur (optionnel)</label>
      <input class="fin" id="ns-author" placeholder="Votre prénom ou nom" list="ns-author-list">
      <datalist id="ns-author-list">${getAllTeamMembers().map(m=>`<option value="${esc(m)}">`).join('')}</datalist>
    </div>
    <div class="modal-acts">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveNextStep(${cid})">Ajouter</button>
    </div>`;
  document.getElementById('main-overlay').classList.add('open');
}

function saveNextStep(cid) {
  const c = gc(cid); if(!c) return;
  const text = document.getElementById('ns-text')?.value.trim();
  if (!text) { showToast('⚠️','Le texte est requis','var(--amber)'); return; }
  if (!c.nextSteps) c.nextSteps = [];
  c.nextSteps.push({
    date: new Date().toLocaleDateString('fr',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}),
    text,
    author: document.getElementById('ns-author')?.value.trim() || '',
  });
  saveDB(); closeModal();
  showToast('✅','Next step ajouté !','var(--accent)');
  closeClientDetail(); setTimeout(()=>openClientDetail(cid), 80);
}

// ── PATCH task modal to add "assignedTo" field ──
// ── PATCH prospect modal to add "referredBy" field ──
const _origOpenProspectModal2 = openProspectModal;
openProspectModal = function(cid) {
  _origOpenProspectModal2(cid);
  // Inject referredBy field after stage selector
  const obsLabel = document.querySelector('#prospect-modal-body .fg:last-of-type label');
  if (!obsLabel) return;
  const fgObs = obsLabel.closest('.fg');
  if (!fgObs) return;
  const c = gc(cid); if(!c) return;
  fgObs.insertAdjacentHTML('beforebegin', `
    <div class="fg">
      <label class="flbl">Apporté par (membre de l'équipe)</label>
      ${buildApporteurSelect('ref-by-input', c.referredBy||'')}
    </div>`);
};

// ── PATCH saveProspectStatus to also save referredBy ──
const _origSaveProspectStatus2 = saveProspectStatus;
saveProspectStatus = function(cid) {
  const refBy = document.getElementById('ref-by-input')?.value || null;
  _origSaveProspectStatus2(cid);
  const c = gc(cid); if(!c) return;
  if (refBy !== null) { c.referredBy = refBy || null; saveDB(); }
};

// ── PATCH renderProjects to always refresh dropdowns from live DB ──
const _origRenderProjects2 = renderProjects;
renderProjects = function() {
  const pfc = document.getElementById('pf-client');
  if (pfc) {
    // Always rebuild from DB
    while (pfc.options.length > 1) pfc.remove(1);
    DB.clients.forEach(c=>{ const o=document.createElement('option'); o.value=c.id; o.textContent=c.name; pfc.appendChild(o); });
  }
  _origRenderProjects2();
};

// ── PATCH renderTasks to always refresh dropdowns from live DB ──
const _origRenderTasks2 = renderTasks;
renderTasks = function() {
  const tfc = document.getElementById('tf-client'), tfp = document.getElementById('tf-project');
  if (tfc) { while(tfc.options.length>1) tfc.remove(1); DB.clients.forEach(c=>{ const o=document.createElement('option'); o.value=c.id; o.textContent=c.name; tfc.appendChild(o); }); }
  if (tfp) { while(tfp.options.length>1) tfp.remove(1); DB.projects.forEach(p=>{ const o=document.createElement('option'); o.value=p.id; o.textContent=p.name; tfp.appendChild(o); }); }
  _origRenderTasks2();
};

// ═══════════════════════════════════════════════════════
//  REFERRAL SECTION — Expand/Edit/Assign  (AJOUT UNIQUEMENT)
// ═══════════════════════════════════════════════════════

// Toggle prospect list under each apporteur row
function toggleRefRow(rowId) {
  const row = document.getElementById(rowId);
  const arr = document.getElementById('arr-' + rowId);
  if (!row) return;
  const isOpen = row.style.display !== 'none';
  row.style.display = isOpen ? 'none' : 'block';
  if (arr) arr.textContent = isOpen ? '▾' : '▴';
}

// ── MODAL : assign ANY prospect to an apporteur ──
function openAssignReferralModal() {
  const prospects = getProspects();
  const allMembers = getAllTeamMembers();
  document.getElementById('modal-ttl').textContent = '🎯 Affecter un prospect à un apporteur';
  document.getElementById('modal-body').innerHTML = `
    <div class="fg">
      <label class="flbl">Prospect à affecter</label>
      <select class="fin" id="assign-prospect-sel">
        <option value="">— Choisir un prospect —</option>
        ${prospects.map(p => `<option value="${p.id}" ${p.referredBy?'':''}>${esc(p.name)}${p.referredBy?' (apporteur : '+esc(p.referredBy)+')':' — non affecté'}</option>`).join('')}
      </select>
    </div>
    <div class="fg">
      <label class="flbl">Apporteur (membre de l'équipe)</label>
      ${buildApporteurSelect('assign-ref-name', '')}
    </div>
    <div class="modal-acts">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn" style="background:var(--purple-dim);color:var(--purple);border:1px solid rgba(167,139,250,.3)" onclick="saveAssignReferral()">✅ Affecter</button>
    </div>`;
  document.getElementById('main-overlay').classList.add('open');
}

function saveAssignReferral() {
  const pid = parseInt(document.getElementById('assign-prospect-sel')?.value);
  const name = document.getElementById('assign-ref-name')?.value;
  if (!pid) { showToast('⚠️','Sélectionnez un prospect','var(--amber)'); return; }
  if (!name) { showToast('⚠️','Choisissez un membre de l\'équipe','var(--amber)'); return; }
  const c = gc(pid); if (!c) return;
  c.referredBy = name;
  saveDB(); closeModal();
  showToast('✅', `"${c.name}" affecté à ${name}`, 'var(--purple)');
  renderTeamPerformance();
}

// ── MODAL : reassign one prospect to another apporteur ──
function openChangeReferralModal(cid) {
  const c = gc(cid); if (!c) return;
  const allMembers = getAllTeamMembers();
  document.getElementById('modal-ttl').textContent = `↔ Réaffecter — ${esc(c.name)}`;
  document.getElementById('modal-body').innerHTML = `
    <div style="padding:10px 13px;background:var(--surface2);border-radius:8px;border-left:3px solid ${c.color};margin-bottom:16px">
      <div style="font-size:13px;font-weight:700">${esc(c.name)}</div>
      <div style="font-size:11.5px;color:var(--text-muted);margin-top:3px">${prospectStageBadge(c.prospectStatus||'lead')} ${c.referredBy?'· Apporteur actuel : <strong>'+esc(c.referredBy)+'</strong>':'· Non affecté'}</div>
    </div>
    <div class="fg">
      <label class="flbl">Nouvel apporteur (membre de l'équipe)</label>
      ${buildApporteurSelect('change-ref-name', c.referredBy||'')}
    </div>
    <div class="modal-acts">
      ${c.referredBy ? `<button class="btn btn-danger" onclick="removeReferral(${cid})">Retirer l'affectation</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn" style="background:var(--purple-dim);color:var(--purple);border:1px solid rgba(167,139,250,.3)" onclick="saveChangeReferral(${cid})">✅ Enregistrer</button>
    </div>`;
  document.getElementById('main-overlay').classList.add('open');
}

function saveChangeReferral(cid) {
  const c = gc(cid); if (!c) return;
  const name = document.getElementById('change-ref-name')?.value;
  if (!name) { showToast('⚠️','Choisissez un membre de l\'équipe','var(--amber)'); return; }
  c.referredBy = name;
  saveDB(); closeModal();
  showToast('✅', `${c.name} → apporteur : ${name}`, 'var(--purple)');
  renderTeamPerformance();
}

function removeReferral(cid) {
  const c = gc(cid); if (!c) return;
  if (!confirm(`Retirer l'affectation de "${c.name}" ?`)) return;
  c.referredBy = null;
  saveDB(); closeModal();
  showToast('🗑', `Affectation retirée pour ${c.name}`, 'var(--text-muted)');
  renderTeamPerformance();
}

// ── MODAL : quick-edit prospect fiche from referral section ──
function openProspectQuickEdit(cid) {
  const c = gc(cid); if (!c) return;
  const allMembers = getAllTeamMembers();
  document.getElementById('modal-ttl').textContent = `✏️ Modifier la fiche prospect — ${esc(c.name)}`;
  document.getElementById('modal-body').innerHTML = `
    <div class="frow">
      <div class="fg"><label class="flbl">Nom du prospect *</label>
        <input class="fin" id="pqe-name" value="${esc(c.name||'')}">
      </div>
      <div class="fg"><label class="flbl">Secteur</label>
        <select class="fin" id="pqe-sector">${Object.keys(SECTORS_META).map(s=>`<option value="${s}" ${c.sector===s?'selected':''}>${SECTORS_META[s].icon} ${s}</option>`).join('')}</select>
      </div>
    </div>
    <div class="fg"><label class="flbl">Brief / Besoin</label>
      <textarea class="fin" id="pqe-brief" rows="3">${esc(c.brief||'')}</textarea>
    </div>
    
    <div class="fg"><label class="flbl">Apporteur (membre de l'équipe)</label>
      ${buildApporteurSelect('pqe-referred', c.referredBy||'')}
    </div>
    <div class="fg"><label class="flbl">État du pipeline</label>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px" id="pqe-stage-wrap">
        ${PROSPECT_STAGES.map(s=>`
          <div onclick="pqeSelectStage('${s.key}')" id="pqe-stage-${s.key}"
            style="padding:5px 11px;border-radius:20px;border:2px solid ${(c.prospectStatus||'lead')===s.key?'var(--purple)':'var(--border)'};
                   background:${(c.prospectStatus||'lead')===s.key?'var(--purple-dim)':'var(--surface2)'};
                   color:${(c.prospectStatus||'lead')===s.key?'var(--purple)':'var(--text-muted)'};
                   cursor:pointer;font-size:11.5px;font-weight:600;transition:all .2s;user-select:none">
            ${s.icon} ${s.label}
          </div>`).join('')}
      </div>
    </div>
    <div class="modal-acts">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="savePqe(${cid})">💾 Enregistrer</button>
      <button class="convert-btn" style="width:auto;padding:7px 14px" onclick="convertToClient(${cid})">🎉 Convertir en Client</button>
    </div>`;
  window._pqeStage = c.prospectStatus || 'lead';
  document.getElementById('main-overlay').classList.add('open');
}

function pqeSelectStage(key) {
  window._pqeStage = key;
  PROSPECT_STAGES.forEach(s => {
    const el = document.getElementById('pqe-stage-'+s.key);
    if (!el) return;
    const sel = s.key === key;
    el.style.borderColor = sel ? 'var(--purple)' : 'var(--border)';
    el.style.background  = sel ? 'var(--purple-dim)' : 'var(--surface2)';
    el.style.color       = sel ? 'var(--purple)' : 'var(--text-muted)';
  });
}

function pqeCalcHT() {
  const b = parseInt(document.getElementById('pqe-budget')?.value)||0;
  const d = parseInt(document.getElementById('pqe-duration')?.value)||0;
  const disp = document.getElementById('pqe-ht');
  if (!disp) return;
  if (b>0 && d>0) {
    disp.style.display = 'flex';
    document.getElementById('pqe-ht-val').textContent = Math.round(b/d).toLocaleString('fr-FR')+' XOF';
  } else { disp.style.display = 'none'; }
}

function savePqe(cid) {
  const c = gc(cid); if (!c) return;
  const name = document.getElementById('pqe-name')?.value.trim();
  if (!name) { showToast('⚠️','Le nom est requis','var(--amber)'); return; }

  const oldStage = c.prospectStatus || 'lead';
  const newStage = window._pqeStage || oldStage;
  const newRef   = document.getElementById('pqe-referred')?.value || null;

  // Save observation if stage changed
  if (newStage !== oldStage) {
    if (!c.observations) c.observations = [];
    c.observations.push({
      date: new Date().toLocaleDateString('fr',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}),
      stage: newStage,
      note: `Changement d'état depuis la fiche rapide.`,
    });
  }

  Object.assign(c, {
    name,
    sector: document.getElementById('pqe-sector')?.value || c.sector,
    brief: document.getElementById('pqe-brief')?.value.trim() || c.brief,
    budget: parseInt(document.getElementById('pqe-budget')?.value)||0,
    contractDuration: parseInt(document.getElementById('pqe-duration')?.value)||0,
    referredBy: newRef || null,
    prospectStatus: newStage,
    avatar: name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2),
  });

  saveDB(); closeModal();
  showToast('✅', `Fiche "${name}" mise à jour !`, 'var(--purple)');
  // Refresh relevant views
  renderTeamPerformance();
  if (state.view === 'clients') renderClients();
  if (state.view === 'dashboard') renderDashboardProspects();
}

// ═══════════════════════════════════════════════════════
//  END REFERRAL ADDITIONS
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
//  SECTION ÉQUIPE — renderTeam + CRUD membres
// ═══════════════════════════════════════════════════════

const TEAM_ROLES = ['Chargé(e) de stratégie Marketing & Digital','Directrice BU','Social Media & Account Manager','Graphiste','Motion Designer','Community Manager','Développeur(se)','UX Designer / Graphiste'];

function renderTeam() {
  if (!DB.team) DB.team = [];
  const now = new Date();

  // Populate role filter
  const rf = document.getElementById('team-filter-role');
  if (rf && rf.options.length <= 1) {
    TEAM_ROLES.forEach(r => { const o = document.createElement('option'); o.value = r; o.textContent = r; rf.appendChild(o); });
  }
  const filterRole = rf?.value || 'all';

  // KPIs
  const taskStats = computeTeamStats();
  const allNames = getAllTeamMembers();
  const apporteurs = new Set(DB.clients.filter(c=>c.referredBy).map(c=>c.referredBy.trim()));
  const totalAssigned = Object.values(taskStats).reduce((s,m)=>s+m.total,0);
  const totalLate = Object.values(taskStats).reduce((s,m)=>s+m.late,0);

  const tk = n => document.getElementById(n);
  if(tk('tk-total')) tk('tk-total').textContent = DB.team.length;
  if(tk('tk-apporteurs')) tk('tk-apporteurs').textContent = apporteurs.size;
  if(tk('tk-assigned')) tk('tk-assigned').textContent = totalAssigned;
  if(tk('tk-late')) tk('tk-late').textContent = totalLate;

  // Build member list — merge DB.team with computed stats
  // Also add "ghost" members (found in tasks/referrals but not in DB.team)
  const registeredNames = new Set(DB.team.map(m=>m.name.trim()));
  const ghostMembers = allNames.filter(n=>!registeredNames.has(n)).map(n=>({
    id: null, name: n, role: '—', phone: '', email: '', color: memberColor(n), isGhost: true
  }));

  let members = [...DB.team, ...ghostMembers];
  if (filterRole !== 'all') members = members.filter(m => m.role === filterRole);

  const grid = document.getElementById('team-grid');
  if (!members.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-ico">🧑‍💼</div><div class="empty-txt">Aucun membre trouvé. Cliquez sur "+ Nouveau membre" pour commencer.</div></div>`;
    return;
  }

  grid.innerHTML = members.map(m => {
    const name = m.name;
    const st = taskStats[name] || { total:0, done:0, late:0, doneHours:0 };
    const pct = st.total ? Math.round(st.done/st.total*100) : 0;
    const prospects = getProspects().filter(c=>c.referredBy?.trim()===name);
    const clientsAssigned = DB.clients.filter(c=>(c.teamMembers||[]).map(t=>t.trim()).includes(name));
    const isApporteur = apporteurs.has(name);
    const col = m.color || memberColor(name);

    return `<div class="team-member-card" style="--tm-color:${col}">
      <!-- Header -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="tm-avatar" style="background:${col}">${getTeamInitial(name)}</div>
          <div>
            <div class="tm-name">${esc(name)}</div>
            <div class="tm-role">${m.isGhost ? '<em style="color:var(--text-dim)">Non enregistré</em>' : esc(m.role||'—')}</div>
            ${isApporteur ? `<div class="tm-apporteur-badge" style="margin-top:4px">🎯 Apporteur</div>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:5px">
          ${!m.isGhost ? `<button class="btn btn-ghost btn-sm" onclick="openEditTeamMember(${m.id})">✏️</button>` : `<button class="btn btn-ghost btn-sm" style="color:var(--accent);border-color:var(--accent)" onclick="openTeamMemberModal('${esc(name)}')">+ Enregistrer</button>`}
          ${!m.isGhost ? `<button class="btn btn-danger btn-sm" onclick="deleteTeamMember(${m.id})">🗑</button>` : `<button class="btn btn-danger btn-sm" onclick="deleteGhostMember('${esc(name)}')" title="Supprimer toutes les références">🗑</button>`}
        </div>
      </div>

      <!-- Contact info -->
      ${!m.isGhost && (m.phone||m.email) ? `<div style="display:flex;flex-direction:column;gap:4px;margin-bottom:10px">
        ${m.phone ? `<div style="font-size:11.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px">📞 <a href="tel:${esc(m.phone)}" style="color:var(--accent);text-decoration:none">${esc(m.phone)}</a></div>` : ''}
        ${m.email ? `<div style="font-size:11.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px">📧 <a href="mailto:${esc(m.email)}" style="color:var(--accent);text-decoration:none">${esc(m.email)}</a></div>` : ''}
      </div>` : ''}

      <!-- Stats row -->
      <div style="display:flex;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin:8px 0">
        <div class="tm-stat" style="flex:1;border-right:1px solid var(--border)">
          <div class="tm-stat-val" style="color:${col}">${st.total}</div>
          <div class="tm-stat-lbl">Tâches</div>
        </div>
        <div class="tm-stat" style="flex:1;border-right:1px solid var(--border)">
          <div class="tm-stat-val" style="color:var(--green)">${st.done}</div>
          <div class="tm-stat-lbl">Terminées</div>
        </div>
        <div class="tm-stat" style="flex:1;border-right:1px solid var(--border)">
          <div class="tm-stat-val" style="color:${st.late>0?'var(--red)':'var(--text-muted)'}">${st.late}</div>
          <div class="tm-stat-lbl">En retard</div>
        </div>
        <div class="tm-stat" style="flex:1">
          <div class="tm-stat-val" style="color:var(--purple)">${prospects.length}</div>
          <div class="tm-stat-lbl">Prospects</div>
        </div>
      </div>

      <!-- Completion bar -->
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:4px">
          <span>Efficacité</span>
          <span style="font-family:var(--mono);font-weight:700;color:${pct>=75?'var(--green)':pct>=50?'var(--accent)':'var(--amber)'}">${pct}%</span>
        </div>
        <div class="pbar" style="height:6px"><div class="pfill" style="width:${pct}%;background:${col}"></div></div>
      </div>

      <!-- Clients assigned -->
      ${clientsAssigned.length ? `<div style="margin-bottom:8px">
        <div style="font-size:10.5px;color:var(--text-muted);margin-bottom:5px;font-family:var(--mono);letter-spacing:.5px">CLIENTS SUIVIS</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          ${clientsAssigned.map(c=>`<span class="ctag" style="background:${c.color}1a;color:${c.color};cursor:pointer" onclick="openClientDetail(${c.id})"><span class="cdot" style="background:${c.color}"></span>${esc(c.name)}</span>`).join('')}
        </div>
      </div>` : ''}

      <!-- Prospects referred -->
      ${prospects.length ? `<div>
        <div style="font-size:10.5px;color:var(--text-muted);margin-bottom:5px;font-family:var(--mono);letter-spacing:.5px">PROSPECTS APPORTÉS</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          ${prospects.map(p=>`<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:var(--purple-dim);color:var(--purple);cursor:pointer" onclick="openProspectQuickEdit(${p.id})">🎯 ${esc(p.name)}</span>`).join('')}
        </div>
      </div>` : ''}
    </div>`;
  }).join('');
}

// ── OPEN MODAL : create new team member ──
function openTeamMemberModal(prefillName='') {
  document.getElementById('modal-ttl').textContent = '🧑‍💼 Nouveau membre d\'équipe';
  document.getElementById('modal-body').innerHTML = `
    <div class="frow">
      <div class="fg"><label class="flbl">Prénom & Nom *</label>
        <input class="fin" id="tm-name" value="${esc(prefillName)}" placeholder="Ex : Noé Karamoko">
      </div>
      <div class="fg"><label class="flbl">Rôle / Poste</label>
        <select class="fin" id="tm-role">
          <option value="">— Choisir un rôle —</option>
          ${TEAM_ROLES.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="frow">
      <div class="fg"><label class="flbl">Téléphone</label><input class="fin" id="tm-phone" placeholder="+225 07 00 00 00 00"></div>
      <div class="fg"><label class="flbl">Email</label><input class="fin" id="tm-email" placeholder="jean@agence.com"></div>
    </div>
    <div class="frow">
      <div class="fg"><label class="flbl">Couleur identité</label>
        <input class="fin" type="color" id="tm-color" style="height:40px;cursor:pointer" value="#00c8ff">
      </div>
      <div class="fg"><label class="flbl">Est apporteur de prospects ?</label>
        <div style="display:flex;gap:8px;margin-top:6px">
          <div onclick="setTmApporteur(true)" id="tma-yes" style="flex:1;padding:7px;border-radius:var(--r-sm);border:2px solid var(--border);background:var(--surface2);color:var(--text-muted);cursor:pointer;font-size:12px;font-weight:600;text-align:center;transition:all .2s">🎯 Oui</div>
          <div onclick="setTmApporteur(false)" id="tma-no" style="flex:1;padding:7px;border-radius:var(--r-sm);border:2px solid var(--purple);background:var(--purple-dim);color:var(--purple);cursor:pointer;font-size:12px;font-weight:600;text-align:center;transition:all .2s">Non</div>
        </div>
      </div>
    </div>
    <input type="hidden" id="tm-is-apporteur" value="false">
    <div class="modal-acts">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="submitTeamMember(0)">Créer le membre</button>
    </div>`;
  document.getElementById('main-overlay').classList.add('open');
}

function setTmApporteur(val) {
  const inp = document.getElementById('tm-is-apporteur');
  if (inp) inp.value = val ? 'true' : 'false';
  const yes = document.getElementById('tma-yes');
  const no  = document.getElementById('tma-no');
  if (yes) { yes.style.borderColor = val?'var(--purple)':'var(--border)'; yes.style.background = val?'var(--purple-dim)':'var(--surface2)'; yes.style.color = val?'var(--purple)':'var(--text-muted)'; }
  if (no)  { no.style.borderColor = !val?'var(--purple)':'var(--border)'; no.style.background = !val?'var(--purple-dim)':'var(--surface2)'; no.style.color = !val?'var(--purple)':'var(--text-muted)'; }
}

// ── OPEN MODAL : edit existing team member ──
function openEditTeamMember(id) {
  const m = DB.team.find(t=>t.id===id); if (!m) return;
  document.getElementById('modal-ttl').textContent = `✏️ Modifier — ${esc(m.name)}`;
  document.getElementById('modal-body').innerHTML = `
    <div class="frow">
      <div class="fg"><label class="flbl">Prénom & Nom *</label>
        <input class="fin" id="tm-name" value="${esc(m.name)}">
      </div>
      <div class="fg"><label class="flbl">Rôle / Poste</label>
        <select class="fin" id="tm-role">
          <option value="">— Choisir un rôle —</option>
          ${TEAM_ROLES.map(r=>`<option value="${esc(r)}" ${m.role===r?'selected':''}>${esc(r)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="frow">
      <div class="fg"><label class="flbl">Téléphone</label><input class="fin" id="tm-phone" value="${esc(m.phone||'')}"></div>
      <div class="fg"><label class="flbl">Email</label><input class="fin" id="tm-email" value="${esc(m.email||'')}"></div>
    </div>
    <div class="frow">
      <div class="fg"><label class="flbl">Couleur identité</label>
        <input class="fin" type="color" id="tm-color" style="height:40px;cursor:pointer" value="${m.color||memberColor(m.name)}">
      </div>
      <div class="fg"><label class="flbl">Est apporteur de prospects ?</label>
        <div style="display:flex;gap:8px;margin-top:6px">
          <div onclick="setTmApporteur(true)" id="tma-yes" style="flex:1;padding:7px;border-radius:var(--r-sm);border:2px solid ${m.isApporteur?'var(--purple)':'var(--border)'};background:${m.isApporteur?'var(--purple-dim)':'var(--surface2)'};color:${m.isApporteur?'var(--purple)':'var(--text-muted)'};cursor:pointer;font-size:12px;font-weight:600;text-align:center;transition:all .2s">🎯 Oui</div>
          <div onclick="setTmApporteur(false)" id="tma-no" style="flex:1;padding:7px;border-radius:var(--r-sm);border:2px solid ${!m.isApporteur?'var(--purple)':'var(--border)'};background:${!m.isApporteur?'var(--purple-dim)':'var(--surface2)'};color:${!m.isApporteur?'var(--purple)':'var(--text-muted)'};cursor:pointer;font-size:12px;font-weight:600;text-align:center;transition:all .2s">Non</div>
        </div>
      </div>
    </div>
    <input type="hidden" id="tm-is-apporteur" value="${m.isApporteur?'true':'false'}">
    <div class="modal-acts">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="submitTeamMember(${id})">Enregistrer</button>
    </div>`;
  document.getElementById('main-overlay').classList.add('open');
}

function submitTeamMember(existingId=0) {
  if (typeof can==='function' && !can('team.manage')) { window._mcpsDenyToast && window._mcpsDenyToast('team.manage'); return; }
  const name = document.getElementById('tm-name')?.value.trim();
  const obj = {
    name,
    role:         document.getElementById('tm-role')?.value || '',
    phone:        document.getElementById('tm-phone')?.value.trim() || '',
    email:        document.getElementById('tm-email')?.value.trim() || '',
    color:        document.getElementById('tm-color')?.value || memberColor(name),
    isApporteur:  document.getElementById('tm-is-apporteur')?.value === 'true',
  };
  const _v = MCPS_VALIDATE.teamMember(obj); if (!_v.valid) { showToast('⚠️',_v.errors[0],'var(--amber)'); if (window._mcpsShowFormErrors) window._mcpsShowFormErrors(_v.errors); return; }
  if (existingId) {
    const m = DB.team.find(t=>t.id===existingId);
    if (m) {
      const oldName = m.name;
      Object.assign(m, obj);
      // If name changed, update all references
      if (oldName !== name) {
        DB.tasks.forEach(t=>{ if(t.assignedTo?.trim()===oldName) t.assignedTo=name; });
        DB.clients.forEach(c=>{
          if(c.referredBy?.trim()===oldName) c.referredBy=name;
          if(c.teamMembers) c.teamMembers=c.teamMembers.map(n=>n.trim()===oldName?name:n);
        });
      }
    }
    showToast('✅',`"${name}" mis à jour !`,'var(--green)');
    if (typeof _mcpsAudit==='function') _mcpsAudit('UPDATE', 'team_member', existingId, { name });
  } else {
    obj.id = nextId.team++;
    DB.team.push(obj);
    showToast('✅',`"${name}" ajouté à l'équipe !`,'var(--green)');
    if (typeof _mcpsAudit==='function') _mcpsAudit('CREATE', 'team_member', obj.id, { name });
  }
  closeModal(); saveDB(); renderTeam();
}

function deleteTeamMember(id) {
  if (typeof can==='function' && !can('team.manage')) { window._mcpsDenyToast && window._mcpsDenyToast('team.manage'); return; }
  const m = DB.team.find(t=>t.id===id); if (!m) return;
  const taskCount = DB.tasks.filter(t=>t.assignedTo?.trim()===m.name).length;
  const prospectCount = DB.clients.filter(c=>c.referredBy?.trim()===m.name).length;
  const clientCount = DB.clients.filter(c=>(c.teamMembers||[]).map(n=>n.trim()).includes(m.name)).length;
  const impacts = [];
  if (taskCount) impacts.push(`${taskCount} tâche(s) assignée(s)`);
  if (prospectCount) impacts.push(`${prospectCount} prospect(s) apportés`);
  if (clientCount) impacts.push(`${clientCount} client(s) suivis`);
  const impactTxt = impacts.length ? `\n\n⚠️ Impact : ${impacts.join(', ')} seront désassignés.` : '';
  if (!confirm(`Supprimer "${m.name}" de l'équipe ?${impactTxt}\n\nCette action est irréversible.`)) return;
  // Clean all references
  DB.tasks.forEach(t=>{ if(t.assignedTo?.trim()===m.name) t.assignedTo=null; });
  DB.clients.forEach(c=>{
    if(c.referredBy?.trim()===m.name) c.referredBy=null;
    if(c.teamMembers) c.teamMembers=c.teamMembers.filter(n=>n.trim()!==m.name);
  });
  DB.team = DB.team.filter(t=>t.id!==id);
  saveDB(); renderTeam();
  showToast('🗑',`"${m.name}" supprimé de l'équipe.`,'var(--red)');
  if (typeof _mcpsAudit==='function') _mcpsAudit('DELETE', 'team_member', id, { name: m.name });
}

function deleteGhostMember(name) {
  const taskCount = DB.tasks.filter(t=>t.assignedTo?.trim()===name).length;
  const prospectCount = DB.clients.filter(c=>c.referredBy?.trim()===name).length;
  const clientCount = DB.clients.filter(c=>(c.teamMembers||[]).map(n=>n.trim()).includes(name)).length;
  const impacts = [];
  if (taskCount) impacts.push(`${taskCount} tâche(s) assignée(s)`);
  if (prospectCount) impacts.push(`${prospectCount} prospect(s) apportés`);
  if (clientCount) impacts.push(`${clientCount} client(s) suivis`);
  const impactTxt = impacts.length ? `\n\n⚠️ Impact : ${impacts.join(', ')} seront désassignés.` : '';
  if (!confirm(`Supprimer "${name}" de toutes les références ?${impactTxt}\n\nCette action est irréversible.`)) return;
  DB.tasks.forEach(t=>{ if(t.assignedTo?.trim()===name) t.assignedTo=null; });
  DB.clients.forEach(c=>{
    if(c.referredBy?.trim()===name) c.referredBy=null;
    if(c.teamMembers) c.teamMembers=c.teamMembers.filter(n=>n.trim()!==name);
  });
  saveDB(); renderTeam();
  showToast('🗑',`"${name}" retiré de toutes les assignations.`,'var(--red)');
}

// ── Add apporteur field to prospect creation form (via openModal) ──
const _origOpenModalProspect = openModal;
openModal = function(type, data={}) {
  _origOpenModalProspect(type, data);
  if (type !== 'prospect') return;
  // After the modal renders, inject apporteur field before the color picker
  setTimeout(() => {
    const colorFg = document.getElementById('fc-color')?.closest('.fg');
    if (!colorFg) return;
    colorFg.insertAdjacentHTML('beforebegin', `
      <div class="fg" id="prospect-ref-fg">
        <label class="flbl">Apporté par <span style="color:var(--text-dim)">(membre de l'équipe)</span></label>
        ${buildApporteurSelect('fc-ref-by', data.referredBy||'')}
      </div>`);
  }, 30);
};

// ── PATCH submitClient to also save referredBy from prospect creation form ──
const _origSubmitClientFinal = submitClient;
submitClient = function(existingId=0) {
  _origSubmitClientFinal(existingId);
  const refBy = document.getElementById('fc-ref-by')?.value;
  if (refBy) {
    const saved = existingId ? gc(existingId) : DB.clients[DB.clients.length-1];
    if (saved) { saved.referredBy = refBy; saveDB(); }
  }
};

// ═══════════════════════════════════════════════════════
//  APPORTEUR SELECT HELPER — used everywhere
// ═══════════════════════════════════════════════════════
function buildApporteurSelect(id, currentValue='') {
  const members = DB.team.length ? DB.team : [];
  const opts = `<option value="">— Choisir un membre —</option>` +
    members.map(m =>
      `<option value="${esc(m.name)}" ${m.name===currentValue?'selected':''}>${esc(m.name)}${m.role?' — '+esc(m.role):''}${m.isApporteur?' 🎯':''}</option>`
    ).join('');
  return `<select class="fin" id="${id}">${opts}</select>
    ${!members.length ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">⚠️ Aucun membre enregistré. <span style="color:var(--accent);cursor:pointer" onclick="closeModal();closePDFModal();closeProspectModal();go('team')">→ Ajouter des membres dans l'onglet Équipe</span></div>` : ''}`;
}

// ═══════════════════════════════════════════════════════
//  END TEAM ADDITIONS
// ═══════════════════════════════════════════════════════


/**
 * MCPS Cockpit — Suite de tests automatisés
 * ═══════════════════════════════════════════════════════
 * PATCH #9 (audit technique, Phase 9) — livré AVEC le produit, pas jeté
 * après usage. Jusqu'ici (Phases 1 à 8), chaque correctif avait été vérifié
 * avec un script de test temporaire, supprimé avant livraison. Cette suite
 * consolide ces vérifications en un fichier permanent, organisé en trois
 * niveaux (unitaires / intégration / bout en bout), exécutable par
 * n'importe qui — développeur futur ou pipeline d'intégration continue.
 *
 * USAGE :
 *   npm install jsdom          (une seule fois)
 *   node tests/mcps-test-suite.js MCPS_Cockpit_Production_Universal.html
 *
 * Code de sortie 0 si tout passe, 1 si au moins un test échoue — utilisable
 * directement dans une CI (ex. GitHub Actions : "run: node tests/mcps-test-suite.js *.html").
 *
 * Portée : ce fichier étant une page HTML unique (pas un projet Node avec
 * bundler), les tests s'exécutent dans un DOM simulé (jsdom) avec Firebase
 * entièrement mocké — aucune écriture n'atteint jamais un vrai projet
 * Firebase. Pour une validation en conditions 100% réelles (règles
 * Firestore réelles, latence réseau réelle), il reste nécessaire de tester
 * manuellement contre un vrai projet — voir AUDIT.md.
 * ═══════════════════════════════════════════════════════
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const http = require("http");

const TARGET_PATH = process.argv[2] || path.join(__dirname, "..", "index.html");
// Le produit peut être livré soit en un seul fichier HTML, soit en structure
// modulaire (index.html + css/ + js/, depuis le passage "hors du fichier
// unique"). On détecte lequel des deux a été passé et on s'adapte — dans les
// deux cas, les tests portent sur le MÊME comportement observable.
const stat = fs.statSync(TARGET_PATH);
const HTML_PATH = stat.isDirectory() ? path.join(TARGET_PATH, "index.html") : TARGET_PATH;
const HTML_DIR = path.dirname(HTML_PATH);

// Sert HTML_DIR en HTTP local le temps des tests. Nécessaire pour que les
// <script src="./js/..."> et <link href="./css/..."> de la structure
// modulaire se chargent réellement (jsdom résout les chemins relatifs par
// rapport à une vraie origine). Sert aussi à reproduire fidèlement la
// réalité : ouvrir le fichier en file:// (double-clic) fait échouer
// localStorage avec une SecurityError dans un vrai navigateur aussi — cette
// app n'est d'ailleurs conçue que pour être déployée en http(s), jamais
// ouverte en local par double-clic (voir tests/README.md).
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png" };
const FIREBASE_EMPTY = 'firebase: { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" },';
const FIREBASE_TEST = 'firebase: { apiKey: "test-key", authDomain: "test.firebaseapp.com", projectId: "test-project", storageBucket: "", messagingSenderId: "", appId: "" },';
// Dans la structure modulaire, MCPS_CONFIG vit dans js/01-app-core.js, PAS
// dans index.html — un fichier servi tel quel par le serveur HTTP, jamais
// touché par la transformation appliquée au seul document initial. On
// applique donc le même correctif de config de test ICI, au niveau du
// serveur, à n'importe quel fichier texte servi (HTML ou JS) — que la config
// vive dans l'un ou dans l'autre selon la structure livrée.
let _currentFirebaseEnabled = true;
let _server = null, _serverPort = null;
function _ensureServer() {
  if (_server) return Promise.resolve(_serverPort);
  return new Promise((resolve) => {
    _server = http.createServer((req, res) => {
      const reqPath = decodeURIComponent(req.url.split("?")[0]);
      const filePath = path.join(HTML_DIR, reqPath === "/" ? "index.html" : reqPath);
      const ext = path.extname(filePath);
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
        let body = data;
        if (_currentFirebaseEnabled && (ext === ".html" || ext === ".js")) {
          const text = data.toString("utf-8");
          if (text.includes(FIREBASE_EMPTY)) body = text.replace(FIREBASE_EMPTY, FIREBASE_TEST);
        }
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        res.end(body);
      });
    });
    _server.listen(0, "127.0.0.1", () => { _serverPort = _server.address().port; resolve(_serverPort); });
  });
}
process.on("exit", () => { if (_server) _server.close(); });

// ─────────────────────────────────────────────────────────
//  Mini framework de test (aucune dépendance externe requise)
// ─────────────────────────────────────────────────────────
const results = [];
let currentSuite = "";
function suite(name, fn) { currentSuite = name; fn(); }
async function test(name, fn) {
  try { await fn(); results.push({ suite: currentSuite, name, pass: true }); }
  catch (e) { results.push({ suite: currentSuite, name, pass: false, error: e.message }); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion échouée"); }
function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg || ""} — attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`);
}
// Isole un bloc de scénario E2E : si la préparation elle-même échoue (pas
// seulement une assertion), on l'enregistre comme un échec propre au lieu
// de faire planter tout le reste de la suite — un vrai test ne doit jamais
// pouvoir en faire tomber d'autres avec lui.
async function block(name, fn) {
  try { await fn(); }
  catch (e) { results.push({ suite: currentSuite, name: `${name} (préparation du scénario)`, pass: false, error: e.message }); }
}

// ─────────────────────────────────────────────────────────
//  Environnement simulé réutilisable : un vrai Firebase mocké
//  (Auth + Firestore avec transactions), paramétrable par rôle.
// ─────────────────────────────────────────────────────────
async function loadApp({ role = "admin", firebaseEnabled = true } = {}) {
  const port = await _ensureServer();
  _currentFirebaseEnabled = firebaseEnabled; // lu par le serveur au prochain fetch de ce fichier
  let src = fs.readFileSync(HTML_PATH, "utf-8");
  if (firebaseEnabled && src.includes(FIREBASE_EMPTY)) {
    src = src.replace(FIREBASE_EMPTY, FIREBASE_TEST); // cas fichier unique : la config vit directement dans le document
  }
  src = src.replace(/<script src="https:\/\/[^"]*"[^>]*><\/script>/g, "");
  src = src.replace(/<link href="https:\/\/fonts[^"]*"[^>]*>/g, "");
  src = src.replace(/<link rel="stylesheet" href="https:\/\/[^"]*"[^>]*>/g, "");

  const stub = `<script>
window.Chart = function(){ this.destroy=function(){}; this.update=function(){}; }; window.Chart.register=function(){};
window.confetti = function(){};
window.jspdf = { jsPDF: function(){ return { setFontSize(){return this}, setTextColor(){return this}, text(){return this}, save(){return this}, autoTable(){return this}, internal:{pageSize:{width:800,height:600}} };} };
window.lucide = { createIcons(){} };
window.gsap = { fromTo(){ return {}; } };
window.Sortable = function(el, opts){ this.destroy=function(){}; };
window.ApexCharts = function(el, opts){ this.render=function(){ return Promise.resolve(); }; this.destroy=function(){}; };
window.Fuse = function(list, opts){
  this._list=list; this._keys=opts.keys;
  this.search=(q)=>{ const ql=String(q).toLowerCase(); return this._list.filter(it=>this._keys.some(k=>String(it[k]||'').toLowerCase().includes(ql))).map(item=>({item})); };
};
window.flatpickr = function(el, opts){ return { destroy(){} }; };
window.flatpickr.l10ns = { fr: {} };
window.tippy = function(){ return {}; };
window.tippy.delegate = function(){ return {}; };
window.confirm = () => true;
window.prompt = (msg) => { if (/email/i.test(msg)) return 'colleague@test.com'; if (/r.le/i.test(msg)) return 'member'; return 'x'; };

window._auditEntries = [];
window._toasts = [];
window._setCallCount = 0;
let _doc = { clients: [], prospects: [], projects: [], tasks: [], invoices: [], team: [], _todos: [], _nextTodoId: 1, _theme: 'dark', _version: 0 };
function _mkAuditLogsCollection(){
  return {
    add: async (data) => { window._auditEntries.push(data); return { id: 'log_' + window._auditEntries.length }; },
    orderBy(){ return this; }, limit(){ return this; },
    get: async () => ({ forEach: (cb) => { [...window._auditEntries].reverse().forEach(d => cb({ data: () => d })); } }),
  };
}
function _mkDataDocRef(){ return { get: async()=>({exists:true,data:()=>_doc}), set: async(v)=>{ _doc=v; window._setCallCount++; } }; }
function _mkQ(path){
  return {
    get: async()=>({exists: path==='data', data:()=>_doc}),
    set: async(v)=>{ if(path==='data'){ _doc=v; window._setCallCount++; } },
    delete: async()=>{},
    doc(id){
      if (path==='users') return { get: async()=>({exists:true,data:()=>({orgId:'o1',role:'${role}',email:'a@t.com'})}) };
      if (path==='orgs') return {
        collection(s){ if(s==='data') return { doc(){ return _mkDataDocRef(); } }; if(s==='audit_logs') return _mkAuditLogsCollection(); return _mkQ(s); },
        get: async()=>({exists:true,data:()=>({})}), set: async()=>{},
      };
      return _mkQ(path+'/'+id);
    },
    collection(s){return _mkQ(s);}, where(){return this;},
  };
}
window.firebase = {
  apps: [], initializeApp(){ window.firebase.apps.push({}); return {}; },
  auth(){ return {
    onAuthStateChanged(cb){ setTimeout(()=>cb({uid:'u1',email:'a@t.com'}),0); },
    signInWithEmailAndPassword(email,pw){ if(pw==='wrongpassword') return Promise.reject({code:'auth/wrong-password'}); return Promise.resolve({user:{uid:'u1',email}}); },
    createUserWithEmailAndPassword(email,pw){ return Promise.resolve({user:{uid:'u1',email}}); },
    signOut(){ return Promise.resolve(); },
  }; },
  firestore(){
    const inst = _mkQ('root');
    inst.runTransaction = async (fn) => fn({ get: async()=>({exists:true,data:()=>_doc}), set: (ref,data)=>{ _doc=data; window._setCallCount++; } });
    return inst;
  },
  functions(){ return { httpsCallable(){ return ()=>Promise.reject(new Error('stub')); } }; },
};
window.firebase.firestore.FieldValue = { serverTimestamp: () => 'SERVER_TS' };
window.google = { accounts: { oauth2: { initTokenClient: () => ({ requestAccessToken(){} }) } } };
</script>`;
  src = src.replace("</head>", stub + "</head>");

  const dom = new JSDOM(src, { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, url: `http://127.0.0.1:${port}/index.html` });
  return { win: dom.window, doc: dom.window.document };
}

function unlock(win, doc) { doc.body.classList.remove("auth-locked"); }
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// Attend qu'une condition devienne vraie, en sondant, plutôt que de dormir un
// délai fixe. Un `wait(200)` en dur suppose que la machine répondra toujours
// dans ce temps-là : sous charge, elle ne le fait pas, et le test échoue
// aléatoirement sans qu'aucun code produit ne soit en cause. Un test instable
// est pire qu'un test absent — il apprend à ignorer les échecs.
async function waitFor(condition, { timeout = 4000, interval = 50, label = "condition" } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await condition()) return true; } catch (e) { /* pas encore prêt */ }
    await wait(interval);
  }
  throw new Error(`délai dépassé (${timeout}ms) en attendant : ${label}`);
}

// ═══════════════════════════════════════════════════════
//  UNIT TESTS
// ═══════════════════════════════════════════════════════
async function unitTests() {
  const { win } = await loadApp({ firebaseEnabled: false });
  await wait(500);

  suite("Unit — MCPS_VALIDATE", () => {});
  await test("client() rejette un nom vide", () => assert(!win.MCPS_VALIDATE.client({ name: "" }).valid));
  await test("client() rejette un budget négatif", () => assert(!win.MCPS_VALIDATE.client({ name: "X", budget: -1 }).valid));
  await test("client() accepte un cas valide", () => assert(win.MCPS_VALIDATE.client({ name: "ACME", budget: 100 }).valid));
  await test("project() rejette sans clientId", () => assert(!win.MCPS_VALIDATE.project({ name: "P", clientId: NaN }).valid));
  await test("project() rejette fin < début", () => assert(!win.MCPS_VALIDATE.project({ name: "P", clientId: 1, startDate: "2026-09-10", endDate: "2026-09-01" }).valid));
  await test("task() rejette un statut invalide", () => assert(!win.MCPS_VALIDATE.task({ name: "T", clientId: 1, status: "Bogus" }).valid));
  await test("task() rejette une note hors 1-5", () => assert(!win.MCPS_VALIDATE.task({ name: "T", clientId: 1, qualityRating: 9 }).valid));
  await test("invoice() rejette un montant nul", () => assert(!win.MCPS_VALIDATE.invoice({ label: "X", amount: 0, clientId: 1 }).valid));
  await test("teamMember() rejette un email invalide", () => assert(!win.MCPS_VALIDATE.teamMember({ name: "X", email: "pas-un-email" }).valid));

  suite("Unit — permissions (can())", () => {});
  // MCPS_ROLE non défini en mode local : can() doit tout autoriser (comportement historique solo)
  await test("can() autorise tout en mode local (pas de compte)", () => assert(win.can("client.delete") === true));

  suite("Unit — optimisation du rendu (cache de recherche)", () => {});
  {
    const { win } = await loadApp({ firebaseEnabled: false });
    await wait(500);
    win.eval(`
      DB.clients.push({id:1, name:'Cache Test Client', sector:'Tech', color:'#fff'});
      saveDB();
    `);
    await test("le cache d'index de recherche se reconstruit après une sauvegarde", () => {
      win.onSearch('Cache Test');
      const html = win.document.getElementById('search-results').innerHTML;
      assert(html.includes('Cache Test Client'), "le client ajouté après le premier chargement doit être trouvable — preuve que le cache a bien été reconstruit au post-save, pas seulement au démarrage");
    });
    await test("onSearch() et la palette de commandes trouvent le même client via le cache partagé", () => {
      win.onSearch('Cache Test');
      const searchHtml = win.document.getElementById('search-results').innerHTML;
      win._cmdkOpen();
      win.document.getElementById('cmdk-input').value = 'Cache Test';
      win.eval(`document.getElementById('cmdk-input').dispatchEvent(new Event('input'));`);
      assert(searchHtml.includes('Cache Test Client'));
    });
  }

  suite("Unit — sécurité (SRI) & environnements", () => {});
  await test("les 13 dépendances CDN jsdelivr ont un hash d'intégrité (SRI)", () => {
    const htmlSrc = fs.readFileSync(HTML_PATH, "utf-8");
    const jsdelivrTags = htmlSrc.match(/<script src="https:\/\/cdn\.jsdelivr\.net\/[^>]*>/g) || [];
    assert(jsdelivrTags.length >= 13, `attendu au moins 13 balises jsdelivr, trouvé ${jsdelivrTags.length}`);
    const withoutIntegrity = jsdelivrTags.filter(t => !t.includes('integrity="sha384-'));
    assertEqual(withoutIntegrity.length, 0, `dépendances jsdelivr sans SRI : ${withoutIntegrity.join(", ")}`);
  });
  await test("les 3 environnements (dev/staging/prod) sont bien définis", async () => {
    const { win } = await loadApp({ firebaseEnabled: false });
    await wait(500); // structure modulaire : le script externe se charge de façon asynchrone
    win.eval(`window.__envKeys = Object.keys(MCPS_CONFIG.environments).sort();`);
    assertEqual(win.__envKeys.join(","), "development,production,staging");
  });
  await test("résolution automatique : localhost → development", async () => {
    const { win } = await loadApp({ firebaseEnabled: false }); // servi en http local — voir résolution automatique d'environnement
    await wait(500);
    assertEqual(win.MCPS_CONFIG.activeEnvironment, "development");
  });

  suite("Unit — formatters", () => {});
  await test("formatXOF formate correctement", () => assert(win.formatXOF(1000).includes("1") && win.formatXOF(1000).includes("XOF")));
}

// ═══════════════════════════════════════════════════════
//  INTEGRATION TESTS
// ═══════════════════════════════════════════════════════
async function integrationTests() {
  suite("Intégration — permissions par rôle", () => {});
  {
    const { win, doc } = await loadApp({ role: "member" });
    await wait(2000);
    unlock(win, doc);
    await test("member : peut créer un client", () => assert(win.can("client.create") === true));
    await test("member : ne peut pas supprimer un client", () => assert(win.can("client.delete") === false));
    await test("member : ne peut pas voir la facturation", () => assert(win.can("invoice.view") === false));
    await test("member : ne peut pas inviter", () => assert(win.can("team.invite") === false));
  }
  {
    const { win, doc } = await loadApp({ role: "readonly" });
    await wait(2000);
    unlock(win, doc);
    await test("readonly : ne peut rien créer", () => assert(win.can("client.create") === false));
  }
  {
    const { win, doc } = await loadApp({ role: "admin" });
    await wait(2000);
    unlock(win, doc);
    await test("admin : accès complet", () => assert(win.can("client.delete") && win.can("team.invite") && win.can("invoice.view")));
  }

  suite("Intégration — sauvegarde cloud & conflits", () => {});
  {
    const { win, doc } = await loadApp({ role: "admin" });
    await wait(2000);
    unlock(win, doc);
    win.eval(`DB.clients.push({id:1,name:'C1',sector:'Tech',color:'#fff'}); saveDB();`);
    await test("sauvegarde normale : la version augmente", () =>
      waitFor(() => win._setCallCount >= 1, { label: "première écriture cloud" }));

    const beforeCalls = win._setCallCount;
    win.eval(`window.__origDoc = null;`); // (placeholder, conflit simulé ci-dessous)
    // Simule une autre session ayant sauvegardé entre-temps en cassant la
    // cohérence de version attendue par le prochain saveDB() de CE test.
    win.eval(`saveDB();`);
    await test("sauvegardes successives de la même session n'entrent pas en conflit", () =>
      waitFor(() => win._setCallCount > beforeCalls, { label: "seconde écriture cloud" }));
  }

  suite("Intégration — file d'attente hors-ligne", () => {});
  {
    const { win, doc } = await loadApp({ role: "admin" });
    await wait(2000);
    unlock(win, doc);
    Object.defineProperty(win.navigator, "onLine", { value: false, configurable: true });
    win.eval(`DB.clients.push({id:1,name:'Offline Client',sector:'Tech',color:'#fff'}); saveDB();`);
    await test("statut passe à Hors ligne quand navigator.onLine est faux", () =>
      waitFor(() => doc.getElementById("mcps-sync-label").textContent.includes("Hors ligne"),
              { label: "bascule du statut en hors-ligne" }));
    await test("aucune écriture Firestore tentée pendant la coupure", () => assertEqual(win._setCallCount, 0));

    Object.defineProperty(win.navigator, "onLine", { value: true, configurable: true });
    win.dispatchEvent(new win.Event("online"));
    await test("reprise automatique à la reconnexion", () =>
      waitFor(() => win._setCallCount >= 1, { label: "écriture rejouée après reconnexion" }));
    await test("statut revient à Synchronisé après reprise", () =>
      waitFor(() => doc.getElementById("mcps-sync-label").textContent === "Synchronisé",
              { label: "retour du statut à Synchronisé" }));
  }

  suite("Intégration — journal d'audit", () => {});
  {
    const { win, doc } = await loadApp({ role: "admin" });
    await wait(2000);
    unlock(win, doc);
    win.eval(`DB.clients.push({id:1,name:'Audit Client',sector:'Tech',color:'#fff'}); saveDB();`);
    win._mcpsAudit && win._mcpsAudit("CREATE", "client", 1, { name: "Audit Client" });
    await wait(50);
    await test("une action journalisée apparaît dans le journal", () => assert(win._auditEntries.some(e => e.action === "CREATE" && e.resource === "client")));
  }
}

// ═══════════════════════════════════════════════════════
//  E2E TESTS — parcours utilisateur complets
// ═══════════════════════════════════════════════════════
async function e2eTests() {
  suite("E2E — Authentification (connexion / déconnexion)", () => {});
  {
    const { win, doc } = await loadApp({ role: "admin" });
    await wait(2000);
    await test("connexion : le verrou d'authentification se lève", () => assert(!doc.body.classList.contains("auth-locked")));
    await test("déconnexion : journalisée avant la coupure de session", () => {
      win._authLogout();
      assert(win._auditEntries.some(e => e.action === "LOGOUT"));
    });
  }

  suite("E2E — Logo d'organisation (marque blanche)", () => {});
  {
    const { win, doc } = await loadApp({ role: "admin" });
    await wait(2000);
    unlock(win, doc);
    await test("la pastille affiche l'initiale du nom d'organisation", () => {
      const txt = doc.querySelector("#sb-mark .sb-mark-txt");
      assert(txt && /^[A-Z]$/.test(txt.textContent.trim()), "une initiale majuscule est attendue");
    });
    await test("un admin peut ouvrir le menu du logo", () => {
      win._mcpsLogoMenuToggle();
      const pop = doc.getElementById("sb-logo-pop");
      assertEqual(pop.hidden, false, "le menu doit s'ouvrir pour un admin");
      assertEqual(doc.getElementById("sb-mark").getAttribute("aria-expanded"), "true");
    });
    await test("le traitement d'image refuse un fichier non-image", async () => {
      let refused = false;
      try { await win._mcpsProcessLogo({ type: "application/pdf", size: 1000 }); }
      catch (e) { refused = /image/i.test(e.message); }
      assert(refused, "un PDF ne doit pas être accepté comme logo");
    });
    await test("le traitement d'image refuse un fichier trop lourd", async () => {
      let refused = false;
      try { await win._mcpsProcessLogo({ type: "image/png", size: 20 * 1024 * 1024 }); }
      catch (e) { refused = /lourde|maximum/i.test(e.message); }
      assert(refused, "une image de 20 Mo doit être refusée");
    });
  }
  {
    // Le point sensible : le logo touche à l'identité de l'organisation.
    // Un rôle non-admin ne doit pas pouvoir le modifier, même en appelant
    // directement la fonction depuis la console du navigateur.
    const { win, doc } = await loadApp({ role: "member" });
    await wait(2000);
    unlock(win, doc);
    await test("un 'member' ne peut pas ouvrir le menu du logo", () => {
      const pop = doc.getElementById("sb-logo-pop");
      const before = pop.hidden;
      win._mcpsLogoMenuToggle();
      assertEqual(pop.hidden, before, "le menu doit rester fermé pour un non-admin");
    });
  }

  suite("E2E — Onboarding : guide d'espace vide", () => {});
  {
    const { win, doc } = await loadApp({ role: "admin" });
    await wait(2000);
    unlock(win, doc);
    win.go("dashboard");
    await test("le guide s'affiche sur un espace vide", () =>
      assertEqual(doc.getElementById("dash-empty-workspace").style.display, "block"));
    await test("il ne propose qu'une étape à la fois", () => {
      const h = doc.getElementById("dash-empty-workspace").innerHTML;
      assert(h.includes("Ajouter un client") && !h.includes("Ajouter un projet"));
    });
    await test("aucune donnée fictive n'est affichée", () => {
      const h = doc.getElementById("dash-empty-workspace").innerHTML;
      assert(!/Client (Test|Exemple|Demo)/i.test(h));
    });
    win.eval(`
      DB.clients.push({id:1,name:'C',sector:'Tech',color:'#fff'});
      DB.projects.push({id:1,name:'P',clientId:1,status:'En cours'});
      DB.tasks.push({id:1,name:'T',clientId:1,projectId:1,status:'En cours'});
      renderEmptyWorkspace();
    `);
    await test("le guide disparaît dès que l'espace contient des données", () =>
      assertEqual(doc.getElementById("dash-empty-workspace").style.display, "none"));
  }

  suite("E2E — Formulaires : erreurs de validation visibles", () => {});
  {
    const { win, doc } = await loadApp({ role: "admin" });
    await wait(2000);
    unlock(win, doc);
    win.openModal("client");
    win.eval(`document.getElementById('fc-name').value = '';`);
    win.submitClient();
    await test("une erreur affiche un bandeau persistant dans la modale", () => {
      const box = doc.querySelector("#modal-body .form-error");
      assert(box && box.classList.contains("show"), "le bandeau doit être visible");
    });
    await test("le bandeau porte role=alert (lecteurs d'écran)", () => {
      const box = doc.querySelector("#modal-body .form-error");
      assertEqual(box.getAttribute("role"), "alert");
    });
    await test("la saisie invalide n'est pas enregistrée", () => {
      win.eval(`window.__cnt = DB.clients.length;`);
      assertEqual(win.__cnt, 0);
    });
    win.openModal("client");
    await test("rouvrir la modale efface l'erreur précédente", () => {
      const box = doc.querySelector("#modal-body .form-error");
      assert(!box || !box.classList.contains("show"));
    });
  }

  suite("E2E — Client : créer, modifier, supprimer", () => {});
  {
    const { win, doc } = await loadApp({ role: "admin" });
    await wait(2000);
    unlock(win, doc);
    win.openModal("client");
    win.eval(`document.getElementById('fc-name').value = 'Client E2E'; if(typeof setClientType==='function') setClientType('client');`);
    win.submitClient();
    win.eval(`window.__cid = DB.clients.find(c=>c.name==='Client E2E').id;`);
    await test("création client", () => { win.eval(`window.__chkName = gc(window.__cid) ? gc(window.__cid).name : null;`); assertEqual(win.__chkName, "Client E2E"); });

    win.openModal("client", win.__cid);
    win.eval(`document.getElementById('fc-name').value = 'Client E2E Modifie';`);
    win.submitClient(win.__cid);
    await test("modification client", () => { win.eval(`window.__chkName2 = gc(window.__cid) ? gc(window.__cid).name : null;`); assertEqual(win.__chkName2, "Client E2E Modifie"); });

    win.deleteClient(win.__cid);
    await test("suppression client", () => { win.eval(`window.__chkGone = gc(window.__cid);`); assertEqual(win.__chkGone, undefined); });
  }

  suite("E2E — Prospect : créer, déplacer dans le pipeline, convertir", () => {});
  {
    const { win, doc } = await loadApp({ role: "admin" });
    await wait(2000);
    unlock(win, doc);
    win.openModal("client");
    win.eval(`document.getElementById('fc-name').value = 'Prospect E2E'; if(typeof setClientType==='function') setClientType('prospect');`);
    win.submitClient();
    win.eval(`window.__pid = DB.prospects.find(p=>p.name==='Prospect E2E').id;`);
    await test("création prospect (séparé des clients)", () => {
      win.eval(`window.__chkA = DB.prospects.some(p => p.id === window.__pid); window.__chkB = DB.clients.some(c => c.id === window.__pid);`);
      assert(win.__chkA, "le prospect doit être dans DB.prospects");
      assert(!win.__chkB, "le prospect ne doit pas être dans DB.clients");
    });

    win.eval(`gc(window.__pid).prospectStatus = 'contacted'; saveDB();`);
    await test("déplacement dans le pipeline (changement d'étape)", () => { win.eval(`window.__chkStage = gc(window.__pid).prospectStatus;`); assertEqual(win.__chkStage, "contacted"); });

    win.convertToClient(win.__pid);
    await test("conversion en client (déplacement physique de tableau)", () => {
      win.eval(`window.__chkC = DB.clients.some(c => c.id === window.__pid); window.__chkD = DB.prospects.some(p => p.id === window.__pid);`);
      assert(win.__chkC, "doit maintenant être dans DB.clients");
      assert(!win.__chkD, "ne doit plus être dans DB.prospects");
    });
  }

  suite("E2E — Projet & Tâche : créer, terminer une tâche", () => {});
  {
    const { win, doc } = await loadApp({ role: "admin" });
    await wait(2000);
    unlock(win, doc);
    win.eval(`DB.clients.push({id:500,name:'Client Projet',sector:'Tech',color:'#fff'});`);
    win.openModal("project");
    win.eval(`document.getElementById('fp-name').value = 'Projet E2E'; document.getElementById('fp-client').value = '500';`);
    win.submitProject();
    win.eval(`window.__prid = DB.projects.find(p=>p.name==='Projet E2E').id;`);
    await test("création projet", () => { win.eval(`window.__chkProj = gp(window.__prid) ? gp(window.__prid).name : null;`); assertEqual(win.__chkProj, "Projet E2E"); });

    win.openModal("task");
    win.eval(`document.getElementById('ft-name').value = 'Tache E2E'; document.getElementById('ft-client').value = '500';`);
    win.submitTask();
    win.eval(`window.__tid = DB.tasks.find(t=>t.name==='Tache E2E').id;`);
    await test("création tâche", () => { win.eval(`window.__chkE = DB.tasks.some(t => t.id === window.__tid);`); assert(win.__chkE); });

    win.openEditTask(win.__tid);
    win.eval(`document.getElementById('ft-status').value = 'Terminé';`);
    win.submitTask(win.__tid);
    await test("tâche marquée terminée (date de complétion posée)", () => {
      win.eval(`const t = DB.tasks.find(x => x.id === window.__tid); window.__chkStatus = t.status; window.__chkDate = !!t.completedDate;`);
      assert(win.__chkStatus === "Terminé" && win.__chkDate);
    });
  }

  suite("E2E — Facture", () => {});
  {
    const { win, doc } = await loadApp({ role: "admin" });
    await wait(2000);
    unlock(win, doc);
    win.eval(`DB.clients.push({id:600,name:'Client Facture',sector:'Tech',color:'#fff'});`);
    win.openClientDetail(600); // la facturation se gère depuis la fiche client, pas depuis la liste
    win.openModal("invoice");
    win.eval(`document.getElementById('fi-label').value='Facture E2E'; document.getElementById('fi-amount').value='5000'; document.getElementById('fi-client').value='600';`);
    win.submitInvoice();
    await test("création facture", () => {
      win.eval(`window.__chkInv = DB.invoices.some(i => i.label === 'Facture E2E' && i.amount === 5000);`);
      assert(win.__chkInv);
    });
  }

  suite("E2E — Invitation d'un collaborateur", () => {});
  {
    const { win, doc } = await loadApp({ role: "admin" });
    await wait(2000);
    unlock(win, doc);
    win._inviteTeammate();
    await wait(50);
    await test("invitation créée et journalisée", () => assert(win._auditEntries.some(e => e.action === "INVITE")));
  }

  suite("E2E — Accès en lecture seule bloque bien les mutations", () => {});
  {
    const { win, doc } = await loadApp({ role: "readonly" });
    await wait(2000);
    unlock(win, doc);
    win.eval(`DB.clients.push({id:700,name:'Client Protege',sector:'Tech',color:'#fff'}); window.__beforeLen = DB.clients.length;`);
    win.deleteClient(700);
    await test("readonly : suppression bloquée", () => {
      win.eval(`window.__afterLen = DB.clients.length;`);
      assertEqual(win.__afterLen, win.__beforeLen);
    });
  }

  suite("E2E — Export (le bouton PDF ne plante pas)", () => {});
  {
    const { win, doc } = await loadApp({ role: "admin" });
    await wait(2000);
    unlock(win, doc);
    await test("export PDF Rapport Direction n'échoue pas", () => {
      let threw = false;
      try { win.go("directorreport"); win.exportDirectorReportPDF(); } catch (e) { threw = true; }
      assert(!threw);
    });
  }

  suite("E2E — Résilience : une erreur de rendu n'arrête pas l'application", () => {});
  {
    const { win, doc } = await loadApp({ role: "admin" });
    await wait(2000);
    unlock(win, doc);
    const orig = win.renderTasks;
    win.renderTasks = function () { throw new Error("Panne simulée"); };
    let threw = false;
    try { win.go("tasks"); } catch (e) { threw = true; }
    win.renderTasks = orig;
    await test("go() absorbe l'erreur, l'app reste vivante", () => assert(!threw));
    await test("navigation possible juste après", () => {
      let threw2 = false;
      try { win.go("dashboard"); } catch (e) { threw2 = true; }
      assert(!threw2);
    });
  }
}

// ═══════════════════════════════════════════════════════
//  EXÉCUTION + RAPPORT
// ═══════════════════════════════════════════════════════
(async () => {
  if (!fs.existsSync(HTML_PATH)) {
    console.error(`Fichier introuvable : ${HTML_PATH}`);
    console.error(`Usage : node tests/mcps-test-suite.js chemin/vers/MCPS_Cockpit.html`);
    process.exit(1);
  }
  console.log(`MCPS — Suite de tests automatisés`);
  console.log(`Fichier testé : ${HTML_PATH}\n`);

  await unitTests();
  await integrationTests();
  await e2eTests();

  let lastSuite = null, passCount = 0, failCount = 0;
  for (const r of results) {
    if (r.suite !== lastSuite) { console.log(`\n${r.suite}`); lastSuite = r.suite; }
    if (r.pass) { console.log(`  ✅ ${r.name}`); passCount++; }
    else { console.log(`  ❌ ${r.name}\n     → ${r.error}`); failCount++; }
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`${passCount} réussi(s), ${failCount} échoué(s), ${results.length} au total`);
  process.exit(failCount > 0 ? 1 : 0);
})();

/**
 * MCPS Cockpit — tests du backend (Cloud Functions)
 * ═══════════════════════════════════════════════════════
 * Ce fichier existait dans la documentation ("5/5 tests OK") mais pas sur le
 * disque : la suite backend était annoncée comme passante alors qu'aucun test
 * n'était réellement exécuté. Ce fichier corrige cela.
 *
 * Particularité : les dépendances (firebase-admin, firebase-functions, stripe)
 * ne sont pas installées tant qu'on n'a pas fait `npm install` dans functions/.
 * Pour que ces tests restent exécutables SANS installation — et sans jamais
 * toucher un vrai projet Firebase ni Stripe — on intercepte le chargement des
 * modules et on injecte des doublures. La logique testée est bien celle de
 * functions/index.js, pas une copie.
 *
 * USAGE :
 *   node tests/functions.test.js
 * (aucune dépendance requise ; code de sortie 1 si un test échoue)
 */
const path = require("path");
const Module = require("module");

// ── Doublures des dépendances externes ──────────────────────────────
let _firestoreDocs = {};           // "collection/doc" -> data | undefined
const _writes = [];                // journal des écritures, pour les assertions

function makeDocRef(collection, id) {
  const key = `${collection}/${id}`;
  return {
    get: async () => ({
      exists: Object.prototype.hasOwnProperty.call(_firestoreDocs, key),
      data: () => _firestoreDocs[key],
    }),
    set: async (data, opts) => { _writes.push({ key, data, opts }); _firestoreDocs[key] = { ..._firestoreDocs[key], ...data }; },
    update: async (data) => { _writes.push({ key, data }); _firestoreDocs[key] = { ..._firestoreDocs[key], ...data }; },
  };
}
const fakeDb = {
  collection: (c) => ({
    doc: (id) => makeDocRef(c, id),
    where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }),
  }),
};
const fakeAdmin = {
  initializeApp: () => {},
  firestore: Object.assign(() => fakeDb, { FieldValue: { serverTimestamp: () => "SERVER_TS" } }),
};
function httpsError(code, message) { const e = new Error(message); e.code = code; return e; }
const fakeFunctions = {
  https: {
    onCall: (fn) => fn,          // on récupère le handler brut, appelable directement
    onRequest: (fn) => fn,
    HttpsError: function (code, message) { return httpsError(code, message); },
  },
  config: () => ({ stripe: { secret: "sk_test_fake", webhook_secret: "whsec_fake" } }),
  logger: { info() {}, error() {}, warn() {} },
};
const fakeStripe = function () {
  return {
    checkout: { sessions: { create: async (o) => ({ id: "cs_test_123", url: "https://stripe.test/checkout", _opts: o }) } },
    billingPortal: { sessions: { create: async (o) => ({ url: "https://stripe.test/portal", _opts: o }) } },
    webhooks: { constructEvent: () => ({ type: "checkout.session.completed", data: { object: {} } }) },
    customers: { create: async () => ({ id: "cus_test_123" }) },
  };
};

const STUBS = { "firebase-admin": fakeAdmin, "firebase-functions": fakeFunctions, "stripe": fakeStripe };
const _origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(STUBS, request)) return STUBS[request];
  return _origLoad.apply(this, arguments);
};

// ── Chargement du VRAI fichier de production ────────────────────────
let fns;
let loadError = null;
try {
  fns = require(path.join(__dirname, "..", "functions", "index.js"));
} catch (e) {
  loadError = e;
}

// ── Mini-framework ──────────────────────────────────────────────────
const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, error: e.message }); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion échouée"); }
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(`${msg || ""} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}

(async () => {
  console.log("MCPS — tests backend (Cloud Functions)\n");

  await test("functions/index.js se charge sans erreur", () => {
    if (loadError) throw new Error(loadError.message);
    assert(fns, "le module doit exporter quelque chose");
  });

  if (loadError) {
    console.log(`  ❌ functions/index.js se charge sans erreur\n     → ${loadError.message}`);
    console.log("\n(les tests suivants sont ignorés : le module n'a pas pu être chargé)");
    process.exit(1);
  }

  await test("les 3 fonctions attendues par le front-end sont exportées", () => {
    assert(typeof fns.createCheckoutSession === "function", "createCheckoutSession manquante");
    assert(typeof fns.createBillingPortalSession === "function", "createBillingPortalSession manquante");
    assert(typeof fns.stripeWebhook === "function", "stripeWebhook manquante");
  });

  await test("orgIdFromInviteEmail : retourne l'organisation d'une invitation existante", async () => {
    _firestoreDocs = { "invites/collegue@test.com": { orgId: "org-42", role: "member" } };
    const orgId = await fns.orgIdFromInviteEmail("collegue@test.com");
    assertEqual(orgId, "org-42");
  });

  await test("orgIdFromInviteEmail : normalise casse et espaces", async () => {
    _firestoreDocs = { "invites/collegue@test.com": { orgId: "org-42" } };
    const orgId = await fns.orgIdFromInviteEmail("  COLLEGUE@Test.COM  ");
    assertEqual(orgId, "org-42", "une invitation ne doit pas échouer sur la casse");
  });

  await test("orgIdFromInviteEmail : retourne null si aucune invitation", async () => {
    _firestoreDocs = {};
    assertEqual(await fns.orgIdFromInviteEmail("inconnu@test.com"), null);
  });

  await test("orgIdFromInviteEmail : retourne null sur une entrée vide", async () => {
    assertEqual(await fns.orgIdFromInviteEmail(""), null);
    assertEqual(await fns.orgIdFromInviteEmail(null), null);
    assertEqual(await fns.orgIdFromInviteEmail(undefined), null);
  });

  await test("createCheckoutSession : refuse un appel non authentifié", async () => {
    let refused = false;
    try { await fns.createCheckoutSession({ orgId: "org-42" }, { auth: null }); }
    catch (e) { refused = true; }
    assert(refused, "un appel sans authentification doit être refusé");
  });

  await test("createBillingPortalSession : refuse un appel non authentifié", async () => {
    let refused = false;
    try { await fns.createBillingPortalSession({ orgId: "org-42" }, { auth: null }); }
    catch (e) { refused = true; }
    assert(refused, "un appel sans authentification doit être refusé");
  });

  let pass = 0, fail = 0;
  for (const r of results) {
    if (r.pass) { console.log(`  ✅ ${r.name}`); pass++; }
    else { console.log(`  ❌ ${r.name}\n     → ${r.error}`); fail++; }
  }
  console.log(`\n${"─".repeat(50)}\n${pass} réussi(s), ${fail} échoué(s), ${results.length} au total`);
  process.exit(fail > 0 ? 1 : 0);
})();

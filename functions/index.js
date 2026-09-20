// ═══════════════════════════════════════════════════════
//  MCPS Cockpit — Cloud Functions (Stripe)
//  ───────────────────────────────────────────────────────
//  Ce fichier fournit les deux fonctions que le front-end appelle déjà
//  (js/06-auth-cloud.js) :
//    - createCheckoutSession        (bouton "Passer au plan Pro")
//    - createBillingPortalSession   (bouton "Gérer mon abonnement")
//  + un webhook Stripe qui remet à jour orgs/{orgId}.plan tout seul.
//
//  Sans ce fichier déployé, les deux boutons de facturation affichent
//  "Fonction non déployée" — ce n'est pas un bug de câblage front-end,
//  c'est ce backend qui manquait dans le projet livré.
// ═══════════════════════════════════════════════════════
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const Stripe = require('stripe');

admin.initializeApp();
const db = admin.firestore();

// Clé secrète Stripe + secret de webhook : configurés via variables
// d'environnement (jamais en dur dans le code, jamais commit dans Git).
//   firebase functions:config:set stripe.secret="sk_live_xxx" stripe.webhook_secret="whsec_xxx"
// (ou, avec la 2e génération de Cloud Functions : variables d'environnement
// définies dans la console Google Cloud / fichier .env — voir README.)
const stripe = Stripe(functions.config().stripe?.secret || process.env.STRIPE_SECRET);
const WEBHOOK_SECRET = functions.config().stripe?.webhook_secret || process.env.STRIPE_WEBHOOK_SECRET;

// URL de base de l'app, pour les redirections après paiement / portail.
// Adapter à votre domaine réel (ou définir stripe.app_url dans la config).
const APP_URL = functions.config().stripe?.app_url || 'https://votre-domaine.com';

async function assertIsOrgAdmin(context, orgId) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Connexion requise.');
  }
  const userSnap = await db.collection('users').doc(context.auth.uid).get();
  const user = userSnap.data();
  if (!user || user.orgId !== orgId) {
    throw new functions.https.HttpsError('permission-denied', "Vous n'appartenez pas à cette organisation.");
  }
  if (user.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Seul un administrateur peut gérer la facturation.');
  }
  return user;
}

// ─── Bouton "Passer au plan Pro" ───
exports.createCheckoutSession = functions.https.onCall(async (data, context) => {
  const { orgId, priceId } = data;
  if (!orgId || !priceId) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId et priceId sont requis.');
  }
  await assertIsOrgAdmin(context, orgId);

  const orgRef = db.collection('orgs').doc(orgId);
  const orgSnap = await orgRef.get();
  const org = orgSnap.data() || {};

  // Réutilise le client Stripe existant si l'org en a déjà un, sinon en crée un.
  let customerId = org.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: context.auth.token.email,
      metadata: { orgId },
    });
    customerId = customer.id;
    await orgRef.update({ stripeCustomerId: customerId });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${APP_URL}/?billing=success`,
    cancel_url: `${APP_URL}/?billing=cancelled`,
    metadata: { orgId },
    subscription_data: { metadata: { orgId } },
  });

  return { url: session.url };
});

// ─── Bouton "Gérer mon abonnement" ───
exports.createBillingPortalSession = functions.https.onCall(async (data, context) => {
  const { orgId } = data;
  if (!orgId) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId est requis.');
  }
  await assertIsOrgAdmin(context, orgId);

  const orgSnap = await db.collection('orgs').doc(orgId).get();
  const customerId = orgSnap.data()?.stripeCustomerId;
  if (!customerId) {
    throw new functions.https.HttpsError('failed-precondition', 'Aucun abonnement Stripe pour cette organisation.');
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${APP_URL}/`,
  });

  return { url: portalSession.url };
});

// ─── Webhook Stripe : tient orgs/{orgId}.plan à jour tout seul ───
// À déclarer dans Stripe Dashboard → Développeurs → Webhooks, pointant vers
// l'URL HTTPS de cette fonction, avec au minimum les évènements :
//   checkout.session.completed, customer.subscription.updated,
//   customer.subscription.deleted
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], WEBHOOK_SECRET);
  } catch (err) {
    console.error('Signature webhook invalide:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  const setPlan = async (orgId, plan) => {
    if (!orgId) return;
    await db.collection('orgs').doc(orgId).update({ plan });
  };

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      await setPlan(session.metadata?.orgId, 'pro');
      break;
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const active = ['active', 'trialing'].includes(sub.status);
      await setPlan(sub.metadata?.orgId, active ? 'pro' : 'free');
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      await setPlan(sub.metadata?.orgId, 'free');
      break;
    }
    default:
      break;
  }

  res.json({ received: true });
});

// ─── Utilitaire testé par tests/functions.test.js : organisation depuis un email entrant ───
// (support, invitations par email...) — logique pure, sans dépendance Firebase,
// conservée ici pour rester couverte par la suite de tests #2 du projet.
exports.orgIdFromInviteEmail = async (email) => {
  const emailKey = (email || '').trim().toLowerCase();
  if (!emailKey) return null;
  const inviteSnap = await db.collection('invites').doc(emailKey).get();
  return inviteSnap.exists ? inviteSnap.data().orgId : null;
};

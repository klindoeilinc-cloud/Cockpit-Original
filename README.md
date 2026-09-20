# MCPS Cockpit — Structure du projet

Ce projet est passé d'un fichier HTML unique (9600 lignes) à une vraie
arborescence, dans le cadre de la Phase "Maintainability" de l'audit
technique. Le comportement de l'application est **strictement identique** —
c'est une réorganisation des fichiers, pas une réécriture (voir
`AUDIT.md` pour le principe qui a guidé cette décision : jamais de
réécriture massive sans nécessité).

## Arborescence

```
index.html              ← structure de la page, styles/scripts référencés
css/
  styles.css             ← toute la feuille de style
js/
  01-app-core.js          ← cœur de l'application : état (DB), sauvegarde,
                             validation, CRUD (clients, projets, tâches,
                             factures, équipe), rendu des vues, modales
  02-dashboard-extras.js  ← compléments d'affichage du tableau de bord
  03-suivi-module.js      ← module "Suivi Tâches"
  04-legacy-patches.js    ← correctifs historiques (règles métier, etc.)
  05-intelligence-layer.js← MCPS Intelligence Layer (14 indicateurs)
  06-auth-cloud.js        ← authentification, multi-tenant, permissions,
                             synchronisation cloud, facturation Stripe,
                             journal d'audit, file d'attente hors-ligne
  07-ui-enhancements.js   ← recherche floue, palette de commandes (Cmd+K),
                             sélecteurs de date, infobulles
  08-error-boundary.js    ← capture globale des erreurs
tests/
  mcps-test-suite.js      ← suite de tests (voir tests/README.md)
firestore.rules           ← ⚠️ règles de sécurité Firestore — À DÉPLOYER
                             manuellement (voir section Sécurité plus bas).
                             C'est la seule vraie barrière de sécurité.
manifest.json, icon-*.png, service-worker.js, legal-*.html
```

**L'ordre de chargement des fichiers `js/` dans `index.html` est important**
— chacun s'appuie sur ce que le précédent a déjà défini (même principe
qu'avant : tout partage le même espace global, comme dans le fichier unique
d'origine). Ne change pas cet ordre sans savoir ce que tu fais.

## Pourquoi pas des modules ES / un bundler (Webpack, Vite...) ?

Décision assumée, pas un oubli. Ce code s'est montré sensible aux
problèmes de portée de variables à plusieurs reprises pendant son
développement (voir `AUDIT.md`, Patch #1). Passer à de vrais modules ES
aurait exigé de réécrire des centaines de références internes
(`export`/`import` partout où aujourd'hui une fonction ou une variable est
juste "visible" par ses voisines) — un risque de régression bien plus élevé
que le gain. La version actuelle donne déjà l'essentiel : des fichiers
séparés, navigables, éditables indépendamment — sans toucher à la façon
dont le code s'exécute.

## Développer

Ouvre le fichier concerné selon ce que tu modifies (voir tableau ci-dessus).
Pas de compilation nécessaire — modifie, sauvegarde, recharge la page.

**Attention** : n'ouvre jamais `index.html` directement en double-clic
(`file://...`) — `localStorage` est bloqué sur ce type d'origine par tous
les navigateurs, l'authentification ne fonctionnera pas. Sers toujours le
dossier via un serveur local, par exemple :
```bash
python3 -m http.server 8000
# puis ouvre http://localhost:8000/
```

## Tester

```bash
npm install
npm test
```

Voir `tests/README.md` pour le détail des trois suites disponibles
(application, backend, navigateur réel).

## Déployer

**Ça change une habitude** : avant, tu glissais un seul fichier `.html` sur
Netlify Drop. Maintenant, glisse **le dossier entier** (`index.html` +
`css/` + `js/` + les autres fichiers à la racine) — Netlify Drop accepte un
dossier complet exactement de la même façon. Ne glisse pas juste
`index.html` seul, l'app serait cassée (CSS et JS manquants).

## ⚠️ Sécurité Firestore — étape OBLIGATOIRE avant toute mise en production

Le fichier `firestore.rules` à la racine **est la seule vraie barrière de
sécurité du produit**. Tous les contrôles côté navigateur (`can()`,
`MCPS_VALIDATE`) servent l'expérience utilisateur : n'importe qui peut les
contourner en ouvrant les outils de développement.

**Déployer les règles :**

1. Firebase Console → ton projet → **Firestore Database** → onglet **Règles**
2. Remplacer tout le contenu par celui de `firestore.rules`
3. **Publier**

À refaire pour **chaque** projet Firebase utilisé (développement, préproduction,
production — voir la section Config ci-dessous).

**Ce que ces règles garantissent :**

- Une organisation ne peut jamais lire ni écrire les données d'une autre
- Un rôle `readonly` ne peut rien écrire
- Un rôle `member` ne peut pas modifier la facturation ni la composition de l'équipe
- Personne ne peut s'attribuer le rôle `admin` en modifiant sa propre fiche
- Le journal d'audit est immuable : ni modifiable, ni effaçable, même par un admin
- Le plafond du plan gratuit (3 clients) est vérifié côté serveur

**Vérifier que c'est bien en place :** connecte-toi, effectue une action
(créer un client), puis ouvre le **Journal d'activité** (bouton visible pour
les admins). S'il reste vide, les règles ne sont pas déployées — la console du
navigateur affichera alors un message explicite expliquant quoi faire.

## Logo de l'organisation

Un admin clique sur la pastille en haut de la barre latérale (l'initiale de
l'organisation) → **Importer un logo**. L'image est réduite à 256 px max, ses
marges vides sont rognées, puis elle est enregistrée directement dans
`orgs/{orgId}.branding.logoUrl` (data-URL) — **aucun bucket Firebase Storage
n'est nécessaire**. En mode local sans compte, elle est gardée dans
`localStorage` (`mcps-local-logo`). Les autres rôles voient le logo mais ne
peuvent pas le modifier (la règle Firestore sur `orgs/{orgId}` est la vraie
barrière).

## Backend Stripe (dossier `functions/`)

Les boutons de facturation ("Passer au plan Pro", "Gérer mon abonnement")
appellent trois fonctions Cloud qui vivent dans `functions/index.js`. **Tant
qu'elles ne sont pas déployées, ces boutons affichent "Fonction non déployée"**
— ce n'est pas un bug de l'interface, c'est le backend qui manque.

```bash
cd functions && npm install && cd ..

# Clés Stripe (ne jamais les mettre dans le code front-end)
firebase functions:config:set stripe.secret="sk_live_xxx" stripe.webhook_secret="whsec_xxx"

firebase deploy --only functions
```

Puis dans le Dashboard Stripe → Webhooks, pointer vers l'URL de la fonction
`stripeWebhook` affichée après le déploiement. C'est ce webhook qui met à jour
`orgs/{orgId}.plan` tout seul après un paiement.

**Tester le backend sans rien déployer ni installer :**

```bash
npm run test:backend
```

## Déployer les règles et l'hébergement d'un coup

Le fichier `firebase.json` permet aussi :

```bash
firebase deploy --only firestore:rules   # équivaut au copier-coller manuel décrit plus haut
firebase deploy --only hosting           # alternative à Netlify Drop
```

## Config Firebase, Google, Stripe

Toujours au même endroit conceptuel — tout en haut de `js/01-app-core.js`
(`window.MCPS_CONFIG`), avec un environnement par nom (`development` /
`staging` / `production`) au lieu d'une config unique. Voir les
commentaires du "PATCH #11" dans ce fichier pour le détail de la résolution
automatique d'environnement.

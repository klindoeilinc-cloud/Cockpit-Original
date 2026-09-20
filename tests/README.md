# MCPS — Tests automatisés

Trois suites de tests, pour trois parties du système.

## 1. Application (front-end) — jsdom, exécuté et vérifié ✅

Suite unitaire + intégration + bout en bout (37 vérifications), exécutée
dans un DOM simulé avec Firebase entièrement mocké — pas besoin de
télécharger un navigateur, fonctionne dans n'importe quel environnement
Node. **Exécutée et passante (37/37)** avant chaque livraison depuis la
Phase 9 de l'audit technique.

```bash
npm install         # installe jsdom
npm test
```

C'est la suite à lancer en priorité : elle couvre la validation des
données, les permissions par rôle, la séparation client/prospect, la
détection de conflit à la sauvegarde cloud, le journal d'audit, et les
parcours utilisateur complets (créer/modifier/supprimer un client, un
prospect, un projet, une tâche, une facture, inviter un collaborateur...).

## 2. Backend (Cloud Functions) — exécuté et vérifié ✅

Teste le vrai `functions/index.js` : présence des fonctions appelées par le
front-end, extraction de l'organisation depuis un email d'invitation
(normalisation de casse comprise), et refus des appels non authentifiés.

```bash
npm run test:backend        # depuis la racine du projet
```

**Aucune installation requise** : les dépendances Firebase/Stripe sont
remplacées par des doublures pendant le test. Aucun appel ne part vers un vrai
projet Firebase ni vers Stripe. 8/8 tests passants.

*Note historique : ce fichier annonçait auparavant « 5/5 tests OK » pour une
suite Jest qui n'existait pas sur le disque. La suite a été réellement écrite
et le script `test:backend`, qui se contentait d'afficher un message, exécute
désormais ces tests.*

## 3. Frontend — Playwright (tests de fumée, dans un vrai navigateur) — exécuté et vérifié ✅

Vérifie dans un vrai Chromium que l'application se charge, que l'écran de
connexion réagit correctement, que la navigation fonctionne, et que le
sélecteur de langue bascule bien les libellés.

```bash
npm install
npx playwright install chromium   # une seule fois, si le binaire n'est pas déjà présent
npm run test:e2e
```

**Exécutée et passante (5/5)** — pour la première fois depuis l'écriture de
cette suite. Trois vrais bugs corrigés à cette occasion, invisibles tant que
personne n'avait pu la lancer dans un vrai navigateur :

1. La cible pointait encore vers `MCPS_Cockpit_Production_Universal.html` en
   `file://` — un fichier qui n'existe plus depuis le passage à la structure
   modulaire, et un protocole que l'application refuse de toute façon
   (`localStorage` bloqué en `file://`, voir plus haut). `playwright.config.js`
   sert désormais le dossier réel en http via `tests/static-server.js`.
2. Le test de bascule de langue comparait `nav.dashboard` entre "Tableau de
   Bord" et "Dashboard" — deux valeurs qui n'ont jamais existé dans le code
   (`nav.dashboard` vaut "Command Center" dans les deux langues, un choix de
   branding assumé). Corrigé pour comparer `nav.today` ("Aujourd'hui"/"Today"),
   qui varie réellement.
3. Le même test cliquait sur le sélecteur de langue sans d'abord ouvrir le
   panneau "Outils" qui le contient (replié par défaut,
   `#sb-tools-toggle[aria-expanded="false"]`) — timeout systématique.

La suite #1 (jsdom) couvre la même zone fonctionnelle sans navigateur et
reste la plus rapide à lancer en boucle pendant le développement ; celle-ci
valide en plus le rendu et les interactions réelles du DOM.

## Étendre la couverture

Pour chaque nouvelle fonctionnalité critique (ex. facturation avancée,
nouvelles intégrations), ajoute un test correspondant dans
`tests/mcps-test-suite.js` (suite #1) — c'est la plus rapide à exécuter et
la plus facile à maintenir sans dépendance à un navigateur.

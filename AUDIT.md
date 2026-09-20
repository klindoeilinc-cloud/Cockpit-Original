# MCPS Cockpit — Executive Technical Audit

**Fichier analysé :** MCPS Cockpit Production (version universelle multi-tenant)
**Taille :** ~9 000 lignes, fichier HTML unique, 29 balises `<script>`, 236 fonctions
**Méthode :** lecture exhaustive du code + exécution réelle en environnement Node/jsdom (chargement du DOM, simulation de saisies, ouverture de chaque modale, navigation dans chaque vue) pour valider les constats ci-dessous sur du comportement observé, pas seulement sur la lecture du texte.

---

## A. EXECUTIVE TECHNICAL AUDIT

MCPS Cockpit est aujourd'hui une application fonctionnelle et riche en fonctionnalités (11 vues, CRUD complet, authentification, multi-tenant basique, facturation, intégrations Google/Stripe/Slack), mais son architecture reste celle d'un **prototype qui a grandi**, pas d'un système SaaS conçu pour la charge et la concurrence.

Le risque dominant n'est pas fonctionnel — l'application fait ce qu'elle promet pour un seul utilisateur actif à la fois. Le risque est **structurel** : toutes les données d'une organisation vivent dans **un seul document Firestore**, toute sauvegarde réécrit ce document en entier, et les permissions sont binaires (peut écrire / ne peut pas écrire) plutôt que granulaires. Ce sont exactement les trois piliers qui casseront en premier dès qu'il y aura plus d'un utilisateur actif simultané par organisation, ou plusieurs dizaines d'organisations.

Trois bugs réels rencontrés pendant le développement (config Firebase, Google Calendar, Stripe toutes rendues inutilisables par le même défaut de portée de variable entre blocs `<script>`) confirment un **problème de fond récurrent**, pas des accidents isolés : l'absence d'un espace de noms global unique pour la configuration et l'état partagé.

**Verdict :** l'application est *prête pour une démonstration et un premier client pilote avec une seule personne active à la fois*. Elle n'est **pas encore prête** pour plusieurs utilisateurs simultanés par organisation, ni pour une croissance au-delà de quelques dizaines d'organisations, sans les corrections décrites en section D et le plan de migration en section I.

---

## B. CURRENT ARCHITECTURE

```
index.html (fichier unique, ~9000 lignes)
│
├── <head>
│   ├── CSS inline (2 blocs <style>, variables CSS pour thème clair/sombre)
│   └── 16 dépendances CDN chargées en <script src=> (aucun SRI/hash d'intégrité)
│
├── <body>
│   ├── Markup statique de toutes les 11 vues (dashboard, aujourd'hui, secteurs,
│   │   clients, projets, tâches, équipe, rapports, rapport direction, suivi, todo,
│   │   intelligence) — toutes présentes dans le DOM dès le chargement,
│   │   affichage/masquage via classe CSS .active
│   ├── Écran d'authentification (overlay plein écran, verrouille l'app via
│   │   classe body.auth-locked)
│   ├── Palette de commandes (Cmd/Ctrl+K)
│   └── ~15 modales (client, projet, tâche, facture, prospect, équipe...)
│
└── 29 balises <script> inline, exécutées séquentiellement au chargement :
    ├── Script principal (~5000 lignes) : état global DB + state, ~150 fonctions
    │   render*/submit*/open*Modal, logique métier, Chart.js
    ├── Bloc "MCPS Cloud Sync" : config Firebase/Google/Stripe (const locales
    │   à CE bloc — origine des 3 bugs de portée déjà rencontrés)
    ├── Bloc "AUTH & MULTI-TENANT CLOUD" : authentification, chargement/sauvegarde
    │   cloud, rôles, invitations, onboarding, facturation Stripe, intégration
    │   Google Calendar, tickets support
    └── Bloc "UI ENHANCEMENTS" : Fuse.js, palette de commandes, Flatpickr, Tippy
```

**Constat central :** il n'existe pas de séparation entre couche présentation, couche logique métier et couche persistance. Une fonction comme `submitClient()` lit directement les champs du DOM, valide sommairement, modifie l'objet global `DB`, et appelle `saveDB()` — les quatre responsabilités (lecture UI, validation, mutation, persistance) sont dans la même fonction de 8 lignes.

**État global :** un seul objet `let DB = { clients:[], projects:[], tasks:[], invoices:[], team:[] }` porte toutes les données de travail. 231 références directes à `DB.` sont dispersées dans le fichier. Aucune fonction n'est propriétaire exclusive d'une entité — n'importe quelle fonction peut lire ou muter n'importe quel tableau.

**Chaîne de wrappers `saveDB`** (confirmée par lecture directe du code) :
```
function saveDB() { ... }                                    // original, ligne 2437
window.saveDB = function(){ normalizeBusinessRules(); ... }  // wrapper 1, ligne 7625
window.saveDB = function(){ ... }                             // wrapper 2, ligne 8211
window.saveDB = function(){ ... }                             // wrapper 3, ligne 8221
window.saveDB = function(){ ... }                             // wrapper 4, ligne 8467
```
Chaque nouvelle fonctionnalité ayant eu besoin de réagir à une sauvegarde (sync cloud, rafraîchissement de l'Intelligence Layer, etc.) a ajouté un wrapper de plus autour de `saveDB` plutôt que de s'abonner à un point d'extension central. C'est exactement l'anti-pattern que le brief interdit explicitement (§29) — et il existe déjà en production.

---

## C. DATA MODEL

Entités réellement présentes dans le code (vérifiées via les fonctions `submit*`, pas supposées) :

### Client (`DB.clients[]`) — **partagé avec Prospect**
| Champ | Type | Statut |
|---|---|---|
| id | number | requis, auto-incrémenté (`nextId.client`) |
| name | string | requis |
| sector | string | requis |
| needs | string[] | optionnel |
| brief | string | optionnel |
| budget | number | optionnel |
| contractDuration | number | optionnel |
| color | string (hex) | requis |
| avatar | string (2 lettres) | dérivé du nom |
| tab / type | string | distingue client actif / prospect / appel d'offre / clôturé |
| prospectStatus | string | présent seulement si prospect (pipeline) |

⚠️ **Smell de modélisation :** Client et Prospect sont la **même entité** distinguée par un indicateur, alors que leurs champs pertinents divergent déjà (`budget`/`contractDuration` côté client, `prospectStatus` côté pipeline). C'est gérable aujourd'hui, ça deviendra une source de bugs quand l'un des deux évoluera sans l'autre.

### Project (`DB.projects[]`)
id, name, clientId (référence), status, priority, startDate, endDate, estimatedHours, responsable

### Task (`DB.tasks[]`)
id, name, clientId, projectId, assignedTo, status (`Non démarré`/`En cours`/`À suivre`/`Terminé`), startDate, endDate, estimatedHours, realHours, revisions, qualityRating (1-5), completedDate

### Invoice (`DB.invoices[]`)
id, number, clientId, projectId (optionnel), label, amount, status, issueDate, dueDate, paidDate

### TeamMember (`DB.team[]`)
id, name, role, phone, email, color, isApporteur (bool)

### Todo (`state.todos[]`)
Liste personnelle, hors périmètre client/projet.

### Entités niveau organisation (Firestore, hors `DB`)
- `users/{uid}` → `{ orgId, role, email }`
- `orgs/{orgId}` → `{ name, ownerUid, createdAt, plan, trialEndsAt, branding }`
- `orgs/{orgId}/data/cockpit` → **un seul document contenant l'intégralité de `DB`** (clients+projects+tasks+invoices+team sérialisés ensemble)
- `orgs/{orgId}/support_tickets/{id}` → tickets d'aide
- `invites/{email}` → invitation en attente `{ orgId, role }`

**Relations non formalisées :** `clientId`, `projectId`, `assignedTo` sont des références par identifiant simple, sans contrainte d'intégrité ni de validation qu'un `clientId` référencé existe réellement. Supprimer un client ne nettoie pas ses projets/tâches/factures associés (orphelins silencieux).

---

## D. CRITICAL RISKS

### 🔴 P0 — Critique
1. **Un document Firestore par organisation contient TOUTES les données.** Chaque sauvegarde réécrit l'intégralité de `clients+projects+tasks+invoices+team` en un seul `set()`. Deux utilisateurs de la même organisation actifs en même temps → le second `saveDB()` écrase silencieusement les changements du premier. Aucun champ `updatedAt`/`updatedBy`/`version` n'existe pour détecter ce cas.
2. **RBAC binaire, pas granulaire.** Un rôle autre que `readonly` peut tout écrire dans le document de l'organisation (clients, factures, équipe, branding). Il est impossible aujourd'hui d'avoir un `member` qui gère les tâches sans voir la facturation.
3. **Chaîne de 4 wrappers successifs autour de `saveDB`** — comportement au chargement dépendant de l'ordre d'exécution des blocs `<script>`, donc fragile à toute réorganisation future.
4. **Zéro test automatisé.** 236 fonctions, aucune suite unitaire, d'intégration ou E2E. Toute la validation faite pendant ce projet l'a été manuellement via des scripts d'audit temporaires, jamais livrés avec le produit.
5. **Pattern de bug de portée de variable déjà survenu 3 fois** (`FIREBASE_CONFIG`, `GOOGLE_CLIENT_ID`, `STRIPE_PRICE_ID_PRO` — chacun déclaré `const` dans un bloc `<script>` et utilisé, sans succès jusqu'à correction, dans un autre). Racine : pas d'espace de noms de configuration partagé. Se reproduira avec la prochaine intégration si non corrigé structurellement.
6. **Aucun hash d'intégrité (SRI) sur les 16 dépendances CDN.** Un CDN compromis ou une attaque MITM peut injecter du code arbitraire avec accès complet aux identifiants Firebase et aux données affichées.

### 🟠 P1 — Important
7. Le plafond du plan gratuit n'est vérifié côté Firestore que sur `clients.size() <= 3` — projets, tâches et factures restent illimités même en plan gratuit.
8. La règle Firestore `users/{uid}` dépend d'un `get()` sur le profil du demandeur lui-même — même famille de fragilité que le bug d'ordre de création déjà rencontré (voir historique du projet).
9. Modèle Client/Prospect conflaté dans un seul tableau (voir section C).
10. **Aucun journal d'audit.** Changements de rôle, suppressions, modifications de facture ne laissent aucune trace consultable au-delà de l'écriture Firestore elle-même.
11. 5 blocs `catch(e){}` vides recensés — erreurs avalées silencieusement, pattern explicitement interdit par la charte du projet.
12. Pas de "error boundary" global : `window.onerror` / `window.onunhandledrejection` ne sont pas captés, une erreur dans une fonction de rendu peut laisser l'interface dans un état partiellement affiché.

### 🟡 P2 — Amélioration
13. 109 injections `innerHTML` contre 174 appels à `esc()` — la discipline d'échappement semble globalement respectée mais n'a pas été vérifiée exhaustivement point par point.
14. Pas de file d'attente hors-ligne : en cas de coupure réseau pendant une sauvegarde, la donnée reste seulement locale sans indicateur "en attente de synchronisation".
15. Pas de séparation d'environnements (dev/staging/prod) — une seule configuration Firebase, risque de tester contre les données réelles.

### ⚪ P3 — Optimisation
16. La plupart des `render*()` regénèrent tout le `innerHTML` de leur vue à chaque changement, y compris pour une modification unitaire — tiendra à l'échelle actuelle, se dégradera avec plusieurs centaines de lignes.
17. 5 `DOMContentLoaded` indépendants plutôt qu'une séquence de démarrage orchestrée unique.

---

## E. TECHNICAL DEBT

- Fonctions à responsabilités multiples (lecture DOM + validation + mutation + persistance + rendu) dans la quasi-totalité des `submit*()`.
- Duplication de logique de rendu de badge de statut entre plusieurs vues (tâches, suivi, aujourd'hui) au lieu d'un composant unique.
- Références DOM par `getElementById` répétées plutôt que mises en cache.
- Pas de couche de validation centralisée — chaque `submit*()` valide à sa manière (parfois juste `if(!name)`, parfois rien).
- Historique de correctifs "en place" (ex. neutralisation de `syncToCloud()` laissée commentée dans le code plutôt que supprimée) — bon réflexe de traçabilité pendant le développement itératif, mais à nettoyer avant une passe de stabilisation.

---

## F. SECURITY RISKS

- **Écrasement de document sans contrôle de concurrence** (voir D.1) — c'est aussi un risque de sécurité au sens large : un rôle `member` malveillant ou compromis peut, via un simple `set()` complet, retirer discrètement des données d'autres personnes de l'organisation sans que cela ressemble à une attaque.
- **Permissions all-or-nothing côté Firestore** sur le document complet — pas de moyen de restreindre un rôle à un sous-ensemble de champs (ex. empêcher un `member` de modifier `branding` ou `team`).
- **Pas de SRI sur les CDN** (voir D.6).
- **Pas de journal d'audit** rend toute investigation post-incident quasiment impossible.
- Points positifs confirmés : les identifiants Firebase (`apiKey` etc.) sont volontairement vides dans le fichier livré — bonne pratique pour un template distribué ; l'échappement HTML (`esc()`) est utilisé de façon large ; les règles Firestore actuelles isolent correctement une organisation d'une autre pour la lecture/écriture du bloc de données principal.

---

## G. RELIABILITY RISKS

- Pas de détection de perte de connexion / mode dégradé — l'utilisateur peut croire que son travail est sauvegardé alors que la dernière écriture cloud a échoué silencieusement (`catch(e=>console.error(...))` sans retour visible à l'utilisateur sur les fonctions de sync).
- Pas de mécanisme de reprise après échec d'écriture Firestore.
- Aucune sauvegarde/restauration versionnée au niveau organisation — une erreur de manipulation (ex. suppression accidentelle) n'a pas de chemin de récupération autre que la mémoire de l'utilisateur.
- Le document unique par organisation devient aussi un risque de **taille de payload** : plus une organisation grandit (des centaines de tâches), plus chaque sauvegarde réécrit un document de plus en plus lourd, ce qui dégrade la latence de sauvegarde pour TOUTES les modifications, même mineures.

---

## H. TARGET ARCHITECTURE

Cible réaliste, adaptée à la base existante plutôt qu'une réécriture greenfield :

```
Firestore (structure cible)
organizations/{orgId}
users/{uid}
organizations/{orgId}/clients/{clientId}
organizations/{orgId}/prospects/{prospectId}      ← séparé de clients
organizations/{orgId}/projects/{projectId}
organizations/{orgId}/tasks/{taskId}
organizations/{orgId}/invoices/{invoiceId}
organizations/{orgId}/team/{memberId}
organizations/{orgId}/audit_logs/{logId}
```

```
Code (conceptuel, adapté au HTML unique existant — pas une réécriture en modules ES/bundler à ce stade)
window.MCPS = {
  config: { firebase, google, stripe },   ← fixe définitivement les 3 bugs déjà rencontrés
  state:  { db, user, org, role },
  repositories: { clients, projects, tasks, invoices, team },  ← un point d'entrée par entité
  permissions: { can(user, action, resource) },
  mutate: async (type, payload) => { validate → authorize → execute → persist → audit → render },
}
```

Chaque entité passe d'un tableau dans un document unique à sa propre sous-collection Firestore, avec ses propres règles de sécurité et sa propre granularité de synchronisation — une tâche modifiée ne réécrit plus le document des factures.

---

## I. MIGRATION PLAN

Étapes séquentielles, chacune testée et non régressive avant la suivante :

1. **Namespace de configuration unique** (`window.MCPS_CONFIG`) — élimine la classe de bug déjà rencontrée 3 fois, sans toucher à la logique métier. *(= Patch L ci-dessous.)*
2. **Pipeline de mutation centralisé** — introduire `mutate(type, payload)` comme point d'entrée unique, dans lequel `saveDB()` devient un détail d'implémentation interne plutôt qu'un point d'extension public. Les 4 wrappers existants sont fusionnés en une seule chaîne explicite (validate → authorize → execute → persist → render) au lieu de réassignations successives de `window.saveDB`.
3. **Séparation Client / Prospect** dans le modèle de données, avec script de migration des données existantes (`tab==='prospects'` → nouvelle collection), en gardant une compatibilité de lecture le temps de la transition.
4. **Éclatement du document unique en sous-collections Firestore** — migration progressive entité par entité (tâches d'abord, car volume le plus élevé et le moins interdépendant), avec double-écriture temporaire (ancien document + nouvelle sous-collection) le temps de valider en conditions réelles avant de couper l'ancien chemin.
5. **RBAC granulaire** (`can(user, action, resource)`) côté client ET règles Firestore par sous-collection, remplaçant le `role !== 'readonly'` unique actuel.
6. **Champs de concurrence** (`updatedAt`, `updatedBy`, `version`) sur chaque document désormais individuel, avec détection de conflit à l'écriture.
7. **Journal d'audit** — nouvelle sous-collection `audit_logs`, alimentée depuis le pipeline de mutation (étape 2), donc un seul point d'instrumentation pour toutes les actions.
8. **Error boundary global** + catégorisation des erreurs (§15 du brief) — indépendant des étapes précédentes, peut être fait en parallèle à tout moment.
9. **Tests automatisés** — introduits progressivement à partir de l'étape 2 (le pipeline de mutation centralisé est justement ce qui rend les tests unitaires possibles ; aujourd'hui, tester `submitClient()` isolément est difficile car elle mélange DOM et logique).

Aucune étape ne supprime de fonctionnalité existante avant que son remplacement soit validé en conditions réelles.

---

## J. TEST STRATEGY

- **Unitaires :** fonctions de validation, calcul des 14 indicateurs de l'Intelligence Layer, formatters (`formatXOF`, `fmtDate`), fonction `can()` une fois introduite.
- **Intégration :** cycle complet création/lecture/modification/suppression pour chaque entité contre un projet Firebase de test dédié (jamais le projet de production).
- **E2E (scénarios prioritaires, déjà tous vérifiés manuellement pendant ce projet — à automatiser) :** inscription → création d'organisation, connexion, invitation d'un collaborateur avec consommation d'invitation, création client/projet/tâche/facture, changement de statut de tâche avec bascule "À suivre", déplacement d'un prospect par glisser-déposer, export PDF.
- **Non-régression :** rejouer systématiquement les 3 bugs déjà rencontrés (portée de config, ordre de création à l'inscription, règle de suppression d'invitation) comme cas de test permanents — ce sont les points les plus fragiles historiquement.

---

## K. IMPLEMENTATION ROADMAP

| Phase | Contenu | Risque |
|---|---|---|
| 0 | Audit (ce document) | — |
| 1 | Stabilisation : namespace config unique, suppression des wrappers `saveDB` redondants | Faible |
| 2 | Pipeline de mutation centralisé | Moyen |
| 3 | Validation centralisée par entité | Faible |
| 4 | RBAC granulaire (`can()`) côté client puis règles Firestore | Moyen |
| 5 | Séparation Client/Prospect + sous-collections Firestore | Élevé (migration de données) |
| 6 | Champs de concurrence + détection de conflit | Moyen |
| 7 | Journal d'audit | Faible |
| 8 | Error boundary global + catégorisation des erreurs | Faible |
| 9 | Tests automatisés (unit → intégration → E2E) | — (réduit le risque de tout le reste) |
| 10 | File d'attente hors-ligne + indicateurs de synchronisation | Moyen |
| 11 | SRI sur les dépendances CDN, séparation des environnements | Faible |
| 12 | Optimisation du rendu (updates ciblés plutôt que re-render complet) | Faible |

---

## L. FIRST SAFE PATCH

**Action :** créer un unique objet `window.MCPS_CONFIG` déclaré tout en haut du premier bloc `<script>`, contenant `firebase`, `googleClientId`, et `stripePriceId`. Remplacer les trois `const` actuellement isolées dans des blocs `<script>` différents par des lectures de `window.MCPS_CONFIG.*`.

**Pourquoi celle-ci en premier :**
- **Petite** — un seul objet à créer, trois points de lecture à rediriger.
- **Réversible** — aucune donnée ni schéma touché, purement une réorganisation de variables.
- **Testable** — reproductible immédiatement par exécution réelle du fichier (comme fait pendant ce projet) : appeler `_connectGoogleCalendar()` et `_startCheckout()` sans erreur de type "variable non définie" est un test de non-régression direct et automatisable dès aujourd'hui.
- **Faible risque** — ne touche à aucune règle Firestore, aucune donnée utilisateur, aucun flux d'authentification.
- **Utile pour la suite** — établit le pattern "configuration et état partagés vivent dans un espace de noms explicite unique" sur lequel repose toute la Phase 2 (pipeline de mutation centralisé). C'est la fondation la plus naturelle avant d'attaquer quoi que ce soit de plus structurant.

Cette même classe de bug (variable `const` locale à un bloc `<script>`, utilisée sans succès dans un autre) a déjà été rencontrée et corrigée trois fois séparément pendant le développement de ce projet — ce correctif la ferme définitivement plutôt que de continuer à la corriger au cas par cas à chaque nouvelle intégration.

---

# M. JOURNAL DE RÉSOLUTION — état au terme du cycle de durcissement

Cette section est ajoutée après l'exécution des 12 phases de l'audit, de la
sortie du fichier unique vers une structure modulaire, de la transformation
UI/UX Enterprise, puis du durcissement sécurité pour une V1 commerciale.

## Résolu et vérifié

| Sujet | Correctif |
|---|---|
| Portée de configuration (3 régressions distinctes) | `window.MCPS_CONFIG` unique, déclaré en tout premier |
| 4 wrappers empilés sur `saveDB` | Un seul `saveDB()` + deux tableaux de hooks (pré/post), chaque hook isolé dans son try/catch |
| Validation dispersée et incomplète | `MCPS_VALIDATE` centralisé, 5 entités, appelé par les 6 `submit*()` |
| RBAC binaire côté interface | Matrice de permissions + `can(action)`, 4 rôles |
| **RBAC non appliqué côté serveur** | **Règles Firestore par rôle : `member` ne peut plus modifier facturation ni équipe** |
| **Élévation de privilège possible** | **Un utilisateur ne peut plus s'attribuer `admin` ni changer d'organisation via l'API** |
| **Journal d'audit non fonctionnel en production** | **Aucune règle n'existait pour `audit_logs` → Firestore refusait tout, l'échec était avalé. Règles ajoutées + journal rendu immuable + message d'erreur actionnable** |
| **`firestore.rules` absent du livrable** | **Fichier intégré au projet + procédure de déploiement documentée dans le README** |
| Écrasement silencieux entre utilisateurs | Transaction + numéro de version, conflit détecté et signalé |
| Client et Prospect confondus | Tableaux séparés + migration idempotente (local et cloud) |
| Aucune trace des actions | Journal d'audit sur 8 types d'actions + visionneuse admin |
| Aucune capture d'erreur globale | `window.onerror` + `unhandledrejection` + filet autour de `go()` |
| Zéro test livré | Suite permanente de 50 vérifications (`npm test`) |
| Échec de sauvegarde invisible | Indicateur 🟢/🟡/🔴/⚠️ + reprise automatique à la reconnexion |
| Dépendances CDN sans intégrité | SRI SHA-384 sur les 13 dépendances jsdelivr |
| Pas de séparation d'environnements | `development` / `staging` / `production`, résolus par nom d'hôte |
| Index de recherche reconstruits à chaque frappe | Cache partagé, invalidé uniquement à la sauvegarde |
| Bugs de rendu facturation | Deux références DOM non protégées corrigées |
| Règle métier jamais exécutée | `window.DB` → `DB` (la condition était toujours fausse) |
| Tri de tableau promis mais absent | Tri générique réel (texte/nombre/date) sur tout `<th data-sort>` |
| Erreurs de formulaire fugaces | Bandeau persistant avec `role="alert"`, effacé à la réouverture |
| Accessibilité quasi absente | Focus clavier global, `role="dialog"`, libellés automatiques, Échap |
| CSS mort et doublons | 19 règles supprimées après triple vérification ; doublons de table consolidés |

## Dette technique restante (assumée, documentée)

1. **Document Firestore unique par organisation.** Toutes les données d'une
   organisation vivent dans `orgs/{id}/data/cockpit`. Conséquences : la
   granularité des règles de sécurité se fait par comparaison de champs plutôt
   que par ressource, et chaque sauvegarde réécrit l'ensemble. Tient pour une
   V1 avec des organisations de taille modérée ; la migration vers des
   sous-collections par entité reste le chantier structurant suivant, et exige
   un vrai projet Firebase pour être validée sans risque.
2. **Client/Prospect partiellement séparés.** Les tableaux sont distincts, les
   points de mutation critiques traités ; il reste des lectures historiques à
   migrer progressivement vers `getClients()` / `getProspects()`.
3. **Fichier unique de 9 600 lignes éclaté en 8, pas en modules ES.** Choix
   délibéré : ce code s'est montré fragile aux questions de portée. Un passage
   à de vrais modules reste possible, mais demande sa propre campagne de tests.
4. **~47 doublons CSS restants** sur les 66 détectés — les plus risqués à
   toucher, gain marginal (le nettoyage effectué représentait 3,5 % du fichier).
5. **Tests Playwright jamais exécutés** dans cet environnement (téléchargement
   du navigateur bloqué). Écrits et prêts ; à lancer une première fois en local.
6. **Aucune exécution contre un vrai projet Firebase.** Tout a été vérifié en
   environnement simulé (jsdom + Firebase mocké). C'est la limite principale de
   tout ce qui précède : les règles de sécurité, en particulier, doivent être
   testées en conditions réelles avec plusieurs comptes de rôles différents.

## Risques connus avant mise en production

- **Si `firestore.rules` n'est pas déployé, le produit n'est pas sécurisé.**
  C'est le point unique de défaillance le plus important. Voir README.
- Pas de récupération de mot de passe oublié.
- L'invitation d'un collaborateur n'envoie aucun email automatique : la
  personne doit être prévenue par un autre canal.
- Pas de sauvegarde/restauration versionnée au niveau organisation.

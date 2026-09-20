# MCPS Cockpit — Audit fonctionnel critique & stratégie de différenciation

**Objet :** identifier, sans complaisance, ce qui manque à MCPS Cockpit pour
que le produit tienne réellement la promesse de son nom (*Marko Creative
Performance System*) et soutienne une équipe marketing/communication dans
son travail quotidien — pas seulement dans la gestion administrative de
l'agence qui l'entoure.

**Méthode :** lecture exhaustive du code livré (12 vues, modèle de données,
14 indicateurs de l'"Intelligence Layer", intégrations, collaboration,
reporting) — inventaire factuel disponible en détail dans l'historique de
ce document ; ce qui suit est l'analyse produit, pas l'audit technique
(voir `AUDIT.md` pour l'architecture/sécurité).

---

## A. Verdict, sans détour

**MCPS Cockpit n'est pas un outil marketing. C'est un outil de gestion
d'agence (PSA — *Professional Services Automation*) : CRM léger, gestion
de projets/tâches, facturation, RH d'équipe, reporting direction.** Tout ce
qui existe dans le code sert à piloter *l'agence elle-même* — combien de
clients, combien d'heures, qui est en retard, qui facture quoi. Rien dans
le code ne sert à *faire* du marketing ou de la communication : pas de
calendrier éditorial, pas de gestion de campagne au sens propre, pas de
bibliothèque de contenu, pas de workflow d'approbation créative, pas de
publication, pas d'analytics de performance de campagne, pas de portail
client.

Le mot "Campagnes" apparaît une fois dans l'interface (vue Rapport
Direction) — c'est un relabellage d'affichage des `Projects` génériques,
avec les mêmes champs (statut, priorité, dates, heures). Aucune notion de
canal, de budget média, de date de publication, de portée ou d'engagement
n'existe dans le modèle de données. C'est le symptôme le plus révélateur du
problème : **le produit parle le langage du marketing en façade, mais son
squelette est celui d'un cabinet de conseil générique.**

L'"Intelligence Layer", malgré son nom, n'est pas de l'intelligence
artificielle : c'est un moteur de 14 KPI calculés par formule fixe, avec un
générateur de texte de diagnostic piochant dans une banque de phrases
pré-écrites selon des seuils. C'est un bon tableau de bord de production
créative interne (délais, révisions, charge, rentabilité horaire) — mais
ça ne rapproche en rien l'agence de ses vrais indicateurs marketing
(portée, engagement, conversion, ROAS, share of voice), qui n'existent nulle
part dans le produit.

**Constat central : MCPS aide une agence à savoir si elle est bien gérée en
interne. Il n'aide en rien une équipe marketing/communication à mieux
concevoir, produire, faire approuver, publier ou mesurer ce qu'elle
produit pour ses clients.** C'est la moitié du problème qui manque — et
c'est la moitié qui porte le nom du produit.

---

## B. Où se situe MCPS dans le paysage — et pourquoi il ne différencie de personne aujourd'hui

| Catégorie | Ce qu'ils font | Exemples | MCPS aujourd'hui |
|---|---|---|---|
| PSA / gestion d'agence | Temps, facturation, rentabilité, ressourcing | Scoro, Productive.io, Function Point, Accelo, Streamtime, Bonsai | **C'est exactement ça** — en moins mature (pas de sous-traitants, pas de devis, pas de gestion de rétainers) |
| Calendrier éditorial / social | Planification de contenu multi-canal, publication programmée | CoSchedule, Planable, Loomly, Later, Hootsuite | **Absent à 100%** |
| Approbation créative / DAM | Proofing visuel, commentaires positionnés, versions, marque | Frame.io, Ziflow, Bynder, Filestage | **Absent à 100%** |
| Performance marketing | ROAS, analytics social/ads consolidés | Sprout Social, Supermetrics, AgencyAnalytics | **Absent à 100%** |
| Gestion de projet créative généraliste | Vues Kanban/Gantt, portail client | Asana, Monday, ClickUp + template agence | Partiellement recouvert, sans les avantages de portail/collaboration externe |

MCPS n'a aujourd'hui **aucune fonctionnalité qui n'existe pas déjà,
en mieux, dans un outil PSA générique gratuit ou peu cher.** Sa seule
originalité actuelle — le moteur de "diagnostic" textuel de
l'Intelligence Layer — est un habillage au-dessus de KPI standards, pas un
avantage défendable : n'importe quel concurrent peut reproduire des
seuils + des phrases pré-écrites en une semaine.

**Le danger stratégique n'est pas "il manque des fonctionnalités".
C'est que le produit, tel quel, est un concurrent de seconde zone sur un
marché (PSA d'agence) déjà saturé d'acteurs matures, alors qu'il porte un
nom et une promesse ("Creative Performance System") qui pointent vers un
marché adjacent (l'outillage du travail créatif/marketing lui-même) qui
est, lui, beaucoup moins consolidé et où une vraie différenciation est
possible.**

---

## C. Ce qui manque — par ordre d'impact sur la promesse du produit

### C.1 — Un vrai modèle de Campagne (pas un Project relabellé)
Aujourd'hui : `Project{name, clientId, status, priority, dates, hours,
responsable}`. Pour qu'une agence marketing pilote une campagne, il faut au
minimum : canaux (réseaux sociaux, email, presse, display, influence…),
objectif (notoriété/conversion/rétention), budget média distinct du budget
de production, dates de publication (pas seulement début/fin de projet),
audience cible, et un lien vers les contenus produits pour cette campagne.
Sans ça, impossible de répondre à la question la plus basique qu'une
direction marketing pose : *"combien nous coûte et nous rapporte cette
campagne, tous canaux confondus ?"*

### C.2 — Calendrier éditorial multi-canal
C'est la fonctionnalité la plus attendue par toute équipe communication et
la plus absente. Une vue calendrier (mois/semaine) où chaque contenu a un
canal, un statut de production (idée → brouillon → en validation → validé →
programmé → publié), une date/heure de publication, et un aperçu visuel.
Sans elle, le produit ne peut objectivement pas prétendre "soutenir une
équipe marketing et communication" — c'est l'outil de travail quotidien de
ce métier, pas une fonctionnalité parmi d'autres.

### C.3 — Workflow d'approbation créative avec le client
Le champ `revisions` (nombre) existe déjà et alimente plusieurs indicateurs
— la donnée métier est reconnue comme importante, mais son *interface*
n'existe pas. Il manque : upload d'un visuel/document, commentaires
positionnés dessus (comme Frame.io/Ziflow), statut d'approbation par
version, historique des versions successives, et surtout **un accès pour
le client externe** — pas seulement pour un `member` interne à
l'organisation. Aujourd'hui, un client ne peut ni voir, ni commenter, ni
approuver quoi que ce soit dans l'outil : toute validation se fait hors
produit (email, WhatsApp...), ce qui vide de son sens la donnée
`revisions` que l'Intelligence Layer prend pourtant très au sérieux.

### C.4 — Portail / espace client
Corollaire direct de C.3, mais plus large : un rôle "client" en lecture
partielle (voir l'avancement de ses projets/campagnes, ses factures, ses
livrables, laisser des commentaires) sans avoir accès à l'agence entière.
C'est un standard de facto dans les outils PSA modernes (Scoro, Bonsai,
Productive le proposent tous) et c'est la porte d'entrée naturelle vers
l'approbation créative (C.3).

### C.5 — Bibliothèque de contenu / gestion d'actifs de marque (DAM léger)
Rien n'existe pour stocker et retrouver : logos/guidelines de marque par
client (au-delà du logo de l'agence elle-même, qui lui a son mécanisme),
visuels validés, textes/copy réutilisables, templates. Sans ça, chaque
nouvelle demande créative repart de zéro et rien ne capitalise le travail
déjà produit pour un client.

### C.6 — Connexion aux vrais indicateurs marketing (analytics)
Le "Creative ROI" actuel divise le revenu facturé par les heures
travaillées — c'est un ratio de rentabilité *de l'agence*, pas un ROI
marketing. Il manque toute connexion aux plateformes qui produisent la
vraie donnée de performance : Google Analytics 4, Meta/Google/LinkedIn Ads
(dépense, impressions, clics, conversions), insights natifs des réseaux
sociaux. Même une intégration minimale (import CSV ou une seule API, par
exemple GA4) donnerait à l'Intelligence Layer une deuxième jambe : non
seulement "sommes-nous efficaces en interne" mais "est-ce que ce qu'on
produit marche réellement pour le client" — c'est la question qui justifie
l'existence même d'une équipe marketing.

### C.7 — Publication / programmation (même minimale)
Pas besoin de réinventer Hootsuite : même un simple export "prêt à
publier" (texte + visuel + date prévue) par canal, ou une intégration à un
seul réseau pour commencer (ex. Meta Business API pour Facebook/Instagram),
transformerait le calendrier éditorial (C.2) d'un simple planning en un
outil qui fait gagner un geste réel chaque semaine.

### C.8 — Briefs structurés (au lieu d'un champ texte libre)
`brief` est aujourd'hui une simple chaîne de texte, et le "Brief Quality
Score" de l'Intelligence Layer évalue... sa longueur en caractères. C'est
un proxy grossier. Un vrai formulaire de brief structuré (objectifs,
audience, ton, contraintes, références, deadline, budget) par type de
prestation transformerait une mesure cosmétique en donnée réellement
exploitable, et accélérerait le démarrage de chaque nouvelle
tâche/campagne.

### C.9 — Collaboration réelle en équipe
Aujourd'hui : invitations par `prompt()` (pas de formulaire), aucune
notification email (ni pour une échéance, ni pour une mention, ni pour une
tâche assignée — seule une alerte Slack existe, et seulement quand
l'Intelligence Layer globale passe "Critique"), pas de commentaires
threadés sur une tâche/un client, pas de mentions `@membre`. Pour une
équipe qui doit *travailler ensemble* au quotidien sur des livrables
créatifs, l'absence de fil de discussion contextuel est un manque
opérationnel de base, pas un détail.

### C.10 — Assistant IA concret
Le nom "Intelligence Layer" crée une attente d'IA que le produit ne tient
pas : c'est un moteur à seuils et texte pré-écrit, entièrement
déterministe. Une vraie couche IA générative apporterait une différenciation
immédiate et alignée avec le nom du produit : génération de premiers jets
de copy à partir d'un brief structuré (C.8), résumé automatique de
l'avancement d'une campagne pour le client, suggestions de créneaux de
publication à partir de l'historique de performance (C.6), détection
proactive de dérive de brief. C'est probablement l'axe qui rapprocherait le
plus vite le produit de sa promesse de nom.

---

## D. Le vrai différenciateur — celui que personne d'autre ne peut copier facilement

Les outils de calendrier éditorial (Planable, Loomly...) ne savent rien de
la rentabilité de l'agence. Les outils PSA (Scoro, Productive...) ne
savent rien de la performance des campagnes produites. **Personne sur le
marché ne relie aujourd'hui, dans un seul produit, le coût réel de
production (heures, révisions, équipe) à la performance réelle obtenue
(portée, conversion, ROAS) pour un même livrable.** C'est exactement le
pont que l'architecture actuelle de MCPS — `Task` liée à `Client`/`Project`,
heures réelles, révisions, notes qualité, plus une couche d'indicateurs déjà
en place — est la mieux placée pour construire, si C.1 (vrai modèle de
campagne) et C.6 (connexion aux analytics) sont faits.

**La proposition de valeur défendable n'est pas "encore un calendrier de
contenu" ni "encore un outil de gestion de projet créatif" — c'est
"le seul cockpit où une direction marketing voit, sur un même écran, ce
qu'un contenu a coûté à produire ET ce qu'il a rapporté."** C'est
précisément la question que le "Rapport Direction" actuel prétend adresser
sans les données pour y répondre.

---

## E. Feuille de route priorisée

| # | Chantier | Pourquoi maintenant | Effort relatif |
|---|---|---|---|
| 1 | **Livré** — Modèle de Campagne dédié (canaux, budget média, objectif, date de publication) — extension additive de `Project`, aucun champ requis | Débloque tout le reste (C.1) | Moyen |
| 2 | Calendrier éditorial (vue mois/semaine par canal et statut) | Fonctionnalité la plus visible, la plus attendue (C.2) | Moyen |
| 3 | Rôle "client" + portail en lecture/commentaire limité | Débloque l'approbation (C.3/C.4), déjà partiellement supporté par le RBAC existant | Moyen |
| 4 | Workflow d'approbation créative (upload, commentaires positionnés, versions, statut) | Donne enfin un sens produit au champ `revisions` déjà central dans l'Intelligence Layer | Élevé |
| 5 | Une intégration analytics (GA4 en premier — API simple, gratuite) reliée par campagne | Bascule l'Intelligence Layer d'indicateurs internes vers de la vraie performance marketing (C.6) | Moyen |
| 6 | **Livré** — Briefs structurés (objectifs, audience, ton, contraintes, échéance) | Améliore un indicateur déjà existant sans rien casser (C.8) | Faible |
| 7 | Notifications email + commentaires threadés + formulaire d'invitation | Hygiène de collaboration minimale attendue en 2026 (C.9) | Faible/Moyen |
| 8 | Bibliothèque de contenu/marque par client (DAM léger) | Capitalisation, prérequis naturel de C.2/C.3 | Moyen |
| 9 | Assistant IA (premiers jets de copy depuis un brief structuré, résumés automatiques) | Aligne le produit sur son propre nom, différenciation rapide une fois 1/6/8 en place | Moyen/Élevé |
| 10 | Publication programmée (au moins un canal) | Complète la boucle calendrier → publication, une fois 2 stable | Élevé (dépend d'API tierces) |

Ordre volontairement conçu pour que chaque étape s'appuie sur la
précédente sans réécriture : le modèle de Campagne (1) est un sur-ensemble
de `Project`, le rôle client (3) réutilise le RBAC déjà en place, les
briefs structurés (6) réutilisent le champ `brief` existant.

---

## F. Ce qu'il ne faut *pas* faire

- Ne pas tenter de recréer Hootsuite/Sprout Social en interne (gestion native
  de dizaines de réseaux sociaux, modération, écoute sociale) — c'est un
  produit à part entière, hors de portée d'une équipe qui maintient déjà un
  fichier unique historique de 9600 lignes. Mieux vaut une intégration
  légère (export/API) qu'une réimplémentation.
- Ne pas ajouter de fonctionnalités marketing génériques sans lien avec les
  données déjà produites par l'agence (heures, révisions, factures) — c'est
  précisément ce lien (section D) qui est le seul avantage compétitif
  disponible. Une fonctionnalité de calendrier éditorial "à plat", sans
  connexion à la rentabilité et à la performance, ne fait que rejoindre la
  liste des concurrents au lieu de s'en différencier.
- Ne pas renommer prématurément "Intelligence Layer" en fonctionnalité IA
  tant qu'aucune génération réelle n'existe — le nom actuel crée déjà une
  attente que le produit ne tient pas ; en rajouter sans livrer serait
  aggraver l'écart entre promesse et réalité.

---

## G. Résumé en une phrase

**MCPS Cockpit gère aujourd'hui très bien l'agence qui fait du marketing ;
il ne fait pour l'instant aucun marketing lui-même — combler cet écart
(campagne réelle, calendrier éditorial, approbation client, connexion à la
performance) est la condition non négociable pour que le produit tienne la
promesse de son propre nom.**

---

## H. Positionnement de créneau (décidé — à valider terrain, voir `VALIDATION-TERRAIN.md`)

**Thèse :** le pont coût de production ↔ performance marketing réelle
(section D) est l'avantage produit. Il devient un **moat**, pas seulement
une avance, une fois combiné à une localisation profonde qu'aucun acteur
global n'a intérêt économique à faire pour un marché qu'il juge trop
petit : facturation en XOF via Mobile Money (pas seulement Stripe),
collaboration via WhatsApp (pas Slack/email), résilience réseau présentée
comme argument de vente et non comme détail technique, français natif.

**Cible d'hypothèse** : agences et studios créatifs/communication
d'Afrique francophone (Dakar, Abidjan, Bamako, Ouagadougou, Cotonou,
Lomé...). Non vérifiée — objet de `VALIDATION-TERRAIN.md`.

**Pricing d'hypothèse** (par organisation, pas par utilisateur) :
Gratuit (existant) / Pro ~25 000 XOF/mois / Agence+ ~50 000 XOF/mois.

**Second angle, plus ambitieux** : ouvrir le produit à la tête de
marketing côté entreprise (pas seulement l'agence), qui pilote plusieurs
agences externes. Les indicateurs déjà existants de l'Intelligence Layer
(`Revision Rate`, `First-Time-Right Rate`, `SLA Compliance`, `Client
Friction Index`) sont, retournés du point de vue de l'annonceur,
exactement ce qui manque pour comparer objectivement des prestataires —
personne d'autre sur le marché ne le fait.

**Décision d'architecture pour ce second angle : données séparées entre
l'agence et l'entreprise cliente, pas un document partagé.** Chaque
organisation Firestore reste propriétaire de ses propres données. Le pont
entre les deux est un **rapport partagé explicite** (instantané filtré,
publié volontairement par l'agence, consultable en lecture seule côté
client — extension du mécanisme d'export PDF déjà existant plutôt qu'un
partage de document brut). Raisons : (1) éviter d'empiler un partage
inter-organisations sur l'architecture à document unique par organisation
déjà identifiée en risque P0 dans `AUDIT.md` avant qu'elle soit corrigée ;
(2) une agence ne peut pas exposer marges/coûts internes à un client par
un partage total ; (3) éviter le démarrage à froid à deux versants — avec
des données séparées, chaque face (agence, entreprise) tire de la valeur
dès le premier jour, sans dépendre de l'adoption de l'autre.

**Séquence retenue :**
1. Validation terrain (`VALIDATION-TERRAIN.md`) — avant tout développement.
2. Stabilisation de l'architecture agence existante (P0 de `AUDIT.md`,
   notamment l'éclatement du document unique par organisation), qui devient
   un prérequis renforcé si un pont inter-organisations est prévu ensuite.
3. **Livré** — Rapport partagé en lecture seule (agence → client) : le plus
   petit développement qui démontre la proposition de valeur, sans
   intégration tierce ni choix de prestataire Mobile Money à trancher au
   préalable. Bouton "🔗 Partager" sur chaque projet de la vue Rapport
   Direction ; génère un lien `?share=orgId:shareId` consultable sans
   compte, montrant statut/avancement/tâches/révisions d'un seul projet —
   jamais de budget, d'heures internes ni de données d'un autre client
   (voir `js/09-shared-reports.js`, règle Firestore dédiée dans
   `firestore.rules`). Panneau "Mes liens partagés" (sidebar) pour lister et
   révoquer les liens actifs. Peut déjà servir de support de démonstration
   pendant les entretiens de `VALIDATION-TERRAIN.md`.
   **Correctif important a posteriori** : la toute première version ne
   fonctionnait en réalité JAMAIS connecté au cloud — `MCPS_ORG_ID` est une
   variable privée à la fermeture (IIFE) de `js/06-auth-cloud.js`,
   invisible depuis `js/09-shared-reports.js` ; le garde-fou censé détecter
   le mode local (`typeof MCPS_ORG_ID`) était donc toujours vrai, y compris
   connecté, et désactivait silencieusement le partage. Passé inaperçu car
   aucun test n'appelait `shareProject()` pour de vrai (seule la fonction
   pure `buildProjectShareSnapshot`, non affectée, était testée). Corrigé
   via un accesseur exposé explicitement (`_mcpsAuthContext()`), verrouillé
   par 4 nouveaux tests qui appellent réellement `shareProject()` /
   `listActiveShares()` / `revokeShare()` de bout en bout. Suite complète :
   84/84 (jsdom) + 5/5 (Playwright).
4. Localisation paiement (Mobile Money) et collaboration (WhatsApp) une
   fois la validation terrain confirmée.
5. Reste de la feuille de route produit (section E) et espace entreprise
   à deux faces.

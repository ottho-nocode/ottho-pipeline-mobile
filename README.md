# Ottho Builder Mobile

> Plugin Claude Code et commande : `ottho-pipeline-mobile`.

Deux produits dans un plugin, et une app locale qui montre l'un ou l'autre selon le projet ouvert :

- **le parcours mobile Ottho**, 34 étapes qui mènent un débutant d'une idée à une application
  publiée sur l'App Store et Google Play ;
- **le pipeline d'agents SDD mobile**, pour une application Expo qui se branche sur la base
  Supabase existante de l'application web d'un client.

## La vue du parcours

- le chemin du parcours, rangé en cinq actes (avant de coder, construire, avant de publier, publier, après) ;
- l'étape courante mise en avant, avec son but, sa durée, et le prompt à copier pour la lancer ;
- la preuve enregistrée de chaque étape faite, la raison de chaque étape bloquée ou sautée ;
- les étapes que tes réponses écartent, à part, avec la condition qui les concerne ;
- la fiche de chaque étape (le texte que Claude suivra) ;
- tes choix (iPhone, Android, comptes, paiement, contenu partagé) en toutes lettres ;
- ce que la fabrication Expo embarquera : nom, version, identifiants iOS et Android, équipe Apple, projet EAS, profils de fabrication, et ce qui vient encore du modèle ;
- le journal de ce qui a été enregistré, et les questions que Claude te pose dans le terminal ;
- tous les documents Markdown du projet (bouton « Documents »).

L'app se lit ; tout le reste se passe dans le terminal Claude Code. Tu y réponds aux questions, et
c'est Claude qui enregistre ton avancement avec `scripts/ottho-state.mjs`, comme le demande la skill
de l'étape. **L'app n'écrit jamais dans le dépôt du parcours.** Ses deux seules écritures sont son
journal de démarrage et son verrou de lancement, dans le `.claude/` du projet.

## La vue du pipeline d'agents

Sur un projet qui n'est pas un projet du parcours, la même app montre le pipeline d'agents mobile :

- les **huit agents** dans leurs **cinq phases** : Specify (`brainstorming`, `spec-writer`,
  `designer`), Plan (`architect`), Implement (`developer`), Validate (`code-reviewer`,
  `validateur`), Release (`soumission`) ;
- l'avancement des **features US-XX** sur six colonnes, dont Validation, tenue par `validateur` ;
- les **livrables** qui attendent une validation, avec leur texte à relire ;
- la **base Supabase existante** vers laquelle le projet pointe : l'état de ses clés, les tables
  lues par l'application et celles dont la RLS reste à vérifier, les migrations en attente ;
- le **panneau de version** : ce que la fabrication Expo embarquera, montré avec `soumission`.

Le cycle se mène avec `/new-feature`, `/validate-feature` et `/ship-feature`. `/pipeline` rouvre la
vue, `/parcours` celle du parcours.

Ce que le pipeline mobile ne fait pas, et c'est voulu :

- **il ne conçoit aucun schéma** : la base existe, `architect` la lit et n'applique aucune migration
  sans accord explicite ;
- **il n'embarque que la clé anon ou publishable** : la clé `service_role` est extractible du
  binaire livré sur les stores, et `code-reviewer` refuse une build qui la contient ;
- **il ne demande ni Mac ni émulateur au client** : la validation passe par un QR code Expo Go pour
  l'interface et la navigation, et par une build interne pour l'achat intégré et la connexion
  sociale, qu'Expo Go désactive. Le client coche sa liste écran par écran sur son propre téléphone,
  et son verdict est enregistré comme preuve.

Le moteur est porté de celui du pipeline web (`ottho-code-app/builder`), noms de fichiers, de
fonctions et d'exports compris, pour qu'un `diff` entre les deux dépôts reste lisible. Deux moteurs
à maintenir en parallèle : c'est le coût assumé de deux pipelines indépendants, chacun installable
seul.

## Lancer

Installe le plugin une fois, dans ton terminal :

```bash
claude plugin marketplace add ottho-nocode/ottho-pipeline-mobile
claude plugin install ottho-pipeline-mobile@ottho-pipeline-mobile
```

Dans Claude Code, les mêmes commandes s'écrivent `/plugin marketplace add ottho-nocode/ottho-pipeline-mobile`
puis `/plugin install ottho-pipeline-mobile@ottho-pipeline-mobile`.

Ensuite, rien à lancer à la main. Quand Claude Code démarre, le plugin ouvre l'app pour le dossier
courant s'il reconnaît :

- **un projet du parcours** : `scripts/ottho-parcours.mjs`, `ottho.json` ou
  `.agents/skills/ottho/SKILL.md` ;
- **un projet du pipeline mobile** : une application Expo, c'est-à-dire `mobile-app/app.config.ts`,
  `mobile-app/app.json` ou `mobile-app/eas.json`.

Avant que l'application Expo existe (phases Specify et Plan), `/pipeline` ouvre la vue à la demande.
Une session suivante réutilise l'app qui tourne déjà. Elle s'arrête avec Claude Code, ou seule
30 minutes après la fermeture de son dernier onglet. `/parcours` et `/pipeline` rouvrent le
navigateur.

À la main, dans le dossier du projet :

```bash
node builder/bin/cli.mjs --project /chemin/vers/le/parcours --no-open
```

Options : `--project <dossier>`, `--port 4337`, `--no-open`, `--reopen`, `--idle-exit <minutes>`,
`--session <id>`. Le Builder écoute sur 127.0.0.1, port 4337 ou le suivant libre (jusqu'à 4346). Le
Builder web, lui, occupe 4317 à 4326 : les deux ne se gênent pas.

```bash
node builder/bin/cli.mjs --project /chemin/vers/le/parcours --reopen
```

`--reopen` ne lance rien : il retrouve le Builder du projet et rouvre le navigateur.

## Désinstaller

Retire le plugin dans Claude Code :

```bash
/plugin uninstall ottho-pipeline-mobile
```

Puis, dans chaque projet du parcours où il a tourné, supprime `.claude/ottho-parcours.log`. Rien
d'autre n'a été écrit sur ta machine : ni dossier personnel, ni réglage global.

## Développer

Le dépôt est le plugin ; le Builder vit dans `builder/`, avec son propre `package.json`. Il n'y a
volontairement **pas de `package.json` à la racine** : Claude Code lancerait un `npm install` à
l'installation du plugin et embarquerait 100 Mo de dépendances de développement inutiles.

```bash
node --test                   # hook du plugin (scripts/) et serveur du Builder (builder/server/)
```

```bash
cd builder && npm install
npm run demo                  # crée un projet de parcours de démo et affiche son chemin
npm run demo:pipeline         # crée un projet de pipeline de démo et affiche son chemin
node bin/cli.mjs --project <chemin-demo> --no-open   # API sur :4337
npm run dev:web               # interface sur :3100 (proxy /api vers :4337)
npm run typecheck             # types de l'interface
npm run test:e2e              # build + test Playwright
```

Le plugin livre l'interface déjà construite : après une modification de `builder/web/`, lance
`npm run build` dans `builder/` et committe `builder/dist/` avec elle.

### Ce que le Builder lit, et où

| Ce qu'il affiche | D'où il le lit |
|---|---|
| L'ordre des étapes, leur durée, leur condition | `scripts/ottho-parcours.mjs` du projet (tableau `ETAPES`, extrait sans être exécuté) |
| Le titre accentué, l'acte, le numéro | la table du Builder (`server/parcours.mjs`), qui connaît les 34 étapes |
| Le texte d'une étape | `.agents/skills/ottho-etape-<id>/SKILL.md` |
| Le statut, la preuve, le blocage, les réponses, l'historique | `ottho.json` |
| La fabrication Expo | `site-config.ts` et `mobile-app/eas.json` |
| Les questions en attente et le travail des agents | `.claude/pipeline-events.jsonl` |

Et, en mode pipeline :

| Ce qu'il affiche | D'où il le lit |
|---|---|
| Les agents et leurs phases | `agents/*.md` du plugin, puis `.claude/agents/` du projet |
| Les features US-XX et leurs colonnes | `specs/`, `plans/`, `reviews/`, et Git (branches, commits) |
| Le verdict de validation | `reviews/US-XX-*-validation.md`, la preuve cochée par le client |
| Les livrables à valider | la section « Historique » de chaque livrable |
| La base existante | les `.env` du projet (adresse seulement) et `docs/base.md` (relevé du schéma) |
| La fabrication Expo | `mobile-app/app.config.ts` ou `app.json`, et `mobile-app/eas.json` |

Une étape que le projet annonce mais que le Builder ne connaît pas est affichée telle quelle, avec
la mention « nouvelle étape du parcours ». Si `scripts/ottho-parcours.mjs` devient illisible, la
table du Builder prend le relais et l'interface le dit.

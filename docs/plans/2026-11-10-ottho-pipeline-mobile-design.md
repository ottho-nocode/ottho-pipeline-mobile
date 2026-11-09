# Ottho Builder Mobile : design

Date : 2026-11-10. Statut : validé.

Transposition d'Ottho Builder 2 (le builder du plugin `ottho-code-app`, qui met en scène une équipe
d'agents SDD pour le web) vers le parcours mobile : 34 étapes guidées qui mènent un débutant complet
d'une idée à une application publiée sur l'App Store et Google Play.

## Décisions prises avant l'écriture

| Question | Décision |
|---|---|
| Nom du paquet et de la commande | `ottho-pipeline-mobile`, dépôt `~/ottho-pipeline-mobile`, nom affiché « Ottho Builder Mobile » |
| Source transposée | `~/ottho-code-app/builder` (version vivante, v1.3.1). `~/ottho-pipeline` est une archive depuis le 2026-10-28 |
| Source de données servie | `~/Downloads/ottho-builder-mobile`, branche `feat/backend-supabase-p1`, en lecture seule |
| Lancement | Comme `ottho-code-app` : ce dépôt est lui-même un plugin Claude Code qui embarque son builder et le démarre au hook `SessionStart` |
| Métaphore visuelle | Le chemin en actes : 5 actes, l'acte courant déplié, les étapes écartées en bas de leur acte |
| Compagnon existant | Les acquis de `~/ottho-builder-mobile` (branche `ottho-builder`, `scripts/ottho-compagnon.mjs` et ses deux designs) sont repris : découpage en actes, libellés, leçons d'accessibilité |

## Écarts constatés dans la source de données

Relevés avant l'écriture, ils expliquent plusieurs choix de conception.

1. `node scripts/ottho-parcours.mjs liste` rend du texte aligné, pas du JSON, sans `but`, sans
   `minutes` et sans chemin de skill. Seul `next` rend du JSON, pour une seule étape. La carte du
   parcours vit dans l'export `ETAPES` du module.
2. `node scripts/ottho-state.mjs status --json` ne décrit que les étapes déjà touchées. Sur l'état de
   démo, `counts.pending` vaut 0 alors que 29 étapes restent à faire : le statut `pending` est
   implicite, il faut croiser `ETAPES` et `steps`.
3. Le frontmatter des `SKILL.md` ne porte que `name`, `description` et `disable-model-invocation`.
   Ni ordre, ni phase, ni durée, ni condition.
4. La branche servie n'a ni `phase` par étape ni titres accentués (« Ton idee tient la route ») ;
   la branche `ottho-builder` a les deux.
5. `ottho.json` porte en plus un `history` horodaté, qui fournit le journal sans rien déduire.

## Architecture

### Lecture du parcours

`server/parcours.mjs` établit la carte des 34 étapes en croisant trois sources, par ordre de priorité
décroissante pour chaque champ :

1. le projet lu : le tableau `ETAPES` extrait de `scripts/ottho-parcours.mjs` (`condition`, `minutes`,
   `but`, et `phase` quand elle y est) ;
2. la table locale du builder : identifiant, numéro, acte, titre accentué, pour les 34 étapes connues ;
3. le `SKILL.md` de l'étape, dans `.agents/skills/ottho-etape-<id>/` : sa `description` et son chemin.

Le tableau `ETAPES` est extrait par découpage de texte puis `JSON.parse`, jamais par `import` : le
builder ne charge aucun code du dépôt qu'il observe. Si l'extraction échoue, la table locale prend le
relais et l'interface le signale. Une étape annoncée par le projet mais inconnue du builder est
affichée telle quelle, en fin de son acte, avec la mention que le builder ne la connaît pas.

### Lecture de l'état

`server/etat.mjs` lit `ottho.json` et n'exécute rien. Il reproduit les trois règles du moteur du
parcours :

- `etapeApplicable` : `toujours` s'applique à tous, `sans_<branche>` est l'inverse d'une branche, une
  branche jamais répondue vaut faux ;
- l'étape courante : celle marquée `in_progress` si elle s'applique, sinon la première applicable qui
  n'est ni faite ni sautée ;
- l'avancement : les étapes sautées sortent des totaux, comme dans le compagnon v2.

Chaque étape ressort avec son statut (`pending`, `in_progress`, `done`, `skipped`, `blocked`), sa
preuve, sa raison de blocage, sa date, et le fait qu'elle s'applique ou non.

### Serveur

`server/app.mjs` garde la coque de Builder 2 : écoute sur 127.0.0.1, refus de tout `Host` non local,
état JSON, flux SSE, jeton de lecture pour les fichiers, inscription des sessions Claude Code et arrêt
avec la dernière. Routes : `/api/health`, `/api/state`, `/api/stream`, `/api/file`, `/api/docs`,
`/api/skill`, `/api/report`, `/api/session-end`.

Aucune écriture dans le dépôt observé. Les modules d'écriture de Builder 2 (`envfile`, `devserver`,
`preview`, `brief`) ne sont pas repris : pas de panneau Config, pas d'aperçu. Un aperçu d'application
Expo dans un navigateur n'est pas fiable, et le parcours a déjà `npm run expo-go`.

Modules repris sans changement : `events.mjs`, `files.mjs`, `viewer.mjs`, `node-version.mjs`,
`tmpdirs.mjs`. Modules adaptés : `signature.mjs` (surveille `ottho.json`, `.agents/skills`,
`scripts/ottho-parcours.mjs` et le journal des hooks), `git.mjs` (branche et fichiers non commités
seulement), `cli.mjs` (ports 4337 à 4346, plus de `--plugin`, plus de sous-commande `brief`).

### Plugin

Le dépôt est le plugin. `scripts/visual-engine.mjs`, lancé par le hook `SessionStart`, cherche le
builder du projet sur les ports 4337 à 4346 (`/api/health`, champ `project`), et le démarre détaché
s'il ne tourne pas. Reprises de la version web : verrou `.claude/ottho-parcours.lock`, refus d'écrire
à travers un lien symbolique, journal `.claude/ottho-parcours.log`, inscription de la session,
`--idle-exit 30`, `--no-open` sur un `compact` ou un `clear`, sortie 0 quoi qu'il arrive.

Marqueurs d'un projet du parcours : `scripts/ottho-parcours.mjs`, `ottho.json`, ou
`.agents/skills/ottho/SKILL.md`. Aucun n'est un marqueur du builder web, et les marqueurs web
(`docs/brief.md`, `docs/PRD.md`, `design/charte.md`, `specs/US-*.md`) sont absents du dépôt du
parcours : les deux builders ne s'ouvrent pas sur le même dossier.

## Interface : le chemin en actes

Barre du haut : marque, nom du projet, branche Git, état du lien, boutons Documents, Journal et thème.

Colonne de gauche, réglable et repliable, ce qui attend l'élève :

- carte « Ton étape » à bord chaud : numéro, titre, but, durée, acte, et le prompt `/ottho` à copier ;
- les blocages, avec leur raison ;
- « Tes choix » : les branches en toutes lettres (« iPhone : oui »), jamais une coche seule ;
- le dernier changement enregistré.

Zone de droite, le chemin : les cinq actes empilés du bas vers le haut, chacun avec son compte
« 2 faites sur 9 » et sa barre d'avancement. L'acte qui contient l'étape courante est déplié en cartes
d'étape ; les autres restent une ligne de pastilles. Une étape faite montre sa preuve, une étape
bloquée sa raison, une étape sautée son motif. Les étapes écartées par les branches descendent en bas
de leur acte, sous « Selon tes réponses ». Chaque acte se replie et se déplie, le choix est mémorisé
dans le navigateur.

Règles de couleur reprises de Builder 2 : violet pour ce qui se clique, chaud pour ce qui attend
l'élève, bleu pour ce qui est en cours, vert pour ce qui est fait. Aucun état n'est distingué par la
seule couleur : pastille et texte.

En bas, le journal : l'historique d'`ottho.json` et, quand les hooks ont tourné, les actions lues dans
`.claude/pipeline-events.jsonl`.

## Vérification

Tests `node:test` à côté de chaque module : `parcours`, `etat`, `app`, `cli`, `visual-engine`, plus
ceux repris de Builder 2. Les fixtures sont écrites dans un dossier temporaire jetable, jamais dans le
dépôt observé. `npm run demo` fabrique un projet de démo complet (parcours, état, skills).
`npm run test:e2e` construit l'interface et la parcourt avec Playwright : étape courante, preuve d'une
étape faite, raison d'un blocage, étape écartée, repli d'un acte, prompt copié.

## Hors périmètre

Aperçu de l'application du projet, panneau de configuration, écriture dans le dépôt observé,
publication npm, suivi à distance.

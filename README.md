# Ottho Builder Mobile

> Plugin Claude Code et commande : `ottho-pipeline-mobile`.

App locale qui affiche, à côté de Claude Code, le parcours mobile Ottho : les 34 étapes qui mènent
d'une idée à une application publiée sur l'App Store et Google Play.

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

C'est le pendant mobile d'Ottho Builder 2 (`ottho-code-app`), qui met en scène l'équipe d'agents SDD
du parcours web. Deux dépôts séparés, assumés : la coque et le système de design sont maintenus en
double.

## Lancer

Installe le plugin une fois, dans ton terminal :

```bash
claude plugin marketplace add ottho-nocode/ottho-pipeline-mobile
claude plugin install ottho-pipeline-mobile@ottho-pipeline-mobile
```

Dans Claude Code, les mêmes commandes s'écrivent `/plugin marketplace add ottho-nocode/ottho-pipeline-mobile`
puis `/plugin install ottho-pipeline-mobile@ottho-pipeline-mobile`.

Ensuite, rien à lancer à la main : quand Claude Code démarre dans un projet du parcours (un dossier
qui contient `scripts/ottho-parcours.mjs`, `ottho.json` ou `.agents/skills/ottho/SKILL.md`), le
plugin démarre Ottho Builder Mobile pour ce dossier et l'ouvre dans le navigateur. Une session
suivante réutilise celui qui tourne déjà. Il s'arrête avec Claude Code, ou seul 30 minutes après la
fermeture de son dernier onglet. Depuis Claude Code, `/parcours` rouvre le navigateur.

À la main, dans le dossier du projet :

```bash
node bin/cli.mjs --project /chemin/vers/le/parcours --no-open
```

Options : `--project <dossier>`, `--port 4337`, `--no-open`, `--reopen`, `--idle-exit <minutes>`,
`--session <id>`. Le Builder écoute sur 127.0.0.1, port 4337 ou le suivant libre (jusqu'à 4346). Le
Builder web, lui, occupe 4317 à 4326 : les deux ne se gênent pas.

```bash
node bin/cli.mjs --project /chemin/vers/le/parcours --reopen
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

```bash
npm install
npm test                      # tests serveur et plugin (node:test)
npm run demo                  # crée un projet de parcours de démo et affiche son chemin
node bin/cli.mjs --project <chemin-demo> --no-open   # API sur :4337
npm run dev:web               # interface sur :3100 (proxy /api vers :4337)
npm run typecheck             # types de l'interface
npm run test:e2e              # build + test Playwright
```

### Ce que le Builder lit, et où

| Ce qu'il affiche | D'où il le lit |
|---|---|
| L'ordre des étapes, leur durée, leur condition | `scripts/ottho-parcours.mjs` du projet (tableau `ETAPES`, extrait sans être exécuté) |
| Le titre accentué, l'acte, le numéro | la table du Builder (`server/parcours.mjs`), qui connaît les 34 étapes |
| Le texte d'une étape | `.agents/skills/ottho-etape-<id>/SKILL.md` |
| Le statut, la preuve, le blocage, les réponses, l'historique | `ottho.json` |
| La fabrication Expo | `site-config.ts` et `mobile-app/eas.json` |
| Les questions en attente et le travail des agents | `.claude/pipeline-events.jsonl` |

Une étape que le projet annonce mais que le Builder ne connaît pas est affichée telle quelle, avec
la mention « nouvelle étape du parcours ». Si `scripts/ottho-parcours.mjs` devient illisible, la
table du Builder prend le relais et l'interface le dit.

---
description: Rouvre Ottho Builder Mobile, la vue du parcours des 34 étapes, dans le navigateur
---

# /parcours

Ottho Builder Mobile est une app locale, en lecture seule : les 34 étapes du parcours rangées en 5 actes, l'étape courante mise en avant, la preuve de chaque étape faite, les étapes bloquées avec leur raison, les étapes écartées par les réponses de la personne, et le prompt à coller pour lancer l'étape suivante. Elle s'ouvre d'elle-même au démarrage de Claude Code dans un projet du parcours (hook `SessionStart` du plugin) et s'arrête avec Claude Code (une dizaine de secondes après la fermeture de la dernière session sur ce projet, ou 30 min après la fermeture de son dernier onglet si Claude Code n'a pas pu la prévenir) ; la session suivante la relance.

## Séquence

1. Lance avec l'outil Bash, au premier plan, la commande « pour rouvrir la vue » donnée par le hook de démarrage dans le contexte de la session, telle quelle (chemins déjà échappés) :

   ```bash
   node '<dossier du plugin>/scripts/visual-engine.mjs' --open --project '<dossier du projet>'
   ```

   Si le contexte ne la donne pas (dossier qui n'était pas encore un projet du parcours au démarrage de la session), lance :

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/visual-engine.mjs" --open --project "${CLAUDE_PROJECT_DIR:-$PWD}"
   ```

   Elle retrouve le Builder du projet, ou le démarre en processus détaché, puis ouvre le navigateur.

2. Redonne à la personne la ligne affichée :
   - `Ottho Builder Mobile : http://127.0.0.1:<port>` : l'adresse de la vue, déjà ouverte dans le navigateur ;
   - `Ottho Builder Mobile absent du plugin ottho-pipeline-mobile : …` : le Builder est livré avec le plugin mais son fichier manque ; transmets le message et propose de mettre à jour ou de réinstaller le plugin ;
   - `Ottho Builder Mobile démarre encore : …` : il finit de démarrer et s'ouvrira de lui-même ; si rien ne vient, lis la fin de `.claude/ottho-parcours.log` ;
   - `Ottho Builder Mobile n'a pas démarré : …` : lis la fin de `.claude/ottho-parcours.log` et explique la cause ;
   - `Ottho Builder Mobile : dossier de projet introuvable : <dossier>` : le chemin passé à `--project` n'existe pas ; vérifie-le avec la personne, puis relance avec le bon chemin.

## Règles

- La vue ne fait que lire `ottho.json`. L'avancement du parcours s'enregistre dans ce terminal, avec `scripts/ottho-state.mjs`, comme le demande la skill de l'étape en cours.
- Ne décris pas à la personne ce qu'elle voit déjà dans la vue : elle l'a sous les yeux, à côté de son terminal.
- Ne lance pas le Builder autrement (pas de `node …/builder/bin/cli.mjs` en tâche de fond de cette session) : la commande ci-dessus le détache proprement.

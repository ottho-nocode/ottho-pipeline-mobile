---
description: Ouvre Ottho Builder Mobile sur le pipeline d'agents mobile (phases, features, livrables, base, version)
---

# /pipeline

Ottho Builder Mobile a deux vues, et il choisit celle du projet ouvert. Sur un projet du pipeline d'agents mobile, il montre :

- les **huit agents** dans leurs **cinq phases** : Specify (`brainstorming`, `spec-writer`, `designer`), Plan (`architect`), Implement (`developer`), Validate (`code-reviewer`, `validateur`), Release (`soumission`) ;
- l'avancement des **features US-XX** sur six colonnes, dont la colonne Validation, tenue par `validateur` ;
- les **livrables** qui attendent une validation, avec leur texte à relire ;
- la **base Supabase existante** vers laquelle le projet pointe : l'état de ses clés, les tables lues par l'application et celles dont la RLS reste à vérifier, les migrations en attente ;
- le **panneau de version** : ce que la fabrication Expo embarquera (identité, profils `eas.json`, lien EAS), affiché avec l'agent `soumission`.

Sur un projet du parcours en 34 étapes, c'est `/parcours` qu'il faut, et le Builder ouvre l'autre vue.

## Séquence

1. Lance avec l'outil Bash, au premier plan, la commande « pour rouvrir la vue » donnée par le hook de démarrage dans le contexte de la session, telle quelle (chemins déjà échappés) :

   ```bash
   node '<dossier du plugin>/scripts/visual-engine.mjs' --open --project '<dossier du projet>'
   ```

   Si le contexte ne la donne pas (dossier qui n'était pas encore reconnu au démarrage de la session), lance :

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/visual-engine.mjs" --open --project "${CLAUDE_PROJECT_DIR:-$PWD}"
   ```

   Elle retrouve le Builder du projet, ou le démarre en processus détaché, puis ouvre le navigateur.

2. Redonne à la personne la ligne affichée :
   - `Ottho Builder Mobile : http://127.0.0.1:<port>` : l'adresse de la vue, déjà ouverte dans le navigateur ;
   - `Ottho Builder Mobile absent du plugin ottho-pipeline-mobile : …` : le Builder est livré avec le plugin mais son fichier manque ; transmets le message et propose de mettre à jour ou de réinstaller le plugin ;
   - `Ottho Builder Mobile démarre encore : …` : il finit de démarrer et s'ouvrira de lui-même ; si rien ne vient, lis la fin de `.claude/ottho-parcours.log` ;
   - `Ottho Builder Mobile n'a pas démarré : …` : lis la fin de `.claude/ottho-parcours.log` et explique la cause ;
   - `Ottho Builder Mobile : dossier de projet introuvable : <dossier>` : le chemin passé à `--project` n'existe pas ; vérifie-le avec la personne, puis relance.

3. Si aucun agent ne s'affiche dans le graphe, le plugin n'est pas installé comme plugin Claude Code : propose `/plugin install ottho-pipeline-mobile`. Le Builder lit les agents du plugin, puis ceux du projet (`.claude/agents/`).

## Quand il s'ouvre tout seul

Le hook de démarrage du plugin l'ouvre de lui-même sur un projet qui a une application Expo (`mobile-app/app.config.ts`, `app.json` ou `eas.json`). Avant qu'elle existe, pendant les phases Specify et Plan, cette commande l'ouvre à la demande.

Il s'arrête avec Claude Code, une dizaine de secondes après la fermeture de la dernière session sur ce projet, ou 30 min après la fermeture de son dernier onglet.

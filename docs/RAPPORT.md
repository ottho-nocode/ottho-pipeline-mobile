# Rapport de livraison

Date : 2026-11-10. Dépôt : `~/ottho-pipeline-mobile`, deux commits sur `main`.

## Ce qui est livré

**Un plugin Claude Code qui embarque son Builder**, comme `ottho-code-app` depuis sa v1.2.0 :
`.claude-plugin/plugin.json`, `hooks/hooks.json` (SessionStart et SessionEnd), `scripts/visual-engine.mjs`,
`commands/parcours.md` (`/parcours`), et le Builder lui-même à la racine (`bin/`, `server/`, `web/`).

**Le critère de fin du brief est tenu.** Vérifié sur le vrai dépôt, branche `feat/backend-supabase-p1` :

```
node builder/bin/cli.mjs --project ~/Downloads/ottho-builder-mobile --no-open
```

sert l'app sur `http://127.0.0.1:4337` et affiche :

| Attendu | Observé |
|---|---|
| Les 34 étapes avec leur statut | 34 étapes, rangées en 5 actes (9 / 8 / 6 / 8 / 1 après filtrage des branches) |
| L'étape courante mise en avant | `02-ton-statut`, en carte chaude dans la colonne et dans le bandeau |
| La preuve de chaque étape faite | 2 preuves lues dans `ottho.json`, affichées sous leur étape |
| Les étapes bloquées avec leur raison | aucune sur ce projet ; vérifié sur le projet de démo et par les tests |
| Les étapes écartées par les branches | `15b-sans-compte` et `18-ton-prix`, à part, avec leur condition |
| Le prompt à coller pour l'étape suivante | `/ottho`, copié depuis la colonne, le bandeau ou la fiche d'étape |
| Avancement | « 2 étapes sur 32 », ce qui recoupe le « 32 étapes sur 34 » annoncé par le parcours |

**En plus du brief** : la fiche de chaque étape (son `SKILL.md`, chargé à la demande), le journal de
l'historique d'`ottho.json`, les questions en attente dans le terminal, les documents du projet, et
une section « Ta fabrication » qui montre ce que la fabrication Expo embarquerait (nom, version,
identifiants iOS et Android, équipe Apple, projet EAS, profils) et signale chaque valeur encore
héritée du modèle.

**Lecture seule tenue.** Le Builder n'écrit rien dans le dépôt observé, vérifié par `git status`
avant et après exécution sur le dépôt réel. Les deux seules écritures du plugin sont son journal de
démarrage (`.claude/ottho-parcours.log`) et son verrou (`.claude/ottho-parcours.lock`). Un appel à
`rotateIfNeeded` hérité du Builder web, qui aurait tronqué `.claude/pipeline-events.jsonl` au-delà
de 5 Mo, a été retiré (commit `d724d40`).

**Tests** : 79 tests `node:test` (`npm test`), 9 tests Playwright (`npm run test:e2e`), `npm run typecheck`
et `npm run build` au vert. Fixtures écrites dans un dossier temporaire jetable, jamais dans un dépôt.

## Écarts avec le brief, et pourquoi

1. **`ottho-parcours.mjs liste` ne rend pas de JSON.** C'est du texte aligné, sans `but`, sans
   `minutes`, sans chemin de skill. Le Builder lit donc le tableau `ETAPES` du fichier, extrait par
   découpage de texte puis `JSON.parse`, jamais par `import` : il ne charge aucun code du dépôt
   observé. Repli documenté sur sa propre table si le format change.
2. **`status --json` ne décrit que les étapes déjà touchées** : `counts.pending` vaut 0 sur un
   parcours à peine commencé. Le Builder croise `ETAPES` et `steps`, une étape absente étant à faire.
3. **Le frontmatter des `SKILL.md` ne porte ni ordre, ni phase, ni durée, ni condition.** Il sert
   pour la description et le texte de l'étape ; `parseFrontmatter` est repris tel quel.
4. **`~/ottho-pipeline` est une archive.** La transposition part de `~/ottho-code-app/builder`
   (v1.3.1), sur ta décision.
5. **La branche servie n'a ni `phase` ni titres accentués.** Le Builder porte ses propres titres
   accentués et le découpage en cinq actes, repris du compagnon de la branche `ottho-builder`.

## Ce qui reste

- **Publier le plugin.** Il n'est référencé dans aucune marketplace : `/plugin install ottho-pipeline-mobile`
  ne fonctionnera qu'une fois le dépôt poussé et déclaré. Rien n'a été poussé.
- **Décider du sort du compagnon existant** (`~/ottho-builder-mobile`, branche `ottho-builder`,
  `scripts/ottho-compagnon.mjs`). Ses acquis sont repris ici, mais il vit toujours là-bas et le skill
  `/ottho` de cette branche le lance encore.
- **Reporter les correctifs de coque.** Design et coque sont maintenus en double avec
  `ottho-code-app/builder`, c'est assumé : un correctif d'un côté est à reporter de l'autre.
- **Aperçu de l'application et panneau de configuration** : hors périmètre, comme convenu. Un aperçu
  d'application Expo dans un navigateur n'est pas fiable, et le parcours a déjà `npm run expo-go`.

## Ce qui n'a pas pu être vérifié

- **Le lancement automatique en conditions réelles.** Le hook `SessionStart` est couvert par 13 tests
  (lancement détaché, arguments, verrou, lien symbolique, plugin incomplet, `--end`, `--open`), mais
  je n'ai pas pu vérifier qu'une vraie session Claude Code ouverte dans le dépôt du parcours démarre
  le Builder toute seule : le plugin n'est pas installé sur cette machine.
- **La cohabitation avec le Builder web dans une même session.** Les marqueurs et les plages de
  ports sont disjoints (4337-4346 contre 4317-4326), et un test vérifie qu'un Builder web qui répond
  sur un port sondé n'est jamais pris pour le nôtre. La cohabitation réelle, avec les deux plugins
  actifs, reste à constater.
- **Windows et Linux.** Tout a été vérifié sur macOS. Le code reprend les précautions de la version
  web (`windowsHide`, `O_NOFOLLOW` absent sous Windows), sans exécution sur ces systèmes.
- **Un parcours arrivé au bout.** L'état « Parcours terminé » est couvert par un test unitaire, pas
  par un vrai projet publié sur les deux magasins.
- **Les valeurs du modèle.** La détection de l'héritage Expo compare à une liste figée (`NowStack`,
  `nowstack`, `mobile.aiblueprint.dev`, `dev.melvynx.nowstack`, l'équipe Apple et le projet EAS du
  modèle). Si le modèle du parcours change, cette liste est à mettre à jour.

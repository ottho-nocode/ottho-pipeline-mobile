# Product

## Register

product

## Users

Deux publics, et une app qui montre à chacun la vue qui le concerne.

**Les élèves du parcours mobile Ottho** : des débutants complets, qui n'ont jamais ouvert un
terminal et ne savent pas ce qu'est un backend. Ils veulent une application publiée, c'est tout.
L'app s'ouvre d'elle-même sur leur ordinateur quand ils lancent Claude Code dans leur projet, à côté
de leur terminal, souvent le soir ou le week-end, une étape par session. Leur travail : savoir où
ils en sont dans les 34 étapes, ce qui les attend, ce qui les bloque, et quoi coller dans le
terminal pour continuer.

**Les builders Ottho qui montent une application mobile pour un client** : le client a déjà une
application web, des utilisateurs et une base Supabase. Ils lancent le pipeline d'agents pour
construire l'application Expo qui s'y branche. Leur travail : savoir quelle user story avance, quel
livrable attend leur validation, quelles tables n'ont pas encore leurs policies RLS vérifiées, et ce
que la prochaine build embarquera.

## Product Purpose

Nom : **Ottho Builder Mobile** (plugin et commande `ottho-pipeline-mobile`). Donner une forme
visible à un travail qui, sans elle, n'existe que dans des fichiers et dans le fil du terminal.

Pour le parcours : elle lit `ottho.json`, montre le chemin, et donne le prompt à coller ; réponses,
preuves et avancement passent par Claude Code. Réussite : l'élève voit le chemin parcouru, sait
quelle est son étape, et n'a jamais à se demander ce qu'il doit faire maintenant.

Pour le pipeline : elle lit les livrables, Git et la base, montre les huit agents dans leurs cinq
phases et l'avancement de chaque user story. Réussite : le builder voit ce qui attend sa validation,
ce qui bloque la première build, et il n'a jamais à ouvrir un dossier pour le savoir.

Dans les deux cas, l'app guide sans piloter.

## Brand Personality

Ottho, version spectacle : sombre, chaude, énergique. Le dégradé orange-rouge des présentations
Ottho, Inter et JetBrains Mono, de la profondeur et un peu de lumière. Trois mots : vivant,
chaleureux, maîtrisé. L'émotion visée : « j'avance sur un chemin, et je vois où il mène ».

## Anti-references

- Le tableau de bord corporate : gris froid, dense, austère, tableaux partout.
- La liste de cases à cocher : 34 lignes identiques, sans relief, sans idée de distance parcourue.

## Design Principles

1. **Un chemin, pas une liste** : les étapes sont des jalons sur un chemin qui monte, groupées en
   cinq actes ; l'acte en cours s'ouvre, les autres se résument à une ligne de pastilles.
2. **Toujours une prochaine action** : chaque écran dit quoi faire maintenant, au même endroit, avec
   le prompt à copier pour Claude.
3. **Une preuve, pas une promesse** : une étape faite montre la preuve qui l'a validée, une étape
   bloquée montre sa raison. Jamais un « c'est bon » sans rien derrière.
4. **Ce qui ne te concerne pas s'efface** : les étapes écartées par les réponses de l'élève sortent
   des totaux et descendent en bas de leur acte, avec la condition qui les ramènerait.
5. **Rien ne s'écrit depuis l'app** : tout passe par le terminal, et l'app le dit plutôt que de le
   laisser deviner. Dans le dépôt du parcours, elle n'écrit rien du tout ; en mode pipeline, ses
   deux seules écritures sont `.env.local` et le lancement de l'aperçu, toutes deux demandées.
6. **Un secret ne s'affiche jamais** : l'app montre « définie » ou non, l'adresse d'un projet, le
   nom d'une variable. Jamais une valeur de clé, nulle part, même tronquée.

## Accessibility & Inclusion

Pas d'exigence formelle. Base conservée : contrastes de texte lisibles sur fond sombre et clair,
focus visibles, navigation clavier, animations coupées quand le système demande moins de mouvement.
Aucun état n'est distingué par la seule couleur : chaque étape porte une pastille et son état en
toutes lettres (« faite », « en cours », « bloquée », « sautée », « selon tes réponses »), et chaque
acte s'annonce « Construire, 2 étapes faites sur 8 ».

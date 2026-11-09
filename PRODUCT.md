# Product

## Register

product

## Users

Les élèves du parcours mobile Ottho : des débutants complets, qui n'ont jamais ouvert un terminal et
ne savent pas ce qu'est un backend. Ils veulent une application publiée, c'est tout. L'app s'ouvre
d'elle-même sur leur ordinateur quand ils lancent Claude Code dans leur projet, à côté de leur
terminal, souvent le soir ou le week-end, une étape par session. Leur travail : savoir où ils en
sont dans les 34 étapes, ce qui les attend, ce qui les bloque, et quoi coller dans le terminal pour
continuer.

## Product Purpose

Nom : **Ottho Builder Mobile** (plugin et commande `ottho-pipeline-mobile`). Donner une forme
visible à un parcours qui, sans elle, n'existe que dans un fichier JSON et dans le fil du terminal.
L'app guide sans piloter : elle lit `ottho.json`, montre le chemin, et donne le prompt à coller ;
réponses, preuves et avancement passent par Claude Code. Réussite : l'élève voit le chemin parcouru,
sait quelle est son étape, et n'a jamais à se demander ce qu'il doit faire maintenant.

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
   laisser deviner.

## Accessibility & Inclusion

Pas d'exigence formelle. Base conservée : contrastes de texte lisibles sur fond sombre et clair,
focus visibles, navigation clavier, animations coupées quand le système demande moins de mouvement.
Aucun état n'est distingué par la seule couleur : chaque étape porte une pastille et son état en
toutes lettres (« faite », « en cours », « bloquée », « sautée », « selon tes réponses »), et chaque
acte s'annonce « Construire, 2 étapes faites sur 8 ».

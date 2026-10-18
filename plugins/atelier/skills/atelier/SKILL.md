---
name: atelier
description: Registre de projet persistant pour Claude Code — planifier, découper en petites tâches avec dépendances, suivre tickets et bugs, exécuter en parallèle avec des sous-agents, vérifier et documenter. Utiliser dès qu'un projet doit être planifié, repris ou suivi, ou qu'une tâche doit être exécutée et vérifiée.
when_to_use: "planifie ce projet, découpe en tâches, où en est le projet, reprends le travail, exécute les tâches prêtes, ouvre un ticket, note cette décision, mets la documentation à jour"
---

# Atelier

Atelier est le registre de projet de Claude Code. Il vit dans le dépôt, survit aux
sessions et aux compactions, et sert de source de vérité pour le plan, les tâches, les
tickets, les bugs et la base de connaissances.

## Invariant qualité — non négociable

Une tâche ne peut passer à `done` que si **les quatre** conditions sont réunies :

1. tous ses critères d'acceptation sont cochés ;
2. au moins une preuve `pass` a été enregistrée (commande exécutée, résultat observé) ;
3. au moins un document a été mis à jour et enregistré ;
4. un résumé existe.

`done --force --reason "..."` est la seule dérogation. Elle est enregistrée et `doctor`
la signale comme avertissement. Ne jamais l'utiliser pour éviter une vérification.

## Anatomie du registre

```
.atelier/
├─ project.json        métadonnées, commandes de vérification, docs
├─ plan.md             plan lisible, généré — ne pas éditer
├─ status.json         état compact lu par la statusline — généré
├─ tasks/T-0001.json   une tâche par fichier (T tâche, B bug, Q ticket, R recherche, D doc)
├─ kb/index.md         index généré de la base de connaissances
├─ kb/notes/           notes, recherches
├─ kb/decisions/       ADR
├─ runs/<id>/          rapports des sous-agents
└─ bin/atelier.mjs     copie locale du CLI, versionnée avec le projet
```

**Toujours passer par le CLI** (`node .atelier/bin/atelier.mjs`). Ne jamais éditer les
JSON de tâches à la main : le CLI tient les verrous, les dépendances, le plan et le
statut. Les seuls fichiers que l'on édite à la main sont `kb/notes/*.md`,
`kb/decisions/*.md` (via `kb add`) et la documentation du projet.

## Boucle de travail

1. **Planifier** — `/atelier:plan <objectif>` : le sous-agent `atelier:planner` lit le
   dépôt et crée des tâches petites, ordonnées, avec critères et dépendances.
2. **Exécuter** — `/atelier:work` : les tâches prêtes sont réservées puis confiées en
   parallèle à des `atelier:implementer`, chacune dans un contexte isolé.
3. **Vérifier** — un `atelier:verifier` indépendant relance les contrôles, coche les
   critères et termine la tâche. Il ne fait jamais confiance au rapport de l'implémenteur.
4. **Documenter** — l'implémenteur enregistre la doc de sa tâche ; un
   `atelier:documenter` réconcilie README, CHANGELOG et base de connaissances.
5. **Rendre** — `render` met à jour `plan.md` et `status.json` ; la statusline affiche
   la progression.

## Aide-mémoire CLI

```bash
node .atelier/bin/atelier.mjs status                 # tableau de bord
node .atelier/bin/atelier.mjs status --line          # segment court pour la statusline
node .atelier/bin/atelier.mjs next --limit 5         # tâches prêtes
node .atelier/bin/atelier.mjs show T-0001 --json     # détail machine
node .atelier/bin/atelier.mjs claim T-0001 --agent implementer-T-0001
node .atelier/bin/atelier.mjs evidence T-0001 --result pass --command "npm test"
node .atelier/bin/atelier.mjs doc T-0001 --path README.md
node .atelier/bin/atelier.mjs accept T-0001 --all
node .atelier/bin/atelier.mjs done T-0001 --summary "..."
node .atelier/bin/atelier.mjs kb add "Titre" --kind decision --tags a,b --text "..."
node .atelier/bin/atelier.mjs kb search "terme"
node .atelier/bin/atelier.mjs doctor
```

## Sous-agents

| Type | Rôle | Ne fait pas |
| --- | --- | --- |
| `atelier:planner` | lit le dépôt, découpe, crée les tâches | n'écrit pas de code |
| `atelier:implementer` | exécute **une** tâche, teste, documente, passe en revue | ne termine pas la tâche |
| `atelier:verifier` | relance les contrôles, vérifie les critères, termine ou rouvre | ne modifie pas le code |
| `atelier:researcher` | enquête, écrit une note de connaissance | ne modifie pas le code |
| `atelier:documenter` | réconcilie la documentation et les ADR | ne modifie pas le code |

## Règles d'or

- **Une tâche = un livrable vérifiable**, pas plus d'une heure de travail, un à trois
  fichiers. Si c'est plus gros, découper.
- **Les dépendances sont explicites.** Une tâche ne démarre que si ses dépendances sont
  `done`.
- **Le contexte de l'agent principal reste mince** : déléguer les lectures et les
  recherches aux sous-agents, ne remonter que des résumés de quelques lignes.
- **La qualité prime sur la vitesse.** Mieux vaut trois tâches vérifiées que dix tâches
  prétendument terminées.
- **La documentation fait partie du travail**, pas d'un passage ultérieur.
- **Pas de secret dans le registre.** `.atelier/` est versionné ; n'y écrire aucune clé.

---
name: ticket
description: Ouvre un ticket ou un bug dans le registre Atelier, avec sévérité, critères d'acceptation et contexte. Utiliser quand l'utilisateur signale un défaut, une demande, une régression ou un problème à suivre.
when_to_use: "ouvre un ticket, crée un bug, signale un problème, il y a une régression, note cette demande, ajoute au backlog"
argument-hint: "<titre et description du problème> [--severity critical|high|medium|low]"
allowed-tools: Bash, Read, Grep, Glob
---

Entrée : **$ARGUMENTS**

Si le titre ou la description manque, demande-le avant de créer quoi que ce soit.

## 1. Qualifier

- Défaut reproductible ou régression → **bug** (`atelier bug`), priorité déduite de la
  sévérité (critical/blocker → P0, high → P1, medium → P2, low → P3).
- Demande, amélioration, question à traiter → **ticket** (`atelier ticket`).

Sévérité par défaut : `high` pour un bug qui casse un parcours, `medium` sinon.

## 2. Créer

Depuis la racine du dépôt :

```bash
node .atelier/bin/atelier.mjs bug "<titre court>" \
  --severity <critical|high|medium|low> \
  --description "<contexte, étapes de reproduction, comportement attendu>" \
  --accept "<critère observable 1>" \
  --accept "<critère observable 2>" \
  --verify "<commande de vérification>"
```

ou `ticket` à la place de `bug`. Les critères doivent être des faits vérifiables, pas
des intentions (« le formulaire conserve la saisie après rechargement », pas « corriger
le formulaire »). Ajoute `--depends <ID>` si le correctif dépend d'une tâche existante.

## 3. Répondre

Affiche l'identifiant créé et une ligne de résumé. Propose `/atelier:work <ID>` pour
traiter le ticket immédiatement, ou `/atelier:status` pour le retrouver plus tard.

Ne modifie pas le code dans cette commande.

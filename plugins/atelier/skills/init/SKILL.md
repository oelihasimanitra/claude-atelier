---
name: init
description: Initialise le registre Atelier (.atelier/) dans le dépôt courant. Utiliser quand l'utilisateur veut activer le suivi de projet, planifier un nouveau projet ou reprendre un projet sans registre.
argument-hint: "[nom du projet]"
allowed-tools: Bash, Read, Glob
---

Initialise le registre Atelier à la racine du dépôt.

1. Exécute :

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/atelier.mjs" init --name "$ARGUMENTS"
   ```

2. Lis `.atelier/project.json` et vérifie que `.atelier/bin/atelier.mjs` existe.
3. Lis le début de `.atelier/plan.md`.
4. Réponds en français, en cinq lignes maximum : nom du projet, commandes de
   vérification détectées, documentation détectée, puis propose
   `/atelier:plan <objectif>` pour découper le projet.

Ne crée aucune tâche à cette étape. Ne modifie pas les fichiers du projet.

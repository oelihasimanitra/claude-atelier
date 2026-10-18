---
name: verify
description: Fait vérifier une tâche Atelier par un sous-agent indépendant, qui relance les contrôles, coche ou rejette les critères et termine la tâche si tout est prouvé. Utiliser pour vérifier une tâche sans passer par une vague complète.
when_to_use: "vérifie cette tâche, contrôle le travail, relance les tests, valide T-0001, est-ce que c'est fini"
argument-hint: "[identifiant de tâche]"
allowed-tools: Read, Grep, Glob, Bash, Agent
---

Tâche à vérifier : **$ARGUMENTS**

1. Si aucun identifiant n'est fourni, prends la première tâche en revue :

   ```bash
   node .atelier/bin/atelier.mjs status --json
   node .atelier/bin/atelier.mjs list --status review --json
   ```

2. Lance un sous-agent `atelier:verifier` avec un prompt autonome contenant :
   - l'identifiant et la racine du dépôt ;
   - l'obligation de relire la tâche (`show <ID> --json`) et le diff ;
   - l'obligation de relancer lui-même chaque commande `verify` ;
   - la vérification critère par critère, puis `accept --index N` ;
   - en cas de succès : `evidence --result pass` puis `done --summary "..."` ;
   - en cas d'échec : `evidence --result fail`, `reopen --reason "..."`, liste des écarts ;
   - l'interdiction de modifier le code.

3. Rapporte le verdict en cinq lignes : terminée ou rouverte, preuves exécutées,
   critères validés, écarts éventuels, prochaine action.

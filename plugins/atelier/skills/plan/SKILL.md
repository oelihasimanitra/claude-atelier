---
name: plan
description: Découpe un objectif en un plan étape par étape de petites tâches vérifiables, avec dépendances, priorités et critères d'acceptation, dans le registre Atelier. Utiliser quand l'utilisateur demande un plan, une feuille de route ou la décomposition d'un projet ou d'une fonctionnalité.
when_to_use: "planifie, fais un plan, découpe cette fonctionnalité, feuille de route, organise le projet, par où commencer"
argument-hint: "<objectif ou fonctionnalité>"
allowed-tools: Read, Grep, Glob, Bash, Agent, Write, Edit
---

Objectif à planifier : **$ARGUMENTS**

Si l'objectif est vide, demande-le à l'utilisateur avant de créer la moindre tâche.

## 1. Registre

Si `.atelier/project.json` n'existe pas, initialise-le :

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/atelier.mjs" init
```

Le CLI de référence dans le projet est ensuite `.atelier/bin/atelier.mjs`.

## 2. Délégation

Ne lis pas tout le dépôt toi-même : c'est le rôle du planificateur. Lance le sous-agent
`atelier:planner` avec un prompt autonome qui contient :

- l'objectif exact ;
- la racine du dépôt et le chemin du CLI local ;
- la consigne de lire `CLAUDE.md`, `README`, `docs/`, les manifestes et `git status` ;
- les règles de découpage ci-dessous ;
- l'exigence de créer les tâches lui-même via le CLI ;
- l'exigence de rendre un résumé compact, pas le plan entier.

Règles à transmettre impérativement au planificateur :

1. Une tâche = **un livrable vérifiable**, une à trois fichiers, une heure de travail
   au maximum. Si c'est plus gros, découper.
2. Chaque tâche a **au moins un critère d'acceptation** formulé comme un fait
   observable, et **au moins une commande de vérification** issue de
   `.atelier/project.json` (`--verify`).
3. Les dépendances sont explicites (`--depends`). Aucun cycle. Maximiser ce qui peut
   être exécuté en parallèle.
4. Regrouper par épopée (`--epic E-01`, `E-02`…) et prioriser (`P0` à `P3`).
5. Plafonner à **12 nouvelles tâches par passe**. Si le projet est plus gros, créer la
   première étape cohérente et laisser la suite pour une passe ultérieure.
6. Ne pas écrire de code de production. Ne pas modifier les fichiers du projet.
7. Enregistrer une décision dans la base de connaissances (`kb add --kind decision`)
   seulement si le plan fixe un choix durable.
8. Terminer par `render` et renvoyer la liste des identifiants créés, le chemin
   critique et le nombre de tâches parallélisables.

## 3. Après le planificateur

1. Exécute `node .atelier/bin/atelier.mjs render`.
2. Lis `node .atelier/bin/atelier.mjs status --json`.
3. Présente à l'utilisateur, en quinze lignes maximum : nombre de tâches créées, les
   épopées, le chemin critique, les tâches prêtes immédiatement.
4. Propose `/atelier:work` pour lancer la première vague.

Ne crée pas de tâches toi-même et ne code pas dans cette commande.

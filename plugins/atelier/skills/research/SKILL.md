---
name: research
description: Mène une recherche parallèle avec plusieurs sous-agents, consigne les résultats dans la base de connaissances Atelier et transforme les conclusions actionnables en tâches. Utiliser quand l'utilisateur pose une question ouverte sur le code, une technologie, une API ou une architecture.
when_to_use: "recherche, enquête, compare les options, quel est le meilleur choix, explore le code, documente cette recherche"
argument-hint: "<question de recherche>"
allowed-tools: Read, Grep, Glob, Bash, Agent, WebFetch, WebSearch
---

Question : **$ARGUMENTS**

Si la question est vide, demande-la. Si le registre n'existe pas, propose
`/atelier:init`.

## 1. Découper

Identifie deux à quatre axes indépendants (par exemple : état du code, options
externes, contraintes du projet, risques). Au-delà de quatre, la synthèse perd en
qualité pour un gain marginal.

## 2. Lancer les chercheurs — en parallèle

Dans un seul message, lance un sous-agent `atelier:researcher` par axe. Chaque prompt
doit contenir :

- la question précise de l'axe, la racine du dépôt et le CLI local ;
- l'obligation de vérifier les faits dans le dépôt ou dans des sources citées ;
- l'obligation d'écrire une note concise avec
  `node .atelier/bin/atelier.mjs kb add "<titre>" --kind research --tags <tags> --stdin`
  (contenu sur l'entrée standard) ;
- un rapport de huit lignes maximum : faits, sources, incertitudes.

## 3. Synthétiser

Écris la synthèse dans `.atelier/tmp/research-synthesis.md` avec l'outil Write, puis :

```bash
node .atelier/bin/atelier.mjs kb add "Synthèse — <question>" \
  --kind research --tags <tags> --file .atelier/tmp/research-synthesis.md
```

La synthèse doit distinguer clairement **faits vérifiés**, **hypothèses** et
**incertitudes**, avec les chemins de fichiers ou URL à l'appui.

## 4. Transformer en actions

Crée une tâche Atelier uniquement pour les conclusions qui demandent un changement
concret dans le projet :

```bash
node .atelier/bin/atelier.mjs new "<action>" --accept "<critère>" --verify "<commande>" --priority P2
```

Ne crée pas de tâche pour une simple curiosité. Termine par `render`.

## 5. Répondre

Quinze lignes maximum : réponse directe, faits saillants, incertitudes, tâches créées,
chemin de la note de synthèse.

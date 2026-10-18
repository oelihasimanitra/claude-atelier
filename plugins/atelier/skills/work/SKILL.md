---
name: work
description: Exécute les tâches prêtes du registre Atelier avec des sous-agents en parallèle, puis les fait vérifier indépendamment et documenter. Utiliser quand l'utilisateur demande d'exécuter les tâches, d'avancer sur le projet, de vider la file ou de lancer les agents.
when_to_use: "exécute les tâches, avance sur le projet, travaille sur la file, lance les agents, fais le travail, continue le plan"
argument-hint: "[nombre max de tâches en parallèle (1-5) | identifiants de tâches]"
allowed-tools: Read, Grep, Glob, Bash, Agent, Write, Edit
---

Exécute une vague de tâches prêtes, avec vérification indépendante obligatoire.

## 1. Lire l'état

```bash
node .atelier/bin/atelier.mjs status --json
node .atelier/bin/atelier.mjs next --limit 8 --json
```

Si le registre n'existe pas, propose `/atelier:init`. Si aucune tâche n'est prête,
explique ce qui bloque (dépendances, verrous) et arrête-toi.

Interprète `$ARGUMENTS` :

- un nombre de 1 à 5 → nombre maximal de tâches dans la vague (défaut : **3**) ;
- des identifiants (`T-0003 T-0004`) → uniquement ceux-là, s'ils sont prêts ;
- vide → les trois premières tâches prêtes.

Ne dépasse jamais cinq agents en parallèle sans demande explicite.

## 2. Sélectionner et réserver

Choisis des tâches **indépendantes** : pas de dépendance entre elles et, si le champ
`files` est renseigné, pas de fichiers communs. En cas de doute, sérialise.

Pour chaque tâche retenue, réserve-la avant de lancer l'agent :

```bash
node .atelier/bin/atelier.mjs claim <ID> --agent implementer-<ID>
```

Si une réservation échoue, retire la tâche de la vague et signale-la.

## 3. Lancer les implémenteurs — en parallèle

Dans **un seul message**, lance un sous-agent `atelier:implementer` par tâche réservée.
Chaque prompt doit être autonome et contenir :

- l'identifiant de la tâche et le chemin absolu de la racine ;
- le nom d'agent exact utilisé pour la réservation ;
- la consigne de lire `show <ID> --json` avant de commencer ;
- l'interdiction de toucher à une autre tâche ;
- l'obligation de lancer lui-même les commandes `verify`, d'enregistrer les preuves,
  de mettre à jour la documentation, puis d'appeler `review` ;
- l'interdiction de terminer la tâche (seul le vérificateur le fait) ;
- un rapport final de dix lignes maximum : état, fichiers modifiés, commandes et
  résultats, risques, éléments non faits.

## 4. Vérifier — en parallèle

Quand un implémenteur rend la main, contrôle que la tâche est bien en `review`. Sinon,
ajoute une note et libère-la (`release`) si elle est bloquée.

Pour chaque tâche en revue, lance un sous-agent `atelier:verifier` (un seul message,
plusieurs appels). Son prompt doit exiger :

- de ne pas faire confiance au rapport de l'implémenteur ;
- de relire la tâche et le diff (`git diff`, `git status`) ;
- de relancer lui-même chaque commande `verify` ;
- de vérifier chaque critère et de le cocher avec `accept --index N` ;
- en cas de succès : `evidence --result pass` puis `done --summary "..."` ;
- en cas d'échec : `evidence --result fail`, `reopen --reason "..."`, et la liste
  précise des écarts ;
- de ne modifier aucun fichier de code ;
- un verdict de cinq lignes.

Ne termine jamais une tâche toi-même et n'utilise pas `--force` dans le flux normal.

## 5. Documenter

Après la vérification, lance un `atelier:documenter` pour la vague (une seule fois) :

- réconcilier README, CHANGELOG et `docs/` avec les changements réellement livrés ;
- créer ou mettre à jour une note de base de connaissances si une décision a été prise ;
- enregistrer chaque document avec `doc <ID> --path ...` ;
- signaler toute incohérence entre le plan et le code.

## 6. Rendre et rapporter

```bash
node .atelier/bin/atelier.mjs render
node .atelier/bin/atelier.mjs status
```

Rapporte en douze lignes maximum : tâches terminées, tâches rouvertes avec la raison,
tâches bloquées, prochaine vague prête. Si des tâches restent prêtes, propose de
relancer `/atelier:work`.

## Règles absolues

- **Aucune tâche n'est terminée sans vérificateur indépendant.**
- **Aucune preuve inventée** : la commande et son résultat doivent avoir été exécutés.
- **Une tâche = un agent.** Ne mélange pas deux tâches dans un même prompt.
- **Le contexte principal reste mince** : ne lis pas les fichiers que les sous-agents
  lisent ; ne garde que leurs résumés.

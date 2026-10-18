# Architecture

## Contraintes de conception

Atelier est un outil local, mono-utilisateur, sans service. Quatre contraintes ont guidé
chaque choix :

1. **Aucun réseau, aucun secret.** Le CLI et le plugin ne contactent aucun service et ne
   lisent aucun identifiant. Tout est fichier local.
2. **Aucune dépendance.** Le CLI n'utilise que les modules natifs de Node 20+. Rien à
   installer, rien à compiler.
3. **Le registre appartient au projet.** Les tâches, le plan et les notes sont des
   fichiers versionnés avec le code. Le registre survit à la désinstallation du plugin.
4. **Le contexte de l'agent principal reste mince.** Les sous-agents lisent les détails ;
   l'agent principal ne reçoit que le plan, les verdicts et les écarts.

## Composants

```text
claude-atelier/
├─ .claude-plugin/
│  └─ marketplace.json          catalogue du marketplace « oely-atelier »
├─ plugins/atelier/
│  ├─ .claude-plugin/plugin.json
│  ├─ agents/                   5 définitions de sous-agents
│  ├─ hooks/hooks.json          SessionStart et Stop
│  ├─ scripts/atelier.mjs       CLI complet
│  ├─ skills/                   9 skills
│  └─ tests/atelier.test.mjs    12 tests
├─ docs/                        cette documentation
├─ package.json                 scripts de test et de validation
└─ README.md
```

### Le CLI

`scripts/atelier.mjs` est le seul composant qui écrit dans le registre. Les skills et
les agents ne font que l'appeler. Cette centralisation garantit :

- les mêmes règles de validation partout ;
- des écritures atomiques ;
- un verrouillage cohérent ;
- un rendu unique du plan et du statut.

### Les skills

Un skill est une procédure chargée à la demande. `atelier/SKILL.md` porte le protocole
général ; les autres portent un cas d'usage (`plan`, `work`, `ticket`, `research`,
`learn`, `verify`, `status`, `init`).

Les skills ne contiennent pas de logique métier : ils indiquent quand appeler le CLI et
comment orchestrer les agents.

### Les agents

Les agents sont des sous-processus Claude avec un prompt système et une liste d'outils.
Ils ne partagent pas le contexte de l'agent principal ; ils reçoivent une tâche, lisent
ce qu'il faut, agissent, puis rendent un rapport court.

| Agent | Peut écrire du code | Peut terminer une tâche |
|---|---|---|
| `planner` | non | non |
| `implementer` | oui | non |
| `verifier` | non | oui |
| `researcher` | non (notes uniquement) | non |
| `documenter` | documentation uniquement | non |

### Les hooks

`hooks/hooks.json` déclare deux hooks, exécutés avec `${CLAUDE_PLUGIN_ROOT}` :

**SessionStart** — lit le registre et renvoie du contexte supplémentaire :

```json
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"..."}}
```

Le texte contient le nom du projet, la progression, les tâches en cours, les tâches
prêtes avec leur titre, les blocages, le nombre de notes et les rappels de protocole. Il
est plafonné par le harnais (10 000 caractères) ; le CLI ne produit que quelques lignes.

**Stop** — régénère `status.json` en fin de tour. Sortie vide : aucun contexte n'est
injecté.

Les hooks s'exécutent dans tous les projets où le plugin est activé. En l'absence de
registre, ils ne produisent rien.

## Le registre

```text
.atelier/
├─ project.json          métadonnées : nom, vérifications, documents, langue
├─ plan.md               plan lisible, régénéré à chaque mutation
├─ status.json           état compact, régénéré (non versionné)
├─ tasks/<ID>.json       une tâche par fichier
├─ kb/
│  ├─ index.md           index des notes
│  ├─ notes/             notes datées
│  └─ decisions/         ADR numérotées
├─ runs/<ID>/            rapports de sous-agents
├─ locks/                verrous éphémères (non versionnés)
├─ tmp/                  brouillons (non versionné)
├─ bin/atelier.mjs       copie locale du CLI
└─ .gitignore            exclut status.json, locks/ et tmp/
```

`project.json` :

```json
{
  "version": 1,
  "name": "Café App",
  "created_at": "2026-10-18T09:00:00.000Z",
  "checks": ["npm run check", "cargo test"],
  "docs": ["README.md", "docs", "CHANGELOG.md"],
  "language": "fr"
}
```

Une tâche :

```json
{
  "version": 1,
  "id": "T-0001",
  "title": "Valider le formulaire",
  "kind": "task",
  "type": "feature",
  "status": "review",
  "priority": "P1",
  "epic": "E-02",
  "description": "...",
  "acceptance": [{ "text": "Un courriel invalide affiche un message", "done": true }],
  "verify": ["npm test -- formulaire"],
  "files": ["src/features/form/Form.tsx"],
  "depends_on": ["T-0000"],
  "assignee": "implementer-T-0001",
  "claimed_at": "...",
  "created_at": "...",
  "updated_at": "...",
  "done_at": null,
  "blocked_reason": null,
  "summary": "Validation ajoutée, tests à jour.",
  "evidence": [
    { "at": "...", "agent": "implementer-T-0001", "command": "npm test -- formulaire",
      "result": "pass", "note": "14 tests, 0 échec" }
  ],
  "docs": [{ "at": "...", "agent": "documenter", "path": "docs/forms.md", "note": "..." }],
  "journal": [{ "at": "...", "agent": "implementer-T-0001", "text": "Prise par ..." }]
}
```

## Cycle de vie

```text
            claim                  review                 done
  todo ──────────────► in_progress ──────────► review ──────────► done
    ▲                     │                     │
    │      release        │      reopen         │
    └─────────────────────┘◄────────────────────┘
          │                       │
          │ block                 │ block
          ▼                       ▼
       blocked ── unblock ──► todo
```

- `claim` vérifie les dépendances et pose un verrou.
- `review` exige le statut `in_progress` et enregistre un résumé.
- `done` applique les cinq conditions ; seule la dérogation `--force --reason` les
  contourne, de façon tracée.
- `drop` abandonne une tâche avec une raison.

## Concurrence

- **Verrou par tâche** : `.atelier/locks/<ID>.lock`, créé avec `wx` (échec si le fichier
  existe). Un verrou de plus de deux heures est considéré comme abandonné.
- **Verrou d'identifiant** : un verrou global court protège l'attribution des numéros,
  pour éviter deux `T-0002` si deux agents créent une tâche simultanément.
- **Attente bornée** : les verrous courts utilisent `Atomics.wait` pour dormir sans
  bloquer le processus.
- **Écritures atomiques** : chaque fichier est écrit dans un temporaire puis renommé.
  Un lecteur ne voit jamais un JSON tronqué.

Le modèle suppose un seul utilisateur et un seul dépôt par machine. Il ne cherche pas à
fusionner deux registres divergents : c'est le rôle de Git, et les fichiers sont conçus
pour se résoudre ligne à ligne.

## Flux d'une session

```text
Claude Code démarre
  └─ hook SessionStart
       └─ lit .atelier/ et injecte le contexte

Utilisateur : /atelier:plan <objectif>
  └─ skill plan → agent planner
       └─ CLI new × N, doctor, render
       └─ rapport court (IDs, chemin critique, parallélisme)

Utilisateur : /atelier:work
  └─ skill work
       ├─ claim des tâches prêtes (3 par défaut)
       ├─ agents implementer en parallèle (un par tâche)
       │    └─ code, tests, evidence, doc, review
       ├─ agents verifier en parallèle
       │    └─ relance, accept, done ou reopen
       ├─ agent documenter pour le lot
       └─ render + rapport

Fin de tour
  └─ hook Stop → status.json
       └─ barre de statut relue toutes les 60 s
```

## Sécurité

- Aucun appel réseau dans `scripts/`, `skills/` ou `agents/`.
- Aucun accès à un trousseau, un `.env` ou une variable d'environnement sensible.
- Les agents ont des listes d'outils explicites ; `researcher` est le seul à disposer de
  `WebFetch` et `WebSearch`, et il ne peut pas modifier le code.
- `implementer` et `documenter` peuvent écrire, mais leurs prompts interdisent les
  commits et les migrations destructives ; le harnais ne peut pas l'imposer
  techniquement, la revue indépendante est la seconde barrière.
- Les hooks n'exécutent que le CLI embarqué, avec un chemin fourni par le harnais.

## Limites connues

- Le plugin ne peut pas définir lui-même la barre de statut principale ; l'intégration au
  script utilisateur est manuelle (documentée dans `INSTALL.md`).
- Les hooks s'exécutent dans tous les projets activés : le coût est une recherche de
  `.atelier/project.json` en remontant les dossiers, à chaque session et à chaque tour.
- `status.json` n'est pas versionné : deux machines voient des statuts générés
  localement, ce qui est le comportement attendu.
- Les agents ne partagent pas de mémoire entre eux ; le registre est leur seul canal de
  coordination.

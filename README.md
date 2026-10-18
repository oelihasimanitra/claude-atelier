# Atelier

Planificateur de projet, suivi des tâches, tickets et bugs, base de connaissances et
orchestration de sous-agents pour **Claude Code**.

Atelier installe un registre versionné dans chaque dépôt (`.atelier/`) et donne à Claude
un protocole de travail reproductible : découper un objectif en petites tâches
vérifiables, les exécuter en parallèle avec des sous-agents spécialisés, prouver chaque
livraison, documenter au même moment, et afficher l'avancement en direct dans la barre
de statut.

## Ce que fait Atelier

| Capacité | Comment |
|---|---|
| Planification | `/atelier:plan` découpe un objectif en tâches atomiques avec critères d'acceptation, commandes de vérification et dépendances. |
| Exécution parallèle | `/atelier:work` réserve les tâches prêtes et lance un `implementer` par tâche, puis un `verifier` indépendant. |
| Tickets et bugs | `/atelier:ticket` ouvre un ticket ou un bug, avec sévérité, priorité et critères d'acceptation. |
| Base de connaissances | Notes, ADR et recherches dans `.atelier/kb/`, indexées et interrogeables par `kb search`. |
| Garde-fou de qualité | Une tâche ne peut être terminée qu'avec critères cochés, preuve d'exécution PASS, documentation enregistrée et résumé. |
| Documentation continue | Le skill `learn` et l'agent `documenter` alignent README, CHANGELOG, docs et base de connaissances. |
| Statut visible | Un segment compact dans la barre de statut, mis à jour à chaque commande et en fin de tour. |
| Contexte préservé | Les sous-agents travaillent chacun sur une tâche ; l'agent principal ne garde que le plan et les verdicts. |

Aucun serveur, aucun compte, aucune synchronisation. Le registre est constitué de
fichiers JSON et Markdown, lisibles et versionnables avec le code.

## Installation

Prérequis : **Claude Code 2.1+** et **Node.js 20+**.

```bash
git clone https://github.com/<votre-compte>/claude-atelier.git ~/Documents/claude-atelier
cd ~/Documents/claude-atelier
claude plugin marketplace add ./ --scope user
claude plugin install atelier@oely-atelier --scope user
```

L'installation au niveau **user** rend le plugin disponible dans tous les projets
présents et futurs. Redémarrez Claude Code pour charger les hooks.

Vérification :

```bash
claude plugin list          # atelier@oely-atelier, enabled
claude plugin details atelier
```

Détails, mise à jour et désinstallation : [`docs/INSTALL.md`](docs/INSTALL.md).

## Démarrage rapide

Dans un dépôt, depuis Claude Code :

```text
/atelier:init Mon projet
/atelier:plan Ajouter l'authentification par courriel
/atelier:work
/atelier:status
```

`init` crée `.atelier/`, détecte les commandes de vérification du projet (`npm run
check`, `npm test`, `cargo test`, `pytest`…) et installe une copie locale du CLI dans
`.atelier/bin/atelier.mjs`, afin que le registre reste utilisable même sans le plugin.

### Travail direct en ligne de commande

```bash
node .atelier/bin/atelier.mjs status
node .atelier/bin/atelier.mjs next --limit 5
node .atelier/bin/atelier.mjs list --ready
node .atelier/bin/atelier.mjs doctor
```

Référence complète : [`docs/COMMANDS.md`](docs/COMMANDS.md).

## Skills

| Skill | Rôle |
|---|---|
| `/atelier:atelier` | Protocole général, chargé au démarrage de session. |
| `/atelier:init` | Initialise le registre dans le dépôt courant. |
| `/atelier:plan <objectif>` | Découpe en tâches vérifiables (12 maximum par passe). |
| `/atelier:work` | Exécute les tâches prêtes avec implémenteurs et vérificateurs. |
| `/atelier:status` | Tableau de bord en lecture seule. |
| `/atelier:ticket <titre>` | Ouvre un ticket ou un bug. |
| `/atelier:research <question>` | Enquête en parallèle et consigne les résultats en base de connaissances. |
| `/atelier:learn` | Enregistre une connaissance durable (note ou ADR). |
| `/atelier:verify <ID>` | Vérification indépendante d'une tâche. |

## Agents

| Agent | Outils | Rôle |
|---|---|---|
| `atelier:planner` | lecture + CLI | Découpe et priorise, sans écrire de code. |
| `atelier:implementer` | lecture, écriture, CLI | Exécute **une** tâche, produit preuves et documentation, passe en revue. |
| `atelier:verifier` | lecture + CLI | Relance les contrôles, coche les critères, termine ou rouvre. |
| `atelier:researcher` | lecture, web, CLI | Enquête sur un axe et écrit une note sourcée. |
| `atelier:documenter` | lecture, écriture, CLI | Réconcilie la documentation, sans toucher au code. |

## Le garde-fou

`done` refuse une tâche si l'un des éléments manque :

- au moins un critère d'acceptation, tous cochés ;
- au moins une preuve `PASS` enregistrée après exécution réelle ;
- au moins un document mis à jour et enregistré ;
- un résumé du livrable ;
- des dépendances terminées.

Une dérogation est possible avec `--force --reason "..."`, mais elle est enregistrée
dans la tâche et signalée par `doctor`. Voir [`docs/QUALITY.md`](docs/QUALITY.md).

## Barre de statut

Le hook `SessionStart` charge le contexte du registre, le hook `Stop` rafraîchit
`.atelier/status.json`. Un segment peut afficher :

```text
/cafe-app | ▣ 4/9 · 2 en cours | Claude Sonnet 4.5 | ctx [████░░░░░░] 42%
```

Le plugin ne peut pas modifier lui-même `statusLine` dans les réglages principaux.
L'intégration au script existant est décrite dans [`docs/INSTALL.md`](docs/INSTALL.md#barre-de-statut).

## Structure du registre

```text
.atelier/
├─ project.json        nom, commandes de vérification, documentation
├─ plan.md             plan lisible, régénéré
├─ status.json         état compact pour la barre de statut (généré, non versionné)
├─ tasks/T-0001.json   une tâche par fichier
├─ kb/
│  ├─ index.md         index des notes
│  ├─ notes/           notes et recherches
│  └─ decisions/       ADR numérotées
├─ runs/<ID>/          rapports de sous-agents
├─ locks/              verrous éphémères (non versionnés)
├─ tmp/                brouillons (non versionné)
└─ bin/atelier.mjs     copie locale du CLI
```

Seuls `status.json`, `locks/` et `tmp/` sont ignorés par Git.

## Garanties

- Aucun appel réseau, aucune lecture de secret, aucune base de données externe.
- Aucune dépendance npm : uniquement les modules natifs de Node.
- Toutes les écritures sont atomiques (fichier temporaire puis renommage).
- Les tâches sont verrouillées pendant leur exécution ; un verrou abandonné expire au
  bout de deux heures.
- Documentation et interface en français ; code et messages de commit en anglais.

## Documentation

- [`docs/INSTALL.md`](docs/INSTALL.md) — installation, mise à jour, barre de statut.
- [`docs/COMMANDS.md`](docs/COMMANDS.md) — référence du CLI et de chaque commande.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — couches, cycle de vie, hooks.
- [`docs/QUALITY.md`](docs/QUALITY.md) — critères, preuves et dérogations.
- [`CHANGELOG.md`](CHANGELOG.md) — journal des versions.

## Développement

```bash
npm test                                 # 12 tests du CLI
claude plugin validate ./plugins/atelier --strict
claude plugin validate . --strict
```

## Licence

MIT — voir [`LICENSE`](LICENSE).

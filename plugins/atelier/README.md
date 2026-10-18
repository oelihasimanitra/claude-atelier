# Plugin Atelier

Planificateur de projet, suivi des tâches, tickets et bugs, base de connaissances et
orchestration de sous-agents pour Claude Code.

Ce dossier est le plugin lui-même. Il est distribué par le marketplace `oely-atelier` du
dépôt [claude-atelier](https://github.com/oelihasimanitra/claude-atelier).

## Contenu

```text
atelier/
├─ .claude-plugin/plugin.json   manifeste (version, auteur, mots-clés)
├─ agents/                      planner, implementer, verifier, researcher, documenter
├─ hooks/hooks.json             SessionStart (contexte) et Stop (statut)
├─ scripts/atelier.mjs          CLI complet, sans dépendance
├─ skills/                      9 procédures : atelier, init, plan, work, status,
│                               ticket, research, learn, verify
└─ tests/atelier.test.mjs       12 tests (node --test)
```

## Installation

Depuis la racine du dépôt :

```bash
./install.sh          # macOS, Linux, Git Bash
powershell -ExecutionPolicy Bypass -File .\install.ps1   # Windows
```

Ou manuellement :

```bash
claude plugin marketplace add ./ --scope user
claude plugin install atelier@oely-atelier --scope user
```

Redémarrez Claude Code. Vérification : `claude plugin details atelier`.

## Utilisation

```text
/atelier:init Café App
/atelier:plan Ajouter l'authentification par courriel
/atelier:work
/atelier:status
```

## Garanties

- Aucun appel réseau dans les skills, les agents ou le CLI.
- Aucun accès à un secret.
- Aucune dépendance npm : modules natifs de Node 20+ uniquement.
- Écritures atomiques et verrous par tâche.

## Tests et validation

À la racine du dépôt :

```bash
npm test
claude plugin validate ./plugins/atelier --strict
```

## Documentation

Le manuel complet se trouve à la racine du dépôt :
[`docs/GUIDE.md`](../../docs/GUIDE.md), avec un
[démarrage rapide](../../docs/QUICKSTART.md) et la
[référence du CLI](../../docs/COMMANDS.md).

## Licence

MIT — voir [`LICENSE`](../../LICENSE).

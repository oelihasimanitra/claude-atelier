# Démarrage rapide

Installer Atelier sur une nouvelle machine, puis lancer un premier projet. Comptez dix
minutes.

## 1. Prérequis

| Outil | Version | Vérification |
|---|---|---|
| Claude Code | 2.1+ | `claude --version` |
| Node.js | 20+ | `node --version` |
| Git | récent | `git --version` |

Si `claude` ou `node` n'est pas reconnu, installez-les et rouvrez le terminal **avant**
de continuer.

## 2. Récupérer le dépôt

```bash
git clone https://github.com/oelihasimanitra/claude-atelier.git ~/Documents/claude-atelier
cd ~/Documents/claude-atelier
```

Sans Git, téléchargez l'archive depuis GitHub, décompressez-la, puis placez-vous dans le
dossier obtenu. Les commandes suivantes fonctionnent à l'identique.

## 3. Installer le plugin

### Windows (PowerShell)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

### macOS, Linux, Git Bash

```bash
./install.sh
```

Le script vérifie Node, la commande `claude`, ajoute le marketplace `oely-atelier` et
installe le plugin au niveau **user**. Il est idempotent : le relancer ne casse rien.

### Installation manuelle

```bash
cd ~/Documents/claude-atelier
claude plugin marketplace add ./ --scope user
claude plugin install atelier@oely-atelier --scope user
```

## 4. Vérifier

```bash
claude plugin list
claude plugin details atelier
```

Attendu :

```text
atelier@oely-atelier
  Version: 0.1.0
  Scope: user
  Status: enabled

Skills (9)  atelier, init, learn, plan, research, status, ticket, verify, work
Agents (5)  documenter, implementer, planner, researcher, verifier
Hooks (2)   SessionStart, Stop
```

**Redémarrez Claude Code** : les skills et les hooks sont chargés au démarrage de
session.

## 5. Premier projet

Ouvrez Claude Code dans un dépôt de projet (ou créez-en un) :

```bash
mkdir ~/projets/cafe-app && cd ~/projets/cafe-app
git init -b main
claude
```

Dans la session :

```text
/atelier:init Café App
```

Atelier crée `.atelier/`, détecte les commandes de vérification (`npm run check`,
`npm test`, `cargo test`, `pytest`…) et affiche le nom du projet.

Découpez ensuite un objectif :

```text
/atelier:plan Ajouter une page de connexion par courriel
```

Le planificateur crée des tâches petites et vérifiables, par exemple :

```text
T-0001  P1  Créer le formulaire de connexion
T-0002  P1  Valider le courriel côté client        dep T-0001
T-0003  P1  Brancher l'appel de connexion          dep T-0001
T-0004  P2  Ajouter les tests d'intégration        dep T-0003
```

Puis exécutez :

```text
/atelier:work
```

Atelier réserve les tâches prêtes, lance un implémenteur par tâche, puis un vérificateur
indépendant. Chaque tâche terminée a ses critères cochés, une preuve d'exécution et sa
documentation.

À tout moment :

```text
/atelier:status
```

ou, dans un terminal :

```bash
node .atelier/bin/atelier.mjs status
node .atelier/bin/atelier.mjs next --limit 5
```

## 6. Sans le plugin

Le registre est autonome. Après `init`, la copie `.atelier/bin/atelier.mjs` fonctionne
partout où Node est présent :

```bash
node .atelier/bin/atelier.mjs status
node .atelier/bin/atelier.mjs list --ready
node .atelier/bin/atelier.mjs doctor
```

## 7. Mettre à jour

```bash
cd ~/Documents/claude-atelier
git pull
claude plugin marketplace update oely-atelier
claude plugin update atelier
```

Redémarrez Claude Code. Voir [INSTALL.md](INSTALL.md) pour la barre de statut, la
désinstallation et le dépannage.

## 8. Où continuer

- [GUIDE.md](GUIDE.md) — la boucle de travail complète.
- [COMMANDS.md](COMMANDS.md) — toutes les commandes.
- [QUALITY.md](QUALITY.md) — pourquoi `done` refuse une tâche, et comment déroger.

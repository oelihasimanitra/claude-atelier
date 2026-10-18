# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Versionnement [sémantique](https://semver.org/lang/fr/).

## [0.1.0] — 2026-10-18

### Ajouté

- CLI Atelier sans dépendance : projet, tâches, tickets, bugs, dépendances,
  verrous, preuves, documentation, base de connaissances et rendu du plan.
- Garde-fou de qualité sur `done` : critères cochés, preuve `PASS`, documentation
  enregistrée, résumé et dépendances terminées ; dérogation tracée par
  `--force --reason`.
- Neuf skills : `atelier`, `init`, `plan`, `work`, `status`, `ticket`, `research`,
  `learn`, `verify`.
- Cinq agents : `planner`, `implementer`, `verifier`, `researcher`, `documenter`.
- Hooks `SessionStart` (contexte du registre) et `Stop` (rafraîchissement du
  statut).
- Marketplace `oely-atelier`, installation au niveau utilisateur.
- Segment d'avancement intégré à la barre de statut PowerShell.
- Douze tests automatisés du CLI.
- Manuels d'installation et d'utilisation : `docs/QUICKSTART.md`,
  `docs/GUIDE.md`, index de la documentation et README du plugin.
- Scripts d'installation idempotents : `install.sh` et `install.ps1`.

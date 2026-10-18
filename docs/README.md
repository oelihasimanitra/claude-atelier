# Documentation d'Atelier

Ce dossier contient la documentation de référence. Tous les documents sont en français
et décrivent le comportement réel du code livré.

## Par où commencer

| Vous voulez… | Lisez |
|---|---|
| Installer Atelier sur une nouvelle machine et démarrer tout de suite | [QUICKSTART.md](QUICKSTART.md) |
| Comprendre comment travailler au quotidien | [GUIDE.md](GUIDE.md) |
| Connaître chaque commande et chaque option | [COMMANDS.md](COMMANDS.md) |
| Savoir pourquoi une tâche est refusée | [QUALITY.md](QUALITY.md) |
| Comprendre l'architecture et les hooks | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Mettre à jour, désinstaller ou brancher la barre de statut | [INSTALL.md](INSTALL.md) |

## Parcours conseillé

1. **[QUICKSTART.md](QUICKSTART.md)** — dix minutes, de l'installation au premier plan.
2. **[GUIDE.md](GUIDE.md)** — la boucle de travail, les rôles, les cas courants.
3. **[QUALITY.md](QUALITY.md)** — les cinq conditions de clôture et la dérogation.
4. **[COMMANDS.md](COMMANDS.md)** — la référence à garder sous la main.
5. **[ARCHITECTURE.md](ARCHITECTURE.md)** — pour comprendre ou modifier le plugin.

## Règles de la documentation

- Une commande citée doit avoir été exécutée pour de bon.
- Un comportement décrit doit être observable dans le CLI ou les tests.
- Toute modification de code met à jour la documentation dans le même commit.

## Fichiers

```text
docs/
├─ README.md        ce fichier
├─ QUICKSTART.md    installation et premier projet
├─ GUIDE.md         manuel d'utilisation
├─ COMMANDS.md      référence du CLI
├─ QUALITY.md       garde-fou de qualité
├─ ARCHITECTURE.md  conception et flux
└─ INSTALL.md       installation, mise à jour, barre de statut
```

# Référence du CLI

Deux façons d'appeler le CLI, équivalentes :

```bash
node .atelier/bin/atelier.mjs <commande>   # copie locale, versionnée avec le projet
node <plugin>/scripts/atelier.mjs <commande>  # copie du plugin
```

La copie locale est préférée après `init` : elle fonctionne même sans le plugin.

## Conventions

### Racine du registre

- `--root <chemin>` impose la racine.
- Sinon, la racine Git du répertoire courant est utilisée.
- Sinon, le répertoire courant.

Lancer `init` depuis un sous-dossier crée donc le registre à la racine du dépôt, pas
dans le sous-dossier.

### Identifiants

Les identifiants sont générés par type et sur quatre chiffres :

| Type | Préfixe | Exemple |
|---|---|---|
| `task` | `T` | `T-0001` |
| `bug` | `B` | `B-0001` |
| `ticket` | `Q` | `Q-0001` |
| `research` | `R` | `R-0001` |
| `docs` | `D` | `D-0001` |
| `chore` | `C` | `C-0001` |

Ils sont sensibles à la casse à l'écriture mais comparés en majuscules. Utilisez la
forme complète (`T-0001`) dans les scripts.

### Statuts

`todo` → `in_progress` → `review` → `done`

Statuts latéraux : `blocked`, `dropped`.

### Priorités

`P0` (critique) à `P3` (plus tard). Défaut : `P2`.

### Sévérités

`critical` et `blocker` → `P0`, `high` → `P1`, `medium` → `P2`, `low` → `P3`.
Un bug sans sévérité est `P1` ; un ticket sans sévérité est `P2`.

### Options communes

- `--root <chemin>` — racine explicite.
- `--json` — sortie machine (sur `list`, `show`, `next`, `status`).
- `--agent <nom>` — nom enregistré dans le journal et les verrous.

## Projet

### `init [nom]`

Crée `.atelier/`, détecte les commandes de vérification et la documentation, copie le
CLI dans `.atelier/bin/atelier.mjs`, génère le plan et le statut.

```bash
node .atelier/bin/atelier.mjs init "Café App"
```

Options : `--name <nom>`, `--root <chemin>`. `init` est idempotent : relancé sur un
registre existant, il conserve le nom, les vérifications et les documents déjà
enregistrés, et rafraîchit `.atelier/bin/atelier.mjs` avec la version courante du CLI.

Détection automatique des vérifications :

- `npm run check`, sinon `npm test`, sinon `lint` et `typecheck` ;
- `pnpm`, `yarn` ou `bun` selon le fichier de verrouillage ;
- `cargo test` si `Cargo.toml` ;
- `pytest` si `pyproject.toml` ou `pytest.ini`.

### `status [--json|--line]`

Tableau de bord ; régénère `plan.md`, `status.json` et `kb/index.md`.

```bash
node .atelier/bin/atelier.mjs status
node .atelier/bin/atelier.mjs status --line    # « 4/9 · 2 prêtes »
node .atelier/bin/atelier.mjs status --json
```

### `render`

Régénère les trois artefacts sans afficher le tableau de bord.

### `doctor`

Valide le registre : statuts, priorités, types, dépendances absentes, cycles,
complétude des tâches terminées, verrous incohérents.

- code `0` si aucune erreur (les dérogations `--force` sont des avertissements) ;
- code `1` s'il reste une erreur.

## Tâches

### `new <titre>`

```bash
node .atelier/bin/atelier.mjs new "Valider le formulaire" \
  --kind task \
  --priority P1 \
  --epic E-02 \
  --accept "Un courriel invalide affiche un message" \
  --accept "Un courriel valide soumet le formulaire" \
  --verify "npm test -- formulaire" \
  --depends T-0001 \
  --files "src/features/form/Form.tsx,src/features/form/Form.test.tsx" \
  --description "Le formulaire existe mais n'a aucune validation."
```

Options : `--kind`, `--type`, `--priority`, `--epic`, `--accept` (répétable),
`--verify` (répétable), `--depends` (liste séparée par des virgules), `--files`
(liste), `--description`, `--agent`.

Une dépendance inconnue est refusée à la création.

### `bug <titre>` et `ticket <titre>`

```bash
node .atelier/bin/atelier.mjs bug "Le bouton reste grisé" --severity high
node .atelier/bin/atelier.mjs ticket "Ajouter l'export CSV" --severity low
```

Les deux acceptent les mêmes options que `new`, plus `--severity`.

### `list`

```bash
node .atelier/bin/atelier.mjs list
node .atelier/bin/atelier.mjs list --ready
node .atelier/bin/atelier.mjs list --active
node .atelier/bin/atelier.mjs list --status todo,in_progress
node .atelier/bin/atelier.mjs list --kind bug --json
node .atelier/bin/atelier.mjs list --epic E-02
```

`--ready` ne garde que les tâches `todo` dont toutes les dépendances sont `done`.

### `show <id>`

Détail lisible (critères, preuves, documents, résumé, journal) ou JSON complet.

```bash
node .atelier/bin/atelier.mjs show T-0001
node .atelier/bin/atelier.mjs show T-0001 --json
```

### `next [--limit N]`

Liste les tâches prêtes, triées par priorité. Défaut : 5.

### `claim <id> --agent <nom>`

Vérifie les dépendances, pose un verrou et passe la tâche en `in_progress`. Refuse une
tâche déjà prise par un autre agent, bloquée, terminée ou abandonnée.

### `release <id>`

Libère le verrou ; une tâche `in_progress` repasse en `todo`.

### `review <id> --summary "..."`
Passe la tâche en `review` et enregistre le résumé du livrable. Refuse si la tâche n'est
pas `in_progress`.

### `accept <id> --index N` / `--all` / `--undo`

Coche ou décoche des critères d'acceptation (index à partir de 1, liste possible
`--index 1,3`).

### `evidence <id> --result pass|fail|info`

Enregistre une preuve d'exécution.

```bash
node .atelier/bin/atelier.mjs evidence T-0001 --result pass \
  --command "npm test -- formulaire" \
  --note "12 tests, 0 échec"
```

La preuve doit correspondre à une exécution réelle. Enregistrez aussi les échecs : le
journal garde la trace du parcours.

### `doc <id> --path <fichier> [--note "..."]`

Enregistre un document mis à jour pour la tâche. Un même chemin remplace l'entrée
précédente.

### `note <id> <texte>` et `summary <id> <texte>`

Ajoute une entrée au journal, ou remplace le résumé du livrable.

### `run <id> --agent <nom> (--file | --text | stdin)`

Archive un rapport de sous-agent dans `.atelier/runs/<ID>/`.

```bash
node .atelier/bin/atelier.mjs run T-0001 --agent implementer-T-0001 --file rapport.md
```

### `done <id> [--summary "..."] [--force --reason "..."]`

Termine la tâche **si** toutes les conditions sont réunies (voir
[`QUALITY.md`](QUALITY.md)). En cas de refus, corrigez les manques ou utilisez la
dérogation, qui exige une raison et reste visible dans `doctor`.

### `block`, `unblock`, `drop`, `reopen`

```bash
node .atelier/bin/atelier.mjs block T-0001 --reason "Décision produit attendue"
node .atelier/bin/atelier.mjs unblock T-0001
node .atelier/bin/atelier.mjs drop T-0001 --reason "Obsolète"
node .atelier/bin/atelier.mjs reopen T-0001 --reason "Test de régression en échec"
```

`block` libère le verrou. `reopen` repasse en `in_progress` et efface la raison de
blocage.

## Base de connaissances

### `kb add <titre>`

```bash
printf '# Décision\n\nNous utilisons X parce que...\n' | \
  node .atelier/bin/atelier.mjs kb add "Choix de X" \
    --kind decision --tags architecture,perf --task T-0001 --stdin
```

Options : `--kind note|decision|research`, `--tags a,b`, `--task <ID>`,
`--file <chemin>`, `--text "..."`, `--stdin`.

- `decision` crée une ADR numérotée dans `.atelier/kb/decisions/` ;
- les autres types créent une note datée dans `.atelier/kb/notes/`.

### `kb list [--kind ...] [--tag ...]`

### `kb search <terme>`

Recherche insensible à la casse et aux accents dans les notes, et affiche la ligne
pertinente du corps de la note.

### `kb index`

Réécrit `.atelier/kb/index.md`.

## Hooks (usage interne)

### `hook-session-start`

Écrit sur la sortie standard un JSON `hookSpecificOutput.additionalContext` décrivant le
projet, les tâches en cours, les tâches prêtes, les blocages et le protocole. Ne fait
rien si le répertoire courant n'est pas dans un registre.

### `hook-stop`

Réécrit `status.json` et se termine silencieusement.

## Codes de sortie

- `0` : succès ;
- `1` : erreur de validation, de dépendance, de verrou ou registre incohérent
  (`doctor`).

Les messages sont en français ; les détails techniques restent dans le message d'erreur.

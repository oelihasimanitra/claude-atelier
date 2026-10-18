# Installation

## Prérequis

- **Claude Code 2.1+** (commandes `claude plugin`).
- **Node.js 20+** dans le `PATH` — les hooks lancent `node`.
- **Git**, pour cloner le dépôt et versionner les registres.

## Depuis GitHub, sur une autre machine

```bash
git clone https://github.com/<votre-compte>/claude-atelier.git ~/Documents/claude-atelier
cd ~/Documents/claude-atelier
claude plugin marketplace add ./ --scope user
claude plugin install atelier@oely-atelier --scope user
```

Deux points vérifiés :

- la source doit être `./` ou un chemin absolu ; `.` seul est refusé par le CLI ;
- `--scope user` installe le plugin pour **tous les projets**, présents et futurs.

Redémarrez Claude Code ensuite : les hooks sont lus au démarrage de session.

## Depuis une copie locale

Si le dépôt est déjà sur la machine :

```bash
cd ~/Documents/claude-atelier
claude plugin marketplace add ./ --scope user
claude plugin install atelier@oely-atelier --scope user
```

## Vérifier l'installation

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

Dans une session Claude Code, `/plugin` affiche le même état. Les skills apparaissent
sous la forme `/atelier:plan`, `/atelier:work`, etc.

## Mise à jour

```bash
cd ~/Documents/claude-atelier
git pull
claude plugin marketplace update oely-atelier
claude plugin update atelier
```

Puis redémarrez Claude Code. La source « directory » lit l'arbre de travail : une
modification locale non commitée est visible après `marketplace update`.

Le numéro de version se trouve dans `plugins/atelier/.claude-plugin/plugin.json` et
`package.json`. Pour publier une version, incrémentez les deux et mettez à jour
`CHANGELOG.md` ; le tag Git peut être créé ensuite avec `claude plugin tag`.

## Désinstallation

```bash
claude plugin uninstall atelier@oely-atelier --scope user
claude plugin marketplace remove oely-atelier --scope user
```

Les registres `.atelier/` restent dans chaque projet : ils appartiennent au projet, pas
au plugin. Supprimez-les séparément si vous le souhaitez.

## Barre de statut

Le hook `Stop` écrit `.atelier/status.json` après chaque tour, et chaque commande du CLI
le réécrit immédiatement. Le plugin **ne peut pas** définir lui-même `statusLine` dans
les réglages principaux : seuls `agent` et `subagentStatusLine` sont accessibles depuis
un plugin. Il faut donc ajouter le segment au script existant.

### PowerShell (Windows, script utilisé par Oely)

Le fichier `~/.claude/statusline-command.ps1` contient déjà ce bloc. Il lit le fichier
JSON sans lancer de processus, en remontant les dossiers depuis le répertoire courant.

```powershell
function Find-AtelierStatus([string]$start) {
    $dir = $start
    for ($i = 0; $i -lt 6 -and $dir; $i++) {
        $candidate = Join-Path $dir '.atelier\status.json'
        if (Test-Path -LiteralPath $candidate) { return $candidate }
        $parent = Split-Path -Parent $dir
        if (-not $parent -or $parent -eq $dir) { break }
        $dir = $parent
    }
    return $null
}

$atelierPath = Find-AtelierStatus $cwd
if ($atelierPath) {
    try {
        $at = Get-Content -Raw -Encoding UTF8 -LiteralPath $atelierPath | ConvertFrom-Json
        if ($null -ne $at.total) {
            $inProgress = 0; $inReview = 0; $isBlocked = 0
            if ($null -ne $at.counts.in_progress) { $inProgress = [int]$at.counts.in_progress }
            if ($null -ne $at.counts.review)      { $inReview   = [int]$at.counts.review }
            if ($null -ne $at.counts.blocked)     { $isBlocked  = [int]$at.counts.blocked }

            $aSeg = "$([char]0x25A3) $($at.done)/$($at.total)"
            if ($isBlocked -gt 0) {
                $aColor = "$esc[31m"
                if ($isBlocked -gt 1) { $aSeg += " · $isBlocked bloquées" }
                else                  { $aSeg += " · $isBlocked bloquée" }
            } elseif ($inReview -gt 0) {
                $aColor = "$esc[33m"
                $aSeg += " · $inReview en revue"
            } else {
                $aColor = "$esc[38;2;90;200;160m"
                if ($inProgress -gt 0) {
                    $aSeg += " · $inProgress en cours"
                } elseif ($null -ne $at.ready -and @($at.ready).Count -gt 0) {
                    $aSeg += " · $(@($at.ready).Count) prêtes"
                }
            }
            $parts += "${aColor}${aSeg}${esc}[0m"
        }
    } catch { }
}
```

Le script doit être enregistré en **UTF-8 avec BOM** pour que Windows PowerShell 5.1
lise correctement les accents et les glyphes.

### Bash (macOS, Linux, Git Bash)

À insérer dans un script qui a déjà lu le JSON de Claude Code et extrait `$cwd` :

```bash
atelier_segment() {
  local dir="$1"
  for _ in 1 2 3 4 5 6; do
    local file="$dir/.atelier/status.json"
    if [ -f "$file" ]; then
      local line
      line=$(sed -n 's/.*"line": "\([^"]*\)".*/\1/p' "$file")
      if [ -n "$line" ]; then printf '▣ %s' "$line"; fi
      return 0
    fi
    [ "$dir" = "/" ] && return 0
    dir=$(dirname "$dir")
  done
  return 0
}
```

Puis, dans l'assemblage de la ligne :

```bash
seg=$(atelier_segment "$cwd")
[ -n "$seg" ] && parts+=("$seg")
```

Rendu attendu :

```text
/cafe-app | ▣ 4/9 · 2 en cours | Claude Sonnet 4.5 | ctx [████░░░░░░] 42%
```

`status.json` contient aussi `total`, `done`, `progress`, `counts`, `ready`,
`in_progress`, `review` et `blocked` si vous préférez composer votre propre segment.

## Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| Skills absents | Session démarrée avant l'installation | Redémarrer Claude Code. |
| Plugin désactivé | Désactivé dans `/plugin` | `claude plugin enable atelier`. |
| Hook en erreur | `node` absent du `PATH` du processus | Lancer `node --version`, puis Claude Code depuis le même terminal. |
| Accents cassés dans la barre | Script PowerShell sans BOM | Réenregistrer en UTF-8 avec BOM. |
| Registre signalé en erreur | Dépendance absente ou cycle | `node .atelier/bin/atelier.mjs doctor`. |
| Segment jamais affiché | Pas de `.atelier/status.json` | Lancer `init`, puis `status` dans le projet. |

Le registre lui-même n'a pas besoin du plugin : `.atelier/bin/atelier.mjs` est une copie
autonome du CLI, versionnée avec le projet.

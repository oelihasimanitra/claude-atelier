# Installe Atelier au niveau utilisateur pour tous les projets Claude Code.
$ErrorActionPreference = 'Stop'

# Windows PowerShell 5.1 n'écrit pas en UTF-8 par défaut : sans cela, les accents
# deviennent illisibles dès que la sortie est redirigée.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$repo = $PSScriptRoot

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "Atelier : Node.js 20+ est requis, mais 'node' est introuvable." -ForegroundColor Red
    exit 1
}

$major = [int](& node -p "process.versions.node.split('.')[0]")
if ($major -lt 20) {
    Write-Host "Atelier : Node.js 20+ est requis (version détectée : $(& node --version))." -ForegroundColor Red
    exit 1
}

$claude = Get-Command claude -ErrorAction SilentlyContinue
if (-not $claude) {
    Write-Host "Atelier : la commande 'claude' est introuvable. Installez Claude Code puis relancez." -ForegroundColor Red
    exit 1
}

Push-Location $repo
try {
    Write-Host "Dépôt       : $repo"
    Write-Host "Marketplace : oely-atelier"
    Write-Host ""

    claude plugin marketplace add ./ --scope user
    claude plugin install atelier@oely-atelier --scope user -y

    Write-Host ""
    claude plugin list
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Redémarrez Claude Code pour charger les hooks et les skills."

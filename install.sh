#!/usr/bin/env bash
# Installe Atelier au niveau utilisateur pour tous les projets Claude Code.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "Atelier : Node.js 20+ est requis, mais 'node' est introuvable." >&2
  exit 1
fi

major="$(node -p "process.versions.node.split('.')[0]")"
if [ "$major" -lt 20 ]; then
  echo "Atelier : Node.js 20+ est requis (version détectée : $(node --version))." >&2
  exit 1
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "Atelier : la commande 'claude' est introuvable. Installez Claude Code puis relancez." >&2
  exit 1
fi

cd "$repo"
echo "Dépôt       : $repo"
echo "Marketplace : oely-atelier"
echo

claude plugin marketplace add ./ --scope user
claude plugin install atelier@oely-atelier --scope user -y

echo
claude plugin list
echo
echo "Redémarrez Claude Code pour charger les hooks et les skills."

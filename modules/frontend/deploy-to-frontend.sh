#!/usr/bin/env bash
# deploy-to-frontend.sh
#
# Builds the React frontend directly into public/ (Play's static-assets dir).
# Vite is configured with outDir: 'public' so no copy step is needed.
#
# Usage:
#   cd modules/frontend
#   ./deploy-to-frontend.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Building React frontend..."
cd "${SCRIPT_DIR}"
npm run build

echo ""
echo "npm build success."
echo "React assets in public/:"
ls -1 "${SCRIPT_DIR}/public/index.html"
echo "${SCRIPT_DIR}/public/assets/:"
ls -1 "${SCRIPT_DIR}/public/assets/"
echo ""

#!/usr/bin/env bash
# Builds the one static site that is deployed everywhere (GitHub Pages at floor.aexiz.in, and Swarm):
#   /          apps/web: landing (built from landing-source into public/landing), Live market, Kelp simulation, ...
#   /verify/   apps/verify-lab (verify page + dataset page)
# All links between them are relative, so the same bytes work on any host or path.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/manifest.sh
rm -rf site && mkdir -p site
(cd apps/web && npx vite build --config vite.landing.config.ts >/dev/null && npx vite build --outDir ../../site --emptyOutDir false >/dev/null)
(cd apps/verify-lab && npx vite build --outDir ../../site/verify --emptyOutDir true >/dev/null)
touch site/.nojekyll
host=$(m .site | sed -E 's#^https?://##; s#/.*$##'); echo "$host" > site/CNAME
echo "site/ built: $(find site -type f | wc -l | tr -d ' ') files, $(du -sh site | cut -f1); CNAME $host"

#!/bin/bash
set -e

cd "$(dirname "$0")/.."

# Build
npm run build

# Deploy to gh-pages
cd dist
echo "lastaistanding.com" > CNAME
git init
git checkout -b gh-pages
git add -A
git commit -m "deploy: $(date -u +%Y-%m-%d_%H:%M:%S)"
git push -f git@github.com:clawd800/last-ai-standing.git gh-pages

echo "✅ Deployed to GitHub Pages"

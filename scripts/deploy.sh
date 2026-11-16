#!/bin/sh
# Builds the app and publishes dist/ to the gh-pages branch (GitHub Pages).
set -e
cd "$(dirname "$0")/.."
npm run build
remote=$(git remote get-url origin)
name=$(git config user.name)
email=$(git config user.email)
cd dist
touch .nojekyll
rm -rf .git
git init -q -b gh-pages
git -c user.name="$name" -c user.email="$email" add -A
git -c user.name="$name" -c user.email="$email" commit -q -m "Deploy"
git push -q -f "$remote" gh-pages
rm -rf .git
echo "Published."

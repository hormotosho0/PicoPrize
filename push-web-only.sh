#!/bin/bash

# Script to push only web app to GitHub (contracts excluded)

echo "🚀 Preparing to push web app only..."
echo ""

# Check if contracts are tracked
CONTRACTS_TRACKED=$(git ls-files apps/contracts/ 2>/dev/null | wc -l)

if [ "$CONTRACTS_TRACKED" -gt 0 ]; then
    echo "⚠️  Warning: Some contract files are already tracked."
    echo "   They will be removed from this commit but remain in git history."
    echo ""
    read -p "Continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Stage root files
echo "📦 Staging root configuration files..."
git add .gitignore
git add package.json
git add pnpm-workspace.yaml
git add pnpm-lock.yaml
git add tsconfig.json
git add turbo.json
git add README.md

# Stage web app
echo "📦 Staging web app files..."
git add apps/web/

# Stage documentation
echo "📦 Staging documentation..."
git add *.md

# Remove contracts from staging if they were added
echo "🗑️  Ensuring contracts are excluded..."
git reset HEAD apps/contracts/ 2>/dev/null || true

# Show what will be committed
echo ""
echo "✅ Files staged for commit:"
echo ""
git status --short | grep -v "apps/contracts" | head -20
echo ""

# Check if remote exists
if git remote get-url origin &>/dev/null; then
    REMOTE_URL=$(git remote get-url origin)
    echo "📍 Remote repository: $REMOTE_URL"
    echo ""
    echo "Ready to commit and push!"
    echo ""
    echo "Next steps:"
    echo "1. Review the staged files above"
    echo "2. Commit: git commit -m 'feat: initial web app deployment'"
    echo "3. Push: git push -u origin master"
else
    echo "⚠️  No remote repository configured."
    echo ""
    echo "To add a remote:"
    echo "  git remote add origin https://github.com/YOUR_USERNAME/picoprize.git"
    echo ""
    echo "Then commit and push:"
    echo "  git commit -m 'feat: initial web app deployment'"
    echo "  git push -u origin master"
fi



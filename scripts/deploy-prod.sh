#!/usr/bin/env bash
# Deploy tools-PDFCraftTool do Vercel production + alias.
# Uwaga: per handoff sesji 1 — vercel CLI nie ma rename, primary host alias trzeba ustawić ręcznie.
set -euo pipefail

PROJECT_DIR="/Users/dariuszciesielski/projekty/Access Manager/tools-PDFCraftTool"
PROD_HOST="access-manager-tools-pdfcraft.vercel.app"

cd "$PROJECT_DIR"

echo "===> Clean build"
rm -rf out .next

echo "===> npm run build"
npm run build 2>&1 | tail -20

if [ ! -d "out" ]; then
    echo "❌ FAIL: out/ nie istnieje po build"
    exit 1
fi

echo "===> Vercel deploy --prod"
DEPLOY_URL=$(vercel --prod --yes 2>&1 | tail -1 | grep -oE 'https://[^ ]+\.vercel\.app' | head -1)

if [ -z "$DEPLOY_URL" ]; then
    echo "❌ FAIL: nie wykryto deploy URL"
    exit 1
fi

echo "Deploy URL: $DEPLOY_URL"

echo "===> Set alias na primary host"
vercel alias set "$DEPLOY_URL" "$PROD_HOST"

echo "===> Smoke test prod URL"
sleep 5
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://$PROD_HOST")
TITLE=$(curl -s "https://$PROD_HOST" | grep -oE '<title>[^<]+</title>' | head -1)

echo "HTTP code: $HTTP_CODE"
echo "Title: $TITLE"

if [ "$HTTP_CODE" != "200" ]; then
    echo "❌ Smoke test failed: HTTP $HTTP_CODE"
    exit 1
fi

echo ""
echo "✅ DEPLOY DONE"
echo "URL: https://$PROD_HOST"
echo "Title: $TITLE"

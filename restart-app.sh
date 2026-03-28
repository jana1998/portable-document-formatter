#!/bin/bash

echo "🔄 Restarting PDF App with Fresh Build..."
echo ""

echo "📦 Step 1: Stopping all Node/Electron processes..."
killall node 2>/dev/null || true
killall Electron 2>/dev/null || true
sleep 1

echo "🔨 Step 2: Rebuilding main process..."
npm run build:main

echo ""
echo "✅ Build complete! Now run:"
echo ""
echo "   npm run dev"
echo ""
echo "💡 Wait for 'Ready in Xs' before using the app!"
echo ""

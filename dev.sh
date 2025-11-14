#!/bin/bash

# Stories App - Development Script
# Starts backend and frontend in development mode

echo "🚀 Starting Stories in development mode..."

# Start backend in background
echo "📦 Starting backend..."
cd backend && python3 app.py &
BACKEND_PID=$!

# Wait for backend to initialize
sleep 2

# Start Electron in dev mode
echo "⚡ Starting Electron..."
cd ..
npx electron electron/main.js --dev

# Cleanup: Kill backend when Electron closes
kill $BACKEND_PID 2>/dev/null
echo "✅ Development session ended"


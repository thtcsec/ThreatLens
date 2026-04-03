#!/bin/bash

# Kill background processes on exit
trap "trap - SIGTERM && kill -- -$$" SIGINT SIGTERM EXIT

echo "🚀 Starting ThreatLens for macOS/Linux..."

# 1. Start Backend
echo "📦 Initializing Backend..."
cd backend
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi
source .venv/bin/activate
echo "Installing dependencies..."
pip install -r requirements.txt
echo "Starting Uvicorn..."
python3 -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload &
BACKEND_PID=$!

# 2. Start Frontend
echo "🎨 Initializing Frontend..."
cd ../frontend
echo "Installing dependencies..."
npm install
echo "Starting Next.js..."
npm run dev &
FRONTEND_PID=$!

echo "✅ ThreatLens is starting up!"
echo "Backend is running on http://localhost:8001"
echo "Frontend is running on http://localhost:3000"
echo "Press Ctrl+C to stop both services."

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID

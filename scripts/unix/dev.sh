#!/bin/bash
# VoiceScribe Development Mode Launcher
# Starts backend and Electron frontend in development mode

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() {
    echo -e "${GREEN}▶ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/../../backend"
FRONTEND_DIR="$SCRIPT_DIR/../../frontend"

echo "========================================"
echo "  VoiceScribe Development Mode"
echo "========================================"
echo

# Parse arguments
MOCK_FLAG=""
for arg in "$@"; do
    if [ "$arg" == "--mock" ]; then
        MOCK_FLAG="--mock"
    fi
done

# ============================================
# Step 1: Check prerequisites
# ============================================
print_step "Step 1/4: Checking prerequisites..."

# Check Python
if ! command -v python3 &> /dev/null; then
    print_error "Python3 not found. Please run install.sh first."
    exit 1
fi

# Check backend venv
if [ ! -d "$BACKEND_DIR/venv" ]; then
    print_error "Backend virtual environment not found."
    echo "Please run install.sh first."
    exit 1
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js not found. Please install Node.js."
    exit 1
fi

# Check frontend dependencies
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    print_error "Frontend dependencies not installed."
    echo "Please run: cd frontend && npm install"
    exit 1
fi

print_success "Prerequisites checked"
echo

# ============================================
# Step 2: Start backend in background
# ============================================
print_step "Step 2/4: Starting backend service..."

cd "$BACKEND_DIR"
source venv/bin/activate

# Start backend in background
python server.py $MOCK_FLAG > /tmp/voicescribe_backend.log 2>&1 &
BACKEND_PID=$!

print_success "Backend starting (PID: $BACKEND_PID)..."
echo

# ============================================
# Step 3: Wait for backend health check
# ============================================
print_step "Step 3/4: Waiting for backend to be ready..."

BACKEND_URL="http://127.0.0.1:8765"
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s --connect-timeout 1 "$BACKEND_URL/health" > /dev/null 2>&1; then
        print_success "Backend is ready at $BACKEND_URL"
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "  Waiting... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 1
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    print_error "Backend failed to start after $MAX_RETRIES seconds"
    echo "Check logs: tail -f /tmp/voicescribe_backend.log"
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

echo

# ============================================
# Step 4: Start Electron frontend
# ============================================
print_step "Step 4/4: Starting Electron frontend..."
echo

echo "========================================"
echo "  Development Mode Active"
echo "========================================"
echo
echo "  Backend:  $BACKEND_URL"
echo "  Frontend: http://localhost:3000"
if [ -n "$MOCK_FLAG" ]; then
    echo "  Mode:     MOCK (no real ASR engines)"
else
    echo "  Mode:     Full (with ASR engines)"
fi
echo
echo "  Press Ctrl+C to stop"
echo "========================================"
echo

cd "$FRONTEND_DIR"

# Cleanup function
cleanup() {
    echo
    echo "Stopping services..."
    kill $BACKEND_PID 2>/dev/null || true
    print_success "Cleanup complete"
    exit 0
}

trap cleanup INT TERM

# Start Electron frontend
npm run dev:electron


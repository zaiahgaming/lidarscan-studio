#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "================================================"
echo "          Starting LidarScan Studio             "
echo "================================================"

# 1. Virtual Environment Check
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment in $DIR/venv..."
    python3 -m venv venv
    venv/bin/pip install --upgrade pip
fi

# 2. Check dependencies
if ! venv/bin/python3 -c "import fastapi, uvicorn, open3d, zeroconf, trimesh" 2>/dev/null; then
    echo "Installing required Python dependencies..."
    venv/bin/pip install -r requirements.txt
fi

# 3. Ensure Brush binary exists (for local fallback)
if [ ! -f "bin/brush" ]; then
    mkdir -p bin
    echo "Downloading Brush Gaussian Splat engine..."
    if command -v gh >/dev/null 2>&1; then
        gh release download v0.3.0 --repo ArthurBrussee/brush -p "brush-app-x86_64-unknown-linux-gnu.tar.xz" --dir bin
    else
        curl -L -o bin/brush-app-x86_64-unknown-linux-gnu.tar.xz "https://github.com/ArthurBrussee/brush/releases/download/v0.3.0/brush-app-x86_64-unknown-linux-gnu.tar.xz"
    fi
    tar -xf bin/brush-app-x86_64-unknown-linux-gnu.tar.xz -C bin/
    ln -sf "$DIR/bin/brush-app-x86_64-unknown-linux-gnu/brush_app" "$DIR/bin/brush"
    chmod +x bin/brush
fi

# 4. Check Frontend Build
if [ ! -d "dist" ]; then
    echo "Building Web UI..."
    cd frontend
    npm install
    npm run build
    cd "$DIR"
fi

# 5. Detect LAN IP
LAN_IP=$(venv/bin/python3 -c "import sys; sys.path.insert(0, '$DIR'); from server.net_utils import get_lan_ip; print(get_lan_ip())" 2>/dev/null || echo "127.0.0.1")

echo ""
echo "🚀 LidarScan Studio is ready!"
echo "   Local URL:    http://localhost:8765"
echo "   iPhone Wi-Fi: http://$LAN_IP:8765"
echo "   Bonjour mDNS: _lidarscan._tcp"
echo ""

# 6. Launch browser in background after short delay
(
    sleep 1.5
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "http://localhost:8765" >/dev/null 2>&1 || true
    elif command -v open >/dev/null 2>&1; then
        open "http://localhost:8765" >/dev/null 2>&1 || true
    fi
) &

# 7. Start FastAPI server
exec venv/bin/uvicorn server.main:app --host 0.0.0.0 --port 8765

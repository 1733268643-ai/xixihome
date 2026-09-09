#!/bin/bash
# Claude/Codex 从窗口向 XixiHome 对话发图。
# 用法: xixihome-send-image.sh /绝对路径/图.jpg "配文（可选）" [window]
set -u
IMG="${1:?用法: xixihome-send-image.sh <绝对路径> [配文] [win]}"
CAPTION="${2:-}"
WIN="${3:-$(tmux display-message -p '#S' 2>/dev/null || echo xixihome)}"

ROOT_DIR="${XIXIHOME_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
TOKEN=$(grep -m1 '^BRIDGE_MACHINE_TOKEN=' "$ROOT_DIR/backend/.env" 2>/dev/null | cut -d= -f2-)
[ -n "$TOKEN" ] || { echo "缺 BRIDGE_MACHINE_TOKEN"; exit 1; }

python3 - "$IMG" "$CAPTION" "$WIN" "$TOKEN" <<'PY'
import json, sys, urllib.request
img, caption, win, token = sys.argv[1:5]
req = urllib.request.Request(
    __import__('os').environ.get("XIXIHOME_API_URL", "http://127.0.0.1:3001") + "/api/bridge/send-image",
    data=json.dumps({"path": img, "caption": caption, "win": win}).encode(),
    headers={"content-type": "application/json", "authorization": "Bearer " + token})
try:
    with urllib.request.urlopen(req, timeout=10) as r:
        print(r.read().decode())
except urllib.error.HTTPError as e:
    print(e.read().decode()); sys.exit(1)
PY

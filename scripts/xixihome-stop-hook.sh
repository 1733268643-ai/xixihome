#!/usr/bin/env bash
# Claude Code Stop hook：tmux 窗口每完成一段回复，将它抄送到 XixiHome 桥聊天。
# 只在 tmux 会话 ${BRIDGE_TMUX_SESSION:-xixihome} 中生效。
set -u
SESSION_WANT="${BRIDGE_TMUX_SESSION:-xixihome}"
[ -n "${TMUX:-}" ] || exit 0
CUR=$(tmux display-message -p '#S' 2>/dev/null) || exit 0
[ "$CUR" = "$SESSION_WANT" ] || exit 0

ROOT_DIR="${XIXIHOME_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
TOKEN=$(grep -m1 '^BRIDGE_MACHINE_TOKEN=' "$ROOT_DIR/backend/.env" 2>/dev/null | cut -d= -f2-)
[ -n "$TOKEN" ] || exit 0

HOOK_JSON=$(cat 2>/dev/null || echo "{}")
export HOOK_JSON XIXIHOME_API_URL
python3 - "$TOKEN" <<'PY'
import json, os, sys, urllib.request
try:
    data = json.loads(os.environ.get("HOOK_JSON") or "{}")
except json.JSONDecodeError:
    data = {}
path = data.get("transcript_path")
if not path:
    sys.exit(0)
text = ""
try:
    with open(path, encoding="utf-8") as f:
        lines = f.readlines()
    # 从后往前找最后一条 assistant 消息（同一轮可能拆多条，收集到上一条 user 为止）
    parts = []
    for line in reversed(lines):
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        t = rec.get("type")
        if t == "user":
            break
        if t != "assistant":
            continue
        content = (rec.get("message") or {}).get("content") or []
        chunk = "".join(c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text")
        if chunk.strip():
            parts.append(chunk.strip())
    text = "\n\n".join(reversed(parts)).strip()
except Exception:
    sys.exit(0)
if not text:
    sys.exit(0)
req = urllib.request.Request(
    os.environ.get("XIXIHOME_API_URL", "http://127.0.0.1:3001") + "/api/bridge/reply",
    data=json.dumps({"text": text, "source": "tmux"}).encode(),
    headers={"content-type": "application/json", "authorization": "Bearer " + sys.argv[1]},
)
try:
    urllib.request.urlopen(req, timeout=8)
except Exception:
    pass
PY
exit 0

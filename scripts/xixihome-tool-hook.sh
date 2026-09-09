#!/usr/bin/env bash
# Claude Code PostToolUse hook：将 tmux 窗口的工具调用抄送到 XixiHome 桥。
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
export HOOK_JSON TOKEN CUR XIXIHOME_API_URL
python3 - <<'PY'
import json, os, urllib.request

try:
    d = json.loads(os.environ.get("HOOK_JSON") or "{}")
except json.JSONDecodeError:
    raise SystemExit

name = d.get("tool_name") or ""
if not name:
    raise SystemExit
# 内部/噪音工具不上聊天流
if name in ("TodoWrite",) or name.startswith("mcp__ombre"):
    raise SystemExit

ti = d.get("tool_input") or {}
detail = (ti.get("command") or ti.get("file_path") or ti.get("pattern")
          or ti.get("url") or ti.get("query") or ti.get("description") or "")
detail = " ".join(str(detail).split())[:120]

resp = d.get("tool_response")
out = ""
if isinstance(resp, str):
    out = resp
elif isinstance(resp, dict):
    out = resp.get("stdout") or resp.get("output") or resp.get("stderr") or ""
out = str(out)[:1200]
err = isinstance(resp, dict) and bool(resp.get("stderr")) and not (resp.get("stdout") or "").strip()

body = json.dumps({
    "win": os.environ["CUR"],
    "name": name,
    "detail": detail,
    "status": "error" if err else "ok",
    "output": out,
}).encode()

req = urllib.request.Request(
    os.environ.get("XIXIHOME_API_URL", "http://127.0.0.1:3001") + "/api/bridge/tool", data=body,
    headers={"content-type": "application/json",
             "authorization": "Bearer " + os.environ["TOKEN"]})
try:
    urllib.request.urlopen(req, timeout=6)
except Exception:
    pass
PY
exit 0

#!/usr/bin/env bash
# Claude Code PermissionRequest hook：将待批准请求发送到 PaiHome，等待手机端决定。
# 手机 100s 内没决定 / 桥不可达 → 什么都不输出，回落到终端自己的批准弹窗（非阻塞设计）。
# 只在 BRIDGE_TMUX_SESSION 指定的 tmux 会话中生效。
set -u
[ -n "${TMUX:-}" ] || exit 0
CUR=$(tmux display-message -p '#S' 2>/dev/null) || exit 0
SESSION_WANT="${BRIDGE_TMUX_SESSION:-paihome}"
[ "$CUR" = "$SESSION_WANT" ] || exit 0

ROOT_DIR="${PAIHOME_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
TOKEN=$(grep -m1 '^BRIDGE_MACHINE_TOKEN=' "$ROOT_DIR/backend/.env" 2>/dev/null | cut -d= -f2-)
[ -n "$TOKEN" ] || exit 0

HOOK_JSON=$(cat 2>/dev/null || echo "{}")
export HOOK_JSON TOKEN CUR PAIHOME_API_URL
python3 - <<'PY'
import json, os, urllib.request

try:
    d = json.loads(os.environ.get("HOOK_JSON") or "{}")
except json.JSONDecodeError:
    raise SystemExit

body = json.dumps({
    "win": os.environ["CUR"],
    "session_id": d.get("session_id"),
    "permission_mode": d.get("permission_mode"),
    "tool_name": d.get("tool_name"),
    "tool_input": d.get("tool_input"),
    "permission_suggestions": d.get("permission_suggestions"),
    "wait_ms": 100000,
}).encode()

req = urllib.request.Request(
    os.environ.get("PAIHOME_API_URL", "http://127.0.0.1:3001") + "/api/bridge/permission", data=body,
    headers={"content-type": "application/json",
             "authorization": "Bearer " + os.environ["TOKEN"]})
try:
    with urllib.request.urlopen(req, timeout=112) as r:
        res = json.loads(r.read().decode() or "{}")
except Exception:
    raise SystemExit          # 桥不可达：无输出，回落终端弹窗

decision = res.get("decision")
if decision == "allow":
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PermissionRequest", "decision": "allow"}}))
elif decision == "deny":
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PermissionRequest", "decision": "deny",
        "permissionDecisionReason": "小雨在潮汐星港上拒绝了这次操作"}}, ensure_ascii=False))
# timeout / 其它：无输出 → 终端弹窗接管
PY
exit 0

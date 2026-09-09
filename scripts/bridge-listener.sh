#!/bin/bash
# 连接桥监听器：常驻SSE连接，接收心潮事件写入bridge-inbox.jsonl
# 断了自动重连。用法：后台跑或systemd管。

BRIDGE_ENV_FILE="${BRIDGE_ENV_FILE:-$(cd "$(dirname "$0")/.." && pwd)/backend/.env}"
BRIDGE_TOKEN="${BRIDGE_MACHINE_TOKEN:-$(grep -m1 '^BRIDGE_MACHINE_TOKEN=' "$BRIDGE_ENV_FILE" 2>/dev/null | cut -d= -f2-)}"
BRIDGE_URL="${BRIDGE_URL:-http://127.0.0.1:18110/bridge/v1}"
INBOX="${BRIDGE_INBOX:-/tmp/xixihome-bridge-inbox.jsonl}"

if [ -z "$BRIDGE_TOKEN" ]; then
  echo "ERROR: 找不到BRIDGE_MACHINE_TOKEN"
  exit 1
fi

fetch_and_ack() {
  local delivery_id="$1"
  local detail
  detail=$(curl -s --max-time 10 "${BRIDGE_URL}/deliveries/${delivery_id}" \
    -H "Authorization: Bearer ${BRIDGE_TOKEN}")

  if [ -z "$detail" ] || echo "$detail" | grep -q '"error"'; then
    return 1
  fi

  echo "$detail" >> "$INBOX"

  curl -s --max-time 10 -X POST "${BRIDGE_URL}/deliveries/${delivery_id}/ack" \
    -H "Authorization: Bearer ${BRIDGE_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"status":"delivered"}' > /dev/null 2>&1
}

while true; do
  echo "$(date '+%Y-%m-%d %H:%M:%S') 连接桥监听启动..."

  curl -s -N "${BRIDGE_URL}/events" \
    -H "Authorization: Bearer ${BRIDGE_TOKEN}" \
    -H "Accept: text/event-stream" 2>/dev/null | \
  while IFS= read -r line; do
    if echo "$line" | grep -q '^data:.*deliveryId'; then
      delivery_id=$(echo "$line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read().strip()[6:]).get('deliveryId',''))" 2>/dev/null)
      if [ -n "$delivery_id" ]; then
        fetch_and_ack "$delivery_id"
      fi
    fi
  done

  echo "$(date '+%Y-%m-%d %H:%M:%S') 连接桥断了，5秒后重连..."
  sleep 5
done

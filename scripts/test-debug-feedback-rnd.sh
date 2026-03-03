#!/bin/bash

# =============================================================================
# TapTap MCP - Debug Feedback RND 一键测试脚本
# =============================================================================
#
# 本脚本用于本地快速验证 `get_debug_feedbacks` 端到端流程，包含：
# 1) 启动本地 MCP Server（RND + HTTP）
# 2) MCP initialize（带租户上下文）
# 3) check_environment
# 4) OAuth 授权（start + 等待人工扫码 + complete）
# 5) select_app
# 6) get_debug_feedbacks（默认参数）
# 7) 再次调用 get_debug_feedbacks（验证“无新未处理反馈”）
#
# -----------------------------------------------------------------------------
# 使用方式（推荐）
# -----------------------------------------------------------------------------
# 1. 先配置环境变量（必须）  oauth_clients.id 、oauth_clients.sdk_secret：
#   
#    export TAPTAP_MCP_CLIENT_ID="m2dnabebip3fpardnm" 
#    export TAPTAP_MCP_CLIENT_SECRET="QUmbMoTQm2qJETi53vWnvaXuBiRL3VRkgcUWnBtb"
#
# 2. 运行脚本：
#    bash scripts/test-debug-feedback-rnd.sh \
#      --developer-id 89025 \
#      --app-id 204213 \
#      --project-path .
#
# 3. 按提示用 TapTap App 扫码授权后，回车继续。
#
# -----------------------------------------------------------------------------
# 可选参数
# -----------------------------------------------------------------------------
# --port <n>          MCP 服务端口（默认 3002）
# --developer-id <n>  目标 developer_id（可交互输入）
# --app-id <n>        目标 app_id（可交互输入）
# --user-id <str>     租户 user_id（默认 local-test-user）
# --project-id <str>  租户 project_id（默认 local-test-project）
# --project-path <p>  租户 project_path（默认 "."，推荐相对路径）
# --keep-server       脚本结束后不自动停止 MCP 服务（默认自动停止）
# --help              显示帮助
#
# -----------------------------------------------------------------------------
# 注意事项
# -----------------------------------------------------------------------------
# - 本脚本会在 /tmp 生成临时文件：请求响应、headers、日志等
# - 默认会自动停止脚本启动的 MCP 服务
# - 如果你传绝对 project_path，脚本会给出警告（仍可继续）
# =============================================================================

set -euo pipefail

# ---------------------------
# 颜色与输出工具函数
# ---------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() {
  echo -e "${BLUE}[INFO]${NC} $*"
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $*"
}

error() {
  echo -e "${RED}[ERROR]${NC} $*"
}

ok() {
  echo -e "${GREEN}[OK]${NC} $*"
}

# ---------------------------
# 默认参数
# ---------------------------
PORT=3002
DEVELOPER_ID=""
APP_ID=""
TENANT_USER_ID="local-test-user"
TENANT_PROJECT_ID="local-test-project"
TENANT_PROJECT_PATH="."
KEEP_SERVER=0

# ---------------------------
# 路径准备
# ---------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SERVER_LOG="/tmp/taptap-mcp-rnd-${PORT}.log"
SESSION_FILE="/tmp/taptap-mcp-rnd-session-${PORT}.txt"
REQ_COUNTER=1000

# ---------------------------
# 参数解析
# ---------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      PORT="$2"
      shift 2
      ;;
    --developer-id)
      DEVELOPER_ID="$2"
      shift 2
      ;;
    --app-id)
      APP_ID="$2"
      shift 2
      ;;
    --user-id)
      TENANT_USER_ID="$2"
      shift 2
      ;;
    --project-id)
      TENANT_PROJECT_ID="$2"
      shift 2
      ;;
    --project-path)
      TENANT_PROJECT_PATH="$2"
      shift 2
      ;;
    --keep-server)
      KEEP_SERVER=1
      shift
      ;;
    --help|-h)
      awk '/^#/{print}' "$0"
      exit 0
      ;;
    *)
      error "未知参数: $1"
      error "使用 --help 查看说明。"
      exit 1
      ;;
  esac
done

# ---------------------------
# 依赖检查
# ---------------------------
for cmd in curl node awk mktemp; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    error "缺少依赖命令: $cmd"
    exit 1
  fi
done

# ---------------------------
# 环境变量检查（RND 必需）
# ---------------------------
if [[ -z "${TAPTAP_MCP_CLIENT_ID:-}" ]]; then
  error "未设置 TAPTAP_MCP_CLIENT_ID"
  exit 1
fi

if [[ -z "${TAPTAP_MCP_CLIENT_SECRET:-}" ]]; then
  error "未设置 TAPTAP_MCP_CLIENT_SECRET"
  exit 1
fi

# ---------------------------
# 输入参数交互补全
# ---------------------------
if [[ -z "$DEVELOPER_ID" ]]; then
  read -r -p "请输入 developer_id: " DEVELOPER_ID
fi

if [[ -z "$APP_ID" ]]; then
  read -r -p "请输入 app_id: " APP_ID
fi

if [[ "$TENANT_PROJECT_PATH" = /* ]]; then
  warn "project_path 当前是绝对路径: $TENANT_PROJECT_PATH"
  warn "建议使用相对路径（例如 '.'）以避免路径歧义。"
fi

# ---------------------------
# 清理函数（退出时执行）
# ---------------------------
TEST_SERVER_PID=""
cleanup() {
  local pid="${TEST_SERVER_PID:-}"
  if [[ "$KEEP_SERVER" -eq 1 ]]; then
    warn "已设置 --keep-server，保留测试服务运行。"
    if [[ -n "${pid}" ]]; then
      warn "保留中的服务 PID: ${pid}, 端口: $PORT"
    fi
    return
  fi

  if [[ -n "${pid}" ]] && kill -0 "${pid}" >/dev/null 2>&1; then
    info "停止测试服务（PID: ${pid}）..."
    kill "${pid}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# ---------------------------
# 工具函数：解析 MCP 返回 text 内容
# ---------------------------
extract_mcp_text() {
  local json_file="$1"
  node -e "
const fs = require('fs');
const p = process.argv[1];
const data = JSON.parse(fs.readFileSync(p, 'utf8'));
if (data.error) {
  console.error('[MCP_ERROR]', data.error.message || JSON.stringify(data.error));
  process.exit(2);
}
const content = (data.result && data.result.content) || [];
const text = content.find((c) => c.type === 'text');
process.stdout.write(text ? text.text : '');
" "$json_file"
}

# ---------------------------
# 工具函数：提取授权 URL
# ---------------------------
extract_auth_url() {
  local json_file="$1"
  node -e "
const fs = require('fs');
const p = process.argv[1];
const data = JSON.parse(fs.readFileSync(p, 'utf8'));
const candidates = [];
const result = data.result || {};
const content = Array.isArray(result.content) ? result.content : [];
const structuredContent = result.structuredContent || {};

for (const item of content) {
  if (item && item.type === 'text' && typeof item.text === 'string') {
    candidates.push(item.text);
  }
}

for (const key of ['verify_uri_complete', 'verification_uri_complete', 'verify_uri', 'verification_uri']) {
  const value = structuredContent[key];
  if (typeof value === 'string') {
    candidates.push(value);
  }
}

for (const text of candidates) {
  const mdLink = text.match(/\\((https?:\\/\\/[^)\\s]+)\\)/);
  if (mdLink) {
    process.stdout.write(mdLink[1]);
    process.exit(0);
  }

  const raw = text.match(/https?:\\/\\/[^\\s\"'<>]+/);
  if (raw) {
    process.stdout.write(raw[0]);
    process.exit(0);
  }
}
" "$json_file"
}

# ---------------------------
# 工具函数：统一发起 tools/call 请求
# ---------------------------
call_tool() {
  local tool_name="$1"
  local args_json="$2"
  local output_file="$3"
  local session_id
  session_id="$(cat "$SESSION_FILE")"
  REQ_COUNTER=$((REQ_COUNTER + 1))

  local payload
  payload="$(cat <<EOF
{"jsonrpc":"2.0","id":$REQ_COUNTER,"method":"tools/call","params":{"name":"$tool_name","arguments":$args_json}}
EOF
)"

  curl -sS -X POST "http://localhost:${PORT}/" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Mcp-Session-Id: ${session_id}" \
    -d "$payload" >"$output_file"
}

# ---------------------------
# Step 0: 构建产物检查
# ---------------------------
info "Step 0/8 - 检查 dist/server.js 是否存在..."
if [[ ! -f "${PROJECT_ROOT}/dist/server.js" ]]; then
  error "未找到 dist/server.js，请先执行 npm run build。"
  exit 1
fi
ok "构建产物存在。"

# ---------------------------
# Step 1: 启动本地 RND 服务
# ---------------------------
info "Step 1/8 - 启动本地 MCP 服务（RND, HTTP, 端口 ${PORT}）..."
TAPTAP_MCP_ENV=rnd \
TAPTAP_MCP_TRANSPORT=http \
TAPTAP_MCP_PORT="${PORT}" \
TAPTAP_MCP_WORKSPACE_ROOT="${PROJECT_ROOT}" \
TAPTAP_MCP_CLIENT_ID="${TAPTAP_MCP_CLIENT_ID}" \
TAPTAP_MCP_CLIENT_SECRET="${TAPTAP_MCP_CLIENT_SECRET}" \
node "${PROJECT_ROOT}/dist/server.js" >"${SERVER_LOG}" 2>&1 &
TEST_SERVER_PID=$!

# 等待服务健康检查就绪（最多 15 秒）
READY=0
for _ in $(seq 1 15); do
  if curl -sS "http://localhost:${PORT}/health" >/tmp/taptap-mcp-health.json 2>/dev/null; then
    READY=1
    break
  fi
  sleep 1
done

if [[ "$READY" -ne 1 ]]; then
  error "服务启动超时，请检查日志：${SERVER_LOG}"
  exit 1
fi
ok "服务启动成功，日志：${SERVER_LOG}"

# ---------------------------
# Step 2: 初始化 MCP 会话（带租户头）
# ---------------------------
info "Step 2/8 - 初始化 MCP 会话（注入 tenant 上下文）..."
INIT_HEADERS="$(mktemp)"
INIT_PAYLOAD='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"debug-feedback-test","version":"1.0.0"}}}'

curl -sS -D "${INIT_HEADERS}" -X POST "http://localhost:${PORT}/" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-TapTap-User-Id: ${TENANT_USER_ID}" \
  -H "X-TapTap-Project-Id: ${TENANT_PROJECT_ID}" \
  -H "X-TapTap-Project-Path: ${TENANT_PROJECT_PATH}" \
  -d "${INIT_PAYLOAD}" >/tmp/taptap-mcp-init.json

SESSION_ID="$(awk 'tolower($1)=="mcp-session-id:"{print $2}' "${INIT_HEADERS}" | tr -d '\r\n')"
if [[ -z "${SESSION_ID}" ]]; then
  error "初始化失败，未获取到 Mcp-Session-Id。"
  error "请检查响应：/tmp/taptap-mcp-init.json"
  exit 1
fi
echo "${SESSION_ID}" >"${SESSION_FILE}"
ok "会话初始化成功，Session ID: ${SESSION_ID}"

# ---------------------------
# Step 3: 检查环境状态
# ---------------------------
info "Step 3/8 - 调用 check_environment..."
CHECK_ENV_JSON="$(mktemp)"
call_tool "check_environment" "{}" "${CHECK_ENV_JSON}"
CHECK_ENV_TEXT="$(extract_mcp_text "${CHECK_ENV_JSON}")"
echo "${CHECK_ENV_TEXT}" >/tmp/taptap-mcp-check-environment.txt
ok "check_environment 完成。输出已保存：/tmp/taptap-mcp-check-environment.txt"

# ---------------------------
# Step 4: 发起 OAuth 授权
# ---------------------------
info "Step 4/8 - 调用 start_oauth_authorization..."
START_OAUTH_JSON="$(mktemp)"
call_tool "start_oauth_authorization" "{}" "${START_OAUTH_JSON}"
START_OAUTH_TEXT="$(extract_mcp_text "${START_OAUTH_JSON}")"
AUTH_URL="$(extract_auth_url "${START_OAUTH_JSON}")"
OAUTH_ALREADY_AUTHED=0

if [[ -z "${AUTH_URL}" ]]; then
  if [[ "${START_OAUTH_TEXT}" == *"已经完成授权"* ]] \
    || [[ "${START_OAUTH_TEXT}" == *"已有有效的 MAC Token"* ]] \
    || [[ "${START_OAUTH_TEXT}" =~ [Aa]lready.*[Aa]uthorized ]]; then
    OAUTH_ALREADY_AUTHED=1
    ok "检测到当前会话已授权，跳过扫码与 complete_oauth_authorization。"
  else
    error "未从 start_oauth_authorization 响应中提取到授权链接。"
    error "原始响应：${START_OAUTH_JSON}"
    exit 1
  fi
fi

if [[ "${OAUTH_ALREADY_AUTHED}" -ne 1 ]]; then
  ok "已获取授权链接："
  echo "${AUTH_URL}"
  echo ""
  echo "请使用 TapTap App 完成授权后，回车继续..."
  read -r
fi

# ---------------------------
# Step 5: 完成 OAuth 授权
# ---------------------------
if [[ "${OAUTH_ALREADY_AUTHED}" -eq 1 ]]; then
  echo "${START_OAUTH_TEXT}" >/tmp/taptap-mcp-complete-oauth.txt
  ok "OAuth 已处于完成状态。输出已保存：/tmp/taptap-mcp-complete-oauth.txt"
else
  info "Step 5/8 - 调用 complete_oauth_authorization..."
  COMPLETE_OAUTH_JSON="$(mktemp)"
  call_tool "complete_oauth_authorization" "{}" "${COMPLETE_OAUTH_JSON}"
  COMPLETE_OAUTH_TEXT="$(extract_mcp_text "${COMPLETE_OAUTH_JSON}")"
  echo "${COMPLETE_OAUTH_TEXT}" >/tmp/taptap-mcp-complete-oauth.txt
  ok "OAuth 完成。输出已保存：/tmp/taptap-mcp-complete-oauth.txt"
fi

# ---------------------------
# Step 6: 选择目标应用
# ---------------------------
info "Step 6/8 - 调用 select_app (developer_id=${DEVELOPER_ID}, app_id=${APP_ID})..."
SELECT_APP_JSON="$(mktemp)"
call_tool "select_app" "{\"developer_id\":${DEVELOPER_ID},\"app_id\":${APP_ID}}" "${SELECT_APP_JSON}"
SELECT_APP_TEXT="$(extract_mcp_text "${SELECT_APP_JSON}")"
echo "${SELECT_APP_TEXT}" >/tmp/taptap-mcp-select-app.txt
ok "应用选择完成。输出已保存：/tmp/taptap-mcp-select-app.txt"

# ---------------------------
# Step 7: 拉取调试反馈（默认参数）
# ---------------------------
info "Step 7/8 - 调用 get_debug_feedbacks（默认参数）..."
FEEDBACK_JSON="$(mktemp)"
call_tool "get_debug_feedbacks" "{}" "${FEEDBACK_JSON}"
FEEDBACK_TEXT="$(extract_mcp_text "${FEEDBACK_JSON}")"
echo "${FEEDBACK_TEXT}" >/tmp/taptap-mcp-debug-feedbacks-first.txt
ok "首次拉取完成。输出已保存：/tmp/taptap-mcp-debug-feedbacks-first.txt"

# ---------------------------
# Step 8: 再次拉取（验证默认“仅未处理”）
# ---------------------------
info "Step 8/8 - 再次调用 get_debug_feedbacks（验证处理标记后行为）..."
FEEDBACK_JSON_2="$(mktemp)"
call_tool "get_debug_feedbacks" "{}" "${FEEDBACK_JSON_2}"
FEEDBACK_TEXT_2="$(extract_mcp_text "${FEEDBACK_JSON_2}")"
echo "${FEEDBACK_TEXT_2}" >/tmp/taptap-mcp-debug-feedbacks-second.txt
ok "二次拉取完成。输出已保存：/tmp/taptap-mcp-debug-feedbacks-second.txt"

echo ""
ok "=============================================="
ok "测试流程执行完成"
ok "=============================================="
echo "关键输出文件："
echo "- /tmp/taptap-mcp-check-environment.txt"
echo "- /tmp/taptap-mcp-complete-oauth.txt"
echo "- /tmp/taptap-mcp-select-app.txt"
echo "- /tmp/taptap-mcp-debug-feedbacks-first.txt"
echo "- /tmp/taptap-mcp-debug-feedbacks-second.txt"
echo "- 服务日志: ${SERVER_LOG}"
echo ""
echo "如果 get_debug_feedbacks 成功，会在项目内生成："
echo "- logs/feed_back/feedback_<id>/feedback.json"
echo "- logs/feed_back/feedback_<id>/screenshots/"
echo "- logs/feed_back/feedback_<id>/logs/"
echo "- logs/feed_back/feedback_<id>/debug_prompt.md"


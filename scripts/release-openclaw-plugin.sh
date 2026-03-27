#!/bin/sh

set -eu

MODE="${1:-pack}"
ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
PLUGIN_DIR="$ROOT_DIR/packages/openclaw-dc-plugin"
CACHE_DIR="${TAPTAP_OPENCLAW_NPM_CACHE:-${TMPDIR:-/tmp}/taptap-openclaw-npm-cache}"

if [ ! -d "$PLUGIN_DIR" ]; then
  echo "OpenClaw plugin directory not found: $PLUGIN_DIR" >&2
  exit 1
fi

MAIN_VERSION="$(node -p "require('$ROOT_DIR/package.json').version")"
PLUGIN_VERSION="$(node -p "require('$PLUGIN_DIR/package.json').version")"
MAIN_DEP_RANGE="$(node -p "require('$PLUGIN_DIR/package.json').dependencies['@mikoto_zero/minigame-open-mcp']")"

echo "TapTap main package version in repo: $MAIN_VERSION"
echo "OpenClaw plugin version: $PLUGIN_VERSION"
echo "OpenClaw plugin expects main package: $MAIN_DEP_RANGE"
echo "Using npm cache: $CACHE_DIR"
echo
echo "Reminder: publish the main package version required by the plugin before publishing the plugin itself."
echo

mkdir -p "$CACHE_DIR"

case "$MODE" in
  pack)
    cd "$PLUGIN_DIR"
    npm pack --dry-run --cache "$CACHE_DIR"
    ;;
  publish)
    cd "$PLUGIN_DIR"
    npm publish --access public --cache "$CACHE_DIR"
    ;;
  *)
    echo "Usage: ./scripts/release-openclaw-plugin.sh [pack|publish]" >&2
    exit 1
    ;;
esac

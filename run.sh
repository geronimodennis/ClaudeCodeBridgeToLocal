#!/bin/sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -P "$(dirname "$0")" && pwd)
if ! command -v node >/dev/null 2>&1; then
  echo 'Install Node.js 20 or newer from https://nodejs.org, then rerun this script.' >&2
  exit 1
fi
exec node "$SCRIPT_DIR/cli.cjs" "$@"

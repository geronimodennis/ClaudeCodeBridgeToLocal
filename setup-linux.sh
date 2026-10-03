#!/bin/sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -P "$(dirname "$0")" && pwd)
exec sh "$SCRIPT_DIR/run.sh" setup

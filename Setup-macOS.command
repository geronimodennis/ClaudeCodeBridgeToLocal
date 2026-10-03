#!/bin/sh
SCRIPT_DIR=$(CDPATH= cd -P "$(dirname "$0")" && pwd)
sh "$SCRIPT_DIR/run.sh" setup
printf '\nPress Enter to close...'
read -r answer

#!/bin/bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
bash "$ROOT_DIR/.cozeproj/scripts/prepare-node-modules.sh" --prefer-frozen-lockfile --prefer-offline

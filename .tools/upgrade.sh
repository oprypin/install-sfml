#!/bin/bash

set -e -u -x

cd "$(dirname "$0")/.."

rm -f package-lock.json

npx npm-check-updates -u
npm update
npm test
git commit -a -m "Upgrade packages"

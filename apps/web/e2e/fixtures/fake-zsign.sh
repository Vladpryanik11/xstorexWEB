#!/bin/sh
# E2E stand-in for zsign (Н4): copies the input (last argument) to the `-o` path. Real zsign
# runs in the worker image's `zsign-test` stage.
out=""; prev=""; last=""
for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; last="$a"; done
cp "$last" "$out"

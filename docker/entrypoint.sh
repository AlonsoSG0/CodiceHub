#!/bin/sh
set -eu

if [ "$(id -u)" -eq 0 ]; then
  chown -R node:node /app/data
  exec setpriv --reuid=node --regid=node --init-groups -- "$@"
fi

exec "$@"

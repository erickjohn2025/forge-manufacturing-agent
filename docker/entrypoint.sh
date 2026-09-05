#!/bin/sh
set -eu

npx prisma migrate deploy

(while true; do
  if npm run worker; then
    status=0
  else
    status=$?
  fi
  echo "Objective worker exited with status ${status}; restarting in 2 seconds" >&2
  sleep 2
done) &

exec node server.js

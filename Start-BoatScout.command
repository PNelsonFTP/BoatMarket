#!/bin/zsh
cd "${0:A:h}"
if ! command -v node >/dev/null 2>&1; then
  print 'Install Node.js 22 LTS, then open this launcher again.'
  read '?Press Return to close.'
  exit 1
fi
if [[ ! -d node_modules ]]; then npm install || exit 1; fi
npm run setup || exit 1
open 'http://127.0.0.1:3000'
npm run dev

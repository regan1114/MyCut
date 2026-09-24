#!/bin/zsh
set -e
cd -- "${0:A:h}"
if [[ "$(uname -m)" == "arm64" && -d "release/mac-arm64/MyCut.app" ]]; then
  open "release/mac-arm64/MyCut.app"
elif [[ -d "release/mac/MyCut.app" ]]; then
  open "release/mac/MyCut.app"
else
  if ! command -v node >/dev/null 2>&1 && [[ -f "$HOME/.nvm/nvm.sh" ]]; then
    source "$HOME/.nvm/nvm.sh"
  fi
  npm run desktop
fi

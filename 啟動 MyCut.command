#!/bin/zsh
set -e
cd -- "${0:A:h}"
app_arch="$(uname -m)"
# Prefer the newest versioned release before the original package location.
for release_dir in release/<->.<->.<->(/NnOn) release; do
  if [[ "$app_arch" == "arm64" && -d "$release_dir/mac-arm64/MyCut.app" ]]; then
    exec open "$release_dir/mac-arm64/MyCut.app"
  elif [[ -d "$release_dir/mac/MyCut.app" ]]; then
    exec open "$release_dir/mac/MyCut.app"
  fi
done
if ! command -v node >/dev/null 2>&1 && [[ -f "$HOME/.nvm/nvm.sh" ]]; then
  source "$HOME/.nvm/nvm.sh"
fi
npm run desktop

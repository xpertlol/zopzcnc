#!/bin/bash

set -e

KEY_DIR="./keys"
KEY_FILE="$KEY_DIR/host.key"

mkdir -p "$KEY_DIR"

echo "[*] Generating SSH host key..."
ssh-keygen -t rsa -b 4096 -f "$KEY_FILE" -N ""

{
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

  nvm install 18
  nvm use 18
  nvm alias default 18

  npm install
  npm i pm2 -g
} &> /dev/null

echo "[*] SSH host key generated at: $KEY_FILE"
echo "[*] nvm version: $(nvm -v)"
echo "[*] Node.js version: $(node -v)"
echo "[*] npm version: $(npm -v)"
echo "[*] npm dependencies installed."
echo "[*] Done."
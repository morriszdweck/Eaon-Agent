#!/usr/bin/env bash
# Eaon Agent — one-line installer (macOS + Linux)
#   curl -fsSL https://raw.githubusercontent.com/sanscreates/Eaon-Agent/main/install.sh | bash
set -e

REPO="sanscreates/Eaon-Agent"
BOLD="\033[1m"; DIM="\033[2m"; GREEN="\033[32m"; YELLOW="\033[33m"; RED="\033[31m"; RESET="\033[0m"

say()  { printf "%b\n" "$1"; }
ok()   { say "${GREEN}✔${RESET} $1"; }
warn() { say "${YELLOW}!${RESET} $1"; }
die()  { say "${RED}✖ $1${RESET}"; exit 1; }

say ""
say "${BOLD}  Eaon Agent${RESET} — token-efficient terminal coding agent"
say "${DIM}  why use many token when few do trick${RESET}"
say ""

# ---------- 0. platform ----------
case "$(uname -s)" in
  Darwin|Linux) ;;
  *) die "Only macOS and Linux are supported right now." ;;
esac

# ---------- 1. node >= 18 ----------
node_major() { node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1; }

if ! command -v node >/dev/null 2>&1 || [ "$(node_major)" -lt 18 ] 2>/dev/null; then
  warn "Node.js >= 18 not found. Trying to install it..."
  if command -v brew >/dev/null 2>&1; then
    brew install node || die "brew install node failed."
  elif command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -y && sudo apt-get install -y nodejs npm || die "apt install failed."
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y nodejs npm || die "dnf install failed."
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -Sy --noconfirm nodejs npm || die "pacman install failed."
  else
    die "No supported package manager found. Install Node.js >= 18 from https://nodejs.org and re-run."
  fi
fi
command -v node >/dev/null 2>&1 || die "node still not found."
[ "$(node_major)" -ge 18 ] || die "Node >= 18 required (found $(node -v))."
command -v npm  >/dev/null 2>&1 || die "npm not found."
ok "Node $(node -v), npm $(npm -v)"

# ---------- 2. make sure npm global bin is writable & on PATH ----------
NPM_PREFIX="$(npm config get prefix)"
if [ ! -w "$NPM_PREFIX/lib" ] 2>/dev/null && [ ! -w "$NPM_PREFIX" ] 2>/dev/null; then
  warn "Global npm prefix not writable ($NPM_PREFIX). Switching to ~/.npm-global"
  npm config set prefix "$HOME/.npm-global"
  NPM_PREFIX="$HOME/.npm-global"
  case ":$PATH:" in
    *":$NPM_PREFIX/bin:"*) ;;
    *)
      SHELL_RC="$HOME/.bashrc"; [ -n "$ZSH_VERSION" ] && SHELL_RC="$HOME/.zshrc"
      [ -f "$HOME/.zshrc" ] && SHELL_RC="$HOME/.zshrc"
      echo "export PATH=\"$NPM_PREFIX/bin:\$PATH\"" >> "$SHELL_RC"
      export PATH="$NPM_PREFIX/bin:$PATH"
      warn "Added $NPM_PREFIX/bin to PATH in $SHELL_RC (restart your shell later if needed)"
      ;;
  esac
fi

# ---------- 3. install / upgrade ----------
say "Installing eaon-agent from github.com/$REPO ..."
npm install -g "github:$REPO" || die "npm install failed."

command -v eaon >/dev/null 2>&1 || die "Installed, but 'eaon' is not on PATH. Add $NPM_PREFIX/bin to your PATH."
ok "eaon installed: $(eaon --version 2>/dev/null || echo ok)"

# ---------- 4. done ----------
say ""
say "${BOLD}Done.${RESET} Run:"
say "  ${GREEN}eaon setup${RESET}   # connect your providers (first run does this automatically)"
say "  ${GREEN}eaon${RESET}         # start the agent"
say ""

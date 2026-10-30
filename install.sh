#!/bin/sh
# chub installer: fetches the release asset for this machine, verifies it and installs it.
#
#   curl -fsSL https://raw.githubusercontent.com/AlonsoSG0/CodiceHub/main/install.sh | sh
#
# Nothing here needs a token: the repository is public and the assets come from its releases.
set -eu

REPOSITORY="AlonsoSG0/CodiceHub"
BASE_URL="${CHUB_INSTALL_BASE_URL:-https://github.com/${REPOSITORY}}"

usage() {
  cat <<'EOF'
Usage: install.sh [options]

Installs the chub binary for this machine into a directory on your PATH.

Options:
  --version <v>  Install a specific release instead of the latest one
  --dir <path>   Install into <path> (default: $XDG_BIN_HOME or ~/.local/bin)
  -h, --help     Show this help and exit

Environment:
  CHUB_INSTALL_DIR       Same as --dir
  CHUB_INSTALL_BASE_URL  Release host; used by mirrors and by the test suite
EOF
}

fail() {
  printf 'install.sh: %s\n' "$1" >&2
  exit 1
}

version="latest"
directory="${CHUB_INSTALL_DIR:-}"

while [ $# -gt 0 ]; do
  case "$1" in
  -h | --help)
    usage
    exit 0
    ;;
  --version)
    [ $# -ge 2 ] || fail "--version needs a release, for example: --version 0.4.0"
    version="$2"
    shift 2
    ;;
  --dir)
    [ $# -ge 2 ] || fail "--dir needs a directory"
    directory="$2"
    shift 2
    ;;
  *)
    fail "unknown option: $1"
    ;;
  esac
done

if [ -z "$directory" ]; then
  directory="${XDG_BIN_HOME:-${HOME:?HOME is not set, so chub cannot pick an install directory}/.local/bin}"
fi

system="$(uname -s)"
machine="$(uname -m)"

case "$system" in
Linux) os="linux" ;;
Darwin) os="darwin" ;;
*) fail "unsupported operating system: $system (chub publishes Linux and macOS builds)" ;;
esac

case "$machine" in
x86_64 | amd64 | x64) arch="x64" ;;
arm64 | aarch64) arch="arm64" ;;
*) fail "unsupported architecture: $machine on $system" ;;
esac

asset="chub-$os-$arch"

if [ "$version" = "latest" ]; then
  release="releases/latest/download"
else
  case "$version" in
  v*) ;;
  *) version="v$version" ;;
  esac
  release="releases/download/$version"
fi

if command -v curl >/dev/null 2>&1; then
  download() { curl -fsSL -o "$2" "$1"; }
elif command -v wget >/dev/null 2>&1; then
  download() { wget -qO "$2" "$1"; }
else
  fail "chub needs curl or wget to download the release"
fi

if command -v sha256sum >/dev/null 2>&1; then
  digest() { sha256sum "$1" | cut -d ' ' -f 1; }
elif command -v shasum >/dev/null 2>&1; then
  digest() { shasum -a 256 "$1" | cut -d ' ' -f 1; }
else
  fail "chub needs sha256sum or shasum to verify the download"
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/chub-install.XXXXXX")"
staging=""
cleanup() {
  rm -rf "$work"
  [ -z "$staging" ] || rm -f "$staging"
}
trap cleanup EXIT HUP INT TERM

printf 'Downloading %s (%s)...\n' "$asset" "$version"
download "$BASE_URL/$release/$asset.gz" "$work/$asset.gz" || fail "could not download $BASE_URL/$release/$asset.gz"
download "$BASE_URL/$release/SHA256SUMS" "$work/SHA256SUMS" || fail "could not download $BASE_URL/$release/SHA256SUMS"

expected="$(awk -v name="$asset.gz" '$2 == name { print $1; exit }' "$work/SHA256SUMS")"
[ -n "$expected" ] || fail "no checksum published for $asset.gz in this release"
actual="$(digest "$work/$asset.gz")"
[ "$expected" = "$actual" ] || fail "checksum mismatch for $asset.gz: expected $expected, got $actual"

gunzip -c "$work/$asset.gz" >"$work/chub" || fail "could not decompress $asset.gz"
chmod 755 "$work/chub"
installed="$("$work/chub" --version 2>/dev/null || echo unknown)"

mkdir -p "$directory"
staging="$directory/.chub.$$"
cp "$work/chub" "$staging"
chmod 755 "$staging"
mv -f "$staging" "$directory/chub"
staging=""

printf 'chub %s installed at %s/chub\n' "$installed" "$directory"

case ":$PATH:" in
*":$directory:"*) ;;
*)
  printf 'warning: %s is not on your PATH, so `chub` will not be found. Add it with:\n  export PATH="%s:$PATH"\n' \
    "$directory" "$directory" >&2
  ;;
esac

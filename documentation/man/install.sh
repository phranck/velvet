#!/bin/sh
# Installs the Velvet man pages for the user running it.
#
# The default target is the current user's own data directory, so nothing here
# asks for root and nothing is written outside $HOME. Pass a different manpath
# root as the first argument to override it.
#
# Usage:
#   ./install.sh
#   ./install.sh /usr/local/share/man
set -eu

target=${1:-${XDG_DATA_HOME:-$HOME/.local/share}/man}
archive=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

for section in 1 5 7; do
  [ -d "$archive/man$section" ] || continue
  mkdir -p "$target/man$section"
  for page in "$archive/man$section"/*; do
    [ -f "$page" ] || continue
    cp "$page" "$target/man$section/"
    echo "velvet: installed $(basename "$page") into $target/man$section"
  done
done

# Whether man searches the target is the only part of this that can go wrong,
# and it differs by system: man-db reads the user data directory by default,
# whilst macOS reads a fixed list and needs to be told. Asking man itself is
# the only answer that holds on both.
if man -w velvet >/dev/null 2>&1; then
  echo "velvet: try 'man velvet' or 'man velvet.yml'."
  exit 0
fi

echo
echo "velvet: the pages are installed, but man does not search $target yet."
echo "Add this line to your shell profile, then open a new shell:"
echo
echo "  export MANPATH=\"$target:\$MANPATH\""

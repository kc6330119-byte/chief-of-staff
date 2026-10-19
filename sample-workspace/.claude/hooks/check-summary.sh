# Chief of Staff for Managers: checks a meeting summary after Claude saves it. .claude/settings.json runs this after
# each Edit or Write, with Claude Code's JSON about the save on stdin. It only reads: it writes, changes and deletes
# nothing. A save outside meeting-notes/ is passed over without starting the app, and an app older than 0.4.0, which
# has no --hook, is never started. Otherwise the app checks the summary, and its exit code is this script's: 2, with
# what it could not read on stderr for Claude to fix, or 0.

payload=$(cat)
case $payload in
  */meeting-notes/*) ;;
  *) exit 0 ;;
esac

app="/Applications/Chief of Staff for Managers.app"
[ -x "$app/Contents/MacOS/chief-of-staff" ] || app="$HOME/Applications/Chief of Staff for Managers.app"
if [ ! -x "$app/Contents/MacOS/chief-of-staff" ]; then
  echo "Chief of Staff for Managers isn't installed, so this summary wasn't checked." >&2
  exit 0
fi

# 0.4.0 or later: a major version above 0, or 0 and a minor version of 4 or more. A version that isn't numbers and
# dots, starting with a number, is one that can't be read.
version=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$app/Contents/Info.plist" 2>/dev/null)
case $version in
  '' | .* | *[!0-9.]*) version= ;;
esac
major=${version%%.*}
minor=${version#"$major"}
minor=${minor#.}
minor=${minor%%.*}
if [ -z "$version" ] || { [ "$major" -eq 0 ] && [ "${minor:-0}" -lt 4 ]; }; then
  echo "This version of Chief of Staff for Managers can't check summaries; update to 0.4.0 or later." >&2
  exit 0
fi

printf '%s\n' "$payload" | "$app/Contents/MacOS/chief-of-staff" --hook

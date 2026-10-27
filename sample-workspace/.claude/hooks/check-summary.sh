# Chief of Staff for Managers: checks a meeting summary after Claude saves it. .claude/settings.json runs this after
# each Edit or Write, with Claude Code's JSON about the save on stdin. It only reads: it writes, changes and deletes
# nothing. A save outside meeting-notes/ is passed over without starting the app. The app used is the first copy, in
# /Applications then ~/Applications, that is 0.4.0 or later; an older one, which has no --hook, is never started. The
# app checks the summary, and its exit code is this script's: 2, with what it could not read on stderr for Claude to
# fix, or 0. With no app to check it, the script tells Claude so without blocking: exit 0, and on stdout the JSON that
# gives Claude Code a line for Claude.

payload=$(cat)
case $payload in
  */meeting-notes/*) ;;
  *) exit 0 ;;
esac

# The line, as a JSON string (a backslash or a double quote escaped), in the PostToolUse output Claude reads; then exit 0.
tell() {
  line=$(printf '%s' "$1" | sed 's/[\\"]/\\&/g')
  printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"%s"}}\n' "$line"
  exit 0
}

found=
for app in "/Applications/Chief of Staff for Managers.app" "$HOME/Applications/Chief of Staff for Managers.app"; do
  [ -x "$app/Contents/MacOS/chief-of-staff" ] || continue
  found=yes
  # 0.4.0 or later: a major version above 0, or 0 and a minor version of 4 or more. A version that isn't numbers and
  # dots, starting with a number, is one that can't be read.
  version=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$app/Contents/Info.plist" 2>/dev/null)
  case $version in
    '' | .* | *[!0-9.]*) continue ;;
  esac
  major=${version%%.*}
  minor=${version#"$major"}
  minor=${minor#.}
  minor=${minor%%.*}
  [ "$major" -eq 0 ] && [ "${minor:-0}" -lt 4 ] && continue
  printf '%s\n' "$payload" | "$app/Contents/MacOS/chief-of-staff" --hook
  exit
done

[ -n "$found" ] && tell "This version of Chief of Staff for Managers can't check summaries; update to 0.4.0 or later."
tell "Chief of Staff for Managers isn't installed, so this summary wasn't checked."

#!/usr/bin/env bash
# Tests for with_image_lock in deploy-service.sh.
#
# Run:  bash infra/scripts/test-deploy-lock.sh
#
# The helper is extracted from the real script rather than copied, so this test
# cannot drift away from what actually ships.
#
# Where there is no flock(1) — Git Bash on Windows, a slim container — the
# serialisation checks run against a stub that provides real mutual exclusion
# via atomic mkdir. flock's own correctness is a given; what is under test is
# whether the wrapper brackets the command with it, propagates the exit code,
# bounds the wait, and fails open.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/deploy-service.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

sed -n '/^DEPLOY_LOCK_FILE=/,/^}/p' "$SRC" > "$WORK/helper.sh"
grep -q 'with_image_lock()' "$WORK/helper.sh" || {
  echo "FAIL: could not extract with_image_lock from $SRC"; exit 1; }

mkdir -p "$WORK/bin"
cat > "$WORK/bin/flock" <<'STUB'
#!/usr/bin/env bash
# Stand-in for flock(1). Real flock releases when the fd closes; a child
# process cannot observe that, so the holder's pid is recorded instead and a
# waiter reclaims the lock once that process is gone. Deterministic, and with
# no background watcher to outlive its shell and wedge the next test.
wait_s=0
[ "${1:-}" = "-w" ] && { wait_s="$2"; shift 2; }
lockdir="${FLOCK_STUB_DIR:?}/d"
deadline=$(( $(date +%s) + wait_s ))
while ! mkdir "$lockdir" 2>/dev/null; do
  owner=$(cat "$lockdir/owner" 2>/dev/null || echo "")
  # An owner that no longer exists never released: treat the lock as stale.
  # An empty owner file means a holder planted by the test by hand — honour it.
  if [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null; then
    rm -rf "$lockdir"
    continue
  fi
  [ "$(date +%s)" -ge "$deadline" ] && exit 1
  sleep 0.1
done
echo "$PPID" > "$lockdir/owner"
exit 0
STUB
chmod +x "$WORK/bin/flock"
export PATH="$WORK/bin:$PATH"
export FLOCK_STUB_DIR="$WORK"

svc="test"
export DEPLOY_LOCK_FILE="$WORK/lock"
export DEPLOY_LOCK_WAIT=30
# shellcheck disable=SC1090
source "$WORK/helper.sh"

fail=0
ok()  { echo "  ok   - $1"; }
bad() { echo "  FAIL - $1"; fail=$((fail+1)); }

# Real flock releases when the fd closes. The stub cannot see that, so when the
# holder is this long-lived test shell the lock would stay held for the rest of
# the run and every later phase would sit out its full timeout. Clear the
# fixture between phases; mutual exclusion itself is proved in phase 1, where
# the holders are short-lived subshells that really do exit.
reset_lock() { rm -rf "$FLOCK_STUB_DIR/d"; }

# --- THE POINT OF THE LOCK: two deploys must not touch the image store at once.
critical() { echo "enter-$1" >> "$WORK/trace"; sleep 0.8; echo "exit-$1" >> "$WORK/trace"; }
: > "$WORK/trace"
( with_image_lock critical A ) &
sleep 0.15
( with_image_lock critical B ) &
wait
trace=$(tr '\n' ' ' < "$WORK/trace")
case "$trace" in
  "enter-A exit-A enter-B exit-B "|"enter-B exit-B enter-A exit-A ")
    ok "two concurrent callers serialise ($trace)" ;;
  *) bad "critical sections interleaved ($trace)" ;;
esac

# --- A deploy's success or failure must not be masked by the wrapper.
reset_lock; with_image_lock true  && ok "success propagates"  || bad "success propagates"
reset_lock; with_image_lock false && bad "failure propagates" || ok "failure propagates"
reset_lock; ( with_image_lock sh -c 'exit 42' ); [ $? -eq 42 ] \
  && ok "exact exit code propagates" || bad "exact exit code propagates"

# --- A deploy killed mid-pull must not wedge every later deploy.
DEPLOY_LOCK_WAIT=1
reset_lock
mkdir -p "$WORK/d"                 # a holder with no owner file = wedged forever
started=$(date +%s)
out=$(with_image_lock echo proceeded 2>&1)
elapsed=$(( $(date +%s) - started ))
rm -rf "$WORK/d"
case "$out" in
  *proceeded*)
    if [ "$elapsed" -le 4 ]; then
      ok "a wedged holder times out (${elapsed}s) and the deploy proceeds"
    else bad "waited ${elapsed}s, expected <=4s"; fi ;;
  *) bad "did not proceed past a wedged holder ($out)" ;;
esac
case "$out" in
  *"image lock not acquired"*) ok "the timeout is announced in the deploy log" ;;
  *) bad "the timeout was silent" ;;
esac
DEPLOY_LOCK_WAIT=30
reset_lock

# --- Fail open: a lock problem must never be what fails a deploy.
DEPLOY_LOCK_FILE="/this/path/does/not/exist/lock"
out=$(with_image_lock echo ran 2>&1)
case "$out" in *ran*) ok "fail-open when the lock file cannot be created" ;;
                   *) bad "fail-open when the lock file cannot be created ($out)" ;; esac
DEPLOY_LOCK_FILE="$WORK/lock"

reset_lock
PATH_SAVED="$PATH"; PATH="/nonexistent"
out=$(with_image_lock /usr/bin/echo ran-without-flock 2>&1)
PATH="$PATH_SAVED"
case "$out" in *ran-without-flock*) ok "fail-open when flock is not installed" ;;
                                 *) bad "fail-open when flock is not installed ($out)" ;; esac

echo
if [ "$fail" -eq 0 ]; then
  echo "with_image_lock: all checks passed"
else
  echo "with_image_lock: $fail failure(s)"
fi
exit "$fail"

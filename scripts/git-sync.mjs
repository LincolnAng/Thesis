#!/usr/bin/env node
/**
 * Keeps this copy level with GitHub, so two people working on the site never drift far apart.
 *
 * Runs on its own — nobody has to remember it:
 *   - before `npm run dev` (the predev script)
 *   - from Claude Code (.claude/settings.json): when a session starts, and before each prompt
 *
 * It pulls the other person's commits underneath your work, uncommitted edits included. When
 * both of you changed the same lines, the version that reached GitHub first wins: only those
 * lines of yours give way, the rest of your work lands, and your version is kept on a
 * sync-backup/ branch (or in the stash, for unsaved edits) so nothing is ever truly lost.
 * Clashes that aren't about lines — a file one of you deleted — are backed out untouched and
 * reported instead: a half-finished merge left behind by a script is worse than none.
 *
 *   --hook            speak Claude Code's hook JSON instead of plain text
 *   --throttle=SECS   skip if a sync ran less than SECS ago (so every prompt isn't a network trip)
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const hook = args.includes("--hook");
const throttle = Number(args.find((a) => a.startsWith("--throttle="))?.split("=")[1] ?? 0);

let hookEvent = "SessionStart";
if (hook) {
  try {
    hookEvent = JSON.parse(readFileSync(0, "utf8")).hook_event_name ?? hookEvent;
  } catch {}
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = (...a) =>
  execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20_000 }).trim();
const tryGit = (...a) => {
  try {
    return { ok: true, out: git(...a) };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}`.trim() };
  }
};
const lines = (s) => s.split("\n").filter(Boolean);

/** Says nothing unless there's something to say; never fails the thing it runs before. */
function done(forPerson, forClaude) {
  if (forPerson || forClaude) {
    if (hook) {
      process.stdout.write(
        JSON.stringify({
          ...(forPerson ? { systemMessage: forPerson } : {}),
          hookSpecificOutput: { hookEventName: hookEvent, additionalContext: forClaude ?? forPerson },
        }),
      );
    } else {
      console.log(`[sync] ${forPerson}`);
    }
  }
  process.exit(0);
}

const gitDir = tryGit("rev-parse", "--absolute-git-dir");
if (!gitDir.ok) done();

// Make plain `git pull` behave the same way by hand: rebase instead of merge commits, carry
// uncommitted edits along, and remember how a conflict was resolved so it's never asked twice.
for (const [key, value] of [
  ["pull.rebase", "true"],
  ["rebase.autoStash", "true"],
  ["rerere.enabled", "true"],
]) {
  if (tryGit("config", "--local", "--get", key).out !== value) tryGit("config", "--local", key, value);
}

const unmerged = () => lines(tryGit("diff", "--name-only", "--diff-filter=U").out);
const midRebase = () =>
  ["rebase-merge", "rebase-apply", "MERGE_HEAD"].some((p) => existsSync(path.join(gitDir.out, p)));

const RESOLVE =
  "Resolve it before any other work this turn: tell the user first. Team rule: where both sides changed " +
  "the same lines, the version already on GitHub (pushed first) wins; keep everything else from both " +
  "sides. Ask the user only when that rule can't decide (e.g. one side deleted a file the other edited). " +
  "Then run `npx tsc --noEmit`, " +
  "`git add` the files and `git rebase --continue` (or `git commit` for a merge).";

// Something already stuck mid-merge: syncing on top of it would only bury it.
if (midRebase() || unmerged().length) {
  const files = unmerged();
  done(
    `Unfinished merge in this copy${files.length ? `: ${files.join(", ")}` : ""}. Finish it before syncing.`,
    `GIT SYNC: this repo is in the middle of a merge/rebase${files.length ? ` with conflicts in ${files.join(", ")}` : ""}. ${RESOLVE}`,
  );
}

const stamp = path.join(gitDir.out, "last-sync");
if (throttle > 0 && existsSync(stamp) && Date.now() - statSync(stamp).mtimeMs < throttle * 1000) done();

const branch = tryGit("symbolic-ref", "--short", "HEAD");
const upstream = tryGit("rev-parse", "--abbrev-ref", "@{u}");
if (!branch.ok || !upstream.ok) done();

// Offline, or GitHub unreachable: carry on with what's here rather than stall the session.
if (!tryGit("fetch", "--quiet").ok) done();
try {
  writeFileSync(stamp, new Date().toISOString());
} catch {}

const incoming = lines(tryGit("log", "--format=%h %an: %s", `HEAD..${upstream.out}`).out);
if (incoming.length === 0) done();

const list = incoming.map((l) => `  ${l}`).join("\n");
const authors = [...new Set(lines(tryGit("log", "--format=%an", `HEAD..${upstream.out}`).out))].join(" & ");
const before = git("rev-parse", "HEAD");

/** One attempt at the pull. A collision is backed out on the spot, and reported by file. */
function pull(...extra) {
  const result = tryGit("pull", "--rebase", "--autostash", ...extra);
  if (result.ok) return { ok: true, files: [], out: result.out };
  const files = unmerged();
  if (midRebase()) tryGit("rebase", "--abort");
  return { ok: false, files, out: result.out };
}

/**
 * Settles one file whose unsaved edits clash with what just came in: GitHub's lines win where
 * both touched the same ones, and every other unsaved edit in the file survives. False when
 * the clash isn't about lines at all (a file deleted on one side, a binary file).
 */
function keepGitHubSide(file) {
  const dir = mkdtempSync(path.join(tmpdir(), "git-sync-"));
  try {
    const stage = (n) => {
      const out = path.join(dir, String(n));
      writeFileSync(out, execFileSync("git", ["show", `:${n}:${file}`], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }));
      return out;
    };
    const [base, github, mine] = [stage(1), stage(2), stage(3)];
    const merged = execFileSync("git", ["merge-file", "-p", "--ours", github, base, mine], { cwd: root, stdio: ["ignore", "pipe", "ignore"] });
    writeFileSync(path.join(root, file), merged);
    return true;
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function backOut(files, why) {
  done(
    `New commits on GitHub clash with your work in: ${files.join(", ")}. Nothing was changed yet.`,
    `GIT SYNC: ${incoming.length} new commit(s) on ${upstream.out} conflict with this copy in ${files.join(", ")}:\n${list}\n` +
      `${why} The pull was backed out, so the working tree is exactly as before. Start with \`git pull --rebase --autostash\`. ${RESOLVE}`,
  );
}

let pulled = pull();
const overridden = new Set();
let backup = null;

if (!pulled.ok && pulled.files.length) {
  // Both of you changed the same lines. House rule: whoever got to GitHub first wins — their
  // work is already live and the other person may have built on it. Only the clashing lines
  // give way; the rest of your commit still lands. Your version is kept on a branch first.
  backup = `sync-backup/${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
  tryGit("branch", "--force", backup, before);
  const clashed = pulled.files;
  // During a rebase "ours" is the side being built on, which is GitHub's.
  pulled = pull("--strategy-option=ours");
  if (!pulled.ok) {
    tryGit("branch", "--delete", "--force", backup);
    backOut(pulled.files.length ? pulled.files : clashed, "Git couldn't settle this line by line (e.g. a file deleted on one side).");
  }
  clashed.forEach((f) => overridden.add(f));
}
if (!pulled.ok) {
  done(
    `Couldn't pull the ${incoming.length} new commit(s) from GitHub: ${pulled.out.split("\n")[0]}`,
    `GIT SYNC: ${incoming.length} new commit(s) on ${upstream.out} could not be pulled:\n${list}\nGit said: ${pulled.out}`,
  );
}

// The commits are in; your unsaved edits were put back on top and may clash too. Same rule.
const stuck = unmerged();
let stashKept = false;
if (stuck.length) {
  if (!stuck.every(keepGitHubSide)) {
    // Go back to where you were; git kept the edits in the autostash for exactly this.
    tryGit("reset", "--quiet", "--hard", before);
    tryGit("stash", "pop", "--quiet");
    if (backup) tryGit("branch", "--delete", "--force", backup);
    backOut(stuck, "Your unsaved edits clash in a way Git can't settle line by line.");
  }
  tryGit("reset", "--quiet"); // clear the conflict from the index; the edits stay unsaved edits
  stuck.forEach((f) => overridden.add(f));
  stashKept = true; // git leaves the autostash in `git stash list` when it clashed
}

if (overridden.size) {
  const files = [...overridden].join(", ");
  const savedAt = [backup && `branch ${backup}`, stashKept && "`git stash list` (stash@{0})"].filter(Boolean).join(" and ");
  done(
    `Pulled ${incoming.length} commit(s). You and ${authors} changed the same lines in ${files}; ` +
      `${authors}'s version reached GitHub first, so it was kept. Your version is saved in ${savedAt}.`,
    `GIT SYNC: pulled ${incoming.length} new commit(s) from ${upstream.out} into ${branch.out}:\n${list}\n` +
      `Both sides changed the same lines in ${files}. Team rule: the version that reached GitHub first wins, so ` +
      `GitHub's lines were kept and only this copy's clashing lines were dropped; the rest of this copy's work was kept. ` +
      `This copy's version from before the sync is saved in ${savedAt}. Tell the user plainly which of their changes ` +
      `were replaced (compare the saved version of each file with the current one), and don't re-apply them unless ` +
      "they ask. Code read earlier in this session may have changed; re-read files before editing them.",
  );
}
done(
  `Pulled ${incoming.length} new commit(s) from GitHub.`,
  `GIT SYNC: pulled ${incoming.length} new commit(s) from ${upstream.out} into ${branch.out}:\n${list}\n` +
    "Code you read earlier in this session may have changed; re-read files before editing them.",
);

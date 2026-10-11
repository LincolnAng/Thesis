#!/usr/bin/env node
/**
 * Ships whatever is on disk at the end of every Claude Code turn: commit, sync, push. Vercel
 * deploys main on push, so the live site follows every finished prompt.
 *
 * Runs from the Stop hook in .claude/settings.json. Order matters:
 *   1. Type-check first. A push is a deploy, and a site that doesn't build is worse than a
 *      site that's one change behind — so a failing check ships nothing and hands the errors
 *      back to Claude to fix before the turn can end.
 *   2. Commit everything, titled with the prompt that asked for it, so the history reads as
 *      a list of requests rather than "auto-commit" forty times.
 *   3. Sync (scripts/git-sync.mjs): the other person's pushes come in first, and where you both
 *      changed the same lines the version that reached GitHub first wins.
 *   4. Push. If someone pushed in the seconds since the sync, sync once more and retry.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = (...a) =>
  execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 }).trim();
const tryGit = (...a) => {
  try {
    return { ok: true, out: git(...a) };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}`.trim() };
  }
};

function say(message) {
  if (message) process.stdout.write(JSON.stringify({ systemMessage: message }));
  process.exit(0);
}
/** Keeps the turn going so Claude fixes what stopped the deploy — but only once in a row. */
function sendBack(reason, message) {
  if (input.stop_hook_active) say(message);
  process.stdout.write(JSON.stringify({ decision: "block", reason }));
  process.exit(0);
}

const gitDir = tryGit("rev-parse", "--absolute-git-dir");
if (!gitDir.ok) say();
// Mid-merge: the sync hook already said so, and shipping now would ship the conflict.
if (["rebase-merge", "rebase-apply", "MERGE_HEAD"].some((p) => existsSync(path.join(gitDir.out, p)))) say();
if (!tryGit("symbolic-ref", "--short", "HEAD").ok || !tryGit("rev-parse", "--abbrev-ref", "@{u}").ok) say();

const changed = tryGit("status", "--porcelain").out;
if (changed) {
  const tsc = path.join(root, "node_modules", "typescript", "bin", "tsc");
  if (existsSync(tsc)) {
    try {
      execFileSync(process.execPath, [tsc, "--noEmit", "-p", "."], { cwd: root, stdio: ["ignore", "pipe", "pipe"], timeout: 90_000 });
    } catch (e) {
      const errors = `${e.stdout ?? ""}`.split("\n").filter(Boolean).slice(0, 30).join("\n");
      sendBack(
        `Not deployed: the type check failed, and every push goes live on Vercel. Fix these, then finish the turn ` +
          `(the deploy runs again when you stop):\n${errors}`,
        "Not deployed: the type check still fails. The changes are saved on this computer, not on the site.",
      );
    }
  }

  tryGit("add", "--all");
  const files = git("diff", "--cached", "--name-only").split("\n").filter(Boolean);
  const title = (lastPrompt() ?? `Update ${files.map((f) => path.basename(f)).join(", ")}`).slice(0, 72);
  const committed = tryGit("commit", "--quiet", "-m", title, "-m", `Deployed automatically at the end of a Claude Code turn.\n\nFiles:\n${files.map((f) => `  ${f}`).join("\n")}`);
  if (!committed.ok) say(`Not deployed: couldn't commit (${committed.out.split("\n")[0]}).`);
}

const sync = () => {
  try {
    return execFileSync(process.execPath, [path.join(root, "scripts", "git-sync.mjs")], { cwd: root, encoding: "utf8", timeout: 60_000 })
      .replace(/^\[sync\] /gm, "")
      .trim();
  } catch {
    return "";
  }
};

let synced = sync();
if (tryGit("rev-list", "--count", "HEAD..@{u}").out !== "0") {
  // The sync backed out (a clash it can't settle by lines): the commit is safe here, unshipped.
  sendBack(
    `Not deployed: GitHub has changes this copy couldn't take in automatically. ${synced} ` +
      "Tell the user, resolve it with them, then finish the turn so the deploy runs again.",
    `Not deployed: ${synced}`,
  );
}
if (tryGit("rev-list", "--count", "@{u}..HEAD").out === "0") say(synced);

let pushed = tryGit("push", "--quiet");
if (!pushed.ok) {
  synced = [synced, sync()].filter(Boolean).join(" ");
  pushed = tryGit("push", "--quiet");
}
if (!pushed.ok) say(`Not deployed: push failed (${pushed.out.split("\n")[0]}). Your commit is saved on this computer.`);

const head = git("log", "-1", "--format=%h %s");
say(`Deployed ${head} → GitHub; Vercel will have it live in a minute or two.${synced ? ` (${synced})` : ""}`);

/** The request this turn answered, from the session transcript: what the commit is "for". */
function lastPrompt() {
  try {
    const entries = readFileSync(input.transcript_path, "utf8").trim().split("\n").reverse();
    for (const line of entries) {
      const entry = JSON.parse(line);
      if (entry.type !== "user") continue;
      const content = entry.message?.content;
      const texts =
        typeof content === "string"
          ? [content]
          : Array.isArray(content) && !content.some((c) => c.type === "tool_result")
            ? content.filter((c) => c.type === "text").map((c) => c.text)
            : [];
      const text = texts.map((t) => t.trim()).find((t) => t && !t.startsWith("<"));
      if (text) return text.split("\n")[0].trim();
    }
  } catch {}
  return null;
}

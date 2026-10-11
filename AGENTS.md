<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Two people work on this site at once

Lincoln and Jania (Jai) both edit this repo, each with their own Claude Code, and both push straight to `main`. **Every push to `main` goes live on Vercel.**

Hooks in `.claude/settings.json` keep the two copies in step. Don't bypass them, and don't do by hand what they already do:

- **Pulling** (`scripts/git-sync.mjs`) runs at session start, before each prompt and before `npm run dev`. When it says it pulled commits, re-read a file before editing it.
- **Shipping** (`scripts/git-deploy.mjs`) runs when a turn ends: type check, commit titled with the prompt, sync, push. A failing type check ships nothing and sends the errors back, so fix them before ending the turn.
- **Same lines changed by both people: the version that reached GitHub first wins.** The other side's lines are kept on a `sync-backup/<date>` branch (committed work) or in `git stash list` (unsaved edits). When this happens, tell the user which of their changes were replaced. Don't re-apply them unless they ask.
- **Clashes git can't settle line by line** (for example, a file one person deleted) are backed out untouched and reported. Resolve them with the user before anything else.
- **Never `git push --force`.** It is the one way to erase the other person's work.
- **Names and wording the two of them disagree on are theirs to settle.** If the other person just changed something the user is asking about, mention it rather than silently overwriting it.
- **Risky or half-finished work goes on a branch**, since `main` publishes on every turn.

// Builtin skills — shipped with the binary, loaded on demand via use_skill.

import type { SkillMeta } from "../types.js";

export const BUILTIN_SKILLS: SkillMeta[] = [
  {
    name: "code-review",
    description: "Review code or a diff for bugs, security issues, and style. Prioritized findings, one line each.",
    source: "builtin",
    body: `You are doing a code review. Rules:
- Read the actual code (read_file / grep / git diff) before judging. No guessing.
- Report findings as one-liners, worst first: \`L<n>: 🔴 bug: <what>. <fix>\`, 🟠 risk, 🟡 style, 🔵 nit.
- Check: null/undefined paths, off-by-one, injection, secrets in code, error swallowing, race conditions, resource leaks, wrong types.
- If clean: say so in one line. No padding.`,
  },
  {
    name: "refactor",
    description: "Refactor code safely: behavior-preserving, small steps, verified by tests.",
    source: "builtin",
    body: `Refactoring protocol:
1. Read the target code and its callers first (grep for usages).
2. Make the smallest change that achieves the goal. Behavior must not change.
3. Keep public APIs stable unless asked otherwise.
4. After editing, run the project's tests/typecheck/build if available.
5. Report: what changed, where, why — as a short list.`,
  },
  {
    name: "write-tests",
    description: "Write tests for existing code, matching the project's test framework and style.",
    source: "builtin",
    body: `Test-writing protocol:
1. Detect the test framework (package.json, config files, existing tests).
2. Cover: happy path, edge cases (empty/null/boundary), error paths.
3. Match existing test style and naming. Put tests where existing ones live.
4. Run the tests. Fix failures in the tests, never by weakening assertions.
5. Report what is covered and what is not.`,
  },
  {
    name: "debug",
    description: "Systematic debugging: reproduce, isolate, fix root cause, verify.",
    source: "builtin",
    body: `Debugging protocol:
1. Reproduce: find the exact input/command that fails. Read the full error.
2. Form one hypothesis. Test it with the smallest probe (log, print, grep, run).
3. Fix the root cause, not the symptom.
4. Verify the original failure is gone and nothing nearby broke.
5. Report: cause (one line), fix (one line), verification (one line).`,
  },
  {
    name: "git-workflow",
    description: "Git operations: inspect history, craft commits, branch safely.",
    source: "builtin",
    body: `Git protocol:
- Inspect before acting: git status, git diff, git log --oneline -10.
- Never run destructive commands (reset --hard, push --force, clean -fd) without the user explicitly asking.
- Commit messages: conventional format, ≤50 char subject, why over what.
- Stage specific files, not git add -A, unless asked.`,
  },
  {
    name: "docs-writer",
    description: "Write or update documentation (README, API docs) from the actual code.",
    source: "builtin",
    body: `Docs protocol:
1. Read the code being documented. Document what IS, not what should be.
2. Match the project's existing doc style and format.
3. Include working examples — verify commands by running them when cheap.
4. Keep it skimmable: headings, short paragraphs, code blocks.`,
  },
];

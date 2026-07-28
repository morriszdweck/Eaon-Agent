// Minimal line-based unified diff (LCS). Good enough for edit previews.

export interface DiffLine {
  kind: "ctx" | "add" | "del";
  text: string;
}

export function diffLines(oldText: string, newText: string, context = 3): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length;
  const m = b.length;
  // LCS DP — cap to keep memory sane on huge files
  if (n * m > 4_000_000) {
    return [
      { kind: "del", text: `(${n} lines removed)` },
      { kind: "add", text: `(${m} lines added)` },
    ];
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: "ctx", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ kind: "del", text: a[i++] });
    } else {
      ops.push({ kind: "add", text: b[j++] });
    }
  }
  while (i < n) ops.push({ kind: "del", text: a[i++] });
  while (j < m) ops.push({ kind: "add", text: b[j++] });

  // trim to hunks with `context` lines around changes
  const keep = new Array<boolean>(ops.length).fill(false);
  for (let k = 0; k < ops.length; k++) {
    if (ops[k].kind !== "ctx") {
      for (let t = Math.max(0, k - context); t <= Math.min(ops.length - 1, k + context); t++) keep[t] = true;
    }
  }
  const out: DiffLine[] = [];
  let skipping = false;
  for (let k = 0; k < ops.length; k++) {
    if (keep[k]) {
      if (skipping) out.push({ kind: "ctx", text: "  ⋮" });
      skipping = false;
      out.push(ops[k]);
    } else {
      skipping = true;
    }
  }
  return out;
}

export function formatDiff(oldText: string, newText: string): string {
  return diffLines(oldText, newText)
    .map((l) => (l.kind === "add" ? `+ ${l.text}` : l.kind === "del" ? `- ${l.text}` : `  ${l.text}`))
    .join("\n");
}

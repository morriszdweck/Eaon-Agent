// Macros — reusable prompt templates. Save tokens by turning long recurring
// instructions into one short invocation. User macros live in ~/.eaon/macros.json,
// plugins can add more; builtins ship with the binary.

import { deleteUserMacro, loadPlugins, loadUserMacros, saveUserMacro } from "../config.js";
import type { Macro } from "../types.js";

export const BUILTIN_MACROS: Macro[] = [
  { name: "review", description: "Review recent changes / given files", prompt: "Review {{args}} for bugs, security issues, and style. Findings as one-liners, worst first.", builtin: true },
  { name: "fix", description: "Fix the described bug end-to-end", prompt: "Fix this bug: {{args}}. Reproduce, find root cause, fix, verify with tests. Report cause+fix in 2 lines.", builtin: true },
  { name: "test", description: "Write tests for target", prompt: "Write tests for {{args}} using the project's test framework. Cover happy path, edges, errors. Run them.", builtin: true },
  { name: "explain", description: "Explain code concisely", prompt: "Explain {{args}}. Short: what it does, how, anything surprising. Use references like file:line.", builtin: true },
  { name: "optimize", description: "Optimize target for speed/size", prompt: "Optimize {{args}}. Measure first if cheap. Make the smallest high-impact change. Verify nothing broke.", builtin: true },
  { name: "docs", description: "Write docs for target", prompt: "Write documentation for {{args}}. Match project style. Include working examples.", builtin: true },
  { name: "commit", description: "Commit current changes", prompt: "Commit the current changes. Inspect git status and diff first. Conventional commit message, ≤50-char subject.", builtin: true },
  { name: "refactor", description: "Refactor target", prompt: "Refactor {{args}}. Behavior-preserving, smallest change, run tests after.", builtin: true },
];

export class MacroRegistry {
  private macros = new Map<string, Macro>();

  constructor(cwd: string) {
    for (const m of BUILTIN_MACROS) this.macros.set(m.name, m);
    for (const p of loadPlugins(cwd)) {
      for (const [name, v] of Object.entries(p.macros ?? {})) {
        this.macros.set(name, { name, description: v.description ?? "", prompt: v.prompt });
      }
    }
    for (const m of loadUserMacros()) this.macros.set(m.name, m);
  }

  list(): Macro[] {
    return [...this.macros.values()];
  }

  get(name: string): Macro | undefined {
    return this.macros.get(name);
  }

  add(m: Macro): void {
    saveUserMacro(m);
    this.macros.set(m.name, m);
  }

  remove(name: string): boolean {
    const ok = deleteUserMacro(name);
    const m = this.macros.get(name);
    if (m?.builtin) return false;
    if (ok) this.macros.delete(name);
    return ok;
  }

  expand(m: Macro, args: string): string {
    const a = args.trim();
    if (m.prompt.includes("{{args}}")) return m.prompt.replace(/\{\{args\}\}/g, a || "the current context");
    return a ? `${m.prompt}\n\nContext: ${a}` : m.prompt;
  }

  catalogText(): string {
    const all = this.list();
    if (!all.length) return "";
    return all.map((m) => `- /${m.name}: ${m.description}`).join("\n");
  }
}

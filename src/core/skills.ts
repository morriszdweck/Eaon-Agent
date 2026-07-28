// Skill registry — SKILL.md files discovered from builtin set, ~/.eaon/skills,
// <cwd>/.eaon/skills, and plugins. Only name+description go into the system
// prompt; the body loads via the use_skill tool when actually needed.

import fs from "node:fs";
import path from "node:path";
import { PLUGINS_DIR, SKILLS_DIR } from "../config.js";
import type { SkillMeta } from "../types.js";
import { BUILTIN_SKILLS } from "../skills/builtin.js";

function parseSkillMd(text: string, source: SkillMeta["source"]): SkillMeta | null {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return null;
  const front = m[1];
  const body = m[2].trim();
  const name = front.match(/^name:\s*(.+)$/m)?.[1].trim();
  const description = front.match(/^description:\s*(.+)$/m)?.[1].trim() ?? "";
  if (!name) return null;
  return { name, description, body, source };
}

function scanDir(dir: string, source: SkillMeta["source"], out: Map<string, SkillMeta>): void {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      const text = fs.readFileSync(path.join(dir, e.name, "SKILL.md"), "utf8");
      const skill = parseSkillMd(text, source);
      if (skill) out.set(skill.name, skill);
    } catch {}
  }
}

export class SkillRegistry {
  private skills = new Map<string, SkillMeta>();

  constructor(cwd: string) {
    for (const s of BUILTIN_SKILLS) this.skills.set(s.name, s);
    scanDir(SKILLS_DIR, "user", this.skills);
    scanDir(path.join(cwd, ".eaon", "skills"), "project", this.skills);
    // plugin skills: <plugins>/<plugin>/skills/<skill>/SKILL.md
    for (const root of [PLUGINS_DIR, path.join(cwd, ".eaon", "plugins")]) {
      let plugs: fs.Dirent[] = [];
      try {
        plugs = fs.readdirSync(root, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const p of plugs) {
        if (p.isDirectory()) scanDir(path.join(root, p.name, "skills"), "plugin", this.skills);
      }
    }
  }

  list(): SkillMeta[] {
    return [...this.skills.values()];
  }

  get(name: string): SkillMeta | undefined {
    return this.skills.get(name);
  }

  catalogText(): string {
    const all = this.list();
    if (!all.length) return "";
    return all.map((s) => `- ${s.name}: ${s.description}`).join("\n");
  }
}

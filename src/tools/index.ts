// Tool registry. Tools receive a Runtime handle for config/permissions/subsystems.

import type { ToolSchema } from "../types.js";
import type { Runtime } from "../core/runtime.js";

export interface ToolDef {
  schema: ToolSchema;
  /** Return false to hide the tool from sub-agents. */
  subagentOk: boolean;
  run(args: Record<string, any>, rt: Runtime): Promise<string>;
}

const registry = new Map<string, ToolDef>();

export function registerTool(def: ToolDef): void {
  registry.set(def.schema.name, def);
}

export function getTool(name: string): ToolDef | undefined {
  return registry.get(name);
}

export function allTools(): ToolDef[] {
  return [...registry.values()];
}

export function toolSchemas(opts: { forSubagent?: boolean } = {}): ToolSchema[] {
  return allTools()
    .filter((t) => !opts.forSubagent || t.subagentOk)
    .map((t) => t.schema);
}

export function obj(props: Record<string, any>, required: string[] = []): Record<string, any> {
  return { type: "object", properties: props, required, additionalProperties: false };
}

export function str(description: string, extra: Record<string, any> = {}): Record<string, any> {
  return { type: "string", description, ...extra };
}

export function num(description: string, extra: Record<string, any> = {}): Record<string, any> {
  return { type: "number", description, ...extra };
}

export function bool(description: string): Record<string, any> {
  return { type: "boolean", description };
}

// Minimal MCP client (stdio, newline-delimited JSON-RPC). No SDK dependency.
// Servers start lazily on first use and stay alive for the session.

import { spawn, type ChildProcess } from "node:child_process";
import type { McpServerConfig } from "../types.js";

interface Pending {
  resolve: (v: any) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

export class McpConnection {
  private child: ChildProcess | null = null;
  private buf = "";
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private startPromise: Promise<void> | null = null;

  constructor(private name: string, private cfg: McpServerConfig) {}

  private async ensureStarted(): Promise<void> {
    if (this.startPromise) return this.startPromise;
    this.startPromise = (async () => {
      this.child = spawn(this.cfg.command, this.cfg.args ?? [], {
        env: { ...process.env, ...(this.cfg.env ?? {}) },
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.child.stderr?.on("data", () => {}); // swallow server chatter
      this.child.stdout?.on("data", (d) => this.onData(d.toString()));
      this.child.on("exit", () => this.failAll(new Error(`MCP server '${this.name}' exited`)));
      await this.request("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "eaon-agent", version: "0.1.0" },
      });
      this.notify("notifications/initialized", {});
    })();
    return this.startPromise;
  }

  private onData(data: string): void {
    this.buf += data;
    let idx: number;
    while ((idx = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (!line) continue;
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      }
    }
  }

  private failAll(e: Error): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(e);
    }
    this.pending.clear();
    this.startPromise = null;
    this.child = null;
  }

  private request(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.child?.stdin?.writable) return reject(new Error(`MCP server '${this.name}' not running`));
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP '${this.name}' ${method} timed out (30s)`));
      }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  private notify(method: string, params: any): void {
    if (this.child?.stdin?.writable) this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  async listTools(): Promise<{ name: string; description?: string; inputSchema?: any }[]> {
    await this.ensureStarted();
    const res = await this.request("tools/list", {});
    return res?.tools ?? [];
  }

  async callTool(tool: string, args: Record<string, any>): Promise<string> {
    await this.ensureStarted();
    const res = await this.request("tools/call", { name: tool, arguments: args });
    if (res?.isError) {
      const txt = (res.content ?? []).map((c: any) => c.text ?? "").join("\n");
      throw new Error(txt || "MCP tool error");
    }
    const parts = (res?.content ?? []).map((c: any) => {
      if (c.type === "text") return c.text;
      if (c.type === "resource") return c.resource?.text ?? JSON.stringify(c.resource);
      return JSON.stringify(c);
    });
    return parts.join("\n") || "(empty result)";
  }

  kill(): void {
    try {
      this.child?.kill();
    } catch {}
    this.failAll(new Error("killed"));
  }
}

export class McpManager {
  private conns = new Map<string, McpConnection>();

  constructor(private servers: Record<string, McpServerConfig>) {}

  names(): string[] {
    return Object.keys(this.servers);
  }

  private conn(name: string): McpConnection {
    const cfg = this.servers[name];
    if (!cfg) throw new Error(`Unknown MCP server '${name}'. Configured: ${this.names().join(", ") || "(none)"}`);
    let c = this.conns.get(name);
    if (!c) {
      c = new McpConnection(name, cfg);
      this.conns.set(name, c);
    }
    return c;
  }

  async listToolsText(name: string): Promise<string> {
    const tools = await this.conn(name).listTools();
    if (!tools.length) return `Server '${name}' exposes no tools.`;
    return tools
      .map((t) => `- ${t.name}: ${(t.description ?? "").slice(0, 200)}\n  schema: ${JSON.stringify(t.inputSchema ?? {}).slice(0, 500)}`)
      .join("\n");
  }

  async callToolText(name: string, tool: string, args: Record<string, any>): Promise<string> {
    const out = await this.conn(name).callTool(tool, args);
    return out.length > 20_000 ? out.slice(0, 20_000) + "\n… (truncated)" : out;
  }

  killAll(): void {
    for (const c of this.conns.values()) c.kill();
    this.conns.clear();
  }
}

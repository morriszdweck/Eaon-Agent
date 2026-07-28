// OpenAI-compatible backend — works with OpenAI, OpenRouter, DeepSeek, Groq,
// Together, Fireworks, Mistral, Cerebras, xAI, Ollama, LM Studio, and any
// endpoint that speaks /v1/chat/completions.

import type { ChatParams, Msg, Provider, StreamEvent, ToolCall } from "../types.js";
import { authHeaders, checkRes, sseEvents, type ChatResult, type LLMBackend } from "./base.js";

interface AccumTool {
  id: string;
  name: string;
  argStr: string;
}

export const openaiBackend: LLMBackend = {
  type: "openai",

  async chat(params: ChatParams, cfg: Provider, onEvent: (e: StreamEvent) => void): Promise<ChatResult> {
    const base = (cfg.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    const messages = params.messages.map((m) => {
      const out: any = { role: m.role, content: m.content ?? "" };
      if (m.tool_calls) {
        out.tool_calls = m.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        }));
      }
      if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
      if (m.name) out.name = m.name;
      if (m.role === "assistant" && !m.content && m.tool_calls) out.content = null;
      return out;
    });

    const body: any = {
      model: params.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    };
    if (params.tools?.length) {
      body.tools = params.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
      body.parallel_tool_calls = true;
    }
    if (params.temperature !== undefined) body.temperature = params.temperature;
    if (params.maxTokens !== undefined) body.max_tokens = params.maxTokens;

    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: authHeaders(cfg),
      body: JSON.stringify(body),
      signal: params.signal,
    });
    await checkRes(res, `${cfg.name ?? cfg.id} chat`);

    let text = "";
    const tools = new Map<number, AccumTool>();
    const usage = { input: 0, output: 0 };

    for await (const data of sseEvents(res)) {
      if (data === "[DONE]") break;
      let j: any;
      try {
        j = JSON.parse(data);
      } catch {
        continue;
      }
      if (j.usage) {
        usage.input = j.usage.prompt_tokens ?? usage.input;
        usage.output = j.usage.completion_tokens ?? usage.output;
      }
      const choice = j.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta ?? {};
      if (typeof delta.content === "string" && delta.content) {
        text += delta.content;
        onEvent({ type: "text", text: delta.content });
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const i = tc.index ?? 0;
          const acc = tools.get(i) ?? { id: "", name: "", argStr: "" };
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.name += tc.function.name;
          if (tc.function?.arguments) acc.argStr += tc.function.arguments;
          tools.set(i, acc);
        }
      }
    }

    const tool_calls: ToolCall[] = [...tools.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([i, acc]) => {
        let args: Record<string, any> = {};
        try {
          args = acc.argStr ? JSON.parse(acc.argStr) : {};
        } catch {
          args = { __raw: acc.argStr };
        }
        return { id: acc.id || `call_${i}`, name: acc.name, args };
      });

    const message: Msg = { role: "assistant", content: text, ...(tool_calls.length ? { tool_calls } : {}) };
    return { message, usage };
  },

  async listModels(cfg: Provider): Promise<string[]> {
    const base = (cfg.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    const res = await fetch(`${base}/models`, { headers: authHeaders(cfg) });
    await checkRes(res, `${cfg.name ?? cfg.id} model list`);
    const j: any = await res.json();
    const ids = (j.data ?? []).map((m: any) => m.id).filter(Boolean) as string[];
    return ids.sort();
  },
};

// Echo backend — offline test provider, no API key needed.
// Replies "Echo: <your message>". If the user message is `tool:<name> <json>`
// it emits that tool call once (handy for exercising the tool loop in tests).

import type { ChatParams, Msg, Provider, StreamEvent } from "../types.js";
import { estimateTokens } from "../tokens.js";
import type { ChatResult, LLMBackend } from "./base.js";

export const echoBackend: LLMBackend = {
  type: "echo",

  async chat(params: ChatParams, _cfg: Provider, onEvent: (e: StreamEvent) => void): Promise<ChatResult> {
    const last = [...params.messages].reverse().find((m) => m.role === "user" || m.role === "tool");
    const content = last?.content ?? "";
    let message: Msg;

    const toolMatch = last?.role === "user" ? content.match(/^tool:([a-zA-Z_][\w-]*)\s*(.*)$/s) : null;
    if (toolMatch && !params.messages.some((m) => m.role === "tool")) {
      let args: Record<string, any> = {};
      try {
        args = toolMatch[2] ? JSON.parse(toolMatch[2]) : {};
      } catch {
        args = { __raw: toolMatch[2] };
      }
      message = { role: "assistant", content: "", tool_calls: [{ id: "echo_call_1", name: toolMatch[1], args }] };
    } else if (last?.role === "tool") {
      const reply = `Tool returned ${content.length} chars. Done.`;
      for (const word of reply.split(" ")) onEvent({ type: "text", text: word + " " });
      message = { role: "assistant", content: reply };
    } else {
      const reply = `Echo: ${content.slice(0, 200)}`;
      for (const word of reply.split(" ")) onEvent({ type: "text", text: word + " " });
      message = { role: "assistant", content: reply };
    }

    const input = params.messages.reduce((n, m) => n + estimateTokens(m.content ?? ""), 0);
    return { message, usage: { input, output: estimateTokens(message.content ?? "") } };
  },

  async listModels(): Promise<string[]> {
    return ["echo-1"];
  },
};

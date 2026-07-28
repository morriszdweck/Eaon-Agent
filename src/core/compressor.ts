// Two-model context compression.
// The cheap compressor model summarizes everything except the last `keepLast`
// messages; the expensive main model always works on a small context.

import { backendFor, resolveModel } from "../providers/registry.js";
import { estimateMessages, estimateTokens } from "../tokens.js";
import type { Msg } from "../types.js";
import { COMPRESSOR_PROMPT } from "./prompts.js";
import type { Runtime } from "./runtime.js";

export const COMPRESSED_OPEN = "<compressed_context>";
export const COMPRESSED_CLOSE = "</compressed_context>";

function isCompressedMsg(m: Msg): boolean {
  return m.role === "user" && m.content.startsWith(COMPRESSED_OPEN);
}

/** Largest index `cut` such that messages[cut..] is safe to keep verbatim:
 *  starts at a user message and contains no dangling tool-call chain start. */
function safeCut(messages: Msg[], keepLast: number): number {
  let cut = Math.max(1, messages.length - keepLast);
  // walk back to a user message that is not a compressed block
  while (cut > 1 && (messages[cut].role !== "user" || isCompressedMsg(messages[cut]))) cut--;
  return cut;
}

function serializeForCompression(messages: Msg[]): string {
  const out: string[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (isCompressedMsg(m)) {
      out.push(`[previous summary]\n${m.content.slice(COMPRESSED_OPEN.length, m.content.lastIndexOf(COMPRESSED_CLOSE)).trim()}`);
      continue;
    }
    const who = m.role === "tool" ? `tool result` : m.role;
    let body = m.content ?? "";
    if (body.length > 3000) body = body.slice(0, 3000) + " …[truncated]";
    let calls = "";
    if (m.tool_calls?.length) calls = " | calls: " + m.tool_calls.map((tc) => `${tc.name}(${JSON.stringify(tc.args).slice(0, 200)})`).join("; ");
    out.push(`[${who}]${calls}\n${body}`);
  }
  return out.join("\n\n");
}

export interface CompressionResult {
  compressed: boolean;
  removedMessages: number;
  beforeTokens: number;
  afterTokens: number;
}

/** Compress in place if the history exceeds the configured threshold. */
export async function compressIfNeeded(rt: Runtime, messages: Msg[], force = false): Promise<CompressionResult> {
  const cfg = rt.cfg;
  const none: CompressionResult = { compressed: false, removedMessages: 0, beforeTokens: 0, afterTokens: 0 };
  if (!cfg.compression.enabled && !force) return none;
  if (!cfg.compressor) return none;
  const keepLast = Math.max(2, cfg.compression.keepLast);
  const total = estimateMessages(messages);
  if (!force && total < cfg.compression.thresholdTokens) return none;
  const cut = safeCut(messages, keepLast);
  if (cut <= 1) return none; // nothing old enough to compress

  const region = messages.slice(1, cut);
  if (!region.length) return none;
  const beforeTokens = estimateMessages(region);
  if (beforeTokens < 800 && !force) return none; // not worth a call

  let provider, model;
  try {
    ({ provider, model } = resolveModel(cfg, cfg.compressor));
  } catch {
    return none;
  }

  const input = serializeForCompression(region);
  let summary = "";
  try {
    const { message, usage } = await backendFor(provider).chat(
      {
        model,
        messages: [
          { role: "system", content: COMPRESSOR_PROMPT },
          { role: "user", content: input },
        ],
        maxTokens: 2048,
        temperature: 0.2,
      },
      provider,
      () => {},
    );
    summary = message.content.trim();
    rt.session.stats.compressorInput += usage.input;
    rt.session.stats.compressorOutput += usage.output;
  } catch (e: any) {
    rt.hooks.onError?.(`Compression failed (keeping full context): ${e.message}`);
    return none;
  }
  if (!summary) return none;

  const block: Msg = {
    role: "user",
    content: `${COMPRESSED_OPEN}\nEarlier conversation, compressed to save tokens:\n\n${summary}\n${COMPRESSED_CLOSE}`,
  };
  const ack: Msg = { role: "assistant", content: "Understood — continuing from the compressed context above." };
  messages.splice(1, region.length, block, ack);

  const afterTokens = estimateTokens(block.content);
  rt.session.stats.compressionEvents++;
  rt.session.stats.compressedTokens += Math.max(0, beforeTokens - afterTokens);
  rt.hooks.onCompression?.(region.length, beforeTokens, afterTokens);
  return { compressed: true, removedMessages: region.length, beforeTokens, afterTokens };
}

"use strict";

const { translate, TRANSLATION_HEADER } = require("./translator.cjs");
const { loadConfig, writeStatus } = require("./config.cjs");
const { stripJsonReasoning } = require("./request-util.cjs");

/**
 * Core SSE line parser — shared by both Web Streams and Node.js stream modes.
 * Calls writer(dataStr) for each output line (without "data: " prefix).
 */
async function parseSSELines(lines, state, writer, originalFetch, contextMessages) {
  const cfg = loadConfig();

  for (const line of lines) {
    if (!line.startsWith("data: ")) {
      writer(null, line + "\n");
      continue;
    }

    const raw = line.slice(6).trim();
    if (raw === "[DONE]") { writer("data: [DONE]\n\n"); continue; }

    let data;
    try { data = JSON.parse(raw); } catch { writer(null, line + "\n\n"); continue; }

    // ── Anthropic SSE ──
    if (data.type === "content_block_start") {
      state.blockIdx = data.index;
      if (data.content_block?.type === "text") {
        state.accText = ""; state.isThinking = false;
        writer("data: " + JSON.stringify(data) + "\n\n");
      } else if (data.content_block?.type === "thinking") {
        state.accThinking = ""; state.isThinking = true;
        if (!cfg.translate_thinking) writer("data: " + JSON.stringify(data) + "\n\n");
      } else {
        writer("data: " + JSON.stringify(data) + "\n\n");
      }
      continue;
    }

    if (data.type === "content_block_delta") {
      if (data.delta?.type === "text_delta") {
        state.accText += data.delta.text;
      } else if (data.delta?.type === "thinking_delta") {
        if (cfg.translate_thinking) state.accThinking += data.delta.thinking;
        else writer("data: " + JSON.stringify(data) + "\n\n");
      } else {
        writer("data: " + JSON.stringify(data) + "\n\n");
      }
      continue;
    }

    if (data.type === "content_block_stop") {
      if (state.isThinking && cfg.translate_thinking && state.accThinking) {
        const t = await translate(state.accThinking, "fromEn", originalFetch, contextMessages);
        writer("data: " + JSON.stringify({ type: "content_block_start", index: state.blockIdx, content_block: { type: "thinking", thinking: "" } }) + "\n\n");
        writer("data: " + JSON.stringify({ type: "content_block_delta", index: state.blockIdx, delta: { type: "thinking_delta", thinking: t } }) + "\n\n");
        state.accThinking = "";
      }
      if (!state.isThinking && state.accText) {
        const clean = stripJsonReasoning(state.accText);
        if (clean) {
          const t = await translate(clean, "fromEn", originalFetch, contextMessages);
          writeStatus({ output: { original: clean, translated: t } });
          writer("data: " + JSON.stringify({ type: "content_block_delta", index: state.blockIdx, delta: { type: "text_delta", text: t } }) + "\n\n");
        }
        state.accText = "";
      }
      writer("data: " + JSON.stringify(data) + "\n\n");
      state.isThinking = false;
      continue;
    }

    // ── OpenAI SSE ──
    if (data.choices?.[0]) {
      const delta = data.choices[0].delta;
      if (delta?.reasoning_content || delta?.thought) {
        if (cfg.translate_thinking) state.accThinking += (delta.reasoning_content || delta.thought);
        else writer("data: " + JSON.stringify(data) + "\n\n");
        continue;
      }
      if (delta?.content) state.accText += delta.content;
      if (data.choices[0].finish_reason) {
        if (cfg.translate_thinking && state.accThinking) {
          const t = await translate(state.accThinking, "fromEn", originalFetch, contextMessages);
          const fd = { ...data }; fd.choices[0] = { ...fd.choices[0], delta: { reasoning_content: t }, finish_reason: null };
          writer("data: " + JSON.stringify(fd) + "\n\n");
          state.accThinking = "";
        }
        if (state.accText) {
          const clean = stripJsonReasoning(state.accText);
          if (clean) {
            const t = await translate(clean, "fromEn", originalFetch, contextMessages);
            writeStatus({ output: { original: clean, translated: t } });
            const fd = { ...data }; fd.choices[0] = { ...fd.choices[0], delta: { content: t }, finish_reason: null };
            writer("data: " + JSON.stringify(fd) + "\n\n");
          }
          state.accText = "";
        }
        writer("data: " + JSON.stringify(data) + "\n\n");
      }
      continue;
    }

    writer("data: " + JSON.stringify(data) + "\n\n");
  }
}

function newState() {
  return { accText: "", accThinking: "", isThinking: false, blockIdx: 0 };
}

// ── Web Streams API (fetch mode) ──

async function processSSEResponse(response, originalFetch, cache, contextMessages = []) {
  const { ReadableStream } = require("stream/web");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const state = newState();
  let buffer = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n");
          buffer = parts.pop();

          await parseSSELines(
            parts,
            state,
            (formatted, raw) => controller.enqueue(encoder.encode(formatted || raw)),
            originalFetch,
            contextMessages
          );
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    }
  });

  return new Response(stream, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}

// ── Node.js streams (proxy mode) ──

async function processSSEFromStream(proxyRes, clientRes, originalFetch, contextMessages) {
  const headers = { ...proxyRes.headers };
  delete headers["content-length"];
  clientRes.writeHead(proxyRes.statusCode, headers);

  const state = newState();
  let buffer = "";

  for await (const chunk of proxyRes) {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop();

    await parseSSELines(
      lines,
      state,
      (formatted, raw) => clientRes.write(formatted || raw),
      originalFetch,
      contextMessages
    );
  }
  clientRes.end();
}

module.exports = { processSSEResponse, processSSEFromStream };

"use strict";

const { translate, TRANSLATION_HEADER } = require("./translator.cjs");
const { loadConfig, ttyWrite, writeStatus } = require("./config.cjs");

async function processSSEResponse(response, originalFetch, cache, contextMessages = []) {
  const { ReadableStream } = require("stream/web");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const cfg = loadConfig();

  let buffer = "";
  let accumulatedText = "";
  let accumulatedThinking = "";
  let currentBlockIndex = 0;
  let isThinkingBlock = false;

  /**
   * Strip ONLY ```json reasoning blocks (Gemma/Gemini style) from text.
   * Targets: ```json\n{"thought":...}\n``` — does NOT touch python/bash/etc.
   */
  function stripJsonReasoning(text) {
    if (!text) return text;
    return text
      // ```json block WITH closing ``` containing reasoning keys
      .replace(/^```json\s*\n\{[\s\S]*?"(?:thought|title|reasoning|thinking)"\s*:[\s\S]*?\}\s*\n```\s*/gi, "")
      // ```json block WITHOUT closing ``` (up to blank line after })
      .replace(/^```json\s*\n\{[\s\S]*?"(?:thought|title|reasoning|thinking)"\s*:[\s\S]*?\}\s*\n\n/gi, "")
      // Bare JSON at START with reasoning keys (single line)
      .replace(/^\s*\{"(?:thought|title|reasoning|thinking)"\s*:[\s\S]*?\}\s*/gi, "")
      .trim();
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n");
          buffer = parts.pop();

          for (const line of parts) {
            if (line.startsWith("data: ")) {
              const dataStr = line.slice(6).trim();
              if (dataStr === "[DONE]") {
                controller.enqueue(encoder.encode(line + "\n\n"));
                continue;
              }

              try {
                const data = JSON.parse(dataStr);

                // --- Anthropic SSE Format ---
                if (data.type === "content_block_start") {
                    currentBlockIndex = data.index;
                    if (data.content_block?.type === "text") {
                        accumulatedText = "";
                        isThinkingBlock = false;
                        controller.enqueue(encoder.encode(line + "\n\n"));
                    } else if (data.content_block?.type === "thinking") {
                        accumulatedThinking = "";
                        isThinkingBlock = true;
                        if (!cfg.translate_thinking) {
                            controller.enqueue(encoder.encode(line + "\n\n"));
                        }
                    } else {
                        controller.enqueue(encoder.encode(line + "\n\n"));
                    }
                    continue;
                }

                if (data.type === "content_block_delta") {
                    if (data.delta?.type === "text_delta") {
                        accumulatedText += data.delta.text;
                    } else if (data.delta?.type === "thinking_delta") {
                        if (cfg.translate_thinking) {
                            accumulatedThinking += data.delta.thinking;
                        } else {
                            controller.enqueue(encoder.encode(line + "\n\n"));
                        }
                    } else {
                        controller.enqueue(encoder.encode(line + "\n\n"));
                    }
                    continue;
                }

                if (data.type === "content_block_stop") {
                    if (isThinkingBlock && cfg.translate_thinking && accumulatedThinking) {
                        const translatedThinking = await translate(accumulatedThinking, "fromEn", originalFetch, contextMessages);
                        const fakeStart = { type: "content_block_start", index: currentBlockIndex, content_block: { type: "thinking", thinking: "" } };
                        const fakeDelta = {
                            type: "content_block_delta",
                            index: currentBlockIndex,
                            delta: { type: "thinking_delta", thinking: translatedThinking }
                        };
                        controller.enqueue(encoder.encode("data: " + JSON.stringify(fakeStart) + "\n\n"));
                        controller.enqueue(encoder.encode("data: " + JSON.stringify(fakeDelta) + "\n\n"));
                        accumulatedThinking = "";
                    }

                    if (!isThinkingBlock && accumulatedText) {
                        const cleanText = stripJsonReasoning(accumulatedText);
                        if (cleanText) {
                            const translatedText = await translate(cleanText, "fromEn", originalFetch, contextMessages);
                            writeStatus({ output: { original: cleanText, translated: translatedText } });
                            const fakeDelta = {
                                type: "content_block_delta",
                                index: currentBlockIndex,
                                delta: { type: "text_delta", text: translatedText }
                            };
                            controller.enqueue(encoder.encode("data: " + JSON.stringify(fakeDelta) + "\n\n"));
                        }
                        // else: pure reasoning JSON block — skip entirely
                        accumulatedText = "";
                    }
                    controller.enqueue(encoder.encode(line + "\n\n"));
                    isThinkingBlock = false;
                    continue;
                }

                // --- OpenAI SSE Format ---
                if (data.choices && Array.isArray(data.choices)) {
                   const delta = data.choices[0]?.delta;
                   if (delta?.reasoning_content || delta?.thought) {
                       if (cfg.translate_thinking) {
                           accumulatedThinking += (delta.reasoning_content || delta.thought);
                       } else {
                           controller.enqueue(encoder.encode(line + "\n\n"));
                       }
                       continue;
                   }
                   if (delta?.content) {
                       accumulatedText += delta.content;
                   }
                   if (data.choices[0]?.finish_reason) {
                       if (cfg.translate_thinking && accumulatedThinking) {
                           const translatedThinking = await translate(accumulatedThinking, "fromEn", originalFetch, contextMessages);
                           const fakeDelta = { ...data };
                           fakeDelta.choices[0] = { ...fakeDelta.choices[0], delta: { reasoning_content: translatedThinking }, finish_reason: null };
                           controller.enqueue(encoder.encode("data: " + JSON.stringify(fakeDelta) + "\n\n"));
                           accumulatedThinking = "";
                       }

                       if (accumulatedText) {
                           const cleanText = stripJsonReasoning(accumulatedText);
                           if (cleanText) {
                               const translatedText = await translate(cleanText, "fromEn", originalFetch, contextMessages);
                               writeStatus({ output: { original: cleanText, translated: translatedText } });
                               const fakeDelta = { ...data };
                               fakeDelta.choices[0] = { ...fakeDelta.choices[0], delta: { content: translatedText }, finish_reason: null };
                               controller.enqueue(encoder.encode("data: " + JSON.stringify(fakeDelta) + "\n\n"));
                           }
                           // else: pure reasoning JSON block — skip entirely
                           accumulatedText = "";
                       }
                       controller.enqueue(encoder.encode(line + "\n\n"));
                   }
                   continue;
                }

                controller.enqueue(encoder.encode(line + "\n\n"));
              } catch (e) {
                controller.enqueue(encoder.encode(line + "\n\n"));
              }
            } else {
              controller.enqueue(encoder.encode(line + "\n"));
            }
          }
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

module.exports = { processSSEResponse };

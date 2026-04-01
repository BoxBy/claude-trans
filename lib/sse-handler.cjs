"use strict";

const { translate, TRANSLATION_HEADER } = require("./translator.cjs");
const { ttyWrite, writeStatus } = require("./config.cjs");

async function processSSEResponse(response, originalFetch, cache, contextMessages = []) {
  const { ReadableStream } = require("stream/web");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  let buffer = "";
  let accumulatedText = "";
  let currentBlockIndex = 0;

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
                controller.enqueue(encoder.encode(line + "\n"));
                continue;
              }

              try {
                const data = JSON.parse(dataStr);

                // --- Anthropic SSE Format ---
                if (data.type === "content_block_start" && data.content_block?.type === "text") {
                   currentBlockIndex = data.index;
                   accumulatedText = "";
                   controller.enqueue(encoder.encode(line + "\n"));
                }
                else if (data.type === "content_block_delta" && data.delta?.type === "text_delta") {
                   accumulatedText += data.delta.text;
                   // Swallow intermediate chunk
                }
                else if (data.type === "content_block_stop") {
                   if (accumulatedText) {
                       const translatedText = await translate(accumulatedText, "fromEn", originalFetch, contextMessages);
                       writeStatus({ output: { original: accumulatedText, translated: translatedText } });
                       
                       const fakeDelta = {
                           type: "content_block_delta",
                           index: currentBlockIndex,
                           delta: { type: "text_delta", text: translatedText }
                       };
                       controller.enqueue(encoder.encode("data: " + JSON.stringify(fakeDelta) + "\n\n"));
                       accumulatedText = "";
                   }
                   controller.enqueue(encoder.encode(line + "\n"));
                }
                
                // --- OpenAI SSE Format ---
                else if (data.choices && Array.isArray(data.choices)) {
                   if (data.choices[0]?.delta?.content) {
                       accumulatedText += data.choices[0].delta.content;
                   }
                   if (data.choices[0]?.finish_reason) {
                       if (accumulatedText) {
                           const translatedText = await translate(accumulatedText, "fromEn", originalFetch, contextMessages);
                           writeStatus({ output: { original: accumulatedText, translated: translatedText } });
                           
                           const fakeDelta = { ...data };
                           fakeDelta.choices[0] = {
                               ...fakeDelta.choices[0],
                               delta: { content: translatedText },
                               finish_reason: null
                           };
                           controller.enqueue(encoder.encode("data: " + JSON.stringify(fakeDelta) + "\n\n"));
                           accumulatedText = "";
                       }
                       controller.enqueue(encoder.encode(line + "\n"));
                   } else {
                       // Swallow intermediate chunk for OpenAI as well
                   }
                }
                
                // Everything else (message_start, ping, etc) pass through
                else {
                   controller.enqueue(encoder.encode(line + "\n"));
                }
              } catch {
                controller.enqueue(encoder.encode(line + "\n"));
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

"use strict";

const { initialize } = require("./modes/fetch.cjs");

try {
  initialize();
} catch (e) {
  process.stderr.write("[claude-trans] Failed to load translation hook: " + e.message + "\n");
}

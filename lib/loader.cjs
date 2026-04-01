"use strict";

const { initialize } = require("./index.cjs");

try {
  initialize();
} catch (e) {
  process.stderr.write("[claude-trans] Failed to load translation hook: " + e.message + "\n");
}

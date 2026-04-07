#!/usr/bin/env node

import { homedir } from "os";

const tool = process.argv[2] || "query";
const rawDir = process.argv[3] || process.cwd();
const workingDirectory = rawDir.startsWith("~/") ? rawDir.replace("~", homedir()) : rawDir;

console.log(`\n--- smoke-test: ${tool} ---`);
console.log(`workingDirectory: ${workingDirectory}\n`);

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

try {
  if (tool === "query") {
    const { executeQuery } = await import("../dist/tools/query.js");
    const result = await executeQuery({
      prompt: 'Reply with exactly: "pong"',
      workingDirectory,
      timeout: 60_000,
      maxResponseLength: 10,
    });
    console.log("response:", result.response);
    console.log("sessionId:", result.sessionId);
    console.log("costUsd:", result.totalCostUsd);
    console.log("timedOut:", result.timedOut);
    assert(result.response && result.response.length > 0, "query response should be non-empty");
    assert(!result.timedOut, "query should not time out");
  } else if (tool === "structured") {
    const { executeStructured } = await import("../dist/tools/structured.js");
    const result = await executeStructured({
      prompt: "Return pong in the answer field",
      schema: JSON.stringify({
        type: "object",
        properties: { answer: { type: "string" } },
        required: ["answer"],
        additionalProperties: false,
      }),
      workingDirectory,
      timeout: 60_000,
    });
    console.log("response:", result.response);
    console.log("valid:", result.valid);
    console.log("sessionId:", result.sessionId);
    assert(result.valid, "structured response should be valid");
    assert(result.response.includes("{"), "structured response should contain JSON");
  } else if (tool === "review") {
    const { executeReview } = await import("../dist/tools/review.js");
    const result = await executeReview({
      uncommitted: true,
      quick: true,
      workingDirectory,
      timeout: 120_000,
      maxResponseLength: 100,
    });
    console.log("response:", result.response);
    console.log("mode:", result.mode);
    console.log("diffSource:", result.diffSource);
    assert(result.response && result.response.length > 0, "review response should be non-empty");
    assert(result.mode === "quick", "review mode should be quick");
  } else if (tool === "search") {
    const { executeSearch } = await import("../dist/tools/search.js");
    const result = await executeSearch({
      query: "What is the Model Context Protocol?",
      workingDirectory,
      timeout: 120_000,
      maxResponseLength: 100,
    });
    console.log("response:", result.response);
    console.log("sessionId:", result.sessionId);
    assert(result.response && result.response.length > 0, "search response should be non-empty");
  } else if (tool === "ping") {
    const { executePing } = await import("../dist/tools/ping.js");
    const result = await executePing();
    console.log("cliFound:", result.cliFound);
    console.log("version:", result.version);
    console.log("authStatus:", result.authStatus);
    console.log("defaultModel:", result.defaultModel);
    console.log("fallbackModel:", result.fallbackModel);
    console.log("serverVersion:", result.serverVersion);
    assert(result.cliFound, "ping should find CLI");
    assert(result.serverVersion, "ping should report server version");
  } else {
    console.error(`Unknown tool: ${tool}. Use: query, structured, review, search, ping`);
    process.exit(1);
  }

  console.log("\n--- PASS ---");
} catch (e) {
  console.error("\n--- FAIL ---");
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}

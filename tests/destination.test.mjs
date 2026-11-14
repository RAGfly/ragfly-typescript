// `destination` reads a published corpus: the SDK sends it in /v1 wire form (snake_case).
import assert from "node:assert/strict";
import test from "node:test";

import { RAGfly } from "../dist/index.js";

function client(reply, calls) {
  const fetch = async (url, init) => {
    calls.push({ url: new URL(String(url)), init });
    return new Response(JSON.stringify(reply), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return new RAGfly({ apiKey: "rf_test", baseUrl: "https://example.test", fetch });
}

test("search sends destination in wire form", async () => {
  const calls = [];
  await client({ documents: [] }, calls).search({
    query: "board meetings", destination: { module: "regulation", country: "CL", workspaceCode: "W1", areaCode: "A1" },
  });
  assert.equal(calls[0].url.pathname, "/v1/documents/search");
  assert.deepEqual(JSON.parse(calls[0].init.body).destination,
    { module: "regulation", country: "CL", workspace_code: "W1", area_code: "A1" });
});

test("ask sends destination and omits it when absent", async () => {
  const calls = [];
  const sdk = client({ answer: "A", conversation_id: 1 }, calls);
  await sdk.ask({ question: "Which rule applies?", destination: { module: "regulation", country: "CL" } });
  await sdk.ask({ question: "Which rule applies?" });
  assert.deepEqual(JSON.parse(calls[0].init.body).destination, { module: "regulation", country: "CL" });
  assert.equal("destination" in JSON.parse(calls[1].init.body), false);
});

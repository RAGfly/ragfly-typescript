// Shared parity cases: the same calls produce the same /v1 requests in every SDK.
// `tests/parity_cases.json` is a copy of the canonical file in the RAGfly backend
// (`backend/baselines/agent_surface/sdk_parity_cases.json`); the Python SDK runs it too.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { RAGfly, RAGflyError } from "../dist/index.js";

const CASES = JSON.parse(readFileSync(new URL("./parity_cases.json", import.meta.url), "utf8"));
const camel = (name) => name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const camelKeys = (args) => Object.fromEntries(Object.entries(args).map(([k, v]) => [camel(k), v]));

function client(reply, calls) {
  const fetch = async (url, init) => {
    calls.push({ url: new URL(String(url)), init });
    return new Response(JSON.stringify(reply), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return new RAGfly({ apiKey: "rf_test", baseUrl: "https://example.test", fetch });
}

for (const c of CASES.cases) {
  test(`parity ${c.method}`, async () => {
    const calls = [];
    const reply = c.method === "agent_context"
      ? { function_profile: "support_chat", system_prompt: "P", system_prompt_hash: "h", layers: [], tools: [] }
      : {};
    await client(reply, calls)[camel(c.method)](camelKeys(c.args));

    assert.equal(calls.length, 1);
    const [{ url, init }] = calls;
    assert.equal(init.method, c.request.method);
    assert.equal(url.pathname, c.request.path);
    assert.deepEqual(Object.fromEntries(url.searchParams), c.request.query);
    assert.deepEqual(init.body === undefined ? null : JSON.parse(init.body), c.request.body);
    assert.equal(init.headers.Authorization, "Bearer rf_test");
    assert.equal(init.headers[CASES.client_header.name], CASES.client_header.typescript);
  });
}

test("every public method has a parity case", () => {
  const methods = Object.getOwnPropertyNames(RAGfly.prototype).filter((n) => n !== "constructor" && n !== "request");
  const covered = CASES.cases.map((c) => camel(c.method));
  assert.deepEqual([...methods].sort(), [...covered].sort());
});

test("public errors carry code and details", async () => {
  const fetch = async () => new Response(JSON.stringify({
    code: "VALIDATION_ERROR", message: "The request could not be validated.", details: { unknown_fields: ["nombre"] },
  }), { status: 422 });
  const sdk = new RAGfly({ apiKey: "rf_test", baseUrl: "https://example.test", fetch });
  await assert.rejects(sdk.runOperation({ code: "document_types.update", input: { nombre: "x" } }), (err) => {
    assert.ok(err instanceof RAGflyError);
    assert.equal(err.statusCode, 422);
    assert.equal(err.code, "VALIDATION_ERROR");
    assert.deepEqual(err.details, { unknown_fields: ["nombre"] });
    return true;
  });
});

test("search and ask map the English contract", async () => {
  const fetch = async (url) => {
    const body = String(url).includes("/v1/documents/search")
      ? { documents: [{ code: "D1", name: "Contract", max_similarity: 0.8, chunks: [{ text: "clause", page: 2, extra: {} }] }], total_documents: 1, total_chunks: 1 }
      : { conversation_id: 9, answer: "Yes.", citations: [] };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const sdk = new RAGfly({ apiKey: "rf_test", baseUrl: "https://example.test", fetch });
  const result = await sdk.search({ query: "contract" });
  assert.equal(result.documents[0].name, "Contract");
  assert.equal(result.documents[0].chunks[0].text, "clause");
  const answer = await sdk.ask({ question: "Signed?" });
  assert.deepEqual(answer, { answer: "Yes.", conversationId: 9, extra: { citations: [] } });
});

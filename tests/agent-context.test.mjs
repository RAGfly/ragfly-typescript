import assert from "node:assert/strict";
import test from "node:test";

import { RAGfly } from "../dist/index.js";


test("agentContext maps the canonical contract", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({
      function_profile: "chat_soporte",
      system_prompt: "CAPAS",
      system_prompt_hash: "abc",
      layers: [{ code: "PRODUCT", name: "Producto", sha256: "p" }],
      identity: { group: "CAB LTDA" },
      tools: [{
        operation: "LEER_MD",
        public_name: "leer_md",
        input_schema: { type: "object" },
        read_only: true,
      }],
      limits: { max_iterations: 8 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const client = new RAGfly({
    apiKey: "test",
    baseUrl: "https://example.test",
    fetch: fakeFetch,
  });

  const context = await client.agentContext({ functionProfile: "chat_soporte" });

  assert.equal(context.functionProfile, "chat_soporte");
  assert.equal(context.layers[0].code, "PRODUCT");
  assert.equal(context.tools[0].publicName, "leer_md");
  assert.match(calls[0].url, /function_profile=chat_soporte/);
});


test("runAgentTool posts only arguments and functional profile", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response('{"ok":true}', {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const client = new RAGfly({
    apiKey: "test",
    baseUrl: "https://example.test",
    fetch: fakeFetch,
  });

  const result = await client.runAgentTool(
    "leer_md",
    { codigo: "RAGFLY_ROOT" },
    { functionProfile: "chat_soporte" },
  );

  assert.deepEqual(result, { ok: true });
  assert.match(calls[0].url, /\/agent\/tools\/leer_md/);
  assert.match(calls[0].url, /function_profile=chat_soporte/);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    arguments: { codigo: "RAGFLY_ROOT" },
  });
});

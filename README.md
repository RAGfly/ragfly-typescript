# RAGfly TypeScript SDK

Official TypeScript/JavaScript client for [RAGfly](https://ragfly.ai). It speaks the English REST `/v1` contract.

Zero dependencies, native `fetch`. Runs on **Node 18+**, the **browser**, **Vercel Edge** and **Cloudflare Workers**.

## Install

```bash
npm install @ragfly/sdk
```

## Quick start

```ts
import { RAGfly } from "@ragfly/sdk";

const client = new RAGfly({ apiKey: process.env.RAGFLY_API_KEY! });

// RAG end to end
const resp = await client.ask({ question: "What are the Q1 sales figures?" });
console.log(resp.answer);

// Retrieval only
const results = await client.search({ query: "maintenance contracts", limit: 5 });
for (const doc of results.documents) console.log(doc.name, doc.maxSimilarity);
```

Every method takes one options object with `camelCase` keys; the SDK sends the `snake_case` names of the REST contract.

## Operations

Everything the RAGfly application lets your user do is available as an operation, with the same permissions and audit as the web app.

```ts
const { operations } = await client.listOperations();                 // what this key can run
const detail = await client.getOperation({ code: "document_types.update" }); // input_schema / output_schema

await client.runOperation({ code: "document_types.update", input: { code: "TDOC_...", name: "Invoices" } });

// write_confirm operations (deletes, reverts, resets) need confirm: true
const preview = await client.runOperation({ code: "document_types.delete", input: { code: "TDOC_..." } });
// preview.executed === false
await client.runOperation({ code: "document_types.delete", input: { code: "TDOC_..." }, confirm: true });
```

## API keys

Create an API key from [app.ragfly.ai](https://app.ragfly.ai) → API Keys. A key only works on `/v1`; creating or revoking keys needs a signed-in person.

## Methods

| Area | Methods |
|------|---------|
| Session and documents | `session`, `listDocuments`, `getDocument`, `documentEdges`, `search` |
| Working spaces | `listSpaces`, `getSpace`, `refreshSpace`, `promoteSpace`, `composeSpaces`, `readSpace` |
| Queue, catalog, skills | `queue`, `listRuns`, `catalog`, `getFunction`, `listSkills`, `getSkill`, `runSkill` |
| Answers and agents | `ask`, `agentContext`, `runAgentTool` |
| Organization | `getOrganization`, `updateOrganization`, `draftOrganization` |
| Usage, conversations, processes | `getUsage`, `listConversations`, `deleteConversation`, `listProcesses`, `getProcess`, `updateProcess` |
| Operations | `listOperations`, `getOperation`, `runOperation` |

## Options

```ts
new RAGfly({
  apiKey: "rf_...",
  baseUrl: "https://api.ragfly.ai", // default
  timeoutMs: 60000,                 // default
  fetch: customFetch,               // optional, defaults to globalThis.fetch
});
```

## Errors

Every non-2xx response throws `RAGflyError` with `statusCode`, the public `code` (`NOT_FOUND`, `VALIDATION_ERROR`, …) and `details`:

```ts
import { RAGflyError } from "@ragfly/sdk";

try {
  await client.runOperation({ code: "document_types.update", input: {} });
} catch (err) {
  if (err instanceof RAGflyError) console.error(err.statusCode, err.code, err.details);
}
```

> Mirror of the [Python SDK](https://github.com/RAGfly/ragfly-python) (`pip install ragfly`). Both run the same parity cases (`tests/parity_cases.json`).

## Links

- Docs: https://api.ragfly.ai/docs
- Site: https://ragfly.ai

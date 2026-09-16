import { RAGfly } from "@ragfly/sdk";

const client = new RAGfly({ apiKey: process.env.RAGFLY_API_KEY ?? "rf_..." });

// RAG end to end
const resp = await client.ask({ question: "What are the Q1 sales figures?" });
console.log(resp.answer);

// Retrieval only
const results = await client.search({ query: "maintenance contracts", limit: 5 });
for (const doc of results.documents) {
  console.log(doc.name, doc.maxSimilarity);
}

// Operations of the RAGfly application
const { operations } = await client.listOperations();
console.log(operations.slice(0, 5).map((op) => `${op.code} (${op.kind})`));

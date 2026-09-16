# Changelog

## 0.3.0

- Talks only to the English REST `/v1` contract. An API key no longer reaches internal routes, so 0.2.0 stops working with API keys.
- One method per `/v1` route, plus `listOperations`, `getOperation` and `runOperation` for every operation of the RAGfly application. Every method takes one options object.
- English models: `Document { code, name, summary, maxSimilarity, … }`, `Chunk { text, page, extra }`, `SearchResult { totalDocuments, … }`, `AskResponse { answer, conversationId, extra }`.
- `RAGflyError` carries the public `code` and `details`.
- Removed: `ask({ stream: true })` / `askStream` (`/v1/ask` returns the full answer) and the client-side code translator.
- Every request sends `X-RAGfly-Client: sdk-typescript`.

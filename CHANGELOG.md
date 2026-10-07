# Changelog

## 0.4.0 — 2026-10-07

- `ask({ mode: "help" })` answers questions about RAGfly itself (how to use or integrate it), without links to web screens. `mode` is only sent when given.
- `search({ spaceId })` limits a search to one working space.
- New `searchFiltered`, `listDocumentTypes` and `listCharacteristics` for the structured `filter` of `/v1/documents/search`.

## 0.3.0

- Talks only to the English REST `/v1` contract. An API key no longer reaches internal routes, so 0.2.0 stops working with API keys.
- One method per `/v1` route, plus `listOperations`, `getOperation` and `runOperation` for every operation of the RAGfly application. Every method takes one options object.
- English models: `Document { code, name, summary, maxSimilarity, … }`, `Chunk { text, page, extra }`, `SearchResult { totalDocuments, … }`, `AskResponse { answer, conversationId, extra }`.
- `RAGflyError` carries the public `code` and `details`.
- Removed: `ask({ stream: true })` / `askStream` (`/v1/ask` returns the full answer) and the client-side code translator.
- Every request sends `X-RAGfly-Client: sdk-typescript`.

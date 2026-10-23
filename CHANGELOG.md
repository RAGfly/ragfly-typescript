# Changelog

## 0.7.0 — 2026-10-23

- New `unsetActiveWorkspace()`: releases the workspace focus of a flexible key (`DELETE /v1/session/active-workspace`), the same as `setActiveWorkspace({ workspaceCode: null })`. A fixed-workspace key cannot release its workspace. Requires a RAGfly Cloud that serves that route.

## 0.6.1 — 2026-10-13

- Published from GitHub Actions with npm Trusted Publishing (OIDC) and signed provenance; no API changes.

## 0.6.0 — 2026-10-12

Vocabulary update: the credential's entity is now a **workspace** and a working space is now a **collection**. There are no aliases: the old names are removed.

- Renamed: `setActiveEntity` -> `setActiveWorkspace({ workspaceCode })`; `listSpaces` -> `listCollections`; `getSpace` -> `getCollection`; `refreshSpace` -> `refreshCollection`; `promoteSpace` -> `saveCollection`; `composeSpaces` -> `composeCollections`; `readSpace` -> `readCollection`.
- Renamed options: `entityCode` -> `workspaceCode`; `spaceId` -> `collectionId` (also on `search`, `searchFiltered`, `runSkill`); `spaceIdA` / `spaceIdB` -> `collectionIdA` / `collectionIdB`; `spaceType` -> `collectionType` (`TEMPORARY` by default, `SAVED` for a saved collection; formerly `AREA` / `SPACE`); `entityDescription` / `entitySystemPrompt` -> `workspaceDescription` / `workspaceSystemPrompt`.
- REST routes called: `POST /v1/session/active-workspace`, `/v1/collections`, `/v1/collections/{id}`, `/v1/collections/compose`, `/v1/collections/{id}/read`, `/v1/collections/{id}/refresh` and `/v1/collections/{id}/save`.
- Responses keep the server's field names: `active_workspace`, `available_workspaces`, `collections[]`, `collection_id`, `scope` `WORKSPACE`.
- Requires a RAGfly Cloud that serves the new `/v1` vocabulary.

## 0.5.0 — 2026-10-08

- New `setActiveArea({ areaCode })` (pass `null` to release the area focus and keep the entity), `listAreas()` and `listLocations()` with `entityCode`, `parentCode`, `query`, `limit` and `cursor` paging.
- `locationCode` narrows `listDocuments`, `search`, `searchFiltered` and `ask` to one visible folder subtree, for that request only.

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

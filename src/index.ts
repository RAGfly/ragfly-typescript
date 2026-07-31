export { RAGfly } from "./client.js";
export type {
  RAGflyOptions,
  SearchOptions,
  AskOptions,
  AgentContextOptions,
} from "./client.js";
export { RAGflyError } from "./errors.js";
export type {
  Chunk,
  Document,
  SearchResult,
  AskChunk,
  AskResponse,
  AgentContext,
  AgentLayer,
  AgentTool,
} from "./models.js";

export const VERSION = "0.1.1";

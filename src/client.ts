/**
 * RAGfly TypeScript SDK — official client for the English REST `/v1` contract.
 *
 * Mirror of the Python SDK (`ragfly/client.py`). No dependencies: native `fetch`,
 * so it runs on Node 18+, browsers, Vercel Edge and Cloudflare Workers.
 */

import { RAGflyError } from "./errors.js";
import type {
  AgentContext,
  AgentTool,
  AskResponse,
  Document,
  FunctionProfile,
  Json,
  OperationDetail,
  OperationResult,
  OperationSummary,
  SearchResult,
} from "./models.js";

const DEFAULT_BASE_URL = "https://api.ragfly.ai";
const DEFAULT_TIMEOUT_MS = 60_000;
/** Default interface function for `ask()` (sets the conversation's LLM model). */
const DEFAULT_FUNCTION = "CHAT-USER";
export const CLIENT_HEADER = { "X-RAGfly-Client": "sdk-typescript" } as const;

export interface RAGflyOptions {
  /** RAGfly API key (`rf_...`). */
  apiKey: string;
  /** Backend base URL. Default: `https://api.ragfly.ai`. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Default: 60000. */
  timeoutMs?: number;
  /** `fetch` implementation (tests or runtimes without global fetch). */
  fetch?: typeof fetch;
}

type Query = Record<string, string | number | boolean | null | undefined>;
type Body = Record<string, unknown> | undefined;

function segment(value: string | number): string {
  return encodeURIComponent(String(value));
}

function compact(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== null));
}

function toSearchResult(data: Json, query: string): SearchResult {
  const documents: Document[] = ((data.documents as Json[]) ?? []).map((d) => ({
    code: (d.code as string) ?? null,
    name: (d.name as string) ?? null,
    summary: d.summary as string | null,
    location: d.location as string | null,
    url: d.url as string | null,
    rrfScore: d.rrf_score as number | null,
    maxSimilarity: d.max_similarity as number | null,
    rerankScore: d.rerank_score as number | null,
    fs: d.fs as Json | null,
    chunks: ((d.chunks as Json[]) ?? []).map((c) => ({
      text: (c.text as string) ?? "",
      page: c.page as number | null,
      extra: (c.extra as Json) ?? {},
    })),
  }));
  return {
    query,
    totalDocuments: (data.total_documents as number) ?? documents.length,
    totalChunks: (data.total_chunks as number) ?? 0,
    durationMs: data.duration_ms as number | null,
    documents,
  };
}

export class RAGfly {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  /**
   * @example
   * const client = new RAGfly({ apiKey: "rf_..." });
   * console.log((await client.ask({ question: "What were Q1 sales?" })).answer);
   */
  constructor(options: RAGflyOptions) {
    if (!options?.apiKey) {
      throw new RAGflyError("apiKey is required");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const f = options.fetch ?? globalThis.fetch;
    if (typeof f !== "function") {
      throw new RAGflyError("No `fetch` available. Use Node 18+ or pass `fetch` in the options.");
    }
    this.fetchImpl = f.bind(globalThis);
  }

  // ── Transport ──────────────────────────────────────────────────────────────

  private async request<T>(method: string, path: string, query: Query = {}, body?: Body): Promise<T> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) params.set(key, String(value));
    }
    const qs = params.toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let resp: Response;
    try {
      resp = await this.fetchImpl(`${this.baseUrl}${path}${qs ? `?${qs}` : ""}`, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...CLIENT_HEADER,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new RAGflyError(`Timeout after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
    const text = await resp.text();
    if (resp.status >= 400) {
      let payload: Json = {};
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object") payload = parsed as Json;
      } catch {
        // non-JSON error body
      }
      throw new RAGflyError(
        (payload.message as string) || text || `HTTP ${resp.status}`,
        resp.status,
        payload.code as string | undefined,
        payload.details as Json | undefined,
      );
    }
    return (text ? JSON.parse(text) : null) as T;
  }

  // ── Session and documents ──────────────────────────────────────────────────

  session(): Promise<Json> {
    return this.request("GET", "/v1/session");
  }

  /** Set an authorized workspace focus; pass `null` to release it. */
  setActiveWorkspace(opts: { workspaceCode: string | null }): Promise<Json> {
    return this.request("POST", "/v1/session/active-workspace", {}, {
      workspace_code: opts.workspaceCode,
    });
  }

  /** Set an authorized area focus (it also selects its workspace); pass `null` to release it. */
  setActiveArea(opts: { areaCode: string | null }): Promise<Json> {
    return this.request("POST", "/v1/session/active-area", {}, {
      area_code: opts.areaCode,
    });
  }

  /** Visible organizational areas and the cursor of the next page. */
  listAreas(opts: { workspaceCode?: string; parentCode?: string; query?: string; limit?: number; cursor?: string } = {}): Promise<Json> {
    return this.request("GET", "/v1/areas", {
      workspace_code: opts.workspaceCode,
      parent_code: opts.parentCode,
      query: opts.query,
      limit: opts.limit ?? 50,
      cursor: opts.cursor,
    });
  }

  /** Visible document folders and the cursor of the next page. Their codes go in `locationCode`. */
  listLocations(opts: { workspaceCode?: string; parentCode?: string; query?: string; limit?: number; cursor?: string } = {}): Promise<Json> {
    return this.request("GET", "/v1/locations", {
      workspace_code: opts.workspaceCode,
      parent_code: opts.parentCode,
      query: opts.query,
      limit: opts.limit ?? 50,
      cursor: opts.cursor,
    });
  }

  /** List documents. `status` in English, e.g. `VECTORIZED`; `locationCode` keeps one folder subtree. */
  listDocuments(opts: { status?: string; limit?: number; page?: number; locationCode?: string } = {}): Promise<Json> {
    return this.request("GET", "/v1/documents", {
      status: opts.status,
      limit: opts.limit ?? 20,
      page: opts.page ?? 1,
      location_code: opts.locationCode,
    });
  }

  getDocument(opts: { documentCode: string }): Promise<Json> {
    return this.request("GET", `/v1/documents/${segment(opts.documentCode)}`);
  }

  documentEdges(opts: { documentCode: string; neighborLimit?: number }): Promise<Json> {
    return this.request("GET", `/v1/documents/${segment(opts.documentCode)}/edges`, {
      neighbor_limit: opts.neighborLimit ?? 50,
    });
  }

  /**
   * Hybrid semantic search (vector + lexical). `collectionId` limits it to one collection; `locationCode`
   * to one visible folder subtree, for this request only.
   */
  async search(opts: {
    query: string; limit?: number; minSimilarity?: number; workspaceCode?: string; collectionId?: number; locationCode?: string;
  }): Promise<SearchResult> {
    const data = (await this.request<Json>("POST", "/v1/documents/search", {}, compact({
      query: opts.query,
      limit: opts.limit ?? 10,
      min_similarity: opts.minSimilarity ?? 0,
      workspace_code: opts.workspaceCode,
      collection_id: opts.collectionId,
      location_code: opts.locationCode,
    }))) ?? {};
    return toSearchResult(data, opts.query);
  }

  /**
   * Search with a structured `filter` (`document_types`, `attributes`, `characteristics`). The catalog
   * codes the filter accepts come from `listDocumentTypes` and `listCharacteristics`.
   */
  async searchFiltered(opts: {
    query: string; filter: Json; limit?: number; minSimilarity?: number; workspaceCode?: string; collectionId?: number;
    locationCode?: string;
  }): Promise<SearchResult> {
    const data = (await this.request<Json>("POST", "/v1/documents/search", {}, compact({
      query: opts.query,
      filter: opts.filter,
      limit: opts.limit,
      min_similarity: opts.minSimilarity,
      workspace_code: opts.workspaceCode,
      collection_id: opts.collectionId,
      location_code: opts.locationCode,
    }))) ?? {};
    return toSearchResult(data, opts.query);
  }

  // ── Collections ─────────────────────────────────────────────────────────

  listCollections(opts: { limit?: number } = {}): Promise<Json> {
    return this.request("GET", "/v1/collections", { limit: opts.limit ?? 20 });
  }

  getCollection(opts: { collectionId: number; documentLimit?: number }): Promise<Json> {
    return this.request("GET", `/v1/collections/${segment(opts.collectionId)}`, { document_limit: opts.documentLimit ?? 20 });
  }

  refreshCollection(opts: { collectionId: number }): Promise<Json> {
    return this.request("POST", `/v1/collections/${segment(opts.collectionId)}/refresh`);
  }

  saveCollection(opts: { collectionId: number }): Promise<Json> {
    return this.request("POST", `/v1/collections/${segment(opts.collectionId)}/save`);
  }

  /** `operation`: union, intersection, difference or symmetric_difference. */
  composeCollections(opts: { operation: string; collectionIdA: number; collectionIdB: number; name?: string; collectionType?: string }): Promise<Json> {
    return this.request("POST", "/v1/collections/compose", {}, {
      operation: opts.operation,
      collection_id_a: opts.collectionIdA,
      collection_id_b: opts.collectionIdB,
      name: opts.name ?? "",
      collection_type: opts.collectionType ?? "TEMPORARY",
    });
  }

  /** `resolution`: count, manifest, chunks or text. */
  readCollection(opts: { collectionId: number; resolution?: string; query?: string; limit?: number }): Promise<Json> {
    return this.request("POST", `/v1/collections/${segment(opts.collectionId)}/read`, {}, {
      resolution: opts.resolution ?? "manifest",
      query: opts.query ?? "",
      limit: opts.limit ?? 50,
    });
  }

  // ── Queue, catalog and skills ──────────────────────────────────────────────

  queue(opts: { process?: string; status?: string; limit?: number } = {}): Promise<Json> {
    return this.request("GET", "/v1/queue", { process: opts.process, status: opts.status, limit: opts.limit ?? 20 });
  }

  listRuns(opts: { limit?: number } = {}): Promise<Json> {
    return this.request("GET", "/v1/runs", { limit: opts.limit ?? 10 });
  }

  /** `type`: ALL, FUNCTIONS or SKILLS. */
  catalog(opts: { type?: string } = {}): Promise<Json> {
    return this.request("GET", "/v1/catalog", { type: opts.type ?? "ALL" });
  }

  /** Document types of the workspace as a tree. Their codes go in `filter.document_types`. */
  listDocumentTypes(opts: { workspaceCode?: string } = {}): Promise<Json> {
    return this.request<Json>("GET", "/v1/catalog/document-types", { workspace_code: opts.workspaceCode });
  }

  /** Characteristics available for those types (each includes its more specific types). */
  listCharacteristics(opts: { documentTypes?: string[]; workspaceCode?: string } = {}): Promise<Json> {
    return this.request<Json>("GET", "/v1/catalog/characteristics", {
      document_types: opts.documentTypes?.length ? opts.documentTypes.join(",") : undefined,
      workspace_code: opts.workspaceCode,
    });
  }

  /** A function (screen) with its behaviors and the operations it allows. */
  getFunction(opts: { functionCode: string }): Promise<Json> {
    return this.request("GET", `/v1/functions/${segment(opts.functionCode)}`);
  }

  listSkills(): Promise<Json> {
    return this.request("GET", "/v1/skills");
  }

  getSkill(opts: { skillCode: string }): Promise<Json> {
    return this.request("GET", `/v1/skills/${segment(opts.skillCode)}`);
  }

  runSkill(opts: { skillCode: string; collectionId?: number; documentCode?: string }): Promise<Json> {
    return this.request("POST", `/v1/skills/${segment(opts.skillCode)}/run`, {}, compact({
      collection_id: opts.collectionId,
      document_code: opts.documentCode,
    }));
  }

  // ── Answers and agents ─────────────────────────────────────────────────────

  /**
   * RAG end to end: retrieve and generate. Reuse `conversationId` to continue. `mode: "help"`
   * answers questions about RAGfly itself (how to use or integrate it) instead of searching your
   * documents, without links to web screens. Left unset the call is the usual document answer.
   * `locationCode` narrows only this request to one visible folder subtree.
   */
  async ask(opts: {
    question: string; conversationId?: number; functionCode?: string; locationCode?: string; mode?: "default" | "help";
  }): Promise<AskResponse> {
    if (opts.mode !== undefined && opts.mode !== "default" && opts.mode !== "help") {
      throw new TypeError("mode must be 'default' or 'help'");
    }
    const data = (await this.request<Json>("POST", "/v1/ask", {}, compact({
      question: opts.question,
      conversation_id: opts.conversationId,
      function_code: opts.functionCode ?? DEFAULT_FUNCTION,
      location_code: opts.locationCode,
      mode: opts.mode,
    }))) ?? {};
    const { answer, conversation_id, ...extra } = data;
    return { answer: (answer as string) ?? "", conversationId: (conversation_id as number) ?? null, extra };
  }

  /** The authenticated prompt, identity and tools for an agent. */
  async agentContext(opts: { functionProfile?: FunctionProfile } = {}): Promise<AgentContext> {
    const data = await this.request<Json>("GET", "/v1/agent/context", {
      function_profile: opts.functionProfile ?? "user_chat",
    });
    return {
      functionProfile: data.function_profile as FunctionProfile,
      systemPrompt: data.system_prompt as string,
      systemPromptHash: data.system_prompt_hash as string,
      layers: (data.layers as AgentContext["layers"]) ?? [],
      identity: (data.identity as Json) ?? {},
      tools: ((data.tools as Json[]) ?? []).map((tool): AgentTool => ({
        operation: tool.operation as string,
        publicName: tool.public_name as string,
        inputSchema: (tool.input_schema as Json) ?? {},
        readOnly: Boolean(tool.read_only),
      })),
      limits: (data.limits as Record<string, number>) ?? {},
    };
  }

  /** Run one tool authorized by `agentContext`. */
  runAgentTool(opts: { publicName: string; arguments: Json; functionProfile?: FunctionProfile }): Promise<unknown> {
    return this.request("POST", `/v1/agent/tools/${segment(opts.publicName)}`, {}, {
      arguments: opts.arguments,
      function_profile: opts.functionProfile ?? "user_chat",
    });
  }

  // ── Organization profile ───────────────────────────────────────────────────

  getOrganization(opts: { workspaceCode?: string } = {}): Promise<Json> {
    return this.request("GET", "/v1/organization", { workspace_code: opts.workspaceCode });
  }

  /** Only the fields you pass are written. */
  updateOrganization(opts: {
    groupDescription?: string;
    groupSystemPrompt?: string;
    workspaceDescription?: string;
    workspaceSystemPrompt?: string;
    workspaceCode?: string;
  }): Promise<Json> {
    return this.request("PUT", "/v1/organization", {}, compact({
      group_description: opts.groupDescription,
      group_system_prompt: opts.groupSystemPrompt,
      workspace_description: opts.workspaceDescription,
      workspace_system_prompt: opts.workspaceSystemPrompt,
      workspace_code: opts.workspaceCode,
    }));
  }

  draftOrganization(opts: { sourceText?: string; workspaceCode?: string } = {}): Promise<Json> {
    return this.request("POST", "/v1/organization/draft", {}, compact({
      source_text: opts.sourceText ?? "",
      workspace_code: opts.workspaceCode,
    }));
  }

  // ── Usage, conversations and processes ─────────────────────────────────────

  getUsage(): Promise<Json> {
    return this.request("GET", "/v1/usage");
  }

  listConversations(opts: { functionCode?: string; limit?: number } = {}): Promise<Json> {
    return this.request("GET", "/v1/conversations", { function_code: opts.functionCode, limit: opts.limit ?? 50 });
  }

  deleteConversation(opts: { conversationId: number }): Promise<unknown> {
    return this.request("DELETE", `/v1/conversations/${segment(opts.conversationId)}`);
  }

  listProcesses(opts: {
    status?: string;
    processType?: string;
    category?: string;
    mine?: boolean;
    onlyOpen?: boolean;
    limit?: number;
    page?: number;
  } = {}): Promise<Json> {
    return this.request("GET", "/v1/processes", {
      status: opts.status,
      process_type: opts.processType,
      category: opts.category,
      mine: opts.mine,
      only_open: opts.onlyOpen,
      limit: opts.limit ?? 20,
      page: opts.page ?? 1,
    });
  }

  getProcess(opts: { processCode: string }): Promise<Json> {
    return this.request("GET", `/v1/processes/${segment(opts.processCode)}`);
  }

  /** Only the fields you pass are written. */
  updateProcess(opts: {
    processCode: string;
    status?: string;
    priority?: string;
    name?: string;
    description?: string;
    comments?: string;
    assignedTo?: string;
    dueAt?: string;
    finishedAt?: string;
    cost?: number;
  }): Promise<Json> {
    return this.request("PATCH", `/v1/processes/${segment(opts.processCode)}`, {}, compact({
      status: opts.status,
      priority: opts.priority,
      name: opts.name,
      description: opts.description,
      comments: opts.comments,
      assigned_to: opts.assignedTo,
      due_at: opts.dueAt,
      finished_at: opts.finishedAt,
      cost: opts.cost,
    }));
  }

  // ── Generic operations ─────────────────────────────────────────────────────

  /** Operations this credential can run: code, kind and confirm_required. */
  listOperations(): Promise<{ operations: OperationSummary[]; total: number }> {
    return this.request("GET", "/v1/operations");
  }

  /** One operation with its `input_schema` and `output_schema`. */
  getOperation(opts: { code: string }): Promise<OperationDetail> {
    return this.request("GET", `/v1/operations/${segment(opts.code)}`);
  }

  /**
   * Run an operation. A `write_confirm` operation only runs with `confirm: true`;
   * without it the result is `{ executed: false, preview }`.
   */
  runOperation(opts: { code: string; input?: Json; confirm?: boolean }): Promise<OperationResult> {
    return this.request("POST", `/v1/operations/${segment(opts.code)}:execute`, {}, {
      input: opts.input ?? {},
      confirm: Boolean(opts.confirm),
    });
  }
}

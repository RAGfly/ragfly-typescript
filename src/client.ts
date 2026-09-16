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

  /** List documents. `status` in English, e.g. `VECTORIZED`. */
  listDocuments(opts: { status?: string; limit?: number; page?: number } = {}): Promise<Json> {
    return this.request("GET", "/v1/documents", { status: opts.status, limit: opts.limit ?? 20, page: opts.page ?? 1 });
  }

  getDocument(opts: { documentCode: string }): Promise<Json> {
    return this.request("GET", `/v1/documents/${segment(opts.documentCode)}`);
  }

  documentEdges(opts: { documentCode: string; neighborLimit?: number }): Promise<Json> {
    return this.request("GET", `/v1/documents/${segment(opts.documentCode)}/edges`, {
      neighbor_limit: opts.neighborLimit ?? 50,
    });
  }

  /** Hybrid semantic search (vector + lexical). */
  async search(opts: { query: string; limit?: number; minSimilarity?: number; entityCode?: string }): Promise<SearchResult> {
    const data = (await this.request<Json>("POST", "/v1/documents/search", {}, compact({
      query: opts.query,
      limit: opts.limit ?? 10,
      min_similarity: opts.minSimilarity ?? 0,
      entity_code: opts.entityCode,
    }))) ?? {};
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
      query: opts.query,
      totalDocuments: (data.total_documents as number) ?? documents.length,
      totalChunks: (data.total_chunks as number) ?? 0,
      durationMs: data.duration_ms as number | null,
      documents,
    };
  }

  // ── Working spaces ─────────────────────────────────────────────────────────

  listSpaces(opts: { limit?: number } = {}): Promise<Json> {
    return this.request("GET", "/v1/spaces", { limit: opts.limit ?? 20 });
  }

  getSpace(opts: { spaceId: number; documentLimit?: number }): Promise<Json> {
    return this.request("GET", `/v1/spaces/${segment(opts.spaceId)}`, { document_limit: opts.documentLimit ?? 20 });
  }

  refreshSpace(opts: { spaceId: number }): Promise<Json> {
    return this.request("POST", `/v1/spaces/${segment(opts.spaceId)}/refresh`);
  }

  promoteSpace(opts: { spaceId: number }): Promise<Json> {
    return this.request("POST", `/v1/spaces/${segment(opts.spaceId)}/promote`);
  }

  /** `operation`: union, intersection, difference or symmetric_difference. */
  composeSpaces(opts: { operation: string; spaceIdA: number; spaceIdB: number; name?: string; spaceType?: string }): Promise<Json> {
    return this.request("POST", "/v1/spaces/compose", {}, {
      operation: opts.operation,
      space_id_a: opts.spaceIdA,
      space_id_b: opts.spaceIdB,
      name: opts.name ?? "",
      space_type: opts.spaceType ?? "AREA",
    });
  }

  /** `resolution`: count, manifest, chunks or text. */
  readSpace(opts: { spaceId: number; resolution?: string; query?: string; limit?: number }): Promise<Json> {
    return this.request("POST", `/v1/spaces/${segment(opts.spaceId)}/read`, {}, {
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

  runSkill(opts: { skillCode: string; spaceId?: number; documentCode?: string }): Promise<Json> {
    return this.request("POST", `/v1/skills/${segment(opts.skillCode)}/run`, {}, compact({
      space_id: opts.spaceId,
      document_code: opts.documentCode,
    }));
  }

  // ── Answers and agents ─────────────────────────────────────────────────────

  /** RAG end to end: retrieve and generate. Reuse `conversationId` to continue. */
  async ask(opts: { question: string; conversationId?: number; functionCode?: string }): Promise<AskResponse> {
    const data = (await this.request<Json>("POST", "/v1/ask", {}, compact({
      question: opts.question,
      conversation_id: opts.conversationId,
      function_code: opts.functionCode ?? DEFAULT_FUNCTION,
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

  getOrganization(opts: { entityCode?: string } = {}): Promise<Json> {
    return this.request("GET", "/v1/organization", { entity_code: opts.entityCode });
  }

  /** Only the fields you pass are written. */
  updateOrganization(opts: {
    groupDescription?: string;
    groupSystemPrompt?: string;
    entityDescription?: string;
    entitySystemPrompt?: string;
    entityCode?: string;
  }): Promise<Json> {
    return this.request("PUT", "/v1/organization", {}, compact({
      group_description: opts.groupDescription,
      group_system_prompt: opts.groupSystemPrompt,
      entity_description: opts.entityDescription,
      entity_system_prompt: opts.entitySystemPrompt,
      entity_code: opts.entityCode,
    }));
  }

  draftOrganization(opts: { sourceText?: string; entityCode?: string } = {}): Promise<Json> {
    return this.request("POST", "/v1/organization/draft", {}, compact({
      source_text: opts.sourceText ?? "",
      entity_code: opts.entityCode,
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

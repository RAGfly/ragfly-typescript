/**
 * RAGfly TypeScript SDK — cliente oficial.
 *
 * Espejo en TypeScript del SDK Python (`ragfly/client.py`). Wrapper HTTP delgado
 * sobre la API REST + SSE de RAGfly. Sin dependencias: usa `fetch` nativo, por lo
 * que corre en Node 18+, navegador, Vercel Edge y Cloudflare Workers.
 */

import { CodeTranslator } from "./codes.js";
import { RAGflyError } from "./errors.js";
import type {
  AgentContext,
  AskChunk,
  AskResponse,
  Chunk,
  Document,
  SearchResult,
} from "./models.js";

const DEFAULT_BASE_URL = "https://api.ragfly.ai";
const DEFAULT_TIMEOUT_MS = 60_000;
/**
 * Default interface function for `ask()` (sets the conversation's LLM model).
 * English public code; the SDK translates it to the internal code on the wire.
 */
const DEFAULT_FUNCION = "CHAT-USER";

export interface RAGflyOptions {
  /** API key de RAGfly (formato `slm_live_...`). Generala en app.ragfly.ai → Settings → API Keys. */
  apiKey: string;
  /** URL base del backend. Default: `https://api.ragfly.ai`. */
  baseUrl?: string;
  /** Timeout en milisegundos por request. Default: 60000. */
  timeoutMs?: number;
  /** `fetch` a usar (para tests o runtimes sin fetch global). Default: `globalThis.fetch`. */
  fetch?: typeof fetch;
}

export interface SearchOptions {
  limit?: number;
  minSimilitud?: number;
  codigoEntidad?: string;
  idEspacio?: number;
}

export interface AskOptions {
  conversationId?: number;
  stream?: boolean;
  /**
   * Interface-function code that sets the conversation's LLM model.
   * Default: `CHAT-USER` (the "Chat with your documents" function). Only used when
   * creating a new conversation (i.e. when `conversationId` is not given).
   */
  codigoFuncion?: string;
}
export interface AgentContextOptions {
  functionProfile?: "chat_usuario" | "chat_soporte";
}


export class RAGfly {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  /** Public-code translator: English on the SDK surface, internal on the wire. */
  private readonly codes: CodeTranslator;

  /**
   * @example
   * const client = new RAGfly({ apiKey: "slm_live_..." });
   * const resp = await client.ask("What were Q1 sales?");
   * console.log(resp.answer);
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
      throw new RAGflyError(
        "No `fetch` available. Use Node 18+ or pass `fetch` in the options.",
      );
    }
    this.fetchImpl = f.bind(globalThis);
    this.codes = new CodeTranslator(() => this.fetchCodeMap());
  }

  /**
   * Fetch the public-code map (internal → English) from the backend. Used by the
   * code translator; the map is cached after the first call.
   */
  private async fetchCodeMap(): Promise<Record<string, Record<string, string>>> {
    const resp = await this.doFetch(
      "/catalogo/public-codes?domains=status,doc_type,function",
      { method: "GET" },
    );
    await this.raiseForStatus(resp);
    const data = (await resp.json()) as { domains?: Record<string, Record<string, string>> };
    return data.domains ?? {};
  }

  // ── Internos ───────────────────────────────────────────────────────────────

  private url(path: string): string {
    return `${this.baseUrl}/${path.replace(/^\/+/, "")}`;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * `fetch` con timeout. El timer se cancela en cuanto llegan los headers de
   * respuesta, de modo que la lectura del body en streaming no se aborta.
   *
   * Nota (h.218): la API `fetch` no expone un connect-timeout separado (a
   * diferencia de httpx en el SDK Python). Este timer único acota
   * conexión + tiempo-hasta-headers, que es el equivalente práctico; separar
   * ambas fases requeriría bajar a la API de sockets de cada runtime.
   */
  private async doFetch(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(this.url(path), {
        ...init,
        signal: controller.signal,
        headers: { ...this.headers(), ...(init.headers ?? {}) },
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new RAGflyError(`Timeout tras ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private async raiseForStatus(resp: Response): Promise<void> {
    if (resp.status < 400) return;
    let detail: string;
    try {
      const data = (await resp.clone().json()) as { detail?: string };
      detail = data?.detail ?? JSON.stringify(data);
    } catch {
      detail = await resp.text().catch(() => resp.statusText);
    }
    throw new RAGflyError(detail, resp.status);
  }

  /** Create a new conversation and return its id. */
  private async getOrCreateConversation(codigoFuncion: string): Promise<number> {
    const codigoInterno = await this.codes.toInternal("function", codigoFuncion);
    const resp = await this.doFetch("/interfaz/conversaciones", {
      method: "POST",
      body: JSON.stringify({ titulo: "SDK", codigo_funcion: codigoInterno }),
    });
    await this.raiseForStatus(resp);
    const data = (await resp.json()) as { id_conversacion: number };
    return data.id_conversacion;
  }

  // ── API pública ──────────────────────────────────────────────────────────

  /** Return the authenticated prompt, identity and tools for an agent. */
  async agentContext(options: AgentContextOptions = {}): Promise<AgentContext> {
    const profile = options.functionProfile ?? "chat_usuario";
    const resp = await this.doFetch(
      `/agent/context?function_profile=${encodeURIComponent(profile)}`,
      { method: "GET" },
    );
    await this.raiseForStatus(resp);
    const data = (await resp.json()) as any;
    return {
      functionProfile: data.function_profile,
      systemPrompt: data.system_prompt,
      systemPromptHash: data.system_prompt_hash,
      layers: data.layers ?? [],
      identity: data.identity ?? {},
      tools: (data.tools ?? []).map((tool: any) => ({
        operation: tool.operation,
        publicName: tool.public_name,
        inputSchema: tool.input_schema ?? {},
        readOnly: tool.read_only !== false,
      })),
      limits: data.limits ?? {},
    };
  }

  /** Run one operation authorized by `agentContext()`. */
  async runAgentTool(
    publicName: string,
    args: Record<string, unknown>,
    options: AgentContextOptions = {},
  ): Promise<Record<string, unknown>> {
    const profile = options.functionProfile ?? "chat_usuario";
    const path = `/agent/tools/${encodeURIComponent(publicName)}` +
      `?function_profile=${encodeURIComponent(profile)}`;
    const resp = await this.doFetch(path, {
      method: "POST",
      body: JSON.stringify({ arguments: args }),
    });
    await this.raiseForStatus(resp);
    return (await resp.json()) as Record<string, unknown>;
  }

  /**
   * Hybrid semantic search (vector + lexical + rerank).
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult> {
    const payload: Record<string, unknown> = {
      q: query,
      limit: options.limit ?? 10,
      min_similitud: options.minSimilitud ?? 0.0,
    };
    if (options.codigoEntidad) payload.codigo_entidad = options.codigoEntidad;
    if (options.idEspacio) payload.id_espacio = options.idEspacio;

    const resp = await this.doFetch("/documentos/buscar-semantico", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await this.raiseForStatus(resp);
    const data = (await resp.json()) as Record<string, any>;

    const documents: Document[] = (data.resultados ?? []).map((d: any) => {
      const chunks: Chunk[] = (d.chunks ?? []).map((c: any) => {
        // La API expone el nº de página como `nro_pagina` (no `pagina`).
        const { texto, similitud, score_rerank, nro_pagina, ...rest } = c;
        return {
          texto: texto ?? "",
          similitud: similitud ?? null,
          scoreRerank: score_rerank ?? null,
          pagina: nro_pagina ?? null,
          extra: rest,
        };
      });
      return {
        codigo: d.codigo_documento,
        nombre: d.nombre_documento,
        resumen: d.resumen_documento ?? null,
        url: d.url ?? null,
        rrfScore: d.rrf_score ?? null,
        similitudMax: d.similitud_max ?? null,
        chunks,
      };
    });

    return {
      query: data.q,
      totalDocumentos: data.total_documentos,
      totalChunks: data.total_chunks,
      duracionMs: data.duracion_ms ?? null,
      documents,
    };
  }

  /**
   * Pregunta al RAG con respuesta completa.
   *
   * Para streaming token a token, usá {@link askStream} o `ask(q, { stream: true })`.
   */
  ask(question: string, options?: { conversationId?: number; codigoFuncion?: string; stream?: false }): Promise<AskResponse>;
  ask(question: string, options: { conversationId?: number; codigoFuncion?: string; stream: true }): AsyncGenerator<AskChunk>;
  ask(
    question: string,
    options: AskOptions = {},
  ): Promise<AskResponse> | AsyncGenerator<AskChunk> {
    if (options.stream) {
      return this.askStream(question, options.conversationId, options.codigoFuncion);
    }
    return this.askSync(question, options.conversationId, options.codigoFuncion);
  }

  /** Pregunta al RAG y emite los tokens de la respuesta a medida que llegan (SSE). */
  async *askStream(
    question: string,
    conversationId?: number,
    codigoFuncion: string = DEFAULT_FUNCION,
  ): AsyncGenerator<AskChunk> {
    const convId = conversationId ?? (await this.getOrCreateConversation(codigoFuncion));
    const resp = await this.doFetch(
      `/interfaz/conversaciones/${convId}/mensajes/stream`,
      { method: "POST", body: JSON.stringify({ contenido: question }) },
    );
    await this.raiseForStatus(resp);
    if (!resp.body) {
      throw new RAGflyError("La respuesta de streaming no tiene body");
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let recibioDone = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).replace(/\r$/, "");
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith("data: ")) continue;
          let payload: any;
          try {
            payload = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (payload.error) throw new RAGflyError(payload.error);
          if (payload.done) {
            recibioDone = true;
            return;
          }
          if (typeof payload.text === "string") {
            yield { delta: payload.text };
          }
        }
      }
      // El stream cerró sin el evento `done` final: respuesta truncada
      // (corte de red, timeout del proxy). No tratar la respuesta parcial
      // como completa — propagar como error.
      if (!recibioDone) {
        throw new RAGflyError(
          "El stream de respuesta se cortó antes de terminar " +
            "(sin evento 'done'); la respuesta puede estar incompleta.",
        );
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async askSync(
    question: string,
    conversationId?: number,
    codigoFuncion: string = DEFAULT_FUNCION,
  ): Promise<AskResponse> {
    const convId = conversationId ?? (await this.getOrCreateConversation(codigoFuncion));
    const parts: string[] = [];
    for await (const chunk of this.askStream(question, convId)) {
      parts.push(chunk.delta);
    }
    return { answer: parts.join(""), conversationId: convId, messageId: null };
  }

  /**
   * List documents in the corpus with pagination.
   *
   * `status` filters by processing state in English — e.g. `VECTORIZED`, `SCANNED`,
   * `CHUNKED`, `LOADED`. Use `VECTORIZED` to list only searchable documents.
   * `estado` is a deprecated Spanish alias of `status` (kept for compatibility).
   */
  async listDocuments(
    options: { page?: number; pageSize?: number; status?: string; estado?: string } = {},
  ): Promise<Record<string, unknown>> {
    // The REST API (GET /documentos/paginado) speaks internal codes; translate the
    // English public state on the way in and the returned codes on the way out.
    const status = options.status ?? options.estado;
    const params = new URLSearchParams();
    params.set("page", String(options.page ?? 1));
    params.set("limit", String(options.pageSize ?? 20));
    if (status) {
      const interno = await this.codes.toInternal("status", status);
      if (interno) params.set("codigo_estado_doc", interno);
    }

    const resp = await this.doFetch(`/documentos/paginado?${params.toString()}`, {
      method: "GET",
    });
    await this.raiseForStatus(resp);
    const data = (await resp.json()) as Record<string, any>;
    return this.translateDocuments(data);
  }

  /**
   * Translate internal catalog codes to their English public alias in a documents
   * response (state + document type of every row).
   */
  private async translateDocuments(data: Record<string, any>): Promise<Record<string, unknown>> {
    if (!data || typeof data !== "object") return data;
    const rows = (data.items ?? data.documentos ?? data.resultados) as any[] | undefined;
    for (const doc of rows ?? []) {
      if (!doc || typeof doc !== "object") continue;
      if (doc.codigo_estado_doc) {
        doc.codigo_estado_doc = await this.codes.toEnglish("status", doc.codigo_estado_doc);
      }
      if (doc.codigo_tipo_documento) {
        doc.codigo_tipo_documento = await this.codes.toEnglish("doc_type", doc.codigo_tipo_documento);
      }
    }
    return data;
  }
}

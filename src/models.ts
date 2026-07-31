/**
 * Modelos de respuesta del SDK de RAGfly.
 *
 * Espejo en TypeScript de los dataclasses del SDK Python (`ragfly/models.py`).
 * Los nombres se exponen en `camelCase` (idioma TS); el mapeo a los campos
 * `snake_case` del backend ocurre dentro del cliente.
 */

/** Un fragmento (chunk) relevante recuperado de un documento. */
export interface Chunk {
  texto: string;
  similitud?: number | null;
  scoreRerank?: number | null;
  pagina?: number | null;
  /** Campos adicionales devueltos por el backend que no están tipados arriba. */
  extra: Record<string, unknown>;
}

/** Un documento del corpus con sus chunks relevantes. */
export interface Document {
  codigo: string;
  nombre: string;
  resumen?: string | null;
  url?: string | null;
  rrfScore?: number | null;
  similitudMax?: number | null;
  chunks: Chunk[];
}

/** Resultado de una búsqueda semántica híbrida. */
export interface SearchResult {
  query: string;
  totalDocumentos: number;
  totalChunks: number;
  duracionMs?: number | null;
  documents: Document[];
}

/** Un token/fragmento del stream de respuesta (`ask` con `stream: true`). */
export interface AskChunk {
  delta: string;
}

/** Respuesta completa (no-streaming) de `ask`. */
export interface AskResponse {
  answer: string;
  conversationId: number;
  messageId?: number | null;
}

export interface AgentLayer {
  code: string;
  name: string;
  sha256: string;
}

export interface AgentTool {
  operation: string;
  publicName: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
}

export interface AgentContext {
  functionProfile: "chat_usuario" | "chat_soporte";
  systemPrompt: string;
  systemPromptHash: string;
  layers: AgentLayer[];
  identity: Record<string, unknown>;
  tools: AgentTool[];
  limits: Record<string, number>;
}

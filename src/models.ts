/** Response models of the RAGfly SDK (mirror of the Python SDK `ragfly/models.py`). */

export type Json = Record<string, unknown>;

export interface Chunk {
  text: string;
  page?: number | null;
  extra: Json;
}

export interface Document {
  code: string | null;
  name: string | null;
  summary?: string | null;
  location?: string | null;
  url?: string | null;
  rrfScore?: number | null;
  maxSimilarity?: number | null;
  rerankScore?: number | null;
  /** How to open the original file (see `fs.how_to_open`). */
  fs?: Json | null;
  chunks: Chunk[];
}

export interface SearchResult {
  query: string;
  totalDocuments: number;
  totalChunks: number;
  durationMs?: number | null;
  documents: Document[];
}

export interface AskResponse {
  answer: string;
  conversationId: number | null;
  /** Remaining fields of the answer (citations, usage, message id…). */
  extra: Json;
}

export interface AgentLayer {
  code: string;
  name: string;
  sha256: string;
}

export interface AgentTool {
  operation: string;
  publicName: string;
  inputSchema: Json;
  readOnly: boolean;
}

export type FunctionProfile = "user_chat" | "support_chat";

export interface AgentContext {
  functionProfile: FunctionProfile;
  systemPrompt: string;
  systemPromptHash: string;
  layers: AgentLayer[];
  identity: Json;
  tools: AgentTool[];
  limits: Record<string, number>;
}

export type OperationKind = "read" | "write" | "write_confirm";

export interface OperationSummary {
  code: string;
  kind: OperationKind;
  confirm_required: boolean;
  functions: string[];
}

export interface OperationDetail extends OperationSummary {
  input_schema: Json;
  output_schema: Json | null;
}

export interface OperationResult {
  code: string;
  kind: OperationKind;
  executed: boolean;
  confirm_required?: boolean;
  preview?: Json;
  result?: unknown;
}

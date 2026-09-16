/** A `/v1` error: HTTP status, public `code` (e.g. `NOT_FOUND`) and `details`. */
export class RAGflyError extends Error {
  readonly statusCode?: number;
  readonly code?: string;
  readonly details: Record<string, unknown>;

  constructor(message: string, statusCode?: number, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "RAGflyError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details ?? {};
    Object.setPrototypeOf(this, RAGflyError.prototype);
  }
}

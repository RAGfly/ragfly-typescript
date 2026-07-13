/**
 * Public-code translation at the SDK edge (English ↔ internal).
 *
 * RAGfly catalog codes are OPAQUE internal identifiers that historically ended up in
 * Spanish (`VECTORIZADO`, `FACTURA`). The agentic frontier — MCP, SDK, CLI — speaks
 * ENGLISH: every catalog row has a stable public alias `codigo_*_en` (`VECTORIZED`,
 * `INVOICE`) that points to the SAME row.
 *
 * The SDK talks English to the developer but the underlying REST API still speaks the
 * internal codes. This translator fetches the `{internal: english}` map from
 * `GET /catalogo/public-codes` (the same source the MCP server uses) and translates at
 * the SDK edge: internal on the wire, English in your code. The map only changes with a
 * catalog migration, so it is fetched once and cached for the client's lifetime.
 * Translation is fail-open: an unknown code passes through untouched.
 *
 * Mirror of the Python SDK's `codes.py`.
 */

type DomainMap = Record<string, Record<string, string>>;

export class CodeTranslator {
  private readonly fetchMap: () => Promise<DomainMap>;
  private toEnglishMap: DomainMap | null = null;
  private toInternalMap: DomainMap | null = null;
  private loading: Promise<void> | null = null;

  constructor(fetchMap: () => Promise<DomainMap>) {
    this.fetchMap = fetchMap;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.toEnglishMap !== null) return;
    if (!this.loading) {
      this.loading = (async () => {
        let mapa: DomainMap = {};
        try {
          mapa = (await this.fetchMap()) ?? {};
        } catch {
          // If the map can't be fetched, degrade to identity (never break calls).
          mapa = {};
        }
        const toEn: DomainMap = {};
        const toInt: DomainMap = {};
        for (const [dom, table] of Object.entries(mapa)) {
          toEn[dom] = { ...table };
          toInt[dom] = {};
          for (const [internal, en] of Object.entries(table)) {
            toInt[dom][en] = internal;
          }
        }
        this.toEnglishMap = toEn;
        this.toInternalMap = toInt;
      })();
    }
    await this.loading;
  }

  /** internal → English. Unknown codes pass through. null/undefined → same. */
  async toEnglish(domain: string, internalCode?: string | null): Promise<string | null | undefined> {
    if (!internalCode) return internalCode;
    await this.ensureLoaded();
    return this.toEnglishMap?.[domain]?.[internalCode] ?? internalCode;
  }

  /**
   * English → internal. Accepts an internal code too (bilingual during the
   * transition). Unknown codes pass through. null/undefined → same.
   */
  async toInternal(domain: string, publicCode?: string | null): Promise<string | null | undefined> {
    if (!publicCode) return publicCode;
    await this.ensureLoaded();
    const table = this.toInternalMap?.[domain] ?? {};
    if (publicCode in table) return table[publicCode];
    // Already an internal code? (caller passed the internal one out of habit)
    if (publicCode in (this.toEnglishMap?.[domain] ?? {})) return publicCode;
    return publicCode;
  }
}

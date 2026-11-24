export type ErrorCode = "LOGIN_REQUIRED" | "NOT_FOUND" | "BLOCKED" | "NOT_IMPLEMENTED" | "UNKNOWN";

/** Erreur par groupe : consignée sans interrompre les autres groupes. */
export class ExtractionError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

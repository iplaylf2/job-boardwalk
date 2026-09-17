import { PlatformAccessObservation } from "./platform-access.ts";
import { contract } from "./internal/contract.ts";

export const OperationErrorCode = contract.enumerated(
  "invalid-input",
  "not-found",
  "forbidden",
  "conflict",
  "internal-error",
  "browser-unavailable",
  "tab-unavailable",
  "no-platform-tab",
  "outside-platform-scope",
  "unsupported-page",
  "unsupported-operation",
  "reference-expired",
  "reference-changed",
  "tab-mismatch",
  "user-control-active",
  "login-not-ready",
  "page-changed",
  "page-read-timed-out",
  "evidence-unavailable",
  "scroll-target-not-visible",
  "stale-observation",
  "upstream-rejected",
);
export type OperationErrorCode = typeof OperationErrorCode.infer;

export const OperationFailure = contract({
  code: OperationErrorCode,
  details: {
    "candidates?": contract({
      "documentReadyState?": "string",
      reason: "string",
      "tabId?": "number",
      url: "string",
    }).array(),
    "field?": "string",
    "httpStatus?": "number",
    "id?": "number",
    "invalidatedBy?": "string",
    "invalidatedByTabId?": "number",
    "issues?": contract({ code: "string", message: "string", path: "(string | number)[]" }).array(),
    "missingFields?": "string[]",
    "pageInspection?": contract({
      "documentReadyState?": "string",
      outcome: "'page-closed' | 'timed-out' | 'observed'",
      "title?": "string",
    }),
    "pageTextAvailable?": "boolean",
    "platformAccessObservation?": PlatformAccessObservation,
    "platformId?": "string",
    "reason?": "string",
    "ref?": "string",
    "requestedTabId?": "number",
    "resource?": "string",
    "sourceId?": "number",
    "tabId?": "number",
    "url?": "string",
  },
  message: "string",
});
export type OperationFailure = typeof OperationFailure.infer;
export const OperationErrorResponse = contract({ error: OperationFailure });
export type OperationErrorResponse = typeof OperationErrorResponse.infer;

/** A classified failure; message is for display, code and details are the contract. */
export class OperationError extends Error {
  public readonly failure: OperationFailure;

  public constructor(
    code: OperationErrorCode,
    message: string,
    details: OperationFailure["details"] = {},
  ) {
    super(message);
    this.name = "OperationError";
    this.failure = { code, details, message };
  }
}

export function operationErrorResponse(error: unknown): OperationErrorResponse {
  return {
    error:
      error instanceof OperationError
        ? error.failure
        : { code: "internal-error", details: {}, message: "无法完成请求。" },
  };
}

/** Preserve validator paths and rule codes without asking consumers to parse a summary. */
export function inputValidationError(
  errors: Iterable<{ path: readonly PropertyKey[]; code: string; message: string }>,
): OperationError {
  const issues = [...errors].map(({ path, code, message }) => ({
    code,
    message,
    path: Array.from(path, (segment) => (typeof segment === "number" ? segment : String(segment))),
  }));
  return new OperationError("invalid-input", "输入不符合接口契约。", { issues });
}

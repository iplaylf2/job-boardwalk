import {
  OperationError,
  operationErrorResponse,
  inputValidationError,
} from "@job-boardwalk/contracts";
import { type } from "arktype";
import type { Context } from "hono";
import { CanceledError, InterruptedError, ScopeError, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

const badRequestStatus = 400;
const internalServerErrorStatus = 500;
const minimumPositiveInteger = 1;

interface RequestBodyContract<Output> {
  assert: (input: unknown) => Output;
}

export class InvalidRequestError extends OperationError {
  public constructor(message: string, details: OperationError["failure"]["details"] = {}) {
    super("invalid-input", message, details);
    this.name = "InvalidRequestError";
  }
}

export function readPositiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimumPositiveInteger) {
    throw new InvalidRequestError(`${name} 必须是正整数`, { field: name });
  }
  return parsed;
}

export function* readRequestBody<Output>(
  context: Context,
  contract: RequestBodyContract<Output>,
): RiteCoroutine<Output> {
  const parsed = yield* until(() =>
    context.req.json().then(
      (value: unknown) => ({ kind: "parsed", value }) as const,
      () => ({ kind: "invalid" }) as const,
    ),
  );
  if (parsed.kind === "invalid") {
    throw new InvalidRequestError("请求正文必须是有效的 JSON");
  }
  try {
    return contract.assert(parsed.value);
  } catch (error) {
    if (error instanceof Error && "arkErrors" in error && error.arkErrors instanceof type.errors) {
      throw inputValidationError(error.arkErrors);
    }
    throw error;
  }
}

export function requestErrorResponse(error: unknown, context: Context): Response {
  if (error instanceof OperationError) {
    const statuses = {
      conflict: 409,
      forbidden: 403,
      "invalid-input": badRequestStatus,
      "not-found": 404,
    } as const;
    const { code } = error.failure;
    const status = Object.hasOwn(statuses, code)
      ? statuses[code as keyof typeof statuses]
      : internalServerErrorStatus;
    return context.json(operationErrorResponse(error), status);
  }
  if (
    error instanceof CanceledError ||
    error instanceof InterruptedError ||
    error instanceof ScopeError
  ) {
    throw error;
  }
  return context.json(operationErrorResponse(error), internalServerErrorStatus);
}

import type { Context } from "hono";
import { CanceledError, InterruptedError, ScopeError, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

const badRequestStatus = 400;
const internalServerErrorStatus = 500;
const minimumPositiveInteger = 1;

interface RequestBodyContract<Output> {
  assert: (input: unknown) => Output;
}

function isContractValidationError(error: unknown): error is Error {
  return error instanceof Error && error.name === "TraversalError";
}

export class InvalidRequestError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidRequestError";
  }
}

export function readPositiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimumPositiveInteger) {
    throw new InvalidRequestError(`${name} 必须是正整数`);
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
    if (isContractValidationError(error)) {
      throw new InvalidRequestError(`请求正文无效：${error.message}`);
    }
    throw error;
  }
}

export function requestErrorResponse(error: unknown, context: Context): Response {
  if (error instanceof InvalidRequestError) {
    return context.json({ error: error.message }, badRequestStatus);
  }
  if (
    error instanceof CanceledError ||
    error instanceof InterruptedError ||
    error instanceof ScopeError
  ) {
    throw error;
  }
  return context.json({ error: "Workspace Service 内部错误" }, internalServerErrorStatus);
}

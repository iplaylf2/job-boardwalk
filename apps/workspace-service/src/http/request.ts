import type { Context } from "hono";
import { CanceledError, InterruptedError, ScopeError, until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

const badRequestStatus = 400;
const internalServerErrorStatus = 500;
const minimumPositiveInteger = 1;

export class InvalidRequestError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidRequestError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readRequiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new InvalidRequestError(`${key} 必须是非空字符串`);
  }
  return value.trim();
}

export function readRequiredBoolean(input: Record<string, unknown>, key: string): boolean {
  const value = input[key];
  if (typeof value !== "boolean") {
    throw new InvalidRequestError(`${key} 必须是布尔值`);
  }
  return value;
}

export function readInitiator(input: Record<string, unknown>): "agent" | "system" | "user" {
  const value = input["initiatedBy"];
  if (value !== "agent" && value !== "system" && value !== "user") {
    throw new InvalidRequestError("initiatedBy 必须是 agent、system 或 user");
  }
  return value;
}

export function readPositiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimumPositiveInteger) {
    throw new InvalidRequestError(`${name} 必须是正整数`);
  }
  return parsed;
}

export function readRequiredArray(input: Record<string, unknown>, key: string): unknown[] {
  const value = input[key];
  if (!Array.isArray(value)) {
    throw new InvalidRequestError(`${key} 必须是数组`);
  }
  return value;
}

export function readOptionalString(
  input: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = input[key] ?? null;
  if (value === null) {
    return;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new InvalidRequestError(`${key} 必须是非空字符串`);
  }
  return value.trim();
}

export function* readJsonObject(context: Context): RiteCoroutine<Record<string, unknown>> {
  const parsed = yield* until(() =>
    context.req.json().then(
      (value: unknown) => ({ kind: "parsed", value }) as const,
      () => ({ kind: "invalid" }) as const,
    ),
  );
  if (parsed.kind === "invalid") {
    throw new InvalidRequestError("请求正文必须是有效的 JSON");
  }
  if (!isRecord(parsed.value)) {
    throw new InvalidRequestError("请求正文必须是对象");
  }
  return parsed.value;
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

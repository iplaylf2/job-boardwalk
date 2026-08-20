import { errors } from "patchright";

export function isPatchrightTimeout(error: unknown): boolean {
  return error instanceof errors.TimeoutError;
}

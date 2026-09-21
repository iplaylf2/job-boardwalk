import { OperationError, OperationErrorResponse } from "@job-boardwalk/contracts";
import { until } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";

export function* requireWorkspaceSuccess(response: Response): RiteCoroutine<void> {
  if (response.ok) {
    return;
  }
  const body: unknown = yield* until(() => response.json().catch(() => null));
  if (OperationErrorResponse.allows(body)) {
    throw new OperationError(body.error.code, body.error.message, {
      ...body.error.details,
      httpStatus: response.status,
    });
  }
  throw new OperationError("upstream-rejected", "Workspace Service 拒绝请求。", {
    httpStatus: response.status,
  });
}

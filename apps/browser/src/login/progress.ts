export type LoginProgressState =
  | "starting"
  | "awaiting-user"
  | "authenticated"
  | "persisted"
  | "failed";

export interface LoginProgressEvent {
  detail: string;
  state: LoginProgressState;
}

export type LoginProgressWriter = (event: LoginProgressEvent) => void;

const transitions: Record<LoginProgressState, readonly LoginProgressState[]> = {
  authenticated: ["persisted", "failed"],
  "awaiting-user": ["authenticated", "failed"],
  failed: [],
  persisted: [],
  starting: ["awaiting-user", "failed"],
};

export class LoginProgressReporter {
  private state: LoginProgressState = "starting";

  public constructor(
    detail: string,
    private readonly writer: LoginProgressWriter,
  ) {
    this.write(detail);
  }

  public transition(state: LoginProgressState, detail: string): void {
    if (!transitions[this.state].includes(state)) {
      throw new Error(`无效登录状态迁移：${this.state} → ${state}`);
    }
    this.state = state;
    this.write(detail);
  }

  private write(detail: string): void {
    this.writer({ detail, state: this.state });
  }
}

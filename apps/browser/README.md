# Browser application

The browser application establishes recruiting-site login sessions in dedicated Chromium
profiles and reopens those profiles for later use. Each platform supplies authentication evidence
that has been verified against its current login behavior.

## Prerequisites

A Chromium-compatible browser executable must be available on `PATH`. When automatic discovery
does not find it, set `JOB_BOARDWALK_BROWSER` to its command or absolute path.

Check browser discovery without changing the system:

```sh
pnpm --filter @job-boardwalk/browser cli doctor
```

Browser installation and fonts remain operating-system concerns. If Chinese text renders as
missing glyphs, install a CJK-capable font through the operating system.

## Login

Open a platform's official login page:

```sh
pnpm --filter @job-boardwalk/browser cli login boss
pnpm --filter @job-boardwalk/browser cli login yupao
```

Complete login in the visible browser. The command writes JSON Lines progress events to stdout,
closes the browser after observing authentication, writes a login receipt, and then reports
`persisted`. No terminal confirmation is required.

```jsonl
{"detail":"正在打开BOSS直聘登录页","state":"starting"}
{"detail":"请在浏览器中完成BOSS直聘登录","state":"awaiting-user"}
{"detail":"已确认BOSS直聘登录","state":"authenticated"}
{"detail":"BOSS直聘登录状态已保存，可供后续复用","state":"persisted"}
```

## Reuse

Open a platform with its saved Chromium profile:

```sh
pnpm --filter @job-boardwalk/browser cli open boss
pnpm --filter @job-boardwalk/browser cli open yupao
```

The browser remains open until Enter is pressed in the terminal.

## Remove local state

Remove both the Chromium profile and its login receipt:

```sh
rm -rf .auth/boss-profile .auth/boss-login-receipt.json
rm -rf .auth/yupao-profile .auth/yupao-login-receipt.json
```

Logging out on the platform or revoking the session in account security settings invalidates the
remote session but does not remove these local files.

## Authentication evidence

BOSS直聘 is observed through a loopback-only CDP connection. Playwright returns the browser's
cookies, and the application compares their names for `zp_at`; it does not print or separately
persist cookie values.

鱼泡直聘 closes its page when CDP attaches, so its login browser remains uncontrolled. The
application queries only cookie names from the Chromium profile database and requires `TOKEN`,
`USERID`, and `current_identity` together. Requiring all three avoids treating a guest token as a
completed login.

## Local data

Platform profiles and receipts live under `.auth/`, which is excluded from Git. The application
requests owner-only permissions on systems that support POSIX modes. Treat the directory as
sensitive as account credentials.

After login, `.auth/<platform>-login-receipt.json` records when authentication was observed and
persisted. The receipt is historical, not a live validity claim: expiration, logout, or
server-side revocation can invalidate the profile later. Running `login` observes the platform
again before writing a new receipt.

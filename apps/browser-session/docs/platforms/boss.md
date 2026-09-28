# BOSS直聘

[Browser Session platform coverage](../../README.md#platform-coverage)

## Page coverage

Job-card collection covers `/web/geek/job-recommend` and `/web/geek/jobs`. Detail identities
come from `/job_detail/<external-job-id>.html`. Detail-panel links outside recognized card
containers are excluded from card snapshots.

The page definition owns the known private-use digit mapping shared by generic snapshots, job
cards, and descriptions. Decoding occurs before description fact matching, including salary and
experience. Generic snapshots decode visible text, element names, and card context while retaining
raw element signatures for reference validation. Unknown characters remain unchanged; the mapping
covers only the known platform digit encoding.

## Detail extraction

Detail experience and education fields read the text before “职位描述”. The full description retains
its own requirements and preferences; they do not supply missing header fields.

## Recruitment assessment

A successful detail read records `recruitment.state=closed` when a rendered standalone
“职位已关闭” line appears before the main “职位描述” section. The description remains part of the
same observation. Text inside the description or later recommendations does not trigger this rule.
Other evidence returns `unknown`; this adapter has no rule that establishes `open`.

## Access assessment

A successful navigation alone remains unclassified: an application shell can load while content
still requires login. A redirect from `/web/geek/` to login records `unauthenticated`.
On recognized collection pages, the standalone lines “登录账号，查看更多好职位” and
“登录查看完整内容” together record `unauthenticated` with `login-required-page` evidence.
This page-local content gate takes precedence over account navigation links; it does not pause
browser control or authorize login input. A bounded snapshot containing the complete set of
account-only navigation links otherwise records `authenticated`. An isolated login link remains
unclassified.

## Validation coverage

Synthetic tests cover recruitment closure, login-gate classification, navigation-only authentication
evidence, and qualification extraction boundaries. Live validation of these rules remains
outstanding.

## Implementation

The [page definition](../../src/browser/platforms/boss.ts) owns collection boundaries, job-link
rules, extraction selectors, access assessment, and platform-specific login controls.
Shared contracts and catalog ownership are described in
[Maintenance constraints](../maintenance.md).

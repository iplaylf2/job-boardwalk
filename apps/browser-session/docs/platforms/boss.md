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

## Recruitment assessment

A successful detail read records `recruitment.state=closed` when a rendered standalone
“职位已关闭” line appears before the main “职位描述” section. The description remains part of the
same observation. Text inside the description or later recommendations does not trigger this rule.
Other evidence returns `unknown`; this adapter has no rule that establishes `open`.

## Access assessment

A successful protected navigation records `authenticated`. A redirect from protected navigation
to login records `unauthenticated`. A bounded snapshot containing the complete set of
account-only navigation links records `authenticated`. Other evidence remains unclassified.

## Validation coverage

The closure rule has synthetic accepted and rejected tests. Live validation of the
rule remains outstanding.

## Implementation

The [page definition](../../src/browser/platforms/boss.ts) owns collection boundaries, job-link
rules, extraction selectors, access assessment, and platform-specific login controls.
Shared contracts and catalog ownership are described in
[Maintenance constraints](../maintenance.md).

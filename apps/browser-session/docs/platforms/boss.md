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

## Access assessment

A successful protected navigation records `authenticated`. A redirect from protected navigation
to login records `unauthenticated`. A bounded snapshot containing the complete set of
account-only navigation links records `authenticated`. Other evidence remains unclassified.

## Implementation

The [page definition](../../src/browser/platforms/boss.ts) owns collection boundaries, job-link
rules, extraction selectors, and access assessment. Shared contracts and catalog ownership are
described in [Maintenance constraints](../../README.md#maintenance-constraints).

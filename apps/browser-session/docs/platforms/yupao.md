# 鱼泡直聘

[Browser Session platform coverage](../../README.md#platform-coverage)

## Page coverage

Job-card collection covers `/topic/<category>/`, `/zhaogong/`, and single-segment categories
under `/zhaogong/`. Recognized detail pages are excluded from collection. Detail identities come
from `/zhaogong/<numeric-job-id>.html` or `/zhaogong/<numeric-job-id>/<slug>.html`.

Card extraction uses rendered line boundaries when locating the title. “查看更多” and “查看更多信息” links
are excluded as job titles.

## Access assessment

A bounded snapshot containing a complete job-seeker or recruiter account header records
`authenticated`. The required navigation, account controls, and identity must appear together; a
URL alone does not establish authentication. Other evidence remains unclassified.

## Implementation

The [page definition](../../src/browser/platforms/yupao.ts) owns collection boundaries, job-link
rules, extraction selectors, and access assessment. Shared contracts and catalog ownership are
described in [Maintenance constraints](../../README.md#maintenance-constraints).

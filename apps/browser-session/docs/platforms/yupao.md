# 鱼泡直聘

[Browser Session platform coverage](../../README.md#platform-coverage)

## Page coverage

Job-card collection covers `/topic/<category>/`, `/zhaogong/`, and single-segment categories
under `/zhaogong/`. Recognized detail pages are excluded from collection. Detail identities come
from `/zhaogong/<numeric-job-id>.html` or `/zhaogong/<numeric-job-id>/<slug>.html`.

Card extraction uses rendered line boundaries when locating the title. “查看更多” and “查看更多信息” links
are excluded as job titles.

## Detail extraction

The description spans the rendered “职位详情” section up to the first “职位总结” or “工作地址”
boundary, including requirements that precede duties. Salary comes from the rendered header before
“职位详情”; collection-card salary nodes are not detail evidence. The work-address section supplies
location separately. Recognized recommendation headings end the main text scope, so a missing main
salary or address is not filled from later recommendations. Header matching accepts monthly 万, 万元,
and K amounts as well as daily and hourly rates. A missing description boundary fails extraction.
Recruitment assessment returns `unknown`; this adapter has no conclusive recruitment-state rule.

## Access assessment

A bounded snapshot containing a complete job-seeker or recruiter account header records
`authenticated`. The required navigation, account controls, and identity must appear together; a
URL alone does not establish authentication. Other evidence remains unclassified.

## Validation coverage

Synthetic tests cover preceding requirements, work-address extraction, header salary variants, and
exclusion of recommendation salaries and addresses. Live validation of these extraction rules
remains outstanding.

## Implementation

The [page definition](../../src/browser/platforms/yupao.ts) owns collection boundaries, job-link
rules, extraction selectors, and access assessment. Shared contracts and catalog ownership are
described in [Maintenance constraints](../../README.md#maintenance-constraints).

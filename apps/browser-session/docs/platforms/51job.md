# 前程无忧51job

[Browser Session platform coverage](../../README.md#platform-coverage)

## Page coverage

Search-card collection covers `https://we.51job.com/pc/search`, including search parameters.
Detail pages use `https://jobs.51job.com/<location>/<numeric-job-id>.html`; the numeric segment
supplies the external job ID. Company pages are outside structured card and description
collection. Cross-subdomain job links are accepted only for the configured HTTPS detail origin.

Search results render `.joblist-item` containers whose `.jname` titles may have no anchor. The
adapter exposes visible titles as detail-opening controls in `browser_snapshot`. Use the shared
reference and card-context workflow described in [Tabs and page
evidence](../../README.md#tabs-and-page-evidence).

Detail reads select the main posting description, title, and benefits independently of
surrounding recommendations. Salary, experience, and education patterns read only the posting
header, description, and tags; absent facts remain absent.

## Engagement interpretation and evidence

| Engagement    | Platform category |
| ------------- | ----------------- |
| `interested`  | 职位收藏          |
| `applied`     | 社会申请 / 全部   |
| `interviewed` | 邀面试            |

The application-page “感兴趣” filter is employer feedback, not the seeker's favorites. The adapter
reads recognizable linked jobs in the loaded category document. A category total larger than the
captured set yields partial evidence. Interview invitations with jobs remain partial because the
application header counts all applications, not invitations. An empty favorites or invitation
list requires explicit empty-state evidence; loading or unrecognized cards never establish an
empty category.

Observed history windows are 60 days for applications and 180 days for favorites. Completeness
covers that platform-visible window. Application and interview relations retain their existing
historical semantics.

## Access assessment

The adapter recognizes either a visible personal-name profile link with the matching
online-resume control, or the application site's complete logout, account-settings, and
resume-center control set. Either yields `authenticated`. A URL alone or unnamed links from
passive collection remain unclassified. Login and account controls remain subject to the shared
user-handoff workflow.

## Validation coverage

Nonempty application extraction and empty favorites and invitation states have been checked
live. Linked favorites and invitation cards are covered by synthetic extraction tests; their
nonempty layouts have not been verified live. The detail-entry workflow has been validated on
synthetic pages, including same-name cards, popup handling, and stale references.

## Implementation

The [page definition](../../src/browser/platforms/51job.ts) owns collection boundaries, job-link
rules, extraction selectors, and access assessment. Engagement evidence comes from the [category
capture](../../src/browser/job-engagement/51job-page-capture.ts) and [category-total
parser](../../src/browser/job-engagement/page-totals.ts). Shared contracts and catalog ownership
are described in [Maintenance constraints](../../README.md#maintenance-constraints).

---
"@job-boardwalk/desktop-distribution": minor
---

Simplify the Dashboard overview and improve job lookup and evidence accuracy during delegated research.

- The Dashboard overview now focuses on your job-search direction and personal context. Browser
  status and platform-access panels have been removed. Desktop Manager still reports service
  availability; browser handoff continues through the agent conversation and visible browser,
  where you complete login and verification.
- You can now ask the agent to find a saved job by its recruiting platform and exact platform job
  ID. When reading a job description, the agent also receives the saved follow-up records for
  that posting and any other sources of the same job. This helps it check previously recorded
  interest, contact, applications, or interviews against the relevant source. Missing records do
  not establish that you have never interacted with a posting.
- Captured education and experience requirements on BOSS直聘, 鱼泡直聘, and 前程无忧51job now come
  from the job's qualification area, reducing confusion with text elsewhere on the page. 51job
  also recognizes more formats for experience ranges.
- BOSS直聘 login detection now recognizes search pages that require login to reveal more content
  and no longer treats a successful page load alone as proof of login. The agent receives saved
  login and access-interruption observations as dated history, separate from current browser
  checks.
- The agent now receives more detail about how many job cards a page read recognized and
  returned, helping it assess the scope of that read. These counts cover recognized content on
  the loaded page, not the platform's full search results. In the Dashboard job library, the
  filtered count is now clearly labeled as the total matching the filter.

The desktop application's bundled runtime and dependencies are also updated.

Extract this desktop prerelease into its own product directory. Moving saved data from another
version is not supported; keep the previous version's directory intact if you need its workspace.

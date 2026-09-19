---
"@job-boardwalk/desktop-distribution": minor
---

Add 51job research support and improve job collection, browser handoff, and Dashboard clarity.

- Delegated research now supports 前程无忧51job search results and job descriptions alongside
  BOSS直聘 and 鱼泡直聘. You can filter the job library by 51job and ask the agent to synchronize
  favorites, application, and interview-invitation records from 51job. Synchronization covers
  recognizable jobs within the platform's available history and reports partial coverage when
  it cannot confirm the full visible category.
- Delegated browsing more reliably opens job details and scrolls the relevant results area.
  Collection preserves separate same-title cards in search-page reads and better separates job
  descriptions from surrounding recommendations. Salary display recognizes more Chinese salary
  formats, including ranges that mix 千 and 万.
- The job library now labels each platform source as recruiting, closed, or unknown, separately
  from recorded favorites, applications, and other follow-up activity. Recruiting and closed
  labels include the observation date. 51job recruitment status remains unknown. Dashboard also
  improves the layout and text wrapping of personal context and job-search intent details.
- Recognized verification or access interruptions now pause agent browser actions and background
  collection for user handoff. Dashboard shows when the browser is available, preparing a handoff,
  or under your control, separately from saved platform-access observations. Login preparation
  better recognizes usable login controls, and browser diagnostics help investigate interruptions.
  Login and verification remain yours to complete. After you explicitly return control, the agent
  checks the page again before resuming research.
- Research reports are now presented as saved documents whose topic and structure the author
  chooses, including research beyond job recommendations. Dashboard labels their writing state
  as draft or finished and makes expiration clearer. Expired reports are hidden from ordinary
  reading but remain stored; you can ask the agent to retrieve them explicitly.

The desktop application's bundled runtime and dependencies are also updated.

When trying this desktop prerelease, extract it into its own product directory. Moving saved data
from another version is not supported; keep the previous version's directory intact if you need
its workspace.

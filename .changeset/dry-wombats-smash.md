---
"@job-boardwalk/desktop-distribution": minor
---

Add job-description coverage and make delegated browser research more reliable.

The Dashboard job library now summarizes description coverage for the current search, platform,
and engagement view. You can filter for jobs with a collected description, all jobs without one,
or the missing-description subset whose source identity is still unresolved. A new combined
tracked view brings
interested, contacted, applied, and interviewed jobs together while preserving each platform
record.

When a collected job is missing a description, platform job ID, and detail-page link, delegated
research can now associate a confirmed detail page with its existing source. Job Boardwalk
validates the match before retaining the description instead of guessing from incomplete
information. The source and its engagement history are preserved. If complete company, title, and
location evidence matches an existing normalized job, Job Boardwalk merges their sources instead
of leaving a duplicate.

Login preparation now reuses an existing authenticated session without opening a login page or
asking you to take control. When login is needed, browser handoff begins only after usable login
controls are visible. If an existing platform tab cannot be inspected, Job Boardwalk preserves it
and uses an observed platform tab, an available blank tab, or a new tab for login instead. It also
distinguishes a navigation timeout from what it can still observe on the resulting page, helping
the agent reconcile the visible result before choosing a safe next step instead of automatically
repeating an action whose outcome is uncertain.

The supported Compose deployment can once again build the Workspace Service and Dashboard images,
and the Dashboard is again reachable at its documented local address.

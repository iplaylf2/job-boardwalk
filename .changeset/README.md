# Changesets

Changesets records release intent for independently delivered artifacts. It is not a per-commit or
per-workspace changelog.

The desktop product is currently the repository's only release unit. To include a change in a
desktop release, run `pnpm changeset` and select `@job-boardwalk/desktop-distribution`. The resulting
version pull request updates that package's version and changelog. The package version is recorded
as the desktop product version in the manifest and used in archive filenames; release automation
also uses it for the Git tag and GitHub release. See
[Desktop releases](../docs/development.md#desktop-releases) for the automation and retry flow.

Other private workspaces do not have independent release lifecycles and intentionally omit
`version`. Add a version only when a workspace gains its own delivery, compatibility, rollback, or
support lifecycle. If several release units must always ship at one version, define a Changesets
`fixed` group for them.

Changes that do not alter a released artifact need no changeset.

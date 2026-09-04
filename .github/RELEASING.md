# Releasing TERAS Academy

Use the **Certification preparation release gate** workflow for every normal or
prerelease. Do not publish releases directly from the GitHub Releases page.

Before the first release, a repository administrator must create the
`release-gate-review` environment and assign at least one human under
**Deployment protection rules → Required reviewers**. The workflow verifies
this rule through the GitHub API and fails before running release evidence when
the environment is absent or unprotected.

To release:

1. Dispatch the workflow with a new tag name and the exact commit SHA to test.
2. Inspect the uploaded JSON and Markdown evidence after the automated gate
   passes.
3. A required reviewer records GO by approving the protected environment, or
   records NO-GO by rejecting it.
4. Only an approved run creates the GitHub release and tag. A failed test,
   failed database cleanup, missing report, missing approval rule, or rejected
   review prevents publication. The workflow retains the resolved commit SHA
   before review, then atomically creates a new tag at that SHA. A branch moving
   during approval cannot change what ships, and an existing tag collision
   blocks publication.

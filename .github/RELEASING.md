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

## First Production Super Administrator

Clerk Development and Production are isolated. A Development account or role
never establishes Production access.

For the first Production release, use this one-time operator procedure:

1. Publish the application, then have the owner sign up in the published
   application and finish Clerk email verification.
2. In the Auth pane, select **Production** and copy that user's exact Clerk user
   ID. Confirm the verified email shown there with the owner through the normal
   release review channel.
3. Create two temporary **Production** environment variables in Publishing:
   `TERAS_PROVISION_SUPER_ADMIN_CLERK_USER_ID` and
   `TERAS_PROVISION_SUPER_ADMIN_VERIFIED_EMAIL`. These are identifiers, not
   credentials. Never copy Production Clerk or database credentials into
   Development, source control, or new secrets.
4. In Publish, inspect and apply the proposed database schema update first.
   Provisioning requires `teras_people`, `teras_person_roles`, and the role
   constraint from `0012_super_admin_governance.sql`; it fails closed when any
   prerequisite is absent. Do not bypass a failed schema update.
5. For one bootstrap publish only, temporarily prepend this command to the API
   service's Production build command:

   ```sh
   pnpm --filter @workspace/scripts provision:super-admin -- \
     --clerk-user-id "$TERAS_PROVISION_SUPER_ADMIN_CLERK_USER_ID" \
     --verified-email "$TERAS_PROVISION_SUPER_ADMIN_VERIFIED_EMAIL" \
     --confirm-production PROVISION &&
   pnpm --filter @workspace/api-server run build
   ```

   Deployment build stages receive the existing Production
   `CLERK_SECRET_KEY`, `DATABASE_URL`, and `REPLIT_DEPLOYMENT` values. The
   command refuses to run elsewhere. It fetches the user by exact Clerk ID,
   independently confirms that the supplied email is verified on that same
   Production identity, refuses to bootstrap over a different active Super
   Admin, provisions transactionally, and exits only after reading back
   `status=active` and `role=super_admin`.
6. Sign in to the published app as that owner and verify a Super Admin-only
   action.
7. Immediately restore the normal API Production build command, delete both
   temporary provisioning variables, and publish once more. Confirm the clean
   publish succeeds. No bootstrap ID, token, endpoint, build hook, or
   request-time promotion may remain configured.

Retrying the bootstrap publish for the same identity is idempotent and audited
until additional Super Administrators are added through normal governance.
Never use email alone to select the account, and never add a production identity
to `.replit` or application authorization code. Runtime authority comes only
from the active local `teras_person_roles` assignment joined to the authenticated
Clerk user ID.

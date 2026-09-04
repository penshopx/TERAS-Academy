# TERAS Academy

TERAS Academy is a capability-development platform with an LMS as its core learning engine, helping certification candidates prepare sufficient competence and capability before entering an official assessment process run by an external certification body.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- TERAS prepares learners and their evidence for official competency assessment; it does not conduct official certification or claim to be a certification body.
- Keep Learning Progress, Learning Achievement, Capability, Capability Readiness, and Official Certification as distinct concepts in data, APIs, and UI copy.
- The canonical journey is Diagnostic → Gap → Learning Plan → Learn → Practice → Evidence → Feedback → Remediation → Re-practice → Reassessment → Readiness → Capability Passport → external official competency process.
- Learner state and ownership are controlled server-side. Do not infer authoritative progress or identity from browser state or client-supplied learner IDs.
- Pathways must retain isolated state, evidence, readiness, history, and caches.

## Product

The product is not complete until role-specific operational dashboards function end-to-end for administrators, learners, instructors/trainers, verifiers/validators, assessors, and other parties required by the preparation journey.

Required product scope includes:

- Administrators manage people, roles, programs, pathways, enrollments, curriculum, governance, and operational configuration.
- Instructors/trainers author and manage courses, modules, lessons, activities, learning resources, assignments, feedback, and remediation.
- The LMS stores and serves managed learning content, including secure uploads for video, documents, images, and related metadata—not only external links.
- Learners discover, complete, and resume learning; practice; submit evidence; follow feedback and remediation; and understand their readiness without receiving false certification claims.
- Verifiers/validators review evidence quality, provenance, relevance, sufficiency, traceability, and required corrections with an append-oriented audit history.
- Assessors or readiness reviewers record preparation-stage evaluations while preserving the boundary with the external official assessment conducted by a certification body.
- Authorized stakeholders can monitor cohorts, interventions, readiness, and handoff to the external certification process according to their role.

Completion requires production-path proof of permissions, workflow transitions, data integrity, audit history, accessibility, security, uploads/storage, and role isolation—not merely passing unit tests or merging code.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

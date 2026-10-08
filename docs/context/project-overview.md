# Project Overview

## What this is
The **Th.D. Scholars Repository** is a private, access-controlled digital resource hub for the Doctor of Theology (Th.D.) program at Dylet International Bible Institute (DIBI). It consists of:

1. A **private Telegram channel** holding lectures, seminar recordings, eBooks, and research materials.
2. A **Telegram Bot** that handles registration, verification, join-request approval/decline, notifications, and content posting.
3. A **Telegram Mini App** (React web app rendered inside Telegram) that gives Scholars, Faculty, Registrars, and Admins a proper UI for everything the bot does headlessly.

This is **Phase 2** of the project. Phase 1 (manual Google Form + admin-approval invite links) is live and working; this phase replaces the manual roster-matching step with a database-backed, role-based system, without changing the underlying policy goals.

## Why it exists
- Doctoral materials must only be accessible to currently enrolled, verified Th.D. candidates.
- Manual approval does not scale past roughly 50–100 students.
- The institute needs an audit trail: who approved whom, when, and why access was revoked.
- Faculty need a structured way to post content without it getting lost in channel scroll.

## Core goals
- **Verification-gated access** — no one reaches channel content without passing roster verification.
- **Role separation** — Scholars, Faculty, Registrar, and Admin each get only the privileges their job requires.
- **Auditability** — every privileged action is logged.
- **Low operational overhead** — once live, day-to-day approvals and content posting should require minimal manual admin time.
- **Design quality** — the Mini App must look and feel like a modern, polished product, not a bare-bones internal tool. See `ui-context.md`.

## Non-goals (explicitly out of scope for this phase)
- Replacing Telegram as the content delivery platform.
- Building a full Learning Management System (grading, assignments, submissions).
- Public-facing marketing site — this is an internal, invite-only system.
- True DRM. Telegram's "restrict saving" deters casual sharing but does not stop screen recording; this is policy-enforced, not cryptographically enforced.

## Primary stakeholders
| Stakeholder | Interest |
|---|---|
| DIBI Director | Sponsor; wants a working, policy-compliant system with minimal ongoing admin burden |
| Registrar | Owns enrollment truth; needs an easy way to keep roster status current |
| Faculty | Need to post content without technical friction |
| Th.D. Scholars (students) | Need frictionless registration and reliable access to materials |
| Alchemy (developer) | Builds and maintains the system; needs it maintainable solo or with a small team |

## Relationship between the documents in this context pack
- Start here (`project-overview.md`) for the "why."
- `architecture.md` for the "how it fits together."
- `database-schema.md` and `api-reference.md` for the data and contract layer.
- `file-structure.md` for where code lives.
- `code-standards.md` for how code should be written.
- `security.md` for what must never be violated.
- `ui-context.md` for how the Mini App should look and feel.
- `workflows.md` for step-by-step user journeys end to end.
- `developer-map.md` for which document to consult for a given task — read this if unsure where to start.

## Current status
- Telegram channel: **created**.
- Phase 1 (manual Google Form registration): **implemented**.
- Phase 2 (bot + Mini App): **in specification/early build**, this context pack is the foundation for that build.

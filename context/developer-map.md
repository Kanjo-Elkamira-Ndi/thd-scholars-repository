# Developer Map

This is the routing document. Read this first when picking up any task on the Th.D. Scholars Repository, to find which context document(s) govern the work before writing code.

## "I need to..." → "Read this document"

| Task | Primary document(s) |
|---|---|
| Understand what this project is and why it exists | `project-overview.md` |
| Understand how the bot, Mini App, API, and database fit together | `architecture.md` |
| Find where a file should live, or where to add a new one | `file-structure.md` |
| Add/change a table, column, or relationship | `database-schema.md` |
| Add/change an API endpoint, or understand request/response shape | `api-reference.md` |
| Write code in any app and want to match existing conventions | `code-standards.md` |
| Implement anything touching auth, roles, permissions, or secrets | `security.md` |
| Build or change any Mini App screen or component | `ui-context.md` (and `code-standards.md` for frontend conventions) |
| Understand a specific user journey end-to-end (who does what, in what order) | `workflows.md` |

## Task → multi-document checklist

### Adding a new API endpoint
1. `api-reference.md` — define the contract first (method, path, auth, body, response).
2. `database-schema.md` — confirm the tables/columns needed already exist; add a migration if not.
3. `security.md` — confirm the role check this endpoint needs; confirm whether it needs an `audit_logs` write.
4. `code-standards.md` — controller/service/repository split.
5. Update `api-reference.md` in the same PR once implemented — it should never lag behind the actual code.

### Adding a new Mini App screen
1. `workflows.md` — find (or write) the workflow this screen serves; confirm which role(s) see it.
2. `ui-context.md` — design tokens, component patterns, motion guidelines, anti-patterns to avoid.
3. `api-reference.md` — confirm the endpoint(s) the screen needs exist; if not, follow the "Adding a new API endpoint" checklist first.
4. `file-structure.md` — confirm which `features/` folder this belongs in.
5. `code-standards.md` — frontend conventions.

### Adding a new table/migration
1. `database-schema.md` — add the table definition, update relationships diagram, update indexing guidance, add the migration filename to the sequence.
2. `api-reference.md` — if this table is exposed via the API, add the corresponding endpoint(s).
3. `code-standards.md` — confirm migration naming/append-only rules are followed.

### Implementing a new role or changing role permissions
1. `security.md` — the authoritative source on role hierarchy and what each role can/cannot do.
2. `database-schema.md` — `users.role` CHECK constraint, `packages/shared` role type.
3. `api-reference.md` — confirm every affected endpoint's auth check is updated, not just the new one.
4. `ui-context.md` — role-aware design section, for any UI that now needs to reflect the new permission boundary.

### Working on the bot specifically
1. `architecture.md` — bot's role as a thin client over the API.
2. `workflows.md` — the exact sequence the bot participates in (join requests, content posting, notifications).
3. `code-standards.md` — bot conventions (thin handlers, templates separated from logic).
4. `security.md` — internal service token usage, never duplicating RBAC logic in the bot.

## Document ownership and freshness
Every one of these documents is a **living document**. When a change to the system invalidates something written here, updating the relevant document is part of the task, not a separate follow-up. An AI agent that discovers a mismatch between these docs and the actual codebase should flag it and propose a correction rather than silently working around it.

## If something isn't covered here
If a task doesn't clearly map to one of the documents above, default to:
1. Re-read `project-overview.md` for intent — does this task even belong in this project's scope?
2. Re-read `architecture.md` for where new logic should live.
3. If still unclear, that's a signal this context pack needs a new section or document — raise it rather than guessing silently.

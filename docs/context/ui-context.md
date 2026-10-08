# UI Context

## Design intent
The Mini App represents a doctoral theology program — it should feel **credible, calm, and premium**, not like a generic admin panel or a hackathon prototype. Think: the polish of a well-designed SaaS product, with a restrained, academic tone appropriate to the institution. Avoid anything that reads as templated or "AI slop" — no default purple-gradient hero sections, no generic stock-icon grids, no excessive glassmorphism for its own sake. Every screen should look deliberately designed for this specific product, not assembled from unexamined defaults.

## Tooling
- **Component library:** shadcn/ui — generate components via the CLI into `components/ui/`, customize through Tailwind + composition, never by hand-patching generated internals.
- **Animation:** Framer Motion — used for purposeful transitions (page/route transitions, list item entrance on data load, success/approval state changes, modal/dialog open-close), never decorative motion with no functional purpose. If an animation doesn't help the user understand a state change, cut it.
- **UI generation:** 21st.dev MCP server — use it to accelerate building/iterating on specific component layouts, then run the result through the UI/UX Pro Max skill for design judgment before accepting it. Generated output is a starting point, not a final answer — review against the principles below before it ships.
- **Design judgment:** UI/UX Pro Max skill — consult it before finalizing any new screen or significant component, specifically to catch generic/templated patterns and push toward something considered and specific to this product.

## Color system
**Primary: Blue.**
- Use a single, well-chosen blue as the primary brand color — avoid Tailwind's raw default `blue-500` without adjustment; pick (or have the UI/UX Pro Max skill help select) a specific hue/saturation that feels intentional, not default-template blue.
- Define the full palette as design tokens (CSS variables consumed by Tailwind + shadcn's theming layer), not hardcoded hex values scattered through components:
  - `--primary` (the core blue)
  - `--primary-foreground` (text/icon color on primary backgrounds)
  - A neutral gray scale for backgrounds, borders, and body text — blue should accent, not saturate every surface.
  - Semantic colors: success (approvals), warning (pending/flagged), destructive (decline/remove) — distinct from the primary blue so role-critical states (e.g., "declined," "withdrawn") are never confused with normal navigation elements.
- Respect light/dark mode if the Mini App supports Telegram's theme context (`Telegram.WebApp.colorScheme`) — define both a light and dark token set from the start rather than retrofitting dark mode later.

## Typography
- One primary typeface, used consistently. A clean, modern sans-serif (system font stack is a legitimate choice for a Mini App — fast-loading, Telegram-native feel) unless a specific typeface is chosen deliberately for brand reasons.
- Clear type scale (e.g., `text-sm` / `text-base` / `text-lg` / `text-xl` / `text-2xl` via Tailwind) applied consistently — headings, body, captions, and labels should each have one consistent size/weight combination used everywhere, not ad hoc per screen.

## Layout & spacing
- Mobile-first, non-negotiable — the Mini App's primary (often only) context is Telegram's in-app mobile browser. Design for a narrow viewport first; treat any wider-viewport appearance as a bonus, not the design target.
- Consistent spacing scale (Tailwind's default spacing scale is fine) — no arbitrary one-off pixel values sprinkled through components.
- Generous but not wasteful whitespace — dense enough to feel efficient for an academic/admin tool, open enough to not feel cramped on a phone screen.

## Role-aware design
- Each role (`Scholar`, `Faculty`, `Registrar`, `Admin`) should have a visually distinct but coherent dashboard — not four completely different design languages, but each surfaces only what that role needs, with the Admin view naturally the most information-dense (audit logs, role management, system settings).
- Use a consistent `RoleBadge` component so a user's role is always legible at a glance, especially useful in roster/member-management tables for Registrar and Admin.

## Component patterns to get right
- **Status indicators** (roster status, join-request status, content post status): consistent pill/badge component, color-coded via the semantic palette above, not ad hoc per screen.
- **Empty states**: every list view (roster, content index, audit logs) needs a designed empty state — not a blank screen or a raw "no results" string with no styling.
- **Forms** (registration, content posting, roster edits): clear inline validation, using the shared `zod` schemas' error messages, not generic "invalid input."
- **Loading states**: skeleton loaders over spinners where a layout shape is predictable (tables, cards); reserve spinners for indeterminate, short operations.
- **Confirmation flows** for destructive/high-stakes actions (removing a member, declining a registration, changing a role) — a deliberate confirm step, not a bare button that fires immediately.

## Motion guidelines (Framer Motion)
- Page/route transitions: subtle, fast (150–250ms), consistent easing across the app — defined once as a shared transition config, not re-invented per screen.
- List entrances: stagger children subtly when a data list first renders, skip it on subsequent re-renders/refetches so the UI doesn't feel jittery on every update.
- State change feedback: a success state (e.g., registration approved) deserves a small, satisfying motion moment — this is one of the few places slightly more expressive animation is appropriate, since it's infrequent and meaningful.
- Avoid: animating on every hover, animating decorative background elements, parallax, or anything that adds latency to perceived task completion.

## Anti-patterns to actively avoid
- Default shadcn theme left completely unstyled (no custom color tokens) — reads as unfinished.
- Generic hero/dashboard layouts copied from component-library marketing sites without adapting to this product's actual content and hierarchy.
- Icon-only buttons without accessible labels/tooltips, especially for destructive actions.
- Overuse of gradients, drop shadows, or blur effects without a clear reason tied to hierarchy (e.g., a modal overlay is a legitimate use of blur; a card border is usually not).
- Inconsistent corner radii, spacing, or font sizes between screens — pick the tokens once, apply everywhere.

## Process for new screens
1. Define the screen's purpose and the role(s) that see it (cross-reference `workflows.md`).
2. Draft layout/component structure — use 21st.dev MCP to accelerate generating a first pass.
3. Run the result through the UI/UX Pro Max skill for a design judgment pass — specifically checking for genericness, hierarchy clarity, and consistency with the tokens defined above.
4. Implement with shadcn primitives + Tailwind, wire in Framer Motion only where justified by the motion guidelines.
5. Verify on a narrow mobile viewport before considering the screen done.

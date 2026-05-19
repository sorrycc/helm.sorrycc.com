# Fix /changelog stuck on "Loading releases…" after page refresh (TDZ on changelogRendered)

## 1. Background

Hard-refreshing on `/changelog` (or opening the URL in a fresh tab) leaves the
page indefinitely showing `Loading releases…` in the body and `loading…` in the
sidebar. Navigating to `/changelog` by clicking the nav link from `/` works
correctly.

The root cause is a Temporal Dead Zone (TDZ) error in `public/index.html`: the
bootstrap call `showRoute(location.pathname, location.hash)` at line 927 runs
synchronously, which (for `path === '/changelog'`) calls the hoisted async
function `renderChangelog()` at line 892. The first statement in
`renderChangelog` reads `if (changelogRendered) return;` — but
`let changelogRendered = false;` is declared at line 1162, after the bootstrap
call. `let` is not hoisted, so the binding is in TDZ and the read throws
`ReferenceError: Cannot access 'changelogRendered' before initialization`. The
returned promise rejects silently (no `.catch` on the callsite), so the
placeholders are never replaced.

The nav-click path works because the click handler runs long after the IIFE
finishes, by which point the binding is initialized.

This regression was exposed by `docs/designs/2026-05-12-fix-changelog-nav.md`,
which refactored `showRoute` so the bootstrap path now calls
`renderChangelog()`. The latent TDZ existed before but was never triggered.

## 2. Requirements Summary

- Goal: make `/changelog` render correctly on hard refresh.
- Scope: minimal one-line change in `public/index.html`. Move the
  `let changelogRendered = false;` declaration to before the router section so
  the binding is initialized before the bootstrap `showRoute(...)` call runs.
- Out of scope (explicitly): `let → var` swap; reordering the bootstrap call;
  optional hardening (`.catch` wrap or moving `try/catch` inside
  `renderChangelog`).

## 3. Acceptance Criteria

1. Refresh on `/changelog` renders the full release list (same content as the
   nav-click path).
2. Refresh on `/changelog#vX.Y.Z` renders the list AND scrolls to that release
   (existing behavior at `public/index.html:1211–1214` continues to work).
3. No regression on the nav-click path from `/` → `/changelog`.
4. No regression on hash-only nav clicks from `/changelog` → `/#features` etc.
   (the fix from `docs/designs/2026-05-12-fix-changelog-nav.md`).

## 4. Problem Analysis

- **Approach A — `let` → `var`** -> works (hoists) but inconsistent with the
  file's exclusive use of `let`/`const`. Rejected on style grounds.
- **Approach B — move the bootstrap `showRoute(...)` call to the bottom of the
  IIFE** -> works, but reorders more code than necessary and risks subtle
  side-effect ordering issues with the live-uptime ticker and other
  IIFE-tail initializers that currently run after bootstrap.
- **Approach C (chosen) — move `let changelogRendered = false;` above the
  router section** -> smallest possible diff, no behavior change for any
  other code path, preserves `let`/`const` style.

## 5. Decision Log

**1. Which fix shape?**
- Options: A) `let → var` · B) move bootstrap call · C) move `let` declaration
- Decision: **C)** — smallest correct change, preserves project style, no
  reordering of unrelated initializers. Matches issue's stated proposed fix.

**2. Include optional hardening (`.catch` on the `renderChangelog()` callsite,
or moving `try/catch` inside `renderChangelog`)?**
- Options: A) include · B) skip
- Decision: **B)** — explicitly out of scope per issue. Keeps diff minimal and
  avoids conflating bug fix with defensive refactor. Can be addressed in a
  separate change if desired.

**3. Where exactly to place the moved declaration?**
- Options: A) immediately above `// ---------- Router ----------` (line 886)
  · B) at the top of the IIFE
- Decision: **A)** — keeps the declaration close to the router section that
  triggers `renderChangelog`, so the relationship stays locally readable. The
  issue text explicitly suggests "just above the router section."

## 6. Design

Single edit in `public/index.html`:

Before (current):

```
  // ---------- Router ----------
  const routes = document.querySelectorAll('[data-route]');
  ...
  showRoute(location.pathname, location.hash);          // line 927
  ...
  let changelogRendered = false;                         // line 1162
  async function renderChangelog() {
    if (changelogRendered) return;
    ...
  }
```

After:

```
  let changelogRendered = false;                         // NEW position
  // ---------- Router ----------
  const routes = document.querySelectorAll('[data-route]');
  ...
  showRoute(location.pathname, location.hash);
  ...
  async function renderChangelog() {                     // declaration removed from here
    if (changelogRendered) return;
    ...
  }
```

`renderChangelog` is a function declaration (hoisted), so its position relative
to the call is unchanged in behavior. Only the `let` binding's source position
changes, which moves it out of TDZ at the moment the bootstrap call runs.

## 7. Files Changed

- `public/index.html` — move `let changelogRendered = false;` from line 1162 to
  just above the `// ---------- Router ----------` comment (line 886).

## 8. Verification

1. [AC1] `bun run dev`, hard-refresh `http://localhost:8787/changelog`. The
   release list renders; sidebar populates. Devtools console shows no
   `ReferenceError`.
2. [AC2] Hard-refresh `http://localhost:8787/changelog#<some-tag>`. The list
   renders AND the page scrolls to that release.
3. [AC3] Load `http://localhost:8787/`, then click the `Changelog` nav link.
   Behavior is unchanged: list renders.
4. [AC4] From `/changelog`, click an in-page hash link such as `#features`.
   Navigation falls back to `/` with the hash and scrolls to the target, per
   the prior fix in `docs/designs/2026-05-12-fix-changelog-nav.md`.

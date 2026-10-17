---
name: release
description: Prepare a release by updating changelog.md and bumping package.json version with npm version. Use when the user asks for /release, release prep, version bump, or changelog update. Decide only patch or minor based on change impact; never major.
---

# Release

## Goal

Produce a safe release update by:

- updating `changelog.md`
- bumping `package.json` version
- choosing **only** `patch` or `minor` (never `major`)

## Decision Rules (Patch vs Minor)

Pick `minor` when any of these are true:

- New user-facing feature or command was added.
- New API/capability was added in extension behavior.
- Noticeable UX feature was added (not just a fix).

Otherwise pick `patch` for:

- Bug fixes.
- Refactors/internal changes with same behavior.
- Docs/tests/chore-only changes.

**Never** bump `major` with this skill.

## Required Workflow

1. Inspect current changes:
    - `git status --short`
    - `git diff -- .`
    - optionally `git log --oneline -n 15` for context
2. Decide release type (`patch` or `minor`) using the rules above.
3. Update `changelog.md`:
    - Ensure a top section exists for the new version.
    - Summarize user-facing changes first, then internal fixes.
    - Keep entries concise and actionable.
4. Bump version in `package.json` using npm:
    - `npm version patch --no-git-tag-version` or
    - `npm version minor --no-git-tag-version`
5. Re-open `package.json` and `changelog.md` to verify results.
6. Report exactly what changed:
    - old version -> new version
    - selected bump type and short reason
    - changelog section added/updated

## Output Format

When done, provide:

- `Version:` `<old> -> <new>`
- `Bump type:` `patch|minor` + one-line rationale
- `Changelog:` short bullets of added entries

## Constraints

- Do not pick `major`.
- Do not create a commit unless explicitly requested.
- If there are no meaningful changes, prefer `patch` and note why.

y# Toolchain Upgrade Plan

This document tracks the safe path from the current compatibility-pinned setup to a modern Solana/Anchor/Rust toolchain.

## Why This Exists

Current Anchor CI uses Solana `1.18.23` + Anchor `0.32.1`, which has strict compatibility limits. New upstream crate releases can break that stack even when application code is unchanged.

Recent breakages included transitive updates requiring newer Rust/Cargo behavior than the SBF path supports. To keep CI stable, several crates are currently pinned in `anchor/Cargo.lock`, and Dependabot ignores are in `.github/dependabot.yml`.

## Goal

Move to a newer toolchain and remove temporary dependency pins/ignores without breaking:

- `anchor build`
- `yarn test` in `anchor/`
- existing frontend CI checks

## Scope

In scope:

- Solana CLI/SDK version used in CI.
- Anchor CLI version used in CI.
- Anchor workspace dependency resolution and lockfile format behavior.
- Dependabot rules for Cargo in `anchor/programs/blocs`.

Out of scope:

- Functional changes to protocol logic.
- Frontend feature changes unrelated to build/test compatibility.

## Phased Rollout

### Phase 0: Baseline Snapshot (Current Mainline)

1. Keep current stable path green:
   - `.github/workflows/ci.yml` anchor job passes on PRs.
   - `anchor/Cargo.lock` remains parseable by the active SBF cargo path.
2. Record known-good versions from CI output:
   - `solana --version`
   - `anchor --version`
   - `cargo --version`

### Phase 1: Probe Candidate Toolchains (Non-Blocking)

Use `.github/workflows/anchor-toolchain-probe.yml` (manual dispatch) to test candidate versions before touching required CI.

For each candidate pair (`solana_version`, `anchor_version`):

1. Run probe workflow.
2. Confirm:
   - `anchor build` passes.
   - optional `yarn test` passes when enabled.
3. Capture failures and dependency blockers in this doc or PR notes.

### Phase 2: Remove Compatibility Pins Incrementally

On this upgrade branch:

1. Relax version pin(s) one at a time (start with `time` in `anchor/programs/blocs/Cargo.toml`).
2. Run:
   - `cd anchor && cargo update`
   - `anchor build`
   - `yarn test`
3. If failure occurs, keep the pin and document blocker (crate + required Rust/Cargo feature).
4. Repeat for other pinned transitive blockers until clean on candidate toolchain.

### Phase 3: Cut Over Required CI

After a candidate pair is proven stable:

1. Update required anchor CI job (`.github/workflows/ci.yml`) to new Solana/Anchor versions.
2. Remove lockfile normalization guard when no longer needed.
3. Run full PR CI and at least one post-merge main run.

### Phase 4: Cleanup

1. Remove temporary Dependabot ignores that are no longer needed.
2. Update docs (`README.md`, `CONTRIBUTING.md`, `anchor/README.md`) with new minimum tool versions.
3. Add CHANGELOG entry describing the toolchain migration.

## Acceptance Criteria

- Required CI green for at least 3 consecutive runs on `main`.
- No temporary lockfile header rewrite needed in CI.
- No temporary compatibility pins required for core anchor workspace deps.
- Dependabot PRs no longer reopen previously known compatibility failures.

## Rollback Plan

If cutover introduces instability:

1. Revert CI toolchain version changes.
2. Reapply known-good pins/ignores.
3. Re-run baseline CI.
4. Continue probing on a dedicated branch until stable again.

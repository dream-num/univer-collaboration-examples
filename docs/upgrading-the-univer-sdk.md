# Upgrading the Univer SDK

> **Internal workflow notice.** This document describes the internal upgrade
> workflow of the `univer-collaboration-examples` repository. It is **not** an
> external example or tutorial: it assumes maintainer access to the upstream
> insider npm registry and to this repository's CI settings, and it is not
> meant to teach general Univer usage. For usage examples, see the directories
> under `examples/`.

The branch policy in [AGENTS.md](../AGENTS.md) applies: `main` depends only on
the publicly released SDK, changes that need an unreleased SDK wait on the
`<version>-next` branch named after the currently published version, and each
example's `package.json` pins exact SDK versions.

## Which path

- **The new SDK version is public and no `-next` branch exists**: upgrade on a
  short-lived branch from `main` and open the pull request against `main`.
  Steps 1, 2, 4 and 5; skip step 3.
- **The new SDK version is public and the `-next` branch waits for it**: the
  upgrade is the completion of that branch. Do steps 4 and 5 on the `-next`
  branch; do not open a separate upgrade branch from `main`.
- **The new SDK version is public but the `-next` branch waits for a later
  one** (a patch release in between): upgrade `main` on a short-lived branch
  (steps 1, 2, 4 and 5), then merge `main` into the `-next` branch, rename it
  after the new published version (`git branch -m 1.3.1-next 1.3.2-next` and
  push), and keep its `.npmrc`.
- **Something needs an SDK version that is not public yet**: work on the
  `-next` branch (steps 1 to 3), creating it from `main` if it does not exist.
  When upstream publishes the release, finish with steps 4 and 5 on that
  branch.

## Workflow

### 1. Create the branch

```sh
git fetch origin && git checkout main && git merge --ff-only origin/main
git checkout -b <version>-next   # the published SDK version it follows, e.g. 1.3.1-next
```

If the `-next` branch already exists, start a feature branch from it and open
the pull request against it instead; the feature branch inherits the `.npmrc`.
For an upgrade to an already public version use any short-lived branch name.

### 2. Bump the SDK pins

- Move every `@univerjs` / `@univerjs-pro` dependency in all
  `examples/*/package.json` to the exact new version. Independently versioned
  packages (native bindings such as `engine-formula-rust-binding` and
  `exchange-node-binding`, plus `@univerjs/icons`) keep their own versions and
  are only bumped when upstream changes them.
- Update the `packageExtensions` entries in `pnpm-workspace.yaml` to the same
  version.

### 3. If the release is not on the public registry yet

Commit a scoped `.npmrc` pointing the Univer scopes at the insider registry,
which also proxies the public one:

```
@univerjs:registry=https://insider-npm-registry.univer.work/
@univerjs-pro:registry=https://insider-npm-registry.univer.work/
```

Then regenerate the lockfile and verify:

```sh
pnpm install --no-frozen-lockfile
pnpm install --frozen-lockfile   # the CI scenario must pass
pnpm build && pnpm typecheck
```

Run the examples you touch and smoke-test them in a real browser before
pushing. Pull requests into the `-next` branch run the `quality` check only, so
their CI result is meaningful. The `merge-gate` check runs on pull requests
into `main` and rejects the committed `.npmrc` and the pre-release versions:
**the `-next` branch cannot be merged into `main` until step 4 is done.**

Known pnpm behavior (no setting can change it): the insider registry's
metadata reports `registry.npmjs.org` tarball URLs, so pnpm records absolute
`tarball:` fields for Univer packages in `pnpm-lock.yaml`. Do **not** hand-edit
the lockfile to remove them; they are canonical public URLs and are rewritten
naturally on the next re-resolution.

### 4. After upstream promotes the release to the public registry

1. Confirm every `@univerjs` / `@univerjs-pro` package used by the examples is
   on the public registry (`npm view <pkg>@<version>`).
2. Replace the pre-release versions from step 2 with the released ones, delete
   the `.npmrc` and reinstall:

   ```sh
   git rm .npmrc
   pnpm install --no-frozen-lockfile
   ```

3. Verify the lockfile did not drift: the package set and every integrity hash
   must be identical to the pre-promotion lockfile, because the promoted
   tarballs are bit-identical. (Recorded tarball URLs, if any, already point at
   the public registry and stay valid.)
4. `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, then
   commit and push.

### 5. Merge

Open the pull request against `main`. Both CI checks must be green (`quality`
and `merge-gate`), then squash-merge it and delete the branch. The next
`-next` branch is created only when the first change that needs an unreleased
SDK is ready. To turn the `merge-gate` check into a hard block, a repository
admin must add it to the branch protection required status checks.

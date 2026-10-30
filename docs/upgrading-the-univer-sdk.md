# Upgrading the Univer SDK

> **Internal workflow notice.** This document describes the internal upgrade
> workflow of the `univer-collaboration-examples` repository. It is **not** an
> external example or tutorial: it assumes maintainer access to the upstream
> insider npm registry and to this repository's CI settings, and it is not
> meant to teach general Univer usage. For usage examples, see the directories
> under `examples/`.

The branch policy in [AGENTS.md](../AGENTS.md) applies: `main` targets the
currently published SDK, `next/*` branches collect upgrades, and each
example's `package.json` pins exact SDK versions.

## Workflow

### 1. Create the upgrade branch

```sh
git fetch origin && git checkout main && git merge --ff-only origin/main
git checkout -b next/<version>   # e.g. next/1.3.1
```

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
pushing. While the insider `.npmrc` is committed, the `merge-gate` CI check
stays red on purpose: **the branch must not be merged while a private
registry is configured.**

Known pnpm behavior (no setting can change it): the insider registry's
metadata reports `registry.npmjs.org` tarball URLs, so pnpm records absolute
`tarball:` fields for Univer packages in `pnpm-lock.yaml`. Do **not** hand-edit
the lockfile to remove them; they are canonical public URLs and are rewritten
naturally on the next re-resolution.

### 4. After upstream promotes the release to the public registry

1. Confirm every `@univerjs` / `@univerjs-pro` package used by the examples is
   on the public registry (`npm view <pkg>@<version>`).
2. Delete the `.npmrc` and reinstall:

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

Both CI checks must be green (`quality` and `merge-gate`), then squash-merge
the pull request into `main` and delete the branch. To turn the `merge-gate`
check into a hard block, a repository admin must add it to the branch
protection required status checks.

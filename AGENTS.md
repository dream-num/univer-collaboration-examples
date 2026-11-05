# Branch policy

- `main` is the only long-lived branch. It depends only on publicly released SDK packages, never
  carries an `.npmrc`, and can always be installed from the public npm registry.
- A change that works against the published SDK goes to `main` directly, whatever it is: a new
  example, a fix, documentation, or an upgrade to an SDK version that is already public.
- A change that needs an SDK version that is not on the public registry yet goes to the
  `<version>-next` branch, named after the currently published SDK version (for example `1.3.1-next`
  while 1.3.1 is the published SDK). It is created when the first such change is ready, collects
  everything that waits for the next SDK release, and is the only such branch at a time. There is no
  permanent `dev` branch.
- The `-next` branch commits a scoped `.npmrc` pointing `@univerjs` / `@univerjs-pro` at the
  insider registry (which also proxies the public registry) and pins insiders versions. Feature
  branches for such changes start from the `-next` branch and open pull requests against it, so they
  inherit the `.npmrc`.
- When the SDK version the `-next` branch waits for is on the public registry: on that branch,
  replace the insiders versions with the released ones, delete the `.npmrc` and reinstall (the
  promoted tarballs are bit-identical, so `pnpm-lock.yaml` keeps its integrity hashes), then open a
  pull request to `main`, merge it and delete the branch. When the SDK publishes a version the branch
  does not wait for, such as a patch release, `main` upgrades on its own and the `-next` branch merges
  `main` and is renamed after the new published version. The procedure is in
  `docs/upgrading-the-univer-sdk.md`.
- The CI `merge-gate` check runs on pull requests targeting `main` and on `main` itself. It fails
  while a committed `.npmrc` points at a non-public registry or any `@univerjs` / `@univerjs-pro`
  dependency has a pre-release version, so the `-next` branch cannot reach `main` before its
  dependencies are public. Pull requests into the `-next` branch do not run it.
- Feature branches are short-lived, start from the branch they target, and are deleted after merging.
- Each example's `package.json` defines its exact SDK versions.

# Branch policy

- `main` is the only long-lived branch and targets the current publicly released SDK.
- `next/*` branches collect upgrades and features for upcoming releases and may install insiders dependencies.
- A `next/*` branch may commit a scoped `.npmrc` pointing `@univerjs` / `@univerjs-pro` at the insider registry (which also proxies the public registry). Never merge that `.npmrc` into `main`: when the SDK is promoted to the public registry the tarballs are bit-identical and the lockfile records only integrity hashes, so deleting the `.npmrc` and reinstalling keeps `pnpm-lock.yaml` unchanged.
- The insider bridge reports npmjs `dist.tarball` URLs in its package metadata, so pnpm records absolute tarball URLs for `@univerjs` packages on every resolution; it has no setting to suppress this. After any non-frozen install on a `next/*` branch, strip those `, tarball: https://registry.npmjs.org/...` fields from `pnpm-lock.yaml` (keeping integrity) so the committed lockfile stays registry-agnostic.
- Create short-lived feature branches from the appropriate baseline, target that baseline in pull requests, and delete feature branches after merging.
- Once the corresponding SDK version is publicly released, merge the next branch into `main` and delete it. Do not maintain a permanent `dev` branch.
- Each example's `package.json` defines its exact SDK versions.

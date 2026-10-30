# Branch policy

- `main` is the only long-lived branch and targets the current publicly released SDK.
- `next/*` branches collect upgrades and features for upcoming releases and may install insiders dependencies.
- A `next/*` branch may commit a scoped `.npmrc` pointing `@univerjs` / `@univerjs-pro` at the insider registry (which also proxies the public registry). Never merge that `.npmrc` into `main`: when the SDK is promoted to the public registry the tarballs are bit-identical and the lockfile records only integrity hashes, so deleting the `.npmrc` and reinstalling keeps `pnpm-lock.yaml` unchanged.
- A CI `merge-gate` check fails while any committed `.npmrc` points at a non-public registry. The pull request must not be merged until every npm package has been promoted to the public registry and the private registry configuration has been removed.
- Create short-lived feature branches from the appropriate baseline, target that baseline in pull requests, and delete feature branches after merging.
- Once the corresponding SDK version is publicly released, merge the next branch into `main` and delete it. Do not maintain a permanent `dev` branch.
- Each example's `package.json` defines its exact SDK versions.

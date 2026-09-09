# Branch policy

- `main` is the only long-lived branch and targets the current publicly released SDK.
- `next/*` branches collect upgrades and features for upcoming releases and may install insiders dependencies.
- Create short-lived feature branches from the appropriate baseline, target that baseline in pull requests, and delete feature branches after merging.
- Once the corresponding SDK version is publicly released, merge the next branch into `main` and delete it. Do not maintain a permanent `dev` branch.
- Each example's `package.json` defines its exact SDK versions.

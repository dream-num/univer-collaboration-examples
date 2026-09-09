# Branch policy

- `main` is the only long-lived branch. It currently targets the publicly released `1.0.0-beta.2` SDK; fixes compatible with that version target `main`.
- `next/post-1.0.0-beta.2` collects SDK upgrades and features after `1.0.0-beta.2`. It may install internal insiders versions through `.npmrc`; related pull requests target this branch.
- Create short-lived feature branches from the appropriate target branch and delete them after merging.
- When the next public release containing these changes is available, update the version baseline, merge `next/post-1.0.0-beta.2` into `main`, and delete the next branch. Do not maintain a permanent `dev` branch.

# Branch policy

- `dev` is the development branch and may install internal insiders versions through `.npmrc`. Target `dev` for daily development and pull requests.
- `main` only depends on the latest packages published on public npm. Sync changes from `dev` to `main` after the required versions are publicly released.

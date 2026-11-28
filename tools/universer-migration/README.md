# Universer migration

English | [简体中文](./README.zh-CN.md)

Universer is Univer's earlier collaboration server, delivered as Docker images and connected to business
systems through USIP. New collaboration features are built on the Univer Collaboration SDK. This tool is
for deployments that already store documents in Universer and are moving to the SDK; **if you start with
the SDK directly, you do not need it.**

It migrates Universer data into the Univer Collaboration PostgreSQL + S3 storage
([`@univerjs-pro/collaboration-database-postgres-s3`](https://www.npmjs.com/package/@univerjs-pro/collaboration-database-postgres-s3)).
After the migration every document keeps its content, edit history, revision numbers, creator and
times, so clients continue collaborating without any change to the data.

## Scope

- Source: **Universer 1.6.2** with a PostgreSQL database and S3-compatible storage.
  Upgrade older versions to 1.6.2 with the Universer upgrade procedure first.
- Target: the Univer Collaboration SDK of the **same version** as this tool, pinned in
  [`package.json`](./package.json) (currently 1.6.2). For an older SDK, check out the commit of this
  repository that pins that version.
- Node.js 24 or later and pnpm.

## What is migrated

| Data | Handling |
| --- | --- |
| Documents (Sheet, Doc, Slide, Board, Base, PDF) | Every snapshot and every change, with revision numbers, authors and times unchanged |
| Cell data | Written to the target bucket; identical blocks are stored once |
| Images, PDFs and other files | Not copied; registered with the SDK file service under the same file ID |
| Comments | Migrated with their authors and times |
| Documents in the trash | Stay in the trash and can be restored |
| Permanently deleted documents | Not migrated; their IDs are listed in the result file and must not be reused |
| Edit history list | Not migrated; the SDK builds it from the changes on first query |
| Permissions and collaborators | Not migrated; the business system keeps providing them |

The tool only reads Universer and never changes its data.

## How it works

For each document the tool:

1. **Reads** every snapshot, cell block, change, comment and referenced file from the Universer database
   and bucket.
2. **Creates** the document in the target with its first snapshot.
3. **Writes the changes** in order, keeping their original times.
4. **Writes the remaining snapshots**.
5. **Writes comments and registers files**.
6. **Verifies** by reading the document back from the target and replaying it to its head revision
   with the SDK runtime.
7. **Restores the trash state**: a document in the Universer trash is put in the target trash.

Each document's outcome is written to the result file. Running again is safe: a migrated document only
receives the revisions it is missing.

## Recommended cutover

1. **Pre-migrate** everything while Universer keeps running.
2. **Stop writes**: stop Universer and its collaboration services, keep the database and bucket.
3. **Migrate again**: only the changes made after the pre-migration are written.
4. **Switch** the clients to the Univer Collaboration service. Both servers speak the same protocol, so
   usually only the service address changes. Configure the SDK file service with the Universer bucket so
   migrated files stay reachable.
5. **Observe**: keep the Universer database and bucket for a while as a fallback.

## Usage

```bash
git clone https://github.com/dream-num/univer-collaboration-examples.git
cd univer-collaboration-examples
pnpm install

export UNIVERSER_DATABASE_URL='postgres://user:password@universer-db:5432/univer'
export UNIVERSER_S3_ENDPOINT='http://minio:9000'
export UNIVERSER_S3_BUCKET='univer'
export UNIVERSER_S3_PATH_STYLE='true' # Match Universer's usePathStyle (false by default; true for MinIO)
export UNIVERSER_S3_ACCESS_KEY_ID='…'
export UNIVERSER_S3_SECRET_ACCESS_KEY='…'

export TARGET_DATABASE_URL='postgres://user:password@collab-db:5432/collaboration'
export TARGET_S3_ENDPOINT='http://minio:9000'
export TARGET_S3_BUCKET='collaboration'
export TARGET_S3_PATH_STYLE='true' # false by default (AWS S3, Aliyun OSS); true for MinIO
export TARGET_BLOCK_PREFIX='blocks'
export TARGET_S3_ACCESS_KEY_ID='…'
export TARGET_S3_SECRET_ACCESS_KEY='…'

cd tools/universer-migration

# Read-only check, writes nothing to the target
pnpm migrate --dry-run

# Migrate
pnpm migrate --manifest migration.jsonl
```

| Option | Description |
| --- | --- |
| `--dry-run` | Read and check the source only, write nothing |
| `--unit <id>` | Migrate only this document; repeatable |
| `--concurrency <n>` | Documents migrated at the same time, default 4 |
| `--no-verify` | Skip the replay verification |
| `--no-block-dedupe` | Store identical cell blocks separately |
| `--default-creator <id>` | User ID recorded when the creator is empty, default `universer-migration` |
| `--manifest <path>` | Result file, default `universer-migration-manifest.jsonl` |

Database and storage addresses can also be passed with the matching `--source-*` and `--target-*`
options; keys are read from the environment only. Run with `--help` for every option.

## Result file

Each line of the result file is a JSON object:

- `kind: "unit"`: one document. `status` is `migrated`, `resumed` (missing revisions were added),
  `up-to-date` (nothing to write), `checked` (`--dry-run`), `skipped` (Universer is permanently deleting
  it) or `failed` (see `error`). `missingFiles` lists files the document refers to that Universer no
  longer has.
- `kind: "hard-deleted"`: IDs of documents permanently deleted in Universer. Do not reuse them for new
  documents.

The command exits with a non-zero status when any document fails. Fix the cause and run it again;
documents that are done are not written twice.

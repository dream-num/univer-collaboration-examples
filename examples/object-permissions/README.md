# Object Permissions

English | [简体中文](./README.zh-CN.md)

Shows how an application enforces in-document (object-level) permissions: worksheet protection and
range protection inside a collaborative Sheet. The collaboration Service computes which
`UnitObject + UnitAction` each mutation requires; the application owns the ACL and decides.

```bash
pnpm example:object-permissions
```

Open <http://127.0.0.1:3010>. Three demo accounts are provided: Alice is the document creator,
Bob is an editor, and Casey is a viewer. Switching accounts writes a local demo Cookie; production
applications should replace it with their own Session or Bearer token.

## Try it

1. Sign in as **Alice**, select B2:B3, and add a range protection from the toolbar
   or the sheet bar, keeping Alice as the only editor.
2. Sign in as **Bob**: he can still edit the rest of the sheet, but the protected range rejects his
   edits — the Service refuses his changeset with `PERMISSION_DENIED`, not just the UI.
3. Edit the range policy as Alice and add Bob as an editor of the object; Bob can then edit the
   range. Policy edits apply to new submissions immediately.
4. Restart the server: protections survive because the ACL lives in
   `.data/collaboration.sqlite` next to the collaboration data.

Watch the browser Network tab for `batch_allowed` calls — the client uses them to render the
toolbar state. Client hints are never the security boundary: the same policy function answers
those queries and rejects mutations server-side.

## Where to look

- `server/main.ts` — turns on `enableUnitPermissionAnalysis` and enforces
  `context.requiredUnitPermissions` in the `applyChangeset` middleware. Requirements are AND-ed;
  for Worksheet and SelectRange the `objectID` is the protection rule's `permissionId`, not a
  worksheet ID or range address. An empty requirement list never means "allowed".
- `server/authz.ts` — the authz HTTP contract the client permission panel calls under `authzUrl`:
  batched permission checks, object create/update, and collaborator management.
- `server/acl.ts` — the application-owned ACL: permission objects, strategies, scopes, and
  collaborators, persisted in two tables.
- `server/permissions.ts` — the Unit-level role policy, which object checks stack on top of.
- `web/main.ts` — opts in with `objectPermissionTypes: [UnitObject.Worksheet, UnitObject.SelectRange]`
  and points `authzUrl` at the application. The protection dialogs ship with `@univerjs/sheets-ui`;
  no extra plugin is needed.

## Notes

- Doc, Slide, Board, and Base reuse the same protocol payloads with their own object types; the
  `applyChangeset` middleware pattern is identical once their object types are added.
- After a commit, `changesetCommitted.requiredUnitPermissions` lets the application activate
  pending permission objects. Do not garbage-collect an ACL from a single commit — undo/redo and
  history restore can reference the same `permissionId` again.
- This example keeps Sheet objects only and skips policy-change push notifications; connected
  clients pick up policy edits on their next permission query.

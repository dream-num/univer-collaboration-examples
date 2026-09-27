# Object Permissions

English | [简体中文](./README.zh-CN.md)

## Overview

This example shows worksheet protection and range protection in a collaborative Sheet. The file role decides who can view or edit the document as a whole. A protection object then restricts one worksheet or one range inside it. The file-role setup is in [`permissions`](../permissions/README.md).

## Run

```bash
pnpm example:object-permissions
```

Open <http://127.0.0.1:3010>. The four accounts match [`permissions`](../permissions/README.md): Alice is the creator, Bob is an editor, Casey is a viewer, and Dana can sign in but has no role on the file. Switching accounts writes a local demo cookie.

Collaboration data and the ACL both live in `.data/collaboration.sqlite`. After a restart, protections and file roles are still there. Roles are an in-memory `Map` today; when you move them to a database, keep the role table together with the ACL tables.

## Try it

### Create a range protection

Sign in as Alice and select B2:B3. Add a range protection from Protection on the toolbar, or from the sheet tab. A panel titled Protect Rows and Columns opens on the right. Keep the default: only I can edit, and others can view.

The client sends:

`POST /universer-api/authz/3/object`

`3` in the path is `UnitObject.SelectRange`. Worksheet protection is `2`.

```json
{
  "objectType": 3,
  "selectRangeObject": {
    "unitID": "object-permissions-sheet",
    "name": "",
    "collaborators": [],
    "scope": { "read": 1, "edit": 2 }
  }
}
```

`read: 1` means every collaborator can view. `edit: 2` means only the creator can edit. To let Bob edit, set `edit` to `0` and include Bob in `collaborators` with `role` `1` (Editor).

The application stores the ACL, records the current user as the creator, and returns:

```json
{ "error": { "code": 1, "message": "" }, "objectID": "<new permissionId>" }
```

After you confirm in the panel, the client binds B2:B3 to this `objectID` with a changeset. The range address is in that changeset.

Adding a person in the panel loads file members:

`GET /universer-api/authz/collaborator?unitID=object-permissions-sheet&objectID=object-permissions-sheet`

When `objectID` equals `unitID`, return file members, not the people on one range. `id` is the userID.

### Verify

1. Switch to Bob. He can still edit the rest of the sheet. Editing B2 is rejected with `PERMISSION_DENIED`. Editing A1 saves.
2. As Alice, edit the range policy and add Bob as an editor of the object. Bob can then edit B2. New submissions follow the new policy immediately. An already open page refreshes its toolbar on the next `batch_allowed`.
3. Switch to Casey. She cannot edit the sheet, because the file role has no Edit. A grant on the range does not override that.
4. Restart the server and open the file as Bob again. The protection is still there.

UI hiding alone still accepts a forged submission. The check in `commitChangeset` is the security boundary.

## SDK and application boundary

| SDK | Application |
| --- | --- |
| Analyzes the permission points the submitted changeset needs, for the application to check | Stores protection objects, strategies, scope, and collaborators, and decides with `isObjectActionAllowed` |
| The Protect Rows and Columns panel in `@univerjs/sheets-ui` | HTTP under `authzUrl` |

## Add it to your service

| Example file | In your project |
| --- | --- |
| `web/main.ts` | Add `authzUrl` and `objectPermissionTypes` to the collaboration plugin, and set the current user's `userID` to the same value the server uses |
| `server/permissions.ts` | File roles. Replace the in-memory `Map` with your user system. The action split is in [`permissions`](../permissions/README.md) |
| `server/acl.ts` | Storage for protection objects, and `isObjectActionAllowed`. The tables can change; keep this function's rules first |
| `server/authz.ts` | HTTP mounted under `authzUrl` |
| `server/main.ts` | Identity, the three file-level hooks, `enableUnitPermissionAnalysis`, and `commitChangeset` |

The cookie in `server/users.ts` is only for the demo.

### 1. Use the same userID on both sides

```ts
transport.use(async (context, next) => {
  const user = currentUser(context.incomingMessage);
  if (!user) {
    context.response.statusCode = 401;
    context.response.end("Sign in first");
    return;
  }
  context.userID = user.userId;
  await next();
});
```

```ts
univer.__getInjector().get(UserManagerService).setCurrentUser({
  userID: user.userId,
  name: user.username,
  avatar: user.avatar,
});
```

```ts
authzUrl: `${location.protocol}//${location.host}/universer-api/authz`,
objectPermissionTypes: [UnitObject.Worksheet, UnitObject.SelectRange],
```

Set `objectPermissionTypes`. Include `UnitObject.Worksheet` for worksheet protection and `UnitObject.SelectRange` for range protection.

This step is done when an anonymous collaboration call returns 401, and every later permission request carries that signed-in user.

### 2. Add file roles first

Range protection sits on the file role. The three hooks match [`permissions`](../permissions/README.md). The role function here is `isUnitActionAllowed`:

```ts
service.use("readUnitData", async (context, next) => {
  if (!isUnitActionAllowed(context.userID, context.request.unitID, UnitAction.View))
    throw new CollabError("PERMISSION_DENIED", "Cannot read this Unit");
  await next();
});
service.use("submitChangeset", async (context, next) => {
  if (!isUnitActionAllowed(context.userID, context.request.changeset.unitID, UnitAction.Edit))
    throw new CollabError("PERMISSION_DENIED", "Cannot edit this Unit");
  await next();
});
endpoint.use("joinUnit", async (context, next) => {
  if (!isUnitActionAllowed(context.session.userID, context.unitID, UnitAction.View))
    throw new CollabError("PERMISSION_DENIED", "Cannot join this Unit");
  await next();
});
```

This step is done when Casey's edit of any cell is rejected, before any range protection exists.

### 3. Implement batch_allowed

The route is mounted in `server/main.ts`:

```ts
app.use("/universer-api/authz", express.json({ limit: "64kb" }), createAuthzRouter({ store: acl, requireUser }));
```

When `objectID` equals `unitID`, answer from the file role. The request shape is in [`permissions`](../permissions/README.md). A protection object goes through `isObjectActionAllowed` in `server/acl.ts`. The toolbar follows this response. It does not replace the submission check in step 5.

### 4. Implement the routes the Protect Rows and Columns panel calls

Adding a range protection from Protection on the toolbar, or from the sheet tab, makes this panel call the routes in `server/authz.ts`:

| Method | Path | When |
| --- | --- | --- |
| POST | `/-/object/-/batch_allowed` | Opening the file, and refreshing buttons and protection state |
| POST | `/-/object/list` | Reading existing protection objects |
| POST | `/:objectType/object` | Creating a range or worksheet protection |
| PUT | `/:objectType/object/:objectId` | Changing the range, the switches, or the editor list |
| GET | `/collaborator` | Loading candidates for the people picker |

On `PUT`, an empty `strategies` array keeps the previous strategies. This example checks `body.strategies.length`. People, range, and switches all travel on create and update. There is no separate collaborator-write route.

Worksheet action switches (copy, edit values, insert rows and columns, and so on) use `PUT`, one strategy per action: on means `role` `1` (Editor), off means `role` `2` (Owner). There is no comment switch.

### 5. Reject submissions with the same function

Turn on `enableUnitPermissionAnalysis` when constructing the Service. The Service analyzes the permission points the submitted changeset needs, for the application to check in `commitChangeset`. The result is attached to this middleware before the adapter writes. See `server/main.ts`:

```ts
const service = new UniverCollabService({
  dbAdapter: database,
  enableUnitPermissionAnalysis: true,
});

service.use("commitChangeset", async (context, next) => {
  for (const requirement of context.requiredUnitPermissions) {
    const granted = isObjectActionAllowed(acl, context.userID, {
      unitID: requirement.unitID,
      objectID: requirement.objectID,
      objectType: requirement.objectType,
      action: requirement.action,
    });
    if (!granted) {
      throw new CollabError("PERMISSION_DENIED", "Permission denied");
    }
  }
  await next();
});
```

The flag is off by default. While it is off, and when an enabled submission has no object-level requirement, `requiredUnitPermissions` is an empty array. The loop has nothing to reject, so the edit proceeds. With the flag off, Bob can edit B2. The file-level read, join, and submit hooks still run.

With the flag on, one requirement of Bob's edit to B2 has the `permissionId` returned when that range was created as `objectID`, and Edit as `action`. `isObjectActionAllowed` returns false, and the whole changeset is rejected. His edit to A1 is a workbook Edit. The file role allows it, and the write succeeds.

Keep a single `isObjectActionAllowed`. A protection object's `objectID` is the `permissionId` returned when it was created.

1. `objectID === unitID`: use the file role only.
2. Every other action checks the file role first. A viewer has no file Edit, so a grant on the range does not help.
3. The creator is always Owner of the object.
4. View: when `scope.read` is all collaborators, file members can view.
5. Edit: when `scope.edit` is all collaborators, file editors can edit; when it is only the creator, only the creator can edit; when it names people, only Editors in `collaborators` can edit.
6. The minimum role for an action comes from the strategies stored on the object. Without a strategy, View, Copy, Comment, and ViewHistory default to Reader; ManageCollaborator and Delete default to Owner; other actions default to Editor.

### Acceptance

1. An anonymous call to a collaboration API returns 401.
2. After Casey signs in she cannot edit. Her submission returns `PERMISSION_DENIED`.
3. Alice protects B2:B3. The network panel shows `POST /universer-api/authz/3/object`, and the response includes `objectID`.
4. Bob's edit of B2 is rejected. His edit of A1 saves.
5. Alice adds Bob as an editor of that range. Bob's next edit of B2 saves.
6. After a restart, Bob still sees the protection.

## Notes

Doc, Slide, Board, and Base reuse the same protocol payloads with different object types. After you add the matching `objectPermissionTypes`, the `commitChangeset` check is the same.

Deleting a protection, undo, or restoring history can send the original `permissionId` again. Do not drop the ACL row because one submission contained a delete. After a successful commit, `changesetCommitted.requiredUnitPermissions` can activate a pending permission object.

This example covers Sheet objects only, and it does not push policy changes. To make a connected client see a new policy immediately, tell it to reload permissions, or disconnect its collaboration session.

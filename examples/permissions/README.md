# Permissions

English | [简体中文](./README.zh-CN.md)

## Overview

The application resolves the current user from the request and uses Collaboration Service middleware to enforce file permissions: who may read the Unit, join the room, and submit changes. The application defines the roles. The SDK provides these hooks and does not store roles.

## Run

```bash
pnpm example:permissions
```

Open <http://127.0.0.1:3010>.

| Account | userID | Role | On the whole file |
| --- | --- | --- | --- |
| Alice | `user-alice` | creator | View, edit, manage collaborators, and delete |
| Bob | `user-bob` | editor | View and edit |
| Casey | `user-casey` | viewer | View, copy, comment, and view history |
| Dana | `user-dana` | none | Can sign in. Reading the file and joining the room are rejected |

Switching accounts writes a local demo cookie. The application resolves `userID` from its own cookie, Session, or token, then passes that id to the collaboration service.

The collaborative Unit is stored in `.data/collaboration.sqlite` and reused after a restart. Roles live in an in-memory `Map` in `server/permissions.ts`, so they also survive a restart. When you move them to a database, keep that table on its own.

## Try it

1. Sign in as Alice and edit any cell. The edit saves.
2. Switch to Casey. The edit button is unavailable. A submission that bypasses the UI is rejected with `PERMISSION_DENIED`.
3. Switch to Dana. Sign-in succeeds. Reading the Unit and joining the room are both rejected.

The edit button follows a permission query the client receives. Reading the file, joining the room, and submitting changes are rejected by server middleware.

## SDK and application boundary

| SDK | Application |
| --- | --- |
| `readUnitData`, `submitChangeset`, `joinUnit` | Writes `context.userID` before collaboration logic runs |
| The client's `batch_allowed` request shape | Fills each `allowed` with `isAllowed` |
| Does not store roles | The role map and action sets in `server/permissions.ts` |

A viewer may View, Copy, Comment, and ViewHistory. An editor and the creator may also Edit, including sheet structure and cell operations. ManageCollaborator and Delete belong to the creator. Any action outside these sets returns false. `isAllowed` answers both `batch_allowed` and the three hooks.

## Add it to your service

The cookie in `server/users.ts` is only for the demo. In your service, resolve `userID` from your own cookie, Session, or token, and replace the in-memory role `Map` with your user system.

Write the trusted user before collaboration logic runs. See `server/main.ts`:

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

After Univer is created, set the current user. `userID` must equal `context.userID` above. See `web/main.ts`:

```ts
univer.__getInjector().get(UserManagerService).setCurrentUser({
  userID: user.userId,
  name: user.username,
  avatar: user.avatar,
});
```

Point the collaboration plugin at your permission HTTP API:

```ts
authzUrl: `${location.protocol}//${location.host}/universer-api/authz`,
```

Register three hooks on the Collaboration Service:

```ts
service.use("readUnitData", async (context, next) => {
  if (!isAllowed(context.userID, context.request.unitID, UnitAction.View))
    throw new CollabError("PERMISSION_DENIED", "Cannot read this Unit");
  await next();
});
service.use("submitChangeset", async (context, next) => {
  if (!isAllowed(context.userID, context.request.changeset.unitID, UnitAction.Edit))
    throw new CollabError("PERMISSION_DENIED", "Cannot edit this Unit");
  await next();
});
endpoint.use("joinUnit", async (context, next) => {
  if (!isAllowed(context.session.userID, context.unitID, UnitAction.View))
    throw new CollabError("PERMISSION_DENIED", "Cannot join this Unit");
  await next();
});
```

The three hooks are the security boundary. The client also queries permissions, and uses the answer only to enable or disable toolbar buttons. When the sheet opens it calls:

`POST /universer-api/authz/-/object/-/batch_allowed`

```json
{
  "requests": [
    {
      "unitID": "permissions-sheet",
      "objectID": "permissions-sheet",
      "objectType": 1,
      "actions": [0, 1, 5]
    }
  ]
}
```

`objectType: 1` is the workbook. When `objectID` equals `unitID`, the answer comes from the file role. For Casey, View (`0`) and Comment (`5`) are `allowed: true`, and Edit (`1`) is `allowed: false`.

```json
{
  "error": { "code": 1, "message": "" },
  "objectActions": [
    {
      "unitID": "permissions-sheet",
      "objectID": "permissions-sheet",
      "actions": [
        { "action": 0, "allowed": true },
        { "action": 1, "allowed": false },
        { "action": 5, "allowed": true }
      ]
    }
  ]
}
```

`error.code` of `1` means success. Button state follows this response. The handler calls the same `isAllowed` as the three hooks:

```ts
app.post("/universer-api/authz/-/object/-/batch_allowed", express.json(), (request, response) => {
  const user = currentUser(request);
  if (!user) return void response.sendStatus(401);
  // Call isAllowed for each action and return allowed.
});
```

This step is done when an anonymous call to a collaboration API returns 401, Casey's edit is rejected, and Dana cannot read the file or join the room.

## Notes

This example answers file-level checks and `batch_allowed` for the workbook itself. Worksheet and range protection sit on top of this role. See [`object-permissions`](../object-permissions/README.md).

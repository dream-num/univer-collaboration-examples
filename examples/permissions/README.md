# Permissions

English | [简体中文](./README.zh-CN.md)

Shows how an application passes trusted user identity to the collaboration service and protects Unit reads, real-time rooms, and changeset submission on the server.

```bash
pnpm example:permissions
```

Open <http://127.0.0.1:3010>. The page provides two fixed demo accounts: `editor` can edit, while `viewer` can only read. Switching accounts writes a local demo Cookie; production applications should replace it with their own Session or Bearer token.

Identity extraction, both roles, and every permission check are written sequentially in `server/main.ts`. All authorization decisions happen on the server; frontend hints are not a security boundary.

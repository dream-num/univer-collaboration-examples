# History

English | [简体中文](./README.zh-CN.md)

Adds the History Service, History Endpoint, and browser history entry alongside the basic collaboration path.

```bash
pnpm example:history
```

Open <http://127.0.0.1:3010/?unit=history-sheet&type=2>, edit the Sheet, and click `History` at the top of the page to view versions. This example deliberately treats History as an optional derived capability: `server/main.ts` assembles core first, passes it to the History Service through `collabService`, and registers authentication → History Endpoint → Collaboration Endpoint in that order.

The History index and core data use different Adapters that share
`.data/collaboration.sqlite` in this example. Both survive restarts and must be included in
production persistence and backup policies.

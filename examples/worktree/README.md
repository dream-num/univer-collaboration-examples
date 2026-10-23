# Worktree

English | [简体中文](./README.zh-CN.md)

A Worktree is an isolated draft of one or more Units, made for agent editing with human review: an
agent edits the draft over as many rounds as it needs and marks it Ready; a human reviews the result
through Web and decides whether it enters trunk. See
[Worktree: agent editing and human review](https://docs.univer.ai/ai/worktree) for the complete
workflow; this example shows only the draft collaboration path and the lifecycle actions.

```bash
pnpm example:worktree
```

Open <http://127.0.0.1:3010/?unit=worktree-sheet&worktree=demo-worktree>. The example creates the
fixed `demo-worktree` in draft. The page plays both roles: the Agent action (Mark ready) and the
Reviewer actions (Merge, Reopen, Discard) are separate groups, and only the actions the current status
allows are enabled. Trunk and Draft switch the view, and the status line says what to do next.

```text
create → draft → ready → merged
           ↑       │
           └ reopen┘
draft / ready → discarded
```

| Status | Meaning | Available actions |
| --- | --- | --- |
| draft | Being edited; trunk does not see these changes | Ready, Discard |
| ready | Frozen for review; edits are rejected | Merge, Reopen, Discard |
| merged | The draft's changes are in trunk; final | none |
| discarded | The draft's changes were abandoned; trunk is unchanged; final | none |

Ready and Merge are separate steps on purpose: Ready freezes what the agent produced and marks the
review boundary; Merge is the reviewer's decision. Reopen returns a ready draft for another round;
Discard abandons the draft without touching trunk. Merged and discarded survive restarts, so to run
the lifecycle again stop the server, run `pnpm --filter @univerjs/collaboration-example-worktree reset`
to delete `.data`, and start it again.

Read only `server/main.ts` and `web/main.ts`. Worktree has its own Service, Adapter, and collaboration
path and shares only the one-time ticket store with the trunk Endpoint. The trunk and Worktree SQLite
Adapters share `.data/collaboration.sqlite`; both data and Worktree status survive server restarts.

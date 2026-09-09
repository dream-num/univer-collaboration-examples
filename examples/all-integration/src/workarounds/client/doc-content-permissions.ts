import type { IDocumentBody, IDocumentData, JSONXActions, Univer } from "@univerjs/core";
import {
  CustomCommandExecutionError,
  DocumentDataModel,
  ErrorService,
  ICommandService,
  IPermissionService,
  IUniverInstanceService,
  JSON1,
  JSONX,
  UniverInstanceType,
} from "@univerjs/core";
import {
  canEditDocumentTargets,
  getDocumentEntityParentPermissionObjectIds,
  getDocumentEntityPermissionObjectId,
  RichTextEditingMutation,
} from "@univerjs/docs";

/**
 * TODO：1.0.0-insiders.20260909-a4091ba 的 DocPermissionController 仍把 blockId 只映射为 custom-block，且未解析
 * tableSource 的 JSONX 分支。上游完整覆盖这两类路径后删除本文件与注册点。
 * 补充目标定位，权限值与父级关系继续使用公开 SDK；不替换或简化已有 controller。
 * 来源：@univerjs/docs/controllers/doc-permission.controller 与 document-permission-resolver。
 * 服务端独立校验，不能依赖此客户端拦截作为授权边界。
 */
export function installDocContentPermissionsWorkaround(univer: Univer) {
  const injector = univer.__getInjector();
  const instances = injector.get(IUniverInstanceService);
  const permissions = injector.get(IPermissionService);
  return injector.get(ICommandService).beforeCommandExecuted((command, options) => {
    if (options?.fromCollab || options?.fromChangeset) return;
    const richText = command.id === RichTextEditingMutation.id;
    const blockCommand = /^docs-(code|callout)\.(command|mutation)\./.test(command.id);
    if (!richText && !blockCommand) return;
    const params = record(command.params) ? command.params : undefined;
    if (!params) return;
    const unitId =
      typeof params.unitId === "string"
        ? params.unitId
        : typeof options?.unitId === "string"
          ? options.unitId
          : instances.getCurrentUnitOfType(UniverInstanceType.UNIVER_DOC)?.getUnitId();
    const document =
      unitId && instances.getUnit<DocumentDataModel>(unitId, UniverInstanceType.UNIVER_DOC);
    if (!document) return;
    const targets = new Set<string>();
    const add = (model: DocumentDataModel, segmentId: string, type: string, id: string) => {
      targets.add(getDocumentEntityPermissionObjectId(segmentId, type, id));
      getDocumentEntityParentPermissionObjectIds(model, segmentId, type, id).forEach((parent) =>
        targets.add(parent),
      );
    };
    if (blockCommand) {
      const ids = new Set<string>();
      // 支持单个与批量 blockId，父级来自实际锚点，不信任参数的 segmentId。
      const collect = (value: unknown, key = "") => {
        if (typeof value === "string" && (key === "blockId" || key === "blockIds")) ids.add(value);
        else if (Array.isArray(value)) value.forEach((item) => collect(item, key));
        else if (record(value))
          Object.entries(value as Record<string, unknown>).forEach(([name, item]) =>
            collect(item, name),
          );
      };
      collect(params);
      for (const [segmentId, body] of segments(document)) {
        for (const block of body.blockRanges ?? []) {
          if (ids.has(block.blockId)) add(document, segmentId, "block-range", block.blockId);
        }
      }
    }
    let projected: DocumentDataModel | undefined;
    try {
      if (richText) {
        const actions = params.actions as JSONXActions;
        const cursor = JSON1.type.readCursor(actions);
        let touchesTables = false;
        cursor.traverse(null, () => {
          if (cursor.getPath()[0] === "tableSource") touchesTables = true;
        });
        if (touchesTables) {
          const before = document.getSnapshot();
          const next = JSONX.apply(structuredClone(before), actions) as unknown as IDocumentData;
          projected = new DocumentDataModel(next);
          const ids = new Set(
            [
              ...Object.keys(before.tableSource ?? {}),
              ...Object.keys(next.tableSource ?? {}),
            ].filter((id) => !equalJson(before.tableSource?.[id], next.tableSource?.[id])),
          );
          for (const model of [document, projected]) {
            for (const [segmentId, body] of segments(model)) {
              for (const table of body.tables ?? []) {
                if (ids.has(table.tableId)) add(model, segmentId, "table", table.tableId);
              }
            }
          }
        }
      }
      if (!canEditDocumentTargets(permissions, document.getUnitId(), [...targets])) {
        injector.get(ErrorService).emitPermissionDenied(document.getUnitId(), [...targets]);
        throw new CustomCommandExecutionError("Document content permission denied.");
      }
    } finally {
      projected?.dispose();
    }
  });
}

function segments(document: DocumentDataModel): Array<[string, IDocumentBody]> {
  const snapshot = document.getSnapshot();
  return [
    ...(snapshot.body ? [["", snapshot.body] as [string, IDocumentBody]] : []),
    ...[
      ...Object.entries(snapshot.headers ?? {}),
      ...Object.entries(snapshot.footers ?? {}),
    ].flatMap(([id, value]) => (value.body ? [[id, value.body] as [string, IDocumentBody]] : [])),
  ];
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
// Snapshot 是 JSON 数据；比较字段内容，避免属性顺序或其他 table 的原样透传误伤。
function equalJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => equalJson(value, right[index]))
    );
  }
  if (!record(left) || !record(right)) return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && equalJson(left[key], right[key]))
  );
}

import { UniverCommentService } from "@univerjs-pro/collaboration-comment-service";
import { UniverCollabEndpoint } from "@univerjs-pro/collaboration-endpoint";
import { UniverHistoryService } from "@univerjs-pro/collaboration-history-service";
import {
  CollabError,
  UniverCollabService,
} from "@univerjs-pro/collaboration-service";
import { UnitAction, UniverType } from "@univerjs/protocol";
import type { AuthzService } from "../authz/authz.service";
import { isUnitActionAllowed } from "../permissions";
import type { UnitRepository } from "../units/units.repository";

const commentTypes = new Set<UniverType>([
  UniverType.UNIVER_SHEET,
  UniverType.UNIVER_DOC,
  UniverType.UNIVER_SLIDE,
  UniverType.UNIVER_BOARD,
  UniverType.UNIVER_BASE,
]);

export function registerCollaborationAccess(
  service: UniverCollabService,
  repository: UnitRepository,
  authz: AuthzService,
) {
  service.use("readUnitData", async (context, next) => {
    if (!isUnitActionAllowed(
      repository.resolveRole(context.userID, context.request.unitID),
      UnitAction.View,
    ))
      throw new CollabError("PERMISSION_DENIED", "Cannot view this Unit");
    await next();
  });

  const requireEdit = async (
    context: {
      readonly userID: string;
      readonly request: { readonly changeset: { readonly unitID: string } };
    },
    next: () => Promise<void>,
  ) => {
    if (!isUnitActionAllowed(
      repository.resolveRole(context.userID, context.request.changeset.unitID),
      UnitAction.Edit,
    ))
      throw new CollabError("PERMISSION_DENIED", "Cannot edit this Unit");
    await next();
  };

  service.use("submitChangeset", requireEdit);
  // Unit Edit is a pre-execution constraint, so the apply stage can already reject it.
  service.use("applyChangeset", async (context, next) => {
    if (!isUnitActionAllowed(
      repository.resolveRole(context.userID, context.request.changeset.unitID),
      UnitAction.Edit,
    )) {
      throw new CollabError("PERMISSION_DENIED", "Cannot edit this Unit");
    }
    await next();
  });
  // Content ACL: requirements are collected during apply and only visible at commit.
  service.use("commitChangeset", async (context, next) => {
    for (const requirement of context.requiredUnitPermissions) {
      if (!authz.isAllowed(context.userID, {
        unitID: requirement.unitID,
        objectID: requirement.objectID,
        objectType: requirement.objectType,
        actions: [requirement.action],
      })) {
        throw new CollabError(
          "PERMISSION_DENIED",
          `Cannot apply mutation on ${requirement.objectType} ${requirement.objectID}`,
        );
      }
    }
    await next();
  });
  service.use("deleteUnits", async (context, next) => {
    if (
      context.request.unitIDs.some(
        (unitID) => !repository.isCreator(context.userID, unitID),
      )
    ) {
      throw new CollabError("PERMISSION_DENIED", "Only the Creator can delete");
    }
    await next();
  });
  service.use("recoverUnits", async (context, next) => {
    if (
      context.request.unitIDs.some(
        (unitID) => !repository.isCreator(context.userID, unitID),
      )
    ) {
      throw new CollabError("PERMISSION_DENIED", "Only the Creator can recover");
    }
    await next();
  });
}

export function registerEndpointAccess(
  endpoint: UniverCollabEndpoint,
  repository: UnitRepository,
) {
  endpoint.use("joinUnit", async (context, next) => {
    if (!isUnitActionAllowed(
      repository.resolveRole(context.session.userID, context.unitID),
      UnitAction.View,
    ))
      throw new CollabError("PERMISSION_DENIED", "Cannot join this Unit");
    await next();
  });
}

export function registerCommentAccess(
  service: UniverCommentService,
  repository: UnitRepository,
) {
  function assertAccess(userID: string, unitID: string) {
    const unit = repository.getUnit(userID, unitID);
    if (!unit || unit.state !== "active" || !commentTypes.has(unit.type))
      throw new CollabError("PERMISSION_DENIED", "Comments are unavailable");
    return unit.role;
  }

  service.use("listComments", async (context, next) => {
    assertAccess(context.userID, context.request.unitID);
    await next();
  });

  const requireComment = async (
    context: {
      readonly userID: string;
      readonly request: { readonly unitID: string };
    },
    next: () => Promise<void>,
  ) => {
    if (!isUnitActionAllowed(
      assertAccess(context.userID, context.request.unitID),
      UnitAction.Comment,
    ))
      throw new CollabError("PERMISSION_DENIED", "Cannot comment on this Unit");
    await next();
  };

  service.use("addComment", requireComment);
  service.use("replyComment", requireComment);
  service.use("setThreadSolved", requireComment);
  service.use("editComment", requireComment);
  service.use("deleteComment", async (context, next) => {
    const role = assertAccess(context.userID, context.request.unitID);
    if (!isUnitActionAllowed(role, UnitAction.Comment))
      throw new CollabError("PERMISSION_DENIED", "Cannot comment on this Unit");
    if (role !== "creator" && context.target.authorUserID !== context.userID)
      throw new CollabError("PERMISSION_DENIED", "Cannot delete this comment");
    await next();
  });
}

export function registerHistoryAccess(
  service: UniverHistoryService,
  repository: UnitRepository,
) {
  const requireRead = async (
    context: {
      readonly userID: string;
      readonly request: { readonly unitID: string };
    },
    next: () => Promise<void>,
  ) => {
    if (!isUnitActionAllowed(
      repository.resolveRole(context.userID, context.request.unitID),
      UnitAction.ViewHistory,
    ))
      throw new CollabError("PERMISSION_DENIED", "Cannot view this history");
    await next();
  };

  service.use("getHistoryList", requireRead);
  service.use("listHistoryCreators", requireRead);
  service.use("getHistoryChangesets", requireRead);
}

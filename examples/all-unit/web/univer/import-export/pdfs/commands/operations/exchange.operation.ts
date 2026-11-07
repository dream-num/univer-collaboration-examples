import type {
    PdfAppendIdKind,
    PdfDocumentModel,
    PdfEditorGeneratedIdPrefix,
    PdfEditorMutation,
    PdfSecureIdPrefix,
} from '@univerjs-pro/pdfs';
import type { IAccessor, ICommand } from '@univerjs/core';
import {
    AppendPdfDocumentMutation,
    ApplyPdfHistoryCommand,
    createPdfAppendInstancePlan,
    createSecurePdfId,
    PdfEditorMutationSource,
    pdfRemovePagesAction,
} from '@univerjs-pro/pdfs';
import {
    CommandType,
    generateRandomId,
    ICommandService,
    IUndoRedoService,
    IUniverInstanceService,
    UniverInstanceType,
} from '@univerjs/core';
import { IExchangeOperateService } from '../../services/operate.service';
import { isCurrentUnitLoadedFromServer } from '../../services/utils/collaboration';

export const ImportPdfOperation: ICommand = {
    id: 'custom-pdfs-import-export.operation.import-pdf',
    type: CommandType.OPERATION,
    handler: async (accessor: IAccessor) => {
        const operateService = accessor.get(IExchangeOperateService);
        if (isCurrentUnitLoadedFromServer(accessor, UniverInstanceType.UNIVER_PDF)) {
            await operateService.importPdfToUnitId();
        } else {
            await operateService.importPdfToSnapshot();
        }

        return true;
    },
};

export const AppendPdfOperation: ICommand = {
    id: 'custom-pdfs-import-export.operation.append-pdf',
    type: CommandType.OPERATION,
    handler: async (accessor: IAccessor) => {
        const instanceService = accessor.get(IUniverInstanceService);
        const model = instanceService.getCurrentUnitOfType<PdfDocumentModel>(UniverInstanceType.UNIVER_PDF);
        if (!model) {
            return false;
        }

        const pdfData = await accessor.get(IExchangeOperateService).importPdfAsSnapshot();
        if (!pdfData) {
            return false;
        }

        let appendPlan;
        try {
            appendPlan = createPdfAppendInstancePlan(model.getSnapshot(), pdfData, (kind) => (
                createSecurePdfId(pdfAppendIdPrefix(kind))
            ));
        } catch {
            return false;
        }

        const unitId = model.getUnitId();
        const previousPageIds = new Set(model.getDocument().pages.map((page) => page.id));
        const accepted = Boolean(await accessor.get(ICommandService).executeCommand(
            AppendPdfDocumentMutation.id,
            {
                unitId,
                appendPlan,
                sourceUnitData: pdfData,
            }
        ));
        if (accepted) {
            const history = createAppendHistory(model, previousPageIds, unitId);
            if (history) {
                accessor.get(IUndoRedoService).pushUndoRedo({
                    unitID: unitId,
                    undoMutations: [{
                        id: ApplyPdfHistoryCommand.id,
                        params: {
                            unitId,
                            source: PdfEditorMutationSource.UNDO,
                            mutations: history.undoMutations,
                            atomic: true,
                        },
                    }],
                    redoMutations: [{
                        id: ApplyPdfHistoryCommand.id,
                        params: {
                            unitId,
                            source: PdfEditorMutationSource.REDO,
                            mutations: history.redoMutations,
                            atomic: true,
                        },
                    }],
                });
            }
        }
        return accepted;
    },
};

function pdfAppendIdPrefix(kind: PdfAppendIdKind): PdfSecureIdPrefix {
    switch (kind) {
        case 'page':
            return 'pdf_page_';
        case 'block':
            return 'pdf_block_';
        case 'object':
            return 'pdf_object_';
        case 'displayList':
            return 'pdf_display_list_';
        case 'textStory':
            return 'pdf_text_story_';
    }
}

function createAppendHistory(
    model: PdfDocumentModel,
    previousPageIds: ReadonlySet<string>,
    unitId: string
): { undoMutations: PdfEditorMutation[]; redoMutations: PdfEditorMutation[] } | undefined {
    const document = model.getDocument();
    const appendedPages = document.pages.flatMap((page, atIndex) => previousPageIds.has(page.id)
        ? []
        : [{ page, atIndex }]);
    const now = Date.now();
    const createId = (prefix: PdfEditorGeneratedIdPrefix) => `${unitId}:${prefix}:${generateRandomId(12)}`;
    const result = pdfRemovePagesAction.execute({
        documentId: unitId,
        editState: model.getEditState(),
        selection: { anchors: [], updatedAt: now },
        baseRevision: model.getEditState().revision,
        now,
        createId,
    }, {
        pageCount: document.pages.length,
        pages: appendedPages,
        orderedPageIds: document.pages.map((page) => page.id),
    });
    if (!result.batch) {
        return undefined;
    }

    const redoMutations = result.batch.mutations
        .map((mutation) => mutation.inverse)
        .filter((mutation): mutation is PdfEditorMutation => Boolean(mutation))
        .reverse()
        .map((mutation, index) => ({
            ...mutation,
            sequence: index + 1,
            timestamp: now,
            source: PdfEditorMutationSource.REDO,
        }));
    return { undoMutations: result.batch.mutations, redoMutations };
}

export const ExportPdfOperation: ICommand = {
    id: 'custom-pdfs-import-export.operation.export-pdf',
    type: CommandType.OPERATION,
    handler: async (accessor: IAccessor) => {
        const operateService = accessor.get(IExchangeOperateService);

        await operateService.exportPdfBySnapshot();
        return true;
    },
};

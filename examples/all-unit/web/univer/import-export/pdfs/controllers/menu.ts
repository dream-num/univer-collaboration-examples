import type { IAccessor } from '@univerjs/core';
import type { IMenuButtonItem, IMenuSelectorItem } from '@univerjs/ui';
import type { LocaleKey } from '../locale/types';
import { UniverInstanceType } from '@univerjs/core';
import { getMenuHiddenObservable, MenuItemType } from '@univerjs/ui';
import { AppendPdfOperation, ExportPdfOperation, ImportPdfOperation } from '../commands/operations/exchange.operation';

export const PDFS_EXCHANGE_OPERATION_ID = 'custom-pdfs-import-export.operation.exchange';

export function PdfsExchangeMenuItemFactory(accessor: IAccessor): IMenuSelectorItem<LocaleKey> {
    return {
        id: PDFS_EXCHANGE_OPERATION_ID,
        type: MenuItemType.SUBITEMS,
        icon: 'DirectExportIcon',
        tooltip: 'custom-pdfs-import-export.file',
        hidden$: getMenuHiddenObservable(accessor, UniverInstanceType.UNIVER_PDF),
    };
}

export function ImportPdfAsNewUnitMenuItemFactory(): IMenuButtonItem<LocaleKey> {
    return {
        id: ImportPdfOperation.id,
        type: MenuItemType.BUTTON,
        title: 'custom-pdfs-import-export.upload',
        icon: 'FolderIcon',
    };
}

export function AppendPdfMenuItemFactory(): IMenuButtonItem<LocaleKey> {
    return {
        id: AppendPdfOperation.id,
        type: MenuItemType.BUTTON,
        title: 'custom-pdfs-import-export.appendPdf',
        icon: 'AddNoteIcon',
    };
}

export function ExportPdfMenuItemFactory(): IMenuButtonItem<LocaleKey> {
    return {
        id: ExportPdfOperation.id,
        type: MenuItemType.BUTTON,
        title: 'custom-pdfs-import-export.download',
        icon: 'ExportIcon',
    };
}

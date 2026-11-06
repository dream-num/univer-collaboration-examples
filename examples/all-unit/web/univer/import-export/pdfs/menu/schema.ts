import type { MenuSchemaType } from '@univerjs/ui';
import { RibbonStartGroup } from '@univerjs/ui';
import { AppendPdfOperation, ExportPdfOperation, ImportPdfOperation } from '../commands/operations/exchange.operation';
import {
    AppendPdfMenuItemFactory,
    ExportPdfMenuItemFactory,
    ImportPdfAsNewUnitMenuItemFactory,
    PDFS_EXCHANGE_OPERATION_ID,
    PdfsExchangeMenuItemFactory,
} from '../controllers/menu';

export const menuSchema: MenuSchemaType = {
    [RibbonStartGroup.OTHERS]: {
        [PDFS_EXCHANGE_OPERATION_ID]: {
            order: 0.3,
            gridLayout: { row: 1, column: 2, rowSpan: 2, showLabel: true },
            menuItemFactory: PdfsExchangeMenuItemFactory,
            [ImportPdfOperation.id]: {
                order: 0,
                menuItemFactory: ImportPdfAsNewUnitMenuItemFactory,
            },
            [AppendPdfOperation.id]: {
                order: 1,
                menuItemFactory: AppendPdfMenuItemFactory,
            },
            [ExportPdfOperation.id]: {
                order: 2,
                menuItemFactory: ExportPdfMenuItemFactory,
            },
        },
    },
};

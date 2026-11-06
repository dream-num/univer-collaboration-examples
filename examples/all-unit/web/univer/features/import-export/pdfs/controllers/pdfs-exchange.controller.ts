import { Disposable, ICommandService } from '@univerjs/core';
import { IMenuManagerService } from '@univerjs/ui';
import { AppendPdfOperation, ExportPdfOperation, ImportPdfOperation } from '../commands/operations/exchange.operation';
import { menuSchema } from '../menu/schema';

export class PdfsExchangeClientController extends Disposable {
    constructor(
        @ICommandService private readonly _commandService: ICommandService,
        @IMenuManagerService protected readonly _menuManagerService: IMenuManagerService
    ) {
        super();
        this._initCommands();
        this._initMenus();
    }

    private _initCommands(): void {
        [
            ImportPdfOperation,
            AppendPdfOperation,
            ExportPdfOperation,
        ].forEach((c) => {
            this.disposeWithMe(this._commandService.registerCommand(c));
        });
    }

    private _initMenus(): void {
        this._menuManagerService.mergeMenu(menuSchema);
    }
}

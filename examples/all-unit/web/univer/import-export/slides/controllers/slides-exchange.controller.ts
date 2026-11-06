import { Disposable, ICommandService } from '@univerjs/core';
import { IMenuManagerService } from '@univerjs/ui';
import { ExportSlideOperation, ImportSlideOperation } from '../commands/operations/exchange.operation';
import { menuSchema } from '../menu/schema';

export class SlidesExchangeClientController extends Disposable {
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
            ImportSlideOperation,
            ExportSlideOperation,
        ].forEach((c) => {
            this.disposeWithMe(this._commandService.registerCommand(c));
        });
    }

    private _initMenus(): void {
        this._menuManagerService.mergeMenu(menuSchema);
    }
}

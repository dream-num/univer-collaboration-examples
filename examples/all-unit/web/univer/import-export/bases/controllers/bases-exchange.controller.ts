import { BASE_TOOLBAR_EXTRA_ACTIONS } from '@univerjs-pro/bases-ui';
import { Disposable, ICommandService, Inject, Injector } from '@univerjs/core';
import { connectInjector, IUIPartsService } from '@univerjs/ui';
import {
    ExportBaseByFormatOperation,
    ExportBaseOperation,
    ImportBaseOperation,
} from '../commands/operations/exchange.operation';
import { BaseExchangeToolbarActions } from '../views/BaseExchangeToolbarActions';

export class BasesExchangeClientController extends Disposable {
    constructor(
        @ICommandService private readonly _commandService: ICommandService,
        @Inject(Injector) injector: Injector,
        @IUIPartsService uiPartsService: IUIPartsService
    ) {
        super();

        [ImportBaseOperation, ExportBaseOperation, ExportBaseByFormatOperation].forEach((command) => {
            this.disposeWithMe(this._commandService.registerCommand(command));
        });
        this.disposeWithMe(uiPartsService.registerComponent(
            BASE_TOOLBAR_EXTRA_ACTIONS,
            () => connectInjector(BaseExchangeToolbarActions, injector)
        ));
    }
}

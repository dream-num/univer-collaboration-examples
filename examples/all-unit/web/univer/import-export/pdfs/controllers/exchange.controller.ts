import { Disposable, Inject, Injector } from '@univerjs/core';
import { BuiltInUIPart, connectInjector, IUIPartsService } from '@univerjs/ui';
import { UploadNotification } from '../views/upload-notification/UploadNotification';

export class ExchangeClientController extends Disposable {
    constructor(
        @Inject(Injector) private readonly _injector: Injector,
        @IUIPartsService private readonly _uiPartsService: IUIPartsService
    ) {
        super();
        this._registerUIParts();
    }

    private _registerUIParts() {
        this.disposeWithMe(
            this._uiPartsService.registerComponent(BuiltInUIPart.CONTENT, () => connectInjector(UploadNotification, this._injector))
        );
    }
}

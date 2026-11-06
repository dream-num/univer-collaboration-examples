import type { MenuConfig } from '@univerjs/ui';
import { UniverDocsExchangeClientPlugin } from '@univerjs-pro/docs-exchange-client';
import {
    DependentOn,
    IConfigService,
    Inject,
    Injector,
    LocaleService,
    LocaleType,
    Plugin,
    registerDependencies,
    UniverInstanceType,
} from '@univerjs/core';
import { ComponentsController } from './controllers/components.controller';
import { DocsExchangeClientController } from './controllers/docs-exchange.controller';
import { ExchangeClientController } from './controllers/exchange.controller';
import enUS from './locale/en-US';
import zhCN from './locale/zh-CN';
import { ExchangeOperateService, IExchangeOperateService } from './services/operate.service';
import { IUploadNotificationService, UploadNotificationService } from './services/upload-notification.service';

export interface ICustomImportExportConfig {
    menu?: MenuConfig;
}

@DependentOn(UniverDocsExchangeClientPlugin)
export class CustomDocsImportExportPlugin extends Plugin {
    static override pluginName = 'CUSTOM_DOCS_IMPORT_EXPORT_PLUGIN';
    static override type = UniverInstanceType.UNIVER_DOC;

    constructor(
        _config: ICustomImportExportConfig = {},
        @Inject(Injector) protected override readonly _injector: Injector,
        @Inject(LocaleService) private readonly _localeService: LocaleService,
        @IConfigService private readonly _configService: IConfigService
    ) {
        super();
        this._localeService.load({
            [LocaleType.EN_US]: enUS,
            [LocaleType.ZH_CN]: zhCN,
        });
        if (_config.menu) {
            this._configService.setConfig('menu', _config.menu, { merge: true });
        }
    }

    override onStarting(): void {
        registerDependencies(this._injector, [
            [IExchangeOperateService, { useClass: ExchangeOperateService }],
            [IUploadNotificationService, { useClass: UploadNotificationService }],
            [ComponentsController],
            [ExchangeClientController],
            [DocsExchangeClientController],
        ]);
    }

    override onReady(): void {
        this.disposeWithMe(this._injector.get(IUploadNotificationService));
        this.disposeWithMe(this._injector.get(IExchangeOperateService));
        this.disposeWithMe(this._injector.get(ComponentsController));
        this.disposeWithMe(this._injector.get(ExchangeClientController));
        this.disposeWithMe(this._injector.get(DocsExchangeClientController));
    }
}

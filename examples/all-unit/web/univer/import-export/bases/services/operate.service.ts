import type { BaseDataModel, IBaseSnapshot, IDisposable } from '@univerjs/core';
import type { IError } from '@univerjs/protocol';
import type { Observable } from 'rxjs';
import { IBaseExchangeService } from '@univerjs-pro/bases-exchange-client';
import { ExchangeFormat, IExchangeService } from '@univerjs-pro/exchange-client';
import {
    createIdentifier,
    Disposable,
    Inject,
    IResourceLoaderService,
    IUniverInstanceService,
    LocaleService,
    toDisposable,
    UniverInstanceType,
} from '@univerjs/core';
import { MessageType } from '@univerjs/design';
import { ErrorCode } from '@univerjs/protocol';
import { IMessageService } from '@univerjs/ui';
import { BehaviorSubject } from 'rxjs';
import type { LocaleKey } from '../locale/types';
import { IUploadNotificationService, UploadNotificationState } from './upload-notification.service';
import { getUploadFile, isSupportedFileType } from './utils/tool';

export interface IExchangeOperateService extends IDisposable {
    interrupt(): void;

    importBaseToUnitId(): Promise<string | undefined>;

    retryImportBaseToUnitId(): Promise<string | undefined>;

    importBaseToSnapshot(): Promise<void>;

    exportBaseByUnitId(format: ExchangeFormat, tableId?: string): Promise<void>;

    exportBaseBySnapshot(format?: ExchangeFormat, tableId?: string): Promise<void>;

    /**
     * Observable of upload progress
     */
    progress$: Observable<IUploadProgress>;
}

export interface IUploadProgress {
    /** Task that already completed. */
    done: number;
    /** The total number of tasks need to execute. */
    count: number;
}

const NilProgress: IUploadProgress = { done: 0, count: 0 };

export const IExchangeOperateService = createIdentifier<IExchangeOperateService>('custom-bases-import-export.operate.service');

export class ExchangeOperateService extends Disposable implements IExchangeOperateService {
    private readonly _progress$ = new BehaviorSubject<IUploadProgress>(NilProgress);

    readonly progress$ = this._progress$.asObservable();

    private _totalUploadTaskCount = 0;

    private _doneUploadTaskCount = 0;

    private _isSelectingUnitImportFile = false;

    private _canRetryImport = false;

    constructor(
        @IUniverInstanceService private readonly _univerInstanceService: IUniverInstanceService,
        @IMessageService private readonly _messageService: IMessageService,
        @Inject(LocaleService) private readonly _localeService: LocaleService,
        @Inject(IExchangeService) private readonly _exchangeService: IExchangeService,
        @Inject(IBaseExchangeService) private readonly _baseExchangeService: IBaseExchangeService,
        @IResourceLoaderService private readonly _resourceLoaderService: IResourceLoaderService,
        @IUploadNotificationService private readonly _uploadNotificationService: IUploadNotificationService
    ) {
        super();
        this.disposeWithMe(
            toDisposable(this._exchangeService.requestState$.subscribe((data) => {
                if (data.error?.code === ErrorCode.OK) {
                    this._addDoneTask(1);
                } else {
                    this._showNetworkError(data.error);
                }
            }))
        );
    }

    override dispose(): void {
        super.dispose();
        this._canRetryImport = false;
        this._progress$.complete();
    }

    interrupt(): void {
        this._clearProgress();
        this._uploadNotificationService.updateState(UploadNotificationState.ERROR);
        this._exchangeService.interruptImportTask();
    }

    async importBaseToUnitId(): Promise<string | undefined> {
        if (this._isSelectingUnitImportFile || this._uploadTaskNotDone()) {
            this._messageService.show({
                type: MessageType.Warning,
                content: this._localeService.t<LocaleKey>('custom-bases-import-export.uploading'),
            });
            return;
        }

        let file: FileList | null;
        this._isSelectingUnitImportFile = true;
        try {
            file = await getUploadFile([UniverInstanceType.UNIVER_BASE]);
        } finally {
            this._isSelectingUnitImportFile = false;
        }

        if (!file) {
            return;
        }

        const isFileTypeError = this._fileTypeError(file);

        if (isFileTypeError) {
            return;
        }

        this._canRetryImport = true;

        return this._importBaseToUnitId(file[0]);
    }

    async retryImportBaseToUnitId(): Promise<string | undefined> {
        if (!this._canRetryImport) {
            return;
        }

        return this.importBaseToUnitId();
    }

    async importBaseToSnapshot(): Promise<void> {
        if (this._uploadTaskNotDone()) {
            this._messageService.show({
                type: MessageType.Warning,
                content: this._localeService.t<LocaleKey>('custom-bases-import-export.uploading'),
            });
            return;
        }

        const file = await getUploadFile([UniverInstanceType.UNIVER_BASE]);

        if (!file || this._fileTypeError(file)) {
            return;
        }

        this._showUploadMessage(MessageType.Info);

        const snapshot = await this._baseExchangeService.importBaseToSnapshot(file[0]);

        if (!snapshot) {
            return;
        }

        this._refreshBase(snapshot);

        this._showUploadMessage(MessageType.Success);
    }

    async exportBaseByUnitId(
        format: ExchangeFormat,
        tableId?: string
    ): Promise<void> {
        const base = this._getCurrentBase();
        const name = base.getSnapshot().name;
        this._showDownloadMessage(MessageType.Info);
        const file = await this._baseExchangeService.exportBaseByUnitId(
            base.getUnitId(),
            format,
            tableId
        );
        this._downloadFile(file, name, format);
    }

    async exportBaseBySnapshot(format = ExchangeFormat.XLSX, tableId?: string): Promise<void> {
        const base = this._getCurrentBase();
        const snapshot = this._resourceLoaderService.saveUnit<IBaseSnapshot>(base.getUnitId()) ?? base.getSnapshot();
        this._showDownloadMessage(MessageType.Info);
        const file = await this._baseExchangeService.exportBaseBySnapshot(snapshot, format, tableId);
        this._downloadFile(file, snapshot.name, format);
    }

    private _downloadFile(file: File | undefined, unitName: string | undefined, format: ExchangeFormat): void {
        if (!file) {
            return;
        }

        this._exchangeService.downloadFile(file, unitName || file.name.split('.').shift() || document.title, format);

        this._showDownloadMessage(MessageType.Success);
    }

    private async _importBaseToUnitId(file: File): Promise<string | undefined> {
        this._uploadNotificationService.show();
        this._uploadNotificationService.updateState(UploadNotificationState.UPLOADING);

        this._addTotalCount(4);
        this._addDoneTask(1);

        const unitId = await this._baseExchangeService.importBaseToUnitId(file);

        if (!unitId) {
            this._clearProgress();
            this._uploadNotificationService.updateState(UploadNotificationState.ERROR);
            return;
        }

        const link = {
            link: this._getLinkByUnitId(unitId, UniverInstanceType.UNIVER_BASE),
            name: file.name,
            type: UniverInstanceType.UNIVER_BASE,
        };

        this._uploadNotificationService.pushLink(link);

        this._completeProgress();
        this._uploadNotificationService.updateState(UploadNotificationState.SUCCESS);

        return unitId;
    }

    private _refreshBase(snapshot: IBaseSnapshot): void {
        const unit = this._getCurrentBase();
        this._univerInstanceService.disposeUnit(unit.getUnitId());
        const newUnit = this._univerInstanceService.createUnit<IBaseSnapshot, BaseDataModel>(
            UniverInstanceType.UNIVER_BASE,
            snapshot
        );
        this._univerInstanceService.focusUnit(newUnit.getUnitId());
    }

    private _getCurrentBase(): BaseDataModel {
        const base = this._univerInstanceService.getCurrentUnitOfType<BaseDataModel>(UniverInstanceType.UNIVER_BASE);
        if (!base) {
            throw new Error(`No unit of type ${UniverInstanceType.UNIVER_BASE} is currently active.`);
        }
        return base;
    }

    private _getLinkByUnitId(unitId: string, type: UniverInstanceType) {
        const url = new URL(window.location.href);
        url.searchParams.set('unit', unitId);
        url.searchParams.set('type', `${type}`);
        return url.toString();
    }

    private _showNetworkError(error?: IError) {
        let content: string;
        switch (error?.code) {
            case ErrorCode.LICENSE_EXPORT_SIZE_EXCEEDED:
            case ErrorCode.CONNECTOR_DATA_TOO_LARGE:
                content = this._localeService.t<LocaleKey>('custom-bases-import-export.tooLarge');
                break;
            case ErrorCode.LICENSE_EXPORT_QUOTA_EXCEEDED:
                content = this._localeService.t<LocaleKey>('custom-bases-import-export.exportQuotaExceeded');
                break;
            case ErrorCode.LICENSE_INVALID:
            case ErrorCode.LICENSE_POLICY_INVALID:
                content = this._localeService.t<LocaleKey>('custom-bases-import-export.licensePolicyInvalid');
                break;
            case ErrorCode.LICENSE_VERSION_NOT_ALLOWED:
                content = this._localeService.t<LocaleKey>('custom-bases-import-export.licenseVersionNotAllowed');
                break;
            case ErrorCode.LICENSE_UNIT_TYPE_REJECTED:
                content = this._localeService.t<LocaleKey>('custom-bases-import-export.licenseUnitTypeRejected');
                break;
            case ErrorCode.LICENSE_NOT_YET_EFFECTIVE:
                content = this._localeService.t<LocaleKey>('custom-bases-import-export.licenseNotYetEffective');
                break;
            case ErrorCode.LICENSE_USAGE_STATE_INVALID:
            case ErrorCode.LICENSE_USAGE_STORAGE_ERROR:
                content = this._localeService.t<LocaleKey>('custom-bases-import-export.exportQuotaCheckFailed');
                break;
            case ErrorCode.LICENSE_CONCURRENCY_TIMEOUT:
                content = this._localeService.t<LocaleKey>('custom-bases-import-export.licenseConcurrencyTimeout');
                break;
            case ErrorCode.INTERNAL_ERROR:
                content = this._localeService.t<LocaleKey>('custom-bases-import-export.internalError');
                break;
            default:
                content = this._localeService.t<LocaleKey>('custom-bases-import-export.networkError');
                break;
        }
        this._messageService.show({ type: MessageType.Error, content });
        return null;
    }

    private _showDownloadMessage(type: MessageType) {
        let content = '';

        switch (type) {
            case MessageType.Success:
                content = this._localeService.t<LocaleKey>('custom-bases-import-export.downloadSuccess');
                break;
            case MessageType.Info:
                content = this._localeService.t<LocaleKey>('custom-bases-import-export.downloading');
                break;
            default:
                break;
        }

        this._messageService.show({
            type,
            content,
        });
    }

    private _showUploadMessage(type: MessageType) {
        let content = '';

        switch (type) {
            case MessageType.Success:
                content = this._localeService.t<LocaleKey>('custom-bases-import-export.uploadSuccess');
                break;
            case MessageType.Info:
                content = this._localeService.t<LocaleKey>('custom-bases-import-export.uploading');
                break;
            default:
                break;
        }

        this._messageService.show({
            type,
            content,
        });
    }

    private _emitProgress(): void {
        this._progress$.next({ done: this._doneUploadTaskCount, count: this._totalUploadTaskCount });
    }

    private _addTotalCount(count: number): void {
        this._totalUploadTaskCount += count;
        this._emitProgress();
    }

    private _addDoneTask(count: number): void {
        this._doneUploadTaskCount += count;
        this._doneUploadTaskCount = Math.min(this._doneUploadTaskCount, this._totalUploadTaskCount);
        this._emitProgress();
    }

    private _completeProgress(): void {
        this._doneUploadTaskCount = this._totalUploadTaskCount;
        this._emitProgress();
    }

    private _clearProgress(): void {
        this._doneUploadTaskCount = 0;
        this._totalUploadTaskCount = 0;
        this._emitProgress();
    }

    /**
     * Although we have specified the supported file types in advance, users can still switch to select all types of files.
     * In order to prevent such unsupported files from being transmitted to the server, they need to be intercepted in advance.
     */
    private _fileTypeError(fileList: FileList): boolean {
        const file = fileList[0];
        const fileName = file.name;

        // Get file type, if file type is not expected, return fail message
        if (!isSupportedFileType(file, UniverInstanceType.UNIVER_BASE)) {
            this._messageService.show({
                type: MessageType.Error,
                content: this._localeService.t<LocaleKey>('custom-bases-import-export.fileTypeError', fileName),
            });

            return true;
        }

        return false;
    }

    private _uploadTaskNotDone(): boolean {
        return this._totalUploadTaskCount !== 0 && this._doneUploadTaskCount !== this._totalUploadTaskCount;
    }
}

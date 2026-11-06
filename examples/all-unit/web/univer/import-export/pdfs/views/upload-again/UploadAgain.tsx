import type { LocaleKey } from '../../locale/types';
import { LocaleService } from '@univerjs/core';
import { useDependency } from '@univerjs/ui';
import { IExchangeOperateService } from '../../services/operate.service';
import { UploadButton } from '../upload-button/UploadButton';

export function UploadAgain() {
    const operateService = useDependency(IExchangeOperateService);
    const localeService = useDependency(LocaleService);

    function onClick() {
        return operateService.retryImportPdfToUnitId();
    }

    return (
        <UploadButton onClick={onClick}>
            {localeService.t<LocaleKey>('custom-pdfs-import-export.uploadAgain')}
        </UploadButton>
    );
};

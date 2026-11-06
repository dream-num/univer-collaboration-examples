import { Disposable, Inject } from '@univerjs/core';
import { DirectExportIcon, ExportIcon, FolderIcon } from '@univerjs/icons';
import { IconManager } from '@univerjs/ui';

export class ComponentsController extends Disposable {
    constructor(@Inject(IconManager) iconManager: IconManager) {
        super();
        this.disposeWithMe(iconManager.register({ DirectExportIcon, ExportIcon, FolderIcon }));
    }
}

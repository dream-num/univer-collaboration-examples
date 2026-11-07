import type enUS from './en-US';

const locale: typeof enUS = {
    'custom-docs-import-export': {
        uploading: '上传中',
        uploadSuccess: '文件上传成功',
        uploadSuccessTip: '{0}个文件上传成功',
        downloading: '下载中',
        downloadSuccess: '下载成功',

        unknownMistake: '未知错误',
        networkError: '网络异常',
        tooLarge: '数据流过大',
        exportQuotaExceeded: '当前授权周期的导出次数已用完，请等待下一周期或联系管理员更新授权。',
        licensePolicyInvalid: '授权内容有误，请联系管理员更换授权。',
        licenseVersionNotAllowed: '当前服务版本超出授权范围，请联系管理员更新授权。',
        licenseNotYetEffective: '授权尚未生效，请在生效后重试。',
        licenseUnitTypeRejected: '当前授权未包含此导出类型，或该类型授权已到期，请联系管理员更新授权。',
        exportQuotaCheckFailed: '无法核验剩余导出次数，请联系管理员检查服务状态。',
        licenseConcurrencyTimeout: '当前导出任务繁忙，等待超时，请稍后重试。',
        internalError: '内部未知错误',
        interrupt: '网络连接中断，文件上传失败',
        fileTypeError: '所选文件 [{0}] 不支持上传',

        wait: '请稍等...',
        cancel: '取消',
        confirm: '确认',
        uploadAgain: '再次上传',

        file: '文件',
        upload: '打开（文件）',
        download: '另存为',
    },
};

export default locale;

const methods = ['getNativeBuiltinCatalog', 'getNativeBuiltinSourceDetail',
    'refreshNativeBuiltinBalance', 'runNativeBuiltinDiagnostic', 'checkNativeUserSourceV3', 'saveNativeUserSourceV3',
    'resumeNativeUserSourceSaveV3', 'listNativeUserSourcesV3', 'listNativeBuiltinReadiness', 'resumeNativeBuiltinSource',
    'validateNativeBuiltinSource',
    'getAiAccountSummary', 'listAiUsage', 'getAiUsageDetail', 'listRechargeTiers', 'listRechargeCoupons',
    'createRechargeOrder', 'getActiveRechargeOrder', 'getRechargeOrder', 'cancelRechargeOrder', 'getReferralSummary',
    'listReferralRecords', 'checkNativeUserSource', 'saveNativeUserSource', 'resumeNativeUserSourceSave',
    'listNativeUserSources', 'pingNativeUserModel', 'testNativeUserModel', 'saveNativeUserModel',
    'resumeNativeUserModelSave', 'listNativeUserModelRegistrations', 'getNativeUserModels', 'addNativeUserModel',
    'updateNativeUserModel', 'deleteNativeUserModel', 'reorderNativeUserModels', 'listNativeConnectionUi',
    'getNativeToolUserApiUsage'];
/** Read the already injected account preload.
 * @returns Current desktop preload, or undefined outside its supported environment. */
export function accountHost() {
    const host = Reflect.get(window, 'studybuddy');
    return typeof host === 'object' && host !== null ? host : undefined;
}
/** Project only the formally declared public business operations.
 * @param host - Fixed desktop preload.
 * @returns Public method adapter whose unavailable calls reject explicitly. */
export function businessApi(host) {
    const entries = methods.map(method => [method, (...args) => host?.business ? host.business.invoke(method, args) :
            Promise.reject(new Error('BUSINESS_UNAVAILABLE'))]);
    // Every original method has its corresponding fixed invoke call.
    return Object.fromEntries(entries);
}
//# sourceMappingURL=business-api.js.map
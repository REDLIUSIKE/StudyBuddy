export const HARNESS_SKILL_SAFETY_LABS_METHODS = ['startSkillSafetyAssistant', 'getSkillSafetyScannerStatus', 'prepareSkillSafetyScanner', 'cancelSkillSafetyScannerPreparation'];
/** Validate result bytes without permitting URLs, paths or credentials. */
export function parseSkillSafetySessionView(value) {
    const row = record(value, ['workspaceId', 'sessionId']);
    for (const name of ['workspaceId', 'sessionId'])
        if (typeof row[name] !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(row[name]))
            fail();
    return row;
}
/** HTTP completion alone does not assert verified readiness. */
export function parseSkillSafetyScannerView(value) {
    const row = record(value, ['state', 'scannerVersion', 'receivedBytes', 'totalBytes'], ['code']);
    oneOf(row.state, ['missing', 'downloading', 'ready', 'failed']);
    oneOf(row.scannerVersion, ['2.2.2']);
    integer(row.receivedBytes, 1024 ** 3);
    integer(row.totalBytes, 1024 ** 3);
    if (row.receivedBytes > row.totalBytes || row.totalBytes === 0)
        fail();
    if (Object.hasOwn(row, 'code') && (typeof row.code !== 'string' || !/^SKILL_SAFETY_[A-Z_]{1,64}$/.test(row.code)))
        fail();
    return row;
}
export const HARNESS_LABS_METHODS = ['getCodexChineseStatus', 'applyCodexChinese', 'restoreCodexChinese', ...HARNESS_SKILL_SAFETY_LABS_METHODS];
const fail = () => { throw new TypeError('CODEX_CHINESE_VIEW_INVALID'); };
function record(value, required, optional = []) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return fail();
    const row = value;
    if (required.some(key => !Object.hasOwn(row, key)) || Object.keys(row).some(key => !required.includes(key) && !optional.includes(key)))
        return fail();
    return row;
}
const oneOf = (value, allowed) => { if (typeof value !== 'string' || !allowed.includes(value))
    fail(); };
const integer = (value, max) => { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max)
    fail(); };
const version = (value) => { if (typeof value !== 'string' || !/^\d{1,8}(?:\.\d{1,8}){1,3}$/u.test(value))
    fail(); };
function code(row) { if (Object.hasOwn(row, 'errorCode') && (typeof row.errorCode !== 'string' || !/^CODEX_(?:UI|CHINESE)_[A-Z_]{1,64}$/u.test(row.errorCode)))
    fail(); }
/** @param value Untrusted native result. @returns Original UI facts with no extra fields or configuration contents. */
export function parseCodexChineseView(value) {
    const row = record(value, ['ui', 'package', 'canRestore'], ['runtime', 'installation', 'diagnostic', 'completion']);
    const ui = record(row.ui, ['status'], ['errorCode']), pkg = record(row.package, ['status'], ['errorCode', 'version', 'downloadBytes']);
    oneOf(ui.status, ['unavailable', 'resource_available', 'not_configured', 'configured', 'restart_required', 'conflict', 'error']);
    code(ui);
    oneOf(pkg.status, ['available', 'unsupported', 'unavailable']);
    code(pkg);
    if (Object.hasOwn(pkg, 'version'))
        version(pkg.version);
    if (Object.hasOwn(pkg, 'downloadBytes'))
        integer(pkg.downloadBytes, Number.MAX_SAFE_INTEGER);
    if (typeof row.canRestore !== 'boolean')
        fail();
    if (Object.hasOwn(row, 'runtime')) {
        const runtime = record(row.runtime, ['status'], ['processCount']);
        oneOf(runtime.status, ['stopped', 'running', 'unknown']);
        if (Object.hasOwn(runtime, 'processCount'))
            integer(runtime.processCount, 4294967295);
    }
    if (Object.hasOwn(row, 'installation')) {
        const installed = record(row.installation, ['packageVersion', 'appVersion']);
        version(installed.packageVersion);
        version(installed.appVersion);
    }
    if (Object.hasOwn(row, 'diagnostic')) {
        const diagnostic = record(row.diagnostic, ['phase', 'operationId'], ['httpStatus']);
        oneOf(diagnostic.phase, ['initialization', 'legacy_rule_retirement', 'installation_binding', 'process_guard', 'configuration_read', 'catalog_trust', 'catalog_download', 'catalog_verification', 'version_match', 'package_download', 'package_verification', 'resource_verification', 'resource_preparation', 'resource_backup', 'resource_replacement', 'resource_readback', 'locale_configuration', 'configuration_restore']);
        if (typeof diagnostic.operationId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(diagnostic.operationId))
            fail();
        if (Object.hasOwn(diagnostic, 'httpStatus')) {
            integer(diagnostic.httpStatus, 599);
            if (diagnostic.httpStatus < 100)
                fail();
        }
    }
    if (Object.hasOwn(row, 'completion'))
        oneOf(row.completion, ['applied', 'restored']);
    return row;
}
//# sourceMappingURL=harness-labs.js.map
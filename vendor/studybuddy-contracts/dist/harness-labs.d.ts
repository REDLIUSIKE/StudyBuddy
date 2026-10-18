/** Original Codex UI facts and the three parameter-free laboratory operations. */
import type { ToolsPageHost } from './harness-tools.js';
export type CodexChineseLayerStatus = 'unavailable' | 'resource_available' | 'not_configured' | 'configured' | 'restart_required' | 'conflict' | 'error';
export type CodexChineseView = {
    ui: {
        status: CodexChineseLayerStatus;
        errorCode?: string;
    };
    package: {
        status: 'available' | 'unsupported' | 'unavailable';
        version?: string;
        downloadBytes?: number;
        errorCode?: string;
    };
    canRestore: boolean;
    runtime?: {
        status: 'stopped' | 'running' | 'unknown';
        processCount?: number;
    };
    installation?: {
        packageVersion: string;
        appVersion: string;
    };
    diagnostic?: {
        phase: string;
        httpStatus?: number;
        operationId: string;
    };
    completion?: 'applied' | 'restored';
};
export interface HarnessLabsApi {
    getCodexChineseStatus(): Promise<CodexChineseView>;
    applyCodexChinese(): Promise<CodexChineseView>;
    restoreCodexChinese(): Promise<CodexChineseView>;
    startSkillSafetyAssistant(input: {
        requestId: string;
    }): Promise<SkillSafetySessionView>;
    getSkillSafetyScannerStatus(): Promise<SkillSafetyScannerView>;
    prepareSkillSafetyScanner(input: {
        requestId: string;
    }): Promise<SkillSafetyScannerView>;
    cancelSkillSafetyScannerPreparation(input: {
        requestId: string;
    }): Promise<void>;
}
/** Keyless Labs-only results; resource paths and model actions are not page capabilities. */
export type SkillSafetySessionView = {
    workspaceId: string;
    sessionId: string;
};
export type SkillSafetyScannerView = {
    state: 'missing' | 'downloading' | 'ready' | 'failed';
    scannerVersion: '2.2.2';
    receivedBytes: number;
    totalBytes: number;
    code?: string;
};
export declare const HARNESS_SKILL_SAFETY_LABS_METHODS: readonly ['startSkillSafetyAssistant', 'getSkillSafetyScannerStatus', 'prepareSkillSafetyScanner', 'cancelSkillSafetyScannerPreparation'];
export type SkillSafetyLabsMethod = typeof HARNESS_SKILL_SAFETY_LABS_METHODS[number];
/** Validate result bytes without permitting URLs, paths or credentials. */
export declare function parseSkillSafetySessionView(value: unknown): SkillSafetySessionView;
/** HTTP completion alone does not assert verified readiness. */
export declare function parseSkillSafetyScannerView(value: unknown): SkillSafetyScannerView;
export type LabsPageHost = Pick<ToolsPageHost, 'state' | 'subscribeState' | 'navigate'> & {
    api: HarnessLabsApi;
};
export declare const HARNESS_LABS_METHODS: readonly ["getCodexChineseStatus", "applyCodexChinese", "restoreCodexChinese", "startSkillSafetyAssistant", "getSkillSafetyScannerStatus", "prepareSkillSafetyScanner", "cancelSkillSafetyScannerPreparation"];
export type ToolSurfaceTarget = 'tools' | 'labs';
/** @param value Untrusted native result. @returns Original UI facts with no extra fields or configuration contents. */
export declare function parseCodexChineseView(value: unknown): CodexChineseView;

/** Usage remains bound to the original account, device and exact connection grant. */
import type { AiUsagePage, AiUsageDetail, CloudAccountApi, NativeAccountApi, NativeConnectionUiView, NativeToolUsagePageV2, NativeToolUsagePageV3, NativeToolId, OwnedScope } from '@studybuddy/contracts';
import { ObservableState } from './observable.ts';
type UsagePage = NativeToolUsagePageV2 | NativeToolUsagePageV3;
type UsageApi = Pick<CloudAccountApi, 'listAiUsage' | 'getAiUsageDetail'> & Pick<NativeAccountApi, 'listNativeConnectionUi' | 'getNativeToolUserApiUsage'>;
export interface UsageSnapshot {
    scope: OwnedScope | null;
    platform: AiUsagePage | null;
    detail: AiUsageDetail | null;
    own: readonly UsagePage[];
    busy: boolean;
    errorCode: string | null;
    stale: boolean;
}
/** Validates attribution after the carrier has validated the original wire DTO. */
export declare function assertNativeUsageMatches(owner: string, connection: NativeConnectionUiView, page: UsagePage): void;
export declare class UsageController extends ObservableState<UsageSnapshot> {
    #private;
    private readonly api;
    constructor(api: UsageApi);
    setScope(scope: OwnedScope | null): void;
    loadPlatform(page?: number, pageSize?: number): Promise<void>;
    loadPlatformDetail(id: string): Promise<void>;
    closeDetail: () => void;
    loadOwn(): Promise<void>;
    nextOwn(toolId: NativeToolId): Promise<void>;
    private run;
    dispose(): void;
}
export {};
//# sourceMappingURL=usage-controller.d.ts.map
export type FundsState = "complete" | "partial" | "unavailable" | "failed" | "stale";
export type CnyAmount = string;
export type FundsAuthority = {
    kind: "wallet_projection";
    generation: string;
    quotaPerBaseUnitExact: string;
    readTier: "db" | "redis";
} | {
    kind: "official_balance";
    bindingVersion: string;
} | {
    kind: "native_evidence";
    evidenceVersion: string;
};
export type SourceStamp = {
    instanceId: string;
    contractVersion: "studybuddy-funds-v1";
    snapshotId: string;
    watermark: string | null;
    observedAt: string;
    effectiveFrom: string | null;
    effectiveToExclusive: string | null;
    authority: FundsAuthority;
};
export type MoneyMetric = {
    currency: "CNY";
    amount: CnyAmount | null;
    state: FundsState;
    source: SourceStamp | null;
    confirmedCount: number | null;
    pendingCount: number | null;
    scopeId: string;
    reasonCode: string | null;
};
export type FundsScope = {
    instanceId: string;
    scopeId: string;
    mappingDigest: string;
    members: readonly {
        studyBuddyUserId: string;
        upstreamUserId: string;
        revision: string;
    }[];
};
export type LocalDayWindow = {
    localDate: string;
    timeZone: "Asia/Shanghai";
    start: string;
    endExclusive: string;
};
export type FundsOverview = {
    availablePool: MoneyMetric;
    cumulativePaid: MoneyMetric;
    cumulativeCredited: MoneyMetric;
    todayPaidCredited: MoneyMetric;
    todayFinalCharge: MoneyMetric;
    todayReversal: MoneyMetric;
    confirmedPlatformCost: MoneyMetric;
    supplierAvailable: MoneyMetric;
    rechargeStartedAt: string | null;
    remainingComposition: "unavailable" | "verified";
    unresolvedCaseCount: number | null;
};
export type FundsCapability = {
    state: "verified" | "unavailable" | "unverified";
    reasonCode: string | null;
};
export type FundingBalanceSnapshot = {
    accountId: string;
    provider: "deepseek" | "kimi";
    region: "cn";
    currency: "CNY";
    bindingVersion: string;
    available: string | null;
    cash: string | null;
    grant: string | null;
    officialCallable: boolean | null;
    successAt: string | null;
    attemptAt: string;
    queryState: "pending" | "success" | "failed" | "stale";
    errorCode: string | null;
};
export type FundingAccount = {
    id: string;
    label: string;
    bindingState: "verified" | "invalid" | "unverified";
    connections: readonly {
        id: string;
        label: string;
        state: "verified" | "invalid" | "unverified";
    }[];
    balance: FundingBalanceSnapshot;
};
export type FundsPoolRow = {
    studyBuddyUserId: string;
    upstreamUserId: string;
    available: MoneyMetric;
    cumulativePaid: MoneyMetric;
    cumulativeCredited: MoneyMetric;
    cumulativeFinalCharge: MoneyMetric;
};
export type FundsCostAuthority = {
    provider: string;
    model: string;
    connection: string;
    funding: string;
    terminalUsageReference: string;
    priceVersion: string;
    priceWindowReference: string;
};
export type FundsEvidenceDomain = "payment" | "wallet_event" | "settlement" | "cost";
export type FundsEvidenceRecord = {
    domain: FundsEvidenceDomain;
    sourceId: string;
    entityId: string;
    studyBuddyUserId: string;
    effectiveAt: string | null;
    confirmedAt: string;
    sourceVersion: string;
    amount: string | null;
    currency: "CNY";
    state: FundsState;
    actualWalletDelta: string | null;
    costAuthority: FundsCostAuthority | null;
    creditedAmount: string | null;
    orderStatus: string;
};
export type FundsEvidencePage = {
    items: readonly FundsEvidenceRecord[];
    cursor: string | null;
    source: SourceStamp;
    capabilities: Record<FundsEvidenceDomain, FundsCapability>;
};
export declare const FUNDS_METRICS: readonly ["availablePool", "cumulativePaid", "cumulativeCredited", "todayPaidCredited", "todayFinalCharge", "todayReversal", "confirmedPlatformCost"];
export type FundsSourceSnapshot = {
    contractVersion: "studybuddy-funds-v1";
    instanceId: string;
    snapshotId: string;
    scopeId: string;
    mappingDigest: string;
    metrics: Pick<FundsOverview, typeof FUNDS_METRICS[number]>;
    rechargeStartedAt: string | null;
    pool: {
        rows: readonly FundsPoolRow[];
        cursor: string | null;
    };
    capabilities: {
        wallet: FundsCapability;
        topup: FundsCapability;
        evidence: FundsCapability;
    };
    evidence: FundsEvidencePage;
};
export type FundingAlertConfig = {
    accountId: string;
    version: string;
    currency: "CNY";
    minimum: string;
    target: string;
    enabled: boolean;
};
export type ReserveEstimate = {
    state: "available" | "unavailable";
    days: string | null;
    completeDays: readonly string[];
    platformOnly: true;
    reasonCode: string | null;
};
export type AlertEvaluation = {
    currentRisk: "normal" | "low" | "cash_debt" | "not_callable" | "unknown";
    previousRisk: string | null;
    consecutiveFreshRecoveries: number;
    transition: "opened" | "recovered" | "unchanged";
    showReminder: boolean;
};
export type FundsAccountDetail = FundingAccount & {
    config: FundingAlertConfig | null;
    risk: AlertEvaluation;
    reserve: ReserveEstimate;
};
export type FundsCaseProgress = "pending" | "processing" | "needs_evidence" | "resolved";
export type FundsCase = {
    id: string;
    identity: string;
    instanceId: string;
    localDate: string;
    domain: FundsEvidenceDomain;
    entityId: string;
    rule: string;
    version: string;
    state: FundsCaseProgress;
    reasonCode: string;
    evidenceDigest: string;
    sourceObservedAt: string;
    detectedAt: string;
    updatedAt: string;
    closedAt: string | null;
    amount: string | null;
    relatedCaseId: string | null;
};
export type FundsCaseNote = {
    id: string;
    actor: string;
    body: string;
    progress: FundsCaseProgress;
    at: string;
};
export type FundsCaseFilters = {
    state?: FundsCaseProgress;
    domain?: FundsEvidenceDomain;
    localDate?: string;
    entityId?: string;
};
export type FundsCasesPage = {
    caseBatchId: string;
    sourceBatchId: string;
    scopeId: string;
    sourceObservedAt: string | null;
    queriedAt: string;
    rows: readonly FundsCase[];
    cursor: string | null;
    totalCount: number;
    filters: FundsCaseFilters;
};
export type FundsTask = {
    taskId: string;
    state: "pending" | "success" | "failed";
    errorCode: string | null;
};
export type FundsRecheckView = FundsTask & {
    caseVersion: string;
    requestedAt: string;
    checkedAt: string | null;
    expiresAt: string;
};
export type FundsCaseDetail = {
    case: FundsCase;
    notes: readonly FundsCaseNote[];
    notesTotal: number;
    notesTruncated: boolean;
    rechecks: readonly FundsRecheckView[];
    canResolve: boolean;
    resolveReason: string | null;
    resolveRecheckId: string | null;
    sourceBatchId: string | null;
    evidence: FundsEvidencePage | null;
    evidenceTruncated: boolean;
    merchantStatement: FundsCapability;
};
export type FundsPoolPage = {
    batchId: string;
    cursor: string | null;
    rows: readonly FundsPoolRow[];
    scopeId: string;
    currency: "CNY";
    sourceObservedAt: string | null;
};
export type FundsUserDetail = {
    batchId: string;
    scopeId: string;
    row: FundsPoolRow;
    evidence: FundsEvidencePage;
    evidenceTruncated: boolean;
    remainingComposition: "unavailable";
    inFlight: "unavailable";
    reversal: "unavailable";
};
export type FundsTrendResponse = {
    batchId: string;
    scopeId: string;
    mappingDigest: string;
    rows: readonly {
        localDate: string;
        todayPaidCredited: MoneyMetric;
        todayFinalCharge: MoneyMetric;
        todayReversal: MoneyMetric;
        confirmedPlatformCost: MoneyMetric;
    }[];
};
export type FundsOverviewResponse = {
    instanceId: string;
    batchId: string | null;
    localDate: string;
    overview: FundsOverview;
    accounts: readonly FundsAccountDetail[];
    capabilities: {
        wallet: FundsCapability;
        topup: FundsCapability;
        evidence: FundsCapability;
    };
    capturedAt: string | null;
    scopeLabel: string;
    sourceError: string | null;
};
export declare function fundsMetricAt(metric: MoneyMetric, now: number): MoneyMetric;
export declare function fundingBalanceAt(balance: FundingBalanceSnapshot, now: number): FundingBalanceSnapshot;
export declare function fundingTargetGap(account: FundingAccount, config: FundingAlertConfig | null, now: number): string | null;
export declare function fundsRecord(value: unknown, keys: readonly string[]): Record<string, unknown>;
export declare function fundsText(value: unknown): string;
export declare function fundsChoice<T extends string>(value: unknown, values: readonly T[]): T;
export declare function cnyAmount(value: unknown): string;
export declare function parseFundsStamp(value: unknown, expectedInstanceId: string): SourceStamp;
export declare function parseFundsMetric(value: unknown, instanceId: string): MoneyMetric;
export declare function parseFundingAccount(value: unknown): FundingAccount;
export declare function parseFundsEvidence(value: unknown, instanceId: string): FundsEvidencePage;
export declare function parseFundsSource(value: unknown, instanceId: string): FundsSourceSnapshot;
export declare function parseFundsCase(value: unknown): FundsCase;
export declare function parseFundsCaseFilters(value: unknown): FundsCaseFilters;

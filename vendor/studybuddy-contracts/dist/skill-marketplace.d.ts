export declare const SKILL_LISTING_STATUSES: readonly ["PUBLIC", "REJECTED", "DELETED"];
export declare const SKILL_COVER_CONTENT_TYPES: readonly ["image/png", "image/jpeg", "image/webp"];
export declare const SKILL_COVER_WIDTH = 1600;
export declare const SKILL_COVER_HEIGHT = 900;
export declare const SKILL_COVER_MAX_BYTES: number;
export declare const SKILL_PACKAGE_MAX_BYTES: number;
export type SkillListingStatus = (typeof SKILL_LISTING_STATUSES)[number];
export declare function isSkillListingStatus(value: string): value is SkillListingStatus;
export type SkillCoverContentType = (typeof SKILL_COVER_CONTENT_TYPES)[number];
export declare function isSkillCoverContentType(value: string): value is SkillCoverContentType;
export type SkillListingView = Readonly<{
    id: string;
    title: string;
    summary: string;
    category: string;
    authorName: string;
    status: SkillListingStatus;
    updatedAt: string;
    coverUrl: string;
    isOfficial: boolean;
}>;
export type SkillDetailView = SkillListingView & Readonly<{
    usageInstructions: string;
    rejectionReason: string | null;
    isCampusKnowledge: boolean;
}>;
export type SkillPublishInput = Readonly<{
    title: string;
    summary: string;
    category: string;
    authorName: string;
    usageInstructions: string;
}>;
export type SkillPackageUploadInput = Readonly<{
    packageSha256: string;
    packageBytes: string;
    coverSha256: string;
    coverBytes: string;
    coverContentType: SkillCoverContentType;
}>;
export type SkillPackageUploadCapability = Readonly<{
    uploadId: string;
    expiresAt: string;
    package: Readonly<{
        url: string;
        requiredHeaders: Readonly<Record<string, string>>;
    }>;
    cover: Readonly<{
        url: string;
        requiredHeaders: Readonly<Record<string, string>>;
    }>;
}>;
export type SkillPackageTicketView = Readonly<{
    url: string;
    expiresAt: string;
    sha256: string;
}>;

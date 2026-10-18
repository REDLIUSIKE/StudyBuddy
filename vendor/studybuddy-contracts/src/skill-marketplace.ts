export const SKILL_LISTING_STATUSES = ["PUBLIC", "REJECTED", "DELETED"] as const;
export const SKILL_COVER_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const SKILL_COVER_WIDTH = 1600;
export const SKILL_COVER_HEIGHT = 900;
export const SKILL_COVER_MAX_BYTES = 2 * 1024 * 1024;
export const SKILL_PACKAGE_MAX_BYTES = 50 * 1024 * 1024;

export type SkillListingStatus = (typeof SKILL_LISTING_STATUSES)[number];

export function isSkillListingStatus(value: string): value is SkillListingStatus {
  return (SKILL_LISTING_STATUSES as readonly string[]).includes(value);
}

export type SkillCoverContentType = (typeof SKILL_COVER_CONTENT_TYPES)[number];

export function isSkillCoverContentType(value: string): value is SkillCoverContentType {
  return (SKILL_COVER_CONTENT_TYPES as readonly string[]).includes(value);
}

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

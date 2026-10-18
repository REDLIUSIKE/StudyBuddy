export const SKILL_LISTING_STATUSES = ["PUBLIC", "REJECTED", "DELETED"];
export const SKILL_COVER_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const SKILL_COVER_WIDTH = 1600;
export const SKILL_COVER_HEIGHT = 900;
export const SKILL_COVER_MAX_BYTES = 2 * 1024 * 1024;
export const SKILL_PACKAGE_MAX_BYTES = 50 * 1024 * 1024;
export function isSkillListingStatus(value) {
    return SKILL_LISTING_STATUSES.includes(value);
}
export function isSkillCoverContentType(value) {
    return SKILL_COVER_CONTENT_TYPES.includes(value);
}
//# sourceMappingURL=skill-marketplace.js.map
const CONTROL_CHARACTER_PATTERN = /[\p{Cc}\p{Cf}]/u;
export function normalizeProfileNickname(value, error) {
    if (typeof value !== "string")
        throw new TypeError(error);
    const normalized = value.normalize("NFKC");
    if (CONTROL_CHARACTER_PATTERN.test(normalized))
        throw new TypeError(error);
    const nickname = normalized.trim().replace(/\s+/gu, " ");
    const characterCount = Array.from(nickname).length;
    if (characterCount < 2 || characterCount > 24)
        throw new TypeError(error);
    const folded = nickname.toLocaleLowerCase("en-US").replace(/[\s_-]+/gu, "");
    if (folded === "studybuddy" ||
        (folded.includes("studybuddy") && /官方|客服|管理员|admin|official/u.test(folded))) {
        throw new TypeError(error);
    }
    return nickname;
}
export function parseCanonicalProfileViewNickname(value, error) {
    const canonical = normalizeProfileNickname(value, error);
    if (canonical !== value)
        throw new TypeError(error);
    return canonical;
}
//# sourceMappingURL=profile-nickname.js.map
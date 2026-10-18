/** Fixed product and credential-area links; no query, fragments, credentials or arbitrary destinations. */
const official = new Set(['https://guijitongzhuo.com/', 'https://modal.com/', 'https://www.autodl.com/', 'https://paperclip.gxl.ai/', 'https://metaso.cn/', 'https://exa.ai/', 'https://open.bochaai.com/', 'https://modal.com/settings/tokens', 'https://paperclip.gxl.ai/keys', 'https://dashboard.exa.ai/api-keys', 'https://metaso.cn/search-api/api-keys']);
export function researchOfficialLink(value) { if (!official.has(value))
    throw Error('RESEARCH_EXTERNAL_LINK_DENIED'); return value; }
//# sourceMappingURL=research-links.js.map
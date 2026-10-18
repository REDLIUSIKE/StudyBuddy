/** Public contact and bonus notice options shared by Host and Client. */
import z from '@deepseek-ai/schemastery';
/** Validate public questionnaire options. */
export const ContactConfigFields = {
    contactFormUrl: z.string().pattern(/^https:\/\/[^/\s]+\//).default('https://trtgsjkv6r.feishu.cn/share/base/form/shrcnlCoGElW7MQznGy9r3YYXcg?hide_uid=1&hide_device_info=1&hide_harness_version=1'),
    contactSource: z.string().default(''),
    bonusAckRetryDelayMs: z.number().min(1).default(1_000),
    bonusAckRetryMaxDelayMs: z.number().min(1).default(60_000),
};
/** Validate public questionnaire options. */
export const ContactConfig = z.object(ContactConfigFields);
/** Bootstrap key containing no account credentials. */
export const CONTACT_CONFIG_GLOBAL = '__DSH_CONTACT_CONFIG__';
//# sourceMappingURL=contact-config.js.map
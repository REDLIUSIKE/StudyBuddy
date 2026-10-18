/** Shared Web and desktop developer-tool preference stored by the Host. */
import z from '@deepseek-ai/schemastery';
/** Namespace for developer UI and HTML preview capabilities. */
export const DEVELOPER_TOOLS_NAMESPACE = 'ui-settings';
/** New installations and missing values enable the full interface. */
export const DeveloperToolsSettingsFields = {
    enabled: z.boolean().default(true),
};
/** Schema for shared configuration values. */
export const DeveloperToolsSettingsSchema = z.object(DeveloperToolsSettingsFields);
//# sourceMappingURL=developer-tools-settings.js.map
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { AccountFace } from './face.ts';
export type ModelsSettingsProps = InjectFace<AccountFace> & PropsLocale<'studybuddy.account'>;
/** Keep the existing Models navigation entry while using the actual chat source authority. */
export declare function ModelsSettings({ t, useAccount, useSource, source, activate }: ModelsSettingsProps): import("react").JSX.Element;
//# sourceMappingURL=ModelsSettings.d.ts.map
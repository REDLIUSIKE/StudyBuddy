import type { PropsRuntime, PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots';
import type { ToolFace } from './index.ts';
export type ToolCenterPanelProps = (PropsRuntime<'main'> | PropsRuntime<'settings.section'>) & PropsLocale<'studybuddy.tools'> & InjectFace<ToolFace>;
export declare function ToolCenterPanel({ useTools, desktop, attach, retry, t, laboratory }: ToolCenterPanelProps): import("react").JSX.Element;
export declare function ToolsPanelIcon({ size }: Pick<PropsRuntime<'sidebar.panellist'>, 'size'>): import("react").JSX.Element;
export declare function LabsPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>): import("react").JSX.Element;
//# sourceMappingURL=ToolCenterPanel.d.ts.map
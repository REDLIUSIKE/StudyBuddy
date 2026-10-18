import type { ProjectCreateRequest, SourceFolderView, WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client';
import type { WorkspacePickerProps } from './contract/slots.ts';
/** Only local form data and parent-owned commands cross this component. */
export interface CreateProjectProps {
    readonly open: boolean;
    readonly t: WorkspacePickerProps['t'];
    readonly canChooseFolder: boolean;
    readonly chooseFolder: () => Promise<string | undefined>;
    readonly registerSource: (input: {
        path: string;
    }) => Promise<SourceFolderView>;
    readonly createProject: (input: ProjectCreateRequest) => Promise<WorkspaceView>;
    readonly onCreated: (workspaceId: WorkspaceId) => void;
    readonly onClose: () => void;
}
/**
 * Render the confirmed project's name and optional source-folder form.
 * @param props - localized form copy, directory interaction and Host commands.
 * @returns the modal; closing cancels presentation, not an already committed Host operation.
 */
export declare function CreateProject(props: CreateProjectProps): import("react").JSX.Element;
//# sourceMappingURL=CreateProject.d.ts.map
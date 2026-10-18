/** Native video controls over authenticated, seekable file responses. */
import { type ReactNode } from 'react';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { DocumentPreviewProps } from '../document/contract.ts';
export type VideoBodyProps = DocumentPreviewProps & PropsLocale<'sidebarVideo'>;
/** Render a live addressed video, pausing and releasing it with its tab and Session surface. */
export declare function VideoBody({ content, resourceAddress, useResource, useTabInfo, t }: VideoBodyProps): ReactNode;
//# sourceMappingURL=VideoBody.d.ts.map
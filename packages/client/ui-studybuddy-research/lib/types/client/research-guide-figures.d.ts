/** Original screenshots and explanatory illustrations, requested only when their chapter is visible. */
import type { researchGuideChapters } from './research-guide-content.ts';
interface GuideImage {
    readonly id: string;
    readonly width: number;
    readonly height: number;
    readonly kind: 'snapshot' | 'diagram';
    readonly load: () => Promise<{
        default: string;
    }>;
}
interface GuideFigure extends GuideImage {
    /** Percent coordinates identify clear space beneath the annotated item. */
    readonly points: readonly {
        readonly x: number;
        readonly y: number;
    }[];
    readonly bottomMarkers?: boolean;
    readonly detail?: GuideImage;
}
type ChapterId = typeof researchGuideChapters[number]['id'];
/** Numbered locations correspond to each chapter's three localized explanations. */
export declare const researchGuideFigures: Readonly<Record<ChapterId, GuideFigure>>;
export {};
//# sourceMappingURL=research-guide-figures.d.ts.map
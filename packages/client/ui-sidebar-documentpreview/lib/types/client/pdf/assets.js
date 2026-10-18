/** Build-owned, same-version PDF.js resources; all binary assets are decoded locally. */
import workerSource from 'pdfjs-dist/build/pdf.worker.min.mjs?raw';
export { workerSource };
/**
 * Capture this build's binary assets without network fallbacks.
 * @param assets - build-inlined base64 resources, read only when a PDF is opened.
 * @returns the constructor passed to PDF.js getDocument.
 */
export function createPdfBinaryDataFactory(assets = __DSH_PDFJS_ASSETS__) {
    return class {
        fetch({ kind, filename }) {
            return Promise.resolve().then(() => {
                const files = assets[kind];
                const data = Object.hasOwn(files, filename) ? files[filename] : undefined;
                if (data === undefined)
                    throw new Error(`PDF.js asset is not bundled: ${kind}/${filename}`);
                return Uint8Array.from(atob(data), character => character.charCodeAt(0));
            });
        }
    };
}
//# sourceMappingURL=assets.js.map
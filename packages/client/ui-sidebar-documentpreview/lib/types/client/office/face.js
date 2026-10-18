/**
 * Bind Office reads to store actions without exposing Remote work to the component.
 * @param read - authorized conversion reader, including Client cache reuse.
 * @param describeFailure - localized conversion or source-access failure text.
 * @returns Slot inject factory; the file address supplies the read's Session authority.
 */
export function officeFace(read, describeFailure) {
    return (_sessionId, actions) => ({
        load: (tabId, revision, file, signal, loaded, failed) => {
            if (signal.aborted)
                return;
            actions.loading(tabId, revision);
            void read(file, signal).then((result) => {
                if (signal.aborted)
                    return;
                if (result.ok) {
                    actions.complete(tabId, revision, result.value);
                    loaded(result.value.version);
                }
                else {
                    actions.failed(tabId, revision, { code: result.error.code, message: describeFailure(result.error) });
                    failed();
                }
            }, (error) => {
                if (!signal.aborted) {
                    actions.failed(tabId, revision, {
                        code: 'gateway/internal', message: describeFailure({ message: error instanceof Error ? error.message : String(error) }),
                    });
                    failed();
                }
            });
        },
    });
}
//# sourceMappingURL=face.js.map
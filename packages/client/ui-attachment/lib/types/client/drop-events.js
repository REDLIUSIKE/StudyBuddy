/**
 * Members of a drop that are directories. The `File` a directory drop yields
 * is indistinguishable from an empty file, so the entry API is the only
 * source of that fact; browsers without it report no directories.
 */
function droppedDirectories(dataTransfer, files) {
    const directories = new Set();
    let fileIndex = 0;
    for (const item of dataTransfer.items) {
        if (item.kind !== 'file')
            continue;
        const file = files[fileIndex++];
        if (typeof item.webkitGetAsEntry !== 'function')
            continue;
        if (item.webkitGetAsEntry()?.isDirectory !== true)
            continue;
        if (file !== undefined)
            directories.add(file);
    }
    return directories;
}
/**
 * Install one attachment view's file-drop listeners.
 * @param canAcceptDrop - whether this view accepts the dropped files.
 * @param onAddFiles - attachment intake callback.
 * @param dragDepth - the view's retained nested-drag counter.
 * @param setDragActive - publish whether a file drag is active.
 * @returns cleanup for exactly these listeners.
 */
export function installDocumentDropEvents(canAcceptDrop, onAddFiles, dragDepth, setDragActive) {
    const fileTransfer = (event) => {
        const dataTransfer = event.dataTransfer;
        if (dataTransfer === null || !dataTransfer.types.includes('Files'))
            return null;
        return dataTransfer;
    };
    const reset = () => {
        dragDepth.current = 0;
        setDragActive(false);
    };
    const onDragEnter = (event) => {
        if (fileTransfer(event) === null)
            return;
        event.preventDefault();
        dragDepth.current += 1;
        setDragActive(true);
    };
    const onDragOver = (event) => {
        const dataTransfer = fileTransfer(event);
        if (dataTransfer === null)
            return;
        event.preventDefault();
        dataTransfer.dropEffect = canAcceptDrop ? 'copy' : 'none';
    };
    const onDragLeave = (event) => {
        if (fileTransfer(event) === null)
            return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0)
            setDragActive(false);
        const leftViewport = event.clientX <= 0 || event.clientY <= 0
            || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight;
        if ((event.target === document.documentElement || event.target === document.body) && leftViewport)
            reset();
    };
    const onDrop = (event) => {
        const dataTransfer = fileTransfer(event);
        if (dataTransfer === null)
            return;
        event.preventDefault();
        reset();
        if (canAcceptDrop) {
            const files = [...dataTransfer.files];
            onAddFiles(files, droppedDirectories(dataTransfer, files));
        }
    };
    document.addEventListener('dragenter', onDragEnter);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('drop', onDrop);
    window.addEventListener('dragend', reset);
    return () => {
        document.removeEventListener('dragenter', onDragEnter);
        document.removeEventListener('dragover', onDragOver);
        document.removeEventListener('dragleave', onDragLeave);
        document.removeEventListener('drop', onDrop);
        window.removeEventListener('dragend', reset);
    };
}
//# sourceMappingURL=drop-events.js.map
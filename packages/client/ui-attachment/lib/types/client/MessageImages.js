import { jsx as _jsx } from "react/jsx-runtime";
import { ImageGallery } from "../MessageImage.js";
import { messageImageLabels } from "./labels.js";
/** Historical message-image slot entry. */
export function MessageImages({ images, loadImage, align, compact = false, thumbnail = false, t }) {
    return (_jsx(ImageGallery, { images: images, load: loadImage, align: align, compact: compact, thumbnail: thumbnail, labels: messageImageLabels(t) }));
}
//# sourceMappingURL=MessageImages.js.map
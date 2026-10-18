import {createHash} from 'node:crypto';
// Adapter wire/version authority. Each dynamic tool also carries its complete live descriptor digest.
export const AIGC_CAPABILITY_REVISION=createHash('sha256').update('StudyBuddy AIGC capability v1:actual-caller;single-canvas;live-schema;media-v1').digest('hex');

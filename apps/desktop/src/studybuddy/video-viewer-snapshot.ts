/** Static editor DOM query shared by its preload and Main's before/after capture check. */
export function readVideoViewerSnapshot():unknown{
 const element=document.querySelector('[data-studio-viewer-capture]')
 if(!element)return null
 const rect=element.getBoundingClientRect()
 return {projectId:element.getAttribute('data-studio-project'),time:Number(element.getAttribute('data-studio-time')),
  rect:{x:Math.floor(rect.x),y:Math.floor(rect.y),width:Math.ceil(rect.width),height:Math.ceil(rect.height)}}
}
export const VIDEO_VIEWER_SNAPSHOT_SCRIPT=`(${readVideoViewerSnapshot.toString()})()`

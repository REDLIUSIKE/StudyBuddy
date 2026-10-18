export const VIDEO_DOMAIN_VERSION = 1;
export function validateVideoScope(value) {
  if (!value || typeof value !== 'object') throw new Error('Video scope is required');
  for (const field of ['accountGeneration','workspaceId','projectId','sessionId'])
    if (typeof value[field] !== 'string' || !value[field] || value[field].length > 512)
      throw new Error('Invalid video scope: '+field);
  return value;
}
export function validateVideoEdit(edit) {
  if (!edit || typeof edit !== 'object') throw new Error('Video edit is required');
  if (edit.kind === 'film-ops' && Array.isArray(edit.ops)) return edit;
  if (edit.kind !== 'replace-file' || typeof edit.relativePath !== 'string' || typeof edit.text !== 'string')
    throw new Error('Invalid video document edit');
  if (!edit.relativePath || /(^|[\\/])\\.\\.?([\\/]|$)|[:\0]/.test(edit.relativePath) || /^[\\/]/.test(edit.relativePath))
    throw new Error('Video edit path is outside the admitted project');
  if (edit.relativePath.split(/[\\/]/).some(part => part.startsWith('.')))
    throw new Error('Private video metadata cannot be edited as a document');
  return edit;
}

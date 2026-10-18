/** Reject a packaged Host whose preset roster contains an unusable built-in. */
export function assertUsablePresetRoster(value: unknown): void {
  if (!Array.isArray(value) || !value.some(row => row?.id === 'standard') || !value.some(row => row?.id === 'skill-safety')) {
    throw new Error('desktop runtime: required agent presets are missing')
  }
  for (const row of value) {
    if (typeof row !== 'object' || row === null || typeof row.id !== 'string') {
      throw new Error('desktop runtime: invalid agent preset roster')
    }
    if (row.broken !== undefined) throw new Error(`desktop runtime: agent preset ${row.id} failed to load: ${String(row.broken)}`)
  }
}

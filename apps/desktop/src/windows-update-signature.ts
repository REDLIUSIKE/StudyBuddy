/** Windows-trusted, timestamped update signatures without a publisher-name or certificate pin. */
import { execFile } from 'node:child_process'
import { unlink } from 'node:fs/promises'
import { join, resolve, toNamespacedPath } from 'node:path'
import { promisify } from 'node:util'
import type { AppUpdater } from 'electron-updater'

const execFileAsync = promisify(execFile)
const inspectionCommand = '$ErrorActionPreference="Stop"; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); '
  + 'Import-Module "$PSHOME/Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1" -ErrorAction Stop; '
  + 'Import-Module "$PSHOME/Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1" -ErrorAction Stop; '
  + '$s=Get-AuthenticodeSignature -LiteralPath $env:STUDYBUDDY_UPDATE_VERIFY_FILE; '
  + '[pscustomobject]@{status=[string]$s.Status;timestamped=($null -ne $s.TimeStamperCertificate);'
  + 'thumbprint=$s.SignerCertificate.Thumbprint}|ConvertTo-Json -Compress'

/**
 * Verify Windows trust and timestamp after electron-updater has checked the downloaded file's hash.
 * @param _publishers - Legacy updater metadata; replacement certificate subjects are permitted.
 * @param path - Downloaded executable inspected as data, never executed.
 * @returns Null for a valid timestamped signature, or a rejection understood by NsisUpdater.
 */
export async function verifyWindowsUpdateSignature(_publishers: string[], path: string): Promise<string | null> {
  const environment = Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => !/(?:KEY|SECRET|TOKEN|PASSWORD|LICENSE|LICENCE)|^(?:PSModulePath|NODE_OPTIONS|NODE_PATH)$/iu.test(name)))
  try {
    const { stdout, stderr } = await execFileAsync(join(process.env.SystemRoot ?? 'C:\\Windows',
      'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), [
      '-NoProfile', '-NonInteractive', '-Command', inspectionCommand,
    ], {
      env: { ...environment, STUDYBUDDY_UPDATE_VERIFY_FILE: toNamespacedPath(resolve(path)) },
      encoding: 'utf8', windowsHide: true, timeout: 60_000, maxBuffer: 64 * 1024,
    })
    const signature: unknown = JSON.parse(stdout)
    if (stderr.trim() === '' && typeof signature === 'object' && signature !== null
      && 'status' in signature && signature.status === 'Valid'
      && 'timestamped' in signature && signature.timestamped === true
      && 'thumbprint' in signature && typeof signature.thumbprint === 'string'
      && /^[A-F\d]{40}$/iu.test(signature.thumbprint)) return null
    return 'Windows update requires a valid, trusted Authenticode signature and timestamp'
  } catch (_error) {
    return 'Windows update signature verification could not be completed'
  }
}

/**
 * Install the rotating-certificate policy on Windows NSIS updaters before any download starts.
 * @param updater - Process-owned updater, or an injected updater used by qualification.
 * @param platform - Runtime OS; other platform updaters keep their own signature checks.
 * @returns Download-scoped verification, or undefined for non-Windows/non-NSIS updaters.
 */
export function configureWindowsUpdateSignature(updater: AppUpdater, platform: NodeJS.Platform = process.platform): {
  beginDownload(): void
  verifyDownload(files: string[]): Promise<void>
} | undefined {
  if (platform !== 'win32' || !('verifyUpdateCodeSignature' in updater)) return undefined
  let verified = false
  updater.verifyUpdateCodeSignature = async (publishers: string[], path: string) => {
    updater.logger?.info(`Verifying signature ${path}`)
    const failure = await verifyWindowsUpdateSignature(publishers, path)
    verified = failure === null
    return failure
  }
  return {
    beginDownload() { verified = false },
    async verifyDownload(files) {
      const path = files[0]
      if (path === undefined) throw new Error('Windows update did not provide a prepared installer')
      // Cached downloads and missing legacy publisher metadata can bypass NSIS's callback.
      if (verified) return
      updater.logger?.info(`Verifying signature ${path}`)
      const failure = await verifyWindowsUpdateSignature([], path)
      if (failure === null) return
      try { await unlink(path) }
      catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
          throw new Error(`${failure}; rejected update could not be removed`)
        }
      }
      throw Object.assign(new Error(failure), { code: 'ERR_UPDATER_INVALID_SIGNATURE' })
    },
  }
}

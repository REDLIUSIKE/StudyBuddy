/** Generic update endpoint emitted into the packaged Windows application. */
export interface WindowsGenericUpdatePublish {
  readonly provider: 'generic'
  readonly url: string
  readonly channel?: string
}

/** Electron application metadata needed to derive the stable updater cache directory. */
export interface WindowsUpdatePackageMetadata {
  readonly name: string
  readonly version: string
}

/**
 * Preserve the approved publisher and generic update endpoint for a prepared Windows installer.
 * @param configuration Electron Builder configuration containing exactly one generic endpoint.
 * @param metadata Packaged application name and version.
 * @returns Update configuration with its stable cache directory and approved publisher.
 */
export function windowsAppUpdateConfiguration(
  configuration: { readonly productName?: string; readonly publish: readonly WindowsGenericUpdatePublish[] },
  metadata: WindowsUpdatePackageMetadata,
): WindowsGenericUpdatePublish & { readonly updaterCacheDirName: string; readonly publisherName: readonly string[] }

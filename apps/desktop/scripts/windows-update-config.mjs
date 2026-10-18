/** Preserve electron-builder's update metadata when resuming from a prepared Windows directory. */
import { AppInfo } from 'app-builder-lib/out/appInfo.js'
import { STUDYBUDDY_WINDOWS_UPDATE_PUBLISHER } from './studybuddy-evsign.mjs'
export function windowsAppUpdateConfiguration(configuration, metadata) {
  if (!Array.isArray(configuration.publish) || configuration.publish.length !== 1 || configuration.publish[0].provider !== 'generic') {
    throw Error('Windows prepared installer requires one fixed generic update feed')
  }
  const info = new AppInfo({ metadata, config: configuration })
  return { ...configuration.publish[0], updaterCacheDirName: info.updaterCacheDirName,
    publisherName: [STUDYBUDDY_WINDOWS_UPDATE_PUBLISHER] }
}

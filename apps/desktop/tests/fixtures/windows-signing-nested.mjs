/** A supervised nested worker must reject inherited ownership without entering the signing stage. */
import { withWindowsSigningStage } from '../../scripts/windows-signing-stage.mjs'

try {
  await withWindowsSigningStage({ stateDirectory: process.argv[2], stage: 'nested-worker',
    signal: AbortSignal.timeout(400), record: () => {},
  }, async () => { process.stdout.write('entered') })
} catch (error) {
  process.stderr.write(error.message)
  process.exitCode = 1
}

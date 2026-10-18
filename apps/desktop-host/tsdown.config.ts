import { defineConfig } from 'tsdown'
import {capabilityDomainInputsPlugin} from '../../scripts/studybuddy/capability-domain-build-inputs.mjs'

export default defineConfig(['index', 'cli', 'research-plugin', 'aigc-plugin', 'video-editing-plugin'].map(name => ({
  entry: ['lib/types/' + name + '.js'],
  plugins:[capabilityDomainInputsPlugin()],
  outDir: 'lib',
  format: ['esm'] as const,
  outputOptions: { codeSplitting: false },
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  copy: name === 'index' ? [{from:'studybuddy-search.patch.yml',to:'lib'}] : [],
})))

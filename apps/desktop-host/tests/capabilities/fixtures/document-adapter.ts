import type {CapabilityAdapter} from '../../../src/capabilities/types.ts'
import {createRpcCapabilityAdapter,type CapabilityAdapterPort} from '../../../src/capabilities/adapters/rpc-adapter.ts'
export const DOCUMENT_REVISION='c'.repeat(64)
/** Test-only extension. No novel-specific branch enters the production dispatcher. */
export function createDocumentAdapter(port:CapabilityAdapterPort):CapabilityAdapter{return createRpcCapabilityAdapter('novel',DOCUMENT_REVISION,port)}

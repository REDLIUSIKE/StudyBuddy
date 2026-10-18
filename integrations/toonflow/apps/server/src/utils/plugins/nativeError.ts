/** Stable bounded diagnostic transports the public plugin identifier, never its configuration or loader error. */
export function nativePluginError(name: string): Error {
  return new Error("AIGC_PLUGIN_INCOMPATIBLE_" + Buffer.from(name).subarray(0, 48).toString("hex").toUpperCase());
}

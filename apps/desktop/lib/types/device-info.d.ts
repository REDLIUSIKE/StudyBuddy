/**
 * Read the local machine description attached to a Desktop feedback submission.
 * Fields are `name=value` pairs separated by `; `, in platform, os, app_arch, cpu and
 * memory_gib order; memory is total physical memory in GiB with one decimal.
 * @returns the machine description, with unavailable fields omitted.
 */
export declare function readDeviceInfo(): string;
//# sourceMappingURL=device-info.d.ts.map
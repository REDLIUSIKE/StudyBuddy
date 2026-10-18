/** Install the inherited runtime resolution in one Harness-owned Worker. */
import { getEnvironmentData } from 'node:worker_threads';
import { installRuntimeInterception } from "./resolver.js";
const registration = getEnvironmentData('@deepseek-ai/dsh-app-boot/profile-resolution');
if (registration !== undefined)
    installRuntimeInterception(registration.resolution);
//# sourceMappingURL=worker-bootstrap.js.map
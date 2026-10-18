/** Definition and provider for the account-owned compiled AIGC domain. */
import { Service } from '@deepseek-ai/cordis';
export class AigcService extends Service {
}
export class CompiledAigcService extends AigcService {
    domain;
    starting;
    closing;
    constructor(ctx, domain) {
        super(ctx, 'aigcDomain');
        this.domain = domain;
    }
    start() {
        if (this.closing)
            return Promise.reject(Error('AIGC_DOMAIN_CLOSED'));
        return this.starting ??= this.domain.start();
    }
    invoke(input, signal) {
        signal.throwIfAborted();
        return this.closing ? Promise.reject(Error('AIGC_DOMAIN_CLOSED')) : this.domain.invoke(input, signal);
    }
    close() { return this.closing ??= this.domain.close(); }
}
//# sourceMappingURL=aigc-service.js.map
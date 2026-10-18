/** Research capability supplied by the compiled, account-scoped domain. */
import { Service } from '@deepseek-ai/cordis';
/** Service Definition for the research lifecycle consumed by the Host plugin. */
export class ResearchService extends Service {
}
/** Provider for an initialized compiled domain; owns one start and one close. */
export class CompiledResearchService extends ResearchService {
    domain;
    starting;
    closing;
    constructor(ctx, domain) {
        super(ctx, 'researchDomain');
        this.domain = domain;
    }
    get app() { return this.domain.app; }
    start() {
        if (this.closing !== undefined)
            return Promise.reject(new Error('RESEARCH_DOMAIN_CLOSED'));
        return this.starting ??= this.domain.start();
    }
    close() {
        return this.closing ??= this.domain.close();
    }
}
//# sourceMappingURL=research-service.js.map
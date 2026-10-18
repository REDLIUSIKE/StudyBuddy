import { Service } from '@deepseek-ai/cordis';
/** The video domain's lifecycle and editing capability, independent of its transport. */
export class VideoEditingService extends Service {
}
/** Provider for one verified compiled domain; owns idempotent start and close. */
export class CompiledVideoEditingService extends VideoEditingService {
    domain;
    starting;
    closing;
    constructor(ctx, domain) {
        super(ctx, 'videoEditing');
        this.domain = domain;
    }
    admitted() { if (this.closing)
        throw Error('VIDEO_DOMAIN_CLOSED'); }
    capabilityProjects(input) { this.admitted(); if (!this.domain.capabilityProjects)
        throw Error('VIDEO_CAPABILITY_UNAVAILABLE'); return this.domain.capabilityProjects(input); }
    capability(...args) { this.admitted(); if (!this.domain.capability)
        throw Error('VIDEO_CAPABILITY_UNAVAILABLE'); return this.domain.capability(...args); }
    admitPaths(admission) { this.admitted(); return this.domain.admitPaths(admission); }
    projectInfo(projectId) { this.admitted(); return this.domain.projectInfo(projectId); }
    start() { this.admitted(); return this.starting ??= this.domain.start(); }
    quiesceProject(scope) { this.admitted(); return this.domain.quiesceProject(scope); }
    readProject(scope) { this.admitted(); return this.domain.readProject(scope); }
    readGuide(scope, guide) { this.admitted(); return this.domain.readGuide(scope, guide); }
    readFile(scope, path) { this.admitted(); return this.domain.readFile(scope, path); }
    applyEdit(scope, revision, edit) { this.admitted(); return this.domain.applyEdit(scope, revision, edit); }
    look(scope, input) { this.admitted(); return this.domain.look(scope, input); }
    transcribe(scope, src, signal) { this.admitted(); return this.domain.transcribe(scope, src, signal); }
    mediaRequest(scope, input, signal) { this.admitted(); return this.domain.mediaRequest(scope, input, signal); }
    translate(scope, language, signal) { this.admitted(); return this.domain.translate(scope, language, signal); }
    createExport(scope, input) { this.admitted(); return this.domain.createExport(scope, input); }
    cancelExport(scope, id) { this.admitted(); return this.domain.cancelExport(scope, id); }
    readExports(scope, id) { this.admitted(); return this.domain.readExports(scope, id); }
    close() { return this.closing ??= this.domain.close(); }
}
//# sourceMappingURL=video-editing-service.js.map
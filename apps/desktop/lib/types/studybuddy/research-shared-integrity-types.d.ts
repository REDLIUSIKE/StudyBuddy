/** Portable shared runtime byte identities without Node or filesystem dependencies. */
/** A regular file relative to its selected shared installation. */
export interface ResearchSharedFile {
    path: string;
    size: number;
    sha256: string;
}
/** Runtime roots admitted for one package used by the sealed research profile. */
export interface ResearchSharedDshScope {
    packageName: string;
    path: string;
    entries: string[];
}
/** Actual Node package lookup from one frozen importer to a frozen package root. */
export interface ResearchSharedDshResolution {
    from: string;
    packageName: string;
    to: string;
}
/** Portable actual-byte identity; moving unchanged installations preserves this identity. */
export interface ResearchSharedIntegrity {
    schemaVersion: 1;
    generatorSha256: string;
    primary: {
        filesSha256: string;
        files: ResearchSharedFile[];
    };
    dsh: {
        filesSha256: string;
        scopes: ResearchSharedDshScope[];
        files: ResearchSharedFile[];
        resolutions: ResearchSharedDshResolution[];
    };
}
/** Main-selected shared roots; neither root is copied into research resources. */
export interface ResearchSharedIntegrityRoots {
    primaryRuntimeDirectory: string;
    dshDirectory: string;
}
//# sourceMappingURL=research-shared-integrity-types.d.ts.map
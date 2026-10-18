export declare const skillIntroduction: {
    title: string;
    summary: string;
    inputDescription: string;
    outputDescription: string;
    example: string;
    category: string;
    usageInstructions: string;
    dependencies: never[];
    declaredTools: string[];
};
export declare const githubPublication: {
    sourceKind: string;
    introduction: {
        title: string;
        summary: string;
        inputDescription: string;
        outputDescription: string;
        example: string;
        category: string;
        usageInstructions: string;
        dependencies: never[];
        declaredTools: string[];
    };
    github: {
        repositoryUrl: string;
        subdirectory: null;
        ref: null;
    };
    projectType: string;
};
export declare const githubEntry: {
    id: string;
    revision: number;
    publisherKind: string;
    sourceKind: string;
    introduction: {
        title: string;
        summary: string;
        inputDescription: string;
        outputDescription: string;
        example: string;
        category: string;
        usageInstructions: string;
        dependencies: never[];
        declaredTools: string[];
    };
    attribution: {
        role: string;
        displayName: string;
    };
    isCurated: boolean;
    status: string;
    coverUrl: null;
    updatedAt: string;
    isFavorite: boolean;
    metadataState: string;
    verifiedTools: never[];
    package: null;
    github: {
        repositoryUrl: string;
        subdirectory: null;
        ref: null;
        projectType: string;
        originalAuthor: string;
        stars: number;
        language: null;
        license: null;
        readmeSections: string[];
        readmeTruncated: boolean;
        retrievedAt: string;
    };
};

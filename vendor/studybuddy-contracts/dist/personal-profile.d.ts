import type { AcademicDirectoryItem } from "./academic.js";
export type AcademicEntityView = Readonly<{
    id: AcademicDirectoryItem["id"];
    name: AcademicDirectoryItem["name"];
    status: Extract<AcademicDirectoryItem["status"], "verified" | "pending">;
}>;
type CampusIdentityDetails = Readonly<{
    realName: string;
    school: AcademicEntityView;
    college: AcademicEntityView;
    program: AcademicEntityView;
    grade: string;
}>;
export type CampusIdentityState = Readonly<{
    status: "missing";
}> | (Readonly<{
    status: "pending";
}> & CampusIdentityDetails) | (Readonly<{
    status: "confirmed";
    revision: number;
}> & CampusIdentityDetails) | (Readonly<{
    status: "correction_pending";
    revision: number;
}> & CampusIdentityDetails);
export type OwnerPersonalProfileView = Readonly<{
    schemaVersion: 1;
    profileVersion: number;
    avatarUrl: string;
    nickname: string;
    publicId: string;
    membership: "lifetime" | "member" | "none";
    campus: CampusIdentityState;
    account: Readonly<{
        email: string;
        currentDeviceDisplayName: string | null;
    }>;
}>;
export type PublicProfileView = Readonly<{
    avatarUrl: string;
    nickname: string;
    publicId: string;
    membership: "lifetime" | "member" | "none";
}>;
export type CampusCollaboratorIdentityView = Readonly<{
    avatarUrl: string;
    nickname: string;
    realName: string;
    school: AcademicEntityView;
    college: AcademicEntityView;
    program: AcademicEntityView;
    grade: string;
}>;
export type PersonalProfileUpdate = Readonly<{
    nickname: string;
    expectedVersion: number;
}>;
export type PersonalProfileAvatarPreset = "male" | "female";
export type PersonalProfileAvatarPresetUpdate = Readonly<{
    preset: PersonalProfileAvatarPreset;
    expectedVersion: number;
}>;
export declare function parseOwnerPersonalProfileView(value: unknown): OwnerPersonalProfileView;
export declare function parsePublicProfileView(value: unknown): PublicProfileView;
export declare function parseCampusCollaboratorIdentityView(value: unknown): CampusCollaboratorIdentityView;
export declare function parsePersonalProfileUpdate(value: unknown): PersonalProfileUpdate;
export declare function parsePersonalProfileAvatarPresetUpdate(value: unknown): PersonalProfileAvatarPresetUpdate;
export declare function parseCampusIdentityState(value: unknown, error?: string): CampusIdentityState;
export {};

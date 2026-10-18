import type { StudyBuddyVault } from './services.ts';
interface Encryption {
    isEncryptionAvailable(): boolean;
    encryptString(value: string): Buffer;
    decryptString(value: Buffer): string;
}
export declare function studyBuddyVault(path: string, encryption: Encryption): StudyBuddyVault;
export {};
//# sourceMappingURL=vault.d.ts.map
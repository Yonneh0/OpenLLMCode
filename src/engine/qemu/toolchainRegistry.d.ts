import type { ArchitectureType, ToolchainFamily } from './types';
declare class ToolchainRegistry {
    private toolchainsDir;
    constructor();
    private getPaths;
    ensureToolchain(arch: ArchitectureType): Promise<ToolchainFamily>;
    private downloadToolchain;
    private downloadBinary;
    getProjectToolchains(projectDir: string): Promise<Record<string, ToolchainFamily>>;
    getAvailableToolchains(): ToolchainFamily[];
    hasToolchainForArch(arch: ArchitectureType): boolean;
}
export declare function getToolchainRegistry(): ToolchainRegistry;
export {};

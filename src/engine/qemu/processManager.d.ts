import type { VMInstance } from './types';
export declare class QEMUProcessManager {
    private instances;
    buildArgs(config: any): string[];
    private getDefaultMachine;
    createVM(config: any): Promise<VMInstance>;
    executeQMPCommand(vmId: string, command: string, args?: Record<string, unknown>): Promise<unknown>;
}

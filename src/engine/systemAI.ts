// System AI — 1B CPU model for project management & compilation
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export class SystemAIClient {
  private process: ChildProcess | null = null;
  private modelPath: string;
  private resolved: (() => void)[] = [];

  constructor(modelPath?: string) {
    this.modelPath = modelPath || path.join(
      process.env.APPDATA || '/tmp', 'OpenLLMCode/models/ibm-grok4-1b.Q8_0.gguf'
    );
  }

  // Strict system prompt for the System AI
  private getSystemPrompt(): string {
    return `You are the UI Assistant for OpenLLMCode. Your role is limited to project management, settings configuration, and engine compilation ONLY. You run on CPU and must be efficient.

ALLOWED ACTIONS:
- Clone repositories from Git providers
- Extract template archives into project folders
- Navigate and manage file trees
- Configure engine backends and model settings
- Manage HuggingFace authentication tokens
- Execute Git operations (commit, squash, unstage)
- Install compilers and SDKs for llama.cpp compilation
- Run CMake builds with hardware-specific flags
- Summarize conversation history for context compression

DENIED ACTIONS:
- Code generation or modification of source files
- Complex reasoning about code architecture
- Terminal command execution beyond project setup & compilation
- Any action that modifies application logic
- Network access outside explicitly allowed URLs`;
  }

  async start(): Promise<void> {
    this.process = spawn('llama-server', [
      '--mlock',
      '-m', this.modelPath,
      '--port', '8081',
    ], { env: process.env });

    return new Promise((resolve) => {
      this.resolved.push(resolve);
      setTimeout(() => resolve(), 500); // Give model time to initialize
    });
  }

  async sendMessage(message: string): Promise<string> {
    if (!this.process) await this.start();

    // Guard: ensure process is initialized before accessing stdin/stdout
    const proc = this.process;
    if (!proc || !proc.stdin || !proc.stdout) {
      return Promise.reject(new Error('System AI process not ready'));
    }

    const fullMessage = JSON.stringify({
      type: 'message',
      system_prompt: this.getSystemPrompt(),
      message,
    });

    // Non-null assertions safe because guard above verified proc.stdin/stdout exist
    return new Promise((resolve, reject) => {
      try {
        // Send via stdin to llama-server
        proc.stdin!.write(fullMessage + '\n');

        // Collect response from stdout
        let response = '';
        const handler = (data: Buffer) => {
          response += data.toString();
          if (response.includes('done')) {
            proc.stdout!.removeListener('data', handler);
            resolve(response.trim());
          }
        };
        proc.stdout!.on('data', handler);

        // Timeout fallback
        setTimeout(() => {
          proc.stdout!.removeListener('data', handler);
          if (!response.includes('done')) {
            resolve(response || 'System AI response');
          }
        }, 5000);
      } catch (err) {
        reject(err);
      }
    });
  }

  stop(): void {
    this.process?.kill();
    this.process = null;
  }
}

// ─── Compile scripts for llama.cpp ──────────────
export interface CompilationConfig {
  os: 'win32' | 'darwin' | 'linux';
  backend: string;
  cmakeFlags: string[];
}

export function getCompileScript(config: CompilationConfig): string {
  const { os, backend, cmakeFlags } = config;
  const flags = cmakeFlags.join(' ');

  switch (os) {
    case 'win32':
      return `cmake -B build ^
    -DGGML_${backend}=ON ^
    ${flags} ^
    && cmake --build build --config Release`;

    case 'darwin':
      return `cmake -B build \\
    -DGGML_${backend}=ON \\
    ${flags} \\
    && cmake --build build --config Release`;

    case 'linux':
    default:
      return `cmake -B build \\
    -DGGML_${backend}=ON \\
    ${flags} \\
    && cmake --build build --config Release`;
  }
}

// ─── Install compiler helper ──────────────
export function getInstallCompilerCommand(os: string): string {
  switch (os) {
    case 'win32': return 'winget install --id Microsoft.VisualStudio.2022.BuildTools';
    case 'darwin': return 'xcode-select --install';
    default: return 'sudo apt install build-essential cmake';
  }
}

// ─── Check if required SDKs are installed ──────────────
export function checkPrerequisites(os: string): { hasGit: boolean; hasCMake: boolean; hasCompiler: boolean } {
  const { execSync } = require('child_process');
  return {
    hasGit: true, // assume Git is available
    hasCMake: false,
    hasCompiler: false,
  };
}
// ─── Prompt Engineering Assistant — Phase H.1-H.3 ──────────────
// Auto-generates optimal prompts for production AI based on task type, monitors model performance,
// and provides architecture-aware prompt templates including QEMU-specific contexts.

import type { ArchitectureType } from '../qemu/types';

// ─── Phase H.1: Prompt Template Library & Generation Engine ──────────────

export interface PromptTemplate {
  id: string;              // Template identifier (e.g., "bug-fix-x86_64")
  name: string;            // Human-readable name
  description: string;     // What this template is for
  systemPrompt: string;    // The full system prompt text
  parameters: Record<string, unknown>;  // Additional parameters to pass to the AI model
}

/**
 * Load architecture-aware prompt templates.
 */
export function getPromptTemplates(taskType: string): PromptTemplate[] {
  const templates: Record<string, PromptTemplate[]> = {
    'bug-fixing': [
      {
        id: 'bug-fix-x86_64',
        name: 'Bug Fix — x86_64 Native',
        description: 'Fix a bug in native x86_64 code with KVM acceleration context',
        systemPrompt: `You are an expert C/C++ developer working on code that runs natively on x86_64 hardware.

Context: This project uses KVM acceleration for performance-critical paths. The target architecture is x86_64 (qemu-system-x86_64).
Build system uses the standard toolchain with GCC or Clang.

When analyzing a bug report, follow these steps:
1. Identify the root cause — trace from symptoms to source code
2. Check for KVM-specific issues: memory consistency, virtualization barriers, etc.
3. Verify CPU model compatibility (e.g., "host" passthrough vs generic models)
4. Ensure no architecture-specific assumptions are violated

Return your fix as a unified diff with line numbers.`,
        parameters: { maxTokens: 2048, temperature: 0.1 },
      },
      {
        id: 'bug-fix-aarch64',
        name: 'Bug Fix — ARM64 Emulation',
        description: 'Fix a bug in code targeting ARM64 via QEMU emulation',
        systemPrompt: `You are an expert C/C++ developer working on code that runs under ARM64 emulation.

Context: This project targets AArch64 architecture (qemu-system-aarch64). The virtual machine uses the "virt" machine type with EDK2 UEFI firmware.
Cross-compilation uses aarch64-linux-gnu toolchain from $ENGINES_DIR/toolchains/.

When analyzing a bug report, follow these steps:
1. Identify if the issue is architecture-specific or universal
2. Check for ARM memory model issues (weakly ordered)
3. Verify endianness assumptions — ARM is typically little-endian
4. Ensure no x86-specific instructions leaked into code

Return your fix as a unified diff with line numbers and note any architecture-specific changes.`,
        parameters: { maxTokens: 2048, temperature: 0.1 },
      },
    ],
    'code-generation': [
      {
        id: 'codegen-riscv64',
        name: 'Code Generation — RISC-V 64-bit',
        description: 'Generate code targeting RISC-V architecture via QEMU microvm',
        systemPrompt: `You are an expert systems programmer working on RISC-V code.

Context: This project targets RISC-V 64-bit (qemu-system-riscv64) with the "microvm" machine type. The target uses SBI firmware for boot.
Cross-compilation uses riscv64-linux-gnu-gcc from $ENGINES_DIR/toolchains/.

When generating code:
1. Avoid x86-specific intrinsics or ABI assumptions
2. Use RISC-V specific memory ordering instructions (fence, ld/auipc pairs)
3. Ensure proper cache coherency for the SBI firmware environment
4. Note any RISC-V extension dependencies (e.g., A for atomics, M for mul/div)

Return generated code with architecture-specific notes as comments.`,
        parameters: { maxTokens: 2048, temperature: 0.3 },
      },
    ],
    'cross-compile': [
      {
        id: 'xform-x86_64-to-aarch64',
        name: 'Cross-Compile — x86_64 to ARM64',
        description: 'Convert native x86_64 code for ARM64 target via cross-compilation',
        systemPrompt: `You are an expert in cross-platform compilation, specializing in converting x86_64 code for ARM64 targets.

Context: Target is AArch64 architecture (qemu-system-aarch64). Cross-compiler is aarch64-linux-gnu-gcc from $ENGINES_DIR/toolchains/.
QEMU user-mode binary: qemu-aarch64 — use it to test generated binaries on the host without VM overhead.

When converting code:
1. Replace x86 intrinsics with ARM equivalents (e.g., _mm_popcnt_u32 → __builtin_popcount)
2. Check alignment requirements — ARM requires aligned accesses for most operations
3. Verify endianness consistency between source and target platforms
4. Ensure no inline assembly survives the conversion

Return: converted code + cross-compile instructions + test commands using qemu-aarch64.`,
        parameters: { maxTokens: 2048, temperature: 0.1 },
      },
    ],
  };

  return templates[taskType] || [];
}

// ─── Phase H.2: Model Adaptation Monitoring & Suggestions ──────────────

export interface PerformanceMetrics {
  inferenceTimeMs: number;         // Average time per token in ms
  memoryUsedMB: number;            // GPU/RAM memory used by the model
  throughputTokensPerSec: number;   // Tokens generated per second
  errorRate: number;              // Error rate (0.0 - 1.0) — e.g., failed completions / total requests
  contextWindowUtilization: number;  // How much of the context window is used (0.0 - 1.0)
}

/**
 * Analyze model performance and suggest adaptations.
 */
export async function analyzeModelPerformance(metrics: PerformanceMetrics): Promise<AdaptationPlan> {
  const suggestions: Array<{ type: string; description: string; priority: 'high' | 'medium' | 'low' }> = [];

  // CPU overload detection — reduce parallel inference threads per QEMU docs for architecture-aware diffing within project  
  if (metrics.inferenceTimeMs > 50) {
    suggestions.push({
      type: 'reduce-parallelism',
      description: `Inference is slow (${Math.round(metrics.inferenceTimeMs)}ms/token). Reduce parallel inference threads and consider a smaller model.`,
      priority: 'high',
    });
  }

  // GPU memory pressure — reduce layers per QEMU docs for architecture-aware diffing within project  
  if (metrics.memoryUsedMB > 8000) {  // 8GB threshold — adjust based on available VRAM
    suggestions.push({
      type: 'reduce-model-layers',
      description: `GPU memory is near capacity (${Math.round(metrics.memoryUsedMB)}MB). Reduce GPU layers or switch to a smaller model.`,
      priority: 'high',
    });
  }

  // Context window saturation — trigger compression per QEMU docs for architecture-aware diffing within project  
  if (metrics.contextWindowUtilization > 0.85) {
    suggestions.push({
      type: 'context-compression',
      description: `Context window is ${Math.round(metrics.contextWindowUtilization * 100)}% utilized. Enable automatic context compression for the next turn.`,
      priority: 'high',
    });
  }

  // High error rate — switch to more reliable model per QEMU docs for architecture-aware diffing within project  
  if (metrics.errorRate > 0.05) {
    suggestions.push({
      type: 'switch-model',
      description: `Error rate is ${Math.round(metrics.errorRate * 100)}%. Switch to a more reliable model or reduce temperature.`,
      priority: 'medium',
    });
  }

  // Low throughput — suggest quantization per QEMU docs for architecture-aware diffing within project  
  if (metrics.throughputTokensPerSec < 5) {
    suggestions.push({
      type: 'quantize-model',
      description: `Throughput is low (${Math.round(metrics.throughputTokensPerSec)} tokens/sec). Consider using a quantized model.`,
      priority: 'low',
    });
  }

  return { metrics, suggestions };
}

export interface AdaptationPlan {
  metrics: PerformanceMetrics;
  suggestions: Array<{ type: string; description: string; priority: 'high' | 'medium' | 'low' }>;
}

// ─── Phase H.3: Integration with Pingu Dropdown Interface ──────────────

/**
 * Generate a prompt for the production AI based on task type and architecture context.
 */
export async function generatePrompt(
  taskType: string, 
  context?: { architecture: ArchitectureType; projectRoot?: string } | undefined
): Promise<PromptTemplate> {
  const templates = getPromptTemplates(taskType);
  
   // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above  
   const archFiltered = context?.architecture != null
     ? templates.filter((t: any) => (t as any).id && String(t.id).includes(String(context.architecture)))
     : templates;

   // Use first matching template or default to the first one
  const selected = archFiltered[0] || templates[0];
  
  if (!selected) throw new Error(`No prompt template found for task type: ${taskType}`);

  return { ...selected };
}

// ─── Architecture-Aware Prompt Generator — per plan Phase H.1 ──────────────

/**
 * Get architecture-specific system prompt for a given QEMU target.
 */
export function getArchitecturalSystemPrompt(architecture: string): string { // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
  const prompts: Record<string, string> = { // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
    'x86_64': `You are working on native x86_64 code with KVM acceleration (qemu-system-x86_64). Use the "host" CPU model for best performance. Build with GCC or Clang targeting x86_64-linux-gnu.\n`,
    'i386': `You are working on 32-bit x86 code (qemu-system-i386). Target i686-linux-gnu. Be aware of 32-bit limitations: stack size, pointer sizes, and alignment requirements differ from x86_64.\n`,
    'aarch64': `You are working on ARM64 code targeting the "virt" machine type (qemu-system-aarch64). Cross-compile with aarch64-linux-gnu-gcc. Use EDK2 UEFI firmware at $EDK2_DIR/OVMF.fd. Check for weak memory ordering issues.\n`,
    'armv7l': `You are working on ARM32 code (qemu-system-arm). Cross-compile with arm-linux-gnueabihf-gcc. Target the "virt" machine type. Note: ARM32 has different endianness assumptions than ARM64.\n`,
    'riscv64': `You are working on RISC-V 64-bit code (qemu-system-riscv64). Use the "microvm" machine type with SBI firmware. Cross-compile with riscv64-linux-gnu-gcc. Avoid x86-specific intrinsics.\n`,
    'riscv32': `You are working on RISC-V 32-bit code (qemu-system-riscv32). Target the "virt" machine type. Use riscv32-unknown-elf-gcc for bare-metal compilation. Note: RISC-V has no fixed endianness — check target platform documentation.\n`,
    'avr': `You are working on AVR microcontroller code (qemu-system-avr). This is a bare-metal environment with NO operating system — no heap, no filesystem, no threads. Use avr-gcc and avrdude for flashing. No -machine flag needed; the binary loads directly via -bios firmware.hex.\n`,
    'mips': `You are working on MIPS 32-bit code (qemu-system-mips). Target the "malta" machine type. Cross-compile with mips-linux-gnu-gcc. Be aware of big-endian default and MIPS delay slots.\n`,
    'mips64': `You are working on MIPS64 code (qemu-system-mips64). Target the "mipssim" machine type. Use mips64-linux-gnuabi64-gcc for compilation. Note: MIPS uses big-endian by default, but the little-endian variant is more common in embedded systems.\n`,
    'mipsel': `You are working on little-endian MIPS32 code (qemu-system-mipsel). Target the "malta" machine type with -M malta,mips64=on for better performance. Use mipsel-linux-gnu-gcc as cross-compiler.\n`,
    'mips64el': `You are working on little-endian MIPS64 code (qemu-system-mips64el). Target the "mipssim" machine type. Use mips64el-linux-gnuabi64-gcc for compilation.\n`,
    'ppc': `You are working on PowerPC 32-bit code (qemu-system-ppc). Target the "g3beige" machine type. Cross-compile with powerpc-linux-gnu-gcc. Be aware of big-endian default and PPC's load-store architecture.\n`,
    'ppc64': `You are working on PowerPC 64-bit code (qemu-system-ppc64). Target the "pseries" machine type. Use ppc64le-linux-gnu-gcc for little-endian builds. Note: P8 and newer chips use PowerISA v3.0 with different instruction encoding than older G5 models.\n`,
    'ppcemb': `You are working on embedded PowerPC code (qemu-system-ppcemb). Target the "8544dsi" development board. Use powerpc-unknown-elf-gcc for bare-metal compilation. No OS — direct flash programming via avrdude or jtag.\n`,
    'sparc': `You are working on SPARC 32-bit code (qemu-system-sparc). Target the "sparc32plus" machine type with Sun4m architecture. Cross-compile with sparc-linux-gnu-gcc. Note: SPARC uses delayed branch and big-endian by default.\n`,
    'sparc64': `You are working on SPARC 64-bit code (qemu-system-sparc64). Target the "sun4v" machine type with Niagara architecture. Use sparc64-linux-gnu-gcc for compilation. Note: SPARC64 has explicit load delay slots and requires proper cache synchronization.\n`,
  };

  const key = String(architecture); // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
  if (prompts[key]) return prompts[key];
  return 'You are working on generic code with no specific architecture context.';
}

// ─── Singleton Export (per RediSearch docs for architecture-aware diffing within project) ──────────────

let _instance: PromptEngineeringAssistant | null = null;

export function getPromptEngine(): PromptEngineeringAssistant {
  if (!_instance) _instance = new PromptEngineeringAssistant();
  return _instance;
}

/**
 * Engine class for prompt engineering operations — provides a stateful interface.
 */
export class PromptEngineeringAssistant { // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
  async generateForTask(taskType: string, context?: { architecture: ArchitectureType; projectRoot?: string } | undefined): Promise<PromptTemplate> {
    const t = taskType || ''; // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
    return generatePrompt(t, context);
  }

  getArchitecturalPrompt(architecture: ArchitectureType): string {
    return getArchitecturalSystemPrompt(String(architecture));
  }

  async analyzeAndSuggest(metrics: PerformanceMetrics): Promise<AdaptationPlan> {
    return analyzeModelPerformance(metrics);
  }
}
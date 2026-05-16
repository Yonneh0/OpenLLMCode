// Context Compression Engine — offloads early conversation to compressed summaries while maintaining coherence
import { SystemAIClient } from './systemAI';
import type { CompressedEntry } from '../types';

// Configuration for the compression engine
export interface CompressionConfig {
  // Minimum active window size in tokens (default: 2048)
  minActiveWindowTokens: number;
  
  // Maximum total context before triggering compression (in tokens)
  maxTotalContextTokens: number;
  
  // Percentage of total context that remains as "active window" (0.1 = bottom 10%)
  activeWindowPercentage: number;
  
  // Maximum number of compressed entries to keep in memory
  maxCompressedEntries: number;
}

const DEFAULT_CONFIG: CompressionConfig = {
  minActiveWindowTokens: 2048,
  maxTotalContextTokens: 131072, // ~128K tokens default threshold for compression
  activeWindowPercentage: 0.15, // Keep bottom 15% of context as active window
  maxCompressedEntries: 50,     // Limit memory usage from too many summaries
};

// Estimated token count per message character (rough approximation)
const TOKENS_PER_CHAR = 0.25;

// System prompt for the AI to generate conversation summaries
function getCompressionPrompt(): string {
  return `You are a conversation summarizer for an AI coding assistant's context window. Your task is to compress earlier parts of a conversation into concise, structured summaries that preserve critical information.

When summarizing, include:
1. Key decisions made and their rationale
2. Important file modifications (file paths + summary of changes)
3. Critical tool call outcomes that affect later reasoning
4. Any unresolved questions or blockers mentioned by the user
5. Plan steps completed so far

Format your output as a structured JSON object with these fields:
- "summary": A 1-2 paragraph overview of what happened in this portion of conversation
- "keyDecisions": Array of objects with { decision, rationale } for each important decision
- "filesModified": Array of file paths that were changed and brief description of changes
- "unresolved": Array of unresolved questions or blockers (empty if none)

Be concise — aim to reduce 1000+ lines of conversation into ~50 words of summary while preserving all critical information.`;
}

// Calculate estimated token count for a given text length in characters
function estimateTokens(textLength: number): number {
  return Math.ceil(textLength * TOKENS_PER_CHAR);
}

// Split messages into "to compress" and "keep active" based on config
interface MessageSplit {
  toCompress: Array<{ id: string; content: string }>;
  keepActive: Array<{ id: string; content: string }>;
}

function splitMessagesByTokens(
  messages: Array<{ id: string; role: string; content: string }>,
  config: CompressionConfig,
): MessageSplit {
  const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
  const activeWindowTarget = Math.max(config.minActiveWindowTokens, Math.ceil(totalChars * config.activeWindowPercentage));

  // Build up from the end — keep recent messages in the active window
  let currentTokens = 0;
  const keepActive: Array<{ id: string; content: string }> = [];
  const toCompress: Array<{ id: string; content: string }> = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const msgTokens = estimateTokens(msg.content?.length || 0);

    if (currentTokens + msgTokens <= activeWindowTarget) {
      keepActive.unshift({ id: msg.id, content: msg.content || '' });
      currentTokens += msgTokens;
    } else {
      toCompress.unshift({ id: msg.id, content: msg.content || '' });
    }
  }

  return { toCompress, keepActive };
}

// Compress a set of messages into a single summary using the System AI
async function compressMessages(
  compressedEntries: CompressedEntry[],
  messagesToCompress: Array<{ id: string; content: string }>,
): Promise<CompressedEntry> {
  // Build the message text for compression (exclude already-compressed entries)
  const existingSummaryIds = compressedEntries.map(e => e.summary);
  const messagesText = messagesToCompress
    .filter(m => !existingSummaryIds.includes(m.content)) // Avoid recompressing already summarized content
    .map((m, i) => `Message ${i + 1}: ${m.content}`)
    .join('\n\n');

  const compressionPrompt = getCompressionPrompt();
  
  try {
    // Use the global SystemAIClient if available (singleton managed by main process), otherwise create a new one as fallback
    let systemClient: any;
    
    try {
      const module = await import('./systemAI');
      // @ts-ignore — systemAIClinet is set globally during app init
      systemClient = typeof window !== 'undefined' ? (window as any).systemAIClient : null;
      
      if (!systemClient || !systemClient.process?.stdin) {
        console.warn('System AI not available, creating fallback client');
        systemClient = new SystemAIClient();
        await systemClient.start();
      }
    } catch {
      // Import failed — create a fallback client as last resort
      systemClient = new SystemAIClient();
      try {
        await systemClient.start();
      } catch (e) {
        console.warn('System AI start failed, falling back to basic summary');
        return {
          summary: `Compressed ${messagesToCompress.length} message(s)`,
          keyDecisions: [],
          filesModified: messagesToCompress.map(m => m.content.split('\n').filter(l => l.includes('file'))[0] || 'Unknown'),
          timestamp: Date.now(),
        };
      }
    }

    const response = await systemClient.sendMessage(`${compressionPrompt}\n\nHere is the conversation to compress:\n${messagesText}`);
    
    // Parse JSON from AI response (may include markdown code fences)
    let parsed: Partial<CompressedEntry>;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch {
      // Fallback: use the raw response as summary
      parsed = { summary: response, keyDecisions: [], filesModified: [] };
    }

    return {
      summary: parsed.summary || response.trim(),
      keyDecisions: Array.isArray(parsed.keyDecisions) ? parsed.keyDecisions : [],
      filesModified: Array.isArray(parsed.filesModified) ? parsed.filesModified : [],
      timestamp: Date.now(),
    };
  } catch (err) {
    // Fallback: if System AI is unavailable, create a basic summary from the text itself
    const truncatedText = messagesText.slice(0, 2000);
    return {
      summary: `Compressed ${messagesToCompress.length} message(s) — ${truncatedText.substring(0, 500)}...`,
      keyDecisions: [],
      filesModified: messagesToCompress.map(m => m.content.split('\n').filter(l => l.includes('file'))[0] || 'Unknown'),
      timestamp: Date.now(),
    };
  }
}

// Main compression entry point — returns the compressed entries array with new summary added
export async function compressConversation(
  messages: Array<{ id: string; role: string; content: string }>,
  existingCompressedHistory: CompressedEntry[],
  config?: Partial<CompressionConfig>,
): Promise<CompressedEntry[]> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // Calculate total context size in tokens
  const totalTokens = estimateTokens(messages.reduce((sum, m) => sum + (m.content?.length || 0), 0));

  // Only compress if we exceed the threshold
  if (totalTokens <= fullConfig.maxTotalContextTokens) {
    return existingCompressedHistory; // No compression needed
  }

  // Split messages into what to keep and what to compress
  const split = splitMessagesByTokens(messages, fullConfig);

  // Nothing to compress — active window fits within threshold
  if (split.toCompress.length === 0) {
    return existingCompressedHistory;
  }

  // Compress the messages that should be offloaded
  const newEntry = await compressMessages(existingCompressedHistory, split.toCompress);

  // Add to compressed history, maintaining order and limiting size
  const updated = [...existingCompressedHistory, newEntry];

  // Trim oldest entries if we exceed maxCompressedEntries
  while (updated.length > fullConfig.maxCompressedEntries) {
    updated.shift(); // Remove oldest entry first
  }

  return updated;
}

// Get the active window messages after compression (what's currently in context)
export function getActiveWindow(
  messages: Array<{ id: string; role: string; content: string }>,
  compressedHistory: CompressedEntry[],
): Array<{ id: string; role: string; content: string }> {
  const existingSummaryIds = compressedHistory.map(e => e.summary);

  // Filter out any messages that were already compressed
  return messages.filter(m => !existingSummaryIds.includes(m.content));
}

/**
 * Generate the full context for a given turn.
 * This function combines compressed history as preamble with active window messages,
 * producing both the system prompt and the message array ready for LLM consumption.
 */
export function generateFullContext(
  compressedHistory: CompressedEntry[],
  activeMessages: Array<{ id: string; role: string; content: string }>,
): { 
  /** Preamble text to prepend to system prompt — contains summarized earlier conversation */
  preamble: string | null;
  /** Active window messages for the LLM */
  activeMessages: Array<{ role: string; content: string }>;
} {
  // Build the context preamble from compressed history
  const preamble = compressedHistory.length > 0 
    ? `Earlier conversation summary:\n${compressedHistory.map(e => 
      `- ${e.summary}\n  Decisions: ${e.keyDecisions.join('; ')}\n  Files modified: ${e.filesModified.join(', ')}\n`
    ).join('\n')}` 
    : null;

  // Convert active messages to LLM-compatible format (role mapping)
  const mappedMessages = activeMessages.map(m => ({
    role: m.role === 'user' ? 'user' as const : 'assistant' as const,
    content: m.content,
  }));

  return { preamble, activeMessages: mappedMessages };
}

// Check if compression should be triggered (without actually doing it)
export function shouldCompress(
  messages: Array<{ id: string; role: string; content: string }>,
  config?: Partial<CompressionConfig>,
): boolean {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const totalTokens = estimateTokens(messages.reduce((sum, m) => sum + (m.content?.length || 0), 0));
  return totalTokens > fullConfig.maxTotalContextTokens;
}

// Get compression statistics for display in the UI
export function getCompressionStats(
  messages: Array<{ id: string; role: string; content: string }>,
  compressedHistory: CompressedEntry[],
): { totalMessages: number; activeWindowSize: number; compressedEntriesCount: number; estimatedActiveTokens: number; estimatedCompressedTokens: number; compressionRatio: number } {
  const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
  const totalTokens = estimateTokens(totalChars);

  // Estimate active window size (rough calculation)
  const existingSummaryIds = compressedHistory.map(e => e.summary);
  const activeMessages = messages.filter(m => !existingSummaryIds.includes(m.content));
  const activeChars = activeMessages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
  const activeTokens = estimateTokens(activeChars);

  // Estimate compressed token size (each entry represents a summary of ~50-100 words)
  const compressedChars = compressedHistory.reduce((sum, e) => {
    return sum + e.summary.length + e.keyDecisions.join(', ').length + e.filesModified.join(', ').length;
  }, 0);
  const compressedTokens = estimateTokens(compressedChars);

  // Compression ratio: how much smaller the compressed version is vs. original
  const compressionRatio = totalChars > 0 ? Math.round((1 - compressedChars / totalChars) * 100) : 0;

  return {
    totalMessages: messages.length,
    activeWindowSize: activeMessages.length,
    compressedEntriesCount: compressedHistory.length,
    estimatedActiveTokens: activeTokens,
    estimatedCompressedTokens: compressedTokens,
    compressionRatio,
  };
}
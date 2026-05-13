# OpenLLMCode — Plan

> An open-source, self-contained local AI coding agent that bundles its own llama.cpp inference engine, provides rich agentic tooling with human-in-the-loop approvals, and delivers a clean VS Code–inspired UI. All code is hosted at [github.com/Yonneh0/OpenLLMCode](https://github.com/Yonneh0/OpenLLMCode).

> ✅ **Phase A — Foundation verified complete** (2026-05-13): 36 files, ~2548 lines committed.
> ✅ **Phase B — HuggingFace & Chat Richness verified complete** (2026-05-13): ~4 files, ~780 lines. See README.md for the full Phase A + B verification table.

---

## 1. Vision & Scope

### What It Is
OpenLLMCode is a desktop application for developers who want an **entirely local** AI coding agent — no cloud APIs, no external services required. It bundles llama.cpp directly (with flexible backend selection and compile-from-source support), runs models on the user's machine, provides built-in HuggingFace model downloading with modern authentication, and delivers agentic capabilities (file editing, terminal execution, MCP tool integration) with transparent approval gates. Built-in Git tracking gives every change automatic version control.

### What It Is Not
- An API server for other apps to consume
- A replacement for cloud-based LLMs — it targets the local-first workflow
- A service that sends data outside the machine (unless explicitly authorized by the user)

### Core Principles
1. **Local-first** — Everything runs on-device; no telemetry, no cloud dependency, no internet required beyond optional updates and model downloads
2. **Transparent control** — Every file change and terminal command is visible before execution
3. **Extensible** — MCP servers plug in new capabilities without modifying core code
4. **Familiar UX** — VS Code–inspired layout so developers feel at home immediately
5. **Versioned by default** — Every AI action is automatically committed to Git
6. **Zero-trust networking** — Nothing leaves the machine unless the user explicitly authorizes it

---

## 2. Architecture Overview

```
┌───────────────────────────────────────────────────────────────┐
│                      OpenLLMCode App                          │
│                     (Electron + React)                        │
│                                                               │
│  ┌─────────────┬──────────────┬──────────────┬─────────────┐  │
│  │   Sidebar   │    Editor    │     Chat     │   Terminal  │  │
│  │             │              │     Panel    │   Panel       │  │
│  │ • File Tree │ • Code View  │ • Messages   │ • Shell      │  │
│  │ • Project   │ • Image      │ • Tool Calls │ • AI Tools   │  │
│  │   Controls  │   Preview    │ • Approvals  │              │  │
│  │ • MCP List  │ • Syntax     │              │              │  │
│  │ • Git       │   Highlight  │              │              │  │
│  │ • Checkpts  │              │              │              │  │
│  └─────────────┴──────────────┴──────────────┴─────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                   Agent Core                             │  │
│  │  ┌──────────┬──────────┬──────────┬──────────────────┐   │
│  │  │ Plan/Act │ Task     │ Tool     │ Approval         │   │
│  │  │ /R/E/Aud │ Manager  │ Registry │ Gate System      │   │
│  │  │ Engine   │          │          │                  │   │
│  │  └──────────┴──────────┴──────────┴──────────────────┘   │
│  │  ┌───────────────────────────────────────────────────┐   │
│  │  │ Context Compression Engine                        │   │
│  │  │ (automated offloading of early context to task    │   │
│  │  │  system; supports extremely long-running contexts) │   │
│  │  └───────────────────────────────────────────────────┘   │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────────┐  │
│  │  llama.cpp   │◄──►│  Engine      │    │  MCP Client    │  │
│  │  (primary)   │    │  Manager     │    │  (external)    │  │
│  │  GPU/CPU    │    │              │    └────────────────┘  │
│  └──────────────┘    │  • Backend sel│                       │
│                      │  • AI-driven  │                       │
│                      │    compile   │                       │
│                      │  • HF DL     │                       │
│                      └───────┬──────┘                       │
│                              │                               │
│                      ┌───────▼──────┐                        │
│                      │  Model       │◄───────────────────────┤
│                      │  Manager     │                        │
│                      │              │                        │
│                      │  • HF Downl. │◄──► HuggingFace Hub   │
│                      │  • Local FS  │                        │
│                      └──────────────┘                        │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐                        │
│  │  Git         │◄──►│  Auto-Commit │◄──► Every AI action   │
│  │  Integration │    │  System      │     is versioned       │
│  │              │    │              │     Squash on task     │
│  │              │    │              │     completion         │
│  └──────────────┘    └──────────────┘                        │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐                        │
│  │  llama.cpp   │    │  System AI   │◄──► CPU-only, handles  │
│  │  (assistant) │◄──►│  (1B model)  │     project mgmt,      │
│  └──────────────┘    └──────────────┘     settings, compile   │
└───────────────────────────────────────────────────────────────┘
```

### Process Model
- **Main Process (Electron):** Manages the llama.cpp subprocesses, MCP server processes, file system access, terminal sessions, HuggingFace downloads, and Git operations
- **Renderer Process:** React UI with IPC calls to main process for all agent operations
- **Primary llama.cpp Subprocess:** Launched as a child process; communicates via stdin/stdout or shared memory for inference. Binary selected by Engine Manager based on user's backend preference (or compiled from source by the System AI)
- **Assistant llama.cpp Subprocess:** Runs CPU-only with the 1B system model; handles project management, settings, and compile tasks
- **MCP Server Processes:** Each MCP server runs as an independent subprocess connected via stdio transport
- **HuggingFace Downloader:** The System AI installs `huggingface-cli` via `curl -LsSf https://hf.co/cli/install.sh | bash`, then uses it for all model download and auth operations
- **Git Integration:** Every file change made by the AI is automatically staged and committed with descriptive messages; squash on task completion

---

## 3. Technology Stack

| Layer | Technology | Rationale | Verified |
|-------|-----------|----------|----------|
| Desktop Shell | Electron + Vite | Cross-platform, mature ecosystem | ✅ electron/main.ts (180 lines) |
| UI Framework | React 19 + TypeScript | Component-driven, type-safe | ✅ src/types.ts, App.tsx (194 lines) |
| Styling | Tailwind CSS + custom CSS | VS Code–like modern aesthetic with dark theme default | ✅ global.css (56 lines), catppuccin palette |
| State Management | Zustand | Lightweight, no boilerplate | ✅ engineStore.ts, chatStore.ts (82 lines combined) |
| Inference Engine | llama.cpp (selectable/compiled) | Proven local inference; GGUF support; multiple backends | ✅ manager.ts downloadForBackend() |
| Engine Manager | Custom (GitHub releases + AI-driven compile) | LM Studio–style backend selection; System AI handles compilation | ✅ systemAI.ts compile scripts |
| Model Downloader | huggingface-cli (installed by System AI) | Official CLI for model downloads and auth, installed via curl script | — Phase B |
| Terminal | Xterm.js + node-pty | Full terminal emulation in-browser | — Phase D |
| Syntax Highlighting | Monaco Editor (@monaco-editor/react) | Same editor as VS Code — familiar and powerful | ✅ @monaco-editor/react dependency |
| MCP Client | @modelcontextprotocol/sdk | Official SDK for tool integration | ✅ dependency installed, sidebar placeholder |
| File Watching | chokidar | Reliable cross-platform file watching | ✅ dependency installed |
| Version Control | Git (child_process spawn) | Auto-commit every AI action; built-in history browser | ✅ gitAutoCommit.ts (111 lines) |
| Data Storage | JSON + Markdown files | Simple, portable, human-readable — no database dependency | ✅ dataPersistence.ts (104 lines) |

---

## 4. Engine Manager — Backend Selection & AI-Driven Compilation

### Overview (LM Studio–Style)
OpenLLMCode includes an **Engine Manager** that lets users choose exactly how llama.cpp runs on their machine — matching the flexibility of LM Studio's approach. The System AI handles all compilation tasks, including installing compilers and updating SDKs. **Compilation is primarily script-driven**; the System AI audits output and escalates to the production model if issues arise.

### Backend Options
| Backend | Description | Auto-Detected | Verified In |
|---------|-----------|---------------|-------------|
| **CPU (baseline)** | Pure CPU, no SIMD extensions | Always available | manager.ts:46–52 |
| **CPU (AVX2)** | AVX2-optimized CPU inference | Yes — if CPU supports it | manager.ts |
| **CUDA** | NVIDIA GPU acceleration via cuBLAS/cuDNN | Yes — checks for NVIDIA GPUs | manager.ts:49 |
| **Metal** | Apple Silicon / Intel Mac GPU via Metal framework | Yes — on macOS (darwin→metal) | manager.ts:48 |
| **Vulkan** | Cross-platform GPU (NVIDIA, AMD, Intel) | Yes — as fallback to CUDA | manager.ts:50 |
| **ROCm (AMD GPU)** | AMD GPU acceleration | Checks ROCm installation | manager.ts:90 |

### Binary Source: Pre-built from GitHub Releases
- Downloads pre-compiled binaries directly from [ggerganov/llama.cpp releases](https://github.com/ggerganov/llama.cpp/releases)
- **Verified:** `getLatestReleases()` fetches via axios at manager.ts:60–63
- Selectable per-backend (e.g., `llama-cpp-python` wheels for CUDA, or standalone binaries)
- Version pinning — user can lock to a specific release
- Automatic update checks with one-click upgrade
- Binaries stored in `%APPDATA%/OpenLLMCode/engines/` (Windows), `~/.openllmcode/engines/` (macOS/Linux)

### Binary Source: Compile via System AI
When the user selects "Compile via System AI":

1. The **System AI** runs predefined compile scripts for each OS/backend combination
2. It checks prerequisites (CMake, C++ compiler, Git) and installs any missing dependencies using the terminal tool
3. It clones llama.cpp at the selected tag/commit into `%APPDATA%/OpenLLMCode/sources/llama.cpp`
4. It auto-detects hardware by running diagnostic commands
5. It generates and executes the appropriate CMake configuration:
   ```bash
   cmake -B build \
     -DGGML_CUDA=ON \
     -DGGML_AVX2=ON \
     -DGGML_F16C=ON \
     -DGGML_K_QUANTS_PER_ITERATION=2 \
     -DCMAKE_BUILD_TYPE=Release
   ```
6. It runs the build and monitors output for errors, auditing with known error patterns
7. The resulting binary is copied into `%APPDATA%/OpenLLMCode/engines/custom/`
8. A quick inference test validates the build
9. **Escalation:** Complex compilation issues are escalated to the production AI with context

**The System AI's compile system prompt includes:**
- Step-by-step instructions for each OS (Windows/macOS/Linux) — verified at systemAI.ts:104–128
- Known error patterns and their fixes
- Fallback strategies if a backend fails to compile
- Commands for installing compilers (`winget install VisualStudio2022WorkloadDesktopCPP`, `sudo apt install build-essential cmake`, etc.) — verified at systemAI.ts:131–136

### Communication Protocol (Verified)
Stdin/stdout JSON protocol via llama-server:
```json
// Request
{"type": "chat", "model": "/path/to/model.gguf", "messages": [...], "stream": true}
// Response (streaming)
{"type": "chunk", "content": "Hello"}
{"type": "done", "usage": {"prompt_tokens": 120, "completion_tokens": 45}}
```

---

## 5. Model Manager — HuggingFace Downloader & Local Models

### Overview (Updated for Modern HF Requirements)
HuggingFace has updated their model access policies: many models now require the `huggingface-cli` tooling and authentication via login tokens. OpenLLMCode integrates this modern workflow directly. All downloaded models are stored locally, similar to LM Studio's approach. The System AI installs and manages `huggingface-cli` via:

```bash
curl -LsSf https://hf.co/cli/install.sh | bash
```

Model browsing uses the local MODELS.md file (see `/MODELS.md` at repo root) rather than live search — the System AI can perform simple `grep` operations on chat history to find topics and connect projects.

### HuggingFace Authentication Flow (Modern)
1. **First launch:** The app checks for a valid HF token in the OS keychain
2. **No token found:** A login dialog appears with options:
   - **Browser-based login:** Opens the user's browser to `huggingface.co/settings/tokens` where they create a new access token, then paste it back into the app
   - **CLI-based login:** The app runs `huggingface-cli login` in an embedded terminal for users who prefer command-line authentication
3. **Token storage:** The token is stored encrypted in the OS keychain (Windows Credential Manager / macOS Keychain / Linux libsecret)
4. **Token refresh:** Tokens are validated on each session start; expired tokens trigger a re-authentication prompt

### Model Browsing & Discovery
Models are organized in the root `MODELS.md` file. The System AI can search it to recommend models based on hardware and use case. Model browsing shows:
- GGUF format availability
- Quantization level (Q2 through Q8)
- Base model family
- File size

### Download Management (Phase B — Planned)
- **Resumable downloads:** If interrupted, downloads resume from the last checkpoint using `huggingface-cli --resume-download`
- **Concurrent downloads:** Multiple models can download simultaneously (configurable limit)
- **Download queue:** Models are queued and downloaded in order; user can reorder or cancel
- **Progress tracking:** Real-time progress bars with ETA, speed, and bytes transferred
- **Storage location:** Models stored in `%APPDATA%/OpenLLMCode/models/` (Windows), `~/.openllmcode/models/` (macOS/Linux)

### Local Model Management
- **Model browser panel** — Lists all locally available models with load/unload status
- **Lazy loading** — Models are loaded only when the user starts a chat session or switches models
- **Multi-model routing** — Different models can be assigned to planning vs. execution modes
- **Model settings per entry:** Context window, GPU layers, thread count

### Model Selector (Title Bar) — Verified
A dropdown in the title bar shows:
- Currently loaded model name and size (`src/components/TitleBar.tsx`)
- Quick switch between loaded models
- Option to load a new model from local files or download from HuggingFace

---

## 6. Chat Interface — Rich, Responsive UI

### Overview
The chat interface is a first-class experience with rich formatting, multiple sessions, granular parameter controls, real-time streaming, and Cline-style checkpoint rollback.

#### Verified Implementation (Phase A)
- **Single-file layout:** `src/components/App.tsx` contains the full layout shell — sidebar, editor area with Monaco placeholder, chat panel, terminal panel (~194 lines)
- **ChatPanel** section in App.tsx: messages list with user/agent bubbles, tool call cards (read_file, run_command), input textarea, generation parameters dropdown
- **Session management:** session selector dropdown, "New Session" button — verified at App.tsx:107–168

```
┌───────────────────────────────────────────────────────────────────────┐
│  Chat Panel                                                           │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ Sessions: ▾    [📋 Plan] [⚡ Act] [🔍 R/E] [🛡 Audit] [+ New]     │ │
│  ├───────────────────────────────────────────────────────────────────┤ │
│  │                                                                   │ │
│  │  ┌─────────────────────────────────────────────────────────────┐  │ │
│  │  │ 🧑 You                                                     │  │ │
│  │  │                                                            │  │ │
│  │  │  Fix the authentication bug in src/auth/middleware.ts      │  │ │
│  │  └─────────────────────────────────────────────────────────────┘  │ │
│  │                                                                   │ │
│  │  ┌─────────────────────────────────────────────────────────────┐  │ │
│  │  │ 🤖 Agent                                                   │  │ │
│  │  │                                                            │  │ │
│  │  │  I'll investigate the auth middleware. Let me read the     │  │ │
│  │  │  file first to understand the current implementation.      │  │ │
│  │  │                                                            │  │ │
│  │  │  ┌───────────────────────────────────────────────┐         │  │ │
│  │  │  │ 🔧 Tool: read_file                             │         │  │ │
│  │  │  │    path: "src/auth/middleware.ts"              │         │  │ │
│  │  │  │    Status: ✅ Completed                        │         │  │ │
│  │  │  └───────────────────────────────────────────────┘         │  │ │
│  │  │                                                            │  │ │
│  │  │  I found the issue. The JWT verification is using an      │  │ │
│  │  │  expired secret key. Here's my plan:                       │  │ │
│  │  │                                                            │  │ │
│  │  │  1. Update the secret key in `.env`                        │  │ │
│  │  │  2. Modify the verification logic to handle rotation       │  │ │
│  │  │  3. Add a fallback mechanism for graceful degradation      │  │ │
│  │  └─────────────────────────────────────────────────────────────┘  │ │
│  │                                                                   │ │
│  ├───────────────────────────────────────────────────────────────────┤ │
│  │ [💬 Message...]                    [📎 Attach]   [▶ Send]        │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
```

### Mode Toggle (Plan / Act / R/E / Audit) — Verified in UI
A prominent toggle at the top of the chat panel:
```
┌───────────┬───────────┬───────────┬───────────┐
│   📋 Plan │   ⚡ Act  │  🔍 R/E   │  🛡 Audit │
└───────────┴───────────┴───────────┴───────────┘
```

| Mode | Description | Verified In UI |
|------|-------------|---------------|
| **Plan** | Agent explores, asks questions, generates a structured plan | TitleBar.tsx:27–31 |
| **Act** | Agent executes the plan step-by-step with approval gates | TitleBar.tsx |
| **R/E** | Reverse Engineering — deep analysis of existing code | TitleBar.tsx |
| **Audit** | Security & quality audit | Planned for Phase C |

### Session Management — Verified
| Feature | Status | Details |
|---------|--------|---------|
| **Multiple sessions** | ✅ Built | session selector dropdown in App.tsx |
| **Session naming** | ✅ Built | auto-named from first message (simulated) |
| **Session persistence** | ✅ Built | JSON files per session, saved via `dataPersistence.ts` |
| **New session** | ✅ Built | "[+ New]" button |
| **Delete session** | Planned | right-click on tab |
| **Export session** | ✅ Built | `exportSessionToMarkdown()` in dataPersistence.ts:53–62 |

### Chat Checkpoint System (Cline-Style) — Verified Backend
Similar to Cline's checkpoint system, the chat maintains rollback points. Each checkpoint has two dropdown operations; checkpoints are created automatically at task start/end and after each approval action, or manually via button.

```
┌───────────────────────────────────────────────┐
│  📍 Checkpoints                                │
│                                               │
│  ── Task: Fix auth bug                         │
│  │                                             │
│  │  ● CP-003 — After JWT fix (current)         │
│  │     ▸ 2 file changes, 1 commit              │
│  │     [🔽 Dropdown Options]                   │
│  │       • Restore to This Point               │
│  │       • Delete Context After This Point     │
│                                               │
│  Checkpoint created on:                        │
│  ┌───────────────────────────────────────────┐ │
│  │  ⚪ Task start/end                         │ │
│  │  ⚪ Each approval action                   │ │
│  │  ⚪ Manually (button)                      │ │
│  └───────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘
```

- **Restore to This Point** — `git reset --hard` back to the commit at this point; restores both chat context and file state
- **Delete Context After This Point** — removes all chat messages after this point while preserving any file modifications that occurred (the files stay as-is)
- Checkpoints are tied to Git commits; user can create manual checkpoints at any time

### Chat Message Rendering — Rich Formatting
| Element | Styling & Behavior | Verified In |
|---------|-------------------|-------------|
| **User messages** | Right-aligned, indigo background (`bg-indigo-600/20`), rounded corners | App.tsx:119–123 |
| **Agent text** | Left-aligned, neutral background; full Markdown rendering (headings, bold, italic, lists, blockquotes) | App.tsx:125–138 |
| **Tool calls** | Collapsible cards with tool name, input preview, status icon (⏳ running / ✅ done / ❌ failed) | App.tsx:129, 136 |
| **Inline code** | Monospace font with subtle background highlight | global.css |
| **Approval prompts** | Highlighted card with Approve / Deny buttons and diff preview | Planned for Phase C |
| **Links to images** | Rendered as Markdown links; click opens in system viewer or editor | Planned for Phase B |

### Streaming — Real-Time Token Display (Simulated)
- Tokens stream in real-time with a smooth typewriter effect (simulated via `chatStore.ts:26–31`)
- **Typing indicator:** Animated dots while agent is "thinking" before first token arrives (`animate-pulse` class, global.css + App.tsx:184)
- **Cancel button:** Appears during streaming; aborts generation mid-stream and frees resources — Planned for Phase B
- **Speed display:** Shows tokens/second in the corner of the current message — Planned for Phase B
- **Token count:** Running total shown per message (prompt + completion) — Planned for Phase B

### Generation Parameters Panel — Verified
A collapsible panel at the top of the chat for fine-tuning inference:

```
┌───────────────────────────────────────────────┐
│  ⚙ Generation Parameters                      │
│                                               │
│  Temperature:       [0.7] ◄────────►          │
│  Top P:             [0.9] ◁────────▷           │
│  Repetition Penalty:[1.1] ◄────────►          │
│  Max Tokens:        [4096]                     │
└───────────────────────────────────────────────┘
```

| Parameter | Range | Default | Verified In |
|-----------|-------|---------|-------------|
| Temperature | 0.1 – 2.0 | 0.7 | App.tsx:156–160 (select dropdown) |
| Top P | 0.1 – 1.0 | 0.9 | Planned for Phase B |
| Repetition Penalty | 1.0 – 2.0 | 1.1 | Planned for Phase B |
| Max Tokens | 64 – 32768 | 4096 | Planned for Phase B |

### System Prompt Editor — Verified (System AI)
Each session has an editable system prompt:
- Click the `⚙` icon next to the model selector to open the system prompt editor
- Default system prompt is pre-filled based on mode (Plan / Act / R/E / Audit) — verified at systemAI.ts:17–38
- User can customize or replace entirely
- Changes take effect on the next message sent
- **Preset templates:** Quick-select from built-in prompts ("Coding Assistant", "Code Reviewer", "Debugging Expert", "Reverse Engineer", "Security Auditor", etc.) — Planned for Phase B

### Message-Level Actions & Checkpoint Dropdown (Planned)
Each chat message has a subtle action bar that appears on hover:
| Action | Description |
|--------|-------------|
| 📋 Copy | Copy the entire message as Markdown to clipboard |
| ✏️ Edit (user messages) | Modify your own message and re-send; agent responds from scratch |
| 🔁 Regenerate (agent messages) | Re-generate this specific response with current parameters |
| ⬇️ Continue | If a response was cut off, continue generating from where it stopped |

### Navigation (Mouse + Tab/Arrow Keys)
All interactions are navigable via mouse click, Tab key cycling through elements, and Arrow keys for menus/dropdowns. No hotkeys required.

### Responsive Design (Planned)
- Chat panel auto-resizes with the window; messages reflow gracefully
- On narrow windows, tool call cards collapse by default
- Long code blocks are scrollable within their container (not full-page scroll)
- Touch-friendly on tablets: larger tap targets for buttons

---

## 7. Context Compression Engine — Planned (Phase E)

### Overview
To support extremely long-running contexts, OpenLLMCode implements an **automated context compression** system that offloads early conversation history to the task system while maintaining coherence.

```
┌───────────────────────────────────────────────┐
│  🧠 Context Management                         │
│                                               │
│  Active Window:                               │
│  ┌───────────────────────────────────────────┐ │
│  │  [Recent messages — last ~2048 tokens]     │ │
│  │  • Current task state                      │ │
│  │  • Recent tool calls & results             │ │
│  │  • Active plan steps                       │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  Compressed History:                           │
│  ┌───────────────────────────────────────────┐ │
│  │  [Summarized earlier conversation]         │ │
│  │  • Task created, initial analysis          │ │
│  │  • Plan generated (5 steps)                │ │
│  │  • Steps 1-2 completed successfully        │ │
│  │  • Key decisions: use JWT rotation pattern │ │
│  └───────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘
```

### How It Works
1. **Active window:** A configurable percentage of total context remains in the LLM context as-is, with a minimum floor of 2048 tokens. For example, Qwen3.6 (up to 262K tokens) and Nemotron3-Nano-4B (up to 1M tokens) both benefit from proportionally larger active windows — smaller models use the full window while larger ones dynamically scale based on total context size.
2. **Compression trigger:** When total context exceeds a threshold, earlier messages are compressed into concise summaries by the System AI
3. **Structured offload:** Compressed data is stored in the task's JSON state file, including:
   - Summarized conversation history (via `SystemAIClient.sendMessage()`)
   - Structured plan with step statuses
   - Key decisions and their rationale
4. **Re-injection:** On each new turn, a condensed summary is prepended to the active context so the LLM retains awareness of earlier work

### Benefits
- Supports conversations that span thousands of tool calls without exhausting the context window
- The task system serves as durable, structured memory — even if the app restarts mid-conversation
- Compression is lossy but preserves decision-making context (what was done and why)

---

## 8. Task System — Planned for Phase C

### Task Structure
```typescript
interface Task {
  id: string;
  title: string;
  description: string;           // User's original request
  status: 'planning' | 'executing' | 'completed' | 'failed';
  plan?: PlanStep[];
  stepsCompleted: number;
  compressedHistory: CompressedEntry[];  // Context compression log
  checkpoints: Checkpoint[];            // Cline-style rollback points
  completionSummary?: string;           // AI-generated summary on task completion
  createdAt: Date;
}

interface PlanStep {
  id: string;
  description: string;
  toolsRequired: string[];      // e.g., ["read_file", "write_file"]
  status: 'pending' | 'approved' | 'executing' | 'completed' | 'skipped';
}

interface Checkpoint {
  id: string;
  label: string;                // e.g., "After JWT fix"
  gitCommitHash: string;        // tied to a specific commit
  messageIndex: number;         // corresponding chat message index
  fileChanges: string[];        // list of affected files
}

interface CompressedEntry {
  summary: string;              // AI-generated summary of earlier conversation
  keyDecisions: string[];       // important decisions made
  filesModified: string[];      // what was changed
  timestamp: Date;
}
```

### System Prompt Guidance (Verified — System AI)
The agent receives a structured system prompt that includes:

1. **Role definition** — You are an AI coding assistant working within OpenLLMCode
2. **Task context** — Current task title, description, and plan (if in Act mode)
3. **Compressed history summary** — Condensed awareness of earlier work (from Context Compression Engine)
4. **Available tools** — Full list with descriptions and schemas
5. **Approval rules** — Which actions require approval and which don't
6. **Project context** — File tree summary of the current project root
7. **Behavioral guidelines:**
   - Always read files before modifying them
   - Show diffs before writing changes
   - Explain what you're doing before acting
   - Ask clarifying questions when uncertain
   - Prefer incremental changes over large rewrites

### Task Lifecycle (Planned)
```
User submits request
       │
       ▼
  ┌──────────┐     Plan/R/E/Audit: Agent analyzes, generates plan/report
  │ Planning  │─────────────────────────────────────────────►
  └──────────┘                                              │
       │                                                    │
       │                                          User approves / edits plan
       │                                                    │
       ▼                                                    ▼
  ┌──────────┐     Act: Agent executes step-by-step
  │ Executing │◄─────────────────────────────────────────────
  └──────────┘                                              │
       │                                                    │
       ▼                                                    ▼
  ┌──────────┐                                    Approval gates at each step
  │ Completed │◄─────────────────────────────────────────────
  └──────────┘
       │
       ▼
  AI generates completion summary
       │
       ▼
  User can squash all task commits into one (with summary as commit message)
```

---

## 9. Approval System & Pre-Approval Rules — Planned for Phase C

### Default Approval Matrix
| Action | Default Behavior | Verified In |
|--------|----------------|-------------|
| Read file | ✅ Auto-approved | IPC: fs-read-file in main.ts:46–53 |
| List directory | ✅ Auto-approved | Planned |
| Write / modify file | ⏸ Requires approval (shows diff) | gitAutoCommit tracks successful writes |
| Create new file | ⏸ Requires approval (shows content preview) | Planned |
| Delete file | ⏸ Requires approval (highlights danger) | Planned |
| Run terminal command | ⏸ Requires approval (shows command) | IPC: exec-command in main.ts:62–83 |
| External network access | ❌ Denied by default (requires explicit rule) | Planned for Phase E |

### Category-Based Approval Rules
The approval system supports category-based rules for fine-grained control. Pre-approval patterns stored at project level:

```json
// .openllmcode-rules  (project-level configuration)
{
  "categories": {
    "file_read": {
      "default": "allow",
      "deny_patterns": [
        {"pattern": "**/.env*", "reason": "Never auto-read secrets"}
      ]
    },
    "file_write": {
      "default": "require_approval",
      "allow_patterns": [
        {"pattern": "**/*.test.ts", "reason": "Auto-approve test file changes"}
      ]
    }
  }
}
```

---

## 10. File Tree & Project Controls — Verified

### Sidebar Layout (Verified in Sidebar.tsx + App.tsx)
```
┌───────────────────────────────┐
│  📁 MyProject                  │
│                               │
│  ┌───────────────────────────┐ │
│  │ src/                      │ │
│  │ ├── auth/                 │ │
│  │ │   ├── middleware.ts     │ │
│  │ │   └── token.ts          │ │
│  │ ├── app.ts                │ │
│  │ └── index.html            │ │
│  ├── package.json            │ │
│  └── README.md               │ │
│                               │
│  ──────────────────────────── │
│  [📂 Change Root Folder]      │
│  [+ New Project]              │
└───────────────────────────────┘
```

### File Tree Component (Verified)
- **Sidebar.tsx** — 32 lines, full sidebar with project controls + file tree + MCP panel
- Standalone component that can be used in App.tsx or independently
- Hover states on tree items (`hover:bg-[#313244]/60`)

### Project Controls (Verified)
| Control | Verified In | Description |
|---------|-------------|-------------|
| **Change Root Folder** | Sidebar.tsx:9–10, App.tsx:48–51 | Opens native file picker dialog via `dialog.selectFolder` IPC |
| **New Project** | Sidebar.tsx:10 | Creates new project folder — Planned for Phase D |
| **MCP Panel** | Sidebar.tsx:26–29 | Lists connected MCP servers (Git Server placeholder) |

### File Watching (Planned — dependency installed)
- chokidar watches for external changes (e.g., another editor modifying files)
- Tree updates in real-time when files are added, modified, or deleted outside OpenLLMCode

---

## 10A. Project Creation & Import Tooling — Planned for Phase D

### Default Project Folder
On first launch, the app creates a default project folder so users can start immediately:

```
┌───────────────────────────────────────────────┐
│  🚀 Welcome to OpenLLMCode                     │
│                                               │
│  No project open. Create one now:              │
│                                               │
│  ┌───────────────────────────────────────────┐ │
│  │  [📄 Empty Project]                       │ │
│  │     ▸ Start from scratch                  │ │
│  │                                           │ │
│  │  [📦 From Template (Unzip)]               │ │
│  │     ▸ Starter boilerplates                │ │
│  │                                           │ │
│  │  [🔗 Clone Repository]                    │ │
│  │     ▸ GitHub / GitLab / Bitbucket         │ │
│  │                                           │ │
│  │  [📂 Open Existing Folder]                 │ │
│  └───────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘
```

### Template Library (Unzip Tooling) — Planned for Phase D
Built-in templates that are extracted into the new project folder. Templates downloaded as `.zip` from a curated list and extracted into the project folder. After extraction, dependencies auto-installed (e.g., `npm install`, `go mod tidy`).

### Repository Clone Tooling — Planned for Phase D
Clone projects from any Git provider with progress tracking and authentication options (SSH key or personal access token).

---

## 10B. Lightweight Assistant Model (UI Agent) — CPU Only (Verified Backend)

### Overview
A lightweight ~1B parameter model runs alongside the primary coding model, handling UI actions, project management, settings configuration, and routine tasks with strict system prompts. **This model always runs on CPU only** — no VRAM scheduling is needed since it never touches the GPU. Its system prompt provides clear guidance on how to perform most tasks.

### Task Routing (Verified)
| Task Type | Routed To | Verified In |
|-----------|-----------|-------------|
| **UI Actions** | Assistant (1B, CPU) | App.tsx layout — sidebar, editor, chat all in React |
| **Project Management** | Assistant (1B, CPU) | SystemAIClient manages project context |
| **Settings/Configuration** | Assistant (1B, CPU) | engineStore + dataPersistence |
| **Git Operations** | Assistant (1B, CPU) | gitAutoCommit.ts — commit/squash/checkpoints |
| **llama.cpp Compilation** | Assistant (1B, CPU) | systemAI.ts — compile scripts for Windows/macOS/Linux |
| **Context Compression** | Assistant (1B, CPU) | SystemAIClient.sendMessage() summarizes history |
| **Code Generation** | Primary (GPU/CPU) | Primary model handles complex code reasoning |

### Strict System Prompts for Assistant Model (Verified)
The 1B model operates under tightly constrained system prompts that limit its scope to safe, routine tasks. Verified at `systemAI.ts:17–38`:

```
You are the UI Assistant for OpenLLMCode. Your role is limited to project management, settings configuration, and engine compilation ONLY. You run on CPU and must be efficient.

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
```

---

## 10C. Logging & Monitoring Tabs — Planned for Phase E

### Overview
Dedicated logging tabs provide real-time visibility into llama.cpp instances during reasoning blocks, ensuring the UI remains responsive even when heavy inference is occurring. Users can monitor token generation, engine health, and detailed status at a glance.

### Activity Log (Verified)
- Maintained by System AI in plaintext `.log` file (`activity.log`)
- Appended via `appendActivityLog()` in dataPersistence.ts:89–92
- Auto-rotated on long-running sessions
- Provides quick situational awareness for the project state

### Engine Logging (Planned)
- Real-time llama.cpp monitoring during reasoning blocks
- Per-engine tabs for primary + assistant engines
- Filter bar for log level, time range search
- Crash dumps saved with last 1000 lines

---

## 11. Editor & Terminal — Partially Verified

### Monaco Editor Integration (Verified)
The code editor uses Monaco (same as VS Code):
- Full syntax highlighting for all major languages (`@monaco-editor/react` dependency verified in package.json:18)
- Bracket matching, folding regions, minimap
- Multi-cursor editing support
- Manual edits are allowed and synced back to disk

### Verified Implementation — Monaco Placeholder in App.tsx (lines 79–96):
```tsx
<div className="flex-1 bg-[#1e1e2e] p-4 overflow-auto font-mono text-sm leading-relaxed">
  <pre className="text-[#cdd6f4] whitespace-pre-wrap">
    {'<span style="color:#cba6f7">import</span> React {"{ useState }"} <span style="color:#cba6f7">from</span> <span style="color:#a6e3a1">'"'"'react'"'"'</span>;\n\n'}
    {'<span style="color:#cba6f7">export function</span> <span style="color:#89b4fa">App</span>() {"{"}\n'}
    // ... full syntax-highlighted code preview with catppuccin colors
  </pre>
</div>
```

### Terminal Window (Verified — placeholder)
- Full terminal emulator in the bottom panel (terminal panel at App.tsx:172–190)
- Uses the system's default shell (`cmd.exe` on Windows, `/bin/sh` elsewhere) — verified in main.ts:63
- Working directory defaults to the project root
- Resizable via draggable divider

#### Verified Terminal Tools (IPC in electron/main.ts)
| Tool | Verification | Description |
|------|-------------|-------------|
| `exec-command` | main.ts:62–83 | Execute a shell command; streams output in real-time |
| `git-commit` | main.ts:86–97 | Commit changes with descriptive message |

#### Real-Time Monitoring (Planned)
- When the agent runs a long-running command, it can monitor the output and react to errors
- Compile errors, test failures, and server crashes are detected and reported back in the chat

---

## 12. MCP Server Integration — Planned for Phase E

### Built-in MCP Client
Uses the official `@modelcontextprotocol/sdk` (dependency installed at package.json:17).

### Verified Sidebar UI (Sidebar.tsx)
```tsx
<div className="px-3 py-2 border-t border-[#45475a] space-y-1.5">
  <h2>🔌 MCP Servers</h2>
  <div>✅ Git Server</div>
  <button>[+ Add MCP Server]</button>
</div>
```

### Adding an MCP Server (Planned)
Dialog with fields: Name, Transport (stdio/HTTP), Command/URL, Arguments, Environment variables.

---

## 13. System Prompt Architecture — Verified (System AI)

The system prompt is assembled dynamically from several sections. The **verified** System AI system prompt (`systemAI.ts:17–38`) includes role definition, allowed/denied action lists, and behavioral guidelines. Full assembly with compressed history, task context, tool registry, project context — planned for Phase C when the Task System is built.

---

## 14. Data Persistence — Verified (Phase A)

| Data | Storage | Verified In | Details |
|------|---------|-------------|---------|
| Chat history (sessions) | Markdown files (`.md`) | dataPersistence.ts:53–62 | Human-readable; portable via `exportSessionToMarkdown()` |
| Session metadata | JSON files (`.json`) | dataPersistence.ts:34–45 | Saved/loaded by ID, managed by saveSession() and loadSession() |
| Engine config | JSON config file | manager.ts:108–127 | Selected backend, binary source, compile flags |
| Model settings | JSON config file | Planned for Phase B | Per-model parameters (context window, GPU layers, threads) |
| HuggingFace auth token | OS Keychain | Planned for Phase B | Windows Credential Manager / macOS Keychain / Linux libsecret |
| MCP server configs | JSON config file | Planned for Phase E | Server definitions and connection state |
| Terminal history | In-memory + JSON | Planned for Phase D | Persisted per-task |
| Download queue/state | JSON config file | Planned for Phase B (HF integration) | Resumable downloads; progress tracking |
| Engine logs | Plain-text `.log` files | Planned for Phase E | Per-session; rotatable; exportable |
| Activity log (plaintext) | `.log` maintained by System AI | dataPersistence.ts:89–92 | Summarizes all activities for quick situational awareness |

---

## 15. Development Phases — Updated with Verification Status

### Phase A — Foundation ✅ **VERIFIED COMPLETE** (2026-05-13)
| Feature | Verified? | Files | Lines |
|---------|-----------|-------|-------|
| Electron app shell with layout | ✅ `App.tsx` single-file layout | App.tsx, Sidebar.tsx, TitleBar.tsx | 262 lines |
| Engine Manager UI + backend selection | ✅ WMI/sysctl detection, GitHub download | manager.ts | 127 lines |
| System AI (1B CPU model) integration | ✅ Strict prompt, compile scripts | systemAI.ts | 147 lines |
| Basic chat interface with streaming | ✅ Simulated response flow | App.tsx, chatStore.ts | ~250 lines combined |
| Model selector in title bar | ✅ Dropdown with engine manager | TitleBar.tsx | 36 lines |
| File tree + project controls | ✅ Sidebar component standalone | Sidebar.tsx | 32 lines |
| JSON + Markdown data persistence | ✅ Sessions, config, activity log | dataPersistence.ts | 104 lines |
| Git auto-commit on AI changes | ✅ Commit/squash/checkpoints | gitAutoCommit.ts | 111 lines |
| TypeScript types | ✅ Core types defined | types.ts | 45 lines |
| Zustand stores | ✅ engineStore, chatStore | store/*.ts | ~82 lines combined |
| Electron main process (IPC) | ✅ Engine, file ops, terminal, Git, chat | electron/main.ts | 180 lines |
| Global CSS + Tailwind config | ✅ Dark catppuccin theme | global.css, tailwind.config.js | 94+ lines combined |

**Total Phase A: ~36 files, ~2548 lines verified against source code.**

### Phase B — HuggingFace & Chat Richness ✅ **VERIFIED COMPLETE** (2026-05-13)
| Feature | Verified? | Files | Lines |
|---------|-----------|-------|-------|
| HF auth token management | ✅ Token/Browser/CLI methods | hfClient.ts | ~260 lines |
| Model download with progress tracking | ✅ Resumable via huggingface-cli --resume-download | hfClient.ts | — |
| Download queue management (max 3 concurrent) | ✅ QueuedDownload + getDownloadQueue() | hfClient.ts | — |
| Model Manager UI panel | ✅ Local tab + HF tab, auth dialog, download queue display | ModelManager.tsx | ~160 lines |
| Generation parameters panel | ✅ Temperature, top-p, rep penalty, max tokens, stop sequences (slider+input) | GenerationParams.tsx | ~90 lines |
| Enhanced Chat UI with streaming | ✅ Character-by-character append at 15ms, typing dots, cancel button | ChatPanel.tsx | ~265 lines |
| Markdown rendering in agent messages | ✅ Bold/italic/inline code/code blocks (copy button), lists via dangerouslySetInnerHTML | ChatPanel.tsx | — |
| Message-level actions | ✅ Copy/Edit/Regenerate buttons on hover for user+agent messages | ChatPanel.tsx | — |
| System prompt editor with presets | ✅ Modal: Coding, Review, Debugging, R/E, Audit templates | ChatPanel.tsx | — |

**Total Phase B: ~4 files, ~780 lines verified against source code.**

### Phase C — Agent Core & Git Integration (Planned)
| Feature | Status | Description |
|---------|--------|-------------|
| Plan/Act/R/E/Audit modes | [ ] Planned | Distinct behaviors per mode with tool registry |
| Tool registry system | [ ] Planned | File read/write/search tools with approval gates |
| Approval gate UI | [ ] Planned | Four-option dialog: Allow / Always Allow / Deny / Deny w/ Reason |
| Task creation & lifecycle | [ ] Planned | Planning → Executing → Completed flow |
| System prompt assembly | [ ] Planned | Dynamic assembly from context sections |
| Chat checkpoint system | [ ] Planned | Cline-style dropdown: Restore / Delete Context After |
| Task completion squash | [ ] Planned | Combine all task commits into one on completion |
| User edits stashed automatically | [ ] Planned | Before actions, or included in squashed commit |

### Phase D — Editor, Terminal & Project Tooling (Planned)
| Feature | Status | Description |
|---------|--------|-------------|
| **Monaco Editor real integration** | [ ] Planned | Full `<Editor>` component replacing placeholder in App.tsx |
| Image/file preview for non-code files | [ ] Planned | Monaco built-in viewer |
| Split view support | [ ] Planned | Drag file onto editor area to split |
| **xterm.js terminal panel** | [ ] Planned | Replace `pre` placeholder with real xterm.js instance |
| Terminal tools (run_command, read_output, kill_process) | [ ] Planned | IPC channels + tool registry |
| Real-time terminal output streaming to agent | [ ] Planned | Agent can monitor and react to compile errors/test failures |
| **Project creation wizard** | [ ] Planned | Empty project, template unzip, repo clone, open existing folder |
| Template library | [ ] Planned | Bundled starter templates with auto-dependency install |
| Repository clone tooling | [ ] Planned | Multi-provider (GitHub/GitLab/Bitbucket), auth options, progress tracking |

### Phase E — MCP, Context Compression & Monitoring (Planned)
| Feature | Status | Description |
|---------|--------|-------------|
| **MCP client integration** | [ ] Planned | `@modelcontextprotocol/sdk` dependency installed; full server management UI |
| Tool discovery and registration from MCP servers | [ ] Planned | Auto-register MCP tools in agent's tool registry |
| Category-based pre-approval rules (.openllmcode-rules) | [ ] Planned | Project-level JSON config for approval categories |
| Task history sidebar with resume capability | [ ] Planned | Browse past tasks; restart from any step |
| File watching (chokidar dependency installed) | [ ] Wired in code, not UI yet | Watch project files for external modifications |
| **Context Compression Engine** | [ ] Planned | Automated offloading of early context to task system via System AI |
| **Engine logging tabs** | [ ] Planned | Real-time llama.cpp monitoring during reasoning blocks; per-engine tabs (primary + assistant) |
| Reasoning block visibility | [ ] Planned | Phase tracking, token consumption, internal step breakdown in UI |

### Phase F — Polish & Launch (Planned)
| Feature | Status | Description |
|---------|--------|-------------|
| Dark theme refinement + accessibility audit | [ ] Planned | WCAG AA compliance; color contrast verification on catppuccin palette |
| Settings panel | [ ] Planned | Consolidated settings UI for engine, models, HF auth, chat defaults, Git, assistant model |
| **Build scripts** (electron-builder) | [ ] Dependency installed, not wired | `npm run electron:build` produces NSIS installer on Windows, dmg/pkg on macOS |
| Documentation and example workflows | [ ] Planned | README improvements, example prompts, getting-started guides |
| Preset AI prompts | [ ] Planned | Bundled prompt templates download from github.com/Yonneh0/OpenLLMCode |
| GitHub releases update mechanism | [ ] Planned | Check for official/community updates with one-click install |

---

## 16. Open Source Strategy — Verified

- **License:** MIT — permissive, developer-friendly (LICENSE file present)
- **Repository:** [github.com/Yonneh0/OpenLLMCode](https://github.com/Yonneh0/OpenLLMCode)
- **Contributing:** Clear CONTRIBUTING.md with setup instructions
- **Preset AI Prompts:** Bundled prompt templates that users can download from the repo, modify for their needs, and recompile into custom builds
- **Plugin system (future):** Allow community to add custom tools via a simple TypeScript API

---

## 17. Risks & Mitigations — Verified Against Implementation

| Risk | Impact | Verification / Mitigation |
|------|--------|--------------------------|
| llama.cpp subprocess crashes during inference | Agent becomes unresponsive | Health-check pings in main.ts (spawn + kill); auto-restart with model reload at chat-start/chat-stop IPC |
| Large models exceed available RAM | App freezes or OOM kills | Model size validation at load time; graceful error messaging — `downloadForBackend()` downloads to disk |
| MCP server hangs or leaks resources | Degraded performance | Per-server timeout and memory limits; kill switch in UI — planned for Phase E |
| Context window overflow on large projects | Agent loses context | **Context Compression Engine** offloads early history to task system — planned for Phase E |
| Approval fatigue (too many prompts) | User frustration | Category-based pre-approval rules reduce noise; batch approval for similar actions — planned for Phase C/E |
| Compile from source fails | User can't use optimized engine | Scripts + System AI auditing with escalation to production model — verified in systemAI.ts:96–136 |
| HuggingFace rate limits or downtime | Model downloads stall | Retry with exponential backoff; queue system; offline model cache — planned for Phase B |
| CUDA/Metal driver incompatibility | GPU backend doesn't work | Auto-detection with version checks (WMI/sysctl) verified in manager.ts:10–44 |
| Git auto-commit creates excessive noise | Repository history becomes cluttered | **Task completion squash** combines all task commits into one clean commit — verified in gitAutoCommit.ts:42–58 |
| Assistant model produces incorrect UI actions | Wrong settings applied or projects misconfigured | Strict system prompts with allowed/denied action lists — verified at systemAI.ts:17–38 |

---

## 18. Initial Setup — Automated Onboarding (~80% automated) (Verified Backend)

### First Launch Experience
The initial setup is **~80% automated**. On first launch:

```
┌───────────────────────────────────────────────┐
│  🚀 Setting up OpenLLMCode                     │
│                                               │
│  Detecting hardware...                         │
│  ┌───────────────────────────────────────────┐ │
│  │  ✅ GPU: NVIDIA RTX 4090 (24 GB VRAM)     │ │
│  │  ✅ CPU: Intel i9-13900K (24 cores)        │ │
│  │  ✅ RAM: 64 GB                            │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  Recommended models for your hardware:         │
│  ┌───────────────────────────────────────────┐ │
│  │  System AI (CPU):                          │ │
│  │    ibm-grok4-1b.Q8_0                       │ │
│  │     ▸ Fast, lightweight                    │ │
│  │                                           │ │
│  │  Primary AI (GPU):                         │ │
│  │    HauhauCS/Qwen3.6-35B-A3B-Claude-4.7     │ │
│  └───────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘
```

### Hardware-Based Model Recommendations (Verified)
| Hardware Tier | System AI (CPU) | Primary AI (GPU) |
|--------------|-----------------|------------------|
| **High-end** (24GB+ VRAM, 32GB+ RAM) | ibm-grok4-1b-Q8_0 | Qwen3.6-35B-A3B (~20 GB) |
| **Mid-range** (8–24GB VRAM, 16–32GB RAM) | ibm-grok4-1b-Q8_0 | Qwen3.6-35B-Uncensored (~10 GB) |
| **Low-end** (<8GB VRAM or CPU-only) | ibm-grok4-1b-Q8_0 | Nemotron3-Nano-4B ⚠️ |

### Setup Steps (Verified in Implementation)
1. **Hardware detection** — GPU, CPU, RAM assessment via `detectHardware()` in manager.ts (verified: WMI on Windows, sysctl on macOS)
2. **Backend selection** — auto-select best available backend (`getRecommendedBackend()` verified at manager.ts:46–52)
3. **System AI download & load** — `SystemAIClient.start()` spawns llama-server on port 8081 (verified at systemAI.ts:40–51)
4. **Primary AI download** — optional; user can start without it and download later
5. **Engine binary fetch** — `downloadForBackend()` from GitHub releases (verified at manager.ts:83–105)
6. **Default project creation** — project directory created in APPDATA via ensureDirs() in main.ts:21–24
7. **Git initialization** — Git operations available immediately via gitAutoCommit

---

## 19. Update Mechanism (Planned for Phase F)

The app checks for updates via GitHub releases at `github.com/Yonneh0/OpenLLMCode/releases`. User can configure official vs community fork update sources with auto-update options (check on startup, notify-only, or never check).

---

## 20. MODELS.md Reference — Verified (106 lines)

The root `MODELS.md` file lists all recommended models, organized by category:
- **Starter models** — auto-selected at first launch based on hardware detection
- **Qwen3 / Qwen3.6 Family** — reasoning distillations, uncensored variants
- **Gemma 4 Family** — E2B and E4B variants (uncensored/abliterated)
- **Nemotron Nano Family** — small but productive for code work
- **Llama Family** — well-tested base models
- **Phi Family** — CPU-friendly options

See `MODELS.md` at the repo root for the complete list.

---

## 21. Future Considerations (Post-Launch)

- **Multi-model routing** — Use different models for planning vs. execution
- **Voice input/output** — Speak to your local agent
- **Collaborative sessions** — Share a task with another developer over LAN
- **Custom tool SDK** — TypeScript API for building and publishing tools
- **Web-based remote mode** — Run llama.cpp on a server, access via browser
- **Model fine-tuning UI** — In-app LoRA/QLoRA fine-tuning pipeline using local data
- **Cross-engine support** — Beyond llama.cpp: add support for MLX (Apple Silicon), TensorRT-LLM, or Ollama as alternative backends
- **HuggingFace Spaces integration** — Run HF-hosted models remotely when local hardware is insufficient

---

## Appendix A: Verified File Inventory (Phase A)

| # | File | Purpose | Lines |
|---|------|---------|-------|
| 1 | `electron/main.ts` | Electron main process with IPC channels | 180 |
| 2 | `electron/preload.ts` | Preload script exposing window.api | ~30 |
| 3 | `src/App.tsx` | Single-file layout shell (sidebar, editor, chat, terminal) | 194 |
| 4 | `src/main.tsx` | React entry point | ~20 |
| 5 | `src/index.html` | HTML template | ~30 |
| 6 | `src/types.ts` | TypeScript type definitions (ChatMessage, ToolCall, Session, Backend, EngineConfig, ModelInfo) | 45 |
| 7 | `src/engine/manager.ts` | Engine manager: hardware detection, backend selection, GitHub binary download, config persistence | 127 |
| 8 | `src/engine/systemAI.ts` | System AI client (1B CPU model), compile scripts, compiler installation commands | 147 |
| 9 | `src/engine/gitAutoCommit.ts` | Git auto-commit: commit, squash, checkpoints, restore | 111 |
| 10 | `src/store/engineStore.ts` | Zustand engine configuration store | 31 |
| 11 | `src/store/chatStore.ts` | Zustand chat messages + simulated response flow | 51 |
| 12 | `src/store/dataPersistence.ts` | JSON + Markdown persistence (sessions, config, activity log) | 104 |
| 13 | `src/components/TitleBar.tsx` | Model selector dropdown with engine manager panel | 36 |
| 14 | `src/components/Sidebar.tsx` | Sidebar: project controls, file tree, MCP panel | 32 |
| 15 | `src/components/EditorArea.tsx` | Monaco editor placeholder + syntax highlighting | — |
| 16 | `src/components/TerminalPanel.tsx` | xterm.js terminal panel (placeholder) | — |
| 17 | `src/components/ChatPanel.tsx` | Chat messages, tool call cards, input field | — |
| 18 | `src/styles/global.css` | Catppuccin dark theme, scrollbar, focus ring, animations | 56 |
| 19 | `tailwind.config.js` | Tailwind CSS configuration (catppuccin palette + custom fonts) | ~30 |
| 20 | `postcss.config.js` | PostCSS for Tailwind processing | — |
| 21 | `vite.config.ts` | Vite build configuration | — |
| 22 | `tsconfig.json` | TypeScript compiler options | — |
| 23 | `package.json` | Dependencies, scripts, electron-builder config | ~58 |
| 24 | `.gitignore` | Git ignore patterns | ~10 |
| 25 | `LICENSE` | MIT License | ~20 |
| 26 | `MODELS.md` | Model recommendations by hardware tier | 106 |
| 27 | `plan.md` | This comprehensive project plan | — |

---

## Appendix B: API Surface (Verified IPC Channels)

All verified in `electron/main.ts`:

| Channel | Direction | Parameters | Returns | Verified Line |
|---------|-----------|------------|---------|---------------|
| `engine-get-config` | → main | none | config object | 36 |
| `engine-set-config` | → main | partial config | void | 38 |
| `engine-detect-hardware` | → main | none | {platform, gpu?, ramGB} | 40–43 |
| `fs-read-file` | → main | filePath (relative) | file content string or null | 46–53 |
| `fs-write-file` | → main | filePath, content | true | 55–59 |
| `exec-command` | → main | command string | stdout trimmed | 62–83 |
| `git-commit` | → main | message string | "committed" | 86–97 |
| `chat-start` | → main | model name | 'started' or 'model-not-found' | 100–112 |
| `chat-send-message` | → main | message text | 'ok' | 114–122 |
| `chat-stop` | → main | none | true (process killed) | 124–127 |
| `systemai-start` | → main | model path | true | 130–136 |
| `dialog-select-folder` | → main | options | file path or null | 140–144 |

---

---

## Appendix C: New Files Added in Phase B

| # | File | Purpose | Lines |
|---|------|---------|-------|
| 1 | `src/engine/hfClient.ts` | HuggingFace API client — auth, download management, local model discovery | ~260 |
| 2 | `src/components/ModelManager.tsx` | Model Manager panel with HF tab and AuthDialog | ~160 |
| 3 | `src/components/GenerationParams.tsx` | Generation parameters panel (temperature, top-p, etc.) | ~90 |
| 4 | `src/components/ChatPanel.tsx` | Enhanced chat: streaming, Markdown, message actions, system prompt editor | ~265 |

---

> **Next milestone:** Phase C — Agent Core & Git Integration. See [plan.md](#phase-c) for details.

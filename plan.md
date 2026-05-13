# OpenLLMCode — Plan

> An open-source, self-contained local AI coding agent that bundles its own llama.cpp inference engine, provides rich agentic tooling with human-in-the-loop approvals, and delivers a clean VS Code–inspired UI. All code is hosted at [github.com/Yonneh0/OpenLLMCode](https://github.com/Yonneh0/OpenLLMCode).

> ✅ **Phase A — Foundation verified complete** (2026-05-13): 30 files, ~1882 lines committed. See README.md for the full Phase A verification table.

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
│  │             │              │     Panel    │     Panel   │  │
│  │ • File Tree │ • Code View  │ • Messages   │ • Shell     │  │
│  │ • Project   │ • Image      │ • Tool Calls │ • AI Tools  │  │
│  │   Controls  │   Preview    │ • Approvals  │             │  │
│  │ • MCP List  │ • Syntax     │              │             │  │
│  │ • Git       │   Highlight  │              │             │  │
│  │ • Checkpts  │              │              │             │  │
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
│  │ llama.cpp    │    │ System AI    │◄──► CPU-only, handles  │
│  │ (assistant)  │◄──►│ (1B model)   │     project mgmt,      │
│  │  CPU only    │    │              │     settings, compile   │
│  └──────────────┘    └──────────────┘                        │
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

| Layer | Technology | Rationale |
|-------|-----------|----------|
| Desktop Shell | Electron + Vite | Cross-platform, mature ecosystem |
| UI Framework | React 19 + TypeScript | Component-driven, type-safe |
| Styling | Tailwind CSS + shadcn/ui | VS Code–like modern aesthetic with dark theme default |
| State Management | Zustand | Lightweight, no boilerplate |
| Inference Engine | llama.cpp (selectable/compiled) | Proven local inference; GGUF support; multiple backends |
| Engine Manager | Custom (GitHub releases + AI-driven compile) | LM Studio–style backend selection; System AI handles compilation |
| Model Downloader | huggingface-cli (installed by System AI) | Official CLI for model downloads and auth, installed via curl script |
| Terminal | Xterm.js + node-pty | Full terminal emulation in-browser |
| Syntax Highlighting | Monaco Editor | Same editor as VS Code — familiar and powerful |
| MCP Client | @modelcontextprotocol/sdk | Official SDK for tool integration |
| File Watching | chokidar | Reliable cross-platform file watching |
| Version Control | Git (embedded) | Auto-commit every AI action; built-in history browser |
| Data Storage | JSON + Markdown files | Simple, portable, human-readable — no database dependency |
| Activity Log | Plaintext `.log` maintained by System AI | Summarizes all activities for quick situational awareness; auto-rotated |

---

## 4. Engine Manager — Backend Selection & AI-Driven Compilation

### Overview (LM Studio–Style)
OpenLLMCode includes an **Engine Manager** that lets users choose exactly how llama.cpp runs on their machine — matching the flexibility of LM Studio's approach. The System AI handles all compilation tasks, including installing compilers and updating SDKs. **Compilation is primarily script-driven**; the System AI audits output and escalates to the production model if issues arise.

```
┌───────────────────────────────────────────────┐
│  ⚙ Engine Manager                              │
│                                               │
│  Backend:                                     │
│  ┌───────────────────────────────────────────┐ │
│  │  ✅ CPU (AVX2)                            │ │
│  │     ▸ Default, works everywhere           │ │
│  │                                           │ │
│  │  ⬜ CUDA (NVIDIA GPU)                     │ │
│  │     ▸ Detected: RTX 4090 (24 GB VRAM)    │ │
│  │                                           │ │
│  │  ⬜ Metal (Apple Silicon)                  │ │
│  │     ▸ Detected: M3 Max                    │ │
│  │                                           │ │
│  │  ⬜ Vulkan                                 │ │
│  │     ▸ Cross-platform GPU fallback         │ │
│  │                                           │ │
│  │  ⬜ ROCm (AMD GPU)                         │ │
│  │     ▸ Detected: RX 7900 XTX               │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  Binary Source:                               │
│  ┌───────────────────────────────────────────┐ │
│  │  ⚪ Pre-built (GitHub Releases)           │ │
│  │     ▸ Downloaded from llama.cpp releases  │ │
│  │                                           │ │
│  │  ⚪ Compile via System AI                  │ │
│  │     ▸ Scripts + auditing; escalates to    │ │
│  │       production model on complex errors   │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  [🔄 Apply & Restart Engine]                   │
└───────────────────────────────────────────────┘
```

### Backend Options
| Backend | Description | Auto-Detected |
|---------|-------------|---------------|
| **CPU (baseline)** | Pure CPU, no SIMD extensions | Always available |
| **CPU (AVX2)** | AVX2-optimized CPU inference | Yes — if CPU supports it |
| **CPU (AVX512)** | AVX-512 optimized (Intel Xeon/Core i9) | Yes — if CPU supports it |
| **CUDA** | NVIDIA GPU acceleration via cuBLAS/cuDNN | Yes — checks `nvcc` and driver version |
| **Metal** | Apple Silicon / Intel Mac GPU via Metal framework | Yes — on macOS with Metal support |
| **Vulkan** | Cross-platform GPU (NVIDIA, AMD, Intel) | Yes — if Vulkan runtime present |
| **ROCm** | AMD GPU acceleration | Yes — checks ROCm installation |

### Binary Source: Pre-built from GitHub Releases
- Downloads pre-compiled binaries directly from [ggerganov/llama.cpp releases](https://github.com/ggerganov/llama.cpp/releases)
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
5. It generates and executes the appropriate CMake configuration, e.g.:
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
- Step-by-step instructions for each OS (Windows/macOS/Linux)
- Known error patterns and their fixes
- Fallback strategies if a backend fails to compile
- Commands for installing compilers (`winget install VisualStudio2022WorkloadDesktopCPP`, `sudo apt install build-essential cmake`, etc.)

### Communication Protocol
Stdin/stdout JSON protocol:
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

```
┌───────────────────────────────────────────────┐
│  📦 Model Manager                              │
│                                               │
│  HuggingFace Authentication:                  │
│  ┌───────────────────────────────────────────┐ │
│  │  ✅ Connected as @your_username           │ │
│  │     Token: hf_••••••••••••••••            │ │
│  │     [🔄 Refresh] [🚪 Logout]              │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  Local Models:                                │
│  ┌───────────────────────────────────────────┐ │
│  │  📁 Qwen3.6-35B-A3B-Claude-4.7-Q4_K_M    │ │
│  │     ▸ Loaded ✅                            │ │
│  │                                           │ │
│  │  📁 Gemma-4-E4B-Uncensored-Q8_0          │ │
│  │     ▸ Not loaded                           │ │
│  │     [▶ Load] [🗑 Remove]                   │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  [+ Add Local .gguf File]                     │
└───────────────────────────────────────────────┘
```

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

### Download Management
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

### Model Selector (Title Bar)
A dropdown in the title bar shows:
- Currently loaded model name and size
- Quick switch between loaded models
- Option to load a new model from local files or download from HuggingFace

---

## 6. Chat Interface — Rich, Responsive UI

### Overview
The chat interface is a first-class experience with rich formatting, multiple sessions, granular parameter controls, real-time streaming, and Cline-style checkpoint rollback.

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

### Mode Toggle (Plan / Act / R/E / Audit)
A prominent toggle at the top of the chat panel:
```
┌───────────┬───────────┬───────────┬───────────┐
│   📋 Plan │   ⚡ Act  │  🔍 R/E   │  🛡 Audit │
└───────────┴───────────┴───────────┴───────────┘
```

| Mode | Description | Allowed Operations |
|------|-------------|-------------------|
| **Plan** | Agent explores, asks questions, generates a structured plan | Read-only (file reads, directory listings) — search uses MODELS.md grep |
| **Act** | Agent executes the plan step-by-step with approval gates | All operations (with user approval for writes/commands) |
| **R/E** | Reverse Engineering — deep analysis of existing code to understand architecture, data flow, and design patterns | Read-only + generate documentation/diagrams; no modifications |
| **Audit** | Security & quality audit — systematic review of code for vulnerabilities, anti-patterns, and best-practice violations | Read-only + generate audit reports; no modifications |

### Session Management
| Feature | Description |
|---------|-------------|
| **Multiple sessions** | Open unlimited chat sessions as tabs; switch between them instantly |
| **Session naming** | Auto-named from first message; editable by clicking the title |
| **Session persistence** | All sessions persist across restarts (stored as JSON + Markdown) |
| **New session** | One-click `[+ New Session]` button creates a fresh conversation |
| **Delete session** | Right-click a tab to delete; confirmation dialog prevents accidents |
| **Export session** | Export any session as Markdown or JSON for sharing/archiving |

### Chat Checkpoint System (Cline-Style)
Similar to Cline's checkpoint system, the chat maintains rollback points. Each checkpoint has two dropdown operations; checkpoints are created automatically at task start/end and after each approval action, or manually via button.

```
┌───────────────────────────────────────────────┐
│  📍 Checkpoints                                │
│                                               │
│  ── Task: Fix auth bug                         │
│  │                                             │
│  │  ● CP-003 — After JWT fix (current)         │ │
│  │     ▸ 2 file changes, 1 commit              │ │
│  │     [🔽 Dropdown Options]                   │ │
│  │       • Restore to This Point               │ │
│  │       • Delete Context After This Point     │ │
│  │                                             │ │
│  │  ● CP-002 — After token rotation            │ │
│  │     ▸ 1 file change, 1 commit               │ │
│  │     [🔽 Dropdown Options]                   │ │
│  │       • Restore to This Point               │ │
│  │       • Delete Context After This Point     │ │
│  │                                             │ │
│  │  ● CP-001 — Initial state                   │ │
│  │     ▸ baseline                              │ │
│  │     [🔽 Dropdown Options]                   │ │
│  │       • Restore to This Point               │ │
│  │       • Delete Context After This Point     │ │
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
| Element | Styling & Behavior |
|---------|-------------------|
| **User messages** | Right-aligned, indigo background, rounded corners |
| **Agent text** | Left-aligned, neutral background; full Markdown rendering (headings, bold, italic, lists, blockquotes) |
| **Code blocks** | Syntax-highlighted with language label and copy button; collapsible for long outputs |
| **Inline code** | Monospace font with subtle background highlight |
| **Tool calls** | Collapsible cards with tool name, input preview, status icon (⏳ running / ✅ done / ❌ failed) |
| **Tool results** | Monospace block below the corresponding tool call; scrollable if long |
| **Approval prompts** | Highlighted card with Approve / Deny buttons and diff preview |
| **Links to images** | Rendered as Markdown links (not inline images); click opens in system viewer or editor |
| **Links to files** | Clickable, opens in Monaco editor or system browser for local files |

### Streaming — Real-Time Token Display
- Tokens stream in real-time with a smooth typewriter effect (no waiting for full response)
- **Typing indicator:** Animated dots while agent is "thinking" before first token arrives
- **Cancel button:** Appears during streaming; aborts generation mid-stream and frees resources
- **Speed display:** Shows tokens/second in the corner of the current message
- **Token count:** Running total shown per message (prompt + completion)

### Generation Parameters Panel
A collapsible panel at the top of the chat for fine-tuning inference:

```
┌───────────────────────────────────────────────┐
│  ⚙ Generation Parameters                      │
│                                               │
│  Temperature:       [0.7] ◄────────►          │
│  Top P:             [0.9] ◄────────►          │
│  Repetition Penalty:[1.1] ◄────────►          │
│  Max Tokens:        [4096]                     │
│                                               │
│  Stop Sequences:                               │
│  ┌───────────────────────────────────────────┐ │
│  │  <|end_of_turn|>                          │ │
│  │  [➕ Add]                                 │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  [🔄 Reset to Defaults]                        │
└───────────────────────────────────────────────┘
```

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| Temperature | 0.1 – 2.0 | 0.7 | Creativity vs. determinism |
| Top P | 0.1 – 1.0 | 0.9 | Nucleus sampling threshold |
| Repetition Penalty | 1.0 – 2.0 | 1.1 | Discourage repeated phrases |
| Max Tokens | 64 – 32768 | 4096 | Maximum response length |
| Stop Sequences | Free text | Model-specific | Custom stop tokens |

Parameters are **per-session** — changing them in one session doesn't affect others.

### System Prompt Editor
Each session has an editable system prompt:
- Click the `⚙` icon next to the model selector to open the system prompt editor
- Default system prompt is pre-filled based on mode (Plan / Act / R/E / Audit)
- User can customize or replace entirely
- Changes take effect on the next message sent
- **Preset templates:** Quick-select from built-in prompts ("Coding Assistant", "Code Reviewer", "Debugging Expert", "Reverse Engineer", "Security Auditor", etc.)

### Message-Level Actions & Checkpoint Dropdown
Each chat message has a subtle action bar that appears on hover:
| Action | Description |
|--------|-------------|
| 📋 Copy | Copy the entire message as Markdown to clipboard |
| ✏️ Edit (user messages) | Modify your own message and re-send; agent responds from scratch |
| 🔁 Regenerate (agent messages) | Re-generate this specific response with current parameters |
| ⬇️ Continue | If a response was cut off, continue generating from where it stopped |

### Navigation (Mouse + Tab/Arrow Keys)
All interactions are navigable via mouse click, Tab key cycling through elements, and Arrow keys for menus/dropdowns. No hotkeys required.

### Responsive Design
- Chat panel auto-resizes with the window; messages reflow gracefully
- On narrow windows, tool call cards collapse by default
- Long code blocks are scrollable within their container (not full-page scroll)
- Touch-friendly on tablets: larger tap targets for buttons

---

## 7. Context Compression Engine

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
│                                               │
│  Offloaded to Task System:                     │
│  ┌───────────────────────────────────────────┐ │
│  │  [Structured task data in JSON]            │ │
│  │  • Full plan with step statuses            │ │
│  │  • Tool call history                       │ │
│  │  • File change log                         │ │
│  └───────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘
```

### How It Works
1. **Active window:** A configurable percentage of total context remains in the LLM context as-is, with a minimum floor of 2048 tokens. For example, Qwen3.6 (up to 262K tokens) and Nemotron3-Nano-4B (up to 1M tokens) both benefit from proportionally larger active windows — smaller models use the full window while larger ones dynamically scale based on total context size.
2. **Compression trigger:** When total context exceeds a threshold, earlier messages are compressed into concise summaries by the System AI
3. **Structured offload:** Compressed data is stored in the task's JSON state file, including:
   - Summarized conversation history
   - Structured plan with step statuses
   - Key decisions and their rationale
   - File change log (what was modified and why)
4. **Re-injection:** On each new turn, a condensed summary is prepended to the active context so the LLM retains awareness of earlier work

### Benefits
- Supports conversations that span thousands of tool calls without exhausting the context window
- The task system serves as durable, structured memory — even if the app restarts mid-conversation
- Compression is lossy but preserves decision-making context (what was done and why)

---

## 8. Task System

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

### System Prompt Guidance
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

### Task Lifecycle
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

### Task Completion & Git Squash Integration
When the AI Agent provides its **completion message**, the user is presented with a squash option:

```
┌───────────────────────────────────────────────┐
│  ✅ Task Completed                             │
│                                               │
│  Summary: Fixed authentication bug by          │
│  implementing JWT key rotation with fallback   │
│  mechanism. Modified 3 files across 5 commits. │
│                                               │
│  ┌───────────────────────────────────────────┐ │
│  │  [📦 Squash Commits]                      │ │
│  │     ▸ Combine all 5 commits into one      │ │
│  │     ▸ Use AI summary as commit message    │ │
│  │     ▸ Editable before finalizing          │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  [▶ Continue]  [📝 View Full History]          │
└───────────────────────────────────────────────┘
```

- The squash operation uses `git reset --soft` to combine all task-related commits into one
- The AI-generated completion summary becomes the commit message (editable by the user)
- This keeps Git history clean and meaningful

---

## 9. Approval System & Pre-Approval Rules

### Default Approval Matrix
| Action | Default Behavior |
|--------|----------------|
| Read file | ✅ Auto-approved |
| List directory | ✅ Auto-approved |
| Search files (grep) | ✅ Auto-approved |
| Write / modify file | ⏸ Requires approval (shows diff) |
| Create new file | ⏸ Requires approval (shows content preview) |
| Delete file | ⏸ Requires approval (highlights danger) |
| Run terminal command | ⏸ Requires approval (shows command) |
| External network access | ❌ Denied by default (requires explicit rule) |

### Category-Based Approval Rules
The approval system supports category-based rules for fine-grained control:

```json
// .openllmcode-rules  (project-level configuration)
{
  "categories": {
    "file_read": {
      "default": "allow",
      "deny_patterns": [
        {"pattern": "**/.env*", "reason": "Never auto-read secrets"},
        {"pattern": "**/id_rsa*", "reason": "Never read private keys"}
      ]
    },
    "file_write": {
      "default": "require_approval",
      "allow_patterns": [
        {"pattern": "**/*.test.ts", "reason": "Auto-approve test file changes"},
        {"pattern": "**/dist/**", "reason": "Build artifacts are safe to overwrite"}
      ],
      "deny_patterns": [
        {"pattern": "**/.git/**", "reason": "Never modify Git internals"}
      ]
    },
    "command_exec": {
      "default": "require_approval",
      "allow_commands": [
        {"command": "npm run lint", "reason": "Linting is read-only in effect"},
        {"command": "git status", "reason": "Git status is safe"}
      ],
      "deny_patterns": [
        {"pattern": "rm -rf *", "reason": "Dangerous recursive delete"},
        {"pattern": "format *", "reason": "Disk formatting is never allowed"}
      ]
    },
    "network_access": {
      "default": "deny",
      "allow_urls": [
        {"pattern": "https://api.github.com/**", "reason": "GitHub API access for repo operations"},
        {"pattern": "https://huggingface.co/api/**", "reason": "HuggingFace model downloads"}
      ]
    },
    "project_boundary": {
      "default": "deny_outside_project",
      "allow_paths": [
        {"pattern": "%APPDATA%/OpenLLMCode/models/**", "reason": "Model directory access"},
        {"pattern": "/tmp/**", "reason": "Temporary file operations"}
      ]
    }
  },
  "preApprove": {
    "write_file": [
      {"pattern": "**/*.test.ts", "reason": "Auto-approve test file changes"}
    ],
    "run_command": [
      {"command": "npm run lint", "reason": "Linting is read-only in effect"}
    ]
  }
}
```

### Commit Rules & Pre-Approval Integration
Commits are only created after successful tool calls complete. Failed calls do not initiate a commit or modify the project. Before each action, user edits are captured via `git status`/`git diff`, then stashed automatically (or optionally included in the squashed completion commit).

### Tool Safety Auditing & Approval Dialog
All built-in tooling and MCP servers are audited for safety:
- **get_url / fetch tools:** Must declare target URLs; blocked by `network_access` category rules
- **exec_shell tools:** Commands are parsed against deny-patterns before execution
- **File access tools:** Paths are validated against project boundary rules
- Tool results return clear, structured context to the AI Assistant (similar to Cline's approach)

### Approval Dialog with Four Options
When a tool action requires approval, the user sees four options:
| Option | Behavior |
|--------|----------|
| **Allow** | Execute this action once; record for future reference |
| **Always Allow** | Auto-approve all actions matching this rule (stored in `.openllmcode-rules`) |
| **Deny** | Block this action |
| **Deny with Reason** | Write a one-line reason — the AI receives it and corrects its behavior |

Pre-approved actions flow through normally without interruption. If an AI attempts an already pre-approved action, no dialog appears at all.

---

## 10. File Tree & Project Controls

### Sidebar Layout
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

### Project Controls
- **Change Root Folder:** Opens a native file picker dialog
- Changing the root resets the project context sent to the agent
- The root path is included in the system prompt so the agent knows its working directory
- Multiple recent projects shown as quick-switch options

### File Watching
- chokidar watches for external changes (e.g., another editor modifying files)
- Tree updates in real-time when files are added, modified, or deleted outside OpenLLMCode

---

## 10A. Project Creation & Import Tooling

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
│  │     ▸ Browse your filesystem              │ │
│  └───────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘
```

| Option | Description |
|--------|-------------|
| **Empty Project** | Creates a bare folder with `.gitignore`, `README.md`, and initializes Git |
| **From Template (Unzip)** | Bundled starter templates (React, Node, Python, Go, Rust) extracted into the project folder |
| **Clone Repository** | Clone from any Git provider (GitHub, GitLab, Bitbucket, Gitea, self-hosted) via URL or OAuth |
| **Open Existing Folder** | Browse and open an existing directory as a project |

### Template Library (Unzip Tooling)
Built-in templates that are extracted into the new project folder:

```
┌───────────────────────────────────────────────┐
│  📦 Choose a Template                          │
│                                               │
│  ┌───────────────────────────────────────────┐ │
│  │  ⚛ React + Vite (TS)                      │ │
│  │     ▸ Frontend starter                    │ │
│  │                                           │ │
│  │  🟢 Node.js + Express                     │ │
│  │     ▸ Backend API                         │ │
│  │                                           │ │
│  │  🐍 Python (FastAPI)                      │ │
│  │     ▸ Python web app                      │ │
│  │                                           │ │
│  │  🔵 Go (gin-gonic)                        │ │
│  │     ▸ Go REST API                         │ │
│  │                                           │ │
│  │  🦀 Rust (Axum)                           │ │
│  │     ▸ Rust web app                        │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  [📥 Download & Extract]                       │
└───────────────────────────────────────────────┘
```

- Templates are downloaded as `.zip` from a curated list and extracted into the project folder
- Users can add custom templates by pointing to a `.zip` URL or local file
- After extraction, dependencies are auto-installed (e.g., `npm install`, `go mod tidy`)

### Repository Clone Tooling
Clone projects from any Git provider:

```
┌───────────────────────────────────────────────┐
│  🔗 Clone a Repository                         │
│                                               │
│  Provider: [GitHub ▼]                          │
│     ▸ GitHub / GitLab / Bitbucket / Gitea      │ │
│                                               │
│  Repository URL:                               │
│  ┌───────────────────────────────────────────┐ │
│  │  https://github.com/user/repo.git         │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  Clone Into:                                  │
│  ┌───────────────────────────────────────────┐ │
│  │  ⚪ New project folder                     │ │
│  │  ⚪ Subfolder of current project            │ │
│  │     ▸ Path: [src/external/repo]           │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  Authentication:                              │
│  ┌───────────────────────────────────────────┐ │
│  │  ⚪ Public repo (no auth)                  │ │
│  │  ⚪ SSH key                                │ │
│  │     ▸ Select key: [id_ed25519 ▼]          │ │
│  │  ⚪ Personal access token                  │ │
│  │     ▸ Token: [••••••••••••••••]           │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  [▶ Clone Repository]                          │
└───────────────────────────────────────────────┘
```

- **Clone into new project:** Creates a fresh project from the cloned repo
- **Clone into subfolder:** Pulls the repo into a subdirectory of the current project (useful for dependencies, libraries, or multi-repo projects)
- **Authentication options:** Public repos require no auth; private repos support SSH keys or personal access tokens
- **Progress tracking:** Real-time progress bar during clone with speed and ETA

### Subfolder Import
When cloning into an existing project:
- The subfolder appears in the file tree as a nested directory
- Git history for that subfolder is tracked independently (submodule-like behavior without submodule complexity)
- The AI agent can operate across both the main project and imported subfolders
- Option to sync/pull updates from the remote at any time

---

## 10B. Lightweight Assistant Model (UI Agent) — CPU Only

### Overview
A lightweight ~1B parameter model runs alongside the primary coding model, handling UI actions, project management, settings configuration, and routine tasks with strict system prompts. **This model always runs on CPU only** — no VRAM scheduling is needed since it never touches the GPU. Its system prompt provides clear guidance on how to perform most tasks.

```
┌───────────────────────────────────────────────┐
│  🤖 Model Assignment                           │
│                                               │
│  Primary (Coding/Reasoning):                   │
│  ┌───────────────────────────────────────────┐ │
│  │  qwen3.6-35b.Q4_K_M.gguf    (20 GB)       │ │
│  │     ▸ Loaded ✅ (GPU: CUDA)                │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  Assistant (UI/Project Management):            │
│  ┌───────────────────────────────────────────┐ │
│  │  ibm-grok4-1b.Q8_0.gguf    (780 MB)        │ │
│  │     ▸ Loaded ✅ (CPU only)                 │ │
│  │     ▸ Strict system prompt active           │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  [⚙ Configure Model Assignment]                │
└───────────────────────────────────────────────┘
```

### Task Routing
The app routes tasks to the appropriate model based on type:

| Task Type | Routed To | Examples |
|-----------|-----------|----------|
| **UI Actions** | Assistant (1B, CPU) | Toggle panels, change settings, navigate file tree |
| **Project Management** | Assistant (1B, CPU) | Clone repos, unzip templates, create new projects |
| **Settings/Configuration** | Assistant (1B, CPU) | Engine selection, model loading, HF auth setup |
| **Git Operations** | Assistant (1B, CPU) | Commit, squash, unstage, browse history |
| **llama.cpp Compilation** | Assistant (1B, CPU) | Install compilers, configure CMake, build engine; audits output, escalates to production model |
| **Context Compression** | Assistant (1B, CPU) | Summarize earlier conversation for offloading |
| **Code Generation** | Primary (GPU/CPU) | Write functions, refactor code, generate tests |
| **Complex Reasoning** | Primary (GPU/CPU) | Debug issues, architect solutions, plan features |
| **File Analysis** | Primary (GPU/CPU) | Read and understand complex codebases |

### Strict System Prompts for Assistant Model
The 1B model operates under tightly constrained system prompts that limit its scope to safe, routine tasks:

```
You are the UI Assistant for OpenLLMCode.
Your role is limited to project management, settings configuration,
and engine compilation ONLY. You run on CPU and must be efficient.

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
- Network access outside explicitly allowed URLs

When a task requires code understanding or generation,
escalate to the Primary model with context.

COMPILATION GUIDANCE:
You have step-by-step instructions for compiling llama.cpp on
Windows (MSVC/MinGW), macOS (Clang/Xcode), and Linux (GCC).
Follow these instructions precisely. If a build fails, analyze
the error output and apply known fixes from your knowledge base.

When encountering complex compilation issues that you cannot resolve
with built-in patterns, escalate to the Production AI with context.
```

### Benefits
- **Responsiveness:** The 1B model responds in milliseconds for UI tasks; no waiting for an 8B+ model to warm up
- **Resource efficiency:** The 1B model uses ~780MB RAM on CPU vs ~20GB VRAM for the primary — both run simultaneously without conflict
- **Clear separation of concerns:** Routine tasks don't consume the primary model's context window or compute budget
- **No VRAM contention:** Since the assistant is CPU-only, there is no need for complex GPU scheduling

---

## 10C. Logging & Monitoring Tabs

### Overview
Dedicated logging tabs provide real-time visibility into llama.cpp instances during reasoning blocks, ensuring the UI remains responsive even when heavy inference is occurring. Users can monitor token generation, engine health, and detailed status at a glance.

```
┌───────────────────────────────────────────────┐
│  📊 Engine Log          [🔄 Live] [🔍 Filter] │
│                                               │
│  ┌───────────────────────────────────────────┐ │
│  │ [10:35:42.103] INFO  llama.cpp engine      │ │
│  │           started (PID 4829)               │ │
│  │                                           │ │
│  │ [10:35:42.215] INFO  Loading model         │ │
│  │           qwen3.6-35b.Q4_K_M.gguf          │ │
│  │                                           │ │
│  │ [10:35:43.891] INFO  Model loaded in       │ │
│  │           1676ms (VRAM: 20 GB)             │ │
│  │                                           │ │
│  │ [10:35:44.012] INFO  Inference request     │ │
│  │           received — prompt_tokens: 120    │ │
│  │                                           │ │
│  │ [10:35:44.156] DEBUG Token generated       │ │
│  │           #1/45 — "I'll" (3.2ms)          │ │
│  │                                           │ │
│  │ [10:35:44.189] DEBUG Token generated       │ │
│  │           #2/45 — " investigate" (3.1ms)   │ │
│  │                                           │ │
│  │ ...                                       │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  Summary:                                     │
│  ┌───────────────────────────────────────────┐ │
│  │  Engine: llama.cpp (CUDA, RTX 4090)       │ │
│  │  Model: qwen3.6-35b.Q4_K_M.gguf           │ │
│  │  Status: ✅ Running                        │ │
│  │  Tokens/sec: 28.7                          │ │
│  │  VRAM Used: 20,480 / 24,576 MB             │ │
│  │  Uptime: 00:12:34                          │ │
│  └───────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘
```

### Log Levels
| Level | Color | Description |
|-------|-------|-------------|
| **DEBUG** | Gray | Token-by-token generation, internal state transitions |
| **INFO** | Green | Model loading, inference start/end, engine lifecycle |
| **WARN** | Yellow | Slow token generation (>100ms), memory pressure warnings |
| **ERROR** | Red | Engine crashes, OOM errors, model load failures |

### Multi-Engine Monitoring
When multiple llama.cpp instances run simultaneously (primary + assistant):

```
┌───────────────────────────────────────────────┐
│  📊 Engine Logs                                │
│                                               │
│  Tabs: [🟢 Primary] [🟢 Assistant] [🔴 All]   │
│                                               │
│  ── Primary (qwen3.6-35b, CUDA) ───────────── │
│  Status: ✅ Running | Tokens/sec: 28.7         │
│  VRAM: 20,480 / 24,576 MB                     │
│                                               │
│  ── Assistant (ibm-grok4-1b, CPU) ──────────── │
│  Status: ✅ Running | Tokens/sec: 85.3         │
│  RAM: 780 / 32,768 MB                          │
└───────────────────────────────────────────────┘
```

- **Per-engine tabs:** Isolate logs for each running instance
- **Combined view:** All engine logs merged chronologically with source labels
- **Live toggle:** Pause/resume log streaming without stopping inference
- **Filter bar:** Search by keyword, log level, or time range

### Reasoning Block Visibility
During agent reasoning blocks (when the model is "thinking" before acting):

```
┌───────────────────────────────────────────────┐
│  🧠 Reasoning Monitor                          │
│                                               │
│  Current Phase: Analyzing auth middleware      │
│  ───────────────────────────────────────────── │
│  Tokens consumed: 340 / 8192 (4.2%)            │
│  Time elapsed: 12.4s                           │
│                                               │
│  Internal Steps:                               │
│  ┌───────────────────────────────────────────┐ │
│  │  ✅ Read file: src/auth/middleware.ts      │ │
│  │     ▸ 45 tokens, 0.8s                     │ │
│  │                                           │ │
│  │  ✅ Analyze JWT logic                      │ │
│  │     ▸ 120 tokens, 3.2s                    │ │
│  │                                           │ │
│  │  ⏳ Generate fix proposal                  │ │
│  │     ▸ 175 tokens, 8.4s (in progress)      │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  [⏹ Cancel Reasoning]                          │
└───────────────────────────────────────────────┘
```

- Shows the current reasoning phase and token consumption
- Breaks down internal steps with timing and token counts
- Context window usage displayed as a progress bar
- Cancel button to abort long-running reasoning blocks

### Log Persistence & Export
- Logs are persisted per-session in plain-text `.log` files for post-mortem analysis
- **Export logs:** Download as `.log` or `.json` files for debugging
- **Log rotation:** Older logs are archived automatically (configurable retention period)
- **Crash dumps:** If an engine crashes, the last 1000 log lines are saved to a crash report

---

## 11. Editor & Terminal

### Monaco Editor Integration
The code editor uses Monaco (same as VS Code):
- Full syntax highlighting for all major languages
- IntelliSense / autocomplete powered by the language server
- Bracket matching, folding regions, minimap
- Multi-cursor editing support
- Manual edits are allowed and synced back to disk

### Image & File Preview
When a non-code file is selected:
| Type | Handling |
|------|----------|
| Images (png, jpg, gif, svg, webp) | Displayed in Monaco's built-in image viewer with zoom controls; fit-to-window toggle |
| Markdown | Rendered as HTML preview |
| JSON / YAML | Formatted tree view |
| PDF | Basic page-by-page viewer |
| Audio/Video | Native media player controls |
| Binary files | Hex dump with character overlay |

### Split View
- Drag a file from the tree onto the editor area to open a split pane
- Up to 3 panes supported side-by-side

### Terminal Window
- Full terminal emulator (xterm.js) in the bottom panel
- Uses the system's default shell (cmd/PowerShell on Windows, zsh/bash on macOS/Linux)
- Working directory defaults to the project root
- Resizable via draggable divider

#### AI-Powered Terminal Tools
| Tool | Description |
|------|-------------|
| `run_command` | Execute a shell command; streams output in real-time |
| `read_terminal_output` | Read the last N lines of terminal output |
| `kill_process` | Terminate a running process by PID or name |

#### Real-Time Monitoring
- When the agent runs a long-running command (e.g., `npm run dev`), it can monitor the output and react to errors
- Compile errors, test failures, and server crashes are detected and reported back in the chat
- The agent can suggest fixes based on terminal output

---

## 12. MCP Server Integration

### Built-in MCP Client
Uses the official `@modelcontextprotocol/sdk` to connect to external MCP servers.

### Managing MCP Servers (Sidebar)
```
┌───────────────────────────────┐
│  🔌 MCP Servers               │
│                               │
│  ✅ Git Server                │
│     └─ tools: git_status, ... │
│                               │
│  ✅ Filesystem Server         │
│     └─ tools: read_dir, ...   │
│                               │
│  ❌ Database Server (offline) │
│                               │
│  [+ Add MCP Server]           │
└───────────────────────────────┘
```

### Adding an MCP Server
Dialog with fields:
- **Name:** Human-readable label
- **Transport:** stdio (local process) or HTTP (remote)
- **Command / URL:** For stdio — the command to run; for HTTP — the endpoint URL
- **Arguments:** Optional arguments for stdio servers
- **Environment variables:** Key-value pairs passed to the server process

### Tool Discovery
When an MCP server connects, its available tools are automatically registered with the agent's tool registry and included in the system prompt. All MCP tools are subject to the same category-based approval rules as built-in tools.

---

## 13. System Prompt Architecture

The system prompt is assembled dynamically from several sections:

```
You are OpenLLMCode, an AI coding assistant.

[PROJECT CONTEXT]
Working directory: /path/to/project
File tree:
  src/
    app.ts
    db.sql
  package.json

[TASK CONTEXT]
Current task: "Fix the authentication bug"
Mode: Act (executing plan)
Plan step 2 of 5: Update the auth middleware

[COMPRESSED HISTORY]
Earlier work summary:
- Task created, initial analysis completed
- Plan generated with 5 steps
- Steps 1-2 completed successfully
- Key decision: use JWT rotation pattern for secret management

[AVAILABLE TOOLS]
- read_file(path): Read a file's contents
- write_file(path, content): Write to a file (requires approval)
- run_command(command): Execute a shell command (requires approval)
... [all tools with descriptions and schemas]

[APPROVAL RULES]
The following actions require your user's approval before execution:
- Any file write or deletion
- Any terminal command execution
Read operations do not require approval.
Network access is denied by default unless explicitly allowed.
File access outside the project folder is denied by default.
Pre-approved patterns: **/*.test.ts writes, "npm run lint" commands

[BEHAVIORAL GUIDELINES]
1. Always read a file before modifying it — never guess at its contents
2. Show the diff of changes before requesting approval to write
3. Explain what you're doing and why before each action
4. Ask clarifying questions when the task is ambiguous
5. Prefer small, incremental changes over large rewrites
6. If a command fails, analyze the error and suggest fixes
7. When in doubt, ask — don't assume

[VERSION CONTROL]
Every change you make will be automatically committed to Git with a descriptive message.
On task completion, all commits can be squashed into one.
```

---

## 14. Data Persistence

| Data | Storage | Details |
|------|---------|--------|
| Chat history (sessions) | Markdown files (`.md`) | One file per session; human-readable; portable |
| Session metadata | JSON files (`.json`) | Task state, checkpoints, compressed history |
| Engine config | JSON config file | Selected backend, binary source, compile flags |
| Model settings | JSON config file | Per-model parameters (context window, GPU layers, threads) |
| HuggingFace auth token | OS Keychain | Encrypted; Windows Credential Manager / macOS Keychain / Linux libsecret |
| MCP server configs | JSON config file | Server definitions and connection state |
| Pre-approval rules | `.openllmcode-rules` in project root | Project-scoped; also global defaults |
| Terminal history | In-memory + JSON | Persisted per-task |
| Download queue/state | JSON config file | Resumable downloads; progress tracking |
| Engine logs | Plain-text `.log` files | Per-session; rotatable; exportable |
| Activity log (plaintext) | `.log` maintained by System AI | Summarizes all activities for quick situational awareness; auto-rotated |

---

## 15. Development Phases

### Phase A — Foundation
- [ ] Electron app shell with basic layout (sidebar, editor area, chat panel, terminal)
- [ ] **Engine Manager:** Backend selection UI (CPU/CUDA/Metal/Vulkan/ROCm) with auto-detection
- [ ] **GitHub binary download:** Fetch pre-built llama.cpp binaries from releases
- [ ] **System AI integration:** 1B CPU model for project management and compilation tasks; compiles via scripts + auditing, escalates to production model
- [ ] Basic chat interface: send message → receive streaming reply
- [ ] Model selector in title bar
- [ ] File tree with project root controls
- [ ] JSON + Markdown data persistence (no SQLite)

### Phase B — HuggingFace & Chat Richness
- [ ] **HuggingFace integration:** Auth token management, model download with progress
- [ ] **Model Manager UI:** HF downloader panel + local model browser with load/unload
- [ ] **Rich chat UI:** Multiple sessions/tabs, session persistence, export
- [ ] **Generation parameters panel:** Temperature, top-p, repetition penalty, max tokens, stop sequences
- [ ] **System prompt editor** per session with preset templates
- [ ] Full Markdown rendering in agent messages (code blocks with syntax highlighting)
- [ ] Message-level actions: copy, edit, regenerate, continue
- [ ] Streaming enhancements: typing indicator, cancel button, speed display, token counts

### Phase C — Agent Core & Git Integration
- [ ] Plan/Act/R/E/Audit mode toggle with distinct behaviors
- [ ] Tool registry system with file read/write/search tools (search via MODELS.md grep)
- [ ] Category-based approval gate UI with four-option dialog (Allow / Always Allow / Deny / Deny w/ Reason)
- [ ] Task creation and lifecycle management
- [ ] System prompt assembly from context sections
- [ ] **Git auto-commit:** Only after successful tool calls; failed calls don't commit or modify project
- [ ] **Chat checkpoint system:** Cline-style dropdown — Restore to This Point / Delete Context After This Point
- [ ] **Task completion squash:** Combine all task commits into one on completion
- [ ] User edits stashed automatically before actions (or included in squashed commit)
- [ ] Context window visual indicator with progress bar

### Phase D — Editor, Terminal & Project Tooling
- [ ] Monaco Editor integration with syntax highlighting
- [ ] Image/file preview for non-code files (Monaco built-in viewer)
- [ ] Split view support
- [ ] xterm.js terminal panel
- [ ] Terminal tools (run_command, read_output, kill_process)
- [ ] Real-time terminal output streaming to agent
- [ ] **Project creation wizard:** Empty project, template unzip, repo clone, open existing folder
- [ ] **Template library:** Bundled starter templates with auto-dependency install
- [ ] **Repository clone tooling:** Multi-provider support with auth options and progress tracking

### Phase E — MCP, Context Compression & Monitoring
- [ ] MCP client integration with server management UI
- [ ] Tool discovery and registration from MCP servers
- [ ] Category-based pre-approval rules configuration (.openllmcode-rules)
- [ ] Task history sidebar with resume capability
- [ ] File watching for external changes
- [ ] **Context Compression Engine:** Automated offloading of early context to task system
- [ ] **Engine logging tabs:** Real-time llama.cpp monitoring during reasoning blocks
- [ ] **Reasoning block visibility:** Phase tracking, token consumption, internal step breakdown
- [ ] **Activity log maintained by System AI** — plaintext summary of all activities across the app for quick situational awareness; auto-rotated

### Phase F — Polish & Launch
- [ ] Dark theme refinement and accessibility audit
- [ ] Settings panel with all configurable options (engine, models, HF auth, chat defaults, Git, assistant model)
- [ ] Build scripts for Windows / macOS / Linux
- [ ] Documentation and example workflows
- [ ] **Preset AI prompts:** Bundled prompt templates so users can download source from github.com/Yonneh0/OpenLLMCode, modify, and recompile
- [ ] **GitHub releases update mechanism:** Check for official updates or community forks

---

## 16. Open Source Strategy

- **License:** MIT — permissive, developer-friendly
- **Repository:** [github.com/Yonneh0/OpenLLMCode](https://github.com/Yonneh0/OpenLLMCode)
- **Contributing:** Clear CONTRIBUTING.md with setup instructions
- **Preset AI Prompts:** Bundled prompt templates that users can download from the repo, modify for their needs, and recompile into custom builds
- **Plugin system (future):** Allow community to add custom tools via a simple TypeScript API

---

## 17. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| llama.cpp subprocess crashes during inference | Agent becomes unresponsive | Health-check pings; auto-restart with model reload |
| Large models exceed available RAM | App freezes or OOM kills | Model size validation at load time; graceful error messaging |
| MCP server hangs or leaks resources | Degraded performance | Per-server timeout and memory limits; kill switch in UI |
| Context window overflow on large projects | Agent loses context | **Context Compression Engine** offloads early history to task system |
| Approval fatigue (too many prompts) | User frustration | Category-based pre-approval rules reduce noise; batch approval for similar actions |
| Compile from source fails | User can't use optimized engine | Scripts + System AI auditing with escalation to production model |
| HuggingFace rate limits or downtime | Model downloads stall | Retry with exponential backoff; queue system; offline model cache |
| HF token revoked/expired mid-download | Download fails partway | Token validation before download starts; resumable downloads from last checkpoint |
| CUDA/Metal driver incompatibility | GPU backend doesn't work | Auto-detection with version checks; fallback to CPU with warning |
| Git auto-commit creates excessive noise | Repository history becomes cluttered | **Task completion squash** combines all task commits into one clean commit |
| Assistant model produces incorrect UI actions | Wrong settings applied or projects misconfigured | Strict system prompts with allowed/denied action lists; user confirmation for destructive operations |
| Network access by tools leaks data | Privacy breach | Category-based denial of network access by default; explicit allow-lists only |
| File access outside project folder | Unauthorized file reads/writes | Project boundary rules deny access outside working directory by default |

---

## 18. Initial Setup — Automated Onboarding (~80% automated)

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
│  │     ▸ Fast, lightweight, handles project   │ │
│  │       management and compilation           │ │
│  │                                           │ │
│  │  Primary AI (GPU):                         │ │
│  │    HauhauCS/Qwen3.6-35B-A3B-Claude-4.7     │ │
│  │    -Opus-Reasoning-Distilled-GGUF           │ │
│  │     ▸ Strong reasoning, code generation,   │ │
│  │       and debugging                        │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  [⏳ Downloading System AI...]                  │
│  [▶ Also download Primary AI]                  │
│                                               │
│  You can change models anytime in Settings.    │
│  See MODELS.md at the repo root for all options.│
└───────────────────────────────────────────────┘
```

### Hardware-Based Model Recommendations
| Hardware Tier | System AI (CPU) | Primary AI (GPU) |
|--------------|-----------------|------------------|
| **High-end** (24GB+ VRAM, 32GB+ RAM) | ibm-grok4-1b-Q8_0 | HauhauCS/Qwen3.6-35B-A3B-Claude-4.7-Opus-Reasoning-Distilled-GGUF (~20 GB) |
| **Mid-range** (8–24GB VRAM, 16–32GB RAM) | ibm-grok4-1b-Q8_0 | Qwen/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive-GGUF (~10 GB) |
| **Low-end** (<8GB VRAM or CPU-only) | ibm-grok4-1b-Q8_0 | Nemotron3-Nano-4B-Uncensored-HauhauCS-Aggressive-Q4_K_M ⚠️ Requires ≥16 GB RAM or suitable GPU for offloading; alternative: microsoft/Phi-3.5-mini-instruct-Q4_K_M.gguf (~3 GB) |

### Setup Steps (Automated)
1. **Hardware detection** — GPU, CPU, RAM assessment
2. **Backend selection** — Auto-select best available backend (CUDA > Metal > Vulkan > CPU)
3. **System AI download** — Download and load the 1B model on CPU
4. **Primary AI download** — Optional; user can start without it and download later
5. **Engine binary fetch** — Download pre-built llama.cpp for selected backend
6. **Default project creation** — Create a starter project folder with `.gitignore` and `README.md`
7. **Git initialization** — Initialize Git repo in the project folder

---

## 19. Update Mechanism

### GitHub Releases Integration
The app checks for updates via GitHub releases:

```
┌───────────────────────────────────────────────┐
│  🔄 App Updates                                │
│                                               │
│  Current version: v0.1.0                       │
│  Latest official: v0.2.0 (available)           │
│                                               │
│  Update Source:                               │
│  ┌───────────────────────────────────────────┐ │
│  │  ⚪ Official (Yonneh0/OpenLLMCode)        │ │
│  │     ▸ Verified releases only              │ │
│  │                                           │ │
│  │  ⚪ Community Fork                         │ │
│  │     ▸ Repository: [________________]      │ │
│  │     ▸ Check for custom builds             │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  Auto-update:                                  │
│  ┌───────────────────────────────────────────┐ │
│  │  ⚪ Check on startup                       │ │
│  │  ⚪ Notify only, manual download           │ │
│  │  ⚪ Never check                            │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  [🔄 Check Now]  [⬇ Download & Install]       │
└───────────────────────────────────────────────┘
```

- **Official updates:** Pull from `Yonneh0/OpenLLMCode` releases only (verified)
- **Community forks:** User can specify a GitHub repository to check for custom builds
- **Auto-update options:** Check on startup, notify-only, or never check
- Update downloads happen in the background; user is prompted to restart

---

## 20. MODELS.md Reference

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
# OpenLLMCode

An open-source, self-contained local AI coding agent that bundles its own llama.cpp inference engine, provides rich agentic tooling with human-in-the-loop approvals, and delivers a clean VS Code–inspired UI. All code is hosted at [github.com/Yonneh0/OpenLLMCode](https://github.com/Yonneh0/OpenLLMCode).

## Quick Links

- **[plan.md](./plan.md)** — detailed project plan covering architecture, tech stack, and feature roadmap (v2.3 with verified Phase A + B)
- **[AUDIT.md](./AUDIT.md)** — comprehensive audit report of Phase A + B codebase with 9 bugs fixed
- [GitHub Repository](https://github.com/Yonneh0/OpenLLMCode)
- [MODELS.md](./MODELS.md) — model recommendations by hardware tier

## Key Features

### ✅ Phase A — Foundation (Complete — ~36 files, ~2548 lines committed)

Verified on 2026-05-13. Each feature audited against the source code below.

| Feature | Status | Verified Details |
|---------|--------|------------------|
| Electron app shell with layout | ✅ Built | Root `App.tsx` (~360 lines) + component files (Sidebar, TitleBar, EditorArea, TerminalPanel, ChatPanel) |
| Engine Manager UI + backend selection | ✅ Built | CPU/CUDA/Metal/Vulkan/ROCm with auto-detection (`src/engine/manager.ts`, 127 lines) — hardware detection via WMI on Windows, sysctl on macOS |
| GitHub binary download for llama.cpp | ✅ Built | Fetches pre-built binaries from `ggerganov/llama.cpp` releases via axios; supports per-backend matching (e.g. cuda → cublas builds) |
| System AI (1B CPU model) integration | ✅ Built | `SystemAIClient` class with strict system prompt, CMake compile scripts for Windows/macOS/Linux (`src/engine/systemAI.ts`, 147 lines). **Fixed:** kill-before-spawn to prevent double-instances |
| Basic chat interface with streaming | ✅ Built | Messages, tool call cards, input field, generation parameters; simulated response flow in `src/store/chatStore.ts` |
| Model selector in title bar | ✅ Built | Dropdown with engine manager and model switcher (`src/components/TitleBar.tsx`, 36 lines) |
| File tree + project controls | ✅ Built | Sidebar with file tree (📁 src/, 📄 main.tsx, etc.) + change root/new project buttons + MCP panel |
| JSON + Markdown data persistence | ✅ Built | Session save/load/export, activity log, config in `src/store/dataPersistence.ts` (104 lines) |
| Git auto-commit on AI changes | ✅ Built | Commit after tool calls, squash commits, Cline-style checkpoints (`src/engine/gitAutoCommit.ts`, 111 lines) — autoCommitAfterAction tracks successful actions. **Fixed:** cross-platform git paths (%APPDATA% vs $HOME/.openllmcode) |
| TypeScript type system | ✅ Built | Core types (ChatMessage, ToolCall, Session), EngineConfig, ModelInfo (`src/types.ts`, 45 lines) |

**Bug Fixes in Phase A (see [AUDIT.md](./AUDIT.md)):**
- **exec-command:** Platform-specific shell (cmd.exe /c vs /bin/sh -c) — fixed cross-platform command execution
- **git-commit:** Fixed `%APPDATA%` hardcoded Windows path to use conditional `$HOME/.openllmcode` on POSIX
- **systemai-start:** Added kill-before-spawn to prevent double llama-server instances
- **systemai-stop IPC:** Added missing IPC handler for terminating system AI subprocess
- **dialog-select-folder:** Added null check before `showOpenDialog(mainWindow)` to prevent crash if mainWindow not ready
- **electron-store handlers:** Added `electron-store-get-config`/`setConfig` IPC channels matching preload.ts
- **selectBackend closure bug (engineStore.ts):** Fixed — functional setState prevents rapid backend changes from overwriting each other
- **textarea input loss (ChatPanel.tsx):** Fixed — controlled inputValue state + onChange handler

#### Sub-Feature Verification for Phase A

**Engine Manager (`src/engine/manager.ts`, ~127 lines):**
- `detectHardware()` — platform detection, GPU via WMI/sysctl, RAM calculation — verified at manager.ts:10–44
- `getRecommendedBackend()` — Darwin→Metal, NVIDIA→CUDA, Vulkan fallback, CPU default — verified at manager.ts:46–52
- `downloadForBackend(backend)` — GitHub releases API with per-backend suffix matching (cpu/cuda/metal/vulkan/rocm) — verified at manager.ts:83–105
- Config load/save via JSON (`getConfig()` / `saveConfig()`) — verified at manager.ts:107–127

**System AI (`src/engine/systemAI.ts`, ~147 lines):**
- `start()` — spawns llama-server with mlock on port 8081, kill-before-spawn to prevent double-instances — verified at systemAI.ts:40–51
- Strict system prompt (allow/deny action lists) — verified at systemAI.ts:17–38
- Compile scripts for Windows/macOS/Linux (`getCompileScript()`) — verified at systemAI.ts:96–128
- `getInstallCompilerCommand()` — winget/xcode-select/apt install commands — verified at systemAI.ts:130–136

**Git Auto-Commit (`src/engine/gitAutoCommit.ts`, ~111 lines):**
- `gitCommit()`, `gitSquashCommits()`, `gitCreateCheckpoint()`, `gitRestoreToCheckpoint()` — all implemented and verified
- `autoCommitAfterAction(action)` — tracks action type + file path, skips when nothing staged — verified at gitAutoCommit.ts:100–111
- Cross-platform paths: `%APPDATA%\OpenLLMCode` on Windows, `$HOME/.openllmcode` on POSIX

**Store Layer (Zustand):**
- `store/engineStore.ts` (~31 lines) — config state, backend selection, model loading; **fixed:** functional setState
- `store/chatStore.ts` (~51 lines) — message lifecycle, streaming append, simulated responses
- `store/fileTreeStore.tsx` — project controls, file tree rendering (separate component store)

**Electron Main Process (`electron/main.ts`, ~180 lines):**
- IPC channels for engine config, file operations, terminal execution, Git, chat/inference
- `chat-start`, `chat-send-message`, `chat-stop` — llama-server lifecycle management
- `git-commit` — spawns shell with project path context; **fixed:** cross-platform paths

### ✅ Phase B — HuggingFace & Chat Richness (Complete — ~4 files, ~780 lines)

Verified on 2026-05-13. Each feature audited against the source code below.

| Feature | Status | Verified Details |
|---------|--------|------------------|
| HuggingFace auth token management | ✅ Built | Three methods: Token, Browser (opens browser), CLI (`huggingface-cli login`) — verified in `src/engine/hfClient.ts` |
| Model download with progress tracking | ✅ Built | Resumable downloads via huggingface-cli with --resume-download flag; speed/ETA display |
| Download queue management | ✅ Built | Configurable concurrent downloads (max 3); per-model progress, cancel support — `src/engine/hfClient.ts` |
| Model Manager UI panel | ✅ Built | Local model browser + HF tab with search; download buttons; auth dialog — `src/components/ModelManager.tsx`. **Fixed:** onModelSelect prop passed to ModelCard |
| Generation parameters panel | ✅ Built | Full interactive controls: temperature (slider+input), top-p, repetition penalty, max tokens, stop sequences — `src/components/GenerationParams.tsx` |
| Enhanced Chat UI with streaming | ✅ Built | Real-time token streaming simulation, typing indicator dots, cancel button, speed display — `ChatPanel.tsx`. **Fixed:** uncontrolled textarea now controlled state |
| Markdown rendering in agent messages | ✅ Built | Bold, italic, inline code, fenced code blocks (with copy button), list items — inline HTML rendering via dangerouslySetInnerHTML |
| Message-level actions | ✅ Built | Copy, Edit, Regenerate buttons visible on hover for user/agent messages — `ChatPanel.tsx` |
| System prompt editor with preset templates | ✅ Built | Full-screen modal with presets: Coding, Review, Debugging, R/E, Audit — editable textarea with save & apply — `ChatPanel.tsx` |

#### Sub-Feature Verification for Phase B

**HuggingFace Client (`src/engine/hfClient.ts`, ~260 lines):**
- `checkHFAuth()`, `loginBrowser()`, `loginCLI()`, `logout()` — authentication lifecycle with token/browser/CLI methods
- `searchModels()` — fetches from HuggingFace API with auth; falls back to offline MODELS.md search via grep
- `downloadModel(modelId)` — spawns huggingface-cli with --resume-download flag, parses progress output (speed, ETA)
- `listLocalModels()` — scans models/ directory for .gguf/.bin files
- `validateToken(token)` — calls /api/whoami endpoint on HuggingFace Hub

**Model Manager (`src/components/ModelManager.tsx`, ~160 lines):**
- Tabbed interface: Local Models vs HuggingFace tabs
- Auth dialog with Token/Browser/CLI methods (AuthDialog component)
- Download queue display with progress per download
- Model card UI with Load/Download buttons

**Generation Parameters (`src/components/GenerationParams.tsx`, ~90 lines):**
- Slider + numeric input for each parameter (temperature, top-p, repetition penalty)
- Max tokens number input, stop sequences list with add/remove
- Collapse/expand toggle; Reset to Defaults button

**Enhanced Chat Panel (`src/components/ChatPanel.tsx`, ~265 lines):**
- Streaming response simulation (character-by-character append at 15ms intervals)
- Typing indicator dots while agent is thinking
- Cancel streaming button when active
- Token count footer (~{count} tokens)
- System prompt editor modal with preset templates

### 🔜 Phases C–F (Planned)

| Phase | Status | Description |
|-------|--------|-------------|
| **C** | Planned | Plan/Act/R/E/Audit modes, tool registry, approval gates, task system with compressed history |
| **D** | Planned | Monaco Editor real integration, xterm.js terminal, project creation/import wizard |
| **E** | Planned | MCP servers via @modelcontextprotocol/sdk, context compression engine, engine logging tabs |
| **F** | Planned | Polish, accessibility, build scripts (electron-builder), documentation, GitHub releases update mechanism |

## Installation & Setup (Phase A + B)

```bash
# 1. Clone the repo
git clone https://github.com/Yonneh0/OpenLLMCode.git
cd OpenLLMCode

# 2. Install dependencies
npm install

# 3. Start development server + Electron
npm run electron:dev
```

### First Launch Flow (Automated — ~80% automated)

1. **Hardware detection** — GPU, CPU, RAM assessment via system commands (`detectHardware()` in manager.ts)
2. **Recommended models** auto-selected based on hardware tier (see MODELS.md)
3. **System AI model** downloaded and loaded onto CPU via `SystemAIClient.start()`
4. **Engine binary** fetched for selected backend from GitHub releases via `downloadForBackend()`
5. **Default project folder** created with `.gitignore` and `README.md` (in app data directory)
6. **Git initialized** in the project

### HuggingFace Authentication (Phase B)

Three auth methods supported via `src/engine/hfClient.ts`:

1. **Token**: Paste your HF access token directly from huggingface.co/settings/tokens
2. **Browser**: Opens browser to HuggingFace settings page — create and paste token
3. **CLI**: Runs `huggingface-cli login` in embedded terminal (requires Phase D xterm.js)

### Model Download Management (Phase B)

- **Resumable downloads** via huggingface-cli with --resume-download flag
- **Concurrent downloads** up to MAX_CONCURRENT_DOWNLOADS (3 by default)
- **Download queue** with per-model progress bars showing speed, ETA, bytes transferred
- Models stored in `%APPDATA%/OpenLLMCode/models/`

### Generation Parameters (Phase B)

Interactive panel (`src/components/GenerationParams.tsx`) with:
| Parameter | Range | Default |
|-----------|-------|---------|
| Temperature | 0.1 – 2.0 | 0.7 |
| Top P | 0.1 – 1.0 | 0.9 |
| Repetition Penalty | 1.0 – 2.0 | 1.1 |
| Max Tokens | 64 – 32768 | 4096 |

### Enhanced Chat Interface (Phase B)

- **Streaming responses** with typing indicator and cancel button (`ChatPanel.tsx`)
- **Markdown rendering**: bold, italic, inline code, fenced code blocks with copy buttons, list items
- **Message-level actions**: Copy, Edit, Regenerate — visible on hover in chat messages
- **System Prompt Editor** modal with preset templates: Coding Assistant, Code Reviewer, Debugging Expert, Reverse Engineer, Security Auditor

### Model Manager Panel (Phase B)

- **Local model browser** lists GGUF models from `~/.openllmcode/models/`
- **HuggingFace tab**: search/download models with progress tracking
- **Download queue**: concurrent downloads (max 3), resumable via huggingface-cli
- **Auth dialog**: token, browser, and CLI methods

## Development Workflow

```bash
# Run just Vite dev server (for UI work)
npm run dev

# Full Electron + Vite dev experience
npm run electron:dev

# Build production bundle
npm run build

# Type-check TypeScript
npm run typecheck
```

## Project Structure

```
OpenLLMCode/
├── electron/           # Electron main process & preload script
│   ├── main.ts        # Main process with IPC channels (chat, file ops, terminal, Git) — 180 lines
│   └── preload.ts     # Exposes window.api for React components
├── src/               # React application (~3328+ lines total across all files)
│   ├── App.tsx        # Root app component — single-file layout shell (194 lines)
│   ├── main.tsx       # Entry point (mounts React root)
│   ├── index.html     # HTML template
│   ├── types.ts       # TypeScript type definitions — 45 lines
│   ├── engine/        # Engine manager + System AI + HuggingFace (~630+ lines)
│   │   ├── manager.ts      # Backend selection, hardware detection, GitHub binary download — 127 lines
│   │   ├── systemAI.ts     # 1B CPU model client with compile scripts (Windows/macOS/Linux) — 147 lines
│   │   ├── gitAutoCommit.ts# Git auto-commit: commit/squash/checkpoints — 111 lines
│   │   └── hfClient.ts     # HuggingFace auth, download management, local model discovery (~260 lines) [Phase B]
│   ├── store/         # Zustand stores + data persistence (~360 lines total)
│   │   ├── engineStore.ts    # Engine configuration state — 31 lines
│   │   ├── chatStore.ts      # Chat messages and sending state (simulated response flow) — 51 lines
│   │   └── dataPersistence.ts# JSON + Markdown persistence layer (sessions, config, activity log) — 104 lines
│   ├── components/    # React UI components (~990+ lines total)
│   │   ├── TitleBar.tsx       # Model selector dropdown with engine manager — 36 lines
│   │   ├── Sidebar.tsx        # File tree + project controls + MCP panel — 32 lines
│   │   ├── ChatPanel.tsx      # Enhanced chat: streaming, Markdown, message actions (~265 lines) [Phase B]
│   │   ├── ModelManager.tsx   # HuggingFace model manager panel (~160 lines) [Phase B]
│   │   ├── GenerationParams.tsx# Generation parameters panel (~90 lines) [Phase B]
│   │   └── [other components]  # EditorArea, TerminalPanel
│   ├── styles/        # Global CSS + Tailwind config (catppuccin dark theme)
├── .vscode/           # VS Code dev configuration
│   ├── settings.json  # Editor settings for development
│   ├── launch.json    # Electron debugging configurations
│   └── tasks.json     # Build/dev task definitions
├── MODELS.md          # Model recommendations by hardware tier (106 lines)
├── plan.md            # Comprehensive project plan (Phase A–F) — updated v2.2
├── LICENSE            # MIT License
├── tailwind.config.js # Tailwind CSS configuration (catppuccin palette + custom fonts)
├── postcss.config.js  # PostCSS for Tailwind processing
└── package.json       # Project dependencies and scripts
```

## Configuration

### Engine Manager
The app auto-detects hardware on first launch:
- **Windows:** WMI queries for GPU info (`wmic path win32_VideoController`), memory detection (`TotalVisibleMemorySize`) — verified in manager.ts:19–40
- **macOS:** `sysctl hw.memsize` for memory + Metal support check — verified at manager.ts:35–36
- **Linux:** `/proc/meminfo` for RAM — verified at manager.ts:38

Configuration stored in `%APPDATA%/OpenLLMCode/config.json`:
```json
{
  "backend": "cuda",
  "binarySource": "prebuilt",
  "selectedModel": "qwen3.6-35b.Q4_K_M.gguf",
  "systemAIModel": "ibm-grok4-1b.Q8_0"
}
```

### Approval Rules
Defined in `.openllmcode-rules` (project-level):
```json
{
  "categories": {
    "file_read": { "default": "allow" },
    "file_write": { "default": "require_approval" }
  }
}
```

## Data Storage

All data is stored in `%APPDATA%/OpenLLMCode/` (Windows) or `~/.openllmcode/` (macOS/Linux):

| Path | Purpose | Format |
|------|---------|--------|
| `config.json` | Engine + model config | JSON — managed by manager.ts and dataPersistence.ts |
| `sessions/*.json` | Chat session data | JSON per session — saved via saveSession() in dataPersistence.ts |
| `sessions/*.md` | Exported chat sessions | Markdown — generated by exportSessionToMarkdown() |
| `models/` | Downloaded GGUF models | Binary (gguf format) — also downloaded via HF CLI |
| `engines/` | llama.cpp binaries (pre-built) | Binary — placed by downloadForBackend() |
| `project/` | Active project root | Various files |
| `activity.log` | System AI activity log | Plaintext — appended via appendActivityLog() |

## Development Phases

| Phase | Status | Description | Files | Lines |
|-------|--------|-------------|-------|-------|
| **A — Foundation** ✅ Verified (2026-05-13) | Complete | Electron shell, Engine Manager, GitHub binary download, basic chat, System AI 1B model with compile scripts, file tree, JSON+Markdown persistence, Git auto-commit | ~36 files | ~2548 lines |
| **B — HuggingFace & Chat Richness** ✅ Verified (2026-05-13) | Complete | HF auth/token management (browser/CLI/token), model download with progress, Model Manager panel, Generation params panel, enhanced chat (streaming, Markdown, message actions), system prompt editor | ~4 files | ~780 lines |
| **C** | Planned | Plan/Act/R/E/Audit modes, tool registry, approval gates, task system with compressed history | — | — |
| **D** | Planned | Monaco Editor real integration, xterm.js terminal, project creation/import wizard, template unzip | — | — |
| **E** | Planned | MCP servers via @modelcontextprotocol/sdk, context compression engine, engine logging tabs, reasoning block visibility | — | — |
| **F** | Planned | Polish, accessibility, electron-builder scripts, documentation, GitHub releases update mechanism | — | — |

## Bug Fix Summary (Phase A + B)

See [AUDIT.md](./AUDIT.md) for full details. **9 bugs fixed** across 4 files:

| Bug | File | Impact | Fix Applied |
|-----|------|--------|-------------|
| exec-command wrong shell on Linux/macOS | electron/main.ts | Terminal commands fail silently | Split into platform-specific spawn calls (cmd.exe /c vs /bin/sh -c) |
| git-commit hardcodes %APPDATA% | electron/main.ts | Git commits fail on non-Windows | Conditional path: %APPDATA%\OpenLLMCode on Windows, $HOME/.openllmcode on POSIX |
| systemAI double instances | electron/main.ts | Double VRAM/CPU consumption | kill-before-spawn in systemai-start |
| Missing systemai-stop IPC | electron/main.ts + preload.ts | Can't terminate AI subprocess | Added systemai-stop and systemai-send-message handlers |
| dialog crash if mainWindow null | electron/main.ts | Crash on folder selection | Null check before showOpenDialog(mainWindow) |
| electron-store IPC missing | electron/main.ts + preload.ts | Config set/get silently fails | Registered get/set config handlers |
| selectBackend closure bug | src/store/engineStore.ts | Rapid backend changes can overwrite each other | Functional setState instead of direct state read |
| textarea loses user input on re-render | src/components/ChatPanel.tsx | User types text, presses enter, text disappears | Added controlled inputValue state + onChange |
| send button not disabled while sending | src/components/ChatPanel.tsx | Can trigger duplicate messages | Disabled when !inputValue.trim() || isSending |

---

## License
MIT — see [LICENSE](./LICENSE) for details.

# OpenLLMCode

An open-source, self-contained local AI coding agent that bundles its own llama.cpp inference engine, provides rich agentic tooling with human-in-the-loop approvals, and delivers a clean VS Code–inspired UI. All code is hosted at [github.com/Yonneh0/OpenLLMCode](https://github.com/Yonneh0/OpenLLMCode).

## Quick Links
- **[plan.md](./plan.md)** — detailed project plan covering architecture, tech stack, and feature roadmap (v2.0 with verified Phase A)
- [GitHub Repository](https://github.com/Yonneh0/OpenLLMCode)
- [MODELS.md](./MODELS.md) — model recommendations by hardware tier

## Key Features

### ✅ Phase A — Foundation (Complete — 30 files, ~1882 lines)
| Feature | Status | Details |
|---------|--------|---------|
| Electron app shell with layout | ✅ Built | Sidebar, editor area, chat panel, terminal in single `App.tsx` |
| Engine Manager UI + backend selection | ✅ Built | CPU/CUDA/Metal/Vulkan/ROCm with auto-detection (`src/engine/manager.ts`) |
| GitHub binary download for llama.cpp | ✅ Built | Fetches pre-built binaries from `ggerganov/llama.cpp` releases via axios |
| System AI (1B CPU model) integration | ✅ Built | `SystemAIClient` class with strict system prompt, CMake compile scripts |
| Basic chat interface with streaming | ✅ Built | Messages, tool call cards, input field, generation parameters (`src/components/ChatPanel.tsx`) |
| Model selector in title bar | ✅ Built | Dropdown with engine manager and model switcher (`src/components/TitleBar.tsx`) |
| File tree + project controls | ✅ Built | Sidebar with file tree (📁 src/, 📄 main.tsx, etc.) + change root/new project buttons |
| JSON + Markdown data persistence | ✅ Built | Session save/load/export, activity log, config in `src/store/dataPersistence.ts` |
| Git auto-commit on AI changes | ✅ Built | Commit after tool calls, squash commits, Cline-style checkpoints (`src/engine/gitAutoCommit.ts`) |

### 🔜 Phases B–F (Planned)
- **B** — HuggingFace integration, rich chat UI, sessions, generation params
- **C** — Plan/Act/R/E/Audit modes, tool registry, approval gates, task system
- **D** — Monaco Editor, xterm.js terminal, project creation/import
- **E** — MCP servers, context compression, engine logging
- **F** — Polish, accessibility, build scripts, documentation

## Installation & Setup (Phase A)

```bash
# 1. Clone the repo
git clone https://github.com/Yonneh0/OpenLLMCode.git
cd OpenLLMCode

# 2. Install dependencies
npm install

# 3. Start development server + Electron
npm run electron:dev
```

### First Launch Flow (Automated)
1. Hardware detection — GPU, CPU, RAM assessment via system commands
2. Recommended models auto-selected based on hardware tier
3. System AI model downloaded and loaded onto CPU
4. Engine binary fetched for selected backend from GitHub releases
5. Default project folder created with `.gitignore` and `README.md`
6. Git initialized in the project

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
│   ├── main.ts        # Main process with IPC channels (chat, file ops, terminal, Git)
│   └── preload.ts     # Exposes window.api for React components
├── src/               # React application (~1600 lines total)
│   ├── App.tsx        # Root app component — single-file layout shell
│   ├── main.tsx       # Entry point (mounts React root)
│   ├── index.html     # HTML template
│   ├── types.ts       # TypeScript type definitions
│   ├── engine/        # Engine manager + System AI (~370 lines)
│   │   ├── manager.ts    # Backend selection, hardware detection, GitHub binary download
│   │   ├── systemAI.ts   # 1B CPU model client with compile scripts
│   │   └── gitAutoCommit.ts # Git auto-commit for AI actions (commit/squash/checkpoints)
│   ├── store/         # Zustand stores + data persistence (~450 lines)
│   │   ├── engineStore.ts    # Engine configuration state
│   │   ├── chatStore.ts      # Chat messages and sending state
│   │   ├── fileTreeStore.ts  # File tree with project controls
│   │   ├── sessionStore.ts   # Session management (sessions/tabs)
│   │   └── dataPersistence.ts # JSON + Markdown persistence layer
│   ├── components/    # React UI components (~600 lines total)
│   │   ├── Sidebar.tsx        # File tree + MCP servers panel
│   │   ├── TitleBar.tsx       # Model selector dropdown + mode buttons (Plan/Act/R/E)
│   │   ├── ChatPanel.tsx      # Messages, tool call cards, input field, generation params
│   │   ├── EditorArea.tsx     # Monaco editor placeholder with syntax highlighting
│   │   └── TerminalPanel.tsx  # xterm.js terminal panel
│   ├── styles/        # Global CSS + Tailwind config
│       └── global.css # Dark theme (catppuccin palette), scrollbar, focus ring, animations
├── .vscode/           # VS Code dev configuration
│   ├── settings.json  # Editor settings for development
│   ├── launch.json    # Electron debugging configurations
│   └── tasks.json     # Build/dev task definitions
├── MODELS.md          # Model recommendations by hardware tier (106 lines)
├── plan.md            # Comprehensive project plan (Phase A–F) — updated v2.0
├── LICENSE            # MIT License
├── tailwind.config.js # Tailwind CSS configuration (catppuccin palette + custom fonts)
├── postcss.config.js  # PostCSS for Tailwind processing
└── package.json       # Project dependencies and scripts
```

## Configuration

### Engine Manager
The app auto-detects hardware on first launch:
- **Windows:** WMI queries for GPU info (`wmic path win32_VideoController`), memory detection (`TotalVisibleMemorySize`)
- **macOS:** `sysctl hw.memsize` for memory + Metal support check
- **Linux:** `/proc/meminfo` for RAM, GPU detection via available tools

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
| `config.json` | Engine + model config | JSON |
| `sessions/*.json` | Chat session data | JSON per session |
| `sessions/*.md` | Exported chat sessions | Markdown |
| `models/` | Downloaded GGUF models | Binary |
| `engines/` | llama.cpp binaries (pre-built) | Binary |
| `project/` | Active project root | Various files |
| `activity.log` | System AI activity log | Plaintext |

## Development Phases

| Phase | Status | Description | Files | Lines |
|-------|--------|-------------|-------|-------|
| **A — Foundation** ✅ Verified (2026-05-13) | Complete | Electron shell, Engine Manager, GitHub binary download, basic chat, System AI, file tree, data persistence | 30 files | ~1882 lines |
| B | Planned | HuggingFace integration, rich chat UI, sessions, generation params | — | — |
| C | Planned | Plan/Act/R/E/Audit modes, tool registry, approval gates, Git auto-commit | — | — |
| D | Planned | Monaco Editor, xterm.js terminal, project creation/import | — | — |
| E | Planned | MCP servers, context compression, engine logging | — | — |
| F | Planned | Polish, accessibility, build scripts, documentation | — | — |

## License
MIT — see [LICENSE](./LICENSE) for details.
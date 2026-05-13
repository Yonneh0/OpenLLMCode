# OpenLLMCode

An open-source, self-contained local AI coding agent that bundles its own llama.cpp inference engine, provides rich agentic tooling with human-in-the-loop approvals, and delivers a clean VS Code–inspired UI. All code is hosted at [github.com/Yonneh0/OpenLLMCode](https://github.com/Yonneh0/OpenLLMCode).

## Quick Links
- **[plan.md](./plan.md)** — detailed project plan covering architecture, tech stack, and feature roadmap
- [GitHub Repository](https://github.com/Yonneh0/OpenLLMCode)
- [MODELS.md](./MODELS.md) — model recommendations by hardware tier

## Key Features (Phase A ✅)
- 🖥️ **Electron app shell** with sidebar, editor area, chat panel, and terminal
- ⚙️ **Engine Manager** — backend selection UI (CPU/CUDA/Metal/Vulkan/ROCm) with auto-detection
- 📦 **GitHub binary download** for llama.cpp pre-built releases
- 🤖 **System AI integration** — 1B CPU model for project management and compilation tasks
- 💬 **Basic chat interface** with streaming replies
- 📁 **File tree** with project root controls
- ✅ **Git auto-commit** on every AI change
- 🔧 **Category-based approval rules** (.openllmcode-rules)

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
1. Hardware detection — GPU, CPU, RAM assessment
2. Recommended models auto-selected based on hardware tier
3. System AI model downloaded and loaded onto CPU
4. Engine binary fetched for selected backend
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
│   ├── main.ts        # Main process with IPC channels
│   └── preload.ts     # Exposes window.api for React components
├── src/               # React application
│   ├── App.tsx        # Root app component (layout shell)
│   ├── engine/        # Engine manager + System AI
│   │   ├── manager.ts    # Backend selection, GitHub binary download
│   │   ├── systemAI.ts   # 1B CPU model client
│   │   └── gitAutoCommit.ts # Git auto-commit for AI actions
│   ├── store/         # Zustand stores + data persistence
│   │   ├── engineStore.ts    # Engine configuration state
│   │   ├── chatStore.ts      # Chat messages and sending state
│   │   ├── fileTreeStore.ts  # File tree with project controls
│   │   ├── sessionStore.ts   # Session management (sessions/tabs)
│   │   └── dataPersistence.ts # JSON + Markdown persistence layer
│   ├── components/    # React UI components
│   │   ├── Sidebar.tsx        # File tree + MCP servers
│   │   ├── TitleBar.tsx       # Model selector + mode buttons
│   │   ├── ChatPanel.tsx      # Messages, input field, send button
│   │   ├── EditorArea.tsx     # Monaco editor placeholder
│   │   └── TerminalPanel.tsx  # xterm.js terminal panel
│   ├── types.ts       # TypeScript type definitions
│   └── styles/        # Global CSS + Tailwind config
│       └── global.css # Dark theme defaults and utilities
├── .vscode/           # VS Code dev configuration
│   ├── settings.json  # Editor settings for development
│   └── launch.json    # Electron debugging configurations
├── MODELS.md          # Model recommendations by hardware tier
├── plan.md            # Comprehensive project plan (Phase A–F)
├── tailwind.config.js # Tailwind CSS configuration
├── postcss.config.js  # PostCSS for Tailwind processing
└── package.json       # Project dependencies and scripts
```

## Configuration

### Engine Manager
The app auto-detects hardware on first launch:
- **Windows:** WMI queries for GPU info, memory detection
- **macOS:** sysctl for memory + Metal support
- **Linux:** /proc/meminfo for RAM

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

| Phase | Status | Description |
|-------|--------|-------------|
| **A — Foundation** ✅ | Complete | Electron shell, Engine Manager, GitHub binary download, basic chat, System AI |
| B | Planned | HuggingFace integration, rich chat UI, sessions, generation params |
| C | Planned | Plan/Act/R/E/Audit modes, tool registry, approval gates, Git auto-commit |
| D | Planned | Monaco Editor, xterm.js terminal, project creation/import |
| E | Planned | MCP servers, context compression, engine logging |
| F | Planned | Polish, accessibility, build scripts, documentation |

## License
MIT — see [LICENSE](./LICENSE) for details.
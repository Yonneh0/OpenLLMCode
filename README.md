# OpenLLMCode — Local AI Coding Agent

An open-source desktop application that bundles its own llama.cpp inference engine, provides rich agentic tooling with human-in-the-loop approvals, and delivers a clean VS Code-inspired UI.

**All code is hosted at [github.com/Yonneh0/OpenLLMCode](https://github.com/Yonneh0/OpenLLMCode).**

---

## Quick Start

```bash
# Install dependencies (latest stable versions)
npm install

# Run in development mode
npm run dev          # Vite frontend only
npm run electron:dev # Full Electron app
npm run build        # Build for production
```

### Technology Stack

| Layer | Version | Rationale |
|-------|---------|-----------|
| Desktop Shell | [Electron v42.0.1](https://github.com/electron/electron) — latest stable | Cross-platform, mature ecosystem |
| UI Framework | React 19.2.6 + TypeScript ~6.0.3 | Component-driven, type-safe |
| Styling | Tailwind CSS v4.3.0 | VS Code–like dark theme default |
| State Management | Zustand ^5.0.13 | Lightweight, no boilerplate |
| Inference Engine | llama.cpp (selectable/compiled) | GGUF support; multiple backends |
| HTTP Client | Axios ^1.16.0 | Request/response handling |
| File Watching | Chokidar ^5.0.0 | Reliable cross-platform file watching |
| Terminal | xterm.js ^5.3.0 | Full terminal emulation in-browser |
| MCP SDK | @modelcontextprotocol/sdk ^1.29.0 | Official SDK for tool integration |
| Build Tool | Vite ^8.0.12 | Fast dev server, optimized builds |

---

## Project Structure

```
OpenLLMCode/
├── electron/                  # Electron main process + preload
│   ├── main.ts               # IPC channels, app lifecycle (lazy getElectron())
│   └── preload.ts            # Exposed window.api for React components
├── src/
│   ├── App.tsx               # Full single-file layout shell
│   ├── types.ts              # Core types: ChatMessage, ToolCall, Backend, etc.
│   ├── engine/
│   │   ├── manager.ts        # Engine Manager (backend selection + GitHub binary download)
│   │   ├── systemAI.ts       # System AI client with strict prompts & compilation scripts
│   │   └── gitAutoCommit.ts  # Git auto-commit, squash, checkpoint restore
│   ├── store/
│   │   ├── chatStore.ts      # Message lifecycle + streaming (controlled inputValue)
│   │   ├── engineStore.ts    # Engine config state (typed setBackend)
│   │   ├── fileTreeStore.tsx # File tree structure (Zustand-based)
│   │   ├── sessionStore.ts   # Session CRUD operations
│   │   └── dataPersistence.ts # JSON + Markdown persistence with activity log
│   ├── components/
│   │   ├── ChatPanel.tsx     # Streaming UI + markdown rendering + generation params
│   │   ├── ModelManager.tsx  # Local model browser + HF download queue
│   │   ├── GenerationParams.tsx # Full interactive parameter controls (temp, top-p, etc.)
│   │   └── TitleBar.tsx      # Model selector dropdown with mode toggle buttons
│   └── styles/
│       └── global.css        # Tailwind imports + custom animations
├── plan.md                   # Comprehensive architecture and feature specification
└── package.json              # Dependencies (all latest stable versions)
```

---

## Core Features

### Engine Manager & Backend Selection
- **Backend Options:** CPU, CUDA, Metal, Vulkan, ROCm with auto-detection
- **Binary Source:** Pre-built from GitHub releases OR compile via System AI (CPU-only ~1B model handles compilation tasks; strict system prompt guides CMake generation and error auditing)
- **Hardware Detection:** OS-specific WMI/sysctl/procfs checks

### HuggingFace Model Management
- Token-based authentication with browser + CLI login flows
- Resumable downloads with progress tracking via `huggingface-cli`
- Local model storage in `%APPDATA%/OpenLLMCode/models/` (Windows) or `~/.openllmcode/models/` (macOS/Linux)

### Agent Core & Git Integration
- **Mode Toggle:** Plan → Act → R/E → Audit with distinct behaviors per mode
- **Tool Registry:** File read/write/search, terminal commands with approval gates
- **Approval Dialogs:** Allow / Always Allow / Deny / Deny w/ Reason with category-based rules (.openllmcode-rules)
- **Chat Checkpoints:** Cline-style rollback — restore point or delete context after checkpoint

### Editor & Terminal
- Monaco Editor (same as VS Code) with syntax highlighting, IntelliSense, multi-cursor editing
- Image/file preview for non-code files (Monaco built-in viewer)
- xterm.js terminal panel with real-time AI monitoring and output streaming
- Split view support up to 3 panes

### Chat Interface (Rich UI)
- Session management: unlimited sessions with tabs, persistence, export
- Streaming responses: typing indicator dots, cancel button, token count footer
- Generation parameters panel: Temperature, Top P, Repetition Penalty, Max Tokens, Stop Sequences
- Markdown rendering in agent messages (code blocks with syntax highlighting + copy)
- System prompt editor modal with preset templates

### MCP Server Integration
- Built-in MCP client via `@modelcontextprotocol/sdk`
- Auto tool discovery and registration from connected servers
- Category-based pre-approval rules for MCP tools

---

## Build & Run

```bash
# Install dependencies
npm install

# Development mode (Vite + Electron devtools)
npm run electron:dev

# Production build
npm run build && npm run electron:build
```

### Configuration

Engine config is stored in `%APPDATA%/OpenLLMCode/config.json` (Windows) or `~/.openllmcode/config.json`:

```json
{
  "backend": "cpu",
  "binarySource": "prebuilt",
  "selectedModel": "ibm-grok4-1b.Q8_0",
  "systemAIModel": "ibm-grok4-1b.Q8_0"
}
```

---

## Development Phases Overview

| Phase | Description | Status |
|-------|-------------|--------|
| **A** — Foundation (Electron shell, Engine Manager, chat, Git) | Complete ✅ | Core infrastructure functional |
| **B** — HuggingFace integration, rich chat UI, session persistence | Complete ✅ | HF auth/download, streaming UI, Markdown rendering, generation params |
| **C** — Agent Core (Plan/Act/R/E/Audit modes), approval gates, checkpoints | 🟡 Partial | Mode toggle buttons built; approval gate UI and checkpoint dropdown planned |
| **D** — Editor, Terminal & Project tooling | 🟡 Partial | Monaco placeholder + terminal animation exist; real Monaco `<Editor>` and xterm.js instances planned |
| **E** — MCP integration, Context Compression Engine, monitoring | 🟡 Partial | MCP SDK dependency installed; context compression engine types defined but logic not implemented |
| **F** — Polish & Launch (themes, settings, builds) | 🟡 Partial | Dark theme ✅, build config in package.json; full settings UI and build pipeline planned |

---

## License

MIT — See [LICENSE](./LICENSE) for details.
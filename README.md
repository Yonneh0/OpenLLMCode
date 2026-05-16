# OpenLLMCode — Local AI Coding Agent

An open-source, local-first AI coding agent that bundles its own llama.cpp inference engine, provides built-in HuggingFace model downloading with modern authentication, and delivers agentic capabilities (file editing, terminal execution, MCP tool integration) with transparent approval gates. Built-in Git tracking gives every change automatic version control. All code is hosted at [github.com/Yonneh0/OpenLLMCode](https://github.com/Yonneh0/OpenLLMCode).

---

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode (Vite + Electron)
npm run electron:dev

# Build for production
npm run build && npm run electron:build
```

### Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|----------|
| Desktop Shell | Electron + Vite | Cross-platform, mature ecosystem |
| UI Framework | React + TypeScript | Component-driven, type-safe |
| Styling | Tailwind CSS | VS Code–like dark theme default (catppuccin palette) |
| State Management | Zustand | Lightweight, no boilerplate |
| Inference Engine | llama.cpp | GGUF support; multiple backends |
| HTTP Client | Axios | Request/response handling |
| File Watching | Chokidar | Reliable cross-platform file watching |
| Terminal | xterm.js + node-pty | Full terminal emulation with PTY streaming and auto-resize |
| Editor | Monaco Editor | Same editor as VS Code (catppuccin theme) |
| MCP SDK | @modelcontextprotocol/sdk | Official SDK for tool integration |

---

## Architecture

```
┌───────────────────────────────────────────────┐
│              OpenLLMCode App                    │
│          ┌──────┬──────┬────────┬─────────┐   │
│          │Sidebar│Editor │ Chat  │Terminal │   │
│          │(File/ │(Code  │Panel) │(PTY)    │   │
│          │Skills │View)  │        │         │   │
│          └──────┴──────┴────────┴─────────┘   │
│                                               │
│     Agent Core (Plan/Act/R/E modes, tool      │
│     registry, approval gates, context        │
│     compression engine)                       │
│                                               │
│  llama.cpp ↔ Engine Manager ←→ MCP Servers    │
│         ↕                                   ↕   │
│  Git Auto-Commit                     System AI │
└───────────────────────────────────────────────┘
```

---

## Project Structure

```
OpenLLMCode/
├── electron/          — Electron main process + preload
├── src/               — React application code
│   ├── engine/        — Engine manager, HuggingFace client, MCP, Git tools
│   ├── store/         — Zustand state stores
│   └── components/    — UI components (chat, editor, terminal, etc.)
└── package.json       — Dependencies & scripts
```

---

## Core Features

### Engine Manager ✅ Complete
- Backend selection: CPU, AVX2, CUDA, Metal, Vulkan, ROCm with auto-detection
- Binary source: Pre-built from GitHub releases OR compile via System AI
- Config stored in `%APPDATA%/OpenLLMCode/config.json`

### HuggingFace Model Management ✅ Almost Complete (~95%)
- Token-based authentication (browser + CLI login)
- Resumable downloads with progress tracking
- Download queue management — ⚠️ **Not yet wired to ModelManager UI**
- Per-model settings store for context window/GPU layers/thread count

### Agent Core & Git Integration ✅ Complete (100%)
- Mode toggle: Plan → Act → R/E with distinct system prompts per mode
- Tool registry with 13 built-in tools + MCP tool integration
- Approval dialogs with diff preview and destructive operation warnings
- Category-based pre-approval rules via `.openllmcode-rules` file
- Chat checkpoints (Cline-style rollback)
- Task lifecycle: Planning → Executing → Completed/Failed

### Editor & Terminal ✅ Almost Complete (~95%)
- Monaco editor with catppuccin theme, tab bar, auto-save
- xterm.js terminal panel — real PTY via node-pty
- Project creation wizard with 6 built-in templates and repository cloning

### Context Compression Engine 🟡 Partial (~80%)
- Active window keeps bottom 15% of context as-is (minimum 2048 tokens)
- AI-powered compression summarizes early conversation history
- ⚠️ **Not yet auto-wired into chat message assembly** — `generateFullContext()` exists but is never called during chat

### MCP Server Integration 🟡 Partial (~80%)
- Server discovery from `.openllmcode-mcp` config and built-in servers
- Connection management with stdio + SSE/HTTP transport
- Tool registration via `registerMCPToolsWithRegistry()` — MCP tools registered after each server connection
- Health check system with auto-reconnect
- ⚠️ **Auto-reconnect has no UI confirmation**

### Engine Logging ✅ Complete (core + UI wired)
- Session management with timestamped log files and 5MB rotation
- Log entry filtering by level, search query, and source engine
- EngineLoggingPanel UI with tabs, filters, search, start/stop logging buttons

### Agent Skills 🟡 Partial (~60%)
- Full skill discovery/suggestion system exists in `src/engine/skills/`
- Claude Code compatibility layer for `.skill.yaml` files
- ⚠️ **No sidebar panel displays discovered/suggested skills**

### Pingu Avatar 🟡 Partial (~60%)
- Claymation-style penguin mascot with mood-driven animations
- Cursor-following eyes, SVG-based rendering (no video overhead)
- ⚠️ **All 6 menu items are console.log stubs — need real action implementations**

---

## Data Persistence

| Data | Storage | Status | Details |
|------|---------|--------|---------|
| Chat history | Markdown files (.md) | ✅ | Portable session export |
| Session metadata | JSON files (.json) | ✅ | Saved by ID |
| Engine config | JSON config file | ✅ | Selected backend/binary source |
| HuggingFace auth token | Local JSON + optional keytar | ✅ (partial) | OS keychain support via optional keytar |
| MCP server configs | .openllmcode-mcp in project root | ✅ | |
| Engine logs | Plain-text .log files with rotation | ✅ | Timestamped, 5MB rotation limit |

---

## Development Phases Overview

| Phase | Description | Status |
|-------|-------------|--------|
| **A** — Foundation (Electron shell, Engine Manager, chat, Git) | ✅ Complete | 100% |
| **B** — HuggingFace integration, rich chat UI | 🟡 Almost Complete | ~92% |
| **C** — Agent Core (Plan/Act/R/E modes), approval gates, checkpoints | ✅ Complete | 100% |
| **D** — Editor, Terminal & Project tooling | 🟡 Almost Complete | ~95% |
| **E** — MCP integration, Context Compression Engine, monitoring | 🟡 Partial | ~80% |
| **F** — Polish & Launch (themes, settings, builds) | 🟡 Partial | ~75% |
| **G** — Agent Skills + Pingu Avatar | 🟡 Partial | ~60% |

See [plan.md](./plan.md) for remaining work items and priority order.

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

## License

MIT — See [LICENSE](./LICENSE) for details.
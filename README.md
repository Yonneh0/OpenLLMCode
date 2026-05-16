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

| Layer | Version | Rationale |
|-------|---------|-----------|
| Desktop Shell | Electron + Vite | Cross-platform, mature ecosystem |
| UI Framework | React 19 + TypeScript ~6.0.3 | Component-driven, type-safe |
| Styling | Tailwind CSS v4.3.0 | VS Code–like dark theme default (catppuccin palette) |
| State Management | Zustand ^5.0.13 | Lightweight, no boilerplate |
| Inference Engine | llama.cpp b9174 (latest release) | GGUF support; multiple backends |
| HTTP Client | Axios ^1.16.1 | Request/response handling |
| File Watching | Chokidar ^5.0.0 | Reliable cross-platform file watching |
| Terminal | xterm.js ^5.3.0 + node-pty ^1.1.0 + @xterm/addon-fit ^0.11.0 | Full terminal emulation with PTY streaming and auto-resize |
| Editor | Monaco Editor ^0.55.1 + @monaco-editor/react ^4.7.0 | Same editor as VS Code (catppuccin theme) |
| MCP SDK | @modelcontextprotocol/sdk ^1.29.0 | Official SDK for tool integration |

---

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                      OpenLLMCode App                          │
│                     (Electron + React)                        │
│                                                               │
│  ┌─────────────┬──────────────┬──────────────┬─────────────┐  │
│  │   Sidebar   │    Editor    │     Chat     │   Terminal  │  │
│  │             │              │     Panel    │   Panel       │  │
│  │ • File Tree │ • Code View  │ • Messages   │ • Shell      │  │
│  │ • Project   │ • Syntax     │ • Tool Calls │ • AI Tools   │  │
│  │   Controls  │   Highlight  │ • Approvals  │              │  │
│  │ • Agent Skills │ • Minimap    │              │              │  │
│  │ • Git       │              │              │              │  │
│  └─────────────┴──────────────┴──────────────┴─────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                   Agent Core                             │  │
│  │  ┌──────────┬──────────┬──────────┬──────────────────┐   │
│  │  │ Plan/Act │ Task     │ Tool     │ Approval         │   │
│  │  │ /R/E/Aud │ Manager  │ Registry │ Gate System      │   │
│  │  └──────────┴──────────┴──────────┴──────────────────┘   │
│  │  ┌───────────────────────────────────────────────────┐   │
│  │  │ Context Compression Engine                        │   │
│  │  └───────────────────────────────────────────────────┘   │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────────┐  │
│  │  llama.cpp   │◄──►│  Engine      │    │  MCP Client    │  │
│  │  (primary)   │    │  Manager     │    │               │  │
│  └──────────────┘    └──────────────┘                       │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐                        │
│  │  Git         │◄──►│  Auto-Commit │◄──► Every AI action   │
│  └──────────────┘    └──────────────┘     is versioned       │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐                        │
│  │  llama.cpp   │    │  System AI   │◄──► CPU-only, handles  │
│  │              │◄──►│  (1B model)  │     project mgmt       │
│  └──────────────┘    └──────────────┘                        │
└───────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
OpenLLMCode/
├── electron/                  # Electron main process + preload (~680 lines)
│   ├── main.ts               # IPC channels, app lifecycle, PTY terminal, engine logging
│   └── preload.ts            # Exposed window.api for React components (~132 lines)
├── src/
│   ├── App.tsx               # Main layout shell (Sidebar | Editor | Chat | Terminal) (~140 lines)
│   ├── types.ts              # Core TypeScript types — all interfaces (~158 lines)
│   ├── engine/
│   │   ├── manager.ts        # Engine Manager — backend selection + GitHub binary download (~126 lines)
│   │   ├── systemAI.ts       # System AI client (1B CPU model), compile scripts, env setup (~194 lines)
│   │   ├── gitAutoCommit.ts  # Git auto-commit, squash, checkpoint restore, stash (~175 lines)
│   │   ├── toolRegistry.ts   # Tool registry with 10 tools and category-based approval rules (~399 lines)
│   │   ├── hfClient.ts       # HuggingFace API client — auth + download management (~334 lines)
│   │   ├── mcpManager.ts     # MCP server discovery, connection, tool registration (~489 lines)
│   │   ├── contextCompression.ts # Context compression engine (~286 lines)
│   │   └── engineLogger.ts   # Engine logging — session management, log entries, filtering (~380 lines)
│   ├── store/
│   │   ├── chatStore.ts      # Message lifecycle + streaming response (~60 lines)
│   │   ├── engineStore.ts    # Engine config state (~32 lines)
│   │   ├── fileTreeStore.tsx # File tree structure (chokidar watching) (~70+ lines)
│   │   ├── sessionStore.ts   # Session CRUD operations (~80+ lines)
│   │   ├── taskStore.ts      # Task lifecycle + checkpoint CRUD (~227 lines)
│   │   ├── editorStore.ts    # Editor tabs — open/close/update content (~80 lines)
│   │   ├── approvalStore.ts  # Approval gate state management + waitForApproval helper (~140 lines)
│   │   ├── dataPersistence.ts# JSON + Markdown persistence with activity log (~104 lines)
│   │   └── mcpStore.ts       # Zustand store for MCP state (~306 lines)
│   ├── components/           # React UI components
│   │   ├── TitleBar.tsx            # Model selector dropdown with engine manager (~36 lines)
│   │   ├── Sidebar.tsx             # Sidebar: project controls, file tree, MCP panel (~32 lines)
│   │   ├── ChatPanel.tsx           # Enhanced chat — streaming, Markdown, message actions, system prompt editor (~601 lines)
│   │   ├── GenerationParams.tsx    # Generation parameters panel (temp, top-p, rep penalty, max tokens, stop seqs) (~100 lines)
│   │   ├── ModelManager.tsx        # HuggingFace model manager — local tab + HF tab + AuthDialog (~224 lines)
│   │   ├── ApprovalGate.tsx        # Four-option approval dialog with diff preview, warnings (~197 lines)
│   │   ├── CheckpointPanel.tsx     # Cline-style checkpoint rollback panel (~170 lines)
│   │   ├── TaskPanel.tsx           # Task status display in sidebar (~114 lines)
│   │   ├── MonacoEditor.tsx        # Real Monaco editor — catppuccin theme, tab bar, auto-save (~280 lines)
│   │   ├── XTermTerminal.tsx       # xterm.js PTY terminal with tabs, streaming output (~224 lines)
│   │   ├── ProjectWizard.tsx       # Project creation wizard: empty/template/clone/open folder (~520 lines)
│   │   ├── EngineLoggingPanel.tsx  # Engine logging panel — tabs/filters/search (~280 lines)
│   │   └── McpPanel.tsx            # Live MCP server status display from store state (~67 lines)
│   └── styles/
│       └── global.css        # Tailwind imports + custom animations + catppuccin theme (~94+ lines)
├── plan.md                   # Comprehensive architecture and feature specification
└── package.json              # Dependencies & scripts (~58 lines)
```

---

## Core Features

### Engine Manager & Backend Selection ✅ Complete (100%)

- **Backend Options:** CPU, AVX2, CUDA, Metal, Vulkan, ROCm with auto-detection via WMI/sysctl/procfs
- **Binary Source:** Pre-built from GitHub releases OR compile via System AI — full script-driven compilation with prerequisite detection and error escalation
- **Engine Config:** Stored in `%APPDATA%/OpenLLMCode/config.json` — selectable backend, binary source, selected model

### HuggingFace Model Management ✅ Complete (~95%)

- Token-based authentication with browser + CLI login flows (hfClient.ts:44–83)
- Resumable downloads with progress tracking via `huggingface-cli --resume-download` (hfClient.ts:143–212)
- Download queue management (max 3 concurrent — hfClient.ts:215–238) ⚠️ **Not yet wired to ModelManager UI**
- Local model storage in `%APPDATA%/OpenLLMCode/models/` or `~/.openllmcode/models/`

### Agent Core & Git Integration ✅ Complete (100%)

- **Mode Toggle:** Plan → Act → R/E with distinct system prompts per mode (systemAI.ts:17–38)
- **Tool Registry:** 10 built-in tools — read_file, write_file, create_file, delete_file, run_command, search_files, glob, terminal_run_command, terminal_read_output, terminal_kill_process (toolRegistry.ts)
- **Approval Dialogs:** Four-option dialog — Allow / Always Allow / Deny / Deny w/ Reason with diff preview and destructive operation warnings (ApprovalGate.tsx:197 lines)
- **Category-Based Rules:** `.openllmcode-rules` file for pre-approval patterns on specific file paths (toolRegistry.ts:124–183)
- **Chat Checkpoints:** Cline-style rollback — restore point or delete context after checkpoint (CheckpointPanel.tsx:170 lines)
- **Task Lifecycle:** Planning → Executing → Completed/Failed with plan steps, step completion tracking, auto-squash on completion (taskStore.ts:227 lines + TaskPanel.tsx:114 lines)

### Editor & Terminal ✅ Complete (~95%)

- Monaco Editor — full `<Editor>` component with catppuccin theme, tab bar, auto-save on blur and Ctrl+S keyboard shortcut, syntax highlighting for all major languages (MonacoEditor.tsx:280 lines)
- xterm.js terminal panel — real PTY via node-pty; spawn/write/resize/kill IPC; streaming output via `terminal-data` event with multiple tabs (XTermTerminal.tsx:224 lines)
- Project creation wizard — 4-step wizard with 6 built-in templates (React+TS, Node+Express, Python+FastAPI, Go+Echo, Rust+Axum, .NET API), repository cloning, and open folder options (ProjectWizard.tsx:520 lines)

### Context Compression Engine ✅ Complete (core exists — not wired into chat flow)

- Active window calculation keeps bottom 15% of context as active window with minimum floor of 2048 tokens
- AI-powered compression uses System AI to summarize early conversation history
- Structured offload stores keyDecisions, filesModified, and summaries in CompressedEntry format
- ⚠️ **Not yet wired into chat message assembly** — `generateFullContext()` exists but is never called during chat

### MCP Server Integration 🟡 Partial (~75%) — ⚠️ GAPS REMAINING

- MCP server discovery from `.openllmcode-mcp` config file and built-in servers
- Connection management with stdio transport support
- Tool registration via `getMCPToolNames()` and `callMCPTool()`
- Health check system with per-server timeout and memory limits

**Remaining Gaps:**
1. ⚠️ **MCP tools never registered with agent's tool registry** — the agent cannot use MCP tools until this is wired up
2. ⚠️ **HTTP transport in mcpManager.ts:109–120 is broken** — uses `StdioClientTransport` instead of HTTP transport, will crash at runtime for any MCP server configured with HTTP transport
3. Auto-reconnect on MCP disconnect not implemented

### Engine Logging 🟡 Partial (core exists, UI needs wiring)

- Session management with timestamped log files and 5MB rotation (engineLogger.ts:53–124)
- Log entry management with memory + disk writing at configurable size limits (engineLogger.ts:135–183)
- Log filtering by level (trace/debug/info/warn/error), search query, and source engine (engineLogger.ts:252–276)
- Stdout/stderr handlers parse JSON llama-server output into structured log entries (engineLogger.ts:342–381)
- EngineLoggingPanel UI with tabs, filters, search, start/stop logging buttons (EngineLoggingPanel.tsx:280 lines)
- ⚠️ **Zustand store not wired** — engineLoggerStore.ts is full of placeholders; all methods return null/false without real implementation

---

## Data Persistence

| Data | Storage | Status | Details |
|------|---------|--------|---------|
| Chat history (sessions) | Markdown files (.md) | ✅ | dataPersistence.ts:53–62, portable via exportSessionToMarkdown() |
| Session metadata | JSON files (.json) | ✅ | dataPersistence.ts:34–45 |
| Engine config | JSON config file | ✅ | manager.ts:108–127, selected backend/binary source |
| HuggingFace auth token | Local JSON file | ✅ (partial) | hfClient.ts:44–58 — uses local config instead of OS keychain |
| MCP server configs | .openllmcode-mcp in project root | ✅ | mcpManager.ts:226–246 |
| Engine logs | Plain-text .log files with rotation | ✅ | engineLogger.ts:68–77, timestamped log files with 5MB rotation |
| Activity log (plaintext) | activity.log maintained by System AI | ✅ | dataPersistence.ts:89–92 |

---

## Development Phases Overview

| Phase | Description | Status | Completeness | Details |
|-------|-------------|--------|-------------|---------|
| **A** — Foundation (Electron shell, Engine Manager, chat, Git) | ✅ Complete | 100% | Core infrastructure functional (~36 files, ~2548 lines) |
| **B** — HuggingFace integration, rich chat UI, session persistence | 🟡 Mostly Complete | ~92% | HF auth/download, streaming UI, Markdown rendering ⚠️ Download queue not wired to ModelManager; regenerate button is placeholder |
| **C** — Agent Core (Plan/Act/R/E modes), approval gates, checkpoints | ✅ Complete | 100% | Tool registry with 10 tools, approval dialog, task lifecycle (~12 files, ~970+ lines) |
| **D** — Editor, Terminal & Project tooling | 🟡 Mostly Complete | ~95% | Monaco editor, xterm.js PTY terminal, project wizard ⚠️ Missing: split view, image preview, clone auth options in wizard UI |
| **E** — MCP integration, Context Compression Engine, monitoring | 🔴 Partial | ~70% | Core engine exists but not wired; MCP tools not registered with agent; HTTP transport broken; Zustand store not wired |
| **F** — Polish & Launch (themes, settings, builds) | 🟡 Partial | ~75% | Dark theme ✅, build config in package.json ⚠️ Missing: app update UI, model per-entry settings, OS keychain for HF token |
| **G** — Agent Skills + Pingu Avatar | 🔲 Not Started | 0% | Tree-view skill system with auto-suggestion; claymation penguin avatar with cursor-following eyes/mouth animation |

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
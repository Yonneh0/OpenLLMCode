# OpenLLMCode — Remaining Work Plan

> An open-source, local-first AI coding agent that bundles its own llama.cpp inference engine, provides built-in HuggingFace model downloading with modern authentication, and delivers agentic capabilities (file editing, terminal execution, MCP tool integration) with transparent approval gates. Built-in Git tracking gives every change automatic version control. All code is hosted at [github.com/Yonneh0/OpenLLMCode](https://github.com/Yonneh0/OpenLLMCode).

> ✅ **Core complete:** Phase A (Foundation), C (Agent Core & Git Integration) — 100% done.
> 🟡 **In-progress:** Phases B, D, E, F, G — core exists but some gaps remain. See below for concrete remaining work items.

---

## Remaining Work by Phase

### Phase B — HuggingFace & Chat Richness (~92% complete)

**Remaining items:**
1. **Download queue wired to ModelManager UI** — `hfClient.ts` has download queue logic (lines 215–238) but it's not connected to the ModelManager component. The model manager has a hardcoded dummy token instead of using real auth state.
2. **Regenerate button placeholder** — ChatPanel.tsx line 409 has `TODO: regenerate` comment. Need to implement message regeneration by re-sending the last prompt to the engine with same parameters.

### Phase D — Editor, Terminal & Project Tooling (~95% complete)

**Remaining items:**
1. **Split view support** — Monaco editor tab bar exists but drag-to-split not implemented.
2. **Image preview for non-code files** — PreviewEditor component exists but isn't connected to the Monaco tab system for image rendering.
3. **Repository clone auth options in wizard UI** — ProjectWizard.tsx supports cloning repos but relies on system Git credentials manager. No explicit SSH key/PAT authentication dialog for private repos in the wizard flow.

### Phase E — MCP, Context Compression & Monitoring (~80% complete)

**Remaining items:**
1. **Context compression auto-wiring into chat flow** — `generateFullContext()` exists (contextCompression.ts:191–212) but is never called during message assembly. The System AI should automatically inject compressed context on every new turn, not just manually when triggered.
2. **Auto-reconnect UI confirmation** — mcpManager.ts has healthCheck() with silent auto-reconnect for MCP servers but no user confirmation of success/failure. Need to add toast/notification feedback.

### Phase F — Polish & Launch (~75% complete)

**Remaining items:**
1. **App update check UI** — Engine manager downloads from GitHub releases (manager.ts) but there's no UI for checking app updates, just engine binary updates. Need update notification dialog with release notes and install button.
2. **Model settings per entry connected to UI** — `modelSettingsStore.ts` exists with context window/GPU layers/thread count config per model, but these aren't exposed in any UI panel yet.

### Phase G — Agent Skills + Pingu Avatar (~60% complete)

**Remaining items:**
1. **Skills panel wired into sidebar UI** — Full skill discovery/suggestion system exists in `src/engine/skills/` (discovery.ts, suggestionEngine.ts). Tools can be activated/deactivated via registry. But no sidebar panel displays discovered/suggested skills to the user.
2. **Pingu menu item actions** — PinguAvatar component is rendered in App.tsx with all animations working. All 6 menu items (Agent Skills, Settings, Manage Models, Compile Engine, Activity Log, About Pingu) are `console.log` stubs needing real action implementations.

---

## Priority Order for Remaining Work

1. **P1 — Critical UX gaps:**
   - Phase E: Context compression auto-wiring (loses context on long sessions without it)
   - Phase G: Pingu menu item actions (non-functional, confusing to users)

2. **P2 — Important feature completion:**
   - Phase B: Download queue wired to ModelManager (users can't manage HF downloads from UI)
   - Phase F: Model settings connected to UI (can't adjust per-model parameters)
   - Phase G: Skills panel in sidebar (skills exist but aren't visible/manageable)

3. **P3 — Polish:**
   - Phase E: Auto-reconnect notifications (silent reconnects are confusing)
   - Phase B: Regenerate button (nice-to-have for chat UX)
   - Phase F: App update check UI (maintenance, not blocking)
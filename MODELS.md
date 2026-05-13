# OpenLLMCode — Model Recommendations

> Last verified: 2026-05-13

All models listed are available as GGUF files on HuggingFace and compatible with llama.cpp.  
**Excluded:** "Heretic" variants and "creative" fine-tunes (kept uncensored/abliterated instead).

---

## Starter Models (Suggested at First Launch)

The app will auto-detect your hardware and recommend these:

### System AI (CPU, ~1B params — for project management & compilation)
| Model | Size | Notes |
|-------|------|-------|
| **ibm-grok4-1b.Q8_0** | 780 MB | Default system model. Escalates compile issues to production AI. |

### Primary AI (production coding/reasoning — select by hardware)
| Hardware Tier | Model | VRAM/RAM | Description |
|---------------|-------|----------|-------------|
| **High-end** (24GB+ VRAM, 32GB+ RAM) | **HauhauCS/Qwen3.6-35B-A3B-Claude-4.7-Opus-Reasoning-Distilled-GGUF** | ~20 GB VRAM | Strong reasoning, code generation, and debugging. Based on Qwen3.6-35B-A3B with Claude 4.7 Opus reasoning distillation. |
| **Mid-range** (8–24GB VRAM, 16–32GB RAM) | **Qwen/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive-GGUF** | ~10 GB VRAM | Uncensored, agentic coding. Excellent for open-ended development tasks. |
| **Low-end** (<8GB VRAM or CPU-only) | **Nemotron3-Nano-4B-Uncensored-HauhauCS-Aggressive-Q4_K_M** | ~2–4 GB VRAM / 6+ GB RAM | ⚠️ Requires ≥16 GB system RAM or a GPU suitable for offloading. Highly productive coding AI at small size. Alternative: **microsoft/Phi-3.5-mini-instruct-Q4_K_M.gguf** (~3 GB).

---

## Model Categories — Real HuggingFace GGUF Models

### Qwen3 / Qwen3.6 Family

| Model | Tags | Downloads | License |
|-------|------|-----------|---------|
| **unsloth/Qwen3.6-35B-A3B-GGUF** | Uncensored, Vision, Multilingual | 2.7M+ | Apache 2.0 |
| **HauhauCS/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive-GGUF** | Aggressive uncensoring, Coder-focused | 1.1M+ | Apache 2.0 |
| **hesamation/Qwen3.6-35B-A3B-Claude-4.7-Opus-Reasoning-Distilled-GGUF** | Reasoning distilled from Claude Opus | ~180K | Apache 2.0 |
| **HauhauCS/Qwen3.6-27B-Uncensored-HauhauCS-Aggressive-GGUF** (Q4_K_M) | Smaller variant, uncensored | ~480K | Apache 2.0 |

### Gemma 4 Family

| Model | Tags | Downloads | License |
|-------|------|-----------|---------|
| **HauhauCS/Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-GGUF** (Q8_K_M) | Aggressive uncensoring, Vision+Audio | 940K+ | Gemma |
| **TrevorJS/gemma-4-E4B-it-uncensored-GGUF** | Abliterated, general-purpose | ~100K | Apache 2.0 |
| **HauhauCS/Gemma-4-E2B-Uncensored-HauhauCS-Aggressive-GGUF** | Smaller E2B variant | ~290K | Gemma |

### Nemotron Nano Family

| Model | Tags | Notes |
|-------|------|-------|
| **Nemotron3-Nano-4B-Uncensored-HauhauCS-Aggressive-Q4_K_M** | Uncensored, Abliterated, Coding | Small but productive for code work |
| **NVIDIA/Nemotron-4-340B-Instruct-GGUF** | Larger option when GPU is plentiful | ~7 GB VRAM (FP16), 3.5 GB (Q8) |

### Llama Family

| Model | Tags | Downloads | Notes |
|-------|------|-----------|-------|
| **unsloth/Meta-Llama-3.1-8B-Instruct-GGUF** | Standard, well-tested | 3M+ | Excellent base model |
| **lmstudio-community/Llama-3.1-8B-Instruct-Q5_K_M.gguf** | Q5 quantization | ~400K | Good balance of quality/size |

### Phi Family (Small / CPU-friendly)

| Model | Tags | Downloads | Notes |
|-------|------|-----------|-------|
| **microsoft/Phi-3.5-mini-instruct-Q4_K_M.gguf** | Small, fast, capable | ~600K | Great for <8GB RAM setups |
| **unsloth/phi-3.5-mini-instruct-GGUF** | Larger Phi variant | ~200K | More capability when VRAM allows |

---

## Model Selection Guide by Use Case

| Use Case | Recommended Model(s) |
|----------|---------------------|
| **Heavy reasoning (architecture, debugging)** | Qwen3.6-35B-A3B-Claude-4.7-Opus-Distilled |
| **Open-ended coding (agentic mode)** | Qwen3.6-27B-Uncensored-HauhauCS-Aggressive |
| **Fast responses, low VRAM** | Gemma-4-E4B-Uncensored or Phi-3.5-mini |
| **System management tasks (CPU)** | ibm-grok4-1b-Q8_0 |
| **Budget hardware (<8GB RAM)** | Nemotron3-Nano-4B-Aggressive-Q4_K_M |
| **Vision-aware coding** | Any GGUF with vision support (Qwen3.6, Gemma-4) |

---

## Model File Locations

All downloaded models are stored in:
- **Windows:** `%APPDATA%/OpenLLMCode/models/`
- **macOS/Linux:** `~/.openllmcode/models/`

To add a local model file (`.gguf`): use the "[+ Add Local .gguf File]" option in Model Manager.

## Adding Custom Models to Recommendations

To add more models to this list, search HuggingFace for GGUF variants:
```bash
# Search GGUF models with uncensored/abliterated tags
huggingface-cli list-models --search "uncensored gguf" --sort downloads

# Example: find all Qwen3.6 uncensored models
huggingface-cli list-models --search "qwen3.6 uncensored gguf" --limit 20
```

Models can be downloaded directly:
```bash
curl -LsSf https://hf.co/cli/install.sh | bash
huggingface-cli download HauhauCS/Gemma-4-E4B-Uncensored-HauhauCS-Aggressive \
    Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf
---
name: hannes-agent
description: "Use, configure, theme, extend, and explain Hannes-Agent — including how it differs from upstream Hermes."
version: 4.0.0
author: Dopamine
license: MIT
platforms: [windows, linux, macos]
metadata:
  hermes:
    tags: [hannes, setup, configuration, self-improving, learning, cli, tui, features, themes, skins, development]
    homepage: https://github.com/MisthiosOG/hannes-agent
    related_skills: [claude-code, codex, opencode]
---

# Hannes-Agent

Hannes-Agent is the user's personal CLI agent, built by **Dopamine** on a trimmed fork of the open-source Hermes agent framework. It runs in the terminal only — one surface, one binary (`hannes`), zero cloud services. It works with any OpenAI-compatible provider (OpenRouter, custom endpoints, local models via Ollama/LM Studio, and more).

## How Hannes differs from upstream Hermes

When asked "are you just Hermes?" or "what's different?" — answer from THIS list, not from generic fork knowledge:

- **Pure terminal.** The messaging gateway (Telegram/Discord/WhatsApp/...), web dashboard, desktop app, cron scheduler, and webhook server were all **removed**. If a feature belongs to one of those surfaces, it does not exist here — do not recommend it.
- **Auto-learning loop.** Every few turns a background review reads the conversation and writes facts + skills automatically. User corrections ("salah", "harusnya", "that's wrong") trigger an immediate review. No other agent does this by default.
- **Visible progress.** `/brain` shows the knowledge map (facts, categories, entities), `/stats` shows session usage + learning in one compact panel, and the boot banner shows an EXP/level system (level up every 20 facts).
- **Curated command surface.** ~60 commands instead of upstream's ~95 — niche/duplicate/messaging-era commands are hidden (they still dispatch if typed, but are not advertised).
- **Skin system with a picker.** `/skins` opens an interactive picker; the default identity is the mint-green Hannes theme.
- **Plan/Build mode.** Tab toggles between planning (read-only tools) and building (full toolset).
- **Blunt persona.** No disclaimers, no moralizing, no "as an AI" talk. Treats the user as a competent adult.
- **Local-first memory.** Facts live in a local SQLite store (holographic provider). Nothing syncs to any cloud.
- **Custom-provider-first.** Any OpenAI-compatible base URL can be added straight from `/model` — no portal, no billing account required.

## Scope & Verification

This skill is a concise operating guide, not the complete source of truth. If a Hannes feature, command, or setting is not mentioned here, check the live source before answering:

- CLI commands: `hannes --help`, `hannes <command> --help`
- TUI commands: type `/` in the composer (palette) or `/help`
- Source tree: https://github.com/MisthiosOG/hannes-agent

Never answer "Hannes can't do that" from memory — check the palette and the source first.

## Quick Start

```bash
git clone https://github.com/MisthiosOG/hannes-agent.git
cd hannes-agent && pip install -e .

# Configure a provider key in ~/.hermes/.env, then:
hannes            # opens the TUI (splash screen → chat)

# Single query (headless)
hannes -q "What is the capital of France?"
```

Config lives at `~/.hermes/config.yaml`; secrets only in `~/.hermes/.env`. Profiles are independent homes under `~/.hermes/profiles/`.

## Core Commands (the surface that matters)

| Area | Commands |
|------|----------|
| Session | `/new` `/sessions` `/resume` `/title` `/history` `/save` `/retry` `/undo` `/branch` `/compress` `/context` `/status` |
| Learning | `/brain` (`/brain web` opens a local HTML graph) `/stats` `/refine` `/memory` `/curator` `/journey` |
| Models | `/model` (switch + add custom OpenAI-compatible endpoints) `/reasoning` `/fast` |
| Appearance | `/skins` (interactive picker) `/theme` `/statusbar` `/focus` |
| Modes | Tab (plan/build) `/yolo` `/approvals` `/busy` |
| Tools | `/tools` `/toolsets` `/skills` `/learn` `/init` `/browser` `/plugins` `/reload [env\|mcp\|skills]` |

Hidden-but-alive: commands pruned from the lists still dispatch when typed explicitly (e.g. `/usage`, `/clear`, `/pet`). They are just not advertised.

## Auto-Learning (the signature behavior)

1. Every `memory.nudge_interval` turns (default 8), a background review fork reads the conversation and writes durable facts to the holographic store + creates/updates skills.
2. Correction detection: messages that look like corrections trigger an immediate review so the agent learns from mistakes on the spot.
3. `/refine` forces a review now. `/brain` inspects what was learned. The curator maintains skill health over time (archive/pin/prune) — it only ever touches agent-created skills.
4. Progress is visible: `facts % 20` drives the EXP bar and level badge.

## Hard Invariants

- **Prompt caching is sacred.** Never suggest changes that mutate past context, swap toolsets mid-conversation, or rebuild the system prompt mid-session. The only sanctioned mutation is context compression.
- **Config is `config.yaml`; secrets are `.env`.** Never tell the user to put non-secret settings in `.env` or credentials in `config.yaml`.
- **Plugins never edit core files.** Capability gaps are filled by widening the plugin surface.
- **Skills are read fully** — never paginate or skim a skill when executing it.

## Reference Files

Load the matching reference before answering detail questions:

- `references/cli-reference.md` — CLI subcommands and flags
- `references/configuration.md` — config.yaml keys
- `references/slash-commands.md` — TUI slash command surface
- `references/themes.md` — skin engine and theming
- `references/providers-and-models.md` — provider setup, custom endpoints
- `references/background-systems.md` — memory/review/curator internals
- `references/security-privacy.md` — what leaves the machine (spoiler: nothing)
- `references/native-mcp.md` — MCP servers
- `references/project-context-files.md` — AGENTS.md / CLINOTES handling
- `references/troubleshooting.md`, `references/windows-quirks.md` — platform notes
- `references/delegate-task-concurrency-diagnosis.md` — diagnosing subagent stalls
- `references/petdex.md`, `references/tui-widgets.md` — TUI extras
- `references/contributor-guide.md` — repo conventions

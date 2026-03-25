---
title: devflow init
description: Initialize devflow in your project
---

```bash
devflow init [--force]
```

Scans your project to detect language, framework, test framework, and CI configuration. Prompts for LLM provider and context mode preferences.

## Options

| Option | Description |
|--------|-------------|
| `--force` | Overwrite existing config |

## What it does

1. Verifies you're in a git repository
2. Scans project for language, framework, tests, and CI
3. Prompts for provider and context mode
4. Creates `.devflow/config.json` and `.devflow/state.json`
5. Warns if `gh` CLI is not installed

## Example

```bash
$ devflow init
◆ devflow init
│ Detected: typescript (express), jest, CI found
│ LLM Provider: Claude (Anthropic)
│ Context mode: Normal
│ Config saved to .devflow/config.json
```

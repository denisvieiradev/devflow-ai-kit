# devflow-ai-kit

**CLI pipeline for structured software development — from PRD to merge.**

[![npm version](https://img.shields.io/npm/v/devflow-ai-kit)](https://www.npmjs.com/package/devflow-ai-kit)
[![npm downloads](https://img.shields.io/npm/dm/devflow-ai-kit)](https://www.npmjs.com/package/devflow-ai-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org)
[![CI](https://github.com/denisvieiradev/devflow-ai-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/denisvieiradev/devflow-ai-kit/actions/workflows/ci.yml)

> **Available on npm:** [devflow-ai-kit](https://www.npmjs.com/package/devflow-ai-kit)

---

## What is devflow?

devflow-ai-kit is an open-source CLI that automates the complete software development workflow. Instead of manually writing PRDs, breaking down tasks, committing code, and creating pull requests — devflow handles the entire pipeline with AI-powered intelligence.

You describe a feature in plain English. devflow generates a structured PRD, creates a technical specification, decomposes it into implementable tasks, executes them with atomic commits, runs tests, performs code review, and opens a pull request. All artifacts are versioned and tracked in your project.

```
init → prd → techspec → tasks → run-tasks → test → review → pr → done
```

## Features

- **9-phase structured pipeline** — PRD, techspec, tasks, implementation, testing, review, PR, and merge in a single flow
- **Intelligent model routing** — Automatically selects the right LLM tier (fast/balanced/powerful) based on task complexity
- **Project auto-detection** — Detects your language, framework, test runner, and CI system on `init`
- **State persistence** — Tracks feature progress, tasks, and artifacts in `.devflow/` with file locking
- **Customizable templates** — Override PRD, techspec, tasks, commit, and PR templates per project
- **Git + GitHub integration** — Atomic commits with Conventional Commits format, automatic PR creation via `gh`
- **Context modes** — Normal (full documents) or light (chunked, ~4000 tokens) for large projects
- **Sensitive file filtering** — Automatically excludes `.env`, credentials, keys, and secrets from commits

## Prerequisites

| Requirement | Purpose |
|---|---|
| [Node.js](https://nodejs.org) >= 18 | Runtime |
| [Git](https://git-scm.com) | Version control operations |
| [GitHub CLI (`gh`)](https://cli.github.com) | PR creation (optional — only for `devflow pr`) |
| `ANTHROPIC_API_KEY` | LLM API access (configured during `devflow init` or via env var) |

## Installation

**Global (recommended):**

```bash
npm install -g devflow-ai-kit
```

**Local (per project):**

```bash
npm install --save-dev devflow-ai-kit
npx devflow <command>
```

## Quick Start

```bash
# 1. Initialize devflow in your project (configures API key, provider, and context mode)
cd my-project
devflow init

# 2. Create a PRD from a feature description
devflow prd "add OAuth authentication with Google and GitHub providers"

# 3. Generate a technical specification from the PRD
devflow techspec 001

# 4. Break the techspec into implementable tasks
devflow tasks 001

# 5. Execute all tasks with automatic commits
devflow run-tasks 001

# 6. Generate and run tests
devflow test 001

# 7. Run an automated code review
devflow review 001

# 8. Create a pull request
devflow pr

# 9. Mark the feature as complete
devflow done 001
```

> The `001` is the feature reference number, automatically assigned when you create a PRD.

## Commands Reference

### Pipeline Commands

| Command | Description | Model Tier |
|---|---|---|
| `devflow init` | Initialize devflow — auto-detects project, configures API key, provider, and context mode | — |
| `devflow prd <description>` | Generate a structured PRD with interactive clarification questions | Sonnet |
| `devflow techspec [ref]` | Generate technical specification from an approved PRD | Sonnet |
| `devflow tasks [ref]` | Decompose techspec into numbered, implementable tasks | Sonnet |
| `devflow run-tasks [ref]` | Execute pending tasks sequentially with atomic commits | Haiku |
| `devflow test [ref]` | Generate test plan and optionally run tests | Sonnet |
| `devflow review [ref]` | Automated code review with categorized findings (Critical / Suggestions / Nitpicks) | Sonnet |
| `devflow pr [--base branch]` | Create a GitHub PR with auto-generated title and description | Haiku |
| `devflow done [ref]` | Mark feature as complete and finalize | — |

### Utility Commands

| Command | Description | Model Tier |
|---|---|---|
| `devflow commit [--push]` | Generate intelligent commit messages with smart commit plan detection (Conventional Commits) | Haiku |
| `devflow status` | Show status of all tracked features with phases and pending tasks | — |

> `[ref]` is the feature number (e.g., `001`) or slug. If omitted, devflow resolves the current feature from context.

## How It Works

### Pipeline Phases

Each feature moves through a linear state machine:

```
┌──────────┐    ┌─────────────┐    ┌─────────────────┐    ┌───────────────┐
│   init   │───>│ prd_created │───>│ techspec_created │───>│ tasks_created │
└──────────┘    └─────────────┘    └─────────────────┘    └───────┬───────┘
                                                                  │
                                                                  v
┌──────┐    ┌────────────┐    ┌───────────┐    ┌─────────┐    ┌───────────┐
│ done │<───│ pr_created │<───│ reviewing │<───│ testing │<───│in_progress│
└──────┘    └────────────┘    └─────┬─────┘    └─────────┘    └───────────┘
                                    │
                                    │ critical findings?
                                    v
                              ┌───────────┐
                              │   tasks   │ (fix cycle)
                              └───────────┘
```

### Model Routing

devflow automatically selects the optimal model for each operation:

| Tier | Model | Used For |
|---|---|---|
| **Fast** | Haiku | Commits, PR generation, task execution guidance |
| **Balanced** | Sonnet | PRD, techspec, tasks, code review, test plans |
| **Powerful** | Opus | Reserved for high-complexity analysis |

### Project Structure

After running `devflow init`, your project gets a `.devflow/` directory:

```
my-project/
├── .devflow/
│   ├── config.json              # Provider, models, context mode, detection results
│   ├── .env                     # API key (created by `devflow init`, never committed)
│   ├── state.json               # Feature tracking (phases, tasks, artifact hashes)
│   ├── templates/               # Optional: custom template overrides
│   └── features/
│       ├── 001-oauth-auth/
│       │   ├── prd.md           # Product Requirements Document
│       │   ├── techspec.md      # Technical Specification
│       │   ├── tasks.md         # Task breakdown
│       │   ├── 1_task.md        # Individual task details
│       │   ├── 2_task.md
│       │   ├── 1_output.md      # Task execution output
│       │   ├── 2_output.md
│       │   ├── test-plan.md     # Generated test plan
│       │   └── review.md        # Code review findings
│       └── 002-next-feature/
└── src/  (your project files)
```

## Configuration

### API Key

During `devflow init`, you'll be prompted to enter your Anthropic API key. The key is stored in `.devflow/.env` (with `0600` permissions) and automatically loaded before every command.

You can also set it via environment variable, which takes precedence over the file:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

> **Important:** Add `.devflow/.env` to your `.gitignore` to avoid committing secrets.

### config.json

Created by `devflow init`, stores project configuration:

```json
{
  "provider": "anthropic",
  "models": {
    "fast": "haiku",
    "balanced": "sonnet",
    "powerful": "opus"
  },
  "contextMode": "normal",
  "language": "typescript",
  "framework": "next",
  "testFramework": "jest",
  "ci": "github-actions",
  "commitConvention": "conventional"
}
```

### Context Modes

| Mode | Behavior | Best For |
|---|---|---|
| `normal` | Full documents included in LLM prompts | Small to medium projects |
| `light` | Documents chunked by headings, truncated to ~4000 tokens | Large projects, cost optimization |

### Custom Templates

Override the default templates by placing files in `.devflow/templates/`:

- `prd.md` — PRD generation template
- `techspec.md` — Technical specification template
- `tasks.md` — Task decomposition template
- `commit.md` — Commit message template
- `pr.md` — Pull request template

Templates use `{{variable}}` interpolation syntax.

## Suggested Workflow

### Solo Developer

```bash
devflow init                              # Once per project
devflow prd "my feature description"      # Describe what you want
devflow techspec 001                      # Generate architecture
devflow tasks 001                         # Get implementable steps
devflow run-tasks 001                     # Execute with auto-commits
devflow test 001                          # Validate
devflow review 001                        # Self-review
devflow pr                                # Ship it
devflow done 001                          # Clean up
```

### Team Workflow

```bash
# Developer
devflow prd "feature X"                   # Draft requirements
# → Share PRD with team for feedback

devflow techspec 001                      # Technical design
# → Team reviews techspec

devflow tasks 001                         # Break into tasks
devflow run-tasks 001                     # Implement
devflow test 001                          # Test

devflow review 001                        # AI pre-review
# → If critical findings: fix and re-review
devflow tasks 001                         # Generate fix tasks
devflow run-tasks 001                     # Apply fixes
devflow review 001                        # Re-review

devflow pr                                # Open PR for human review
devflow done 001                          # After merge
```

### Manual Mode

You don't have to use the full pipeline. After running `devflow init`, you can pick and choose individual commands as standalone utilities — no feature reference or prior phases required.

```bash
devflow init                              # Once per project

# Use only the commands you need:
devflow commit                            # Smart commit messages anytime
devflow commit --push                     # Commit + push in one step
devflow review --base main                # AI code review on current branch
devflow pr                                # Auto-generate PR title & description
devflow status                            # Check feature progress
```

Some examples of selective usage:

- **Just commit smarter** — Use `devflow commit` as a drop-in replacement for `git commit`. It analyzes your staged diff and generates a Conventional Commits message automatically.
- **Just get a code review** — Run `devflow review` on any branch to get AI-powered feedback categorized into Critical, Suggestions, and Nitpicks — without creating a feature or PRD.
- **Just create a PR** — Run `devflow pr` to auto-generate a pull request with a title and description derived from your commit history.
- **Just document a feature** — Run `devflow prd "your idea"` to generate a structured PRD for brainstorming or team discussion, without continuing to implementation.
- **Check progress** — Run `devflow status` anytime to see all tracked features, their current phase, and pending tasks.

#### Smart Commit Plan

When your staged changes span **multiple contexts** (e.g., a bug fix and a new feature), devflow automatically detects this and suggests a **commit plan** — splitting changes into separate conventional commits:

```
devflow commit

  Commit plan detected — changes span multiple contexts:

  1. feat(auth): add login endpoint
     Files: src/auth.ts, src/routes.ts

  2. fix(db): resolve connection timeout
     Files: src/db.ts

? How would you like to proceed?
  > Split into separate commits (recommended)
    Commit all as a single commit
    Cancel
```

For cohesive, single-context changes, devflow generates a single conventional commit message as usual — no commit plan is shown.

Supported conventional commit types: `feat`, `fix`, `refactor`, `test`, `chore`, `style`, `docs`.

## Project Structure (for Contributors)

```
src/
├── cli/
│   ├── index.ts              # Entry point (shebang + bootstrap)
│   ├── program.ts            # Commander.js setup, loads all commands
│   ├── context.ts            # Shared context helper for feature resolution
│   └── commands/             # One file per command (init, prd, techspec, ...)
├── core/
│   ├── types.ts              # Type definitions (Config, State, Phases, Tasks)
│   ├── config.ts             # Configuration management
│   ├── state.ts              # Feature state persistence with file locking
│   ├── pipeline.ts           # Feature numbering, slug generation, reference resolution
│   ├── template.ts           # Template engine with {{variable}} interpolation
│   ├── context.ts            # ContextBuilder for smart document chunking
│   ├── scanner.ts            # Project auto-detection (language, framework, tests, CI)
│   └── drift.ts              # Artifact change detection
├── providers/
│   ├── types.ts              # LLMProvider interface
│   ├── claude.ts             # Anthropic SDK implementation
│   └── model-router.ts       # Model selection by task complexity
├── infra/
│   ├── env.ts                # .devflow/.env loading and writing
│   ├── filesystem.ts         # File operations (read/write JSON, existence checks)
│   ├── git.ts                # Git operations wrapper
│   ├── github.ts             # GitHub PR creation via gh CLI
│   └── logger.ts             # Debug logging
└── templates/
    ├── prd.md
    ├── techspec.md
    ├── tasks.md
    ├── commit.md
    └── pr.md
```

## Contributing

Contributions are welcome! Please see our [Contributing Guide](CONTRIBUTING.md) for details on setup, development workflow, and guidelines.

By participating, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

To report a vulnerability, please see our [Security Policy](SECURITY.md).

## Roadmap

- [ ] Multiple LLM providers (OpenAI, Gemini, local models)
- [ ] Plugin system for custom pipeline phases
- [ ] Deeper CI/CD integration (auto-trigger pipelines)
- [ ] Interactive mode with step-by-step prompts
- [ ] Drift detection (warn when upstream artifacts change)
- [ ] Parallel task execution
- [ ] Web dashboard for feature tracking
- [ ] Monorepo support

## Support the Developer

If you find devflow-ai-kit useful, consider supporting its development:

- [Buy me a coffee](https://buymeacoffee.com/denisvieiradev)
- **PIX (Brazil):** `denisvieira05@gmail.com`

## License

[MIT](LICENSE)

---

Built by [Denis Vieira](https://github.com/denisvieiradev)

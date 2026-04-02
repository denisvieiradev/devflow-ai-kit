# devflow-cli

**Stop writing PRDs, specs, and commit messages by hand.** devflow automates your entire dev workflow — from idea to merged PR.

[![npm version](https://img.shields.io/npm/v/@denisvieiradev/devflow-cli)](https://www.npmjs.com/package/@denisvieiradev/devflow-cli)
[![npm downloads](https://img.shields.io/npm/dm/@denisvieiradev/devflow-cli)](https://www.npmjs.com/package/@denisvieiradev/devflow-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org)
[![CI](https://github.com/denisvieiradev/devflow-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/denisvieiradev/devflow-cli/actions/workflows/ci.yml)

---

You describe a feature in plain English. devflow generates a PRD, creates a technical spec, breaks it into tasks, implements them with atomic commits, runs tests, reviews the code, and opens a pull request.

You can also use each command standalone — smart commits, AI code review, auto-generated PRs, and automated releases work without the full pipeline.

```bash
npm install -g @denisvieiradev/devflow-cli
devflow init
```

## The Pipeline

```
describe → plan → build → validate → ship
```

| Phase | Commands | What it produces |
|---|---|---|
| **Describe** | `devflow prd "your feature"` | Structured PRD with clarification questions |
| **Plan** | `devflow techspec` → `devflow tasks` | Technical spec + numbered, implementable tasks |
| **Build** | `devflow run-tasks` | Code changes with atomic commits per task |
| **Validate** | `devflow test` → `devflow review` | Test plan + code review (Critical / Suggestions / Nitpicks) |
| **Ship** | `devflow pr` → `devflow release` → `devflow done` | Pull request, versioned release, feature closed |

### Why devflow?

- **End-to-end** — from idea to merged PR in one CLI, no context switching
- **Cost-aware** — 3-tier model routing (Opus / Sonnet / Haiku) uses the cheapest model that fits each task
- **Safe** — drift detection, sensitive file filtering, file locking, and retry logic built in
- **Transparent** — token usage reported after every LLM call so you always know what you're spending
- **Flexible** — use the full pipeline or pick any command standalone

## Quick Start

### Full pipeline (feature end-to-end)

```bash
devflow init                    # Once per project — configures API key, detects your stack
devflow prd "add OAuth with Google and GitHub"   # → .devflow/features/001-oauth-auth/prd.md
devflow techspec 001            # → techspec.md
devflow tasks 001               # → tasks.md + individual task files
devflow run-tasks 001           # Implements each task with auto-commits
devflow test 001                # Generates test plan, optionally runs tests
devflow review 001              # AI code review — if critical findings, fix and re-review
devflow pr                      # Opens a GitHub PR with auto-generated title and description
devflow release 001             # Version bump, changelog, release notes, git tag, GitHub release
devflow done 001                # Marks feature as complete
```

> `001` is the feature reference number, assigned automatically when you create a PRD.

### Standalone tools (use what you need)

You don't need the full pipeline. After `devflow init`, each command works independently:

```bash
devflow commit              # Smart commit messages — analyzes your diff, generates Conventional Commits
devflow commit --push       # Commit + push in one step
devflow review              # AI code review on current branch (no feature required)
devflow pr                  # Auto-generate PR title and description from commit history
devflow release             # Version bump, changelog, tag, GitHub release — all in one command
devflow status              # Check progress of all tracked features
```

## Commands

### Pipeline

| Command | Description |
|---|---|
| `devflow init [--force]` | Initialize devflow — auto-detects language, framework, test runner, and CI |
| `devflow prd <description>` | Generate a structured PRD with interactive clarification questions |
| `devflow techspec [ref]` | Generate technical specification from an approved PRD |
| `devflow tasks [ref]` | Decompose techspec into numbered, implementable tasks |
| `devflow run-tasks [ref]` | Execute pending tasks sequentially with atomic commits |
| `devflow test [ref]` | Generate test plan and optionally run tests |
| `devflow review [ref] [--base branch]` | Automated code review with categorized findings |
| `devflow pr [--base branch]` | Create a GitHub PR with auto-generated title and description |
| `devflow release [ref]` | Version bump, changelog, release notes, git tag, GitHub release |
| `devflow done [ref]` | Mark feature as complete and finalize |

### Utilities

| Command | Description |
|---|---|
| `devflow commit [--push]` | Intelligent commit messages with multi-context commit plan detection |
| `devflow status` | Show status of all tracked features with phases and pending tasks |

> `[ref]` is the feature number (e.g., `001`) or slug. If omitted, devflow resolves the current feature from context. All pipeline commands also work standalone without a feature reference.

## Features

### Smart Commit Plan

When your staged changes span multiple contexts (e.g., a bug fix and a new feature), devflow detects this and offers to split them into separate conventional commits:

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

For single-context changes, it generates one commit message — no plan shown. Supported types: `feat`, `fix`, `refactor`, `test`, `chore`, `style`, `docs`.

### Automated Releases

`devflow release` handles the entire release lifecycle in one command:

```
devflow release

  ◆ Last tag: v1.0.0
  ● Analyzing commits...
  ◆ AI suggests: MINOR bump (new features detected)

  ◆ Select version bump:
    ○ patch (1.0.1)  ● minor (1.1.0) ← suggested  ○ major (2.0.0)

  ● Generating changelog...
  ◆ Select language for release notes:
    ● English  ○ Portuguese  ○ Spanish  ○ French

  ✔ Bumped version to 1.1.0 in package.json
  ✔ Updated CHANGELOG.md
  ✔ Saved release notes to .devflow/releases/v1.1.0-release-notes.md
  ✔ Committed, tagged v1.1.0, pushed, GitHub release created

  └ Released v1.1.0
```

It generates a **technical changelog** (Keep a Changelog format in `CHANGELOG.md`), **client-facing release notes** (in your chosen language), a **git tag**, and a **GitHub release** via `gh` CLI.

### Intelligent Model Routing

Each command is routed to the optimal Claude model tier — you pay for Opus only when the task needs it:

| Commands | Model Tier | Why |
|---|---|---|
| `prd`, `techspec`, `review` | Powerful (Opus) | Complex reasoning and analysis |
| `tasks`, `run-tasks`, `test`, `release` | Balanced (Sonnet) | Good quality at lower cost |
| `init`, `commit`, `pr`, `done`, `status` | Fast (Haiku) | Simple tasks, minimal cost |

Model IDs are configurable in `.devflow/config.json` if you want to pin specific versions.

### Drift Detection

devflow tracks SHA-256 hashes of your artifacts (PRD, techspec, tasks). When you modify an upstream artifact after downstream artifacts were generated, it warns you to regenerate:

```
⚠ PRD was modified after downstream artifacts were generated. Consider regenerating techspec and tasks.
```

### More

- **Project auto-detection** — Detects language, framework, test runner, and CI on `devflow init` so you skip manual configuration
- **State persistence** — Tracks feature progress, tasks, and artifacts in `.devflow/` with file locking to prevent concurrent write conflicts
- **Customizable templates** — Override PRD, techspec, tasks, commit, PR, and release templates per project using `{{variable}}` interpolation
- **Context modes** — Normal (full documents) or light (chunked by headings with priority sorting, ~4000 tokens) for large projects and cost optimization
- **Sensitive file filtering** — Automatically excludes `.env`, credentials, keys, and secrets from auto-commits
- **Token usage reporting** — Every LLM call reports input/output tokens so you can track and control API costs
- **Retry with backoff** — API calls automatically retry up to 3 times with exponential backoff for rate limits and transient errors
- **Interactive file selection** — `devflow commit` offers file selection when nothing is staged, so you never have to leave the flow

## How It Works

Each feature moves through a linear state machine:

```
┌──────────┐    ┌─────────────┐    ┌─────────────────┐    ┌───────────────┐
│   init   │───>│ prd_created │───>│ techspec_created │───>│ tasks_created │
└──────────┘    └─────────────┘    └─────────────────┘    └───────┬───────┘
                                                                  │
                                                                  v
┌──────┐    ┌───────────┐    ┌────────────┐    ┌───────────┐    ┌───────────┐
│ done │<───│ releasing │<───│ pr_created │<───│ reviewing │<───│  testing  │
└──────┘    └───────────┘    └────────────┘    └─────┬─────┘    └───────────┘
                                                     │               ^
                                                     │               │
                                                     │ critical?  ┌───────────┐
                                                     └───────────>│in_progress│
                                                                  └───────────┘
```

After `devflow init`, your project gets a `.devflow/` directory:

```
.devflow/
├── config.json          # Provider, models, context mode, detection results
├── .env                 # API key (never committed)
├── state.json           # Feature tracking (phases, tasks, artifact hashes)
├── templates/           # Optional: custom template overrides
├── releases/            # Client-facing release notes
└── features/
    └── 001-oauth-auth/
        ├── prd.md       # Product Requirements Document
        ├── techspec.md  # Technical Specification
        ├── tasks.md     # Task breakdown + individual task/output files
        ├── test-plan.md # Generated test plan
        └── review.md    # Code review findings
```

## Configuration

### API Key

Set during `devflow init` (stored in `.devflow/.env` with `0600` permissions) or via environment variable:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

> Add `.devflow/.env` to your `.gitignore` to avoid committing secrets.

### config.json

Created by `devflow init`:

```json
{
  "provider": "claude",
  "models": {
    "fast": "claude-haiku-4-5-20251001",
    "balanced": "claude-sonnet-4-5-20250929",
    "powerful": "claude-opus-4-5-20250929"
  },
  "language": "en",
  "commitConvention": "conventional",
  "branchPattern": "feature/{{slug}}",
  "templatesPath": ".devflow/templates",
  "contextMode": "normal",
  "project": {
    "name": "my-app",
    "language": "typescript",
    "framework": "next",
    "testFramework": "jest",
    "hasCI": true
  }
}
```

### Context Modes

| Mode | Behavior | Best For |
|---|---|---|
| `normal` | Full documents in LLM prompts | Small to medium projects |
| `light` | Chunks documents by Markdown headings, sorts by priority, caps at ~4000 tokens | Large projects, cost optimization |

### Custom Templates

Override defaults by placing files in `.devflow/templates/`:

`prd.md` · `techspec.md` · `tasks.md` · `commit.md` · `pr.md` · `release-version.md` · `release-changelog.md` · `release-notes.md`

Templates use `{{variable}}` interpolation syntax.

## Prerequisites

| Requirement | Purpose |
|---|---|
| [Node.js](https://nodejs.org) >= 18 | Runtime |
| [Git](https://git-scm.com) | Version control |
| [GitHub CLI (`gh`)](https://cli.github.com) | PR creation and GitHub releases (optional) |
| `ANTHROPIC_API_KEY` | LLM access (configured during `devflow init` or via env var) |

## Roadmap

- [x] Automated release pipeline (version bump, changelog, release notes, git tag, GitHub release)
- [ ] Multiple LLM providers (OpenAI, Gemini, local models)
- [ ] Plugin system for custom pipeline phases
- [ ] Deeper CI/CD integration (auto-trigger pipelines)
- [ ] Interactive mode with step-by-step prompts
- [x] Drift detection (warn when upstream artifacts change)
- [ ] Parallel task execution
- [ ] Claude Code integration (install devflow as a plugin/skill inside Claude Code)
- [ ] Web dashboard for feature tracking
- [ ] Monorepo support

## Contributing

Contributions are welcome! Please see our [Contributing Guide](CONTRIBUTING.md) for details on setup, development workflow, and project architecture.

By participating, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

To report a vulnerability, please see our [Security Policy](SECURITY.md).

## Support the Developer

If you find devflow-cli useful, consider supporting its development:

- [Buy me a coffee](https://buymeacoffee.com/denisvieiradev)
- **PIX (Brazil):** `denisvieira05@gmail.com`

## License

[MIT](LICENSE)

---

Built by [Denis Vieira](https://github.com/denisvieiradev)

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0] - 2026-04-02

### Changed
- Renamed package to `@denisvieiradev/devflow-cli`

## [1.5.0] - 2026-04-02

### Added
- Added fallback path resolution for template lookup
- Added ESLint configuration with TypeScript and React support

### Changed
- Configured CI pipeline to execute tests after the build step

## [1.4.0] - 2026-04-01

### Added
- Added support for multiple provider backends
- Added Claude binary path resolution and validation to the `init` command
- Added language and commit convention selection to configuration setup
- Added grouped file display with descriptions in the commit UI
- Added npm update check notification on CLI startup

### Changed
- Updated default Claude model versions in configuration

### Fixed
- Fixed handling of renamed files in git diff parsing with improved error handling
- Fixed CLI error handling and messages in provider layer
- Fixed bundled templates path resolution
- Fixed provider command execution by removing `shell: true` to improve reliability

## [1.0.0] - 2026-03-26

### Added

- 9-phase structured pipeline: init, prd, techspec, tasks, run-tasks, test, review, pr, done
- Intelligent model routing (Haiku/Sonnet/Opus) based on task complexity
- Project auto-detection (language, framework, test runner, CI)
- State persistence in `.devflow/` with file locking
- Customizable templates with `{{variable}}` interpolation
- Git and GitHub integration with Conventional Commits format
- Context modes (normal/light) for different project sizes
- Sensitive file filtering for commits
- Standalone `devflow commit` command with `--push` flag
- `devflow status` command for feature tracking

[1.0.0]: https://github.com/denisvieiradev/devflow-cli/releases/tag/v1.0.0

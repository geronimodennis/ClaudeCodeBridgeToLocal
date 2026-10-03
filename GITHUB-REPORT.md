# ClaudeCodeBridgeToLocal — initial release report

## Purpose

Provide a simple setup wizard that connects the Claude Desktop GUI to a local or LAN Ollama server through a loopback inference bridge. The npm package is `claudecodebridgetolocal`; its executable is `claudebl`.

## Delivered behavior

- Ask whether Ollama runs on the same computer or a remote LAN host.
- Ask for the LAN address and discover available models.
- Save a named Desktop configuration with an explicit actual-model label.
- Back up the previous Desktop selection before edits and restore exact prior metadata when unchanged.
- Run a loopback-only, authenticated proxy in the background.
- Offer setup, start, stop, status, doctor, restore, help, and version commands.
- Preserve tools and streaming while translating model routing IDs.
- Provide launchers for Windows, macOS, and Linux without runtime dependencies.

## Validation

The Windows test suite passed tests for platform paths, URL normalization,
backup/restore, authentication, model routing, UTF-8 streaming, tool preservation,
upstream errors, and detached lifecycle operations. A local npm installation smoke
test is included in release preparation. GitHub CI is configured for all three OS
families and Node 20, 22, and 24; those remote results are pending until a repository
is created and its workflow runs.

## Known limits

This is an experimental non-Claude model bridge, not an official supported
deployment. A real Qwen response on the user's LAN server previously timed out;
full Claude Desktop inference remains unverified. Ollama implements only part of
the Anthropic API, so some Desktop features may fail. Native macOS/Linux runtime
validation is pending. Managed policies are not overridden. Automatic startup is
disabled; Desktop configuration persists across reboots, while the proxy must be
started again.

## Release artifacts

The npm tarball excludes user settings, credentials, logs, and backups. Installing
the package does not alter Desktop; the user must invoke `claudebl setup`.
The default release license is `UNLICENSED`; the project owner can select an
open-source license separately.

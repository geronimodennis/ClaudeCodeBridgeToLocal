# Changelog

## 1.1.0

- Add `server-init` and `serve` for hosting the bridge alongside remote Ollama.
- Add `connect --url HTTPS-URL` to point Desktop directly to the remote bridge.
- Require authenticated remote health checks and disable network shutdown.

## 1.0.3

- Add `claudebl version` alongside `claudebl --version`.

## 1.0.2

- Add `claudebl open` to launch Claude Desktop on Windows, macOS, and Linux.
- Discover Windows Store installations and common Desktop executable paths.
- Support `claudebl open --app PATH` for custom installations.

## 1.0.1

- Present setup as five numbered steps with a branded header, clearer location choices, and a review summary.
- Add terminal color with plain-text output when redirected or when NO_COLOR is set.
- Replace personal server and model examples with generic placeholders.

## 1.0.0

- Introduce ClaudeCodeBridgeToLocal and the `claudebl` command.
- Add a local/LAN Ollama setup wizard with model discovery.
- Support Windows, macOS, and Linux user configuration paths.
- Provide start, stop, status, doctor, and restore commands.
- Back up Desktop configuration selection and preserve existing entries.
- Authenticate loopback proxy requests with a generated local credential.
- Translate model routing IDs and preserve messages, tools, and streaming.
- Keep automatic startup disabled.

This is an experimental Claude Desktop bridge. Full Desktop compatibility and
native macOS/Linux operation have not yet been verified.

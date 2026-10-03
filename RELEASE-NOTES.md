# ClaudeCodeBridgeToLocal v1.0.0

Connect the Claude Desktop GUI to an Ollama model on your computer or LAN with the `claudebl` setup wizard.

```sh
npm install -g claudecodebridgetolocal
claudebl setup
```

The wizard discovers models, saves a backed-up Desktop configuration, and starts an authenticated loopback proxy. Commands include `start`, `stop`, `status`, `doctor`, and `restore`. Windows, macOS, and Linux launchers are included. Node.js 20 or newer is required; no runtime dependencies are installed.

The npm package `claudecodebridgetolocal@1.0.0` is published. The attached tarball is the exact npm-published artifact; the SHA-256 file supports download verification. The source ZIP includes the project and tests.

Five Windows test groups passed, including backup/restore, authentication, tool preservation, streaming, model translation, and background process lifecycle. Installation and the `claudebl` command were verified.

This remains an experimental bridge for non-Claude models. Full Desktop inference and native macOS/Linux execution are unverified. Ollama's partial Anthropic API compatibility can limit Desktop features. Automatic startup is disabled; after reboot, run `claudebl start` again. The license is `UNLICENSED` pending the owner's choice of an open-source license.

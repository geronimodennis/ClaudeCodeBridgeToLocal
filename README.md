# ClaudeCodeBridgeToLocal — v1.1.3

A terminal setup wizard for Claude **Desktop**, with Windows, macOS, and Linux launchers. It supports Ollama on the same computer or on a remote LAN server. No npm libraries, Python, administrator access, or Claude Code CLI are required. Node.js **20 or newer** and an installed Claude Desktop app are required.

Project name: **ClaudeCodeBridgeToLocal**. npm package: **`claudecodebridgetolocal`**. CLI command: **`claudebl`**. Despite the project name, this package configures the Claude Desktop GUI; it does not launch the Claude Code terminal CLI.

Current release: **1.1.3**. Packages are available on [npm](https://www.npmjs.com/package/claudecodebridgetolocal). Source and release assets are hosted at [geronimodennis/ClaudeCodeBridgeToLocal](https://github.com/geronimodennis/ClaudeCodeBridgeToLocal).

## Install the npm package

To install a downloaded release tarball:

```sh
npm install -g ./claudecodebridgetolocal-1.1.3.tgz
claudebl setup
```

To install from the public npm registry:

```sh
npm install -g claudecodebridgetolocal
claudebl setup
```

Alternatively, run the wizard without a global install:

```sh
npx --package claudecodebridgetolocal claudebl setup
```

With a global install, all `claudebl` commands work from any directory. In a source checkout without an npm install, use `node cli.cjs COMMAND` or the platform launchers below. npm installation creates the CLI command but does not configure Desktop or start the proxy; `setup` does that.

## Install from GitHub Packages

The package is also available as [`@geronimodennis/claudecodebridgetolocal`](https://github.com/users/geronimodennis/packages/npm/package/claudecodebridgetolocal) on GitHub's npm registry. Its executable is still `claudebl`.

GitHub's npm registry requires authentication even for public packages. Sign in using your GitHub username and a personal access token (classic) with `read:packages` as the password; do not use your GitHub account password:

```sh
npm login --scope=@geronimodennis --auth-type=legacy --registry=https://npm.pkg.github.com
npm install -g @geronimodennis/claudecodebridgetolocal --registry=https://npm.pkg.github.com
claudebl setup
```

The unscoped npmjs.org package above remains available for installation without GitHub registry authentication. See [GitHub's npm registry documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry).

Maintainers can dispatch the **Publish to GitHub Packages** workflow. It tests the source, adds the GitHub scope and repository metadata in the runner, and publishes with the temporary `GITHUB_TOKEN`. It does not change the unscoped npmjs.org package metadata in the source checkout.

This is an **experimental compatibility bridge**, not an official Claude Desktop integration for non-Claude models. It presents a Claude-shaped route ID to Desktop, translates it to the actual Ollama model, and labels the picker with the actual model name. The model is still Qwen, Gemma, or whichever Ollama model you select. Some Chat, Code, and Cowork features may not work because Ollama implements only part of the Anthropic API.

## Quick setup

In version 1.1.3, **This computer** runs the bridge locally. **Remote / LAN**
connects Desktop directly to a bridge already hosted on the remote server and
starts no local proxy. The remote choice asks for its HTTPS URL and credential.
An HTTP Ollama URL is not a remote bridge URL; provision the bridge using
[remote server setup](REMOTE-SETUP.md) first. Earlier LAN examples using an HTTP
Ollama URL describe the old local-bridge-to-LAN behavior and no longer apply to
`setup --location lan`.

Extract the ZIP into a folder you can keep. Install Node.js from [nodejs.org](https://nodejs.org/) if needed, then open a new terminal. Do not run the wizard as Administrator or with `sudo`.

| Platform | Start the wizard |
| --- | --- |
| Windows | Run `.\run.cmd setup` in PowerShell |
| macOS | Run `sh run.sh setup` in Terminal |
| Linux | Run `sh run.sh setup` |
| All platforms, from source | Run `node cli.cjs setup` |

Run commands from the extracted folder, or supply the full path to the launcher. Windows can also use Codex's bundled Node runtime when Node is absent from PATH. Other machines should install Node normally. The package does not include a runtime or silently install one.

The wizard asks:

1. **Provider:** Ollama. Version 1 supports Ollama only, not arbitrary OpenAI-compatible providers.
2. **Location:** this computer or remote LAN.
3. **Address:** local defaults to `http://127.0.0.1:11434`; LAN asks for the hosted bridge HTTPS URL, such as `https://bridge.example.com`.
4. **Model:** it checks `/api/tags` and lists the server's available models. Enter a number or exact model name. Choose a tool-capable model for Code or Cowork. Cloud-backed Ollama models are identified when the server reports them.
5. **Proxy port:** defaults to `11435`; choose another if occupied.
6. **Review and apply:** the wizard shows the addresses and paths, asks before saving, backs up the previous Desktop selection, and starts the proxy.
7. **Optional test:** send a short prompt with a 30-second limit. A test failure leaves the setup installed and reports inference as unverified.

Fully quit Claude Desktop and reopen it after setup. If it offers a configured third-party connection, select that connection. Choose **Ollama: YOUR-MODEL (proxy)** in the model picker, then try a short prompt. Desktop must support third-party inference configuration; older releases may need an update.

## One-command setup

For a LAN server (replace the address and model with your own):

```sh
claudebl setup --provider ollama --location lan --url https://bridge.example.com --yes
```

For a local server, replace the URL and model with your own:

```sh
claudebl setup --provider ollama --location local --url http://127.0.0.1:11434 --model "YOUR-MODEL" --yes
```

`--yes` skips the review confirmation. Add `--test` for the optional inference check. The provider and model must still be reachable and present. With no `--yes`, use the interactive wizard. No credentials are required for a normal local/LAN Ollama server; an authenticated reverse proxy in front of Ollama is not supported by this version.

## Everyday commands

`claudebl status` shows the Ollama server URL, local bridge URL, and Desktop
gateway URL separately. A hosted remote bridge reports the local bridge as
unused and shows the remote HTTPS gateway instead.

For a bridge hosted on the Ollama server instead of this computer, see
[remote bridge setup](REMOTE-SETUP.md). The current release includes `server-init`,
`serve`, and `connect`; these require an HTTPS bridge endpoint on your server.

From the source folder, you can also use `npm run claudebl -- COMMAND`.
In Windows PowerShell use `npm.cmd` to avoid script execution-policy restrictions:

```powershell
npm.cmd run claudebl -- setup
npm.cmd run claudebl -- open
npm.cmd run claudebl -- version
```

Running `npm.cmd run claudebl` without a command starts the setup wizard.

Print the installed CLI version with `claudebl version` or `claudebl --version`.
From the Windows source folder, use `.\run.cmd version`.

Use `claudebl open` to launch Claude Desktop. From this source folder on Windows,
run `.\run.cmd open`. The command discovers Windows Store installations, uses
`open -a Claude` on macOS, and `claude-desktop` on Linux. For a custom executable:

```powershell
claudebl.cmd open --app "C:\path\claude-desktop.exe"
```

This opens the app; it does not restart an already-running app or start the proxy.
Run `claudebl start` first when the proxy is stopped.

| Action | All platforms | Windows shortcut | macOS/Linux shortcut |
| --- | --- | --- | --- |
| Start in background | `claudebl start` | `.\run.cmd start` | `sh run.sh start` |
| Stop proxy | `claudebl stop` | `.\run.cmd stop` | `sh run.sh stop` |
| Check status | `claudebl status` | `.\run.cmd status` | `sh run.sh status` |
| Test provider and model | `claudebl doctor` | `.\run.cmd doctor` | `sh run.sh doctor` |
| Restore previous Desktop setup | `claudebl restore` | `.\run.cmd restore` | `sh run.sh restore` |

**After reboot:** Desktop's configuration is still saved, but the proxy is stopped. Run `start` again. There is no automatic startup, scheduled task, system service, or login item. Starting twice reports that the proxy is already running.

**Stop** stops only this wizard's proxy and leaves Desktop pointing to it. **Restore** stops the proxy and restores the prior Desktop selection. Fully quit Desktop before restore and reopen it afterwards. `start` after restore runs the proxy but does not reapply Desktop routing; run `setup` again to reconfigure Desktop.

To change provider address, model, or port: fully quit Desktop, run `restore`, then run `setup` again. Keep the extracted package for these commands. The running proxy uses a copy installed in your user data directory, so moving the extracted folder does not break it. Do not delete the installed files before restoring Desktop.

## Files, backups, and removal

| OS | Desktop configuration library | Proxy installation |
| --- | --- | --- |
| Windows | `%LOCALAPPDATA%\Claude-3p\configLibrary\` | `%LOCALAPPDATA%\ClaudeDesktopOllamaProxy\` |
| macOS | `~/Library/Application Support/Claude-3p/configLibrary/` | `~/Library/Application Support/ClaudeDesktopOllamaProxy/` |
| Linux | `~/.config/Claude-3p/configLibrary/` | `~/.config/ClaudeDesktopOllamaProxy/` |

Linux honors `XDG_CONFIG_HOME` when set. The proxy installation contains `settings.json`, `state.json`, `server.cjs`, `core.cjs`, `proxy.log`, and `backups/<configuration-id>/`. Logs include times, request routes, status codes, and tool counts; they exclude prompt text and credentials.

Setup writes one new `<id>.json` Desktop configuration and updates `_meta.json` to select it. Existing configurations are preserved. If metadata existed, the exact original bytes are backed up before any Desktop edit. If it did not exist, recovery records its absence. Restore verifies that the metadata has not changed since setup; if it has, it refuses to overwrite later changes. In that case use **Developer → Configure Third-Party Inference** to select the prior configuration, or inspect the saved metadata backup and merge it manually. Do not blindly overwrite later configurations.

For full removal, first run `restore`, then delete the proxy installation directory and extracted package after saving any backups you want to keep. No registry policies, managed settings, or original `claude_desktop_config.json` files are edited. The wizard refuses detected managed policies instead of overriding them; it conservatively treats any detected policy values as managed.

## Network behavior

```text
Claude Desktop
    → authenticated proxy at http://127.0.0.1:11435
    → Ollama server at your configured HTTP(S) URL
    → your chosen Ollama model
```

The proxy binds to loopback only. Setup generates a separate random local credential and saves it in Desktop's proxy configuration. It forwards the fixed `ollama` placeholder upstream, never your Anthropic account token. Desktop sends the internal route ID `claude-sonnet-4-6`; the proxy replaces it with your exact Ollama model name. The picker explicitly identifies the actual Ollama model.

Messages, tools, thinking, and streaming content are forwarded without silently stripping them. Model IDs in returned message envelopes are mapped back to the route ID. `/v1/models` advertises the selected model; `/v1/messages/count_tokens` is passed upstream and may return unsupported if Ollama does not implement it. Other endpoints return an explicit error. This is an inference bridge, not a general web proxy. HTTP LAN traffic follows the URL you enter; use an HTTPS Ollama endpoint if your network requires encryption.

## Troubleshooting

- **Port occupied:** stop the earlier proxy or choose `--port 11436`. This wizard does not kill unrelated processes.
- **Cannot reach LAN server:** confirm Ollama listens on the LAN interface and the server firewall permits its port. Configure that on the server separately; this wizard does not change server settings.
- **Model response timeout:** `doctor` waits 30 seconds; the proxy allows up to ten minutes of upstream inactivity. A busy server or a model loading a large context can be slow. Check Ollama logs and retry a simple prompt directly against `/v1/messages`.
- **Cloud-backed model:** prompts may go to Ollama's cloud service even when the Ollama endpoint is local or LAN. Choose an installed local model if that matters to you.
- **Desktop ignores settings:** fully quit and reopen it; check whether managed configuration takes precedence. On Windows Store builds, also inspect the app's package-virtualized `LocalCache\Local\Claude-3p\configLibrary` if Desktop created a separate library there. This wizard uses the documented canonical path and does not overwrite a separate virtualized copy.
- **A feature fails:** Ollama supports a subset of the Anthropic API. Successful model discovery does not prove Chat, Code, Cowork, hosted tools, or sandbox networking all work.

## Validation and current limitations

`node --test test.cjs` runs isolated tests for all three platform path layouts, URL validation, backup/restore, authentication, model mapping, UTF-8 streaming, tool preservation, upstream errors, and detached process start/stop. The tests ran on Windows. macOS and Linux launchers and path handling are provided, but were not tested on native macOS/Linux hosts here. A real request to the LAN Qwen model in this chat previously timed out after three minutes; full Desktop inference remains unverified.

No live Desktop configuration is changed merely by extracting this package. Run `setup` to apply it. This wizard does not automatically migrate earlier scripts from this chat.

Sources: [Claude Desktop configuration reference](https://claude.com/docs/third-party/claude-desktop/configuration) and [Ollama Anthropic compatibility](https://docs.ollama.com/api/anthropic-compatibility).

## Development and publication

```sh
npm test
npm pack
```

Tests use temporary configuration directories and a mock provider, not your live Desktop settings. `npm pack` includes only the allowlisted runtime, launchers, and documentation. It excludes logs, user credentials, backups, tests, and GitHub files. There are no install/postinstall scripts and no runtime dependencies.

To publish, the owner must sign in to npm and satisfy any account/package two-factor requirements:

```sh
npm login
npm publish --access public
```

Publication is a separate step; building the tarball does not publish it. The repository workflow runs tests on Windows, macOS, and Linux with Node 20, 22, and 24; it does not publish automatically. This release retains all rights (`UNLICENSED`) until the owner chooses an open-source license.

The redundant platform setup wrappers were removed in v1.1.3. Use run.cmd, run.sh, node cli.cjs, or npm run claudebl -- COMMAND instead.

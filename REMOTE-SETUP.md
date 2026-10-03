# Host the bridge on your Ollama server

This source version supports:

```text
Claude Desktop → HTTPS bridge on remote server → Ollama on that server
```

Node.js 20+ is required on the server and client. Version 1.1.0 is currently built
from source; do not install the older 1.0.3 registry package for these commands.

## On the server

Copy this project folder to the server. From that folder:

```sh
node cli.cjs server-init --url http://127.0.0.1:11434 --model YOUR-MODEL
node cli.cjs serve --config remote-server.json
```

`server-init` verifies the model and generates a credential stored in
`remote-server.json`. Preserve this file privately; do not commit or share it.
`serve` runs in the foreground until Ctrl+C. It binds only to server loopback
at port 11435. For persistent hosting, your server administrator should manage
this command through the OS service manager.

Provide an HTTPS reverse proxy on this same server, routing your chosen hostname
to `http://127.0.0.1:11435`. For example, with Caddy installed and a hostname you
control, a Caddyfile is:

```text
bridge.example.com {
    reverse_proxy 127.0.0.1:11435
}
```

Replace `bridge.example.com` with your own hostname. DNS, firewall access, and a
certificate trusted by the Desktop client must be configured on your network.
For private LAN certificates, install your CA through your normal trust-store
process. The bridge never disables TLS certificate verification. Its remote
health and inference endpoints both require the generated credential.

## On the Desktop computer

Fully quit Claude Desktop. If the earlier local wizard setup is active, restore
it first (this stops its local proxy and preserves configuration backups):

```powershell
.\run.cmd restore
```

Securely transfer only the server credential. In PowerShell you can read it
without displaying it:

```powershell
$secret = Read-Host 'Remote bridge credential' -AsSecureString
$env:CLAUDEBL_REMOTE_TOKEN = [System.Net.NetworkCredential]::new('', $secret).Password
.\run.cmd connect --url https://bridge.example.com
Remove-Item Env:CLAUDEBL_REMOTE_TOKEN
.\run.cmd doctor
.\run.cmd open
```

On macOS/Linux set `CLAUDEBL_REMOTE_TOKEN` in your shell and run
`node cli.cjs connect --url https://bridge.example.com`, then unset the environment
variable. Avoid putting credentials into shell history. The client saves the
credential in its private configuration, just as required by Desktop itself.

`connect` verifies the remote bridge before backing up and applying Desktop
configuration. No client-side proxy is started. `doctor` tests the remote bridge;
`start` checks remote reachability; `stop` leaves the remote process running.
Manage the remote process on the server. `restore` returns Desktop to its prior
configuration without stopping the shared server.

This prepares remote hosting support; it does not remotely install anything,
change your firewall, generate a domain, or provision a certificate. Actual
deployment and full Desktop behavior must be tested with your server.

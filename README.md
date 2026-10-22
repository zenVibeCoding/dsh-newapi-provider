# New API Provider

English · [中文](README.zh.md)

A New API gateway workbench for DeepSeek Harness. **Development build; not published to npm yet.**

## Features

- Save multiple gateways and activate exactly one; each has its own URL, credential reference and model overrides.
- Add, edit, test, activate and remove gateways in **Settings → New API Provider**.
- Show token quota and usage. Unlimited tokens show used quota, not a misleading negative remaining amount.
- Discover gateway models; enrich context size, output limits and modalities from models.dev.
- Search models and edit context, output cap, type, input capabilities and visibility without YAML.
- Generate images as durable DSH attachments; experimental videos use the unified `/v1/videos` interface with background polling.

## Requirements and local installation

Verified runtime: **DSH 0.2.1-rc.2**, Node.js 22.19+. Install the local project directory using DSH's plugin manager, refresh the existing page, then open Settings → New API Provider. No separate web server is needed. Do not install this name from npm before publication.

This replaces, rather than depends on, `dsh-gateway-provider`. Two adapters cannot own the same provider route. The development installation uses `newapi-provider`; an existing route name can be retained through `providerId` after removing the previous owner.

## Gateways

Add a name, site URL and New API calling token. Connection testing only reads the model list and does not make paid generation requests. A listed model may still lack an enabled upstream channel.

Only one gateway is active. Switching changes subsequent calls through this plugin across sessions, but does not alter unrelated adapters. Already submitted video tasks retain their origin gateway.

Legacy flat `baseURL` / `apiKeyEnv` settings remain readable and migrate to `channels` on the first settings-page save. Tokens are accessed via the DSH credential service, not stored in gateway configuration or echoed back to the browser. Configuration revisions protect against overwriting concurrent edits.

Model overrides are per gateway. Editors retain the gateway they were opened for, even if another window changes the active gateway.

## Balance and capabilities

Quota is read from `/api/usage/token/` and converted using `/api/status` fields (`quota_per_unit`, `quota_display_type`, `usd_exchange_rate`), never the top-up price. Recent New API versions can return account quota when the token's **Allow user quota query** permission is enabled.

models.dev metadata is cached. Exact, base-model, default and user-supplied values are distinguished. Metadata is not proof that the relay supports a feature. DSH chat currently accepts text and image inputs only; PDF, audio and video tags are informational.

## Tools

- `newapi_balance`, `newapi_models`: active gateway quota and catalog.
- `newapi_channels`: gateway configuration and connection checks; shares the settings-page operations.
- `newapi_image_generate`: image generation; `inputImages` selects the editing endpoint.
- `newapi_video_generate`, `newapi_video_status`: submit and follow video tasks.

Image/video submissions can be billed. An ambiguous submission is not automatically retried. Stopping local monitoring does not cancel upstream generation or guarantee a refund.

## Verification status

- Real chat, model discovery and quota checks have passed on a local New API instance.
- The real image test was rejected with HTTP 503 (no available upstream channel). Successful paid image generation remains unverified; the offline attachment pipeline is tested.
- Video is experimental: no real video channel was available. Offline tests cover submission, polling, download, restart recovery and duplicate-submission prevention.
- Live UI registrations have been inspected; visual acceptance still requires checking the connected DSH page.

## Development

```sh
npm test
node --check index.js
node --check client.js
npm pack --dry-run --ignore-scripts
```

DSH runtime imports are optional peerDependencies, supplied by the host. Tests use fake gateways and no personal credentials. Publishing, creating a public repository and marketplace submission each require separate confirmation. Personal gateway data, credentials and research notes must not ship in the package.

MIT License. Uses public DSH exports and pi-ai protocol implementations; no third-party plugin source is vendored.

Vendor marks in the model list come from [LobeHub Icons](https://github.com/lobehub/lobe-icons) (`@lobehub/icons-static-svg` 1.97.0, MIT License), inlined as SVG so the page makes no remote image requests. Brand marks belong to their respective owners and are used only to identify a model's vendor.

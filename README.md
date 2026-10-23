# New API Provider

English · [中文](README.zh.md)

A New API gateway workbench for DeepSeek Harness: several gateways with one active at a time, per-gateway model lists and parameter overrides, quota, and image and experimental video generation. **Development build; not published to npm yet.**

## Features

- Save multiple gateways and activate exactly one. Each keeps its own URL, credential reference, model list and model overrides.
- Channel-scoped model management: fetch what a gateway lists, choose which models appear in DSH, test one model, remove with undo, add models the gateway does not list.
- Capability data from models.dev (context window, output cap, modalities, reasoning), correctable per model, with an optional per-model upstream name mapping.
- Token quota plus account balance when the token is allowed to query it; unlimited tokens show used quota instead of a negative remainder.
- Generate images as durable DSH attachments; experimental video through the unified `/v1/videos` interface with background polling and restart recovery.

## Requirements and local installation

Verified runtime: **DSH 0.2.1-rc.2**, Node.js 22.19+. Install the local project directory with DSH's plugin manager, refresh the page, then open **Settings → New API Provider**. No separate web server is needed. Do not install this name from npm before it is published.

This replaces, rather than depends on, `dsh-gateway-provider`; two adapters cannot own the same provider route. The development installation uses the `newapi-provider` route.

## Migrating from the former name (v0.7.0)

The plugin was called `dsh-newapi-studio`. The rename covers the package, the loader row and provider route (`newapi-provider`), the HTTP prefix (`/newapi-provider/api/`) and the data directory (`plugin-data/dsh-newapi-provider`).

To migrate an existing installation, back up the profile patch and plugin data, then keep each channel's id, credential reference, model list and overrides while moving the data directory to the new name. This release does not read the old directory automatically. Keep existing credential references even if they contain `STUDIO`: they still hold the working tokens; new references use the `NEWAPI_PROVIDER_` prefix.

Sessions pinned to the old `newapi-studio` route must pick models again under the new route. Other adapters are unaffected. Tool names (`newapi_channels`, `newapi_models`, …) did not change.

## Gateways

1. **Add gateway**: name, site URL and a New API calling token.
2. **Test connection** reads the model list only and does not make paid model calls; it also shows the gateway version and model counts.
3. **Activate** switches every subsequent call made through this plugin, or tick "activate after saving".
4. Switching never rewrites other adapters or your default provider.
5. Submitted video tasks keep their originating gateway and are never polled on a newly activated one.

Legacy flat `baseURL` / `apiKeyEnv` settings are still readable and are migrated to `channels` on the first settings-page save. Tokens live only in the DSH credential service: they are never echoed to the browser, never written into gateway configuration, never sent to a changed address without being re-entered, and are redacted from errors. Configuration writes carry a revision, so a stale editor gets a conflict instead of overwriting another window.

## Balance

- Quota comes from `GET /api/usage/token/` (note the trailing slash).
- Amounts are converted with `/api/status` (`quota_per_unit`, `quota_display_type`, `usd_exchange_rate`), never the top-up price.
- A token that allows user-quota queries also reports the account balance.
- Both numbers are the site's own; a present catalog or balance does not prove an upstream channel can serve a model.

## Per-gateway model lists

Each gateway keeps an independent list, even when two gateways point at the same site with the same token:

- **Model capabilities tab** has a gateway picker; the active gateway is marked and its list edits apply to that gateway only.
- **Fetch models** reads the gateway catalog and lets you add what you select; models the gateway no longer lists are shown separately and are never removed automatically.
- **Remove** only removes the model from this gateway; custom parameters can be kept and the removal can be undone briefly.
- **Add manually** is for models the gateway can serve but does not list.
- Gateways created in this version start with an empty list; channels saved before the feature existed stay in automatic mode (all gateway models) until their first edit, which materialises the list from what the gateway currently lists.

## Testing models

- **Chat models**: one minimal streaming request. The result remembers success, total latency, first packet time and a redacted error. A stream that only sends `[DONE]` counts as a failure, because it carries no protocol response.
- **Image/video models**: a real generation, so each test asks for confirmation first. Image tests show a preview when the URL is safe to embed; a signed URL is recorded as generated without exposing it.
- **Batch test** covers the chat models currently filtered, three at a time. Stopping prevents queued requests; requests already sent still finish and may be billed.
- Tests are billed requests: chat tests send a tiny completion, image/video tests generate.

## Model names and mapping

- **Local model id**: the stable id used by sessions and the model list; never changed by the editor.
- **Display name** (`name`): label only.
- **Upstream model name** (`upstreamModel`): the `model` actually sent. Empty means the local id. Mapping is one hop and applies to chat, image generation, image edits, video and model tests.
- The editor previews the mapping, resolves automatic protocol/capabilities/pricing from the mapping target, and lets input modalities and reasoning follow the catalog or be pinned. Reset clears every override including the mapping.

Capability data is a hint, not proof: a relay may list a model and still fail to serve it. DSH chat currently accepts text and image input only; PDF, audio and video tags are informational.

## Tools

| Tool | Purpose |
| --- | --- |
| `newapi_balance` | Quota of the active gateway's token (and account, when allowed). Free. |
| `newapi_models` | Models of a gateway (`channelId` optional, defaults to active) with kind, limits, modalities, pricing, mapping. Free. |
| `newapi_channels` | `list`, `test`, `save`, `activate`, `delete`, `model_override`, `models_discover`, `models_set`, `model_test`. Writes need a revision. |
| `newapi_image_generate` | Text-to-image, or image editing when `inputImages` is given. Saves attachments. |
| `newapi_video_generate` | Submits a video task and returns its id. Billed per task. |
| `newapi_video_status` | Lists or checks video tasks and returns the saved file. |

Settings-page actions and these tools share one service, so nothing can drift between the UI and the agent.

## Paid results (v0.7.1)

- A video submission that loses the connection or returns an unreadable body after HTTP 200 is reported as **submission unknown, possibly billed**, and is never resent automatically.
- A video that finished upstream but failed to download stays **generated, retrying download**. Only GET requests are retried, against refreshed URLs; when the recovery deadline passes it becomes **generated, download unsuccessful**. Do not regenerate.
- Concurrent status checks of one task share a single flow, and unloading the plugin aborts in-flight requests so a stale instance cannot overwrite the new cache.
- Failed paid requests are never retried automatically.

## Verification status

- Real chat, model discovery, quota and per-channel lists have been exercised against a local New API instance.
- A real image request was rejected with HTTP 503 (no available upstream channel). Successful paid image generation is therefore **not yet verified**; the attachment pipeline is covered by offline tests.
- Video is **experimental**: no real video channel was available. Submission, polling, download recovery, restart recovery and duplicate-submission prevention are covered offline only.
- The settings page has been rendered and checked locally against the plugin stylesheet; final visual acceptance requires the connected DSH window.

## Development

```sh
npm test
node --check index.js
node --check client.js
npm pack --dry-run --ignore-scripts
```

DSH runtime imports are optional peerDependencies supplied by the host, so no DSH package is installed or copied here. Tests use local fake gateways and never read personal credentials.

npm publishing, creating a public repository and marketplace submission are separate manual steps; see [PUBLISHING.md](PUBLISHING.md). Keep personal gateway data, credentials, research notes and session screenshots out of the package.

MIT License. Uses public DSH exports and pi-ai protocol implementations; no third-party plugin source is vendored.

Vendor marks in the model list come from [LobeHub Icons](https://github.com/lobehub/lobe-icons) (`@lobehub/icons-static-svg` 1.97.0, MIT License), inlined as SVG so the page makes no remote image requests. Brand marks belong to their respective owners and only identify a model's vendor.

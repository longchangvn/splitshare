---
slug: "forward-github-env-to-container-app"
createdAt: "2026-10-19T01:37:24.203Z"
---

## Why

The `cd-api.yml` GitHub Actions workflow hardcodes every environment variable (read, pass, jq filter, add to `ENV_ARGS`). Adding a new variable means touching multiple places in the workflow, which is error-prone and doesn't scale. A generic mechanism to forward GitHub environment variables to the container app — only when not already present — eliminates this repetitive boilerplate.

## What Changes

- Replace the hardcoded notification env var handling in `cd-api.yml` with a generic env-sync step that:
  - Reads all available GitHub environment vars and secrets
  - Fetches the container app's current env var names
  - Forwards only the vars that don't already exist on the container
  - Preserves existing container env values (never overwrites)
- The same pattern can later be applied to `cd-web.yml` if needed

## Capabilities

### New Capabilities
- `env-sync`: Generic environment variable forwarding from GitHub Actions to Azure Container Apps

### Modified Capabilities
<!-- No existing capabilities are modified — this is a new CI/CD tooling capability -->

## Impact

- `.github/workflows/cd-api.yml` — main implementation target
- Azure Container Apps deployment behavior — new env vars appear without manual workflow edits
- Secrets handling — REST API keys and other secrets must be masked in logs

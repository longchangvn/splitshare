---
slug: "load-env-mapping-from-file"
createdAt: "2026-10-19T02:07:11.549Z"
---

## Why

The `cd-api.yml` workflow hardcodes each `env_sync_add` call with a specific GitHub variable name and Azure env var name. Adding a new environment variable requires editing the workflow file. Loading the mapping from a file decouples variable configuration from pipeline code.

## What Changes

- Add a mapping file (e.g. `deploy/env-mapping.json`) that defines which GitHub vars/secrets map to which Azure container env var names
- Replace hardcoded `env_sync_add` calls in `cd-api.yml` with a loop that reads the mapping file
- Each entry specifies: Azure env var name, GitHub variable name, and whether it's a secret

## Capabilities

### New Capabilities
- `env-mapping-file`: File-driven environment variable mapping for CD pipeline

### Modified Capabilities
<!-- No existing capabilities modified -->

## Impact

- `.github/workflows/cd-api.yml` — reads mapping file instead of hardcoded calls
- `deploy/env-mapping.json` — new mapping configuration file
- Adding new env vars requires only a JSON edit, not a workflow change

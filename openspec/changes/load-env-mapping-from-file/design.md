## Context

The `forward-github-env-to-container-app` change introduced a generic `env_sync_add` function with hardcoded calls. Each new env var still requires editing the workflow. A mapping file decouples this.

## Goals / Non-Goals

**Goals:**
- Replace hardcoded `env_sync_add` calls with a loop driven by a JSON mapping file
- Adding a new env var requires only a JSON edit
- Support both vars and secrets with masking

**Non-Goals:**
- No validation of mapping file schema beyond basic jq parsing
- No support for conditional logic or transformations

## Decisions

**Format: JSON array of objects**

```json
[
  {"azureName": "Notification__Provider", "githubName": "NOTIFICATION__PROVIDER", "isSecret": false},
  {"azureName": "Notification__OneSignal__AppId", "githubName": "NOTIFICATION__ONESIGNAL__APPID", "isSecret": false},
  {"azureName": "Notification__OneSignal__ApiKey", "githubName": "NOTIFICATION__ONESIGNAL__APIKEY", "isSecret": true}
]
```

**Location: `deploy/env-mapping.json`** — co-located with deployment config, easy to find.

**Alternative considered: YAML** — rejected because `jq` is already used in the workflow and JSON is natively supported.

## Risks / Trade-offs

- Mapping file must be present in the repo or the workflow fails
- No schema validation — typos in field names cause silent failures
- GitHub variable names are case-sensitive and must match exactly

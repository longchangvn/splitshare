## Purpose

Generic environment variable forwarding from GitHub Actions to Azure Container Apps, eliminating per-variable hardcoding in the deployment workflow.

## ADDED Requirements

### Requirement: Generic env var forwarding

The deployment workflow SHALL read all available GitHub environment variables and secrets, compare them against the container app's existing environment variables, and forward only those that are not already present on the container.

#### Scenario: Forward new variables from GitHub environment to container app

- **WHEN** the `cd-api.yml` workflow runs with GitHub environment variables set
- **THEN** the workflow reads all vars and secrets from the GitHub environment
- **AND** fetches the container app's current env var names
- **AND** adds only the vars that don't already exist on the container
- **AND** skips any var that already exists on the container app

#### Scenario: Preserve existing container env values

- **WHEN** a variable with the same name already exists on the container app
- **THEN** the existing value is preserved unchanged
- **AND** the GitHub environment value is not applied

#### Scenario: Mask secret values in logs

- **WHEN** a secret value is forwarded to the container app
- **THEN** the secret value is masked in workflow logs using `::add-mask::`

#### Scenario: Handle both update and create paths

- **WHEN** the container app already exists (update path)
- **THEN** the generic env sync runs as part of the jq-based update
- **WHEN** the container app does not exist (create path)
- **THEN** the generic env sync runs as part of `ENV_ARGS` construction

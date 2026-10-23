## Purpose

File-driven environment variable mapping for the CD pipeline, eliminating hardcoded `env_sync_add` calls when new variables are added.

## ADDED Requirements

### Requirement: Load env mapping from JSON file

The deployment workflow SHALL read a JSON mapping file that defines which GitHub environment variables and secrets map to which Azure container app environment variable names.

#### Scenario: Read mapping file and forward vars

- **WHEN** the `cd-api.yml` workflow runs
- **THEN** it reads the mapping file (e.g. `deploy/env-mapping.json`)
- **AND** for each entry, looks up the corresponding GitHub var or secret
- **AND** forwards the value to the container app if not already present

#### Scenario: New variable added without workflow change

- **WHEN** a new entry is added to the mapping file
- **THEN** the variable is automatically forwarded on the next workflow run
- **AND** no workflow file modification is needed

#### Scenario: Mapping file entry structure

- **WHEN** the mapping file is parsed
- **THEN** each entry contains: `azureName` (env var name on container), `githubName` (GitHub var/secret name), `isSecret` (boolean)

#### Scenario: Secret masking

- **WHEN** an entry has `isSecret: true`
- **THEN** its value is masked in workflow logs

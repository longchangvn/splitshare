## 1. Add mapping file

- [ ] 1.1 Create `deploy/env-mapping.json` with entries for all current notification vars

## 2. Replace hardcoded env_sync_add with file-driven loop

- [ ] 2.1 Add a step in `cd-api.yml` that reads the mapping file with `jq` and builds the env_sync arrays
- [ ] 2.2 Remove the three hardcoded `env_sync_add` calls
- [ ] 2.3 Keep the existing `env_sync_add` function for masking and dedup logic

## 3. Verify

- [ ] 3.1 Run workflow and confirm vars appear on container app
- [ ] 3.2 Add a test entry to the mapping file and confirm it's picked up without workflow changes

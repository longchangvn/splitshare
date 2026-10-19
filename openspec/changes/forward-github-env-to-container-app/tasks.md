## 1. Add generic env-sync step to cd-api.yml

- [x] 1.1 Add a bash step before section 6 that fetches existing container env var names via `az containerapp show`
- [x] 1.2 Define parallel arrays of GitHub var names and their values (vars + secrets)
- [x] 1.3 Loop over the arrays, check if each var name exists in the container's env, and collect the ones that are missing
- [x] 1.4 Mask all secret values with `::add-mask::` in the loop

## 2. Integrate env-sync into update path

- [x] 2.1 Pass the collected env vars as jq arguments to the existing jq filter
- [x] 2.2 Add the new vars to the `.properties.template.containers[0].env` array in the jq expression

## 3. Integrate env-sync into create path

- [x] 3.1 Add the collected env vars to the `ENV_ARGS` array before `az containerapp create`

## 4. Verify and test

- [ ] 4.1 Run workflow with new GitHub env vars set and confirm they appear on the container app
- [ ] 4.2 Run workflow again and confirm existing vars are skipped (idempotent)
- [ ] 4.3 Verify secrets are masked in workflow logs

## Verification Notes
- Added generic env_sync_add function with allowlist, existing-name check, secret masking, and jq array conversion for update path
- Updated jq filter to use env_sync arrays for update path and ENV_ARGS loop for create path, replacing all hardcoded notification references

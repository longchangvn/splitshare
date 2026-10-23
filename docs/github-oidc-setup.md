# GitHub Actions OIDC setup (Azure login)

The CD workflows (`cd-api.yml`, `cd-web.yml`) log in to Azure with OIDC — no
stored Azure password. Entra ID only issues a token if the presented OIDC
token's `sub` (subject) matches a **federated identity credential** on the app
registration. The `sub` depends on the job:

| Job declares… | `sub` |
| --- | --- |
| no `environment:` | `repo:<owner>@<ownerId>/<repo>@<repoId>:ref:refs/heads/<branch>` |
| `environment: <env>` | `repo:<owner>@<ownerId>/<repo>@<repoId>:environment:<env>` |

`cd-api.yml` declares `environment: ${{ inputs.environment }}` so it can read
environment-level **and** repository-level vars/secrets (environment wins on
name conflicts). That changes the subject, so each environment needs its own
federated credential. If it's missing you'll see:

```
AADSTS700213: No matching federated identity record found for presented
assertion subject 'repo:...:environment:<env>'
```

## Fix

Run the setup script once per environment (locally, with `az login` as an
account that can manage the app registration / managed identity):

```sh
az login
scripts/setup-github-oidc.sh splitshare-test
```

The Azure client id is **auto-detected** from the subscription's service-principal
role assignments (the deploying principal is the one holding a role like
Contributor). If several principals hold roles, the script prints them and asks
you to pass the id explicitly:

```sh
scripts/setup-github-oidc.sh <SPLITSHARE_AZURE_CLIENT_ID> splitshare-test
```

The same command also works when the GitHub OIDC principal is a **managed
identity** instead of an app registration — the script detects
`servicePrincipalType` and uses `az identity federated-credential` in that case
(searching resource group `$RG`, default `splitshare`, then the whole
subscription).

Add more environments as needed:

```sh
scripts/setup-github-oidc.sh splitshare-test production
```

The script is idempotent and additive — it never removes the existing
`ref:`-based credential, so `cd-web.yml` and other ref-subject workflows keep
working.

### Manual alternative (portal)

If the OIDC principal is an **app registration**: Entra ID → App registrations
→ your app → **Certificates & secrets** → **Federated credentials** → **Add
credential** → *GitHub Actions deploying Azure resources*, then set Organization
`longchangvn`, Repository `splitshare`, and select **Environment** =
`splitshare-test` (issuer `https://token.actions.githubusercontent.com`,
audience `api://AzureADTokenExchange`).

If the OIDC principal is a **user-assigned managed identity**: open the identity
→ **Federated credentials** → **Add credential** and fill in the same values.
(System-assigned managed identities cannot carry federated credentials — use an
app registration or a user-assigned identity for GitHub OIDC.)

## Why repository secrets are not enough

`SPLITSHARE_AZURE_CLIENT_ID` / `TENANT_ID` / `SUBSCRIPTION_ID` identify *which*
app/tenant/subscription to use — they resolve fine. The federated credential is
a separate Azure-side trust rule authorizing *that specific subject* to
impersonate the app. No repository secret can grant it.

# Mobile: Expo (Metro) dev server for Expo Go, hosted on Azure Container Apps.
# Not a production build — it serves the JS bundle that Expo Go loads from
# exp://<container-app-fqdn> (see .github/workflows/cd-mobile.yml).
#
# Build context is mobile/ (src/shared is committed, so web/ is not needed).
FROM node:22-bookworm-slim
WORKDIR /app

# CI=1: non-interactive CLI (no prompts / keypress UI).
# Runtime env (set at deploy time):
#   EXPO_TOKEN: Expo access token of the account testers sign in to Expo Go
#     with. Expo Go on a physical iPhone refuses unsigned dev manifests
#     ("not signed in to Expo CLI"); the CLI signs them with this account.
#   EXPO_PROJECT_ID: EAS project id (falls back to app.json extra.eas).
#   EXPO_PACKAGER_PROXY_URL: the public https origin, so the manifest's
#     hostUri / bundle URL point at the ingress, not the pod IP.
ENV CI=1 \
    EXPO_NO_TELEMETRY=1 \
    EXPO_NO_DOTENV=1 \
    PORT=8081

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . ./
COPY docker/app.config.js ./app.config.js

EXPOSE 8081
CMD ["sh", "-c", "exec npx expo start --lan --port \"$PORT\""]

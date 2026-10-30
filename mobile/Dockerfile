# Mobile: Expo (Metro) dev server for Expo Go, hosted on Azure Container Apps.
# Not a production build — it serves the JS bundle that Expo Go loads from
# exp://<container-app-fqdn> (see .github/workflows/cd-mobile.yml).
#
# Build context is mobile/ (src/shared is committed, so web/ is not needed).
FROM node:22-bookworm-slim
WORKDIR /app

# CI=1: non-interactive CLI (no prompts / keypress UI).
# EXPO_OFFLINE=1: no expo.dev calls (login, version checks, manifest signing);
#   Expo Go accepts the unsigned dev manifest.
# EXPO_PACKAGER_PROXY_URL (set at deploy time) = the public https origin, so
#   the manifest's hostUri / bundle URL point at the ingress, not the pod IP.
ENV CI=1 \
    EXPO_OFFLINE=1 \
    EXPO_NO_TELEMETRY=1 \
    EXPO_NO_DOTENV=1 \
    PORT=8081

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . ./

EXPOSE 8081
CMD ["sh", "-c", "exec npx expo start --lan --port \"$PORT\""]

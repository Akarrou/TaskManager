# Étape 1 : Build de l'app Angular
FROM node:22.16.0 AS builder

WORKDIR /app

# Installer pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copier les fichiers de dépendances (pour cache Docker)
COPY package.json pnpm-lock.yaml ./

# Installer les dépendances
RUN pnpm install --frozen-lockfile

# Copier les fichiers de configuration
COPY angular.json tsconfig.json ./
COPY tsconfig.app.json tsconfig.spec.json ./
COPY tailwind.config.js ./

# Copier le code source
COPY src ./src

# Build argument pour l'environnement
ARG BUILD_ENV=production

# Builder l'application Angular
RUN pnpm run build

# Étape 2 : Image finale pour servir le build
FROM nginx:alpine

# Installer gettext pour envsubst (injection variables runtime)
RUN apk add --no-cache gettext

# Copier le build Angular dans nginx
COPY --from=builder /app/dist/TaskManager-Angular/browser /usr/share/nginx/html

# Renommer index.csr.html en index.html pour Nginx
RUN mv /usr/share/nginx/html/index.csr.html /usr/share/nginx/html/index.html

# Copier la config nginx
COPY OBS/nginx.conf /etc/nginx/nginx.conf

# Copier le script d'entrypoint pour injection runtime des variables
COPY OBS/entrypoint.sh /docker-entrypoint.d/40-inject-env.sh
RUN chmod +x /docker-entrypoint.d/40-inject-env.sh

EXPOSE 4010

CMD ["nginx", "-g", "daemon off;"] 
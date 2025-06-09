# Étape 1 : Build de l'app Angular
FROM node:22.16.0 AS builder

WORKDIR /app

# Installer pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copier les fichiers nécessaires
COPY ../package.json ../pnpm-lock.yaml ./
COPY ../angular.json ../tsconfig.json ./
COPY ../tsconfig.app.json ../tsconfig.base.json ./
COPY ../tsconfig.spec.json ./
COPY ../tailwind.config.js ./
COPY ../.npmrc ./
COPY ../src ./src

# Installer les dépendances et builder l'app
RUN pnpm install --frozen-lockfile
RUN pnpm run build --filter TaskManager-Angular

# Étape 2 : Image finale pour servir le build
FROM nginx:alpine

# Copier le build Angular dans nginx
COPY --from=builder /app/dist/TaskManager-Angular /usr/share/nginx/html

# Copier la config nginx custom si besoin (optionnel)
# COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"] 
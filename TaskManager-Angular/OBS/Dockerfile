# Étape 1 : Build de l'app Angular
FROM node:22.16.0 AS builder

WORKDIR /app

# Installer pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copier les fichiers nécessaires
COPY ../package.json ../pnpm-lock.yaml ./
COPY ../angular.json ../tsconfig.json ./
COPY ../tsconfig.app.json ../tsconfig.spec.json ./
COPY ../tailwind.config.js ./
COPY ../src ./src

# Installer les dépendances et builder l'app
RUN pnpm install --frozen-lockfile
RUN pnpm run build

# Étape 2 : Image finale pour servir le build
FROM nginx:alpine

# Copier le build Angular dans nginx
COPY --from=builder /app/dist/TaskManager-Angular/browser /usr/share/nginx/html

# Renommer index.csr.html en index.html pour Nginx
RUN mv /usr/share/nginx/html/index.csr.html /usr/share/nginx/html/index.html

# Copier la config nginx custom (port 4210)
COPY OBS/nginx.conf /etc/nginx/nginx.conf

EXPOSE 4010
CMD ["nginx", "-g", "daemon off;"] 
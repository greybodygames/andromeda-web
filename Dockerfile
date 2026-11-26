# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=26.13.0
ARG NGINX_VERSION=1.30.7

FROM docker.io/node:${NODE_VERSION}-trixie-slim AS builder

USER node
RUN mkdir -p /home/node/workspace
WORKDIR /home/node/workspace

COPY --chown=node:node package.json package-lock.json ./

RUN npm ci --ignore-scripts

COPY --chown=node:node index.html tsconfig.json vite.config.ts ./
COPY --chown=node:node public/ public/
COPY --chown=node:node src/ src/
COPY --chown=node:node auth/style.css auth/style.css
COPY --chown=node:node auth/templates/ auth/templates/
COPY --chown=node:node plugins/ plugins/

RUN npm run build

FROM docker.io/nginx/nginx-unprivileged:${NGINX_VERSION}-trixie AS production

ARG NGINX_VERSION
ARG SITE_URL=https://andromeda.greybodygames.com

LABEL org.opencontainers.image.authors="Sayak Mukhopadhyay" \
      org.opencontainers.image.url="${SITE_URL}" \
      org.opencontainers.image.vendor="GreyBody Games" \
      org.opencontainers.image.licenses="LicenseRef-Proprietary" \
      org.opencontainers.image.title="Andromeda Web" \
      org.opencontainers.image.description="Static front page for Andromeda" \
      org.opencontainers.image.base.name="docker.io/nginx/nginx-unprivileged:${NGINX_VERSION}-trixie"

COPY --chown=nginx:nginx --from=builder /home/node/workspace/dist/ /usr/share/nginx/html/site/
COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf

USER nginx
EXPOSE 8080

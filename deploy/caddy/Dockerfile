# syntax=docker/dockerfile:1
# Caddy rebuilt with a patched Go and golang.org/x/net. The official 2.11.7 image is built with
# Go 1.26.8 and x/net v0.59.0, from before the October 2026 fixes to net/http, HTTP/2 and
# crypto/tls (Go 1.26.9 / 1.27.2, x/net v0.60.0). Once an official Caddy release carries them
# (docker run --rm caddy:2-alpine caddy build-info | head -3), docker-compose.yml can go back
# to plain `image: caddy:2-alpine`.
ARG CADDY_VERSION=2.11.7
FROM caddy:${CADDY_VERSION}-builder-alpine AS build
ARG CADDY_VERSION
# servers in mainland China: build with GOPROXY=https://goproxy.cn,direct
ARG GOPROXY=https://proxy.golang.org,direct
ENV GOPROXY=${GOPROXY}
RUN xcaddy build v${CADDY_VERSION} --replace golang.org/x/net=golang.org/x/net@v0.61.0 --output /usr/bin/caddy

FROM caddy:${CADDY_VERSION}-alpine
COPY --from=build /usr/bin/caddy /usr/bin/caddy

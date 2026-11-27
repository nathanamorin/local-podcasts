# The whisper.cpp shared library that Kronk (see cmd/worker) dlopens at
# runtime is linked against a very recent glibc (Ubuntu's current release),
# newer than Debian bookworm/trixie ship - so both the builder and the final
# runtime image use Ubuntu to match. Go isn't published as an official
# Ubuntu-based image, so it's installed directly from the upstream tarball.
FROM ubuntu:latest AS build

ARG GO_VERSION=1.27.4
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-$(dpkg --print-architecture).tar.gz" -o /tmp/go.tar.gz \
    && tar -C /usr/local -xzf /tmp/go.tar.gz \
    && rm /tmp/go.tar.gz
ENV PATH="/usr/local/go/bin:${PATH}"

# Set destination for COPY
WORKDIR /build

# Download Go modules
COPY go.mod .
COPY go.sum .
RUN go mod download

# Copy the source code. Note the slash at the end, as explained in
# https://docs.docker.com/engine/reference/builder/#copy
COPY . .

# Generate the OpenAPI/Swagger spec from Go handler annotations (swaggo/swag).
# This is regenerated on every build so it always matches the current source;
# the generated apidocs/ package is not committed to version control.
RUN go tool swag init -g cmd/server/main.go --output apidocs --parseInternal

# Build all three binaries: the API server (default CMD), the worker (used
# by the separate, horizontally-scalable worker Deployment via command
# override), and the one-off SQLite->PostgreSQL data migration tool (run as
# a Kubernetes Job during the cutover, then never again).
RUN GO111MODULE=on CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -a -installsuffix cgo -o local-podcasts ./cmd/server
RUN GO111MODULE=on CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -a -installsuffix cgo -o local-podcasts-worker ./cmd/worker
RUN GO111MODULE=on CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -a -installsuffix cgo -o local-podcasts-migrate-sqlite-to-postgres ./cmd/migrate-sqlite-to-postgres

FROM node:16-alpine as app

WORKDIR '/app'
COPY ./app/local-podcasts/ ./
RUN npm install
RUN npm run build

##
## Deploy
###

# Must stay on the same glibc-compatible Ubuntu base as the builder stage
# above - the dlopen'd whisper.cpp shared library's glibc version
# requirement must be satisfied by the runtime image's libc too. Both the
# server and worker Deployments run this same image (see
# k8s-deployment/deployments/apps/local-podcasts.yaml), differing only by
# command, so this affects both.
FROM ubuntu:latest

WORKDIR /app

# ca-certificates: needed for HTTPS podcast feed/episode fetches.
# libgomp1: OpenMP runtime required by the dlopen'd whisper.cpp shared
# library (Kronk transcription, see cmd/worker).
# libffi8: required by jupiterrider/ffi, Kronk's FFI bridge into the
# dlopen'd whisper.cpp library.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libgomp1 libffi8 && rm -rf /var/lib/apt/lists/*

RUN mkdir /app/static

# add new user
RUN useradd --create-home app


COPY --from=build /build/local-podcasts /app/local-podcasts
COPY --from=build /build/local-podcasts-worker /app/local-podcasts-worker
COPY --from=build /build/local-podcasts-migrate-sqlite-to-postgres /app/local-podcasts-migrate-sqlite-to-postgres
COPY --from=app /app/build /app/static/

RUN chown app:app -R /app
RUN chmod +x /app/local-podcasts /app/local-podcasts-worker /app/local-podcasts-migrate-sqlite-to-postgres

USER app:app

# This is for documentation purposes only.
# To actually open the port, runtime parameters
# must be supplied to the docker command.
EXPOSE 8080 8081

# Run
CMD [ "/app/local-podcasts" ]
FROM golang:1.27-alpine AS build

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

FROM alpine:latest

WORKDIR /app

RUN mkdir /app/static

# add new user
RUN adduser -D app


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
FROM golang:1.17-alpine AS build

# Set destination for COPY
WORKDIR /build

# Download Go modules
COPY go.mod .
COPY go.sum .
RUN go mod download

# Copy the source code. Note the slash at the end, as explained in
# https://docs.docker.com/engine/reference/builder/#copy
COPY podcast ./podcast
COPY main.go ./main.go
#COPY podcast ./

# Build
RUN GO111MODULE=on CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -a -installsuffix cgo -o local-podcasts .

FROM node:16-alpine as app

WORKDIR '/app'
COPY ./app/local-podcasts/src .
COPY ./app/local-podcasts/public .
COPY ./app/local-podcasts/package-lock.json .
COPY ./app/local-podcasts/package.json .
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
COPY --from=app /app/build /app/static/

RUN chown app:app -R /app
RUN chmod +x /app/local-podcasts

USER app:app

# This is for documentation purposes only.
# To actually open the port, runtime parameters
# must be supplied to the docker command.
EXPOSE 8080

# Run
CMD [ "/app/local-podcasts" ]
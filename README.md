# Local Podcasts

A fully self hosted podcast manager.  Download & save the full history of a podcast on a local server for fast access & play with the Local Podcasts PWA.  This does not currently save podcasts to your device but only saves podcasts on the local server, so will not provide offline / remote access when not on your home network.

# Installation

## Docker
```bash
docker run -p 8080:8080 -v <path to podcast storage directory>:/data ghcr.io/nathanamorin/local-podcasts:<latest release tag here>
```

## Kubernetes
Modify the included Kuberntes manifests ```deployment/deployment.yaml``` to match your environment.
```bash
kubectl apply -f deployment/deployment.yaml
```

Mobile
![Mobile Screenshot](./docs/img/mobile.png)
Desktop
![Desktop Screenshot](./docs/img/desktop.png)

# API Documentation

An OpenAPI 3.0 spec is generated from Go handler annotations (via [swaggo/swag](https://github.com/swaggo/swag)) at build time and served at `/openapi.json`. A [Redoc](https://github.com/Redocly/redoc) UI for browsing it is available at `/doc` (e.g. `http://localhost:8080/doc`).

Run `make generate-docs` to regenerate the spec locally before `go build`/`go test`, since the generated `apidocs/` package is not committed to version control.


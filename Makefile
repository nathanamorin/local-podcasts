mkfile_path := $(abspath $(lastword $(MAKEFILE_LIST)))
mkfile_dir := $(dir $(mkfile_path))

.PHONY: build up up-detach down logs dev frontend seed run sh

# Start all services with hot reload via Docker Compose (air for backend, npm start for frontend)
up:
	docker compose up --build -d
	$(MAKE) logs

# Stop all services
down:
	docker compose down

# Tail logs from all services
logs:
	docker compose logs -f

# Run the React frontend dev server locally (requires node/npm)
frontend:
	cd app/local-podcasts && npm start


# Seed default podcasts via the API (server must be running)
seed:
	curl -sf -X POST http://localhost:8080/podcasts -H "Content-Type: application/json" \
		-d '{"rss_url": "http://feeds.feedburner.com/dancarlin/history"}'
	curl -sf -X POST http://localhost:8080/podcasts -H "Content-Type: application/json" \
		-d '{"rss_url": "https://www.thisamericanlife.org/podcast/rss.xml"}'
	curl -sf -X POST http://localhost:8080/podcasts -H "Content-Type: application/json" \
		-d '{"rss_url": "https://feeds.simplecast.com/54nAGcIl"}'
	curl -sf -X POST http://localhost:8080/podcasts -H "Content-Type: application/json" \
		-d '{"rss_url": "https://feeds.feedburner.com/radiolab"}'
	curl -sf -X POST http://localhost:8080/podcasts -H "Content-Type: application/json" \
		-d '{"rss_url": "https://feeds.npr.org/510289/podcast.xml"}'
	curl -sf -X POST http://localhost:8080/podcasts -H "Content-Type: application/json" \
		-d '{"rss_url": "https://feeds.feedburner.com/freakonomicsradio"}'

# Build the production Docker image
build:
	docker build -t local-podcasts .

# Legacy single-container run targets
run:
	docker run -p 8080:8080 -v $(mkfile_dir)/.data:/data local-podcasts

sh:
	docker run -it -p 8080:8080 -v $(mkfile_dir)/.data:/data local-podcasts sh
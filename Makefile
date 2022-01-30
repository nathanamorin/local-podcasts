mkfile_path := $(abspath $(lastword $(MAKEFILE_LIST)))
mkfile_dir := $(dir $(mkfile_path))

build:
	docker build -t local-podcasts .

run:
	docker run -p 8080:8080 -v $(mkfile_dir)/.data:/data local-podcasts

sh:
	docker run -it -p 8080:8080 -v $(mkfile_dir)/.data:/data local-podcasts sh
SHELL:= /usr/bin/env bash
PYVER:= 3.13
venv:= .venv
vb:= $(venv)/bin
HERE:=$(notdir $(CURDIR))

src: $(vb)/yo $(vb)/pnpm
	echo -e 'onlyBuiltDependencies:\n  - esbuild' >pnpm-workspace.yaml && \
	\
	uv run yo code . --gitInit --bundler=esbuild --pkgManager=pnpm \
		--extensionType=ts \
		--extensionDisplayName="$(HERE)" \
		--extensionId="$(HERE)" \
		--extensionDescription="$(HERE)" && \
	\
	git add Makefile && git commit -m 'This bootstrap Makefile.' && \
	git add .vscode && git commit -m 'Initial .vscode subdir.' && \
	\
	sed -i '/^[[:space:]]*"presentation":/i\
            "options":{"env":{"PATH":"$${workspaceFolder}/$(vb):$${env:PATH}"}},' \
		.vscode/tasks.json && \
	git add .vscode && \
	git commit -m 'Hack up tasks so they use virtual environment.' && \
	\
	git add *.json *.*js .*.mjs *.yaml .*ignore src/*.ts && \
	git commit -m 'Initial `yo code` example extension.'
	\
	rm .npmrc
	git status

$(vb)/yo: $(vb)/npm
	uv run npm install --global yo generator-code

$(vb)/pnpm: $(vb)/npm
	uv run npm install --global pnpm@latest-10

$(vb)/npm: $(vb)/nodeenv
	uv run nodeenv --python-virtualenv --node=lts && \
	uv run npm install --global npm && \
	touch -r $(vb)/activate.csh $(vb)/activate

$(vb)/nodeenv: $(vb)/python
	uv pip install nodeenv

$(vb)/python:
	uv venv --managed-python --python=$(PYVER)

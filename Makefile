all: setup build

.PHONY: setup
setup:
	@aqua i && mise i

.PHONY: lint
lint:
	zizmor --config .github/lint/zizmor.yaml ./ && pinact run --check

.PHONY: test
test:
	npm ci --ignore-scripts
	node --test actions/cache-go/action.test.mjs
	node actions/slack-pr-review-request/message.test.js

.PHONY: check-clean
check-clean:
	@git status --short
	@test -z "$$(git status --porcelain)"

all: setup build

.PHONY: setup
setup:
	@aqua i && mise i

.PHONY: lint
lint:
	zizmor --config .github/lint/zizmor.yaml ./ && pinact run --check

.PHONY: test
test:
	node actions/slack-pr-review-request/message.test.js
	shellspec

.PHONY: check-clean
check-clean:
	@git status --short
	@test -z "$$(git status --porcelain)"

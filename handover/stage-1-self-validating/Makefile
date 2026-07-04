PYTHON ?= python3
OPA ?= opa

HANDOVER := handover/handover.json
DIGESTS := handover/digests.json
ATTESTATION := handover/attestations/handover.intoto.json
SCHEMA := schema/handover.schema.json
STATUS := handover.status
STATUS_JSON := handover.status.json

.PHONY: refresh digests attest validate validate-opa fail-demo clean validate-strict-provenance

refresh: digests attest validate

digests:
	$(PYTHON) scripts/update_digests.py \
	  --evidence-dir handover/evidence \
	  --output $(DIGESTS)

attest: digests
	$(PYTHON) scripts/create_local_attestation.py \
	  --handover $(HANDOVER) \
	  --digests $(DIGESTS) \
	  --output $(ATTESTATION)

validate:
	$(PYTHON) scripts/validate_handover.py \
	  --handover $(HANDOVER) \
	  --digests $(DIGESTS) \
	  --attestation $(ATTESTATION) \
	  --schema $(SCHEMA) \
	  --status $(STATUS) \
	  --status-json $(STATUS_JSON)

validate-opa:
	$(OPA) eval \
	  --format pretty \
	  --data policy/handover.rego \
	  --data $(DIGESTS) \
	  --input $(HANDOVER) \
	  'data.handover.deny'

fail-demo:
	$(PYTHON) scripts/validate_handover.py \
	  --handover $(HANDOVER) \
	  --digests $(DIGESTS) \
	  --attestation $(ATTESTATION) \
	  --schema $(SCHEMA) \
	  --status handover.fail-demo.status \
	  --status-json handover.fail-demo.status.json \
	  --inject-failure missing-safety-evidence \
	  --expect-fail

validate-strict-provenance:
	@echo "Set ARTIFACT and GITHUB_REPOSITORY, then replace this target with gh attestation verify or cosign verify-attestation for the real produced artifact."
	@test -n "$$ARTIFACT"
	@test -n "$$GITHUB_REPOSITORY"
	gh attestation verify "$$ARTIFACT" --repo "$$GITHUB_REPOSITORY"

clean:
	rm -f $(STATUS) $(STATUS_JSON) handover.fail-demo.status handover.fail-demo.status.json


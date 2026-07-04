#!/usr/bin/env python3
import argparse
import copy
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


REQUIRED_ROOT = {
    "handover_id",
    "project",
    "owner",
    "prepared_at",
    "decision",
    "signoff",
    "acceptance_gates",
    "evidence",
    "residual_risks",
    "open_items",
    "provenance",
    "release_note",
}

REQUIRED_ROLES = {
    "Project Sponsor",
    "Design Lead",
    "Safety Lead",
    "Client/Operator",
}

REQUIRED_EVIDENCE_TYPES = {
    "site_context",
    "access_logistics",
    "concept_design",
    "structural_safety",
    "environment_planning",
    "cost_schedule",
    "risk_register",
    "handover_notes",
}

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


def utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def sha256_file(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_json(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def iso_datetime(value):
    if not isinstance(value, str):
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


def inject_failure(handover, failure):
    mutated = copy.deepcopy(handover)
    if failure == "missing-safety-evidence":
        mutated["evidence"] = [
            ev for ev in mutated.get("evidence", [])
            if ev.get("evidence_type") != "structural_safety"
        ]
    elif failure == "missing-signoff":
        mutated["signoff"] = mutated.get("signoff", [])[:1]
    elif failure == "bad-provenance":
        mutated.setdefault("provenance", {})["predicateType"] = "https://example.org/not-slsa"
    elif failure == "bad-digest-ref":
        if mutated.get("evidence"):
            mutated["evidence"][0]["digest_ref"] = "missing.sha256"
    else:
        raise SystemExit(f"Unknown injected failure: {failure}")
    return mutated


def schema_check(handover, schema):
    del schema
    deny = []
    missing = sorted(REQUIRED_ROOT - set(handover))
    for key in missing:
        deny.append(f"schema: missing root field {key}")

    project = handover.get("project", {})
    if not isinstance(project, dict):
        deny.append("schema: project must be an object")
    else:
        for key in ["name", "asset", "location", "stage", "description"]:
            if not project.get(key):
                deny.append(f"schema: project.{key} missing")
        if project.get("stage") not in {"stage_1_design", "stage_2_detailed_design", "stage_3_build_readiness"}:
            deny.append("schema: project.stage has invalid value")

    if not EMAIL_RE.match(str(handover.get("owner", ""))):
        deny.append("schema: owner must be an email address")

    if not iso_datetime(handover.get("prepared_at")):
        deny.append("schema: prepared_at must be date-time")

    signoffs = handover.get("signoff", [])
    if not isinstance(signoffs, list) or len(signoffs) < 4:
        deny.append("schema: signoff must contain at least four entries")
    else:
        for idx, signoff in enumerate(signoffs):
            if not signoff.get("role"):
                deny.append(f"schema: signoff[{idx}].role missing")
            if not EMAIL_RE.match(str(signoff.get("by", ""))):
                deny.append(f"schema: signoff[{idx}].by must be email")
            if not iso_datetime(signoff.get("at")):
                deny.append(f"schema: signoff[{idx}].at must be date-time")

    evidence = handover.get("evidence", [])
    if not isinstance(evidence, list) or not evidence:
        deny.append("schema: evidence must contain at least one entry")
    else:
        for idx, ev in enumerate(evidence):
            for key in ["id", "name", "evidence_type", "path", "digest_ref", "status", "decision_use"]:
                if not ev.get(key):
                    deny.append(f"schema: evidence[{idx}].{key} missing")
            if ev.get("evidence_type") not in REQUIRED_EVIDENCE_TYPES:
                deny.append(f"schema: evidence[{idx}].evidence_type invalid")
            if ev.get("status") not in {"draft", "accepted_for_stage_1", "superseded"}:
                deny.append(f"schema: evidence[{idx}].status invalid")
            if not str(ev.get("digest_ref", "")).endswith(".sha256"):
                deny.append(f"schema: evidence[{idx}].digest_ref must end with .sha256")

    for idx, gate in enumerate(handover.get("acceptance_gates", [])):
        if gate.get("outcome") not in {"pass", "conditional_pass", "fail"}:
            deny.append(f"schema: acceptance_gates[{idx}].outcome invalid")
        if not gate.get("evidence_refs"):
            deny.append(f"schema: acceptance_gates[{idx}].evidence_refs missing")

    provenance = handover.get("provenance", {})
    for key in ["subject", "attestation_type", "predicateType", "attestation_path"]:
        if not provenance.get(key):
            deny.append(f"schema: provenance.{key} missing")

    return deny


def policy_check(handover, digests):
    deny = []
    roles = {item.get("role") for item in handover.get("signoff", [])}
    evidence_types = {item.get("evidence_type") for item in handover.get("evidence", [])}
    evidence_ids = {item.get("id") for item in handover.get("evidence", [])}

    for role in sorted(REQUIRED_ROLES - roles):
        deny.append(f"policy: missing required signoff role {role}")

    for evidence_type in sorted(REQUIRED_EVIDENCE_TYPES - evidence_types):
        deny.append(f"policy: missing required evidence type {evidence_type}")

    for ev in handover.get("evidence", []):
        if ev.get("status") != "accepted_for_stage_1":
            deny.append(f"policy: evidence {ev.get('id')} is not accepted for stage 1")
        digest_ref = ev.get("digest_ref")
        if digest_ref not in digests:
            deny.append(f"policy: digest_ref {digest_ref} not found in digests")

    for gate in handover.get("acceptance_gates", []):
        if gate.get("outcome") == "fail":
            deny.append(f"policy: acceptance gate {gate.get('id')} failed")
        for evidence_ref in gate.get("evidence_refs", []):
            if evidence_ref not in evidence_ids:
                deny.append(f"policy: gate {gate.get('id')} references missing evidence {evidence_ref}")

    for item in handover.get("open_items", []):
        if item.get("severity") == "blocker":
            deny.append(f"policy: open item {item.get('id')} is a blocker")

    for risk in handover.get("residual_risks", []):
        if risk.get("severity") == "red" or risk.get("disposition") == "blocked":
            deny.append(f"policy: residual risk {risk.get('id')} blocks handover")

    if handover.get("provenance", {}).get("predicateType") != "https://slsa.dev/provenance/v1":
        deny.append("policy: provenance predicateType is not SLSA provenance v1")

    return deny


def digest_check(handover, digests):
    deny = []
    for ev in handover.get("evidence", []):
        path = Path(ev.get("path", ""))
        digest_ref = ev.get("digest_ref")
        expected = digests.get(digest_ref)
        if expected and not SHA256_RE.match(expected):
            deny.append(f"digest: digest {digest_ref} is not a lowercase sha256")
        if not path.exists():
            deny.append(f"digest: evidence file not found {path}")
            continue
        actual = sha256_file(path)
        if expected and actual != expected:
            deny.append(f"digest: evidence file {path} does not match {digest_ref}")
    return deny


def provenance_check(handover, handover_path, attestation_path, digests, injected_failure):
    deny = []
    attestation_path = Path(attestation_path)
    if not attestation_path.exists():
        return [f"provenance: attestation not found {attestation_path}"]

    attestation = load_json(attestation_path)
    if attestation.get("_type") != "https://in-toto.io/Statement/v1":
        deny.append("provenance: attestation is not an in-toto statement")
    if attestation.get("predicateType") != handover.get("provenance", {}).get("predicateType"):
        deny.append("provenance: predicateType does not match handover")

    subjects = attestation.get("subject", [])
    subject_digest = None
    subject_name = None
    if subjects:
        subject_name = subjects[0].get("name")
        subject_digest = subjects[0].get("digest", {}).get("sha256")
    if subject_name != str(handover_path):
        deny.append("provenance: subject name does not match handover path")

    actual_handover_digest = sha256_json(handover) if injected_failure else sha256_file(handover_path)
    if subject_digest != actual_handover_digest:
        deny.append("provenance: subject digest does not match handover")

    materials = {
        item.get("uri"): item.get("digest", {}).get("sha256")
        for item in attestation.get("predicate", {}).get("materials", [])
    }
    for ev in handover.get("evidence", []):
        expected = digests.get(ev.get("digest_ref"))
        material_digest = materials.get(ev.get("path"))
        if material_digest != expected:
            deny.append(f"provenance: material for {ev.get('path')} missing or digest mismatch")

    return deny


def write_status(status_path, status_json_path, payload):
    Path(status_path).write_text(payload["status"] + "\n", encoding="utf-8")
    Path(status_json_path).write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--handover", required=True)
    parser.add_argument("--digests", required=True)
    parser.add_argument("--attestation", required=True)
    parser.add_argument("--schema", required=True)
    parser.add_argument("--status", default="handover.status")
    parser.add_argument("--status-json", default="handover.status.json")
    parser.add_argument("--inject-failure", choices=[
        "missing-safety-evidence",
        "missing-signoff",
        "bad-provenance",
        "bad-digest-ref",
    ])
    parser.add_argument("--expect-fail", action="store_true")
    args = parser.parse_args()

    handover_path = Path(args.handover)
    handover = load_json(handover_path)
    schema = load_json(args.schema)
    digest_doc = load_json(args.digests)
    digests = digest_doc.get("digests", digest_doc)

    if args.inject_failure:
        handover = inject_failure(handover, args.inject_failure)

    checks = {
        "schema": schema_check(handover, schema),
        "policy": policy_check(handover, digests),
        "digests": digest_check(handover, digests),
        "provenance": provenance_check(handover, handover_path, args.attestation, digests, args.inject_failure),
    }

    deny = []
    for group in ["schema", "policy", "digests", "provenance"]:
        deny.extend(checks[group])

    status = "PASS" if not deny else "FAIL"
    payload = {
        "status": status,
        "checked_at": utc_now(),
        "handover_id": handover.get("handover_id"),
        "project": handover.get("project", {}).get("name"),
        "injected_failure": args.inject_failure,
        "checks": {
            key: {
                "status": "PASS" if not value else "FAIL",
                "deny": value
            }
            for key, value in checks.items()
        },
        "deny": deny,
    }
    write_status(args.status, args.status_json, payload)

    print(f"Handover validation: {status}")
    if deny:
        for reason in deny:
            print(f"- {reason}")

    if args.expect_fail:
        if status == "FAIL":
            return 0
        print("Expected validation to fail, but it passed")
        return 1

    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())


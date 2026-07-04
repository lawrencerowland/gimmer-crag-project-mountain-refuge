package handover

default allow := false

required_roles := {
  "Project Sponsor",
  "Design Lead",
  "Safety Lead",
  "Client/Operator"
}

required_evidence_types := {
  "site_context",
  "access_logistics",
  "concept_design",
  "structural_safety",
  "environment_planning",
  "cost_schedule",
  "risk_register",
  "handover_notes"
}

allow if {
  count(deny) == 0
}

deny contains "owner missing" if {
  not input.owner
}

deny contains "minimum four signoffs required" if {
  count(input.signoff) < 4
}

deny contains reason if {
  role := required_roles[_]
  not has_signoff_role(role)
  reason := sprintf("missing required signoff role %q", [role])
}

deny contains reason if {
  evidence_type := required_evidence_types[_]
  not has_evidence_type(evidence_type)
  reason := sprintf("missing required evidence type %q", [evidence_type])
}

deny contains reason if {
  some i
  ev := input.evidence[i]
  ev.status != "accepted_for_stage_1"
  reason := sprintf("evidence %q is not accepted for stage 1", [ev.id])
}

deny contains reason if {
  some i
  ev := input.evidence[i]
  not data.digests[ev.digest_ref]
  reason := sprintf("digest_ref %q not found in digests", [ev.digest_ref])
}

deny contains reason if {
  some i
  gate := input.acceptance_gates[i]
  gate.outcome == "fail"
  reason := sprintf("acceptance gate %q failed", [gate.id])
}

deny contains reason if {
  some i
  item := input.open_items[i]
  item.severity == "blocker"
  reason := sprintf("open item %q is a blocker", [item.id])
}

deny contains reason if {
  some i
  risk := input.residual_risks[i]
  risk.severity == "red"
  reason := sprintf("residual risk %q is red", [risk.id])
}

deny contains reason if {
  input.provenance.predicateType != "https://slsa.dev/provenance/v1"
  reason := "provenance predicateType is not SLSA provenance v1"
}

has_signoff_role(role) if {
  some i
  input.signoff[i].role == role
}

has_evidence_type(evidence_type) if {
  some i
  input.evidence[i].evidence_type == evidence_type
}


"""GovernAI risk engine. Deterministic: the AI never sets the tier.
Four tiers, aligned with the EU AI Act: low=MINIMAL, medium=LIMITED, high=HIGH, prohibited=UNACCEPTABLE."""

DIMS = ["Impact", "People", "Data", "Automation", "Scale", "Reversibility",
        "Technical uncertainty", "Misuse", "Dependency"]
WEIGHTS = {"Impact": 16, "People": 14, "Data": 12, "Automation": 12, "Scale": 10,
           "Reversibility": 12, "Technical uncertainty": 8, "Misuse": 8, "Dependency": 8}
CRITICAL = ["Impact", "People", "Reversibility", "Automation"]
BANDS = [(30, "low"), (55, "medium"), (101, "high")]  # upper bound (exclusive), tier

TIER_LABEL = {"low": "MINIMAL", "medium": "LIMITED", "high": "HIGH", "prohibited": "UNACCEPTABLE"}
TIER_ORDER = ["prohibited", "high", "medium", "low"]
REVIEW_MONTHS = {"high": 6, "medium": 12}  # anything else: 24

STAGES = ["Ideation & Intake", "Impact Assessment & Requirements", "Data Acquisition & Preparation",
          "Design & Development", "Testing & Independent Validation", "Deployment & Go-Live Approval",
          "Production Monitoring & Periodic Review", "Change Management", "AI Incident Management",
          "Retirement & Decommissioning"]
GATE_STAGES = {2, 5, 6}

PROHIBITED = ["Social scoring", "Manipulative or subliminal techniques", "Exploiting vulnerabilities",
              "Untargeted facial image scraping", "Emotion recognition at work or school",
              "Real-time remote biometric ID in public", "Predictive policing based on profiling"]
TRIGGERS = ["Material decisions about individuals", "Biometric or sensitive-trait inference",
            "Employment, credit, life/health insurance, health, education or public services",
            "Safety-critical or essential service",
            "Agent can act externally (send, transact, delete, approve)",
            "Vulnerable groups or children affected"]


def score100(scores: dict) -> int:
    lo = sum(WEIGHTS[d] * 1 for d in WEIGHTS)
    hi = sum(WEIGHTS[d] * 3 for d in WEIGHTS)
    raw = sum(WEIGHTS[d] * scores[d] for d in WEIGHTS)
    return round(100 * (raw - lo) / (hi - lo))


def band(s: int) -> str:
    for upper, tier in BANDS:
        if s < upper:
            return tier
    return "high"


def auto_triggers(trig, data):
    t = list(trig)
    if "Biometric" in data and TRIGGERS[1] not in t:
        t.append(TRIGGERS[1])
    if "Children" in data and TRIGGERS[5] not in t:
        t.append(TRIGGERS[5])
    return t


def classify(prohibited, triggers, scores, geo_pts=0):
    """Returns (tier, score out of 100, reasons)."""
    s = min(100, score100(scores) + 2 * geo_pts)
    if prohibited:
        return "prohibited", s, [f"Prohibited practice: {p}" for p in prohibited]
    tier = band(s)
    why = [f"Weighted score {s}/100 puts this in {TIER_LABEL[tier]}"]
    if geo_pts:
        why.append(f"Includes +{2 * geo_pts} for operating in more than one jurisdiction")
    crit3 = [d for d in CRITICAL if scores[d] == 3]
    if len(crit3) >= 3 and tier in ("low", "medium"):
        tier = "high"
        why.append("Floor to HIGH: three or more critical dimensions rated 3 (" + ", ".join(crit3) + ")")
    if triggers:
        why += [f"Regulatory trigger: {t}" for t in triggers]
        if tier in ("low", "medium"):
            tier = "high"
            why.append("Floor to HIGH: a regulatory trigger applies")
    return tier, s, why


def approvers(stage: int, tier: str):
    if tier == "prohibited":
        return []
    req = ["model_owner"]
    if tier in ("medium", "high") and stage in GATE_STAGES:
        req += ["privacy_reviewer", "risk_reviewer"]
    if tier == "high" and stage in GATE_STAGES:
        req += ["legal_reviewer", "review_board", "governance_admin"]
    return req


def ring_percent(stage: int, status: str) -> int:
    """Progress ring always matches the stage label: 4/10 is 40%, 10/10 is 100%."""
    return 100 if status == "retired" else round(100 * stage / 10)

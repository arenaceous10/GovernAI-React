
from dotenv import load_dotenv
load_dotenv()
"""GovernAI API (FastAPI). Run: uvicorn main:app --host 0.0.0.0 --port $PORT"""
import os, json, logging, datetime as dt
from typing import Optional, List, Dict
import httpx
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from supabase import create_client, Client
import engine as E


SUPABASE_URL = os.environ["SUPABASE_URL"]
SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]      # secret, server only
ALLOWED = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")]
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")
# Tried in order when the primary model is overloaded (429/5xx) or times out.
GEMINI_FALLBACKS = [m.strip() for m in os.environ.get("GEMINI_FALLBACK_MODELS", "gemini-3.6-flash,gemini-3.5-flash").split(",") if m.strip()]
GEMINI_MODELS = list(dict.fromkeys([GEMINI_MODEL] + GEMINI_FALLBACKS))
GEMINI_TIMEOUT = float(os.environ.get("GEMINI_TIMEOUT", "45"))
RETRYABLE = {429, 500, 502, 503, 504}
# DEMO MODE: lets the front end pick a role from a dropdown (like the Streamlit demo). No real sign-in.
# Off unless you set DEMO_MODE=true. Turn it off before real users arrive.
DEMO_MODE = os.environ.get("DEMO_MODE", "false").lower() == "true"

logging.basicConfig(level=logging.INFO)
log_ai = logging.getLogger("governai.ai")


def redact(text: str) -> str:
    """Strip the Gemini key from anything we log."""
    return text.replace(GEMINI_KEY, "***") if GEMINI_KEY else text

sb: Client = create_client(SUPABASE_URL, SERVICE_KEY)
app = FastAPI(title="GovernAI API", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED, allow_methods=["*"], allow_headers=["*"])

ROLES = ["submitter", "model_owner", "privacy_reviewer", "legal_reviewer",
         "risk_reviewer", "review_board", "governance_admin"]

CHECKLIST = {
    1: ["Use case registered in inventory", "Accountable business owner named", "Non-AI alternatives considered"],
    2: ["Impact assessment completed", "Requirements and success measures agreed", "Applicable laws confirmed"],
    3: ["Data sources documented", "Lawful basis / consent confirmed", "Data quality and bias checks done"],
    4: ["Model design documented", "Human oversight designed", "Security review of architecture"],
    5: ["Performance tests passed", "Fairness tests passed", "Independent validation report (Medium/High)"],
    6: ["Monitoring operational", "Incident response plan confirmed", "Go-live sign-offs complete"],
    7: ["Monitoring dashboard reviewed", "Periodic review completed"],
    8: ["Change impact assessed", "Re-testing completed"],
    9: ["Incidents contained", "Root causes closed"],
    10: ["Users notified", "Data retained or deleted per policy", "System archived"],
}


# ---------------------------------------------------------------- auth
class User(BaseModel):
    id: str
    email: str
    role: str


def current_user(authorization: Optional[str] = Header(None),
                 x_demo_role: Optional[str] = Header(None),
                 x_demo_name: Optional[str] = Header(None)) -> User:
    """Real mode: validates the Supabase JWT and reads the role from app_metadata.
    Demo mode (DEMO_MODE=true): trusts the role picked in the UI. Never use demo mode with real data."""
    if DEMO_MODE and x_demo_role:
        role = x_demo_role if x_demo_role in ROLES else "submitter"
        name = (x_demo_name or role).strip()[:60] or role
        return User(id=f"demo-{role}", email=name, role=role)
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Sign in required")
    token = authorization.split(" ", 1)[1]
    try:
        res = sb.auth.get_user(token)
        u = res.user
    except Exception:
        raise HTTPException(401, "Invalid or expired session")
    if not u:
        raise HTTPException(401, "Invalid or expired session")
    role = (u.app_metadata or {}).get("role", "submitter")
    if role not in ROLES:
        role = "submitter"
    return User(id=u.id, email=u.email or "", role=role)


def need(*roles):
    def dep(user: User = Depends(current_user)):
        if user.role not in roles and user.role != "governance_admin":
            raise HTTPException(403, f"Requires one of: {', '.join(roles)}")
        return user
    return dep


def log(actor: str, action: str, uc: Optional[int] = None, detail: str = ""):
    sb.table("audit").insert({"actor": actor, "action": action, "uc": uc, "detail": detail}).execute()


def get_uc(uc_id: int) -> dict:
    r = sb.table("use_cases").select("*").eq("id", uc_id).limit(1).execute().data
    if not r:
        raise HTTPException(404, "System not found")
    return r[0]


def required_items(uc: dict) -> List[str]:
    return [i for i in CHECKLIST[uc["stage"]] if not (uc["tier"] == "low" and "Medium/High" in i)]


def blockers(uc: dict) -> List[str]:
    b = []
    if uc["tier"] == "prohibited":
        b.append("Prohibited practice - cannot proceed")
    if uc["status"] == "returned":
        b.append("Returned for remediation")
    if uc["status"] == "retired":
        b.append("System is retired")
    if b:
        return b
    done = {r["item"]: r["done"] for r in
            sb.table("checklist").select("item,done").eq("uc", uc["id"]).eq("stage", uc["stage"]).execute().data}
    for item in required_items(uc):
        if not done.get(item):
            b.append(f"Checklist incomplete: {item}")
    appr = {r["role"]: r["outcome"] for r in
            sb.table("approvals").select("role,outcome").eq("uc", uc["id"]).eq("stage", uc["stage"]).execute().data}
    for role in E.approvers(uc["stage"], uc["tier"]):
        if appr.get(role) in (None, "rejected"):
            b.append(f"Approval required: {role}")
    return b


def decorate(uc: dict) -> dict:
    uc["tier_label"] = E.TIER_LABEL[uc["tier"]]
    uc["ring"] = E.ring_percent(uc["stage"], uc["status"])
    uc["stage_name"] = E.STAGES[uc["stage"] - 1]
    return uc


# ---------------------------------------------------------------- models
class Intake(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    bu: str = ""
    domain: str = "Insurance"
    purpose: str = ""
    geos: List[str] = []
    data: List[str] = []
    automation: str = "advisory"
    model: str = ""
    model_owner: str = ""
    misuse: str = ""
    frameworks: List[str] = []
    follow_up: Dict[str, str] = {}
    prohibited: List[str] = []
    triggers: List[str] = []
    scores: Dict[str, int]


class ChecklistTick(BaseModel):
    item: str
    done: bool


class Decision(BaseModel):
    outcome: str
    comment: str = ""


class IncidentIn(BaseModel):
    title: str
    severity: str = "medium"
    root_cause: str = "process"
    actions: str = ""


class ActionIn(BaseModel):
    finding: str = ""
    action: str
    owner: str = "Unassigned"
    due: dt.date


class ChangeIn(BaseModel):
    description: str
    material: bool = False


# ---------------------------------------------------------------- routes
@app.get("/health")
def health():
    return {"ok": True}


@app.get("/config")
def config():
    return {"tiers": E.TIER_LABEL, "tier_order": E.TIER_ORDER, "stages": E.STAGES, "dims": E.DIMS,
            "weights": E.WEIGHTS, "prohibited": E.PROHIBITED, "triggers": E.TRIGGERS, "roles": ROLES,
            "checklist": CHECKLIST, "demo_mode": DEMO_MODE}


@app.get("/me")
def me(user: User = Depends(current_user)):
    return user


@app.get("/systems")
def list_systems(user: User = Depends(current_user)):
    rows = sb.table("use_cases").select("*").order("id").execute().data
    return [decorate(r) for r in rows]


@app.get("/systems/{uc_id}")
def system_detail(uc_id: int, user: User = Depends(current_user)):
    uc = decorate(get_uc(uc_id))
    q = lambda t: sb.table(t).select("*").eq("uc", uc_id)
    return {
        "system": uc,
        "required_items": required_items(uc),
        "approvers": E.approvers(uc["stage"], uc["tier"]),
        "blockers": blockers(uc),
        "checklist": q("checklist").eq("stage", uc["stage"]).execute().data,
        "approvals": q("approvals").order("stage").execute().data,
        "incidents": q("incidents").order("id").execute().data,
        "actions": q("actions").order("due").execute().data,
        "changes": q("changes").order("id").execute().data,
        "screenings": q("screenings").order("id", desc=True).limit(1).execute().data,
        "audit": q("audit").order("at", desc=True).limit(100).execute().data,
    }


@app.post("/systems")
def register(body: Intake, user: User = Depends(current_user)):
    missing = [d for d in E.DIMS if d not in body.scores or body.scores[d] not in (1, 2, 3)]
    if missing:
        raise HTTPException(422, f"Rate every dimension 1 to 3. Missing or invalid: {', '.join(missing)}")
    bad = [p for p in body.prohibited if p not in E.PROHIBITED]
    if bad:
        raise HTTPException(422, "Unknown prohibited practice")
    trig = E.auto_triggers(body.triggers, body.data)
    geo_pts = min(3, max(0, len(body.geos) - 1))
    tier, total, reasons = E.classify(body.prohibited, trig, body.scores, geo_pts)
    n = (sb.table("use_cases").select("id").order("id", desc=True).limit(1).execute().data or [{"id": 0}])[0]["id"] + 1
    code = f"AI-{dt.date.today().year}-{n:04d}"
    intake = body.model_dump(exclude={"scores", "prohibited", "triggers"})
    row = {"code": code, "name": body.name.strip(), "bu": body.bu, "intake": intake, "tier": tier, "score": total,
           "risk": {"total": total, "scores": body.scores, "reasons": reasons},
           "regs": body.frameworks, "status": "blocked" if tier == "prohibited" else "in_review"}
    created = sb.table("use_cases").insert(row).execute().data[0]
    log(user.email, "registered", created["id"], f"{code} tier={tier}")
    return decorate(created)


@app.post("/systems/{uc_id}/checklist")
def tick(uc_id: int, body: ChecklistTick, user: User = Depends(current_user)):
    uc = get_uc(uc_id)
    if body.item not in required_items(uc):
        raise HTTPException(422, "Not a checklist item for this stage")
    sb.table("checklist").upsert({"uc": uc_id, "stage": uc["stage"], "item": body.item, "done": body.done}).execute()
    log(user.email, "checklist", uc_id, f"{body.item}={body.done}")
    return {"ok": True}


@app.post("/systems/{uc_id}/advance")
def advance(uc_id: int, user: User = Depends(current_user)):
    uc = get_uc(uc_id)
    b = blockers(uc)
    if b:
        raise HTTPException(409, {"blockers": b})
    if uc["stage"] == 10:
        sb.table("use_cases").update({"status": "retired"}).eq("id", uc_id).execute()
    elif uc["stage"] == 6:
        months = E.REVIEW_MONTHS.get(uc["tier"], 24)
        nxt = (dt.date.today() + dt.timedelta(days=30 * months)).isoformat()
        sb.table("use_cases").update({"stage": 7, "status": "production", "next_review": nxt}).eq("id", uc_id).execute()
    else:
        sb.table("use_cases").update({"stage": uc["stage"] + 1}).eq("id", uc_id).execute()
    log(user.email, "stage_advance", uc_id, f"from stage {uc['stage']}")
    return {"ok": True}


@app.get("/queue")
def queue(user: User = Depends(current_user)):
    rows = sb.table("use_cases").select("*").in_("status", ["in_review", "production"]).execute().data
    mine = []
    for uc in rows:
        if user.role not in E.approvers(uc["stage"], uc["tier"]):
            continue
        r = sb.table("approvals").select("outcome").eq("uc", uc["id"]).eq("stage", uc["stage"]).eq("role", user.role).execute().data
        if r and r[0]["outcome"] != "rejected":
            continue
        mine.append(decorate(uc))
    returned = [decorate(u) for u in sb.table("use_cases").select("*").eq("status", "returned").execute().data] \
        if user.role == "governance_admin" else []
    return {"waiting": mine, "returned": returned}


@app.post("/systems/{uc_id}/decision")
def decide(uc_id: int, body: Decision, user: User = Depends(current_user)):
    uc = get_uc(uc_id)
    if body.outcome not in ("approved", "approved_with_conditions", "rejected"):
        raise HTTPException(422, "Invalid outcome")
    if user.role not in E.approvers(uc["stage"], uc["tier"]):
        raise HTTPException(403, "Your role does not approve at this stage")
    if body.outcome == "approved_with_conditions" and not body.comment.strip():
        raise HTTPException(422, "Conditions are required")
    sb.table("approvals").upsert({"uc": uc_id, "stage": uc["stage"], "role": user.role, "outcome": body.outcome,
                                  "comment": body.comment, "at": dt.datetime.utcnow().isoformat()}).execute()
    if body.outcome == "rejected":
        sb.table("use_cases").update({"status": "returned"}).eq("id", uc_id).execute()
    log(user.email, f"approval_{body.outcome}", uc_id, body.comment)
    return {"ok": True}


@app.post("/systems/{uc_id}/reopen")
def reopen(uc_id: int, user: User = Depends(need("governance_admin"))):
    uc = get_uc(uc_id)
    sb.table("use_cases").update({"status": "in_review"}).eq("id", uc_id).execute()
    sb.table("approvals").delete().eq("uc", uc_id).eq("stage", uc["stage"]).eq("outcome", "rejected").execute()
    log(user.email, "reopened", uc_id)
    return {"ok": True}


@app.post("/systems/{uc_id}/incidents")
def add_incident(uc_id: int, body: IncidentIn, user: User = Depends(current_user)):
    get_uc(uc_id)
    if body.severity not in ("low", "medium", "high", "critical"):
        raise HTTPException(422, "Invalid severity")
    sb.table("incidents").insert({"uc": uc_id, **body.model_dump()}).execute()
    log(user.email, "incident", uc_id, f"{body.severity}: {body.title}")
    return {"ok": True}


@app.post("/incidents/{inc_id}/close")
def close_incident(inc_id: int, user: User = Depends(need("risk_reviewer", "governance_admin"))):
    sb.table("incidents").update({"status": "closed"}).eq("id", inc_id).execute()
    log(user.email, "incident_closed", None, str(inc_id))
    return {"ok": True}


@app.post("/systems/{uc_id}/actions")
def add_action(uc_id: int, body: ActionIn, user: User = Depends(current_user)):
    get_uc(uc_id)
    sb.table("actions").insert({"uc": uc_id, "finding": body.finding, "action": body.action,
                                "owner": body.owner or "Unassigned", "due": body.due.isoformat()}).execute()
    log(user.email, "action_added", uc_id, body.action)
    return {"ok": True}


@app.post("/actions/{act_id}/done")
def finish_action(act_id: int, user: User = Depends(current_user)):
    sb.table("actions").update({"status": "done"}).eq("id", act_id).execute()
    log(user.email, "action_done", None, str(act_id))
    return {"ok": True}


@app.post("/systems/{uc_id}/changes")
def change_request(uc_id: int, body: ChangeIn, user: User = Depends(current_user)):
    uc = get_uc(uc_id)
    if uc["status"] in ("retired", "blocked"):
        raise HTTPException(409, f"A {uc['status']} system cannot take change requests")
    sb.table("changes").insert({"uc": uc_id, **body.model_dump()}).execute()
    if body.material:
        sb.table("use_cases").update({"stage": 2, "status": "in_review"}).eq("id", uc_id).execute()
        sb.table("approvals").delete().eq("uc", uc_id).execute()
        sb.table("checklist").delete().eq("uc", uc_id).gte("stage", 2).execute()
    log(user.email, "change_request", uc_id, f"material={body.material}")
    return {"ok": True}


@app.delete("/systems/{uc_id}")
def delete_system(uc_id: int, user: User = Depends(need("governance_admin"))):
    uc = get_uc(uc_id)
    sb.table("use_cases").delete().eq("id", uc_id).execute()   # children cascade
    log(user.email, "deleted", uc_id, f"{uc['code']} {uc['name']}")
    return {"ok": True}


@app.get("/alerts")
def alerts(user: User = Depends(current_user)):
    today = dt.date.today().isoformat()
    ucs = {u["id"]: u for u in sb.table("use_cases").select("id,code,name,next_review,status").execute().data}
    reviews = [u for u in ucs.values() if u["next_review"] and u["next_review"] < today and u["status"] == "production"]
    inc = [i for i in sb.table("incidents").select("*").eq("status", "open").execute().data
           if i["severity"] in ("high", "critical")]
    for i in inc:
        i["system"] = ucs.get(i["uc"], {})
    acts = sb.table("actions").select("*").eq("status", "open").lt("due", today).execute().data
    for a in acts:
        a["system"] = ucs.get(a["uc"], {})
    return {"reviews": reviews, "incidents": inc, "actions": acts, "total": len(reviews) + len(inc) + len(acts)}


@app.get("/dashboard")
def dashboard(user: User = Depends(current_user)):
    rows = sb.table("use_cases").select("id,code,name,bu,tier,score,stage,status,regs").execute().data
    by_tier = {t: 0 for t in E.TIER_ORDER}
    by_stage = {i: 0 for i in range(1, 11)}
    coverage: Dict[str, int] = {}
    for r in rows:
        by_tier[r["tier"]] += 1
        by_stage[r["stage"]] += 1
        for law in r["regs"] or []:
            coverage[law] = coverage.get(law, 0) + 1
    al = alerts(user)
    open_inc = sb.table("incidents").select("id", count="exact").eq("status", "open").execute().count or 0
    return {"total": len(rows), "by_tier": by_tier, "by_stage": by_stage, "coverage": coverage,
            "high_and_above": by_tier["high"] + by_tier["prohibited"],
            "in_production": sum(1 for r in rows if r["status"] == "production"),
            "open_alerts": al["total"], "open_incidents": open_inc,
            "top_risk": sorted(rows, key=lambda r: r["score"], reverse=True)[:8],
            "systems": rows}


@app.get("/audit")
def audit_log(user: User = Depends(current_user)):
    return sb.table("audit").select("*").order("at", desc=True).limit(500).execute().data


@app.post("/systems/{uc_id}/screen")
async def screen(uc_id: int, user: User = Depends(current_user)):
    """AI screening note. The AI explains, it never decides the tier."""
    uc = get_uc(uc_id)
    prompt = ("You are an AI compliance screener. List laws in scope, obligations, potential violations with "
              "exact citations, severity and recommended controls. If unsure say 'insufficient basis - refer to legal'.\n\n"
              + json.dumps({"name": uc["name"], "tier": E.TIER_LABEL[uc["tier"]], "intake": uc["intake"],
                            "frameworks": uc["regs"]}, indent=1))
    if not GEMINI_KEY:
        note = "No Gemini key set. Add GEMINI_API_KEY on the server to enable AI screening."
    else:
        note, err = None, None
        # Key goes in a header, not the URL, so it never shows up in exception messages or logs.
        async with httpx.AsyncClient(timeout=GEMINI_TIMEOUT) as c:
            for model in GEMINI_MODELS:
                try:
                    r = await c.post(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                                     headers={"x-goog-api-key": GEMINI_KEY},
                                     json={"contents": [{"parts": [{"text": prompt}]}]})
                    if r.is_error:
                        log_ai.error("Gemini HTTP %s for model %r: %s", r.status_code, model, redact(r.text[:2000]))
                    r.raise_for_status()
                    note = r.json()["candidates"][0]["content"]["parts"][0]["text"]
                    break
                except (httpx.TimeoutException, httpx.HTTPStatusError) as e:
                    err = e
                    retryable = isinstance(e, httpx.TimeoutException) or e.response.status_code in RETRYABLE
                    log_ai.warning("Model %r failed (%s)%s", model, type(e).__name__,
                                   ", trying next model" if retryable else "")
                    if not retryable:
                        break
                except Exception as e:
                    err = e
                    log_ai.exception("AI screening failed for uc %s on model %r: %s", uc_id, model, redact(str(e)))
                    break
        if note is None:
            log_ai.error("AI screening failed for uc %s: %s: %s", uc_id, type(err).__name__, redact(str(err)))
            note = f"AI unavailable ({type(err).__name__}). Refer to legal for manual review."
    sb.table("screenings").insert({"uc": uc_id, "note": note}).execute()
    log(user.email, "ai_output", uc_id, "screening note")
    return {"note": note, "disclaimer": "AI-assisted risk screening, not legal advice."}

"""
Admin Routes — Server-side admin verification on EVERY route.
Tabs: Reported Messages, Organization Requests, Vector DB Stats.
All admin actions are logged to admin_logs (never deletable).
"""
from fastapi import APIRouter, HTTPException, Depends
from middleware.auth_middleware import require_admin
from models.schemas import AdminActionResponse, OrgRejectRequest, BlocklistAddRequest
from services import firebase_service as fb
from services.chromadb_service import add_to_vector_db, delete_from_vector_db, get_collection_stats

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ──────────────────────────────────────────────
# Tab 1 — Reported Messages
# ──────────────────────────────────────────────
@router.get("/reports")
async def get_reports(
    status: str = "all",
    admin: dict = Depends(require_admin),
):
    """Get scam reports filtered by status."""
    reports = fb.get_scam_reports(status)
    return {"reports": reports}


@router.post("/reports/{report_id}/confirm", response_model=AdminActionResponse)
async def confirm_scam(
    report_id: str,
    admin: dict = Depends(require_admin),
):
    """
    Confirm a report as scam:
    1. Vectorize the message with DistilBERT [CLS] embedding
    2. Add to ChromaDB scam_vectors collection
    3. Update report status to confirmed
    """
    admin_uid = admin["uid"]

    # Get the report
    reports = fb.get_scam_reports()
    report = None
    for r in reports:
        if r.get("id") == report_id:
            report = r
            break

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if report.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Report already reviewed")

    # Vectorize and add to ChromaDB
    chroma_id = f"scam_{report_id}"
    add_to_vector_db(report["messageContent"], chroma_id)

    # Update report
    fb.update_scam_report(report_id, {
        "status": "confirmed",
        "reviewedBy": admin_uid,
        "chromaId": chroma_id,
    })

    # Store vector metadata
    fb.store_vector_metadata(
        report_id, report["messageContent"], admin_uid, chroma_id
    )

    # Log admin action
    fb.log_admin_action(admin_uid, "confirm_scam", report_id)

    return AdminActionResponse(
        success=True,
        message=f"Report confirmed and added to vector database as {chroma_id}",
    )


@router.post("/reports/{report_id}/dismiss", response_model=AdminActionResponse)
async def dismiss_report(
    report_id: str,
    admin: dict = Depends(require_admin),
):
    """Dismiss a report as false positive."""
    admin_uid = admin["uid"]

    fb.update_scam_report(report_id, {
        "status": "false_positive",
        "reviewedBy": admin_uid,
    })

    fb.log_admin_action(admin_uid, "dismiss_report", report_id)

    return AdminActionResponse(
        success=True,
        message="Report dismissed as false positive",
    )


# ──────────────────────────────────────────────
# Tab 2 — Organization Requests
# ──────────────────────────────────────────────
@router.get("/organizations")
async def get_org_requests(
    status: str = "pending",
    admin: dict = Depends(require_admin),
):
    """Get organization verification requests."""
    orgs = fb.get_organizations(status)
    return {"organizations": orgs}


@router.post("/organizations/{org_id}/approve", response_model=AdminActionResponse)
async def approve_org(
    org_id: str,
    admin: dict = Depends(require_admin),
):
    """Approve an organization — activates blue verified badge."""
    admin_uid = admin["uid"]

    org = fb.get_organization(org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    fb.update_organization(org_id, {"verified": True})
    fb.log_admin_action(admin_uid, "approve_org", org_id)

    return AdminActionResponse(
        success=True,
        message=f"Organization '{org.get('name')}' approved and verified",
    )


@router.post("/organizations/{org_id}/reject", response_model=AdminActionResponse)
async def reject_org(
    org_id: str,
    data: OrgRejectRequest,
    admin: dict = Depends(require_admin),
):
    """Reject an organization — mandatory rejection reason."""
    admin_uid = admin["uid"]

    fb.update_organization(org_id, {
        "verified": False,
        "rejectionNote": data.rejectionNote,
    })
    fb.log_admin_action(admin_uid, "reject_org", org_id)

    return AdminActionResponse(
        success=True,
        message="Organization rejected",
    )


# ──────────────────────────────────────────────
# Tab 3 — Vector DB Stats
# ──────────────────────────────────────────────
@router.get("/vector-stats")
async def get_vector_stats(admin: dict = Depends(require_admin)):
    """Get ChromaDB scam_vectors collection stats."""
    stats = get_collection_stats()
    return stats


@router.delete("/vectors/{chroma_id}", response_model=AdminActionResponse)
async def delete_vector(
    chroma_id: str,
    admin: dict = Depends(require_admin),
):
    """Delete a false-positive vector from ChromaDB."""
    admin_uid = admin["uid"]

    success = delete_from_vector_db(chroma_id)
    if not success:
        raise HTTPException(status_code=404, detail="Vector not found")

    fb.log_admin_action(admin_uid, "delete_vector", chroma_id)

    return AdminActionResponse(
        success=True,
        message=f"Vector {chroma_id} deleted from scam database",
    )


# ──────────────────────────────────────────────
# Blocklist Management
# ──────────────────────────────────────────────
@router.get("/blocklist")
async def get_blocklist(admin: dict = Depends(require_admin)):
    """Get the URL blocklist."""
    dbconn = fb.get_db()
    rows = dbconn.execute("SELECT id, domain, addedBy, addedAt FROM blocklist ORDER BY addedAt DESC").fetchall()
    items = [dict(r) for r in rows]
    return {"items": items, "domains": [r["domain"] for r in items]}


@router.post("/blocklist", response_model=AdminActionResponse)
async def add_domain_to_blocklist(
    data: BlocklistAddRequest,
    admin: dict = Depends(require_admin),
):
    """Add a domain to the URL blocklist."""
    admin_uid = admin["uid"]
    doc_id = fb.add_to_blocklist(data.domain, admin_uid)
    fb.log_admin_action(admin_uid, "add_blocklist", data.domain)

    return AdminActionResponse(
        success=True,
        message=f"Domain '{data.domain}' added to blocklist",
    )


# ──────────────────────────────────────────────
# Admin logs (read-only)
# ──────────────────────────────────────────────
@router.get("/logs")
async def get_admin_logs(admin: dict = Depends(require_admin)):
    """Get admin action logs. These are never deletable."""
    db = fb.get_db()
    rows = db.execute(
        "SELECT * FROM admin_logs ORDER BY timestamp DESC LIMIT 100"
    ).fetchall()
    return {"logs": [dict(r) for r in rows]}

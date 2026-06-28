"""
Report Routes — Scam reporting by users.
"""
from fastapi import APIRouter, HTTPException, Depends
from middleware.auth_middleware import get_current_user
from models.schemas import ScamReportRequest
from services import firebase_service as fb

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.post("/")
async def report_scam(
    data: ScamReportRequest,
    user: dict = Depends(get_current_user),
):
    """
    Report a message as a scam. Only UID is stored — never name or phone.
    Creates a pending entry in scam_reports awaiting admin review.
    """
    uid = user["uid"]
    report_id = fb.create_scam_report(
        reported_by=uid,
        message_content=data.messageContent,
        chat_id=data.chatId,
    )
    return {
        "reportId": report_id,
        "status": "pending",
        "message": "Report submitted. Thank you for helping protect other users.",
    }


@router.get("/my-reports")
async def get_my_reports(user: dict = Depends(get_current_user)):
    """Get reports submitted by the current user."""
    uid = user["uid"]
    all_reports = fb.get_scam_reports()
    my_reports = [r for r in all_reports if r.get("reportedBy") == uid]
    
    summary = {
        "total": len(my_reports),
        "confirmed": sum(1 for r in my_reports if r.get("status") == "confirmed"),
        "dismissed": sum(1 for r in my_reports if r.get("status") == "false_positive"),
        "pending": sum(1 for r in my_reports if r.get("status") == "pending"),
    }
    
    return {"reports": my_reports, "summary": summary}

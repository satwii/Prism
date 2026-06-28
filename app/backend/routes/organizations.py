"""
Organization Routes — Registration and public lookup.
"""
from fastapi import APIRouter, HTTPException, Depends
from middleware.auth_middleware import get_current_user
from models.schemas import OrgRegisterRequest, OrgResponse
from services import firebase_service as fb

router = APIRouter(prefix="/api/organizations", tags=["organizations"])


@router.post("/register")
async def register_organization(data: OrgRegisterRequest):
    """
    Register an organization for verification.
    No auth required — this is a public registration endpoint.
    Creates a pending entry awaiting admin review.
    """
    org_id = fb.create_organization(data.model_dump())
    return {
        "orgId": org_id,
        "status": "pending",
        "message": "Organization registered. Awaiting admin verification.",
    }


@router.get("/verified")
async def get_verified_orgs(user: dict = Depends(get_current_user)):
    """Get all verified organizations (for display / badge check)."""
    orgs = fb.get_organizations("approved")
    return {
        "organizations": [
            {
                "uid": o.get("uid"),
                "name": o.get("name"),
                "website": o.get("website"),
                "logoUrl": o.get("logoUrl"),
            }
            for o in orgs
        ]
    }


@router.get("/{org_id}")
async def get_organization(org_id: str, user: dict = Depends(get_current_user)):
    """Get a single organization's details."""
    org = fb.get_organization(org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org

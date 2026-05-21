from fastapi import APIRouter, HTTPException
from services.supabase_client import get_supabase

router = APIRouter(prefix="/app", tags=["app"])


@router.get("/version")
def get_latest_version():
    sb = get_supabase()
    resp = (
        sb.table("attorney_mobile_app_version")
        .select("version")
        .eq("is_latest", True)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="No latest version found")
    return {"version": rows[0]["version"]}

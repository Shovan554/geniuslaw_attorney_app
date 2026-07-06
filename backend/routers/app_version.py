from fastapi import APIRouter, HTTPException, Query
from services.supabase_client import get_supabase

router = APIRouter(prefix="/app", tags=["app"])

APP_NAME = "attorney"
VALID_PLATFORMS = {"ios", "android"}


@router.get("/version")
def get_latest_version(platform: str = Query(...)):
    platform = platform.strip().lower()
    if platform not in VALID_PLATFORMS:
        raise HTTPException(status_code=400, detail="Invalid platform")

    sb = get_supabase()
    resp = (
        sb.table("mobile_app_version_control")
        .select("version")
        .eq("app", APP_NAME)
        .eq("platform", platform)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="No latest version found")
    return {"version": rows[0]["version"]}

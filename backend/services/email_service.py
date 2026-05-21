"""Resend email integration via REST API (no SDK dependency).

Reads RESEND_API_KEY and RESEND_FROM_EMAIL from env.
"""

from __future__ import annotations

import html
import logging
import os
from typing import Optional

import httpx

_RESEND_ENDPOINT = "https://api.resend.com/emails"
_logger = logging.getLogger(__name__)


def is_resend_configured() -> bool:
    return bool(os.environ.get("RESEND_API_KEY")) and bool(
        os.environ.get("RESEND_FROM_EMAIL")
    )


async def send_email(
    *,
    to: str,
    subject: str,
    html_body: str,
    text_body: Optional[str] = None,
    from_email: Optional[str] = None,
) -> tuple[bool, Optional[str]]:
    """Send a single transactional email via Resend. Returns (ok, error)."""
    api_key = os.environ.get("RESEND_API_KEY")
    sender = from_email or os.environ.get("RESEND_FROM_EMAIL")

    if not api_key:
        return False, "RESEND_API_KEY is not set"
    if not sender:
        return False, "RESEND_FROM_EMAIL is not set"
    if not to:
        return False, "Recipient email is empty"

    payload: dict = {
        "from": sender,
        "to": [to],
        "subject": subject,
        "html": html_body,
    }
    if text_body:
        payload["text"] = text_body

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                _RESEND_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        if resp.status_code >= 400:
            return False, f"Resend {resp.status_code}: {resp.text[:500]}"
        return True, None
    except httpx.RequestError as e:
        _logger.exception("Resend request failed")
        return False, f"Network error contacting Resend: {e}"


async def send_password_reset_otp_email(
    *, to_email: str, full_name: Optional[str], otp_code: str
) -> tuple[bool, Optional[str]]:
    """Send a one-time password reset code to an attorney."""
    safe_name = html.escape(full_name or "there")
    safe_otp = html.escape(otp_code)

    subject = (
        f"Your GeniusLaw attorney password reset code, {full_name}"
        if full_name
        else "Your GeniusLaw attorney password reset code"
    )
    preheader = f"Your reset code is {otp_code}. It expires in 10 minutes."
    html_body = f"""\
<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color:#1f2937; background:#ffffff; margin:0; padding:24px;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{html.escape(preheader)}</div>

    <div style="max-width:560px;margin:0 auto;">
      <div style="margin:0 0 24px 0;">
        <img src="https://www.geniuslaw-admin.com/assets/Images/Logo.png" alt="GeniusLaw" width="140" style="max-width:140px;height:auto;display:block;" />
      </div>

      <p style="margin:0 0 16px 0;font-size:16px;color:#111827;">Hi {safe_name},</p>

      <p style="margin:0 0 20px 0;font-size:15px;line-height:1.55;color:#1f2937;">
        We received a request to reset your GeniusLaw attorney password. Use the code below in the app to continue.
      </p>

      <div style="margin:0 0 24px 0;padding:18px 22px;background:#f3f4f6;border-radius:10px;text-align:center;">
        <div style="font-size:13px;color:#6b7280;letter-spacing:0.04em;text-transform:uppercase;margin-bottom:6px;">Your reset code</div>
        <div style="font-family:'SF Mono', Menlo, Consolas, monospace;font-size:32px;letter-spacing:8px;font-weight:700;color:#0c1e3a;">{safe_otp}</div>
      </div>

      <p style="margin:0 0 12px 0;font-size:14px;color:#374151;">
        This code expires in <strong>10 minutes</strong>.
      </p>

      <p style="margin:0 0 24px 0;font-size:13px;color:#6b7280;">
        If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.
      </p>

      <p style="margin:0;font-size:14px;color:#1f2937;">Thanks,<br/>The GeniusLaw team</p>
    </div>
  </body>
</html>
"""
    text_body = (
        f"Hi {full_name or 'there'},\n\n"
        "We received a request to reset your GeniusLaw attorney password.\n\n"
        f"Your reset code: {otp_code}\n\n"
        "This code expires in 10 minutes.\n\n"
        "If you didn't request a password reset, you can safely ignore this email.\n\n"
        "— The GeniusLaw team"
    )

    return await send_email(
        to=to_email, subject=subject, html_body=html_body, text_body=text_body
    )

from pydantic import BaseModel


class OnboardingStatus(BaseModel):
    pronto_enabled: bool
    kyc_verified: bool
    has_card: bool
    terms_accepted: bool


class KycSessionBundle(BaseModel):
    session_id: str
    ephemeral_key_secret: str
    publishable_key: str


class KycRefreshResult(BaseModel):
    kyc_verified: bool
    status: str


class TermsAcceptResult(BaseModel):
    terms_accepted: bool

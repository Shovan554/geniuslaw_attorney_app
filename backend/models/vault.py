from pydantic import BaseModel


class VaultSetupBundle(BaseModel):
    setup_intent_client_secret: str
    ephemeral_key: str
    customer_id: str
    publishable_key: str


class VaultCard(BaseModel):
    brand: str
    last4: str

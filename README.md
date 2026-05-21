# Geniuslaw Attorney App

The attorney-side companion to the Geniuslaw Clients app. Attorneys use it to
view their cases, message clients, and take incoming calls from clients.

## Structure

- **`backend/`** — FastAPI service (`main.py`) exposing auth, attorneys, cases,
  clients, messages, and calls endpoints. Talks to the shared Supabase database
  used by the Clients app.
- **`mobile/`** — Expo / React Native app (TypeScript, expo-router). Uses
  Daily.co for video calls and polls the backend for new messages and incoming
  calls.

## Running locally

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in Supabase, JWT, Vonage, Daily creds
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Mobile
```bash
cd mobile
npm install
cp .env.example .env   # point EXPO_PUBLIC_API_URL at the backend
npx expo start
```

## Notes

- Secrets (`.env`, `*.p12`, Vonage private keys) are gitignored at the repo
  root — never commit them.
- The Clients-side counterpart lives in `../Geniuslaw_Clients`.

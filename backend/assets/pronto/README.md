# Pronto test-call assets

Drop the AI test-call video here.

## The video

- **Filename:** `demo.mp4`
- **Format:** portrait `.mp4`, ~20 seconds, with audio.

The file lives at `backend/assets/pronto/demo.mp4`. The backend serves
`backend/assets/` publicly as static files (see `main.py`, the
`app.mount("/assets", StaticFiles(...))` line), so once deployed the video is live at:

```
https://geniuslaw-attorney-app.onrender.com/assets/pronto/demo.mp4
```

(Locally during dev it's at `http://<your-LAN-ip>:8002/assets/pronto/demo.mp4`.)

## Wiring it into the app

That public URL is what the mobile app plays when the attorney answers a **test call**.
The URL is stored in the app (constant / `EXPO_PUBLIC_PRONTO_TEST_VIDEO_URL`), not
fetched from any backend endpoint — no API changes needed.

To swap the video later, just replace `demo.mp4` here and redeploy. The URL
stays the same, so no app rebuild is needed for a video change.

See the design spec:
`docs/superpowers/specs/2026-07-02-pronto-test-call-ai-video-design.md`.

# Team Member 4 — Broken App & Shipper Lead
**CodeSentinel | Owns: deliberately vulnerable Flask app + file-watcher ingestion**

Read `docs/PRD.md` Section 3.6 and `broken-app/manifest.md` first.

---

## Your job

Build a deliberately vulnerable Flask expense-tracker / todo API that:
1. Has real, seeded security bugs (documented in manifest.md)
2. Ships code to CodeSentinel automatically via a file-watcher (watchdog)
3. Creates the "live ingestion" story in the demo

---

## Files you own

```
broken-app/
├── app/
│   ├── main.py                     <- Flask entrypoint
│   ├── routes/
│   │   ├── items.py                <- CRUD — seed SQL injection here
│   │   └── auth.py                 <- Login — seed missing auth check + weak token
│   ├── db.py                       <- SQLite store — seed race condition here
│   └── config.py                   <- Deliberately hardcoded SECRET_KEY
├── manifest.md                     <- Ground truth: every seeded bug documented
├── shipper/
│   ├── file_watcher.py             <- watchdog -> POST /ingest/webhook (PRIMARY)
│   └── github_webhook/             <- Stretch only
└── requirements.txt                <- flask, watchdog, requests
```

---

## Bugs to seed (minimum set)

| Bug | File | Expected Severity | Category |
|---|---|---|---|
| SQL injection via f-string in `.execute()` | `routes/items.py` | critical | security |
| Hardcoded `SECRET_KEY = "supersecret123"` | `config.py` | high | security |
| Missing auth check on admin endpoint | `routes/auth.py` | high | security |
| Weak token (MD5 of username) | `routes/auth.py` | high | security |
| Race condition on in-memory counter | `db.py` | medium | bug |
| `eval()` used on user input | `routes/items.py` | critical | security |

**Document every bug in `manifest.md` with file + line range + category + expected severity.**
This is your regression check against Member 1's model output.

---

## File-watcher (primary, build this first)

`shipper/file_watcher.py` using the `watchdog` library:
1. Watch the `broken-app/app/` directory for file save events
2. On change: read the modified file, POST to `http://localhost:8000/ingest/webhook`
3. Body: `{"filename": "...", "code": "...", "source": "watcher"}`

This is the "code walks in on its own" demo beat.

---

## Demo flow (your part)

1. Backend + frontend are live
2. File-watcher is running
3. You save a change to `routes/items.py` (e.g. add an f-string SQL call)
4. Watcher fires → findings appear in the frontend automatically
5. Narrate: "The broken app just saved a file — CodeSentinel caught it in real time."

---

## Deliverables

- [ ] Working Flask app with all seeded bugs
- [ ] `manifest.md` fully filled with all bug details
- [ ] File-watcher running and tested against the live backend
- [ ] At least one end-to-end test: save a file → findings appear in frontend

# Continuous UI demonstration

Record a single continuous take under six minutes. Use fictional candidate files only. No cuts, time compression, pasted screenshots or simulated AI results are part of the recording.

Before recording, verify that the local frontend, backend and identity service are running. From the backend directory run `npm run check:connections`; it checks a real Gemini function call and a temporary S3 read/write operation. Developer AWS sessions expire: if this check reports expired credentials, renew the configured AWS profile before continuing. Do not record the credential renewal or publish its browser pages. A prior passing check does not establish that a later session is still valid.

1. Vendor sign-in. Show the tenant opening list, filtering and opening details.
2. Select a PDF, a PPTX and a disposable PDF; submit the batch.
3. Preview the submitted PDF and PPTX through the backend. Remove the disposable PDF with confirmation.
4. Sign out; sign in as the assigned manager. Show that the manager sees assigned openings.
5. Open the same opening. Show processing state or completed live AI results, score, evidence confidence, grounded explanation and actual latency.
6. Shortlist the newly submitted PDF and reject the new PPTX through the confirmation dialogs.
7. Toggle the color theme and show the updated decision states. End the recording.

The displayed processing times are real. The 1.5-second requirement is not met; this limitation must remain disclosed in the repository and submission. The demonstration is of working development functionality, not a passing performance claim.

Demo logins: `vendor.demo` and `manager.demo`. Their generated password is in the ignored local configuration. Do not reveal it, API keys, cookies, personal bookmarks or unrelated windows in the recording.

## Published take

[Manual UI demo (3 minutes 32.5 seconds)](https://github.com/Ritik0712-ai/zelosify-contract-hiring/releases/tag/demo-v1). The current file replaces the earlier automated walkthrough and is sourced from Ritik’s `Screen Recording 2026-11-01 at 00.51.27.mov`. The original MOV is preserved locally; the published MP4 copies its encoded video stream unchanged. No cuts or speed changes were added, and there is no audio track. Verification metadata is in `docs/evidence/demo-verification.json`.

The take shows vendor/manager sign-in, opening details and assignment scope, a PDF/PPTX upload, queued/running AI states and completed recommendations, PDF preview, manager shortlist/reject decisions and the vendor view after decisions. The sequence above remains a suggested comprehensive walkthrough. PPTX preview, soft-delete confirmation and dark-mode switching are separately verified features and are not claimed as coverage of this recording.

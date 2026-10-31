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

[Continuous UI demo (5:30)](https://github.com/Ritik0712-ai/zelosify-contract-hiring/releases/tag/demo-v1). The original MOV was preserved locally; the published MP4 copies its encoded video stream unchanged. There are no cuts, speed changes or audio. The last portion remains on the final decision view while the recorder is stopped. Verification metadata is in `docs/evidence/demo-verification.json`.

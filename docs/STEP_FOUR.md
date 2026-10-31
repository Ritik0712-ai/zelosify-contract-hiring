# Verification and submission status

Functional verification, documentation, the public source repository and the continuous demo are complete. **Formal email submission remains pending review. The measured performance requirements fail; this is not a claim of full evaluation compliance.**

## Source and verification

- Public repository: https://github.com/Ritik0712-ai/zelosify-contract-hiring
- Implementation commit: `2e67177b01854783c491111dfb09320b8ebb8c8b`.
- Independent CI: https://github.com/Ritik0712-ai/zelosify-contract-hiring/actions/runs/41117693063 — backend and frontend passed.
- 50 automated tests passed, including PostgreSQL integration, authorization boundaries, tool schemas, cancellation, retries and a 100-profile scripted model workflow.
- A clean source copy passed dependency installation and both production builds. CI also checked frontend lint and production dependency audits.
- Real Keycloak, private S3 and Gemini checks passed for PDF and PPTX, automatic background processing, assigned-manager access, absence of vendor AI fields and a manager decision. Disposable submissions were soft-deleted after verification.
- The source archive excludes local secrets, credentials, dependencies and machine-specific guidance.

## Measured limitations

The latest live two-file upload returned after **3,603 ms**. Gemini processing took **52,545 ms** for PDF and **35,166 ms** for PPTX. These fail the brief's two-second blocking API and 1,500 ms processing limits. See [live workflow evidence](evidence/live-workflow-step-four.json).

The strict 100-profile run produced **0 successful recommendations and 100 processing timeouts**. A successful-result P95 cannot be calculated. The historical unpaced burst produced three successes, 96 quota errors and one parser timeout. Its successful-only P95 of 31,367 ms is not a passing full-sample statistic. See [strict evidence](evidence/live-strict-100.json) and [historical burst evidence](evidence/live-stress-100.json).

The explicitly approved development configuration uses a 60-second deadline and six-second spacing between Gemini requests. It allows a working demonstration without claiming compliance. No provider billing or quota upgrades have been made. A larger quota alone would not establish the latency target.

A resumed recording attempt encountered an expired AWS developer session before upload. The same `zelosify` profile was renewed, a real Gemini/S3 connectivity check passed, and the complete two-file workflow passed again. The failed recording is excluded from final deliverables.

## Demo and final submission

The required recording must be a single actual UI walkthrough, no longer than six minutes, without cuts or speed changes. Only fictional resumes may appear. The [walkthrough](DEMO_WALKTHROUGH.md) describes the vendor upload, previews, soft deletion and manager recommendation/decision flow.

The finished [continuous demo and verification metadata](https://github.com/Ritik0712-ai/zelosify-contract-hiring/releases/tag/demo-v1) are published. [Direct MP4 download](https://github.com/Ritik0712-ai/zelosify-contract-hiring/releases/download/demo-v1/Zelosify-Continuous-Demo.mp4). Anonymous access returned HTTP 200; the uploaded size and SHA-256 match the local file.

The original take lasts **329.98 seconds (5:30)**, below six minutes, and contains no audio track. Metadata and sampled frames across the timeline verified vendor sign-in, batch upload, both previews, soft deletion, manager scope, real results, decisions and dark mode. The MP4 is a container conversion with the original H.264 stream copied unchanged; stream hashes match the original MOV. There are no cuts or speed changes. Setup/failed takes are excluded. See [video verification](evidence/demo-verification.json).

The recorded PDF/PPTX results show 100%/83% match scores and 31.17/36.29 seconds of processing respectively. The demo uses the approved development timeout and does not satisfy the strict SLA. No submission email has been sent. The final email must include both links and disclose the failed performance gates.

Assignment recipient: `sabeshragav@zelosify.com`. Deadline from the assignment email: **2 November 2026 at 21:34:01 IST**.

## Remaining acceptance work

1. Review the final email containing both public links and the limitations, then send it when authorized.
2. Resolve or obtain an explicit evaluation exception for the performance gaps before claiming compliance; never describe the current results as a passing SLA.

The service remains a local development build. No production deployment is claimed or required by the supplied submission instructions.

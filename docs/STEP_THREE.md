# AI recommendation workflow

Status: the development workflow is implemented and live verified. **The assignment's performance acceptance gate is not met.** See [verification and submission status](STEP_FOUR.md) for the public repository, demo and current acceptance gaps.

## Requirements and implemented behavior

An authenticated vendor submission creates one durable recommendation job per profile in the same Prisma transaction as the profile records. A background worker claims jobs using a conditional update and a unique lease token. Request handlers do not wait for the model. Multiple workers cannot save the same claimed job; expired leases can be recovered after a crash. Soft deletion cancels pending/running work and prevents later result persistence.

The service calls a bounded orchestrator with a scoped opening DTO, the current document's MIME type and a server-owned document loader. Raw database records, S3 paths, tenant identifiers and credentials are never model tool arguments. The actual Gemini model chooses function calls from a registry:

1. `parse_resume`: securely load the current S3 object/version and extract PDF or PPTX text.
2. `extract_features`: accept schema-validated experience, skills, location, education, keywords and verbatim supporting evidence.
3. `normalize_skills`: apply a versioned alias dictionary and deduplicate skills.
4. `match_profile`: calculate deterministic feature matches.
5. `score_profile`: calculate the weighted score, category, evidence completeness and explanation.
6. `finish_recommendation`: validate the final structured output against the scoring result.

The model chooses tools and can correct extraction; the registry enforces dependencies. It cannot provide another profile's ID, an external URL or an S3 key. Every input uses AJV validation, including rejecting additional properties. Gemini receives JSON Schema via `parametersJsonSchema`; unsupported legacy schema fields are not sent through its `parameters` field. Native model response parts, including opaque thought signatures, are preserved in transient request history as required for multi-turn calls. They are not persisted or exposed.

The agent is limited to ten model turns, twelve tool calls and bounded validation corrections. Invalid final scores, invented evidence and unknown tools are rejected. Retryable provider/network failures use at most three job attempts, backoff and provider retry guidance. An assigned manager can explicitly retry a terminal failure. The retry endpoint returns 202 and rejects another manager, tenant or vendor.

The completed recommendation and structured features/vector are committed atomically with job completion. A failed persistence transaction leaves no partial recommendation. Jobs retain bounded tool trace metadata, token counts, version, model, safe error code and stage timing. Logs contain structured events, without resume text, secrets or private chain-of-thought.

## Parsing and untrusted input

PDF text extraction uses the current PDF.js package in an isolated Node worker with evaluation disabled. PPTX extraction reads slide text inside bounded archives. The parser has a 15-second ceiling inside the overall attempt deadline, a 192 MB worker heap limit, 100-page PDF limit and 24,000-character text limit. It inherits no development loader arguments. Encrypted/unreadable, scanned-only or oversized documents fail with a recoverable UI state; OCR is not implemented.

Text is normalized and control/directional characters removed. Resume and opening content remain explicitly labelled untrusted data outside the system instruction. The model is told to ignore embedded commands and protected characteristics. Evidence and tool output validation provide additional boundaries; prompting does not guarantee resistance to every adversarial document. Only fictional profiles were used for verification.

## Deterministic policy

| Component | Rule |
| --- | --- |
| Skills | Unique canonical skill overlap divided by unique required skills. An empty requirement list scores 1. |
| Experience | Below minimum = 0; inclusive range = 1; above maximum = 0.8. A null maximum has no upper bound. Missing evidence = 0. |
| Location | Remote = 1; exact normalized city = 1; onsite/hybrid city mismatch = 0.5; missing onsite/hybrid location evidence = 0. |
| Final score | `0.5 * skills + 0.3 * experience + 0.2 * location`, stored to four decimal places. |
| Category | At least 0.75: recommended; at least 0.50: borderline; below 0.50: not recommended. |
| Confidence | Fraction of experience, skill and location fields with explicit evidence. This measures evidence completeness, not probability of job success. |

Education is extracted to satisfy the parsed schema but is not a scoring factor. Matching does not use identity, age, gender or other protected attributes. An AI result never shortlists or rejects a person; the hiring manager makes the decision.

## Manager and vendor UI

Only the assigned manager receives AI fields from the API. The manager sees queue/running/retry/failure states, recommendation badge, score, evidence confidence, grounded explanation, processing time and version. Quiet polling refreshes active work without replacing the list with a skeleton. Preview and human decision actions remain available while analysis runs.

Vendors receive the safe profile projection with no recommendation fields, processing metadata or internal storage paths. Pagination supports 10/25/100 profiles. Lists above 50 rows use measured virtualization; a 100-record browser fixture rendered six rows and reached the final row using the keyboard. That disposable list fixture had no resume bytes or AI output and was removed after this UI-only test. Light/dark themes and a 390-pixel mobile layout were visually checked.

## Configuration and execution

The committed `.env.example` defaults to the brief's strict `AI_PROCESSING_TIMEOUT_MS=1500`. This is an enforced timeout, not a claim that the live provider can complete within it.

Local provider verification uses a longer development timeout. Store these settings in an ignored `.env` with owner-only permissions (0600):

```dotenv
AI_WORKER_ENABLED=true
AI_PROCESSING_TIMEOUT_MS=60000
GEMINI_MIN_REQUEST_INTERVAL_MS=6000
```

Six-second spacing reduces pressure on low provider quotas and counts toward processing time. It is process-local; multiple server instances would need a shared project-wide limiter. The database leases protect job ownership across instances, independently of provider pacing.

Run the normal backend to start the worker. Use `npm run test:local` for isolated database tests. It provisions the separate localhost `zelosify_test` database; the application worker cannot claim its disposable jobs.

```sh
npm run build
npm test -- --run
npm run check:auth
npm run check:hiring
npm run check:recommendations
npm run benchmark:ai
```

`check:recommendations` is an explicit live test: real Keycloak sessions, real S3 PDF/PPTX uploads, automatic Gemini processing, result isolation and shortlist. It soft-deletes its fictional submissions afterward, retaining original objects under the existing soft-delete policy. Run it only against the local development setup. `benchmark:ai` makes real provider requests for up to 100 unique synthetic profiles, defaults to one concurrent run, and stops on quota exhaustion. It writes evidence under `.local/`; it does not bypass provider limits. Benchmarking measures Gemini and actual parsing with an in-memory document loader, excluding HTTP uploads, S3, database and queue waiting.

## Verified evidence and remaining acceptance gates

- Backend and frontend production builds pass. Existing frontend image-optimization warnings remain in legacy components.
- 50 automated tests now pass, including deterministic boundaries, schemas, tool correction limits, deadlines, tenant/manager/vendor isolation, full submission-to-decision flow, concurrent claims, cancellation, lease recovery, persistence rollback and 100-profile processing with a scripted model transport. The scripted load test is not live Gemini performance evidence.
- Live Keycloak/S3 access checks pass. A real PDF and PPTX completed automatic Gemini analysis, their manager-only API results were checked, and a human decision endpoint succeeded. Manager retry was verified through the UI with a 202 response.
- Live PDF processing: 35,257 ms; live PPTX processing: 35,607 ms with pacing. A retained PDF demonstration completed in 40,052 ms. An earlier unpaced S3 PPTX run took 13,212 ms. These are measured development results and **fail** the 1,500 ms target.
- The initial 100-profile live stress run, concurrency two and no request pacing, completed three profiles and returned provider quota errors for 96 and a parsing timeout for one. Successful-only median was 17,847 ms and P95 was 31,367 ms. This is **not** a valid passing full-sample P95 and does not establish 100 successful live profiles.
- The two-file live upload took 4,023 ms before returning. AI is asynchronous, but the existing multipart upload still waits for durable S3 writes and therefore also misses an absolute two-second HTTP requirement.
- Backend production dependency audit reports zero vulnerabilities. The existing development and access-log buckets are retained for local storage and logging.

The remaining work before claiming assignment compliance is to resolve and re-verify the latency and provider-capacity gates. More quota can help complete a larger benchmark but does not itself guarantee a 1.5-second tool-agent run. Sensible next actions are to clarify the brief's timing boundary with Zelosify, reduce model round trips while retaining real tool choice, and benchmark any alternative provider/model against the same acceptance criteria. No provider plan or billing changes have been made.

## Primary implementation references

- [Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Gemini Flash-Lite model capabilities](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite)
- [Gemini project-level rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [PDF.js Node example](https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs)
- [TanStack Virtual dynamic measurement](https://tanstack.com/virtual/latest/docs/framework/react/examples/dynamic)

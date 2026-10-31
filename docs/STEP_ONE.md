# Local foundation: historical verification

Historical snapshot recorded on 30 October 2026. See [current verification and submission status](STEP_FOUR.md) for the completed implementation and remaining acceptance gaps.

This record covers local foundation setup and implementation planning. The hiring module had not yet been implemented at the time of this verification.

## Local services

- Frontend: http://localhost:5173/login
- Backend: http://localhost:5050/ (5000 conflicts with a macOS service)
- Keycloak: http://localhost:8080/auth
- PostgreSQL: localhost:5445, database `zelosify`
- Docker Compose project: `zelosify-local`; volumes persist locally.
- Demo logins: `vendor.demo` and `manager.demo`. The generated password is `LOCAL_DEMO_PASSWORD` in the private backend `.env`; never publish it.
- Tenant: Bruce Wayne Corp (`bruce-wayne-corp`). Opening and profile implementation is documented in [the workflow report](STEP_TWO.md).

## Run locally

Use Node 22 or newer and Docker. From `Zelosify-Backend/Server`:

```sh
npm ci
npm run setup:local
docker compose up -d
# Wait until http://localhost:8080/auth/realms/Zelosify/.well-known/openid-configuration responds.
npm run prisma:deploy
npm run seed:local
npm run dev
```

In another terminal, from `Zelosify-Frontend`:

```sh
npm ci
npm run dev -- --hostname 127.0.0.1
```

The generated realm import is for a new local Keycloak volume. Imports do not overwrite an existing realm. Preserve `.env` when restarting; regenerating passwords while keeping database volumes will break existing credentials. Never run this development Compose configuration in production.

Checks from the backend directory:

```sh
npm run build
npm test -- --run
npm run check:auth
npm run check:connections
```

From the frontend: `npm run build`. Stop its development server before building, because both use `.next`.

## Connected providers

- Gemini key stays only in the backend `.env`. Model discovery and a native function call have been verified against the real provider.
- Selected model: `gemini-3.1-flash-lite`; changing `GEMINI_MODEL` is supported. `gemini-3.8-flash` returned HTTP 503 during setup.
- AWS profile: `zelosify`; selected Region: `ap-southeast-2`.
- Resume bucket: `<private-development-bucket>`.
- Access-log bucket: `<private-access-log-bucket>`; 30-day log lifecycle, including noncurrent versions.
- Both buckets: Block Public Access enabled, ACLs disabled, versioning, SSE-S3, SSE-C blocked, HTTPS-only policies, ABAC enabled.
- The log bucket does not log to itself, avoiding recursive logging.
- Node's current AWS SDK uses the browser-login profile; no permanent access keys are required. Credentials remain outside the repository in the AWS-managed local cache.
- Both development buckets are retained for resume storage and access logging.
- S3 read/write was checked using a disposable test object and its exact version was deleted afterward. Access-log delivery is asynchronous; configuration is verified, not guaranteed immediate delivery.
- The local application currently uses the developer's broad AWS project role. A deployed backend must use a dedicated, bucket-scoped workload role.

## Planned workflow screens at this verification stage

| Screen | Data/actions | States |
| --- | --- | --- |
| `/vendor/openings` | Tenant-scoped paginated openings; title, location, contract type, date, manager | Loading, empty, failure, forbidden |
| `/vendor/openings/:id` | Opening details, own uploads, multiple PDF/PPTX upload, preview, soft delete | Upload progress, validation error, partial failure, submitted |
| `/hiring-manager/openings` | Only openings assigned to the authenticated manager | Loading, empty, failure, forbidden |
| `/hiring-manager/openings/:id` | Submitted profiles, AI status/score/confidence/reason/latency, shortlist/reject | Queued, processing, completed, failed/retry, decision pending |

All screens require light/dark themes. Replace the starter's narrow-screen blocker for the assignment screens; skeletons, error boundaries and virtualization above 50 records are required. Current payments/home screens contain starter placeholders and are not the requested hiring module. Google/Microsoft login buttons are inherited, unconfigured and outside the requested two-role workflow.

## APIs and access rules

Use the brief's `/api/vendor/...` and `/api/hiring-manager/...` paths; preserve existing `/api/v1` routes as compatibility aliases where needed.

| Endpoint | Scope |
| --- | --- |
| GET `/api/vendor/openings` | IT_VENDOR + authenticated tenant; pagination |
| GET `/api/vendor/openings/:id` | Same tenant; include manager and only this vendor's profiles |
| POST `/api/vendor/openings/:id/profiles/presign` | Same tenant; backend-authorized upload intent, no bucket credentials in browser |
| POST `/api/vendor/openings/:id/profiles/upload` | Validate accepted objects, vendor ownership, type and size; transaction for submission + job |
| GET `/api/vendor/profiles/:id/preview` | Own active upload, same tenant; backend stream |
| DELETE `/api/vendor/profiles/:id` | Own active upload, same tenant; transactional soft delete |
| GET `/api/hiring-manager/openings` | HIRING_MANAGER + tenant + `hiringManagerId === user.id` |
| GET `/api/hiring-manager/openings/:id/profiles` | Same tenant + assigned manager; recommendations allowed here |
| GET `/api/hiring-manager/profiles/:id/preview` | Same tenant + assigned manager; backend stream |
| POST `/api/hiring-manager/profiles/:id/shortlist` | Same tenant + assigned manager; validated transactional state transition |
| POST `/api/hiring-manager/profiles/:id/reject` | Same tenant + assigned manager; validated transactional state transition |

Every resource lookup must include trusted tenant and ownership conditions. Do not take tenant, uploader, or manager identity from submitted JSON. Enforce authorization at API level even when the UI hides an action. Vendor responses must omit AI output. Tenant isolation needs separate test tenants even though all required seed openings belong to Bruce Wayne Corp.

## Database changes planned

Retain User/Tenants. Add Opening and hiringProfile with the brief's fields/enums, relations and indexes. Add `requiredSkills: String[]` to Opening and an explicit work-mode value so skill/location matching is unambiguous. Add source file metadata (original name, MIME, bytes, checksum), upload intent ownership, three-way recommendation classification, and processing state separate from shortlist/reject state. Use a PostgreSQL-backed job/outbox record so profile submission and recommendation scheduling commit together. Store validated results atomically with job completion, unique run keys, attempt count and safe failure metadata.

Seed at least 12 diverse openings under Bruce Wayne Corp and link each to a manager. Add extra vendors/managers/tenants to test fixtures for leakage tests, not to the required seed opening set.

## Agent architecture and implementation checklist

1. Controller → recommendation service → orchestrator → tool-capable Gemini model.
2. Register secure resume parsing, feature extraction, skill normalization, deterministic matching and scoring tools. The model chooses tools dynamically; each input and output is schema-validated.
3. Retrieve PDF/PPTX from S3 through the backend; reject unsupported/oversized files and prevent path/key substitution. Treat resume text as untrusted data, never as system instructions.
4. Scoring tool returns components and `0.5 * skills + 0.3 * experience + 0.2 * location`; the model must not calculate/override the score.
5. Policy classifies score >= .75 as recommended, >= .5 and < .75 as borderline, otherwise not recommended. Define missing/empty required skills and missing location explicitly in tests.
6. Bound agent rounds, tool timeouts and malformed-output retries. Store structured tool traces, validations, model/prompt/scorer versions, token usage and timing; do not store hidden chain-of-thought or raw secrets.
7. Async worker processes submitted jobs; UI polls or subscribes to status. Replays use an idempotency key and cannot partially overwrite a result.
8. Structured JSON logging for stage timings, errors and final score. Avoid raw resume text, passwords, cookies and tokens in logs.

## Planned acceptance checks

- Security: both roles; same-tenant different-vendor denial; different-manager denial; cross-tenant IDs and object keys; anonymous, malformed, expired and wrong-role tokens.
- Files: multiple PDF/PPTX, MIME/content validation, preview, soft deletion, transaction rollback and stale upload cleanup.
- Unit: experience boundaries, skill normalization/overlap, location rules, exact formula and thresholds.
- Integration: upload → submit → real recommendation → shortlist, retries and reruns.
- Performance: separate live-provider and stubbed load results; required 100 profiles and P95 < 2s. Never label mocked results as provider latency.

## Open questions and observed risks

1. The brief requires per-profile processing <= 1500ms and P95 < 2000ms. Tiny live function-call checks took 2321ms and 1535ms; async execution keeps HTTP/UI responsive but does not prove processing SLA compliance. Clarify whether timings include S3 retrieval, parsing, queue time and model calls. Real 100-profile timing is still required.
2. `requiredSkills` is absent from the sample Opening model although scoring requires it. Proposed additional field is documented above; location/work-mode semantics also need an explicit decision.
3. A presign endpoint is required, but the brief also says no frontend direct S3 access. Proposed default: backend-mediated uploads and previews; browser-to-S3 presigned PUT would require clarification of that constraint.
4. Free model quotas, cold starts, retries and provider saturation may conflict with the strict latency target. Do not fabricate a benchmark or silently substitute deterministic-only logic.
5. Starter dependencies had known advisories. Compatible fixes and targeted development-tool updates are applied. Both dependency audits reported zero known findings after these fixes (a point-in-time audit, not a security guarantee). This setup is not a production-readiness claim.
6. Authentication setup proves login and role gates, not the future opening/profile tenant-isolation rules. Those features were outside the scope of this foundation verification.

## Reference documentation

- Gemini function calling: https://ai.google.dev/gemini-api/docs/function-calling
- Keycloak containers/import: https://www.keycloak.org/server/containers
- Keycloak subject claim/basic scope: https://www.keycloak.org/docs/26.6.4/server_admin/index.html
- AWS S3 security: https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html

## Final verification results

- Backend TypeScript build: passed.
- Frontend production build, lint and page generation: passed.
- Existing backend test suite: 6 of 6 passed.
- Live local integration checks: vendor and manager login, authenticated user details, logout, wrong-password denial, anonymous/malformed-token denial, role separation, enrolled TOTP requirement and valid TOTP completion passed.
- Browser: vendor login and sign-out, and manager login verified.
- Gemini: actual function call succeeded; token usage returned. This is a connectivity test, not a completed resume agent or SLA benchmark.
- S3: real SDK upload/read/delete succeeded using profile credentials. Bucket security and logging configuration independently read back through AWS.
- Dependency audits: zero known findings for backend and frontend at verification time.
- Secret files: owner-only permissions and ignored by Git. No credentials included in this report.
- At the time of this foundation verification, changes were local and no public repository, deployment, submission email or demo had been created. Current publication status is documented in [the final verification report](STEP_FOUR.md).

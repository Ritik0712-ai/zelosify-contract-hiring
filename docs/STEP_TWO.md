# Step two completion report

Verified locally on 31 October 2026. This completes the secure hiring workflow scope. The AI recommendation agent and the assignment's processing SLA are still pending step three.

## Delivered workflow

- Twelve openings seeded under Bruce Wayne Corp, covering different roles, locations, experience ranges, contract durations, and open/on-hold/closed states.
- Separate vendor and hiring-manager workspaces at `/vendor/openings` and `/hiring-manager/openings`, with detail routes, search, status filters and pagination.
- Real PDF/PPTX multi-file submission through the backend, using the private S3 bucket and browser-login AWS credentials. Five files maximum per batch, 10 MB per file, 25 MB combined.
- Filename/type/size/content checks, bounded ZIP inspection, macro rejection, and validation before any object is written.
- Backend-owned upload authorization valid for ten minutes, bound to the authenticated vendor, tenant, opening, and exact file metadata. Repeated successful submissions are idempotent; concurrent claims cannot duplicate profiles.
- PDF.js canvas previews, escaped presentation text previews, and original-file downloads. All file access is authorized on the backend. No public bucket or S3 credentials are exposed to the browser.
- Vendors can see only their own uploads and profile counts. They can soft-delete their submissions; the database record and private original remain, while preview/list/decision access is denied after removal.
- Managers see only assigned openings and can preview, shortlist and reject their profiles. Decisions have timestamps, an immutable decision history and an expected-status check to reject stale updates.
- Light/dark themes, mobile layouts without the starter's screen-size blocker, skeletons, empty/error states, confirmation dialogs, visible focus, and upload progress.
- Session renewal via HTTP-only cookies, and a blocked public registration endpoint to prevent client-selected role/tenant membership.

## Authorization and transaction guarantees

Actor identity and tenant are loaded from the database only after JWT signature and issuer verification. Tenant and ownership conditions are included in resource queries. Hidden or unauthorized resource IDs return 404; wrong-role routes return 403. The UI guards are supplementary to the backend checks.

Every new database mutation uses a Prisma transaction. A submission commits its entire batch and pending recommendation jobs together. Storage failure or a database write failure creates no partial profile batch. Written S3 versions are compensated on failure. Failed compensation retains exact object receipts on the upload intent for operational cleanup; a process crash still requires stale-upload reconciliation. This is not a distributed transaction across S3 and PostgreSQL.

Soft deletion cancels pending recommendation jobs. Step three must continue checking profile deletion and scope when claiming or persisting jobs.

The `/profiles/presign` endpoint deliberately returns a backend upload authorization/path instead of sending the browser directly to S3. This resolves the brief's conflicting presign/direct-S3 wording in favor of backend-controlled file access. If Zelosify expects direct presigned browser PUTs, confirm that interpretation before changing the transport.

## API routes

The same protected contract routes are mounted at both `/api/vendor` and `/api/v1/vendor`, and at `/api/hiring-manager` and `/api/v1/hiring-manager`. Authentication remains under `/api/v1/auth`.

| Method and route suffix | Behavior |
| --- | --- |
| GET `/openings` | Tenant/manager-scoped list; `page`, `limit`, `search`, `status` |
| GET `/openings/:id` | Authorized opening details and scoped profile count |
| GET `/openings/:id/profiles` | Authorized paginated profiles and status filter |
| POST vendor `/openings/:id/profiles/presign` | Authorize exact files for upload |
| POST vendor `/openings/:id/profiles/upload` | Multipart `files` plus `uploadIntentId`; transactional batch |
| GET `/profiles/:id/preview` | Authorized PDF bytes or safe PPTX text preview |
| GET `/profiles/:id/preview?download=1` | Authorized original bytes |
| DELETE vendor `/profiles/:id` | Idempotent owned soft deletion |
| POST manager `/profiles/:id/shortlist` | Decision with `expectedStatus` |
| POST manager `/profiles/:id/reject` | Decision with `expectedStatus` |
| POST `/api/v1/auth/refresh` | Renew session cookies |
| POST `/api/v1/auth/register` | 403; membership must be provisioned |

Vendor response selections explicitly omit AI fields, uploader details belonging to others, and storage keys. Recommendation results are not computed or displayed yet.

## Verification evidence

- Backend TypeScript build passed.
- Frontend production build and full JSX lint validation passed (inherited image optimization warnings remain).
- 21 backend tests passed: six inherited controller tests and 15 PostgreSQL workflow tests.
- Workflow tests cover tenant/vendor/manager isolation; PDF/PPTX validation; idempotency; concurrent submission; stale decisions; soft deletion; storage compensation; database rollback; failed-cleanup receipts; safe preview content; and pagination.
- Live HTTP checks passed with real Keycloak and S3: anonymous/wrong-role/forged-role rejection, denied self-registration, untrusted-origin denial, vendor and manager ownership, cross-tenant IDs, byte-identical PDF preview, idempotent submission, shortlist/reject, stale decision denial, and deletion.
- Live auth checks passed for both roles, invalid credentials/tokens, enrolled TOTP and session renewal.
- Browser verified multi-file PDF/PPTX upload, invalid PDF rejection, both readable preview types, original download, soft-delete confirmation/removal, shortlist and rejection confirmations, light/dark theme and mobile controls.
- The mobile detail view was checked at 390 × 844 with no horizontal overflow.
- Dependency audits reported zero known findings for both applications at verification time.
- Full JSX linting is now enabled. Minor inherited lint errors were corrected; older image optimization warnings remain outside the new workspace.

Only fictional profiles were used. Two active demo submissions are left on the senior frontend opening: a shortlisted PDF and rejected PPTX. Automated HTTP test submissions are soft-deleted. All cloud resources remain private, in `ap-southeast-2`, and retained as requested for the next step.

## Next step

Implement the real Gemini tool-calling agent, secure resume parsing/extraction/normalization, deterministic scoring tool, schema validation, bounded retries, prompt-injection defenses, token/stage timing logs, idempotent job processing and hiring-manager-only recommendation displays. Add the required 100-profile benchmark and virtualization behavior as part of the remaining interface/performance work.

Small provider checks in step one took about 1.5–2.3 seconds, so the 1500 ms per-profile and P95 under 2000 ms requirements remain unproven. Async HTTP/UI behavior alone does not satisfy those processing targets. No deployment, public repository push, submission email or final demo video has been performed.

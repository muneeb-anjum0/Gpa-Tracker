# Security Audit Report

## Scope

Repository reviewed: Vite/React GPA Tracker hosted on Firebase Hosting with Firebase Auth and Cloud Firestore.

No custom backend server, API routes, server actions, middleware, file upload endpoint, webhook handler, admin area, Docker configuration, CI workflow, queue, worker, SQL database, OAuth flow, payment flow, or AI/LLM feature was present.

## Threat model summary

Assets:

- User Firebase Auth accounts.
- Private grade records stored at `/users/{uid}/files/CURRENT-GRADES.json`.
- Firebase public client configuration.
- Source code, Hosting config, Firestore rules, and deployment configuration.

Threat actors:

- Unauthenticated internet users.
- Malicious authenticated users attempting horizontal access to another user's grade file.
- Users modifying browser state or direct Firestore requests.
- Automated bots attempting credential stuffing against Firebase Auth.
- Anyone with access to copied Firebase client configuration.

Major abuse cases considered:

- User A reads or modifies User B's Firestore document.
- Unauthenticated user reads or writes grade data.
- User manipulates Firestore path, `userId`, file name, grade scale, timestamps, or extra fields.
- User imports oversized or malformed JSON to create denial of service or persistent malformed state.
- XSS through imported course or semester names.
- Browser security header absence enabling framing or broad script/resource execution.
- Secrets committed to the repository.
- Dependency vulnerabilities in the frontend build/runtime stack.

## Findings

### SEC-001: Firestore writes lacked schema validation

- Severity: High
- CWE: CWE-20 Improper Input Validation
- Affected component: `firebase/firestore.rules`
- Attack scenario: An authenticated user could write arbitrary top-level fields or unexpected grade-file shapes to their document by bypassing the UI and calling Firestore directly.
- Evidence: Previous rules only checked `request.auth.uid == userId` and `fileId == "CURRENT-GRADES.json"`.
- Root cause: Authorization and data validation were combined into one minimal rule with no write contract.
- Remediation: Added top-level field allow-listing, fixed file name, grade-scale enum, timestamp checks, semester list type and size limit, create/update separation, and delete denial.
- Files changed: `firebase/firestore.rules`, `tests/firestore.rules.test.mjs`
- Verification performed: `npm run test:rules`
- Status: Fixed for practical Firestore rule depth. Deep nested course normalization is enforced in client code and tested separately due Firestore evaluator limits.

### SEC-002: Cross-user access needed automated regression tests

- Severity: High
- CWE: CWE-862 Missing Authorization
- Affected component: Firestore authorization boundary
- Attack scenario: A future rule change could accidentally allow User A to read or update User B's grade file.
- Evidence: No Firestore Security Rules unit tests existed.
- Root cause: Authorization boundary was not covered by automated tests.
- Remediation: Added Firebase Rules emulator tests for unauthenticated access, owner access, cross-user read/update denial, invalid file names, malformed top-level documents, and delete denial.
- Files changed: `package.json`, `tests/firestore.rules.test.mjs`, `firebase.json`
- Verification performed: `npm run test:rules`
- Status: Fixed.

### SEC-003: JSON import accepted unbounded and unsanitized grade data

- Severity: Medium
- CWE: CWE-20 Improper Input Validation
- Affected component: `src/App.jsx`
- Attack scenario: A user could import a very large or malformed JSON file, persist unexpected shapes, or cause rendering/performance issues.
- Evidence: Previous import path parsed JSON and stored any array without bounding semesters, courses, names, grades, or credits.
- Root cause: Client-side import trusted local JSON shape.
- Remediation: Added `src/lib/grades.js` with bounded sanitizer for semester count, course count, IDs, names, credit values, grade values, and import file size. Save path sanitizes before Firestore writes.
- Files changed: `src/lib/grades.js`, `src/App.jsx`, `tests/grades.test.mjs`
- Verification performed: `npm test`, `npm run lint`, `npm run build`
- Status: Fixed.

### SEC-004: Raw Firebase errors were exposed to users

- Severity: Medium
- CWE: CWE-209 Generation of Error Message Containing Sensitive Information
- Affected component: `src/App.jsx`
- Attack scenario: Provider/internal error details could be shown directly in the UI during auth or save failures.
- Evidence: Previous code displayed `error.message`.
- Root cause: Raw exception text was used as user-facing copy.
- Remediation: Replaced auth and save exception rendering with generic user-facing errors.
- Files changed: `src/App.jsx`
- Verification performed: `npm run lint`, `npm run build`
- Status: Fixed.

### SEC-005: Firebase Hosting lacked explicit security headers

- Severity: Medium
- CWE: CWE-693 Protection Mechanism Failure
- Affected component: `firebase.json`
- Attack scenario: Missing CSP/framing/MIME/referrer/permissions headers reduced browser-side defense in depth.
- Evidence: Previous `firebase.json` had no `headers` block.
- Root cause: Static Hosting defaults were not hardened in repository config.
- Remediation: Added CSP, HSTS, `nosniff`, frame denial, referrer policy, permissions policy, COOP, CORP, and cache-control rules.
- Files changed: `firebase.json`, `tests/firebase-hosting.test.mjs`
- Verification performed: `npm test`, `npm run build`
- Status: Fixed in repo. Requires deployment and external header scan to verify production.

### SEC-006: Dependency advisories were present

- Severity: Medium
- CWE: CWE-1104 Use of Unmaintained Third Party Components
- Affected component: `package-lock.json`
- Attack scenario: Vulnerable development/build dependencies could expose local development or build environments.
- Evidence: `npm audit` initially reported 10 vulnerabilities.
- Root cause: Lockfile pinned older vulnerable transitive versions.
- Remediation: Ran `npm audit fix`, updating vulnerable transitive packages.
- Files changed: `package-lock.json`
- Verification performed: `npm audit --audit-level=low`
- Status: Fixed.

### SEC-007: No tracked-file secret scan existed

- Severity: Low
- CWE: CWE-798 Use of Hard-coded Credentials
- Affected component: Repository workflow
- Attack scenario: Future commits could accidentally include API keys, private keys, service accounts, or passwords.
- Evidence: No secret scanning command existed in the repo.
- Root cause: Missing local security tooling.
- Remediation: Added `scripts/secret-scan.mjs` and `npm run security:secrets`.
- Files changed: `scripts/secret-scan.mjs`, `package.json`
- Verification performed: `npm run security:secrets`
- Status: Fixed for tracked-file pattern scanning. A full enterprise scanner such as Gitleaks in CI remains recommended.

### SEC-008: Firebase client API key was shared outside source control

- Severity: Informational
- CWE: CWE-200 Exposure of Sensitive Information to an Unauthorized Actor
- Affected component: Operational Firebase configuration
- Attack scenario: An exposed Firebase Web API key can be abused if unrestricted, even though it is public client configuration and not a server secret.
- Evidence: The key was provided in chat and placed only in ignored `.env.local`.
- Root cause: Temporary credentials were shared for setup.
- Remediation: Kept values out of tracked files and documented rotation/restriction requirements.
- Files changed: `.env.local` local ignored file, `SECURITY_HARDENING.md`
- Verification performed: `npm run security:secrets`
- Status: Operational action remains: restrict/rotate in Google Cloud/Firebase.

## Verification summary

- `npm audit --audit-level=low`: Passed.
- `npm run security:secrets`: Passed.
- `npm run lint`: Passed.
- `npm test`: Passed.
- `npm run test:rules`: Passed.
- `npm run build`: Passed after remediation.

## Unresolved or provider-side items

- Firebase Auth rate limiting, password reset behavior, password hashing, token rotation, and account abuse controls are provider-managed and must be reviewed in Firebase/Google Cloud.
- Firebase App Check is not enabled in this repository.
- Production headers require deployment before external verification.
- Firestore deep nested course validation is intentionally handled client-side because a full nested rules validator exceeded Firestore Rules evaluation limits for realistic grade documents.

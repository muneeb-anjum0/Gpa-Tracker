# Security Hardening

## Architecture summary

- Framework: Vite, React, JavaScript modules.
- Backend: No custom application server, API routes, server actions, middleware, webhooks, workers, or admin routes are present in this repository.
- Authentication: Firebase Authentication email/password flow through the Firebase Web SDK.
- Database: Cloud Firestore. The protected user data path is `/users/{uid}/files/CURRENT-GRADES.json`.
- Hosting: Firebase Hosting serves the production static build from `dist`.
- Trust boundaries: Browser input is untrusted. Firebase Auth establishes identity. Firestore Security Rules enforce owner-only access and write constraints. Firebase Hosting applies HTTP response headers.
- Sensitive data: User email addresses are handled by Firebase Auth. Grade data is private per authenticated user in Firestore. Firebase Web API keys are public client configuration, not server secrets, but should be restricted in Google Cloud/Firebase settings.

## Controls implemented

- Authentication: Uses Firebase Auth SDK. User-facing auth errors are generic and no passwords are logged by the app.
- Authorization and user isolation: Firestore rules require `request.auth.uid == userId` for reads and writes.
- Data boundary: Only `CURRENT-GRADES.json` is readable/writable under the authenticated user's own path. Deletes are denied.
- Validation: Client-side grade import/edit data is normalized and bounded before app state and Firestore writes. Firestore rules enforce allowed top-level fields, file name, grade-scale enum, timestamp discipline, and max semester list size.
- Session behavior: Firebase Auth local persistence is used. The app maintains a client-side 30-day session-age hint and signs out when exceeded. The server-side session/token model is managed by Firebase Auth.
- CSRF: No cookie-authenticated custom backend endpoints exist. Firestore writes require Firebase Auth bearer credentials and Firestore rules.
- CORS: No custom CORS-enabled application server exists. Firebase service endpoints are called directly by the Firebase SDK.
- CSP and headers: Firebase Hosting applies explicit browser security headers for all hosted responses.
- File handling: JSON import is local-only, size-limited, parsed as JSON, sanitized, and never uploaded as an arbitrary file. Export creates a local JSON blob.
- Webhooks: None present.
- Rate limiting: No custom login endpoint exists in the repo. Firebase Auth provider-side abuse controls should be configured in Firebase/Google Cloud.
- Secrets: Real secrets are not tracked. `.env.local` is ignored. A tracked-file secret scan script was added.
- Logging: The app avoids logging credentials and no longer renders raw Firebase auth/save exceptions to users. Provider logs are managed by Firebase.
- Dependency security: `npm audit` currently reports zero vulnerabilities.
- Deployment hardening: Firebase Hosting headers, no-store HTML caching, immutable asset caching, Firestore emulator config, and security tests are configured.

## Security-header matrix

| Header | Value | Location | Purpose |
| --- | --- | --- | --- |
| `Content-Security-Policy` | `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://www.googleapis.com; upgrade-insecure-requests` | `firebase.json` | Restricts script, object, frame, connection, image, font, and form destinations. `style-src 'unsafe-inline'` is retained for React/framer-motion inline style compatibility. |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | `firebase.json` | Requires HTTPS on Firebase-hosted HTTPS origins. |
| `X-Content-Type-Options` | `nosniff` | `firebase.json` | Prevents MIME sniffing. |
| `X-Frame-Options` | `DENY` | `firebase.json` | Defense in depth against framing on older browsers. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | `firebase.json` | Limits cross-origin referrer leakage while preserving same-origin usefulness. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()` | `firebase.json` | Disables unused browser capabilities. |
| `Cross-Origin-Opener-Policy` | `same-origin` | `firebase.json` | Isolates the browsing context from cross-origin popups. |
| `Cross-Origin-Resource-Policy` | `same-origin` | `firebase.json` | Restricts cross-origin embedding of resources. |
| `Cache-Control` | `no-store` for `**/*.html` | `firebase.json` | Prevents stale HTML/app shell caching. |
| `Cache-Control` | `public, max-age=31536000, immutable` for `/assets/**` | `firebase.json` | Allows safe long caching for hashed build assets. |

## Environment-variable inventory

| Variable | Classification | Required | Purpose |
| --- | --- | --- | --- |
| `VITE_FIREBASE_API_KEY` | Public client config | Yes | Firebase Web API key used by the client SDK. Restrict in provider settings. |
| `VITE_FIREBASE_AUTH_DOMAIN` | Public client config | Yes | Firebase Auth domain. |
| `VITE_FIREBASE_PROJECT_ID` | Public client config | Yes | Firebase project id. |
| `VITE_FIREBASE_STORAGE_BUCKET` | Public client config | Yes | Firebase storage bucket config. Storage is not used by the current app. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Public client config | Yes | Firebase sender id. |
| `VITE_FIREBASE_APP_ID` | Public client config | Yes | Firebase web app id. |
| `VITE_FIREBASE_MEASUREMENT_ID` | Public client config | Optional | Analytics measurement id. Analytics is not initialized in the current code. |

## Remaining operational actions

- Rotate or restrict the Firebase Web API key shared in chat. Treat it as public client config, but restrict it by authorized domains and allowed APIs in Google Cloud.
- Configure Firebase Auth provider-side protections such as email/password policy, abuse throttling, and optional App Check where appropriate.
- Review Firebase Authorized Domains and remove unused domains.
- Deploy the updated Firestore rules and Hosting headers with `npx firebase-tools deploy`.
- Verify the deployed production URL with SecurityHeaders.com after deployment. Do not claim an A+ until the deployed URL is scanned.
- Consider enabling Firebase App Check for Firestore abuse reduction. This is provider-side setup and requires client integration work.
- Configure log retention and alerting in Google Cloud/Firebase for auth abuse and Firestore denied-access spikes.

## Security verification commands

```bash
npm audit --audit-level=low
npm run security:secrets
npm run lint
npm test
npm run test:rules
npm run build
npm run security:check
```

Header inspection after local or production hosting:

```bash
curl -I https://thegpa-tracker.web.app
```

## Known limitations

- This is a static client application. There is no custom server where server-side rate limiting, CSRF middleware, centralized request logging, or API validation can be implemented.
- Firestore Rules cannot efficiently perform deep validation over every nested course object in a realistic document without hitting evaluator limits. The rules enforce identity, path, top-level fields, timestamps, grade scale, and list size; client code performs deep normalization before writes.
- Firebase Auth session token security, password hashing, password reset, and brute-force defenses are managed by Firebase, not by this repository.
- No claim is made that the app is fully OWASP ASVS 5.0 Level 2 verified. The implemented controls are mapped to this repository's actual attack surface.

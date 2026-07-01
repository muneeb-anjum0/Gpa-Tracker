# GPA Tracker

Minimal Firebase GPA tracker with email/password auth, per-user Firestore storage, semester analytics, and manual save control.

## Live

https://thegpa-tracker.web.app

## Stack

React, Vite, Firebase Auth, Firestore, Firebase Hosting, Recharts.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

## Deploy

```bash
npm run firebase:deploy
```

Firestore stores grades at:

```text
users/{uid}/files/CURRENT-GRADES.json
```

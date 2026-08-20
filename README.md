# RightTouch Technician - Frontend

React frontend for the RightTouch Technician portal. Connects to every technician API.

## Setup

```bash
npm install
npm run dev
```

## API Base URL

Create a `.env` file in the project root:

```
VITE_API_BASE_URL=https://your-server.com
```

If not set, it defaults to `https://your-server.com`.

## Login flow

- Login is OTP based: enter mobile → "Send OTP" (`POST /login/technician`) → enter OTP → verify (`POST /login/technician/verify-otp`).
- Signup sends OTP with `termsAndServices` + `privacyPolicy` consent flags.

After login the token is stored in localStorage and sent as `Authorization: Bearer <token>` on all authenticated calls.

## Features (all APIs connected)

- Auth: signup OTP, signup verify OTP, login request OTP, login verify OTP
- Profile: create profile, my profile, technician by id, update, add/remove skills, availability (online/offline), training, profile image upload, live location
- KYC: submit KYC, upload KYC documents, submit bank details, KYC status
- Jobs: broadcasted jobs, respond accept/decline, current jobs, update job status, upload work images, job history, cancel booking
- Wallet: balance, transactions, request withdrawal, withdrawal history, cancel withdrawal

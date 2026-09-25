# Email Assets

Files in this folder are served by Firebase Hosting at
`https://elecafe.ca/email-assets/...` and are referenced by branded
order/auth emails.

## Why these are NOT in Firebase Storage

Email clients (Gmail, Apple Mail, Outlook, etc.) cannot generate App
Check tokens. After enforcing App Check on Cloud Storage, any image
URL pointing at `firebasestorage.googleapis.com` would render as a
broken-image icon in customer emails.

Hosting-served URLs are immune to App Check enforcement, so emails
keep working when App Check is enforced on Storage.

## Files

- `logo-white.png` — the logo used in every email header (white on the
  navy header). Generated from `logo.png` (every visible pixel → white,
  transparency kept). Rendered by `functions/src/lib/emailLayout.ts`.
- `logo.png` — original navy logo (source for the white version). Specs:
  - Format: PNG with RGBA (transparent background)
  - Size: ~400px wide × auto height
  - File size: under 100 KB
  - Color: light/cream so it shows on the dark midnight email header

## To replace the logo

Drop a new `logo.png` file in this folder and run `firebase deploy`.
The change takes effect on the next email send.

## Override path

The default path embedded in `functions/src/index.ts` is
`https://elecafe.ca/email-assets/logo.png`. If you need to point
emails at a different URL (e.g., a CDN), set `emailLogoUrl` in
the `/settings/global` Firestore document. That value overrides
the default at runtime without code changes.

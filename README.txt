Beauty Cabinet V1.6.1 — dual-image product records and stronger overlap analysis

WHAT CHANGED
- V1.6.1 removes the encrypted-backup file-picker type filter that caused files to appear disabled in iPhone/iPad Files. Backup structure is still validated after selection.
- Each product can now keep two separate local images:
  1. your real-life product photo
  2. a locally saved copy of an official / online product image
- An optional source URL can be recorded as text. The app never hotlinks or automatically requests it.
- Cabinet cards show a thumbnail, preferring your real-life photo and falling back to the official/online local copy.
- Similar & Overlap now distinguishes:
  True Duplicate, Color Duplicate, Functional Duplicate, Complementary, and Low Overlap.
- Every pair result shows shared attributes and field-by-field differences.
- Backup passwords are entered in an in-app dialog instead of browser prompt boxes for better iPhone/iPad behavior.
- Encrypted backup restore is now an atomic IndexedDB transaction, so a failed restore does not leave a partially replaced cabinet.

DATA AND BACKUP COMPATIBILITY
- The IndexedDB name remains: beauty-cabinet-local-v15
- Existing V1.5 local product data is read in place; no copy or reset is required.
- The encrypted .beautybackup envelope remains version 2.
- V1.5 encrypted backups can be imported by V1.6.
- V1.6 backups include both image types, their local image bytes, the optional source URL, settings, and all product fields.
- The legacy imageId field is retained as the preferred-image pointer for backward compatibility.

PRIVACY
- Product data and image bytes remain only in the browser's local IndexedDB.
- GitHub Pages hosts only the generic app files in this folder.
- No analytics, trackers, telemetry, remote database, third-party SDK, or remote image hotlinking is used.
- The live local database is intentionally not encrypted because the app has no daily login.
- Exported .beautybackup files are encrypted with AES-256-GCM.
- Backup keys are derived with PBKDF2-HMAC-SHA-256 (300,000 iterations) and a random salt.

DEPLOY TO GITHUB PAGES
1. Upload ALL files in this folder to the repository root and commit.
2. Wait for GitHub Pages deployment to finish.
3. On each iPhone/iPad/Windows browser, open the site once with ?v=161 appended:
   https://USERNAME.github.io/REPO/?v=161
4. Confirm the header says V1.6.1.
5. The original site URL can be used normally after the new version appears.

RECOMMENDED CHECK
1. Open the existing cabinet and confirm V1.5 products still appear.
2. Add both image types to one product and confirm its Cabinet thumbnail.
3. Reload and confirm both images remain.
4. Compare 2–4 products and review relationship type plus differences.
5. Export an encrypted backup.
6. Restore it on a test browser/profile and confirm both image types return.

SAFARI / STORAGE NOTE
iPhone and iPad Safari can remove website storage under device pressure or when site data is cleared. Keep periodic encrypted .beautybackup files outside the browser. Private Browsing is not suitable for durable storage.

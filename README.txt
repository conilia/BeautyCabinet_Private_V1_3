Beauty Cabinet V1.5.0 — Local-first, no daily password

WHAT CHANGED
- Removed the app login / PIN / Master Password flow completely.
- The app opens directly into Cabinet on iPhone, iPad and Windows browsers.
- Product records and compressed product images are stored only in local IndexedDB.
- GitHub Pages hosts only generic app code; do not commit personal exports or images.
- Daily local data is intentionally NOT encrypted so there is no login friction.
- Exported .beautybackup files ARE encrypted with AES-256-GCM.
- Backup encryption key is derived from a backup-only password with PBKDF2-HMAC-SHA-256.
- Backup password is only requested when exporting/restoring a migration backup.
- Product images are resized to max 1100 px before local storage.
- Old Beauty Cabinet service workers/caches are actively removed to avoid stale iOS pages.

IMPORTANT PRIVACY TRADEOFF
Because there is no daily password, someone who can access an already-unlocked device/browser profile or its local browser data may be able to read the local Beauty Cabinet database. The encrypted backup protects the migration file, not the live local database.

GITHUB PAGES UPDATE
1. Upload ALL files in this folder to the repository root and commit.
2. Wait for Pages deployment to finish.
3. On iPhone/iPad open the site once with ?v=150 appended, e.g.
   https://USERNAME.github.io/REPO/?v=150
4. Confirm the header says V1.5.0.
5. Test: add product -> reload -> product remains -> export encrypted backup.

BACKUP / DEVICE MIGRATION
Old device: Privacy/Home -> Export encrypted backup -> choose a backup password.
New device: open the same app -> Import encrypted backup -> choose file -> enter the same backup password.

V1.4 NOTE
V1.5 uses a new local database. It does not silently delete the old V1.4 encrypted test vault and does not automatically import it. If V1.4 contained important data, retain its backup before removing anything. If it was only test data, simply start fresh in V1.5.

Beauty Cabinet V1.4.0 — Private local vault

WHAT CHANGED
- No personal products/photos are included in the source code.
- Removed cache-first PWA behavior that caused old iPhone/iPad pages to stay stuck.
- Old Beauty Cabinet service workers/caches are actively removed.
- Reset now clears IndexedDB stores in place instead of deleting the database, which is more reliable on iOS.
- If a test vault exists but you do not know its password, use “重置并创建新柜”.
- Product data and imported product images are encrypted locally with AES-256-GCM.
- Encrypted .beautybackup export/import remains available for device migration.

GITHUB PAGES UPDATE
1. Upload ALL files in this folder to the repository root and commit.
2. Wait for Pages deployment to finish.
3. On iPhone/iPad open the site in Safari with ?v=140 appended once, e.g.
   https://USERNAME.github.io/REPO/?v=140
4. Confirm the login card says V1.4.0.
5. If an old test vault is detected and you do not know its password, tap “重置并创建新柜”.
6. Create a new Master Password and test adding one product.
7. Export a .beautybackup before entering lots of real data.

PRIVACY
GitHub Pages hosts only the app code. Product data/images are stored in the browser's local IndexedDB and encrypted before storage. Do not commit exported backups or personal images to GitHub.

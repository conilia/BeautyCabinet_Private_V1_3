Beauty Cabinet V1.7.0 — Scan Shelf, structured attributes, local-first data

V1.6.1 FEATURES PRESERVED
- Cabinet, Product Passport, product editing and Cabinet thumbnails.
- Separate local fields for your real-life product photo and an official/online product image.
- Optional official-image source URL saved as local text only; no remote hotlinking.
- Similar & Overlap, Compare, Expiry / PAO and product status management.
- No login. Product records and images stay in IndexedDB on this device.
- AES-256-GCM encrypted .beautybackup import/export with PBKDF2-HMAC-SHA-256.
- V1.2 JSON import and the iPhone/iPad file-picker compatibility fix.

NEW IN V1.7.0
- Scan Shelf with three workflows:
  1. Single Product: combine 1–5 photos of one item.
  2. Single-Image Batch: locally propose multiple crops from one group photo.
  3. Paired Batch: front group photo + back group photo, then Confirm pairings.
- A ProductCandidate keeps sourceImages[] and evidence from all its photos. A photo is not treated as a separate product.
- Review detected products before import: accept, edit, delete a false detection, merge detections, mark unidentified, add a product-specific bottom/side photo, and adjust crops.
- Import is always explicit. Only accepted candidates are written to Cabinet.
- Local duplicate warnings: Possible existing item, Same product different shade, and Possible duplicate.
- Structured product attributes: hue, undertone, saturation, depth, texture, finish, coverage and function.
- Similar & Overlap uses structured attributes plus text, and keeps five relationship classes: True Duplicate, Color Duplicate, Functional Duplicate, Complementary and Unique.
- Relationship records, structured attributes, saved source photos/crops, scan sessions and products are included in encrypted backups.

LOCAL RECOGNITION LIMIT
- This package does not contain or contact a remote AI/product-recognition API.
- Local browser processing proposes object crops, front/back pairings and basic color evidence. It cannot reliably identify every brand, product name, shade, barcode, batch code or ingredient list.
- Brand/name fields therefore require user review or manual entry. Remote recognition is OFF and no upload path is included.
- On paired scans, keep products separated, aligned in one row when practical, and in approximately the same positions after flipping. Correct any proposed mismatch on Confirm pairings.

DATA, BACKUP AND UPGRADE COMPATIBILITY
- IndexedDB name remains: beauty-cabinet-local-v15
- V1.7 raises only the internal database schema version so the new scanSessions and relationships stores can be added. Existing product/image/settings stores are preserved in place.
- The encrypted .beautybackup envelope and payload remain version 2.
- V1.5 and V1.6 encrypted backups remain importable. Missing V1.7 arrays are treated as empty.
- The legacy imageId pointer remains for backward compatibility.
- V1.7 backups include product fields, both product-image types, source images/crops, scan sessions, structured attributes, relationship records and settings.

PRIVACY
- GitHub Pages receives only these generic App files, never IndexedDB contents.
- No analytics, trackers, telemetry, third-party database, third-party SDK or automatic upload is used.
- Content Security Policy blocks outbound connections. Stored photos and Cabinet/profile records are never sent anywhere by this App.
- The live browser database is not encrypted because the App has no daily login. Exported .beautybackup files are encrypted.

DEPLOY TO GITHUB PAGES
1. Keep a copy of your current V1.6.1 repository folder.
2. Upload all seven V1.7 files to the existing repository root, replacing the files with the same names:
   index.html, app.js, styles.css, manifest.webmanifest, service-worker.js, icon.svg, README.txt
3. Do not upload any personal backup, JSON export or product photo.
4. Commit the changes and wait for GitHub Pages to finish deploying.
5. On each iPhone/iPad/Windows browser, open the existing site once with ?v=170 appended:
   https://USERNAME.github.io/REPO/?v=170
6. Confirm the header says V1.7.0 · Scan Shelf. After that, the normal URL is sufficient.

QUICK USE
1. Open Scan from the bottom navigation.
2. Choose Single Product, Single-Image Batch or Paired Batch.
3. Take/select the requested photo(s). For a single product, choose Add another angle or Start recognition after each photo.
4. For Paired Batch, inspect and correct Confirm pairings.
5. On Review detected products, edit all important fields. Delete false detections, merge duplicates or mark an item unidentified as needed.
6. Leave Accept and import checked only for candidates you want to save, then choose Import confirmed candidates.
7. Open Cabinet to verify the imported products and thumbnails.
8. Export an encrypted .beautybackup after important changes.

DEVICE CHECKLIST
- iPhone Safari: camera capture, Photos selection, one-product extra angle, .beautybackup import/export.
- iPad Safari: the same flows and paired front/back scan.
- Windows Chrome/Edge: multiple-image selection, batch scan, pairing edits, candidate edits and refresh persistence.
- Confirm that adding an extra photo to one candidate does not add it to other candidates.
- Reload the page during an unfinished scan and confirm it appears under Unfinished scans.

SAFARI STORAGE NOTE
iPhone/iPad Safari may remove website storage under device pressure or when site data is cleared. Do not use Private Browsing for durable data. Keep periodic encrypted .beautybackup files in Files, iCloud Drive or another location you control.

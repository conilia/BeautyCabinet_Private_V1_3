Beauty Cabinet V1.7.1 — Local Detection + optional AI Identification

V1.7 FEATURES PRESERVED
- Cabinet, Product Passport, thumbnails, product editing and dual local image fields.
- Your real-life product image plus an official/reference image and optional source URL.
- Similar & Overlap, Compare, Expiry / PAO and product status management.
- Structured attributes: hue, undertone, saturation, depth, texture, finish, coverage and function.
- Relationship classes: True Duplicate, Color Duplicate, Functional Duplicate, Complementary and Unique.
- Single Product Multi-Photo, Single-Image Batch and Paired Batch Scan.
- Front/back pairing confirmation, candidate review/edit/delete/merge, unidentified marking and candidate-specific extra photos.
- No login, local IndexedDB, V1.2 JSON import and AES-256-GCM encrypted .beautybackup import/export.

WHAT V1.7.1 CHANGES
- Scan Shelf now clearly separates two stages:
  Stage 1 — Local Detection
  Stage 2 — AI Product Identification
- Local image loading, compression, region proposals, crops, color/shape evidence and front/back pairing are never described as product recognition.
- Local Detection has a visible progress panel and a persistent completion panel with candidate/crop/manual-adjustment counts.
- “Local confidence” is replaced by Detection confidence.
- Identification confidence is shown only after a configured AI proxy returns an identification result.
- Single-Image Batch uses a two-dimensional connected-region proposal method, including products arranged in multiple rows. It remains a heuristic, so all crops are editable.
- AI Identification is optional, OFF by default and requires explicit confirmation for every run.
- Candidate review remains mandatory after AI suggestions. Alternative matches can be selected before import.
- Visible product line/version, barcode text, batch/shade code and packaging text can be edited and saved.
- AI completion has a persistent summary and filters: Show all, Identified, Needs confirmation and Unidentified.

EXACT BEHAVIOR WITHOUT AN AI PROXY
- Local Detection, all three scan modes, crops, pairing, manual editing and Cabinet import continue to work.
- The “Identify products with AI” button still opens the full privacy confirmation.
- If the user declines, no image is prepared or transmitted and the review screen states that AI was declined.
- If the user approves but no secure proxy is configured, no fetch/upload occurs. The review screen states that AI is unavailable and no images left the device.
- The App never fabricates brand, product, shade or identification-confidence results.

PRIVACY BOUNDARY
- Only after explicit per-run confirmation can the client send images.
- The request builder reads only sourceImages[] belonging to candidates in the active scan. For batch mode it can additionally send that active scan's full batch image so the proxy may propose missed regions.
- Existing Cabinet records, skin profile, skincare history and unrelated stored images are not read into the AI request.
- Requests use credentials: omit, no-referrer and no-store semantics.
- No API key, provider token or personal data is stored in the repository.
- Content Security Policy allows connections only to the same origin.
- GitHub receives generic App code only; IndexedDB data is never committed.

SECURE AI PROXY CONFIGURATION
GitHub Pages cannot safely hold a private AI API key. A real recognizer therefore requires a server-side, same-origin proxy that keeps provider credentials on the server.

The shipped index.html contains this disabled setting:
  <meta name="beauty-ai-endpoint" content="">

An operator with a secure same-origin backend may set a relative URL, for example:
  <meta name="beauty-ai-endpoint" content="/api/beauty-identify">

Do not put an API key in this tag or anywhere in frontend JavaScript.

CLIENT REQUEST CONTRACT — multipart/form-data
- metadata: metadata.json with:
  contractVersion: 1
  appVersion
  scanMode: single | batch | paired
  candidates[]: candidateId and images[]
  each image descriptor: field, role, crop and mime
  optional batchFullImage when scanMode is batch
- image_N: compressed current-scan crop/image files

EXPECTED JSON RESPONSE
{
  "contractVersion": 1,
  "candidates": [
    {
      "candidateId": "existing candidate id",
      "brand": "...",
      "productName": "...",
      "shade": "...",
      "category": "...",
      "productLine": "...",
      "barcodeText": "...",
      "batchCode": "...",
      "packagingText": "...",
      "confidence": 0.0,
      "attributes": {
        "hue": "...",
        "undertone": "...",
        "saturation": "...",
        "depth": "...",
        "texture": "...",
        "finish": "...",
        "coverage": "...",
        "function": "..."
      },
      "alternatives": []
    }
  ]
}

For a batch item missed locally, the proxy may return an item without candidateId and include crop {x,y,width,height} percentages plus detectionConfidence. The client creates an editable candidate and local crop; it still does not import it automatically.

Proxy requirements:
- authenticate/authorize users according to the deployment's needs without exposing provider keys to the browser
- enforce request size, image count, MIME and timeout limits
- validate Origin and return JSON only
- document the AI provider and its retention policy
- never request or join Cabinet/profile data

DATA AND BACKUP COMPATIBILITY
- IndexedDB name remains beauty-cabinet-local-v15 and schema version remains 2.
- Existing products, images, settings, scan sessions and relationship stores are preserved in place.
- Encrypted backup envelope/payload remain version 2.
- Existing V1.6 and V1.7 backups can be restored; missing V1.7.1 fields are optional.
- V1.7.1 products retain structured attributes, expiry fields, source images, AI suggestions selected by the user and relationship records.
- Existing behavior of backing up unfinished local scan sessions is preserved.

DEPLOY TO THE EXISTING GITHUB PAGES REPOSITORY
1. Export an encrypted .beautybackup from the current App.
2. Upload all seven files in this folder to the existing repository root, replacing files with the same names.
3. Do not upload product photos, JSON files or .beautybackup files.
4. Commit and wait for GitHub Pages deployment.
5. Open the existing site once with ?v=171 appended.
6. Confirm the header says V1.7.1.

DEVICE CHECKLIST
- iPhone Safari: Take photo, Choose Photos, multiple single-product photos and candidate-specific extra photo.
- iPad Safari: the same flows plus Paired Batch.
- Windows Chrome/Edge: batch regions, pairing correction, candidate filters, edit and import.
- Decline AI confirmation and verify “no images left this device”.
- Approve AI confirmation with no configured proxy and verify “AI unavailable” with no network upload.
- With a test proxy configured, verify completion summary, alternatives and filters.
- Reload an unfinished scan and verify persistence.
- Export and restore an encrypted backup.

SAFARI STORAGE NOTE
iPhone/iPad Safari may remove website storage under device pressure or when site data is cleared. Do not use Private Browsing for durable data. Keep periodic encrypted .beautybackup files in Files, iCloud Drive or another location you control.

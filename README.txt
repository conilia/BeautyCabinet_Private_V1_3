Beauty Cabinet V1.7.3 — improved multi-object Scan Shelf + optional real AI recognition

WHAT IS FIXED IN V1.7.3
- Reworked Single-Image Batch local detection. It no longer applies blanket dilation that easily merged adjacent products into one giant region.
- Added adaptive background estimation, foreground masking, recursive whitespace splitting, aggressive fallback segmentation, and duplicate-box suppression.
- Review now shows a full-image “Detected regions” overlay so you can immediately see whether one photo was split into multiple candidates.
- If a batch still collapses to one region, the App explicitly warns that local segmentation is insufficient and suggests manual candidates or AI Identification.
- AI Identification can now use the full current batch image and may return additional missed products with bounding boxes.
- Paired Batch AI requests can include the full front and back group images; a secure backend may return new paired frontCrop/backCrop candidates.
- Added optional local AI endpoint configuration under Privacy. The URL is stored only in this device's IndexedDB.
- GitHub Pages can now connect only to the same origin plus HTTPS *.workers.dev endpoints. No API key belongs in the browser or repository.
- Version bumped to V1.7.3. Existing IndexedDB and encrypted backup formats remain compatible.

IMPORTANT LIMITATION
Reliable cosmetic brand/product/shade recognition is not realistically achievable with the lightweight browser-only detector. Local Detection is for crops/regions and still may miss touching, reflective, low-contrast, or complex-background products. True recognition and robust multi-object recovery require the optional vision-AI backend.

OPTIONAL REAL AI BACKEND
The folder backend/ contains a Cloudflare Worker template:
- backend/beauty-ai-worker.js
- backend/wrangler.toml.example
- backend/README.md

The Worker keeps OPENAI_API_KEY as a server-side secret and calls the OpenAI Responses API with image inputs. It is instructed to:
- enumerate every distinct cosmetic/skincare product in a batch image
- return a separate bounding box for each item
- combine multiple views of the same product
- pair front/back group images in Paired Batch mode
- read visible brand/product/shade/batch text when possible
- return null instead of inventing uncertain details

The client sends nothing automatically. Each AI run requires explicit per-scan consent. Only images from the current scan are included; the existing Cabinet, backup, skin profile, history, and unrelated images are not sent.

HOW TO ENABLE AI IDENTIFICATION
1. Deploy backend/beauty-ai-worker.js as a Cloudflare Worker.
2. Store your OpenAI API key as the Worker secret OPENAI_API_KEY. Never place it in GitHub or app.js.
3. Set ALLOWED_ORIGIN to your GitHub Pages origin, e.g. https://conilia.github.io.
4. Copy the Worker HTTPS *.workers.dev URL.
5. Beauty Cabinet → Privacy → AI Recognition proxy → paste the Worker URL → Save.
6. Scan Shelf → Local Detection → Identify products with AI → explicitly confirm this scan upload.

Without the Worker, all normal Cabinet, Product Passport, Compare, Expiry, Scan Shelf local crops, Paired Batch, manual editing, and encrypted backups continue to work.

V1.7/V1.7.1 FEATURES PRESERVED
- Cabinet and Product Passport
- user product image + official/reference image
- Similar & Overlap / Compare
- Expiry / PAO
- structured hue/undertone/saturation/depth/texture/finish/coverage/function fields
- True Duplicate / Color Duplicate / Functional Duplicate / Complementary / Unique
- Single Product Multi-Photo
- Single-Image Batch
- Paired Batch and pairing confirmation
- mandatory candidate review/edit/delete/merge/unidentified handling
- candidate-specific extra bottom/side photo
- local IndexedDB
- no daily login
- AES-256-GCM + PBKDF2 encrypted .beautybackup
- V1.2 JSON migration
- iPhone/iPad Safari and Windows browser layout

PRIVACY
- Personal inventory and images remain in local IndexedDB unless you explicitly initiate an AI scan upload.
- AI consent is per run.
- Browser App contains no OpenAI API key.
- Worker source may be public; the secret must only exist in Cloudflare's secret store.
- Review the AI provider's image/data controls before enabling cloud recognition.

DEPLOY APP UPDATE
1. Export a .beautybackup first.
2. Upload the root App files to your existing GitHub Pages repo, replacing the old versions.
3. Do not upload .beautybackup, personal product photos, or JSON inventory files.
4. Commit and wait for Pages deployment.
5. Open once with ?v=172.
6. Confirm header: V1.7.3.

TEST CHECKLIST
- Batch photo with several separated products should now create multiple candidates more often.
- Review shows boxes on the full batch image.
- Local detector warning appears when it only finds one region.
- Existing product/backup data survives upgrade.
- AI button does not upload if consent is declined.
- AI button reports unavailable when no endpoint is configured.
- With Worker configured, full batch image may add multiple AI-detected products and candidates still require manual confirmation before import.


V1.7.3 ADDITION — BATCH ASSISTED IMPORT
- Export Scan Package from any active Scan Shelf session as .beautyscan.json.
- Import ChatGPT/externally reviewed identification results using the local-only `beauty-cabinet-assisted-results` JSON format.
- Result JSON can optionally embed one compressed product image per item as base64; imported data is written only to local IndexedDB.
- No assisted-import file is uploaded automatically.

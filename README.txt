Beauty Cabinet V1.8.1 — Personal Match Engine

NEW IN V1.8.1
- Added a fully local Personal Match recommendation engine.
- Uses My Skin baseline + structured product attributes + saved fit/role + myResult.
- User real-world feedback (myResult) takes priority over generic colour theory.
- Adds automatic suitability tiers: 很适合 / 适合 / 有条件适合 / 谨慎使用 / 低优先级 / 信息不足.
- Product Passport now shows automatic reasons, cautions, and usage tips without overwriting manual records.
- My Skin page now summarizes the most suitable and caution products and offers a full local recommendation explorer by category.
- Rules include muted/olive colour logic, combination-skin zone use, visible-pore highlighter placement, oily/hooded eyelid guidance, eye-sensitivity glitter cautions, and bronzer-vs-contour positioning.
- No AI/API/network call is needed for Personal Match. All calculations happen locally.
- Existing V1.8.0 My Skin, Quick Find, Scan, Compare, Expiry, Batch Assisted Import, IndexedDB, and encrypted backup behavior is preserved.

Beauty Cabinet V1.8.0 — My Skin Profile

Beauty Cabinet V1.7.4 — improved multi-object Scan Shelf + optional real AI recognition

WHAT IS FIXED IN V1.7.4
- Reworked Single-Image Batch local detection. It no longer applies blanket dilation that easily merged adjacent products into one giant region.
- Added adaptive background estimation, foreground masking, recursive whitespace splitting, aggressive fallback segmentation, and duplicate-box suppression.
- Review now shows a full-image “Detected regions” overlay so you can immediately see whether one photo was split into multiple candidates.
- If a batch still collapses to one region, the App explicitly warns that local segmentation is insufficient and suggests manual candidates or AI Identification.
- AI Identification can now use the full current batch image and may return additional missed products with bounding boxes.
- Paired Batch AI requests can include the full front and back group images; a secure backend may return new paired frontCrop/backCrop candidates.
- Added optional local AI endpoint configuration under Privacy. The URL is stored only in this device's IndexedDB.
- GitHub Pages can now connect only to the same origin plus HTTPS *.workers.dev endpoints. No API key belongs in the browser or repository.
- Version bumped to V1.7.4. Existing IndexedDB and encrypted backup formats remain compatible.

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
6. Confirm header: V1.7.4.

TEST CHECKLIST
- Batch photo with several separated products should now create multiple candidates more often.
- Review shows boxes on the full batch image.
- Local detector warning appears when it only finds one region.
- Existing product/backup data survives upgrade.
- AI button does not upload if consent is declined.
- AI button reports unavailable when no endpoint is configured.
- With Worker configured, full batch image may add multiple AI-detected products and candidates still require manual confirmation before import.


V1.7.4 ADDITION — BATCH ASSISTED IMPORT
- Export Scan Package from any active Scan Shelf session as .beautyscan.json.
- Import ChatGPT/externally reviewed identification results using the local-only `beauty-cabinet-assisted-results` JSON format.
- Result JSON can optionally embed one compressed product image per item as base64; imported data is written only to local IndexedDB.
- No assisted-import file is uploaded automatically.


V1.7.4 Quick Find
- Added local keyword search over brand, name, shade, category, structured attributes, fit, role, myResult, notes and status.
- Added local photo-to-inventory similarity search. No remote recognition or upload is used.
- Photo search returns multiple candidates and requires the user to choose “就是这个”; it never auto-selects.
- Product Passport remains available through “查看详情” but is not forced by Quick Find.
- Visual fingerprints are cached locally in IndexedDB image records. Existing libraries are fingerprinted lazily on first photo search; new manually-added/assisted-import images get fingerprints on import.
- Added preservation/display/editing of myResult for future Batch Assisted Imports.


V1.7.5 Quick Find improvements:
- Chinese/English concept search (e.g. 粉色腮红, 灰棕眼影, 适合我的裸色口红)
- Query concept parsing across category, hue, undertone, texture, finish, fit/myResult/status
- Crop-aware local photo search with auto-subject box and manual drag selection
- Stronger local visual descriptor: dHash + aHash + spatial color grid + edge orientation + color/aspect features
- Optional keyword + photo hybrid ranking
- Shared group-photo detection/penalty to avoid false confidence when multiple items reuse the same batch photo

V1.8.0 adds a local-only My Skin profile stored in IndexedDB settings and included automatically in encrypted backups. No personal profile values are hardcoded in the public app source.

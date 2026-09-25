Beauty Cabinet V1.3.1
Fix: iPhone/iPad auth overlay now respects hidden state.

Beauty Cabinet V1.3 Private Foundation
=======================================

What changed from V1.2
----------------------
- NO personal product seed data in source code.
- NO personal collection photos in the deployment package.
- IndexedDB replaces localStorage.
- Product records are encrypted with AES-256-GCM before being written to IndexedDB.
- Product images are resized locally, then encrypted before being written to IndexedDB.
- Master Password is never stored. A PBKDF2-derived key exists only in page memory while unlocked.
- Encrypted backup/export and restore are supported.
- Legacy V1.2 plaintext JSON can be imported and is immediately re-encrypted locally.
- Content Security Policy blocks connect/fetch/XHR/WebSocket network APIs.
- Product pages support a local image: your own photo OR an official product image saved to your device first.

IMPORTANT: Replace the old public GitHub repository
----------------------------------------------------
V1.2 contained example/personal product names and a collection photo in the repository. If privacy is a strict requirement, simply deleting those files in a new commit is not enough because Git history can retain them.

Recommended:
1. Export any V1.2 browser data you want to keep.
2. Delete the OLD public GitHub repository.
3. Create a brand-new repository (or recreate the same name after deletion).
4. Upload ONLY the files in this V1.3 folder.
5. Enable GitHub Pages from main / root.
6. Open the new HTTPS site and create a Master Password.
7. If needed, import the old V1.2 JSON. It will be encrypted into the local vault.

Cross-device migration
----------------------
- On old device: Privacy -> Export encrypted backup.
- Transfer the .beautybackup file with AirDrop, iCloud Drive, USB, etc.
- On new device: open the same Beauty Cabinet app -> From encrypted backup -> import.
- Unlock with the SAME Master Password used by that backup.

Images
------
For privacy, V1.3 does not request images from brand websites. If you want an official product image, save it to Photos/Files first, then choose it in the product editor and set Image Source = Official product image.

Security notes
--------------
- Current KDF: PBKDF2-HMAC-SHA-256, 600,000 iterations.
- Encryption: AES-256-GCM.
- V1.4 can replace PBKDF2 with a bundled Argon2id implementation and add encrypted sync.
- No web app can protect data against a fully compromised/unlocked device or maliciously replaced application code. Keep the repository/account protected with a strong password and 2FA.

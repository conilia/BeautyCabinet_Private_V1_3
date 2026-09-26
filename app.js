(() => {
'use strict';

const APP_VERSION = '1.5.0';
const DB_NAME = 'beauty-cabinet-local-v15';
const DB_VERSION = 1;
const BACKUP_KDF_ITERATIONS = 300000;
const MAX_IMAGE_DIM = 1100;
const IMAGE_QUALITY = 0.82;

let db = null;
let products = [];
let imageUrls = new Map();

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const enc = new TextEncoder();
const dec = new TextDecoder();

async function cleanupLegacyWebState() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch (e) { console.warn('service worker cleanup skipped', e); }
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k.startsWith('beauty-cabinet-')).map(k => caches.delete(k)));
    }
  } catch (e) { console.warn('cache cleanup skipped', e); }
}

function esc(v = '') {
  return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const a = crypto.getRandomValues(new Uint8Array(16));
  a[6] = (a[6] & 0x0f) | 0x40; a[8] = (a[8] & 0x3f) | 0x80;
  const h = [...a].map(x => x.toString(16).padStart(2,'0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
function bytesToB64(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  const step = 0x8000;
  for (let i = 0; i < u8.length; i += step) s += String.fromCharCode(...u8.subarray(i, i + step));
  return btoa(s);
}
function b64ToBytes(s) {
  const raw = atob(s); const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function toast(msg) {
  const old = $('.toast'); if (old) old.remove();
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el); setTimeout(() => el.remove(), 2500);
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('products')) d.createObjectStore('products', {keyPath:'id'});
      if (!d.objectStoreNames.contains('images')) d.createObjectStore('images', {keyPath:'id'});
      if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', {keyPath:'key'});
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbGet(store, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly'); const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
}
function idbGetAll(store) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly'); const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []); req.onerror = () => reject(req.error);
  });
}
function idbPut(store, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
function idbDelete(store, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
function idbClear(store) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).clear();
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}

async function reloadProducts() {
  products = (await idbGetAll('products')).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
}
async function saveProduct(p) {
  p.updatedAt = new Date().toISOString();
  if (!p.createdAt) p.createdAt = p.updatedAt;
  await idbPut('products', p);
}

function fileToImage(file) {
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image decode failed'));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
async function compressImage(file) {
  const img = await fileToImage(file);
  const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', {alpha:false});
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', IMAGE_QUALITY));
  if (!blob) throw new Error('image compression failed');
  return {blob,width,height,mime:'image/jpeg'};
}
async function storeImage(productId, file, source, oldImageId='') {
  const img = await compressImage(file);
  const data = await img.blob.arrayBuffer();
  const id = uuid();
  await idbPut('images', {id,productId,data,mime:img.mime,width:img.width,height:img.height,source,updatedAt:new Date().toISOString()});
  if (oldImageId) { await idbDelete('images',oldImageId); revokeImage(oldImageId); }
  return id;
}
async function imageObjectURL(imageId) {
  if (!imageId) return null;
  if (imageUrls.has(imageId)) return imageUrls.get(imageId);
  const rec = await idbGet('images', imageId);
  if (!rec || !rec.data) return null;
  const url = URL.createObjectURL(new Blob([rec.data], {type:rec.mime||'image/jpeg'}));
  imageUrls.set(imageId, url);
  return url;
}
function revokeImage(id){const u=imageUrls.get(id);if(u){URL.revokeObjectURL(u);imageUrls.delete(id);}}
function revokeAllImages(){for(const u of imageUrls.values())URL.revokeObjectURL(u);imageUrls.clear();}
async function loadImageEl(el) { const id=el.dataset.imageId; if(!id)return; const url=await imageObjectURL(id); if(url)el.src=url; }
function activateLazyImages() {
  const imgs = $$('img[data-image-id]');
  if (!('IntersectionObserver' in window)) { imgs.forEach(loadImageEl); return; }
  const obs = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { loadImageEl(e.target); obs.unobserve(e.target); }
  }), {rootMargin:'160px'});
  imgs.forEach(i => obs.observe(i));
}

function tab(id) {
  $$('main > section').forEach(s=>s.hidden=s.id!==id);
  $$('nav button[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));
  window.scrollTo({top:0,behavior:'auto'});
  if(id==='compare') renderComparePicker();
}
function attentionInfo(p) {
  if (p.status === '停止使用') return {level:'bad', label:'停止使用'};
  if (p.opened && Number(p.pao)) {
    const d = new Date(`${p.opened}T12:00:00`); d.setMonth(d.getMonth()+Number(p.pao));
    const days=Math.ceil((d-Date.now())/86400000);
    if(days<0)return{level:'bad',label:`已超 PAO ${Math.abs(days)} 天`,date:d};
    if(days<=60)return{level:'warn',label:`约 ${days} 天后到 PAO`,date:d};
    return{level:'good',label:`PAO 至 ${d.toLocaleDateString()}`,date:d};
  }
  if (!p.opened && ['Liquid','Mascara','Liquid eyeliner'].includes(p.form)) return {level:'warn',label:'年龄未知 · 优先检查'};
  if (!p.opened && p.form === 'Cream') return {level:'warn',label:'年龄未知 · 定期检查'};
  return {level:'good',label:'状态检查管理'};
}
function renderAll(){renderHome();renderProducts();renderExpiry();renderComparePicker();}
function renderHome(){
  $('#count').textContent=products.length;
  $('#imageCount').textContent=products.filter(p=>p.imageId).length;
  $('#attentionCount').textContent=products.filter(p=>attentionInfo(p).level!=='good').length;
}
function renderProducts(){
  $('#emptyCabinet').hidden=products.length!==0;
  $('#products').innerHTML=products.map(p=>`<button type="button" class="product" data-product-id="${esc(p.id)}">
    ${p.imageId?`<img class="product-img" alt="" data-image-id="${esc(p.imageId)}">`:`<div class="product-img placeholder">✦</div>`}
    <div class="product-info"><span class="type">${esc(p.cat||'Uncategorized')} · ${esc(p.form||'')}</span><b>${esc(p.name)}</b><span class="pill">${esc(p.shade||'待记录')}</span>${p.fit?`<span class="pill">${esc(p.fit)}</span>`:''}</div></button>`).join('');
  activateLazyImages();
}
function renderExpiry(){
  if(!products.length){$('#expiryList').innerHTML='<div class="empty-state">还没有可管理的产品。</div>';return;}
  const rank={bad:0,warn:1,good:2}; const sorted=[...products].sort((a,b)=>rank[attentionInfo(a).level]-rank[attentionInfo(b).level]);
  $('#expiryList').innerHTML=sorted.map(p=>{const x=attentionInfo(p);return `<div class="expiry-row"><button type="button" data-product-id="${esc(p.id)}"><b>${esc(p.name)}</b><div class="note">${esc(p.form||'')} · 开封：${esc(p.opened||'未知')} · PAO：${esc(p.pao?`${p.pao}M`:'未知')}</div></button><span class="expiry-tag ${x.level}">${esc(x.label)}</span></div>`}).join('');
}
function renderComparePicker(){
  const picker=$('#comparePicker');
  if(!products.length){picker.innerHTML='<div class="note">先录入至少两件产品。</div>';$('#runCompareBtn').disabled=true;return;}
  picker.innerHTML=products.map(p=>`<label class="check-card"><input type="checkbox" class="compare-check" value="${esc(p.id)}"><span><b>${esc(p.name)}</b><span class="note">${esc(p.cat||'')} · ${esc(p.shade||'')}</span></span></label>`).join('');
  updateCompareButton();
}
function updateCompareButton(){const n=$$('.compare-check:checked').length;$('#runCompareBtn').disabled=n<2||n>4;}
function relationLabel(a,b){
  const cat=(a.cat||'').toLowerCase()===(b.cat||'').toLowerCase();
  const form=(a.form||'').toLowerCase()===(b.form||'').toLowerCase();
  const shade=(a.shade||'').trim().toLowerCase()===(b.shade||'').trim().toLowerCase() && (a.shade||'').trim();
  if(cat&&form&&shade)return['Strong overlap','同类别、同质地，而且你的颜色描述一致。'];
  if(cat&&shade)return['Color overlap','颜色描述相同，但质地不同；可能属于“颜色重复、配方不同”。'];
  if(cat&&form)return['Functional overlap','功能和质地接近；主要区别要看色号、适配说明和用途。'];
  if(cat)return['Same category · different role','属于同一类别，但目前记录显示用途/颜色不同。'];
  return['Low overlap','类别不同，通常不属于真正重复。'];
}
function runCompare(){
  const ids=$$('.compare-check:checked').map(x=>x.value);
  const ps=ids.map(id=>products.find(p=>p.id===id)).filter(Boolean);
  if(ps.length<2||ps.length>4)return;
  let html='<div class="card"><div class="title"><h3>比较结果</h3></div><div style="overflow:auto"><table class="compare"><tr><th>维度</th>'+ps.map(p=>`<th>${esc(p.name)}</th>`).join('')+'</tr>';
  const rows=[['类别','cat'],['颜色/色号','shade'],['质地','form'],['适配','fit'],['用途/搭配','role'],['状态','status']];
  rows.forEach(([label,key])=>{html+=`<tr><td>${label}</td>${ps.map(p=>`<td>${esc(p[key]||'未记录')}</td>`).join('')}</tr>`}); html+='</table></div></div>';
  for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){const [label,why]=relationLabel(ps[i],ps[j]);html+=`<div class="relationship"><b>${esc(ps[i].name)} ↔ ${esc(ps[j].name)}</b><div class="pill">${esc(label)}</div><p class="note">${esc(why)}</p></div>`;}
  $('#compareResult').innerHTML=html;
}

function openModal(html){$('#modalBody').innerHTML=html;$('#modal').classList.add('open');$('#modal').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';}
function closeModal(){$('#modal').classList.remove('open');$('#modal').setAttribute('aria-hidden','true');document.body.style.overflow='';$('#modalBody').innerHTML='';}
function productFormHTML(p=null){
  const x=p||{}; return `<h2>${p?'编辑产品':'添加产品'}</h2><form id="productForm" data-id="${esc(x.id||'')}">
    <label>产品名称 *</label><input name="name" value="${esc(x.name||'')}" autocomplete="off" required placeholder="例如产品名 + 色号">
    <label>品牌</label><input name="brand" value="${esc(x.brand||'')}" autocomplete="off">
    <label>类别</label><select name="cat">${['Blush','Eyeshadow','Highlighter','Bronzer','Foundation','Concealer','Primer','Powder','Lip','Mascara','Liquid eyeliner','Skincare','Other'].map(v=>`<option ${x.cat===v?'selected':''}>${v}</option>`).join('')}</select>
    <label>色号 / 颜色描述</label><input name="shade" value="${esc(x.shade||'')}" placeholder="例如 muted dusty rose">
    <label>质地</label><select name="form">${['Powder','Cream','Liquid','Balm','Gel','Stick','Mascara','Liquid eyeliner','Other'].map(v=>`<option ${x.form===v?'selected':''}>${v}</option>`).join('')}</select>
    <label>对我的适配</label><input name="fit" value="${esc(x.fit||'')}" placeholder="例如 很适合 / 搭配后适合">
    <label>用途 / 搭配说明</label><textarea name="role" placeholder="例如：适合与低饱和腮红混合">${esc(x.role||'')}</textarea>
    <label>生产日期</label><input name="made" type="date" value="${esc(x.made||'')}">
    <label>购买日期</label><input name="bought" type="date" value="${esc(x.bought||'')}">
    <label>开封日期</label><input name="opened" type="date" value="${esc(x.opened||'')}">
    <label>PAO（月）</label><input name="pao" type="number" inputmode="numeric" min="1" max="120" value="${esc(x.pao||'')}" placeholder="例如 12">
    <label>状态</label><select name="status">${['正常','需检查','优先用完','停止使用'].map(v=>`<option ${x.status===v?'selected':''}>${v}</option>`).join('')}</select>
    <label>产品图片</label>${x.imageId?`<img id="editImagePreview" class="image-preview" alt="当前产品图" data-image-id="${esc(x.imageId)}">`:''}
    <input name="image" type="file" accept="image/*">
    <label>图片来源</label><select name="imageSource"><option value="my_photo" ${x.imageSource==='my_photo'?'selected':''}>我的实物图</option><option value="official_local" ${x.imageSource==='official_local'?'selected':''}>官方产品图（已保存到本机）</option><option value="other" ${x.imageSource==='other'?'selected':''}>其他本地图</option></select>
    <div class="image-source">隐私模式不会主动从网上加载图片；官网图请先保存到 Photos/Files 再选择。</div>
    <label>备注</label><textarea name="notes">${esc(x.notes||'')}</textarea>
    <button type="submit">${p?'保存修改':'保存到本机'}</button>
  </form>`;
}
async function openProductForm(p=null){openModal(productFormHTML(p));const img=$('#editImagePreview');if(img)await loadImageEl(img);}
async function showProduct(id){
  const p=products.find(x=>x.id===id);if(!p)return; const info=attentionInfo(p);
  openModal(`<h2>${esc(p.name)}</h2><div class="note">${esc(p.cat||'')} · ${esc(p.form||'')}</div>
    ${p.imageId?`<img id="modalProductImg" class="product-hero" alt="${esc(p.name)}" data-image-id="${esc(p.imageId)}"><div class="image-source">${p.imageSource==='official_local'?'官方产品图（本地保存）':p.imageSource==='my_photo'?'我的实物图':'本地图'}</div>`:'<div class="empty-state"><div class="empty-icon">✦</div>暂无产品图片</div>'}
    <p>${p.shade?`<span class="pill">${esc(p.shade)}</span>`:''}${p.fit?`<span class="pill">${esc(p.fit)}</span>`:''}<span class="pill ${info.level}">${esc(info.label)}</span></p>
    <div class="card"><b>For You</b><p>${esc(p.role||'尚未记录适配和搭配说明。')}</p></div>
    <div class="card"><b>Product Passport</b><div class="kv"><div>品牌</div><div>${esc(p.brand||'未记录')}</div><div>生产日期</div><div>${esc(p.made||'未记录')}</div><div>购买日期</div><div>${esc(p.bought||'未记录')}</div><div>开封日期</div><div>${esc(p.opened||'未知')}</div><div>PAO</div><div>${esc(p.pao?`${p.pao} 个月`:'待录入')}</div><div>状态</div><div>${esc(p.status||'正常')}</div></div></div>
    ${p.notes?`<div class="card"><b>备注</b><p class="note">${esc(p.notes)}</p></div>`:''}
    <div class="actions"><button data-action="edit" data-id="${esc(p.id)}" type="button">编辑</button><button class="danger" data-action="delete" data-id="${esc(p.id)}" type="button">删除</button></div>`);
  const img=$('#modalProductImg');if(img)await loadImageEl(img);
}
async function handleProductSubmit(form){
  const fd=new FormData(form); const id=form.dataset.id||uuid(); const existing=products.find(p=>p.id===id)||{};
  const p={...existing,id,name:String(fd.get('name')||'').trim(),brand:String(fd.get('brand')||'').trim(),cat:fd.get('cat'),shade:String(fd.get('shade')||'').trim(),form:fd.get('form'),fit:String(fd.get('fit')||'').trim(),role:String(fd.get('role')||'').trim(),made:fd.get('made'),bought:fd.get('bought'),opened:fd.get('opened'),pao:String(fd.get('pao')||'').trim(),status:fd.get('status'),imageSource:fd.get('imageSource'),notes:String(fd.get('notes')||'').trim()};
  const file=fd.get('image');
  try{
    if(file&&file.size){toast('正在本地压缩图片…');p.imageId=await storeImage(id,file,p.imageSource,existing.imageId||'');}
    await saveProduct(p);await reloadProducts();renderAll();closeModal();toast('已保存在本机');
  }catch(e){console.error(e);toast('保存失败，请检查图片或存储空间');}
}
async function deleteProduct(id){
  const p=products.find(x=>x.id===id);if(!p)return;if(!confirm(`删除“${p.name}”？`))return;
  if(p.imageId){await idbDelete('images',p.imageId);revokeImage(p.imageId);}await idbDelete('products',id);await reloadProducts();renderAll();closeModal();toast('已删除');
}

async function deriveBackupKey(password, saltBytes, iterations=BACKUP_KDF_ITERATIONS) {
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2', salt:saltBytes, iterations, hash:'SHA-256'},
    material,
    {name:'AES-GCM', length:256},
    false,
    ['encrypt','decrypt']
  );
}
async function buildBackupPayload() {
  const prods = await idbGetAll('products');
  const imgs = await idbGetAll('images');
  const settings = await idbGetAll('settings');
  return {
    format:'beauty-cabinet-local-payload', version:2, appVersion:APP_VERSION,
    exportedAt:new Date().toISOString(), products:prods,
    images:imgs.map(r=>({...r,data:bytesToB64(r.data)})), settings
  };
}
async function encryptBackupPayload(payload, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(password, salt);
  const plain = enc.encode(JSON.stringify(payload));
  const cipher = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, plain);
  return {
    format:'beauty-cabinet-encrypted-backup', version:2, appVersion:APP_VERSION,
    kdf:{name:'PBKDF2-HMAC-SHA-256',iterations:BACKUP_KDF_ITERATIONS,salt:bytesToB64(salt)},
    cipher:{name:'AES-256-GCM',iv:bytesToB64(iv),data:bytesToB64(cipher)}
  };
}
async function decryptBackupPack(pack, password) {
  if(pack?.format!=='beauty-cabinet-encrypted-backup'||pack?.version!==2||!pack.kdf||!pack.cipher) throw new Error('invalid backup');
  const key = await deriveBackupKey(password, b64ToBytes(pack.kdf.salt), Number(pack.kdf.iterations)||BACKUP_KDF_ITERATIONS);
  const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBytes(pack.cipher.iv)},key,b64ToBytes(pack.cipher.data));
  const payload = JSON.parse(dec.decode(plain));
  if(payload?.format!=='beauty-cabinet-local-payload'||payload?.version!==2||!Array.isArray(payload.products)||!Array.isArray(payload.images)) throw new Error('invalid payload');
  return payload;
}
function askNewBackupPassword() {
  const p1 = prompt('为这份迁移备份设置一个密码。\n这个密码只在导入备份时使用，日常打开 Beauty Cabinet 不需要密码。');
  if (p1 === null) return null;
  if (p1.length < 6) { alert('备份密码至少 6 个字符。'); return null; }
  const p2 = prompt('再次输入相同的备份密码：');
  if (p2 === null) return null;
  if (p1 !== p2) { alert('两次备份密码不一致。'); return null; }
  return p1;
}
async function exportBackup(){
  if(!window.crypto?.subtle){alert('当前浏览器不支持加密备份。');return;}
  const password = askNewBackupPassword(); if(!password)return;
  try{
    toast('正在生成加密备份…');
    const payload = await buildBackupPayload();
    const pack = await encryptBackupPayload(payload,password);
    const blob = new Blob([JSON.stringify(pack)],{type:'application/json'});
    const file = new File([blob],`BeautyCabinet-${new Date().toISOString().slice(0,10)}.beautybackup`,{type:'application/json'});
    try{
      if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:'Beauty Cabinet encrypted backup'});toast('加密备份已生成');return;}
    }catch(e){if(e&&e.name==='AbortError')return;}
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=file.name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1500);
    toast('加密备份已生成');
  }catch(e){console.error(e);alert('生成备份失败。请确认浏览器支持 Web Crypto，并检查存储空间。');}
}
async function parseEncryptedBackupFile(file){
  const text=await file.text(); const pack=JSON.parse(text);
  if(pack?.format!=='beauty-cabinet-encrypted-backup'||pack?.version!==2) throw new Error('invalid backup');
  return pack;
}
async function replaceWithPayload(payload){
  revokeAllImages();
  await idbClear('products'); await idbClear('images'); await idbClear('settings');
  for(const p of payload.products) await idbPut('products',p);
  for(const r of payload.images) await idbPut('images',{...r,data:b64ToBytes(r.data).buffer});
  for(const s of (payload.settings||[])) await idbPut('settings',s);
  await reloadProducts(); renderAll();
}
async function importEncryptedBackup(file){
  try{
    const pack=await parseEncryptedBackupFile(file);
    const password=prompt('请输入创建这份 .beautybackup 时设置的备份密码：');
    if(password===null)return;
    const payload=await decryptBackupPack(pack,password);
    if(!confirm(`备份中有 ${payload.products.length} 件产品。导入会替换这台设备当前的 Beauty Cabinet 数据。继续？`))return;
    await replaceWithPayload(payload); toast('备份恢复成功');
  }catch(e){console.error(e);alert('无法解密备份：密码不正确，或文件已损坏/不是 V1.5 加密备份。');}
}
async function importLegacy(file){
  try{
    const data=JSON.parse(await file.text()); if(!Array.isArray(data.products))throw new Error('invalid');
    if(!confirm(`找到 ${data.products.length} 条 V1.2 产品记录。导入到当前本地数据库？`))return;
    for(const old of data.products){
      const p={id:uuid(),name:old.name||'未命名产品',brand:old.brand||'',cat:old.cat||'Other',shade:old.shade||'',form:old.form||'Other',fit:old.fit||'',role:old.role||'',made:old.made||'',bought:old.bought||'',opened:old.opened||'',pao:old.pao||'',status:old.status||'需检查',notes:old.notes||'从 V1.2 导入',imageSource:'',imageId:'',createdAt:new Date().toISOString()};
      await saveProduct(p);
    }
    await reloadProducts(); renderAll(); toast('V1.2 数据已导入');
  }catch(e){console.error(e);alert('无法读取这个 V1.2 JSON 备份。');}
}
async function clearAllData(){
  if(!confirm('这会永久删除这台设备上的 Beauty Cabinet 数据。建议先导出加密备份。继续？'))return;
  if(!confirm('最后确认：删除后无法撤销。'))return;
  try{
    products=[];revokeAllImages();await idbClear('products');await idbClear('images');await idbClear('settings');renderAll();toast('本机数据已删除');
  }catch(e){console.error(e);alert('删除失败，请关闭其他 Beauty Cabinet 页面后重试。');}
}

function bindEvents(){
  $('#homeAddBtn').addEventListener('click',()=>openProductForm());
  $('#addBtn').addEventListener('click',()=>openProductForm());
  $('#closeModalBtn').addEventListener('click',closeModal);
  $('#exportBtn').addEventListener('click',exportBackup);
  $('#homeBackupBtn').addEventListener('click',exportBackup);
  $('#settingsExportBtn').addEventListener('click',exportBackup);
  $('#importBtn').addEventListener('click',()=>$('#importFile').click());
  $('#importFile').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importEncryptedBackup(f);e.target.value='';});
  $('#legacyImportBtn').addEventListener('click',()=>$('#legacyImportFile').click());
  $('#legacyImportFile').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importLegacy(f);e.target.value='';});
  $('#clearBtn').addEventListener('click',clearAllData);
  $('#runCompareBtn').addEventListener('click',runCompare);
  document.addEventListener('click',e=>{
    const t=e.target.closest('button[data-tab]');if(t){tab(t.dataset.tab);return;}
    const p=e.target.closest('[data-product-id]');if(p&&!p.closest('#productForm')){showProduct(p.dataset.productId);return;}
    const a=e.target.closest('[data-action]');if(a){const id=a.dataset.id;if(a.dataset.action==='edit')openProductForm(products.find(x=>x.id===id));if(a.dataset.action==='delete')deleteProduct(id);return;}
    if(e.target===$('#modal'))closeModal();
  });
  document.addEventListener('change',e=>{if(e.target.classList.contains('compare-check'))updateCompareButton();});
  document.addEventListener('submit',e=>{if(e.target.id==='productForm'){e.preventDefault();handleProductSubmit(e.target);}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
}

async function start(){
  if(!window.indexedDB){document.body.innerHTML='<main><div class="card"><b>当前浏览器不支持 IndexedDB。</b><p>请使用较新的 Safari / Chrome / Edge。</p></div></main>';return;}
  try{
    await cleanupLegacyWebState();
    db=await openDB();
    bindEvents();
    try{if(navigator.storage?.persist) await navigator.storage.persist();}catch(e){}
    await reloadProducts(); renderAll();
  }catch(e){
    console.error(e);
    document.body.innerHTML='<main><div class="card"><b>无法打开本地数据库。</b><p>请使用 Safari/Chrome/Edge 的正常浏览模式，并确认没有禁用网站数据。</p></div></main>';
  }
}

document.addEventListener('DOMContentLoaded',start);
})();

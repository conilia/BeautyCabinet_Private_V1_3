(() => {
'use strict';

const APP_VERSION = '1.6.1';
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
      const appPath = new URL('./', location.href).pathname;
      await Promise.all(regs.filter(r => {
        try { return new URL(r.scope).pathname.startsWith(appPath); }
        catch (e) { return false; }
      }).map(r => r.unregister()));
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
async function storeImage(productId, file, source) {
  const img = await compressImage(file);
  const data = await img.blob.arrayBuffer();
  const id = uuid();
  await idbPut('images', {id,productId,data,mime:img.mime,width:img.width,height:img.height,source,updatedAt:new Date().toISOString()});
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
function imageSlots(p={}) {
  let userImageId = p.userImageId || '';
  let officialImageId = p.officialImageId || '';
  if (p.imageId && !userImageId && !officialImageId) {
    if (p.imageSource === 'official_local') officialImageId = p.imageId;
    else userImageId = p.imageId;
  }
  return {userImageId, officialImageId, primaryImageId:userImageId || officialImageId || p.imageId || ''};
}
function productImageIds(p={}) {
  const s=imageSlots(p);
  return [...new Set([s.userImageId,s.officialImageId,p.imageId].filter(Boolean))];
}
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
  $('#imageCount').textContent=products.reduce((n,p)=>n+productImageIds(p).length,0);
  $('#attentionCount').textContent=products.filter(p=>attentionInfo(p).level!=='good').length;
}
function renderProducts(){
  $('#emptyCabinet').hidden=products.length!==0;
  $('#products').innerHTML=products.map(p=>{const imageId=imageSlots(p).primaryImageId;return `<button type="button" class="product" data-product-id="${esc(p.id)}">
    ${imageId?`<img class="product-img" alt="${esc(p.name||'产品')}缩略图" data-image-id="${esc(imageId)}">`:`<div class="product-img placeholder" aria-hidden="true">✦</div>`}
    <div class="product-info"><span class="type">${esc(p.cat||'Uncategorized')} · ${esc(p.form||'')}</span><b>${esc(p.name)}</b><span class="pill">${esc(p.shade||'待记录')}</span>${p.fit?`<span class="pill">${esc(p.fit)}</span>`:''}</div></button>`;
  }).join('');
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
  picker.innerHTML=products.map(p=>{const imageId=imageSlots(p).primaryImageId;return `<label class="check-card"><input type="checkbox" class="compare-check" value="${esc(p.id)}">${imageId?`<img class="compare-thumb" alt="" data-image-id="${esc(imageId)}">`:''}<span><b>${esc(p.name)}</b><span class="note">${esc(p.cat||'')} · ${esc(p.shade||'')}</span></span></label>`;}).join('');
  activateLazyImages();
  updateCompareButton();
}
function updateCompareButton(){const n=$$('.compare-check:checked').length;$('#runCompareBtn').disabled=n<2||n>4;}
function norm(v=''){
  return String(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[\s_\-\/]+/g,' ').replace(/[^a-z0-9\u3400-\u9fff ]/g,'');
}
function textSimilarity(a,b){
  const x=norm(a),y=norm(b); if(!x||!y)return 0;if(x===y)return 1;
  if((x.includes(y)||y.includes(x))&&Math.min(x.length,y.length)>=3)return .82;
  const xs=new Set(x.split(' ').filter(Boolean)),ys=new Set(y.split(' ').filter(Boolean));
  const common=[...xs].filter(v=>ys.has(v)).length; const total=new Set([...xs,...ys]).size;
  return total?common/total:0;
}
function categoryFamily(cat=''){
  const c=norm(cat);
  if(['foundation','concealer','primer','powder'].includes(c))return 'base';
  if(['blush','highlighter','bronzer'].includes(c))return 'cheek';
  if(['eyeshadow','mascara','liquid eyeliner'].includes(c))return 'eye';
  if(c==='lip')return 'lip'; if(c==='skincare')return 'skincare'; return c;
}
function isComplementaryPair(a,b){
  const pair=[norm(a.cat),norm(b.cat)].sort().join('|');
  return new Set(['blush|bronzer','blush|highlighter','bronzer|highlighter','concealer|foundation','concealer|powder','eyeshadow|liquid eyeliner','eyeshadow|mascara','foundation|powder','foundation|primer','liquid eyeliner|mascara','primer|skincare']).has(pair);
}
const DIFFERENCE_FIELDS=[['品牌','brand'],['产品名','name'],['类别','cat'],['颜色/色号','shade'],['质地','form'],['适配','fit'],['用途/搭配','role'],['状态','status']];
function analyzeRelation(a,b){
  const sameBrand=norm(a.brand)&&norm(a.brand)===norm(b.brand);
  const nameSim=textSimilarity(a.name,b.name),shadeSim=textSimilarity(a.shade,b.shade),roleSim=textSimilarity(a.role,b.role);
  const sameCat=norm(a.cat)&&norm(a.cat)===norm(b.cat),sameForm=norm(a.form)&&norm(a.form)===norm(b.form);
  const sameFamily=categoryFamily(a.cat)&&categoryFamily(a.cat)===categoryFamily(b.cat);
  let kind='low',label='Low Overlap',score=Math.round(15+20*Math.max(nameSim,shadeSim,roleSim));
  let summary='目前记录没有显示明确重复或互补关系。';
  if(((sameBrand&&nameSim>=.82)||(nameSim===1&&sameCat))&&shadeSim>=.82){
    kind='true';label='True Duplicate';score=96;summary='品牌/产品身份与色号高度一致，最可能是真正重复。';
  }else if(sameCat&&shadeSim>=.65){
    kind='color';label='Color Duplicate';score=Math.round(76+shadeSim*14);summary='类别与颜色高度重合；差别主要在质地、品牌或使用感。';
  }else if(isComplementaryPair(a,b)){
    kind='complementary';label='Complementary';score=78;summary='两件产品承担不同但可组合的步骤，更像互补搭配而不是重复。';
  }else if(sameCat||(sameFamily&&(sameForm||roleSim>=.34))){
    kind='functional';label='Functional Duplicate';score=Math.round(66+(sameForm?10:0)+(roleSim>=.34?8:0));summary='功能或使用位置接近，但颜色、质地或具体用途存在差异。';
  }
  const shared=[]; const differences=[];
  for(const [title,key] of DIFFERENCE_FIELDS){
    const av=String(a[key]||'').trim(),bv=String(b[key]||'').trim();
    if(av&&bv&&norm(av)===norm(bv)) shared.push(`${title}：${av}`);
    else if(av||bv) differences.push({title,a:av||'未记录',b:bv||'未记录'});
  }
  if(imageSlots(a).userImageId&&imageSlots(b).userImageId)shared.push('两件都有实物图');
  return {kind,label,score:Math.min(99,score),summary,shared,differences};
}
function runCompare(){
  const ids=$$('.compare-check:checked').map(x=>x.value);
  const ps=ids.map(id=>products.find(p=>p.id===id)).filter(Boolean);
  if(ps.length<2||ps.length>4)return;
  let html='<div class="card"><div class="title"><h3>比较结果</h3></div><div style="overflow:auto"><table class="compare"><tr><th>维度</th>'+ps.map(p=>`<th>${esc(p.name)}</th>`).join('')+'</tr>';
  const rows=[['品牌',p=>p.brand],['类别',p=>p.cat],['颜色/色号',p=>p.shade],['质地',p=>p.form],['适配',p=>p.fit],['用途/搭配',p=>p.role],['本地图',p=>{const s=imageSlots(p);return [s.userImageId?'实物图':'',s.officialImageId?'官方/网上图':''].filter(Boolean).join(' + ');}],['状态',p=>p.status]];
  rows.forEach(([label,get])=>{html+=`<tr><td>${label}</td>${ps.map(p=>`<td>${esc(get(p)||'未记录')}</td>`).join('')}</tr>`}); html+='</table></div></div>';
  for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){
    const r=analyzeRelation(ps[i],ps[j]);
    html+=`<article class="relationship relation-${esc(r.kind)}"><div class="relationship-head"><b>${esc(ps[i].name)} ↔ ${esc(ps[j].name)}</b><span class="relation-badge">${esc(r.label)} · ${r.score}%</span></div><p class="note">${esc(r.summary)}</p>`;
    if(r.shared.length)html+=`<div class="relation-section"><b>共同点</b><div>${r.shared.map(x=>`<span class="match-chip">${esc(x)}</span>`).join('')}</div></div>`;
    if(r.differences.length)html+=`<div class="relation-section"><b>差异</b><div class="difference-list">${r.differences.map(d=>`<div><span>${esc(d.title)}</span><span>${esc(d.a)} ↔ ${esc(d.b)}</span></div>`).join('')}</div></div>`;
    else html+='<div class="relation-section"><b>差异</b><p class="note">已记录维度中没有发现差异。</p></div>';
    html+='</article>';
  }
  $('#compareResult').innerHTML=html;
}

function openModal(html){$('#modalBody').innerHTML=html;$('#modal').classList.add('open');$('#modal').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';}
function closeModal(){$('#modal').classList.remove('open');$('#modal').setAttribute('aria-hidden','true');document.body.style.overflow='';$('#modalBody').innerHTML='';}
function productFormHTML(p=null){
  const x=p||{},slots=imageSlots(x); return `<h2>${p?'编辑产品':'添加产品'}</h2><form id="productForm" data-id="${esc(x.id||'')}">
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
    <div class="image-field"><b>我的实物图</b>
      ${slots.userImageId?`<img class="image-preview" alt="当前实物图" data-image-id="${esc(slots.userImageId)}"><label class="remove-image"><input name="removeUserImage" type="checkbox">移除当前实物图</label>`:''}
      <label for="userImage">${slots.userImageId?'替换实物图':'添加实物图'}</label><input id="userImage" name="userImage" type="file" accept="image/*">
    </div>
    <div class="image-field"><b>官方 / 网上产品图</b>
      ${slots.officialImageId?`<img class="image-preview" alt="当前官方或网上产品图" data-image-id="${esc(slots.officialImageId)}"><label class="remove-image"><input name="removeOfficialImage" type="checkbox">移除当前官方/网上图</label>`:''}
      <label for="officialImage">${slots.officialImageId?'替换本地副本':'导入本地副本'}</label><input id="officialImage" name="officialImage" type="file" accept="image/*">
      <label for="officialImageUrl">来源网址（可选）</label><input id="officialImageUrl" name="officialImageUrl" type="url" inputmode="url" value="${esc(x.officialImageUrl||'')}" placeholder="https://…">
      <div class="image-source">网址只作为文字记录保存在本机，App 不会自动请求或热链远程图片。请先把图片保存到 Photos/Files，再导入本地副本。</div>
    </div>
    <label>备注</label><textarea name="notes">${esc(x.notes||'')}</textarea>
    <button type="submit">${p?'保存修改':'保存到本机'}</button>
  </form>`;
}
async function openProductForm(p=null){openModal(productFormHTML(p));await Promise.all($$('#productForm img[data-image-id]').map(loadImageEl));}
async function showProduct(id){
  const p=products.find(x=>x.id===id);if(!p)return; const info=attentionInfo(p),slots=imageSlots(p);
  const photos=[slots.userImageId?`<figure><img class="product-hero" alt="${esc(p.name)}实物图" data-image-id="${esc(slots.userImageId)}"><figcaption>我的实物图</figcaption></figure>`:'',slots.officialImageId?`<figure><img class="product-hero" alt="${esc(p.name)}官方或网上产品图" data-image-id="${esc(slots.officialImageId)}"><figcaption>官方 / 网上产品图 · 本地副本</figcaption></figure>`:''].filter(Boolean).join('');
  openModal(`<h2>${esc(p.name)}</h2><div class="note">${esc(p.cat||'')} · ${esc(p.form||'')}</div>
    ${photos?`<div class="product-gallery">${photos}</div>`:'<div class="empty-state"><div class="empty-icon">✦</div>暂无产品图片</div>'}
    ${p.officialImageUrl?`<div class="source-record"><b>图片来源网址（仅本地文字记录）</b><div>${esc(p.officialImageUrl)}</div></div>`:''}
    <p>${p.shade?`<span class="pill">${esc(p.shade)}</span>`:''}${p.fit?`<span class="pill">${esc(p.fit)}</span>`:''}<span class="pill ${info.level}">${esc(info.label)}</span></p>
    <div class="card"><b>For You</b><p>${esc(p.role||'尚未记录适配和搭配说明。')}</p></div>
    <div class="card"><b>Product Passport</b><div class="kv"><div>品牌</div><div>${esc(p.brand||'未记录')}</div><div>生产日期</div><div>${esc(p.made||'未记录')}</div><div>购买日期</div><div>${esc(p.bought||'未记录')}</div><div>开封日期</div><div>${esc(p.opened||'未知')}</div><div>PAO</div><div>${esc(p.pao?`${p.pao} 个月`:'待录入')}</div><div>状态</div><div>${esc(p.status||'正常')}</div></div></div>
    ${p.notes?`<div class="card"><b>备注</b><p class="note">${esc(p.notes)}</p></div>`:''}
    <div class="actions"><button data-action="edit" data-id="${esc(p.id)}" type="button">编辑</button><button class="danger" data-action="delete" data-id="${esc(p.id)}" type="button">删除</button></div>`);
  await Promise.all($$('#modalBody img[data-image-id]').map(loadImageEl));
}
async function handleProductSubmit(form){
  const fd=new FormData(form); const id=form.dataset.id||uuid(); const existing=products.find(p=>p.id===id)||{},slots=imageSlots(existing);
  const p={...existing,id,name:String(fd.get('name')||'').trim(),brand:String(fd.get('brand')||'').trim(),cat:fd.get('cat'),shade:String(fd.get('shade')||'').trim(),form:fd.get('form'),fit:String(fd.get('fit')||'').trim(),role:String(fd.get('role')||'').trim(),made:fd.get('made'),bought:fd.get('bought'),opened:fd.get('opened'),pao:String(fd.get('pao')||'').trim(),status:fd.get('status'),notes:String(fd.get('notes')||'').trim(),officialImageUrl:String(fd.get('officialImageUrl')||'').trim(),userImageId:slots.userImageId,officialImageId:slots.officialImageId};
  const userFile=fd.get('userImage'),officialFile=fd.get('officialImage'); const newIds=[],staleIds=new Set(); let saved=false;
  try{
    if(userFile&&userFile.size){toast('正在本地压缩实物图…');p.userImageId=await storeImage(id,userFile,'my_photo');newIds.push(p.userImageId);if(slots.userImageId)staleIds.add(slots.userImageId);}
    else if(fd.get('removeUserImage')){if(slots.userImageId)staleIds.add(slots.userImageId);p.userImageId='';}
    if(officialFile&&officialFile.size){toast('正在本地压缩官方/网上图…');p.officialImageId=await storeImage(id,officialFile,'official_local');newIds.push(p.officialImageId);if(slots.officialImageId)staleIds.add(slots.officialImageId);}
    else if(fd.get('removeOfficialImage')){if(slots.officialImageId)staleIds.add(slots.officialImageId);p.officialImageId='';}
    p.imageId=p.userImageId||p.officialImageId||''; p.imageSource=p.userImageId?'my_photo':p.officialImageId?'official_local':'';
    await saveProduct(p); saved=true;
    const retained=new Set(productImageIds(p));
    for(const imageId of staleIds){if(!retained.has(imageId)){await idbDelete('images',imageId);revokeImage(imageId);}}
    await reloadProducts();renderAll();closeModal();toast('已保存在本机');
  }catch(e){
    console.error(e);
    if(!saved){for(const imageId of newIds){try{await idbDelete('images',imageId);revokeImage(imageId);}catch(cleanupError){console.warn(cleanupError);}}}
    toast('保存失败，请检查图片或存储空间');
  }
}
async function deleteProduct(id){
  const p=products.find(x=>x.id===id);if(!p)return;if(!confirm(`删除“${p.name}”？`))return;
  for(const imageId of productImageIds(p)){await idbDelete('images',imageId);revokeImage(imageId);}await idbDelete('products',id);await reloadProducts();renderAll();closeModal();toast('已删除');
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
  if(pack.kdf.name!=='PBKDF2-HMAC-SHA-256'||pack.cipher.name!=='AES-256-GCM')throw new Error('unsupported backup crypto');
  const iterations=Number(pack.kdf.iterations),salt=b64ToBytes(pack.kdf.salt),iv=b64ToBytes(pack.cipher.iv);
  if(!Number.isInteger(iterations)||iterations<10000||iterations>2000000||salt.length<8||salt.length>64||iv.length<12||iv.length>16)throw new Error('invalid backup parameters');
  const key = await deriveBackupKey(password, salt, iterations);
  const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv},key,b64ToBytes(pack.cipher.data));
  const payload = JSON.parse(dec.decode(plain));
  if(payload?.format!=='beauty-cabinet-local-payload'||payload?.version!==2||!Array.isArray(payload.products)||!Array.isArray(payload.images)) throw new Error('invalid payload');
  return payload;
}
function requestBackupPassword(mode='unlock') {
  const creating=mode==='create';
  return new Promise(resolve=>{
    openModal(`<h2>${creating?'设置备份密码':'解锁加密备份'}</h2><p class="note">${creating?'这个密码只用于迁移备份，日常打开 Beauty Cabinet 不需要密码。':'请输入创建这份 .beautybackup 时设置的密码。'}</p>
      <form id="backupPasswordForm">
        <label for="backupPassword">备份密码</label><input id="backupPassword" name="password" type="password" autocomplete="${creating?'new-password':'current-password'}" minlength="${creating?'6':'1'}" required>
        ${creating?'<label for="backupPasswordAgain">再次输入</label><input id="backupPasswordAgain" name="passwordAgain" type="password" autocomplete="new-password" minlength="6" required>':''}
        <div id="backupPasswordError" class="error" role="alert"></div>
        <div class="actions"><button type="submit">${creating?'生成加密备份':'解锁备份'}</button><button id="cancelBackupPassword" class="secondary" type="button">取消</button></div>
      </form>`);
    const form=$('#backupPasswordForm'),closeBtn=$('#closeModalBtn'),modal=$('#modal'); let settled=false;
    const onKey=e=>{if(e.key==='Escape')finish(null);};
    const onBackdrop=e=>{if(e.target===modal)finish(null);};
    const cleanup=()=>{closeBtn.removeEventListener('click',onCancel);document.removeEventListener('keydown',onKey,true);modal.removeEventListener('click',onBackdrop,true);};
    const finish=value=>{if(settled)return;settled=true;cleanup();closeModal();resolve(value);};
    const onCancel=()=>finish(null);
    closeBtn.addEventListener('click',onCancel);document.addEventListener('keydown',onKey,true);modal.addEventListener('click',onBackdrop,true);
    $('#cancelBackupPassword').addEventListener('click',onCancel);
    form.addEventListener('submit',e=>{
      e.preventDefault(); const password=String(new FormData(form).get('password')||'');
      if(creating&&password.length<6){$('#backupPasswordError').textContent='备份密码至少 6 个字符。';return;}
      if(creating&&password!==String(new FormData(form).get('passwordAgain')||'')){$('#backupPasswordError').textContent='两次备份密码不一致。';return;}
      if(!password){$('#backupPasswordError').textContent='请输入备份密码。';return;}
      finish(password);
    });
    setTimeout(()=>$('#backupPassword')?.focus(),0);
  });
}
async function exportBackup(){
  if(!window.crypto?.subtle){alert('当前浏览器不支持加密备份。');return;}
  const password = await requestBackupPassword('create'); if(!password)return;
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
function replaceStoresAtomically(payload){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['products','images','settings'],'readwrite');
    try{
      tx.objectStore('products').clear(); tx.objectStore('images').clear(); tx.objectStore('settings').clear();
      for(const p of payload.products)tx.objectStore('products').put(p);
      for(const r of payload.images)tx.objectStore('images').put({...r,data:b64ToBytes(r.data).buffer});
      for(const s of (payload.settings||[]))tx.objectStore('settings').put(s);
    }catch(error){try{tx.abort();}catch(e){}reject(error);return;}
    tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error||new Error('restore aborted'));
  });
}
async function replaceWithPayload(payload){
  revokeAllImages();
  await replaceStoresAtomically(payload);
  await reloadProducts(); renderAll();
}
async function importEncryptedBackup(file){
  try{
    const pack=await parseEncryptedBackupFile(file);
    const password=await requestBackupPassword('unlock');
    if(password===null)return;
    const payload=await decryptBackupPack(pack,password);
    if(!confirm(`备份中有 ${payload.products.length} 件产品。导入会替换这台设备当前的 Beauty Cabinet 数据。继续？`))return;
    await replaceWithPayload(payload); toast('备份恢复成功');
  }catch(e){console.error(e);alert('无法解密备份：密码不正确，或文件已损坏/不是 V1.5–V1.6 加密备份。');}
}
async function importLegacy(file){
  try{
    const data=JSON.parse(await file.text()); if(!Array.isArray(data.products))throw new Error('invalid');
    if(!confirm(`找到 ${data.products.length} 条 V1.2 产品记录。导入到当前本地数据库？`))return;
    for(const old of data.products){
      const p={id:uuid(),name:old.name||'未命名产品',brand:old.brand||'',cat:old.cat||'Other',shade:old.shade||'',form:old.form||'Other',fit:old.fit||'',role:old.role||'',made:old.made||'',bought:old.bought||'',opened:old.opened||'',pao:old.pao||'',status:old.status||'需检查',notes:old.notes||'从 V1.2 导入',imageSource:'',imageId:'',userImageId:'',officialImageId:'',officialImageUrl:'',createdAt:new Date().toISOString()};
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

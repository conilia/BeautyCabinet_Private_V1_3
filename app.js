(() => {
'use strict';

const APP_VERSION = '1.7.0';
const DB_NAME = 'beauty-cabinet-local-v15';
const DB_VERSION = 2;
const BACKUP_KDF_ITERATIONS = 300000;
const MAX_IMAGE_DIM = 1100;
const MAX_SCAN_IMAGE_DIM = 1800;
const MAX_SCAN_PHOTOS = 5;
const IMAGE_QUALITY = 0.82;

let db = null;
let products = [];
let scanSessions = [];
let activeScanId = '';
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
      if (!d.objectStoreNames.contains('scanSessions')) d.createObjectStore('scanSessions', {keyPath:'id'});
      if (!d.objectStoreNames.contains('relationships')) d.createObjectStore('relationships', {keyPath:'id'});
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
async function reloadScanSessions() {
  scanSessions = (await idbGetAll('scanSessions')).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
  if(activeScanId&&!scanSessions.some(s=>s.id===activeScanId))activeScanId='';
}
function activeScan(){return scanSessions.find(s=>s.id===activeScanId)||null;}
async function saveScanSession(session){session.updatedAt=new Date().toISOString();if(!session.createdAt)session.createdAt=session.updatedAt;await idbPut('scanSessions',session);await reloadScanSessions();activeScanId=session.id;if($('#scanCount'))$('#scanCount').textContent=scanSessions.length;}
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
async function compressImage(file,maxDimension=MAX_IMAGE_DIM,quality=IMAGE_QUALITY) {
  const img = await fileToImage(file);
  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', {alpha:false});
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
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
async function storeScanImage(sessionId,file,role='angle'){
  const img=await compressImage(file,MAX_SCAN_IMAGE_DIM,.84);const id=uuid();
  await idbPut('images',{id,productId:'',sessionId,ownerType:'scan',role,data:await img.blob.arrayBuffer(),mime:img.mime,width:img.width,height:img.height,source:'scan_source',updatedAt:new Date().toISOString()});
  return {id,role,width:img.width,height:img.height,crop:{x:0,y:0,width:100,height:100}};
}
function blobToImage(blob){
  return new Promise((resolve,reject)=>{const url=URL.createObjectURL(blob),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('image decode failed'));};img.src=url;});
}
async function storedImageRecord(imageId){const rec=await idbGet('images',imageId);if(!rec||!rec.data)throw new Error('missing image');return rec;}
function safeCrop(crop={}){
  const x=Math.max(0,Math.min(95,Number(crop.x)||0)),y=Math.max(0,Math.min(95,Number(crop.y)||0));
  return {x,y,width:Math.max(5,Math.min(100-x,Number(crop.width)||100)),height:Math.max(5,Math.min(100-y,Number(crop.height)||100))};
}
async function renderStoredCrop(imageId,crop,maxDimension=700){
  const rec=await storedImageRecord(imageId),img=await blobToImage(new Blob([rec.data],{type:rec.mime||'image/jpeg'})),c=safeCrop(crop);
  const sx=Math.round(img.naturalWidth*c.x/100),sy=Math.round(img.naturalHeight*c.y/100),sw=Math.max(1,Math.round(img.naturalWidth*c.width/100)),sh=Math.max(1,Math.round(img.naturalHeight*c.height/100));
  const scale=Math.min(1,maxDimension/Math.max(sw,sh)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(sw*scale));canvas.height=Math.max(1,Math.round(sh*scale));
  canvas.getContext('2d',{alpha:false}).drawImage(img,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.84));if(!blob)throw new Error('crop failed');
  return {blob,width:canvas.width,height:canvas.height,mime:'image/jpeg'};
}
async function storeCropImage(sessionId,sourceImageId,crop,oldImageId=''){
  const rendered=await renderStoredCrop(sourceImageId,crop),id=uuid();
  await idbPut('images',{id,productId:'',sessionId,ownerType:'scan-crop',sourceImageId,crop:safeCrop(crop),data:await rendered.blob.arrayBuffer(),mime:rendered.mime,width:rendered.width,height:rendered.height,source:'scan_crop',updatedAt:new Date().toISOString()});
  if(oldImageId){await idbDelete('images',oldImageId);revokeImage(oldImageId);}return id;
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
  const sourceIds=Array.isArray(p.sourceImages)?p.sourceImages.map(x=>x.imageId):[];
  return [...new Set([s.userImageId,s.officialImageId,p.imageId,p.scanCropImageId,...sourceIds].filter(Boolean))];
}
function allReferencedImageIds(){
  return new Set([...products.flatMap(productImageIds),...scanSessions.flatMap(scanSourceImageIds)]);
}
async function cleanupOrphanImages(){
  const referenced=allReferencedImageIds();
  for(const rec of await idbGetAll('images'))if(!referenced.has(rec.id)){await idbDelete('images',rec.id);revokeImage(rec.id);}
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

function rgbToHsv(r,g,b){
  r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0;
  if(d){if(max===r)h=((g-b)/d)%6;else if(max===g)h=(b-r)/d+2;else h=(r-g)/d+4;h=Math.round(h*60);if(h<0)h+=360;}
  return {h,s:max?d/max:0,v:max};
}
function hueLabel(h,s){if(s<.12)return 'Neutral';if(h<15||h>=345)return 'Red';if(h<45)return 'Orange';if(h<70)return 'Yellow';if(h<165)return 'Green';if(h<210)return 'Cyan';if(h<260)return 'Blue';if(h<300)return 'Purple';return 'Pink';}
function evidenceFromPixels(data,aspectRatio=1){
  let r=0,g=0,b=0,n=0;for(let i=0;i<data.length;i+=4){if(data[i+3]<80)continue;r+=data[i];g+=data[i+1];b+=data[i+2];n++;}
  r=Math.round(r/Math.max(1,n));g=Math.round(g/Math.max(1,n));b=Math.round(b/Math.max(1,n));const hsv=rgbToHsv(r,g,b),light=.2126*r/255+.7152*g/255+.0722*b/255;
  return {dominantColor:`#${[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('')}`,rgb:[r,g,b],hue:hueLabel(hsv.h,hsv.s),undertone:hsv.s<.12?'Neutral':(hsv.h<85||hsv.h>=335?'Warm':hsv.h>=160&&hsv.h<315?'Cool':'Neutral'),saturation:hsv.s<.25?'Low':hsv.s<.55?'Medium':'High',depth:light>.72?'Light':light>.42?'Medium':'Deep',aspectRatio:Number(aspectRatio.toFixed(3))};
}
async function analyzeStoredRegion(imageId,crop={x:0,y:0,width:100,height:100}){
  const rec=await storedImageRecord(imageId),img=await blobToImage(new Blob([rec.data],{type:rec.mime||'image/jpeg'})),c=safeCrop(crop);
  const sx=img.naturalWidth*c.x/100,sy=img.naturalHeight*c.y/100,sw=img.naturalWidth*c.width/100,sh=img.naturalHeight*c.height/100,canvas=document.createElement('canvas');canvas.width=48;canvas.height=48;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,sx,sy,sw,sh,0,0,48,48);return evidenceFromPixels(ctx.getImageData(0,0,48,48).data,sw/sh);
}
function combineEvidence(sourceImages=[]){
  const list=sourceImages.map(x=>x.evidence).filter(Boolean);if(!list.length)return {};
  const pick=key=>{const counts=new Map();for(const e of list){if(e[key])counts.set(e[key],(counts.get(e[key])||0)+1);}return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||'';};
  return {hue:pick('hue'),undertone:pick('undertone'),saturation:pick('saturation'),depth:pick('depth'),dominantColors:list.map(e=>e.dominantColor).filter(Boolean),evidenceCount:list.length};
}
async function proposeRegions(imageId){
  const rec=await storedImageRecord(imageId),img=await blobToImage(new Blob([rec.data],{type:rec.mime||'image/jpeg'}));
  const scale=Math.min(1,300/img.naturalWidth,220/img.naturalHeight),w=Math.max(40,Math.round(img.naturalWidth*scale)),h=Math.max(40,Math.round(img.naturalHeight*scale)),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);const px=ctx.getImageData(0,0,w,h).data;
  const corner=(x0,y0)=>{let r=0,g=0,b=0,n=0;for(let y=y0;y<Math.min(h,y0+6);y++)for(let x=x0;x<Math.min(w,x0+6);x++){const i=(y*w+x)*4;r+=px[i];g+=px[i+1];b+=px[i+2];n++;}return[r/n,g/n,b/n];};
  const cs=[corner(0,0),corner(Math.max(0,w-6),0),corner(0,Math.max(0,h-6)),corner(Math.max(0,w-6),Math.max(0,h-6))],bg=[0,1,2].map(k=>cs.reduce((s,c)=>s+c[k],0)/cs.length);
  const active=[];for(let x=0;x<w;x++){let hits=0;for(let y=0;y<h;y++){const i=(y*w+x)*4,d=Math.abs(px[i]-bg[0])+Math.abs(px[i+1]-bg[1])+Math.abs(px[i+2]-bg[2]);if(d>105)hits++;}active[x]=hits/h>.1;}
  const runs=[];let start=-1,gap=0;for(let x=0;x<=w;x++){if(x<w&&active[x]){if(start<0)start=x;gap=0;}else if(start>=0){gap++;if(gap>Math.max(2,Math.round(w*.012))||x===w){const end=x-gap+1;if(end-start>=Math.max(6,w*.035))runs.push([start,end]);start=-1;gap=0;}}}
  const selected=(runs.length&&runs.length<=12?runs:runs.length>12?runs.sort((a,b)=>(b[1]-b[0])-(a[1]-a[0])).slice(0,12).sort((a,b)=>a[0]-b[0]):[[0,w]]);
  return selected.map(([x1,x2])=>{let y1=h,y2=0;for(let x=x1;x<=x2;x++)for(let y=0;y<h;y++){const i=(y*w+x)*4,d=Math.abs(px[i]-bg[0])+Math.abs(px[i+1]-bg[1])+Math.abs(px[i+2]-bg[2]);if(d>105){y1=Math.min(y1,y);y2=Math.max(y2,y);}}if(y2<=y1){y1=0;y2=h;}const padX=Math.max(2,(x2-x1)*.08),padY=Math.max(2,(y2-y1)*.08);return safeCrop({x:(x1-padX)/w*100,y:(y1-padY)/h*100,width:(x2-x1+2*padX)/w*100,height:(y2-y1+2*padY)/h*100});});
}
async function createRegions(sessionId,imageId,role){
  const crops=await proposeRegions(imageId),regions=[];let index=0;
  for(const crop of crops){const evidence=await analyzeStoredRegion(imageId,crop),cropImageId=await storeCropImage(sessionId,imageId,crop);regions.push({id:uuid(),label:String.fromCharCode(65+index++),sourceImageId:imageId,role,crop,cropImageId,evidence,centerX:crop.x+crop.width/2});}
  return regions;
}
function colorDistance(a,b){const ar=a?.rgb||[0,0,0],br=b?.rgb||[0,0,0];return Math.sqrt(ar.reduce((s,v,i)=>s+(v-br[i])**2,0))/442;}
function proposePairings(frontRegions=[],backRegions=[]){
  const available=new Set(backRegions.map(r=>r.id));return frontRegions.map(front=>{let best='',bestCost=Infinity;for(const back of backRegions){if(!available.has(back.id))continue;const pos=Math.abs(front.centerX-back.centerX)/100,aspect=Math.min(1,Math.abs(Math.log((front.evidence.aspectRatio||1)/(back.evidence.aspectRatio||1)))),frontSize=(front.crop.width*front.crop.height)/10000,backSize=(back.crop.width*back.crop.height)/10000,size=Math.min(1,Math.abs(frontSize-backSize)/Math.max(.01,frontSize,backSize)),color=colorDistance(front.evidence,back.evidence),cost=pos*.5+aspect*.2+size*.15+color*.15;if(cost<bestCost){bestCost=cost;best=back.id;}}if(best)available.delete(best);return{frontRegionId:front.id,backRegionId:best,confidence:Math.max(.2,Math.min(.92,1-bestCost))};});
}

function tab(id) {
  $$('main > section').forEach(s=>s.hidden=s.id!==id);
  $$('nav button[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));
  window.scrollTo({top:0,behavior:'auto'});
  if(id==='compare') renderComparePicker();
  if(id==='scan') renderScanShelf();
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
function renderAll(){renderHome();renderProducts();renderExpiry();renderComparePicker();renderScanShelf();}
function renderHome(){
  $('#count').textContent=products.length;
  $('#imageCount').textContent=new Set(products.flatMap(productImageIds)).size;
  $('#attentionCount').textContent=products.filter(p=>attentionInfo(p).level!=='good').length;
  if($('#scanCount'))$('#scanCount').textContent=scanSessions.filter(s=>s.stage!=='imported').length;
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
const ATTRIBUTE_FIELDS=[['色相','hue'],['冷暖调','undertone'],['饱和度','saturation'],['深浅','depth'],['质感','texture'],['妆效','finish'],['遮盖力','coverage'],['功能','function']];
function attributeValue(p,key){return String(p?.attributes?.[key]||'').trim();}
function attributeSimilarity(a,b,keys){let compared=0,matched=0;for(const key of keys){const av=norm(attributeValue(a,key)),bv=norm(attributeValue(b,key));if(av&&bv){compared++;if(av===bv)matched++;}}return compared?matched/compared:0;}
const DIFFERENCE_FIELDS=[['品牌',p=>p.brand],['产品名',p=>p.name],['类别',p=>p.cat],['颜色/色号',p=>p.shade],['质地',p=>p.form],['适配',p=>p.fit],['用途/搭配',p=>p.role],...ATTRIBUTE_FIELDS.map(([label,key])=>[label,p=>attributeValue(p,key)]),['状态',p=>p.status]];
function analyzeRelation(a,b){
  const sameBrand=norm(a.brand)&&norm(a.brand)===norm(b.brand);
  const nameSim=textSimilarity(a.name,b.name),shadeSim=textSimilarity(a.shade,b.shade),roleSim=textSimilarity(a.role,b.role);
  const sameCat=norm(a.cat)&&norm(a.cat)===norm(b.cat),sameForm=norm(a.form)&&norm(a.form)===norm(b.form);
  const sameFamily=categoryFamily(a.cat)&&categoryFamily(a.cat)===categoryFamily(b.cat);
  const colorScore=attributeSimilarity(a,b,['hue','undertone','saturation','depth']),functionScore=attributeSimilarity(a,b,['texture','finish','coverage','function']);
  let kind='unique',label='Unique',score=Math.round(12+22*Math.max(nameSim,shadeSim,roleSim,colorScore,functionScore));
  let summary='结构化属性与文字记录没有显示明确重复或互补关系。';
  if(((sameBrand&&nameSim>=.82)||(nameSim===1&&sameCat))&&(shadeSim>=.82||colorScore>=.75)){
    kind='true';label='True Duplicate';score=96;summary='品牌/产品身份与色号高度一致，最可能是真正重复。';
  }else if(sameCat&&(shadeSim>=.65||colorScore>=.6)){
    kind='color';label='Color Duplicate';score=Math.round(75+Math.max(shadeSim,colorScore)*15);summary='类别与结构化颜色属性高度重合；差别主要在质地、品牌或使用感。';
  }else if(isComplementaryPair(a,b)){
    kind='complementary';label='Complementary';score=78;summary='两件产品承担不同但可组合的步骤，更像互补搭配而不是重复。';
  }else if(sameCat||(sameFamily&&(sameForm||roleSim>=.34||functionScore>=.5))){
    kind='functional';label='Functional Duplicate';score=Math.round(65+(sameForm?8:0)+(roleSim>=.34?7:0)+functionScore*12);summary='功能、质感或使用位置接近，但颜色、妆效或具体用途存在差异。';
  }
  const shared=[]; const differences=[];
  for(const [title,get] of DIFFERENCE_FIELDS){
    const av=String(get(a)||'').trim(),bv=String(get(b)||'').trim();
    if(av&&bv&&norm(av)===norm(bv)) shared.push(`${title}：${av}`);
    else if(av||bv) differences.push({title,a:av||'未记录',b:bv||'未记录'});
  }
  if(imageSlots(a).userImageId&&imageSlots(b).userImageId)shared.push('两件都有实物图');
  return {kind,label,score:Math.min(99,score),summary,shared,differences,signals:{name:nameSim,shade:shadeSim,color:colorScore,function:functionScore}};
}
async function runCompare(){
  const ids=$$('.compare-check:checked').map(x=>x.value);
  const ps=ids.map(id=>products.find(p=>p.id===id)).filter(Boolean);
  if(ps.length<2||ps.length>4)return;
  let html='<div class="card"><div class="title"><h3>比较结果</h3></div><div style="overflow:auto"><table class="compare"><tr><th>维度</th>'+ps.map(p=>`<th>${esc(p.name)}</th>`).join('')+'</tr>';
  const rows=[['品牌',p=>p.brand],['类别',p=>p.cat],['颜色/色号',p=>p.shade],['质地',p=>p.form],...ATTRIBUTE_FIELDS.map(([label,key])=>[label,p=>attributeValue(p,key)]),['适配',p=>p.fit],['用途/搭配',p=>p.role],['本地图',p=>{const s=imageSlots(p);return [s.userImageId?'实物图':'',s.officialImageId?'官方/网上图':''].filter(Boolean).join(' + ');}],['状态',p=>p.status]];
  rows.forEach(([label,get])=>{html+=`<tr><td>${label}</td>${ps.map(p=>`<td>${esc(get(p)||'未记录')}</td>`).join('')}</tr>`}); html+='</table></div></div>';
  const relationshipRecords=[];
  for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){
    const r=analyzeRelation(ps[i],ps[j]);
    const pair=[ps[i].id,ps[j].id].sort();relationshipRecords.push({id:pair.join('::'),productIds:pair,kind:r.kind,label:r.label,score:r.score,signals:r.signals,updatedAt:new Date().toISOString()});
    html+=`<article class="relationship relation-${esc(r.kind)}"><div class="relationship-head"><b>${esc(ps[i].name)} ↔ ${esc(ps[j].name)}</b><span class="relation-badge">${esc(r.label)} · ${r.score}%</span></div><p class="note">${esc(r.summary)}</p>`;
    if(r.shared.length)html+=`<div class="relation-section"><b>共同点</b><div>${r.shared.map(x=>`<span class="match-chip">${esc(x)}</span>`).join('')}</div></div>`;
    if(r.differences.length)html+=`<div class="relation-section"><b>差异</b><div class="difference-list">${r.differences.map(d=>`<div><span>${esc(d.title)}</span><span>${esc(d.a)} ↔ ${esc(d.b)}</span></div>`).join('')}</div></div>`;
    else html+='<div class="relation-section"><b>差异</b><p class="note">已记录维度中没有发现差异。</p></div>';
    html+='</article>';
  }
  $('#compareResult').innerHTML=html;
  try{await Promise.all(relationshipRecords.map(r=>idbPut('relationships',r)));}catch(e){console.warn('relationship persistence skipped',e);}
}

function openModal(html){$('#modalBody').innerHTML=html;$('#modal').classList.add('open');$('#modal').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';}
function closeModal(){$('#modal').classList.remove('open');$('#modal').setAttribute('aria-hidden','true');document.body.style.overflow='';$('#modalBody').innerHTML='';}
function selectOptions(values,current=''){return values.map(v=>`<option value="${esc(v)}" ${String(current)===String(v)?'selected':''}>${esc(v||'未记录')}</option>`).join('');}
function productFormHTML(p=null){
  const x=p||{},slots=imageSlots(x),attrs=x.attributes||{}; return `<h2>${p?'编辑产品':'添加产品'}</h2><form id="productForm" data-id="${esc(x.id||'')}">
    <label>产品名称 *</label><input name="name" value="${esc(x.name||'')}" autocomplete="off" required placeholder="例如产品名 + 色号">
    <label>品牌</label><input name="brand" value="${esc(x.brand||'')}" autocomplete="off">
    <label>类别</label><select name="cat">${['Blush','Eyeshadow','Highlighter','Bronzer','Foundation','Concealer','Primer','Powder','Lip','Mascara','Liquid eyeliner','Skincare','Other'].map(v=>`<option ${x.cat===v?'selected':''}>${v}</option>`).join('')}</select>
    <label>色号 / 颜色描述</label><input name="shade" value="${esc(x.shade||'')}" placeholder="例如 muted dusty rose">
    <label>质地</label><select name="form">${['Powder','Cream','Liquid','Balm','Gel','Stick','Mascara','Liquid eyeliner','Other'].map(v=>`<option ${x.form===v?'selected':''}>${v}</option>`).join('')}</select>
    <label>对我的适配</label><input name="fit" value="${esc(x.fit||'')}" placeholder="例如 很适合 / 搭配后适合">
    <label>用途 / 搭配说明</label><textarea name="role" placeholder="例如：适合与低饱和腮红混合">${esc(x.role||'')}</textarea>
    <details class="attribute-panel" open><summary>结构化产品属性</summary><div class="attribute-grid">
      <label>色相<select name="attrHue">${selectOptions(['','Red','Orange','Yellow','Green','Cyan','Blue','Purple','Pink','Neutral'],attrs.hue)}</select></label>
      <label>冷暖调<select name="attrUndertone">${selectOptions(['','Warm','Cool','Neutral'],attrs.undertone)}</select></label>
      <label>饱和度<select name="attrSaturation">${selectOptions(['','Low','Medium','High'],attrs.saturation)}</select></label>
      <label>深浅<select name="attrDepth">${selectOptions(['','Light','Medium','Deep'],attrs.depth)}</select></label>
      <label>质感<select name="attrTexture">${selectOptions(['','Powder','Cream','Liquid','Balm','Gel','Stick','Loose','Pressed','Other'],attrs.texture)}</select></label>
      <label>妆效<select name="attrFinish">${selectOptions(['','Matte','Satin','Dewy','Shimmer','Metallic','Natural','Glossy','Other'],attrs.finish)}</select></label>
      <label>遮盖力<select name="attrCoverage">${selectOptions(['','Sheer','Light','Medium','Full','Buildable'],attrs.coverage)}</select></label>
      <label>功能<input name="attrFunction" value="${esc(attrs.function||'')}" placeholder="例如 提亮 / 均匀肤色"></label>
    </div></details>
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
  const attrs=p.attributes||{},attrRows=ATTRIBUTE_FIELDS.filter(([,key])=>attrs[key]).map(([label,key])=>`<div>${esc(label)}</div><div>${esc(attrs[key])}</div>`).join('');
  const sourcePhotos=(p.sourceImages||[]).map(s=>`<figure><img class="scan-source-thumb" alt="扫描来源图" data-image-id="${esc(s.imageId)}"><figcaption>${esc(s.role||'angle')}</figcaption></figure>`).join('');
  openModal(`<h2>${esc(p.name)}</h2><div class="note">${esc(p.cat||'')} · ${esc(p.form||'')}</div>
    ${photos?`<div class="product-gallery">${photos}</div>`:'<div class="empty-state"><div class="empty-icon">✦</div>暂无产品图片</div>'}
    ${p.officialImageUrl?`<div class="source-record"><b>图片来源网址（仅本地文字记录）</b><div>${esc(p.officialImageUrl)}</div></div>`:''}
    <p>${p.shade?`<span class="pill">${esc(p.shade)}</span>`:''}${p.fit?`<span class="pill">${esc(p.fit)}</span>`:''}<span class="pill ${info.level}">${esc(info.label)}</span></p>
    <div class="card"><b>For You</b><p>${esc(p.role||'尚未记录适配和搭配说明。')}</p></div>
    <div class="card"><b>Product Passport</b><div class="kv"><div>品牌</div><div>${esc(p.brand||'未记录')}</div><div>生产日期</div><div>${esc(p.made||'未记录')}</div><div>购买日期</div><div>${esc(p.bought||'未记录')}</div><div>开封日期</div><div>${esc(p.opened||'未知')}</div><div>PAO</div><div>${esc(p.pao?`${p.pao} 个月`:'待录入')}</div><div>状态</div><div>${esc(p.status||'正常')}</div></div></div>
    ${attrRows?`<div class="card"><b>Structured Attributes</b><div class="kv top-gap">${attrRows}</div></div>`:''}
    ${sourcePhotos?`<details class="card"><summary><b>Scan Shelf 来源图（${p.sourceImages.length}）</b></summary><div class="scan-source-gallery">${sourcePhotos}</div></details>`:''}
    ${p.notes?`<div class="card"><b>备注</b><p class="note">${esc(p.notes)}</p></div>`:''}
    <div class="actions"><button data-action="edit" data-id="${esc(p.id)}" type="button">编辑</button><button class="danger" data-action="delete" data-id="${esc(p.id)}" type="button">删除</button></div>`);
  await Promise.all($$('#modalBody img[data-image-id]').map(loadImageEl));
}
async function handleProductSubmit(form){
  const fd=new FormData(form); const id=form.dataset.id||uuid(); const existing=products.find(p=>p.id===id)||{},slots=imageSlots(existing);
  const attributes={hue:fd.get('attrHue')||'',undertone:fd.get('attrUndertone')||'',saturation:fd.get('attrSaturation')||'',depth:fd.get('attrDepth')||'',texture:fd.get('attrTexture')||'',finish:fd.get('attrFinish')||'',coverage:fd.get('attrCoverage')||'',function:String(fd.get('attrFunction')||'').trim()};
  const p={...existing,id,name:String(fd.get('name')||'').trim(),brand:String(fd.get('brand')||'').trim(),cat:fd.get('cat'),shade:String(fd.get('shade')||'').trim(),form:fd.get('form'),fit:String(fd.get('fit')||'').trim(),role:String(fd.get('role')||'').trim(),attributes,made:fd.get('made'),bought:fd.get('bought'),opened:fd.get('opened'),pao:String(fd.get('pao')||'').trim(),status:fd.get('status'),notes:String(fd.get('notes')||'').trim(),officialImageUrl:String(fd.get('officialImageUrl')||'').trim(),userImageId:slots.userImageId,officialImageId:slots.officialImageId};
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
  await idbDelete('products',id);
  for(const imageId of productImageIds(p)){const usedByProduct=products.some(x=>x.id!==id&&productImageIds(x).includes(imageId)),usedByScan=scanSessions.some(s=>scanSourceImageIds(s).includes(imageId));if(!usedByProduct&&!usedByScan){await idbDelete('images',imageId);revokeImage(imageId);}}
  for(const relation of await idbGetAll('relationships'))if((relation.productIds||[]).includes(id))await idbDelete('relationships',relation.id);
  await reloadProducts();renderAll();closeModal();toast('已删除');
}

const SCAN_MODE_LABELS={single:'Single Product Multi-Photo',batch:'Single-Image Batch',paired:'Paired Batch'};
const SCAN_ROLE_LABELS={front:'正面',back:'背面',bottom:'底部',side:'侧面',angle:'其他角度','group-front':'正面合照','group-back':'背面合照',group:'批量合照',extra:'补充照片'};
function scanRoleLabel(role){return SCAN_ROLE_LABELS[role]||role||'照片';}
function newScanSession(mode){return{id:uuid(),mode,stage:'capture',sourceImages:[],candidates:[],frontRegions:[],backRegions:[],pairings:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};}
async function startScanMode(mode){const session=newScanSession(mode);await saveScanSession(session);renderScanShelf();}
function scanSourceImageIds(session){
  const ids=[...(session.sourceImages||[]).map(x=>x.imageId),session.batchImageId,session.frontImageId,session.backImageId,...(session.frontRegions||[]).map(x=>x.cropImageId),...(session.backRegions||[]).map(x=>x.cropImageId),...(session.candidates||[]).flatMap(c=>[c.cropImageId,...(c.sourceImages||[]).map(x=>x.imageId)])];
  return [...new Set(ids.filter(Boolean))];
}
async function discardScanSession(sessionId){
  const session=scanSessions.find(s=>s.id===sessionId);if(!session)return;if(!confirm('删除这次未完成的扫描？已导入 Cabinet 的产品不会被删除。'))return;
  const productRefs=new Set(products.flatMap(productImageIds));for(const id of scanSourceImageIds(session)){if(!productRefs.has(id)){await idbDelete('images',id);revokeImage(id);}}
  await idbDelete('scanSessions',sessionId);if(activeScanId===sessionId)activeScanId='';await reloadScanSessions();renderScanShelf();renderHome();
}
function sourceThumb(source){return `<figure class="scan-thumb"><img alt="${esc(scanRoleLabel(source.role))}" data-image-id="${esc(source.imageId)}"><figcaption>${esc(scanRoleLabel(source.role))}</figcaption></figure>`;}
function scanFileControl(kind,label,{capture=false,multiple=false}={}){return `<label class="scan-file-button">${esc(label)}<input type="file" accept="image/*" ${capture?'capture="environment"':''} ${multiple?'multiple':''} data-scan-input="${esc(kind)}"></label>`;}
function renderScanCapture(session){
  const sources=session.sourceImages||[];
  if(session.mode==='single')return `<div class="card"><div class="title"><h3>Single Product Multi-Photo</h3><span class="status-badge">${sources.length}/${MAX_SCAN_PHOTOS}</span></div><p class="note">一件产品可添加正面、底部、背面、侧面或开盖颜色图。所有照片属于同一个 ProductCandidate。</p><div class="scan-gallery">${sources.map(sourceThumb).join('')}</div><div class="toolbar">${scanFileControl('single-camera',sources.length?'Add another angle':'Take first photo',{capture:true})}${scanFileControl('single-files',sources.length?'Add photos':'Choose Photos',{multiple:true})}</div>${sources.length?'<button class="full" type="button" data-scan-action="recognize">Start recognition</button>':''}</div>`;
  if(session.mode==='batch')return `<div class="card"><h3>Single-Image Batch Scan</h3><p class="note">选择一张包含多件产品的照片。本地算法会按物体区域生成低置信度裁剪候选，必须由你复核。</p>${session.batchImageId?`<img class="scan-group-preview" alt="批量合照" data-image-id="${esc(session.batchImageId)}">`:''}<div class="toolbar">${scanFileControl('batch-camera',session.batchImageId?'Retake photo':'Take group photo',{capture:true})}${scanFileControl('batch-file',session.batchImageId?'Choose another image':'Choose one image')}</div>${session.batchImageId?'<button class="full" type="button" data-scan-action="recognize">Start recognition</button>':''}</div>`;
  return `<div class="card"><h3>Paired Batch Scan</h3><ol class="scan-steps"><li>保持产品顺序，拍正面合照</li><li>原位翻转产品，拍背面合照</li><li>确认自动配对，再识别</li></ol><div class="paired-capture"><div><b>Front group</b>${session.frontImageId?`<img class="scan-group-preview" alt="正面合照" data-image-id="${esc(session.frontImageId)}">`:''}${scanFileControl('paired-front',session.frontImageId?'Retake front':'Take front group',{capture:true})}${scanFileControl('paired-front','Choose front photo')}</div><div><b>Back group</b>${session.backImageId?`<img class="scan-group-preview" alt="背面合照" data-image-id="${esc(session.backImageId)}">`:''}${scanFileControl('paired-back',session.backImageId?'Retake back':'Take back group',{capture:true})}${scanFileControl('paired-back','Choose back photo')}</div></div>${session.frontImageId&&session.backImageId?'<button class="full" type="button" data-scan-action="recognize">Propose pairings</button>':''}<p class="note">通常两张合照即可。若某一件仍缺信息，只对那件产品添加底部/侧面图。</p></div>`;
}
function renderPairing(session){
  const backOptions=(selected='')=>`<option value="">未配对</option>${session.backRegions.map(r=>`<option value="${esc(r.id)}" ${r.id===selected?'selected':''}>Back ${esc(r.label)}</option>`).join('')}`;
  return `<div class="card"><div class="title"><h3>Confirm pairings</h3><span class="status-badge">LOCAL</span></div><p class="note">建议依据位置、轮廓比例、尺寸和主色生成。请纠正错误配对后再继续。</p><div class="pairing-list">${session.frontRegions.map(front=>{const pair=session.pairings.find(p=>p.frontRegionId===front.id)||{};return `<div class="pair-row"><figure><img alt="Front ${esc(front.label)}" data-image-id="${esc(front.cropImageId)}"><figcaption>Front ${esc(front.label)}</figcaption></figure><span>↔</span><label><select class="pair-select" data-front-id="${esc(front.id)}">${backOptions(pair.backRegionId)}</select></label></div>`;}).join('')}</div><button class="full" type="button" data-scan-action="confirm-pairings">Confirm pairings</button></div>`;
}
function candidateAsProduct(c){return{name:c.name||'',brand:c.brand||'',cat:c.cat||'Other',shade:c.shade||'',form:c.form||'Other',role:c.role||'',attributes:c.attributes||{}};}
function duplicateFlag(candidate){
  const cp=candidateAsProduct(candidate);let best=null;
  for(const p of products){const sameIdentity=norm(cp.brand)&&norm(cp.brand)===norm(p.brand)&&textSimilarity(cp.name,p.name)>=.75;if(sameIdentity){const differentShade=norm(cp.shade)&&norm(p.shade)&&norm(cp.shade)!==norm(p.shade);const flag={label:differentShade?'Same product, different shade':'Possible existing item',product:p,priority:differentShade?2:3};if(!best||flag.priority>best.priority)best=flag;continue;}const relation=analyzeRelation(cp,p);if(['true','color','functional'].includes(relation.kind)&&relation.score>=75){const flag={label:'Possible duplicate',product:p,priority:1};if(!best)best=flag;}}
  return best;
}
function candidateCard(candidate){
  const flag=duplicateFlag(candidate),attrs=candidate.attributes||{},attrText=ATTRIBUTE_FIELDS.filter(([,k])=>attrs[k]).map(([l,k])=>`${l} ${attrs[k]}`).join(' · ');
  return `<article class="candidate-card ${candidate.unidentified?'candidate-unidentified':''}" data-candidate-id="${esc(candidate.id)}"><div class="candidate-top">${candidate.cropImageId?`<img class="candidate-crop" alt="候选裁剪" data-image-id="${esc(candidate.cropImageId)}">`:'<div class="candidate-crop placeholder">✦</div>'}<div><label class="candidate-accept"><input type="checkbox" data-candidate-accept="${esc(candidate.id)}" ${candidate.accepted?'checked':''}>接受并导入</label><b>${esc(candidate.unidentified?'未识别产品':candidate.name||'待识别产品')}</b><div class="note">${esc(candidate.brand||'品牌待填')} · ${esc(candidate.cat||'Other')} · ${esc(candidate.shade||'色号待填')}</div><span class="confidence">Local confidence ${Math.round((candidate.confidence||.2)*100)}%</span></div></div>${flag?`<div class="duplicate-flag"><b>${esc(flag.label)}</b><span>${esc(flag.product.name)}</span></div>`:''}${attrText?`<p class="note">${esc(attrText)}</p>`:''}<div class="candidate-actions"><button class="secondary" type="button" data-candidate-action="edit" data-id="${esc(candidate.id)}">编辑</button><button class="secondary" type="button" data-candidate-action="unidentified" data-id="${esc(candidate.id)}">标记未识别</button><label class="scan-file-button small-button">Add bottom/side photo for this product<input type="file" accept="image/*" capture="environment" data-candidate-extra="${esc(candidate.id)}"></label><button class="danger" type="button" data-candidate-action="delete" data-id="${esc(candidate.id)}">删除误检</button></div><label class="merge-check"><input type="checkbox" data-candidate-merge="${esc(candidate.id)}">选择合并</label></article>`;
}
function renderCandidateReview(session){
  return `<div class="card"><div class="title"><h3>Review detected products</h3><span class="status-badge">${session.candidates.length}</span></div><p class="note">本地模式不会可靠识别品牌或产品名。请编辑、删除误检、合并重复检测，或把无法判断的项目标记为未识别。只有勾选接受的候选会写入 Cabinet。</p><div class="toolbar"><button class="secondary" type="button" data-scan-action="add-candidate">＋ 手动添加候选</button><button class="secondary" type="button" data-scan-action="merge-candidates">合并所选检测</button></div></div><div class="candidate-list">${session.candidates.map(candidateCard).join('')}</div><div class="card"><button class="full" type="button" data-scan-action="import-candidates">Import confirmed candidates</button></div>`;
}
function renderScanShelf(){
  const root=$('#scanRoot');if(!root)return;const session=activeScan();
  if(!session){root.innerHTML=`<div class="card"><div class="title"><h3>Scan Shelf</h3><span class="status-badge">LOCAL</span></div><p class="note">远程识别默认关闭且本版未配置远程 API。照片、裁剪、候选和 Cabinet 数据只保存在本机；本地识别仅提供分区与颜色证据，所有结果必须人工确认。</p><div class="scan-modes"><button type="button" data-scan-mode="single"><b>1. Single Product</b><span>1–5 张同一产品照片</span></button><button type="button" data-scan-mode="batch"><b>2. Single-Image Batch</b><span>一张图，多件产品</span></button><button type="button" data-scan-mode="paired"><b>3. Paired Batch</b><span>正面合照 + 背面合照</span></button></div></div>${scanSessions.length?`<div class="card"><h3>未完成扫描</h3>${scanSessions.map(s=>`<div class="scan-session-row"><button type="button" data-resume-scan="${esc(s.id)}"><b>${esc(SCAN_MODE_LABELS[s.mode])}</b><span>${esc(s.stage)} · ${new Date(s.updatedAt).toLocaleString()}</span></button><button class="danger" type="button" data-discard-scan="${esc(s.id)}">删除</button></div>`).join('')}</div>`:''}`;return;}
  root.innerHTML=`<div class="scan-toolbar"><button class="secondary" type="button" data-scan-action="back">← Scan Shelf</button><b>${esc(SCAN_MODE_LABELS[session.mode])}</b></div>${session.stage==='pairing'?renderPairing(session):session.stage==='review'?renderCandidateReview(session):session.stage==='imported'?'<div class="card"><h3>已导入 Cabinet</h3><p class="note">确认候选已写入本机 IndexedDB。扫描来源图和结构化属性会随加密备份保存。</p><button type="button" data-scan-action="back">返回 Scan Shelf</button></div>':renderScanCapture(session)}`;
  activateLazyImages();
}
async function addScanFiles(kind,files){
  const session=activeScan();if(!session||!files.length)return;
  try{
    if(kind.startsWith('single')){const remaining=MAX_SCAN_PHOTOS-(session.sourceImages||[]).length;if(remaining<=0){toast('最多 5 张照片');return;}const selected=[...files].slice(0,remaining);for(const file of selected){const source=await storeScanImage(session.id,file,session.sourceImages.length?'angle':'front');session.sourceImages.push({imageId:source.id,role:source.role,crop:source.crop});}}
    else{const file=files[0],role=kind==='paired-front'?'group-front':kind==='paired-back'?'group-back':'group',source=await storeScanImage(session.id,file,role),field=kind==='paired-front'?'frontImageId':kind==='paired-back'?'backImageId':'batchImageId',old=session[field];session[field]=source.id;if(old){await idbDelete('images',old);revokeImage(old);}session.stage='capture';}
    await saveScanSession(session);renderScanShelf();
  }catch(e){console.error(e);toast('无法读取照片，请检查格式或存储空间');}
}
function candidateFromSources(sourceImages,cropImageId,confidence=.3){const combined=combineEvidence(sourceImages);return{id:uuid(),name:'',brand:'',shade:'',cat:'Other',form:'Other',role:'',attributes:{hue:combined.hue||'',undertone:combined.undertone||'',saturation:combined.saturation||'',depth:combined.depth||'',texture:'',finish:'',coverage:'',function:''},sourceImages,cropImageId,confidence,accepted:true,unidentified:false};}
async function startRecognition(){
  const session=activeScan();if(!session)return;toast('正在本机生成候选…');
  try{
    if(session.mode==='single'){const sources=[];for(const source of session.sourceImages){sources.push({...source,evidence:await analyzeStoredRegion(source.imageId,source.crop)});}const cropImageId=await storeCropImage(session.id,sources[0].imageId,sources[0].crop);session.candidates=[candidateFromSources(sources,cropImageId,Math.min(.62,.28+sources.length*.07))];session.stage='review';}
    else if(session.mode==='batch'){const regions=await createRegions(session.id,session.batchImageId,'group');session.candidates=regions.map(r=>candidateFromSources([{imageId:r.sourceImageId,role:'group',crop:r.crop,evidence:r.evidence}],r.cropImageId,.3));session.stage='review';}
    else{session.frontRegions=await createRegions(session.id,session.frontImageId,'group-front');session.backRegions=await createRegions(session.id,session.backImageId,'group-back');session.pairings=proposePairings(session.frontRegions,session.backRegions);session.stage='pairing';}
    await saveScanSession(session);renderScanShelf();toast('本地候选已生成，请人工确认');
  }catch(e){console.error(e);toast('本地分区失败，可重新拍摄或手动添加候选');}
}
async function confirmPairings(){
  const session=activeScan();if(!session)return;const selected=new Set(),pairs=[];
  for(const el of $$('.pair-select')){if(el.value&&selected.has(el.value)){toast('同一张背面裁剪不能配给两件产品');return;}if(el.value)selected.add(el.value);pairs.push({frontRegionId:el.dataset.frontId,backRegionId:el.value,confidence:session.pairings.find(p=>p.frontRegionId===el.dataset.frontId&&p.backRegionId===el.value)?.confidence||.35});}
  session.pairings=pairs;session.candidates=pairs.map(pair=>{const front=session.frontRegions.find(r=>r.id===pair.frontRegionId),back=session.backRegions.find(r=>r.id===pair.backRegionId),sources=[front&&{imageId:front.sourceImageId,role:'group-front',crop:front.crop,evidence:front.evidence},back&&{imageId:back.sourceImageId,role:'group-back',crop:back.crop,evidence:back.evidence}].filter(Boolean);return candidateFromSources(sources,front?.cropImageId||back?.cropImageId,Math.min(.68,.32+(pair.confidence||.3)*.3));});session.stage='review';await saveScanSession(session);renderScanShelf();
}
function candidateFormHTML(candidate){const attrs=candidate.attributes||{};return `<h2>编辑 ProductCandidate</h2><form id="candidateForm" data-id="${esc(candidate.id)}"><label>产品名称</label><input name="name" value="${esc(candidate.name||'')}"><label>品牌</label><input name="brand" value="${esc(candidate.brand||'')}"><label>色号</label><input name="shade" value="${esc(candidate.shade||'')}"><label>类别</label><select name="cat">${['Blush','Eyeshadow','Highlighter','Bronzer','Foundation','Concealer','Primer','Powder','Lip','Mascara','Liquid eyeliner','Skincare','Other'].map(v=>`<option ${candidate.cat===v?'selected':''}>${v}</option>`).join('')}</select><label>质地</label><select name="form">${['Powder','Cream','Liquid','Balm','Gel','Stick','Mascara','Liquid eyeliner','Other'].map(v=>`<option ${candidate.form===v?'selected':''}>${v}</option>`).join('')}</select><label>用途</label><input name="role" value="${esc(candidate.role||'')}"><details class="attribute-panel" open><summary>结构化属性</summary><div class="attribute-grid"><label>色相<input name="attrHue" value="${esc(attrs.hue||'')}"></label><label>冷暖调<input name="attrUndertone" value="${esc(attrs.undertone||'')}"></label><label>饱和度<input name="attrSaturation" value="${esc(attrs.saturation||'')}"></label><label>深浅<input name="attrDepth" value="${esc(attrs.depth||'')}"></label><label>质感<input name="attrTexture" value="${esc(attrs.texture||'')}"></label><label>妆效<input name="attrFinish" value="${esc(attrs.finish||'')}"></label><label>遮盖力<input name="attrCoverage" value="${esc(attrs.coverage||'')}"></label><label>功能<input name="attrFunction" value="${esc(attrs.function||'')}"></label></div></details><details><summary>调整裁剪（百分比）</summary>${(candidate.sourceImages||[]).map((s,i)=>`<div class="candidate-crop-row" data-index="${i}"><label>照片角色<select name="sourceRole">${selectOptions(['front','back','bottom','side','angle','group','group-front','group-back','extra'],s.role)}</select></label><div class="crop-grid"><label>X<input type="number" min="0" max="95" step="1" name="cropX" value="${Math.round(s.crop?.x||0)}"></label><label>Y<input type="number" min="0" max="95" step="1" name="cropY" value="${Math.round(s.crop?.y||0)}"></label><label>宽<input type="number" min="5" max="100" step="1" name="cropW" value="${Math.round(s.crop?.width||100)}"></label><label>高<input type="number" min="5" max="100" step="1" name="cropH" value="${Math.round(s.crop?.height||100)}"></label></div></div>`).join('')}</details><button type="submit">保存候选</button></form>`;}
function openCandidateEditor(candidateId){const candidate=activeScan()?.candidates.find(c=>c.id===candidateId);if(candidate)openModal(candidateFormHTML(candidate));}
async function saveCandidateForm(form){
  const session=activeScan(),candidate=session?.candidates.find(c=>c.id===form.dataset.id);if(!candidate)return;const fd=new FormData(form);candidate.name=String(fd.get('name')||'').trim();candidate.brand=String(fd.get('brand')||'').trim();candidate.shade=String(fd.get('shade')||'').trim();candidate.cat=fd.get('cat');candidate.form=fd.get('form');candidate.role=String(fd.get('role')||'').trim();candidate.attributes={hue:fd.get('attrHue')||'',undertone:fd.get('attrUndertone')||'',saturation:fd.get('attrSaturation')||'',depth:fd.get('attrDepth')||'',texture:fd.get('attrTexture')||'',finish:fd.get('attrFinish')||'',coverage:fd.get('attrCoverage')||'',function:fd.get('attrFunction')||''};
  $$('.candidate-crop-row',form).forEach(row=>{const s=candidate.sourceImages[Number(row.dataset.index)];s.role=$('select[name="sourceRole"]',row).value;s.crop=safeCrop({x:$('input[name="cropX"]',row).value,y:$('input[name="cropY"]',row).value,width:$('input[name="cropW"]',row).value,height:$('input[name="cropH"]',row).value});});
  if(candidate.sourceImages[0])candidate.cropImageId=await storeCropImage(session.id,candidate.sourceImages[0].imageId,candidate.sourceImages[0].crop,candidate.cropImageId);candidate.unidentified=!candidate.name;candidate.confidence=Math.max(candidate.confidence||.2,.55);await saveScanSession(session);closeModal();renderScanShelf();toast('候选已保存');
}
async function addCandidateExtra(candidateId,file){const session=activeScan(),candidate=session?.candidates.find(c=>c.id===candidateId);if(!candidate||!file)return;const source=await storeScanImage(session.id,file,'extra'),entry={imageId:source.id,role:'extra',crop:source.crop,evidence:await analyzeStoredRegion(source.id,source.crop)};candidate.sourceImages.push(entry);const combined=combineEvidence(candidate.sourceImages);for(const key of ['hue','undertone','saturation','depth'])if(!candidate.attributes[key])candidate.attributes[key]=combined[key]||'';candidate.confidence=Math.min(.75,(candidate.confidence||.3)+.08);await saveScanSession(session);renderScanShelf();toast('已为这一件产品添加补充照片');}
async function candidateAction(action,id){
  const session=activeScan(),candidate=session?.candidates.find(c=>c.id===id);if(!session||!candidate)return;
  if(action==='edit'){openCandidateEditor(id);return;}if(action==='unidentified'){candidate.unidentified=true;candidate.name='';candidate.accepted=true;}if(action==='delete'){session.candidates=session.candidates.filter(c=>c.id!==id);if(candidate.cropImageId){await idbDelete('images',candidate.cropImageId);revokeImage(candidate.cropImageId);}}await saveScanSession(session);renderScanShelf();
}
async function mergeCandidates(){
  const session=activeScan(),ids=$$('[data-candidate-merge]:checked').map(x=>x.dataset.candidateMerge);if(!session||ids.length<2){toast('请选择至少两个检测结果');return;}const selected=session.candidates.filter(c=>ids.includes(c.id)),base=selected[0];for(const other of selected.slice(1)){base.sourceImages=[...base.sourceImages,...other.sourceImages].filter((s,i,a)=>a.findIndex(x=>x.imageId===s.imageId&&x.role===s.role)===i);for(const key of ['name','brand','shade','cat','form','role'])if(!base[key]&&other[key])base[key]=other[key];for(const key of Object.keys(other.attributes||{}))if(!base.attributes?.[key]&&other.attributes[key]){base.attributes=base.attributes||{};base.attributes[key]=other.attributes[key];}base.confidence=Math.max(base.confidence||0,other.confidence||0);if(other.cropImageId&&other.cropImageId!==base.cropImageId){await idbDelete('images',other.cropImageId);revokeImage(other.cropImageId);}}session.candidates=session.candidates.filter(c=>!ids.includes(c.id)||c.id===base.id);await saveScanSession(session);renderScanShelf();toast('检测结果已合并为一个 ProductCandidate');
}
async function addManualCandidate(){const session=activeScan();if(!session)return;const imageId=session.batchImageId||session.frontImageId||session.sourceImages?.[0]?.imageId;if(!imageId){toast('请先添加照片');return;}const crop={x:0,y:0,width:100,height:100},evidence=await analyzeStoredRegion(imageId,crop),cropImageId=await storeCropImage(session.id,imageId,crop),candidate=candidateFromSources([{imageId,role:'group',crop,evidence}],cropImageId,.2);session.candidates.push(candidate);await saveScanSession(session);renderScanShelf();openCandidateEditor(candidate.id);}
async function importCandidates(){
  const session=activeScan(),selected=session?.candidates.filter(c=>c.accepted);if(!session||!selected.length){toast('请至少接受一个候选');return;}if(!confirm(`把 ${selected.length} 个已确认候选写入 Cabinet？`))return;let index=1;
  for(const c of selected){const id=uuid(),name=c.unidentified||!c.name?`未识别产品 ${index++}`:c.name,p={id,name,brand:c.brand||'',cat:c.cat||'Other',shade:c.shade||'',form:c.form||'Other',fit:'',role:c.role||'',attributes:c.attributes||{},made:'',bought:'',opened:'',pao:'',status:'需检查',notes:'由 Scan Shelf 导入；品牌与产品名需人工确认。',officialImageUrl:'',userImageId:c.cropImageId||'',officialImageId:'',imageId:c.cropImageId||'',imageSource:c.cropImageId?'my_photo':'',scanCropImageId:c.cropImageId||'',sourceImages:c.sourceImages||[],scanSessionId:session.id,relationships:[],createdAt:new Date().toISOString()};await saveProduct(p);if(c.cropImageId){const rec=await idbGet('images',c.cropImageId);if(rec)await idbPut('images',{...rec,productId:id});}c.importedProductId=id;}
  await idbDelete('scanSessions',session.id);activeScanId='';await reloadScanSessions();await reloadProducts();await cleanupOrphanImages();renderAll();tab('cabinet');toast('已导入 Cabinet');
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
  const scans = await idbGetAll('scanSessions');
  const relationships = await idbGetAll('relationships');
  return {
    format:'beauty-cabinet-local-payload', version:2, appVersion:APP_VERSION,
    exportedAt:new Date().toISOString(), products:prods,
    images:imgs.map(r=>({...r,data:bytesToB64(r.data)})), settings,scanSessions:scans,relationships
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
    const tx=db.transaction(['products','images','settings','scanSessions','relationships'],'readwrite');
    try{
      tx.objectStore('products').clear(); tx.objectStore('images').clear(); tx.objectStore('settings').clear();tx.objectStore('scanSessions').clear();tx.objectStore('relationships').clear();
      for(const p of payload.products)tx.objectStore('products').put(p);
      for(const r of payload.images)tx.objectStore('images').put({...r,data:b64ToBytes(r.data).buffer});
      for(const s of (payload.settings||[]))tx.objectStore('settings').put(s);
      for(const s of (payload.scanSessions||[]))tx.objectStore('scanSessions').put(s);
      for(const r of (payload.relationships||[]))tx.objectStore('relationships').put(r);
    }catch(error){try{tx.abort();}catch(e){}reject(error);return;}
    tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error||new Error('restore aborted'));
  });
}
async function replaceWithPayload(payload){
  revokeAllImages();
  await replaceStoresAtomically(payload);
  activeScanId='';await reloadProducts();await reloadScanSessions();renderAll();
}
async function importEncryptedBackup(file){
  try{
    const pack=await parseEncryptedBackupFile(file);
    const password=await requestBackupPassword('unlock');
    if(password===null)return;
    const payload=await decryptBackupPack(pack,password);
    if(!confirm(`备份中有 ${payload.products.length} 件产品。导入会替换这台设备当前的 Beauty Cabinet 数据。继续？`))return;
    await replaceWithPayload(payload); toast('备份恢复成功');
  }catch(e){console.error(e);alert('无法解密备份：密码不正确，或文件已损坏/不是 V1.5–V1.7 加密备份。');}
}
async function importLegacy(file){
  try{
    const data=JSON.parse(await file.text()); if(!Array.isArray(data.products))throw new Error('invalid');
    if(!confirm(`找到 ${data.products.length} 条 V1.2 产品记录。导入到当前本地数据库？`))return;
    for(const old of data.products){
      const p={id:uuid(),name:old.name||'未命名产品',brand:old.brand||'',cat:old.cat||'Other',shade:old.shade||'',form:old.form||'Other',fit:old.fit||'',role:old.role||'',attributes:{},made:old.made||'',bought:old.bought||'',opened:old.opened||'',pao:old.pao||'',status:old.status||'需检查',notes:old.notes||'从 V1.2 导入',imageSource:'',imageId:'',userImageId:'',officialImageId:'',officialImageUrl:'',sourceImages:[],relationships:[],createdAt:new Date().toISOString()};
      await saveProduct(p);
    }
    await reloadProducts(); renderAll(); toast('V1.2 数据已导入');
  }catch(e){console.error(e);alert('无法读取这个 V1.2 JSON 备份。');}
}
async function clearAllData(){
  if(!confirm('这会永久删除这台设备上的 Beauty Cabinet 数据。建议先导出加密备份。继续？'))return;
  if(!confirm('最后确认：删除后无法撤销。'))return;
  try{
    products=[];scanSessions=[];activeScanId='';revokeAllImages();await idbClear('products');await idbClear('images');await idbClear('settings');await idbClear('scanSessions');await idbClear('relationships');renderAll();toast('本机数据已删除');
  }catch(e){console.error(e);alert('删除失败，请关闭其他 Beauty Cabinet 页面后重试。');}
}

function bindEvents(){
  $('#homeAddBtn').addEventListener('click',()=>openProductForm());
  if($('#homeScanBtn'))$('#homeScanBtn').addEventListener('click',()=>tab('scan'));
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
  document.addEventListener('click',async e=>{
    const t=e.target.closest('button[data-tab]');if(t){tab(t.dataset.tab);return;}
    const mode=e.target.closest('[data-scan-mode]');if(mode){await startScanMode(mode.dataset.scanMode);return;}
    const resume=e.target.closest('[data-resume-scan]');if(resume){activeScanId=resume.dataset.resumeScan;renderScanShelf();return;}
    const discard=e.target.closest('[data-discard-scan]');if(discard){await discardScanSession(discard.dataset.discardScan);return;}
    const scanAction=e.target.closest('[data-scan-action]');if(scanAction){const action=scanAction.dataset.scanAction;if(action==='back'){activeScanId='';renderScanShelf();}else if(action==='recognize')await startRecognition();else if(action==='confirm-pairings')await confirmPairings();else if(action==='merge-candidates')await mergeCandidates();else if(action==='add-candidate')await addManualCandidate();else if(action==='import-candidates')await importCandidates();return;}
    const candidateButton=e.target.closest('[data-candidate-action]');if(candidateButton){await candidateAction(candidateButton.dataset.candidateAction,candidateButton.dataset.id);return;}
    const p=e.target.closest('[data-product-id]');if(p&&!p.closest('#productForm')){showProduct(p.dataset.productId);return;}
    const a=e.target.closest('[data-action]');if(a){const id=a.dataset.id;if(a.dataset.action==='edit')openProductForm(products.find(x=>x.id===id));if(a.dataset.action==='delete')deleteProduct(id);return;}
    if(e.target===$('#modal'))closeModal();
  });
  document.addEventListener('change',async e=>{
    if(e.target.classList.contains('compare-check'))updateCompareButton();
    if(e.target.matches('[data-scan-input]')){await addScanFiles(e.target.dataset.scanInput,e.target.files||[]);e.target.value='';}
    if(e.target.matches('[data-candidate-accept]')){const session=activeScan(),candidate=session?.candidates.find(c=>c.id===e.target.dataset.candidateAccept);if(candidate){candidate.accepted=e.target.checked;await saveScanSession(session);}}
    if(e.target.matches('[data-candidate-extra]')){const file=e.target.files?.[0];if(file)await addCandidateExtra(e.target.dataset.candidateExtra,file);e.target.value='';}
  });
  document.addEventListener('submit',e=>{if(e.target.id==='productForm'){e.preventDefault();handleProductSubmit(e.target);}if(e.target.id==='candidateForm'){e.preventDefault();saveCandidateForm(e.target);}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
}

async function start(){
  if(!window.indexedDB){document.body.innerHTML='<main><div class="card"><b>当前浏览器不支持 IndexedDB。</b><p>请使用较新的 Safari / Chrome / Edge。</p></div></main>';return;}
  try{
    await cleanupLegacyWebState();
    db=await openDB();
    bindEvents();
    try{if(navigator.storage?.persist) await navigator.storage.persist();}catch(e){}
    await reloadProducts();await reloadScanSessions();renderAll();
  }catch(e){
    console.error(e);
    document.body.innerHTML='<main><div class="card"><b>无法打开本地数据库。</b><p>请使用 Safari/Chrome/Edge 的正常浏览模式，并确认没有禁用网站数据。</p></div></main>';
  }
}

document.addEventListener('DOMContentLoaded',start);
})();

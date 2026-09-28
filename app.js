(() => {
'use strict';

const APP_VERSION = '1.8.1';
const DB_NAME = 'beauty-cabinet-local-v15';
const DB_VERSION = 2;
const AI_CONTRACT_VERSION = 1;
const BACKUP_KDF_ITERATIONS = 300000;
const MAX_IMAGE_DIM = 1100;
const MAX_SCAN_IMAGE_DIM = 1800;
const MAX_SCAN_PHOTOS = 5;
const IMAGE_QUALITY = 0.82;
const DEFAULT_AI_PROXY_ENDPOINT = document.querySelector('meta[name="beauty-ai-endpoint"]')?.content?.trim() || '';
let aiProxyEndpoint = '';
function normalizeAiEndpoint(raw=''){
  const value=String(raw||'').trim();if(!value)return '';
  try{const url=new URL(value,location.href),localDev=['localhost','127.0.0.1'].includes(url.hostname),sameOrigin=url.origin===location.origin,worker=url.hostname.endsWith('.workers.dev');return (sameOrigin||worker||localDev)&&(url.protocol==='https:'||localDev)?url.href:'';}catch(e){return '';}
}
async function loadAiEndpoint(){const rec=await idbGet('settings','aiEndpoint');aiProxyEndpoint=normalizeAiEndpoint(rec?.value||DEFAULT_AI_PROXY_ENDPOINT);}
async function saveAiEndpoint(value){const normalized=normalizeAiEndpoint(value);if(value&& !normalized)throw new Error('AI endpoint must be same-origin, localhost, or an HTTPS *.workers.dev URL.');await idbPut('settings',{key:'aiEndpoint',value:normalized});aiProxyEndpoint=normalized;return normalized;}


const SKIN_CONCERN_LABELS={
  visible_pores:'毛孔明显', sebaceous_filaments:'皮脂丝', closed_comedones:'闭口', acne_prone:'易长痘',
  redness:'泛红', dehydration:'缺水/紧绷', flaking:'起皮', pigmentation:'色沉/肤色不均'
};
const SKIN_VALUE_LABELS={
  depth:{very_fair:'Very Fair',fair:'Fair',light:'Light',light_medium:'Light–Medium',medium:'Medium',medium_deep:'Medium–Deep',deep:'Deep'},
  undertone:{cool:'Cool',neutral_cool:'Neutral-Cool',neutral:'Neutral',neutral_warm:'Neutral-Warm',warm:'Warm',unknown:'未确定'},
  oliveLevel:{none:'无 Olive',subtle:'轻微 Olive',moderate:'明显 Olive',strong:'强 Olive',unknown:'未确定'},
  saturation:{muted:'Muted / 低饱和',neutral:'中等饱和',clear:'Clear / 高净度',unknown:'未确定'},
  skinType:{dry:'干性',normal:'中性',combination:'混合性',oily:'油性',unknown:'未确定'},
  zone:{dry:'偏干',slightly_dry:'微干',normal:'正常',oily:'偏油',very_oily:'明显出油',unknown:'未确定'},
  sensitivity:{none:'不敏感',mild:'轻度敏感',moderate:'中度敏感',high:'高度敏感',unknown:'未确定'},
  eyelidType:{monolid:'单眼皮',inner_double:'内双',hooded:'Hooded',inner_double_hooded:'内双 / Hooded',double:'双眼皮',unknown:'未确定'},
  baseFinish:{matte:'Matte',natural:'Natural',satin:'Satin',dewy:'Dewy',no_preference:'无固定偏好'},
  coverage:{sheer:'Sheer',light:'Light',medium:'Medium',full:'Full',no_preference:'无固定偏好'}
};
function emptySkinProfile(){return {version:1,depth:'',undertone:'',oliveLevel:'',saturation:'',skinType:'',zones:{tZone:'',cheeks:'',chin:'',underEye:''},sensitivity:'',concerns:[],eye:{eyelidType:'',eyelidOiliness:'',eyeSensitivity:''},makeup:{baseFinish:'',coverage:''},notes:'',updatedAt:''};}
function normalizeSkinProfile(raw={}){
  const base=emptySkinProfile(),obj=(raw&&typeof raw==='object')?raw:{};
  return {...base,...obj,zones:{...base.zones,...(obj.zones||{})},eye:{...base.eye,...(obj.eye||{})},makeup:{...base.makeup,...(obj.makeup||{})},concerns:Array.isArray(obj.concerns)?obj.concerns.filter(x=>SKIN_CONCERN_LABELS[x]):[],notes:String(obj.notes||''),updatedAt:String(obj.updatedAt||'')};
}
async function loadSkinProfile(){const rec=await idbGet('settings','skinProfile');skinProfile=normalizeSkinProfile(rec?.value||{});}
async function saveSkinProfile(profile){skinProfile=normalizeSkinProfile(profile);skinProfile.updatedAt=new Date().toISOString();await idbPut('settings',{key:'skinProfile',value:skinProfile,updatedAt:skinProfile.updatedAt});renderSkinProfile();renderPersonalRecommendations();}
function skinLabel(group,value){return value?(SKIN_VALUE_LABELS[group]?.[value]||value):'未记录';}
function skinProfileCompleteness(p=skinProfile){if(!p)return 0;const fields=[p.depth,p.undertone,p.oliveLevel,p.saturation,p.skinType,p.zones?.tZone,p.zones?.cheeks,p.sensitivity,p.eye?.eyelidType,p.eye?.eyelidOiliness,p.eye?.eyeSensitivity];return Math.round(fields.filter(Boolean).length/fields.length*100);}
function renderSkinProfile(){
  const root=$('#skinProfileSummary');if(!root)return;const p=normalizeSkinProfile(skinProfile||{}),complete=skinProfileCompleteness(p);
  if(!complete&&!p.concerns.length&&!p.notes){root.innerHTML='<div class="empty-state profile-empty"><div class="empty-icon">🪞</div><b>还没有建立 My Skin 档案</b><p>先记录长期稳定的肤色、肤质和眼部特征。这里不要记录“今天突然爆痘”之类短期状态。</p></div>';return;}
  const concerns=p.concerns.map(x=>`<span class="pill">${esc(SKIN_CONCERN_LABELS[x])}</span>`).join('')||'<span class="muted">未记录</span>';
  root.innerHTML=`<div class="profile-completeness"><div><b>档案完整度 ${complete}%</b><span>${p.updatedAt?`最后更新 ${new Date(p.updatedAt).toLocaleDateString()}`:'尚未保存更新时间'}</span></div><div class="profile-meter"><i style="width:${complete}%"></i></div></div>
    <div class="profile-grid">
      <article><span>肤色</span><b>${esc(skinLabel('depth',p.depth))}</b><small>${esc(skinLabel('undertone',p.undertone))} · ${esc(skinLabel('oliveLevel',p.oliveLevel))} · ${esc(skinLabel('saturation',p.saturation))}</small></article>
      <article><span>基础肤质</span><b>${esc(skinLabel('skinType',p.skinType))}</b><small>T区 ${esc(skinLabel('zone',p.zones.tZone))} · 两颊 ${esc(skinLabel('zone',p.zones.cheeks))}</small></article>
      <article><span>敏感度</span><b>${esc(skinLabel('sensitivity',p.sensitivity))}</b><small>眼部 ${esc(skinLabel('sensitivity',p.eye.eyeSensitivity))}</small></article>
      <article><span>眼部</span><b>${esc(skinLabel('eyelidType',p.eye.eyelidType))}</b><small>眼皮 ${esc(skinLabel('zone',p.eye.eyelidOiliness))}</small></article>
    </div>
    <div class="profile-concerns"><b>长期关注点</b><div>${concerns}</div></div>
    ${p.makeup.baseFinish||p.makeup.coverage?`<div class="profile-concerns"><b>底妆偏好</b><div><span class="pill">${esc(skinLabel('baseFinish',p.makeup.baseFinish))}</span><span class="pill">${esc(skinLabel('coverage',p.makeup.coverage))}</span></div></div>`:''}
    ${p.notes?`<div class="profile-notes"><b>备注</b><p>${esc(p.notes)}</p></div>`:''}`;
}


const RECOMMENDATION_LABELS={
  excellent:{label:'很适合',className:'match-excellent'},
  good:{label:'适合',className:'match-good'},
  conditional:{label:'有条件适合',className:'match-conditional'},
  caution:{label:'谨慎使用',className:'match-caution'},
  low:{label:'低优先级',className:'match-low'},
  unknown:{label:'信息不足',className:'match-unknown'}
};
function recText(p){const a=p?.attributes||{};return norm([p?.brand,p?.name,p?.shade,p?.cat,p?.form,p?.fit,p?.myResult,p?.role,p?.notes,a.hue,a.undertone,a.saturation,a.depth,a.texture,a.finish,a.coverage,a.function].filter(Boolean).join(' '));}
function recDescriptorText(p){const a=p?.attributes||{};return norm([p?.brand,p?.name,p?.shade,p?.cat,p?.form,p?.productLine,p?.packagingText,a.hue,a.undertone,a.saturation,a.depth,a.texture,a.finish,a.coverage,a.function].filter(Boolean).join(' '));}
function recHas(text,terms=[]){return terms.some(term=>text.includes(norm(term)));}
function recCategory(p){
  const c=norm(p?.cat||''),t=recDescriptorText(p);
  const has=(terms)=>recHas(c,terms)||recHas(t,terms);
  if(recHas(c,['face palette','面部盘']))return 'face-palette';
  if(recHas(c,['lip','lipstick','lipliner','lip gloss','lip balm','唇']))return 'lip';
  if(recHas(c,['blush','腮红']))return 'blush';
  if(recHas(c,['highlighter','高光']))return 'highlighter';
  if(recHas(c,['bronzer','古铜']))return 'bronzer';
  if(recHas(c,['contour','修容']))return 'contour';
  if(recHas(c,['eyeshadow','眼影']))return 'eyeshadow';
  if(recHas(c,['eyeliner','eye pencil','眼线']))return 'eyeliner';
  if(recHas(c,['brow','眉']))return 'brow';
  if(recHas(c,['primer','妆前']))return 'primer';
  if(recHas(c,['foundation','bb cream','cc cream','cushion','粉底','底妆']))return 'base';
  if(recHas(c,['concealer','corrector','遮瑕','修色']))return 'concealer';
  if(recHas(c,['powder','定妆','散粉','粉饼']))return 'powder';
  if(recHas(c,['setting spray','定妆喷雾']))return 'setting-spray';
  if(recHas(c,['skincare','护肤']))return 'skincare';
  if(has(['lipstick','liquid lip','lip color','lip colour','lip gloss','lipliner','lip liner','lip balm','lip oil','唇膏','口红','唇釉','唇彩','唇线']))return 'lip';
  if(has(['blush','胭脂','腮红']))return 'blush';
  if(has(['bronzer','bronzing','古铜']))return 'bronzer';
  if(has(['contour','sculpt','修容','阴影']))return 'contour';
  if(has(['eyeshadow','eye shadow','眼影']))return 'eyeshadow';
  if(has(['eyeliner','eye pencil','kajal','kohl','眼线']))return 'eyeliner';
  if(has(['brow','eyebrow','眉']))return 'brow';
  if(has(['primer','妆前']))return 'primer';
  if(has(['foundation','bb cream','cc cream','cushion','粉底','底妆']))return 'base';
  if(has(['concealer','corrector','遮瑕','修色']))return 'concealer';
  if(has(['setting powder','loose powder','face powder','compact powder','散粉','定妆粉','粉饼']))return 'powder';
  if(has(['setting spray','fix+','定妆喷雾']))return 'setting-spray';
  if(has(['face palette','面部盘']))return 'face-palette';
  if(has(['highlighter','highlighting powder','高光','提亮']))return 'highlighter';
  if(has(['skincare','serum','moisturizer','护肤']))return 'skincare';
  return 'other';
}
function recAdd(arr,text){if(text&&!arr.includes(text))arr.push(text);}
function recFeedbackSignal(p){
  const raw=norm(p?.myResult||''); if(!raw)return {delta:0,kind:'none',reason:''};
  const negative=['不显气色','太浅','不适合','显黄','发橘','发橙','太橙','太黄','wash me out','washes me out','too pale','not flattering'];
  const positiveStrong=['很适合','非常适合','特别适合','很显气色','very flattering','perfect for me','很合适'];
  const positive=['适合我','显气色','好看','flattering','works for me'];
  if(recHas(raw,negative))return {delta:-34,kind:'negative',reason:`你的实际反馈优先：${p.myResult}`};
  if(recHas(raw,positiveStrong))return {delta:34,kind:'strong-positive',reason:`你的实际反馈优先：${p.myResult}`};
  if(recHas(raw,positive))return {delta:22,kind:'positive',reason:`你的实际反馈优先：${p.myResult}`};
  return {delta:0,kind:'noted',reason:`已记录你的实际反馈：${p.myResult}`};
}
function recManualFitSignal(p){
  const t=norm(p?.fit||'');if(!t)return 0;
  if(recHas(t,['不适合','低优先级','谨慎']))return -10;
  if(recHas(t,['很适合','非常适合']))return 12;
  if(recHas(t,['适合']))return 7;
  return 0;
}
function personalRecommendation(p,profile=skinProfile){
  const pr=normalizeSkinProfile(profile||{}),cat=recCategory(p),text=recDescriptorText(p),attrs=p?.attributes||{};
  const positives=[],cautions=[],tips=[];let score=58,evidence=0,override='';
  const feedback=recFeedbackSignal(p); if(feedback.kind!=='none'){score+=feedback.delta;evidence+=3;recAdd(feedback.delta<0?cautions:positives,feedback.reason);if(feedback.kind==='negative'||feedback.kind.includes('positive'))override=feedback.kind;}
  const fitDelta=recManualFitSignal(p); if(fitDelta){score+=fitDelta;evidence++;recAdd(fitDelta>0?positives:cautions,`已有适配记录：${p.fit}`);}
  const attrValues=Object.values(attrs).filter(Boolean); evidence+=Math.min(4,attrValues.length*.45);
  const profileComplete=skinProfileCompleteness(pr); evidence+=profileComplete/40;
  if(p.status==='停止使用'){score=3;recAdd(cautions,'产品状态已标记为“停止使用”，不应因颜色适配而继续使用。');recAdd(tips,'保留作收藏或停止上脸使用。');}
  else if(attentionInfo(p).level==='bad'){score-=18;recAdd(cautions,`安全/寿命状态：${attentionInfo(p).label}`);}
  else if(attentionInfo(p).level==='warn'){score-=3;recAdd(cautions,`寿命信息需要先确认：${attentionInfo(p).label}`);}

  const muted=pr.saturation==='muted',olive=['subtle','moderate','strong'].includes(pr.oliveLevel),combo=pr.skinType==='combination',tOily=['oily','very_oily'].includes(pr.zones?.tZone),cheekDry=['dry','slightly_dry'].includes(pr.zones?.cheeks),pores=pr.concerns?.includes('visible_pores'),redness=pr.concerns?.includes('redness'),sensitiveEye=['moderate','high'].includes(pr.eye?.eyeSensitivity),oilyLid=['oily','very_oily'].includes(pr.eye?.eyelidOiliness),hooded=['hooded','inner_double_hooded','inner_double'].includes(pr.eye?.eyelidType);
  const lowSat=recHas(norm(attrs.saturation||''),['low']),highSat=recHas(norm(attrs.saturation||''),['high']),warm=recHas(norm(attrs.undertone||''),['warm']),cool=recHas(norm(attrs.undertone||''),['cool']);
  if(muted){if(lowSat){score+=8;evidence++;recAdd(positives,'低饱和度与 muted 肤色更协调。');}else if(highSat){score-=6;evidence++;recAdd(cautions,'高饱和度在 muted 肤色上存在感会更强，建议控制面积或用量。');}}
  if(olive){
    const oliveFriendly=['mauve','plum','berry','wine','burgundy','rosewood','dusty rose','smoky rose','taupe','greige','olive','khaki','灰紫','梅子','莓','酒红','玫瑰木','灰棕','橄榄'];
    const orangeHeavy=['orange','tangerine','peach orange','coral orange','橙','橘','桃橙'];
    if(recHas(text,oliveFriendly)){score+=8;evidence++;recAdd(positives,'颜色属于 olive 肤色通常较友好的低饱和玫瑰 / 灰棕 / 梅子 / 橄榄方向。');}
    if(['lip','blush'].includes(cat)&&recHas(text,orangeHeavy)){score-=7;evidence++;recAdd(cautions,'偏橙暖色在 olive 肤色上可能放大黄橙感。');recAdd(tips,'与 mauve / 灰玫瑰腮红或中性眼妆搭配，减少其他暖色叠加。');}
  }
  if(['lip','blush'].includes(cat)){
    if(recHas(text,['rosewood','mauve','berry','wine','smoky rose','dusty rose','pinkish brown','greige','玫瑰木','灰粉','莓果','酒红'])){score+=6;recAdd(positives,'色相与低饱和 neutral-olive 通常协调。');}
    if(warm&&highSat){score-=4;recAdd(cautions,'暖调且高饱和，建议把它作为妆面重点而不是再叠多个暖色。');}
  }
  if(cat==='highlighter'){
    if(recHas(text,['pink','rose','champagne','neutral','粉','香槟'])){score+=5;recAdd(positives,'粉色/中性香槟高光通常比纯黄金色更适合 olive 底色。');}
    if(pores&&recHas(text,['glow','shimmer','metallic','dewy','luminous','珠光','高光'])){score-=2;recAdd(cautions,'毛孔明显时，强光泽会放大皮肤纹理。');recAdd(tips,'只放在颧骨最高点靠外，避开鼻翼与苹果肌毛孔中心。');}
  }
  if(cat==='bronzer'){
    recAdd(tips,'把它作为 bronzer 用在发际线、太阳穴和脸外围，不替代冷灰阴影修容。');
    if(warm){score+=1;recAdd(positives,'暖棕作为 bronzer 本身是合理的，关键是控制位置与用量。');}
  }
  if(cat==='contour'&&warm){score-=6;recAdd(cautions,'偏暖的修容更像 bronzer，不适合作为冷灰阴影或重手鼻影。');recAdd(tips,'放在颧骨外围/发际线，鼻影尽量选更中性偏灰的颜色。');}
  if(['primer','base','powder','concealer','setting-spray'].includes(cat)){
    if(combo||tOily||cheekDry){recAdd(positives,'你的肤质存在明显区域差异，分区使用比全脸同一强度更合适。');}
    if(tOily&&recHas(text,['matte','oil free','oil-free','pore','smoothing','setting powder','no sebum','控油','毛孔'])){score+=6;recAdd(positives,'控油/柔焦属性适合 T 区。');}
    if(cheekDry&&recHas(text,['hydrating','dewy','glow','luminous','保湿','水光'])){score+=4;recAdd(positives,'保湿/光泽属性更适合两颊偏干区域。');}
    if(tOily&&recHas(text,['dewy','glow','luminous','水光','高光泽'])){recAdd(cautions,'T 区偏油时不建议在鼻部/眉心厚涂高光泽底妆。');recAdd(tips,'两颊正常使用，T 区减量并局部定妆。');}
    if(cheekDry&&cat==='powder'){recAdd(cautions,'两颊偏干时散粉/粉饼过量容易显干。');recAdd(tips,'重点定妆 T 区，两颊只用刷具余粉。');}
    if(redness&&cat==='concealer'&&recHas(text,['green','绿色'])){score+=5;recAdd(positives,'绿色修色可用于局部泛红。');}
  }
  if(['eyeshadow','eyeliner'].includes(cat)){
    if(olive&&recHas(text,['taupe','mauve','olive','khaki','grey','gray','plum','burgundy','灰棕','灰紫','橄榄','梅子'])){score+=7;recAdd(positives,'taupe / mauve / olive / plum 等方向与 olive 肤色和低饱和妆感匹配。');}
    if(hooded&&recHas(text,['orange','copper','gold','metallic','shimmer','glitter','橙','铜','金','亮片'])){recAdd(tips,'内双/hooded 建议把高亮或暖色限制在眼皮中央、眼尾或睫毛根部。');}
    if(oilyLid){recAdd(tips,'眼皮偏油：先薄涂眼部打底，再少量叠色，可减少积线。');if(recHas(text,['cream','stick','liquid','膏','液体'])){score-=2;recAdd(cautions,'膏/液体眼影在偏油眼皮上更依赖打底和少量定妆。');}}
    if(sensitiveEye&&recHas(text,['glitter','sparkle','亮片'])){score-=4;recAdd(cautions,'眼睛敏感时，大颗亮片/飞粉需要更谨慎，避免靠近水线。');}
  }
  if(cat==='brow'){if(recHas(text,['ash','grey','neutral','灰','中性'])){score+=4;recAdd(positives,'偏灰/中性眉色通常比红棕更自然。');}}
  if(cat==='face-palette'){recAdd(tips,'综合盘按单个色块选择，不要因为“整盘”适合就每一格都同时使用。');}
  if(pr.makeup?.baseFinish&&['primer','base','powder'].includes(cat)){
    const pref=pr.makeup.baseFinish;if(pref==='matte'&&recHas(text,['matte'])){score+=4;recAdd(positives,'妆效符合你记录的 Matte 偏好。');}if(pref==='dewy'&&recHas(text,['dewy','glow','luminous'])){score+=4;recAdd(positives,'妆效符合你记录的 Dewy 偏好。');}
  }
  if(p.role)recAdd(tips,`你已有用法记录：${p.role}`);
  // Explicit real-world feedback is the strongest suitability signal. Safety status still wins over colour/texture preference.
  if(feedback.kind==='strong-positive')score=Math.max(score,90);
  else if(feedback.kind==='positive')score=Math.max(score,80);
  else if(feedback.kind==='negative')score=Math.min(score,32);
  const finalAttention=attentionInfo(p);
  if(finalAttention.level==='bad')score=Math.min(score,35);
  if(p.status==='停止使用')score=3;
  score=Math.max(0,Math.min(100,Math.round(score)));
  let tier='unknown';if(evidence<1.5&&!p.myResult&&!p.fit)tier='unknown';else if(score>=84)tier='excellent';else if(score>=70)tier='good';else if(score>=54)tier='conditional';else if(score>=38)tier='caution';else tier='low';
  const confidence=Math.max(20,Math.min(100,Math.round(20+profileComplete*.45+Math.min(22,attrValues.length*4)+(p.myResult?18:0)+(p.fit?8:0))));
  if(!positives.length&&!cautions.length&&tier!=='unknown')recAdd(positives,'目前没有明显冲突；建议结合实际上脸结果继续校正。');
  if(!tips.length)recAdd(tips,'先少量使用并记录实际上脸效果，后续推荐会优先采用你的反馈。');
  return {score,tier,label:RECOMMENDATION_LABELS[tier].label,className:RECOMMENDATION_LABELS[tier].className,confidence,category:cat,positives,cautions,tips,override,profileCompleteness:profileComplete};
}
function recommendationCardHTML(p){
  const r=personalRecommendation(p),positive=r.positives.slice(0,3).map(x=>`<li>${esc(x)}</li>`).join(''),caution=r.cautions.slice(0,3).map(x=>`<li>${esc(x)}</li>`).join(''),tips=r.tips.slice(0,3).map(x=>`<li>${esc(x)}</li>`).join('');
  return `<div class="card personal-match-card"><div class="personal-match-head"><div><b>Personal Match · 自动适配</b><span>基于 My Skin + 产品属性 + 你的实际上脸反馈</span></div><span class="match-badge ${r.className}">${esc(r.label)}${r.tier==='unknown'?'':` · ${r.score}`}</span></div><div class="match-confidence">依据充分度 ${r.confidence}%${r.override?' · 已优先采用你的实际反馈':''}</div>${positive?`<div class="match-section good"><b>为什么</b><ul>${positive}</ul></div>`:''}${caution?`<div class="match-section caution"><b>注意</b><ul>${caution}</ul></div>`:''}${tips?`<div class="match-section tips"><b>怎么用</b><ul>${tips}</ul></div>`:''}<p class="note">自动分析不会覆盖你手工填写的“适配 / 我的实测 / 怎么用”。</p></div>`;
}
function recCategoryLabel(cat){return ({lip:'唇部',blush:'腮红',highlighter:'高光',bronzer:'Bronzer',contour:'修容',eyeshadow:'眼影',eyeliner:'眼线',brow:'眉部',primer:'妆前',base:'底妆',concealer:'遮瑕/修色',powder:'定妆','setting-spray':'定妆喷雾','face-palette':'面部综合盘',skincare:'护肤',other:'其他'})[cat]||cat;}
function renderPersonalRecommendations(){
  const root=$('#personalRecommendationSummary');if(!root)return;
  if(!products.length){root.innerHTML='<div class="empty-state">录入产品后，这里会根据 My Skin 自动生成适配分析。</div>';return;}
  const completeness=skinProfileCompleteness(normalizeSkinProfile(skinProfile||{}));if(completeness<20){root.innerHTML='<div class="empty-state"><b>先完善 My Skin</b><p>至少记录肤色/undertone/olive 或肤质中的几项，推荐才有意义。</p></div>';return;}
  const rows=products.map(p=>({p,r:personalRecommendation(p)})),counts={excellent:0,good:0,conditional:0,caution:0,low:0,unknown:0};rows.forEach(x=>counts[x.r.tier]++);
  const top=rows.filter(x=>!['unknown','low'].includes(x.r.tier)&&x.p.status!=='停止使用').sort((a,b)=>b.r.score-a.r.score).slice(0,6);
  const caution=rows.filter(x=>['caution','low'].includes(x.r.tier)).sort((a,b)=>a.r.score-b.r.score).slice(0,4);
  const card=x=>`<button type="button" class="rec-product" data-rec-product="${esc(x.p.id)}"><span class="rec-product-main"><b>${esc(x.p.brand?`${x.p.brand} · `:'')}${esc(x.p.name)}</b><small>${esc(x.p.shade||'')} · ${esc(recCategoryLabel(x.r.category))}</small></span><span class="match-badge ${x.r.className}">${esc(x.r.label)}${x.r.tier==='unknown'?'':` ${x.r.score}`}</span><span class="rec-product-reason">${esc(x.r.positives[0]||x.r.cautions[0]||'需要更多实际反馈')}</span></button>`;
  root.innerHTML=`<div class="match-stats"><div><b>${counts.excellent}</b><span>很适合</span></div><div><b>${counts.good}</b><span>适合</span></div><div><b>${counts.conditional}</b><span>有条件</span></div><div><b>${counts.caution+counts.low}</b><span>需谨慎</span></div></div><div class="recommendation-columns"><div><h4>更值得优先使用</h4><div class="rec-list">${top.length?top.map(card).join(''):'<p class="note">暂无足够信息。</p>'}</div></div><div><h4>需要注意</h4><div class="rec-list">${caution.length?caution.map(card).join(''):'<p class="note">目前没有明显低适配产品。</p>'}</div></div></div>`;
}
function openRecommendationExplorer(filter='all'){
  const all=products.map(p=>({p,r:personalRecommendation(p)})).filter(x=>filter==='all'||x.r.category===filter).sort((a,b)=>b.r.score-a.r.score||a.p.name.localeCompare(b.p.name));
  const filters=[['all','全部'],['lip','唇部'],['blush','腮红'],['eyeshadow','眼影'],['base','底妆'],['primer','妆前'],['powder','定妆'],['highlighter','高光'],['bronzer','Bronzer'],['contour','修容']];
  openModal(`<h2>全部适配分析</h2><p class="note">本地实时计算，不修改你的产品档案。你的 myResult 会优先于理论颜色规则。</p><div class="rec-filter-bar">${filters.map(([v,l])=>`<button type="button" class="secondary ${filter===v?'active':''}" data-rec-filter="${v}">${l}</button>`).join('')}</div><div class="rec-explorer">${all.map(x=>`<button type="button" class="rec-explorer-row" data-rec-product="${esc(x.p.id)}"><div><b>${esc(x.p.brand?`${x.p.brand} · `:'')}${esc(x.p.name)}</b><span>${esc(x.p.shade||'')} · ${esc(recCategoryLabel(x.r.category))}</span></div><span class="match-badge ${x.r.className}">${esc(x.r.label)}${x.r.tier==='unknown'?'':` · ${x.r.score}`}</span><small>${esc(x.r.positives[0]||x.r.cautions[0]||'信息不足')}</small></button>`).join('')||'<div class="empty-state">这个分类里还没有产品。</div>'}</div>`);
}

function optionHTML(value,label,current){return `<option value="${esc(value)}" ${current===value?'selected':''}>${esc(label)}</option>`;}
function selectOptions(map,current,emptyLabel='请选择'){return `<option value="">${esc(emptyLabel)}</option>`+Object.entries(map).map(([v,l])=>optionHTML(v,l,current)).join('');}
function openSkinProfileForm(){
  const p=normalizeSkinProfile(skinProfile||{});
  const concernBoxes=Object.entries(SKIN_CONCERN_LABELS).map(([value,label])=>`<label class="profile-check"><input type="checkbox" name="concerns" value="${esc(value)}" ${p.concerns.includes(value)?'checked':''}><span>${esc(label)}</span></label>`).join('');
  openModal(`<h2>编辑 My Skin</h2><p class="note">记录长期稳定的 baseline。短期肤况（今天偏干、今天爆痘等）以后在 Today 中单独覆盖。</p><form id="skinProfileForm">
    <div class="profile-form-section"><h3>肤色 / Undertone</h3>
      <label>肤色深浅</label><select name="depth">${selectOptions(SKIN_VALUE_LABELS.depth,p.depth)}</select>
      <label>基础 Undertone</label><select name="undertone">${selectOptions(SKIN_VALUE_LABELS.undertone,p.undertone)}</select>
      <label>Olive 程度</label><select name="oliveLevel">${selectOptions(SKIN_VALUE_LABELS.oliveLevel,p.oliveLevel)}</select>
      <label>整体饱和度</label><select name="saturation">${selectOptions(SKIN_VALUE_LABELS.saturation,p.saturation)}</select>
    </div>
    <div class="profile-form-section"><h3>肤质与区域差异</h3>
      <label>基础肤质</label><select name="skinType">${selectOptions(SKIN_VALUE_LABELS.skinType,p.skinType)}</select>
      <div class="profile-form-grid"><div><label>T 区</label><select name="tZone">${selectOptions(SKIN_VALUE_LABELS.zone,p.zones.tZone)}</select></div><div><label>两颊</label><select name="cheeks">${selectOptions(SKIN_VALUE_LABELS.zone,p.zones.cheeks)}</select></div><div><label>下巴</label><select name="chin">${selectOptions(SKIN_VALUE_LABELS.zone,p.zones.chin)}</select></div><div><label>眼下</label><select name="underEye">${selectOptions(SKIN_VALUE_LABELS.zone,p.zones.underEye)}</select></div></div>
      <label>面部敏感度</label><select name="sensitivity">${selectOptions(SKIN_VALUE_LABELS.sensitivity,p.sensitivity)}</select>
    </div>
    <div class="profile-form-section"><h3>长期关注点</h3><div class="profile-check-grid">${concernBoxes}</div></div>
    <div class="profile-form-section"><h3>眼部特征</h3>
      <label>眼皮类型</label><select name="eyelidType">${selectOptions(SKIN_VALUE_LABELS.eyelidType,p.eye.eyelidType)}</select>
      <label>眼皮出油</label><select name="eyelidOiliness">${selectOptions(SKIN_VALUE_LABELS.zone,p.eye.eyelidOiliness)}</select>
      <label>眼部敏感度</label><select name="eyeSensitivity">${selectOptions(SKIN_VALUE_LABELS.sensitivity,p.eye.eyeSensitivity)}</select>
    </div>
    <div class="profile-form-section"><h3>底妆偏好（可选）</h3>
      <label>喜欢的妆效</label><select name="baseFinish">${selectOptions(SKIN_VALUE_LABELS.baseFinish,p.makeup.baseFinish)}</select>
      <label>常用遮盖度</label><select name="coverage">${selectOptions(SKIN_VALUE_LABELS.coverage,p.makeup.coverage)}</select>
    </div>
    <label>备注</label><textarea name="notes" placeholder="例如：某些官方色名在我脸上会偏橙；优先相信实际上脸结果。">${esc(p.notes)}</textarea>
    <button class="full" type="submit">保存到本机</button>
  </form>`);
}
async function handleSkinProfileSubmit(form){const fd=new FormData(form);await saveSkinProfile({version:1,depth:fd.get('depth'),undertone:fd.get('undertone'),oliveLevel:fd.get('oliveLevel'),saturation:fd.get('saturation'),skinType:fd.get('skinType'),zones:{tZone:fd.get('tZone'),cheeks:fd.get('cheeks'),chin:fd.get('chin'),underEye:fd.get('underEye')},sensitivity:fd.get('sensitivity'),concerns:fd.getAll('concerns'),eye:{eyelidType:fd.get('eyelidType'),eyelidOiliness:fd.get('eyelidOiliness'),eyeSensitivity:fd.get('eyeSensitivity')},makeup:{baseFinish:fd.get('baseFinish'),coverage:fd.get('coverage')},notes:String(fd.get('notes')||'').trim()});closeModal();toast('My Skin 已保存在本机');}
async function importSkinProfileFile(file){try{const raw=JSON.parse(await file.text());if(raw?.format!=='beauty-cabinet-skin-profile'||raw?.version!==1||!raw.profile)throw new Error('invalid profile');await saveSkinProfile(raw.profile);toast('My Skin 档案已导入');}catch(e){console.error(e);alert('无法导入这份 Profile JSON。请确认文件来自 Beauty Cabinet My Skin。');}}
async function resetSkinProfile(){if(!confirm('清空这台设备上的 My Skin 档案？产品库存不会受影响。'))return;skinProfile=emptySkinProfile();await idbDelete('settings','skinProfile');renderSkinProfile();renderPersonalRecommendations();toast('My Skin 档案已清空');}

let db = null;
let products = [];
let scanSessions = [];
let activeScanId = '';
let imageUrls = new Map();
let quickFindTextIndex = [];
let quickFindState = {mode:'idle',query:'',results:[],selectedId:'',status:'',progress:0};
let quickFindPhotoUrl = '';
let quickFindVisualCache = new Map();
let quickFindInputTimer = 0;
let quickFindPhotoFile = null;
let quickFindPhotoImage = null;
let quickFindCropRect = {x:0,y:0,width:100,height:100};
let quickFindCropDrag = null;
let skinProfile = null;

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
  rebuildQuickFindTextIndex();
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
  let quickFindFeature=null;
  try{quickFindFeature=await quickFindFeatureFromBlob(img.blob);}catch(e){console.warn('quick find feature skipped',e);}
  await idbPut('images', {id,productId,data,mime:img.mime,width:img.width,height:img.height,source,quickFindFeature,updatedAt:new Date().toISOString()});
  if(quickFindFeature)quickFindVisualCache.set(id,quickFindFeature);
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
function rectIoU(a,b){
  const x1=Math.max(a.x1,b.x1),y1=Math.max(a.y1,b.y1),x2=Math.min(a.x2,b.x2),y2=Math.min(a.y2,b.y2),iw=Math.max(0,x2-x1),ih=Math.max(0,y2-y1),inter=iw*ih;
  if(!inter)return 0;const aa=(a.x2-a.x1)*(a.y2-a.y1),ba=(b.x2-b.x1)*(b.y2-b.y1);return inter/Math.max(1,aa+ba-inter);
}
function rectContainment(inner,outer){
  const x1=Math.max(inner.x1,outer.x1),y1=Math.max(inner.y1,outer.y1),x2=Math.min(inner.x2,outer.x2),y2=Math.min(inner.y2,outer.y2),inter=Math.max(0,x2-x1)*Math.max(0,y2-y1),area=Math.max(1,(inner.x2-inner.x1)*(inner.y2-inner.y1));return inter/area;
}
function medianNumber(values){if(!values.length)return 0;const a=[...values].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
async function proposeRegions(imageId){
  const rec=await storedImageRecord(imageId),img=await blobToImage(new Blob([rec.data],{type:rec.mime||'image/jpeg'}));
  const scale=Math.min(1,640/img.naturalWidth,520/img.naturalHeight),w=Math.max(96,Math.round(img.naturalWidth*scale)),h=Math.max(96,Math.round(img.naturalHeight*scale)),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);const px=ctx.getImageData(0,0,w,h).data;
  const border=[],stride=Math.max(2,Math.round(Math.min(w,h)/120));
  const pushPixel=(x,y)=>{const i=(y*w+x)*4;border.push([px[i],px[i+1],px[i+2]]);};
  for(let x=0;x<w;x+=stride){pushPixel(x,0);pushPixel(x,h-1);}for(let y=stride;y<h-stride;y+=stride){pushPixel(0,y);pushPixel(w-1,y);}
  const bg=[0,1,2].map(k=>medianNumber(border.map(c=>c[k]))),borderDist=border.map(c=>Math.abs(c[0]-bg[0])+Math.abs(c[1]-bg[1])+Math.abs(c[2]-bg[2])),noise=medianNumber(borderDist),baseThreshold=Math.max(42,Math.min(150,noise*3.2+34));
  const cell=Math.max(3,Math.min(8,Math.round(Math.min(w,h)/105))),cols=Math.ceil(w/cell),rows=Math.ceil(h/cell);
  const buildMask=(ratioThreshold=0.12,colorFactor=1)=>{
    const mask=new Uint8Array(cols*rows);const threshold=baseThreshold*colorFactor;
    for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++){
      let active=0,total=0,edgeHits=0;const x0=gx*cell,y0=gy*cell;
      for(let y=y0;y<Math.min(h,y0+cell);y++)for(let x=x0;x<Math.min(w,x0+cell);x++){
        const i=(y*w+x)*4,d=Math.abs(px[i]-bg[0])+Math.abs(px[i+1]-bg[1])+Math.abs(px[i+2]-bg[2]);
        let edge=0;if(x+1<w){const j=i+4;edge+=Math.abs(px[i]-px[j])+Math.abs(px[i+1]-px[j+1])+Math.abs(px[i+2]-px[j+2]);}if(y+1<h){const j=i+w*4;edge+=Math.abs(px[i]-px[j])+Math.abs(px[i+1]-px[j+1])+Math.abs(px[i+2]-px[j+2]);}
        if(d>threshold||(d>threshold*.5&&edge>115))active++;if(edge>160)edgeHits++;total++;
      }
      if(active/Math.max(1,total)>ratioThreshold||edgeHits/Math.max(1,total)>.42)mask[gy*cols+gx]=1;
    }
    // Remove isolated noise without dilating across the gaps between products.
    const clean=mask.slice();for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++)if(mask[gy*cols+gx]){let n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=gx+dx,ny=gy+dy;if(nx>=0&&nx<cols&&ny>=0&&ny<rows&&mask[ny*cols+nx])n++;}if(n<=1)clean[gy*cols+gx]=0;}
    // Fill small internal holes only; do not perform a blanket dilation.
    const filled=clean.slice();for(let gy=1;gy<rows-1;gy++)for(let gx=1;gx<cols-1;gx++)if(!clean[gy*cols+gx]){let n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy)n+=clean[(gy+dy)*cols+gx+dx];if(n>=6)filled[gy*cols+gx]=1;}
    return filled;
  };
  const maskCount=(mask,box)=>{let n=0;for(let y=box.y1;y<box.y2;y++)for(let x=box.x1;x<box.x2;x++)n+=mask[y*cols+x];return n;};
  const trim=(mask,box)=>{let x1=box.x2,y1=box.y2,x2=box.x1,y2=box.y1,found=false;for(let y=box.y1;y<box.y2;y++)for(let x=box.x1;x<box.x2;x++)if(mask[y*cols+x]){found=true;x1=Math.min(x1,x);y1=Math.min(y1,y);x2=Math.max(x2,x+1);y2=Math.max(y2,y+1);}return found?{x1,y1,x2,y2}:null;};
  const splitCandidate=(mask,box,axis,aggressive)=>{
    const span=axis==='x'?box.x2-box.x1:box.y2-box.y1,cross=axis==='x'?box.y2-box.y1:box.x2-box.x1;if(span<7||cross<3)return null;const vals=[];
    for(let i=0;i<span;i++){let n=0;if(axis==='x'){const x=box.x1+i;for(let y=box.y1;y<box.y2;y++)n+=mask[y*cols+x];}else{const y=box.y1+i;for(let x=box.x1;x<box.x2;x++)n+=mask[y*cols+x];}vals.push(n);}
    const occupied=vals.filter(v=>v>0),avg=occupied.length?occupied.reduce((a,b)=>a+b,0)/occupied.length:0;if(!avg)return null;const edge=Math.max(2,Math.floor(span*.12)),limit=avg*(aggressive?.38:.24);let best=null,runStart=-1;
    const consider=(a,b)=>{if(a<edge||b>span-edge)return;const len=b-a;if(len<1)return;const mean=vals.slice(a,b).reduce((s,v)=>s+v,0)/len,score=(1-mean/Math.max(1,avg))*Math.min(3,len);if(!best||score>best.score)best={a,b,score,mean};};
    for(let i=0;i<span;i++){if(vals[i]<=limit){if(runStart<0)runStart=i;}else if(runStart>=0){consider(runStart,i);runStart=-1;}}if(runStart>=0)consider(runStart,span);
    if(!best&&aggressive){let min=Infinity,idx=-1;for(let i=edge;i<span-edge;i++){if(vals[i]<min){min=vals[i];idx=i;}}if(idx>=0&&min<avg*.5)best={a:idx,b:idx+1,score:1-min/avg,mean:min};}
    if(!best||best.score<(aggressive?.42:.7))return null;const cut=Math.floor((best.a+best.b)/2);if(cut<edge||span-cut<edge)return null;return axis==='x'?{a:{...box,x2:box.x1+cut},b:{...box,x1:box.x1+cut},score:best.score}:{a:{...box,y2:box.y1+cut},b:{...box,y1:box.y1+cut},score:best.score};
  };
  const partition=(mask,box,depth=0,aggressive=false)=>{
    const t=trim(mask,box);if(!t)return[];const fw=t.x2-t.x1,fh=t.y2-t.y1,fg=maskCount(mask,t),area=fw*fh;if(fw<2||fh<2||fg<2)return[];
    if(depth<5&&area>18){const options=[splitCandidate(mask,t,'x',aggressive),splitCandidate(mask,t,'y',aggressive)].filter(Boolean).sort((a,b)=>b.score-a.score);if(options.length){const sp=options[0],left=trim(mask,sp.a),right=trim(mask,sp.b);if(left&&right){const lf=maskCount(mask,left),rf=maskCount(mask,right);if(lf>=2&&rf>=2)return[...partition(mask,left,depth+1,aggressive),...partition(mask,right,depth+1,aggressive)];}}}
    return[{...t,fg,fill:fg/area}];
  };
  const connected=(mask,aggressive=false)=>{
    const seen=new Uint8Array(mask.length),out=[];for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++){const start=gy*cols+gx;if(!mask[start]||seen[start])continue;const q=[start];seen[start]=1;let qi=0,minX=gx,maxX=gx,minY=gy,maxY=gy,cells=0;while(qi<q.length){const pos=q[qi++],cx=pos%cols,cy=Math.floor(pos/cols);cells++;minX=Math.min(minX,cx);maxX=Math.max(maxX,cx);minY=Math.min(minY,cy);maxY=Math.max(maxY,cy);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=cx+dx,ny=cy+dy;if(nx<0||nx>=cols||ny<0||ny>=rows)continue;const ni=ny*cols+nx;if(mask[ni]&&!seen[ni]){seen[ni]=1;q.push(ni);}}}const box={x1:minX,y1:minY,x2:maxX+1,y2:maxY+1};if(cells>=2)out.push(...partition(mask,box,0,aggressive));}return out;
  };
  const finalize=(mask,aggressive=false)=>{
    const boxes=connected(mask,aggressive),global=partition(mask,{x1:0,y1:0,x2:cols,y2:rows},0,aggressive);for(const b of global)boxes.push(b);
    const normalized=boxes.map(b=>{const x1=b.x1*cell,y1=b.y1*cell,x2=Math.min(w,b.x2*cell),y2=Math.min(h,b.y2*cell),boxArea=(x2-x1)*(y2-y1),fg=b.fg??maskCount(mask,b),fill=b.fill??fg/Math.max(1,(b.x2-b.x1)*(b.y2-b.y1));return{x1,y1,x2,y2,boxArea,fill};}).filter(b=>b.x2-b.x1>=w*.025&&b.y2-b.y1>=h*.035&&b.boxArea>=w*h*.0018&&b.boxArea<=w*h*.82);
    normalized.sort((a,b)=>a.boxArea-b.boxArea);const kept=[];for(const box of normalized){if(kept.some(k=>rectIoU(box,k)>.62||rectContainment(box,k)>.88))continue;kept.push(box);}const withoutContainers=kept.filter(box=>!kept.some(other=>other!==box&&other.boxArea<box.boxArea*.6&&rectContainment(other,box)>.92));
    return withoutContainers.sort((a,b)=>Math.abs(a.y1-b.y1)>h*.1?a.y1-b.y1:a.x1-b.x1).slice(0,30);
  };
  const standardMask=buildMask(.12,1),standard=finalize(standardMask,false);let selected=standard;
  if(standard.length<=2){const aggressiveMask=buildMask(.075,.82),aggressive=finalize(aggressiveMask,true);if(aggressive.length>standard.length&&aggressive.length<=24)selected=aggressive;}
  if(!selected.length)return[{crop:{x:0,y:0,width:100,height:100},detectionConfidence:.16,needsAdjustment:true,detector:'fallback-whole-image'}];
  return selected.map(c=>{const padX=Math.max(2,(c.x2-c.x1)*.045),padY=Math.max(2,(c.y2-c.y1)*.045),areaScore=Math.min(1,c.boxArea/(w*h*.055)),separationScore=Math.min(1,selected.length/8),confidence=Math.min(.93,.38+c.fill*.22+areaScore*.2+separationScore*.12);return{crop:safeCrop({x:(c.x1-padX)/w*100,y:(c.y1-padY)/h*100,width:(c.x2-c.x1+2*padX)/w*100,height:(c.y2-c.y1+2*padY)/h*100}),detectionConfidence:confidence,needsAdjustment:confidence<.5,detector:selected===standard?'adaptive-local':'adaptive-local-aggressive'};});
}
async function createRegions(sessionId,imageId,role){
  const proposals=await proposeRegions(imageId),regions=[];let index=0;
  for(const proposal of proposals){const crop=proposal.crop,evidence=await analyzeStoredRegion(imageId,crop),cropImageId=await storeCropImage(sessionId,imageId,crop);regions.push({id:uuid(),label:String.fromCharCode(65+index++),sourceImageId:imageId,role,crop,cropImageId,evidence,detectionConfidence:proposal.detectionConfidence,needsAdjustment:proposal.needsAdjustment,detector:proposal.detector||'local',centerX:crop.x+crop.width/2,centerY:crop.y+crop.height/2});}
  return regions;
}
function colorDistance(a,b){const ar=a?.rgb||[0,0,0],br=b?.rgb||[0,0,0];return Math.sqrt(ar.reduce((s,v,i)=>s+(v-br[i])**2,0))/442;}
function proposePairings(frontRegions=[],backRegions=[]){
  const available=new Set(backRegions.map(r=>r.id));return frontRegions.map(front=>{let best='',bestCost=Infinity;for(const back of backRegions){if(!available.has(back.id))continue;const pos=(Math.abs(front.centerX-back.centerX)+Math.abs((front.centerY||50)-(back.centerY||50)))/200,aspect=Math.min(1,Math.abs(Math.log((front.evidence.aspectRatio||1)/(back.evidence.aspectRatio||1)))),frontSize=(front.crop.width*front.crop.height)/10000,backSize=(back.crop.width*back.crop.height)/10000,size=Math.min(1,Math.abs(frontSize-backSize)/Math.max(.01,frontSize,backSize)),color=colorDistance(front.evidence,back.evidence),cost=pos*.5+aspect*.2+size*.15+color*.15;if(cost<bestCost){bestCost=cost;best=back.id;}}if(best)available.delete(best);return{frontRegionId:front.id,backRegionId:best,confidence:Math.max(.2,Math.min(.92,1-bestCost))};});
}

function tab(id) {
  $$('main > section').forEach(s=>s.hidden=s.id!==id);
  $$('nav button[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));
  window.scrollTo({top:0,behavior:'auto'});
  if(id==='compare') renderComparePicker();
  if(id==='scan') renderScanShelf();
  if(id==='profile'){renderSkinProfile();renderPersonalRecommendations();}
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
function renderAll(){renderHome();renderProducts();renderExpiry();renderComparePicker();renderScanShelf();renderQuickFindResults();renderSkinProfile();renderPersonalRecommendations();if($('#aiConfigStatus'))$('#aiConfigStatus').textContent=aiProxyEndpoint?'OFF until per-scan consent · secure proxy configured':'OFF · secure proxy not configured';if($('#aiEndpointInput'))$('#aiEndpointInput').value=aiProxyEndpoint||'';}
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


const QUICK_FIND_FIELDS=[
  ['品牌','brand',10],['产品名','name',12],['色号','shade',11],['类别','cat',7],['质地','form',6],
  ['适配','fit',8],['我的实测','myResult',10],['怎么用','role',7],['备注','notes',4],['状态','status',5],
  ['产品线','productLine',5],['包装文字','packagingText',3]
];

const QUICK_FIND_CONCEPTS=[
  {id:'blush',label:'腮红',aliases:['腮红','胭脂','blush','cheek color','cheek colour']},
  {id:'highlighter',label:'高光',aliases:['高光','提亮','highlighter','highlight']},
  {id:'bronzer',label:'古铜',aliases:['古铜','bronzer','bronzing']},
  {id:'contour',label:'修容',aliases:['修容','阴影','contour','sculpt']},
  {id:'eyeshadow',label:'眼影',aliases:['眼影','eyeshadow','eye shadow']},
  {id:'eyeliner',label:'眼线',aliases:['眼线','eyeliner','eye liner','kajal','kohl']},
  {id:'lip',label:'唇部',aliases:['口红','唇膏','唇釉','唇彩','唇线','lipstick','lip gloss','lipcolor','lip colour','lipliner','lip liner','lip']},
  {id:'primer',label:'妆前',aliases:['妆前','primer','base primer']},
  {id:'foundation',label:'粉底',aliases:['粉底','底妆','foundation','bb cream','cc cream','cushion']},
  {id:'concealer',label:'遮瑕',aliases:['遮瑕','concealer','corrector']},
  {id:'powder',label:'定妆粉',aliases:['散粉','定妆粉','粉饼','setting powder','loose powder','pressed powder']},
  {id:'brow',label:'眉部',aliases:['眉笔','眉粉','眉','brow','eyebrow']},
  {id:'skincare',label:'护肤',aliases:['护肤','skincare','serum','moisturizer','cream']},

  {id:'pink',label:'粉色',aliases:['粉色','粉红','pink','rosy','rose pink']},
  {id:'rose',label:'玫瑰',aliases:['玫瑰','玫瑰色','rose','rosewood','rosy brown']},
  {id:'mauve',label:'灰紫/梅子',aliases:['灰紫','梅子','藕粉','mauve','plum','dusty mauve']},
  {id:'red',label:'红色',aliases:['红色','正红','红','red','ruby','carmine']},
  {id:'orange',label:'橙色',aliases:['橙色','橘色','橙','橘','orange','tangerine']},
  {id:'coral',label:'珊瑚',aliases:['珊瑚','coral']},
  {id:'brown',label:'棕色',aliases:['棕色','棕','咖啡色','brown','chocolate','toffee']},
  {id:'taupe',label:'灰棕',aliases:['灰棕','灰褐','taupe','greige']},
  {id:'berry',label:'莓果',aliases:['莓果','莓色','berry']},
  {id:'nude',label:'裸色',aliases:['裸色','裸棕','nude','beige nude']},
  {id:'purple',label:'紫色',aliases:['紫色','紫','purple','violet']},
  {id:'green',label:'绿色',aliases:['绿色','绿','green']},
  {id:'olive',label:'橄榄',aliases:['橄榄','olive','khaki']},
  {id:'blue',label:'蓝色',aliases:['蓝色','蓝','blue','navy']},
  {id:'gold',label:'金色',aliases:['金色','金','gold','golden']},
  {id:'silver',label:'银色',aliases:['银色','银','silver']},
  {id:'grey',label:'灰色',aliases:['灰色','灰','grey','gray']},

  {id:'cream',label:'膏状',aliases:['膏状','霜状','cream','creamy','stick']},
  {id:'powder_texture',label:'粉状',aliases:['粉状','粉质','powder','baked powder']},
  {id:'liquid',label:'液体',aliases:['液体','液态','liquid']},
  {id:'matte',label:'哑光',aliases:['哑光','雾面','matte','velvet matte']},
  {id:'glossy',label:'光泽',aliases:['光泽','亮泽','水光','glossy','glow','dewy','luminous']},
  {id:'shimmer',label:'珠光',aliases:['珠光','闪','亮片','shimmer','sparkle','glitter','pearlescent','metallic']},
  {id:'warm',label:'暖调',aliases:['暖色','暖调','偏暖','warm','warm toned']},
  {id:'cool',label:'冷调',aliases:['冷色','冷调','偏冷','cool','cool toned']},
  {id:'neutral',label:'中性',aliases:['中性','neutral']},
  {id:'suitable',label:'适合我',aliases:['适合我','很适合','适合','显气色','flattering','suitable','works for me']},
  {id:'washout',label:'不显气色',aliases:['不显气色','显白但没气色','太浅','wash me out','washes me out','too pale']},
  {id:'use_soon',label:'需关注',aliases:['快过期','尽快用','优先用','需检查','use soon','expiry','expired']}
];

function quickFindRawText(p={}){
  return [
    p.brand,p.name,p.shade,p.cat,p.form,p.fit,p.myResult,p.role,p.notes,p.status,p.productLine,p.packagingText,
    ...Object.values(p.attributes||{})
  ].filter(Boolean).join(' ');
}
function quickFindConceptIdsFromText(text=''){
  const n=norm(text), out=[];
  for(const c of QUICK_FIND_CONCEPTS){
    if(c.aliases.some(a=>{const x=norm(a);return x&&n.includes(x);})){out.push(c.id);}
  }
  return [...new Set(out)];
}
function quickFindConceptsForProduct(p={}){
  const raw=quickFindRawText(p), ids=new Set(quickFindConceptIdsFromText(raw));
  const cat=norm(`${p.cat||''} ${p.attributes?.function||''}`);
  if(cat.includes('blush'))ids.add('blush');
  if(cat.includes('highlighter')||cat.includes('highlight'))ids.add('highlighter');
  if(cat.includes('bronzer'))ids.add('bronzer');
  if(cat.includes('contour'))ids.add('contour');
  if(cat.includes('eyeshadow'))ids.add('eyeshadow');
  if(cat.includes('eyeliner')||cat.includes('eye pencil'))ids.add('eyeliner');
  if(cat.includes('lip'))ids.add('lip');
  if(cat.includes('primer'))ids.add('primer');
  if(cat.includes('foundation')||cat.includes('bb cream')||cat.includes('cc cream')||cat.includes('cushion'))ids.add('foundation');
  if(cat.includes('concealer')||cat.includes('corrector'))ids.add('concealer');
  if(cat.includes('powder'))ids.add('powder');
  if(cat.includes('brow'))ids.add('brow');
  return ids;
}
function quickFindAttributeText(p={}){return Object.values(p.attributes||{}).filter(Boolean).join(' ');}
function quickFindSynonymText(p={}){
  const ids=quickFindConceptsForProduct(p), out=[];
  for(const id of ids){
    const c=QUICK_FIND_CONCEPTS.find(x=>x.id===id);
    if(c)out.push(c.label,...c.aliases);
  }
  return out.join(' ');
}
function quickFindRecord(p){
  const fields=QUICK_FIND_FIELDS.map(([label,key,weight])=>({label,key,weight,raw:String(p[key]||''),text:norm(p[key]||'')}));
  fields.push({label:'结构化属性',key:'attributes',weight:7,raw:quickFindAttributeText(p),text:norm(quickFindAttributeText(p))});
  fields.push({label:'概念/同义词',key:'synonyms',weight:4,raw:quickFindSynonymText(p),text:norm(quickFindSynonymText(p))});
  const all=fields.map(f=>f.text).filter(Boolean).join(' ');
  return{id:p.id,product:p,fields,all,concepts:quickFindConceptsForProduct(p)};
}
function rebuildQuickFindTextIndex(){quickFindTextIndex=products.map(quickFindRecord);}
function quickFindParseQuery(query=''){
  const raw=String(query||'').trim(),n=norm(raw),concepts=[];
  for(const c of QUICK_FIND_CONCEPTS){
    if(c.aliases.some(a=>{const x=norm(a);return x&&n.includes(x);})){concepts.push(c);}
  }
  let leftover=n;
  const aliases=concepts.flatMap(c=>c.aliases).map(norm).filter(Boolean).sort((a,b)=>b.length-a.length);
  for(const a of aliases)leftover=leftover.split(a).join(' ');
  const stopwords=new Set(['的','我','我要','要','找','查','一个','一款','一些','产品','东西','颜色','色','比较','偏','the','a','an','my','me','find','show']);
  const tokens=leftover.split(' ').filter(t=>t.length>0&&!stopwords.has(t));
  return{raw,n,concepts:[...new Map(concepts.map(c=>[c.id,c])).values()],tokens};
}
function quickFindTextSearch(query,limit=24){
  const parsed=quickFindParseQuery(query);if(!parsed.n)return[];
  const out=[];
  for(const rec of quickFindTextIndex){
    const conceptMiss=parsed.concepts.filter(c=>!rec.concepts.has(c.id));
    if(conceptMiss.length)continue;
    const rawTokens=parsed.tokens;
    if(rawTokens.length&&!rawTokens.every(t=>rec.all.includes(t)))continue;
    let points=30,reasons=[];
    if(parsed.concepts.length){
      points+=Math.min(34,parsed.concepts.length*10);
      for(const c of parsed.concepts)reasons.push({label:'概念匹配',value:c.label,weight:10});
    }
    const q=parsed.n;
    for(const field of rec.fields){
      if(!field.text)continue;let hit=0;
      if(field.text===q)hit=1;else if(field.text.startsWith(q))hit=.9;else if(field.text.includes(q))hit=.78;
      else if(rawTokens.length){const matched=rawTokens.filter(t=>field.text.includes(t)).length;if(matched)hit=.35+.4*(matched/rawTokens.length);}
      if(hit){points+=field.weight*hit;reasons.push({label:field.label,value:field.raw,weight:field.weight*hit});}
    }
    if(norm(rec.product.name)===q||norm(rec.product.shade)===q)points+=18;
    reasons.sort((a,b)=>b.weight-a.weight);
    out.push({product:rec.product,score:Math.min(99,Math.round(points)),reasons:reasons.slice(0,4)});
  }
  return out.sort((a,b)=>b.score-a.score||String(a.product.name).localeCompare(String(b.product.name))).slice(0,limit);
}

function quickFindCanvasImageData(img,size=96){
  const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,size,size);
  return{canvas,ctx,data:ctx.getImageData(0,0,size,size).data,size};
}
function quickFindAutoSubjectBox(img){
  const {data,size}=quickFindCanvasImageData(img,96);
  let br=0,bg=0,bb=0,bn=0;
  const border=8;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    if(x>=border&&x<size-border&&y>=border&&y<size-border)continue;
    const i=(y*size+x)*4;br+=data[i];bg+=data[i+1];bb+=data[i+2];bn++;
  }
  br/=Math.max(1,bn);bg/=Math.max(1,bn);bb/=Math.max(1,bn);
  let minX=size,minY=size,maxX=-1,maxY=-1,count=0;
  for(let y=2;y<size-2;y++)for(let x=2;x<size-2;x++){
    const i=(y*size+x)*4,dr=data[i]-br,dg=data[i+1]-bg,db=data[i+2]-bb;
    const dist=Math.sqrt(dr*dr+dg*dg+db*db);
    if(dist>44){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);count++;}
  }
  const coverage=count/(size*size);
  if(maxX<0||coverage<.06||coverage>.82)return{x:0,y:0,width:100,height:100};
  const pad=6,minXp=Math.max(0,minX-pad),minYp=Math.max(0,minY-pad),maxXp=Math.min(size-1,maxX+pad),maxYp=Math.min(size-1,maxY+pad);
  return{x:100*minXp/size,y:100*minYp/size,width:100*(maxXp-minXp+1)/size,height:100*(maxYp-minYp+1)/size};
}
function quickFindFeatureFromImage(img,crop={x:0,y:0,width:100,height:100}){
  const c=safeCrop(crop),sx=img.naturalWidth*c.x/100,sy=img.naturalHeight*c.y/100,sw=img.naturalWidth*c.width/100,sh=img.naturalHeight*c.height/100;
  const canvas=document.createElement('canvas');canvas.width=48;canvas.height=48;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,sx,sy,sw,sh,0,0,48,48);
  const d=ctx.getImageData(0,0,48,48).data;let r=0,g=0,b=0,n=0;const hist=Array(8).fill(0),gray=[];
  const grid=Array.from({length:16},()=>[0,0,0,0]);
  for(let y=0;y<48;y++)for(let x=0;x<48;x++){
    const i=(y*48+x)*4,rr=d[i],gg=d[i+1],bb=d[i+2],lum=.299*rr+.587*gg+.114*bb;r+=rr;g+=gg;b+=bb;n++;hist[Math.min(7,Math.floor(lum/32))]++;gray.push(lum);
    const gx=Math.min(3,Math.floor(x/12)),gy=Math.min(3,Math.floor(y/12)),cell=grid[gy*4+gx];cell[0]+=rr;cell[1]+=gg;cell[2]+=bb;cell[3]++;
  }
  const total=Math.max(1,n);r/=total;g/=total;b/=total;for(let i=0;i<hist.length;i++)hist[i]/=total;
  const gridVec=[];for(const cell of grid){const div=Math.max(1,cell[3]);gridVec.push(cell[0]/div/255,cell[1]/div/255,cell[2]/div/255);}
  const edge=Array(8).fill(0);let edgeTotal=0;
  const lumAt=(x,y)=>gray[Math.max(0,Math.min(47,y))*48+Math.max(0,Math.min(47,x))];
  for(let y=1;y<47;y++)for(let x=1;x<47;x++){
    const dx=lumAt(x+1,y)-lumAt(x-1,y),dy=lumAt(x,y+1)-lumAt(x,y-1),mag=Math.hypot(dx,dy);if(mag<18)continue;
    let a=Math.atan2(dy,dx);if(a<0)a+=Math.PI*2;const bin=Math.min(7,Math.floor(a/(Math.PI*2)*8));edge[bin]+=mag;edgeTotal+=mag;
  }
  if(edgeTotal)for(let i=0;i<edge.length;i++)edge[i]/=edgeTotal;
  const hashCanvas=document.createElement('canvas');hashCanvas.width=9;hashCanvas.height=8;const hc=hashCanvas.getContext('2d',{willReadFrequently:true});hc.drawImage(img,sx,sy,sw,sh,0,0,9,8);const hd=hc.getImageData(0,0,9,8).data,bits=[];
  const lum=i=>.299*hd[i]+.587*hd[i+1]+.114*hd[i+2];for(let y=0;y<8;y++)for(let x=0;x<8;x++){const i=(y*9+x)*4,j=(y*9+x+1)*4;bits.push(lum(i)>lum(j)?'1':'0');}
  const ah=document.createElement('canvas');ah.width=8;ah.height=8;const ac=ah.getContext('2d',{willReadFrequently:true});ac.drawImage(img,sx,sy,sw,sh,0,0,8,8);const ad=ac.getImageData(0,0,8,8).data,al=[];for(let i=0;i<ad.length;i+=4)al.push(.299*ad[i]+.587*ad[i+1]+.114*ad[i+2]);const am=al.reduce((s,v)=>s+v,0)/al.length,abits=al.map(v=>v>am?'1':'0').join('');
  return{avg:[Math.round(r),Math.round(g),Math.round(b)],hist:hist.map(x=>Number(x.toFixed(4))),hash:bits.join(''),ahash:abits,grid:gridVec.map(x=>Number(x.toFixed(4))),edge:edge.map(x=>Number(x.toFixed(4))),aspect:Number((sw/Math.max(1,sh)).toFixed(3)),crop:c};
}
async function quickFindFeatureFromBlob(blob,crop=null){const img=await blobToImage(blob);return quickFindFeatureFromImage(img,crop||quickFindAutoSubjectBox(img));}
async function storedQuickFindFeature(imageId){
  if(!imageId)return null;if(quickFindVisualCache.has(imageId))return quickFindVisualCache.get(imageId);
  const rec=await idbGet('images',imageId);if(!rec?.data)return null;
  if(rec.quickFindFeature?.grid&&rec.quickFindFeature?.edge&&rec.quickFindFeature?.ahash){quickFindVisualCache.set(imageId,rec.quickFindFeature);return rec.quickFindFeature;}
  const feature=await quickFindFeatureFromBlob(new Blob([rec.data],{type:rec.mime||'image/jpeg'}));rec.quickFindFeature=feature;await idbPut('images',rec);quickFindVisualCache.set(imageId,feature);return feature;
}
function quickFindHamming(a='',b=''){if(!a||!b||a.length!==b.length)return .5;let diff=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])diff++;return 1-diff/a.length;}
function quickFindVectorSimilarity(a=[],b=[]){if(!a.length||a.length!==b.length)return .5;let diff=0;for(let i=0;i<a.length;i++)diff+=Math.abs(a[i]-(b[i]||0));return Math.max(0,1-diff/a.length);}
function quickFindVisualSignature(f){return`${f.hash||''}|${f.ahash||''}|${Number(f.aspect||0).toFixed(2)}`;}
function quickFindVisualSimilarity(a,b){
  const colorDist=Math.sqrt(a.avg.reduce((s,v,i)=>s+(v-b.avg[i])**2,0))/441.7,color=Math.max(0,1-colorDist);
  const hist=Math.max(0,1-a.hist.reduce((s,v,i)=>s+Math.abs(v-(b.hist[i]||0)),0)/2);
  const dhash=quickFindHamming(a.hash,b.hash),ahash=quickFindHamming(a.ahash,b.ahash),grid=quickFindVectorSimilarity(a.grid,b.grid),edge=quickFindVectorSimilarity(a.edge,b.edge);
  const aspect=Math.max(0,1-Math.min(1,Math.abs(Math.log(Math.max(.05,a.aspect)/Math.max(.05,b.aspect)))/1.2));
  const score=100*(dhash*.22+ahash*.12+grid*.28+edge*.16+color*.10+hist*.05+aspect*.07),reasons=[];
  if(grid>.76)reasons.push({label:'包装布局',value:'分区颜色/结构接近'});if(dhash>.72||ahash>.72)reasons.push({label:'整体视觉',value:'轮廓/纹理接近'});if(edge>.76)reasons.push({label:'边缘结构',value:'包装线条接近'});if(color>.84)reasons.push({label:'包装主色',value:'颜色接近'});if(aspect>.92)reasons.push({label:'外形比例',value:'长宽比例接近'});
  return{score:Math.round(score),reasons:reasons.slice(0,4),parts:{dhash,ahash,grid,edge,color,hist,aspect}};
}
async function quickFindMapLimit(list,limit,worker,onProgress){let next=0,done=0;const out=new Array(list.length);async function run(){while(true){const i=next++;if(i>=list.length)return;try{out[i]=await worker(list[i],i);}catch(e){console.warn('quick find visual item skipped',e);out[i]=null;}done++;if(onProgress)onProgress(done,list.length);await new Promise(r=>setTimeout(r,0));}}await Promise.all(Array.from({length:Math.min(limit,list.length||1)},run));return out;}
function quickFindAmbiguous(results=[]){return results.length>1&&Math.abs(results[0].score-results[1].score)<=7;}
function quickFindCandidateHTML(result){
  const p=result.product,imageId=imageSlots(p).primaryImageId,reasons=(result.reasons||[]).map(r=>`<span class="quick-find-reason">${esc(r.label)}${r.value?` · ${esc(r.value)}`:''}</span>`).join('');
  return `<article class="quick-find-result ${quickFindState.selectedId===p.id?'selected':''}">${imageId?`<img class="quick-find-thumb" alt="${esc(p.name)}" data-image-id="${esc(imageId)}">`:'<div class="quick-find-thumb placeholder">✦</div>'}<div class="quick-find-result-body"><div class="quick-find-result-head"><div><span class="type">${esc(p.cat||'Uncategorized')}</span><b>${esc(p.brand?`${p.brand} · `:'')}${esc(p.name||'未命名产品')}</b><span>${esc(p.shade||'色号未记录')}</span></div><span class="quick-find-score">${Math.round(result.score)}%</span></div><div class="quick-find-reasons">${reasons||'<span class="quick-find-reason">本地候选</span>'}</div>${p.fit?`<p class="quick-find-fit">${esc(p.fit)}</p>`:''}<div class="quick-find-actions"><button type="button" data-qf-confirm="${esc(p.id)}">就是这个</button><button class="secondary" type="button" data-qf-details="${esc(p.id)}">查看详情</button><button class="secondary" type="button" data-qf-edit="${esc(p.id)}">编辑</button><button class="secondary" type="button" data-qf-dismiss="${esc(p.id)}">排除</button></div></div></article>`;
}
function renderQuickFindResults(){
  const root=$('#quickFindResults'),status=$('#quickFindStatus');if(!root||!status)return;
  status.textContent=quickFindState.status||'';const results=quickFindState.results||[];
  if(quickFindState.mode==='idle'||quickFindState.mode==='photo-ready'){root.innerHTML='';return;}
  if(quickFindState.mode==='loading'){root.innerHTML='<div class="quick-find-loading"><span></span><b>正在本机查找…</b></div>';return;}
  if(!results.length){root.innerHTML='<div class="quick-find-none"><b>没有找到可靠候选</b><p>可以换关键词/角度再试，或直接新建产品。</p><button type="button" data-qf-new>＋ 新建产品</button></div>';return;}
  const selected=quickFindState.selectedId?products.find(p=>p.id===quickFindState.selectedId):null;
  const selection=selected?`<div class="quick-find-selected"><b>✓ 已选择：${esc(selected.brand?`${selected.brand} · `:'')}${esc(selected.name)}</b>${selected.shade?`<span>${esc(selected.shade)}</span>`:''}${selected.role?`<p>${esc(selected.role)}</p>`:''}<div class="toolbar"><button class="secondary" type="button" data-qf-details="${esc(selected.id)}">查看完整档案</button><button class="secondary" type="button" data-qf-edit="${esc(selected.id)}">编辑</button></div></div>`:'';
  const ambiguity=quickFindAmbiguous(results)?'<div class="quick-find-ambiguity"><b>有多个相似候选，请确认</b><span>Quick Find 不会替你自动选择。</span></div>':'';
  root.innerHTML=`${selection}${ambiguity}<div class="quick-find-result-list">${results.map(quickFindCandidateHTML).join('')}</div><div class="quick-find-footer"><button class="secondary" type="button" data-qf-none>都不是这些</button><button type="button" data-qf-new>＋ 新建产品</button></div>`;activateLazyImages();
}
function clearQuickFind(){
  quickFindState={mode:'idle',query:'',results:[],selectedId:'',status:'',progress:0};if($('#quickFindText'))$('#quickFindText').value='';if($('#quickFindPhotoInput'))$('#quickFindPhotoInput').value='';
  if(quickFindPhotoUrl){URL.revokeObjectURL(quickFindPhotoUrl);quickFindPhotoUrl='';}
  quickFindPhotoFile=null;quickFindPhotoImage=null;quickFindCropRect={x:0,y:0,width:100,height:100};quickFindCropDrag=null;
  if($('#quickFindPhotoWrap'))$('#quickFindPhotoWrap').hidden=true;if($('#quickFindCropEditor'))$('#quickFindCropEditor').hidden=true;renderQuickFindResults();
}
function runQuickFindText(query){
  const q=String(query||'').trim();if(!q){quickFindState={mode:'idle',query:'',results:[],selectedId:'',status:'',progress:0};renderQuickFindResults();return;}
  const results=quickFindTextSearch(q);quickFindState={mode:'text',query:q,results,selectedId:'',status:results.length?`找到 ${results.length} 个概念/关键词候选；请从候选中确认你要找的产品。`:'没有找到关键词候选。可尝试“粉色腮红 / 灰棕眼影 / 适合我的裸色口红”等描述。',progress:100};renderQuickFindResults();
}
function quickFindDrawCropCanvas(){
  const canvas=$('#quickFindCropCanvas');if(!canvas||!quickFindPhotoImage)return;
  const img=quickFindPhotoImage,maxW=720,scale=Math.min(1,maxW/img.naturalWidth),w=Math.round(img.naturalWidth*scale),h=Math.round(img.naturalHeight*scale);canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
  const r=safeCrop(quickFindCropRect);ctx.fillStyle='rgba(0,0,0,.38)';ctx.fillRect(0,0,w,h);ctx.save();ctx.beginPath();ctx.rect(w*r.x/100,h*r.y/100,w*r.width/100,h*r.height/100);ctx.clip();ctx.drawImage(img,0,0,w,h);ctx.restore();
  ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.strokeRect(w*r.x/100,h*r.y/100,w*r.width/100,h*r.height/100);ctx.strokeStyle='#9a6d68';ctx.lineWidth=1;ctx.strokeRect(w*r.x/100+2,h*r.y/100+2,Math.max(1,w*r.width/100-4),Math.max(1,h*r.height/100-4));
}
async function prepareQuickFindPhoto(file){
  if(!file)return;quickFindPhotoFile=file;
  if(quickFindPhotoUrl)URL.revokeObjectURL(quickFindPhotoUrl);quickFindPhotoUrl=URL.createObjectURL(file);if($('#quickFindPhotoPreview'))$('#quickFindPhotoPreview').src=quickFindPhotoUrl;if($('#quickFindPhotoWrap'))$('#quickFindPhotoWrap').hidden=false;
  quickFindPhotoImage=await fileToImage(file);quickFindCropRect=quickFindAutoSubjectBox(quickFindPhotoImage);if($('#quickFindCropEditor'))$('#quickFindCropEditor').hidden=false;quickFindDrawCropCanvas();
  quickFindState={mode:'photo-ready',query:file.name||'photo',results:[],selectedId:'',status:'已自动框出主体。可以拖动重新框选，再点击“用框选区域查找”。',progress:0};renderQuickFindResults();
}
function quickFindCropPoint(ev){
  const canvas=$('#quickFindCropCanvas'),rect=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(100,(ev.clientX-rect.left)/rect.width*100)),y:Math.max(0,Math.min(100,(ev.clientY-rect.top)/rect.height*100))};
}
function quickFindCropPointerDown(ev){if(!quickFindPhotoImage)return;ev.preventDefault();const p=quickFindCropPoint(ev);quickFindCropDrag={start:p,current:p};ev.currentTarget.setPointerCapture?.(ev.pointerId);}
function quickFindCropPointerMove(ev){if(!quickFindCropDrag)return;ev.preventDefault();quickFindCropDrag.current=quickFindCropPoint(ev);const a=quickFindCropDrag.start,b=quickFindCropDrag.current;quickFindCropRect={x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)};if(quickFindCropRect.width<2)quickFindCropRect.width=2;if(quickFindCropRect.height<2)quickFindCropRect.height=2;quickFindDrawCropCanvas();}
function quickFindCropPointerUp(ev){if(!quickFindCropDrag)return;quickFindCropPointerMove(ev);quickFindCropDrag=null;}
async function quickFindQueryFeature(){
  if(!quickFindPhotoImage)throw new Error('no query image');
  return quickFindFeatureFromImage(quickFindPhotoImage,quickFindCropRect);
}
async function runQuickFindPhoto(){
  if(!quickFindPhotoFile||!quickFindPhotoImage)return;
  quickFindState={mode:'loading',query:quickFindPhotoFile.name||'photo',results:[],selectedId:'',status:'正在分析框选主体并比较本机库存…',progress:0};renderQuickFindResults();
  try{
    const queryFeature=await quickFindQueryFeature(),hint=String($('#quickFindText')?.value||'').trim();
    const hintResults=hint?quickFindTextSearch(hint,200):[],hintMap=new Map(hintResults.map(r=>[r.product.id,r.score]));
    let candidates=products.map(product=>({product,imageId:imageSlots(product).primaryImageId})).filter(x=>x.imageId);
    if(hintResults.length>=2){const allowed=new Set(hintResults.map(r=>r.product.id));const filtered=candidates.filter(x=>allowed.has(x.product.id));if(filtered.length)candidates=filtered;}
    if(!candidates.length){quickFindState={mode:'photo',query:'',results:[],selectedId:'',status:'库存中还没有可用于照片匹配的产品图片。',progress:100};renderQuickFindResults();return;}
    const raw=await quickFindMapLimit(candidates,5,async entry=>{const f=await storedQuickFindFeature(entry.imageId);if(!f)return null;const sim=quickFindVisualSimilarity(queryFeature,f);return{product:entry.product,imageId:entry.imageId,feature:f,visualScore:sim.score,score:sim.score,reasons:sim.reasons};},(done,total)=>{quickFindState.status=`本地视觉比较：${done} / ${total}`;const s=$('#quickFindStatus');if(s)s.textContent=quickFindState.status;});
    const valid=raw.filter(Boolean),sigCount=new Map();for(const r of valid){const sig=quickFindVisualSignature(r.feature);sigCount.set(sig,(sigCount.get(sig)||0)+1);r.signature=sig;}
    for(const r of valid){
      const dup=sigCount.get(r.signature)||1,textScore=hintMap.get(r.product.id)||0;
      let score=r.visualScore;if(hint)score=score*.76+textScore*.24;
      if(dup>1){score-=Math.min(28,(dup-1)*8);r.reasons.push({label:'库存图片',value:'多件产品共享同一/近似合照，视觉区分度较低'});}
      if(hint&&textScore)r.reasons.unshift({label:'关键词辅助',value:`${hint} · ${Math.round(textScore)}%`});
      r.score=Math.max(0,Math.round(score));
    }
    const results=valid.sort((a,b)=>b.score-a.score).slice(0,12),top=results[0]?.score||0,filtered=top>=45?results.filter(r=>r.score>=Math.max(30,top-25)):results.slice(0,8);
    const shared=filtered.filter(r=>(sigCount.get(r.signature)||1)>1).length;
    quickFindState={mode:'photo',query:quickFindPhotoFile.name||'photo',results:filtered,selectedId:'',status:`本地照片查找完成：返回 ${filtered.length} 个候选${hint?'（已结合关键词）':''}。${shared?`其中 ${shared} 个候选使用共享合照，视觉结果需更谨慎。`:''}`,progress:100};renderQuickFindResults();
  }catch(e){console.error(e);quickFindState={mode:'photo',query:'',results:[],selectedId:'',status:'照片查找失败，请重新框选产品主体或换一张更清楚的照片。',progress:100};renderQuickFindResults();}
}
function quickFindDismiss(id){quickFindState.results=(quickFindState.results||[]).filter(r=>r.product.id!==id);if(quickFindState.selectedId===id)quickFindState.selectedId='';renderQuickFindResults();}
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
    <label>我的实际上脸 / 使用结果</label><input name="myResult" value="${esc(x.myResult||'')}" placeholder="例如 太浅不显气色 / 很适合我 / 实际比照片更灰">
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
    ${recommendationCardHTML(p)}
    <div class="card"><b>你的手工记录</b><p><b>怎么用：</b> ${esc(p.role||'尚未记录适配和搭配说明。')}</p>${p.fit?`<p><b>适配：</b> ${esc(p.fit)}</p>`:''}${p.myResult?`<div class="actual-result"><b>我的实际结果</b><p>${esc(p.myResult)}</p></div>`:''}</div>
    <div class="card"><b>Product Passport</b><div class="kv"><div>品牌</div><div>${esc(p.brand||'未记录')}</div><div>生产日期</div><div>${esc(p.made||'未记录')}</div><div>购买日期</div><div>${esc(p.bought||'未记录')}</div><div>开封日期</div><div>${esc(p.opened||'未知')}</div><div>PAO</div><div>${esc(p.pao?`${p.pao} 个月`:'待录入')}</div><div>状态</div><div>${esc(p.status||'正常')}</div></div></div>
    ${attrRows?`<div class="card"><b>Structured Attributes</b><div class="kv top-gap">${attrRows}</div></div>`:''}
    ${(p.productLine||p.barcodeText||p.batchCode||p.packagingText||p.identification)?`<div class="card"><b>Identification record</b><div class="kv top-gap"><div>产品线 / 版本</div><div>${esc(p.productLine||'未记录')}</div><div>可见条码</div><div>${esc(p.barcodeText||'未记录')}</div><div>批号 / 色号代码</div><div>${esc(p.batchCode||'未记录')}</div><div>包装文字</div><div>${esc(p.packagingText||'未记录')}</div><div>来源</div><div>${p.identification?'AI suggestion · user confirmed':'Manual entry'}</div></div></div>`:''}
    ${sourcePhotos?`<details class="card"><summary><b>Scan Shelf 来源图（${p.sourceImages.length}）</b></summary><div class="scan-source-gallery">${sourcePhotos}</div></details>`:''}
    ${p.notes?`<div class="card"><b>备注</b><p class="note">${esc(p.notes)}</p></div>`:''}
    <div class="actions"><button data-action="edit" data-id="${esc(p.id)}" type="button">编辑</button><button class="danger" data-action="delete" data-id="${esc(p.id)}" type="button">删除</button></div>`);
  await Promise.all($$('#modalBody img[data-image-id]').map(loadImageEl));
}
async function handleProductSubmit(form){
  const fd=new FormData(form); const id=form.dataset.id||uuid(); const existing=products.find(p=>p.id===id)||{},slots=imageSlots(existing);
  const attributes={hue:fd.get('attrHue')||'',undertone:fd.get('attrUndertone')||'',saturation:fd.get('attrSaturation')||'',depth:fd.get('attrDepth')||'',texture:fd.get('attrTexture')||'',finish:fd.get('attrFinish')||'',coverage:fd.get('attrCoverage')||'',function:String(fd.get('attrFunction')||'').trim()};
  const p={...existing,id,name:String(fd.get('name')||'').trim(),brand:String(fd.get('brand')||'').trim(),cat:fd.get('cat'),shade:String(fd.get('shade')||'').trim(),form:fd.get('form'),fit:String(fd.get('fit')||'').trim(),myResult:String(fd.get('myResult')||'').trim(),role:String(fd.get('role')||'').trim(),attributes,made:fd.get('made'),bought:fd.get('bought'),opened:fd.get('opened'),pao:String(fd.get('pao')||'').trim(),status:fd.get('status'),notes:String(fd.get('notes')||'').trim(),officialImageUrl:String(fd.get('officialImageUrl')||'').trim(),userImageId:slots.userImageId,officialImageId:slots.officialImageId};
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
function newScanSession(mode){return{id:uuid(),mode,stage:'capture',sourceImages:[],candidates:[],frontRegions:[],backRegions:[],pairings:[],reviewFilter:'all',localDetection:null,aiState:{status:'off'},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};}
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
const LOCAL_DETECTION_STEPS=['Reading images…','Detecting products…','Generating crops…','Pairing front/back images…','Preparing candidates…'];
function nextPaint(){return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}
async function updateLocalProgress(session,active,status='running'){
  const steps=session.mode==='paired'?LOCAL_DETECTION_STEPS:LOCAL_DETECTION_STEPS.filter((_,index)=>index!==3);session.stage='local-processing';session.localDetection={...(session.localDetection||{}),status,active:Math.min(active,steps.length-1),steps,startedAt:session.localDetection?.startedAt||new Date().toISOString()};
  await saveScanSession(session);renderScanShelf();await nextPaint();
}
function detectionConfidence(candidate){const value=Number(candidate?.detectionConfidence??candidate?.confidence??.2);return Math.max(0,Math.min(1,Number.isFinite(value)?value:.2));}
function localDetectionSummary(session,candidateCount,cropSuccess){const needsAdjustment=(session.candidates||[]).filter(c=>!c.cropImageId||detectionConfidence(c)<.45).length;return{candidateCount,cropSuccess,needsAdjustment,completedAt:new Date().toISOString()};}
function renderLocalProgress(session){const detection=session.localDetection||{},active=Number(detection.active)||0,steps=detection.steps||LOCAL_DETECTION_STEPS;return `<div class="card processing-panel"><div class="title"><h3>Local Detection</h3><span class="status-badge">${detection.status==='error'?'CHECK':'LOCAL'}</span></div><div class="progress-track"><span style="width:${Math.min(100,Math.max(8,(active+1)/steps.length*100))}%"></span></div><div class="progress-steps">${steps.map((label,index)=>`<div class="${index<active?'done':index===active?'active':''}"><span>${index<active?'✓':index===active?'●':'○'}</span>${esc(label)}</div>`).join('')}</div>${detection.status==='error'?`<p class="error">${esc(detection.error||'Local Detection failed. You can retry or add candidates manually.')}</p>`:'<p class="note">All image processing shown here is running on this device.</p>'}</div>`;}
function renderLocalComplete(session){const s=session.localDetection?.summary||{candidateCount:(session.candidates||[]).length,cropSuccess:(session.candidates||[]).filter(c=>c.cropImageId).length,needsAdjustment:0},warning=session.mode==='batch'&&s.candidateCount<=1?'<div class="detection-warning"><b>只检测到 1 个独立区域。</b> 复杂背景、相互接触或反光包装会让纯本地分割失效。可以手动添加区域；若已配置 AI proxy，AI Identification 会同时查看整张当前合照并可补回漏检产品。</div>':'';return `<div class="completion-panel local-complete"><div><span class="completion-icon">✓</span><div><h3>Local detection complete</h3><p>Brand/product/shade identification has not yet been performed.</p></div></div><ul><li>${s.candidateCount} candidates found</li><li>${s.cropSuccess} crops generated successfully</li><li>${s.needsAdjustment} candidates need manual adjustment</li></ul></div>${warning}`;}
function renderScanCapture(session){
  const sources=session.sourceImages||[];
  const previousError=session.localDetection?.status==='error'?renderLocalProgress(session):'';
  if(session.mode==='single')return `${previousError}<div class="card"><div class="title"><h3>Single Product Multi-Photo</h3><span class="status-badge">${sources.length}/${MAX_SCAN_PHOTOS}</span></div><p class="note">一件产品可添加正面、底部、背面、侧面或开盖颜色图。所有照片属于同一个 ProductCandidate。</p><div class="scan-gallery">${sources.map(sourceThumb).join('')}</div><div class="toolbar">${scanFileControl('single-camera',sources.length?'Add another angle':'Take first photo',{capture:true})}${scanFileControl('single-files',sources.length?'Add photos':'Choose Photos',{multiple:true})}</div>${sources.length?'<button class="full" type="button" data-scan-action="local-detect">Start Local Detection</button>':''}</div>`;
  if(session.mode==='batch')return `${previousError}<div class="card"><h3>Single-Image Batch Scan</h3><p class="note">Local Detection proposes editable regions using an adaptive on-device foreground/whitespace detector. It can find several separated products and may miss touching or low-contrast items; review every crop.</p>${session.batchImageId?`<img class="scan-group-preview" alt="批量合照" data-image-id="${esc(session.batchImageId)}">`:''}<div class="toolbar">${scanFileControl('batch-camera',session.batchImageId?'Retake photo':'Take group photo',{capture:true})}${scanFileControl('batch-file',session.batchImageId?'Choose another image':'Choose one image')}</div>${session.batchImageId?'<button class="full" type="button" data-scan-action="local-detect">Run Local Detection</button>':''}</div>`;
  return `${previousError}<div class="card"><h3>Paired Batch Scan</h3><ol class="scan-steps"><li>保持产品顺序，拍正面合照</li><li>原位翻转产品，拍背面合照</li><li>Local Detection 建议配对，人工确认</li></ol><div class="paired-capture"><div><b>Front group</b>${session.frontImageId?`<img class="scan-group-preview" alt="正面合照" data-image-id="${esc(session.frontImageId)}">`:''}${scanFileControl('paired-front',session.frontImageId?'Retake front':'Take front group',{capture:true})}${scanFileControl('paired-front','Choose front photo')}</div><div><b>Back group</b>${session.backImageId?`<img class="scan-group-preview" alt="背面合照" data-image-id="${esc(session.backImageId)}">`:''}${scanFileControl('paired-back',session.backImageId?'Retake back':'Take back group',{capture:true})}${scanFileControl('paired-back','Choose back photo')}</div></div>${session.frontImageId&&session.backImageId?'<button class="full" type="button" data-scan-action="local-detect">Run Local Detection &amp; propose pairings</button>':''}<p class="note">通常两张合照即可。若某一件仍缺信息，只对那件产品添加底部/侧面图。</p></div>`;
}
function renderPairing(session){
  const backOptions=(selected='')=>`<option value="">未配对</option>${session.backRegions.map(r=>`<option value="${esc(r.id)}" ${r.id===selected?'selected':''}>Back ${esc(r.label)}</option>`).join('')}`;
  return `${renderLocalComplete(session)}<div class="card"><div class="title"><h3>Confirm pairings</h3><span class="status-badge">LOCAL</span></div><p class="note">建议依据相对位置、布局、轮廓比例、尺寸和主色生成。这是检测配对，不是产品身份识别；请纠正错误配对后再继续。</p><div class="pairing-list">${session.frontRegions.map(front=>{const pair=session.pairings.find(p=>p.frontRegionId===front.id)||{};return `<div class="pair-row"><figure><img alt="Front ${esc(front.label)}" data-image-id="${esc(front.cropImageId)}"><figcaption>Front ${esc(front.label)}</figcaption></figure><span>↔</span><label><select class="pair-select" data-front-id="${esc(front.id)}">${backOptions(pair.backRegionId)}</select></label></div>`;}).join('')}</div><button class="full" type="button" data-scan-action="confirm-pairings">Confirm pairings</button></div>`;
}
function candidateAsProduct(c){return{name:c.name||'',brand:c.brand||'',cat:c.cat||'Other',shade:c.shade||'',form:c.form||'Other',role:c.role||'',attributes:c.attributes||{}};}
function duplicateFlag(candidate){
  const cp=candidateAsProduct(candidate);let best=null;
  for(const p of products){const sameIdentity=norm(cp.brand)&&norm(cp.brand)===norm(p.brand)&&textSimilarity(cp.name,p.name)>=.75;if(sameIdentity){const differentShade=norm(cp.shade)&&norm(p.shade)&&norm(cp.shade)!==norm(p.shade);const flag={label:differentShade?'Same product, different shade':'Possible existing item',product:p,priority:differentShade?2:3};if(!best||flag.priority>best.priority)best=flag;continue;}const relation=analyzeRelation(cp,p);if(['true','color','functional'].includes(relation.kind)&&relation.score>=75){const flag={label:'Possible duplicate',product:p,priority:1};if(!best)best=flag;}}
  return best;
}
function identificationStatus(candidate){const ai=candidate.aiIdentification;if(candidate.unidentified||!ai||ai.status==='unidentified')return'unidentified';if(ai.status==='identified'&&candidate.name&&candidate.brand)return'identified';return'needs-confirmation';}
function alternativeLabel(match={}){return[match.brand,match.productName||match.name,match.shade].filter(Boolean).join(' · ')||'Unnamed match';}
function candidateCard(candidate){
  const flag=duplicateFlag(candidate),attrs=candidate.attributes||{},ai=candidate.aiIdentification||null,attrText=ATTRIBUTE_FIELDS.filter(([,k])=>attrs[k]).map(([l,k])=>`${l} ${attrs[k]}`).join(' · '),alternatives=Array.isArray(ai?.alternatives)?ai.alternatives:[];
  const aiInfo=ai?`<div class="ai-candidate-info"><b>AI Identification</b>${Number.isFinite(ai.confidence)?`<span class="identification-confidence">Identification confidence ${Math.round(ai.confidence*100)}%</span>`:''}${candidate.productLine?`<div>Product line/version: ${esc(candidate.productLine)}</div>`:''}${candidate.barcodeText?`<div>Visible barcode: ${esc(candidate.barcodeText)}</div>`:''}${candidate.batchCode?`<div>Batch/shade code: ${esc(candidate.batchCode)}</div>`:''}${candidate.packagingText?`<details><summary>Extracted packaging text</summary><p>${esc(candidate.packagingText)}</p></details>`:''}${alternatives.length?`<label>Alternative AI matches<select data-ai-alternative="${esc(candidate.id)}"><option value="">Keep current match</option>${alternatives.map((match,index)=>`<option value="${index}">${esc(alternativeLabel(match))}</option>`).join('')}</select></label>`:''}</div>`:'';
  return `<article class="candidate-card ${candidate.unidentified?'candidate-unidentified':''}" data-candidate-id="${esc(candidate.id)}" data-identification-status="${identificationStatus(candidate)}"><div class="candidate-top">${candidate.cropImageId?`<img class="candidate-crop" alt="候选裁剪" data-image-id="${esc(candidate.cropImageId)}">`:'<div class="candidate-crop placeholder">✦</div>'}<div><label class="candidate-accept"><input type="checkbox" data-candidate-accept="${esc(candidate.id)}" ${candidate.accepted?'checked':''}>接受并导入</label><b>${esc(candidate.unidentified?'未识别产品':candidate.name||'待识别产品')}</b><div class="note">${esc(candidate.brand||'品牌待填')} · ${esc(candidate.cat||'Other')} · ${esc(candidate.shade||'色号待填')}</div><span class="confidence">Detection confidence ${Math.round(detectionConfidence(candidate)*100)}%</span>${ai&&Number.isFinite(ai.confidence)?`<span class="identification-confidence">Identification confidence ${Math.round(ai.confidence*100)}%</span>`:''}</div></div>${flag?`<div class="duplicate-flag"><b>${esc(flag.label)}</b><span>${esc(flag.product.name)}</span></div>`:''}${aiInfo}${attrText?`<p class="note">${esc(attrText)}</p>`:''}<div class="candidate-actions"><button class="secondary" type="button" data-candidate-action="edit" data-id="${esc(candidate.id)}">编辑</button><button class="secondary" type="button" data-candidate-action="unidentified" data-id="${esc(candidate.id)}">标记未识别</button><label class="scan-file-button small-button">Add bottom/side photo for this product<input type="file" accept="image/*" capture="environment" data-candidate-extra="${esc(candidate.id)}"></label><button class="danger" type="button" data-candidate-action="delete" data-id="${esc(candidate.id)}">删除误检</button></div><label class="merge-check"><input type="checkbox" data-candidate-merge="${esc(candidate.id)}">选择合并</label></article>`;
}
function renderDetectionOverview(session){
  if(session.mode!=='batch'||!session.batchImageId||!session.candidates?.length)return'';
  const boxes=session.candidates.map((candidate,index)=>{const source=(candidate.sourceImages||[]).find(s=>s.imageId===session.batchImageId)||candidate.sourceImages?.[0],crop=safeCrop(source?.crop||{x:0,y:0,width:100,height:100});return `<div class="region-box" style="left:${crop.x}%;top:${crop.y}%;width:${crop.width}%;height:${crop.height}%"><span>${index+1}</span></div>`;}).join('');
  return `<div class="card"><div class="title"><h3>Detected regions</h3><span class="status-badge">${session.candidates.length}</span></div><p class="note">每个框代表一个独立候选。若有漏检，可用“手动添加候选”；若框把多件产品合在一起，可重新检测或编辑裁剪。</p><div class="region-overview"><img alt="批量检测区域" data-image-id="${esc(session.batchImageId)}">${boxes}</div></div>`;
}
function renderCandidateReview(session){
  const filter=session.reviewFilter||'all',filtered=filter==='all'?session.candidates:session.candidates.filter(c=>identificationStatus(c)===filter),showFilters=session.aiState?.status==='complete';
  const filters=showFilters?`<div class="review-filters" role="group" aria-label="AI identification filters">${[['all','Show all'],['identified','Identified'],['needs-confirmation','Needs confirmation'],['unidentified','Unidentified']].map(([value,label])=>`<button class="${filter===value?'active':''}" type="button" data-review-filter="${value}">${label}</button>`).join('')}</div>`:'';
  return `${renderLocalComplete(session)}${renderDetectionOverview(session)}${renderAiStage(session)}<div class="card"><div class="title"><h3>Review detected products</h3><span class="status-badge">${session.candidates.length}</span></div><p class="note">Review remains mandatory. Edit fields, delete false detections, merge duplicates, select an alternative AI match, or mark an item unidentified. Only checked candidates are written to Cabinet.</p>${filters}<div class="toolbar"><button class="secondary" type="button" data-scan-action="add-candidate">＋ 手动添加候选</button><button class="secondary" type="button" data-scan-action="merge-candidates">合并所选检测</button></div></div><div class="candidate-list">${filtered.length?filtered.map(candidateCard).join(''):'<div class="empty-state">No candidates in this filter.</div>'}</div><div class="card"><button class="full" type="button" data-scan-action="import-candidates">Import confirmed candidates</button></div>`;
}
function renderAiStage(session){
  const ai=session.aiState||{status:'off'},button=`<button class="full ai-identify-button" type="button" data-scan-action="ai-identify">Identify products with AI</button>`;
  if(ai.status==='complete'){const s=ai.summary||{};return `<div class="completion-panel ai-complete"><div><span class="completion-icon">✓</span><div><h3>AI identification complete</h3><p>Results are suggestions and still require review.</p></div></div><ul><li>${s.identified||0} products identified with high confidence</li><li>${s.needsConfirmation||0} products need confirmation or have alternatives</li><li>${s.unidentified||0} products remain unidentified</li></ul><button class="secondary" type="button" data-scan-action="ai-identify">Run AI Identification again</button></div>`;}
  if(['preparing','uploading','applying'].includes(ai.status))return `<div class="card processing-panel ai-processing"><div class="title"><h3>AI Identification</h3><span class="status-badge">CONSENTED</span></div><div class="progress-track"><span style="width:${ai.status==='preparing'?'28':ai.status==='uploading'?'62':'88'}%"></span></div><p><b>${esc(ai.message||'Processing current scan…')}</b></p><p class="note">Only images from this current scan are in scope.</p></div>`;
  const stateMessage=ai.status==='declined'?'AI Identification was declined. No images left this device.':ai.status==='unavailable'?'AI Identification unavailable: no secure proxy is configured. No images left this device.':ai.status==='error'?`AI Identification did not complete: ${ai.message||'secure proxy request failed'}`:ai.status==='stale'?'Candidate photos or regions changed after the last AI run. Run AI Identification again if desired.':'Remote AI is OFF. Local Detection and manual review remain fully usable.';
  return `<div class="card ai-stage-card"><div class="title"><h3>Stage 2 — AI Product Identification</h3><span class="status-badge ai-off">${aiProxyEndpoint?'OFF UNTIL CONSENT':'NOT CONFIGURED'}</span></div><p class="note">${esc(stateMessage)}</p><p class="note">A secure backend proxy is required; no provider API key is stored in this public App.</p>${button}</div>`;
}
function renderScanShelf(){
  const root=$('#scanRoot');if(!root)return;const session=activeScan();
  if(!session){root.innerHTML=`<div class="card"><div class="title"><h3>Scan Shelf</h3><span class="status-badge">LOCAL FIRST</span></div><div class="stage-explainer"><div><b>Stage 1 — Local Detection</b><span>On-device loading, compression, regions, crops, pairing, color/shape evidence</span></div><div><b>Stage 2 — AI Identification</b><span>Optional · OFF by default · explicit consent required before current-scan images can leave the device</span></div></div><p class="note">Local Detection is not brand/product recognition. Without a configured secure AI proxy, the App remains fully usable for crops, pairing, manual candidate editing and import.</p><div class="scan-modes"><button type="button" data-scan-mode="single"><b>1. Single Product</b><span>1–5 张同一产品照片</span></button><button type="button" data-scan-mode="batch"><b>2. Single-Image Batch</b><span>一张图，多件产品</span></button><button type="button" data-scan-mode="paired"><b>3. Paired Batch</b><span>正面合照 + 背面合照</span></button></div></div><div class="card"><div class="title"><h3>Batch Assisted Import</h3><span class="status-badge">CHATGPT FRIENDLY</span></div><p class="note">适合一次整理 8–12 件产品：用 Paired Batch 拍正面/背面，导出 Scan Package 发给 ChatGPT；收到识别 JSON 后在这里一次导入。也可以直接导入 ChatGPT 根据你手动上传照片生成的结果 JSON。</p><div class="toolbar"><button class="secondary" type="button" data-scan-action="import-assisted-results">Import identified JSON</button></div></div>${scanSessions.length?`<div class="card"><h3>未完成扫描</h3>${scanSessions.map(s=>`<div class="scan-session-row"><button type="button" data-resume-scan="${esc(s.id)}"><b>${esc(SCAN_MODE_LABELS[s.mode])}</b><span>${esc(s.stage)} · ${new Date(s.updatedAt).toLocaleString()}</span></button><button class="danger" type="button" data-discard-scan="${esc(s.id)}">删除</button></div>`).join('')}</div>`:''}`;return;}
  root.innerHTML=`<div class="scan-toolbar"><button class="secondary" type="button" data-scan-action="back">← Scan Shelf</button><b>${esc(SCAN_MODE_LABELS[session.mode])}</b><button class="secondary" type="button" data-scan-action="export-scan-package">Export Scan Package</button></div>${session.stage==='local-processing'?renderLocalProgress(session):session.stage==='pairing'?renderPairing(session):session.stage==='review'?renderCandidateReview(session):session.stage==='imported'?'<div class="card"><h3>已导入 Cabinet</h3><p class="note">确认候选已写入本机 IndexedDB。扫描来源图、AI 建议和结构化属性会随加密备份保存。</p><button type="button" data-scan-action="back">返回 Scan Shelf</button></div>':renderScanCapture(session)}`;
  activateLazyImages();
}
async function addScanFiles(kind,files){
  const session=activeScan();if(!session||!files.length)return;
  try{
    if(kind.startsWith('single')){const remaining=MAX_SCAN_PHOTOS-(session.sourceImages||[]).length;if(remaining<=0){toast('最多 5 张照片');return;}const selected=[...files].slice(0,remaining);for(const file of selected){const source=await storeScanImage(session.id,file,session.sourceImages.length?'angle':'front');session.sourceImages.push({imageId:source.id,role:source.role,crop:source.crop});}}
    else{const file=files[0],role=kind==='paired-front'?'group-front':kind==='paired-back'?'group-back':'group',source=await storeScanImage(session.id,file,role),field=kind==='paired-front'?'frontImageId':kind==='paired-back'?'backImageId':'batchImageId',old=session[field];session[field]=source.id;if(old){await idbDelete('images',old);revokeImage(old);}session.stage='capture';}
    session.localDetection=null;session.aiState={status:'off'};await saveScanSession(session);renderScanShelf();
  }catch(e){console.error(e);toast('无法读取照片，请检查格式或存储空间');}
}
function candidateFromSources(sourceImages,cropImageId,detectionScore=.3){const combined=combineEvidence(sourceImages);return{id:uuid(),name:'',brand:'',shade:'',cat:'Other',form:'Other',role:'',productLine:'',barcodeText:'',batchCode:'',packagingText:'',attributes:{hue:combined.hue||'',undertone:combined.undertone||'',saturation:combined.saturation||'',depth:combined.depth||'',texture:'',finish:'',coverage:'',function:''},sourceImages,cropImageId,detectionConfidence:detectionScore,accepted:true,unidentified:false,aiIdentification:null};}
async function startLocalDetection(){
  const session=activeScan();if(!session)return;
  try{
    session.aiState={status:'off'};await updateLocalProgress(session,0);await updateLocalProgress(session,1);
    if(session.mode==='single'){
      const sources=[];for(const source of session.sourceImages)sources.push({...source,evidence:await analyzeStoredRegion(source.imageId,source.crop)});await updateLocalProgress(session,2);const cropImageId=await storeCropImage(session.id,sources[0].imageId,sources[0].crop);await updateLocalProgress(session,4);session.candidates=[candidateFromSources(sources,cropImageId,Math.min(.9,.62+sources.length*.05))];session.stage='review';session.localDetection={...session.localDetection,status:'complete',active:4,summary:localDetectionSummary(session,1,1)};
    }else if(session.mode==='batch'){
      const regions=await createRegions(session.id,session.batchImageId,'group');await updateLocalProgress(session,2);session.candidates=regions.map(r=>candidateFromSources([{imageId:r.sourceImageId,role:'group',crop:r.crop,evidence:r.evidence}],r.cropImageId,r.detectionConfidence));await updateLocalProgress(session,4);session.stage='review';session.localDetection={...session.localDetection,status:'complete',active:4,summary:localDetectionSummary(session,session.candidates.length,session.candidates.filter(c=>c.cropImageId).length)};
    }else{
      session.frontRegions=await createRegions(session.id,session.frontImageId,'group-front');session.backRegions=await createRegions(session.id,session.backImageId,'group-back');await updateLocalProgress(session,2);await updateLocalProgress(session,3);session.pairings=proposePairings(session.frontRegions,session.backRegions);await updateLocalProgress(session,4);session.stage='pairing';session.localDetection={...session.localDetection,status:'complete',active:4,summary:{candidateCount:session.frontRegions.length,cropSuccess:session.frontRegions.length+session.backRegions.length,needsAdjustment:session.frontRegions.filter(r=>r.needsAdjustment).length,completedAt:new Date().toISOString()}};
    }
    await saveScanSession(session);renderScanShelf();
  }catch(e){console.error(e);session.stage='capture';session.localDetection={...(session.localDetection||{}),status:'error',active:Math.max(0,session.localDetection?.active||0),error:'Local Detection could not finish. Retake the photo or retry.'};await saveScanSession(session);renderScanShelf();}
}
async function confirmPairings(){
  const session=activeScan();if(!session)return;const selected=new Set(),pairs=[];
  for(const el of $$('.pair-select')){if(el.value&&selected.has(el.value)){toast('同一张背面裁剪不能配给两件产品');return;}if(el.value)selected.add(el.value);pairs.push({frontRegionId:el.dataset.frontId,backRegionId:el.value,confidence:session.pairings.find(p=>p.frontRegionId===el.dataset.frontId&&p.backRegionId===el.value)?.confidence||.35});}
  session.pairings=pairs;session.candidates=pairs.map(pair=>{const front=session.frontRegions.find(r=>r.id===pair.frontRegionId),back=session.backRegions.find(r=>r.id===pair.backRegionId),sources=[front&&{imageId:front.sourceImageId,role:'group-front',crop:front.crop,evidence:front.evidence},back&&{imageId:back.sourceImageId,role:'group-back',crop:back.crop,evidence:back.evidence}].filter(Boolean),score=Math.min(.94,.38+(pair.confidence||.3)*.42+(back?.cropImageId?.length?0.08:0));return candidateFromSources(sources,front?.cropImageId||back?.cropImageId,score);});session.stage='review';session.localDetection={...(session.localDetection||{}),status:'complete',summary:localDetectionSummary(session,session.candidates.length,session.candidates.filter(c=>c.cropImageId).length)};await saveScanSession(session);renderScanShelf();
}
function requestAiConsent(){
  return new Promise(resolve=>{
    openModal(`<h2>Use AI product identification?</h2><p class="note">AI Identification is optional and OFF by default. If you confirm, the App will prepare only the current scan images for the configured secure proxy.</p><div class="consent-list"><div>✓ Only images from this current scan may be sent</div><div>✓ Existing Cabinet contents will NOT be sent</div><div>✓ Skin profile will NOT be sent</div><div>✓ Skincare history will NOT be sent</div><div>✓ Unrelated stored images will NOT be sent</div><div>✓ Nothing will be committed to GitHub</div></div><p class="note">The secure proxy may use its configured AI provider. Review that proxy's privacy/retention policy before enabling it.</p><div class="actions"><button id="confirmAiUpload" type="button">Confirm current-scan upload</button><button id="declineAiUpload" class="secondary" type="button">Continue without AI</button></div>`);
    const modal=$('#modal'),closeBtn=$('#closeModalBtn');let settled=false;const finish=value=>{if(settled)return;settled=true;cleanup();closeModal();resolve(value);},decline=()=>finish(false),onKey=e=>{if(e.key==='Escape')decline();},onBackdrop=e=>{if(e.target===modal)decline();},cleanup=()=>{closeBtn.removeEventListener('click',decline);document.removeEventListener('keydown',onKey,true);modal.removeEventListener('click',onBackdrop,true);};
    closeBtn.addEventListener('click',decline);document.addEventListener('keydown',onKey,true);modal.addEventListener('click',onBackdrop,true);$('#confirmAiUpload').addEventListener('click',()=>finish(true));$('#declineAiUpload').addEventListener('click',decline);
  });
}
function cleanAiText(value,max=800){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);}
function normalizeAiConfidence(value){let n=Number(value);if(!Number.isFinite(n))return null;if(n>1)n/=100;return Math.max(0,Math.min(1,n));}
function normalizeAiMatch(raw={}){const confidence=normalizeAiConfidence(raw.confidence);return{brand:cleanAiText(raw.brand,120),productName:cleanAiText(raw.productName||raw.name,180),shade:cleanAiText(raw.shade,120),category:cleanAiText(raw.category,80),productLine:cleanAiText(raw.productLine||raw.version,180),barcodeText:cleanAiText(raw.barcodeText,180),batchCode:cleanAiText(raw.batchCode||raw.shadeCode,180),packagingText:cleanAiText(raw.packagingText||raw.extractedText,1600),confidence,attributes:Object.fromEntries(ATTRIBUTE_FIELDS.map(([,key])=>[key,cleanAiText(raw.attributes?.[key],120)]).filter(([,value])=>value))};}
async function buildAiUpload(session){
  const form=new FormData(),metadata={contractVersion:AI_CONTRACT_VERSION,appVersion:APP_VERSION,scanMode:session.mode,candidates:[]};let fileIndex=0;
  const appendStored=async(imageId,descriptor)=>{const rec=await storedImageRecord(imageId),field=`image_${fileIndex++}`;form.append(field,new Blob([rec.data],{type:rec.mime||'image/jpeg'}),`${field}.jpg`);return{field,...descriptor,mime:rec.mime||'image/jpeg'};};
  for(const candidate of session.candidates){const item={candidateId:candidate.id,images:[]};for(const source of candidate.sourceImages||[]){const rendered=await renderStoredCrop(source.imageId,source.crop||{x:0,y:0,width:100,height:100},1000),field=`image_${fileIndex++}`;form.append(field,rendered.blob,`${field}.jpg`);item.images.push({field,role:source.role||'angle',crop:safeCrop(source.crop),mime:rendered.mime});}metadata.candidates.push(item);}
  if(session.mode==='batch'&&session.batchImageId)metadata.batchFullImage=await appendStored(session.batchImageId,{role:'group',allowsAdditionalRegions:true});
  if(session.mode==='paired'&&session.frontImageId&&session.backImageId){metadata.pairedFullImages={front:await appendStored(session.frontImageId,{role:'group-front',allowsAdditionalRegions:true}),back:await appendStored(session.backImageId,{role:'group-back',allowsAdditionalRegions:true})};}
  form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');return{form,imageCount:fileIndex};
}
function applyAiMatch(candidate,raw){
  const match=normalizeAiMatch(raw),alternatives=(Array.isArray(raw.alternatives)?raw.alternatives:[]).slice(0,5).map(normalizeAiMatch);if(match.brand)candidate.brand=match.brand;if(match.productName)candidate.name=match.productName;if(match.shade)candidate.shade=match.shade;if(match.category)candidate.cat=match.category;if(match.productLine)candidate.productLine=match.productLine;if(match.barcodeText)candidate.barcodeText=match.barcodeText;if(match.batchCode)candidate.batchCode=match.batchCode;if(match.packagingText)candidate.packagingText=match.packagingText;candidate.attributes={...(candidate.attributes||{}),...match.attributes};const identified=Boolean(candidate.brand&&candidate.name),status=identified&&match.confidence!==null&&match.confidence>=.8?'identified':identified||alternatives.length?'needs-confirmation':'unidentified';candidate.unidentified=status==='unidentified';candidate.aiIdentification={status,confidence:match.confidence,alternatives,identifiedAt:new Date().toISOString(),providerLabel:'secure-proxy'};
}
async function applyAiResponse(session,data){
  if(!data||!Array.isArray(data.candidates))throw new Error('invalid AI response');
  for(const raw of data.candidates.slice(0,80)){
    let candidate=session.candidates.find(c=>c.id===raw.candidateId);
    if(!candidate&&session.mode==='batch'&&raw.crop&&session.batchImageId){const crop=safeCrop(raw.crop),evidence=await analyzeStoredRegion(session.batchImageId,crop),cropImageId=await storeCropImage(session.id,session.batchImageId,crop);candidate=candidateFromSources([{imageId:session.batchImageId,role:'group',crop,evidence}],cropImageId,normalizeAiConfidence(raw.detectionConfidence)||.55);session.candidates.push(candidate);}
    if(!candidate&&session.mode==='paired'&&(raw.frontCrop||raw.backCrop)){
      const sources=[];let cropImageId='';
      if(raw.frontCrop&&session.frontImageId){const crop=safeCrop(raw.frontCrop),evidence=await analyzeStoredRegion(session.frontImageId,crop),id=await storeCropImage(session.id,session.frontImageId,crop);sources.push({imageId:session.frontImageId,role:'group-front',crop,evidence});cropImageId=id;}
      if(raw.backCrop&&session.backImageId){const crop=safeCrop(raw.backCrop),evidence=await analyzeStoredRegion(session.backImageId,crop),id=await storeCropImage(session.id,session.backImageId,crop);sources.push({imageId:session.backImageId,role:'group-back',crop,evidence});if(!cropImageId)cropImageId=id;}
      if(sources.length){candidate=candidateFromSources(sources,cropImageId,normalizeAiConfidence(raw.detectionConfidence)||.55);session.candidates.push(candidate);}
    }
    if(candidate)applyAiMatch(candidate,raw);
  }
  for(const candidate of session.candidates)if(!candidate.aiIdentification)candidate.aiIdentification={status:'unidentified',confidence:null,alternatives:[],identifiedAt:new Date().toISOString(),providerLabel:'secure-proxy'};
  const statuses=session.candidates.map(identificationStatus);return{identified:statuses.filter(x=>x==='identified').length,needsConfirmation:statuses.filter(x=>x==='needs-confirmation').length,unidentified:statuses.filter(x=>x==='unidentified').length,total:session.candidates.length};
}
async function runAiIdentification(){
  const session=activeScan();if(!session||!session.candidates?.length)return;const consent=await requestAiConsent();if(!consent){session.aiState={status:'declined',completedAt:new Date().toISOString()};await saveScanSession(session);renderScanShelf();return;}
  if(!aiProxyEndpoint){session.aiState={status:'unavailable',message:'No secure proxy configured.',completedAt:new Date().toISOString(),uploaded:false};await saveScanSession(session);renderScanShelf();return;}
  try{
    session.aiState={status:'preparing',message:'Preparing current-scan images…'};await saveScanSession(session);renderScanShelf();await nextPaint();const upload=await buildAiUpload(session);session.aiState={status:'uploading',message:`Sending ${upload.imageCount} current-scan image crop(s) to the secure proxy…`,imageCount:upload.imageCount};await saveScanSession(session);renderScanShelf();await nextPaint();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);let response;try{response=await fetch(aiProxyEndpoint,{method:'POST',body:upload.form,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal,headers:{Accept:'application/json'}});}finally{clearTimeout(timer);}if(!response.ok)throw new Error(`secure proxy returned ${response.status}`);const text=await response.text();if(text.length>2000000)throw new Error('AI response too large');const data=JSON.parse(text);session.aiState={status:'applying',message:'Applying AI suggestions to candidates…'};await saveScanSession(session);renderScanShelf();await nextPaint();const summary=await applyAiResponse(session,data);session.aiState={status:'complete',summary,completedAt:new Date().toISOString(),imageCount:upload.imageCount};session.reviewFilter='all';await saveScanSession(session);renderScanShelf();
  }catch(e){console.error(e);session.aiState={status:'error',message:e?.name==='AbortError'?'secure proxy timed out':cleanAiText(e?.message||'request failed',180),completedAt:new Date().toISOString()};await saveScanSession(session);renderScanShelf();}
}
function applyAiAlternative(candidate,index){const alternatives=candidate.aiIdentification?.alternatives||[],alt=alternatives[index];if(!alt)return;const match=normalizeAiMatch(alt);candidate.brand=match.brand;candidate.name=match.productName;candidate.shade=match.shade;candidate.cat=match.category||candidate.cat;candidate.productLine=match.productLine;candidate.attributes={...(candidate.attributes||{}),...match.attributes};candidate.unidentified=!candidate.name;candidate.aiIdentification={...candidate.aiIdentification,status:candidate.unidentified?'unidentified':'needs-confirmation',confidence:match.confidence,alternatives};}
function candidateFormHTML(candidate){const attrs=candidate.attributes||{};return `<h2>编辑 ProductCandidate</h2><form id="candidateForm" data-id="${esc(candidate.id)}"><label>产品名称</label><input name="name" value="${esc(candidate.name||'')}"><label>品牌</label><input name="brand" value="${esc(candidate.brand||'')}"><label>色号</label><input name="shade" value="${esc(candidate.shade||'')}"><label>产品线 / 版本</label><input name="productLine" value="${esc(candidate.productLine||'')}"><label>可见条码文字</label><input name="barcodeText" value="${esc(candidate.barcodeText||'')}"><label>批号 / 色号代码</label><input name="batchCode" value="${esc(candidate.batchCode||'')}"><label>可见包装文字</label><textarea name="packagingText">${esc(candidate.packagingText||'')}</textarea><label>类别</label><select name="cat">${['Blush','Eyeshadow','Highlighter','Bronzer','Foundation','Concealer','Primer','Powder','Lip','Mascara','Liquid eyeliner','Skincare','Other'].map(v=>`<option ${candidate.cat===v?'selected':''}>${v}</option>`).join('')}</select><label>质地</label><select name="form">${['Powder','Cream','Liquid','Balm','Gel','Stick','Mascara','Liquid eyeliner','Other'].map(v=>`<option ${candidate.form===v?'selected':''}>${v}</option>`).join('')}</select><label>用途</label><input name="role" value="${esc(candidate.role||'')}"><details class="attribute-panel" open><summary>结构化属性</summary><div class="attribute-grid"><label>色相<input name="attrHue" value="${esc(attrs.hue||'')}"></label><label>冷暖调<input name="attrUndertone" value="${esc(attrs.undertone||'')}"></label><label>饱和度<input name="attrSaturation" value="${esc(attrs.saturation||'')}"></label><label>深浅<input name="attrDepth" value="${esc(attrs.depth||'')}"></label><label>质感<input name="attrTexture" value="${esc(attrs.texture||'')}"></label><label>妆效<input name="attrFinish" value="${esc(attrs.finish||'')}"></label><label>遮盖力<input name="attrCoverage" value="${esc(attrs.coverage||'')}"></label><label>功能<input name="attrFunction" value="${esc(attrs.function||'')}"></label></div></details><details><summary>调整裁剪（百分比）</summary>${(candidate.sourceImages||[]).map((s,i)=>`<div class="candidate-crop-row" data-index="${i}"><label>照片角色<select name="sourceRole">${selectOptions(['front','back','bottom','side','angle','group','group-front','group-back','extra'],s.role)}</select></label><div class="crop-grid"><label>X<input type="number" min="0" max="95" step="1" name="cropX" value="${Math.round(s.crop?.x||0)}"></label><label>Y<input type="number" min="0" max="95" step="1" name="cropY" value="${Math.round(s.crop?.y||0)}"></label><label>宽<input type="number" min="5" max="100" step="1" name="cropW" value="${Math.round(s.crop?.width||100)}"></label><label>高<input type="number" min="5" max="100" step="1" name="cropH" value="${Math.round(s.crop?.height||100)}"></label></div></div>`).join('')}</details><button type="submit">保存候选</button></form>`;}
function openCandidateEditor(candidateId){const candidate=activeScan()?.candidates.find(c=>c.id===candidateId);if(candidate)openModal(candidateFormHTML(candidate));}
async function saveCandidateForm(form){
  const session=activeScan(),candidate=session?.candidates.find(c=>c.id===form.dataset.id);if(!candidate)return;const fd=new FormData(form);candidate.name=String(fd.get('name')||'').trim();candidate.brand=String(fd.get('brand')||'').trim();candidate.shade=String(fd.get('shade')||'').trim();candidate.productLine=String(fd.get('productLine')||'').trim();candidate.barcodeText=String(fd.get('barcodeText')||'').trim();candidate.batchCode=String(fd.get('batchCode')||'').trim();candidate.packagingText=String(fd.get('packagingText')||'').trim();candidate.cat=fd.get('cat');candidate.form=fd.get('form');candidate.role=String(fd.get('role')||'').trim();candidate.attributes={hue:fd.get('attrHue')||'',undertone:fd.get('attrUndertone')||'',saturation:fd.get('attrSaturation')||'',depth:fd.get('attrDepth')||'',texture:fd.get('attrTexture')||'',finish:fd.get('attrFinish')||'',coverage:fd.get('attrCoverage')||'',function:fd.get('attrFunction')||''};
  $$('.candidate-crop-row',form).forEach(row=>{const s=candidate.sourceImages[Number(row.dataset.index)];s.role=$('select[name="sourceRole"]',row).value;s.crop=safeCrop({x:$('input[name="cropX"]',row).value,y:$('input[name="cropY"]',row).value,width:$('input[name="cropW"]',row).value,height:$('input[name="cropH"]',row).value});});
  if(candidate.sourceImages[0])candidate.cropImageId=await storeCropImage(session.id,candidate.sourceImages[0].imageId,candidate.sourceImages[0].crop,candidate.cropImageId);candidate.unidentified=!candidate.name;candidate.detectionConfidence=Math.max(detectionConfidence(candidate),.55);await saveScanSession(session);closeModal();renderScanShelf();toast('候选已保存');
}
async function addCandidateExtra(candidateId,file){const session=activeScan(),candidate=session?.candidates.find(c=>c.id===candidateId);if(!candidate||!file)return;const source=await storeScanImage(session.id,file,'extra'),entry={imageId:source.id,role:'extra',crop:source.crop,evidence:await analyzeStoredRegion(source.id,source.crop)};candidate.sourceImages.push(entry);const combined=combineEvidence(candidate.sourceImages);for(const key of ['hue','undertone','saturation','depth'])if(!candidate.attributes[key])candidate.attributes[key]=combined[key]||'';candidate.detectionConfidence=Math.min(.92,detectionConfidence(candidate)+.05);if(session.aiState?.status==='complete')session.aiState={status:'stale'};await saveScanSession(session);renderScanShelf();toast('已为这一件产品添加补充照片');}
async function candidateAction(action,id){
  const session=activeScan(),candidate=session?.candidates.find(c=>c.id===id);if(!session||!candidate)return;
  if(action==='edit'){openCandidateEditor(id);return;}if(action==='unidentified'){candidate.unidentified=true;candidate.name='';candidate.accepted=true;candidate.aiIdentification={...(candidate.aiIdentification||{}),status:'unidentified'};}if(action==='delete'){session.candidates=session.candidates.filter(c=>c.id!==id);if(candidate.cropImageId){await idbDelete('images',candidate.cropImageId);revokeImage(candidate.cropImageId);}}await saveScanSession(session);renderScanShelf();
}
async function mergeCandidates(){
  const session=activeScan(),ids=$$('[data-candidate-merge]:checked').map(x=>x.dataset.candidateMerge);if(!session||ids.length<2){toast('请选择至少两个检测结果');return;}const selected=session.candidates.filter(c=>ids.includes(c.id)),base=selected[0];for(const other of selected.slice(1)){base.sourceImages=[...base.sourceImages,...other.sourceImages].filter((s,i,a)=>a.findIndex(x=>x.imageId===s.imageId&&x.role===s.role)===i);for(const key of ['name','brand','shade','cat','form','role','productLine','barcodeText','batchCode','packagingText'])if(!base[key]&&other[key])base[key]=other[key];for(const key of Object.keys(other.attributes||{}))if(!base.attributes?.[key]&&other.attributes[key]){base.attributes=base.attributes||{};base.attributes[key]=other.attributes[key];}base.detectionConfidence=Math.max(detectionConfidence(base),detectionConfidence(other));if(other.cropImageId&&other.cropImageId!==base.cropImageId){await idbDelete('images',other.cropImageId);revokeImage(other.cropImageId);}}session.candidates=session.candidates.filter(c=>!ids.includes(c.id)||c.id===base.id);if(session.aiState?.status==='complete')session.aiState={status:'stale'};await saveScanSession(session);renderScanShelf();toast('检测结果已合并为一个 ProductCandidate');
}
async function addManualCandidate(){const session=activeScan();if(!session)return;const imageId=session.batchImageId||session.frontImageId||session.sourceImages?.[0]?.imageId;if(!imageId){toast('请先添加照片');return;}const crop={x:0,y:0,width:100,height:100},evidence=await analyzeStoredRegion(imageId,crop),cropImageId=await storeCropImage(session.id,imageId,crop),candidate=candidateFromSources([{imageId,role:'group',crop,evidence}],cropImageId,.2);session.candidates.push(candidate);if(session.aiState?.status==='complete')session.aiState={status:'stale'};await saveScanSession(session);renderScanShelf();openCandidateEditor(candidate.id);}
async function importCandidates(){
  const session=activeScan(),selected=session?.candidates.filter(c=>c.accepted);if(!session||!selected.length){toast('请至少接受一个候选');return;}if(!confirm(`把 ${selected.length} 个已确认候选写入 Cabinet？`))return;let index=1;
  for(const c of selected){const id=uuid(),name=c.unidentified||!c.name?`未识别产品 ${index++}`:c.name,p={id,name,brand:c.brand||'',cat:c.cat||'Other',shade:c.shade||'',form:c.form||'Other',fit:'',role:c.role||'',productLine:c.productLine||'',barcodeText:c.barcodeText||'',batchCode:c.batchCode||'',packagingText:c.packagingText||'',identification:c.aiIdentification||null,attributes:c.attributes||{},made:'',bought:'',opened:'',pao:'',status:'需检查',notes:'由 Scan Shelf 导入；AI 建议和人工修改均需由用户确认。',officialImageUrl:'',userImageId:c.cropImageId||'',officialImageId:'',imageId:c.cropImageId||'',imageSource:c.cropImageId?'my_photo':'',scanCropImageId:c.cropImageId||'',sourceImages:c.sourceImages||[],scanSessionId:session.id,relationships:[],createdAt:new Date().toISOString()};await saveProduct(p);if(c.cropImageId){const rec=await idbGet('images',c.cropImageId);if(rec)await idbPut('images',{...rec,productId:id});}c.importedProductId=id;}
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
  }catch(e){console.error(e);alert('无法解密备份：密码不正确，或文件已损坏/不是 V1.5–V1.7.2 加密备份。');}
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

async function exportAssistedScanPackage(){
  const session=activeScan();
  if(!session){alert('请先创建或打开一个 Scan Shelf 批次。');return;}
  try{
    const ids=scanSourceImageIds(session),images=[];
    for(const id of ids){
      const rec=await idbGet('images',id);if(!rec?.data)continue;
      images.push({id,role:rec.role||'',source:rec.source||'',mime:rec.mime||'image/jpeg',width:rec.width||0,height:rec.height||0,dataBase64:bytesToB64(rec.data)});
    }
    const pack={format:'beauty-cabinet-scan-package',version:1,appVersion:APP_VERSION,exportedAt:new Date().toISOString(),session:{id:session.id,mode:session.mode,stage:session.stage,sourceImages:session.sourceImages||[],batchImageId:session.batchImageId||'',frontImageId:session.frontImageId||'',backImageId:session.backImageId||'',pairings:session.pairings||[],candidates:(session.candidates||[]).map(c=>({id:c.id,sourceImages:c.sourceImages||[],cropImageId:c.cropImageId||'',detectionConfidence:detectionConfidence(c)}))},images};
    const blob=new Blob([JSON.stringify(pack,null,2)],{type:'application/json'}),name=`BeautyCabinet-Scan-${new Date().toISOString().slice(0,10)}.beautyscan.json`,file=new File([blob],name,{type:'application/json'});
    if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:'Beauty Cabinet scan package'});toast('Scan Package 已生成');return;}
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1500);toast('Scan Package 已导出');
  }catch(e){console.error(e);alert('无法导出 Scan Package，请检查浏览器存储空间。');}
}
function chooseAssistedResultFile(){
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.style.display='none';document.body.appendChild(input);
  input.addEventListener('change',async()=>{const file=input.files?.[0];if(file)await importAssistedResults(file);input.remove();},{once:true});input.click();
}
function normalizeAssistedAttributes(raw={}){return Object.fromEntries(ATTRIBUTE_FIELDS.map(([,key])=>[key,String(raw?.[key]||'').trim()]));}
async function importAssistedResults(file){
  try{
    const data=JSON.parse(await file.text()),items=Array.isArray(data)?data:(Array.isArray(data.items)?data.items:[]);
    if(!items.length)throw new Error('no items');
    if(data.format&&data.format!=='beauty-cabinet-assisted-results')throw new Error('unsupported format');
    if(!confirm(`识别结果包含 ${items.length} 件产品。导入到这台设备的 Cabinet？`))return;
    let imported=0;
    for(const raw of items){
      const id=uuid();let userImageId='';const image=raw.image||raw.userImage||null;
      if(image?.dataBase64){
        const bytes=b64ToBytes(String(image.dataBase64).replace(/^data:[^,]+,/,'')),imageId=uuid();
        let quickFindFeature=null;try{quickFindFeature=await quickFindFeatureFromBlob(new Blob([bytes],{type:image.mime||'image/jpeg'}));}catch(e){console.warn('assisted quick find feature skipped',e);}await idbPut('images',{id:imageId,productId:id,data:bytes.buffer,mime:image.mime||'image/jpeg',width:Number(image.width)||0,height:Number(image.height)||0,source:'assisted_import',quickFindFeature,updatedAt:new Date().toISOString()});if(quickFindFeature)quickFindVisualCache.set(imageId,quickFindFeature);userImageId=imageId;
      }
      const p={id,name:String(raw.name||raw.productName||'未命名产品').trim(),brand:String(raw.brand||'').trim(),cat:String(raw.cat||raw.category||'Other'),shade:String(raw.shade||'').trim(),form:String(raw.form||raw.texture||'Other'),fit:String(raw.fit||'').trim(),myResult:String(raw.myResult||'').trim(),role:String(raw.role||raw.pairingNotes||'').trim(),productLine:String(raw.productLine||'').trim(),barcodeText:String(raw.barcodeText||'').trim(),batchCode:String(raw.batchCode||'').trim(),packagingText:String(raw.packagingText||'').trim(),identification:raw.identification||{status:'assisted-import',source:'ChatGPT/manual review'},attributes:normalizeAssistedAttributes(raw.attributes||{}),made:String(raw.made||raw.productionDate||'').trim(),bought:String(raw.bought||raw.purchaseDate||'').trim(),opened:String(raw.opened||'').trim(),pao:String(raw.pao||'').trim(),status:String(raw.status||'需检查'),notes:String(raw.notes||'通过 Batch Assisted Import 导入').trim(),officialImageUrl:'',userImageId,officialImageId:'',imageId:userImageId,imageSource:userImageId?'assisted_import':'',scanCropImageId:'',sourceImages:[],relationships:Array.isArray(raw.relationships)?raw.relationships:[],createdAt:new Date().toISOString()};
      await saveProduct(p);imported++;
    }
    await reloadProducts();renderAll();toast(`已导入 ${imported} 件产品`);tab('cabinet');
  }catch(e){console.error(e);alert('无法读取 Batch Assisted Import JSON。请确认文件由 Beauty Cabinet/ChatGPT 生成，且包含 items 数组。');}
}

async function clearAllData(){
  if(!confirm('这会永久删除这台设备上的 Beauty Cabinet 数据。建议先导出加密备份。继续？'))return;
  if(!confirm('最后确认：删除后无法撤销。'))return;
  try{
    products=[];scanSessions=[];activeScanId='';quickFindVisualCache.clear();clearQuickFind();revokeAllImages();await idbClear('products');await idbClear('images');await idbClear('settings');await idbClear('scanSessions');await idbClear('relationships');renderAll();toast('本机数据已删除');
  }catch(e){console.error(e);alert('删除失败，请关闭其他 Beauty Cabinet 页面后重试。');}
}

function bindEvents(){
  $('#homeAddBtn').addEventListener('click',()=>openProductForm());
  if($('#homeScanBtn'))$('#homeScanBtn').addEventListener('click',()=>tab('scan'));
  $('#addBtn').addEventListener('click',()=>openProductForm());
  if($('#editSkinProfileBtn'))$('#editSkinProfileBtn').addEventListener('click',openSkinProfileForm);
  if($('#importSkinProfileBtn'))$('#importSkinProfileBtn').addEventListener('click',()=>$('#skinProfileFile').click());
  if($('#skinProfileFile'))$('#skinProfileFile').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importSkinProfileFile(f);e.target.value='';});
  if($('#resetSkinProfileBtn'))$('#resetSkinProfileBtn').addEventListener('click',resetSkinProfile);
  if($('#openRecommendationExplorerBtn'))$('#openRecommendationExplorerBtn').addEventListener('click',()=>openRecommendationExplorer('all'));
  if($('#quickFindText'))$('#quickFindText').addEventListener('input',e=>{clearTimeout(quickFindInputTimer);quickFindInputTimer=setTimeout(()=>runQuickFindText(e.target.value),120);});
  if($('#quickFindPhotoInput'))$('#quickFindPhotoInput').addEventListener('change',async e=>{const f=e.target.files?.[0];if(f){try{await prepareQuickFindPhoto(f);}catch(err){console.error(err);toast('图片读取失败');}}e.target.value='';});
  if($('#quickFindClearBtn'))$('#quickFindClearBtn').addEventListener('click',clearQuickFind);
  if($('#quickFindPhotoSearchBtn'))$('#quickFindPhotoSearchBtn').addEventListener('click',runQuickFindPhoto);
  if($('#quickFindFullCropBtn'))$('#quickFindFullCropBtn').addEventListener('click',()=>{quickFindCropRect={x:0,y:0,width:100,height:100};quickFindDrawCropCanvas();});
  if($('#quickFindAutoCropBtn'))$('#quickFindAutoCropBtn').addEventListener('click',()=>{if(quickFindPhotoImage){quickFindCropRect=quickFindAutoSubjectBox(quickFindPhotoImage);quickFindDrawCropCanvas();}});
  if($('#quickFindCropCanvas')){const c=$('#quickFindCropCanvas');c.addEventListener('pointerdown',quickFindCropPointerDown);c.addEventListener('pointermove',quickFindCropPointerMove);c.addEventListener('pointerup',quickFindCropPointerUp);c.addEventListener('pointercancel',()=>{quickFindCropDrag=null;});}

  $('#closeModalBtn').addEventListener('click',closeModal);
  $('#exportBtn').addEventListener('click',exportBackup);
  $('#homeBackupBtn').addEventListener('click',exportBackup);
  $('#settingsExportBtn').addEventListener('click',exportBackup);
  $('#importBtn').addEventListener('click',()=>$('#importFile').click());
  $('#importFile').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importEncryptedBackup(f);e.target.value='';});
  $('#legacyImportBtn').addEventListener('click',()=>$('#legacyImportFile').click());
  $('#legacyImportFile').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importLegacy(f);e.target.value='';});
  $('#clearBtn').addEventListener('click',clearAllData);
  if($('#saveAiEndpointBtn'))$('#saveAiEndpointBtn').addEventListener('click',async()=>{try{await saveAiEndpoint($('#aiEndpointInput').value);renderAll();toast(aiProxyEndpoint?'AI endpoint 已保存到本机':'AI endpoint 已关闭');}catch(e){alert(e.message||'AI endpoint 无效');}});
  if($('#clearAiEndpointBtn'))$('#clearAiEndpointBtn').addEventListener('click',async()=>{await saveAiEndpoint('');renderAll();toast('AI endpoint 已关闭');});
  $('#runCompareBtn').addEventListener('click',runCompare);
  document.addEventListener('click',async e=>{
    const t=e.target.closest('button[data-tab]');if(t){tab(t.dataset.tab);return;}
    const mode=e.target.closest('[data-scan-mode]');if(mode){await startScanMode(mode.dataset.scanMode);return;}
    const resume=e.target.closest('[data-resume-scan]');if(resume){activeScanId=resume.dataset.resumeScan;renderScanShelf();return;}
    const discard=e.target.closest('[data-discard-scan]');if(discard){await discardScanSession(discard.dataset.discardScan);return;}
    const scanAction=e.target.closest('[data-scan-action]');if(scanAction){const action=scanAction.dataset.scanAction;if(action==='back'){activeScanId='';renderScanShelf();}else if(action==='local-detect'||action==='recognize')await startLocalDetection();else if(action==='ai-identify')await runAiIdentification();else if(action==='confirm-pairings')await confirmPairings();else if(action==='merge-candidates')await mergeCandidates();else if(action==='add-candidate')await addManualCandidate();else if(action==='import-candidates')await importCandidates();else if(action==='export-scan-package')await exportAssistedScanPackage();else if(action==='import-assisted-results')chooseAssistedResultFile();return;}
    const reviewFilter=e.target.closest('[data-review-filter]');if(reviewFilter){const session=activeScan();if(session){session.reviewFilter=reviewFilter.dataset.reviewFilter;await saveScanSession(session);renderScanShelf();}return;}
    const candidateButton=e.target.closest('[data-candidate-action]');if(candidateButton){await candidateAction(candidateButton.dataset.candidateAction,candidateButton.dataset.id);return;}
    const recFilter=e.target.closest('[data-rec-filter]');if(recFilter){openRecommendationExplorer(recFilter.dataset.recFilter);return;}
    const recProduct=e.target.closest('[data-rec-product]');if(recProduct){showProduct(recProduct.dataset.recProduct);return;}
    const qfConfirm=e.target.closest('[data-qf-confirm]');if(qfConfirm){quickFindState.selectedId=qfConfirm.dataset.qfConfirm;renderQuickFindResults();return;}
    const qfDetails=e.target.closest('[data-qf-details]');if(qfDetails){showProduct(qfDetails.dataset.qfDetails);return;}
    const qfEdit=e.target.closest('[data-qf-edit]');if(qfEdit){openProductForm(products.find(x=>x.id===qfEdit.dataset.qfEdit));return;}
    const qfDismiss=e.target.closest('[data-qf-dismiss]');if(qfDismiss){quickFindDismiss(qfDismiss.dataset.qfDismiss);return;}
    if(e.target.closest('[data-qf-none]')){quickFindState.results=[];quickFindState.selectedId='';quickFindState.status='这些候选都不是。可以换关键词/照片，或新建产品。';renderQuickFindResults();return;}
    if(e.target.closest('[data-qf-new]')){openProductForm();return;}
    const p=e.target.closest('[data-product-id]');if(p&&!p.closest('#productForm')){showProduct(p.dataset.productId);return;}
    const a=e.target.closest('[data-action]');if(a){const id=a.dataset.id;if(a.dataset.action==='edit')openProductForm(products.find(x=>x.id===id));if(a.dataset.action==='delete')deleteProduct(id);return;}
    if(e.target===$('#modal'))closeModal();
  });
  document.addEventListener('change',async e=>{
    if(e.target.classList.contains('compare-check'))updateCompareButton();
    if(e.target.matches('[data-scan-input]')){await addScanFiles(e.target.dataset.scanInput,e.target.files||[]);e.target.value='';}
    if(e.target.matches('[data-candidate-accept]')){const session=activeScan(),candidate=session?.candidates.find(c=>c.id===e.target.dataset.candidateAccept);if(candidate){candidate.accepted=e.target.checked;await saveScanSession(session);}}
    if(e.target.matches('[data-candidate-extra]')){const file=e.target.files?.[0];if(file)await addCandidateExtra(e.target.dataset.candidateExtra,file);e.target.value='';}
    if(e.target.matches('[data-ai-alternative]')){const session=activeScan(),candidate=session?.candidates.find(c=>c.id===e.target.dataset.aiAlternative),index=Number(e.target.value);if(candidate&&Number.isInteger(index)){applyAiAlternative(candidate,index);await saveScanSession(session);renderScanShelf();}}
  });
  document.addEventListener('submit',e=>{if(e.target.id==='productForm'){e.preventDefault();handleProductSubmit(e.target);}if(e.target.id==='candidateForm'){e.preventDefault();saveCandidateForm(e.target);}if(e.target.id==='skinProfileForm'){e.preventDefault();handleSkinProfileSubmit(e.target);}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
}

async function start(){
  if(!window.indexedDB){document.body.innerHTML='<main><div class="card"><b>当前浏览器不支持 IndexedDB。</b><p>请使用较新的 Safari / Chrome / Edge。</p></div></main>';return;}
  try{
    await cleanupLegacyWebState();
    db=await openDB();
    await loadAiEndpoint();
    await loadSkinProfile();
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

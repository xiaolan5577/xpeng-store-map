import {rankStores,located,parseCoordinate,preciseCandidates,wgsToGcj,storeCandidates} from './core.mjs';
const $=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={stores:[],origin:null,selected:null,city:'',province:'',results:[],version:0,lastRequest:0,controller:null,cache:new Map()};
let map,markers,originMarker,lineLayer;const markerById=new Map();
const formatKm=n=>n<1?`${Math.max(0,Math.round(n*1000))} m`:`${n.toFixed(1)} km`;
function status(text){$('searchStatus').textContent=text;}
function filtered(){return state.stores.filter(s=>(!state.city||s.city===state.city)&&(!state.province||s.province===state.province));}
function navUrl(s){
 const p=wgsToGcj(s),u=new URL('https://uri.amap.com/navigation');
 u.searchParams.set('to',`${p.lng.toFixed(6)},${p.lat.toFixed(6)},${s.name}`);
 if(state.origin){const o=wgsToGcj(state.origin);u.searchParams.set('from',`${o.lng.toFixed(6)},${o.lat.toFixed(6)},${state.origin.name}`);}
 u.searchParams.set('mode','car');u.searchParams.set('coordinate','gaode');u.searchParams.set('src','xpeng-table-map');return u.href;
}
function newTabLink(href,label,className=''){const a=document.createElement('a');a.href=href;a.textContent=label;a.target='_blank';a.rel='noopener noreferrer';a.className=className;return a;}
function popup(s){
 const el=document.createElement('div');el.innerHTML=`<strong>${escape(s.short)}</strong><p>${escape(s.address)}</p>`;
 el.append(newTabLink(navUrl(s),'到这里 ↗'));const p=document.createElement('p');p.className='popup-source';p.textContent=s.source+(s.precision==='building'?' · 按所在商场定位':'');el.append(p,newTabLink(s.sourceUrl,'查看位置来源'));return el;
}
function showView(view){document.querySelector('.locator-layout').dataset.mobileView=view;$('showMap').classList.toggle('is-active',view==='map');$('showList').classList.toggle('is-active',view==='list');if(view==='map')setTimeout(()=>map?.invalidateSize(),60);}
function renderNearest(){
 const card=$('nearestCard'),s=state.results.find(s=>s.id===state.selected)||state.results[0];
 if(!s||!state.origin){card.hidden=true;return;}
 card.hidden=false;card.innerHTML=`<div class="nearest-label">${s.id===state.results[0]?.id?'最近门店':'已选门店'}</div><h4>${escape(s.short)}</h4><p>${escape(s.address)}</p><div class="nearest-distance"><strong>${formatKm(s.distance)}</strong><span>直线距离</span></div>`;
 const actions=document.createElement('div');actions.className='nearest-actions';actions.append(newTabLink(navUrl(s),'到这里 ↗'));
 if(s.phone){const a=document.createElement('a');a.href='tel:'+s.phone.replace(/[^\d+]/g,'');a.textContent='联系门店';actions.append(a);}
 card.append(actions);const source=document.createElement('p');source.className='store-source';source.textContent=s.source+(s.precision==='building'?' · 按所在商场定位':'');card.append(source);
}
function renderResults(){
 const list=$('storeList');list.replaceChildren();
 const entries=state.origin?rankStores(state.stores,state.origin,{city:state.city,province:state.province}):filtered();
 state.results=entries;
 if(state.selected&&!entries.some(s=>s.id===state.selected))state.selected=null;
 if(state.origin&&!state.selected&&entries.length)state.selected=entries[0].id;
 $('results-title').textContent=state.origin?'离你最近的门店':'表内门店';
 $('resultEyebrow').textContent=state.origin?'直线距离 · 由近到远':'按原表顺序';
 $('resultCount').textContent=`${entries.length}家`;
 $('mapTitle').textContent=state.city||state.province||'全部表内门店';
 $('mapSubtitle').textContent=`${entries.length}家门店`;
 $('scopeCount').textContent=entries.length===170?'只显示表内170家门店':`当前显示 ${entries.length} / 170 家表内门店`;
 $('originSummary').hidden=!state.origin;
 $('originName').textContent=state.origin?`◎ ${state.origin.name}`:'';
 if(!entries.length){const p=document.createElement('p');p.className='empty-state';p.textContent='此范围内没有表内门店，请重置筛选后再试。';list.append(p);}
 entries.forEach((s,i)=>{
  const b=document.createElement('button');b.type='button';b.className='store-item'+(state.selected===s.id?' is-selected':'');b.dataset.id=s.id;b.setAttribute('aria-pressed',String(state.selected===s.id));
  b.innerHTML=`<span class="store-rank">${String(i+1).padStart(2,'0')}</span><span><span class="store-name">${escape(s.short)}</span><span class="store-city">${escape(s.city)} · ${escape(s.province)}</span><span class="store-address">${escape(s.address)}</span></span><span class="store-distance">${state.origin?formatKm(s.distance):'↗'}</span>`;
  b.addEventListener('click',()=>selectStore(s.id,true));list.append(b);
 });
 renderNearest();renderMarkers();
}
function pin(label,selected=false){return L.divIcon({className:'store-pin',html:`<span class="pin-dot${selected?' selected':''}">${escape(label)}</span>`,iconSize:[26,26],iconAnchor:[13,13]});}
function renderMarkers(){
 if(!map)return;markers.clearLayers();markerById.clear();
 const groups=new Map(),entries=state.results,zoom=map.getZoom();
 entries.forEach((s,i)=>{
  if(!located(s))return;const pt=map.project([s.lat,s.lng],zoom),key=zoom<=8&&state.selected!==s.id?`${Math.floor(pt.x/42)},${Math.floor(pt.y/42)}`:`s${s.id}`;
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push({s,i});
 });
 for(const group of groups.values()){
  if(group.length>1){
   const lat=group.reduce((n,x)=>n+x.s.lat,0)/group.length,lng=group.reduce((n,x)=>n+x.s.lng,0)/group.length;
   L.marker([lat,lng],{icon:pin(group.length),title:`${group.length}家表内门店`}).addTo(markers).on('click',()=>map.fitBounds(group.map(x=>[x.s.lat,x.s.lng]),{padding:[50,50],maxZoom:12}));
  }else{
   const {s,i}=group[0],m=L.marker([s.lat,s.lng],{icon:pin(state.origin?i+1:'·',state.selected===s.id),title:s.name,keyboard:true}).addTo(markers).bindPopup(popup(s));
   m.on('click',()=>selectStore(s.id,false));markerById.set(s.id,m);
  }
 }
 lineLayer.clearLayers();if(state.origin&&state.selected){const s=entries.find(s=>s.id===state.selected);if(s)L.polyline([[state.origin.lat,state.origin.lng],[s.lat,s.lng]],{color:'#66b2ff',weight:2,dashArray:'6 8',interactive:false}).addTo(lineLayer);}
}
function selectStore(id,fromList){
 state.selected=id;renderResults();const s=state.results.find(s=>s.id===id);if(!s)return;
 if(fromList){showView('map');map.setView([s.lat,s.lng],13);requestAnimationFrame(()=>markerById.get(id)?.openPopup());}
 else {markerById.get(id)?.openPopup();const row=$('storeList').querySelector(`[data-id="${id}"]`);if(row&&window.innerWidth>780)$('storeList').scrollTo({top:row.offsetTop-$('storeList').offsetTop,behavior:'smooth'});}
}
function fitAll(){if(map&&filtered().some(located))map.fitBounds(filtered().filter(located).map(s=>[s.lat,s.lng]),{padding:[35,35],maxZoom:11});}
function hideCandidates(){$('suggestions').hidden=true;$('suggestions').replaceChildren();$('searchInput').setAttribute('aria-expanded','false');}
function invalidatePending(){state.version++;state.controller?.abort();state.controller=null;$('searchButton').disabled=false;}
function locate(p){
 state.origin=p;state.selected=null;hideCandidates();if(originMarker)map.removeLayer(originMarker);
 originMarker=L.marker([p.lat,p.lng],{icon:L.divIcon({className:'store-pin',html:'<span class="pin-origin"></span>',iconSize:[17,17],iconAnchor:[8,8]}),draggable:true,title:'查询位置，可拖动微调',zIndexOffset:1000}).addTo(map);
 originMarker.on('dragend',()=>{const pos=originMarker.getLatLng();invalidatePending();locate({...pos,name:'地图微调位置'});});
 renderResults();const near=state.results.slice(0,3);map.fitBounds([[p.lat,p.lng],...near.map(s=>[s.lat,s.lng])],{padding:[55,55],maxZoom:13});
 status(`已定位：${p.name}。${state.city||state.province?'正在所选范围内':'正在全部表内门店中'}按直线距离排序。`);
 showView('map');$('locator').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
}
function showCandidates(candidates){
 const box=$('suggestions');box.replaceChildren();box.hidden=false;$('searchInput').setAttribute('aria-expanded','true');
 candidates.forEach(p=>{const b=document.createElement('button');b.type='button';b.innerHTML=`<b>${escape(p.name)}</b><small>${escape(p.description||'表内门店地址')}</small>`;b.addEventListener('click',()=>{invalidatePending();locate(p);});box.append(b);});
 status(`找到${candidates.length}个位置，请选择具体地址。`);
}
function localCandidates(q){
 return storeCandidates(state.stores,q);
}
async function search(query){
 const q=query.trim();if(!q){status('请输入城市和详细地址或地点名称。');$('searchInput').focus();return;}
 const version=++state.version;state.controller?.abort();hideCandidates();$('searchInput').value=q;
 const coordinate=parseCoordinate(q);if(coordinate){locate({...coordinate,name:`坐标 ${q}`});$('searchButton').disabled=false;return;}
 const local=localCandidates(q);if(local.length){$('searchButton').disabled=false;if(local.length===1&&local[0].exact)locate(local[0]);else showCandidates(local);return;}
 if(state.cache.has(q)){$('searchButton').disabled=false;showCandidates(state.cache.get(q));return;}
 if(Date.now()-state.lastRequest<1200){$('searchButton').disabled=false;status('搜索操作较快，请稍等一秒后再试。');return;}
 state.lastRequest=Date.now();$('searchButton').disabled=true;status('正在查找地址，请稍候…');
 const controller=new AbortController();state.controller=controller;const timer=setTimeout(()=>controller.abort(),14000);
 try{
  const u=new URL('https://nominatim.openstreetmap.org/search');u.search=new URLSearchParams({q,format:'jsonv2',countrycodes:'cn',limit:'6','accept-language':'zh-CN',addressdetails:'1'});
  const response=await fetch(u,{signal:controller.signal,headers:{Accept:'application/json'},referrerPolicy:'strict-origin-when-cross-origin'});
  if(!response.ok)throw new Error(response.status===429?'请求较多，请稍后重试':'地址搜索服务暂时无法连接');
  const raw=await response.json();if(version!==state.version)return;
  const candidates=preciseCandidates(raw);if(!candidates.length){status(raw.length?'只匹配到城市或区域，请补充具体道路、门牌或地标，也可以在地图点选。':'没有识别到该地址。请补充城市和地标，或使用定位、地图点选。');return;}
  state.cache.set(q,candidates);if(candidates.length===1)locate(candidates[0]);else showCandidates(candidates);
 }catch(error){if(version!==state.version)return;status(error.name==='AbortError'?'地址搜索超时，请重试或在地图上点选位置。':`${error.message}。可使用定位或地图点选。`);}
 finally{clearTimeout(timer);if(version===state.version){$('searchButton').disabled=false;state.controller=null;}}
}
function updateCities(){
 const cities=[...new Set(state.stores.filter(s=>!state.province||s.province===state.province).map(s=>s.city))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
 $('cityFilter').replaceChildren(new Option('全部城市',''),...cities.map(s=>new Option(s,s)));$('cityFilter').value=state.city;
}
function clearOrigin(){state.version++;state.controller?.abort();state.origin=null;state.selected=null;if(originMarker){map.removeLayer(originMarker);originMarker=null;}hideCandidates();$('searchButton').disabled=false;renderResults();fitAll();status('已清除查询位置。输入新的地址即可重新查找。');}
async function init(){
 const response=await fetch('./stores.json');if(!response.ok)throw new Error('门店资料加载失败，请刷新重试');const data=await response.json();
 if(data.stores.length!==170||new Set(data.stores.map(s=>s.id)).size!==170)throw new Error('门店资料校验未通过');state.stores=data.stores;
 if(!window.L)throw new Error('地图组件加载失败，请刷新重试');
 $('cityStat').textContent=new Set(data.stores.map(s=>s.city)).size;$('provinceStat').textContent=new Set(data.stores.map(s=>s.province)).size;
 const provinces=[...new Set(data.stores.map(s=>s.province))].sort((a,b)=>a.localeCompare(b,'zh-CN'));$('provinceFilter').append(...provinces.map(s=>new Option(s,s)));updateCities();
 map=L.map('storeMap',{minZoom:3,maxZoom:18,zoomControl:false,worldCopyJump:true});L.control.zoom({position:'bottomright'}).addTo(map);
 const base=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',maxZoom:19});
 let errors=0;const tileTimer=setTimeout(()=>{$('mapNotice').hidden=false;},12000);base.on('tileerror',()=>{errors++;if(errors>=4)$('mapNotice').hidden=false;});base.on('tileload',()=>{errors=0;$('mapNotice').hidden=true;clearTimeout(tileTimer);});base.addTo(map);
 markers=L.layerGroup().addTo(map);lineLayer=L.layerGroup().addTo(map);map.on('zoomend',renderMarkers);map.on('click',e=>{state.version++;state.controller?.abort();$('searchButton').disabled=false;locate({lat:e.latlng.lat,lng:e.latlng.lng,name:'地图选定位置'});});renderResults();fitAll();
 $('provinceFilter').addEventListener('change',()=>{state.province=$('provinceFilter').value;state.city='';state.selected=null;updateCities();renderResults();fitAll();});
 $('cityFilter').addEventListener('change',()=>{state.city=$('cityFilter').value;state.selected=null;renderResults();fitAll();});
 $('clearFilters').addEventListener('click',()=>{state.city='';state.province='';state.selected=null;$('provinceFilter').value='';updateCities();renderResults();fitAll();});
 $('searchForm').addEventListener('submit',e=>{e.preventDefault();search($('searchInput').value);});
 $('searchInput').addEventListener('input',()=>{state.version++;state.controller?.abort();$('searchButton').disabled=false;hideCandidates();});
 $('searchInput').addEventListener('keydown',e=>{if(e.key==='Escape')hideCandidates();if(e.key==='ArrowDown'&&!$('suggestions').hidden){e.preventDefault();$('suggestions').querySelector('button')?.focus();}});
 document.addEventListener('click',e=>{if(!e.target.closest('.search-form'))hideCandidates();});
 document.querySelectorAll('[data-query]').forEach(b=>b.addEventListener('click',()=>search(b.dataset.query)));
 $('resetMap').addEventListener('click',fitAll);$('clearOrigin').addEventListener('click',clearOrigin);$('showMap').addEventListener('click',()=>showView('map'));$('showList').addEventListener('click',()=>showView('list'));
 $('locationButton').addEventListener('click',()=>{
  if(!navigator.geolocation){status('当前浏览器不支持定位，请输入地址或在地图点选。');return;}
  const version=++state.version;state.controller?.abort();$('searchButton').disabled=false;hideCandidates();status('正在获取当前位置，请允许浏览器定位…');$('locationButton').disabled=true;
  navigator.geolocation.getCurrentPosition(p=>{if(version===state.version)locate({lat:p.coords.latitude,lng:p.coords.longitude,name:'我的当前位置'});$('locationButton').disabled=false;},()=>{if(version===state.version)status('未能取得定位权限或位置。请输入地址，或在地图点选。');$('locationButton').disabled=false;},{enableHighAccuracy:true,timeout:12000,maximumAge:30000});
 });
 window.addEventListener('resize',()=>map.invalidateSize());
}
init().catch(e=>{status(e.message);$('storeList').innerHTML='<p class="empty-state">门店地图未能载入，请刷新重试。</p>';console.error(e);});

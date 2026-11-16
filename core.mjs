export function distanceKm(a,b){
 const rad=x=>x*Math.PI/180,dlat=rad(b.lat-a.lat),dlng=rad(b.lng-a.lng);
 const h=Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlng/2)**2;
 return 6371.0088*2*Math.asin(Math.min(1,Math.sqrt(h)));
}
export const located=s=>Number.isFinite(s.lat)&&Number.isFinite(s.lng)&&s.lat>=-90&&s.lat<=90&&s.lng>=-180&&s.lng<=180;
export function rankStores(stores,origin,filter={}){
 return stores.filter(s=>located(s)&&(!filter.city||s.city===filter.city)&&(!filter.province||s.province===filter.province))
 .map(s=>({...s,distance:distanceKm(origin,s)})).sort((a,b)=>a.distance-b.distance||a.id-b.id);
}
export function parseCoordinate(q){
 const m=q.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)$/);
 if(!m)return null;const p={lng:Number(m[1]),lat:Number(m[2])};return located(p)?p:null;
}
const outside=p=>p.lng<72.004||p.lng>137.8347||p.lat<.8293||p.lat>55.8271;
function offset(p){
 const x=p.lng-105,y=p.lat-35;
 let lat=-100+2*x+3*y+.2*y*y+.1*x*y+.2*Math.sqrt(Math.abs(x));
 let lng=300+x+2*y+.1*x*x+.1*x*y+.1*Math.sqrt(Math.abs(x));
 lat+=(20*Math.sin(6*x*Math.PI)+20*Math.sin(2*x*Math.PI))*2/3;
 lat+=(20*Math.sin(y*Math.PI)+40*Math.sin(y*Math.PI/3))*2/3;
 lat+=(160*Math.sin(y*Math.PI/12)+320*Math.sin(y*Math.PI/30))*2/3;
 lng+=(20*Math.sin(6*x*Math.PI)+20*Math.sin(2*x*Math.PI))*2/3;
 lng+=(20*Math.sin(x*Math.PI)+40*Math.sin(x*Math.PI/3))*2/3;
 lng+=(150*Math.sin(x*Math.PI/12)+300*Math.sin(x*Math.PI/30))*2/3;
 const rad=p.lat*Math.PI/180,a=6378245,ee=.00669342162296594323,magic=1-ee*Math.sin(rad)**2,root=Math.sqrt(magic);
 return {lat:lat*180/(a*(1-ee)/(magic*root)*Math.PI),lng:lng*180/(a/root*Math.cos(rad)*Math.PI)};
}
export function wgsToGcj(p){if(outside(p))return {...p};const d=offset(p);return {lat:p.lat+d.lat,lng:p.lng+d.lng};}
export function gcjToWgs(p){if(outside(p))return {...p};let w={...p};for(let i=0;i<4;i++){const g=wgsToGcj(w);w={lat:w.lat+p.lat-g.lat,lng:w.lng+p.lng-g.lng};}return w;}
export function preciseCandidates(raw){
 return raw.filter(r=>Number(r.place_rank)>=26&&r.category!=='boundary'&&Number.isFinite(Number(r.lat))&&Number.isFinite(Number(r.lon)))
 .map(r=>({name:r.name||r.display_name,description:r.display_name,lat:Number(r.lat),lng:Number(r.lon),source:'OpenStreetMap'}));
}
export function storeCandidates(stores,q){
 const clean=s=>s.replace(/[\s（）()·，,。省]/g,'').toLowerCase(),n=clean(q);if(n.length<3)return [];
 const matches=stores.filter(s=>clean(s.name).includes(n)||clean(s.address).includes(n)||clean(s.short).includes(n));
 const exact=matches.filter(s=>clean(s.name)===n||clean(s.address)===n||clean(s.short)===n);
 return (exact.length?exact:matches).slice(0,8).map(s=>({name:s.short,description:s.address,lat:s.lat,lng:s.lng,source:s.source,exact:exact.length>0}));
}

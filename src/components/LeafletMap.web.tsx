import React, { useEffect, useMemo, useRef, useState } from 'react';
import { VITEBSK } from '../models/city';
import { typesOfMask } from '../models/transport';
import type { MapProps } from './LeafletMap';

const HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css"/>
<style>
html,body,#map{margin:0;height:100%;width:100%;background:#1b1b22}
.leaflet-control-attribution{font-size:9px;opacity:.7}
#map.dark .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(.92) contrast(.88) saturate(.75)}
.leaflet-tile-pane{transition:filter .5s ease}
@keyframes pop{0%{transform:scale(0)}70%{transform:scale(1.18)}100%{transform:scale(1)}}
@keyframes pulse{0%{box-shadow:0 0 0 0 var(--acc)}100%{box-shadow:0 0 0 16px rgba(0,0,0,0)}}
.gm{box-sizing:border-box;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(20,20,28,.50);-webkit-backdrop-filter:blur(8px) saturate(1.5);backdrop-filter:blur(8px) saturate(1.5);border:1.5px solid var(--acc);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 0 12px color-mix(in srgb,var(--acc) 60%,transparent),0 4px 10px rgba(0,0,0,.35)}
.gm.light{background:rgba(255,255,255,.62)}
.gm svg{width:56%;height:56%;fill:none;stroke:var(--acc);stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.gm.pop{animation:pop .45s cubic-bezier(.2,1.4,.4,1) both}
.gm.sel{background:color-mix(in srgb,var(--acc) 32%,rgba(20,20,28,.5));animation:ring 1.8s ease-out infinite}
.gm.sel svg{stroke:#fff}
@keyframes ring{0%{box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 0 0 0 color-mix(in srgb,var(--acc) 70%,transparent),0 0 16px var(--acc)}100%{box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 0 0 16px transparent,0 0 16px var(--acc)}}
@keyframes drop{0%{transform:translateY(-46px) scale(.6);opacity:0}65%{transform:translateY(5px) scale(1.06);opacity:1}100%{transform:translateY(0) scale(1)}}
.pinwrap{width:30px;height:30px;animation:drop .55s cubic-bezier(.2,1.1,.4,1) both}
.pinbody{width:26px;height:26px;margin:2px;border-radius:50% 50% 50% 0;background:rgba(20,20,28,.55);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border:2px solid var(--acc);box-sizing:border-box;transform:rotate(-45deg);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 0 14px color-mix(in srgb,var(--acc) 65%,transparent),0 4px 10px rgba(0,0,0,.45)}
.pinbody:after{content:'';position:absolute;left:11px;top:11px;width:8px;height:8px;border-radius:50%;background:var(--acc)}
.jm{position:relative}
.jl{position:absolute;left:50%;bottom:100%;transform:translate(-50%,-8px);white-space:nowrap;padding:4px 9px;border-radius:12px;font:700 11px/1.25 -apple-system,'Segoe UI',Roboto,sans-serif;color:#fff;background:rgba(20,20,28,.58);-webkit-backdrop-filter:blur(10px) saturate(1.4);backdrop-filter:blur(10px) saturate(1.4);border:1px solid color-mix(in srgb,var(--acc) 70%,transparent);box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 4px 12px rgba(0,0,0,.35);text-align:center;animation:lab .5s ease both}
.jl.light{color:#15151A;background:rgba(255,255,255,.74)}
.jl small{display:block;font-weight:500;opacity:.78;font-size:10px;max-width:160px;overflow:hidden;text-overflow:ellipsis}
.gm.mid{border-width:1.5px;background:color-mix(in srgb,var(--acc) 40%,rgba(20,20,28,.5))}
@keyframes lab{from{opacity:0;transform:translate(-50%,2px)}to{opacity:1;transform:translate(-50%,-8px)}}
.gs{box-sizing:border-box;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(20,20,28,.74);border:1.5px solid var(--acc);box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 2px 6px rgba(0,0,0,.4)}
.gs.light{background:rgba(255,255,255,.88)}
.gs svg{width:56%;height:56%;fill:none;stroke:var(--acc);stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.gc{box-sizing:border-box;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(20,20,28,.8);border:2px solid var(--acc);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 0 14px color-mix(in srgb,var(--acc) 55%,transparent),0 3px 8px rgba(0,0,0,.4);color:#fff;font:800 13px/1 -apple-system,'Segoe UI',Roboto,sans-serif}
.gc.light{background:rgba(255,255,255,.9);color:#15151A}
.user-gps{width:42px;height:42px;position:relative;display:flex;align-items:center;justify-content:center}
.user-gps .gps-halo{position:absolute;inset:5px;border:2px solid rgba(10,132,255,.45);border-radius:50%;animation:gpsPulse 2.1s ease-out infinite}
.user-gps .gps-dot{position:absolute;width:18px;height:18px;border-radius:50%;background:#0A84FF;border:3px solid #fff;box-sizing:border-box;box-shadow:0 2px 8px rgba(0,0,0,.4)}
.user-gps .gps-heading{position:absolute;left:19px;top:1px;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:14px solid #0A84FF;transform-origin:5px 20px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.25))}
.leaflet-marker-icon.gps-icon{transition:transform .7s linear}
@keyframes gpsPulse{0%{transform:scale(.72);opacity:.9}100%{transform:scale(1.55);opacity:0}}
</style></head>
<body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
<script>
var mapEl=document.getElementById('map');
var map=L.map('map',{zoomControl:false}).setView([${VITEBSK.center.latitude},${VITEBSK.center.longitude}],14);
// Use the public OSM raster endpoint directly. CARTO started requiring API
// keys for external basemap requests in September 2026; requests without a key
// return a successful image containing an "API KEY REQUIRED" watermark, so a
// tileerror handler cannot detect that failure.
var OSM='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
var ESRI='https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
var tiles=L.tileLayer(OSM,{
  minZoom:2,maxZoom:19,maxNativeZoom:19,
  attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  updateWhenIdle:true,keepBuffer:2
}).addTo(map);
var tileErrors=0,switched=false;
function switchToEsri(){
  if(switched)return;
  switched=true;
  map.removeLayer(tiles);
  tiles=L.tileLayer(ESRI,{
    minZoom:2,maxZoom:19,
    attribution:'Tiles &copy; <a href="https://www.esri.com/">Esri</a>',
    updateWhenIdle:true,keepBuffer:2
  }).addTo(map);
  tileErrors=0;
}
// Ignore isolated tile misses; fail over only when several consecutive tiles
// fail. A successful tile resets the counter.
tiles.on('tileload',function(){tileErrors=0;});
tiles.on('tileerror',function(){
  tileErrors++;
  if(tileErrors>=4)switchToEsri();
});
var userMarker=null;var userAccuracyCircle=null;var pinMarker=null;var pinKey='';var wasFollowing=false;
var curDark=true,curAccent='#B14CFF',lastKey='',mk={},selKeys=[];
function clusterIcon(c){var n=c.getChildCount();var sz=n<10?36:(n<50?42:50);
  return L.divIcon({className:'',iconSize:[sz,sz],html:'<div class="gc'+(curDark?'':' light')+'" style="--acc:'+curAccent+';width:'+sz+'px;height:'+sz+'px"><span>'+n+'</span></div>'});}
var cluster=(L.markerClusterGroup?L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:44,disableClusteringAtZoom:17,spiderfyOnMaxZoom:true,zoomToBoundsOnClick:true,chunkedLoading:true,animateAddingMarkers:false,iconCreateFunction:clusterIcon}):L.layerGroup()).addTo(map);
function addAll(arr){if(cluster.addLayers){cluster.addLayers(arr);}else{arr.forEach(function(m){cluster.addLayer(m);});}}
map.on('click',function(e){parent.postMessage({src:'matbus-map',type:'tap',lat:e.latlng.lat,lng:e.latlng.lng},'*');});
var notifyMapInteraction=function(){parent.postMessage({src:'matbus-map',type:'user-interaction'},'*');};
map.on('dragstart',notifyMapInteraction);
map.getContainer().addEventListener('wheel',notifyMapInteraction,{passive:true});
map.getContainer().addEventListener('touchstart',function(e){if(e.touches&&e.touches.length>1)notifyMapInteraction();},{passive:true});
var SVG={bus:'<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="14" rx="3"/><path d="M4 11h16"/><path d="M8 20h.01M16 20h.01"/></svg>',
trolleybus:'<svg viewBox="0 0 24 24"><path d="M13 2L5 14h6l-1 8 8-12h-6z"/></svg>',
tram:'<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14"/><path d="M9 21l1.5-4M15 21l-1.5-4"/></svg>',
minibus:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="13" rx="3"/><path d="M6 9h12M7 18v2M17 18v2"/><circle cx="7" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/></svg>',
multi:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/></svg>',
start:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5"/></svg>',
end:'<svg viewBox="0 0 24 24"><path d="M6 21V4M6 4h11l-2.5 4L17 12H6"/></svg>',
alight:'<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
transfer:'<svg viewBox="0 0 24 24"><path d="M7 8h11l-3-3M17 16H6l3 3"/></svg>'};
var jLayer=L.layerGroup().addTo(map);
var PAD={paddingTopLeft:[40,100],paddingBottomRight:[40,310],maxZoom:17};
function drawJourney(r,accent,dark){
  jLayer.clearLayers(); if(!r) return;
  r.lines.forEach(function(ln,idx){
    var delay=(idx*0.35)+'s';
    if(ln.kind==='ride'){
      [{w:16,c:accent,o:.16},{w:9,c:accent,o:.42},{w:2.6,c:'#ffffff',o:.9}].forEach(function(st){
        var pl=L.polyline(ln.pts,{color:st.c,weight:st.w,opacity:st.o,lineCap:'round',lineJoin:'round',interactive:false}).addTo(jLayer);
        var el=pl.getElement&&pl.getElement();
        if(el&&el.getTotalLength){var len=el.getTotalLength();el.style.strokeDasharray=len;el.style.strokeDashoffset=len;el.getBoundingClientRect();
          el.style.transition='stroke-dashoffset 1.2s ease '+delay;el.style.strokeDashoffset=0;
          el.addEventListener('transitionend',function(){el.style.strokeDasharray='none';el.style.transition='none';});}
      });
    } else {
      var pw=L.polyline(ln.pts,{color:accent,weight:4,opacity:0,dashArray:'1 9',lineCap:'round',interactive:false}).addTo(jLayer);
      var e2=pw.getElement&&pw.getElement();
      if(e2){e2.getBoundingClientRect();e2.style.transition='opacity .8s ease '+delay;e2.style.opacity=.9;}
    }
  });
  r.markers.forEach(function(m,i){
    var n=m.kind==='mid'?12:(m.kind==='start'||m.kind==='end'?34:30);
    var wrap=document.createElement('div');wrap.className='jm';
    var g=document.createElement('div');g.className='gm'+(dark?'':' light')+(m.kind==='mid'?' mid':'');
    g.style.cssText='--acc:'+accent+';width:'+n+'px;height:'+n+'px';
    g.innerHTML=m.kind==='mid'?'':(SVG[m.icon]||SVG.multi);
    wrap.appendChild(g);
    if(m.title){var l=document.createElement('div');l.className='jl'+(dark?'':' light');l.style.setProperty('--acc',accent);l.style.animationDelay=(0.7+i*0.1)+'s';
      var t=document.createElement('div');t.textContent=m.title;l.appendChild(t);
      if(m.sub){var sm=document.createElement('small');sm.textContent=m.sub;l.appendChild(sm);}
      wrap.appendChild(l);}
    L.marker([m.lat,m.lng],{icon:L.divIcon({className:'',iconSize:[n,n],iconAnchor:[n/2,n/2],html:wrap}),interactive:false,zIndexOffset:m.kind==='mid'?0:1500}).addTo(jLayer);
  });
  if(r.bounds) map.fitBounds(r.bounds,PAD);
}
function icon(t,selected,accent,dark){
  if(selected){var n=38;
    return L.divIcon({className:'',iconSize:[n,n],iconAnchor:[n/2,n/2],
      html:'<div class="gm sel'+(dark?'':' light')+'" style="--acc:'+accent+';width:'+n+'px;height:'+n+'px">'+(SVG[t]||SVG.multi)+'</div>'});}
  var m=26;
  return L.divIcon({className:'',iconSize:[m,m],iconAnchor:[m/2,m/2],
    html:'<div class="gs'+(dark?'':' light')+'" style="--acc:'+accent+';width:'+m+'px;height:'+m+'px">'+(SVG[t]||SVG.multi)+'</div>'});
}
window.addEventListener('message',function(e){
  var d=e.data; if(!d||d.src!=='matbus') return;
  if(d.type==='state'){
    mapEl.className=d.dark?'dark':'';
    curDark=d.dark;curAccent=d.accent;
    var key=d.accent+'|'+(d.dark?1:0)+'|'+d.stops.length+'|'+d.stops.map(function(s){return s.id+':'+s.pi+':'+s.t+':'+s.lat+':'+s.lng;}).join(',');
    if(key!==lastKey){
      lastKey=key;cluster.clearLayers();mk={};selKeys=[];
      var arr=[];
      d.stops.forEach(function(s){
        var k=s.id+':'+s.pi;
        var m=L.marker([s.lat,s.lng],{icon:icon(s.t,false,d.accent,d.dark)});
        m._t=s.t;
        m.on('click',function(){parent.postMessage({src:'matbus-map',type:'select',id:s.id,pi:s.pi},'*');});
        mk[k]=m;arr.push(m);
      });
      addAll(arr);
    }
    var want=[];
    if(d.selectedId!=null){Object.keys(mk).forEach(function(k){var p=k.split(':');
      if(p[0]===String(d.selectedId)&&(d.selectedPi==null||String(d.selectedPi)===p[1]))want.push(k);});}
    selKeys.forEach(function(k){if(mk[k]&&want.indexOf(k)<0){mk[k].setIcon(icon(mk[k]._t,false,d.accent,d.dark));mk[k].setZIndexOffset(0);}});
    want.forEach(function(k){if(mk[k]&&selKeys.indexOf(k)<0){mk[k].setIcon(icon(mk[k]._t,true,d.accent,d.dark));mk[k].setZIndexOffset(1000);}});
    selKeys=want;
    var nk=d.pin?(d.pin.lat+','+d.pin.lng):'';
    if(nk!==pinKey){
      if(pinMarker){map.removeLayer(pinMarker);pinMarker=null;}
      pinKey=nk;
      if(d.pin){pinMarker=L.marker([d.pin.lat,d.pin.lng],{icon:L.divIcon({className:'',iconSize:[30,30],iconAnchor:[15,30],html:'<div class="pinwrap" style="--acc:'+d.accent+'"><div class="pinbody" style="position:relative"></div></div>'}),zIndexOffset:2000}).addTo(map);}
    }
    if(d.user){
      var ll=[d.user.lat,d.user.lng];
      var heading=Number.isFinite(d.userHeading)?d.userHeading:null;
      var gpsHtml='<div class="user-gps"><div class="gps-halo"></div><div class="gps-heading"></div><div class="gps-dot"></div></div>';
      if(!userMarker){userMarker=L.marker(ll,{icon:L.divIcon({className:'gps-icon',iconSize:[42,42],iconAnchor:[21,21],html:gpsHtml}),interactive:false,zIndexOffset:3000}).addTo(map);}
      else userMarker.setLatLng(ll);
      var gpsElement=userMarker.getElement&&userMarker.getElement();
      var headingElement=gpsElement&&gpsElement.querySelector('.gps-heading');
      if(headingElement){headingElement.style.transform='rotate('+(heading==null?0:heading)+'deg)';headingElement.style.opacity=heading==null?'0':'1';}
      var acc=Number(d.userAccuracy);
      if(Number.isFinite(acc)&&acc>0&&acc<=150){
        if(!userAccuracyCircle)userAccuracyCircle=L.circle(ll,{radius:acc,color:'#0A84FF',weight:1,opacity:.4,fillColor:'#0A84FF',fillOpacity:.08,interactive:false}).addTo(map);
        else userAccuracyCircle.setLatLng(ll).setRadius(acc);
      }else if(userAccuracyCircle){map.removeLayer(userAccuracyCircle);userAccuracyCircle=null;}
      if(d.follow){
        if(!wasFollowing)map.flyTo(ll,Math.max(map.getZoom(),16),{duration:.65});
        else if(map.getCenter().distanceTo(L.latLng(ll[0],ll[1]))>18)map.panTo(ll,{animate:true,duration:.5});
        wasFollowing=true;
      }else wasFollowing=false;
    }else{
      if(userMarker){map.removeLayer(userMarker);userMarker=null;}
      if(userAccuracyCircle){map.removeLayer(userAccuracyCircle);userAccuracyCircle=null;}
      wasFollowing=false;
    }
  }
  if(d.type==='journey'){drawJourney(d.route,d.accent,d.dark);}
  if(d.type==='fit'&&d.bounds){map.fitBounds(d.bounds,{paddingTopLeft:[40,100],paddingBottomRight:[40,310],maxZoom:18});}
  if(d.type==='focus'){map.flyTo([d.lat,d.lng],Math.max(map.getZoom(),16),{duration:.7});}
});
</script></body></html>`;

export default function LeafletMap({ stops, selectedId, selectedPlatform, pin, route, fit, onTap, user, userAccuracy = null, userHeading = null, followUser = false, onMapInteraction = () => {}, focus, dark, accent, onSelect }: MapProps) {
  const ref = useRef<any>(null);
  const [ready, setReady] = useState(false);

  const markers = useMemo(
    () =>
      stops.flatMap((s) => {
        const pts = s.platforms.length
          ? s.platforms
          : s.latitude != null ? [{ latitude: s.latitude, longitude: s.longitude as number }] : [];
        return pts.map((p: any, pi) => {
          const own = p.modes ? typesOfMask(p.modes).filter((x) => s.types.includes(x)) : s.types;
          const ty = own.length ? own : s.types;
          return { id: s.id, pi, lat: p.latitude, lng: p.longitude, t: ty.length === 1 ? ty[0] : 'multi' };
        });
      }),
    [stops]
  );

  const post = (msg: any) => ref.current?.contentWindow?.postMessage({ src: 'matbus', ...msg }, '*');

  useEffect(() => {
    if (!ready) return;
    post({
      type: 'state',
      stops: markers,
      selectedId,
      selectedPi: selectedPlatform,
      pin: pin ? { lat: pin.latitude, lng: pin.longitude } : null,
      dark,
      accent,
      user: user ? { lat: user.latitude, lng: user.longitude } : null,
      userAccuracy,
      userHeading,
      follow: followUser,
    });
  }, [ready, markers, selectedId, selectedPlatform, pin, dark, accent, user, userAccuracy, userHeading, followUser]);

  useEffect(() => {
    if (ready) post({ type: 'journey', route, accent, dark });
  }, [ready, route, accent, dark]);

  useEffect(() => {
    if (ready && fit) post({ type: 'fit', bounds: fit.bounds });
  }, [ready, fit?.nonce]);

  useEffect(() => {
    if (ready && focus) post({ type: 'focus', lat: focus.latitude, lng: focus.longitude });
  }, [ready, focus?.nonce]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.src !== 'matbus-map' || e.source !== ref.current?.contentWindow) return;
      if (e.data.type === 'select') onSelect(e.data.id, e.data.pi ?? 0);
      if (e.data.type === 'tap') onTap(e.data.lat, e.data.lng);
      if (e.data.type === 'user-interaction') onMapInteraction();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onSelect, onTap, onMapInteraction]);

  return React.createElement('iframe', {
    ref,
    srcDoc: HTML,
    title: 'Карта Витебска',
    onLoad: () => setReady(true),
    style: { border: 0, width: '100%', height: '100%', display: 'block' },
  } as any);
}

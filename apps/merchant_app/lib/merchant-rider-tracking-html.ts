/**
 * Self-contained Mapbox-GL WebView map for merchant live rider tracking.
 *
 * Renders inside a react-native-webview (no native map SDK — same tech the customer app
 * uses, so it's identically smooth and lightweight). The smoothness is entirely in the
 * marker interpolation below: every position update EASES the rider marker from its
 * current point to the new one over a duration scaled by distance (requestAnimationFrame
 * + easeOutCubic), snaps only on first paint / large teleport, and rotates the bike icon
 * toward travel — the same DSA as the customer app's food-delivery script, trimmed to the
 * merchant's needs (rider + store/pickup/drop + route line). The RN side calls
 * `window.mtUpdate(payloadJson)` via injectJavaScript on each poll, so the map never
 * reloads — only the GeoJSON source + one marker move.
 */

const MAPBOX_GL_VERSION = "3.7.0";

function escToken(token: string): string {
  return token.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export type MerchantTrackingMapPayload = {
  riderLat: number | null;
  riderLng: number | null;
  riderHeading: number | null;
  storeLat: number | null;
  storeLng: number | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropLat: number | null;
  dropLng: number | null;
  /** Road/driving route rider→store when available; else empty (straight connector used). */
  route: Array<{ latitude: number; longitude: number }>;
  /** true after delivery / no live fix — freeze the marker, stop following. */
  ended?: boolean;
};

export function buildMerchantTrackingMapHtml(
  token: string,
  center: { latitude: number; longitude: number }
): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link href="https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_GL_VERSION}/mapbox-gl.css" rel="stylesheet" />
  <script src="https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_GL_VERSION}/mapbox-gl.js"><\/script>
  <style>
    html,body,#map{margin:0;padding:0;height:100%;width:100%;background:#eef2f5;}
    .mt-pin{width:26px;height:26px;border-radius:50%;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);}
    .mt-store{background:#f97316;}
    .mt-drop{background:#16a34a;}
    .mt-rider{width:30px;height:30px;border-radius:50%;background:#111827;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;transition:transform .15s linear;}
    .mt-rider:after{content:"";width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:11px solid #f97316;transform:translateY(-1px);}
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
  (function(){
    mapboxgl.accessToken = '${escToken(token)}';
    var map = new mapboxgl.Map({
      container:'map', style:'mapbox://styles/mapbox/streets-v12',
      center:[${center.longitude}, ${center.latitude}], zoom:14.5, attributionControl:false
    });
    map.addControl(new mapboxgl.NavigationControl({showCompass:false}), 'top-right');

    var markers = {};       // key -> mapboxgl.Marker
    var riderState = { frame:null, headingFrame:null, heading:0, lngLat:null, painted:false };
    var followRider = true; // stops following once the user pans/zooms
    var boundsFitted = false;

    function toRad(d){ return d*Math.PI/180; }
    function toDeg(r){ return r*180/Math.PI; }
    function haversineM(a, b){
      var R=6371000, dLat=toRad(b[1]-a[1]), dLng=toRad(b[0]-a[0]);
      var s=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(toRad(a[1]))*Math.cos(toRad(b[1]))*Math.sin(dLng/2)*Math.sin(dLng/2);
      return 2*R*Math.asin(Math.sqrt(s));
    }
    function bearing(a, b){
      var y=Math.sin(toRad(b[0]-a[0]))*Math.cos(toRad(b[1]));
      var x=Math.cos(toRad(a[1]))*Math.sin(toRad(b[1]))-Math.sin(toRad(a[1]))*Math.cos(toRad(b[1]))*Math.cos(toRad(b[0]-a[0]));
      return (toDeg(Math.atan2(y,x))+360)%360;
    }
    function easeOutCubic(t){ return 1-Math.pow(1-t,3); }

    function setPin(key, lat, lng, cls){
      if(lat==null||lng==null||!isFinite(lat)||!isFinite(lng)){
        if(markers[key]){ markers[key].remove(); delete markers[key]; }
        return;
      }
      if(!markers[key]){
        var el=document.createElement('div'); el.className='mt-pin '+cls;
        markers[key]=new mapboxgl.Marker({element:el, anchor:'center'}).setLngLat([lng,lat]).addTo(map);
      } else { markers[key].setLngLat([lng,lat]); }
    }

    function rotateRider(deg){
      var m=markers.rider; if(!m) return;
      var el=m.getElement(); if(!el) return;
      var from=riderState.heading, delta=((deg-from+540)%360)-180, dur=260, start=performance.now();
      if(riderState.headingFrame) cancelAnimationFrame(riderState.headingFrame);
      function step(now){
        var t=Math.min(1,(now-start)/dur), ang=from+delta*easeOutCubic(t);
        el.style.transform='rotate('+ang+'deg)';
        if(t<1){ riderState.headingFrame=requestAnimationFrame(step); }
        else { riderState.heading=(from+delta+360)%360; riderState.headingFrame=null; }
      }
      riderState.headingFrame=requestAnimationFrame(step);
    }

    // The smoothness core: ease the rider marker from its current point to the new GPS.
    function setRider(lat, lng, heading){
      if(lat==null||lng==null||!isFinite(lat)||!isFinite(lng)) return;
      var to=[lng,lat];
      if(!markers.rider){
        var el=document.createElement('div'); el.className='mt-rider';
        markers.rider=new mapboxgl.Marker({element:el, anchor:'center'}).setLngLat(to).addTo(map);
        riderState.lngLat=to; riderState.painted=true;
        if(heading!=null&&isFinite(heading)) rotateRider(heading);
        return;
      }
      var from=riderState.lngLat||to;
      var dist=haversineM(from,to);
      var hdg=(heading!=null&&isFinite(heading))?heading:(dist>1?bearing(from,to):riderState.heading);
      rotateRider(hdg);
      // Snap on tiny jitter or a large teleport; otherwise ease over distance-scaled time.
      if(dist<0.6 || dist>1500){
        if(riderState.frame){ cancelAnimationFrame(riderState.frame); riderState.frame=null; }
        markers.rider.setLngLat(to); riderState.lngLat=to;
      } else {
        var dur=Math.min(2600, Math.max(420, dist*46)), start=performance.now();
        if(riderState.frame) cancelAnimationFrame(riderState.frame);
        function step(now){
          var t=easeOutCubic(Math.min(1,(now-start)/dur));
          var cur=[from[0]+(to[0]-from[0])*t, from[1]+(to[1]-from[1])*t];
          markers.rider.setLngLat(cur); riderState.lngLat=cur;
          if(t<1){ riderState.frame=requestAnimationFrame(step); }
          else { riderState.frame=null; riderState.lngLat=to; markers.rider.setLngLat(to); }
        }
        riderState.frame=requestAnimationFrame(step);
      }
      if(followRider){ try{ map.easeTo({center:to, duration:460, essential:true}); }catch(e){} }
    }

    function ensureRouteLayer(){
      if(map.getSource('mt-route')) return;
      map.addSource('mt-route',{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[]}}});
      map.addLayer({id:'mt-route-casing',type:'line',source:'mt-route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#ffffff','line-width':7,'line-opacity':.9}});
      map.addLayer({id:'mt-route-line',type:'line',source:'mt-route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#f97316','line-width':4,'line-opacity':.95}});
    }
    function setRoute(coords){
      ensureRouteLayer();
      var src=map.getSource('mt-route');
      if(src) src.setData({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords.length>=2?coords:[]}});
    }

    // Called by RN on every poll. Idempotent; never reloads the map.
    window.mtUpdate = function(json){
      var p; try{ p=JSON.parse(json); }catch(e){ return; }
      setPin('store', p.storeLat, p.storeLng, 'mt-store');
      if(p.pickupLat!=null && (p.storeLat==null || haversineM([p.pickupLng,p.pickupLat],[p.storeLng,p.storeLat])>40)){
        setPin('pickup', p.pickupLat, p.pickupLng, 'mt-store');
      }
      setPin('drop', p.dropLat, p.dropLng, 'mt-drop');
      var route=(p.route||[]).map(function(r){return [r.longitude,r.latitude];}).filter(function(c){return isFinite(c[0])&&isFinite(c[1]);});
      if(route.length<2 && p.riderLat!=null && p.storeLat!=null){ route=[[p.riderLng,p.riderLat],[p.storeLng,p.storeLat]]; }
      setRoute(route);
      if(!p.ended) setRider(p.riderLat, p.riderLng, p.riderHeading);

      if(!boundsFitted){
        var pts=[]; if(p.riderLat!=null) pts.push([p.riderLng,p.riderLat]);
        if(p.storeLat!=null) pts.push([p.storeLng,p.storeLat]); if(p.dropLat!=null) pts.push([p.dropLng,p.dropLat]);
        if(pts.length===1){ map.easeTo({center:pts[0],zoom:15,duration:600}); boundsFitted=true; }
        else if(pts.length>=2){ var b=new mapboxgl.LngLatBounds(); pts.forEach(function(c){b.extend(c);}); map.fitBounds(b,{padding:60,maxZoom:16,duration:600}); boundsFitted=true; }
      }
    };

    // The moment the merchant interacts, stop auto-following so their pan/zoom sticks.
    map.on('dragstart', function(){ followRider=false; });
    map.on('zoomstart', function(e){ if(e.originalEvent) followRider=false; });

    map.on('load', function(){
      ensureRouteLayer(); map.resize();
      if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'})); }
    });
  })();
  <\/script>
</body>
</html>`;
}

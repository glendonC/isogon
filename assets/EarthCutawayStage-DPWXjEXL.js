const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/GLTFLoader-C8Ag2Ruc.js","assets/three.module-CibWwfTb.js","assets/DRACOLoader-LNaB3iNp.js"])))=>i.map(i=>d[i]);
var hd=Object.defineProperty;var dd=(e,t,a)=>t in e?hd(e,t,{enumerable:!0,configurable:!0,writable:!0,value:a}):e[t]=a;var F=(e,t,a)=>dd(e,typeof t!="symbol"?t+"":t,a);import{D as dr,_ as ou,r as Pt,E as fd,H as iu,I as md,j as Zt,J as pd}from"./index-CdgYaAW7.js";import{S as po,O as sl,W as Qt,C as Ve,R as ro,L as Be,H as za,a as It,b as Et,M as Sa,P as tn,c as D,D as Ra,d as ta,e as hh,F as ol,N as vo,f as vd,g as ut,U as Ot,B as an,h as ga,i as dh,V as W,j as nu,k as Ua,I as gd,T as il,l as Xa,m as Le,n as pa,o as fr,p as xd,q as wd,r as De,s as sn,t as Zi,u as so,v as Ns,w as Md,E as nl,x as fh,y as Os,z as rl,A as ll,G as mh,J as yd,K as bd,Q as ph,X as Sd,Y as lo,Z as to,_ as Td,$ as Ed,a0 as Rd,a1 as Ad,a2 as _d,a3 as mr,a4 as kd,a5 as Fd,a6 as vh,a7 as Ko,a8 as pr,a9 as Dd,aa as Pd,ab as Id,ac as Cd,ad as Ld,ae as Nd}from"./three.module-CibWwfTb.js";import{n as zd,p as Ud,a as Bd,b as Od,D as ao,f as Qi,c as gh}from"./types-CZu1tyoc.js";const ji=6360,cl=60,xh=8,wh=1.2,co=[.005802,.013558,.0331],Hd=.003996,Xi=.00444,uo=[65e-5,.001881,85e-6],Gd=.8,hs=64,zs=32,ho=-.2,Kd=192,Wd=108,fo=[5.25,5.05,4.8],Vd=.4,vr=.4,Yd=.72;function $d(e){return Math.max(0,1-Math.abs(e-25)/15)}function Mh(e,t){const a=ji+e,s=ji+cl,o=a*a*(t*t-1)+s*s,i=Math.max(0,-a*t+Math.sqrt(Math.max(0,o))),l=48,h=i/l;let r=0,u=0,d=0;for(let p=0;p<l;p++){const M=(p+.5)*h,b=Math.max(0,Math.sqrt(a*a+M*M+2*a*M*t)-ji);r+=Math.exp(-b/xh)*h,u+=Math.exp(-b/wh)*h,d+=$d(b)*h}return[co[0]*r+Xi*u+uo[0]*d,co[1]*r+Xi*u+uo[1]*d,co[2]*r+Xi*u+uo[2]*d]}function yh(e,t){const a=Mh(Math.max(0,e),Math.max(ho,t));return[Math.exp(-a[0]),Math.exp(-a[1]),Math.exp(-a[2])]}function jd(e,t,a){const s=yh(e,t),o=[1.404,1.287,1.17];return a.set(.5*o[0]+.5*fo[0]*s[0]/Math.PI,.5*o[1]+.5*fo[1]*s[1]/Math.PI,.5*o[2]+.5*fo[2]*s[2]/Math.PI)}function Xd(){const e=new Uint16Array(hs*zs*4);for(let a=0;a<zs;a++){const s=a/(zs-1),o=s*s*cl;for(let i=0;i<hs;i++){const l=ho+i/(hs-1)*(1-ho),h=Mh(o,l),r=(a*hs+i)*4;e[r]=Ra.toHalfFloat(Math.exp(-h[0])),e[r+1]=Ra.toHalfFloat(Math.exp(-h[1])),e[r+2]=Ra.toHalfFloat(Math.exp(-h[2])),e[r+3]=Ra.toHalfFloat(1)}}const t=new ta(e,hs,zs,It,za);return t.minFilter=Be,t.magFilter=Be,t.wrapS=Ve,t.wrapT=Ve,t.generateMipmaps=!1,t.flipY=!1,t.needsUpdate=!0,t}function wt(e){const t=e.toPrecision(8);return/[.e]/.test(t)?t:`${t}.0`}const on=`
const float ATM_RG = ${wt(ji)};
const float ATM_TOP = ${wt(cl)};
const float ATM_HR = ${wt(xh)};
const float ATM_HM = ${wt(wh)};
const vec3 ATM_BETA_R = vec3(${wt(co[0])}, ${wt(co[1])}, ${wt(co[2])});
const float ATM_BETA_MS = ${wt(Hd)};
const float ATM_BETA_ME = ${wt(Xi)};
const vec3 ATM_BETA_O = vec3(${wt(uo[0])}, ${wt(uo[1])}, ${wt(uo[2])});
const vec3 ATM_SUN = vec3(${wt(fo[0])}, ${wt(fo[1])}, ${wt(fo[2])});
const float ATM_PI = 3.14159265;
// Multiple scattering, approximated: an isotropic share on top of the phase function, larger
// where the air scatters more (blue), and part of the light scattered out of a path counted as
// returning to it. Without this a single-scattering horizon turns yellow-green.
const vec3 ATM_MS = vec3(0.020, 0.030, 0.055);
const vec3 ATM_RETURN = vec3(0.92, 0.82, 0.62);

float atmRayleighPhase(float c) {
  return 3.0 / (16.0 * ATM_PI) * (1.0 + c * c);
}

float atmMiePhase(float c) {
  const float g = ${wt(Gd)};
  float g2 = g * g;
  return 3.0 / (8.0 * ATM_PI) * ((1.0 - g2) * (1.0 + c * c))
       / ((2.0 + g2) * pow(max(1e-4, 1.0 + g2 - 2.0 * g * c), 1.5));
}

// Optical depth of a straight segment of length distKm between altitudes h0 and h1 (km), for an
// exponential layer of scale height H. Exact when altitude changes linearly along the segment.
float atmLayerDepth(float h0, float h1, float distKm, float H) {
  float dh = h1 - h0;
  float e0 = exp(-max(h0, 0.0) / H);
  float e1 = exp(-max(h1, 0.0) / H);
  return distKm * (abs(dh) < 0.02 ? e0 : H * (e0 - e1) / dh);
}

// Aerial perspective between the camera and a surface point (true scale, km).
// Returns the transmittance of the segment; inscatter receives the light scattered into it.
vec3 atmAerialPerspective(
  float camAltKm, float pointAltKm, float distKm, float cosSun, vec3 sunTrans, out vec3 inscatter
) {
  float dR = atmLayerDepth(camAltKm, pointAltKm, distKm, ATM_HR);
  float dM = atmLayerDepth(camAltKm, pointAltKm, distKm, ATM_HM);
  vec3 tauR = ATM_BETA_R * dR;
  float tauM = ATM_BETA_ME * dM;
  vec3 trans = exp(-(tauR + vec3(tauM)));
  // Single scattering with the sun transmittance held at its value for the segment, plus the
  // multiple scattering approximation
  vec3 source = ATM_BETA_R * dR * (vec3(atmRayleighPhase(cosSun)) + ATM_MS)
              + vec3(ATM_BETA_MS * dM) * (atmMiePhase(cosSun) + 0.02);
  vec3 tauEff = max((tauR + vec3(tauM)) * ATM_RETURN, vec3(1e-6));
  inscatter = ATM_SUN * sunTrans * source * (1.0 - exp(-tauEff)) / tauEff;
  return trans;
}
`,nn=`
uniform float uNight; // 0 by day, 1 on a night overpass of a real run
// How much brighter the moonlit ground is drawn than in a close view: 1 or more. The whole block
// seen from far is a small dark shape on a dark page and its relief has to read; a material that
// does not set it (the sky) gets 1.
uniform float uMoonLift;
vec3 nightGrade(vec3 c) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // Relief keeps its contrast up to the brightness of ordinary ground. Anything brighter (bare
  // rock, snow, a quarry, glint on water) is held just above that, so no ground the moon lights
  // is brighter than the dimmest fire light.
  float held = l < 0.22 ? l : 0.22 + 0.06 * (1.0 - exp(-(l - 0.22) / 0.06));
  held *= mix(1.0, 0.7, smoothstep(0.45, 0.9, l));
  vec3 moon = mix(vec3(l), c, 0.3) * (held / max(l, 1e-4)) * vec3(0.150, 0.215, 0.352) * max(uMoonLift, 1.0);
  return mix(c, moon, uNight);
}
`,bh=`
uniform sampler2D uTransmittanceLut;

vec3 atmTransmittanceToSpace(float hKm, float mu) {
  float u = (clamp(mu, ${wt(ho)}, 1.0) - (${wt(ho)})) / ${wt(1-ho)};
  float v = sqrt(clamp(hKm / ATM_TOP, 0.0, 1.0));
  vec2 uv = vec2(u * ${wt((hs-1)/hs)} + ${wt(.5/hs)}, v * ${wt((zs-1)/zs)} + ${wt(.5/zs)});
  return texture2D(uTransmittanceLut, uv).rgb;
}
`,rn=`
float atmHorizonAngle(float camAltKm) {
  float r = ATM_RG + camAltKm;
  return acos(-sqrt(max(0.0, 1.0 - (ATM_RG * ATM_RG) / (r * r))));
}

// What the backdrop shows in a true-scale direction (without the sun disc): sky above the horizon
// and the floor below it. The dome draws this, and the terrain dissolves its far edge into it.
//
// The floor is a backdrop, not data. With the interface on it stays dark when seen from above
// (floorHaze is a fraction of the physical air path); in clean feed it reads as distant ground
// under the air path. It always fades out completely within the last two degrees, so it meets the
// sky at the horizon without a step.
vec3 atmBackdrop(
  sampler2D skyView, vec3 dir, vec3 sun, float camAlt, float exposure, vec3 floorColor, float floorHaze
) {
  float thetaH = atmHorizonAngle(camAlt);
  float theta = acos(clamp(dir.y, -1.0, 1.0));
  float above = max(thetaH - theta, 0.0);
  float phi = atan(dir.z, dir.x) - atan(sun.z, sun.x);
  // Below the horizon this reads the horizon row, which is the color the floor fades into
  vec3 sky = texture2D(skyView, vec2(phi / (2.0 * ATM_PI), sqrt(above / thetaH))).rgb * exposure;
  if (theta < thetaH) {
    return sky;
  }
  float r = ATM_RG + camAlt;
  float mu = dir.y;
  float distKm = -r * mu - sqrt(max(0.0, r * r * (mu * mu - 1.0) + ATM_RG * ATM_RG));
  vec3 unused;
  vec3 trans = atmAerialPerspective(camAlt, 0.0, distKm * floorHaze, dot(dir, sun), vec3(1.0), unused);
  float clear = trans.g * smoothstep(0.0, 0.035, theta - thetaH);
  return mix(sky, floorColor, clear);
}
`,qd=`
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`,Zd=`
${on}
${bh}
${rn}

uniform float uSunSin;   // sine of the sun elevation
uniform float uCamAltKm;
varying vec2 vUv;

void main() {
  float camAlt = clamp(uCamAltKm, 0.02, ATM_TOP - 1.0);
  float thetaH = atmHorizonAngle(camAlt);
  float theta = thetaH - vUv.y * vUv.y * thetaH;
  float phi = vUv.x * 2.0 * ATM_PI;
  vec3 dir = vec3(sin(theta) * cos(phi), cos(theta), sin(theta) * sin(phi));
  vec3 sun = vec3(sqrt(max(0.0, 1.0 - uSunSin * uSunSin)), uSunSin, 0.0);

  float r = ATM_RG + camAlt;
  float mu = dir.y;
  float rt = ATM_RG + ATM_TOP;
  float dist = -r * mu + sqrt(max(0.0, r * r * (mu * mu - 1.0) + rt * rt));
  float cosSun = dot(dir, sun);
  float phaseR = atmRayleighPhase(cosSun);
  float phaseM = atmMiePhase(cosSun);

  const int STEPS = 24;
  vec3 radiance = vec3(0.0);
  vec3 tau = vec3(0.0);
  float prev = 0.0;
  for (int i = 0; i < STEPS; i++) {
    // Samples are denser near the camera, where the air is thickest
    float s1 = float(i + 1) / float(STEPS);
    float t1 = dist * s1 * s1;
    float ds = t1 - prev;
    float t = prev + 0.5 * ds;
    prev = t1;
    vec3 p = vec3(0.0, r, 0.0) + dir * t;
    float pr = length(p);
    float h = max(0.0, pr - ATM_RG);
    float rhoR = exp(-h / ATM_HR);
    float rhoM = exp(-h / ATM_HM);
    float rhoO = max(0.0, 1.0 - abs(h - 25.0) / 15.0);
    vec3 dTau = (ATM_BETA_R * rhoR + vec3(ATM_BETA_ME * rhoM) + ATM_BETA_O * rhoO) * ds;
    vec3 transCam = exp(-(tau + 0.5 * dTau) * ATM_RETURN);
    vec3 transSun = atmTransmittanceToSpace(h, dot(p, sun) / pr);
    vec3 scatter = ATM_BETA_R * rhoR * (vec3(phaseR) + ATM_MS) + vec3(ATM_BETA_MS * rhoM) * (phaseM + 0.02);
    radiance += transCam * transSun * scatter * ds;
    tau += dTau;
  }
  gl_FragColor = vec4(radiance * ATM_SUN, 1.0);
}
`,Qd=`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,Jd=`
${on}
${bh}
${rn}

uniform sampler2D uSkyView;
uniform vec3 uSunTrue;             // unit vector toward the sun, true scale
uniform float uCamAltKm;
uniform float uVerticalExaggeration;
uniform vec3 uFloorColor;
uniform float uFloorHaze;
uniform float uSkyExposure;
${nn}
varying vec3 vDir;

void main() {
  // Stage direction to true direction: relief is exaggerated, so elevation angles are too
  vec3 d = normalize(vDir);
  vec3 dir = normalize(vec3(d.x, d.y / uVerticalExaggeration, d.z));
  vec3 sun = normalize(uSunTrue);
  float camAlt = clamp(uCamAltKm, 0.02, ATM_TOP - 1.0);

  vec3 color = atmBackdrop(uSkyView, dir, sun, camAlt, uSkyExposure, uFloorColor, uFloorHaze);
  if (acos(clamp(dir.y, -1.0, 1.0)) < atmHorizonAngle(camAlt)) {
    // Sun disc (angular radius about 0.27 degrees), bright enough to bloom
    float disc = smoothstep(0.999978, 0.999989, dot(dir, sun));
    if (disc > 0.0) {
      color += atmTransmittanceToSpace(camAlt, sun.y) * ATM_SUN * disc * 12.0 * (1.0 - uNight);
    }
  }
  // A little grain in the sky on top of the output dither: a slow gradient is the first thing a
  // video encoder turns into bands, and half a code of dither does not survive it
  float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  color *= 1.0 + (grain - 0.5) * 0.02;
  gl_FragColor = vec4(nightGrade(color), 1.0);
}
`;class ef{constructor(){F(this,"transmittance");F(this,"skyView");F(this,"scene",new po);F(this,"camera",new sl(-1,1,1,-1,0,1));F(this,"material");F(this,"quad");F(this,"lastSunSin",9);F(this,"lastAltKm",-9);this.transmittance=Xd(),this.skyView=new Qt(Kd,Wd,{format:It,type:za,depthBuffer:!1,stencilBuffer:!1,minFilter:Be,magFilter:Be,generateMipmaps:!1,wrapS:ro,wrapT:Ve}),this.material=new Et({vertexShader:qd,fragmentShader:Zd,uniforms:{uTransmittanceLut:{value:this.transmittance},uSunSin:{value:.5},uCamAltKm:{value:5}},depthTest:!1,depthWrite:!1,toneMapped:!1}),this.quad=new Sa(new tn(2,2),this.material),this.quad.frustumCulled=!1,this.scene.add(this.quad)}update(t,a,s){const o=D.clamp(a.y,-.15,1);if(Math.abs(o-this.lastSunSin)<1e-4&&Math.abs(s-this.lastAltKm)<.02)return;this.lastSunSin=o,this.lastAltKm=s,this.material.uniforms.uSunSin.value=o,this.material.uniforms.uCamAltKm.value=s;const i=t.getRenderTarget();t.setRenderTarget(this.skyView),t.render(this.scene,this.camera),t.setRenderTarget(i)}dispose(){this.transmittance.dispose(),this.skyView.dispose(),this.material.dispose(),this.quad.geometry.dispose()}}const Qo=14.8,Jo=10.8,Sh=511,Us=-.44,We=256,oo=24,tf=80,af=24,ds=["plumas_ca","lytton_bc","evia_greece","blue_mountains_au"],Xo={plumas_ca:{id:"plumas_ca",bbox:[-121.6,39.75,-120.75,40.35],widthKm:72.5,minElevM:313,maxElevM:2357,windDirUv:[.68,.73],paletteBase:[.14,.21,.14],paletteRidge:[.44,.43,.4],hasSeaCoast:!1},lytton_bc:{id:"lytton_bc",bbox:[-121.95,49.95,-121.2,50.52],widthKm:54,minElevM:195,maxElevM:2860,windDirUv:[.42,.91],paletteBase:[.24,.22,.16],paletteRidge:[.56,.54,.52],hasSeaCoast:!1},evia_greece:{id:"evia_greece",bbox:[23.02,38.62,23.62,39.12],widthKm:52,minElevM:0,maxElevM:1385,windDirUv:[-.62,-.78],paletteBase:[.27,.3,.2],paletteRidge:[.64,.6,.52],hasSeaCoast:!0},blue_mountains_au:{id:"blue_mountains_au",bbox:[150.02,-33.92,150.74,-33.32],widthKm:66,minElevM:68,maxElevM:1215,windDirUv:[.79,-.61],paletteBase:[.15,.22,.17],paletteRidge:[.54,.38,.27],hasSeaCoast:!1}};function sf(e){const t=ds.indexOf(e);return t>=0?t:0}function of(){const e=new Uint8Array(1024);for(let a=0;a<256;a++)e[a*4]=dr[a*3],e[a*4+1]=dr[a*3+1],e[a*4+2]=dr[a*3+2],e[a*4+3]=255;const t=new ta(e,256,1,It,Ot);return t.colorSpace=ut,t.minFilter=Be,t.magFilter=Be,t.wrapS=Ve,t.wrapT=Ve,t.needsUpdate=!0,t}function Ls(e,t=!0){const a=Math.max(2,Math.floor(Math.sqrt(e.length))),s=a*a,o=new Float32Array(s);let i=Number.POSITIVE_INFINITY,l=Number.NEGATIVE_INFINITY;for(let r=0;r<a;r++){const d=(t?a-1-r:r)*a,p=r*a;for(let M=0;M<a;M++){const b=Number.isFinite(e[d+M])?e[d+M]:0;o[p+M]=b,b<i&&(i=b),b>l&&(l=b)}}Number.isFinite(i)||(i=0),(!Number.isFinite(l)||l<=i+1)&&(l=i+1e3);const h=new ta(o,a,a,hh,ol);return h.internalFormat="R32F",h.minFilter=vo,h.magFilter=vo,h.wrapS=Ve,h.wrapT=Ve,h.flipY=!1,h.generateMipmaps=!1,h.needsUpdate=!0,{texture:h,aligned:o,gridRes:a,minElev:i,maxElev:l}}function ru(e,t=256){const a=Xo[e],s=new Float32Array(t*t),o=sf(e)*2.35;for(let i=0;i<t;i++){const h=(1-i/(t-1)-.5)*2;for(let r=0;r<t;r++){const d=(r/(t-1)-.5)*2,p=.24*Math.sin(h*2.7+o)+.11*Math.cos(h*5.6-o),M=Math.abs(d*.88-p),b=Math.pow(Math.min(1.3,M*1.18),.78),g=1-Math.abs(Math.sin(d*4.4+h*3.1+o)),A=1-Math.abs(Math.cos(d*8.9-h*7.4-o*.6)),R=.5+.5*Math.sin(d*18.5+h*16.2+o*1.3);let w=b*(.58+.28*g*g+.11*A+.04*R);if(a.hasSeaCoast){const x=1-Math.max(0,Math.hypot(d*.92,h*.84)-.62)*1.9;w=Math.max(0,w*x-.08)}s[i*t+r]=a.minElevM+Math.max(0,Math.min(1.05,w))*(a.maxElevM-a.minElevM)}}return s}function lu(e,t,a,s,o,i){const l=Xo[e],h=512,r=document.createElement("canvas");r.width=h,r.height=h;const u=r.getContext("2d");if(u){const p=u.createImageData(h,h),M=p.data,b=Math.max(100,o-s);for(let g=0;g<h;g++){const A=1-g/(h-1),R=Math.min(a-1,Math.max(0,Math.round(A*(a-1)))),w=Math.min(a-1,R+1);for(let x=0;x<h;x++){const S=x/(h-1),_=Math.min(a-1,Math.max(0,Math.round(S*(a-1)))),B=Math.min(a-1,_+1),I=t[R*a+_],P=t[R*a+B],U=t[w*a+_],G=Math.max(0,Math.min(1,(I-s)/b)),k=Math.min(1,Math.hypot(P-I,U-I)/48),V=.92+.08*Math.sin(x*.47+g*.31)*Math.cos(x*.19-g*.53);let Z,ge,we;if(l.hasSeaCoast&&I<=2.2)Z=.05,ge=.14+.04*V,we=.24+.05*V;else{const be=Math.min(1,Math.max(0,G*.72+k*.55));if(Z=(l.paletteBase[0]*(1-be)+l.paletteRidge[0]*be)*V,ge=(l.paletteBase[1]*(1-be)+l.paletteRidge[1]*be)*V,we=(l.paletteBase[2]*(1-be)+l.paletteRidge[2]*be)*V,l.maxElevM>2200&&G>.84){const Me=(G-.84)/.16;Z=Z*(1-Me*.55)+.78*Me*.55,ge=ge*(1-Me*.55)+.8*Me*.55,we=we*(1-Me*.55)+.84*Me*.55}}const Re=(g*h+x)*4;M[Re]=Math.min(255,Math.max(0,Math.round(Z*255))),M[Re+1]=Math.min(255,Math.max(0,Math.round(ge*255))),M[Re+2]=Math.min(255,Math.max(0,Math.round(we*255))),M[Re+3]=255}}u.putImageData(p,0,0)}const d=new vd(r);return d.colorSpace=ut,d.anisotropy=i,d.wrapS=Ve,d.wrapT=Ve,d.needsUpdate=!0,d}function cu(e,t=!0){const a=We*We*4,s=Math.max(1,Math.floor(e.byteLength/a));if(!t)return{buffer:e.slice(0,s*a),frames:s};const o=new Uint8Array(s*a),i=We*4;for(let l=0;l<s;l++){const h=l*a;for(let r=0;r<We;r++){const u=h+(We-1-r)*i,d=h+r*i;o.set(e.subarray(u,u+i),d)}}return{buffer:o,frames:s}}const ln=`
uniform sampler2D uDemPrev;
uniform sampler2D uDemNext;
uniform vec2 uDemRes;       // (prevGridRes, nextGridRes)
uniform vec2 uElevPrevRange; // (minElevM, maxElevM)
uniform vec2 uElevNextRange; // (minElevM, maxElevM)
uniform vec2 uReliefScale;   // world units per metre of elevation (prev, next)
uniform vec2 uSlabSize;      // world size of the slab (east-west, north-south)
uniform float uMorph;       // [0..1] smooth sub-orbital elevation & ortho morph
uniform float uEdgeFade;    // 1 in close views: the far edge of the slab is taken away

// Close views: how much of the terrain is taken away at this point (0 none, 1 all). It is a band
// along the slab's edges, and only where the edge is far from the camera: a near edge is a cut
// wall, not a horizon. The surface dissolves into the backdrop by this share AND sinks to the base
// by it, so a ridge that is no longer drawn cannot hide smoke or sky behind it.
// Ground that stands above the eye's horizon is in front of sky and is kept whole (edgeGoneAt): a
// far ridge on the skyline is depth, not a model edge. Only ground seen below the horizon goes.
const float EDGE_BAND = 3.0;   // world units, about 9 km
const float EDGE_SOLID = 0.67; // gone completely inside the last 2 km
float edgeGone(vec2 uv) {
  if (uEdgeFade < 0.003) return 0.0;
  vec2 e = min(uv, 1.0 - uv) * uSlabSize;
  float band = 1.0 - smoothstep(EDGE_SOLID, EDGE_BAND, min(e.x, e.y));
  vec3 at = vec3((uv.x - 0.5) * uSlabSize.x, 0.0, (0.5 - uv.y) * uSlabSize.y);
  float farSide = smoothstep(0.22, 0.42, distance(at, cameraPosition) / max(uSlabSize.x, uSlabSize.y));
  return uEdgeFade * band * farSide;
}

float belowHorizon(vec3 worldPos) {
  vec3 d = worldPos - cameraPosition;
  return smoothstep(0.01, -0.05, d.y / max(length(d), 1e-3));
}

float edgeGoneAt(vec2 uv, float worldY) {
  float gone = edgeGone(uv);
  if (gone <= 0.0) return 0.0;
  return gone * belowHorizon(vec3((uv.x - 0.5) * uSlabSize.x, worldY, (0.5 - uv.y) * uSlabSize.y));
}

float sampleR32FBilinear(sampler2D demTex, vec2 uv, float res) {
  vec2 clamped = clamp(uv, vec2(0.0), vec2(1.0));
  vec2 coord = clamped * (res - 1.0);
  vec2 i0 = floor(coord);
  vec2 f = coord - i0;
  vec2 i1 = min(i0 + vec2(1.0), vec2(res - 1.0));

  float invRes = 1.0 / res;
  float h00 = texture2D(demTex, (i0 + vec2(0.5, 0.5)) * invRes).r;
  float h10 = texture2D(demTex, (vec2(i1.x, i0.y) + vec2(0.5, 0.5)) * invRes).r;
  float h01 = texture2D(demTex, (vec2(i0.x, i1.y) + vec2(0.5, 0.5)) * invRes).r;
  float h11 = texture2D(demTex, (i1 + vec2(0.5, 0.5)) * invRes).r;

  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}

float sampleWorldHeightPrev(vec2 uv, out float elevM) {
  elevM = sampleR32FBilinear(uDemPrev, uv, uDemRes.x);
  float span = max(350.0, uElevPrevRange.y - uElevPrevRange.x);
  return clamp(elevM - uElevPrevRange.x, 0.0, span * 1.15) * uReliefScale.x;
}

float sampleWorldHeightNext(vec2 uv, out float elevM) {
  elevM = sampleR32FBilinear(uDemNext, uv, uDemRes.y);
  float span = max(350.0, uElevNextRange.y - uElevNextRange.x);
  return clamp(elevM - uElevNextRange.x, 0.0, span * 1.15) * uReliefScale.y;
}

// Context terrain (optional): elevation in metres around the pack, uContextScale times
// its side, same centre and axes. Where it is drawn (uContextMix 1) the pack takes the context
// surface over the last stretch before its edge, so the two meet without a step and nothing has
// to dissolve there.
uniform sampler2D uContextDem;
uniform float uContextRes;    // posts per side
uniform float uContextScale;  // context side over pack side
uniform float uContextMix;
const float CONTEXT_JOIN = 0.02; // share of the pack's side over which it joins the context

float contextJoin(vec2 uv) {
  if (uContextMix < 0.003) return 0.0;
  vec2 e = min(uv, 1.0 - uv);
  return (1.0 - smoothstep(0.0, CONTEXT_JOIN, min(e.x, e.y))) * uContextMix;
}

// World height of the context surface at a pack uv (which may lie outside 0..1). Not clamped to
// the pack's elevation range: ground beyond the pack can be lower than its lowest point.
float contextWorldY(vec2 uv) {
  float elevM = sampleR32FBilinear(uContextDem, (uv - 0.5) / uContextScale + 0.5, uContextRes);
  return (elevM - uElevNextRange.x) * uReliefScale.y;
}

float evalTerrainWorldY(vec2 uv, out float blendedElevM) {
  float e1 = 0.0;
  float y = sampleWorldHeightNext(uv, e1);
  blendedElevM = e1;
  // Outside a region morph only the current heightfield is read
  if (uMorph <= 0.999) {
    float e0 = 0.0;
    float y0 = sampleWorldHeightPrev(uv, e0);
    blendedElevM = mix(e0, e1, uMorph);
    y = mix(y0, y, uMorph);
  }
  float join = contextJoin(uv);
  if (join > 0.0) y = mix(y, contextWorldY(uv), join);
  return y * (1.0 - edgeGoneAt(uv, y));
}

float evalTerrainWorldYFast(vec2 uv) {
  float dummy = 0.0;
  return evalTerrainWorldY(uv, dummy);
}
`;function uu(e=Sh){const a=(e+1)*2*4,s=e*6*4,o=new Float32Array(a*3),i=new Float32Array(a*3),l=new Float32Array(a*4),h=new Uint32Array(s),r=[{normal:[0,0,1],evalUv:M=>[M,0]},{normal:[1,0,0],evalUv:M=>[1,M]},{normal:[0,0,-1],evalUv:M=>[1-M,1]},{normal:[-1,0,0],evalUv:M=>[0,1-M]}];let u=0,d=0;for(let M=0;M<4;M++){const b=r[M],g=u;for(let A=0;A<=e;A++){const R=A/e,[w,x]=b.evalUv(R),S=(w-.5)*Qo,_=(.5-x)*Jo,B=M+R;o[u*3]=S,o[u*3+1]=0,o[u*3+2]=_,i[u*3]=b.normal[0],i[u*3+1]=b.normal[1],i[u*3+2]=b.normal[2],l[u*4]=w,l[u*4+1]=x,l[u*4+2]=1,l[u*4+3]=B,u++,o[u*3]=S,o[u*3+1]=Us,o[u*3+2]=_,i[u*3]=b.normal[0],i[u*3+1]=b.normal[1],i[u*3+2]=b.normal[2],l[u*4]=w,l[u*4+1]=x,l[u*4+2]=0,l[u*4+3]=B,u++}for(let A=0;A<e;A++){const R=g+A*2,w=R+1,x=R+2,S=R+3;h[d++]=R,h[d++]=w,h[d++]=x,h[d++]=x,h[d++]=w,h[d++]=S}}const p=new an;return p.setAttribute("position",new ga(o,3)),p.setAttribute("normal",new ga(i,3)),p.setAttribute("aSkirtParam",new ga(l,4)),p.setIndex(new ga(h,1)),p.boundingSphere=new dh(new W(0,.8,0),14),p}const nf=`
${ln}

attribute vec4 aSkirtParam; // (u, v, isTop, perimeterRun)

varying vec2 vEdgeUv;
varying float vSurfaceY;
varying float vSurfaceElevM;
varying float vWorldY;
varying float vRunParam;
varying vec3 vWallNormal;
varying vec3 vWorldPos;

void main() {
  vec2 edgeUv = aSkirtParam.xy;
  float isTop = aSkirtParam.z;
  float surfElevM = 0.0;
  float surfY = evalTerrainWorldY(edgeUv, surfElevM);

  float wy = mix(${Us.toFixed(2)}, surfY, isTop);
  vec3 displaced = vec3((edgeUv.x - 0.5) * uSlabSize.x, wy, (0.5 - edgeUv.y) * uSlabSize.y);
  vec4 worldPos = modelMatrix * vec4(displaced, 1.0);

  vEdgeUv = edgeUv;
  vSurfaceY = surfY;
  vSurfaceElevM = surfElevM;
  vWorldY = wy;
  vRunParam = aSkirtParam.w;
  vWallNormal = normalize(mat3(modelMatrix) * normal);
  vWorldPos = worldPos.xyz;

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`,rf=`
${nn}
uniform vec2 uElevPrevRange;
uniform vec2 uElevNextRange;
uniform vec2 uReliefScale;
uniform float uMorph;
uniform vec3 uSunDir;
uniform float uCutawayMix;
uniform float uCutawayPlane;
uniform vec2 uCutawayDir;

varying vec2 vEdgeUv;
varying float vSurfaceY;
varying float vSurfaceElevM;
varying float vWorldY;
varying float vRunParam;
varying vec3 vWallNormal;
varying vec3 vWorldPos;

void main() {
  float minRange = mix(uElevPrevRange.x, uElevNextRange.x, uMorph);
  float maxRange = mix(uElevPrevRange.y, uElevNextRange.y, uMorph);
  float spanM = max(350.0, maxRange - minRange);

  // Depth fraction from base (-0.44) up to surface (vSurfaceY)
  float wallSpan = max(0.08, vSurfaceY - (${Us.toFixed(2)}));
  float hFrac = clamp((vWorldY - (${Us.toFixed(2)})) / wallSpan, 0.0, 1.0);

  // Equivalent geological elevation in meters at this vertical cross-section pixel
  float pixelElevM = minRange + vWorldY / max(mix(uReliefScale.x, uReliefScale.y, uMorph), 1e-7);

  // Lithospheric basalt-slate gradient (#1d2129 -> #0d1016) with directional facet lighting
  vec3 topSlate = vec3(0.125, 0.145, 0.184);
  vec3 baseBasalt = vec3(0.048, 0.058, 0.082);
  vec3 wallCol = mix(baseBasalt, topSlate, pow(hFrac, 0.85));

  // Subtle folded sedimentary strata bands
  float foldWarp = 38.0 * sin(vRunParam * 5.2) + 16.0 * cos(vRunParam * 13.5);
  float strataA = 0.5 + 0.5 * sin((pixelElevM + foldWarp) * 0.036);
  float strataB = 0.5 + 0.5 * cos((pixelElevM - foldWarp * 0.6) * 0.095);
  wallCol *= 0.88 + 0.14 * strataA + 0.06 * strataB;

  // Architectural facet lighting across N / E / S / W cutaway faces
  float facetLight = 0.62 + 0.38 * max(0.0, dot(normalize(vWallNormal), normalize(vec3(uSunDir.x, 0.25, uSunDir.z))));
  wallCol *= facetLight;

  // Crisp 1px horizontal elevation datum lines every 500 m (500 m, 1,000 m, 1,500 m, 2,000 m, 2,500 m)
  float datumStep = 500.0;
  float datumPhase = pixelElevM / datumStep;
  float datumDist = abs(fract(datumPhase - 0.5) - 0.5) / max(fwidth(datumPhase), 0.002);
  float datumLine = (1.0 - smoothstep(0.45, 1.35, datumDist)) * step(120.0, pixelElevM);
  wallCol = mix(wallCol, vec3(0.44, 0.52, 0.64), datumLine * 0.34);

  // Clean top bevel rim hairline + base ground seam hairline
  float distFromTop = vSurfaceY - vWorldY;
  float topBevel = 1.0 - smoothstep(0.0, 0.018, distFromTop);
  float baseRule = 1.0 - smoothstep(0.0, 0.014, vWorldY - (${Us.toFixed(2)}));
  wallCol += vec3(0.18, 0.22, 0.29) * topBevel * 0.65;
  wallCol = mix(wallCol, vec3(0.24, 0.30, 0.40), baseRule * 0.42);

  // Continuation of the optical laser line down the vertical cliff face where the scan curtain slices it
  if (uCutawayMix > 0.01) {
    float scanCoord = dot(vEdgeUv - vec2(0.5), normalize(uCutawayDir)) - uCutawayPlane;
    float cliffLaser = exp(-abs(scanCoord) * 260.0) * uCutawayMix;
    wallCol += vec3(0.55, 0.90, 1.0) * cliffLaser * 0.72;
  }

  // By night the block's sides are lit a little more than its top, so the block and its edge
  // read against the dark page (the sides are only seen in the block views)
  gl_FragColor = vec4(mix(wallCol, wallCol * vec3(0.26, 0.34, 0.52), uNight), 1.0);
}
`,lf=`
varying vec3 vLocalPos;
varying vec3 vWorldPos;

void main() {
  vLocalPos = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,cf=`
uniform vec2 uSlabSize;
uniform float uShadowMix; // 1 = contact shadow drawn; 0 in close views, where it is a dark band past the far edge
varying vec3 vLocalPos;
varying vec3 vWorldPos;

float sdBox2D(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0);
}

void main() {
  // The floor under the block is quiet: one soft contact shadow, no grid, no rings, no axes
  float boxDist = sdBox2D(vWorldPos.xz, uSlabSize * 0.5);
  float contactShadow = 1.0 - smoothstep(-0.2, 2.6, boxDist);
  float reach = 1.0 - smoothstep(8.2, 14.5, length(vWorldPos.xz));
  gl_FragColor = vec4(vec3(0.015, 0.020, 0.030), contactShadow * contactShadow * 0.62 * reach * uShadowMix);
}
`;function uf(e){return Math.max(0,Math.min(e-1,Math.floor((e-1)*.52)))}const hf=11,df=.42,ff=8;function mf(e,t,a,s,o,i){const[l,h,r,u]=t,d=o.gridSize,p=uf(s),M=p*d*d*4,b=`pass ${p+1}`;let g=!1,A={gx:Math.round(d*.5),gy:Math.round(d*.5),zMw:0};for(let k=14;k<d-14;k+=2)for(let V=14;V<d-14;V+=2){const Z=a[M+(k*d+V)*4]/255*o.zMaxMwKm2;Z>A.zMw&&(A={gx:V,gy:k,zMw:Z},g=!0)}let R=!1,w=-1/0,x={gx:Math.round(d*.375),gy:Math.round(d*.42),zMw:0,modisMw:0};for(let k=14;k<d-14;k+=2)for(let V=14;V<d-14;V+=2){const Z=M+(k*d+V)*4,ge=a[Z]/255*o.zMaxMwKm2,we=a[Z+2]/255*o.zMaxMwKm2,Re=Math.hypot(V-A.gx,k-A.gy);if(ge>=hf&&we<ge*df&&Re>24){const be=i(V/(d-1),k/(d-1)),Me=ge-we*1.25-be*6e-4;Me>w&&(w=Me,x={gx:V,gy:k,zMw:ge,modisMw:we},R=!0)}}let S=!1,_={gx:Math.round(d*.640625),gy:Math.round(d*.40625),sigmaMw:0};for(let k=14;k<d-14;k+=2)for(let V=14;V<d-14;V+=2){const Z=M+(k*d+V)*4,ge=a[Z]/255*o.zMaxMwKm2,we=a[Z+1]/255*o.sigmaMaxMwKm2,Re=Math.hypot(V-A.gx,k-A.gy),be=Math.hypot(V-x.gx,k-x.gy);ge>=ff&&we>_.sigmaMw&&Re>28&&be>24&&(_={gx:V,gy:k,sigmaMw:we},S=!0)}const B=(k,V,Z,ge,we,Re,be)=>{const Me=Z/(d-1),pe=ge/(d-1);return{id:`${e}-${k}`,kind:V,title:we,subtitle:Re,valueText:be,lat:h+pe*(u-h),lon:l+Me*(r-l),elevM:Math.round(i(Me,pe))}},I=B("front-core","front",A.gx,A.gy,g?"Strongest estimate":"",g?`Highest value of the simulated 375 m estimate at ${b}`:"",g?`${A.zMw.toFixed(1)} MW/km², ${b}`:""),P=B("canyon-subpixel","subpixel",x.gx,x.gy,R?"Estimate above MODIS":"",R?`Simulated estimate where the simulated MODIS pass reads far less, at ${b}`:"",R?`${x.zMw.toFixed(1)} MW/km², MODIS ${x.modisMw.toFixed(1)} MW/km², ${b}`:""),U=B("sigma-peak","uncertainty",_.gx,_.gy,S?"Least certain estimate":"",S?`One standard deviation of the simulated estimate at ${b}`:"",S?`±${_.sigmaMw.toFixed(1)} MW/km² (1 sigma), ${b}`:""),G=[];return g&&G.push(I),R&&G.push(P),S&&G.push(U),{anchors:[I,P,U],callouts:G}}const pf=1,vf=2,gf=3,hu=24*3600*1e3;function xf(e,t,a,s){const o=new Uint8Array(e.length);for(let i=0;i<e.length;i++){const l=e[i];if(!(l>=1))continue;const h=t+(l-1)*hu,r=h+hu;o[i]=r<=a?pf:h>=s?gf:vf}return o}function wf(e,t,a,s=.375,o){if(o&&o.length===4&&o.every(p=>Number.isFinite(p))&&o[2]>o[0]&&o[3]>o[1])return[o[0],o[1],o[2],o[3]];const[i,l,,h]=e,r=(l+h)/2*(Math.PI/180),u=s/111.132,d=s/(111.132*Math.cos(r));return[i,l,i+t*d,l+a*u]}function Mf(e,t){const a=Math.max(1e-9,t[2]-t[0]),s=Math.max(1e-9,t[3]-t[1]);return[(e[2]-e[0])/a,(e[3]-e[1])/s,(e[0]-t[0])/a,(e[1]-t[1])/s]}const yf=()=>typeof performance<"u"?performance.now():Date.now();function bf(e=yf()){return null}const St={azimuth:.5,polar:.98,distance:17.2,target:[.1,.3,.2]},du={overview:{azimuth:.48,polar:.97,distance:17,target:[-.6,.3,.3]},canyon:{azimuth:-.34,polar:1.24,distance:5.6,target:[-.42,.45,-.22]},ridge:{azimuth:.86,polar:1.12,distance:7.4,target:[.32,.6,-.14]},nadir:{azimuth:0,polar:.14,distance:18.5,target:[0,.3,0]},region:{azimuth:.48,polar:.75,distance:17,target:[-.3,.3,.2]}},Sf={azimuth:0,polar:.42,distance:12,target:[0,.3,0]};function fu(e,t,a,s,o=!1){if(!t)return St;const i=e==="region"&&o?Sf:du[e]??du.overview;return a==="observer"&&e==="overview"?{azimuth:i.azimuth,polar:.98,distance:18.4,target:[0,.7,.2]}:{azimuth:i.azimuth,polar:i.polar,distance:i.distance,target:[i.target[0],i.target[1],i.target[2]]}}function Th(e){const t=Math.min(1,Math.max(0,e));return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)*.5}const qo=.95;class Tf{constructor(){F(this,"active",!1);F(this,"elapsedSec",0);F(this,"durationSec",qo);F(this,"startAzimuth",St.azimuth);F(this,"endAzimuth",St.azimuth);F(this,"startPolar",St.polar);F(this,"endPolar",St.polar);F(this,"startDistance",St.distance);F(this,"endDistance",St.distance);F(this,"startTarget",new W(...St.target));F(this,"endTarget",new W(...St.target));F(this,"hopHeightDist",2.15)}trigger(t,a,s=2.15,o=qo){this.active=!0,this.elapsedSec=0,this.durationSec=Math.max(.25,o),this.startAzimuth=t.azimuth;let i=a.azimuth-t.azimuth;for(;i>Math.PI;)i-=Math.PI*2;for(;i<-Math.PI;)i+=Math.PI*2;this.endAzimuth=t.azimuth+i,this.startPolar=t.polar,this.endPolar=a.polar,this.startDistance=t.distance,this.endDistance=a.distance,this.startTarget.copy(t.target),this.endTarget.set(a.target[0],a.target[1],a.target[2]),this.hopHeightDist=s}cancel(){this.active=!1}isActive(){return this.active}step(t,a){if(!this.active)return{slewActive:!1,rawProgress:1,easedProgress:1};this.elapsedSec+=Math.min(.08,Math.max(0,t));const s=Math.min(1,this.elapsedSec/this.durationSec),o=Th(s),i=Math.sin(s*Math.PI);return a.azimuth=D.lerp(this.startAzimuth,this.endAzimuth,o),a.polar=D.clamp(D.lerp(this.startPolar,this.endPolar,o)-i*.085,.1,1.38),a.distance=D.lerp(this.startDistance,this.endDistance,o)+i*this.hopHeightDist,a.target.lerpVectors(this.startTarget,this.endTarget,o),s>=1&&(this.active=!1),{slewActive:this.active,rawProgress:s,easedProgress:o}}}function Ef(e){const t=e%2===0?1:-1,a=e>=2?-1:1,s=[new W(6.6*t,7.6,7.8*a),new W(4.2*t,3.3,5.1*a),new W(1.1*t,1.85,2.5*a),new W(-2.3*t,1.72,.15*a),new W(-4.6*t,2.65,-2.4*a),new W(-1.8*t,4.45,-4.6*a),new W(3.6*t,6.45,-2.2*a),new W(6.8*t,7.9,3.8*a)],o=[new W(0,.65,0),new W(-.35*t,.85,.45*a),new W(-1.35*t,1.05,-.55*a),new W(-1.85*t,1.12,-1.35*a),new W(-.65*t,1.02,-.85*a),new W(.25*t,.88,-.15*a),new W(.1*t,.72,.15*a),new W(0,.65,0)];return{eyeCurve:new nu(s,!0,"catmullrom",.5),lookCurve:new nu(o,!0,"catmullrom",.5)}}const Wo=13.5;class Rf{constructor(){F(this,"rigs");F(this,"elapsedSec",0);F(this,"currentLegIndex",0);F(this,"tmpEye",new W);F(this,"tmpEyeAhead",new W);F(this,"tmpEyeBehind",new W);F(this,"tmpLook",new W);F(this,"tmpVelA",new W);F(this,"tmpVelB",new W);F(this,"tmpForward",new W);F(this,"tmpRight",new W);F(this,"tmpUp",new W(0,1,0));F(this,"worldUp",new W(0,1,0));this.rigs=[0,1,2,3].map(t=>Ef(t))}startAtTheater(t){const a=Math.max(0,ds.indexOf(t));this.currentLegIndex=a,this.elapsedSec=a*Wo}update(t,a,s,o=Qo,i=Jo){const l=Math.min(.08,Math.max(0,t));this.elapsedSec+=l;const h=Wo*ds.length,r=(this.elapsedSec%h+h)%h,u=Math.min(ds.length-1,Math.floor(r/Wo)),d=(r-u*Wo)/Wo;u!==this.currentLegIndex&&(this.currentLegIndex=u,s==null||s(ds[u]));const p=this.rigs[u],M=.008,b=(d-M+1)%1,g=(d+M)%1;p.eyeCurve.getPointAt(d,this.tmpEye),p.eyeCurve.getPointAt(b,this.tmpEyeBehind),p.eyeCurve.getPointAt(g,this.tmpEyeAhead),p.lookCurve.getPointAt(d,this.tmpLook);const A=this.tmpEye.x/o+.5,R=.5-this.tmpEye.z/i;if(A>=-.02&&A<=1.02&&R>=-.02&&R<=1.02){const G=a(Math.min(1,Math.max(0,A)),Math.min(1,Math.max(0,R)))+.78;this.tmpEye.y<G&&(this.tmpEye.y=G)}const w=this.tmpLook.x/o+.5,x=.5-this.tmpLook.z/i,S=a(Math.min(1,Math.max(0,w)),Math.min(1,Math.max(0,x)));this.tmpLook.y=Math.max(this.tmpLook.y,S+.18),this.tmpVelA.subVectors(this.tmpEye,this.tmpEyeBehind).setY(0),this.tmpVelB.subVectors(this.tmpEyeAhead,this.tmpEye).setY(0);let _=0;if(this.tmpVelA.lengthSq()>1e-6&&this.tmpVelB.lengthSq()>1e-6){this.tmpVelA.normalize(),this.tmpVelB.normalize();const U=this.tmpVelA.x*this.tmpVelB.z-this.tmpVelA.z*this.tmpVelB.x;_=D.clamp(U*1.45,-.11,.11)}this.tmpForward.subVectors(this.tmpLook,this.tmpEye).normalize(),this.tmpRight.crossVectors(this.tmpForward,this.worldUp).normalize(),this.tmpUp.copy(this.worldUp).applyAxisAngle(this.tmpForward,_).normalize();const B=.18+.68*(.5-.5*Math.cos(d*Math.PI*2)),P=39+Math.sin(d*Math.PI)*3.2;return{position:this.tmpEye,lookAt:this.tmpLook,up:this.tmpUp,fov:P,syntheticTimeProgress:B,cycleProgress:r/h,legProgress:d,activeLegTheater:ds[u]}}}function Af(e,t,a){a.target.copy(t),a.target.x=D.clamp(a.target.x,-Qo*.45,Qo*.45),a.target.z=D.clamp(a.target.z,-Jo*.45,Jo*.45),a.target.y=D.clamp(a.target.y,-.1,2.2);const s=new W().subVectors(e,a.target),o=D.clamp(s.length(),4.2,26),i=D.clamp(Math.acos(D.clamp(s.y/o,-.99,.99)),.1,1.38),l=Math.atan2(s.x,s.z);a.distance=o,a.polar=i,a.azimuth=l}const qr=.05;function _f(e,t){const a=new Uint8Array(t*t);for(let o=0;o<t;o++)for(let i=0;i<t;i++){const l=e[o*t+i];if(l===0)continue;let h=1;for(let r=-1;r<=1&&h;r++)for(let u=-1;u<=1;u++){const d=Math.min(t-1,Math.max(0,o+r)),p=Math.min(t-1,Math.max(0,i+u));if(Math.abs(e[d*t+p]-l)>qr){h=0;break}}a[o*t+i]=h}const s=new Uint8Array(t*t);for(let o=0;o<t;o++)for(let i=0;i<t;i++){const l=e[o*t+i];if(l===0)continue;let h=a[o*t+i];for(let r=-1;r<=1&&!h;r++)for(let u=-1;u<=1;u++){const d=o+r,p=i+u;if(!(d<0||d>=t||p<0||p>=t)&&a[d*t+p]&&Math.abs(e[d*t+p]-l)<=qr){h=1;break}}s[o*t+i]=h}return s}function ul(e,t){let a=0,s=0;for(let o=1;o<t-1;o+=2)for(let i=1;i<t-1;i+=2){const l=e[o*t+i];if(l===0||!Number.isFinite(l))continue;let h=!0;for(let r=-1;r<=1&&h;r++)for(let u=-1;u<=1;u++)if(Math.abs(e[(o+r)*t+i+u]-l)>qr){h=!1;break}h&&(a++,Math.abs(l-Math.round(l))<.02&&s++)}return a>=20&&s/a>.5}const kf=1.5;function Ff(e,t){let a=new Uint8Array(t*t);for(let s=0;s<t*t;s++)a[s]=e[s]===0?1:0;for(let s=0;s<2;s++){const o=a.slice();for(let i=1;i<t-1;i++)for(let l=1;l<t-1;l++){const h=i*t+l;if(a[h]||!(e[h]<kf))continue;let r=0;for(let u=-1;u<=1;u++)for(let d=-1;d<=1;d++)r+=a[(i+u)*t+l+d];r>=5&&(o[h]=1)}a=o}return a}const Df=5,Pf=.25;function If(e,t,a){const s=new Uint8Array(t*t),o=new Uint8Array(t*t),i=new Int32Array(t*t),l=[],h=[];let r=0;const u=d=>a[d]===0&&e[d]<Df;for(let d=0;d<t*t;d++){if(o[d]||!u(d))continue;r++;let p=0,M=0;for(h.length=0,l.push(d),o[d]=1;l.length>0;){const b=l.pop();h.push(b);const g=Math.floor(b/t),A=b-g*t;for(let R=-1;R<=1;R++){const w=g+R;if(!(w<0||w>=t))for(let x=-1;x<=1;x++){const S=A+x;if(S<0||S>=t||R===0&&x===0)continue;const _=w*t+S;u(_)?o[_]||(o[_]=1,l.push(_)):i[_]!==r&&(i[_]=r,a[_]?p++:M++)}}}if(p>0&&M<Pf*(p+M))for(const b of h)s[b]=1}return s}const mu=4,pu=1.5,Cf=4;function Eh(e,t){if(t<2*mu+1||e.length!==t*t)return;const a=mu;let s=new Float32Array(t*t),o=new Float32Array(t*t);for(let r=0;r<t*t;r++){const u=e[r]!==0?1:0;s[r]=e[r]*u,o[r]=u}const i=new Float32Array(t*t),l=new Float32Array(t*t),h=(r,u,d)=>{for(let p=0;p<t;p++){let M=0;const b=g=>d?p*t+g:g*t+p;for(let g=0;g<=a&&g<t;g++)M+=r[b(g)];for(let g=0;g<t;g++){u[b(g)]=M;const A=g+a+1,R=g-a;A<t&&(M+=r[b(A)]),R>=0&&(M-=r[b(R)])}}};for(let r=0;r<2;r++){h(s,i,!0),h(o,l,!0),h(i,s,!1),h(l,o,!1);for(let u=0;u<t*t;u++){const d=o[u];s[u]=d>0?s[u]/d:0,o[u]=d>0?1:0}}for(let r=0;r<t*t;r++){const u=e[r];if(u===0||o[r]===0)continue;const d=Math.min(1,Math.max(0,(Math.abs(u-s[r])-pu)/(Cf-pu))),p=d*d*(3-2*d);e[r]=u+(s[r]-u)*(1-p)}}function Lf(e){const t=Math.floor(e.length/4);if(t===0)return 0;const a=o=>{const i=o/255;return i<=.04045?i/12.92:Math.pow((i+.055)/1.055,2.4)},s=new Float32Array(t);for(let o=0;o<t;o++)s[o]=.2126*a(e[o*4])+.7152*a(e[o*4+1])+.0722*a(e[o*4+2]);return s.sort(),s[Math.floor(t/2)]}function Zr(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function gr(e){return Zr(e)&&typeof e.url=="string"&&e.url.length>0&&typeof e.size=="number"}function vu(e){return Array.isArray(e)&&e.length===2&&e.every(t=>typeof t=="number"&&Number.isFinite(t))}function Rh(e){if(!Zr(e)||e.version!==1||!gr(e.dem)||!gr(e.ortho)||!gr(e.aux)||!vu(e.extent_km)||!vu(e.elev_range_m))return null;const t=e.sun;return!Zr(t)||typeof t.azimuth_deg!="number"||typeof t.elevation_deg!="number"||!Number.isFinite(t.azimuth_deg)||!Number.isFinite(t.elevation_deg)?null:e}function qi(e,t){return new Promise(a=>{const s=new gd;s.setCrossOrigin("anonymous"),s.setOptions(t),s.load(e,o=>a(o),void 0,()=>a(null))})}function Qr(e){const t=new il(e);return t.flipY=!1,t.premultiplyAlpha=!1,t.wrapS=Ve,t.wrapT=Ve,t.magFilter=Be,t.minFilter=Xa,t.generateMipmaps=!0,t.onUpdate=()=>{e.close()},t.addEventListener("dispose",()=>{e.close()}),t.needsUpdate=!0,t}async function Nf(e){let t=null;try{t=await createImageBitmap(e,{resizeWidth:256,resizeHeight:256,resizeQuality:"medium"}).catch(()=>null);const o=(typeof OffscreenCanvas<"u"?new OffscreenCanvas(256,256):Object.assign(document.createElement("canvas"),{width:256,height:256})).getContext("2d");return o?(o.imageSmoothingEnabled=!0,o.imageSmoothingQuality="high",o.drawImage(t??e,0,0,256,256),Lf(o.getImageData(0,0,256,256).data)):null}catch{return null}finally{t==null||t.close()}}async function Ah(e,t){const a=await qi(e,{imageOrientation:"flipY",premultiplyAlpha:"none"});if(!a)return null;const s=Qr(a);return s.colorSpace=ut,s.anisotropy=t,s}function zf(e,t){if(t<3||e.length!==t*t)return;const a=new Float32Array(t*t),s=1/6,o=2/3;for(let i=0;i<t;i++){const l=i*t;for(let h=0;h<t;h++){const r=e[l+(h>0?h-1:0)],u=e[l+(h<t-1?h+1:t-1)];a[l+h]=s*r+o*e[l+h]+s*u}}for(let i=0;i<t;i++){const l=(i>0?i-1:0)*t,h=(i<t-1?i+1:t-1)*t,r=i*t;for(let u=0;u<t;u++)e[r+u]=s*a[l+u]+o*a[r+u]+s*a[h+u]}}async function gu(e,t){var a,s,o;try{const i=e.ortho.size<=t.maxTextureSize,l=i?e.ortho:e.ortho_fallback??null;if(!l||l.size>t.maxTextureSize)return null;const h=fetch(t.resolveUrl(e.dem.url)).then(B=>B.ok?B.arrayBuffer():null),r=qi(t.resolveUrl(l.url),{imageOrientation:"flipY",premultiplyAlpha:"none"}).then(async B=>B||!i||!e.ortho_fallback?{bitmap:B,size:l.size}:{bitmap:await qi(t.resolveUrl(e.ortho_fallback.url),{imageOrientation:"flipY",premultiplyAlpha:"none"}),size:e.ortho_fallback.size}),u=qi(t.resolveUrl(e.aux.url),{imageOrientation:"flipY",premultiplyAlpha:"none",colorSpaceConversion:"none"}),[d,p,M]=await Promise.all([h,r,u]),b=((a=t.isCancelled)==null?void 0:a.call(t))??!1,g=e.dem.size*e.dem.size*4;if(b||!d||d.byteLength!==g||e.dem.format!=="f32le"||!p.bitmap||!M)return(s=p.bitmap)==null||s.close(),M==null||M.close(),null;const A=new Float32Array(d),R=ul(A,e.dem.size);R&&Eh(A,e.dem.size),zf(A,e.dem.size);const w=Ls(A,!0),x=await Nf(p.bitmap);if((o=t.isCancelled)!=null&&o.call(t))return w.texture.dispose(),p.bitmap.close(),M.close(),null;const S=Qr(p.bitmap);S.colorSpace=ut,S.anisotropy=t.maxAnisotropy;const _=Qr(M);return _.colorSpace=Ua,_.anisotropy=Math.min(4,t.maxAnisotropy),{manifest:e,demTexture:w.texture,alignedDem:w.aligned,demGridRes:w.gridRes,minElevM:w.minElev,maxElevM:w.maxElev,orthoTexture:S,orthoSize:p.size,auxTexture:_,attribution:e.ortho.attribution??"",levelInWholeMetres:R,pictureMedianLuma:x,dispose:()=>{w.texture.dispose(),S.dispose(),_.dispose()}}}catch{return null}}function Uf(e,t,a){const s=e*Math.PI/180,o=t*Math.PI/180;return a.set(Math.sin(s)*Math.cos(o),Math.sin(o),-Math.cos(s)*Math.cos(o)).normalize()}function Bf(e,t,a){return a.set(e.x*t.x,e.y*t.y,e.z*t.z).normalize()}const ei=.085,Of=1e6;function Hf(e,t,a){const s=We,o=s*s,i=o*4,l=ei*255,h=new Float32Array(o).fill(Of),r=new Float32Array(o).fill(0),u=new Float32Array(o),d=new Uint8Array(o);for(let I=0;I<o;I++){let P=-1,U=-1,G=0;for(let k=0;k<t;k++){const V=e[k*i+I*4];V>G&&(G=V),V>=l&&(P<0&&(P=k),U=k)}if(u[I]=G/255,!(P<0)){if(d[I]=1,P===0)h[I]=-.5;else{const k=e[(P-1)*i+I*4],V=e[P*i+I*4],Z=V>k?(l-k)/(V-k):1;h[I]=P-1+Math.min(1,Math.max(0,Z))}if(U>=t-1)r[I]=t-1+.5;else{const k=e[U*i+I*4],V=e[(U+1)*i+I*4],Z=k>V?(k-l)/(k-V):0;r[I]=U+Math.min(1,Math.max(0,Z))}}}let p=0,M=0;for(let I=1;I<s-1;I+=2)for(let P=1;P<s-1;P+=2){const U=I*s+P;if(!d[U]||!d[U+1]||!d[U-1]||!d[U+s]||!d[U-s])continue;const G=(h[U+1]-h[U-1])*.5,k=(h[U+s]-h[U-s])*.5,V=Math.hypot(G,k);V>.001&&V<4&&(p+=V,M++)}const b=M>16?Math.min(1.2,Math.max(.08,p/M)):.3,g=h.slice(),A=b,R=b*Math.SQRT2,w=(I,P,U)=>{const G=g[P]+U;G<g[I]&&(g[I]=G)};for(let I=0;I<2;I++){for(let P=0;P<s;P++)for(let U=0;U<s;U++){const G=P*s+U;d[G]||(U>0&&w(G,G-1,A),P>0&&w(G,G-s,A),U>0&&P>0&&w(G,G-s-1,R),U<s-1&&P>0&&w(G,G-s+1,R))}for(let P=s-1;P>=0;P--)for(let U=s-1;U>=0;U--){const G=P*s+U;d[G]||(U<s-1&&w(G,G+1,A),P<s-1&&w(G,G+s,A),U<s-1&&P<s-1&&w(G,G+s+1,R),U>0&&P<s-1&&w(G,G+s-1,R))}}let x=0;const S=t+64,_=new Float32Array(o*4);for(let I=0;I<o;I++){const P=Math.min(S,g[I]);_[I*4]=P,_[I*4+1]=d[I]?r[I]:P,_[I*4+2]=u[I],_[I*4+3]=d[I],x+=d[I]}let B;if(a)B=new ta(_,s,s,It,ol);else{const I=new Uint16Array(o*4);for(let P=0;P<I.length;P++)I[P]=Ra.toHalfFloat(_[P]);B=new ta(I,s,s,It,za)}return B.minFilter=Be,B.magFilter=Be,B.wrapS=Ve,B.wrapT=Ve,B.generateMipmaps=!1,B.flipY=!1,B.needsUpdate=!0,{texture:B,burnedFraction:x/o,frameCount:t}}function xu(e){const t=String(e);return/[.e]/.test(t)?t:`${t}.0`}const Gf=`
const float FIRE_THR = ${xu(ei)};
const float FIRE_FIELD_TEXEL = ${xu(1/We)};

struct FireSurface {
  vec3 emission;   // HDR radiance emitted by flames and embers
  float burned;    // 0..1 char coverage of the ground
  float ash;       // 0..1 pale ash share inside the char
  float front;     // 0..1 flaming front coverage
  float glow;      // 0..1 smoldering bed activity
};

// Radiance of the flame body, t = 0 dull ember red, t = 1 bright amber. The display tone curve
// turns any strong radiance white, so the body is held at levels where it stays orange on screen
// (about sRGB 190 30 10, 250 115 35, 255 150 55 and 255 190 85 for the four stops).
vec3 fireRamp(float t) {
  vec3 c0 = vec3(0.45, 0.030, 0.003);
  vec3 c1 = vec3(1.05, 0.110, 0.008);
  vec3 c2 = vec3(1.40, 0.190, 0.013);
  vec3 c3 = vec3(2.00, 0.360, 0.024);
  return t < 0.33
    ? mix(c0, c1, t / 0.33)
    : (t < 0.66 ? mix(c1, c2, (t - 0.33) / 0.33) : mix(c2, c3, (t - 0.66) / 0.34));
}

// White-hot core of a flaming front: the only part of the scene above the bloom threshold
const vec3 FIRE_CORE = vec3(18.0, 6.5, 0.9);

float fireFieldNow(vec2 uv, out float zBracket) {
  float z0 = textureLod(uFieldTex0, uv, 0.0).r;
  float z1 = textureLod(uFieldTex1, uv, 0.0).r;
  zBracket = max(z0, z1);
  return mix(z0, z1, uFrameMix);
}

// Blurred fire power around a point, from the mip chain of the solver field.
float fireFieldBlur(vec2 uv, float lod) {
  return mix(textureLod(uFieldTex0, uv, lod).r, textureLod(uFieldTex1, uv, lod).r, uFrameMix);
}

FireSurface evalFireSurface(
  vec2 uv,
  vec2 pKm,
  float kmPerPx,
  vec3 normalW,
  float slopeMag,
  float fuel,
  float waterMask
) {
  FireSurface fs;
  fs.emission = vec3(0.0);
  fs.burned = 0.0;
  fs.ash = 0.0;
  fs.front = 0.0;
  fs.glow = 0.0;

  vec4 hist = texture2D(uFireHist, uv);
  float zBracket = 0.0;
  float zNow = fireFieldNow(uv, zBracket);

  // Nothing burned here yet and nothing is burning: leave the ground untouched.
  if (hist.a < 0.004 && zBracket < FIRE_THR * 0.5) {
    return fs;
  }

  // Arrival gradient gives the local spread direction and slowness (epochs per km).
  vec2 tx = vec2(FIRE_FIELD_TEXEL, 0.0);
  vec2 ty = vec2(0.0, FIRE_FIELD_TEXEL);
  float aE = texture2D(uFireHist, uv + tx).r;
  float aW = texture2D(uFireHist, uv - tx).r;
  float aN = texture2D(uFireHist, uv + ty).r;
  float aS = texture2D(uFireHist, uv - ty).r;
  vec2 gradKm = vec2(aE - aW, aN - aS) / (2.0 * FIRE_FIELD_TEXEL * uExtentKm);
  float gradLen = length(gradKm);
  float slowness = clamp(gradLen, 0.35, 5.0);
  vec2 spreadDir = gradLen > 1e-4 ? gradKm / gradLen : vec2(1.0, 0.0);

  // Noise domain aligned with the wind so tongues run downwind.
  vec2 windEN = normalize(uWindDirUv * uExtentKm + vec2(1e-5));
  vec2 q = vec2(dot(pKm, windEN) * 0.55, dot(pKm, vec2(-windEN.y, windEN.x)));
  vec2 drift = windEN * uTime * 0.006;

  // Uphill direction in (east, north). Fire runs upslope, so fingers lengthen there.
  vec2 uphillEN = vec2(-normalW.x, normalW.z);
  float upslope = clamp(dot(spreadDir, uphillEN) * 2.2, -1.0, 1.0) * clamp(slopeMag * 1.4, 0.0, 1.0);

  float lobes = fbm2(q * 1.35 + drift);
  float tongues = fbm2(q * 5.8 - drift * 3.0 + vec2(41.0, 13.0));
  vec3 cellA = worley2(q * 8.5 + vec2(3.1, 7.7));

  // Sub-cell raggedness in km: more with fuel and upslope runs, never more than about one cell.
  float ragKm = (0.16 + 0.26 * fuel) * (1.0 + 0.9 * max(upslope, 0.0)) * (1.0 - 0.35 * max(-upslope, 0.0));
  float warpKm = ((lobes - 0.5) * 1.1 + (tongues - 0.5) * 0.55 + (0.42 - cellA.x) * 0.38) * ragKm;
  // Fine crinkle that only resolves up close (about 40 m features, a few meters of displacement)
  warpKm += (valueNoise2(q * 26.0 + drift * 9.0) - 0.5) * 0.030;

  // Signed distance behind the front, km (positive on burned ground).
  float dKm = (uFireTime - hist.r) / slowness + warpKm;

  // Truthfulness gate: flame only where the solver field is above threshold in a bracketing epoch.
  float gate = smoothstep(FIRE_THR * 0.75, FIRE_THR * 1.20, zBracket) * (1.0 - waterMask);
  float power = clamp((zBracket - FIRE_THR) / 0.45, 0.0, 1.0);

  // --- Flaming front: a thin band right behind the level set -------------------------------
  float depthKm = 0.030 + 0.045 * power;
  float bandKm = max(depthKm, 1.25 * kmPerPx);
  float lead = smoothstep(-0.55 * bandKm, 0.0, dKm);
  float tail = exp(-max(dKm, 0.0) / (bandKm * 1.25));
  float breakup = smoothstep(0.18, 0.46, tongues + 0.35 * (cellA.z - 0.5) + 0.25 * fuel);
  float flicker = 0.70 + 0.60 * valueNoise2(q * 31.0 + vec2(uTime * 2.6, -uTime * 1.9));
  float front = lead * tail * gate * breakup;
  // Keep far fronts from gaining energy when the band is widened to stay visible.
  float energy = mix(1.0, sqrt(depthKm / bandKm), 0.55);
  float heat = clamp(0.38 + 0.62 * pow(power, 0.6), 0.0, 1.0) * flicker;
  // Orange body across the band, and a thin core along its leading edge. The core thins out
  // when the band has been widened to stay visible from far away.
  float core = smoothstep(0.58, 0.96, lead * tail) * (depthKm / bandKm);
  vec3 frontRgb = fireRamp(clamp(0.30 + 0.70 * heat, 0.0, 1.0)) * mix(1.0, energy, 0.5)
                + FIRE_CORE * core * (0.30 + 0.85 * heat * heat) * energy;

  // Flame body and ground glow hugging the front, a few flame depths wide, well below the core
  float fringe = exp(-abs(dKm) / (bandKm * 2.4 + 0.015)) * gate * (0.45 + 0.55 * breakup);
  vec3 fringeRgb = fireRamp(clamp(0.12 + 0.38 * heat, 0.0, 1.0)) * (0.60 + 0.45 * power) * fringe;

  // --- Ember bed: cooling, speckled, only while the solver field is still active here ------
  float stillActive = smoothstep(FIRE_THR * 0.45, FIRE_THR * 1.05, zNow) * (1.0 - waterMask);
  float bedKm = 0.16 + 0.50 * power;
  float bed = step(0.0, dKm) * exp(-max(dKm, 0.0) / bedKm) * stillActive;
  vec3 cellB = worley2(pKm * 21.0 + vec2(11.0, 5.0));
  float twinkle = 0.55 + 0.45 * sin(uTime * (1.3 + 2.2 * cellB.z) + cellB.z * 40.0);
  float spots = smoothstep(0.46, 0.06, cellB.x) * smoothstep(0.30, 0.75, cellB.z + 0.45 * tongues);
  // Individual embers resolve only up close; from far away the bed is a faint dull glow
  float emberFade = smoothstep(2.5, 9.0, 0.045 / max(kmPerPx, 1e-6));
  float embers = bed * mix(0.10, spots * twinkle * 1.8, emberFade);
  vec3 emberRgb = fireRamp(clamp(0.04 + 0.50 * embers, 0.0, 1.0)) * (0.55 + 0.60 * power) * embers;

  fs.emission = frontRgb * front + (fringeRgb + emberRgb) * (1.0 - front);
  fs.front = front;
  fs.glow = bed;

  // --- Char and ash: everything the level set has already crossed --------------------------
  float crossed = smoothstep(-0.015, 0.05, dKm) * smoothstep(0.08, 0.55, hist.a);
  float severity = smoothstep(FIRE_THR, FIRE_THR + 0.34, hist.b);
  float mottle = fbm2(pKm * 7.5 + vec2(5.0, 19.0));
  float patchy = smoothstep(0.20, 0.62, mottle + 0.55 * severity);
  fs.burned = crossed * mix(0.50, 0.97, severity) * mix(0.72, 1.0, patchy) * (1.0 - waterMask);
  float ageEpochs = max(0.0, uFireTime - hist.r);
  float settled = smoothstep(0.4, 4.0, ageEpochs);
  // Ash settles in soft patches where fuel was heavy and the burn severe
  fs.ash = crossed * severity * fuel * settled
         * smoothstep(0.46, 0.86, fbm2(pKm * 4.6 + vec2(29.0, 3.0)) + 0.12 * (mottle - 0.5));

  return fs;
}

// Warm light from nearby flames on the surrounding ground and canyon walls.
// Returns irradiance in the HDR scene unit (multiply by albedo).
vec3 fireBounceLight(vec2 uv, vec3 normalW, float front) {
  // Cheap reject: nothing burning within a few kilometres
  if (fireFieldBlur(uv, 5.0) < 0.003) {
    return vec3(0.0);
  }
  // Two rings of taps on low mip levels. Rotated offsets hide the texel grid of the mip chain,
  // and the east-west and north-south differences of the same taps give the direction to the fire.
  const vec2 k1 = vec2(0.92388, 0.38268);
  const vec2 k2 = vec2(-0.38268, 0.92388);
  const vec2 k3 = vec2(0.70711, 0.70711);
  const vec2 k4 = vec2(-0.70711, 0.70711);
  float r1 = 2.6 * FIRE_FIELD_TEXEL;
  float r2 = 7.0 * FIRE_FIELD_TEXEL;
  float a1 = fireFieldBlur(uv + k1 * r1, 1.5);
  float a2 = fireFieldBlur(uv - k1 * r1, 1.5);
  float a3 = fireFieldBlur(uv + k2 * r1, 1.5);
  float a4 = fireFieldBlur(uv - k2 * r1, 1.5);
  float b1 = fireFieldBlur(uv + k3 * r2, 2.8);
  float b2 = fireFieldBlur(uv - k3 * r2, 2.8);
  float b3 = fireFieldBlur(uv + k4 * r2, 2.8);
  float b4 = fireFieldBlur(uv - k4 * r2, 2.8);
  float near = 0.25 * (a1 + a2 + a3 + a4);
  float wide = 0.25 * (b1 + b2 + b3 + b4);
  vec2 grad = (a1 - a2) * k1 + (a3 - a4) * k2 + 0.7 * ((b1 - b2) * k3 + (b3 - b4) * k4);
  // Toward the fire: east is +x, north is -z in world space
  vec3 toFire = normalize(vec3(grad.x, 0.30 * length(grad) + 0.01, -grad.y));
  float facing = 0.30 + 0.70 * max(0.0, dot(normalW, toFire));
  float amount = clamp(near * 1.05 + wide * 0.75, 0.0, 1.0);
  return vec3(1.0, 0.33, 0.06) * amount * amount * facing * 1.9 * (1.0 - front);
}
`,Kf=`
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float valueNoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float valueNoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  );
}

// Four octaves, each rotated to hide the lattice. Returns roughly 0..1 with mean 0.5.
float fbm2(vec2 p) {
  const mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * valueNoise2(p);
    p = rot * p * 2.03 + vec2(17.3, 9.1);
    amp *= 0.5;
  }
  return sum / 0.9375;
}

float fbm2Lite(vec2 p) {
  const mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  float sum = 0.5 * valueNoise2(p);
  p = rot * p * 2.03 + vec2(17.3, 9.1);
  sum += 0.25 * valueNoise2(p);
  return sum / 0.75;
}

// Cellular noise: x = distance to the nearest feature point, y = to the second nearest,
// z = a stable random value for the nearest cell.
vec3 worley2(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = p - cell;
  float d1 = 8.0;
  float d2 = 8.0;
  float id = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash22(cell + g);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = hash12(cell + g + 7.7);
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}
`,go=6378.137,Ji={family:"modis",altitudeKm:705,maxScanDeg:55,alphaScanNative:1/705,alphaTrack:1/705,detectors:10,zone1Deg:90,zone2Deg:90},io={family:"viirs",altitudeKm:825.2,maxScanDeg:56.28,alphaScanNative:.125/825.2,alphaTrack:.362/825.2,detectors:32,zone1Deg:31.72,zone2Deg:44.86},en=Math.PI/180;function Jr(e){return(go+e.altitudeKm)/go}function Wf(e,t){const a=Math.min(e.maxScanDeg,Math.abs(t))*en,s=Jr(e);return go*(Math.asin(Math.min(1,s*Math.sin(a)))-a)}const wu={axisEast:1,axisNorth:0,nadirKm:0,valid:!1,scanAngleDeg:0};function Mu(e,t,a){if(!e||e.family!==t.family)return a.valid=!1,a;const s=e.azimuthDeg*en;return a.axisEast=Math.sin(s),a.axisNorth=Math.cos(s),a.scanAngleDeg=Math.min(t.maxScanDeg,Math.abs(e.scanAngleDeg)),a.nadirKm=Wf(t,a.scanAngleDeg),a.valid=!0,a}function fs(e){const t=e.toPrecision(10);return/[.e]/.test(t)?t:`${t}.0`}function yu(e){return`vec4(${fs(e.alphaScanNative)}, ${fs(e.alphaTrack)}, ${fs(e.detectors)}, ${e.family==="viirs"?"1.0":"0.0"})`}const Vf=`
const float SCAN_RE = ${fs(go)};
const float MODIS_ORBIT_K = ${fs(Jr(Ji))};
const float VIIRS_ORBIT_K = ${fs(Jr(io))};
const vec4 MODIS_SENSOR = ${yu(Ji)};
const vec4 VIIRS_SENSOR = ${yu(io)};
const float VIIRS_ZONE1 = ${fs(io.zone1Deg*en)};
const float VIIRS_ZONE2 = ${fs(io.zone2Deg*en)};

struct ScanCell {
  vec2 centerKm;  // cell center, east and north of the region center
  vec2 sizeKm;    // footprint (along scan, along track)
  float edgeKm;   // distance from this point to the nearest cell border
  float edgeScanKm;  // distance along the scan axis to the nearest border across it
  float edgeTrackKm; // distance along the track to the nearest row border or seam
  float seamKm;   // distance to the nearest scan-to-scan seam
  float overlap;  // 0 at nadir, grows with the bow-tie overlap between consecutive scans
  float zone;     // aggregation zone 1..3 (always 1 for MODIS)
};

float scanGroundKm(float theta, float k) {
  return SCAN_RE * (asin(clamp(k * sin(theta), -1.0, 1.0)) - theta);
}

float scanThetaFromGround(float xKm, float k) {
  float g = xKm / SCAN_RE;
  return atan(sin(g), k - cos(g));
}

float scanSampleFromTheta(float theta, vec4 sensor) {
  float n = abs(theta) / sensor.x;
  if (sensor.w > 0.5) {
    float n1 = VIIRS_ZONE1 / sensor.x;
    float n2 = VIIRS_ZONE2 / sensor.x;
    n = min(n, n1) / 3.0 + clamp(n - n1, 0.0, n2 - n1) / 2.0 + max(n - n2, 0.0);
  }
  return n;
}

float scanThetaFromSample(float p, vec4 sensor) {
  if (sensor.w > 0.5) {
    float n1 = VIIRS_ZONE1 / sensor.x;
    float n2 = VIIRS_ZONE2 / sensor.x;
    float p1 = n1 / 3.0;
    float p2 = p1 + (n2 - n1) / 2.0;
    float n = p < p1 ? p * 3.0 : (p < p2 ? n1 + (p - p1) * 2.0 : n2 + (p - p2));
    return n * sensor.x;
  }
  return p * sensor.x;
}

ScanCell evalScanCell(vec2 pKm, vec4 pass, vec4 sensor, float k) {
  ScanCell cell;
  vec2 axis = pass.xy;
  vec2 track = vec2(axis.y, -axis.x);

  // Ground distance from the sub-satellite track: grows away from the satellite. The lattice is
  // mirrored about the track so a region that straddles nadir still gets well-formed cells.
  float xsSigned = pass.z - dot(pKm, axis);
  float side = xsSigned < 0.0 ? -1.0 : 1.0;
  float xs = abs(xsSigned);
  float yt = dot(pKm, track);

  float theta = scanThetaFromGround(xs, k);
  float sampleIdx = floor(scanSampleFromTheta(theta, sensor));
  float th0 = scanThetaFromSample(sampleIdx, sensor);
  float th1 = scanThetaFromSample(sampleIdx + 1.0, sensor);
  float x0 = scanGroundKm(th0, k);
  float x1 = scanGroundKm(th1, k);
  float thC = 0.5 * (th0 + th1);

  float root = sqrt(max(1.0 / (k * k) - sin(thC) * sin(thC), 1e-8));
  float trackKm = SCAN_RE * k * sensor.y * (cos(thC) - root);
  float nadirTrackKm = SCAN_RE * (k - 1.0) * sensor.y;
  float stripKm = sensor.z * nadirTrackKm;

  float strip = floor(yt / stripKm + 0.5);
  float yLocal = yt - strip * stripKm;
  float rowF = yLocal / trackKm + 0.5 * sensor.z;
  float row = clamp(floor(rowF), 0.0, sensor.z - 1.0);
  float rowFrac = rowF - row;

  float xc = 0.5 * (x0 + x1);
  float yc = strip * stripKm + (row + 0.5 - 0.5 * sensor.z) * trackKm;

  float dScan = min(xs - x0, x1 - xs);
  float dRow = min(rowFrac, 1.0 - rowFrac) * trackKm;
  float dSeam = 0.5 * stripKm - abs(yLocal);

  cell.centerKm = axis * (pass.z - side * xc) + track * yc;
  cell.sizeKm = vec2(x1 - x0, trackKm);
  cell.edgeKm = max(0.0, min(dScan, min(dRow, dSeam)));
  cell.edgeScanKm = max(0.0, dScan);
  cell.edgeTrackKm = max(0.0, min(dRow, dSeam));
  cell.seamKm = max(0.0, dSeam);
  cell.overlap = clamp(trackKm / nadirTrackKm - 1.0, 0.0, 1.0);
  cell.zone = sensor.w > 0.5
    ? (abs(thC) < VIIRS_ZONE1 ? 1.0 : (abs(thC) < VIIRS_ZONE2 ? 2.0 : 3.0))
    : 1.0;
  return cell;
}

// Coverage of a hairline of the given width (device pixels) centered on a border that lies
// edgeKm away, where kmPerPx is the screen-space footprint of one pixel on the ground.
float scanHairline(float edgeKm, float kmPerPx, float widthPx) {
  return clamp(0.5 + 0.5 * widthPx - edgeKm / max(kmPerPx, 1e-6), 0.0, 1.0);
}
`,_h=`
const float TERRAIN_CEILING = 1.5;   // highest radiance of lit ground, under the bloom threshold
const float SUN_KEY = 0.66;          // sunlight on the ground: a slope square to the sun gets about 1.15
const float HAZE_NEAR_KM = 14.0;     // air within about this distance of the camera counts less

// Imagery is a finished picture, not a reflectance map. It goes through the inverse of the display
// tone curve (the ACES fit of three.js at exposure 1, see ./hdrPipeline.ts) so that under reference
// light (1.0) the pipeline returns the picture's own colors, and lighter or darker light moves
// them the way exposure would. The same mapping keeps flat data fills on their legend colors.
const mat3 ACES_OUT_INV = mat3(
  vec3(0.643038, 0.059269, 0.005962),
  vec3(0.311187, 0.931436, 0.063929),
  vec3(0.045775, 0.009295, 0.930118));
const mat3 ACES_IN_INV = mat3(
  vec3(1.764741, -0.147028, -0.036337),
  vec3(-0.675778, 1.160252, -0.162436),
  vec3(-0.088963, -0.013224, 1.198773));

vec3 pictureToScene(vec3 displayLinear) {
  vec3 y = clamp(ACES_OUT_INV * displayLinear, vec3(0.0), vec3(0.90));
  vec3 a = 1.0 - 0.983729 * y;
  vec3 b = 0.0245786 - 0.4329510 * y;
  vec3 c = 0.000090537 + 0.238081 * y;
  vec3 v = (-b + sqrt(b * b + 4.0 * a * c)) / (2.0 * a);
  return max(ACES_IN_INV * v, vec3(0.0)) * 0.6;
}

// Water. Where it is comes from the data: the sea at 0 m, a lake as ground that is exactly level
// in the elevation (see ./shadowBake.ts and ./contextTerrain.ts). Its colour is drawn: on a lake
// mostly one deep tone, so the strips and glints of an aerial mosaic do not cut the lake into
// pieces, with a little of the picture left in it; the sea the same. The pack and the land around it use the
// same terms, so a lake that crosses the pack's edge is one body of water.
const vec3 WATER_DEEP = vec3(0.05, 0.13, 0.21);
const float WATER_PICTURE_LEFT = 0.14;  // share of the picture's own colour kept on a lake
// (none on the sea: imagery at sea is tiles of other dates and brightness, and shows them)
const float WATER_NIGHT_DIM = 0.55;     // by night water gives back a dark sky

// Level ground is a lake only where the picture looks like water: bluer than it is red or green (a
// glint on a lake is pale but blue), or dark, and in either case not green. A swamp or a marsh is as
// level as a lake and covered in plants; a field on a level floodplain is green or brown.
float waterLook(vec3 picture) {
  float luma = dot(picture, vec3(0.2126, 0.7152, 0.0722));
  float greenish = smoothstep(1.04, 1.12, picture.g / max(max(picture.r, picture.b), 1e-3)) * smoothstep(0.02, 0.04, luma);
  float bluish = smoothstep(0.93, 1.0, picture.b / max(max(picture.r, picture.g), 1e-3));
  float dark = 1.0 - smoothstep(0.04, 0.06, luma);
  return max(bluish, dark) * (1.0 - greenish);
}

// The lit surface with water on it. glint: fresnel and sun glint, already scaled; none by night
vec3 waterSurface(vec3 lit, float water, float lake, float sea, float fresnel, float spec, float night) {
  float deepShare = max(mix(0.42, 1.0 - WATER_PICTURE_LEFT, lake), mix(0.42, 1.0, sea));
  vec3 deep = mix(lit, WATER_DEEP, deepShare);
  vec3 glint = (vec3(0.22, 0.28, 0.36) * fresnel * 0.45 + vec3(1.0, 0.93, 0.80) * spec * 0.85) * (1.0 - night);
  return mix(lit, deep + glint, water);
}

// Lit ground never reaches the bloom threshold: a smooth ceiling that keeps the hue
vec3 capSurface(vec3 c) {
  float m = max(c.r, max(c.g, c.b)) / TERRAIN_CEILING;
  return c / pow(1.0 + m * m * m * m, 0.25);
}
`,bu=`
${ln}

varying vec2 vUv;
varying vec3 vWorldPos;
varying float vBaseY;
varying float vElevM;

void main() {
  vUv = uv;
  float elevM = 0.0;
  float baseY = evalTerrainWorldY(uv, elevM);

  vBaseY = baseY;
  vElevM = elevM;

  // The plane is unit-parameterised by uv, so the slab can take each region's own aspect ratio
  vec4 worldPos = modelMatrix * vec4((uv.x - 0.5) * uSlabSize.x, baseY, (0.5 - uv.y) * uSlabSize.y, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`,Yf=`
void main() {
  gl_FragColor = vec4(0.0);
}
`,$f=`
${ln}
${Vf}

// How strongly the detections' light falls on the ground near them and farther out (display choice)
// From far (the whole block in view) a detection is a few pixels: its light and its fall on the
// ground are lifted so a small fire still reads as fire (display choice)
const float FAR_LIGHT_LIFT = 2.4;
const float FAR_CAST_LIFT = 1.4;
const float FIRE_CAST_NEAR = 14.0;
const float FIRE_CAST_FAR = 9.0;
const float FIRE_CAST_EASE = 0.8;
// The fire's light, living (drawing: where each light is, how large and how strong stays the detection's).
// The cores breathe by this share of their light, slowly, each at its own pace; embers twinkle inside a
// light's halo, in cells this wide on the ground, this share of the cells holding one, seen only where a
// cell is a few pixels across, by night; the thrown glow is this much stronger on a slope that faces the
// fire and weaker on one that turns away
const float FIRE_BREATH = 0.10;
const float FIRE_FLICKER = 0.05;
const float EMBER_CELL_KM = 0.028;
const float EMBER_CELL_PX = 6.0;   // embers seen from far take larger cells, so each stays this many pixels wide
const float EMBER_SHARE = 0.18;
const float EMBER_GAIN = 3.2;
const float FIRE_SLOPE_LIGHT = 1.15;
const float FIRE_BED = 0.55;       // the glowing bed of ground right round each light (about 200 m), by night
const float FIRE_CAST_NIGHT = 1.35; // the thrown glow, this much stronger by night

// Display choices of the close-range look
const float WALL_STRETCH_FROM = 1.3; // imagery stretched this much down a slope starts to count as a wall
const float WALL_STRETCH_FULL = 2.3; // about 46 degrees of true slope at the stage's vertical factor

uniform sampler2D uSatPrev;
uniform sampler2D uSatNext;
uniform sampler2D uFieldTex0;
uniform sampler2D uFieldTex1;
uniform sampler2D uLipariTex;

uniform float uFrameMix;
uniform vec3 uSunDir;          // stage space, toward the sun
uniform float uTime;
uniform float uCutawayMix;
uniform float uCutawayPlane;
uniform vec2 uCutawayDir;
uniform float uReconMix;
uniform float uObserverMix;
uniform float uModisWeight;
uniform float uViirsWeight;
uniform float uUncertaintyMix;
uniform float uSensitivity;
uniform vec2 uExtentKm;   // region size on the ground (east-west, north-south)
uniform vec4 uModisPass;  // (scan axis east, scan axis north, nadir distance km, valid)
uniform vec4 uViirsPass;
uniform vec4 uScanStrip;  // (MODIS strip center along track km, strength, VIIRS center km, strength)
uniform float uLatticeMix; // 1 draws the lattice of empty scan cells; 0 on the landing page, which shows no grid
uniform float uHasSeaCoast;
uniform float uLakeMix;       // 1 when the elevation is the place's own: level ground is then a lake
uniform sampler2D uFireHist;  // arrival, extinction, peak, burned (see ./fireField.ts)
uniform float uFireTime;      // fractional epoch
uniform vec2 uWindDirUv;

// Terrain pack (all optional, weights are 0 without a pack)
uniform sampler2D uAuxTex;      // r normal x (east), g normal z (south), b sky view, a canopy
uniform float uMicroDetail;   // 1: the drawn fine texture (crowns, rock) where the picture is magnified; 0 on a stand-in
uniform float uAuxMix;
uniform float uAuxNormals;    // 1: light by the baked normals; 0: by the stage's own (elevation in whole metres, smoothed)
uniform sampler2D uShadowTex;   // baked once: r the sun shadow factor (1 = lit), g level ground
uniform sampler2D uSmokeShadowTex; // transmittance of the smoke toward the sun at ground level
uniform float uSmokeShadowMix;
uniform vec3 uUnitsPerMetre;    // stage units per metre on x, y, z
uniform vec3 uSunTrue;          // unit vector toward the sun at true scale
uniform vec3 uSunColor;         // radiance of a white surface in full sun
uniform vec3 uSunTransmittance; // of the air above the region, toward the sun (feeds only the inscatter the haze discards)
uniform float uHazeStrength;    // share of the physical air path that is drawn
uniform sampler2D uSkyView;     // sky radiance by azimuth from the sun and elevation (./atmosphere.ts)
uniform float uSkyExposure;     // the dome's display exposure, so the far edge meets it exactly
uniform vec3 uFloorColor;       // the dome's floor (shared with ./atmosphere.ts)
uniform float uFloorHaze;
uniform float uOrthoTexelKm;    // ground size of one texel of the current imagery
uniform float uSatSharpen;      // 1 for low-resolution imagery, 0 for the pack ortho
uniform sampler2D uDetailTex;   // optional zoom 16 inset
uniform vec4 uDetailRect;       // (u0, v0, u1, v1) of the inset in slab uv
uniform float uDetailMix;
uniform float uDetailTexelKm;
uniform sampler2D uContextOrtho; // imagery around the pack (see contextJoin in the heightfield code)
// Real runs: the detections of the overpass on show, each in its own footprint (./footprintField.ts).
// r, b: inside a footprint minus its depth (0 edge, 1 centre line), outside km to the nearest one
// (MODIS, VIIRS). g, a: fire radiative power density of that footprint, MW/km2.
uniform sampler2D uFootTex;
uniform vec2 uFootMix;      // (MODIS, VIIRS): 1 on a real run, where footprints replace the scan lattice
uniform float uLightModis;  // 1 when the lights on show are MODIS detections (the raw side shows them too), 0 for VIIRS
uniform float uLightTexels; // side of the light texture, texels
uniform vec2 uRevealed;     // (MODIS, VIIRS): 1 when that family's footprints on show were revealed after scoring
uniform float uPixelOutline; // 1 draws the outline of each detection's pixel around its light, on the estimate's side too
// The run's intensity scale, from its payload: (0 linear or 1 log10, top MW/km2, bottom MW/km2)
uniform vec3 uFieldScale;
// Positions on that scale where emitted light starts and where it is at its brightest
uniform vec2 uHeatRange;
// Real runs: what the model believes at the time on show (./beliefField.ts). The texture rides on
// uLipariTex, whose legend ramp is not drawn on a real run (the shader is at its sampler limit):
// r, g probability that the cell burns and its expected intensity at one time step, b, a the same
// at the next step, one texel per cell of the model's grid.
uniform vec2 uBeliefGrid;    // cells east-west and north-south; (0, 0) when the run has no belief frames
uniform float uBeliefMix;    // position between the two steps
uniform vec4 uBeliefBox;     // the part of the region that holds any belief: (u west, v south, u east, v north)
uniform float uHeldOut;      // 1 on a pass whose detections were kept from the estimate
uniform float uHeldOutOther; // 1 on a run whose hidden passes another model answered than the one whose belief it carries
// NASA's burned-area map after the reveal (see burnedOver): its share drawn, the map from the slab's
// coordinates to the picture's (scale u, scale v, offset u, offset v), and the picture's cells
uniform float uBurnedMix;
uniform vec4 uBurnedBox;
uniform vec2 uBurnedSize;
uniform vec2 uRevealLine;    // the page's sweep at the reveal: x the share of the screen's width it has crossed (-1: no sweep), y that width in pixels
uniform vec4 uRevealArrive;  // detections laid on after scoring arrive: xy the pass's direction of travel (east, north), z the front along it (km from the box's centre), w the front's soft width (km)
uniform float uDayJoin;       // share of the box's side over which a day's photograph blends into the land around (0: none)
uniform float uDayFalse;      // 1 while the day's photograph on the box is the false-colour one (bands 7, 2, 1)
uniform float uChanceSquares; // 1 when the squares sized by chance are asked for (eased)
uniform float uDeclaredGiven; // 1 when the run says which cells its model declares at the hidden pass on show (the low bit of a cell's intensity byte)
// A hidden pass: above 0 the light texture holds the last visible pass, drawn as an afterglow at
// this share of its light. 0: the lights are the detections of the pass on show.
uniform float uAfterglow;
uniform float uFarView;      // 0 in a close view, 1 when the whole block is in view: lights and their fall on the ground are lifted there
uniform float uLightGain;    // share of the lights drawn (below 1 while the landing fades from one pass to the next)
uniform float uBeliefQuiet;  // 1 on a run that kept nothing from the model: its squares are drawn quieter
// A pass as a scan: while a pass arrives, a front crosses the region along its ground track and
// what the pass brought appears behind it. (track east, track north, front along the track km, 1
// while the front is crossing)
uniform vec4 uScan;
// A board of tiles over the region's box (the page's round of looks). Row 0 is the north edge.
uniform vec2 uTileGrid;       // (columns, rows); (0, 0) without a board
uniform vec4 uTileState[64];  // per tile: level 0..1, looked, chosen, closed
uniform float uTileHover;     // the tile under the pointer, -1 for none

varying vec2 vUv;
varying vec3 vWorldPos;
varying float vBaseY;
varying float vElevM;

${Kf}
${on}
${rn}
${nn}
${Gf}

${_h}

// Imagery for the current region. During a region morph the outgoing image is blended in.
// Returns the picture color and, in insetWeight, how much of it came from the zoom 16 inset.
//
// The imagery is projected straight down, so on a steep face every texel is stretched along the
// fall line by 'stretch' (surface length over map length) and reads as a smear when magnified.
// The filter footprint is therefore widened across the slope by the same amount ('contourUv' is
// the uv step per world unit along the contour): detail becomes as coarse across the slope as the
// projection already made it along the slope, soft instead of streaked.
// The false-colour photograph (MODIS bands 7, 2, 1) shows plants a vivid green and burned ground
// brown or red. Drawing: its green is laid at a third of its saturation and a little darker, so the
// burn reads against the land and the box does not stand as a green slab on its land; red, brown,
// the smoke's cyan and water keep their colours. Each pixel's own colour decides; no burn is drawn.
vec3 quietFalseColour(vec3 c) {
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float green = smoothstep(1.03, 1.30, c.g / max(max(c.r, c.b), 1e-4));
  return mix(c, mix(vec3(luma), c, 0.33) * 0.85, green);
}

vec3 sampleOrtho(vec2 uv, float kmPerPx, vec2 contourUv, float stretch, float bare, out float insetWeight) {
  float worldPerKm = uUnitsPerMetre.x * 1000.0;
  float magnified = smoothstep(2.4, 0.9, kmPerPx / max(uOrthoTexelKm, 1e-5));
  vec2 smear = contourUv * (uOrthoTexelKm * worldPerKm * (stretch - 1.0) * magnified);
  // On a wall the picture holds almost no real detail (a few texels cover the whole face), so it
  // is also filtered wider in every direction there and keeps only its color. Rock texture drawn in
  // the shader takes the place of the streaks (see wallFade in main).
  // 'bare' is 1 on open rock and 0 under canopy or without a terrain pack: forest keeps its texture
  float wall = smoothstep(WALL_STRETCH_FROM, WALL_STRETCH_FULL, stretch) * bare;
  float widen = 1.0 + wall * 5.0;
  vec2 baseGx = dFdx(uv) * widen;
  vec2 baseGy = dFdy(uv) * widen;
  vec3 center = textureGrad(uSatNext, uv, baseGx + smear, baseGy).rgb;
  insetWeight = 0.0;

  if (uSatSharpen > 0.01) {
    // Mild unsharp mask, only for the 2048 fallback imagery
    vec2 texStep = vec2(1.0 / 2048.0);
    vec3 blur = 0.25 * (
      texture2D(uSatNext, uv + vec2(texStep.x, 0.0)).rgb + texture2D(uSatNext, uv - vec2(texStep.x, 0.0)).rgb +
      texture2D(uSatNext, uv + vec2(0.0, texStep.y)).rgb + texture2D(uSatNext, uv - vec2(0.0, texStep.y)).rgb);
    float detailLuma = dot(center - blur, vec3(0.299, 0.587, 0.114));
    center = clamp(center + vec3(detailLuma * 0.42 * uSatSharpen), 0.0, 1.0);
  }

  // Zoom 16 inset over the fire window, used only where the base imagery is being magnified.
  // Its low frequencies are replaced by those of the base image so tone or season differences
  // between the two mosaics do not show as a rectangle.
  vec2 rectSize = max(uDetailRect.zw - uDetailRect.xy, vec2(1e-4));
  vec2 duv = (uv - uDetailRect.xy) / rectSize;
  float insetMagnified = smoothstep(2.4, 0.9, kmPerPx / max(uDetailTexelKm, 1e-5));
  vec2 dGx = dFdx(duv) * widen + contourUv * (uDetailTexelKm * worldPerKm * (stretch - 1.0) * insetMagnified) / rectSize;
  vec2 dGy = dFdy(duv) * widen;
  if (uDetailMix > 0.01) {
    vec2 edge = min(duv, 1.0 - duv);
    float inside = smoothstep(0.0, 0.035, min(edge.x, edge.y));
    float need = smoothstep(1.5, 0.75, kmPerPx / max(uOrthoTexelKm, 1e-5));
    float w = inside * need * uDetailMix;
    if (w > 0.003) {
      vec2 cuv = clamp(duv, vec2(0.0), vec2(1.0));
      vec3 fine = textureGrad(uDetailTex, cuv, dGx, dGy).rgb;
      vec3 fineLow = textureLod(uDetailTex, cuv, 6.5).rgb;
      vec3 baseLow = textureLod(uSatNext, uv, 5.0).rgb;
      fine *= clamp((baseLow + 0.01) / (fineLow + 0.01), vec3(0.55), vec3(1.8));
      center = mix(center, fine, w);
      insetWeight = w;
    }
  }

  if (uMorph < 0.999) {
    center = mix(texture2D(uSatPrev, uv).rgb, center, uMorph);
  }
  return center;
}

// Stage-space normal from the heightfield (fallback path and during region morphs)
vec3 computeTerrainNormal(vec2 uv, out float slopeMag) {
  float eps = 1.0 / 512.0;
  float hE = evalTerrainWorldYFast(uv + vec2(eps, 0.0));
  float hW = evalTerrainWorldYFast(uv - vec2(eps, 0.0));
  float hN = evalTerrainWorldYFast(uv + vec2(0.0, eps));
  float hS = evalTerrainWorldYFast(uv - vec2(0.0, eps));

  // Note: +v is North (-Z world), so dY/dZ = -(hN - hS) / dzWorld
  float dydx = (hE - hW) / (2.0 * eps * uSlabSize.x);
  float dydz = -(hN - hS) / (2.0 * eps * uSlabSize.y);
  slopeMag = length(vec2(dydx, dydz));
  return normalize(vec3(-dydx, 1.0, -dydz));
}

// Normal of a surface displaced by a small height h (world units), from screen-space derivatives
// (Mikkelsen, bump mapping unparametrized surfaces).
vec3 perturbNormal(vec3 pos, vec3 n, float h) {
  vec3 dpdx = dFdx(pos);
  vec3 dpdy = dFdy(pos);
  float dhdx = dFdx(h);
  float dhdy = dFdy(h);
  vec3 r1 = cross(dpdy, n);
  vec3 r2 = cross(n, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * n - grad);
}

// A sensor overpass is one discrete observation, so cell values come from the nearest epoch
// instead of a blend of two.
vec4 sampleFieldNearestEpoch(vec2 uv) {
  vec2 c = clamp(uv, vec2(0.002), vec2(0.998));
  // Explicit level 0: cell centers jump between fragments, which would pick a blurred mip level
  return mix(textureLod(uFieldTex0, c, 0.0), textureLod(uFieldTex1, c, 0.0), step(0.5, uFrameMix));
}

// Mean of the field channel over the cell footprint (center weighted twice plus four inner taps).
float scanCellValue(ScanCell cell, vec2 axis, vec4 channelMask) {
  vec2 track = vec2(axis.y, -axis.x);
  vec2 inv = 1.0 / uExtentKm;
  vec2 du = axis * cell.sizeKm.x * 0.25 * inv;
  vec2 dv = track * cell.sizeKm.y * 0.25 * inv;
  vec2 c0 = cell.centerKm * inv + vec2(0.5);
  float v = 2.0 * dot(sampleFieldNearestEpoch(c0), channelMask);
  v += dot(sampleFieldNearestEpoch(c0 + du + dv), channelMask);
  v += dot(sampleFieldNearestEpoch(c0 + du - dv), channelMask);
  v += dot(sampleFieldNearestEpoch(c0 - du + dv), channelMask);
  v += dot(sampleFieldNearestEpoch(c0 - du - dv), channelMask);
  return v / 6.0;
}

struct ScanDraw {
  float value;   // per-cell field value, 0..1 of the field range
  float hair;    // hairline coverage of the cell border (constant width in device pixels)
  float hairLit; // wider coverage used for the border of a cell that holds a detection
  float seam;    // hairline coverage of the scan-to-scan seam, scaled by the bow-tie overlap
  float cellPx;  // smaller cell dimension in device pixels
};

// The strip one mirror scan sweeps under the spacecraft: two hairlines one scan apart (the nadir
// width, the spacing of the scan seams in the lattice) and a faint lift between them.
vec3 scanStripMark(vec3 rgb, vec2 pKm, float kmPerPx, vec4 pass, vec4 sensor, float k, vec2 strip, vec3 tint) {
  vec2 track = vec2(pass.y, -pass.x);
  float halfKm = 0.5 * sensor.z * SCAN_RE * (k - 1.0) * sensor.y;
  float d = abs(dot(pKm, track) - strip.x);
  float edge = scanHairline(abs(d - halfKm), kmPerPx, 1.6);
  float inside = 1.0 - smoothstep(halfKm - kmPerPx, halfKm + kmPerPx, d);
  rgb = mix(rgb, rgb * 1.07 + tint * 0.04, inside * strip.y);
  return mix(rgb, tint, edge * strip.y * 0.92);
}

ScanDraw evalScanDraw(vec2 pKm, float kmPerPx, vec4 pass, vec4 sensor, float k, vec4 channelMask) {
  ScanDraw d;
  ScanCell cell = evalScanCell(pKm, pass, sensor, k);
  d.value = scanCellValue(cell, pass.xy, channelMask);
  d.cellPx = min(cell.sizeKm.x, cell.sizeKm.y) / max(kmPerPx, 1e-6);
  // Ground distance one pixel covers across each family of borders. With one isotropic figure a
  // border that runs away from the camera would come out several pixels wide at grazing angles.
  vec2 track = vec2(pass.y, -pass.x);
  float sAxis = dot(pKm, pass.xy);
  float sTrack = dot(pKm, track);
  float pxAxis = max(length(vec2(dFdx(sAxis), dFdy(sAxis))), 1e-6);
  float pxTrack = max(length(vec2(dFdx(sTrack), dFdy(sTrack))), 1e-6);
  d.hair = max(scanHairline(cell.edgeScanKm, pxAxis, 1.15), scanHairline(cell.edgeTrackKm, pxTrack, 1.15));
  d.hairLit = max(scanHairline(cell.edgeScanKm, pxAxis, 2.3), scanHairline(cell.edgeTrackKm, pxTrack, 2.3));
  d.seam = scanHairline(cell.seamKm, pxTrack, 1.9) * smoothstep(0.04, 0.35, cell.overlap);
  return d;
}

// Position (0..1, byte / 255) of a fire radiative power density on the run's intensity scale, as
// the field bytes are encoded: a detection's own value and the field then share one scale.
float fieldNorm(float mwKm2) {
  if (uFieldScale.x < 0.5) return clamp(mwKm2 / max(uFieldScale.y, 1e-3), 0.0, 1.0);
  if (mwKm2 < uFieldScale.z) return 0.0;
  return clamp((1.0 + 254.0 * log(mwKm2 / uFieldScale.z) / log(uFieldScale.y / uFieldScale.z)) / 255.0, 0.0, 1.0);
}

// How hot a position on the scale is drawn: 0 where emitted light starts, 1 at its brightest
float heatOf(float v) {
  return clamp((v - uHeatRange.x) / max(uHeatRange.y - uHeatRange.x, 1e-3), 0.0, 1.0);
}

// A real detection is heat a satellite measured as emitted radiance. It is drawn as light the
// ground gives off: one light per detection, inside the detection's own footprint, as a small hot
// core with a soft halo (FIRMS says the fire is somewhere in the footprint, not that it fills it).
// The lights are drawn into a texture with a mip chain (./footprintField.ts), colour and brightness
// from each detection's radiative power: deep red, through orange, to near white. On a real run it
// is bound to uFireHist, whose fire history is not drawn there. rgb: emitted light. a: its strength
// without the colour.
// Lights that are small on screen run together: the mip chain averages them into one glow, and
// the average is lifted so a light smaller than a pixel still shows, as a far lamp does.
vec4 detectionLight(vec2 uv) {
  vec2 texel = uv * uLightTexels;
  float lod = log2(max(max(length(dFdx(texel)), length(dFdy(texel))), 1.0));
  vec4 light = texture2D(uFireHist, uv) * min(exp2(0.85 * lod), 6.0);
  // By day the same light competes with sunlit ground and with smoke: it is lifted and kept orange
  light.rgb *= mix(vec3(1.5, 1.05, 0.7), vec3(1.0), uNight);
  return light;
}

// A detection laid on after scoring (the hidden instrument once it is revealed, or what a look
// found) is drawn as a filled square in the middle of the instrument's pixel, about six tenths
// of the pixel across, so that it can be told from the estimate's open frames and compared
// with them cell by cell. field: the footprint field of its family (minus depth inside).
// few is 1 where the pixel is only a few screen pixels wide: the square's edge is then soft.
float revealCore(float field, float few) {
  float depth = clamp(-field, 0.0, 1.0);
  return mix(smoothstep(0.36, 0.46, depth), smoothstep(0.30, 0.62, depth), few);
}

// --- The model's belief (real runs) -----------------------------------------------------------
// A detection is a measurement: light at a place and a time. The estimate is a belief, and it is
// drawn as one: marks in ink on the model's own grid, never as light and never as a coat of colour.
//   one square per cell of the model's 375 m grid, its area growing with the probability that
//   the cell burns (a large square is near certain, a small dot is doubt), its strength with the
//   expected intensity
//   a dotted line around the ground where the model holds that fire may be
//   on a pass that was kept from the model, an open frame in place of the square of every cell it
//   declares burning (one half or more, the blind test's own rule): the answer it committed to
// Everything comes from the belief frames. The ink, the dot shape and the line are drawing.
const float BELIEF_DECLARED = 0.5;   // a cell at this probability or more is declared burning
const float BELIEF_MAY_BURN = 0.02;  // the dotted line runs where the smoothed probability crosses this
const float BELIEF_CELL_FILL = 0.58; // side of a certain cell's square, as a share of the cell
// By day the estimate's white ink and a detection's light lie on sunlit ground. Two display
// choices keep them readable there, and neither marks ground the data does not: the ground
// inside the dotted line is drawn this much darker (the same ground the line already encloses),
// and the ground right under a light is drawn darker by up to this share (the light's own
// extent, inside the detection's pixel). Neither says the ground is burned.
const float BELIEF_DAY_SHADE = 0.30;
// Detections laid on after a look or a reveal: how much the ground under their marks is darkened
// by day, and how much their blue is lifted when the whole block is in view
const float REVEAL_DAY_UNDER = 0.55;
const float REVEAL_FILL = 0.9;        // how much of the ground the blue square covers
const float REVEAL_FAR_LIFT = 0.6;
// A declared cell too small on screen for an open frame is drawn as a square of at least this
// probability's size (display choice: the list says declared or not, it gives no size)
const float BELIEF_DECLARED_FAR = 0.4;
const float DAY_LIGHT_UNDER = 0.72;
const float BELIEF_INK_FAR = 1.35;       // how much stronger the ink is drawn on such small cells
const float BELIEF_CELL_FILL_FAR = 0.88; // the same when the cell is only a few pixels wide on screen
const float BELIEF_FRAME_HALF = 0.40; // half side of the open frame of a declared cell on a held-out pass

// Probability and expected intensity of one cell at the time on show
vec2 beliefCell(vec2 cellId) {
  vec4 b = textureLod(uLipariTex, (cellId + 0.5) / uBeliefGrid, 0.0);
  return mix(b.rg, b.ba, uBeliefMix);
}

float beliefTap(vec2 texel) {
  vec4 b = textureLod(uLipariTex, texel / uBeliefGrid, 0.0);
  return mix(b.r, b.b, uBeliefMix);
}

// The probability as a smooth surface over the cells: a cubic B-spline through four bilinear taps
float beliefSmooth(vec2 uv) {
  vec2 st = uv * uBeliefGrid - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1;
  vec2 g1 = w2 + w3;
  vec2 h0 = i - 0.5 + w1 / g0 + 0.5;
  vec2 h1 = i + 1.5 + w3 / g1 + 0.5;
  return g0.y * (g0.x * beliefTap(vec2(h0.x, h0.y)) + g1.x * beliefTap(vec2(h1.x, h0.y)))
       + g1.y * (g0.x * beliefTap(vec2(h0.x, h1.y)) + g1.x * beliefTap(vec2(h1.x, h1.y)));
}

// Ink over the ground: (coverage of the marks, coverage of the dark edge that holds the lines on
// bright ground by day, strength of the ink)
// (the fourth value: 1 on ground inside the dotted line, 0 outside)
vec4 beliefMarks(vec2 uv, vec2 pKm, float kmPerPx, float heldOut) {
  vec2 g = uv * uBeliefGrid;
  vec2 id = floor(g);
  vec2 fc = g - id - 0.5;
  vec2 aa = max(fwidth(g), vec2(1e-5));   // cells per pixel along each axis
  float px = max(aa.x, aa.y);
  float cellPx = 1.0 / px;
  vec4 cellBytes = textureLod(uLipariTex, (id + 0.5) / uBeliefGrid, 0.0);
  vec2 be = mix(cellBytes.rg, cellBytes.ba, uBeliefMix);
  float p = clamp(be.x, 0.0, 1.0);
  // A pass kept from the model: which cells the model declares burning there. The run says so
  // itself, with the list the blind test scores; a run that gives no list (an older recording)
  // falls back to the cells the belief on show holds at one half or more, which is a reading of
  // the model and not its own answer.
  float listed = mod(floor(cellBytes.g * 255.0 + 0.5), 2.0);
  float declaredCell = mix(step(BELIEF_DECLARED, p), listed, uDeclaredGiven) * heldOut;
  // (where another model answered the hidden pass, that pass shows its frames alone: the belief the
  // run carries, its chance squares and its dotted line, is the other model's)
  float ownBelief = 1.0 - uHeldOutOther * heldOut;
  // (an open frame needs about seven pixels to read as open; a smaller declared cell is drawn as
  // a square no smaller than BELIEF_DECLARED_FAR stands for, whatever its probability, so the
  // model's answer is still the shape seen from far, as a field of squares and not a fill)
  float framed = smoothstep(5.5, 8.0, cellPx);
  // (the squares sized by chance only when asked for; a declared cell keeps its mark)
  p = max(p * uChanceSquares * ownBelief, BELIEF_DECLARED_FAR * declaredCell * (1.0 - framed));
  float some = step(0.004, p);

  // The cell's square: its area grows with the probability. Even a certain cell leaves ground
  // showing around it, so a sure area is a field of squares and never a fill. How it is drawn
  // depends on its size on screen, so the marks weigh about the same at any distance: solid when
  // small, an outline over a faint pane when larger, and its four corners alone in a close view,
  // where an outline around every cell would cage the ground and the lights.
  // (a cell that is only a few pixels wide is drawn fuller and, below, brighter: from far the
  // estimate has to read as a shape, and the ground between such squares could not be seen anyway)
  float tiny = 1.0 - smoothstep(5.0, 11.0, inversesqrt(aa.x * aa.y));
  float halfSide = mix(BELIEF_CELL_FILL, BELIEF_CELL_FILL_FAR, tiny) * 0.5 * sqrt(p);
  vec2 d = abs(fc) - halfSide;
  float inside = (1.0 - smoothstep(-0.5 * aa.x, 0.5 * aa.x, d.x)) * (1.0 - smoothstep(-0.5 * aa.y, 0.5 * aa.y, d.y)) * some;
  vec2 dIn = d + 1.3 * aa;
  float inner = (1.0 - smoothstep(-0.5 * aa.x, 0.5 * aa.x, dIn.x)) * (1.0 - smoothstep(-0.5 * aa.y, 0.5 * aa.y, dIn.y)) * some;
  // (its size on screen: the mean of its two sides, since a cell on a slope seen at a low angle
  // is long one way and short the other)
  float sizePx = inversesqrt(aa.x * aa.y);
  float close = smoothstep(13.0, 22.0, sizePx);
  float pane = mix(mix(1.0, 0.20, smoothstep(6.0, 13.0, sizePx)), 0.0, close);
  float corners = step(0.55 * halfSide, min(abs(fc.x), abs(fc.y)));
  float square = max((inside - inner) * mix(1.0, corners, close), inside * pane * (1.0 - 0.75 * uBeliefQuiet));

  // A pass kept from the model: every cell the model declares burning is an open frame in place
  // of its square, the answer it committed to and has not been shown. The other cells stay as
  // they are.
  float declared = declaredCell * framed;
  float box = max(abs(fc.x), abs(fc.y));
  float strokeCells = max(1.5 * px, 0.06);
  float ring = (1.0 - smoothstep(BELIEF_FRAME_HALF - 0.5 * px, BELIEF_FRAME_HALF + 0.5 * px, box))
             * smoothstep(BELIEF_FRAME_HALF - strokeCells - 0.5 * px, BELIEF_FRAME_HALF - strokeCells + 0.5 * px, box);
  float mark = mix(square, ring, declared);

  // Cells too small to draw one by one run together into a tone of the same coverage
  float resolved = smoothstep(2.0, 3.6, cellPx);
  vec4 near = texture2D(uLipariTex, uv);
  float tone = BELIEF_CELL_FILL * BELIEF_CELL_FILL
             * max(mix(near.r, near.b, uBeliefMix) * uChanceSquares * ownBelief, BELIEF_DECLARED_FAR * declaredCell);
  float cells = mix(tone * 0.8, mark, resolved);

  // The dotted line around the ground that may burn
  float ps = beliefSmooth(uv);
  float grad = max(fwidth(ps), 1e-5);
  // (no line where the surface is exactly zero: that is ground beyond every cell's reach, and at
  // the edge of the box above the gradient is not to be trusted)
  float reach = step(1e-6, ps);
  float line = (1.0 - smoothstep(0.55, 1.45, abs(ps - BELIEF_MAY_BURN) / grad)) * reach;
  float lineEdge = (1.0 - smoothstep(1.4, 2.6, abs(ps - BELIEF_MAY_BURN) / grad)) * reach;
  // Dots of a steady size on screen, fixed to the ground (their size steps by octaves with distance)
  float dotKm = exp2(floor(log2(max(kmPerPx, 1e-4) * 5.0)));
  vec2 q = pKm / dotKm;
  float dots = step(0.0, sin(3.14159265 * (q.x + q.y)) * sin(3.14159265 * (q.x - q.y)));
  line *= dots * ownBelief;
  lineEdge *= dots * ownBelief;

  // (the ink's strength follows the belief's intensity; on a pass another model answered, an even one)
  float strength = mix(0.70, 1.0, mix(0.5, heatOf(be.y), ownBelief)) * mix(1.0, BELIEF_INK_FAR, tiny);
  float within = smoothstep(-1.0, 1.0, (ps - BELIEF_MAY_BURN) / grad) * reach * ownBelief;
  return vec4(max(cells, line * 0.9), lineEdge * 0.7, mix(strength, mix(1.0, BELIEF_INK_FAR, tiny), line), within);
}

// --- NASA's burned-area map (real runs, after the reveal) -------------------------------------------
// MCD64A1's cells on the run's own 375 m grid, nearest cell, as the product gives them: what burned in the
// run's window is the scar, what burned before it a darker tone, what burned after it to the month's end a
// lighter one, and an amber line along the scar's edge. On a real run the picture rides on the field's
// second sampler (uFieldTex1), which a real run never reads. Its red channel is the class times 64:
// 1 before, 2 in the window, 3 after.
float burnedClassAt(vec2 cell) {
  return floor(texture2D(uFieldTex1, (cell + 0.5) / uBurnedSize).r * 255.0 / 64.0 + 0.5);
}

vec3 burnedOver(vec3 rgb, vec2 uv) {
  vec2 q = uv * uBurnedBox.xy + uBurnedBox.zw;
  if (q.x < 0.0 || q.y < 0.0 || q.x >= 1.0 || q.y >= 1.0) return rgb;
  vec2 t = q * uBurnedSize;
  vec2 cell = floor(t);
  vec2 f = t - cell;
  float cls = burnedClassAt(cell);
  vec2 px = max(fwidth(t), vec2(1e-5));
  if (cls < 0.5) return rgb;
  // (the scar's edge: a cell side whose neighbour did not burn, about a pixel and a half wide)
  float edge = 0.0;
  edge = max(edge, step(burnedClassAt(cell + vec2(1.0, 0.0)), 0.5) * (1.0 - smoothstep(0.6, 1.6, (1.0 - f.x) / px.x)));
  edge = max(edge, step(burnedClassAt(cell - vec2(1.0, 0.0)), 0.5) * (1.0 - smoothstep(0.6, 1.6, f.x / px.x)));
  edge = max(edge, step(burnedClassAt(cell + vec2(0.0, 1.0)), 0.5) * (1.0 - smoothstep(0.6, 1.6, (1.0 - f.y) / px.y)));
  edge = max(edge, step(burnedClassAt(cell - vec2(0.0, 1.0)), 0.5) * (1.0 - smoothstep(0.6, 1.6, f.y / px.y)));
  vec3 before = mix(vec3(0.15, 0.065, 0.045), vec3(0.055, 0.024, 0.018), uNight);
  vec3 within = mix(vec3(0.36, 0.11, 0.05), vec3(0.14, 0.04, 0.022), uNight);
  vec3 after = mix(vec3(0.66, 0.42, 0.22), vec3(0.20, 0.12, 0.06), uNight);
  vec3 tone = cls < 1.5 ? before : (cls < 2.5 ? within : after);
  float cover = cls < 1.5 ? 0.50 : (cls < 2.5 ? 0.54 : 0.40);
  // (a tint that keeps the ground's own shading, so the relief reads through the scar)
  float shade = dot(rgb, vec3(0.30, 0.55, 0.15)) / max(dot(tone, vec3(0.30, 0.55, 0.15)), 1e-3);
  rgb = mix(rgb, tone * clamp(0.55 + 0.45 * shade, 0.4, 1.6), cover * uBurnedMix);
  vec3 line = mix(vec3(1.0, 0.64, 0.32), vec3(0.92, 0.48, 0.20), uNight);
  return mix(rgb, line, edge * 0.85 * uBurnedMix);
}

// --- The board of tiles ------------------------------------------------------------------------
// Lines in ink on the ground, never a fill: a hairline along every tile edge; a frame inside the
// tile that grows heavier with its level; a firm outline where a look was spent; corner brackets
// on the tile chosen now; a brighter outline under the pointer.
// Returns (coverage of the ink, coverage of the dark edge under it, strength of the ink).
const float TILE_BRACKET_ARM = 0.25;    // arm length, as a share of the tile's side
const float TILE_BRACKET_DAY = 1.1;     // ink strength of the brackets by day
const float TILE_BRACKET_NIGHT = 1.6;   // and by night, where the board's ink is dimmed
const float TILE_EDGE_INK = 0.55;       // coverage of every tile's edge line
const float TILE_OUTER_INSET = 0.007;   // the board's outer line, as a share of the box's side inside its edge
vec3 tileMarks(vec2 uv) {
  vec2 tg = vec2(uv.x, 1.0 - uv.y) * uTileGrid;
  vec2 id = min(floor(tg), uTileGrid - 1.0);
  vec2 tf = tg - id;
  float index = id.y * uTileGrid.x + id.x;
  vec4 state = uTileState[int(clamp(index, 0.0, 63.0))];
  // Tiles per pixel across each family of edges (measured along its own direction, so an edge
  // that runs away from the camera keeps its width)
  vec2 px = max(vec2(length(vec2(dFdx(tg.x), dFdy(tg.x))), length(vec2(dFdx(tg.y), dFdy(tg.y)))), vec2(1e-6));
  // The land around overlaps the box's last strip (see the context terrain's discard), so the board's
  // outer line is set just inside it, where nothing covers it and it stays one unbroken line
  vec2 inset = TILE_OUTER_INSET * uTileGrid;
  vec2 lo = tf - inset * (1.0 - step(0.5, id));
  vec2 hi = (1.0 - tf) - inset * step(uTileGrid - 1.5, id);
  vec2 edgePx = min(lo, hi) / px;                 // distance to the tile's edges, pixels
  float d = min(edgePx.x, edgePx.y);
  float hover = 1.0 - step(0.5, abs(index - uTileHover));

  // Every edge: a line about one and a half pixels wide, firm enough to read from the block's
  // distance on entry, when nothing else is marked yet; thin, so a light under it still shows
  float hair = 1.0 - smoothstep(0.7, 1.6, abs(d));
  float ink = hair * mix(TILE_EDGE_INK, 0.12, state.a);
  float strength = 0.8;
  // Every mark of a tile is a thin line set inside the tile, so where two marked tiles meet there
  // are two fine lines with ground between them and never one heavy band.
  // Level: a frame well inside the edge, one to three pixels thick, brighter as the level rises
  float thick = 1.0 + 2.0 * state.r;
  float frame = smoothstep(5.6, 6.4, d) * (1.0 - smoothstep(6.0 + thick - 0.4, 6.0 + thick + 0.4, d)) * step(0.004, state.r);
  ink = max(ink, frame * (0.14 + 0.62 * state.r));
  // Looked at: a firm fine outline just inside the edge
  float firm = smoothstep(1.6, 2.2, d) * (1.0 - smoothstep(3.2, 3.8, d)) * state.g;
  ink = max(ink, firm * 0.9);
  // Under the pointer
  float under = smoothstep(1.6, 2.2, d) * (1.0 - smoothstep(3.4, 4.0, d)) * hover;
  ink = max(ink, under * 0.7);
  // Chosen: brackets at the four corners, the strongest mark on the board. Each arm runs a
  // quarter of the tile's side along its own edge, so a tile seen at a slant keeps four
  // brackets and not four dots
  vec2 cornerFrac = min(tf, 1.0 - tf);
  float inCorner = step(max(cornerFrac.x, cornerFrac.y), TILE_BRACKET_ARM);
  float bracket = smoothstep(0.6, 1.2, d) * (1.0 - smoothstep(5.4, 6.2, d)) * inCorner * state.b;
  ink = max(ink, bracket);
  strength = mix(strength, 1.0, max(firm, under));
  strength = mix(strength, mix(TILE_BRACKET_DAY, TILE_BRACKET_NIGHT, uNight), bracket);
  float edge = smoothstep(0.6, 1.4, d) * (1.0 - smoothstep(4.6, 6.0, d));
  edge *= max(max(state.g, state.b), hover);
  // (every edge line gets a faint dark edge of its own, so it stands on bright ground by day)
  edge = max(edge, (1.0 - smoothstep(1.6, 3.2, abs(d))) * 0.45 * (1.0 - state.a));
  // (the brackets get a wider dark edge of their own, so they stand on bright ground too)
  edge = max(edge, (1.0 - smoothstep(7.0, 9.0, d)) * inCorner * state.b);
  return vec3(ink, edge, strength);
}

// Border visibility. A lit cell keeps its border until the cell is only a few pixels across. The
// lattice over empty ground fades out much earlier so it never turns into a wireframe texture.
float scanLitFade(float cellPx) { return smoothstep(3.0, 9.0, cellPx); }
float scanEmptyFade(float cellPx, float fullPx) { return smoothstep(fullPx * 0.34, fullPx, cellPx); }

void main() {
  vec3 sunDir = normalize(uSunDir);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);

  // Ground position in km (east, north of the region center) and its screen-space footprint
  vec2 pKm = (vUv - vec2(0.5)) * uExtentKm;
  float kmPerPx = max(length(dFdx(pKm)), length(dFdy(pKm)));

  // Real detection footprints, and the screen-space gradient of each family's field (for the
  // one-pixel edge of a footprint, whatever the field's units on either side of that edge)
  vec4 foot = texture2D(uFootTex, vUv);
  float footGradM = max(length(vec2(dFdx(foot.r), dFdy(foot.r))), 1e-6);
  float footGradV = max(length(vec2(dFdx(foot.b), dFdy(foot.b))), 1e-6);
  // What the overpass on show detected, as emitted light (nothing on a simulated run)
  // The pass being scanned: 1 on ground the front has crossed (everywhere once it is through)
  float scanAlong = dot(pKm, uScan.xy);
  float scanned = mix(1.0, 1.0 - smoothstep(uScan.z - 0.25, uScan.z, scanAlong), uScan.w);
  vec4 lit = detectionLight(vUv) * uFootMix.x * scanned * uLightGain * (1.0 + FAR_LIGHT_LIFT * uFarView);
  // How much of the light's fall on the ground is drawn (all of it for the pass on show)
  float castShare = uLightGain * (1.0 + FAR_CAST_LIFT * uFarView);
  if (uAfterglow > 0.001) {
    // The pass on show is hidden. What the last visible pass detected is kept as an afterglow:
    // blurred, dull and red, with no point of light, so it cannot be taken for a detection of this pass.
    // It fades with the hours since that pass (see the stage). It says where the visible
    // instrument last saw fire, not what burns now. By night only: by day a glow would be a red
    // tint on sunlit ground, and the trace of the fire is the smoke that pass left.
    vec4 soft = textureLod(uFireHist, vUv, 3.4);
    // (lifted when it is small on screen, as the lights are: from far a dull glow would vanish)
    float glowLift = mix(1.0, 2.6, smoothstep(0.02, 0.06, kmPerPx));
    lit = vec4(vec3(0.62, 0.10, 0.03) * dot(soft.rgb, vec3(0.5, 0.4, 0.1)) * 1.3 * glowLift, 0.0) * uAfterglow * uNight * uFootMix.x * uLightGain;
    castShare = 0.30 * uAfterglow * uLightGain;
  }
  // The model's belief as ink marks (worked out here, outside any branch, for its derivatives)
  vec4 marks = vec4(0.0);
  // (only inside the box that holds any belief: most of the ground has none and skips the work)
  if (uBeliefGrid.x > 0.5 && vUv.x > uBeliefBox.x && vUv.x < uBeliefBox.z && vUv.y > uBeliefBox.y && vUv.y < uBeliefBox.w) {
    marks = beliefMarks(vUv, pKm, kmPerPx, uHeldOut * scanned);
  }
  vec3 tiles = vec3(0.0);
  if (uTileGrid.x > 0.5) tiles = tileMarks(vUv);

  // --- Surface normal and sky visibility ------------------------------------------------------
  float slopeMag = 0.0;   // stage-space gradient magnitude
  vec3 N = vec3(0.0, 1.0, 0.0);
  vec4 aux = texture2D(uAuxTex, vUv);
  // (the baked normals come from the elevation as it came: in whole metres they hold its terraces,
  // so such a pack is lit by normals from its own smoothed elevation; see smoothTerraces)
  float auxNormalMix = uAuxMix * uAuxNormals;
  if (auxNormalMix < 0.999) {
    N = computeTerrainNormal(vUv, slopeMag);
  }
  if (auxNormalMix > 0.001) {
    // True-scale unit normal, y rebuilt, then mapped into the scaled stage space
    vec2 nxz = aux.rg * 2.0 - 1.0;
    vec3 nTrue = vec3(nxz.x, sqrt(max(1e-4, 1.0 - dot(nxz, nxz))), nxz.y);
    vec3 nAux = normalize(nTrue / uUnitsPerMetre);
    float slopeAux = length(nAux.xz) / max(nAux.y, 1e-3);
    N = normalize(mix(N, nAux, auxNormalMix));
    slopeMag = mix(slopeMag, slopeAux, auxNormalMix);
  }
  // Tangent of the true slope angle (the stage exaggerates relief)
  float trueSlope = slopeMag * uUnitsPerMetre.x / max(uUnitsPerMetre.y, 1e-9);
  float skyView = mix(1.0, aux.b, uAuxMix);

  // --- Imagery ---------------------------------------------------------------------------------
  // Contour direction on the ground (uv step per world unit) and the stretch of the projection
  vec2 fall = N.xz / max(length(N.xz), 1e-4);
  vec2 contourUv = vec2(-fall.y / uSlabSize.x, -fall.x / uSlabSize.y);
  float stretch = min(sqrt(1.0 + slopeMag * slopeMag), 6.0);
  float insetWeight = 0.0;
  float bare = uAuxMix * (1.0 - smoothstep(0.15, 0.6, aux.a));
  vec3 photoRgb = sampleOrtho(vUv, kmPerPx, contourUv, stretch, bare, insetWeight);
  if (uDayFalse > 0.5) photoRgb = quietFalseColour(photoRgb);
  // Over its last stretch the pack shows the context imagery, like its surface takes the context
  // elevation there: the step in detail between the two is spread over the join
  float joinK = contextJoin(vUv);
  // A day's photograph laid on the box (dayPicture) meets the land around's own picture over a wider
  // band, so its colours (a false-colour one above all) go into the land and do not stop at a line.
  // Drawing: the photograph covers the box, the blend is only where they meet.
  if (uDayJoin > 0.0) {
    vec2 toEdge = min(vUv, 1.0 - vUv);
    joinK = max(joinK, (1.0 - smoothstep(0.0, uDayJoin, min(toEdge.x, toEdge.y))) * uContextMix);
  }
  // (derivatives are taken outside the branch; inside it they are undefined)
  vec2 contextUv = (vUv - 0.5) / uContextScale + 0.5;
  vec2 contextDx = dFdx(contextUv);
  vec2 contextDy = dFdy(contextUv);
  if (joinK > 0.0) {
    photoRgb = mix(photoRgb, textureGrad(uContextOrtho, contextUv, contextDx, contextDy).rgb, joinK);
  }
  float satLuma = dot(photoRgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 satRgb = pictureToScene(photoRgb);

  // Canopy cover: the pack's canopy index, or an imagery heuristic without a pack
  float vegHeuristic = clamp((photoRgb.g - max(photoRgb.r, photoRgb.b)) * 7.0 + 0.5, 0.0, 1.0);
  float canopyK = mix(vegHeuristic, aux.a, uAuxMix);

  // Water (hydrologically flat lakes, rivers, sea coves)
  float seaMask = uHasSeaCoast * (1.0 - smoothstep(1.2, 4.5, vElevM));
  float inlandWater = step(photoRgb.g * 0.94, photoRgb.b)
                    * step(photoRgb.r * 1.45, photoRgb.b)
                    * (1.0 - smoothstep(0.022, 0.042, satLuma))
                    * (1.0 - smoothstep(0.012, 0.028, slopeMag));
  // A lake: level ground in the elevation where the picture looks like water
  vec4 baked = texture2D(uShadowTex, vUv);
  float lake = baked.g * uLakeMix * waterLook(photoRgb);
  float waterMask = clamp(max(max(seaMask, inlandWater), lake), 0.0, 1.0);

  // --- Close-range micro detail: rock on steep walls, crown texture where canopy is high ----
  // Rendering treatment only. It appears when the imagery is magnified past its own resolution.
  float texelKm = mix(uOrthoTexelKm, uDetailTexelKm, insetWeight);
  // (none on a stand-in: its picture is coarse, and close to it the drawn texture aliases into waves)
  // and only where a pixel is under about half a crown (crowns are 14 to 22 m): on a coarse picture
  // the imagery is magnified at distances where the drawn crowns would be a pixel's stipple
  float detailResolves = 1.0 - smoothstep(0.006, 0.014, kmPerPx);
  float detailFade = smoothstep(1.6, 0.45, kmPerPx / max(texelKm, 1e-5)) * detailResolves * (1.0 - waterMask) * uMicroDetail;
  float rockMask = smoothstep(0.50, 1.05, trueSlope) * (1.0 - 0.75 * canopyK);
  float canopyMask = smoothstep(0.30, 0.75, canopyK) * (1.0 - smoothstep(0.9, 1.6, trueSlope));
  // On walls the imagery keeps only its color (see sampleOrtho), so the rock texture is drawn there
  // at any distance where it still resolves, not only when the imagery is magnified
  float wallFade = smoothstep(WALL_STRETCH_FROM, WALL_STRETCH_FULL, stretch) * bare
                 * (1.0 - smoothstep(0.010, 0.030, kmPerPx)) * (1.0 - waterMask) * uMicroDetail;
  float roughness = 0.9;
  if (detailFade > 0.01 || wallFade > 0.01) {
    // Isotropic km-like coordinates in stage space, so detail is not stretched by the exaggeration
    vec3 p = vWorldPos / (uUnitsPerMetre.x * 1000.0);
    vec3 wgt = pow(abs(N), vec3(4.0));
    wgt /= (wgt.x + wgt.y + wgt.z);

    // Rock: fractured faces, slightly banded on the side projections
    float rockTop = fbm2Lite(p.xz * 34.0);
    float rockX = fbm2Lite(vec2(p.z * 22.0, p.y * 58.0) + vec2(7.0, 3.0));
    float rockZ = fbm2Lite(vec2(p.x * 22.0, p.y * 58.0) + vec2(1.0, 9.0));
    float rockH = wgt.y * rockTop + wgt.x * rockX + wgt.z * rockZ;
    if (wallFade > 0.01) {
      // Beds across the face (they follow elevation, gently bent) break up the fall-line streaks
      float bend = (valueNoise2(p.xz * 2.3) - 0.5) * 0.14;
      float beds = fbm2Lite(vec2((vElevM * 0.001 + bend) * 38.0, dot(p.xz, vec2(0.71, 0.71)) * 3.0));
      rockH = mix(rockH, smoothstep(0.25, 0.75, 0.5 * (rockH + beds)), wallFade);
    }

    // Canopy: crown clusters about 16 m across, seen from above
    // (cluster size varies with a low-frequency term so it does not read as a regular stipple)
    float crownScale = 46.0 + 26.0 * valueNoise2(p.xz * 3.1);
    vec3 crown = worley2(p.xz * crownScale + vec2(13.0, 5.0));
    float crownH = 1.0 - smoothstep(0.0, 0.70, crown.x);

    float rockW = rockMask * max(detailFade, wallFade);
    float canopyW = canopyMask * detailFade;
    satRgb *= 1.0 + (rockH - 0.5) * mix(0.34, 0.85, wallFade) * rockW;
    satRgb *= mix(1.0, 0.84 + 0.24 * crownH + 0.08 * (crown.z - 0.5), canopyW);

    // Relief of the detail in world units (metres times the vertical scale)
    float hWorld = (rockH * 9.0 * rockMask * detailFade + crownH * 6.0 * canopyW) * uUnitsPerMetre.y;
    N = normalize(mix(N, perturbNormal(vWorldPos, N, hWorld), detailFade));
    roughness = mix(roughness, 0.55 + 0.35 * rockH, rockW);
  }

  // --- Lighting ------------------------------------------------------------------------------
  // Reference light is 1.0: there the imagery shows its own colors (it already carries the sun
  // of the day it was taken). A slope square to the sun gets about 1.15, level ground about 0.95,
  // a slope turned away or in cast shadow about 0.25, so relief reads by contrast.
  // Sun shadow is baked once per region with a soft edge (./shadowBake.ts).
  float shadow = mix(0.10, 1.0, baked.r);
  // The context terrain around the pack has no baked shadows and no sky view map. Toward the pack
  // edge both ease out to what the context uses, so the light does not step along the boundary.
  vec2 toPackEdge = min(vUv, 1.0 - vUv);
  float edgeEase = (1.0 - smoothstep(0.0, 0.07, min(toPackEdge.x, toPackEdge.y))) * uContextMix;
  shadow = mix(shadow, 1.0, edgeEase);
  // Soft shadow of the smoke column (see ./smokeVolume.ts). It dims sunlight, not emission.
  // Five taps soften it into a penumbra, and part of the light always gets through: thick smoke
  // dims the ground, it does not blot it out.
  float smokeT = 0.36 * texture2D(uSmokeShadowTex, vUv).r
               + 0.16 * (texture2D(uSmokeShadowTex, vUv + vec2(0.012, 0.007)).r
                       + texture2D(uSmokeShadowTex, vUv + vec2(-0.007, 0.012)).r
                       + texture2D(uSmokeShadowTex, vUv + vec2(-0.012, -0.007)).r
                       + texture2D(uSmokeShadowTex, vUv + vec2(0.007, -0.012)).r);
  float smokeShade = mix(1.0, mix(0.42, 1.0, smokeT), uSmokeShadowMix);
  float nDotL = max(0.0, dot(N, sunDir));
  float skyFill = 0.5 + 0.5 * N.y;
  float ao = mix(mix(0.34, 1.0, smoothstep(0.42, 0.98, skyView)), 0.92, edgeEase);
  vec3 sunIrradiance = uSunColor * (SUN_KEY * nDotL * shadow * smokeShade);
  vec3 ambientSky = mix(vec3(0.16, 0.19, 0.25), vec3(0.24, 0.27, 0.33), skyFill) * ao;
  vec3 lighting = ambientSky + sunIrradiance;
  vec3 litEarth = satRgb * lighting;

  // Broad sun sheen on bare rock, scaled by the detail roughness
  vec3 halfVec = normalize(sunDir + viewDir);
  float rockSpec = pow(max(0.0, dot(N, halfVec)), mix(64.0, 10.0, roughness))
                 * (1.0 - roughness) * 0.22 * rockMask * shadow * nDotL;
  litEarth += vec3(1.0, 0.96, 0.90) * rockSpec;

  // Relief shading term reused by flat data fills so they sit on the ground instead of floating
  float shadeTerm = clamp(nDotL * shadow * 1.15 + 0.22, 0.0, 1.0);

  if (waterMask > 0.02) {
    // Wind ruffles from two drifting noise fields. Regular wave trains read as stripes across
    // the whole sea from the distances the stage looks from.
    vec2 wq = vWorldPos.xz * 7.0;
    float rippleA = valueNoise2(wq + vec2(uTime * 0.21, uTime * 0.13)) - 0.5;
    float rippleB = valueNoise2(wq * 2.3 + vec2(7.0 - uTime * 0.17, 3.0 + uTime * 0.19)) - 0.5;
    float rippleFade = 1.0 - smoothstep(0.015, 0.09, kmPerPx);
    vec3 waterN = normalize(N + vec3(rippleA, 0.0, rippleB) * (0.05 * rippleFade * waterMask));
    float spec = pow(max(0.0, dot(waterN, halfVec)), 96.0) * shadow;
    float fresnel = pow(1.0 - max(0.0, dot(waterN, viewDir)), 4.0);
    // (the sea, from the elevation's 0 m, takes one deep tone as a lake does: imagery at sea is
    // often tiles of other dates and brightness)
    litEarth = waterSurface(litEarth, waterMask, lake, seaMask, fresnel, spec, uNight);
  }

  // Aerial perspective: Rayleigh and Mie scattering along the true-scale path from the camera
  // (see ./atmosphere.ts). Valleys and far slopes sit behind more air than ridges and near ones.
  vec3 toPointKm = (vWorldPos - cameraPosition) / (uUnitsPerMetre * 1000.0);
  float pathKm = length(toPointKm);
  float baseElevM = mix(uElevPrevRange.x, uElevNextRange.x, uMorph);
  float camAltKm = (baseElevM + cameraPosition.y / uUnitsPerMetre.y) * 0.001;
  // The stage is a miniature: a close view is in truth tens of kilometres away, and the full air
  // path would veil the foreground. Air near the camera therefore counts less (display choice).
  float hazeKm = pathKm * uHazeStrength * pathKm / (pathKm + HAZE_NEAR_KM);
  vec3 viewTrue = toPointKm / max(pathKm, 1e-4);
  vec3 hazeUnused;
  vec3 hazeTrans = atmAerialPerspective(
    camAltKm, vElevM * 0.001, hazeKm, dot(viewTrue, uSunTrue), uSunTransmittance, hazeUnused
  );
  // The light scattered into the path is whatever the dome draws behind this direction: sky near
  // and above the horizon, the floor when the view looks down. Distance therefore takes the ground
  // into exactly its backdrop, in every view and mode, and the far part of the slab never stands
  // out lighter or darker than what surrounds it.
  vec3 backdrop = atmBackdrop(
    uSkyView, viewTrue, normalize(uSunTrue), clamp(camAltKm, 0.02, ATM_TOP - 1.0),
    uSkyExposure, uFloorColor, uFloorHaze
  );
  vec3 hazeIn = backdrop * (1.0 - hazeTrans);
  // Surface radiance before the air in between (burned ground is composed from it below)
  vec3 litEarthClear = litEarth;
  litEarth = nightGrade(capSurface(litEarth * hazeTrans + hazeIn));
  // By night water gives back a dark sky: never brighter than the land beside it
  litEarth *= 1.0 - WATER_NIGHT_DIM * waterMask * uNight;

  // Sample 256x256 scientific solver fields
  vec4 f0 = textureLod(uFieldTex0, vUv, 0.0);
  vec4 f1 = textureLod(uFieldTex1, vUv, 0.0);
  vec4 field = mix(f0, f1, uFrameMix);

  float sensGate = max(0.015, uSensitivity * 0.42);
  float zHatNorm  = field.r;
  float sigmaNorm = field.g;

  // Orbital Sensor Split Curtain plane signed distance
  vec2 cutDir = normalize(uCutawayDir);
  float scanCoord = dot(vUv - vec2(0.5), cutDir) - uCutawayPlane;
  float posteriorSide = smoothstep(-0.0045, 0.0045, -scanCoord);
  float rawSide = 1.0 - posteriorSide;

  float showPosterior = clamp(uReconMix + uCutawayMix * posteriorSide, 0.0, 1.0);
  float showRawModis  = clamp(uCutawayMix * rawSide, 0.0, 1.0);

  vec3 finalRgb = litEarth;

  // ===========================================================================
  // A. HARMONIZED 375 M SIDE (OR FULL FIRE FIELD MODE): FIRE AS A SURFACE TREATMENT
  // Position, timing and strength come from the solver field. Shape below one cell is rendering.
  // ===========================================================================
  if (showPosterior > 0.005) {
    vec3 postRgb;
    if (uFootMix.x > 0.5) {
      // A real run. Two things are drawn and nothing is invented: no flames, no embers, no
      // burned ground.
      // 0. NASA's burned-area map, after the reveal, on the ground under everything else
      vec3 groundRgb = uBurnedMix > 0.002 ? burnedOver(litEarth, vUv) : litEarth;
      // 1. The model's estimate.
      if (uBeliefGrid.x > 0.5) {
        // The belief, in ink (see beliefMarks). By day a dark edge holds the ink on bright ground.
        vec3 ink = mix(vec3(1.30, 1.32, 1.36), vec3(0.40, 0.46, 0.56), uNight) * marks.z;
        postRgb = groundRgb * (1.0 - 0.55 * marks.y * (1.0 - uNight) * hazeTrans.g);
        postRgb *= 1.0 - BELIEF_DAY_SHADE * marks.w * (1.0 - uNight) * hazeTrans.g;
        // (while the landing fades from one pass to the next the ink dips with the lights, so the
        // belief's change of time does not pop)
        postRgb = mix(postRgb, ink, marks.x * mix(0.84, 0.48, uBeliefQuiet) * mix(0.4, 1.0, uLightGain) * hazeTrans.g);
      } else {
        // No belief frames on show (the file has not come yet, or did not load): no estimate is
        // drawn. A tint read off the run's field used to stand in here; on a real field it washed
        // the whole block red, since that field is above its floor almost everywhere.
        postRgb = groundRgb;
      }
      // 2. What the overpass on show detected, as emitted light, each detection in its own
      // footprint. A paired MODIS overpass (landing) belongs to the raw side only.
      // The light falls on the ground around it: the same light texture read at two coarse levels
      // (about half a kilometre and two kilometres wide), taken up by the ground's own colour. Where the
      // light is and how strong comes from the detections; how far it reaches is drawing.
      vec3 castLight = textureLod(uFireHist, vUv, 4.4).rgb * FIRE_CAST_NEAR + textureLod(uFireHist, vUv, 6.2).rgb * FIRE_CAST_FAR;
      // Eased toward a ceiling: a few very strong detections light their ridge, they do not flood it
      castLight /= 1.0 + FIRE_CAST_EASE * dot(castLight, vec3(0.3, 0.5, 0.2));
      // The glow falls on the slopes that face the fire: the way to the fire is up the light's own wide
      // blur (four taps half a kilometre apart), and a slope turned toward it takes more of the glow,
      // one turned away less, so the relief around a fire reads in its own light
      float castSum = dot(castLight, vec3(0.3, 0.5, 0.2));
      if (castSum > 1e-4) {
        vec2 stepUv = 0.5 / uExtentKm;
        float lE = dot(textureLod(uFireHist, vUv + vec2(stepUv.x, 0.0), 5.6).rgb, vec3(0.3, 0.5, 0.2));
        float lW = dot(textureLod(uFireHist, vUv - vec2(stepUv.x, 0.0), 5.6).rgb, vec3(0.3, 0.5, 0.2));
        float lN = dot(textureLod(uFireHist, vUv + vec2(0.0, stepUv.y), 5.6).rgb, vec3(0.3, 0.5, 0.2));
        float lS = dot(textureLod(uFireHist, vUv - vec2(0.0, stepUv.y), 5.6).rgb, vec3(0.3, 0.5, 0.2));
        // (east is +x, north is -z on the slab)
        vec2 toFire = vec2(lE - lW, -(lN - lS));
        float pull = length(toFire);
        float facing = pull > 1e-6 ? dot(N.xz, toFire / pull) : 0.0;
        castLight *= clamp(1.0 + FIRE_SLOPE_LIGHT * facing * smoothstep(0.0, 0.002, pull), 0.3, 2.2);
      }
      castLight *= mix(1.0, FIRE_CAST_NIGHT, uNight);
      postRgb += (satRgb + vec3(0.012)) * castLight * mix(0.3, 1.0, uNight) * (1.0 - 0.6 * waterMask) * hazeTrans * uFootMix.x * scanned * castShare;
      postRgb *= 1.0 - DAY_LIGHT_UNDER * clamp(lit.a, 0.0, 1.0) * (1.0 - uNight) * hazeTrans.g;
      // The cores breathe, slowly, each at its own pace, with a quicker flicker over it (noise fixed to
      // the ground, drifting in time)
      float breath = 1.0 + FIRE_BREATH * (2.0 * valueNoise2(pKm * 2.4 + vec2(uTime * 0.31, -uTime * 0.23)) - 1.0)
                         + FIRE_FLICKER * (2.0 * valueNoise2(pKm * 9.0 + vec2(-uTime * 2.1, uTime * 1.7)) - 1.0);
      vec3 fireRgb = lit.rgb * breath;
      // The bed of burning ground right round each light: its light read a little wider, deep orange, by
      // night, breathing with it
      fireRgb += textureLod(uFireHist, vUv, 2.6).rgb * vec3(1.0, 0.42, 0.16) * FIRE_BED * uNight * breath
               * uFootMix.x * scanned * uLightGain * (1.0 - 0.7 * waterMask);
      // Embers: specks of light inside a light's halo and bed, each cell's at its own place and pace, by
      // night. Cells keep a few pixels wide at any distance (larger cells from far, two sizes crossfaded
      // by distance so nothing pops), so they read and do not shimmer
      float emberRoom = smoothstep(0.012, 0.10, lit.a + 0.6 * dot(textureLod(uFireHist, vUv, 2.6).rgb, vec3(0.3, 0.5, 0.2)))
                      * (1.0 - smoothstep(1.2, 2.6, lit.a)) * uNight * uFootMix.x * scanned * uLightGain;
      if (emberRoom > 0.002) {
        float octave = log2(max(EMBER_CELL_PX * kmPerPx / EMBER_CELL_KM, 1.0));
        float lo = floor(octave);
        float ember = 0.0;
        for (int k = 0; k < 2; k++) {
          float level = lo + float(k);
          float cellKm = EMBER_CELL_KM * exp2(level);
          vec2 cell = floor(pKm / cellKm);
          vec2 h = hash22(cell + 17.0 + level * 31.0);
          vec2 at = (cell + 0.25 + 0.5 * h) * cellKm;
          float dot0 = 1.0 - smoothstep(0.10, 0.26, length(pKm - at) / cellKm);
          float twinkle = 0.5 + 0.5 * sin(uTime * (1.1 + 2.3 * h.y) + 40.0 * h.x);
          float weight = k == 0 ? 1.0 - fract(octave) : fract(octave);
          ember += step(1.0 - EMBER_SHARE, hash12(cell + 3.0 + level * 7.0)) * dot0 * twinkle * twinkle * weight;
        }
        fireRgb += vec3(1.0, 0.38, 0.09) * ember * EMBER_GAIN * emberRoom;
      }
      postRgb += fireRgb * hazeTrans.g;
      // The instrument's pixel around each light, when asked for: a faint warm hairline, so a
      // coarse pixel reads as coarse beside the model's finer cells
      if (uPixelOutline > 0.01) {
        float pixelHair = scanHairline(abs(foot.r), footGradM, 1.2) * (1.0 - uRevealed.x)
                        + scanHairline(abs(foot.b), footGradV, 1.2) * (1.0 - uRevealed.y);
        postRgb = mix(postRgb, vec3(1.05, 0.66, 0.42) * mix(1.0, 0.8, uNight), clamp(pixelHair, 0.0, 1.0) * 0.55 * uPixelOutline * scanned * hazeTrans.g);
      }
      // 3. Detections laid on after scoring (the hidden instrument of a blind run once it is
      // revealed, or what a look found): a filled blue square in each detection's own pixel. One
      // mark, the same for a look and for a reveal, never the warm light of a detection the
      // estimate was made from, and filled where the estimate's frames are open.
      if (uRevealed.x + uRevealed.y > 0.5) {
        // (a pixel's half width on screen is one over its field's gradient)
        float smallM = 1.0 - smoothstep(3.0, 9.0, 1.0 / footGradM);
        float smallV = 1.0 - smoothstep(3.0, 9.0, 1.0 / footGradV);
        float coreM = revealCore(foot.r, smallM) * uRevealed.x;
        float coreV = revealCore(foot.b, smallV) * uRevealed.y;
        // (they arrive behind a front that crosses the fire along the pass's own ground track: the
        // order the satellite acquired them in; the timing is drawing)
        float arrived = smoothstep(-uRevealArrive.w, 0.0, uRevealArrive.z - dot(pKm, uRevealArrive.xy));
        // (while the page's sweep runs, they show only behind its line, left of it on screen)
        arrived *= uRevealLine.x < 0.0 ? 1.0 : step(gl_FragCoord.x, uRevealLine.x * uRevealLine.y);
        coreM *= arrived;
        coreV *= arrived;
        float core = clamp(coreM + coreV, 0.0, 1.0);
        float fewPx = max(smallM * uRevealed.x, smallV * uRevealed.y);
        // By day the ground under the square is drawn darker first, so the blue stands on sunlit
        // ground (display choice)
        postRgb *= 1.0 - REVEAL_DAY_UNDER * core * (1.0 - uNight) * hazeTrans.g;
        // Its strength follows the detection's fire power. Small squares run together: they are
        // drawn in a deeper blue there, so the patch they make stays apart from the estimate's ink
        float power = (coreM * mix(0.6, 1.2, heatOf(fieldNorm(foot.g))) + coreV * mix(0.6, 1.2, heatOf(fieldNorm(foot.a)))) / max(coreM + coreV, 1e-4);
        vec3 blue = mix(vec3(0.20, 0.62, 1.0), vec3(0.05, 0.42, 1.0), fewPx) * power * (1.0 + REVEAL_FAR_LIFT * uFarView);
        postRgb = mix(postRgb, blue, core * REVEAL_FILL * hazeTrans.g);
        // The estimate's ink stays on top, so a frame the hidden satellite filled reads as a white
        // frame with blue inside it: the two things the test compares, one over the other
        if (uBeliefGrid.x > 0.5) {
          vec3 inkOver = mix(vec3(1.30, 1.32, 1.36), vec3(0.62, 0.68, 0.78), uNight) * marks.z;
          postRgb = mix(postRgb, inkOver, marks.x * 0.84 * core * hazeTrans.g);
        }
      }
    } else {
      // Fuel from canopy cover (pack canopy index, or the imagery heuristic without a pack)
      float fuel = mix(0.30, 1.0, canopyK) * (1.0 - waterMask);

      FireSurface fire = evalFireSurface(vUv, pKm, kmPerPx, N, slopeMag, fuel, waterMask);

      // 1. Burned ground: char with pale ash where severity and fuel were high
      float grit = 0.80 + 0.40 * valueNoise2(pKm * 46.0);
      // Char keeps a share of the picture under it, so rock faces, gullies and roads still read
      // through the burn instead of the ground turning into flat dark paint with pale blotches.
      vec3 charAlbedo = (vec3(0.012, 0.011, 0.012) + satRgb * 0.22) * grit;
      vec3 ashAlbedo = (vec3(0.085, 0.082, 0.076) + satRgb * 0.30) * grit;
      vec3 burnAlbedo = mix(charAlbedo, ashAlbedo, fire.ash * 0.6);
      postRgb = mix(litEarthClear, burnAlbedo * lighting, fire.burned);

      // 2. Warm bounce light from nearby flames on the ground and canyon walls around them
      vec3 groundAlbedo = mix(satRgb, burnAlbedo, fire.burned);
      postRgb += groundAlbedo * fireBounceLight(vUv, N, fire.front) * (1.0 - 0.7 * waterMask);

      // The air in between tints the ground, not the flames
      postRgb = capSurface(postRgb * hazeTrans + hazeIn);

      // 3. Flaming front and ember bed (HDR, above the bloom threshold only at the front)
      postRgb = mix(postRgb, vec3(0.0), clamp(fire.front, 0.0, 1.0) * 0.85);
      postRgb += fire.emission;

      // 4. One standard deviation around the active fire line: where the estimate plus its sigma
      // and the estimate minus its sigma cross the fire threshold. This is the run's own sigma, not
      // an interval of a stated coverage. Hairlines from screen-space derivatives. Nothing is drawn
      // where a bound does not cross the threshold (for example an epoch in a swath gap, where
      // sigma is saturated).
      if (uUncertaintyMix > 0.01) {
        float zMw = zHatNorm * 80.0;
        float sMw = sigmaNorm * 24.0;
        float thrMw = FIRE_THR * 80.0;
        float upper = zMw + sMw - thrMw;
        float lower = zMw - sMw - thrMw;
        float gU = max(fwidth(upper), 1e-4);
        float gL = max(fwidth(lower), 1e-4);
        // Require a real gradient (MW/km2 per km) so flat plateaus near the threshold stay clean
        float steepU = smoothstep(0.6, 2.4, gU / max(kmPerPx, 1e-6));
        float steepL = smoothstep(0.6, 2.4, gL / max(kmPerPx, 1e-6));
        float lineU = (1.0 - smoothstep(0.55, 1.45, abs(upper) / gU)) * steepU;
        float lineL = (1.0 - smoothstep(0.40, 1.10, abs(lower) / gL)) * steepL;
        float boundsMask = uUncertaintyMix * (1.0 - waterMask * 0.85) * (1.0 - fire.front);
        postRgb = mix(postRgb, vec3(0.20, 0.66, 1.0), lineU * 0.62 * boundsMask);
        postRgb = mix(postRgb, vec3(0.72, 0.90, 1.0), lineL * 0.38 * boundsMask);
      }
    }

    finalRgb = mix(finalRgb, postRgb, showPosterior);
  }

  // ===========================================================================
  // B. RAW MODIS SIDE: GROUND-PROJECTED SCAN CELLS OF THE ACTUAL OVERPASS
  // Cells are flat. Nothing is extruded. The fill is the per-cell value of the MODIS channel.
  // ===========================================================================
  if (showRawModis > 0.005) {
    // 1. Cool slate rendition of the terrain so the data layer reads as an instrument view
    float irContrast = clamp((pow(max(satLuma, 0.0005), 0.45) - 0.24) * 1.42 + 0.34, 0.04, 0.96);
    float irShade = irContrast * (0.42 + 0.58 * nDotL * shadow);
    vec3 slateIr = nightGrade(mix(vec3(0.018, 0.028, 0.048), vec3(0.22, 0.30, 0.42), irShade));
    // With context terrain around the pack the rendition fades out before the edge of the data,
    // so the instrument view ends in the landscape and not along a straight line across it
    float slateShare = 0.82 * mix(1.0, smoothstep(0.0, 0.10, min(toPackEdge.x, toPackEdge.y)), uContextMix);
    vec3 rawPassRgb = mix(litEarth, slateIr, slateShare);

    float modisFloor = 0.105 * (0.55 + 0.65 * uSensitivity);
    float modisLit = 0.0;

    if (uFootMix.x > 0.5) {
      // Real run: every MODIS detection as emitted light in its own footprint (scan by track
      // km), with a faint hairline around the pixel: this side is the instrument's view. No empty
      // cells: the source lists detections, not where the sensor looked and saw nothing.
      modisLit = step(0.001, -foot.r);
      rawPassRgb += lit.rgb * uLightModis * hazeTrans.g * (1.0 - step(0.001, uAfterglow));
      float hair = scanHairline(abs(foot.r), footGradM, 1.6) * scanLitFade(1.0 / footGradM);
      rawPassRgb = mix(rawPassRgb, vec3(0.80, 0.87, 0.96), hair * 0.34);
    } else if (uModisPass.w > 0.5) {
      ScanDraw md = evalScanDraw(pKm, kmPerPx, uModisPass, MODIS_SENSOR, MODIS_ORBIT_K, vec4(0.0, 0.0, 1.0, 0.0));
      float mScaled = clamp((md.value - modisFloor) / 0.35, 0.0, 1.0);
      modisLit = step(0.035, mScaled);

      // 2. Flat radiometric fill: the cell value read straight off the intensity scale of the
      // legend (Lipari, 0 to 80 MW/km2 across the ramp), with no remapping.
      // The fill is translucent and takes the relief shading, so the ground reads through it.
      vec3 fill = pictureToScene(texture2D(uLipariTex, vec2(clamp(md.value, 0.005, 0.995), 0.5)).rgb);
      fill *= mix(0.62, 1.30, shadeTerm);
      rawPassRgb = mix(rawPassRgb, fill + rawPassRgb * 0.30, modisLit * 0.66);

      // 3. Hairline borders (constant width in device pixels). A cell that holds a detection gets
      // a crisp light border so it reads as one discrete sensor cell; the lattice over empty
      // ground stays faint.
      float hairFade = mix(scanEmptyFade(md.cellPx, 26.0), scanLitFade(md.cellPx), modisLit);
      vec3 hairEmpty = vec3(0.36, 0.47, 0.62);
      vec3 hairLit = vec3(0.93, 0.91, 0.86);
      rawPassRgb = mix(rawPassRgb, hairEmpty, md.hair * hairFade * 0.30 * (1.0 - modisLit) * uLatticeMix);
      rawPassRgb = mix(rawPassRgb, hairLit, md.hairLit * hairFade * 0.92 * modisLit);
      rawPassRgb = mix(rawPassRgb, vec3(0.50, 0.62, 0.78), md.seam * hairFade * 0.45 * (1.0 - modisLit) * uLatticeMix);
    }

    // 4. Amber hairline hatch where the harmonized record has fire and this MODIS pass reports none
    // Only on a frame that has a MODIS overpass: without one, MODIS missed nothing, it did not look
    float missedMask = smoothstep(0.11, 0.24, zHatNorm) * (1.0 - modisLit) * (1.0 - waterMask)
                     * step(0.5, uModisPass.w) * (1.0 - step(0.5, uFootMix.x));
    if (missedMask > 0.01) {
      float spacingKm = 0.30;
      float hatchDistKm = abs(fract((pKm.x + pKm.y) / spacingKm) - 0.5) * spacingKm * 0.7071;
      float hatch = scanHairline(hatchDistKm, kmPerPx, 1.1)
                  * smoothstep(3.0, 7.0, spacingKm * 0.7071 / max(kmPerPx, 1e-6));
      rawPassRgb = mix(rawPassRgb, vec3(0.86, 0.46, 0.10), missedMask * (0.10 + 0.62 * hatch));
    }

    finalRgb = mix(finalRgb, rawPassRgb, showRawModis);
  }

  // ===========================================================================
  // C. SATELLITE PASSES MODE: SCAN CELLS OF BOTH SENSORS, COLORED BY SENSOR IDENTITY
  // ===========================================================================
  if (uObserverMix > 0.005) {
    float earthLuma = dot(litEarth, vec3(0.2126, 0.7152, 0.0722));
    vec3 obsRgb = mix(litEarth, vec3(earthLuma), 0.35) * 0.80;

    if (uModisWeight > 0.01 && uFootMix.x > 0.5) {
      // Real run: the detections themselves, as light in the sensor's colour, each in its own footprint
      obsRgb += vec3(1.0, 0.36, 0.10) * (0.55 * lit.a * uLightModis) * uModisWeight * (1.0 - step(0.001, uAfterglow));
      float hair = scanHairline(abs(foot.r), footGradM, 1.6);
      obsRgb = mix(obsRgb, vec3(1.0, 0.87, 0.78), hair * 0.60 * uModisWeight);
    } else if (uModisWeight > 0.01 && uModisPass.w > 0.5) {
      ScanDraw md = evalScanDraw(pKm, kmPerPx, uModisPass, MODIS_SENSOR, MODIS_ORBIT_K, vec4(0.0, 0.0, 1.0, 0.0));
      float s = clamp((md.value - sensGate) / 0.35, 0.0, 1.0);
      float lit = step(0.02, s);
      vec3 fill = mix(vec3(0.30, 0.05, 0.015), vec3(1.0, 0.36, 0.10), pow(s, 0.7)) * (0.86 + 0.22 * shadeTerm);
      obsRgb = mix(obsRgb, fill, lit * 0.90 * uModisWeight);
      float hairFade = mix(scanEmptyFade(md.cellPx, 26.0), scanLitFade(md.cellPx), lit);
      obsRgb = mix(obsRgb, vec3(0.62, 0.36, 0.24), md.hair * hairFade * 0.24 * (1.0 - lit) * uModisWeight);
      obsRgb = mix(obsRgb, vec3(1.0, 0.87, 0.78), md.hairLit * hairFade * 0.90 * lit * uModisWeight);
      obsRgb = mix(obsRgb, vec3(0.78, 0.50, 0.36), md.seam * hairFade * 0.40 * (1.0 - lit) * uModisWeight);
    }

    if (uViirsWeight > 0.01 && uFootMix.y > 0.5) {
      obsRgb += vec3(0.16, 0.70, 1.0) * (0.55 * lit.a * (1.0 - uLightModis)) * uViirsWeight;
      float hair = scanHairline(abs(foot.b), footGradV, 1.3);
      obsRgb = mix(obsRgb, vec3(0.84, 0.96, 1.0), hair * 0.50 * uViirsWeight);
    } else if (uViirsWeight > 0.01 && uViirsPass.w > 0.5) {
      ScanDraw vd = evalScanDraw(pKm, kmPerPx, uViirsPass, VIIRS_SENSOR, VIIRS_ORBIT_K, vec4(0.0, 0.0, 0.0, 1.0));
      float s = clamp((vd.value - sensGate * 0.45) / 0.35, 0.0, 1.0);
      float lit = step(0.02, s);
      vec3 fill = mix(vec3(0.02, 0.16, 0.26), vec3(0.16, 0.70, 1.0), pow(s, 0.7)) * (0.86 + 0.22 * shadeTerm);
      obsRgb = mix(obsRgb, fill, lit * 0.92 * uViirsWeight);
      // The 375 m lattice over empty ground appears only once its cells are large on screen
      float hairFade = mix(scanEmptyFade(vd.cellPx, 54.0), scanLitFade(vd.cellPx), lit);
      obsRgb = mix(obsRgb, vec3(0.30, 0.52, 0.66), vd.hair * hairFade * 0.20 * (1.0 - lit) * uViirsWeight);
      obsRgb = mix(obsRgb, vec3(0.84, 0.96, 1.0), vd.hairLit * hairFade * 0.85 * lit * uViirsWeight);
      obsRgb = mix(obsRgb, vec3(0.42, 0.68, 0.84), vd.seam * hairFade * 0.40 * (1.0 - lit) * uViirsWeight);
    }

    if (uModisWeight > 0.01 && uModisPass.w > 0.5 && uScanStrip.y > 0.004) {
      obsRgb = scanStripMark(obsRgb, pKm, kmPerPx, uModisPass, MODIS_SENSOR, MODIS_ORBIT_K,
                             vec2(uScanStrip.x, uScanStrip.y * uModisWeight), vec3(1.0, 0.74, 0.52));
    }
    if (uViirsWeight > 0.01 && uViirsPass.w > 0.5 && uScanStrip.w > 0.004) {
      obsRgb = scanStripMark(obsRgb, pKm, kmPerPx, uViirsPass, VIIRS_SENSOR, VIIRS_ORBIT_K,
                             vec2(uScanStrip.z, uScanStrip.w * uViirsWeight), vec3(0.72, 0.93, 1.0));
    }

    finalRgb = mix(finalRgb, obsRgb, uObserverMix);
  }

  // ===========================================================================
  // D. RAZOR-SHARP OPTICAL LASER LINE WHERE THE 3D GLASS CURTAIN SLICES TERRAIN
  // ===========================================================================
  if (uCutawayMix > 0.01) {
    // Hairline of constant screen width where the curtain meets the ground, with a tight halo.
    // Instrument graphics stay under the bloom threshold: only fire is allowed to bloom.
    float cutKm = abs(scanCoord) * length(cutDir * uExtentKm);
    float scanLine = scanHairline(cutKm, kmPerPx, 1.6) * uCutawayMix;
    // Over open water the seam is a straight bright bar to the horizon, so it is drawn fainter there
    float scanHalo = exp(-cutKm / max(0.10, 7.0 * kmPerPx)) * uCutawayMix * (1.0 - 0.8 * waterMask);
    scanLine *= 1.0 - 0.6 * waterMask;
    // By night the seam is kept quiet: the fire is the brightest thing in the frame
    finalRgb += (vec3(0.35, 0.82, 1.0) * scanHalo * 0.15 + vec3(0.92, 0.99, 1.0) * scanLine * 0.70)
              * mix(1.0, 0.22, uNight);
  }

  // The scan front of a pass that is arriving: one hairline across the ground. Warm for a
  // pass the estimate takes in, in ink and broken for a pass kept from it.
  if (uScan.w > 0.001) {
    float behindKm = uScan.z - scanAlong;
    float frontLine = scanHairline(abs(behindKm), max(length(vec2(dFdx(scanAlong), dFdy(scanAlong))), 1e-6), 1.4);
    float acrossKm = dot(pKm, vec2(-uScan.y, uScan.x));
    float dashKm = 7.0 * max(length(vec2(dFdx(acrossKm), dFdy(acrossKm))), 1e-6);
    float broken = mix(1.0, step(0.5, fract(acrossKm / exp2(floor(log2(dashKm))))), uHeldOut);
    vec3 scanRgb = mix(vec3(1.25, 1.02, 0.74), mix(vec3(1.16, 1.18, 1.22), vec3(0.62, 0.68, 0.78), uNight), uHeldOut);
    finalRgb = mix(finalRgb, scanRgb, frontLine * broken * 0.9 * uScan.w * hazeTrans.g);
  }

  // The board of tiles, over every view of the ground
  if (uTileGrid.x > 0.5) {
    vec3 tileInk = mix(vec3(1.16, 1.18, 1.22), vec3(0.62, 0.68, 0.78), uNight) * tiles.z;
    finalRgb *= 1.0 - 0.5 * tiles.y * (1.0 - uNight) * hazeTrans.g;
    finalRgb = mix(finalRgb, tileInk, tiles.x * hazeTrans.g);
  }

  // Close views: the far edge of the slab dissolves into what the dome draws behind it (sky, or
  // the hazy floor under the horizon), so the view ends in air and not at the cut edge of a model.
  // Overview and nadir keep the edge.
  // The same share of the surface also sinks to the base, and ground that stands above the
  // horizon is left alone (see edgeGone and edgeGoneAt in the heightfield code).
  float gone = edgeGone(vUv) * belowHorizon(vWorldPos);
  finalRgb = mix(finalRgb, nightGrade(backdrop), gone);

  // Subtle top bevel edge highlight around the 4 outer cut boundaries of the slab. Where the land
  // around the box is drawn there is no cut boundary, and no line
  float borderDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float rimBevel = 1.0 - smoothstep(0.0, 0.0028, borderDist);
  finalRgb = mix(finalRgb, finalRgb + vec3(0.14, 0.17, 0.22), rimBevel * 0.65 * (1.0 - gone) * (1.0 - uContextMix));

  gl_FragColor = vec4(finalRgb, 1.0);
}
`;function xr(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function Su(e){if(!xr(e))return null;const{extent_km:t,scale:a,dem:s,ortho:o}=e;return!Array.isArray(t)||t.length!==2||!t.every(i=>typeof i=="number"&&i>0)||typeof a!="number"||!(a>1)||a>15||!xr(s)||typeof s.url!="string"||typeof s.size!="number"||s.format!=="f32le"||!xr(o)||typeof o.url!="string"||typeof o.size!="number"?null:e}function jf(e,t,a,s){const o=new Uint8Array(t*t*4),i=s?new Uint8Array(t*t):_f(e,t),l=Ff(e,t),h=If(e,t,l),r=a[0]*1e3/(t-1),u=a[1]*1e3/(t-1);for(let p=0;p<t;p++){const M=Math.min(t-1,p+1),b=Math.max(0,p-1);for(let g=0;g<t;g++){const A=Math.min(t-1,g+1),R=Math.max(0,g-1),w=(e[p*t+A]-e[p*t+R])/((A-R)*r),x=(e[b*t+g]-e[M*t+g])/((M-b)*u),S=1/Math.hypot(w,1,x),_=(p*t+g)*4;o[_]=Math.round((-w*S*.5+.5)*255),o[_+1]=Math.round((-x*S*.5+.5)*255),o[_+2]=l[p*t+g]?255:h[p*t+g]?128:0,o[_+3]=i[p*t+g]?255:0}}const d=new ta(o,t,t,It,Ot);return d.colorSpace=Ua,d.wrapS=Ve,d.wrapT=Ve,d.magFilter=Be,d.minFilter=Xa,d.generateMipmaps=!0,d.flipY=!1,d.needsUpdate=!0,d}async function Xf(e,t){var a;try{if(e.ortho.size>t.maxTextureSize)return null;const[s,o]=await Promise.all([fetch(t.resolveUrl(e.dem.url)).then(d=>d.ok?d.arrayBuffer():null),Ah(t.resolveUrl(e.ortho.url),t.maxAnisotropy)]),i=e.dem.size;if((((a=t.isCancelled)==null?void 0:a.call(t))??!1)||!s||s.byteLength!==i*i*4||!o)return o==null||o.dispose(),null;const l=new Float32Array(s),h=ul(l,i);h&&Eh(l,i);const r=Ls(l,!0),u=jf(r.aligned,r.gridRes,e.extent_km,h);return{manifest:e,scale:e.scale,demTexture:r.texture,alignedDem:r.aligned,gridRes:r.gridRes,shadeTexture:u,orthoTexture:o,dispose:()=>{r.texture.dispose(),u.dispose(),o.dispose()}}}catch{return null}}const kh=6360;function qf(e,t){return(e*e+2*e*t)/(2*kh)}const Zf=`
${ln}

uniform vec3 uUnitsPerMetre;

varying vec2 vCuv;
varying vec2 vPackUv;
varying vec3 vWorldPos;
varying float vElevM;

void main() {
  vCuv = uv;
  vec2 packUv = (uv - 0.5) * uContextScale + 0.5;
  vPackUv = packUv;
  float elevM = sampleR32FBilinear(uContextDem, uv, uContextRes);
  vElevM = elevM;
  float y = (elevM - uElevNextRange.x) * uReliefScale.y;

  vec2 xz = vec2((packUv.x - 0.5) * uSlabSize.x, (0.5 - packUv.y) * uSlabSize.y);
  // The ground curves away beyond the pack (see contextDropKm)
  vec2 outKm = max(abs(xz) - 0.5 * uSlabSize, vec2(0.0)) / (uUnitsPerMetre.xz * 1000.0);
  float halfKm = 0.25 * (uSlabSize.x / uUnitsPerMetre.x + uSlabSize.y / uUnitsPerMetre.z) * 0.001;
  float dOut = length(outKm);
  y -= (dOut * dOut + 2.0 * dOut * halfKm) / (2.0 * ${kh.toFixed(1)}) * 1000.0 * uUnitsPerMetre.y;

  // Under the pack this surface dives out of the way; the pack is the surface there. The dive
  // starts more than one cell of this mesh inside the pack, so along the pack edge both surfaces
  // are at the same height (the pack takes the context elevation there, see contextJoin).
  vec2 e = min(packUv, 1.0 - packUv);
  y -= clamp((min(e.x, e.y) - 0.012) * 40.0, 0.0, 1.0) * 0.6;

  vec4 worldPos = modelMatrix * vec4(xz.x, y, xz.y, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`,Qf=`
uniform sampler2D uContextOrtho;
uniform sampler2D uContextShade;
uniform float uContextMix;
uniform vec3 uSunDir;
uniform vec3 uSunTrue;
uniform vec3 uSunColor;
uniform vec3 uSunTransmittance;
uniform float uHazeStrength;
uniform sampler2D uSkyView;
uniform float uSkyExposure;
uniform vec3 uFloorColor;
uniform float uFloorHaze;
uniform vec3 uUnitsPerMetre;
uniform vec2 uElevNextRange;

varying vec2 vCuv;
varying vec2 vPackUv;
varying vec3 vWorldPos;
varying float vElevM;

${on}
${rn}
${nn}
${_h}

const float CONTEXT_FADE_FROM = 0.8; // share of the way to the context box's edge where the fade starts

void main() {
  vec2 e = min(vPackUv, 1.0 - vPackUv);
  if (min(e.x, e.y) > 0.004) discard;

  vec3 sunDir = normalize(uSunDir);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec4 shade = texture2D(uContextShade, vCuv);
  vec2 nxz = shade.rg * 2.0 - 1.0;
  vec3 nTrue = vec3(nxz.x, sqrt(max(1e-4, 1.0 - dot(nxz, nxz))), nxz.y);
  vec3 N = normalize(nTrue / uUnitsPerMetre);
  vec3 picture = texture2D(uContextOrtho, vCuv).rgb;
  vec3 albedo = pictureToScene(picture);
  // (a slightly blurred sample, so a patch passes or fails a test on the picture as one piece)
  vec3 broad = texture2D(uContextOrtho, vCuv, 2.0).rgb;
  // The sea: posts at sea level in the elevation; a low patch with sea around most of it, where the
  // picture there looks like water or has none (imagery has no data over open sea: pure black); and
  // any ground within a few metres of the sea that has no picture at all. A barrier island or a sand
  // bar is as low, and its picture shows sand or houses: it stays land.
  float noPicture = 1.0 - smoothstep(0.02, 0.05, max(broad.r, max(broad.g, broad.b)));
  float sea = max(smoothstep(0.55, 0.95, shade.b), smoothstep(0.30, 0.45, shade.b) * max(waterLook(broad), noPicture));
  sea = max(sea, noPicture * (1.0 - smoothstep(3.0, 8.0, vElevM)));
  // A lake: level ground in the elevation where the picture looks like water
  // (a gentler edge than the sea's: a lake is a few posts wide out here, and its shore would step)
  float lake = smoothstep(0.30, 0.70, shade.a) * waterLook(picture);
  // Water by the picture alone, as in the pack: dark, bluer than it is green or red, on flat ground
  // (a reservoir where the elevation gives no level surface would otherwise be a dark stain)
  // (on the blurred sample, so a reservoir passes or fails as one piece and not pixel by pixel)
  float pictureLuma = dot(broad, vec3(0.2126, 0.7152, 0.0722));
  float pictureWater = smoothstep(0.90, 0.98, broad.b / max(broad.g, 1e-3)) * smoothstep(1.30, 1.50, broad.b / max(broad.r, 1e-3))
                     * (1.0 - smoothstep(0.022, 0.042, pictureLuma)) * (1.0 - smoothstep(0.03, 0.08, length(nxz)));
  float water = max(max(sea, lake), pictureWater);

  // The pack's light balance (see ./terrainShader.ts), without baked shadows or sky view
  float nDotL = max(0.0, dot(N, sunDir));
  float skyFill = 0.5 + 0.5 * N.y;
  vec3 lighting = mix(vec3(0.16, 0.19, 0.25), vec3(0.24, 0.27, 0.33), skyFill) * 0.92
                + uSunColor * (SUN_KEY * nDotL);
  vec3 lit = albedo * lighting;

  // The pack's water (see waterSurface in ./terrainShader.ts): the same terms, so a lake or a
  // sea that crosses the pack's edge is one body of water
  if (water > 0.01) {
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 halfVec = normalize(sunDir + viewDir);
    float fresnel = pow(1.0 - max(0.0, dot(up, viewDir)), 4.0);
    float spec = pow(max(0.0, dot(up, halfVec)), 96.0);
    lit = waterSurface(lit, water, lake, sea, fresnel, spec, uNight);
  }

  // The same air as over the pack: distance takes the ground into what the dome draws behind it
  vec3 toPointKm = (vWorldPos - cameraPosition) / (uUnitsPerMetre * 1000.0);
  float pathKm = length(toPointKm);
  float camAltKm = (uElevNextRange.x + cameraPosition.y / uUnitsPerMetre.y) * 0.001;
  float hazeKm = pathKm * uHazeStrength * pathKm / (pathKm + HAZE_NEAR_KM);
  vec3 viewTrue = toPointKm / max(pathKm, 1e-4);
  vec3 unused;
  vec3 trans = atmAerialPerspective(
    camAltKm, vElevM * 0.001, hazeKm, dot(viewTrue, uSunTrue), uSunTransmittance, unused
  );
  vec3 backdrop = atmBackdrop(
    uSkyView, viewTrue, normalize(uSunTrue), clamp(camAltKm, 0.02, ATM_TOP - 1.0),
    uSkyExposure, uFloorColor, uFloorHaze
  );
  // The data around the pack ends at the context box. Over its outer fifth the ground goes into what
  // the dome draws behind it, so neither land nor an even sea stops at a straight line
  vec2 fromCentre = abs(vCuv - 0.5) * 2.0;
  float dataEnds = smoothstep(CONTEXT_FADE_FROM, 1.0, max(fromCentre.x, fromCentre.y));
  trans *= 1.0 - dataEnds;
  vec3 rgb = nightGrade(capSurface(lit * trans + backdrop * (1.0 - trans)));
  // By night water gives back a dark sky: never brighter than the land beside it
  rgb *= 1.0 - WATER_NIGHT_DIM * water * uNight * (1.0 - dataEnds);
  gl_FragColor = vec4(rgb, uContextMix);
}
`,Tu=640;class Jf{constructor(t){F(this,"mesh");F(this,"material");F(this,"shadeUniform",{value:null});const a=new tn(1,1,Tu,Tu);this.material=new Et({vertexShader:Zf,fragmentShader:Qf,uniforms:{...t,uContextShade:this.shadeUniform},transparent:!0,depthWrite:!0}),this.mesh=new Sa(a,this.material),this.mesh.frustumCulled=!1,this.mesh.visible=!1,this.mesh.renderOrder=-2}setContext(t){this.shadeUniform.value=(t==null?void 0:t.shadeTexture)??null}dispose(){this.mesh.geometry.dispose(),this.material.dispose()}}function em(e,t,a){const s=e.gridRes,o=Math.min(s-1,Math.max(0,t*(s-1))),i=Math.min(s-1,Math.max(0,a*(s-1))),l=Math.floor(o),h=Math.floor(i),r=Math.min(s-1,l+1),u=Math.min(s-1,h+1),d=o-l,p=i-h,M=e.alignedDem,b=M[h*s+l]*(1-d)+M[h*s+r]*d,g=M[u*s+l]*(1-d)+M[u*s+r]*d;return b*(1-p)+g*p}const Zo=1024,mo=1536,Eu=1.1,tm=5,am=.2,sm=.09,om=.07,Ru=.36,Au=.16,_u=.34,im=[1,.09,.015],ku=[1,.36,.05],nm=[1,.66,.32];function rm(e,t){const a=Math.min(1,Math.max(0,e)),s=Eu+(tm-Eu)*a*a*a,o=a<.5?im:ku,i=a<.5?ku:nm,l=a<.5?a*2:a*2-1;for(let h=0;h<3;h++)t[h]=(o[h]+(i[h]-o[h])*l)*s;t[3]=s}function Fu(e,t){const a=Math.sin(e*12.9898+t*78.233)*43758.5453;return a-Math.floor(a)}const Ki=4,lm=3,Ia=Zo*Zo,wr=mo*mo;class cm{constructor(){F(this,"texture");F(this,"lightTexture");F(this,"modisCount",0);F(this,"viirsCount",0);F(this,"data",new Uint16Array(Ia*4));F(this,"blank",new Uint16Array(Ia*4));F(this,"outside",[new Float32Array(Ia),new Float32Array(Ia)]);F(this,"depth",[new Float32Array(Ia),new Float32Array(Ia)]);F(this,"frp",[new Float32Array(Ia),new Float32Array(Ia)]);F(this,"touched",new Int32Array(65536));F(this,"touchedCount",0);F(this,"mark",new Uint8Array(Ia));F(this,"light",new Float32Array(wr*4));F(this,"lightData",new Uint16Array(wr*4));F(this,"lightTouched",new Int32Array(65536));F(this,"lightTouchedCount",0);F(this,"lightMark",new Uint8Array(wr));F(this,"lightOfOne",new Float32Array(4));const t=Ra.toHalfFloat(Ki);for(let o=0;o<Ia;o++)this.blank[o*4]=t,this.blank[o*4+2]=t;this.data.set(this.blank);for(let o=0;o<2;o++)this.outside[o].fill(Ki);const a=new ta(this.data,Zo,Zo,It,za);a.colorSpace=Ua,a.minFilter=Be,a.magFilter=Be,a.generateMipmaps=!1,a.wrapS=Ve,a.wrapT=Ve,a.flipY=!1,a.needsUpdate=!0,this.texture=a;const s=new ta(this.lightData,mo,mo,It,za);s.colorSpace=Ua,s.minFilter=Xa,s.magFilter=Be,s.generateMipmaps=!0,s.wrapS=Ve,s.wrapT=Ve,s.flipY=!1,s.needsUpdate=!0,this.lightTexture=s}build(t,a,s,o,i=[],l=[]){for(let r=0;r<this.touchedCount;r++){const u=this.touched[r];this.mark[u]=0;for(let d=0;d<2;d++)this.outside[d][u]=Ki,this.depth[d][u]=0,this.frp[d][u]=0;this.data[u*4]=this.blank[u*4],this.data[u*4+1]=0,this.data[u*4+2]=this.blank[u*4+2],this.data[u*4+3]=0}this.touchedCount=0;for(let r=0;r<this.lightTouchedCount;r++){const u=this.lightTouched[r];this.lightMark[u]=0;for(let d=0;d<4;d++)this.light[u*4+d]=0,this.lightData[u*4+d]=0}this.lightTouchedCount=0,this.modisCount=0,this.viirsCount=0;for(const r of t)this.drawFootprint(r,a,s);for(const r of i)this.drawFootprint(r,a,s);for(const r of t)this.drawLight(r,a,s,o);for(const r of l)this.drawLight(r,a,s,o);const h=Ra.toHalfFloat;for(let r=0;r<this.touchedCount;r++){const u=this.touched[r];for(let d=0;d<2;d++){const p=this.depth[d][u];p>0?(this.data[u*4+d*2]=h(-p),this.data[u*4+d*2+1]=h(Math.min(this.frp[d][u],6e4))):this.outside[d][u]<Ki&&(this.data[u*4+d*2]=h(this.outside[d][u]))}}for(let r=0;r<this.lightTouchedCount;r++){const u=this.lightTouched[r];for(let d=0;d<4;d++)this.lightData[u*4+d]=h(Math.min(this.light[u*4+d],6e4))}this.texture.needsUpdate=!0,this.lightTexture.needsUpdate=!0}drawFootprint(t,a,s){const o=Zo,[i,l,h,r]=a,u=s[0]/o,d=s[1]/o,p=lm*Math.max(u,d),M=t.family==="viirs"?1:0,b=(t.lon-i)/Math.max(1e-9,h-i)*s[0],g=(t.lat-l)/Math.max(1e-9,r-l)*s[1],A=t.acrossTrackKm*.5,R=t.alongTrackKm*.5,w=Math.max(1e-4,Math.min(A,R)),x=t.azimuthDeg*Math.PI/180,S=Math.sin(x),_=Math.cos(x),B=Math.hypot(A,R)+p,I=Math.max(0,Math.floor((b-B)/u)),P=Math.min(o-1,Math.ceil((b+B)/u)),U=Math.max(0,Math.floor((g-B)/d)),G=Math.min(o-1,Math.ceil((g+B)/d));if(P<I||G<U)return;M===1?this.viirsCount++:this.modisCount++;const k=t.frpMw/Math.max(1e-4,t.acrossTrackKm*t.alongTrackKm),V=this.outside[M],Z=this.depth[M],ge=this.frp[M];for(let we=U;we<=G;we++){const Re=(we+.5)*d-g;for(let be=I;be<=P;be++){const Me=(be+.5)*u-b,pe=Math.abs(Me*S+Re*_)-A,ht=Math.abs(Me*_-Re*S)-R,ce=Math.hypot(Math.max(pe,0),Math.max(ht,0))+Math.min(Math.max(pe,ht),0);if(ce>p)continue;const ae=we*o+be;if(!this.mark[ae]){if(this.mark[ae]=1,this.touchedCount===this.touched.length){const At=new Int32Array(this.touched.length*2);At.set(this.touched),this.touched=At}this.touched[this.touchedCount++]=ae}if(ce>=0){ce<V[ae]&&(V[ae]=ce);continue}const Rt=Math.min(1,-ce/w);Rt>=Z[ae]&&(Z[ae]=Math.max(Rt,.001),ge[ae]=k)}}}drawLight(t,a,s,o){const i=mo,[l,h,r,u]=a,d=s[0]/i,p=s[1]/i,M=(t.lon-l)/Math.max(1e-9,r-l)*s[0],b=(t.lat-h)/Math.max(1e-9,u-h)*s[1],g=t.acrossTrackKm*.5,A=t.alongTrackKm*.5,R=t.azimuthDeg*Math.PI/180,w=Math.sin(R),x=Math.cos(R),S=this.lightOfOne;rm(o(t.frpMw/Math.max(1e-4,t.acrossTrackKm*t.alongTrackKm)),S);const _=Math.min(sm,am*Math.min(g,A)),B=Math.max(_,.8*Math.max(d,p)),I=_*_/(B*B),P=9*B*B,U=(Fu(t.lon,t.lat)*2-1)*_u*g,G=(Fu(t.lat*1.7,t.lon*.9)*2-1)*_u*A,k=U*w+G*x,V=U*x-G*w,Z=Math.min(Ru*g,Au),ge=Math.min(Ru*A,Au),we=Math.hypot(g,A),Re=Math.max(0,Math.floor((M-we)/d)),be=Math.min(i-1,Math.ceil((M+we)/d)),Me=Math.max(0,Math.floor((b-we)/p)),pe=Math.min(i-1,Math.ceil((b+we)/p)),ht=this.light;for(let ce=Me;ce<=pe;ce++){const ae=(ce+.5)*p-b;for(let Rt=Re;Rt<=be;Rt++){const At=(Rt+.5)*d-M,Ht=At*w+ae*x,ie=At*x-ae*w,m=Math.hypot(Ht/g,ie/A);let Oe=0;const tt=At-k,ia=ae-V;if(tt*tt+ia*ia<P){for(let _t=0;_t<4;_t++){const na=tt+(_t&1?.25:-.25)*d,ca=ia+(_t&2?.25:-.25)*p;Oe+=Math.exp(-(na*na+ca*ca)/(B*B))}Oe*=.25*I}if(m<1){const _t=m<=.72?0:(m-.72)/.28,na=(Ht-U)/Z,ca=(ie-G)/ge;Oe+=om*Math.exp(-(na*na+ca*ca))*(1-_t*_t*(3-2*_t))}if(Oe<=1e-4)continue;const aa=ce*i+Rt;if(!this.lightMark[aa]){if(this.lightMark[aa]=1,this.lightTouchedCount===this.lightTouched.length){const _t=new Int32Array(this.lightTouched.length*2);_t.set(this.lightTouched),this.lightTouched=_t}this.lightTouched[this.lightTouchedCount++]=aa}ht[aa*4]+=S[0]*Oe,ht[aa*4+1]+=S[1]*Oe,ht[aa*4+2]+=S[2]*Oe,ht[aa*4+3]+=S[3]*Oe}}}dispose(){this.texture.dispose(),this.lightTexture.dispose()}}const um=1500,Du=30;function hm(e){const t=Math.log1p(Math.max(0,e)/Du)/Math.log1p(um/Du);return Math.min(1,t)}function dm(e,t,a,s,o,i=.6){const l=o*o,h=new Uint8Array(t*l),[r,u,d,p]=a,M=s[0]/o,b=s[1]/o;for(let g=0;g<t;g++){const A=g*l;if(g>0){const R=(g-1)*l;for(let w=0;w<l;w++)h[A+w]=Math.floor(h[R+w]*i)}for(const R of e[g]??[])if(!(R.hidden||R.revealedByLook))for(const w of R.footprints){const x=(w.lon-r)/Math.max(1e-9,d-r)*s[0],S=(w.lat-u)/Math.max(1e-9,p-u)*s[1],_=w.acrossTrackKm*.5,B=w.alongTrackKm*.5,I=w.azimuthDeg*Math.PI/180,P=Math.sin(I),U=Math.cos(I),G=Math.round(255*hm(w.frpMw/Math.max(1e-4,w.acrossTrackKm*w.alongTrackKm))),k=Math.hypot(_,B),V=Math.max(0,Math.floor((x-k)/M)),Z=Math.min(o-1,Math.ceil((x+k)/M)),ge=Math.max(0,Math.floor((S-k)/b)),we=Math.min(o-1,Math.ceil((S+k)/b));for(let Re=ge;Re<=we;Re++){const be=(Re+.5)*b-S;for(let Me=V;Me<=Z;Me++){const pe=(Me+.5)*M-x;if(Math.abs(pe*P+be*U)>_+.5*M||Math.abs(pe*U-be*P)>B+.5*b)continue;const ht=A+Re*o+Me;G>h[ht]&&(h[ht]=G)}}}}return h}function Mr(e){if(typeof e!="object"||e===null)return null;const t=e;if(typeof t.grid!="object"||t.grid===null||!Array.isArray(t.looks))return null;const a=t.grid,s=Number(a.nx),o=Number(a.ny);if(!Number.isInteger(s)||!Number.isInteger(o)||s<2||o<2||a.index!=="row * nx + column"||a.rows_run!=="north to south")return null;const i=new Map;for(const l of t.looks){if(typeof l!="object"||l===null)return null;const{frame:h,cells:r}=l;if(h==null)continue;if(!Number.isInteger(h)||h<0||!Array.isArray(r))return null;const u=new Uint32Array(r.length);for(let d=0;d<r.length;d++){const p=r[d];if(!Number.isInteger(p)||p<0||p>=s*o)return null;u[d]=p}i.set(h,u)}return i.size>0?{nx:s,ny:o,byFrame:i}:null}class fm{constructor(){F(this,"texture");F(this,"grid",new Le(0,0));F(this,"box",new pa(0,0,0,0));F(this,"data");F(this,"nx",1);F(this,"ny",1);F(this,"key","");F(this,"stepKey","");F(this,"step",0);F(this,"declaredGiven",!1);this.data=new Uint8Array(4),this.texture=this.makeTexture(1,1)}makeTexture(t,a){const s=new ta(this.data,t,a,It,Ot);return s.minFilter=Be,s.magFilter=Be,s.generateMipmaps=!1,s.wrapS=Ve,s.wrapT=Ve,s.flipY=!1,s.needsUpdate=!0,s}clear(){this.grid.set(0,0),this.box.set(0,0,0,0),this.key="",this.stepKey="",this.declaredGiven=!1}sync(t,a,s,o=null){const{steps:i,stepMs:l,firstTimeMs:h,nx:r,ny:u}=t.info,d=Math.min(i-1,Math.max(0,(s-h)/l)),p=Math.min(i-1,Math.floor(d)),M=Math.min(i-1,p+1);(r!==this.nx||u!==this.ny)&&(this.texture.dispose(),this.nx=r,this.ny=u,this.data=new Uint8Array(r*u*4),this.texture=this.makeTexture(r,u),this.key=""),this.grid.set(r,u);const b=t.declared&&t.declared.nx===r&&t.declared.ny===u?t.declared:null,g=b&&o!==null?b.byFrame.get(o)??null:null;this.declaredGiven=b!==null;const A=`${a}:${p}`,R=`${A}:${b?o??"none":"no list"}`;if(R!==this.key){this.key=R,this.stepKey=A,this.step=p;const w=t.bytes,x=r*u,S=this.data;let _=r,B=-1,I=u,P=-1;for(let U=0;U<u;U++){const G=(p*x+(u-1-U)*r)*2,k=(M*x+(u-1-U)*r)*2,V=U*r*4;for(let Z=0;Z<r;Z++){const ge=w[G+Z*2],we=w[k+Z*2];S[V+Z*4]=ge,S[V+Z*4+1]=b?w[G+Z*2+1]&254:w[G+Z*2+1],S[V+Z*4+2]=we,S[V+Z*4+3]=w[k+Z*2+1],(ge>0||we>0)&&(Z<_&&(_=Z),Z>B&&(B=Z),U<I&&(I=U),U>P&&(P=U))}}if(g)for(let U=0;U<g.length;U++){const G=Math.floor(g[U]/r),k=g[U]-G*r,V=u-1-G;S[(V*r+k)*4+1]|=1,k<_&&(_=k),k>B&&(B=k),V<I&&(I=V),V>P&&(P=V)}B<0?this.box.set(0,0,0,0):this.box.set((_-3)/r,(I-3)/u,(B+4)/r,(P+4)/u),this.texture.needsUpdate=!0}return d-p}cellsAbove(t,a,s){const{nx:o,ny:i}=t.info,l=o*i,h=this.step*l*2,r=Math.ceil(a*255),u=[];for(let d=0;d<i;d++)for(let p=0;p<o;p++){const M=h+(d*o+p)*2;t.bytes[M]<r||u.push((p+.5)/o,1-(d+.5)/i,Math.max(.01,s(t.bytes[M+1]/255)))}return new Float32Array(u)}dispose(){this.texture.dispose()}}function ma(e,t){return e.revealed?!1:e.hidden===!0||t&&e.family==="viirs"}/**
 * postprocessing v6.39.6 build Sun Nov 01 2026
 * https://github.com/pmndrs/postprocessing
 * Copyright 2015-2026 Raoul van Rüschen
 * @license Zlib
 */var mm=(()=>{const e=new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),t=new Float32Array([0,0,2,0,0,2]),a=new an;return a.setAttribute("position",new ga(e,3)),a.setAttribute("uv",new ga(t,2)),a})(),xa=class el{static get fullscreenGeometry(){return mm}constructor(t="Pass",a=new po,s=new sl){this.name=t,this.renderer=null,this.scene=a,this.camera=s,this.screen=null,this.rtt=!0,this.needsSwap=!0,this.needsDepthBlit=!1,this.needsDepthTexture=!1,this.enabled=!0}get renderToScreen(){return!this.rtt}set renderToScreen(t){if(this.rtt===t){const a=this.fullscreenMaterial;a!==null&&(a.needsUpdate=!0),this.rtt=!t}}set mainScene(t){}set mainCamera(t){}setRenderer(t){this.renderer=t}isEnabled(){return this.enabled}setEnabled(t){this.enabled=t}get fullscreenMaterial(){return this.screen!==null?this.screen.material:null}set fullscreenMaterial(t){let a=this.screen;a!==null?a.material=t:(a=new Sa(el.fullscreenGeometry,t),a.frustumCulled=!1,this.scene===null&&(this.scene=new po),this.scene.add(a),this.screen=a)}getFullscreenMaterial(){return this.fullscreenMaterial}setFullscreenMaterial(t){this.fullscreenMaterial=t}getDepthTexture(){return null}setDepthTexture(t,a=sn){}render(t,a,s,o,i){throw new Error("Render method not implemented!")}setSize(t,a){}initialize(t,a,s){}dispose(){for(const t of Object.keys(this)){const a=this[t];(a instanceof Qt||a instanceof mh||a instanceof il||a instanceof el)&&this[t].dispose()}this.fullscreenMaterial!==null&&this.fullscreenMaterial.dispose()}},pm=class extends xa{constructor(){super("ClearMaskPass",null,null),this.needsSwap=!1}render(e,t,a,s,o){const i=e.state.buffers.stencil;i.setLocked(!1),i.setTest(!1)}},vm=`#ifdef COLOR_WRITE
#include <common>
#include <dithering_pars_fragment>
#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D inputBuffer;
#else
uniform lowp sampler2D inputBuffer;
#endif
#endif
#ifdef DEPTH_WRITE
#include <packing>
#ifdef GL_FRAGMENT_PRECISION_HIGH
uniform highp sampler2D depthBuffer;
#else
uniform mediump sampler2D depthBuffer;
#endif
float readDepth(const in vec2 uv){
#if DEPTH_PACKING == 3201
return unpackRGBAToDepth(texture2D(depthBuffer,uv));
#else
return texture2D(depthBuffer,uv).r;
#endif
}
#endif
#ifdef USE_WEIGHTS
uniform vec4 channelWeights;
#endif
uniform float opacity;varying vec2 vUv;void main(){
#ifdef COLOR_WRITE
vec4 texel=texture2D(inputBuffer,vUv);
#ifdef USE_WEIGHTS
texel*=channelWeights;
#endif
gl_FragColor=opacity*texel;
#ifdef COLOR_SPACE_CONVERSION
#include <colorspace_fragment>
#endif
#include <dithering_fragment>
#else
gl_FragColor=vec4(0.0);
#endif
#ifdef DEPTH_WRITE
gl_FragDepth=readDepth(vUv);
#endif
}`,hl="varying vec2 vUv;void main(){vUv=position.xy*0.5+0.5;gl_Position=vec4(position.xy,1.0,1.0);}",Fh=class extends Et{constructor(){super({name:"CopyMaterial",defines:{COLOR_SPACE_CONVERSION:"1",DEPTH_PACKING:"0",COLOR_WRITE:"1"},uniforms:{inputBuffer:new De(null),depthBuffer:new De(null),channelWeights:new De(null),opacity:new De(1)},blending:Os,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:vm,vertexShader:hl}),this.depthFunc=yd}get inputBuffer(){return this.uniforms.inputBuffer.value}set inputBuffer(e){const t=e!==null;this.colorWrite!==t&&(t?this.defines.COLOR_WRITE=!0:delete this.defines.COLOR_WRITE,this.colorWrite=t,this.needsUpdate=!0),this.uniforms.inputBuffer.value=e}get depthBuffer(){return this.uniforms.depthBuffer.value}set depthBuffer(e){const t=e!==null;this.depthWrite!==t&&(t?this.defines.DEPTH_WRITE=!0:delete this.defines.DEPTH_WRITE,this.depthTest=t,this.depthWrite=t,this.needsUpdate=!0),this.uniforms.depthBuffer.value=e}set depthPacking(e){this.defines.DEPTH_PACKING=e.toFixed(0),this.needsUpdate=!0}get colorSpaceConversion(){return this.defines.COLOR_SPACE_CONVERSION!==void 0}set colorSpaceConversion(e){this.colorSpaceConversion!==e&&(e?this.defines.COLOR_SPACE_CONVERSION=!0:delete this.defines.COLOR_SPACE_CONVERSION,this.needsUpdate=!0)}get channelWeights(){return this.uniforms.channelWeights.value}set channelWeights(e){e!==null?(this.defines.USE_WEIGHTS="1",this.uniforms.channelWeights.value=e):delete this.defines.USE_WEIGHTS,this.needsUpdate=!0}setInputBuffer(e){this.uniforms.inputBuffer.value=e}getOpacity(e){return this.uniforms.opacity.value}setOpacity(e){this.uniforms.opacity.value=e}},Dh=class extends xa{constructor(e,t=!0){super("CopyPass"),this.fullscreenMaterial=new Fh,this.needsSwap=!1,this.renderTarget=e,e===void 0&&(this.renderTarget=new Qt(1,1,{minFilter:Be,magFilter:Be,stencilBuffer:!1,depthBuffer:!1}),this.renderTarget.texture.name="CopyPass.Target"),this.autoResize=t}get resize(){return this.autoResize}set resize(e){this.autoResize=e}get texture(){return this.renderTarget.texture}getTexture(){return this.renderTarget.texture}setAutoResizeEnabled(e){this.autoResize=e}render(e,t,a,s,o){this.fullscreenMaterial.inputBuffer=t.texture,e.setRenderTarget(this.renderToScreen?null:this.renderTarget),e.render(this.scene,this.camera)}setSize(e,t){this.autoResize&&this.renderTarget.setSize(e,t)}initialize(e,t,a){a!==void 0&&(this.renderTarget.texture.type=a,a!==Ot?this.fullscreenMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1":e!==null&&e.outputColorSpace===ut&&(this.renderTarget.texture.colorSpace=ut))}},Pu=new Zi,Ph=class extends xa{constructor(e=!0,t=!0,a=!1){super("ClearPass",null,null),this.needsSwap=!1,this.color=e,this.depth=t,this.stencil=a,this.overrideClearColor=null,this.overrideClearAlpha=-1}setClearFlags(e,t,a){this.color=e,this.depth=t,this.stencil=a}getOverrideClearColor(){return this.overrideClearColor}setOverrideClearColor(e){this.overrideClearColor=e}getOverrideClearAlpha(){return this.overrideClearAlpha}setOverrideClearAlpha(e){this.overrideClearAlpha=e}render(e,t,a,s,o){const i=this.overrideClearColor,l=this.overrideClearAlpha,h=e.getClearAlpha(),r=i!==null,u=l>=0;r?(e.getClearColor(Pu),e.setClearColor(i,u?l:h)):u&&e.setClearAlpha(l),e.setRenderTarget(this.renderToScreen?null:t),e.clear(this.color,this.depth,this.stencil),r?e.setClearColor(Pu,h):u&&e.setClearAlpha(h)}},gm=class extends xa{constructor(e,t){super("MaskPass",e,t),this.needsSwap=!1,this.clearPass=new Ph(!1,!1,!0),this.inverse=!1}set mainScene(e){this.scene=e}set mainCamera(e){this.camera=e}get inverted(){return this.inverse}set inverted(e){this.inverse=e}get clear(){return this.clearPass.enabled}set clear(e){this.clearPass.enabled=e}getClearPass(){return this.clearPass}isInverted(){return this.inverted}setInverted(e){this.inverted=e}render(e,t,a,s,o){const i=e.getContext(),l=e.state.buffers,h=this.scene,r=this.camera,u=this.clearPass,d=this.inverted?0:1,p=1-d;l.color.setMask(!1),l.depth.setMask(!1),l.color.setLocked(!0),l.depth.setLocked(!0),l.stencil.setTest(!0),l.stencil.setOp(i.REPLACE,i.REPLACE,i.REPLACE),l.stencil.setFunc(i.ALWAYS,d,4294967295),l.stencil.setClear(p),l.stencil.setLocked(!0),this.clearPass.enabled&&(this.renderToScreen?u.render(e,null):(u.render(e,t),u.render(e,a))),this.renderToScreen?(e.setRenderTarget(null),e.render(h,r)):(e.setRenderTarget(t),e.render(h,r),e.setRenderTarget(a),e.render(h,r)),l.color.setLocked(!1),l.depth.setLocked(!1),l.stencil.setLocked(!1),l.stencil.setFunc(i.EQUAL,1,4294967295),l.stencil.setOp(i.KEEP,i.KEEP,i.KEEP),l.stencil.setLocked(!0)}};function xm(e,t){const a=e.getContext();if(t<=0||typeof a.renderbufferStorageMultisample!="function")return 0;const s=a.getParameter(a.MAX_SAMPLES),o=Math.min(t,s);if(o<=0)return 0;const i=a.getParameter(a.RENDERBUFFER_BINDING),l=a.createRenderbuffer();try{return a.bindRenderbuffer(a.RENDERBUFFER,l),a.renderbufferStorageMultisample(a.RENDERBUFFER,o,a.RGBA8,1,1),o}catch{return 0}finally{a.bindRenderbuffer(a.RENDERBUFFER,i),a.deleteRenderbuffer(l)}}var yr=1/1e3,wm=1e3,Mm=class{constructor(){this.startTime=performance.now(),this.previousTime=0,this.currentTime=0,this._delta=0,this._elapsed=0,this._fixedDelta=1e3/60,this.timescale=1,this.useFixedDelta=!1,this._autoReset=!1}get autoReset(){return this._autoReset}set autoReset(e){typeof document<"u"&&document.hidden!==void 0&&(e?document.addEventListener("visibilitychange",this):document.removeEventListener("visibilitychange",this),this._autoReset=e)}get delta(){return this._delta*yr}get fixedDelta(){return this._fixedDelta*yr}set fixedDelta(e){this._fixedDelta=e*wm}get elapsed(){return this._elapsed*yr}update(e){this.useFixedDelta?this._delta=this.fixedDelta:(this.previousTime=this.currentTime,this.currentTime=(e!==void 0?e:performance.now())-this.startTime,this._delta=this.currentTime-this.previousTime),this._delta*=this.timescale,this._elapsed+=this._delta}reset(){this._delta=0,this._elapsed=0,this.currentTime=performance.now()-this.startTime}getDelta(){return this.delta}getElapsed(){return this.elapsed}handleEvent(e){document.hidden||(this.currentTime=performance.now()-this.startTime)}dispose(){this.autoReset=!1}},ym=class{constructor(e=null,{depthBuffer:t=!0,stencilBuffer:a=!1,multisampling:s=0,frameBufferType:o=Ot}={}){this.renderer=null,this.inputBuffer=this.createBuffer(t,a,o,s),this.outputBuffer=this.inputBuffer.clone(),this.copyPass=new Dh,this.depthRenderTarget=null,this.passes=[],this.timer=new Mm,this.autoRenderToScreen=!0,this.setRenderer(e)}get stableDepthTexture(){return this.depthRenderTarget===null?null:this.depthRenderTarget.depthTexture}get multisampling(){return this.inputBuffer.samples}set multisampling(e){const t=this.renderer===null?e:xm(this.renderer,e);this.multisampling!==t&&(this.inputBuffer.samples=t,this.outputBuffer.samples=t,this.inputBuffer.dispose(),this.outputBuffer.dispose())}getTimer(){return this.timer}getRenderer(){return this.renderer}setRenderer(e){if(this.renderer=e,e!==null){const t=e.getSize(new Le),a=e.getContext().getContextAttributes().alpha,s=this.inputBuffer.texture.type;s===Ot&&e.outputColorSpace===ut&&(this.inputBuffer.texture.colorSpace=ut,this.outputBuffer.texture.colorSpace=ut,this.inputBuffer.dispose(),this.outputBuffer.dispose());const o=this.multisampling;this.multisampling=o,e.autoClear=!1,this.setSize(t.width,t.height);for(const i of this.passes)i.initialize(e,a,s)}}replaceRenderer(e,t=!0){const a=this.renderer,s=a.domElement.parentNode;return this.setRenderer(e),t&&s!==null&&(s.removeChild(a.domElement),s.appendChild(e.domElement)),a}createDepthTexture(){const e=new fr;e.name="EffectComposer.InputDepth",this.inputBuffer.stencilBuffer?(e.format=xd,e.type=wd):e.type=ol;const t=new fr;t.format=e.format,t.type=e.type,t.name="EffectComposer.OutputDepth";const a=new fr;a.format=e.format,a.type=e.type,a.name="EffectComposer.StableDepth",this.inputBuffer.depthTexture=e,this.outputBuffer.depthTexture=t,this.inputBuffer.dispose(),this.outputBuffer.dispose();const{width:s,height:o}=this.inputBuffer;this.depthRenderTarget=new Qt(s,o,{depthBuffer:!0,stencilBuffer:this.inputBuffer.stencilBuffer,depthTexture:a})}blitDepthBuffer(e){const t=this.renderer,a=this.depthRenderTarget,s=t.properties,o=t.getContext();t.setRenderTarget(a);const i=s.get(e).__webglFramebuffer,l=s.get(a).__webglFramebuffer,h=e.stencilBuffer?o.DEPTH_BUFFER_BIT|o.STENCIL_BUFFER_BIT:o.DEPTH_BUFFER_BIT;o.bindFramebuffer(o.READ_FRAMEBUFFER,i),o.bindFramebuffer(o.DRAW_FRAMEBUFFER,l),o.blitFramebuffer(0,0,e.width,e.height,0,0,a.width,a.height,h,o.NEAREST),o.bindFramebuffer(o.READ_FRAMEBUFFER,null),o.bindFramebuffer(o.DRAW_FRAMEBUFFER,null),t.setRenderTarget(null)}deleteDepthTexture(){const e=this.stableDepthTexture;for(const t of this.passes)t.getDepthTexture()===e&&t.setDepthTexture(null);this.depthRenderTarget!==null&&(this.depthRenderTarget.dispose(),this.depthRenderTarget=null),this.inputBuffer.depthTexture!==null&&(this.inputBuffer.depthTexture.dispose(),this.inputBuffer.depthTexture=null),this.outputBuffer.depthTexture!==null&&(this.outputBuffer.depthTexture.dispose(),this.outputBuffer.depthTexture=null)}createBuffer(e,t,a,s){const o=this.renderer,i=o===null?new Le:o.getDrawingBufferSize(new Le),l=new Qt(i.width,i.height,{minFilter:Be,magFilter:Be,samples:s,stencilBuffer:t,depthBuffer:e,type:a});return a===Ot&&o!==null&&o.outputColorSpace===ut&&(l.texture.colorSpace=ut),l.texture.name="EffectComposer.Buffer",l.texture.generateMipmaps=!1,l}setMainScene(e){for(const t of this.passes)t.mainScene=e}setMainCamera(e){for(const t of this.passes)t.mainCamera=e}addPass(e,t){const a=this.passes,s=this.renderer,o=s.getDrawingBufferSize(new Le),i=s.getContext().getContextAttributes().alpha,l=this.inputBuffer.texture.type;if(e.renderer=s,e.setSize(o.width,o.height),e.initialize(s,i,l),this.autoRenderToScreen&&(a.length>0&&(a[a.length-1].renderToScreen=!1),e.renderToScreen&&(this.autoRenderToScreen=!1)),t!==void 0?a.splice(t,0,e):a.push(e),this.autoRenderToScreen&&(a[a.length-1].renderToScreen=!0),e.needsDepthTexture||this.depthRenderTarget!==null)if(this.depthRenderTarget===null){this.createDepthTexture();for(const h of a)h.setDepthTexture(this.stableDepthTexture)}else e.setDepthTexture(this.stableDepthTexture)}removePass(e){const t=this.passes,a=t.indexOf(e);if(a!==-1&&t.splice(a,1).length>0){const i=this.stableDepthTexture;if(i!==null){const l=(r,u)=>r||u.needsDepthTexture;t.reduce(l,!1)||(e.getDepthTexture()===i&&e.setDepthTexture(null),this.deleteDepthTexture())}this.autoRenderToScreen&&a===t.length&&(e.renderToScreen=!1,t.length>0&&(t[t.length-1].renderToScreen=!0))}}removeAllPasses(){const e=this.passes;this.deleteDepthTexture(),e.length>0&&(this.autoRenderToScreen&&(e[e.length-1].renderToScreen=!1),this.passes=[])}render(e){const t=this.renderer,a=this.copyPass;let s=this.inputBuffer,o=this.outputBuffer,i,l=!1;e===void 0&&(this.timer.update(),e=this.timer.getDelta());for(const h of this.passes)if(h.enabled){if(h.render(t,s,o,e,l),h.needsDepthBlit&&this.depthRenderTarget!==null&&this.blitDepthBuffer(s),h.needsSwap){if(l){a.renderToScreen=h.renderToScreen;const r=t.getContext(),u=t.state.buffers.stencil;u.setFunc(r.NOTEQUAL,1,4294967295),a.render(t,s,o,e,l),u.setFunc(r.EQUAL,1,4294967295)}i=s,s=o,o=i}h instanceof gm?l=!0:h instanceof pm&&(l=!1)}}setSize(e,t,a){const s=this.renderer,o=s.getSize(new Le);(e===void 0||t===void 0)&&(e=o.width,t=o.height),(o.width!==e||o.height!==t)&&s.setSize(e,t,a);const i=s.getDrawingBufferSize(new Le);this.inputBuffer.setSize(i.width,i.height),this.outputBuffer.setSize(i.width,i.height),this.depthRenderTarget!==null&&this.depthRenderTarget.setSize(i.width,i.height);for(const l of this.passes)l.setSize(i.width,i.height)}reset(){this.dispose(),this.autoRenderToScreen=!0}dispose(){for(const e of this.passes)e.dispose();this.deleteDepthTexture(),this.inputBuffer.dispose(),this.outputBuffer.dispose(),this.copyPass.dispose(),this.timer.dispose(),this.passes=[],xa.fullscreenGeometry.dispose()}},Bs={NONE:0,DEPTH:1,CONVOLUTION:2},$e={FRAGMENT_HEAD:"FRAGMENT_HEAD",FRAGMENT_MAIN_UV:"FRAGMENT_MAIN_UV",FRAGMENT_MAIN_IMAGE:"FRAGMENT_MAIN_IMAGE",VERTEX_HEAD:"VERTEX_HEAD",VERTEX_MAIN_SUPPORT:"VERTEX_MAIN_SUPPORT"},bm=class{constructor(){this.shaderParts=new Map([[$e.FRAGMENT_HEAD,null],[$e.FRAGMENT_MAIN_UV,null],[$e.FRAGMENT_MAIN_IMAGE,null],[$e.VERTEX_HEAD,null],[$e.VERTEX_MAIN_SUPPORT,null]]),this.defines=new Map,this.uniforms=new Map,this.blendModes=new Map,this.extensions=new Set,this.attributes=Bs.NONE,this.varyings=new Set,this.uvTransformation=!1,this.readDepth=!1,this.colorSpace=fh}},br=!1,Iu=class{constructor(e=null){this.originalMaterials=new Map,this.material=null,this.materials=null,this.materialsBackSide=null,this.materialsDoubleSide=null,this.materialsFlatShaded=null,this.materialsFlatShadedBackSide=null,this.materialsFlatShadedDoubleSide=null,this.setMaterial(e),this.meshCount=0,this.replaceMaterial=t=>{if(t.isMesh){let a;if(t.material.flatShading)switch(t.material.side){case Ns:a=this.materialsFlatShadedDoubleSide;break;case so:a=this.materialsFlatShadedBackSide;break;default:a=this.materialsFlatShaded;break}else switch(t.material.side){case Ns:a=this.materialsDoubleSide;break;case so:a=this.materialsBackSide;break;default:a=this.materials;break}this.originalMaterials.set(t,t.material),t.isSkinnedMesh?t.material=a[2]:t.isInstancedMesh?t.material=a[1]:t.material=a[0],++this.meshCount}}}cloneMaterial(e){if(!(e instanceof Et))return e.clone();const t=e.uniforms,a=new Map;for(const o in t){const i=t[o].value;i.isRenderTargetTexture&&(t[o].value=null,a.set(o,i))}const s=e.clone();for(const o of a)t[o[0]].value=o[1],s.uniforms[o[0]].value=o[1];return s}setMaterial(e){if(this.disposeMaterials(),this.material=e,e!==null){const t=this.materials=[this.cloneMaterial(e),this.cloneMaterial(e),this.cloneMaterial(e)];for(const a of t)a.uniforms=Object.assign({},e.uniforms),a.side=Md;t[2].skinning=!0,this.materialsBackSide=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.side=so,s}),this.materialsDoubleSide=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.side=Ns,s}),this.materialsFlatShaded=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.flatShading=!0,s}),this.materialsFlatShadedBackSide=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.flatShading=!0,s.side=so,s}),this.materialsFlatShadedDoubleSide=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.flatShading=!0,s.side=Ns,s})}}render(e,t,a){const s=e.shadowMap.enabled;if(e.shadowMap.enabled=!1,br){const o=this.originalMaterials;this.meshCount=0,t.traverse(this.replaceMaterial),e.render(t,a);for(const i of o)i[0].material=i[1];this.meshCount!==o.size&&o.clear()}else{const o=t.overrideMaterial;t.overrideMaterial=this.material,e.render(t,a),t.overrideMaterial=o}e.shadowMap.enabled=s}disposeMaterials(){if(this.material!==null){const e=this.materials.concat(this.materialsBackSide).concat(this.materialsDoubleSide).concat(this.materialsFlatShaded).concat(this.materialsFlatShadedBackSide).concat(this.materialsFlatShadedDoubleSide);for(const t of e)t.dispose()}}dispose(){this.originalMaterials.clear(),this.disposeMaterials()}static get workaroundEnabled(){return br}static set workaroundEnabled(e){br=e}},us=-1,Na=class extends nl{constructor(e=null,t=us,a=us,s=1){super(),e!==null&&this.addEventListener("change",()=>e.setSize(this.baseSize.width,this.baseSize.height)),this.baseSize=new Le(1,1),this.preferredSize=new Le(t,a),this.target=this.preferredSize,this.s=s,this.effectiveSize=new Le,this.addEventListener("change",()=>this.updateEffectiveSize()),this.updateEffectiveSize()}updateEffectiveSize(){const e=this.baseSize,t=this.preferredSize,a=this.effectiveSize,s=this.scale;t.width!==us?a.width=t.width:t.height!==us?a.width=Math.round(t.height*(e.width/Math.max(e.height,1))):a.width=Math.round(e.width*s),t.height!==us?a.height=t.height:t.width!==us?a.height=Math.round(t.width/Math.max(e.width/Math.max(e.height,1),1)):a.height=Math.round(e.height*s)}get width(){return this.effectiveSize.width}set width(e){this.preferredWidth=e}get height(){return this.effectiveSize.height}set height(e){this.preferredHeight=e}getWidth(){return this.width}getHeight(){return this.height}get scale(){return this.s}set scale(e){this.s!==e&&(this.s=e,this.preferredSize.setScalar(us),this.dispatchEvent({type:"change"}))}getScale(){return this.scale}setScale(e){this.scale=e}get baseWidth(){return this.baseSize.width}set baseWidth(e){this.baseSize.width!==e&&(this.baseSize.width=e,this.dispatchEvent({type:"change"}))}getBaseWidth(){return this.baseWidth}setBaseWidth(e){this.baseWidth=e}get baseHeight(){return this.baseSize.height}set baseHeight(e){this.baseSize.height!==e&&(this.baseSize.height=e,this.dispatchEvent({type:"change"}))}getBaseHeight(){return this.baseHeight}setBaseHeight(e){this.baseHeight=e}setBaseSize(e,t){(this.baseSize.width!==e||this.baseSize.height!==t)&&(this.baseSize.set(e,t),this.dispatchEvent({type:"change"}))}get preferredWidth(){return this.preferredSize.width}set preferredWidth(e){this.preferredSize.width!==e&&(this.preferredSize.width=e,this.dispatchEvent({type:"change"}))}getPreferredWidth(){return this.preferredWidth}setPreferredWidth(e){this.preferredWidth=e}get preferredHeight(){return this.preferredSize.height}set preferredHeight(e){this.preferredSize.height!==e&&(this.preferredSize.height=e,this.dispatchEvent({type:"change"}))}getPreferredHeight(){return this.preferredHeight}setPreferredHeight(e){this.preferredHeight=e}setPreferredSize(e,t){(this.preferredSize.width!==e||this.preferredSize.height!==t)&&(this.preferredSize.set(e,t),this.dispatchEvent({type:"change"}))}copy(e){this.s=e.scale,this.baseSize.set(e.baseWidth,e.baseHeight),this.preferredSize.set(e.preferredWidth,e.preferredHeight),this.dispatchEvent({type:"change"})}static get AUTO_SIZE(){return us}},Ce={ADD:0,ALPHA:1,AVERAGE:2,COLOR:3,COLOR_BURN:4,COLOR_DODGE:5,DARKEN:6,DIFFERENCE:7,DIVIDE:8,DST:9,EXCLUSION:10,HARD_LIGHT:11,HARD_MIX:12,HUE:13,INVERT:14,INVERT_RGB:15,LIGHTEN:16,LINEAR_BURN:17,LINEAR_DODGE:18,LINEAR_LIGHT:19,LUMINOSITY:20,MULTIPLY:21,NEGATION:22,NORMAL:23,OVERLAY:24,PIN_LIGHT:25,REFLECT:26,SATURATION:27,SCREEN:28,SOFT_LIGHT:29,SRC:30,SUBTRACT:31,VIVID_LIGHT:32},Sm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb+src.rgb;return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Tm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){return mix(dst,src,src.a*opacity);}",Em="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=(dst.rgb+src.rgb)*0.5;return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Rm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=RGBToHSL(dst.rgb);vec3 b=RGBToHSL(src.rgb);vec3 c=HSLToRGB(vec3(b.xy,a.z));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Am="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=dst.rgb,b=src.rgb;vec3 c=mix(step(0.0,b)*(1.0-min(vec3(1.0),(1.0-a)/max(b,1e-9))),vec3(1.0),step(1.0,a));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",_m="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=dst.rgb,b=src.rgb;vec3 c=step(0.0,a)*mix(min(vec3(1.0),a/max(1.0-b,1e-9)),vec3(1.0),step(1.0,b));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",km="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=min(dst.rgb,src.rgb);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Fm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=abs(dst.rgb-src.rgb);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Dm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb/max(src.rgb,1e-9);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Pm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb+src.rgb-2.0*dst.rgb*src.rgb;return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Im="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=min(dst.rgb,1.0);vec3 b=min(src.rgb,1.0);vec3 c=mix(2.0*a*b,1.0-2.0*(1.0-a)*(1.0-b),step(0.5,b));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Cm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=step(1.0,dst.rgb+src.rgb);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Lm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=RGBToHSL(dst.rgb);vec3 b=RGBToHSL(src.rgb);vec3 c=HSLToRGB(vec3(b.x,a.yz));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Nm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=max(1.0-src.rgb,0.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",zm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=src.rgb*max(1.0-dst.rgb,0.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Um="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=max(dst.rgb,src.rgb);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Bm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=clamp(src.rgb+dst.rgb-1.0,0.0,1.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Om="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=min(dst.rgb+src.rgb,1.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Hm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=clamp(2.0*src.rgb+dst.rgb-1.0,0.0,1.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Gm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=RGBToHSL(dst.rgb);vec3 b=RGBToHSL(src.rgb);vec3 c=HSLToRGB(vec3(a.xy,b.z));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Km="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb*src.rgb;return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Wm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=max(1.0-abs(1.0-dst.rgb-src.rgb),0.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Vm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){return mix(dst,src,opacity);}",Ym="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=2.0*src.rgb*dst.rgb;vec3 b=1.0-2.0*(1.0-src.rgb)*(1.0-dst.rgb);vec3 c=mix(a,b,step(0.5,dst.rgb));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",$m="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 src2=2.0*src.rgb;vec3 c=mix(mix(src2,dst.rgb,step(0.5*dst.rgb,src.rgb)),max(src2-1.0,vec3(0.0)),step(dst.rgb,src2-1.0));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",jm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=min(dst.rgb*dst.rgb/max(1.0-src.rgb,1e-9),1.0);vec3 c=mix(a,src.rgb,step(1.0,src.rgb));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Xm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=RGBToHSL(dst.rgb);vec3 b=RGBToHSL(src.rgb);vec3 c=HSLToRGB(vec3(a.x,b.y,a.z));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",qm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb+src.rgb-min(dst.rgb*src.rgb,1.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Zm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 src2=2.0*src.rgb;vec3 d=dst.rgb+(src2-1.0);vec3 w=step(0.5,src.rgb);vec3 a=dst.rgb-(1.0-src2)*dst.rgb*(1.0-dst.rgb);vec3 b=mix(d*(sqrt(dst.rgb)-dst.rgb),d*dst.rgb*((16.0*dst.rgb-12.0)*dst.rgb+3.0),w*(1.0-step(0.25,dst.rgb)));vec3 c=mix(a,b,w);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Qm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){return src;}",Jm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=max(dst.rgb-src.rgb,0.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",e0="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=mix(max(1.0-min((1.0-dst.rgb)/(2.0*src.rgb),1.0),0.0),min(dst.rgb/(2.0*(1.0-src.rgb)),1.0),step(0.5,src.rgb));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",t0=new Map([[Ce.ADD,Sm],[Ce.ALPHA,Tm],[Ce.AVERAGE,Em],[Ce.COLOR,Rm],[Ce.COLOR_BURN,Am],[Ce.COLOR_DODGE,_m],[Ce.DARKEN,km],[Ce.DIFFERENCE,Fm],[Ce.DIVIDE,Dm],[Ce.DST,null],[Ce.EXCLUSION,Pm],[Ce.HARD_LIGHT,Im],[Ce.HARD_MIX,Cm],[Ce.HUE,Lm],[Ce.INVERT,Nm],[Ce.INVERT_RGB,zm],[Ce.LIGHTEN,Um],[Ce.LINEAR_BURN,Bm],[Ce.LINEAR_DODGE,Om],[Ce.LINEAR_LIGHT,Hm],[Ce.LUMINOSITY,Gm],[Ce.MULTIPLY,Km],[Ce.NEGATION,Wm],[Ce.NORMAL,Vm],[Ce.OVERLAY,Ym],[Ce.PIN_LIGHT,$m],[Ce.REFLECT,jm],[Ce.SATURATION,Xm],[Ce.SCREEN,qm],[Ce.SOFT_LIGHT,Zm],[Ce.SRC,Qm],[Ce.SUBTRACT,Jm],[Ce.VIVID_LIGHT,e0]]),a0=class extends nl{constructor(e,t=1){super(),this._blendFunction=e,this.opacity=new De(t)}getOpacity(){return this.opacity.value}setOpacity(e){this.opacity.value=e}get blendFunction(){return this._blendFunction}set blendFunction(e){this._blendFunction=e,this.dispatchEvent({type:"change"})}getBlendFunction(){return this.blendFunction}setBlendFunction(e){this.blendFunction=e}getShaderCode(){return t0.get(this.blendFunction)}},Ih=class extends nl{constructor(e,t,{attributes:a=Bs.NONE,blendFunction:s=Ce.NORMAL,defines:o=new Map,uniforms:i=new Map,extensions:l=null,vertexShader:h=null}={}){super(),this.name=e,this.renderer=null,this.attributes=a,this.fragmentShader=t,this.vertexShader=h,this.defines=o,this.uniforms=i,this.extensions=l,this.blendMode=new a0(s),this.blendMode.addEventListener("change",r=>this.setChanged()),this._inputColorSpace=fh,this._outputColorSpace=Ua}get inputColorSpace(){return this._inputColorSpace}set inputColorSpace(e){this._inputColorSpace=e,this.setChanged()}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e,this.setChanged()}set mainScene(e){}set mainCamera(e){}getName(){return this.name}setRenderer(e){this.renderer=e}getDefines(){return this.defines}getUniforms(){return this.uniforms}getExtensions(){return this.extensions}getBlendMode(){return this.blendMode}getAttributes(){return this.attributes}setAttributes(e){this.attributes=e,this.setChanged()}getFragmentShader(){return this.fragmentShader}setFragmentShader(e){this.fragmentShader=e,this.setChanged()}getVertexShader(){return this.vertexShader}setVertexShader(e){this.vertexShader=e,this.setChanged()}setChanged(){this.dispatchEvent({type:"change"})}setDepthTexture(e,t=sn){}update(e,t,a){}setSize(e,t){}initialize(e,t,a){}dispose(){for(const e of Object.keys(this)){const t=this[e];(t instanceof Qt||t instanceof mh||t instanceof il||t instanceof xa)&&this[e].dispose()}}},dl={MEDIUM:2,LARGE:3},s0=`#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D inputBuffer;
#else
uniform lowp sampler2D inputBuffer;
#endif
varying vec2 vUv0;varying vec2 vUv1;varying vec2 vUv2;varying vec2 vUv3;void main(){vec4 sum=texture2D(inputBuffer,vUv0);sum+=texture2D(inputBuffer,vUv1);sum+=texture2D(inputBuffer,vUv2);sum+=texture2D(inputBuffer,vUv3);gl_FragColor=sum*0.25;
#include <colorspace_fragment>
}`,o0="uniform vec4 texelSize;uniform float kernel;uniform float scale;varying vec2 vUv0;varying vec2 vUv1;varying vec2 vUv2;varying vec2 vUv3;void main(){vec2 uv=position.xy*0.5+0.5;vec2 dUv=(texelSize.xy*vec2(kernel)+texelSize.zw)*scale;vUv0=vec2(uv.x-dUv.x,uv.y+dUv.y);vUv1=vec2(uv.x+dUv.x,uv.y+dUv.y);vUv2=vec2(uv.x+dUv.x,uv.y-dUv.y);vUv3=vec2(uv.x-dUv.x,uv.y-dUv.y);gl_Position=vec4(position.xy,1.0,1.0);}",i0=[new Float32Array([0,0]),new Float32Array([0,1,1]),new Float32Array([0,1,1,2]),new Float32Array([0,1,2,2,3]),new Float32Array([0,1,2,3,4,4,5]),new Float32Array([0,1,2,3,4,5,7,8,9,10])],n0=class extends Et{constructor(e=new pa){super({name:"KawaseBlurMaterial",uniforms:{inputBuffer:new De(null),texelSize:new De(new pa),scale:new De(1),kernel:new De(0)},blending:Os,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:s0,vertexShader:o0}),this.setTexelSize(e.x,e.y),this.kernelSize=dl.MEDIUM}set inputBuffer(e){this.uniforms.inputBuffer.value=e}setInputBuffer(e){this.inputBuffer=e}get kernelSequence(){return i0[this.kernelSize]}get scale(){return this.uniforms.scale.value}set scale(e){this.uniforms.scale.value=e}getScale(){return this.uniforms.scale.value}setScale(e){this.uniforms.scale.value=e}getKernel(){return null}get kernel(){return this.uniforms.kernel.value}set kernel(e){this.uniforms.kernel.value=e}setKernel(e){this.kernel=e}setTexelSize(e,t){this.uniforms.texelSize.value.set(e,t,e*.5,t*.5)}setSize(e,t){const a=1/e,s=1/t;this.uniforms.texelSize.value.set(a,s,a*.5,s*.5)}},r0=class extends xa{constructor({kernelSize:e=dl.MEDIUM,resolutionScale:t=.5,width:a=Na.AUTO_SIZE,height:s=Na.AUTO_SIZE,resolutionX:o=a,resolutionY:i=s}={}){super("KawaseBlurPass"),this.renderTargetA=new Qt(1,1,{depthBuffer:!1}),this.renderTargetA.texture.name="Blur.Target.A",this.renderTargetB=this.renderTargetA.clone(),this.renderTargetB.texture.name="Blur.Target.B";const l=this.resolution=new Na(this,o,i,t);l.addEventListener("change",h=>this.setSize(l.baseWidth,l.baseHeight)),this._blurMaterial=new n0,this._blurMaterial.kernelSize=e,this.copyMaterial=new Fh}getResolution(){return this.resolution}get blurMaterial(){return this._blurMaterial}set blurMaterial(e){this._blurMaterial=e}get dithering(){return this.copyMaterial.dithering}set dithering(e){this.copyMaterial.dithering=e}get kernelSize(){return this.blurMaterial.kernelSize}set kernelSize(e){this.blurMaterial.kernelSize=e}get width(){return this.resolution.width}set width(e){this.resolution.preferredWidth=e}get height(){return this.resolution.height}set height(e){this.resolution.preferredHeight=e}get scale(){return this.blurMaterial.scale}set scale(e){this.blurMaterial.scale=e}getScale(){return this.blurMaterial.scale}setScale(e){this.blurMaterial.scale=e}getKernelSize(){return this.kernelSize}setKernelSize(e){this.kernelSize=e}getResolutionScale(){return this.resolution.scale}setResolutionScale(e){this.resolution.scale=e}render(e,t,a,s,o){const i=this.scene,l=this.camera,h=this.renderTargetA,r=this.renderTargetB,u=this.blurMaterial,d=u.kernelSequence;let p=t;this.fullscreenMaterial=u;for(let M=0,b=d.length;M<b;++M){const g=(M&1)===0?h:r;u.kernel=d[M],u.inputBuffer=p.texture,e.setRenderTarget(g),e.render(i,l),p=g}this.fullscreenMaterial=this.copyMaterial,this.copyMaterial.inputBuffer=p.texture,e.setRenderTarget(this.renderToScreen?null:a),e.render(i,l)}setSize(e,t){const a=this.resolution;a.setBaseSize(e,t);const s=a.width,o=a.height;this.renderTargetA.setSize(s,o),this.renderTargetB.setSize(s,o),this.blurMaterial.setSize(e,t)}initialize(e,t,a){a!==void 0&&(this.renderTargetA.texture.type=a,this.renderTargetB.texture.type=a,a!==Ot?(this.blurMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1",this.copyMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1"):e!==null&&e.outputColorSpace===ut&&(this.renderTargetA.texture.colorSpace=ut,this.renderTargetB.texture.colorSpace=ut))}static get AUTO_SIZE(){return Na.AUTO_SIZE}},l0=`#include <common>
#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D inputBuffer;
#else
uniform lowp sampler2D inputBuffer;
#endif
#ifdef RANGE
uniform vec2 range;
#elif defined(THRESHOLD)
uniform float threshold;uniform float smoothing;
#endif
varying vec2 vUv;void main(){vec4 texel=texture2D(inputBuffer,vUv);float l=luminance(texel.rgb);float mask=1.0;
#ifdef RANGE
float low=step(range.x,l);float high=step(l,range.y);mask=low*high;
#elif defined(THRESHOLD)
mask=smoothstep(threshold,threshold+smoothing,l);
#endif
#ifdef COLOR
gl_FragColor=texel*mask;
#else
gl_FragColor=vec4(l*mask);
#endif
}`,c0=class extends Et{constructor(e=!1,t=null){super({name:"LuminanceMaterial",defines:{THREE_REVISION:rl.replace(/\D+/g,"")},uniforms:{inputBuffer:new De(null),threshold:new De(0),smoothing:new De(1),range:new De(null)},blending:Os,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:l0,vertexShader:hl}),this.colorOutput=e,this.luminanceRange=t}set inputBuffer(e){this.uniforms.inputBuffer.value=e}setInputBuffer(e){this.uniforms.inputBuffer.value=e}get threshold(){return this.uniforms.threshold.value}set threshold(e){this.smoothing>0||e>0?this.defines.THRESHOLD="1":delete this.defines.THRESHOLD,this.uniforms.threshold.value=e}getThreshold(){return this.threshold}setThreshold(e){this.threshold=e}get smoothing(){return this.uniforms.smoothing.value}set smoothing(e){this.threshold>0||e>0?this.defines.THRESHOLD="1":delete this.defines.THRESHOLD,this.uniforms.smoothing.value=e}getSmoothingFactor(){return this.smoothing}setSmoothingFactor(e){this.smoothing=e}get useThreshold(){return this.threshold>0||this.smoothing>0}set useThreshold(e){}get colorOutput(){return this.defines.COLOR!==void 0}set colorOutput(e){e?this.defines.COLOR="1":delete this.defines.COLOR,this.needsUpdate=!0}isColorOutputEnabled(e){return this.colorOutput}setColorOutputEnabled(e){this.colorOutput=e}get useRange(){return this.luminanceRange!==null}set useRange(e){this.luminanceRange=null}get luminanceRange(){return this.uniforms.range.value}set luminanceRange(e){e!==null?this.defines.RANGE="1":delete this.defines.RANGE,this.uniforms.range.value=e,this.needsUpdate=!0}getLuminanceRange(){return this.luminanceRange}setLuminanceRange(e){this.luminanceRange=e}},Ch=class extends xa{constructor({renderTarget:e,luminanceRange:t,colorOutput:a,resolutionScale:s=1,width:o=Na.AUTO_SIZE,height:i=Na.AUTO_SIZE,resolutionX:l=o,resolutionY:h=i}={}){super("LuminancePass"),this.fullscreenMaterial=new c0(a,t),this.needsSwap=!1,this.renderTarget=e,this.renderTarget===void 0&&(this.renderTarget=new Qt(1,1,{depthBuffer:!1}),this.renderTarget.texture.name="LuminancePass.Target");const r=this.resolution=new Na(this,l,h,s);r.addEventListener("change",u=>this.setSize(r.baseWidth,r.baseHeight))}get texture(){return this.renderTarget.texture}getTexture(){return this.renderTarget.texture}getResolution(){return this.resolution}render(e,t,a,s,o){const i=this.fullscreenMaterial;i.inputBuffer=t.texture,e.setRenderTarget(this.renderToScreen?null:this.renderTarget),e.render(this.scene,this.camera)}setSize(e,t){const a=this.resolution;a.setBaseSize(e,t),this.renderTarget.setSize(a.width,a.height)}initialize(e,t,a){a!==void 0&&a!==Ot&&(this.renderTarget.texture.type=a,this.fullscreenMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1")}},u0=`#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D inputBuffer;
#else
uniform lowp sampler2D inputBuffer;
#endif
#define WEIGHT_INNER 0.125
#define WEIGHT_OUTER 0.05556
varying vec2 vUv;varying vec2 vUv00;varying vec2 vUv01;varying vec2 vUv02;varying vec2 vUv03;varying vec2 vUv04;varying vec2 vUv05;varying vec2 vUv06;varying vec2 vUv07;varying vec2 vUv08;varying vec2 vUv09;varying vec2 vUv10;varying vec2 vUv11;float clampToBorder(const in vec2 uv){return float(uv.s>=0.0&&uv.s<=1.0&&uv.t>=0.0&&uv.t<=1.0);}void main(){vec4 c=vec4(0.0);vec4 w=WEIGHT_INNER*vec4(clampToBorder(vUv00),clampToBorder(vUv01),clampToBorder(vUv02),clampToBorder(vUv03));c+=w.x*texture2D(inputBuffer,vUv00);c+=w.y*texture2D(inputBuffer,vUv01);c+=w.z*texture2D(inputBuffer,vUv02);c+=w.w*texture2D(inputBuffer,vUv03);w=WEIGHT_OUTER*vec4(clampToBorder(vUv04),clampToBorder(vUv05),clampToBorder(vUv06),clampToBorder(vUv07));c+=w.x*texture2D(inputBuffer,vUv04);c+=w.y*texture2D(inputBuffer,vUv05);c+=w.z*texture2D(inputBuffer,vUv06);c+=w.w*texture2D(inputBuffer,vUv07);w=WEIGHT_OUTER*vec4(clampToBorder(vUv08),clampToBorder(vUv09),clampToBorder(vUv10),clampToBorder(vUv11));c+=w.x*texture2D(inputBuffer,vUv08);c+=w.y*texture2D(inputBuffer,vUv09);c+=w.z*texture2D(inputBuffer,vUv10);c+=w.w*texture2D(inputBuffer,vUv11);c+=WEIGHT_OUTER*texture2D(inputBuffer,vUv);gl_FragColor=c;
#include <colorspace_fragment>
}`,h0="uniform vec2 texelSize;varying vec2 vUv;varying vec2 vUv00;varying vec2 vUv01;varying vec2 vUv02;varying vec2 vUv03;varying vec2 vUv04;varying vec2 vUv05;varying vec2 vUv06;varying vec2 vUv07;varying vec2 vUv08;varying vec2 vUv09;varying vec2 vUv10;varying vec2 vUv11;void main(){vUv=position.xy*0.5+0.5;vUv00=vUv+texelSize*vec2(-1.0,1.0);vUv01=vUv+texelSize*vec2(1.0,1.0);vUv02=vUv+texelSize*vec2(-1.0,-1.0);vUv03=vUv+texelSize*vec2(1.0,-1.0);vUv04=vUv+texelSize*vec2(-2.0,2.0);vUv05=vUv+texelSize*vec2(0.0,2.0);vUv06=vUv+texelSize*vec2(2.0,2.0);vUv07=vUv+texelSize*vec2(-2.0,0.0);vUv08=vUv+texelSize*vec2(2.0,0.0);vUv09=vUv+texelSize*vec2(-2.0,-2.0);vUv10=vUv+texelSize*vec2(0.0,-2.0);vUv11=vUv+texelSize*vec2(2.0,-2.0);gl_Position=vec4(position.xy,1.0,1.0);}",d0=class extends Et{constructor(){super({name:"DownsamplingMaterial",uniforms:{inputBuffer:new De(null),texelSize:new De(new Le)},blending:Os,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:u0,vertexShader:h0})}set inputBuffer(e){this.uniforms.inputBuffer.value=e}setSize(e,t){this.uniforms.texelSize.value.set(1/e,1/t)}},f0=`#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D inputBuffer;uniform mediump sampler2D supportBuffer;
#else
uniform lowp sampler2D inputBuffer;uniform lowp sampler2D supportBuffer;
#endif
uniform float radius;varying vec2 vUv;varying vec2 vUv0;varying vec2 vUv1;varying vec2 vUv2;varying vec2 vUv3;varying vec2 vUv4;varying vec2 vUv5;varying vec2 vUv6;varying vec2 vUv7;void main(){vec4 c=vec4(0.0);c+=texture2D(inputBuffer,vUv0)*0.0625;c+=texture2D(inputBuffer,vUv1)*0.125;c+=texture2D(inputBuffer,vUv2)*0.0625;c+=texture2D(inputBuffer,vUv3)*0.125;c+=texture2D(inputBuffer,vUv)*0.25;c+=texture2D(inputBuffer,vUv4)*0.125;c+=texture2D(inputBuffer,vUv5)*0.0625;c+=texture2D(inputBuffer,vUv6)*0.125;c+=texture2D(inputBuffer,vUv7)*0.0625;vec4 baseColor=texture2D(supportBuffer,vUv);gl_FragColor=mix(baseColor,c,radius);
#include <colorspace_fragment>
}`,m0="uniform vec2 texelSize;varying vec2 vUv;varying vec2 vUv0;varying vec2 vUv1;varying vec2 vUv2;varying vec2 vUv3;varying vec2 vUv4;varying vec2 vUv5;varying vec2 vUv6;varying vec2 vUv7;void main(){vUv=position.xy*0.5+0.5;vUv0=vUv+texelSize*vec2(-1.0,1.0);vUv1=vUv+texelSize*vec2(0.0,1.0);vUv2=vUv+texelSize*vec2(1.0,1.0);vUv3=vUv+texelSize*vec2(-1.0,0.0);vUv4=vUv+texelSize*vec2(1.0,0.0);vUv5=vUv+texelSize*vec2(-1.0,-1.0);vUv6=vUv+texelSize*vec2(0.0,-1.0);vUv7=vUv+texelSize*vec2(1.0,-1.0);gl_Position=vec4(position.xy,1.0,1.0);}",p0=class extends Et{constructor(){super({name:"UpsamplingMaterial",uniforms:{inputBuffer:new De(null),supportBuffer:new De(null),texelSize:new De(new Le),radius:new De(.85)},blending:Os,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:f0,vertexShader:m0})}set inputBuffer(e){this.uniforms.inputBuffer.value=e}set supportBuffer(e){this.uniforms.supportBuffer.value=e}get radius(){return this.uniforms.radius.value}set radius(e){this.uniforms.radius.value=e}setSize(e,t){this.uniforms.texelSize.value.set(1/e,1/t)}},v0=class extends xa{constructor(){super("MipmapBlurPass"),this.needsSwap=!1,this.renderTarget=new Qt(1,1,{depthBuffer:!1}),this.renderTarget.texture.name="Upsampling.Mipmap0",this.downsamplingMipmaps=[],this.upsamplingMipmaps=[],this.downsamplingMaterial=new d0,this.upsamplingMaterial=new p0,this.resolution=new Le}get texture(){return this.renderTarget.texture}get levels(){return this.downsamplingMipmaps.length}set levels(e){if(this.levels!==e){const t=this.renderTarget;this.dispose(),this.downsamplingMipmaps=[],this.upsamplingMipmaps=[];for(let a=0;a<e;++a){const s=t.clone();s.texture.name="Downsampling.Mipmap"+a,this.downsamplingMipmaps.push(s)}this.upsamplingMipmaps.push(t);for(let a=1,s=e-1;a<s;++a){const o=t.clone();o.texture.name="Upsampling.Mipmap"+a,this.upsamplingMipmaps.push(o)}this.setSize(this.resolution.x,this.resolution.y)}}get radius(){return this.upsamplingMaterial.radius}set radius(e){this.upsamplingMaterial.radius=e}render(e,t,a,s,o){const{scene:i,camera:l}=this,{downsamplingMaterial:h,upsamplingMaterial:r}=this,{downsamplingMipmaps:u,upsamplingMipmaps:d}=this;let p=t;this.fullscreenMaterial=h;for(let M=0,b=u.length;M<b;++M){const g=u[M];h.setSize(p.width,p.height),h.inputBuffer=p.texture,e.setRenderTarget(g),e.render(i,l),p=g}this.fullscreenMaterial=r;for(let M=d.length-1;M>=0;--M){const b=d[M];r.setSize(p.width,p.height),r.inputBuffer=p.texture,r.supportBuffer=u[M].texture,e.setRenderTarget(b),e.render(i,l),p=b}}setSize(e,t){const a=this.resolution;a.set(e,t);let s=a.width,o=a.height;for(let i=0,l=this.downsamplingMipmaps.length;i<l;++i)s=Math.round(s*.5),o=Math.round(o*.5),this.downsamplingMipmaps[i].setSize(s,o),i<this.upsamplingMipmaps.length&&this.upsamplingMipmaps[i].setSize(s,o)}initialize(e,t,a){if(a!==void 0){const s=this.downsamplingMipmaps.concat(this.upsamplingMipmaps);for(const o of s)o.texture.type=a;if(a!==Ot)this.downsamplingMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1",this.upsamplingMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1";else if(e!==null&&e.outputColorSpace===ut)for(const o of s)o.texture.colorSpace=ut}}dispose(){super.dispose();for(const e of this.downsamplingMipmaps.concat(this.upsamplingMipmaps))e.dispose()}},g0=`#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D map;
#else
uniform lowp sampler2D map;
#endif
uniform float intensity;void mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor){outputColor=texture2D(map,uv)*intensity;}`,x0=class extends Ih{constructor({blendFunction:e=Ce.SCREEN,luminanceThreshold:t=1,luminanceSmoothing:a=.03,mipmapBlur:s=!0,intensity:o=1,radius:i=.85,levels:l=8,kernelSize:h=dl.LARGE,resolutionScale:r=.5,width:u=Na.AUTO_SIZE,height:d=Na.AUTO_SIZE,resolutionX:p=u,resolutionY:M=d}={}){super("BloomEffect",g0,{blendFunction:e,uniforms:new Map([["map",new De(null)],["intensity",new De(o)]])}),this.renderTarget=new Qt(1,1,{depthBuffer:!1}),this.renderTarget.texture.name="Bloom.Target",this.blurPass=new r0({kernelSize:h}),this.luminancePass=new Ch({colorOutput:!0}),this.luminanceMaterial.threshold=t,this.luminanceMaterial.smoothing=a,this.mipmapBlurPass=new v0,this.mipmapBlurPass.enabled=s,this.mipmapBlurPass.radius=i,this.mipmapBlurPass.levels=l,this.uniforms.get("map").value=s?this.mipmapBlurPass.texture:this.renderTarget.texture;const b=this.resolution=new Na(this,p,M,r);b.addEventListener("change",g=>this.setSize(b.baseWidth,b.baseHeight))}get texture(){return this.mipmapBlurPass.enabled?this.mipmapBlurPass.texture:this.renderTarget.texture}getTexture(){return this.texture}getResolution(){return this.resolution}getBlurPass(){return this.blurPass}getLuminancePass(){return this.luminancePass}get luminanceMaterial(){return this.luminancePass.fullscreenMaterial}getLuminanceMaterial(){return this.luminancePass.fullscreenMaterial}get width(){return this.resolution.width}set width(e){this.resolution.preferredWidth=e}get height(){return this.resolution.height}set height(e){this.resolution.preferredHeight=e}get dithering(){return this.blurPass.dithering}set dithering(e){this.blurPass.dithering=e}get kernelSize(){return this.blurPass.kernelSize}set kernelSize(e){this.blurPass.kernelSize=e}get distinction(){return console.warn(this.name,"distinction was removed"),1}set distinction(e){console.warn(this.name,"distinction was removed")}get intensity(){return this.uniforms.get("intensity").value}set intensity(e){this.uniforms.get("intensity").value=e}getIntensity(){return this.intensity}setIntensity(e){this.intensity=e}getResolutionScale(){return this.resolution.scale}setResolutionScale(e){this.resolution.scale=e}update(e,t,a){const s=this.renderTarget,o=this.luminancePass;o.enabled?(o.render(e,t),this.mipmapBlurPass.enabled?this.mipmapBlurPass.render(e,o.renderTarget):this.blurPass.render(e,o.renderTarget,s)):this.mipmapBlurPass.enabled?this.mipmapBlurPass.render(e,t):this.blurPass.render(e,t,s)}setSize(e,t){const a=this.resolution;a.setBaseSize(e,t),this.renderTarget.setSize(a.width,a.height),this.blurPass.resolution.copy(a),this.luminancePass.setSize(e,t),this.mipmapBlurPass.setSize(e,t)}initialize(e,t,a){this.blurPass.initialize(e,t,a),this.luminancePass.initialize(e,t,a),this.mipmapBlurPass.initialize(e,t,a),a!==void 0&&(this.renderTarget.texture.type=a,e!==null&&e.outputColorSpace===ut&&(this.renderTarget.texture.colorSpace=ut))}},w0=class extends xa{constructor(e,t,a=null){super("RenderPass",e,t),this.needsSwap=!1,this.needsDepthBlit=!0,this.clearPass=new Ph,this.overrideMaterialManager=a===null?null:new Iu(a),this.ignoreBackground=!1,this.skipShadowMapUpdate=!1,this.selection=null}set mainScene(e){this.scene=e}set mainCamera(e){this.camera=e}get renderToScreen(){return super.renderToScreen}set renderToScreen(e){super.renderToScreen=e,this.clearPass.renderToScreen=e}get overrideMaterial(){const e=this.overrideMaterialManager;return e!==null?e.material:null}set overrideMaterial(e){const t=this.overrideMaterialManager;e!==null?t!==null?t.setMaterial(e):this.overrideMaterialManager=new Iu(e):t!==null&&(t.dispose(),this.overrideMaterialManager=null)}getOverrideMaterial(){return this.overrideMaterial}setOverrideMaterial(e){this.overrideMaterial=e}get clear(){return this.clearPass.enabled}set clear(e){this.clearPass.enabled=e}getSelection(){return this.selection}setSelection(e){this.selection=e}isBackgroundDisabled(){return this.ignoreBackground}setBackgroundDisabled(e){this.ignoreBackground=e}isShadowMapDisabled(){return this.skipShadowMapUpdate}setShadowMapDisabled(e){this.skipShadowMapUpdate=e}getClearPass(){return this.clearPass}render(e,t,a,s,o){const i=this.scene,l=this.camera,h=this.selection,r=l.layers.mask,u=i.background,d=e.shadowMap.autoUpdate,p=this.renderToScreen?null:t;h!==null&&l.layers.set(h.getLayer()),this.skipShadowMapUpdate&&(e.shadowMap.autoUpdate=!1),(this.ignoreBackground||this.clearPass.overrideClearColor!==null)&&(i.background=null),this.clearPass.enabled&&this.clearPass.render(e,t),e.setRenderTarget(p),this.overrideMaterialManager!==null?this.overrideMaterialManager.render(e,i,l):e.render(i,l),l.layers.mask=r,i.background=u,e.shadowMap.autoUpdate=d}},la={LINEAR:0,REINHARD:1,REINHARD2:2,REINHARD2_ADAPTIVE:3,OPTIMIZED_CINEON:5,CINEON:5,ACES_FILMIC:6,AGX:7,NEUTRAL:8},M0=`#include <packing>
#define packFloatToRGBA(v) packDepthToRGBA(v)
#define unpackRGBAToFloat(v) unpackRGBAToDepth(v)
uniform lowp sampler2D luminanceBuffer0;uniform lowp sampler2D luminanceBuffer1;uniform float minLuminance;uniform float deltaTime;uniform float tau;varying vec2 vUv;void main(){float l0=unpackRGBAToFloat(texture2D(luminanceBuffer0,vUv));
#if __VERSION__ < 300
float l1=texture2DLodEXT(luminanceBuffer1,vUv,MIP_LEVEL_1X1).r;
#else
float l1=textureLod(luminanceBuffer1,vUv,MIP_LEVEL_1X1).r;
#endif
l0=max(minLuminance,l0);l1=max(minLuminance,l1);float adaptedLum=l0+(l1-l0)*(1.0-exp(-deltaTime*tau));gl_FragColor=(adaptedLum==1.0)?vec4(1.0):packFloatToRGBA(adaptedLum);}`,y0=class extends Et{constructor(){super({name:"AdaptiveLuminanceMaterial",defines:{MIP_LEVEL_1X1:"0.0"},uniforms:{luminanceBuffer0:new De(null),luminanceBuffer1:new De(null),minLuminance:new De(.01),deltaTime:new De(0),tau:new De(1)},extensions:{shaderTextureLOD:!0},blending:Os,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:M0,vertexShader:hl})}set luminanceBuffer0(e){this.uniforms.luminanceBuffer0.value=e}setLuminanceBuffer0(e){this.uniforms.luminanceBuffer0.value=e}set luminanceBuffer1(e){this.uniforms.luminanceBuffer1.value=e}setLuminanceBuffer1(e){this.uniforms.luminanceBuffer1.value=e}set mipLevel1x1(e){this.defines.MIP_LEVEL_1X1=e.toFixed(1),this.needsUpdate=!0}setMipLevel1x1(e){this.mipLevel1x1=e}set deltaTime(e){this.uniforms.deltaTime.value=e}setDeltaTime(e){this.uniforms.deltaTime.value=e}get minLuminance(){return this.uniforms.minLuminance.value}set minLuminance(e){this.uniforms.minLuminance.value=e}getMinLuminance(){return this.uniforms.minLuminance.value}setMinLuminance(e){this.uniforms.minLuminance.value=e}get adaptationRate(){return this.uniforms.tau.value}set adaptationRate(e){this.uniforms.tau.value=e}getAdaptationRate(){return this.uniforms.tau.value}setAdaptationRate(e){this.uniforms.tau.value=e}},b0=class extends xa{constructor(e,{minLuminance:t=.01,adaptationRate:a=1}={}){super("AdaptiveLuminancePass"),this.fullscreenMaterial=new y0,this.needsSwap=!1,this.renderTargetPrevious=new Qt(1,1,{minFilter:vo,magFilter:vo,depthBuffer:!1}),this.renderTargetPrevious.texture.name="Luminance.Previous";const s=this.fullscreenMaterial;s.luminanceBuffer0=this.renderTargetPrevious.texture,s.luminanceBuffer1=e,s.minLuminance=t,s.adaptationRate=a,this.renderTargetAdapted=this.renderTargetPrevious.clone(),this.renderTargetAdapted.texture.name="Luminance.Adapted",this.copyPass=new Dh(this.renderTargetPrevious,!1)}get texture(){return this.renderTargetAdapted.texture}getTexture(){return this.renderTargetAdapted.texture}set mipLevel1x1(e){this.fullscreenMaterial.mipLevel1x1=e}get adaptationRate(){return this.fullscreenMaterial.adaptationRate}set adaptationRate(e){this.fullscreenMaterial.adaptationRate=e}render(e,t,a,s,o){this.fullscreenMaterial.deltaTime=s,e.setRenderTarget(this.renderToScreen?null:this.renderTargetAdapted),e.render(this.scene,this.camera),this.copyPass.render(e,this.renderTargetAdapted)}},S0=`#include <tonemapping_pars_fragment>
uniform float whitePoint;
#if TONE_MAPPING_MODE == 2 || TONE_MAPPING_MODE == 3
uniform float middleGrey;
#if TONE_MAPPING_MODE == 3
uniform lowp sampler2D luminanceBuffer;
#else
uniform float averageLuminance;
#endif
vec3 Reinhard2ToneMapping(vec3 color){color*=toneMappingExposure;float l=luminance(color);
#if TONE_MAPPING_MODE == 3
float lumAvg=unpackRGBAToFloat(texture2D(luminanceBuffer,vec2(0.5)));
#else
float lumAvg=averageLuminance;
#endif
float lumScaled=(l*middleGrey)/max(lumAvg,1e-6);float lumCompressed=lumScaled*(1.0+lumScaled/(whitePoint*whitePoint));lumCompressed/=(1.0+lumScaled);return clamp(lumCompressed*color,0.0,1.0);}
#elif TONE_MAPPING_MODE == 4
#define A 0.15
#define B 0.50
#define C 0.10
#define D 0.20
#define E 0.02
#define F 0.30
vec3 Uncharted2Helper(const in vec3 x){return((x*(A*x+C*B)+D*E)/(x*(A*x+B)+D*F))-E/F;}vec3 Uncharted2ToneMapping(vec3 color){color*=toneMappingExposure;return clamp(Uncharted2Helper(color)/Uncharted2Helper(vec3(whitePoint)),0.0,1.0);}
#endif
void mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor){
#if TONE_MAPPING_MODE == 2 || TONE_MAPPING_MODE == 3
outputColor=vec4(Reinhard2ToneMapping(inputColor.rgb),inputColor.a);
#elif TONE_MAPPING_MODE == 4
outputColor=vec4(Uncharted2ToneMapping(inputColor.rgb),inputColor.a);
#else
outputColor=vec4(toneMapping(inputColor.rgb),inputColor.a);
#endif
}`,T0=class extends Ih{constructor({blendFunction:e=Ce.SRC,adaptive:t=!1,mode:a=t?la.REINHARD2_ADAPTIVE:la.AGX,resolution:s=256,maxLuminance:o=4,whitePoint:i=o,middleGrey:l=.6,minLuminance:h=.01,averageLuminance:r=1,adaptationRate:u=1}={}){super("ToneMappingEffect",S0,{blendFunction:e,uniforms:new Map([["luminanceBuffer",new De(null)],["maxLuminance",new De(o)],["whitePoint",new De(i)],["middleGrey",new De(l)],["averageLuminance",new De(r)]])}),this.renderTargetLuminance=new Qt(1,1,{minFilter:Xa,depthBuffer:!1}),this.renderTargetLuminance.texture.generateMipmaps=!0,this.renderTargetLuminance.texture.name="Luminance",this.luminancePass=new Ch({renderTarget:this.renderTargetLuminance}),this.adaptiveLuminancePass=new b0(this.luminancePass.texture,{minLuminance:h,adaptationRate:u}),this.uniforms.get("luminanceBuffer").value=this.adaptiveLuminancePass.texture,this.resolution=s,this.mode=a}get mode(){return Number(this.defines.get("TONE_MAPPING_MODE"))}set mode(e){if(this.mode===e)return;const a=rl.replace(/\D+/g,"")>=168?"CineonToneMapping(texel)":"OptimizedCineonToneMapping(texel)";switch(this.defines.clear(),this.defines.set("TONE_MAPPING_MODE",e.toFixed(0)),e){case la.LINEAR:this.defines.set("toneMapping(texel)","LinearToneMapping(texel)");break;case la.REINHARD:this.defines.set("toneMapping(texel)","ReinhardToneMapping(texel)");break;case la.CINEON:case la.OPTIMIZED_CINEON:this.defines.set("toneMapping(texel)",a);break;case la.ACES_FILMIC:this.defines.set("toneMapping(texel)","ACESFilmicToneMapping(texel)");break;case la.AGX:this.defines.set("toneMapping(texel)","AgXToneMapping(texel)");break;case la.NEUTRAL:this.defines.set("toneMapping(texel)","NeutralToneMapping(texel)");break;default:this.defines.set("toneMapping(texel)","texel");break}this.adaptiveLuminancePass.enabled=e===la.REINHARD2_ADAPTIVE,this.setChanged()}getMode(){return this.mode}setMode(e){this.mode=e}get whitePoint(){return this.uniforms.get("whitePoint").value}set whitePoint(e){this.uniforms.get("whitePoint").value=e}get middleGrey(){return this.uniforms.get("middleGrey").value}set middleGrey(e){this.uniforms.get("middleGrey").value=e}get averageLuminance(){return this.uniforms.get("averageLuminance").value}set averageLuminance(e){this.uniforms.get("averageLuminance").value=e}get adaptiveLuminanceMaterial(){return this.adaptiveLuminancePass.fullscreenMaterial}getAdaptiveLuminanceMaterial(){return this.adaptiveLuminanceMaterial}get resolution(){return this.luminancePass.resolution.width}set resolution(e){const t=Math.max(0,Math.ceil(Math.log2(e))),a=Math.pow(2,t);this.luminancePass.resolution.setPreferredSize(a,a),this.adaptiveLuminanceMaterial.mipLevel1x1=t}getResolution(){return this.resolution}setResolution(e){this.resolution=e}get adaptive(){return this.mode===la.REINHARD2_ADAPTIVE}set adaptive(e){this.mode=e?la.REINHARD2_ADAPTIVE:la.REINHARD2}get adaptationRate(){return this.adaptiveLuminanceMaterial.adaptationRate}set adaptationRate(e){this.adaptiveLuminanceMaterial.adaptationRate=e}get distinction(){return console.warn(this.name,"distinction was removed."),1}set distinction(e){console.warn(this.name,"distinction was removed.")}update(e,t,a){this.adaptiveLuminancePass.enabled&&(this.luminancePass.render(e,t),this.adaptiveLuminancePass.render(e,null,null,a))}initialize(e,t,a){this.adaptiveLuminancePass.initialize(e,t,a)}},E0=`#include <common>
#include <packing>
#include <dithering_pars_fragment>
#define packFloatToRGBA(v) packDepthToRGBA(v)
#define unpackRGBAToFloat(v) unpackRGBAToDepth(v)
#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D inputBuffer;
#else
uniform lowp sampler2D inputBuffer;
#endif
#if DEPTH_PACKING == 3201
uniform lowp sampler2D depthBuffer;
#elif defined(GL_FRAGMENT_PRECISION_HIGH)
uniform highp sampler2D depthBuffer;
#else
uniform mediump sampler2D depthBuffer;
#endif
uniform vec2 resolution;uniform vec2 texelSize;uniform float cameraNear;uniform float cameraFar;uniform float aspect;uniform float time;varying vec2 vUv;vec4 sRGBToLinear(const in vec4 value){return vec4(mix(pow(value.rgb*0.9478672986+vec3(0.0521327014),vec3(2.4)),value.rgb*0.0773993808,vec3(lessThanEqual(value.rgb,vec3(0.04045)))),value.a);}float readDepth(const in vec2 uv){
#if DEPTH_PACKING == 3201
float depth=unpackRGBAToDepth(texture2D(depthBuffer,uv));
#else
float depth=texture2D(depthBuffer,uv).r;
#endif
#if defined(USE_LOGARITHMIC_DEPTH_BUFFER) || defined(LOG_DEPTH)
float d=pow(2.0,depth*log2(cameraFar+1.0))-1.0;float a=cameraFar/(cameraFar-cameraNear);float b=cameraFar*cameraNear/(cameraNear-cameraFar);depth=a+b/d;
#elif defined(USE_REVERSED_DEPTH_BUFFER)
depth=1.0-depth;
#endif
return depth;}float getViewZ(const in float depth){
#ifdef PERSPECTIVE_CAMERA
return perspectiveDepthToViewZ(depth,cameraNear,cameraFar);
#else
return orthographicDepthToViewZ(depth,cameraNear,cameraFar);
#endif
}vec3 RGBToHCV(const in vec3 RGB){vec4 P=mix(vec4(RGB.bg,-1.0,2.0/3.0),vec4(RGB.gb,0.0,-1.0/3.0),step(RGB.b,RGB.g));vec4 Q=mix(vec4(P.xyw,RGB.r),vec4(RGB.r,P.yzx),step(P.x,RGB.r));float C=Q.x-min(Q.w,Q.y);float H=abs((Q.w-Q.y)/(6.0*C+EPSILON)+Q.z);return vec3(H,C,Q.x);}vec3 RGBToHSL(const in vec3 RGB){vec3 HCV=RGBToHCV(RGB);float L=HCV.z-HCV.y*0.5;float S=HCV.y/(1.0-abs(L*2.0-1.0)+EPSILON);return vec3(HCV.x,S,L);}vec3 HueToRGB(const in float H){float R=abs(H*6.0-3.0)-1.0;float G=2.0-abs(H*6.0-2.0);float B=2.0-abs(H*6.0-4.0);return clamp(vec3(R,G,B),0.0,1.0);}vec3 HSLToRGB(const in vec3 HSL){vec3 RGB=HueToRGB(HSL.x);float C=(1.0-abs(2.0*HSL.z-1.0))*HSL.y;return(RGB-0.5)*C+HSL.z;}FRAGMENT_HEAD void main(){FRAGMENT_MAIN_UV vec4 color0=texture2D(inputBuffer,UV);vec4 color1=vec4(0.0);FRAGMENT_MAIN_IMAGE color0.a=clamp(color0.a,0.0,1.0);gl_FragColor=color0;
#ifdef ENCODE_OUTPUT
#include <colorspace_fragment>
#endif
#include <dithering_fragment>
}`,R0="uniform vec2 resolution;uniform vec2 texelSize;uniform float cameraNear;uniform float cameraFar;uniform float aspect;uniform float time;varying vec2 vUv;VERTEX_HEAD void main(){vUv=position.xy*0.5+0.5;VERTEX_MAIN_SUPPORT gl_Position=vec4(position.xy,1.0,1.0);}",A0=class extends Et{constructor(e,t,a,s,o=!1){super({name:"EffectMaterial",defines:{THREE_REVISION:rl.replace(/\D+/g,""),DEPTH_PACKING:"0",ENCODE_OUTPUT:"1"},uniforms:{inputBuffer:new De(null),depthBuffer:new De(null),resolution:new De(new Le),texelSize:new De(new Le),cameraNear:new De(.3),cameraFar:new De(1e3),aspect:new De(1),time:new De(0)},blending:Os,toneMapped:!1,depthWrite:!1,depthTest:!1,dithering:o}),e&&this.setShaderParts(e),t&&this.setDefines(t),a&&this.setUniforms(a),this.copyCameraSettings(s)}set inputBuffer(e){this.uniforms.inputBuffer.value=e}setInputBuffer(e){this.uniforms.inputBuffer.value=e}get depthBuffer(){return this.uniforms.depthBuffer.value}set depthBuffer(e){this.uniforms.depthBuffer.value=e}get depthPacking(){return Number(this.defines.DEPTH_PACKING)}set depthPacking(e){this.defines.DEPTH_PACKING=e.toFixed(0),this.needsUpdate=!0}setDepthBuffer(e,t=sn){this.depthBuffer=e,this.depthPacking=t}setShaderData(e){this.setShaderParts(e.shaderParts),this.setDefines(e.defines),this.setUniforms(e.uniforms),this.setExtensions(e.extensions)}setShaderParts(e){return this.fragmentShader=E0.replace($e.FRAGMENT_HEAD,e.get($e.FRAGMENT_HEAD)||"").replace($e.FRAGMENT_MAIN_UV,e.get($e.FRAGMENT_MAIN_UV)||"").replace($e.FRAGMENT_MAIN_IMAGE,e.get($e.FRAGMENT_MAIN_IMAGE)||""),this.vertexShader=R0.replace($e.VERTEX_HEAD,e.get($e.VERTEX_HEAD)||"").replace($e.VERTEX_MAIN_SUPPORT,e.get($e.VERTEX_MAIN_SUPPORT)||""),this.needsUpdate=!0,this}setDefines(e){for(const t of e.entries())this.defines[t[0]]=t[1];return this.needsUpdate=!0,this}setUniforms(e){for(const t of e.entries())this.uniforms[t[0]]=t[1];return this}setExtensions(e){this.extensions={};for(const t of e)this.extensions[t]=!0;return this}get encodeOutput(){return this.defines.ENCODE_OUTPUT!==void 0}set encodeOutput(e){this.encodeOutput!==e&&(e?this.defines.ENCODE_OUTPUT="1":delete this.defines.ENCODE_OUTPUT,this.needsUpdate=!0)}isOutputEncodingEnabled(e){return this.encodeOutput}setOutputEncodingEnabled(e){this.encodeOutput=e}get time(){return this.uniforms.time.value}set time(e){this.uniforms.time.value=e}setDeltaTime(e){this.uniforms.time.value+=e}adoptCameraSettings(e){this.copyCameraSettings(e)}copyCameraSettings(e){e&&(this.uniforms.cameraNear.value=e.near,this.uniforms.cameraFar.value=e.far,e instanceof ll?this.defines.PERSPECTIVE_CAMERA="1":delete this.defines.PERSPECTIVE_CAMERA,this.needsUpdate=!0)}setSize(e,t){const a=this.uniforms;a.resolution.value.set(e,t),a.texelSize.value.set(1/e,1/t),a.aspect.value=e/t}static get Section(){return $e}};function Cu(e,t,a){for(const s of t){const o="$1"+e+s.charAt(0).toUpperCase()+s.slice(1),i=new RegExp("([^\\.])(\\b"+s+"\\b)","g");for(const l of a.entries())l[1]!==null&&a.set(l[0],l[1].replace(i,o))}}function _0(e,t,a){let s=t.getFragmentShader(),o=t.getVertexShader();const i=s!==void 0&&/mainImage/.test(s),l=s!==void 0&&/mainUv/.test(s);if(a.attributes|=t.getAttributes(),s===void 0)throw new Error(`Missing fragment shader (${t.name})`);if(l&&(a.attributes&Bs.CONVOLUTION)!==0)throw new Error(`Effects that transform UVs are incompatible with convolution effects (${t.name})`);if(!i&&!l)throw new Error(`Could not find mainImage or mainUv function (${t.name})`);{const h=/\w+\s+(\w+)\([\w\s,]*\)\s*{/g,r=a.shaderParts;let u=r.get($e.FRAGMENT_HEAD)||"",d=r.get($e.FRAGMENT_MAIN_UV)||"",p=r.get($e.FRAGMENT_MAIN_IMAGE)||"",M=r.get($e.VERTEX_HEAD)||"",b=r.get($e.VERTEX_MAIN_SUPPORT)||"";const g=new Set,A=new Set;if(l&&(d+=`	${e}MainUv(UV);
`,a.uvTransformation=!0),o!==null&&/mainSupport/.test(o)){const x=/mainSupport *\([\w\s]*?uv\s*?\)/.test(o);b+=`	${e}MainSupport(`,b+=x?`vUv);
`:`);
`;for(const S of o.matchAll(/(?:varying\s+\w+\s+([\S\s]*?);)/g))for(const _ of S[1].split(/\s*,\s*/))a.varyings.add(_),g.add(_),A.add(_);for(const S of o.matchAll(h))A.add(S[1])}for(const x of s.matchAll(h))A.add(x[1]);for(const x of t.defines.keys())A.add(x.replace(/\([\w\s,]*\)/g,""));for(const x of t.uniforms.keys())A.add(x);A.delete("while"),A.delete("for"),A.delete("if"),t.uniforms.forEach((x,S)=>a.uniforms.set(e+S.charAt(0).toUpperCase()+S.slice(1),x)),t.defines.forEach((x,S)=>a.defines.set(e+S.charAt(0).toUpperCase()+S.slice(1),x));const R=new Map([["fragment",s],["vertex",o]]);Cu(e,A,a.defines),Cu(e,A,R),s=R.get("fragment"),o=R.get("vertex");const w=t.blendMode;if(a.blendModes.set(w.blendFunction,w),i){t.inputColorSpace!==null&&t.inputColorSpace!==a.colorSpace&&(p+=t.inputColorSpace===ut?`color0 = sRGBTransferOETF(color0);
	`:`color0 = sRGBToLinear(color0);
	`),t.outputColorSpace!==Ua?a.colorSpace=t.outputColorSpace:t.inputColorSpace!==null&&(a.colorSpace=t.inputColorSpace);const x=/MainImage *\([\w\s,]*?depth[\w\s,]*?\)/;p+=`${e}MainImage(color0, UV, `,(a.attributes&Bs.DEPTH)!==0&&x.test(s)&&(p+="depth, ",a.readDepth=!0),p+=`color1);
	`;const S=e+"BlendOpacity";a.uniforms.set(S,w.opacity),p+=`color0 = blend${w.blendFunction}(color0, color1, ${S});

	`,u+=`uniform float ${S};

`}if(u+=s+`
`,o!==null&&(M+=o+`
`),r.set($e.FRAGMENT_HEAD,u),r.set($e.FRAGMENT_MAIN_UV,d),r.set($e.FRAGMENT_MAIN_IMAGE,p),r.set($e.VERTEX_HEAD,M),r.set($e.VERTEX_MAIN_SUPPORT,b),t.extensions!==null)for(const x of t.extensions)a.extensions.add(x)}}var k0=class extends xa{constructor(e,...t){super("EffectPass"),this.fullscreenMaterial=new A0(null,null,null,e),this.listener=a=>this.handleEvent(a),this.effects=[],this.setEffects(t),this.skipRendering=!1,this.minTime=1,this.maxTime=Number.POSITIVE_INFINITY,this.timeScale=1}set mainScene(e){for(const t of this.effects)t.mainScene=e}set mainCamera(e){this.fullscreenMaterial.copyCameraSettings(e);for(const t of this.effects)t.mainCamera=e}get encodeOutput(){return this.fullscreenMaterial.encodeOutput}set encodeOutput(e){this.fullscreenMaterial.encodeOutput=e}get dithering(){return this.fullscreenMaterial.dithering}set dithering(e){const t=this.fullscreenMaterial;t.dithering=e,t.needsUpdate=!0}setEffects(e){for(const t of this.effects)t.removeEventListener("change",this.listener);this.effects=e.sort((t,a)=>a.attributes-t.attributes);for(const t of this.effects)t.addEventListener("change",this.listener)}updateMaterial(){const e=new bm;let t=0;for(const l of this.effects)if(l.blendMode.blendFunction===Ce.DST)e.attributes|=l.getAttributes()&Bs.DEPTH;else{if((e.attributes&l.getAttributes()&Bs.CONVOLUTION)!==0)throw new Error(`Convolution effects cannot be merged (${l.name})`);_0("e"+t++,l,e)}let a=e.shaderParts.get($e.FRAGMENT_HEAD),s=e.shaderParts.get($e.FRAGMENT_MAIN_IMAGE),o=e.shaderParts.get($e.FRAGMENT_MAIN_UV);const i=/\bblend\b/g;for(const l of e.blendModes.values())a+=l.getShaderCode().replace(i,`blend${l.blendFunction}`)+`
`;(e.attributes&Bs.DEPTH)!==0?(e.readDepth&&(s=`float depth = readDepth(UV);

	`+s),this.needsDepthTexture=this.getDepthTexture()===null):this.needsDepthTexture=!1,e.colorSpace===ut&&(s+=`color0 = sRGBToLinear(color0);
	`),e.uvTransformation?(o=`vec2 transformedUv = vUv;
`+o,e.defines.set("UV","transformedUv")):e.defines.set("UV","vUv"),e.shaderParts.set($e.FRAGMENT_HEAD,a),e.shaderParts.set($e.FRAGMENT_MAIN_IMAGE,s),e.shaderParts.set($e.FRAGMENT_MAIN_UV,o);for(const[l,h]of e.shaderParts)h!==null&&e.shaderParts.set(l,h.trim().replace(/^#/,`
#`));this.skipRendering=t===0,this.needsSwap=!this.skipRendering,this.fullscreenMaterial.setShaderData(e)}recompile(){this.updateMaterial()}getDepthTexture(){return this.fullscreenMaterial.depthBuffer}setDepthTexture(e,t=sn){this.fullscreenMaterial.depthBuffer=e,this.fullscreenMaterial.depthPacking=t;for(const a of this.effects)a.setDepthTexture(e,t)}render(e,t,a,s,o){for(const i of this.effects)i.update(e,t,s);if(!this.skipRendering||this.renderToScreen){const i=this.fullscreenMaterial;i.inputBuffer=t.texture,i.time+=s*this.timeScale,e.setRenderTarget(this.renderToScreen?null:a),e.render(this.scene,this.camera)}}setSize(e,t){this.fullscreenMaterial.setSize(e,t);for(const a of this.effects)a.setSize(e,t)}initialize(e,t,a){this.renderer=e;for(const s of this.effects)s.initialize(e,t,a);this.updateMaterial(),a!==void 0&&a!==Ot&&(this.fullscreenMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1")}dispose(){super.dispose();for(const e of this.effects)e.removeEventListener("change",this.listener),e.dispose()}handleEvent(e){switch(e.type){case"change":this.recompile();break}}};const F0={exposure:1,bloomThreshold:1.7,bloomSmoothing:.3,bloomIntensity:.85,bloomRadius:.7,bloomLevels:7,msaaSamples:4},Lh=2,D0=.5;function Lu(){const e=typeof window<"u"&&window.devicePixelRatio||1;return Math.min(Lh,Math.max(1,e))}class P0{constructor(t,a,s,o={}){F(this,"composer");F(this,"renderPass");F(this,"bloom");F(this,"toneMapping");F(this,"finalPass");F(this,"renderer");F(this,"cssWidth",1);F(this,"cssHeight",1);F(this,"pixelRatio",1);const i={...F0,...o};this.renderer=t,t.toneMapping=bd,t.toneMappingExposure=i.exposure,t.outputColorSpace=ut,this.composer=new ym(t,{frameBufferType:za,multisampling:i.msaaSamples,depthBuffer:!0,stencilBuffer:!1}),this.renderPass=new w0(a,s),this.composer.addPass(this.renderPass),this.bloom=new x0({blendFunction:Ce.ADD,mipmapBlur:!0,luminanceThreshold:i.bloomThreshold,luminanceSmoothing:i.bloomSmoothing,intensity:i.bloomIntensity,radius:i.bloomRadius,levels:i.bloomLevels}),this.toneMapping=new T0({mode:la.ACES_FILMIC}),this.finalPass=new k0(s,this.bloom,this.toneMapping),this.finalPass.dithering=!0,this.composer.addPass(this.finalPass)}insertScenePass(t){const a=this.composer.passes.indexOf(this.finalPass);this.composer.addPass(t,a>=0?a:void 0)}get exposure(){return this.renderer.toneMappingExposure}set exposure(t){this.renderer.toneMappingExposure=Math.max(.01,t)}get drawingBufferHeight(){return Math.max(1,Math.round(this.cssHeight*this.pixelRatio))}setSize(t,a,s){const o=Math.max(1,Math.floor(t)),i=Math.max(1,Math.floor(a)),l=Math.min(Lh,Math.max(D0,s));return o===this.cssWidth&&i===this.cssHeight&&Math.abs(l-this.pixelRatio)<.001?!1:(this.cssWidth=o,this.cssHeight=i,this.pixelRatio=l,this.renderer.setPixelRatio(l),this.composer.setSize(o,i,!1),!0)}render(t){this.composer.render(t)}dispose(){this.composer.dispose()}}const I0=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,C0=`
precision highp float;
uniform sampler2D uDem;
uniform float uDemRes;
uniform vec2 uElevRange;
uniform float uReliefScale; // world units per metre of elevation
uniform vec2 uSlabSize;     // world size of the slab (east-west, north-south)
uniform vec3 uSunDir;      // stage world space, pointing toward the sun
uniform float uPenumbra;   // larger = sharper edge

varying vec2 vUv;

float demHeight(vec2 uv) {
  vec2 c = clamp(uv, vec2(0.0), vec2(1.0)) * (uDemRes - 1.0);
  vec2 i0 = floor(c);
  vec2 f = c - i0;
  vec2 i1 = min(i0 + vec2(1.0), vec2(uDemRes - 1.0));
  float inv = 1.0 / uDemRes;
  float h00 = texture2D(uDem, (i0 + 0.5) * inv).r;
  float h10 = texture2D(uDem, (vec2(i1.x, i0.y) + 0.5) * inv).r;
  float h01 = texture2D(uDem, (vec2(i0.x, i1.y) + 0.5) * inv).r;
  float h11 = texture2D(uDem, (i1 + 0.5) * inv).r;
  float elev = mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
  float span = max(350.0, uElevRange.y - uElevRange.x);
  return clamp(elev - uElevRange.x, 0.0, span * 1.15) * uReliefScale;
}

// Elevation in metres, as the data holds it
float demElev(vec2 uv) {
  vec2 c = clamp(uv, vec2(0.0), vec2(1.0)) * (uDemRes - 1.0);
  vec2 i0 = floor(c);
  vec2 f = c - i0;
  vec2 i1 = min(i0 + vec2(1.0), vec2(uDemRes - 1.0));
  float inv = 1.0 / uDemRes;
  float h00 = texture2D(uDem, (i0 + 0.5) * inv).r;
  float h10 = texture2D(uDem, (vec2(i1.x, i0.y) + 0.5) * inv).r;
  float h01 = texture2D(uDem, (vec2(i0.x, i1.y) + 0.5) * inv).r;
  float h11 = texture2D(uDem, (i1 + 0.5) * inv).r;
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}

// Level ground: within most of a post in every direction the elevation changes by a few
// centimetres at most. The elevation sources in use level their lakes, and nothing else in
// them is that level, so this is where a lake is. 1 on level ground, 0 elsewhere.
float levelGround(vec2 uv) {
  float reach = 0.7 / (uDemRes - 1.0);
  float e0 = demElev(uv);
  float worst = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982;
    worst = max(worst, abs(demElev(uv + vec2(cos(a), sin(a)) * reach) - e0));
  }
  return 1.0 - smoothstep(0.05, 0.12, worst);
}

void main() {
  vec3 sun = normalize(uSunDir);
  float horiz = max(length(sun.xz), 1e-4);
  // uv step and height gain per world unit travelled horizontally toward the sun
  vec2 uvPerUnit = vec2(sun.x / uSlabSize.x, -sun.z / uSlabSize.y) / horiz;
  float risePerUnit = sun.y / horiz;

  float y0 = demHeight(vUv) + 0.004;
  float maxRelief = max(350.0, uElevRange.y - uElevRange.x) * 1.15 * uReliefScale;
  // The ray is clear of all terrain once it is above the highest possible relief
  float tMax = min(22.0, (maxRelief - y0) / max(risePerUnit, 1e-3));

  float lit = 1.0;
  const int STEPS = 112;
  for (int i = 1; i <= STEPS; i++) {
    float s = float(i) / float(STEPS);
    float t = tMax * s * (0.35 + 0.65 * s);
    vec2 uv = vUv + uvPerUnit * t;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    float clearance = (y0 + risePerUnit * t) - demHeight(uv);
    lit = min(lit, uPenumbra * clearance / max(t, 0.02) + 0.5);
    if (lit <= 0.0) break;
  }
  lit = smoothstep(0.0, 1.0, clamp(lit, 0.0, 1.0));
  gl_FragColor = vec4(lit, levelGround(vUv), lit, 1.0);
}
`;class L0{constructor(t){F(this,"renderer");F(this,"scene",new po);F(this,"camera",new sl(-1,1,1,-1,0,1));F(this,"material");F(this,"quad");this.renderer=t,this.material=new Et({vertexShader:I0,fragmentShader:C0,uniforms:{uDem:{value:null},uDemRes:{value:512},uElevRange:{value:new Le(0,1e3)},uReliefScale:{value:.001},uSlabSize:{value:new Le(14.8,10.8)},uSunDir:{value:new W(0,1,0)},uPenumbra:{value:9}},depthTest:!1,depthWrite:!1}),this.quad=new Sa(new tn(2,2),this.material),this.quad.frustumCulled=!1,this.scene.add(this.quad)}bake(t,a,s,o,i,l,h,r,u=1024){const d=new Qt(u,u,{format:It,type:Ot,depthBuffer:!1,stencilBuffer:!1,minFilter:Be,magFilter:Be,generateMipmaps:!1});d.texture.wrapS=Ve,d.texture.wrapT=Ve,d.texture.colorSpace=Ua;const p=this.material.uniforms;p.uDem.value=t,p.uDemRes.value=a,p.uElevRange.value.set(s,o),p.uReliefScale.value=i,p.uSlabSize.value.set(l,h),p.uSunDir.value.copy(r);const M=this.renderer.getRenderTarget(),b=this.renderer.autoClear;return this.renderer.autoClear=!0,this.renderer.setRenderTarget(d),this.renderer.render(this.scene,this.camera),this.renderer.setRenderTarget(M),this.renderer.autoClear=b,d}dispose(){this.quad.geometry.dispose(),this.material.dispose()}}function Vo(e,t,a,s){const o=Math.floor(e.length/3),i=new Int32Array(o);for(let w=0;w<o;w++)i[w]=w;const l=w=>{for(;i[w]!==w;)i[w]=i[i[w]],w=i[w];return w},h=(w,x)=>{const S=l(w),_=l(x);S!==_&&(i[Math.max(S,_)]=Math.min(S,_))},r=new Int32Array(t*a).fill(-1),u=[],d=w=>Math.min(t-1,Math.max(0,w)),p=w=>Math.min(a-1,Math.max(0,w));for(let w=0;w<o;w++){const x=e[w*3],S=e[w*3+1],_=s?s[w*2]:0,B=s?s[w*2+1]:0,I=d(Math.floor((x-_)*t)),P=d(Math.max(Math.floor(x*t),Math.ceil((x+_)*t)-1)),U=p(Math.floor((S-B)*a)),G=p(Math.max(Math.floor(S*a),Math.ceil((S+B)*a)-1));for(let k=U;k<=G;k++)for(let V=I;V<=P;V++){const Z=k*t+V;r[Z]<0?(r[Z]=w,u.push(Z)):h(w,r[Z])}}for(const w of u){const x=Math.floor(w/t),S=w-x*t,_=r[w];if(S+1<t&&r[w+1]>=0&&h(_,r[w+1]),x+1<a){const B=w+t;r[B]>=0&&h(_,r[B]),S>0&&r[B-1]>=0&&h(_,r[B-1]),S+1<t&&r[B+1]>=0&&h(_,r[B+1])}}const M=new Map,b=new Map;for(let w=0;w<o;w++){const x=l(w);M.set(x,(M.get(x)??0)+1),b.set(x,(b.get(x)??0)+e[w*3+2])}const g=[...M.keys()].sort((w,x)=>M.get(x)-M.get(w)||b.get(x)-b.get(w)||w-x),A=new Map;g.forEach((w,x)=>A.set(w,x));const R=new Uint16Array(o);for(let w=0;w<o;w++)R[w]=Math.min(65535,A.get(l(w)));return{patchOf:R,sizes:g.map(w=>M.get(w))}}function N0(e){const t=Math.max(1,Math.floor(e)),a=t+1,s=a*a,o=new Float32Array(s*3),i=new Float32Array(s*3),l=new Float32Array(s*2),h=1/t;for(let d=0;d<=t;d++){const p=d*h-.5,M=1-d/t;for(let b=0;b<=t;b++){const g=d*a+b;o[g*3]=b*h-.5,o[g*3+1]=0,o[g*3+2]=p,i[g*3+1]=1,l[g*2]=b/t,l[g*2+1]=M}}const r=new Uint32Array(t*t*6);let u=0;for(let d=0;d<t;d++)for(let p=0;p<t;p++){const M=p+a*d,b=p+a*(d+1),g=p+1+a*(d+1),A=p+1+a*d;r[u++]=M,r[u++]=b,r[u++]=A,r[u++]=b,r[u++]=g,r[u++]=A}return{position:o,normal:i,uv:l,index:r}}function tl(e){return typeof e=="object"&&e!==null}function Sr(e){return tl(e)&&typeof e.url=="string"&&typeof e.size=="number"&&Number.isFinite(e.size)}function Nu(e){const t=e==null?void 0:e.lite;if(!e||!tl(t)||!Sr(t.dem)||!Sr(t.ortho)||!Sr(t.aux))return null;const a=t.aux;return{...e,dem:t.dem,ortho:{...t.ortho,attribution:e.ortho.attribution},ortho_fallback:void 0,ortho_detail:void 0,aux:{...a,channels:a.channels??e.aux.channels},context:tl(t.context)?t.context:void 0}}function z0(e){let t=0;for(let a=0;a<2400;a++)for(let s=0;s<e.length;s++){const o=e[s]*1.000001+(s&7)*.5;e[s]=o>1e6?o-1e6:o,t+=Math.sqrt(e[s])}return t}function U0(e=()=>performance.now()){const t=new Float64Array(2048);for(let o=0;o<t.length;o++)t[o]=o;let a=1/0,s=0;for(let o=0;o<2;o++){const i=e();s+=z0(t),a=Math.min(a,e()-i)}return s===-1?-1:a}const B0=8;function O0(e){return Number.isFinite(e)&&e>B0}const H0={WINDOW_SEC:1,SLOW_MS:26,SLOW_WINDOWS:2,FAST_MS:18.5,CLIMB_SEC:6,HOLD_SEC:30,STALL_MS:250,STEP_DOWN:.15,STEP_UP:.1,LEAST:.5};class G0{constructor(){F(this,"scale",1);F(this,"windowSec",0);F(this,"gaps",[]);F(this,"slowWindows",0);F(this,"fastSec",0);F(this,"ceiling",1);F(this,"ceilingSec",0)}feed(t,a=!1){const s=H0;if(!(t>0)||t>s.STALL_MS||a||(this.gaps.push(t),this.windowSec+=t/1e3,this.ceiling<1&&(this.ceilingSec+=t/1e3,this.ceilingSec>s.HOLD_SEC&&(this.ceiling=Math.min(1,this.ceiling+s.STEP_UP),this.ceilingSec=0)),this.windowSec<s.WINDOW_SEC))return null;const o=this.gaps.sort((h,r)=>h-r),i=o[Math.floor(o.length/2)];this.windowSec=0,this.gaps=[];let l=this.scale;return i>s.SLOW_MS?(this.slowWindows+=1,this.fastSec=0,this.slowWindows>=s.SLOW_WINDOWS&&this.scale>s.LEAST&&(this.ceiling=this.scale-s.STEP_UP,this.ceilingSec=0,l=Math.max(s.LEAST,this.scale-s.STEP_DOWN),this.slowWindows=s.SLOW_WINDOWS-1)):i<s.FAST_MS?(this.slowWindows=0,this.fastSec+=s.WINDOW_SEC,this.fastSec>=s.CLIMB_SEC&&this.scale<this.ceiling&&(l=Math.min(this.ceiling,this.scale+s.STEP_UP),this.fastSec=0)):(this.slowWindows=0,this.fastSec=0),Math.abs(l-this.scale)<=.001?null:(this.scale=l,l)}}const K0="/isogon/assets/draco_decoder-Z1_iN-Ht.wasm",W0="/isogon/assets/draco_wasm_wrapper-fZCQGLGb.js",zu=Math.PI/180,V0=1.05,Tr=40,Y0=6.2,Er=3,$0=.5,j0=.16,qs=33,X0={modis:3.5,viirs:4.1},q0={modis:new Zi(1,.5,.24),viirs:new Zi(.4,.84,1)},Z0={modis:Ji,viirs:io},Q0={terra:new mr(0,0,0),aqua:new mr(Math.PI/2,0,0),suomi_npp:new mr(0,0,Math.PI/2)},J0="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";function ep(e){const t=e.toUpperCase();return t.includes("TERRA")?["terra"]:t.includes("AQUA")?["aqua"]:t.includes("NOAA")||t.includes("J1")||t.includes("J2")?["noaa_20","suomi_npp"]:["suomi_npp"]}function tp(e,t){const a=Math.sin(e*127.1+t*311.7)*43758.5453;return a-Math.floor(a)}function ap(){const a=new Uint8Array(65536);for(let o=0;o<64;o++)for(let i=0;i<256;i++){const l=i%16,h=o%16,r=l===0||h===0,u=l===8,d=.86+.14*tp(Math.floor(i/16),Math.floor(o/16)),p=(o*256+i)*4;a[p]=Math.round((r?118:u?40:7)*d),a[p+1]=Math.round((r?124:u?52:14)*d),a[p+2]=Math.round((r?138:u?88:46)*d),a[p+3]=255}const s=new ta(a,256,64,It,Ot);return s.colorSpace=ut,s.wrapS=ro,s.wrapT=ro,s.magFilter=Be,s.minFilter=Xa,s.generateMipmaps=!0,s.anisotropy=8,s.needsUpdate=!0,s}function sp(e){const t=new po,a=new Et({side:so,depthWrite:!1,vertexShader:`
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,fragmentShader:`
      varying vec3 vDir;
      void main() {
        float y = normalize(vDir).y;
        vec3 space = vec3(0.012, 0.016, 0.026);
        // Sunlit Earth from orbit: ocean and cloud average, brighter toward the limb
        vec3 earth = mix(vec3(0.30, 0.42, 0.58), vec3(0.62, 0.68, 0.74), smoothstep(-1.0, -0.15, y) * 0.6);
        vec3 limb = vec3(0.55, 0.80, 1.25);
        vec3 col = mix(earth, space, smoothstep(-0.07, 0.05, y));
        col += limb * exp(-abs(y + 0.02) * 22.0) * 1.1;
        gl_FragColor = vec4(col, 1.0);
      }
    `}),s=new Sa(new ph(10,32,16),a);t.add(s);const o=new Sd(e),i=o.fromScene(t,.03);return o.dispose(),s.geometry.dispose(),a.dispose(),i}function Rr(e,t,a){e.onBeforeCompile=s=>{s.uniforms.uFoilScale={value:t},s.uniforms.uFoilStrength={value:a},s.vertexShader=s.vertexShader.replace("#include <common>",`#include <common>
varying vec3 vFoilPos;`).replace("#include <begin_vertex>",`#include <begin_vertex>
vFoilPos = position;`),s.fragmentShader=s.fragmentShader.replace("#include <common>",`#include <common>
        varying vec3 vFoilPos;
        uniform float uFoilScale;
        uniform float uFoilStrength;
        uniform mat3 normalMatrix;
        vec3 foilHash(vec3 p) {
          p = fract(p * vec3(0.1031, 0.1030, 0.0973));
          p += dot(p, p.yxz + 33.33);
          return fract((p.xxy + p.yxx) * p.zyx);
        }
        // Tilt of the facet that holds p
        vec3 foilFacet(vec3 p) {
          vec3 i = floor(p);
          vec3 f = p - i;
          float best = 8.0;
          vec3 tilt = vec3(0.0);
          for (int z = -1; z <= 1; z++) {
            for (int y = -1; y <= 1; y++) {
              for (int x = -1; x <= 1; x++) {
                vec3 g = vec3(float(x), float(y), float(z));
                vec3 r = g + foilHash(i + g) - f;
                float d = dot(r, r);
                if (d < best) {
                  best = d;
                  tilt = foilHash(i + g + 17.0) * 2.0 - 1.0;
                }
              }
            }
          }
          return tilt;
        }`).replace("#include <normal_fragment_maps>",`#include <normal_fragment_maps>
        {
          vec3 fp = vFoilPos * uFoilScale;
          float fw = max(length(dFdx(fp)), length(dFdy(fp)));
          float fine = 1.0 - smoothstep(0.16, 0.5, fw);
          vec3 tilt = foilFacet(fp) + 0.45 * foilFacet(fp * 2.7 + 5.1) * (1.0 - smoothstep(0.06, 0.18, fw));
          vec3 tv = normalize(normalMatrix * tilt) * length(tilt);
          tv -= dot(tv, normal) * normal;
          normal = normalize(normal + uFoilStrength * fine * tv);
          roughnessFactor = min(1.0, roughnessFactor + 0.2 * (1.0 - fine));
        }`)},e.customProgramCacheKey=()=>"isogon-foil"}class op{constructor(){F(this,"cells",ap())}make(t,a={}){const s=a.map??null,o=new Fd({flatShading:a.flat===!0}),i=a.crinkleScale??26;switch(t){case"foilGold":o.color.setRGB(1,.62,.18),o.metalness=1,o.roughness=.3,Rr(o,i,.24);break;case"foilSilver":o.color.setRGB(.9,.91,.93),o.metalness=1,o.roughness=.32,Rr(o,i,.2);break;case"foilBlack":o.color.setRGB(.035,.035,.04),o.metalness=.75,o.roughness=.42,Rr(o,i,.22);break;case"solar":o.color.setRGB(1,1,1),o.metalness=.55,o.roughness=.22,o.map=s??this.cells,s&&o.color.setRGB(.42,.46,.62);break;case"radiator":o.color.setRGB(.84,.87,.92),o.metalness=.92,o.roughness=.16;break;case"paintWhite":o.color.setRGB(.86,.87,.88),o.metalness=.05,o.roughness=.55;break;case"paintGrey":o.color.setRGB(.3,.31,.33),o.metalness=.45,o.roughness=.5;break;case"dark":o.color.setRGB(.03,.032,.036),o.metalness=.6,o.roughness=.5;break}return s&&t!=="solar"&&(o.map=s,o.color.setRGB(1,1,1),(t==="foilGold"||t==="foilSilver")&&(o.metalness=.82)),o}dispose(){this.cells.dispose()}}function Uu(e){const t=e.toLowerCase();return t.includes("gold")?"foilGold":t.includes("silver")?"foilSilver":t.includes("krinkle")||t.includes("kapton")?"foilBlack":t.includes("solar")||t.includes("shiny_panel")?"solar":t==="side panels"?"radiator":t.includes("dish")?"paintWhite":t.includes("thruster")?"dark":t.includes("hardware")||t.includes("grey")||t.includes("gray")?"paintGrey":null}function ip(e){const t=e.getAttribute("position");if(!t||e.getAttribute("uv"))return;e.computeBoundingBox();const a=e.boundingBox,s=a.getSize(new W),o=[0,1,2].sort((u,d)=>s.getComponent(d)-s.getComponent(u)),[i,l]=o,h=Math.max(s.getComponent(l)/12,1e-6),r=new Float32Array(t.count*2);for(let u=0;u<t.count;u++)r[u*2]=(t.getComponent(u,i)-a.min.getComponent(i))/(h*16),r[u*2+1]=(t.getComponent(u,l)-a.min.getComponent(l))/(h*4);e.setAttribute("uv",new ga(r,2))}function np(e,t){const a=new vh().setFromObject(e),o=26/Math.max(...a.getSize(new W).toArray(),1e-6),i=new Map,l=new Set;e.traverse(h=>{const r=h;if(!r.isMesh)return;const u=!r.geometry.getAttribute("normal"),d=p=>{var x;const M=i.get(p);if(M)return M;const b=p,g=Uu(p.name),A=(x=b.map)==null?void 0:x.image,R=b.map&&r.geometry.getAttribute("uv")&&((A==null?void 0:A.width)??0)>4?b.map:null;let w=p;return g?w=t.make(g,{flat:u,map:R,crinkleScale:o}):b.isMeshStandardMaterial&&!R&&(w=t.make("paintGrey",{flat:u})),w!==p&&(w.name=p.name,l.add(p),b.map&&b.map!==R&&b.map.dispose()),i.set(p,w),w};Array.isArray(r.material)?r.material=r.material.map(d):(Uu(r.material.name)==="solar"&&ip(r.geometry),r.material=d(r.material))});for(const h of l)h.dispose()}function Bu(e,t){const a=new lo,s=t.make("foilGold"),o=t.make("foilSilver"),i=t.make("paintWhite"),l=t.make("dark"),h=t.make("solar"),r=(M,b,g,A,R)=>{const w=new Sa(M,b);return w.position.set(g,A,R),a.add(w),w},u=e==="modis"?.42:.32;r(new Ko(u,.17,.18),s,0,0,0),r(new Ko(u*.86,.035,.15),o,0,-.1,0),r(new pr(.045,.055,.07,24),l,u*.18,-.145,0),r(new Ko(.1,.05,.1),i,-u*.25,-.135,0),r(new Ko(u*.5,.012,.14),i,-u*.1,.092,0),r(new pr(.006,.006,.1,8),o,u*.3,.13,.04);const d=r(new Dd(.05,.03,24,1,!0),i,u*.3,.19,.04);d.rotation.x=Math.PI,d.material.side=Ns;const p=r(new pr(.007,.007,.16,8),o,0,0,.17);p.rotation.x=Math.PI/2;for(let M=0;M<3;M++){const b=new Ko(.2,.008,.2),g=b.getAttribute("uv");for(let R=0;R<g.count;R++)g.setXY(R,g.getX(R)*6/16,g.getY(R)*6/4);const A=r(b,h,0,0,.36+M*.208);A.rotation.z=-.35}return a}function Ar(e,t){const a=new lo;t&&e.rotation.copy(t),a.add(e),a.updateMatrixWorld(!0);const s=new vh().setFromObject(a),o=s.getSize(new W),i=s.getCenter(new W),l=Math.max(o.x,o.y,o.z,1e-6);e.position.sub(i);const h=new lo;return h.add(a),h.scale.setScalar(V0/l),h}function _r(e){const t=new Set,a=new Set,s=new Set;e.traverse(o=>{const i=o;i.geometry&&t.add(i.geometry);const l=Array.isArray(i.material)?i.material:i.material?[i.material]:[];for(const h of l){a.add(h);const r=h;for(const u of[r.map,r.normalMap,r.roughnessMap,r.metalnessMap,r.emissiveMap,r.aoMap])u&&s.add(u)}});for(const o of t)o.dispose();for(const o of a)o.dispose();for(const o of s){const i=o.image;i&&typeof i.close=="function"&&i.close(),o.dispose()}}function kr(e){const t=Math.min(1,Math.max(0,e));return t*t*(3-2*t)}class rp{constructor(t){F(this,"group",new lo);F(this,"strips",{modis:{alongTrackKm:0,strength:0},viirs:{alongTrackKm:0,strength:0}});F(this,"look",new op);F(this,"templates",new Map);F(this,"rigs",[]);F(this,"draco",null);F(this,"disposed",!1);F(this,"pos",new W);F(this,"xAxis",new W);F(this,"yAxis",new W(0,1,0));F(this,"zAxis",new W);F(this,"basis",new to);this.templates.set("procedural-modis",Ar(Bu("modis",this.look),null)),this.templates.set("procedural-viirs",Ar(Bu("viirs",this.look),null));for(let a=0;a<t;a++)this.rigs.push(this.buildRig(a))}buildRig(t){const a=new lo;a.visible=!1;const s=new lo;a.add(s);const o=g=>{const A=new an;return A.setAttribute("position",new ga(new Float32Array(g*3),3)),A.setAttribute("color",new ga(new Float32Array(g*4),4)),A},i=()=>new kd({transparent:!0,opacity:0,depthWrite:!1,vertexColors:!0}),l=i(),h=new Td(o(Tr),l),r=i(),u=new Ed(o(6),r);for(const g of[h,u])g.frustumCulled=!1,a.add(g);const d=o(qs+1),p=[];for(let g=0;g<qs-1;g++)p.push(0,1+g,2+g);d.setIndex(p);const M=new Rd({transparent:!0,opacity:0,side:Ns,depthWrite:!1,blending:Ad,vertexColors:!0}),b=new Sa(d,M);return b.frustumCulled=!1,a.add(b),this.group.add(a),{root:a,craft:s,craftKey:"",along:-1.4+t*.9,passKey:"",track:h,trackMat:l,rays:u,raysMat:r,fan:b,fanMat:M}}async loadModels(t){const a=t.endsWith("/")?t:`${t}/`;let s=[];try{const u=await fetch(`${a}models/spacecraft/manifest.json`);if(!u.ok)return;const d=await u.json();s=Array.isArray(d.models)?d.models:[]}catch{return}const[{GLTFLoader:o},{DRACOLoader:i}]=await Promise.all([ou(()=>import("./GLTFLoader-C8Ag2Ruc.js"),__vite__mapDeps([0,1])),ou(()=>import("./DRACOLoader-LNaB3iNp.js"),__vite__mapDeps([2,1]))]);if(this.disposed)return;const l=new _d;l.setURLModifier(u=>/\.tga(\?|$)/i.test(u)?J0:u);const h=new i(l);h.setDecoderPath({js:W0,wasm:K0}),this.draco=h;const r=new o(l);r.setDRACOLoader(h),await Promise.all(s.map(async u=>{if(!(typeof u.id!="string"||typeof u.url!="string"))try{const d=await r.loadAsync(`${a}${u.url.replace(/^\/+/,"")}`);if(this.disposed){_r(d.scene);return}np(d.scene,this.look),this.templates.set(u.id,Ar(d.scene,Q0[u.id]??null))}catch{}}))}resolveTemplate(t){for(const s of ep(t.sensorLabel)){const o=this.templates.get(s);if(o)return{key:s,template:o}}const a=`procedural-${t.family}`;return{key:a,template:this.templates.get(a)}}update(t,a){this.strips.modis.strength=0,this.strips.viirs.strength=0;const s=a.sky>.004||a.strip>.004,[o,i,l]=a.unitsPerMetre,h=a.slabWidth*.5,r=a.slabDepth*.5,u=a.sampleTerrainY(.5,.5);for(let d=0;d<this.rigs.length;d++){const p=this.rigs[d],M=t[d];if(!M||!s){p.root.visible=!1;continue}p.root.visible=!0;const{key:b,template:g}=this.resolveTemplate(M);p.craftKey!==b&&(p.craft.clear(),p.craft.add(g.clone(!0)),p.craftKey=b);const A=Z0[M.family],R=M.azimuthDeg*zu,w=Math.min(A.maxScanDeg,Math.abs(M.scanAngleDeg))*zu,x=(go+A.altitudeKm)/go,S=Math.min(.999,x*Math.sin(w)),_=Math.sqrt(1-S*S),B=Math.sin(R),I=-Math.cos(R);let P=B*S*o,U=_*i,G=I*S*l;const k=Math.hypot(P,U,G)||1,V=X0[M.family];P=P/k*V,U=U/k*V,G=G/k*V;let Z=Math.cos(R),ge=Math.sin(R);const we=M.orbitNode?M.orbitNode==="descending":M.sensorLabel.toUpperCase().includes("TERRA");ge>0!==we&&(Z=-Z,ge=-ge);const Re=`${M.sensorLabel}|${M.azimuthDeg}|${M.scanAngleDeg}|${M.orbitNode??""}`;p.passKey!==Re&&(p.passKey!==""&&(p.along=-.6),p.passKey=Re),p.along+=j0*Math.min(.1,Math.max(0,a.dtSec)),p.along>Er&&(p.along-=2*Er);const be=p.along,Me=kr((Er-Math.abs(be))/$0),pe=this.pos.set(P+Z*be,u+U,G+ge*be);this.xAxis.set(Z,0,ge),this.zAxis.crossVectors(this.xAxis,this.yAxis).normalize(),this.basis.makeBasis(this.xAxis,this.yAxis,this.zAxis),p.craft.quaternion.setFromRotationMatrix(this.basis),p.craft.position.copy(pe);const ht=kr(a.sky*1.15)*Me;p.craft.visible=ht>.002,p.craft.scale.setScalar(Math.max(ht,1e-4));const ce=q0[M.family],ae=p.track.geometry.getAttribute("position"),Rt=p.track.geometry.getAttribute("color");for(let Ne=0;Ne<Tr;Ne++){const it=Ne/(Tr-1)*2-1,dt=it*Y0;ae.setXYZ(Ne,P+Z*dt,u+U,G+ge*dt);const wa=kr((1-Math.abs(it))/.3),ua=be-dt,je=ua>=0?Math.exp(-ua/1.6):Math.exp(ua/.12);Rt.setXYZW(Ne,ce.r,ce.g,ce.b,wa*(.3+.7*je*Me))}ae.needsUpdate=!0,Rt.needsUpdate=!0,p.trackMat.opacity=.8*a.sky,p.track.visible=a.sky>.004;const At=a.sky*Me,Ht=a.strip*Me;let ie=-1e9,m=1e9;if(Math.abs(B)>1e-5){const Ne=(pe.x-h)/B,it=(pe.x+h)/B;ie=Math.max(ie,Math.min(Ne,it)),m=Math.min(m,Math.max(Ne,it))}else Math.abs(pe.x)>h&&(m=-1e9);if(Math.abs(I)>1e-5){const Ne=(pe.z-r)/I,it=(pe.z+r)/I;ie=Math.max(ie,Math.min(Ne,it)),m=Math.min(m,Math.max(Ne,it))}else Math.abs(pe.z)>r&&(m=-1e9);if(M.groundStrip&&Ht>.004){const Ne=this.strips[M.family],it=pe.x/(o*1e3),dt=pe.z/(l*1e3);Ne.alongTrackKm=it*Math.cos(R)+dt*Math.sin(R),Ne.strength=Ht}const Oe=At>.004&&m>ie+.05;if(p.rays.visible=Oe,p.fan.visible=Oe,!Oe)continue;const tt=p.fan.geometry.getAttribute("position"),ia=p.fan.geometry.getAttribute("color"),aa=pe.y-.04;tt.setXYZ(0,pe.x,aa,pe.z),ia.setXYZW(0,ce.r,ce.g,ce.b,1);for(let Ne=0;Ne<qs;Ne++){const it=ie+(m-ie)*Ne/(qs-1),dt=pe.x-B*it,wa=pe.z-I*it,ua=D.clamp(dt/a.slabWidth+.5,0,1),je=D.clamp(.5-wa/a.slabDepth,0,1);tt.setXYZ(Ne+1,dt,a.sampleTerrainY(ua,je)+.02,wa),ia.setXYZW(Ne+1,ce.r,ce.g,ce.b,.12)}tt.needsUpdate=!0,ia.needsUpdate=!0,p.fanMat.opacity=.04*At;const _t=p.rays.geometry.getAttribute("position"),na=p.rays.geometry.getAttribute("color"),ca=[1,1+Math.floor(qs/2),qs];for(let Ne=0;Ne<3;Ne++)_t.setXYZ(Ne*2,pe.x,aa,pe.z),_t.setXYZ(Ne*2+1,tt.getX(ca[Ne]),tt.getY(ca[Ne]),tt.getZ(ca[Ne])),na.setXYZW(Ne*2,ce.r,ce.g,ce.b,1),na.setXYZW(Ne*2+1,ce.r,ce.g,ce.b,Ne===1?.25:.5);_t.needsUpdate=!0,na.needsUpdate=!0,p.raysMat.opacity=.6*At}}dispose(){var t;this.disposed=!0,(t=this.draco)==null||t.dispose();for(const a of this.templates.values())_r(a);_r(this.group),this.look.dispose()}}const Nh=64;function lp(e){let t=e>>>0;return()=>{t=t+1831565813>>>0;let a=t;return a=Math.imul(a^a>>>15,a|1),a^=a+Math.imul(a^a>>>7,a|61),((a^a>>>14)>>>0)/4294967296}}function Fr(e,t){const a=new Float32Array(e*e*e);for(let i=0;i<a.length;i++)a[i]=t();const s=e-1,o=e*e;return(i,l,h)=>{const r=i*e,u=l*e,d=h*e,p=Math.floor(r),M=Math.floor(u),b=Math.floor(d),g=r-p,A=u-M,R=d-b,w=g*g*g*(g*(g*6-15)+10),x=A*A*A*(A*(A*6-15)+10),S=R*R*R*(R*(R*6-15)+10),_=p&s,B=p+1&s,I=(M&s)*e,P=(M+1&s)*e,U=(b&s)*o,G=(b+1&s)*o,k=a[U+I+_],V=a[U+I+B],Z=a[U+P+_],ge=a[U+P+B],we=a[G+I+_],Re=a[G+I+B],be=a[G+P+_],Me=a[G+P+B],pe=k+(V-k)*w,ht=Z+(ge-Z)*w,ce=we+(Re-we)*w,ae=be+(Me-be)*w,Rt=pe+(ht-pe)*x,At=ce+(ae-ce)*x;return Rt+(At-Rt)*S}}function Dr(e,t){const a=new Float32Array(e*e*e*3);for(let o=0;o<a.length;o++)a[o]=t();const s=e-1;return(o,i,l)=>{const h=o*e,r=i*e,u=l*e,d=Math.floor(h),p=Math.floor(r),M=Math.floor(u);let b=9;for(let g=-1;g<=1;g++){const A=(M+g&s)*e,R=M+g-u;for(let w=-1;w<=1;w++){const x=(A+(p+w&s))*e,S=p+w-r;for(let _=-1;_<=1;_++){const B=(x+(d+_&s))*3,I=d+_+a[B]-h,P=S+a[B+1],U=R+a[B+2],G=I*I+P*P+U*U;G<b&&(b=G)}}}return Math.min(1,Math.sqrt(b))}}let Pr=null;function cp(){if(Pr)return Pr;const e=Nh,t=lp(1377799),a=Fr(4,t),s=Fr(8,t),o=Fr(16,t),i=Dr(4,t),l=Dr(8,t),h=Dr(16,t),r=new Uint8Array(e*e*e*4),u=1/e;let d=0;for(let p=0;p<e;p++){const M=(p+.5)*u;for(let b=0;b<e;b++){const g=(b+.5)*u;for(let A=0;A<e;A++){const R=(A+.5)*u,w=a(R,g,M)*.5+s(R,g,M)*.3+o(R,g,M)*.2,x=1-i(R,g,M),S=1-l(R,g,M),_=1-h(R,g,M),B=Math.min(1,Math.max(0,w*.62+x*.46-.06)),I=Math.min(1,Math.max(0,S*.62+_*.38));r[d]=Math.round(B*255),r[d+1]=Math.round(I*255),r[d+2]=Math.round(w*255),r[d+3]=255,d+=4}}}return Pr=r,r}function up(){const e=Nh,t=new Pd(cp(),e,e,e);return t.format=It,t.type=Ot,t.minFilter=Be,t.magFilter=Be,t.wrapS=ro,t.wrapT=ro,t.wrapR=ro,t.unpackAlignment=1,t.needsUpdate=!0,t}const Zs=256,hp=256;function dp(e,t,a,s,o){const i=hp,l=new Float32Array(i*i);for(let g=0;g<i;g++){const A=Math.min(t-1,Math.round(g/(i-1)*(t-1)));for(let R=0;R<i;R++){const w=Math.min(t-1,Math.round(R/(i-1)*(t-1)));l[g*i+R]=a(e[A*t+w])}}const h=5,r=new Float32Array(i*i),u=new Float32Array(i*i);for(let g=0;g<i;g++)for(let A=0;A<i;A++){let R=0;for(let w=-h;w<=h;w++)R+=l[g*i+Math.min(i-1,Math.max(0,A+w))];r[g*i+A]=R/(2*h+1)}for(let g=0;g<i;g++)for(let A=0;A<i;A++){let R=0;for(let w=-h;w<=h;w++)R+=r[Math.min(i-1,Math.max(0,g+w))*i+A];u[g*i+A]=R/(2*h+1)}const d=new Uint16Array(i*i*4),p=s/(i-1),M=o/(i-1);for(let g=0;g<i;g++){const A=Math.max(0,g-2),R=Math.min(i-1,g+2);for(let w=0;w<i;w++){const x=Math.max(0,w-2),S=Math.min(i-1,w+2),_=(u[g*i+S]-u[g*i+x])/((S-x)*p),B=(u[R*i+w]-u[A*i+w])/((R-A)*M),I=Math.hypot(_,B),P=I>1e-5?Math.min(1,I*1.6)/I:0,U=(g*i+w)*4;d[U]=Ra.toHalfFloat(l[g*i+w]),d[U+1]=Ra.toHalfFloat(_*P),d[U+2]=Ra.toHalfFloat(B*P),d[U+3]=Ra.toHalfFloat(u[g*i+w])}}const b=new ta(d,i,i,It,za);return b.minFilter=Be,b.magFilter=Be,b.wrapS=Ve,b.wrapT=Ve,b.generateMipmaps=!1,b.flipY=!1,b.needsUpdate=!0,b}const Yo=`
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`,fp=`
uniform sampler2D uField0;
uniform sampler2D uField1;
uniform sampler2D uDetection0;
uniform sampler2D uDetection1;
uniform float uRealSource;
uniform float uFrameMix;
varying vec2 vUv;
void main() {
  float z = mix(textureLod(uField0, vUv, 0.0).r, textureLod(uField1, vUv, 0.0).r, uFrameMix);
  // A real run: smoke rises where the satellites detected fire (see buildDetectionSource in
  // ./footprintField.ts), not where the model estimates it
  if (uRealSource > 0.5) {
    z = mix(textureLod(uDetection0, vUv, 0.0).r, textureLod(uDetection1, vUv, 0.0).r, uFrameMix);
  }
  // Emission only where the field is above the fire threshold
  float s = max(0.0, z - ${ei.toFixed(4)}) / ${(1-ei).toFixed(4)};
  gl_FragColor = vec4(clamp(s * 1.6, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`,mp=`
uniform sampler2D uSourceTex;
uniform sampler2D uHeightPrev;
uniform sampler2D uHeightNext;
uniform float uMorph;
uniform vec2 uWindUv;
uniform float uSmokeTop;
uniform vec2 uSlabSize;
uniform vec4 uLid;
uniform float uLidAmount;
varying vec2 vUv;

const int TAPS = 26;
const float REACH = 0.40;        // how far downwind a plume is followed, slab uv
const float RISE_LENGTH = 0.07;  // downwind distance over which a plume reaches its final rise
const float SPREAD_LENGTH = 0.18;
const float FADE_LENGTH = 0.10;  // dilution and fallout
const float PLUME_GAIN = 44.0;

float smoothGround(vec2 uv) {
  float g = texture2D(uHeightNext, uv).a;
  if (uMorph < 0.999) g = mix(texture2D(uHeightPrev, uv).a, g, uMorph);
  return g;
}

void main() {
  float g0 = smoothGround(vUv);
  float m0 = 0.0;
  float m1 = 0.0;
  float m2 = 0.0;
  float strongest = 0.0;
  float sPrev = 0.0;
  for (int j = 0; j < TAPS; j++) {
    // Taps are dense near the point (fresh smoke changes fast) and sparse far upwind
    float s = REACH * pow((float(j) + 0.5) / float(TAPS), 1.7);
    float sNext = REACH * pow((float(j) + 1.0) / float(TAPS), 1.7);
    float ds = sNext - sPrev;
    sPrev = sNext;
    vec2 uvS = vUv - uWindUv * s;
    if (uvS.x < 0.0 || uvS.x > 1.0 || uvS.y < 0.0 || uvS.y > 1.0) continue;
    // A plume widens sideways as it drifts: older smoke comes from a wider stretch of the source
    // The plume is as wide as the stretch of front that burns, plus a modest sideways spread with
    // age (at most about half a slab unit). The lowest level already merges neighbouring fire
    // cells, so single cells do not rise as separate streaks.
    float src = textureLod(uSourceTex, uvS, 1.6 + 1.6 * sqrt(s / REACH)).r;
    if (src < 0.0004) continue;
    float power = textureLod(uSourceTex, uvS, 4.5).r;
    // Bent over from the first rise: the axis climbs at a shallow angle and levels off, and the
    // layer stays thin. Axis plus thickness never exceed the ceiling uSmokeTop.
    float rise = uSmokeTop * mix(0.24, 0.44, smoothstep(0.004, 0.10, power));
    float center = rise * (1.0 - exp(-s / RISE_LENGTH));
    float thick = uSmokeTop * (0.07 + 0.10 * (1.0 - exp(-s / SPREAD_LENGTH)));
    // Smoke climbs with rising ground and comes most of the way down with falling ground: it neither
    // runs into a slope nor stays hanging high over a valley
    float drop = smoothGround(uvS) - g0;
    float h = center + (drop > 0.0 ? 0.22 : 0.15) * drop;
    float c = src * ds * exp(-s / FADE_LENGTH);
    m0 += c;
    m1 += c * h;
    m2 += c * (h * h + thick * thick);
    strongest = max(strongest, power * exp(-s / FADE_LENGTH));
  }
  float mean = m0 > 1e-7 ? m1 / m0 : 0.0;
  float variance = m0 > 1e-7 ? max(m2 / m0 - mean * mean, 1e-4) : 1e-2;
  float sigma = sqrt(variance);
  // What ends up far above the ground under it is let go: a thin sheet alone in the sky reads as
  // a stray streak, not as smoke
  float mass = m0 * PLUME_GAIN * (1.0 - smoothstep(0.24, 0.48, mean));
  // The fire field ends at the edge of the region, and smoke that reached it would end there in a
  // straight cut. It thins out over the last stretch instead.
  mass *= smoothstep(0.0, 0.05, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  if (uLidAmount > 0.0) {
    // Under a lid the layer levels off lower and thinner, and carries less: the rise is capped,
    // the smoke is not cut
    vec2 xz = vec2((vUv.x - 0.5) * uSlabSize.x, (0.5 - vUv.y) * uSlabSize.y);
    float room = -(uLid.w + uLid.x * xz.x + uLid.z * xz.y) / max(uLid.y, 0.05) - g0;
    float k = clamp(0.8 * room / max(mean + 2.0 * sigma, 1e-3), 0.0, 1.0);
    k = mix(1.0, k, uLidAmount);
    mean *= k;
    sigma *= k;
    mass *= k;
  }
  gl_FragColor = vec4(mass, mean, sigma, strongest);
}
`,zh=`
precision highp sampler3D;

uniform sampler2D uHeightPrev;
uniform sampler2D uHeightNext;
uniform float uMorph;
uniform sampler2D uSourceTex;
uniform sampler2D uPlumeTex;   // column mass, mean height, thickness, fire power (see the plume pass)
uniform sampler3D uNoiseTex;
uniform vec2 uSlabSize;
uniform float uSmokeTop;     // plume ceiling above the ground, world units
uniform vec2 uWindUv;        // unit downwind direction in slab uv
uniform float uTime;
uniform float uOpacity;
uniform float uCutawayMix;
uniform float uCutawayPlane;
uniform vec2 uCutawayDir;
uniform vec3 uClearCenter;   // the camera
uniform float uClearRadius;  // smoke within this distance of it is not drawn, 0 = off
uniform float uThinOverFire; // share of the smoke taken away right over its source, 0 = none
uniform vec4 uLid;           // plane the smoke stays under: dot(xyz, p) + w < 0
uniform float uLidAmount;    // 0 = no lid

vec2 smokeUv(vec3 p) {
  return vec2(p.x / uSlabSize.x + 0.5, 0.5 - p.z / uSlabSize.y);
}

vec4 smokeGround(vec2 uv) {
  vec4 g = texture2D(uHeightNext, uv);
  if (uMorph < 0.999) {
    g = mix(texture2D(uHeightPrev, uv), g, uMorph);
  }
  return g;
}

// Smoke belongs to the harmonized record, so the sensor curtain cuts it like the terrain layers
float smokeGate(vec2 uv) {
  float scanCoord = dot(uv - vec2(0.5), normalize(uCutawayDir)) - uCutawayPlane;
  return mix(1.0, smoothstep(-0.004, 0.012, -scanCoord), uCutawayMix);
}

// Returns density. detailAmount: 0 to 1 for the view march (share of the finest noise), below 0
// for light and shadow samples (the cheapest form). info = (height above the ground as a share of the ceiling, position inside the
// layer in sigmas with 0 at its middle, column mass, fire power feeding the column).
float smokeDensity(vec3 p, float detailAmount, out vec4 info) {
  info = vec4(0.0);
  vec2 uv = smokeUv(p);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  // Explicit level: inside the march loop the automatic level of detail is undefined, and the
  // plume map has a mip chain (the march reads level 4 on purpose to find where smoke can be)
  vec4 plume = textureLod(uPlumeTex, uv, 0.0);
  if (plume.r < 0.004) return 0.0;
  vec4 ground = smokeGround(uv);
  float h = p.y - ground.a;
  float sigma = max(plume.b, 0.06 * uSmokeTop);
  // Beyond 3.3 sigma of the layer's middle, plus the most the lumps can move it, there is nothing:
  // leave before any noise is read (most samples of a march end here)
  if (abs(h - plume.g) > 3.3 * sigma + 0.5 * (0.07 + sigma * 1.5)) return 0.0;

  // Billows: a noise volume that drifts with the wind and rises slowly. Two scales: fine lumps a
  // few hundred metres across, small against the ridges, and a slower variation several times
  // larger so the fine pattern does not repeat along a plume.
  vec3 windW = normalize(vec3(uWindUv.x * uSlabSize.x, 0.0, -uWindUv.y * uSlabSize.y));
  vec3 q = p * 2.3 - windW * (uTime * 0.06) - vec3(0.0, uTime * 0.04, 0.0);
  float n = texture(uNoiseTex, q).r;
  // The slow second scale is left out of the light and shadow samples (detailAmount below 0):
  // they only need to know roughly how much smoke lies toward the sun
  if (detailAmount >= 0.0) {
    n = 0.62 * n + 0.38 * texture(uNoiseTex, q * 0.37 + vec3(0.31, 0.17, 0.53)).r;
  }
  // Young smoke (still fed by strong fire close upwind) is lumpy and has holes; aged smoke is a
  // veil that only varies in strength and trails off, so nothing breaks away and hangs alone
  float young = smoothstep(0.004, 0.05, plume.a);
  // The lumps move the whole layer up and down, by more than its own thickness where it is thin
  float z = (h - plume.g - (n - 0.5) * (0.07 + sigma * 1.5)) / sigma;
  // A thin fresh layer is dense, an old thick one is thin: the same smoke in more air
  float base = min(1.4, plume.r * (0.20 * uSmokeTop / sigma)) * exp(-0.5 * z * z);
  if (base < 0.002) return 0.0;
  // Everything below is a share of the local density, so thin smoke is shaped like thick smoke
  // and no fixed threshold cuts it into islands
  float shape = mix(0.45, 1.30, smoothstep(0.28, 0.72, n));
  // The upper side is eaten into more than the underside (rising lumps, a flatter base)
  shape -= (1.0 - n) * mix(0.10, 0.55, young) * smoothstep(-1.0, 1.6, z);
  if (detailAmount > 0.0) {
    // Finer cellular noise eats into the edges of each billow
    float n2 = texture(uNoiseTex, q * 2.9 + vec3(0.37, uTime * 0.05, 0.11)).g;
    shape -= (1.0 - n2) * mix(0.12, 0.45, young) * detailAmount;
  }
  float d = base * shape;
  if (d <= 0.0) return 0.0;
  // Aged smoke is thin. A level sight line runs through it for kilometres, and at full strength
  // that adds up to a brown veil over everything behind it.
  float dens = d / (d + 0.10) * mix(0.38, 1.0, young);
  // No smoke close to the lens: a plume a few hundred metres from the camera is a blob across
  // the frame, not a plume
  // A real run by day: the smoke is thinned over the detections that feed it, so their light
  // reads through it. Illustrative: real smoke is thickest there.
  if (uThinOverFire > 0.0) {
    dens *= 1.0 - uThinOverFire * smoothstep(0.02, 0.22, textureLod(uSourceTex, uv, 2.2).r);
  }
  if (uClearRadius > 0.0) {
    dens *= smoothstep(uClearRadius * 0.6, uClearRadius, distance(p, uClearCenter));
  }
  if (uLidAmount > 0.0) {
    // The lid passes through the eye, so the fade is over an angle (about two degrees under it)
    float under = -(dot(uLid.xyz, p) + uLid.w) / max(distance(p, uClearCenter), 1e-3);
    dens *= mix(1.0, smoothstep(0.0, 0.05, under), uLidAmount);
  }
  // Smoke thins out where it meets the ground, so it does not end in a hard line on a slope
  // and the fire line under it stays readable
  dens *= smoothstep(0.004, 0.05, p.y - ground.x);
  info = vec4(clamp(h / uSmokeTop, 0.0, 1.0), z, plume.r, plume.a);
  return dens * smokeGate(uv) * uOpacity;
}
`,pp=`
${zh}
uniform vec3 uSunDir;
uniform float uSigma;
varying vec2 vUv;
void main() {
  vec4 ground = smokeGround(vUv);
  vec3 p0 = vec3((vUv.x - 0.5) * uSlabSize.x, ground.x, (0.5 - vUv.y) * uSlabSize.y);
  vec3 sun = normalize(uSunDir);
  // Leave the smoke layer in 24 steps, each texel starting at its own fraction of a step, so the
  // shadow of a thin layer is not a stack of copies of it
  float reach = (uSmokeTop + 0.2) / max(sun.y, 0.12);
  float ds = reach / 24.0;
  float offset = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float tau = 0.0;
  for (int i = 0; i < 24; i++) {
    vec4 info;
    vec3 p = p0 + sun * (ds * (float(i) + offset));
    tau += smokeDensity(p, -1.0, info) * ds;
  }
  gl_FragColor = vec4(exp(-tau * uSigma), 0.0, 0.0, 1.0);
}
`,vp=`
${zh}
uniform sampler2D uDepthTex;
uniform mat4 uProjInv;
uniform mat4 uViewInv;
uniform vec3 uCameraPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSigma;
uniform float uBoxTop;
uniform float uStepFine;  // march step inside a plume, world units
uniform sampler2D uHistoryTex;   // the march result of the previous frame
uniform mat4 uPrevViewProj;
uniform float uHistoryWeight;    // share of the previous result that is kept, 0 without history
uniform float uFrame;
uniform float uNight;          // 1 on a night overpass: moonlight, and the fire lights its own smoke
uniform float uFireLight;      // by night: 1 when the pass on show has detections of its own to light the smoke
uniform float uProxyY;           // height of the middle of the smoke layer, for reprojection
uniform vec2 uHalfSize;
varying vec2 vUv;

const int MAX_STEPS = 84;
const float SMOKE_PEAK_OPACITY = 0.62;

float hgRel(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / pow(max(1e-3, 1.0 + g2 - 2.0 * g * c), 1.5);
}

float ign(vec2 px) {
  return fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715))));
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 far4 = uProjInv * vec4(ndc, 1.0, 1.0);
  vec3 rd = normalize((uViewInv * vec4(normalize(far4.xyz / far4.w), 0.0)).xyz);
  vec3 ro = uCameraPos;

  float depth = texture2D(uDepthTex, vUv).r;
  float sceneDist = 1.0e6;
  if (depth < 0.99999) {
    vec4 sp = uProjInv * vec4(ndc, depth * 2.0 - 1.0, 1.0);
    sceneDist = length(sp.xyz / sp.w);
  }

  // Slab of air that can hold smoke
  vec3 bmin = vec3(-0.5 * uSlabSize.x, 0.0, -0.5 * uSlabSize.y);
  vec3 bmax = vec3(0.5 * uSlabSize.x, uBoxTop, 0.5 * uSlabSize.y);
  vec3 inv = 1.0 / (abs(rd) + 1e-6) * sign(rd + 1e-9);
  vec3 t0 = (bmin - ro) * inv;
  vec3 t1 = (bmax - ro) * inv;
  vec3 tsm = min(t0, t1);
  vec3 tbg = max(t0, t1);
  float tNear = max(max(tsm.x, tsm.y), max(tsm.z, 0.0));
  float tFar = min(min(tbg.x, tbg.y), min(tbg.z, sceneDist));

  vec3 scatter = vec3(0.0);
  float trans = 1.0;

  // Nothing is drawn inside the cleared zone around the camera, so the march starts beyond it
  if (uClearRadius > 0.0) tNear = max(tNear, uClearRadius * 0.6);
  // The lid passes through the eye: a ray that leaves above it stays above it and meets no smoke
  bool underLid = uLidAmount < 0.999 || dot(uLid.xyz, rd) < 0.0;

  if (tFar > tNear && uOpacity > 0.003 && underLid) {
    vec3 sun = normalize(uSunDir);
    float cosT = dot(rd, sun);
    // Forward-peaked phase function blended with an isotropic term (multiple scattering)
    float phase = mix(1.0, min(3.0, hgRel(cosT, 0.6)), 0.45);
    // By night the key light is the moon: the same picture as the moonlit ground, far dimmer
    vec3 sunColor = uSunColor * 0.73 * mix(1.0, 0.045, uNight);

    // Adaptive march: long steps through empty air, short steps where a plume can be
    float fine = uStepFine;
    // The stride through empty air does not shrink with the fine step: clear air needs no detail
    float coarse = max(fine * 5.0, 0.375);
    // The start of the march moves by a different fraction of a step every frame; blended over
    // time (below) the slices of the march average out instead of showing as bands
    float jitter = ign(gl_FragCoord.xy + 5.588238 * mod(uFrame, 64.0));
    // The offset spans one whole step at this distance (steps grow with distance). With a shorter
    // offset the slices only blur, and from the overview they still show as ribs.
    float t = tNear + max(fine, tNear * 0.0068) * jitter;
    bool wasCoarse = false;
    int fineLeft = 0;
    // Length of the last stride through clear air inside a plume region, 0 after a normal step
    float strode = 0.0;

    for (int i = 0; i < MAX_STEPS; i++) {
      if (t >= tFar || trans < 0.02) break;
      vec3 p = ro + rd * t;
      // A blurred copy of the plume map tells whether any smoke can be near this column
      float presence = textureLod(uPlumeTex, smokeUv(p), 4.0).r;
      bool empty = presence < 0.0025;
      if (empty && fineLeft <= 0) {
        t += coarse;
        wasCoarse = true;
        continue;
      }
      if (wasCoarse && !empty) {
        // Entered a plume region with a long step: back up so its near edge is not skipped
        t -= coarse - fine;
        wasCoarse = false;
        fineLeft = 6;
        continue;
      }
      wasCoarse = false;
      fineLeft -= 1;

      float stepLen = max(fine, t * 0.0068);
      vec4 info;
      // Fine detail is dropped with distance, where it is finer than a march step and only adds grain
      float d = smokeDensity(p, 1.0 - smoothstep(5.0, 11.0, t), info);
      // Soft meeting with the terrain behind: the last stretch before the surface thins out, so a
      // peak that pokes through a plume does not cut it with a hard line
      d *= smoothstep(0.0, 0.12, sceneDist - t);
      if (d > 0.002 && strode > 0.0) {
        // A long stride landed inside smoke: go back to one normal step after the last clear
        // sample. Entering a layer at stride spacing would draw it in slices that no start
        // offset could hide.
        t -= strode - stepLen;
        strode = 0.0;
        continue;
      }
      if (d > 0.002) {
        float hn = info.x;
        // Short march toward the sun for self-shadowing (coarse density, no detail noise)
        float tau = 0.0;
        vec4 li;
        float lj = 0.75 + 0.5 * fract(jitter * 7.31 + float(i) * 0.618);
        if (uNight > 0.5) {
          // By night the key light is a twentieth of the sun's: the smoke's own shadow on itself
          // cannot be seen, and its march is the costly part of every step, so it is left out
          tau = 0.0;
        } else if (d > 0.2) {
          tau += smokeDensity(p + sun * (0.05 * lj), -1.0, li) * 0.09;
          tau += smokeDensity(p + sun * (0.17 * lj), -1.0, li) * 0.17;
          tau += smokeDensity(p + sun * (0.42 * lj), -1.0, li) * 0.28;
        } else if (d > 0.07) {
          // Thin smoke adds little to the pixel and the veil of aged smoke covers a lot of ground:
          // one sample toward the sun stands for the three, and the thinnest smoke takes none
          tau = smokeDensity(p + sun * (0.17 * lj), -1.0, li) * 0.54;
        }
        float sunT = exp(-tau * uSigma * 1.5);
        // Light that has scattered many times still gets through thick smoke
        float sunVis = mix(sunT, pow(sunT, 0.3), 0.26);
        // Sky light comes from above: the share of the layer over this point shades it, so a
        // thick plume has a bright top and a dark underside
        float over = info.z / (1.0 + exp(1.7 * info.y));
        float skyVis = exp(-over * 1.9);

        // Brown and absorbing where it is young and dense, grey once it has aged and risen
        float aged = smoothstep(0.10, 0.75, hn) * (1.0 - 0.35 * smoothstep(0.02, 0.2, info.w) * (1.0 - smoothstep(0.1, 0.45, hn)));
        vec3 albedo = mix(vec3(0.30, 0.25, 0.20), vec3(0.64, 0.60, 0.545), aged);
        vec3 skyLight = vec3(0.152, 0.160, 0.176) * (0.50 + 0.50 * skyVis);
        // Light bounced up from the sunlit ground keeps undersides from going black
        skyLight += vec3(0.070, 0.066, 0.058) * (1.0 - skyVis);
        skyLight *= mix(1.0, 0.05, uNight);
        vec3 light = sunColor * sunVis * phase + skyLight;
        // Warm light from the fire scattered inside the base of the column. By night it is the main
        // light the smoke has: it reaches higher into the column and is read from a wider source.
        vec3 fireGlow = vec3(0.0);
        if (hn < mix(0.28, 0.72, uNight)) {
          float src = textureLod(uSourceTex, smokeUv(p), mix(1.5, 2.6, uNight)).r;
          // Smoke lingers from the pass before (see buildDetectionSource), but by night it is lit
          // only by detections that are on show: a pass that shows none leaves it dark
          fireGlow = vec3(1.0, 0.36, 0.08) * src * exp(-hn * uSmokeTop * mix(14.0, 4.6, uNight)) * mix(0.9, 2.1 * uFireLight, uNight);
        }

        float a = 1.0 - exp(-d * uSigma * stepLen);
        scatter += trans * a * (albedo * light + fireGlow);
        trans *= 1.0 - a;
        t += stepLen;
        strode = 0.0;
      } else {
        // Clear air inside a plume region: stride faster so the step budget reaches far smoke
        strode = stepLen * 2.4;
        t += strode;
      }
    }
  }
  // Even the thickest plume lets the ridge behind it show as a silhouette
  scatter *= SMOKE_PEAK_OPACITY;
  trans = 1.0 - SMOKE_PEAK_OPACITY * (1.0 - trans);
  vec4 result = vec4(scatter, trans);
  if (uHistoryWeight > 0.0) {
    // Where this ray crosses the middle of the smoke layer was on screen last frame at prevUv
    float tp = abs(rd.y) > 1e-4 ? (uProxyY - ro.y) / rd.y : tNear;
    tp = clamp(tp, tNear, max(tNear, tFar));
    vec4 clip = uPrevViewProj * vec4(ro + rd * tp, 1.0);
    vec2 prevUv = clip.xy / max(clip.w, 1e-5) * 0.5 + 0.5;
    if (clip.w > 0.0 && prevUv.x > 0.0 && prevUv.x < 1.0 && prevUv.y > 0.0 && prevUv.y < 1.0) {
      // Less history where the picture moves fast, so a moving camera does not leave trails
      float movedPx = length((prevUv - vUv) * uHalfSize);
      float keep = uHistoryWeight * (1.0 - 0.55 * smoothstep(1.0, 9.0, movedPx));
      result = mix(result, texture2D(uHistoryTex, prevUv), keep);
    }
  }
  gl_FragColor = result;
}
`,gp=`
uniform sampler2D uSceneTex;
uniform sampler2D uSmokeTex;
uniform sampler2D uDepthTex;
uniform vec2 uHalfSize;
uniform float uNear;
uniform float uFar;
varying vec2 vUv;

float viewDist(float depth) {
  return (uNear * uFar) / max(1e-6, uFar - depth * (uFar - uNear));
}

void main() {
  vec4 scene = texture2D(uSceneTex, vUv);
  // Most of the frame has no smoke near it: one filtered fetch settles those pixels
  vec4 quick = texture2D(uSmokeTex, vUv);
  if (quick.a > 0.9985 && quick.r + quick.g + quick.b < 0.0015) {
    gl_FragColor = scene;
    return;
  }
  float dC = viewDist(texture2D(uDepthTex, vUv).r);

  // Depth-aware upsample: a 3 x 3 neighborhood of half-res texels, weighted by distance and by
  // how close the depth their ray was marched against is to the depth of this pixel. The wider
  // footprint also averages out the per-pixel jitter of the march.
  vec2 hp = vUv * uHalfSize - 0.5;
  vec2 base = floor(hp + 0.5);
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 texel = clamp(base + vec2(float(i), float(j)), vec2(0.0), uHalfSize - 1.0);
      vec2 tuv = (texel + 0.5) / uHalfSize;
      float dH = viewDist(texture2D(uDepthTex, tuv).r);
      vec2 dpx = texel - hp;
      float ws = exp(-dot(dpx, dpx) * 0.85);
      float wd = 1.0 / (0.02 + abs(dH - dC) / max(dC, 1e-3) * 24.0);
      float w = max(1e-5, ws * wd);
      acc += texture2D(uSmokeTex, tuv) * w;
      wsum += w;
    }
  }
  vec4 smoke = acc / wsum;
  gl_FragColor = vec4(scene.rgb * smoke.a + smoke.rgb, scene.a);
}
`,xp=.62,wp=.88;class Uh extends xa{constructor(){super("SmokePass");F(this,"shadowTarget");F(this,"sourceTarget");F(this,"smokeTarget");F(this,"historyTarget");F(this,"historyValid",!1);F(this,"frame",0);F(this,"lastTime",-1);F(this,"prevViewProj",new to);F(this,"viewProj",new to);F(this,"noiseTexture");F(this,"plumeTarget");F(this,"sourceMaterial");F(this,"plumeMaterial");F(this,"shadowMaterial");F(this,"marchMaterial");F(this,"compositeMaterial");F(this,"densityUniforms");F(this,"lastSourceRenderer",null);F(this,"lastSourceSig",new Float64Array(6).fill(Number.NaN));F(this,"lastPlumeRenderer",null);F(this,"lastPlumeSig",new Float64Array(15).fill(Number.NaN));this.needsDepthTexture=!0,this.needsSwap=!0,this.noiseTexture=up(),this.sourceTarget=new Qt(Zs,Zs,{format:It,type:za,depthBuffer:!1,stencilBuffer:!1,minFilter:Xa,magFilter:Be,generateMipmaps:!0}),this.sourceTarget.texture.colorSpace=Ua,this.plumeTarget=new Qt(Zs,Zs,{format:It,type:za,depthBuffer:!1,stencilBuffer:!1,minFilter:Xa,magFilter:Be,generateMipmaps:!0}),this.plumeTarget.texture.colorSpace=Ua,this.shadowTarget=new Qt(Zs,Zs,{format:It,type:Ot,depthBuffer:!1,stencilBuffer:!1,minFilter:Be,magFilter:Be,generateMipmaps:!1}),this.shadowTarget.texture.colorSpace=Ua;const a=()=>new Qt(2,2,{format:It,type:za,depthBuffer:!1,stencilBuffer:!1,minFilter:Be,magFilter:Be,generateMipmaps:!1});this.smokeTarget=a(),this.historyTarget=a(),this.densityUniforms={uHeightPrev:{value:null},uHeightNext:{value:null},uMorph:{value:1},uSourceTex:{value:this.sourceTarget.texture},uPlumeTex:{value:this.plumeTarget.texture},uNoiseTex:{value:this.noiseTexture},uSlabSize:{value:new Le(14.8,10.8)},uSmokeTop:{value:xp},uWindUv:{value:new Le(.7,.7)},uTime:{value:0},uOpacity:{value:1},uCutawayMix:{value:0},uCutawayPlane:{value:0},uCutawayDir:{value:new Le(1,0)},uClearCenter:{value:new W},uClearRadius:{value:0},uThinOverFire:{value:0},uLid:{value:new pa(0,1,0,-1e4)},uLidAmount:{value:0},uSunDir:{value:new W(0,1,0)},uSigma:{value:4.6}};const s={depthTest:!1,depthWrite:!1,toneMapped:!1};this.sourceMaterial=new Et({...s,vertexShader:Yo,fragmentShader:fp,uniforms:{uField0:{value:null},uField1:{value:null},uDetection0:{value:null},uDetection1:{value:null},uRealSource:{value:0},uFrameMix:{value:0}}}),this.plumeMaterial=new Et({...s,vertexShader:Yo,fragmentShader:mp,uniforms:{uSourceTex:this.densityUniforms.uSourceTex,uHeightPrev:this.densityUniforms.uHeightPrev,uHeightNext:this.densityUniforms.uHeightNext,uMorph:this.densityUniforms.uMorph,uWindUv:this.densityUniforms.uWindUv,uSmokeTop:this.densityUniforms.uSmokeTop,uSlabSize:this.densityUniforms.uSlabSize,uLid:this.densityUniforms.uLid,uLidAmount:this.densityUniforms.uLidAmount}}),this.shadowMaterial=new Et({...s,vertexShader:Yo,fragmentShader:pp,uniforms:this.densityUniforms}),this.marchMaterial=new Et({...s,vertexShader:Yo,fragmentShader:vp,uniforms:{...this.densityUniforms,uDepthTex:{value:null},uProjInv:{value:new to},uViewInv:{value:new to},uCameraPos:{value:new W},uBoxTop:{value:4},uSunColor:{value:new W(1.4,1.29,1.17)},uNight:{value:0},uFireLight:{value:1},uStepFine:{value:.075},uHistoryTex:{value:null},uPrevViewProj:{value:new to},uHistoryWeight:{value:0},uFrame:{value:0},uProxyY:{value:1},uHalfSize:{value:new Le(2,2)}}}),this.compositeMaterial=new Et({...s,vertexShader:Yo,fragmentShader:gp,uniforms:{uSceneTex:{value:null},uSmokeTex:{value:this.smokeTarget.texture},uDepthTex:{value:null},uHalfSize:{value:new Le(2,2)},uNear:{value:.1},uFar:{value:100}}}),this.fullscreenMaterial=this.compositeMaterial}setDepthTexture(a){this.marchMaterial.uniforms.uDepthTex.value=a,this.compositeMaterial.uniforms.uDepthTex.value=a}setSize(a,s){const o=Math.max(2,Math.ceil(a/2)),i=Math.max(2,Math.ceil(s/2));this.smokeTarget.setSize(o,i),this.historyTarget.setSize(o,i),this.historyValid=!1,this.compositeMaterial.uniforms.uHalfSize.value.set(o,i),this.marchMaterial.uniforms.uHalfSize.value.set(o,i)}update(a){const s=this.densityUniforms;s.uHeightPrev.value=a.heightPrev,s.uHeightNext.value=a.heightNext,s.uMorph.value=a.morph,s.uSlabSize.value.set(a.slabWidth,a.slabDepth),s.uWindUv.value.copy(a.windUv).normalize(),s.uTime.value=a.time,s.uLid.value.copy(a.lid),s.uLidAmount.value=a.lidAmount,s.uClearCenter.value.setFromMatrixPosition(a.camera.matrixWorld),s.uClearRadius.value=a.clearRadius,s.uThinOverFire.value=a.thinOverFire,s.uOpacity.value=a.opacity,s.uCutawayMix.value=a.cutawayMix,s.uCutawayPlane.value=a.cutawayPlane,s.uCutawayDir.value.copy(a.cutawayDir),s.uSunDir.value.copy(a.sunDir);const o=this.sourceMaterial.uniforms;o.uField0.value=a.field0,o.uField1.value=a.field1,o.uDetection0.value=a.detection0??a.field0,o.uDetection1.value=a.detection1??a.field1,o.uRealSource.value=a.detection0&&a.detection1?1:0,o.uFrameMix.value=a.frameMix;const i=this.marchMaterial.uniforms,l=a.camera;i.uProjInv.value.copy(l.projectionMatrixInverse),i.uViewInv.value.copy(l.matrixWorld),i.uCameraPos.value.setFromMatrixPosition(l.matrixWorld),i.uSunColor.value.copy(a.sunColor),i.uNight.value=a.night??0,i.uFireLight.value=a.fireLight??1,i.uBoxTop.value=a.reliefTop+s.uSmokeTop.value+.05,i.uProxyY.value=.5*(a.reliefTop+s.uSmokeTop.value),(this.lastTime<0||a.time-this.lastTime>.25||a.time<this.lastTime)&&(this.historyValid=!1),this.lastTime=a.time,i.uPrevViewProj.value.copy(this.prevViewProj),this.viewProj.multiplyMatrices(l.projectionMatrix,l.matrixWorldInverse),this.prevViewProj.copy(this.viewProj),i.uHistoryWeight.value=this.historyValid?wp:0,i.uFrame.value=this.frame,this.frame=(this.frame+1)%4096;const h=this.compositeMaterial.uniforms;h.uNear.value=l.near,h.uFar.value=l.far}render(a,s,o){const i=this.scene,l=this.camera,h=this.sourceMaterial.uniforms,r=h.uRealSource.value>.5?1:0,u=r?h.uDetection0.value:h.uField0.value,d=r?h.uDetection1.value:h.uField1.value,p=u?u.id:-1,M=u?u.version:-1,b=d?d.id:-1,g=d?d.version:-1,A=h.uFrameMix.value,R=this.lastSourceSig,w=this.lastSourceRenderer!==a||R[0]!==r||R[1]!==p||R[2]!==M||R[3]!==b||R[4]!==g||R[5]!==A;w&&(this.fullscreenMaterial=this.sourceMaterial,a.setRenderTarget(this.sourceTarget),a.render(i,l),this.lastSourceRenderer=a,R[0]=r,R[1]=p,R[2]=M,R[3]=b,R[4]=g,R[5]=A);const x=this.densityUniforms,S=x.uMorph.value,_=S<.999?S:1,B=S<.999?x.uHeightPrev.value:null,I=x.uHeightNext.value,P=B?B.id:-1,U=B?B.version:-1,G=I?I.id:-1,k=I?I.version:-1,V=x.uWindUv.value,Z=x.uSmokeTop.value,ge=x.uSlabSize.value,we=x.uLidAmount.value,Re=we>0?we:0,be=x.uLid.value,Me=Re>0?be.x:0,pe=Re>0?be.y:0,ht=Re>0?be.z:0,ce=Re>0?be.w:0,ae=this.lastPlumeSig;(w||this.lastPlumeRenderer!==a||ae[0]!==P||ae[1]!==U||ae[2]!==G||ae[3]!==k||ae[4]!==_||ae[5]!==V.x||ae[6]!==V.y||ae[7]!==Z||ae[8]!==ge.x||ae[9]!==ge.y||ae[10]!==Re||ae[11]!==Me||ae[12]!==pe||ae[13]!==ht||ae[14]!==ce)&&(this.fullscreenMaterial=this.plumeMaterial,a.setRenderTarget(this.plumeTarget),a.render(i,l),this.lastPlumeRenderer=a,ae[0]=P,ae[1]=U,ae[2]=G,ae[3]=k,ae[4]=_,ae[5]=V.x,ae[6]=V.y,ae[7]=Z,ae[8]=ge.x,ae[9]=ge.y,ae[10]=Re,ae[11]=Me,ae[12]=pe,ae[13]=ht,ae[14]=ce),this.fullscreenMaterial=this.shadowMaterial,a.setRenderTarget(this.shadowTarget),a.render(i,l);const At=this.smokeTarget;this.smokeTarget=this.historyTarget,this.historyTarget=At,this.marchMaterial.uniforms.uHistoryTex.value=this.historyTarget.texture,this.fullscreenMaterial=this.marchMaterial,a.setRenderTarget(this.smokeTarget),a.render(i,l),this.historyValid=!0,this.compositeMaterial.uniforms.uSmokeTex.value=this.smokeTarget.texture,this.compositeMaterial.uniforms.uSceneTex.value=s.texture,this.fullscreenMaterial=this.compositeMaterial,a.setRenderTarget(this.renderToScreen?null:o),a.render(i,l)}dispose(){this.lastSourceRenderer=null,this.lastSourceSig.fill(Number.NaN),this.lastPlumeRenderer=null,this.lastPlumeSig.fill(Number.NaN),this.sourceTarget.dispose(),this.plumeTarget.dispose(),this.shadowTarget.dispose(),this.smokeTarget.dispose(),this.historyTarget.dispose(),this.noiseTexture.dispose(),this.sourceMaterial.dispose(),this.plumeMaterial.dispose(),this.shadowMaterial.dispose(),this.marchMaterial.dispose(),this.compositeMaterial.dispose()}}F(Uh,"sourceGrid",We);const al=2,Ou=Qo*Jo,Mp=.62,yp=1.75;function bp(e,t){const a=Math.max(1,e),s=Math.max(1,t),o=Math.min(yp,Math.max(Mp,a/s)),i=Math.sqrt(Ou*o),l=Ou/i,h=i/(a*1e3),r=l/(s*1e3),u=Math.sqrt(h*r)*al;return{width:i,depth:l,unitsPerMetre:[h,u,r]}}function Sp(e,t,a,s){const o=Math.max(350,a-t);return Math.min(o*1.15,Math.max(0,e-t))*s.unitsPerMetre[1]}const Hu=.08,Tp=.3,Ep=3;function $o(e){if(!e)return null;const{left:t,top:a,right:s,bottom:o}=e;if(![t,a,s,o].every(u=>Number.isFinite(u)))return null;const i=Math.min(1,Math.max(0,Math.min(t,s))),l=Math.min(1,Math.max(0,Math.max(t,s))),h=Math.min(1,Math.max(0,Math.min(a,o))),r=Math.min(1,Math.max(0,Math.max(a,o)));return l-i<Hu||r-h<Hu?null:{left:i,top:h,right:l,bottom:r}}function Ir(e,t){return e===t?!0:!e||!t?!1:Math.abs(e.left-t.left)<1e-5&&Math.abs(e.top-t.top)<1e-5&&Math.abs(e.right-t.right)<1e-5&&Math.abs(e.bottom-t.bottom)<1e-5}const Tt=new ll,va=new W,Bt=new W,Wi=new W,Ps=new W;function Rp(e,t,a,s,o,i,l,h){let r=Number.POSITIVE_INFINITY,u=Number.NEGATIVE_INFINITY,d=Number.POSITIVE_INFINITY,p=Number.NEGATIVE_INFINITY;Tt.fov=o,Tt.aspect=i,Tt.near=.1,Tt.far=200,Tt.clearViewOffset(),Tt.updateProjectionMatrix(),va.set(a.target[0],a.target[1],a.target[2]);const M=s>1e-4?[-s,0,s]:[0];for(const _ of M){const B=a.azimuth+_,I=Math.sin(a.polar);Tt.position.set(va.x+a.distance*I*Math.sin(B),va.y+a.distance*Math.cos(a.polar),va.z+a.distance*I*Math.cos(B)),Tt.up.set(0,1,0),Tt.lookAt(va),Tt.updateMatrixWorld(!0);for(let P=0;P<t;P++)Bt.set(e[P*3],e[P*3+1],e[P*3+2]).project(Tt),!(Bt.z>=1||Bt.z<=-1)&&(Bt.x<r&&(r=Bt.x),Bt.x>u&&(u=Bt.x),Bt.y<d&&(d=Bt.y),Bt.y>p&&(p=Bt.y))}if(!(u>r)||!(p>d))return h.scale=1,h.offsetX=0,h.offsetY=0,h;const b=(u-r)*.5,g=(p-d)*.5,A=(r+u)*.25+.5,R=.5-(d+p)*.25,w=l.right-l.left,x=l.bottom-l.top,S=Math.min(Ep,Math.max(Tp,Math.min(w/b,x/g)));return h.scale=S,h.offsetX=A*S-(l.left+l.right)*.5,h.offsetY=R*S-(l.top+l.bottom)*.5,h}const Ap=.24,_p=.46,Bh=.03;function Oh(e){return Math.min(_p,Math.max(Ap,e.bottom+Bh))}function kp(e,t,a,s){Tt.fov=a,Tt.aspect=s,Tt.near=.1,Tt.far=200,Tt.clearViewOffset(),Tt.updateProjectionMatrix(),va.set(e.target[0],e.target[1],e.target[2]);const o=Math.sin(e.polar);Tt.position.set(va.x+e.distance*o*Math.sin(t),va.y+e.distance*Math.cos(e.polar),va.z+e.distance*o*Math.cos(t)),Tt.up.set(0,1,0),Tt.lookAt(va),Tt.updateMatrixWorld(!0)}function Fp(e,t,a,s,o,i,l,h){let r=Number.POSITIVE_INFINITY;const u=s>1e-4?[-s,0,s]:[0];for(const p of u){kp(a,a.azimuth+p,o,i);for(let M=0;M<t;M++){if(Bt.set(e[M*3],e[M*3+1],e[M*3+2]).project(Tt),Bt.z>=1||Bt.z<=-1)continue;const b=Bt.x*.5+.5;if(b<l.left-.04||b>l.right+.04)continue;const g=.5-Bt.y*.5;g<r&&(r=g)}}if(h.scale=1,h.offsetX=0,!Number.isFinite(r))return h.offsetY=0,h;const d=Oh(l);return h.offsetY=Math.min(.1,Math.max(-.42,r-d)),h}function Dp(e){return Math.min(e.bottom,Oh(e)-Bh)}function Pp(e,t,a){const s=1-2*t;return Bt.set(-1,s,.5).unproject(e),va.set(1,s,.5).unproject(e),Wi.setFromMatrixPosition(e.matrixWorld),Bt.sub(Wi),va.sub(Wi),Ps.crossVectors(va,Bt).normalize(),Ps.y<0&&Ps.negate(),a.set(Ps.x,Ps.y,Ps.z,-Ps.dot(Wi))}function Ip(e,t,a,s){if(Math.abs(s.scale-1)<4e-4&&Math.abs(s.offsetX)<4e-4&&Math.abs(s.offsetY)<4e-4){e.view!==null&&e.view.enabled&&e.clearViewOffset();return}e.setViewOffset(t*s.scale,a*s.scale,s.offsetX*t,s.offsetY*a,t,a)}const Gu=St.azimuth,Cp=.62,Vi=30,Yi=.055,Lp=[3.6,5,6.5,8],Np=[90,180,300,450,650,900],zp=2,Up=2.5,Bp=.05,Op=.6,Cr=.14,Qs=150,Ku=.3,Hp=.03,Ca=19,Gp=1.7,Kp=.6,Wu={left:0,top:0,right:1,bottom:.34},Wp=4,Js=33,eo=48,Vp=3.2,$i=1.15,Vu=6;function Yp(e,t,a,s){return s.set(-t*Math.cos(e),-a*Math.sin(e)).normalize()}const Yu=4,$p=4.4,jp=4.6,Xp=3.5,qp=3.2,Zp=111.32;function Lr(e){return Math.max(1,(e[3]-e[1])*Zp)}const $u=-.11,Qp=.065,no=13,Hh=5,Jp=no*no+4+Hh,Is=24;function ev(e){const t=e==null?void 0:e.held_out_passes_answered_by;return typeof(t==null?void 0:t.method)=="string"&&t.method!=="reconstruction"}let Nr=null;function zr(){return Nr||(Nr=new Uint8Array(oo*We*We*4)),Nr}function Ur(){return{source:"procedural_fallback",provenanceNote:"No run on show.",frames:Array.from({length:oo},()=>[])}}function tv(){const e=new ta(new Uint8Array([104,106,102,255]),1,1,It);return e.colorSpace=ut,e.needsUpdate=!0,e}function ju(e){return e.noRealGround?!1:(e.levelIsWater===void 0&&(e.levelIsWater=!ul(e.alignedDem,e.demGridRes)),e.levelIsWater)}function av(e){const t=e.toUpperCase();return t.includes("TERRA")?"MODIS_TERRA":t.includes("AQUA")?"MODIS_AQUA":t.includes("NOAA20")||t.includes("NOAA-20")||t.includes("JPSS")?"VIIRS_NOAA20":t.includes("SNPP")||t.includes("NPP")?"VIIRS_SNPP":null}function Xu(){if(typeof window>"u")return null;const e=new URLSearchParams(window.location.search).get("film");return e==="record"||e==="estimate"||e==="test"||e==="play"||e==="turn"||e==="auto"?e:null}function sv(e,t){const a=e.runId!==null&&t.has(e.runId);if(!e.missingFiles&&!a)return;const s=(e.missingFiles??[]).filter(i=>!(e.pack&&(i==="elevation"||i==="imagery"))),o=a?[...s,"estimate"]:s;return o.length>0?o:void 0}const ov=[];function Br(e){return e.observerDataset.dataSource==="firms"?ov:e.callouts}function iv(e){const t=e.fieldScale??ao;return{scale:t.kind==="linear"?"linear":"log",ticks:t.ticks??[0,.25,.5,.75,1].map(a=>({at:a,mwPerKm2:gh(t,a)}))}}const nv=2.6,rv=9,lv=6,cv=9.5,qu=.08,Or=8,uv=1,hv=1.8,dv=.05,Zu=12,Hr=.12,Qu=9,fv=1.22,Gr=.94,mv=5,Ju=1.5,pv=5,eh=2,th=.8,Kr=3,Wr=22,ah=.75,sh=[1.1,.95,.8,.65],Vr=39,oh=.375,ih=.3,vv=.4,nh=.43,gv=3,xv=.3,wv=24*3600*1e3,Mv=5,yv=.25,bv=50,Yr=.4,Sv=60,$r=[.04,.22,.34,.86,.96,1],Tv=6,rh=.375,Ev=1.3,Rv=1.9,Av=.044,_v=1.08,kv=1.8,Fv=2,Dv=e=>typeof e=="number"&&e>0?D.clamp(Math.pow(Math.max(1,Av/e/_v),kv),1,Fv):1,Pv=[.64,.76],Iv=.7,Cv=1.2,Lv=.02,Nv=0,zv=1;function Uv(e,t){return e.kind==="linear"?t.set(.02,1):t.set(Qi(e,zv),1)}const Bv=4,Ov=2500;function Hv(e,t){return e.kind==="linear"?t.set(.02,1):t.set(Qi(e,Bv),Qi(e,Ov))}const Gv=.45;function Kv(e,t,a,s){if(e.dataSource!=="firms")return null;const[o,i,l,h]=t,r=Gv*Math.min(a,s);let u=-1,d=-1;return e.frames.forEach((p,M)=>{let b=0,g=!1,A=!1;const R=[],w=[];for(const P of p)if(!P.hidden){b+=P.footprints.length,P.family==="viirs"&&P.isDay===!1&&(g=!0),P.isDay===!1&&P.footprints.length>0&&(A=!0);for(const U of P.footprints)R.push((U.lon-o)/Math.max(1e-9,l-o)*a),w.push((U.lat-i)/Math.max(1e-9,h-i)*s)}if(b===0)return;R.sort((P,U)=>P-U),w.sort((P,U)=>P-U);const x=Math.floor(.05*(b-1)),S=Math.ceil(.95*(b-1)),B=Math.hypot(R[S]-R[x],w[S]-w[x])<=r,I=b+(A?1e5:0)+(A&&B?2e5:0)+(g?1e6:0)+(g&&B?1e7:0);I>d&&(d=I,u=M)}),u>=0?u:null}function Wv(e){var s;const t=e.attribution,a=((s=e.context)==null?void 0:s.manifest.ortho.attribution)??"";return a&&a!==t?t?`${t}; ${a}`:a:t}function lh(e){return ds.includes(e)}function La(e,t){return e.resolveAsset?e.resolveAsset(t):Vv(e.apiBase,t)}function ch(e){return`/isogon/${e}`}function Vv(e,t){if(t.startsWith("http://")||t.startsWith("https://")||t.startsWith("data:"))return t;const a=e.replace(/\/+$/,"");return t.startsWith("/")?`${a}${t}`:`${a}/${t}`}function jo(e,t,a,s){const o=Math.min(1,Math.max(0,a))*(t-1),i=Math.min(1,Math.max(0,s))*(t-1),l=Math.floor(o),h=Math.floor(i),r=Math.min(t-1,l+1),u=Math.min(t-1,h+1),d=o-l,p=i-h,M=e[h*t+l],b=e[h*t+r],g=e[u*t+l],A=e[u*t+r],R=M+(b-M)*d,w=g+(A-g)*d;return R+(w-R)*p}const Yv=new W(.075,.098,.135),Gh=new W(-.56,.64,.52).normalize();function $v(e,t,a){const s=Rh(a),o=s?s.extent_km[0]:e,i=s?s.extent_km[1]:t,l=bp(o,i),h=Gh.clone(),[r,u,d]=l.unitsPerMetre,p=new W(h.x/r,h.y/u,h.z/d).normalize();return s&&(Uf(s.sun.azimuth_deg,s.sun.elevation_deg,p),Bf(p,new W(r,u,d),h)),{widthKm:o,depthKm:i,frame:l,sunDir:h,sunTrue:p,packManifest:s}}const uh="Esri, Vantor, Earthstar Geographics, and the GIS User Community";function jr(e,t,a,s,o){const i=$v(e,t,a),l=i.widthKm/Math.max(64,s);return{widthKm:i.widthKm,depthKm:i.depthKm,frame:i.frame,sunDir:i.sunDir,sunTrue:i.sunTrue,orthoTexelKm:l,sharpen:1,shadow:null,packManifest:i.packManifest,packState:"none",pack:null,lite:null,context:null,contextState:"none",auxTex:null,detailTex:null,detailRect:[0,0,1,1],detailTexelKm:l,attribution:o}}function Cs(e,t){return Sp(e,t.minElevM,t.maxElevM,t.frame)}function Xr(e,t,a,s,o,i){return mf(e,t,o,i,{gridSize:We,zMaxMwKm2:tf,sigmaMaxMwKm2:af},(l,h)=>jo(a,s,l,h))}function Qv(e){const t=Pt.useRef(null),a=Pt.useRef(null),s=Pt.useRef(null),o=Pt.useRef([null,null,null]),i=Pt.useRef([null,null,null]),l=Pt.useRef([null,null,null]),h=Pt.useRef(null),r=Pt.useRef(null),u=Pt.useRef(null),[d,p]=Pt.useState([]),M=Pt.useRef(new Map),b=Pt.useRef(new Set),g=Pt.useRef(e);g.current=e;const A=Pt.useRef(null);Pt.useEffect(()=>{const x=t.current;if(!x)return;let S=!1;if(!fd())throw new iu("unavailable");let _;try{_=new Id({antialias:!1,alpha:!1,depth:!1,powerPreference:"high-performance",stencil:!1})}catch(n){throw new iu("failed",n)}const B=O0(U0());let I=Lu();_.setPixelRatio(I),_.setClearColor(new Zi("#080b11"),1),_.domElement.style.width="100%",_.domElement.style.height="100%",_.domElement.style.display="block",x.appendChild(_.domElement);const P=Math.min(16,_.capabilities.getMaxAnisotropy()||4),U=new Cd;U.setCrossOrigin("anonymous");const G=new po,k=new ll(39,16/9,.12,140),V=new P0(_,G,k),Z=new Uh;V.insertScenePass(Z);const ge=new Set,we=n=>(n.smokeHeight||(n.smokeHeight=dp(n.alignedDem,n.demGridRes,f=>Cs(f,n),n.frame.width,n.frame.depth),ge.add(n.smokeHeight)),n.smokeHeight);let Re=1,be=0;const Me=Gh.clone(),pe=new Ld(16775922,$p);pe.position.copy(Me).multiplyScalar(20),G.add(pe);const ht=sp(_);G.environment=ht.texture;const ce=new Map,ae=new Map;for(const n of ds){const f=Xo[n],v=ru(n,256),c=Ls(v,!1),E=lu(n,c.aligned,c.gridRes,c.minElev,c.maxElev,P),y=zr(),C=Xr(n,f.bbox,c.aligned,c.gridRes,y,oo);ce.set(n,{key:`proc-${n}`,regionId:n,runId:null,noRealGround:!0,noRealPicture:!0,demTex:c.texture,alignedDem:c.aligned,demGridRes:c.gridRes,minElevM:c.minElev,maxElevM:c.maxElev,satTex:E,orthoLabel:"drawn stand-in",demLabel:"512²",tensor:y,frameCount:oo,bbox:[...f.bbox],windDirUv:[...f.windDirUv],hasSeaCoast:f.hasSeaCoast,observerDataset:Ur(),findings:C.anchors,callouts:C.callouts,fireHistory:null,...jr(f.widthKm,Lr(f.bbox),null,512,"")})}const Rt=_.extensions.has("OES_texture_float_linear"),At=n=>(n.fireHistory||(n.fireHistory=Hf(n.tensor,n.frameCount,Rt)),n.fireHistory),Ht=g.current.activeTheaterId;let ie=ce.get(Ht)??ce.get("plumas_ca"),m=ie;const Oe=[],tt=n=>{n&&!Oe.includes(n)&&Oe.push(n)},ia=()=>{const n=new Set,f=v=>{v&&(n.add(v),v.lite&&n.add(v.lite))};f(ie),f(m);for(const v of ce.values())f(v);for(const v of ae.values())f(v);for(const v of ra.values())f(v);return n},aa=()=>{var c,E;if(Oe.length===0)return;const n=ia(),f=new Set;for(const y of n)f.add(y.demTex),f.add(y.satTex),f.add((c=y.fireHistory)==null?void 0:c.texture),f.add(y.shadow),f.add(y.smokeHeight);const v=y=>{!y||f.has(y)||(f.add(y),y.dispose())};for(const y of Oe)n.has(y)||(v(y.demTex),v(y.satTex),v((E=y.fireHistory)==null?void 0:E.texture),v(y.shadow),y.smokeHeight&&(ge.delete(y.smokeHeight),v(y.smokeHeight)),y.fireHistory=null,y.shadow=null,y.smokeHeight=null,y.detectionSource=null);for(let y=Oe.length-1;y>=0;y--){const C=Oe[y];C===ie||C===m||C===ie.lite||C===m.lite||Oe.splice(y,1)}},_t=(n,f)=>{const v=ce.get(n);ce.set(n,f),v&&v!==f&&tt(v)},na=n=>{const f=ae.get(n);return f&&(ae.delete(n),ae.set(n,f)),f},ca=(n,f,v)=>{for(_t(n,v),ae.set(f,v);ae.size>Wp;){const c=ae.keys().next().value,E=ae.get(c);ae.delete(c),tt(E)}};p(Br(m));const Ne=new Uint8Array(We*We*4),it=new Uint8Array(We*We*4),dt=n=>{const f=new ta(n,We,We,It,Ot);return f.minFilter=Xa,f.magFilter=Be,f.generateMipmaps=!0,f.wrapS=Ve,f.wrapT=Ve,f.flipY=!1,f.needsUpdate=!0,f},wa=dt(Ne),ua=dt(it),je=of();let Gt=-1,cn=-1,xo=null;const wo=We*We,fl=()=>{const n=new ta(new Uint8Array(wo),We,We,hh,Ot);return n.minFilter=Be,n.magFilter=Be,n.generateMipmaps=!1,n.flipY=!1,n.needsUpdate=!0,n},ti=fl(),ai=fl();let ml="",pl="";const Kh=(n,f,v)=>{const c=n.detectionSource??(n.detectionSource=dm(n.observerDataset.frames,n.frameCount,n.bbox,[n.widthKm,n.depthKm],We)),E=`${n.key}:${f}`;E!==ml&&(ti.image.data.set(c.subarray(f*wo,(f+1)*wo)),ti.needsUpdate=!0,ml=E);const y=`${n.key}:${v}`;y!==pl&&(ai.image.data.set(c.subarray(v*wo,(v+1)*wo)),ai.needsUpdate=!0,pl=y)},si=new cm,ha=new fm,vl=M.current,gl={value:0},un={value:0},xl={value:0},wl={value:0},Ml=new pa(1,1,0,0),yl=new Le(1,1);let ms=null,Aa=null,bl=null,hn=null,ps=0;const Wh=n=>{var E,y;const f=Math.round(((E=n.grid)==null?void 0:E.nx)??0),v=Math.round(((y=n.grid)==null?void 0:y.ny)??0);if(!(f>0&&v>0&&f*v<=4e6)||typeof n.day_png!="string")return;const c=new Image;c.onload=()=>{if(S||ms!==n)return;const C=document.createElement("canvas");C.width=f,C.height=v;const Q=C.getContext("2d",{willReadFrequently:!0});if(!Q)return;Q.drawImage(c,0,0,f,v);const q=Q.getImageData(0,0,f,v).data,oe=new Uint8Array(f*v);for(let te=0;te<v;te++)for(let re=0;re<f;re++)oe[(v-1-te)*f+re]=q[(te*f+re)*4];const se=Date.parse(/T/.test(n.span.start)?n.span.start:`${n.span.start}T00:00:00Z`),Se=xf(oe,se,Date.parse(n.window.start),Date.parse(n.window.end)),he=new Uint8Array(f*v*4);for(let te=0;te<f*v;te++)he[te*4]=Se[te]*64,he[te*4+1]=oe[te],he[te*4+3]=255;const ne=new ta(he,f,v,It,Ot);ne.magFilter=vo,ne.minFilter=vo,ne.generateMipmaps=!1,ne.needsUpdate=!0,Aa==null||Aa.dispose(),Aa=ne,bl=n,hn=wf(n.box,f,v,n.grid.cell_km??.375,n.grid.bounds??null),yl.set(f,v)},c.src=n.day_png},Sl={value:0};let dn=null,Tl="";const fn=new Le(0,0),El=Array.from({length:64},()=>new pa(0,0,0,0)),mn={value:-1};let oi=null,pn="";const Rl=(n,f,v,c)=>{let E=1/0,y=1/0,C=-1/0,Q=-1/0,q=0,oe=0,se=!1;for(let he=0;he<=2;he++)for(let ne=0;ne<=2;ne++){const te=D.clamp(n+(f-n)*ne/2,0,1),re=D.clamp(v+(c-v)*he/2,0,1);et.set($t(te),Mt(te,re),jt(re)).project(k);const de=et.z>-1&&et.z<1,ze=(et.x*.5+.5)*nt,at=(-et.y*.5+.5)*ct;ne===1&&he===1&&(q=ze,oe=at,se=de),de&&(E=Math.min(E,ze),y=Math.min(y,at),C=Math.max(C,ze),Q=Math.max(Q,at))}if(!Number.isFinite(E))return null;const Se=se&&q>=0&&q<=nt&&oe>=0&&oe<=ct;return{x:q,y:oe,left:E,top:y,right:C,bottom:Q,visible:Se}},vn=[];let gn=1;const qa=new pa(0,1,0,0);let Al=-1e9,_l="",xn=[];const kl=new Le(0,0),Fl=new W(0,ao.maxMwKm2,ao.minMwKm2),Dl=new Le(.02,1),ii=new Le(.02,1),Pl={value:0},Hs=new Le(0,0),wn={value:0},Mn={value:0},Il={value:1},ni=new Map;let ri=!1,yn;const vs=new pa(0,1,1e4,.4),Cl=new Le(-1,1);let Ll=0,Nl=0,zl=-1e9;const bn={value:0},Za={value:0};let Sn="",Gs=[],li=0,ci=0,Tn=!1,Mo,Ul="",Bl="",Ol=!1;const En={value:0},yo={value:1};let Rn,gs="";const Qa=[],xs=[],ui=[],bo={value:0},Ja={value:1},An={value:0};let Hl="",Gl=!1,hi,So="",To="detections",ft=new Float32Array(0),ws={patchOf:new Uint16Array(0),sizes:[]};const Qe=new Float64Array(Or*7),Ms=new Float64Array(Or*3);let Eo=!1,di="";const Jt=new Float64Array(38).fill(Number.NaN);let da=null;const Kl=(n,f,v)=>{const E=Math.min(1,Math.max(0,v))*Math.max(1,f-1),y=Math.min(f-1,Math.floor(E)),C=Math.min(f-1,y+1),Q=E-y,q=We*We*4;return(xo!==n||Gt!==y)&&(Ne.set(n.subarray(y*q,(y+1)*q)),wa.needsUpdate=!0,Gt=y),(xo!==n||cn!==C)&&(it.set(n.subarray(C*q,(C+1)*q)),ua.needsUpdate=!0,cn=C),xo=n,Q},Vh=Kl(m.tensor,m.frameCount,g.current.timeProgress),Ro=new ef,fi=m.sunTrue.clone(),_n=new W(1.4,1.29,1.17),Wl=new W(.9,.8,.66),Vl=n=>{const f=(n.minElevM+n.maxElevM)*5e-4;fi.copy(n.sunTrue),jd(f,n.sunTrue.y,_n),Wl.fromArray(yh(f,n.sunTrue.y))};Vl(m);const Yl={value:0},es={uNight:Yl,uSkyView:{value:Ro.skyView.texture},uTransmittanceLut:{value:Ro.transmittance},uSunTrue:{value:fi},uCamAltKm:{value:8},uVerticalExaggeration:{value:al},uFloorColor:{value:new W(.044,.06,.094)},uFloorHaze:{value:.3},uSkyExposure:{value:vr}},$l=new ph(62,48,32),jl=new Et({vertexShader:Qd,fragmentShader:Jd,uniforms:es,side:so,depthWrite:!1}),kn=new Sa($l,jl);kn.renderOrder=-10,G.add(kn);const Fn=new Le(m.frame.width,m.frame.depth),Xl=new Le(ie.frame.unitsPerMetre[1],m.frame.unitsPerMetre[1]),Dn=new tn(34,34,1,1);Dn.rotateX(-Math.PI/2);const Pn=new Et({vertexShader:lf,fragmentShader:cf,uniforms:{uSlabSize:{value:Fn},uShadowMix:{value:1}},transparent:!0,depthWrite:!1}),mi=new Sa(Dn,Pn);mi.position.y=Us-.005,mi.renderOrder=-2,G.add(mi);const ql=Yp(Gu,m.frame.width,m.frame.depth,new Le),Zl=new Le(ie.demGridRes,m.demGridRes),Ql=new Le(ie.minElevM,ie.maxElevM),Jl=new Le(m.minElevM,m.maxElevM),ec=new Le(m.widthKm,m.depthKm),tc=new pa(1,0,0,0),ac=new pa(1,0,0,0),sc=new pa(0,0,0,0),Ao={...wu},_o={...wu},In=new Le(m.windDirUv[0],m.windDirUv[1]),oc=new W(...m.frame.unitsPerMetre),ic=new pa(0,0,1,1),nc=(n,f,v,c)=>{const E=new ta(new Uint8Array([n,f,v,c]),1,1,It,Ot);return E.needsUpdate=!0,E},Cn=nc(128,128,255,0),Ln=nc(255,255,255,255),rc=new L0(_),lc=n=>(n.shadow||(n.shadow=rc.bake(n.demTex,n.demGridRes,n.minElevM,n.maxElevM,n.frame.unitsPerMetre[1],n.frame.width,n.frame.depth,n.sunDir,n.demGridRes>=1024?2048:1024)),n.shadow.texture),cc=n=>{const f=N0(n),v=new an;return v.setAttribute("position",new ga(f.position,3)),v.setAttribute("normal",new ga(f.normal,3)),v.setAttribute("uv",new ga(f.uv,2)),v.setIndex(new ga(f.index,1)),v.boundingSphere=new dh(new W(0,1,0),15),v},Nn=cc(Sh);let ys=null,ko=null;const L={uDemPrev:{value:ie.demTex},uDemNext:{value:m.demTex},uDemRes:{value:Zl},uElevPrevRange:{value:Ql},uElevNextRange:{value:Jl},uMorph:{value:1},uSatPrev:{value:ie.satTex},uSatNext:{value:m.satTex},uFieldTex0:{value:wa},uFieldTex1:{value:ua},uLipariTex:{value:je},uFrameMix:{value:Vh},uSunDir:{value:Me},uTime:{value:0},uCutawayMix:{value:1},uCutawayPlane:{value:0},uCutawayDir:{value:ql},uReconMix:{value:0},uObserverMix:{value:0},uModisWeight:{value:1},uViirsWeight:{value:1},uUncertaintyMix:{value:g.current.showUncertainty?1:0},uSensitivity:{value:g.current.sensitivityThreshold},uExtentKm:{value:ec},uModisPass:{value:tc},uViirsPass:{value:ac},uScanStrip:{value:sc},uLatticeMix:{value:1},uHasSeaCoast:{value:m.hasSeaCoast?1:0},uLakeMix:{value:ju(m)?1:0},uFireHist:{value:At(m).texture},uFireTime:{value:0},uWindDirUv:{value:In},uReliefScale:{value:Xl},uSlabSize:{value:Fn},uAuxTex:{value:m.auxTex??Cn},uAuxNormals:{value:1},uAuxMix:{value:0},uShadowTex:{value:lc(m)},uUnitsPerMetre:{value:oc},uOrthoTexelKm:{value:m.orthoTexelKm},uSatSharpen:{value:m.sharpen},uDetailTex:{value:Ln},uDetailRect:{value:ic},uDetailMix:{value:0},uDetailTexelKm:{value:m.detailTexelKm},uSmokeShadowTex:{value:Z.shadowTarget.texture},uSunTrue:{value:fi},uSunColor:{value:_n},uSunTransmittance:{value:Wl},uHazeStrength:{value:Vd},uSkyView:{value:Ro.skyView.texture},uSkyExposure:{value:vr},uEdgeFade:{value:0},uContextDem:{value:null},uContextRes:{value:1024},uContextScale:{value:5},uContextMix:{value:0},uContextOrtho:{value:null},uFloorColor:es.uFloorColor,uFloorHaze:es.uFloorHaze,uSmokeShadowMix:{value:0},uFootTex:{value:si.texture},uFootMix:{value:kl},uFieldScale:{value:Fl},uHeatRange:{value:Dl},uBeliefGrid:{value:ha.grid},uBeliefBox:{value:ha.box},uTileGrid:{value:fn},uTileState:{value:El},uTileHover:mn,uScan:{value:qa},uPixelOutline:{value:0},uBeliefMix:gl,uHeldOut:un,uHeldOutOther:xl,uBurnedMix:wl,uBurnedBox:{value:Ml},uBurnedSize:{value:yl},uDeclaredGiven:Sl,uChanceSquares:bn,uDayJoin:wn,uDayFalse:Mn,uMicroDetail:Il,uRevealArrive:{value:vs},uRevealLine:{value:Cl},uAfterglow:bo,uLightGain:Ja,uFarView:En,uBeliefQuiet:An,uLightModis:Pl,uLightTexels:{value:mo},uRevealed:{value:Hs},uNight:Za,uMoonLift:yo},uc=new Et({vertexShader:bu,fragmentShader:$f,uniforms:L}),pi=new Sa(Nn,uc);pi.frustumCulled=!1,G.add(pi);const hc=new Et({vertexShader:bu,fragmentShader:Yf,uniforms:L,colorWrite:!1,polygonOffset:!0,polygonOffsetFactor:1,polygonOffsetUnits:2}),vi=new Sa(Nn,hc);vi.frustumCulled=!1,vi.renderOrder=-11,G.add(vi);const gi=new Jf({uSlabSize:L.uSlabSize,uElevNextRange:L.uElevNextRange,uReliefScale:L.uReliefScale,uUnitsPerMetre:L.uUnitsPerMetre,uSunDir:L.uSunDir,uSunTrue:L.uSunTrue,uSunColor:L.uSunColor,uSunTransmittance:L.uSunTransmittance,uHazeStrength:L.uHazeStrength,uSkyView:L.uSkyView,uSkyExposure:L.uSkyExposure,uFloorColor:L.uFloorColor,uFloorHaze:L.uFloorHaze,uContextDem:L.uContextDem,uContextRes:L.uContextRes,uContextScale:L.uContextScale,uContextMix:L.uContextMix,uContextOrtho:L.uContextOrtho,uNight:Za,uMoonLift:yo});G.add(gi.mesh);let Ta=0;const dc=uu(),Yh={uDemPrev:L.uDemPrev,uDemNext:L.uDemNext,uDemRes:L.uDemRes,uElevPrevRange:L.uElevPrevRange,uElevNextRange:L.uElevNextRange,uReliefScale:L.uReliefScale,uSlabSize:L.uSlabSize,uMorph:L.uMorph,uSunDir:L.uSunDir,uCutawayMix:L.uCutawayMix,uCutawayPlane:L.uCutawayPlane,uCutawayDir:L.uCutawayDir,uEdgeFade:L.uEdgeFade,uContextDem:L.uContextDem,uContextRes:L.uContextRes,uContextScale:L.uContextScale,uContextMix:L.uContextMix,uNight:Za,uMoonLift:yo},fc=new Et({vertexShader:nf,fragmentShader:rf,uniforms:Yh,side:Ns}),Fo=new Sa(dc,fc);Fo.frustumCulled=!1,G.add(Fo);const mc=new pa(0,1,0,-1e4),ts=new rp(Yu);G.add(ts.group);let pc=!1;const xi=[];let zn=0;const ve={azimuth:St.azimuth,polar:St.polar,distance:St.distance,target:new W(...St.target)},$={azimuth:St.azimuth,polar:St.polar,distance:St.distance,target:new W(...St.target)},as=new Tf,vc=new Rf;let Un=!1,_a=!1,gc=!1,Bn=0,Do=qo,sa=1;const Je={width:m.frame.width,depth:m.frame.depth},xc=()=>{Je.width=D.lerp(ie.frame.width,m.frame.width,sa),Je.depth=D.lerp(ie.frame.depth,m.frame.depth,sa),Fn.set(Je.width,Je.depth)},$t=n=>(n-.5)*Je.width,jt=n=>(.5-n)*Je.depth,wi=n=>n/Je.width+.5,Mi=n=>.5-n/Je.depth,Mt=(n,f)=>{const v=jo(m.alignedDem,m.demGridRes,n,f),c=Cs(v,m);if(sa>=.999||ie===m)return c;const E=jo(ie.alignedDem,ie.demGridRes,n,f),y=Cs(E,ie);return y+(c-y)*sa},yi=()=>{L.uDemPrev.value=ie.demTex,L.uDemNext.value=m.demTex,Zl.set(ie.demGridRes,m.demGridRes),Ql.set(ie.minElevM,ie.maxElevM),Jl.set(m.minElevM,m.maxElevM),L.uSatPrev.value=ie.satTex,L.uSatNext.value=m.satTex,ec.set(m.widthKm,m.depthKm),L.uHasSeaCoast.value=m.hasSeaCoast?1:0,L.uLakeMix.value=ju(m)?1:0,In.set(m.windDirUv[0],m.windDirUv[1]),L.uFireHist.value=At(m).texture,Xl.set(ie.frame.unitsPerMetre[1],m.frame.unitsPerMetre[1]),oc.set(...m.frame.unitsPerMetre),xc(),Me.copy(m.sunDir),Vl(m),pe.position.copy(Me).multiplyScalar(20),L.uShadowTex.value=lc(m),L.uAuxTex.value=m.auxTex??Cn,L.uAuxNormals.value=m.pack&&m.levelIsWater===!1?0:1,L.uOrthoTexelKm.value=m.orthoTexelKm,L.uSatSharpen.value=m.sharpen,L.uDetailTex.value=m.detailTex??Ln,ic.set(...m.detailRect),L.uDetailTexelKm.value=m.detailTexelKm,m.auxTex||(L.uAuxMix.value=0),m.detailTex||(L.uDetailMix.value=0);const n=m.context;L.uContextDem.value=(n==null?void 0:n.demTexture)??null,L.uContextOrtho.value=(n==null?void 0:n.orthoTexture)??null,L.uContextRes.value=(n==null?void 0:n.gridRes)??1024,L.uContextScale.value=(n==null?void 0:n.scale)??5,gi.setContext(n),n||(Ta=0,L.uContextMix.value=0)},ra=new Map,On=_.capabilities.maxTextureSize>=8192&&(navigator.deviceMemory??8)>=8&&!B,$h=()=>{ys||(ys=cc(1023),ko=uu(1023),pi.geometry=ys,vi.geometry=ys,Fo.geometry=ko)},Hn=(n,f,v)=>{const c=f.manifest.extent_km[0]/f.orthoSize;return{...n,key:`pack-${n.key}`,demTex:f.demTexture,alignedDem:f.alignedDem,levelIsWater:!f.levelInWholeMetres,demGridRes:f.demGridRes,minElevM:f.minElevM,maxElevM:f.maxElevM,satTex:f.orthoTexture,orthoLabel:f.orthoSize>=8192?"Esri 8K":"Esri 4K",demLabel:`${f.demGridRes}²`,orthoTexelKm:c,sharpen:0,shadow:(v==null?void 0:v.shadow)??null,pack:f,lite:n,auxTex:f.auxTexture,detailTex:(v==null?void 0:v.detailTex)??null,detailRect:(v==null?void 0:v.detailRect)??[0,0,1,1],detailTexelKm:(v==null?void 0:v.detailTexelKm)??c,context:(v==null?void 0:v.context)??null,contextState:(v==null?void 0:v.contextState)??"none",attribution:f.attribution||n.attribution}},wc=n=>{var f,v,c,E,y,C;(f=n.pack)==null||f.dispose(),(v=n.detailTex)==null||v.dispose(),(c=n.shadow)==null||c.dispose(),(E=n.context)==null||E.dispose(),n.fireHistory&&n.fireHistory!==((y=n.lite)==null?void 0:y.fireHistory)&&n.fireHistory.texture.dispose(),n.smokeHeight&&n.smokeHeight!==((C=n.lite)==null?void 0:C.smokeHeight)&&(ge.delete(n.smokeHeight),n.smokeHeight.dispose()),n.fireHistory=null,n.smokeHeight=null,n.detectionSource=null,n.context=null,n.pack=null,n.detailTex=null,n.shadow=null},Gn=n=>{for(const[f,v]of ra)f===n||v===ie||v===m||(wc(v),ra.delete(f))},jh=n=>{if(n.pack||!n.packManifest)return n;const f=ra.get(n.regionId);if(!(f!=null&&f.pack))return n;if(f.lite===n)return f;const v=Hn(n,f.pack,f);return v.packIsLite=f.packIsLite,v.contextLite=f.contextLite,ra.set(n.regionId,v),tt(f),v},Mc=n=>{var E;const f=n.pack,v=(E=f==null?void 0:f.manifest.ortho_detail)==null?void 0:E[0];if(!f||!v||!On||v.size>_.capabilities.maxTextureSize)return;const c=v.uv_rect;!Array.isArray(c)||c.length!==4||!(c[2]>c[0])||!(c[3]>c[1])||Ah(La(g.current,v.url),P).then(y=>{if(!y)return;const C=ra.get(n.regionId);if(S||!C||C.pack!==f){y.dispose();return}C.detailTex=y,C.detailRect=[c[0],c[1],c[2],c[3]],C.detailTexelKm=f.manifest.extent_km[0]*(c[2]-c[0])/v.size,m===C&&yi()})},yc=n=>{const f=n.pack,v=Su(f==null?void 0:f.manifest.context);!f||!v||n.contextState!=="none"||n.context&&(!n.contextLite||n.packIsLite)||(n.contextState="loading",Xf(v,{resolveUrl:c=>La(g.current,c),maxTextureSize:_.capabilities.maxTextureSize,maxAnisotropy:P,isCancelled:()=>S}).then(c=>{const E=ra.get(n.regionId);if(S||!E||E.pack!==f){c==null||c.dispose();return}E.contextState=c?"none":"failed",c&&(E.context&&E.context!==c&&E.context.dispose(),E.context=c,E.contextLite=!!E.packIsLite,m===E&&yi())}))},Xh=n=>{const f=n.packManifest;if(!f||n.pack||n.packState!=="none")return;const v=Ha?Nu(f):null;n.packState="loading",gu(v??f,{resolveUrl:c=>La(g.current,c),maxTextureSize:On?_.capabilities.maxTextureSize:4096,maxAnisotropy:P,isCancelled:()=>S}).then(c=>{if(S){c==null||c.dispose();return}if(!c){n.packState="failed";return}if(n.packState="none",m!==n){c.dispose();return}Gn(n.regionId);const E=Hn(n,c,null);E.packIsLite=v!==null,ra.set(n.regionId,E),Po(E,!0),Do=.62,E.packIsLite||Mc(E),yc(E)})},qh=n=>{S||!n.packIsLite||n.packUpgrade||!n.packManifest||!n.pack||ra.get(n.regionId)===n&&(n.packUpgrade="loading",gu(n.packManifest,{resolveUrl:f=>La(g.current,f),maxTextureSize:On?_.capabilities.maxTextureSize:4096,maxAnisotropy:P,isCancelled:()=>S}).then(f=>{if(S){f==null||f.dispose();return}if(!f){n.packUpgrade="failed";return}if(ra.get(n.regionId)!==n||m!==n){f.dispose(),n.packUpgrade=void 0;return}const v=Hn(n.lite??n,f,null);v.packIsLite=!1,v.context=n.context,v.contextLite=!!n.context,v.contextState="none",n.context=null,ra.set(v.regionId,v),Po(v,!0),Do=.62,Mc(v),yc(v),window.setTimeout(()=>{var c,E;n===ie||n===m||((c=n.pack)==null||c.dispose(),(E=n.shadow)==null||E.dispose(),n.pack=null,n.shadow=null)},2500)}))},Po=(n,f)=>{if(S)return;const v=jh(n);if(v===m&&f)return;v.demGridRes>=1024&&$h();const c=m.regionId!==v.regionId;gc=c,f?(ie=sa<.5?ie:m,m=v,_a=!0,Bn=0,Do=qo,sa=0,L.uMorph.value=0):(ie=v,m=v,_a=!1,sa=1,L.uMorph.value=1,Gn(v.regionId),aa()),c&&f&&(L.uAuxMix.value=0),yi(),xo=null,p(Br(v)),Ts=!0,v.pack?v.packIsLite&&$n(()=>qh(v)):Xh(v)},bc=n=>{S||m.regionId===n.regionId&&(Po(n,!0),Do=.62)},Sc=new WeakMap,Zh=(n,f)=>{var at,bt;let v=Sc.get(n);v||Sc.set(n,v=new Map);const c=v.get(f);if(c!==void 0)return c;if(v.set(f,null),n.observerDataset.dataSource!=="firms")return null;const[E,y,C,Q]=n.bbox,q=Date.parse(((bt=(at=n.observerDataset.frames[f])==null?void 0:at[0])==null?void 0:bt.timeUtc)??""),oe=[],se=[];for(const fe of n.observerDataset.frames)for(const Ee of fe){if(Ee.hidden||Ee.revealed)continue;const Ye=Date.parse(Ee.timeUtc??""),xe=Number.isFinite(q)&&Number.isFinite(Ye)&&Math.abs(Ye-q)<=wv;for(const ye of Ee.footprints){const Te=(ye.lon-E)/Math.max(1e-9,C-E),Ae=(ye.lat-y)/Math.max(1e-9,Q-y),Xt=Math.max(1,ye.frpMw);oe.push(Te,Ae,Xt),xe&&se.push(Te,Ae,Xt)}}const Se=fe=>{let Ee=0,Ye=0,xe=0;for(let ye=0;ye<fe.length;ye+=3)Ee+=fe[ye]*fe[ye+2],Ye+=fe[ye+1]*fe[ye+2],xe+=fe[ye+2];return xe>0?[Ee/xe,Ye/xe]:null},he=(fe,Ee,Ye)=>Math.hypot((fe[Ee]-Ye[0])*n.widthKm,(fe[Ee+1]-Ye[1])*n.depthKm),ne=(fe,Ee)=>{let Ye=0,xe=0;for(let ye=0;ye<fe.length;ye+=3)xe+=fe[ye+2],he(fe,ye,Ee)<Mv&&(Ye+=fe[ye+2]);return xe>0?Ye/xe:0};let te=Se(oe);if(!te)return null;let re=oe;const de=Se(se);de&&ne(se,te)<.1&&ne(se,de)>=.3&&(te=de,re=se);let ze=1/0;for(let fe=0;fe<re.length;fe+=3)ze=Math.min(ze,he(re,fe,te));if(ze>pv){const fe=Math.max(1,Math.ceil(n.widthKm/eh)),Ee=Math.max(1,Math.ceil(n.depthKm/eh)),Ye=Vo(new Float32Array(re),fe,Ee),xe=new Float64Array(Ye.sizes.length),ye=new Float64Array(Ye.sizes.length*2);for(let Ae=0;Ae<Ye.patchOf.length;Ae++){const Xt=Ye.patchOf[Ae],Ct=re[Ae*3+2];xe[Xt]+=Ct,ye[Xt*2]+=Ct*re[Ae*3],ye[Xt*2+1]+=Ct*re[Ae*3+1]}let Te=0;for(let Ae=1;Ae<xe.length;Ae++)xe[Ae]>xe[Te]&&(Te=Ae);xe[Te]>0&&(te=[ye[Te*2]/xe[Te],ye[Te*2+1]/xe[Te]])}return v.set(f,te),te};let bi=1;const Ba=(n,f,v,c)=>{var Ya;const E=!!g.current.tileBoard,y=fu(n,f,v,c,E);if(f&&E&&n==="region"&&bi>1)return{...y,distance:y.distance*bi};if(!f||n!=="canyon"&&n!=="ridge")return y;const C=n==="canyon"?"subpixel":"front",Q=m.findings.find(Xe=>Xe.kind===C),q=m.observerDataset.frames.length,oe=Math.min(q-1,Math.max(0,Math.round(D.clamp(g.current.timeProgress,0,1)*(q-1)))),se=Zh(m,oe);if(!Q&&!se)return y;const[Se,he,ne,te]=m.bbox;let re=se?D.clamp(se[0],.1,.9):D.clamp((Q.lon-Se)/Math.max(1e-4,ne-Se),.2,.8),de=se?D.clamp(se[1],.1,.9):D.clamp((Q.lat-he)/Math.max(1e-4,te-he),.2,.8);const ze=n==="canyon"?(Ya=m.declared)==null?void 0:Ya.byFrame.get(oe):void 0;let at=null,bt=null;if(ze&&ze.length>0&&m.declared)at=m.declared,bt=ze;else if(n==="canyon"&&To==="estimate"&&ft.length>0&&m.runId){const Xe=vl.get(m.runId);if(Xe){const{nx:Ge,ny:ue}=Xe.info,qe=new Set;for(let Dt=0;Dt<ft.length;Dt+=3){const pt=Math.min(Ge-1,Math.max(0,Math.floor(ft[Dt]*Ge))),le=Math.min(ue-1,Math.max(0,Math.floor((1-ft[Dt+1])*ue)));qe.add(le*Ge+pt)}at={nx:Ge,ny:ue},bt=Uint32Array.from(qe)}}let fe=null,Ee=null;if(at&&bt&&bt.length>0){const Xe=bt,{nx:Ge,ny:ue}=at,qe=new Float32Array(Xe.length*3);Xe.forEach((He,Fe)=>{qe[Fe*3]=(He%Ge+.5)/Ge,qe[Fe*3+1]=1-(Math.floor(He/Ge)+.5)/ue,qe[Fe*3+2]=1});const Dt=Vo(qe,Ge,ue);let pt=0;for(let He=0;pt<Dt.sizes.length&&He<ah*Xe.length;pt++)He+=Dt.sizes[pt];let le=1,_e=0,ke=1,Ze=0;fe=[],Ee=[];for(let He=0;He<Xe.length;He++){const Fe=Xe[He],Ue=Fe%Ge/Ge,Lt=1-Math.floor(Fe/Ge)/ue,Ke=Ue+1/Ge,Wt=Lt-1/ue;Ee.push(Ue,Wt,Ke,Wt,Ue,Lt,Ke,Lt),!(Dt.patchOf[He]>=pt)&&(le=Math.min(le,Ue),_e=Math.max(_e,Ke),ke=Math.min(ke,Wt),Ze=Math.max(Ze,Lt),fe.push(Ue,Wt,Ke,Wt,Ue,Lt,Ke,Lt))}re=D.clamp((le+_e)/2,.05,.95),de=D.clamp((ke+Ze)/2,.05,.95)}const Ye=$t(re),xe=jt(de),ye=Math.hypot(Ye,xe),Te=Math.atan2(-Ye,-xe),Ae=D.smoothstep(ye,.8,3.2),Xt=Math.atan2(m.sunDir.x,m.sunDir.z);let Ct=y.azimuth,Va=-1e9;for(let Xe=0;Xe<72;Xe++){const Ge=Xe/72*Math.PI*2-Math.PI;let ue=Ge-Gu;for(;ue>Math.PI/2;)ue-=Math.PI;for(;ue<-Math.PI/2;)ue+=Math.PI;if(Math.abs(ue)>Cp)continue;let qe=Math.abs(Ge-Xt)%(Math.PI*2);qe>Math.PI&&(qe=Math.PI*2-qe);const pt=1-Math.min(1,Math.abs(qe-$i)/$i)+.9*Ae*Math.cos(Ge-Te)+.2*Math.cos(Ge-y.azimuth);pt>Va&&(Va=pt,Ct=Ge)}let st=[Ye,Mt(re,de)+.1,xe],Pa=y.distance,qt=y.polar;if(fe&&Ee){const Xe=st,Ge=qe=>{let Dt={target:Xe,distance:y.distance,polar:y.polar};for(const pt of[y.polar,...sh].filter(le=>le<=y.polar)){let le=Xe,_e={distance:y.distance,fits:!1};for(let ke=0;ke<3&&(_e=Rc(qe,le,Ct,pt),ke!==2);ke++)le=Ec(qe,le,Ct,pt,_e.distance);if(Dt={target:le,distance:_e.distance,polar:pt},_e.fits)break}return Dt};let ue=Ge(fe);Ee.length>fe.length&&ed(Ee,ue.target,Ct,ue.polar,ue.distance)&&(ue=Ge(Ee)),st=ue.target,Pa=ue.distance,qt=ue.polar}const oa=n==="canyon"?Qh(m,oe):null;if(oa&&oa.length>0){const Xe=oh/Math.max(.001,m.widthKm),Ge=oh/Math.max(.001,m.depthKm),ue=Math.max(1,Math.round(1/Xe)),qe=Math.max(1,Math.round(1/Ge)),Dt=new Float32Array(oa.length/2*3);for(let Fe=0,Ue=0;Fe<oa.length;Fe+=2,Ue+=3)Dt[Ue]=oa[Fe],Dt[Ue+1]=oa[Fe+1],Dt[Ue+2]=1;const pt=Vo(Dt,ue,qe);let le=0;const _e=oa.length/2;for(let Fe=0;le<pt.sizes.length&&Fe<ah*_e;le++)Fe+=pt.sizes[le];const ke=fe?[...fe]:[],Ze=[];for(let Fe=0;Fe<_e;Fe++){if(pt.patchOf[Fe]>=le)continue;const Ue=oa[Fe*2]-Xe/2,Lt=oa[Fe*2+1]-Ge/2;ke.push(Ue,Lt,Ue+Xe,Lt,Ue,Lt+Ge,Ue+Xe,Lt+Ge),Ze.push(oa[Fe*2],oa[Fe*2+1])}if(Jh(ke,st,Ct,qt,Pa*Gr)||Tc(Ze,st,Ct,qt,Pa)>ih){const Fe=st;let Ue=null;for(const Lt of[qt,...sh].filter(Ke=>Ke<=qt)){let Ke=Fe,Wt={distance:Pa,fits:!1};for(let zt=0;zt<3&&(Wt=Rc(ke,Ke,Ct,Lt),zt!==2);zt++)Ke=Ec(ke,Ke,Ct,Lt,Wt.distance);const is=Tc(Ze,Ke,Ct,Lt,Wt.distance),ns={target:Ke,distance:Wt.distance,polar:Lt,fits:Wt.fits,hidden:is};if(Wt.fits&&is<=ih){Ue=ns;break}(!Ue||ns.fits&&(!Ue.fits||is<Ue.hidden))&&(Ue=ns)}Ue&&(st=Ue.target,Pa=Ue.distance,qt=Ue.polar)}}return{...y,azimuth:Ct,polar:qt,distance:Pa,target:st}},Qh=(n,f)=>{if(n.observerDataset.dataSource!=="firms")return null;const[v,c,E,y]=n.bbox,C=[];for(const Q of n.observerDataset.frames[f]??[])if(!(!Q.revealed||Q.revealedByLook))for(const q of Q.footprints)C.push((q.lon-v)/Math.max(1e-9,E-v),(q.lat-c)/Math.max(1e-9,y-c));return C.length>0?C:null},Jh=(n,f,v,c,E)=>{const y=$o(g.current.workspaceSubjectFrame)??{left:0,top:0,right:1,bottom:1},C=Math.tan(D.degToRad(Vr/2)),Q=(y.right-y.left)*C*k.aspect,q=(y.bottom-y.top)*C,oe=new W().setFromSphericalCoords(1,c,v),se=oe.clone().negate(),Se=new W().crossVectors(se,new W(0,1,0)).normalize(),he=new W().crossVectors(Se,se),ne=new W(f[0],f[1],f[2]).addScaledVector(oe,E),te=new W;for(let re=0;re<n.length;re+=2){te.set($t(n[re]),Mt(n[re],n[re+1]),jt(n[re+1])).sub(ne);const de=te.dot(se);if(de<=.05||Math.abs(te.dot(Se)/de)>Q||Math.abs(te.dot(he)/de)>q)return!0}return!1},Tc=(n,f,v,c,E)=>{if(n.length===0)return 0;const y=new W().setFromSphericalCoords(1,c,v),C=f[0]+y.x*E,Q=f[1]+y.y*E,q=f[2]+y.z*E;let oe=0;for(let se=0;se<n.length;se+=2){const Se=n[se],he=n[se+1],ne=$t(Se),te=Mt(Se,he),re=jt(he);for(let de=1;de<32;de++){const ze=de/32,at=wi(C+(ne-C)*ze),bt=Mi(q+(re-q)*ze);if(!(at<0||at>1||bt<0||bt>1)&&Mt(at,bt)>Q+(te-Q)*ze+.012){oe+=1;break}}}return oe/(n.length/2)},ed=(n,f,v,c,E)=>{const y=$o(g.current.workspaceSubjectFrame)??{top:0,bottom:1},C=(y.bottom-y.top)*Math.tan(D.degToRad(Vr/2)),Q=new W().setFromSphericalCoords(1,c,v),q=Q.clone().negate(),oe=new W().crossVectors(q,new W(0,1,0)).normalize(),se=new W().crossVectors(oe,q),Se=new W(f[0],f[1],f[2]).addScaledVector(Q,E),he=new W;for(let ne=0;ne<n.length;ne+=2){he.set($t(n[ne]),Mt(n[ne],n[ne+1]),jt(n[ne+1])).sub(Se);const te=he.dot(q);if(te>.05&&he.dot(se)/te<-C)return!0}return!1},Ec=(n,f,v,c,E)=>{const y=new W().setFromSphericalCoords(1,c,v),C=y.clone().negate(),Q=new W().crossVectors(C,new W(0,1,0)).normalize(),q=new W().crossVectors(Q,C),oe=new W(f[0],f[1],f[2]).addScaledVector(y,E);let se=1/0,Se=-1/0,he=1/0,ne=-1/0;const te=new W;for(let fe=0;fe<n.length;fe+=2){te.set($t(n[fe]),Mt(n[fe],n[fe+1]),jt(n[fe+1])).sub(oe);const Ee=te.dot(C);if(Ee<=.05)continue;const Ye=te.dot(Q)/Ee,xe=te.dot(q)/Ee;se=Math.min(se,Ye),Se=Math.max(Se,Ye),he=Math.min(he,xe),ne=Math.max(ne,xe)}if(!Number.isFinite(se))return f;const re=C.clone().addScaledVector(Q,(se+Se)/2).addScaledVector(q,(he+ne)/2);if(re.y>=-1e-4)return f;const de=(f[1]-oe.y)/re.y,ze=oe.clone().addScaledVector(re,de),at=D.clamp(ze.x/Je.width+.5,.05,.95),bt=D.clamp(.5-ze.z/Je.depth,.05,.95);return[$t(at),Mt(at,bt)+.1,jt(bt)]},Rc=(n,f,v,c)=>{const E=$o(g.current.workspaceSubjectFrame)??{left:0,top:0,right:1,bottom:1},y=Math.tan(D.degToRad(Vr/2)),C=(E.right-E.left)*y*k.aspect*th,Q=(E.bottom-E.top)*y*th,q=[];for(let de=0;de<n.length;de+=2)q.push($t(n[de]),Mt(n[de],n[de+1]),jt(n[de+1]));const oe=new W().setFromSphericalCoords(1,c,v),se=oe.clone().negate(),Se=new W().crossVectors(se,new W(0,1,0)).normalize(),he=new W().crossVectors(Se,se),ne=de=>{const ze=f[0]+oe.x*de,at=f[1]+oe.y*de,bt=f[2]+oe.z*de;for(let fe=0;fe<q.length;fe+=3){const Ee=q[fe]-ze,Ye=q[fe+1]-at,xe=q[fe+2]-bt,ye=Ee*se.x+Ye*se.y+xe*se.z;if(ye<=.05||Math.abs((Ee*Se.x+Ye*Se.y+xe*Se.z)/ye)>C||Math.abs((Ee*he.x+Ye*he.y+xe*he.z)/ye)>Q)return!1}return!0};if(ne(Kr))return{distance:Kr,fits:!0};if(!ne(Wr))return{distance:Wr,fits:!1};let te=Kr,re=Wr;for(let de=0;de<22;de++){const ze=(te+re)/2;ne(ze)?re=ze:te=ze}return{distance:re,fits:!0}},td=n=>{var pt;const f=m,[v,c,E,y]=f.bbox,C=f.findings.find(le=>le.kind==="front")??f.findings.find(le=>le.kind==="subpixel")??f.findings[0];let Q=.5,q=.5;C&&(Q=D.clamp((C.lon-v)/Math.max(1e-4,E-v),.25,.75),q=D.clamp((C.lat-c)/Math.max(1e-4,y-c),.25,.75));const oe=f.observerDataset.dataSource==="firms";if(oe){const le=Math.min(f.frameCount-1,Math.max(0,Math.round(D.clamp(n,0,1)*(f.frameCount-1))));let _e=0,ke=0,Ze=0;for(const He of f.observerDataset.frames[le]??[])if(!He.hidden)for(const Fe of He.footprints)_e+=Fe.frpMw,ke+=Fe.frpMw*(Fe.lon-v)/Math.max(1e-4,E-v),Ze+=Fe.frpMw*(Fe.lat-c)/Math.max(1e-4,y-c);_e>0&&(Q=D.clamp(ke/_e,.15,.85),q=D.clamp(Ze/_e,.15,.85))}const se=f.frame.width,Se=f.frame.depth,he=se*.5,ne=Se*.5,te=(le,_e)=>Cs(jo(f.alignedDem,f.demGridRes,le/se+.5,.5-_e/Se),f),re=Su((pt=f.packManifest)==null?void 0:pt.context)!==null&&f.contextState!=="failed",de=(Q-.5)*se,ze=(.5-q)*Se,at=te(de,ze)+.05,bt=Math.min(f.frameCount-1,Math.max(0,Math.round(D.clamp(n,0,1)*(f.frameCount-1)))),fe=bt*We*We*4,Ee=[],Ye=(le,_e,ke)=>{Ee.push(le,te(le,_e)+.03,_e,(te(le-.1,_e)-te(le+.1,_e))/.2,(te(le,_e-.1)-te(le,_e+.1))/.2,ke)};if(f.observerDataset.dataSource==="firms"){const le=[];for(const Ze of f.observerDataset.frames[bt]??[])if(!Ze.hidden)for(const He of Ze.footprints)le.push(He);const _e=Math.max(1,Math.ceil(le.length/320)),ke=f.frame.unitsPerMetre[0]*f.frame.unitsPerMetre[2]*1e6;for(let Ze=0;Ze<le.length;Ze+=_e){const He=le[Ze],Fe=((He.lon-v)/Math.max(1e-4,E-v)-.5)*se,Ue=(.5-(He.lat-c)/Math.max(1e-4,y-c))*Se;Math.abs(Fe)>he||Math.abs(Ue)>ne||Ye(Fe,Ue,He.acrossTrackKm*He.alongTrackKm*ke*_e)}}else{const le=3*se/(We-1)*(3*Se/(We-1));for(let _e=2;_e<We-2;_e+=3)for(let ke=2;ke<We-2;ke+=3)f.tensor[fe+(_e*We+ke)*4]/255<=ei||Ye((ke/(We-1)-.5)*se,(.5-_e/(We-1))*Se,le)}const xe=Ee.length/6,ye=Math.tan(Vi*Math.PI/360),Te=4*ye*ye*1.6,Ae=2*Math.atan(ye*(16/9))/1920,Xt=Math.min(Up,f.orthoTexelKm*1e3*f.frame.unitsPerMetre[0]/(zp*Ae)),Ct=te(de-.12,ze)-te(de+.12,ze),Va=te(de,ze-.12)-te(de,ze+.12),st=Math.hypot(Ct,Va)||1,Pa=Math.atan2(f.sunDir.x,f.sunDir.z),qt=Math.hypot(f.windDirUv[0]*se,f.windDirUv[1]*Se)||1,oa=f.windDirUv[0]*se/qt,Ya=-f.windDirUv[1]*Se/qt,Xe=Math.atan(Math.tan(Vi*Math.PI/360)*(16/9))+Yi;let Ge={...St,target:[de,at,ze]},ue=-1e9;const qe={floorShare:1,seaShare:0,ridgeLines:0,ridgeLinesMost:0,fireShare:0,fireFrameShare:0,carryDistance:0,skylineDeg:0,eyeAboveGroundM:0,nearGround:0},Dt=f.frame.unitsPerMetre[1];for(const le of Lp)for(let _e=0;_e<48;_e++){const ke=_e/48*Math.PI*2-Math.PI,Ze=de+le*Math.sin(ke),He=ze+le*Math.cos(ke);if(he-Math.abs(Ze)<.35||ne-Math.abs(He)<.35)continue;let Fe=te(Ze,He);for(const zt of[-1,1]){const Nt=ke+zt*Yi;Fe=Math.max(Fe,te(de+le*Math.sin(Nt),ze+le*Math.cos(Nt)))}let Ue=Math.abs(ke-Pa)%(Math.PI*2);Ue>Math.PI&&(Ue=Math.PI*2-Ue);const Lt=1-Math.min(1,Math.abs(Ue-$i)/$i),Ke=Math.sin(ke)*oa+Math.cos(ke)*Ya,Wt=Math.max(0,Ke),is=re?.45*Math.max(0,-Ke)+(oe?.16:-.12)*le:0,ns=(Ct*Math.sin(ke)+Va*Math.cos(ke))/st;for(let zt=0;zt<Ca;zt++){const Nt=-Xe+2*Xe*zt/(Ca-1),rs=ke+Math.PI-Nt,ks=Math.sin(rs),Fs=Math.cos(rs);let Ma=0;for(;Ma<Qs;Ma++){const fa=.3+Ma*Cr,ls=Ze+ks*fa,$a=He+Fs*fa;if(Math.abs(ls)>he||Math.abs($a)>ne)break;Ti[zt*Qs+Ma]=te(ls,$a)}Vn[zt]=Ma}for(const zt of Np){const Nt=Fe+zt*Dt;let rs=1e6;for(let T=1;T<10;T++){const H=T/10;rs=Math.min(rs,Nt+(at-Nt)*H-te(Ze+(de-Ze)*H,He+(ze-He)*H))}if(rs<.03)continue;let ks=0,Fs=0,Ma=0,fa=-1e6,ls=0,$a=0,No=0;for(let T=0;T<Ca;T++){const H=-Xe+2*Xe*T/(Ca-1),O=Vn[T];let N=-1e6,Y=0,X=0;for(let J=0;J<O;J++){const Pe=.3+J*Cr,K=(Ti[T*Qs+J]-Nt)/Pe;K>N?(Y>=2&&Pe>le&&X++,N=K,Y=0):K<N-.004&&Y++}if(N<0){const J=O>0?Ti[T*Qs+O-1]:1;re||f.hasSeaCoast&&J<.004?Fs++:ks++}Ma+=Math.max(N,-.2),fa=Math.max(fa,N),Math.abs(H)<Xe*.55&&(ls+=X,$a=Math.max($a,X),No++)}const Vs=fa-.59*2*ye;let cs=1e6;for(let T=0;T<Ca;T++){const H=Vn[T];for(let O=0;O<H;O++){const N=.3+O*Cr;if(N>=cs)break;const Y=Ti[T*Qs+O];if(Y>.004&&(Y-Nt)/N>Vs){cs=N;break}}}const Bi=fa-(at-Nt)/le;let zo=0,Uo=0,Ys=0;const Oi=fa-Op*(fa-Vs);for(let T=0;T<xe;T++){const H=Ee[T*6],O=Ee[T*6+1],N=Ee[T*6+2],Y=Math.hypot(H-Ze,N-He);if(Y<.5)continue;let X=Math.atan2(H-Ze,N-He)-(ke+Math.PI);if(X-=Math.round(X/(Math.PI*2))*Math.PI*2,Math.abs(X)>Xe*.8)continue;const J=(O-Nt)/Y;if(J<Oi&&Uo++,J<Vs||J>fa)continue;let Pe=!0;for(let K=1;K<8&&Pe;K++){const z=K/8;Nt+(O-Nt)*z<te(Ze+(H-Ze)*z,He+(N-He)*z)-.01&&(Pe=!1)}if(Pe){zo++;const K=Ee[T*6+3],z=Ee[T*6+4],j=Ze-H,ee=Nt-O,Ie=He-N,ot=j*j+ee*ee+Ie*Ie,vt=Math.max(0,(K*j+ee+z*Ie)/(Math.hypot(K,1,z)*Math.sqrt(ot)));Ys+=Ee[T*6+5]*Math.hypot(K,1,z)*vt/(ot*Te)}}const $s=xe>0?zo/xe:0,Bo=ks/Ca,Oo=Fs/Ca,js=ls/Math.max(1,No),Ho=Ma/Ca,Go=-9*Bo-(ks>0?3:0)-.6*Oo+1.1*Math.min(js,2)+.3*Math.min(Math.max(js-2,0),1)+.8*Lt+.5*D.clamp(ns*2,-1,1)+(oe?4*$s:2.4*Math.min($s,.5))+2.5*Math.min(1,Ys/Bp)-(oe&&xe>0?7*Uo/xe:0)-.5*Wt+is-(cs<Xt?5+4*(1-cs/Xt):0)-8*Math.max(0,Bi-.2)-4*Math.max(0,.04-Ho);if(Go>ue){ue=Go;const T=Math.hypot(le,Nt-at);Ge={azimuth:ke,polar:Math.acos(D.clamp((Nt-at)/T,-1,1)),distance:T,target:[de,at,ze]},qe.floorShare=Bo,qe.seaShare=Oo,qe.ridgeLines=js,qe.ridgeLinesMost=$a,qe.fireShare=$s,qe.fireFrameShare=Ys,qe.carryDistance=Xt,qe.skylineDeg=Math.atan(Ho)*180/Math.PI,qe.eyeAboveGroundM=zt,qe.nearGround=cs}}}return Si=qe,Ge};let Oa=null,Ac="",Kn=!1;const ad=(n,f)=>{const v=Math.min(32,Math.max(1,Math.round(f))),c=[];k.updateMatrixWorld();for(let E=0;E<=v;E++)for(let y=0;y<=v;y++){const C=y/v,Q=1-E/v,q=Cs(jo(n.alignedDem,n.demGridRes,C,Q),n);Io.set((C-.5)*Je.width,q,(.5-Q)*Je.depth).project(k),c.push(Io.z>1||Io.z<-1?null:[(Io.x*.5+.5)*nt,(.5-Io.y*.5)*ct])}return{divisions:v,points:c}},Io=new W,Wn=n=>n.landingFrame===void 0?n.landingFrame=Kv(n.observerDataset,n.bbox,n.widthKm,n.depthKm):n.landingFrame,_c=()=>{const n=m.contextState==="failed"?`${m.key}!`:m.key;if(!Oa||Ac!==n){const f=Wn(m);Oa=td(f!==null?f/Math.max(1,m.frameCount-1):g.current.timeProgress),Ac=n,As=Is}return Oa};let Si={floorShare:1,seaShare:0,ridgeLines:0,ridgeLinesMost:0,fireShare:0,fireFrameShare:0,carryDistance:0,skylineDeg:0,eyeAboveGroundM:0,nearGround:0};const Ti=new Float32Array(Ca*Qs),Vn=new Int32Array(Ca),kc=(n,f,v)=>{const c=n.context;if(!c)return 0;const E=n.frame,[y,C,Q]=E.unitsPerMetre,q=Math.hypot(Math.max(Math.abs(f)-E.width*.5,0)/(y*1e3),Math.max(Math.abs(v)-E.depth*.5,0)/(Q*1e3)),oe=.25*(E.width/y+E.depth/Q)*.001;return(em(c,f/(E.width*c.scale)+.5,.5-v/(E.depth*c.scale))-n.minElevM-qf(q,oe)*1e3)*C},bs=new Float32Array((Js*Js+eo*eo)*3),sd=()=>{let n=0;for(let v=0;v<Js;v++){const c=v/(Js-1);for(let E=0;E<Js;E++){const y=E/(Js-1);bs[n*3]=$t(y),bs[n*3+1]=Mt(y,c),bs[n*3+2]=jt(c),n++}}const f=m.context;if(f&&Ta>.5){const v=m.frame;for(let c=0;c<eo;c++){const E=c/(eo-1);for(let y=0;y<eo;y++){const Q=(y/(eo-1)-.5)*v.width*f.scale,q=(.5-E)*v.depth*f.scale;Math.abs(Q)<=v.width*.5&&Math.abs(q)<=v.depth*.5||(bs[n*3]=Q,bs[n*3+1]=kc(m,Q,q),bs[n*3+2]=q,n++)}}}return n};let Ea=!1;const Fc=Xu();let ea=null,Dc="",Pc=null,Ha=!0,Yn=0,Co=-1,Ic=null,Ei=0,Cc=-1,Lc=0;md();const Nc=[],$n=n=>{Ha?Nc.push(n):n()},od=(n,f,v)=>{if(S)return;const c=new Set([...ce.values(),...ra.values(),ie,m]);for(const E of c)E.runId===n&&(E.tensor=f,E.frameCount=v,E.fireHistory=null);xo=null};let jn=!1,Ri=0,Ga=0,Ss=!0,yt=null,Kt=null,Ks=0,Ka=null,Ts=!1,zc=!1,Uc=!1;const Xn=n=>{ve.azimuth=n.azimuth,ve.polar=n.polar,ve.distance=n.distance,ve.target.set(n.target[0],n.target[1],n.target[2])},id=n=>{const f=g.current,v=ce.get(n);v&&v!==m&&Po(v,!0);const c=Ba(f.cameraPreset,f.inWorkspace,f.mode,n);as.trigger($,c,2.15,qo),Ea=!1,Ts=!1},nd=()=>{const n=g.current;as.cancel(),!n.inWorkspace&&n.landingView!=="slab"?(_c(),ve.azimuth=$.azimuth,ve.polar=$.polar,ve.distance=$.distance,ve.target.copy($.target)):Xn(Ba(n.cameraPreset,n.inWorkspace,n.mode,n.activeTheaterId)),Ea=!1,Ts=!1},rd=n=>{if(n&&!Un)as.cancel(),vc.startAtTheater(g.current.activeTheaterId);else if(!n&&Un){const f=new W(0,.65,0);k.getWorldDirection(f),f.multiplyScalar(10.5).add(k.position),Af(k.position,f,$),ve.azimuth=$.azimuth,ve.polar=$.polar,ve.distance=$.distance,ve.target.copy($.target),k.up.set(0,1,0)}Un=n};A.current={activateBundle:Po,upgradeBundleInPlace:bc,bundleCache:ce,takeRunBundle:na,storeRunBundle:ca,onScreenRegionId:()=>m.regionId,maxAnisotropy:P,texLoader:U,triggerSlew:id,applyCameraPreset:nd,syncCinemaStart:rd,whenPictureReady:$n,patchRunTensor:od},$n(()=>void(async()=>{var n;if((((n=ce.get("plumas_ca"))==null?void 0:n.runId)??null)===null)try{const f=await fetch(ch("generated/terrain/ca_dem_f32.bin")).catch(()=>null),v=new Promise(he=>{U.load(ch("generated/terrain/ca_satellite.jpg"),ne=>{ne.colorSpace=ut,ne.anisotropy=P,ne.wrapS=Ve,ne.wrapT=Ve,he(ne)},void 0,()=>he(null))}),[c,E]=await Promise.all([f&&f.ok?f.arrayBuffer():Promise.resolve(null),v]);if(S)return;const y=ce.get("plumas_ca");if(!y||y.runId!==null)return;const C=Xo.plumas_ca,Q=c?Ls(new Float32Array(c),!0):{texture:y.demTex,aligned:y.alignedDem,gridRes:y.demGridRes,minElev:y.minElevM,maxElev:y.maxElevM},q={buffer:zr(),frames:oo},oe=Ur(),se=Xr("plumas_ca",C.bbox,Q.aligned,Q.gridRes,q.buffer,q.frames),Se={...y,...jr(C.widthKm,Lr(C.bbox),null,1024,E?uh:""),fireHistory:null,key:"static-plumas_ca",noRealGround:c?void 0:y.noRealGround,noRealPicture:E?void 0:y.noRealPicture,demTex:Q.texture,alignedDem:Q.aligned,demGridRes:Q.gridRes,minElevM:Q.minElev,maxElevM:Q.maxElev,satTex:E??y.satTex,orthoLabel:"1K",demLabel:`${Q.gridRes}²`,tensor:q.buffer,frameCount:q.frames,observerDataset:oe,findings:se.anchors,callouts:se.callouts};_t("plumas_ca",Se),bc(Se)}catch{}})());let nt=Math.max(1,x.clientWidth),ct=Math.max(1,x.clientHeight),Ai=1;const qn=()=>{x&&(nt=Math.max(1,x.clientWidth),ct=Math.max(1,x.clientHeight),I=Lu(),V.setSize(nt,ct,I*Ai),k.aspect=nt/ct)};qn();const ld=new G0,cd=n=>{const f=ld.feed(n,document.hidden);f!==null&&(Ai=f,V.setSize(nt,ct,I*Ai))},Bc=new ResizeObserver(qn);Bc.observe(x);let ss=null;const Zn=()=>{qn(),Oc()},Oc=()=>{ss==null||ss.removeEventListener("change",Zn),ss=window.matchMedia(`(resolution: ${window.devicePixelRatio||1}dppx)`),ss.addEventListener("change",Zn)};Oc();let ka=!1,Hc=0,Qn=0,Jn=0,_i=0,ki=Number.NaN,er=Number.NaN,Gc=!1;const Fi=new W,tr=new Nd,Kc=new Le,Wc=(n,f,v,c)=>{const E=_.domElement.getBoundingClientRect();if(E.width<=0||E.height<=0||n<E.left||n>E.right||f<E.top||f>E.bottom)return null;Kc.set((n-E.left)/E.width*2-1,-((f-E.top)/E.height)*2+1),tr.setFromCamera(Kc,k);const y=tr.ray.origin,C=tr.ray.direction,Q=Math.max(.02,Je.width/400);for(let q=0;q<Je.width*6;q+=Q){const oe=y.x+C.x*q,se=y.y+C.y*q,Se=y.z+C.z*q,he=wi(oe),ne=Mi(Se);if(!(he<0||he>1||ne<0||ne>1)&&se<=Mt(he,ne)){const te=Math.min(v-1,Math.floor(he*v));return Math.min(c-1,Math.floor((1-ne)*c))*v+te}}return null},Vc=n=>{n.target instanceof HTMLElement&&n.target.closest('[data-stage-ui="true"]')||(ka=!0,Hc=n.button,n.clientX,n.clientY,Qn=n.clientX,Jn=n.clientY,_i=0,as.cancel(),_.domElement.setPointerCapture(n.pointerId))},Yc=n=>{const f=g.current;if(ki=n.clientX,er=n.clientY,!ka)return;const v=n.clientX-Qn,c=n.clientY-Jn;if(Qn=n.clientX,Jn=n.clientY,_i+=Math.hypot(v,c),!f.cinemaActive)if(Hc===2||n.shiftKey){Ea=!0;const E=$.distance*.0011,y=Math.cos($.azimuth),C=Math.sin($.azimuth);ve.target.x=D.clamp(ve.target.x-(v*y-c*C)*E,-Je.width*.42,Je.width*.42),ve.target.z=D.clamp(ve.target.z-(-v*C-c*y)*E,-Je.depth*.42,Je.depth*.42)}else{Ea=!0;const E=f.inWorkspace?.0046:.0028;ve.azimuth-=v*E;const y=f.inWorkspace?.12:.72,C=f.inWorkspace?1.36:1.18;ve.polar=D.clamp(ve.polar-c*E,y,C)}},$c=n=>{var c,E,y;if(!ka)return;ka=!1,_.domElement.hasPointerCapture(n.pointerId)&&_.domElement.releasePointerCapture(n.pointerId);const f=g.current;!f.inWorkspace&&_i<5&&n.button===0&&((c=f.onEnterWorkspace)==null||c.call(f));const v=f.tileBoard;if(v&&v.pickable&&f.inWorkspace&&_i<5&&n.button===0){const C=Wc(n.clientX,n.clientY,v.cols,v.rows);C!==null&&!((E=v.tiles[C])!=null&&E.closed)&&((y=f.onTilePick)==null||y.call(f,C))}},jc=()=>{ki=Number.NaN,er=Number.NaN},Xc=n=>{const f=g.current;if(!f.inWorkspace||f.cinemaActive)return;n.preventDefault(),Ea=!0,as.cancel();const v=1+D.clamp(n.deltaY,-120,120)*.0011;ve.distance=D.clamp(ve.distance*v,4.6,23.5)},qc=n=>{g.current.inWorkspace&&n.preventDefault()},Fa=_.domElement;Fa.addEventListener("pointerdown",Vc),window.addEventListener("pointermove",Yc,{passive:!0}),window.addEventListener("pointerup",$c),Fa.addEventListener("pointerleave",jc),Fa.addEventListener("wheel",Xc,{passive:!1}),Fa.addEventListener("contextmenu",qc);const Di=window.matchMedia("(prefers-reduced-motion: reduce)");let Es=Di.matches;const Zc=()=>{Es=Di.matches};Di.addEventListener("change",Zc);let os=0,ar=0,Qc=performance.now(),kt=0;const Rs={scale:1,offsetX:0,offsetY:0},Ft={scale:1,offsetX:0,offsetY:0},Ws={scale:1,offsetX:0,offsetY:$u},Da=new Float32Array(Jp*3);let Jc=!1,Lo=null,Pi=0,As=Is,_s=null,mt=null;const Wa={scale:1,offsetX:0,offsetY:0};let Ii=Is,Ci=null,eu=!1,tu=null,sr=!1,Li=!1;const Ni=(n,f,v,c,E=!1)=>{let y=0;for(let C=0;C<no;C++){const Q=C/(no-1);for(let q=0;q<no;q++){const oe=q/(no-1);Da[y*3]=$t(oe),Da[y*3+1]=Mt(oe,Q),Da[y*3+2]=jt(Q),y++}}for(let C=0;C<4;C++)Da[y*3]=(C%2===0?-.5:.5)*Je.width,Da[y*3+1]=Us,Da[y*3+2]=(C<2?-.5:.5)*Je.depth,y++;if(E){const C=Mt(.5,.5);for(let Q=0;Q<Hh;Q++){const q=Q===0?0:qp,oe=(Q-1)*Math.PI*.5;Da[y*3]=Math.cos(oe)*q,Da[y*3+1]=C+(Q===0?jp:Xp),Da[y*3+2]=Math.sin(oe)*q,y++}}Rp(Da,y,f,v,39,nt/ct,n,c)};let zi=0,or=0,Ui=0,ir=60,au=0;const et=new W,su=n=>{var ls,$a,No,Vs,cs,Bi,zo,Uo,Ys,Oi,$s,Bo,Oo,js,Ho,Go;if(S)return;ar=requestAnimationFrame(su);const f=n-Qc,v=Math.min(.065,Math.max(.001,f*.001));Qc=n,kt+=v,cd(f);const c=g.current,E=1-Math.exp(-v*8.5),y=1-Math.exp(-v*5.8),C=!c.inWorkspace&&c.landingView!=="slab";if(C&&_c(),_a){Bn+=Ha?1e3:v;const T=Math.min(1,Bn/Do);sa=Th(T),L.uMorph.value=sa,xc(),T>=1&&(_a=!1,sa=1,ie=m,yi(),L.uMorph.value=1,Gn(m.regionId),aa())}const Q=m.auxTex?_a&&ie.regionId!==m.regionId?D.smoothstep(sa,.55,1):1:0;if(L.uAuxMix.value=D.lerp(L.uAuxMix.value,Q,y),L.uDetailMix.value=D.lerp(L.uDetailMix.value,m.detailTex&&!ri?1:0,y),_s=c.inWorkspace?null:$o(c.landingSubjectFrame),mt=c.inWorkspace&&!c.cleanHud&&!c.cinemaActive?$o(c.workspaceSubjectFrame):null,c.inWorkspace&&mt){const T=(mt.left+mt.right)*.5,H=(mt.top+mt.bottom)*.5,O=Ka??c.cameraPreset;if(O==="overview"||O==="nadir"||O==="region"){Ii+=1;const N=c.mode==="observer"&&O==="overview",Y=!!c.tileBoard;let X=vv;if(Li&&Y&&O==="region")Ni(mt,{azimuth:$.azimuth,polar:$.polar,distance:$.distance,target:[$.target.x,$.target.y,$.target.z]},0,Wa,N),X=xv,((ea==="play"?Ks>=1:Math.abs($.distance-ve.distance)<.002*ve.distance)||Ea)&&(Li=!1,Ii=Is);else if(Ii>=Is||Ci!==O||eu!==N||Uc!==Y||!Ir(tu,mt)){Uc=Y;const K=fu(O,!0,c.mode,c.activeTheaterId,Y);Ni(mt,K,0,Wa,N);let z=1;Y&&O==="region"&&Wa.scale<nh&&(z=Math.min(gv,nh/Math.max(.001,Wa.scale)),Ni(mt,{...K,distance:K.distance*z},0,Wa,N)),Y&&O==="region"&&Math.abs(z-bi)>.005&&(bi=z,sr=!0),Ii=0,Ci=O,eu=N,tu={...mt}}const J=D.clamp(Wa.scale,X,1),Pe=Math.max(.001,Wa.scale);Ft.scale=J,Ft.offsetX=(Wa.offsetX+T)/Pe*J-T,Ft.offsetY=(Wa.offsetY+H)/Pe*J-H}else Ci=null,Ft.scale=1,Ft.offsetX=.5-T,Ft.offsetY=.5-H}else if(c.inWorkspace)Ci=null,Ft.scale=1,Ft.offsetX=0,Ft.offsetY=0;else if(C&&Oa){const T=_s??Wu;As+=1;const H=nt/ct;if(As>=Is||!Ir(Lo,T)||Math.abs(Pi-H)>1e-4){const O=sd();Fp(bs,O,Oa,Es?0:Yi,Vi,H,T,Ws),Lo=T,Pi=H,As=0}Ft.scale=1,Ft.offsetX=0,Ft.offsetY=Ws.offsetY}else if(!_s)Ft.scale=1,Ft.offsetX=0,Ft.offsetY=$u,Lo=null;else{As+=1;const T=nt/ct;(As>=Is||!Ir(Lo,_s)||Math.abs(Pi-T)>1e-4)&&(Ni(_s,St,Qp,Ws),Lo=_s,Pi=T,As=0),Ft.scale=Ws.scale,Ft.offsetX=Ws.offsetX,Ft.offsetY=Ws.offsetY}const q=Jc?E:1;Jc=!0,Rs.scale=D.lerp(Rs.scale,Ft.scale,q),Rs.offsetX=D.lerp(Rs.offsetX,Ft.offsetX,q),Rs.offsetY=D.lerp(Rs.offsetY,Ft.offsetY,q),Ip(k,nt,ct,Rs);let oe=c.timeProgress;const se=C?Wn(m):null;let Se=null;se!==null&&c.landingTour&&typeof c.landingPass!="number"&&!Es?(Sn!==m.key&&(Sn=m.key,Gs=[],m.observerDataset.frames.forEach((T,H)=>{var O;(H===se||((O=T[0])==null?void 0:O.isDay)===!1)&&Gs.push(H)}),li=Math.max(0,Gs.indexOf(se)),ci=0,Tn=!1),Ha||(ci+=v),Gs.length>1&&ci>(Tn?lv:rv)&&(li=(li+1)%Gs.length,ci=0,Tn=!0),Se=Gs[li]??null):Sn="";const he=se!==null&&typeof c.landingPass=="number"&&Number.isFinite(c.landingPass)?D.clamp(c.landingPass,0,m.frameCount-1):Se??se;if(he!==null&&(oe=he/Math.max(1,m.frameCount-1)),c.backdrop){const T=Wn(m);T!==null&&(oe=T/Math.max(1,m.frameCount-1))}let ne=0,te=!1;if(c.cinemaActive&&c.inWorkspace){const T=vc.update(v,Mt,c.onCinemaStepTheater,Je.width,Je.depth);k.fov=T.fov,k.updateProjectionMatrix(),k.up.copy(T.up),k.position.copy(T.position),k.lookAt(T.lookAt),oe=T.syntheticTimeProgress,ne=T.cycleProgress}else{const T=C&&Oa?Vi:39;if(Math.abs(k.fov-T)>.01&&(k.fov=Kn||!C?D.lerp(k.fov,T,E):T),k.updateProjectionMatrix(),k.up.set(0,1,0),!c.inWorkspace&&!as.isActive()&&!ka){const K=C?Oa:null,z=K??St,j=Es?0:K?Math.sin(kt*.11)*Yi:Math.sin(kt*.16)*.065;let ee=z.azimuth+j;for(;ee-ve.azimuth>Math.PI;)ee-=Math.PI*2;for(;ee-ve.azimuth<-Math.PI;)ee+=Math.PI*2;ve.azimuth=K?D.lerp(ve.azimuth,ee,Math.min(1,v*2)):ee,ve.polar=D.lerp(ve.polar,z.polar,v*1.2),ve.distance=D.lerp(ve.distance,z.distance,v*1.6),Fi.set(z.target[0],z.target[1],z.target[2]),ve.target.lerp(Fi,v*2.2),K&&!Kn&&(ve.azimuth=ee,ve.polar=z.polar,ve.distance=z.distance,ve.target.copy(Fi),$.azimuth=ve.azimuth,$.polar=z.polar,$.distance=z.distance,$.target.copy(Fi),Kn=!0)}Ts&&c.inWorkspace&&!Ea&&!ka&&!as.isActive()&&(Xn(Ba(c.cameraPreset,!0,c.mode,c.activeTheaterId)),Ts=!1),te=as.step(v,ve).slewActive,$.azimuth=D.lerp($.azimuth,ve.azimuth,E),$.polar=D.lerp($.polar,ve.polar,E),$.distance=D.lerp($.distance,ve.distance,E),$.target.lerp(ve.target,E);let O=!1;if(!_a&&c.inWorkspace&&ea!=="turn"&&(Ka??c.cameraPreset)==="canyon"&&m.observerDataset.dataSource==="firms"){const K=m.observerDataset.frames.length,z=Math.min(K-1,Math.max(0,Math.round(D.clamp(c.timeProgress,0,1)*(K-1)))),j=((($a=(ls=m.declared)==null?void 0:ls.byFrame.get(z))==null?void 0:$a.length)??0)>0;if(j||To==="estimate"&&ft.length>0){const ee=c.workspaceSubjectFrame,Ie=`${m.regionId}:${((Vs=(No=m.observerDataset.frames[0])==null?void 0:No[0])==null?void 0:Vs.timeUtc)??""}`;let ot=0;for(const rt of m.observerDataset.frames[z]??[])rt.revealed&&!rt.revealedByLook&&(ot+=rt.footprints.length);const vt=`${Ie}:${z}:${j?"declared":So}:${ot}:${ee?[ee.left,ee.top,ee.right,ee.bottom].map(rt=>rt.toFixed(3)).join(","):""}:${nt}x${ct}`;vt!==Dc&&(Dc=vt,!Ea&&!ka&&(ea==="estimate"||ea==="test"?O=!0:Ts=!0))}}const N=c.filmMove!==void 0?c.filmMove:Fc;N!==Pc&&(Pc=N,jn=!1),ea&&(Ea||ka)&&(jn=!0);let Y=null;if(N&&!jn&&!(_a&&gc)&&!Ha&&!c.backdrop){Y=N!=="auto"?N:c.inWorkspace?c.tileBoard?"play":Hs.x+Hs.y>.5?"test":"estimate":"record";const K=m.observerDataset.dataSource==="firms";Y!=="record"&&(!c.inWorkspace||!K)&&(Y=null)}if(Y!==ea){const K=ea;if(ea=Y,Ri=kt,Ks=0,Ka=null,yt=null,Kt=null,Y){Ea=!1;const z=Ba("canyon",!0,c.mode,c.activeTheaterId),j={...z,distance:z.distance*Gr,azimuth:z.azimuth+.04};if(Y==="estimate")yt={...z,distance:z.distance*fv,azimuth:z.azimuth-.06},Kt=j,Ga=Qu,Ss=!0,Ka="canyon";else if(Y==="test"){const ee={azimuth:$.azimuth,polar:$.polar,distance:$.distance,target:[$.target.x,$.target.y,$.target.z]};yt=K==="estimate"||K==="turn"?ee:j,Kt=yt,Ga=0,Ka="canyon"}else if(Y==="turn")yt={azimuth:$.azimuth,polar:$.polar,distance:$.distance,target:[$.target.x,$.target.y,$.target.z]},Kt={...yt,azimuth:yt.azimuth+Hr},Ga=Zu,Ss=!0,Ka=c.inWorkspace?K==="play"||K==="record"?"region":"canyon":null;else if(Y==="play")yt=j,Kt=Ba("region",!0,c.mode,c.activeTheaterId),Ga=mv,Ss=!0,Ka="region";else{const ee=c.inWorkspace?Ba("region",!0,c.mode,c.activeTheaterId):Oa??St;yt={...ee,azimuth:ee.azimuth-Hr/2},Kt={...ee,azimuth:ee.azimuth+Hr/2},Ga=Zu,Ss=!1,Ka=c.inWorkspace?"region":null}}}if(O&&yt&&Kt&&(ea==="estimate"||ea==="test")){const K=Ba("canyon",!0,c.mode,c.activeTheaterId);yt={azimuth:$.azimuth,polar:$.polar,distance:$.distance,target:[$.target.x,$.target.y,$.target.z]},Kt={...K,distance:K.distance*Gr,azimuth:K.azimuth+.04},Ga=ea==="estimate"?Qu:Ju,Ss=!0,Ri=kt}if(sr)if(sr=!1,ea==="play"&&yt&&Kt){const K=Ba("region",!0,c.mode,c.activeTheaterId);Ks<1?Kt=K:(yt={azimuth:$.azimuth,polar:$.polar,distance:$.distance,target:[$.target.x,$.target.y,$.target.z]},Kt=K,Ga=Ju,Ss=!0,Ri=kt,Ks=0,Li=!0)}else!ea&&c.cameraPreset==="region"&&c.inWorkspace&&!Ea&&!ka&&(Xn(Ba("region",!0,c.mode,c.activeTheaterId)),Li=!0);if(ea&&yt&&Kt){const K=Ga>0?D.clamp((kt-Ri)/Ga,0,1):1,z=Ss?K*K*(3-2*K):K;let j=Kt.azimuth-yt.azimuth;for(;j>Math.PI;)j-=Math.PI*2;for(;j<-Math.PI;)j+=Math.PI*2;$.azimuth=yt.azimuth+j*z,$.polar=D.lerp(yt.polar,Kt.polar,z),$.distance=yt.distance*Math.pow(Kt.distance/yt.distance,z),$.target.set(D.lerp(yt.target[0],Kt.target[0],z),D.lerp(yt.target[1],Kt.target[1],z),D.lerp(yt.target[2],Kt.target[2],z)),ve.azimuth=$.azimuth,ve.polar=$.polar,ve.distance=$.distance,ve.target.copy($.target),Ks=K}const X=Math.sin($.polar);k.position.set($.target.x+$.distance*X*Math.sin($.azimuth),$.target.y+$.distance*Math.cos($.polar),$.target.z+$.distance*X*Math.cos($.azimuth));const J=wi(k.position.x),Pe=Mi(k.position.z);if(J>=0&&J<=1&&Pe>=0&&Pe<=1){const K=Mt(J,Pe)+D.lerp(Ku,Hp,os);k.position.y<K&&(k.position.y=K)}else if(m.context&&Ta>.5){const K=kc(m,k.position.x,k.position.z)+Ku;k.position.y<K&&(k.position.y=K)}k.lookAt($.target)}const re=!c.inWorkspace||c.cinemaActive?"cutaway":c.mode,de=re==="cutaway"?1:0,ze=re==="reconstruction"?1:0,at=re==="observer"?1:0,bt=re==="world"||re==="earth"||m.observerDataset.dataSource==="firms"?0:re==="observer"?.45:1;L.uCutawayMix.value=D.lerp(L.uCutawayMix.value,de,y),L.uReconMix.value=D.lerp(L.uReconMix.value,ze,y),L.uObserverMix.value=D.lerp(L.uObserverMix.value,at,y),L.uCutawayPlane.value=Vu,L.uTime.value=kt,L.uUncertaintyMix.value=D.lerp(L.uUncertaintyMix.value,c.showUncertainty?1:0,E),L.uSensitivity.value=D.lerp(L.uSensitivity.value,c.sensitivityThreshold,E);const fe=c.observerFilter==="all"||c.observerFilter==="modis"?1:0,Ee=!c.holdoutViirs&&(c.observerFilter==="all"||c.observerFilter==="viirs")?1:0;L.uModisWeight.value=D.lerp(L.uModisWeight.value,fe,E),L.uViirsWeight.value=D.lerp(L.uViirsWeight.value,Ee,E),Re=D.lerp(Re,bt*D.lerp(1,Nv,Za.value),y);const Ye=Kl(m.tensor,m.frameCount,oe);L.uFrameMix.value=Ye,L.uFireTime.value=D.clamp(oe,0,1)*Math.max(1,m.frameCount-1);const xe=m.observerDataset.frames,ye=Math.min(xe.length-1,Math.max(0,Math.round(oe*(xe.length-1)))),Te=xe[ye]??[],Ae=m.observerDataset.dataSource==="firms",Xt=c.burnedArea??null;Xt!==ms&&(ms=Xt,Xt&&Wh(Xt));const Ct=Ae&&Aa!==null&&ms!==null&&bl===ms&&(!ms.region_id||ms.region_id===m.regionId);if(ps=D.lerp(ps,Ct?1:0,1-Math.exp(-v*3)),!Ct&&ps<.003&&(ps=0),wl.value=Ae?ps:0,L.uFieldTex1.value=Ae&&ps>0&&Aa?Aa:ua,ps>0&&hn){const T=Mf(m.bbox,hn);Ml.set(T[0],T[1],T[2],T[3])}if(Ae){Kh(m,Gt,cn);const T=`${m.key}:${ye}:${c.holdoutViirs?1:0}:${C?1:0}`,H=C&&(typeof c.landingPass=="number"||!!c.landingTour)&&!Es,O=T!==gs&&H&&gs.startsWith(`${m.key}:`)&&Ja.value>.02;if(O?Ja.value=Math.max(0,Ja.value-v/Iv):T===gs&&(Ja.value=H?Math.min(1,Ja.value+v/Cv):1),T!==gs&&!O){gs=T,Ja.value=H?0:1;const N=Te.find(z=>!ma(z,c.holdoutViirs)&&!z.revealed)??Te.find(z=>!ma(z,c.holdoutViirs)),Y=Te.some(z=>z.family==="modis"&&!ma(z,c.holdoutViirs)&&!z.revealed);Rn=N?{index:ye,sensor:N.sensorLabel,timeUtc:N.timeUtc??"",isDay:N.isDay!==!1,detections:N.footprints.length}:void 0;const X=N??Te[0];if(c.passScan&&(c.inWorkspace||typeof c.landingPass=="number")&&X&&!Es){const z=D.degToRad(X.azimuthDeg);let j=Math.cos(z),ee=-Math.sin(z);const Ie=X.orbitNode==="ascending";X.orbitNode&&Ie!==ee>0&&(j=-j,ee=-ee),qa.x=j,qa.y=ee,Al=kt}Qa.length=0,xs.length=0,Hs.set(0,0);for(const z of Te)if(!ma(z,c.holdoutViirs)){if(z.revealed){for(const j of z.footprints)xs.push(j);z.family==="modis"?Hs.x=1:Hs.y=1;continue}for(const j of z.footprints)Qa.push(j)}const J=Te.find(z=>z.revealed&&!ma(z,c.holdoutViirs));if(xs.length>0&&J){const z=D.degToRad(J.azimuthDeg);let j=Math.cos(z),ee=-Math.sin(z);J.orbitNode&&J.orbitNode==="ascending"!=ee>0&&(j=-j,ee=-ee);const[Ie,ot,vt,rt]=m.bbox;let gt=1/0,Vt=-1/0,xt=0;for(const Yt of xs){const ja=((Yt.lon-Ie)/Math.max(1e-9,vt-Ie)-.5)*m.widthKm,Hi=((Yt.lat-ot)/Math.max(1e-9,rt-ot)-.5)*m.depthKm,Gi=ja*j+Hi*ee;gt=Math.min(gt,Gi),Vt=Math.max(Vt,Gi),xt=Math.max(xt,Yt.acrossTrackKm,Yt.alongTrackKm)}vs.x=j,vs.y=ee,vs.w=Math.max(.2,xt),Ll=gt-xt,Nl=Vt+xt+vs.w,zl=Es?-1e9:kt}if(ui.length=0,bo.value=0,hi=void 0,Qa.length===0&&Te.length>0&&Te.every(z=>z.revealed||ma(z,c.holdoutViirs))&&m.residenceHours!==void 0){const z=Date.parse(((cs=Te[0])==null?void 0:cs.timeUtc)??"");for(let j=ye-1;j>=0&&ui.length===0;j--)for(const ee of xe[j]??[]){if(ee.revealed||ma(ee,c.holdoutViirs)||ee.footprints.length===0)continue;for(const vt of ee.footprints)ui.push(vt);const Ie=Date.parse(ee.timeUtc??""),ot=Number.isFinite(z)&&Number.isFinite(Ie)?Math.max(0,(z-Ie)/36e5):0;bo.value=Math.exp(-ot/(m.residenceHours??1)),hi={index:j,sensor:ee.sensorLabel,timeUtc:ee.timeUtc??"",hoursBefore:ot}}}const K=m.fieldScale??ao;Hv(K,ii),si.build(Qa,m.bbox,[m.widthKm,m.depthKm],z=>(Qi(K,z)-ii.x)/Math.max(.001,ii.y-ii.x),xs,ui),Pl.value=Y?1:0}}else Rn=void 0,gs="",bo.value=0,hi=void 0;const Va=(kt-Al)/nv;if(Ae&&Va>=0&&Va<1){const T=.5*(Math.abs(qa.x)*m.widthKm+Math.abs(qa.y)*m.depthKm)+1.5;qa.z=-T+2*T*Va,qa.w=1}else qa.w=0;Hl!==m.key&&(Hl=m.key,Gl=Ae&&!xe.some(T=>T.some(H=>H.hidden||H.revealed))),An.value=D.lerp(An.value,Gl&&!c.holdoutViirs?1:0,E);const st=Ae&&m.runId?vl.get(m.runId):void 0;if(st&&!c.backdrop){_l!==m.key&&(_l=m.key,xn=xe.map(X=>{var J;return Date.parse(((J=X[0])==null?void 0:J.timeUtc)??"")}));const T=D.clamp(oe,0,1)*Math.max(1,xe.length-1),H=Math.min(xe.length-1,Math.floor(T)),O=Math.min(xe.length-1,H+1),N=xn[H],Y=xn[O];if(Number.isFinite(N)&&Number.isFinite(Y)){const X=N+(Y-N)*(T-H)+st.info.stepMs;Tl!==m.key&&(Tl=m.key,dn=null),Te.length>0&&Te.every(J=>J.revealed||ma(J,c.holdoutViirs))&&(dn=ye),gl.value=ha.sync(st,m.key,X,dn)}else ha.clear()}else ha.clear();L.uLipariTex.value=ha.grid.x>0?ha.texture:je,Sl.value=ha.grid.x>0&&ha.declaredGiven?1:0,bn.value=D.lerp(bn.value,c.chanceSquares?1:0,E);{const T=!!(c.filmMove??Fc),H=D.clamp((kt-zl)/(T?hv:uv),0,1),O=T?H*H*(3-2*H):1-(1-H)*(1-H);vs.z=H>=1?1e4:D.lerp(Ll,Nl,O);const N=bf();Cl.set(N??-1,_.domElement.width),N!==null&&(vs.z=1e4)}const Pa=Ae&&Te.length>0&&Te.every(T=>T.revealed||ma(T,c.holdoutViirs))?1:0;un.value=D.lerp(un.value,Pa,1-Math.exp(-v*6)),xl.value=Ae&&m.answeredByOther?1:0,gn=D.lerp(gn,(!Ae||Qa.length>0?1:.5*bo.value)*Ja.value,1-Math.exp(-v*4)),L.uPixelOutline.value=D.lerp(L.uPixelOutline.value,c.detectionPixels?1:0,E),En.value=C?0:D.smoothstep($.distance,8.5,15),yo.value=D.lerp(yo.value,(C?1:D.lerp(Ev,Rv,En.value))*Dv((Bi=m.pack)==null?void 0:Bi.pictureMedianLuma),y),Mo=Ae&&Te[0]?{index:ye,sensor:Te[0].sensorLabel,timeUtc:Te[0].timeUtc??"",isDay:Te[0].isDay!==!1,hidden:Te.every(T=>T.revealed||ma(T,c.holdoutViirs))&&!Te.some(T=>T.revealed&&!T.revealedByLook)}:void 0,L.uFireHist.value=Ae?si.lightTexture:At(m).texture,yn=void 0;let qt=null;if(c.dayPicture&&Ae&&c.inWorkspace&&((zo=Te[0])!=null&&zo.timeUtc)&&m.runId){const T=(Mo==null?void 0:Mo.hidden)===!0,H=Te.find(J=>!ma(J,c.holdoutViirs)&&!J.revealed)??Te[0],O=T?"MODIS_AQUA":av(H.sensorLabel)??"MODIS_AQUA",N=Te[0].timeUtc.slice(0,10),Y=La(g.current,`/api/gibs/day?region_id=${encodeURIComponent(m.regionId)}&day=${N}&platform=${O}&kind=${c.dayPicture}`);let X=ni.get(Y);X===void 0&&(ni.set(Y,"loading"),X="loading",U.load(Y,J=>{J.colorSpace=ut,J.anisotropy=P,J.wrapS=Ve,J.wrapT=Ve,ni.set(Y,J)},void 0,()=>ni.set(Y,"missing"))),X!=="loading"&&X!=="missing"&&(qt=X),yn={state:X==="loading"?"loading":X==="missing"?"missing":"shown",platform:O,kind:c.dayPicture,day:N,insteadOfHidden:T}}if(qt){L.uSatNext.value=qt,L.uSatPrev.value=qt,L.uSatSharpen.value=0;const T=qt.image;L.uOrthoTexelKm.value=m.widthKm/Math.max(1,(T==null?void 0:T.width)??256),ri=!0,wn.value=dv,Mn.value=c.dayPicture==="false_color"?1:0}else ri&&(L.uSatNext.value=m.satTex,L.uSatPrev.value=ie.satTex,L.uSatSharpen.value=m.sharpen,L.uOrthoTexelKm.value=m.orthoTexelKm,ri=!1,wn.value=0,Mn.value=0);Il.value=m.runId===null?0:1;const oa=c.backdrop?1:qt?0:Ae&&((Uo=Te[0])==null?void 0:Uo.isDay)===!1||m.runId===null?1:0;Za.value=D.lerp(Za.value,oa,1-Math.exp(-v*2.4)),Yl.value=Za.value;const Ya=m.fieldScale??ao;Fl.set(Ya.kind==="linear"?0:1,Ya.maxMwKm2,Ya.minMwKm2),Uv(Ya,Dl),kl.set(Ae?1:0,Ae?1:0),Mu(Te.find(T=>T.family==="modis"),Ji,Ao),Mu(Te.find(T=>T.family==="viirs"&&!ma(T,c.holdoutViirs)),io,_o),tc.set(Ao.axisEast,Ao.axisNorth,Ao.nadirKm,Ao.valid?1:0),ac.set(_o.axisEast,_o.axisNorth,_o.nadirKm,_o.valid?1:0),zi=D.lerp(zi,re==="observer"?1:0,y),!pc&&re==="observer"&&(pc=!0,ts.loadModels("/isogon/"));{const T=D.smoothstep($.distance,8.5,11.5);if(zn=D.lerp(zn,re==="observer"?T:0,y),xi.length=0,zi>=.01){let H=!1,O=!1;for(const N of Te){if(xi.length>=Yu)break;if(ma(N,c.holdoutViirs)||c.observerFilter==="modis"&&N.family!=="modis"||c.observerFilter==="viirs"&&N.family!=="viirs")continue;const Y=N.family==="modis"?!H:!O;N.family==="modis"?H=!0:O=!0,xi.push({sensorLabel:N.sensorLabel,family:N.family,azimuthDeg:N.azimuthDeg,scanAngleDeg:N.scanAngleDeg,orbitNode:N.orbitNode,groundStrip:Y})}}ts.update(xi,{sky:zn,strip:zi,dtSec:v,sampleTerrainY:Mt,slabWidth:Je.width,slabDepth:Je.depth,unitsPerMetre:m.frame.unitsPerMetre}),sc.set(ts.strips.modis.alongTrackKm,ts.strips.modis.strength,ts.strips.viirs.alongTrackKm,ts.strips.viirs.strength)}kn.position.copy(k.position);{const T=D.lerp(ie.minElevM,m.minElevM,sa),H=Math.max(.05,(T+k.position.y/m.frame.unitsPerMetre[1])*.001);es.uCamAltKm.value=H,be=D.lerp(be,C||c.inWorkspace&&(c.cleanHud||c.cinemaActive)?1:0,y),os=D.lerp(os,C?1:0,y),es.uSkyExposure.value=D.lerp(vr,D.lerp(Yd,Kp,os),be),L.uLatticeMix.value=1-os;const O=Ka??c.cameraPreset,N=c.inWorkspace?O==="region"||O==="canyon"&&m.observerDataset.dataSource==="firms"?1:1-D.smoothstep($.distance,8.5,11.5):C?1:0,Y=m.context!==null&&!_a;Ta=Ha?Y?N:0:D.lerp(Ta,Y?N:0,y),L.uContextMix.value=Ta,gi.mesh.visible=Ta>.003,Fo.visible=os<.5&&Ta<.5,mi.visible=os<.5&&Ta<.5,L.uSkyExposure.value=es.uSkyExposure.value,L.uEdgeFade.value=D.lerp(L.uEdgeFade.value,m.context?0:c.inWorkspace?1-D.smoothstep($.distance,8.5,11.5):C&&(Si.floorShare>0||Si.seaShare>0)?1:0,y);const X=Math.max(L.uEdgeFade.value,Ta);Pn.uniforms.uShadowMix.value=1-X,es.uFloorHaze.value=D.lerp(.3,D.lerp(1,Vp,X),be),es.uFloorColor.value.set(.044,.06,.094).lerp(Yv,be),Ro.update(_,fi,H)}k.updateMatrixWorld();const Xe=Math.max(Cs(ie.maxElevM,ie),Cs(m.maxElevM,m));Z.enabled=Re>.01,C&&(k.updateMatrixWorld(),Pp(k,Dp(_s??Wu),mc)),L.uSmokeShadowMix.value=Z.enabled?1:0,Z.enabled&&Z.update({camera:k,slabWidth:Je.width,slabDepth:Je.depth,reliefTop:Xe,heightPrev:we(ie),heightNext:we(m),morph:sa,field0:wa,field1:ua,detection0:m.observerDataset.dataSource==="firms"?ti:null,detection1:m.observerDataset.dataSource==="firms"?ai:null,frameMix:L.uFrameMix.value,windUv:In,sunDir:Me,sunColor:_n,time:kt,opacity:Re,cutawayMix:L.uCutawayMix.value,cutawayPlane:Vu,cutawayDir:ql,lid:mc,lidAmount:os,clearRadius:Gp,thinOverFire:Ae?.82:0,night:Za.value,fireLight:gn}),V.render(v);const Ge=c.onCurtainScreen;Ge&&!Gc&&(Ge({near:{x:0,y:0},far:{x:0,y:0},modisSide:"left",visible:!1}),Gc=!0);const ue=c.tileBoard,qe=!!ue&&ue.cols>=1&&ue.rows>=1&&ue.cols*ue.rows<=64;if(!!ue!==zc&&(zc=!!ue,c.cameraPreset==="region"&&(Ts=!0)),ue&&qe){fn.set(ue.cols,ue.rows);const T=ue.cols*ue.rows;for(let O=0;O<T;O++){const N=ue.tiles[O];El[O].set(D.clamp((N==null?void 0:N.level)??0,0,1),N!=null&&N.looked?1:0,N!=null&&N.chosen?1:0,N!=null&&N.closed?1:0)}const H=ue.pickable&&!ka&&Number.isFinite(ki)?Wc(ki,er,ue.cols,ue.rows):null;if(mn.value=H??-1,H!==oi&&(oi=H,(Ys=c.onTileHover)==null||Ys.call(c,H)),c.onTileAnchors){vn.length=0;for(let O=0;O<T;O++){const N=O%ue.cols/ue.cols,Y=1-Math.floor(O/ue.cols)/ue.rows;et.set($t(N),Mt(N,Y),jt(Y)).project(k);const X=(et.x*.5+.5)*nt,J=(-et.y*.5+.5)*ct;vn.push({tile:O,x:X,y:J,visible:et.z>-1&&et.z<1&&X>=0&&X<=nt&&J>=0&&J<=ct})}c.onTileAnchors(vn.slice())}}else fn.set(0,0),mn.value=-1,oi!==null&&(oi=null,(Oi=c.onTileHover)==null||Oi.call(c,null));const Dt=!!(c.onThings&&c.things&&Object.values(c.things).some(T=>T.kind==="fire"));if((c.onFireAnchor||Dt)&&c.inWorkspace&&Ae){const T=Qa.length>0?Qa:xs,H=st?Math.round(ha.grid.x)+":"+ha.stepKey:"",O=`${gs}:${T.length}:${T.length===0?H:""}`;if(O!==So){So=O;const[Y,X,J,Pe]=m.bbox;if(T.length>0){To="detections",ft=new Float32Array(T.length*3);const K=new Float32Array(T.length*2);T.forEach((z,j)=>{ft[j*3]=(z.lon-Y)/Math.max(1e-9,J-Y),ft[j*3+1]=(z.lat-X)/Math.max(1e-9,Pe-X),ft[j*3+2]=Math.max(1,z.frpMw),K[j*2]=.5*z.acrossTrackKm/Math.max(1e-6,m.widthKm),K[j*2+1]=.5*z.alongTrackKm/Math.max(1e-6,m.depthKm)}),ws=Vo(ft,D.clamp(Math.round(m.widthKm/rh),8,512),D.clamp(Math.round(m.depthKm/rh),8,512),K)}else{To="estimate";const K=st!=null&&st.declared&&st.declared.nx===st.info.nx&&st.declared.ny===st.info.ny?st.declared.byFrame.get(ye):void 0;if(st&&K&&K.length>0){const{nx:z,ny:j}=st.info;ft=new Float32Array(K.length*3),K.forEach((ee,Ie)=>{ft[Ie*3]=(ee%z+.5)/z,ft[Ie*3+1]=1-(Math.floor(ee/z)+.5)/j,ft[Ie*3+2]=1})}else ft=st?ha.cellsAbove(st,Lv,z=>gh(m.fieldScale??ao,z)):new Float32Array(0);ws=st?Vo(ft,st.info.nx,st.info.ny):{patchOf:new Uint16Array(0),sizes:[]}}}const N=ft.length/3;if(N===0)Eo&&(($s=c.onFireAnchor)==null||$s.call(c,null)),Eo=!1,di="",da=null;else{const Y=`${So}:${ie.key}:${m.key}`,X=k.matrixWorld.elements,J=k.projectionMatrix.elements;let Pe=da!==null&&Y===di&&Jt[0]===ye&&Jt[1]===sa&&Jt[2]===nt&&Jt[3]===ct&&Jt[4]===Je.width&&Jt[5]===Je.depth;if(Pe){for(let K=0;K<16;K++)if(Jt[6+K]!==X[K]||Jt[22+K]!==J[K]){Pe=!1;break}}if(!Pe){let K=0,z=0,j=0,ee=1/0,Ie=-1/0,ot=1/0,vt=-1/0;const rt=Math.min(Or,ws.sizes.length);for(let me=0;me<rt;me++)Qe[me*7]=0,Qe[me*7+1]=0,Qe[me*7+2]=0,Qe[me*7+3]=1/0,Qe[me*7+4]=1/0,Qe[me*7+5]=-1/0,Qe[me*7+6]=-1/0;for(let me=0;me<N;me++){const lt=ft[me*3],ya=ft[me*3+1],ba=ft[me*3+2];K+=lt*ba,z+=ya*ba,j+=ba;const Ut=ws.patchOf[me]<rt?ws.patchOf[me]*7:-1;if(Ut>=0&&(Qe[Ut]+=lt*ba,Qe[Ut+1]+=ya*ba,Qe[Ut+2]+=ba),et.set($t(lt),Mt(lt,ya),jt(ya)).project(k),et.z<=-1||et.z>=1)continue;const Ds=(et.x*.5+.5)*nt,Xs=(-et.y*.5+.5)*ct;ee=Math.min(ee,Ds),Ie=Math.max(Ie,Ds),ot=Math.min(ot,Xs),vt=Math.max(vt,Xs),Ut>=0&&(Qe[Ut+3]=Math.min(Qe[Ut+3],Ds),Qe[Ut+4]=Math.min(Qe[Ut+4],Xs),Qe[Ut+5]=Math.max(Qe[Ut+5],Ds),Qe[Ut+6]=Math.max(Qe[Ut+6],Xs))}let gt=0,Vt=0;const xt=(me,lt)=>{const ya=Mt(me,lt);if(et.set($t(me),ya,jt(lt)).project(k),gt=(et.x*.5+.5)*nt,Vt=(-et.y*.5+.5)*ct,!(et.z>-1&&et.z<1&&gt>=0&&gt<=nt&&Vt>=0&&Vt<=ct))return!1;const ba=k.position.x,Ut=k.position.y,Ds=k.position.z,Xs=$t(me),ud=jt(lt);for(let lr=1;lr<48;lr++){const cr=lr/48,ur=wi(ba+(Xs-ba)*cr),hr=Mi(Ds+(ud-Ds)*cr);if(!(ur<0||ur>1||hr<0||hr>1)&&Mt(ur,hr)>Ut+(ya-Ut)*cr+.012)return!1}return!0};for(let me=0;me<rt;me++)Ms[me*3]=1/0;const Yt=m.widthKm,ja=m.depthKm;for(let me=0;me<N;me++){const lt=ws.patchOf[me];if(lt>=rt)continue;const ya=(ft[me*3]-Qe[lt*7]/Qe[lt*7+2])*Yt,ba=(ft[me*3+1]-Qe[lt*7+1]/Qe[lt*7+2])*ja,Ut=ya*ya+ba*ba;Ut<Ms[lt*3]&&(Ms[lt*3]=Ut,Ms[lt*3+1]=ft[me*3],Ms[lt*3+2]=ft[me*3+1])}const Hi=[];for(let me=0;me<rt;me++){const lt=me*7,ya=xt(Ms[me*3+1],Ms[me*3+2]);Hi.push({x:gt,y:Vt,left:Number.isFinite(Qe[lt+3])?Qe[lt+3]:gt,top:Number.isFinite(Qe[lt+4])?Qe[lt+4]:Vt,right:Number.isFinite(Qe[lt+5])?Qe[lt+5]:gt,bottom:Number.isFinite(Qe[lt+6])?Qe[lt+6]:Vt,cells:ws.sizes[me],visible:ya})}const Gi=xt(K/j,z/j),nr=gt,rr=Vt;da={frame:ye,from:To,x:nr,y:rr,left:Number.isFinite(ee)?ee:nr,top:Number.isFinite(ot)?ot:rr,right:Number.isFinite(Ie)?Ie:nr,bottom:Number.isFinite(vt)?vt:rr,visible:Gi,patches:Hi},di=Y,Jt[0]=ye,Jt[1]=sa,Jt[2]=nt,Jt[3]=ct,Jt[4]=Je.width,Jt[5]=Je.depth;for(let me=0;me<16;me++)Jt[6+me]=X[me],Jt[22+me]=J[me]}(Bo=c.onFireAnchor)==null||Bo.call(c,da),Eo=!0}}else Eo&&((Oo=c.onFireAnchor)==null||Oo.call(c,null),Eo=!1,So="",di="",da=null);if(c.onThings&&c.things){const T={};let H="";const O=c.tileBoard&&c.tileBoard.cols>=1&&c.tileBoard.rows>=1?c.tileBoard:null;for(const[N,Y]of Object.entries(c.things)){let X=null;if(Y.kind==="fire")X=da&&c.inWorkspace&&Ae?{x:da.x,y:da.y,left:da.left,top:da.top,right:da.right,bottom:da.bottom,visible:da.visible}:null;else if(Y.kind==="tile"){if(O&&Y.tile>=0&&Y.tile<O.cols*O.rows){const J=Y.tile%O.cols,Pe=Math.floor(Y.tile/O.cols);X=Rl(J/O.cols,(J+1)/O.cols,1-(Pe+1)/O.rows,1-Pe/O.rows)}}else if(Y.kind==="detection"&&Ae){const Pe=(Y.revealed?xs:Qa)[Y.index];if(Pe){const[K,z,j,ee]=m.bbox,Ie=(Pe.lon-K)/Math.max(1e-9,j-K),ot=(Pe.lat-z)/Math.max(1e-9,ee-z),vt=.5*Math.max(Pe.acrossTrackKm,Pe.alongTrackKm,.1),rt=vt/Math.max(.001,m.widthKm),gt=vt/Math.max(.001,m.depthKm);X=Rl(Ie-rt,Ie+rt,ot-gt,ot+gt)}}T[N]=X,H+=X?`${N}:${Math.round(X.left)},${Math.round(X.top)},${Math.round(X.right)},${Math.round(X.bottom)},${X.visible?1:0};`:`${N}:-;`}H!==pn&&(pn=H,c.onThings(T))}else pn="";const pt=h.current;if(pt){let T=!1;if(c.inWorkspace&&!C&&!c.cinemaActive&&$.distance>cv){const H=[[0,0,1,0,m.widthKm],[1,0,1,1,m.depthKm],[1,1,0,1,m.widthKm],[0,1,0,0,m.depthKm]];let O=H[0],N=1/0;for(const j of H){const ee=$t((j[0]+j[2])*.5)-k.position.x,Ie=jt((j[1]+j[3])*.5)-k.position.z,ot=ee*ee+Ie*Ie;ot<N&&(N=ot,O=j)}const Y=O[4];let X=1;for(const j of[1,2,5,10,20,50,100])j<=Y*.3&&(X=j);const J=mt??{left:0,top:0,right:1,bottom:1},Pe=(j,ee,Ie)=>j[0]-ee>=J.left*nt+12&&j[0]+ee<=J.right*nt-12&&j[1]-Ie>=J.top*ct+12&&j[1]+Ie<=J.bottom*ct-12;let K=null,z=null;for(let j=qu;j+X/Y<=1-qu+1e-6;j+=.06){const ee=xt=>{const Yt=j+xt/Y;return[O[0]+(O[2]-O[0])*Yt,O[1]+(O[3]-O[1])*Yt]},Ie=.07*(1-Ta);let ot=1/0;for(let xt=0;xt<=8;xt++){const[Yt,ja]=ee(X*xt/8);ot=Math.min(ot,Mt(Yt,ja))}const vt=xt=>{const[Yt,ja]=ee(xt);return et.set($t(Yt),ot-Ie,jt(ja)).project(k),et.z<=-1||et.z>=1?null:[(et.x*.5+.5)*nt,(-et.y*.5+.5)*ct]},rt=vt(0),gt=vt(X);if(!rt||!gt)continue;const Vt=gt[0]>=rt[0]?gt:rt;if(Pe(rt,2,10)&&Pe(gt,2,10)&&Pe([Vt[0]+36,Vt[1]],30,12)){K=rt,z=gt;break}}if(K&&z){const j=Math.hypot(z[0]-K[0],z[1]-K[1]);if(j>40){let ee=-(z[1]-K[1])/j,Ie=(z[0]-K[0])/j;Ie>0&&(ee=-ee,Ie=-Ie);const ot=(xt,Yt)=>`M${xt[0].toFixed(1)},${xt[1].toFixed(1)} L${(xt[0]+ee*Yt).toFixed(1)},${(xt[1]+Ie*Yt).toFixed(1)}`,vt=`${ot(K,7)} M${K[0].toFixed(1)},${K[1].toFixed(1)} L${z[0].toFixed(1)},${z[1].toFixed(1)} ${ot(z,7)}`;vt!==Ul&&(Ul=vt,(js=r.current)==null||js.setAttribute("d",vt));const rt=u.current,gt=z[0]>=K[0]?z:K,Vt=`${X} km|${(gt[0]+8).toFixed(1)}|${(gt[1]+4).toFixed(1)}`;if(rt&&Vt!==Bl){Bl=Vt;const[xt,Yt,ja]=Vt.split("|");rt.textContent=xt,rt.setAttribute("x",Yt),rt.setAttribute("y",ja)}T=!0}}}T!==Ol&&(Ol=T,pt.style.opacity=T?"1":"0")}const le=c.inWorkspace&&!c.cleanHud&&!c.cinemaActive,_e=Br(m),[ke,Ze,He,Fe]=m.bbox,Ue=Math.max(1e-4,He-ke),Lt=Math.max(1e-4,Fe-Ze),Ke=[],Wt=232,is=mt?mt.left*nt+12:24,ns=Math.max(is,(mt?mt.right*nt-12:nt-356)-Wt),zt=mt?mt.top*ct+12:68,Nt=Math.max(zt,mt?mt.bottom*ct-76:Math.max(160,ct-134)),rs=mt?(mt.left+mt.right)*.5*nt:nt*.44;for(let T=0;T<3;T++){const H=_e[T];if(!le||!H){Ke.push({ax:0,ay:0,bx:0,by:0,valid:!1});continue}const O=D.clamp((H.lon-ke)/Ue,.04,.96),N=D.clamp((H.lat-Ze)/Lt,.04,.96),Y=Mt(O,N)+.05;if(et.set($t(O),Y,jt(N)).project(k),et.z>=1||et.z<=-1){Ke.push({ax:0,ay:0,bx:0,by:0,valid:!1});continue}const X=(et.x*.5+.5)*nt,J=(-et.y*.5+.5)*ct,K=(T===1||X+108>ns||X>rs?-1:1)>0?X+56:X-56-Wt,z=D.clamp(K,is,ns),j=D.clamp(J-(T===0?64:T===1?48:-44),zt,Nt);Ke.push({ax:X,ay:J,bx:z,by:j,valid:!0})}const ks=240,Fs=62;for(let T=0;T<2;T++)for(let H=0;H<Ke.length;H++)if(Ke[H].valid)for(let O=H+1;O<Ke.length;O++){if(!Ke[O].valid)continue;const N=Ke[O].bx-Ke[H].bx,Y=Ke[O].by-Ke[H].by;if(Math.abs(N)<ks&&Math.abs(Y)<Fs){const X=(Fs-Math.abs(Y))*.55*(Y>=0?1:-1);Ke[H].by=D.clamp(Ke[H].by-X,zt,Nt),Ke[O].by=D.clamp(Ke[O].by+X,zt,Nt)}}for(let T=0;T<3;T++){const H=Ke[T],O=i.current[T],N=l.current[T],Y=o.current[T];if(!H||!H.valid){O&&(O.style.opacity="0"),N&&(N.style.opacity="0",N.style.pointerEvents="none",N.style.visibility="hidden"),Y&&(Y.style.opacity="0");continue}if(O&&(O.style.opacity="1",O.style.transform=`translate3d(${H.ax.toFixed(1)}px, ${H.ay.toFixed(1)}px, 0) translate(-50%, -50%)`),N&&(N.style.opacity="1",N.style.pointerEvents="auto",N.style.visibility="visible",N.style.transform=`translate3d(${H.bx.toFixed(1)}px, ${H.by.toFixed(1)}px, 0)`),Y){const X=H.ax+(H.bx-H.ax)*.42,J=H.by+22,Pe=H.bx>H.ax?H.bx:H.bx+(N?N.offsetWidth:Wt);Y.setAttribute("points",`${H.ax.toFixed(1)},${H.ay.toFixed(1)} ${X.toFixed(1)},${J.toFixed(1)} ${Pe.toFixed(1)},${J.toFixed(1)}`),Y.style.opacity="1"}}if(Ha){const T=m.observerDataset.dataSource==="firms"&&m.runId!==null,H=T&&!_a&&(m.pack?m.contextState!=="loading":m.packManifest===null||m.packState==="failed");Yn=H&&f<bv?Yn+v:0;const O=T?m.pack?m.contextState==="loading"?3:4:m.packManifest&&m.packState!=="failed"?2:H?4:1:0;O!==Cc&&(Cc=O,Lc=kt);const N=$r[O],Y=$r[Math.min($r.length-1,O+1)],X=N+(Y-N)*(1-Math.exp(-(kt-Lc)/Tv));if(Ei=Math.max(Ei,D.lerp(Ei,X,y)),s.current&&(s.current.style.transform=`scaleX(${Ei.toFixed(4)})`),Yn>yv||kt>Sv){Ha=!1,Co=kt,s.current&&(s.current.style.transform="scaleX(1)");const J=a.current;J&&(J.style.transition=`opacity ${Yr}s ease-out`,J.style.opacity="0"),pd(),(Ho=c.onPictureReady)==null||Ho.call(c);for(const Pe of Nc.splice(0))Pe()}}else Co>=0&&kt-Co>Yr+.1&&a.current&&a.current.style.display!=="none"&&(a.current.style.display="none");or+=1,Ui+=v;const Ma=Ha?"holding":Co>=0&&kt-Co<Yr?"fading":"shown",fa=Ma!==Ic;if(Ic=Ma,Ui>=.32||fa){const T=or/Math.max(.001,Ui);if(ir=ir*.55+Math.min(120,T)*.45,or=0,Ui=0,kt-au>=.3||fa){au=kt;const H={fps:Math.round(ir),renderScale:+Ai.toFixed(2),slowDevice:B,vertexCount:pi.geometry.getAttribute("position").count+Fo.geometry.getAttribute("position").count,orthoResolution:m.orthoLabel,demResolution:m.demLabel,activeTheaterId:c.activeTheaterId,slewActive:te||_a,cinemaProgress:ne,wavePosition:0,imageryAttribution:Wv(m),missingFiles:sv(m,b.current),film:ea?{move:ea,progress:Ks}:void 0,verticalExaggeration:al,landingStandpoint:C&&Oa?Si:void 0,intensityLegend:iv(m),realPass:Rn,lastSeen:hi,passOnShow:Mo,dayPicture:yn,picture:Ma,regionGrid:c.regionGridDivisions?ad(m,c.regionGridDivisions):void 0};(Go=c.onTelemetry)==null||Go.call(c,H)}}};return ar=requestAnimationFrame(su),()=>{var v;S=!0,cancelAnimationFrame(ar),Bc.disconnect(),ss==null||ss.removeEventListener("change",Zn),Fa.removeEventListener("pointerdown",Vc),window.removeEventListener("pointermove",Yc),window.removeEventListener("pointerup",$c),Fa.removeEventListener("pointerleave",jc),Fa.removeEventListener("wheel",Xc),Di.removeEventListener("change",Zc),Fa.removeEventListener("contextmenu",qc),$l.dispose(),jl.dispose(),Ro.dispose(),Dn.dispose(),Pn.dispose(),Nn.dispose(),uc.dispose(),hc.dispose(),dc.dispose(),fc.dispose();for(const c of ge)c.dispose();wa.dispose(),ua.dispose(),Aa==null||Aa.dispose(),ti.dispose(),ai.dispose(),si.dispose(),ha.dispose(),je.dispose(),ys==null||ys.dispose(),ko==null||ko.dispose(),rc.dispose(),Cn.dispose(),Ln.dispose();for(const c of ra.values())wc(c);ra.clear(),gi.dispose(),ts.dispose(),G.environment=null,ht.dispose();const n=new Set,f=c=>{!c||n.has(c)||(n.add(c),c.dispose())};for(const c of new Set([...ce.values(),...ae.values(),...Oe,ie,m]))!c.pack&&c.lite===null&&(f(c.demTex),f(c.satTex)),f((v=c.fireHistory)==null?void 0:v.texture),f(c.shadow);V.dispose(),_.dispose(),Fa.parentElement===x&&x.removeChild(Fa),A.current=null}},[]),Pt.useEffect(()=>{var x;(x=A.current)==null||x.applyCameraPreset()},[e.cameraPreset,e.inWorkspace,e.mode]),Pt.useEffect(()=>{var x;(x=A.current)==null||x.syncCinemaStart(e.cinemaActive)},[e.cinemaActive]);const R=Pt.useRef(null),w=Pt.useRef(e.activeTheaterId);return Pt.useEffect(()=>{const x=A.current;if(!x)return;const S=e.slewRequest;if(S&&S.nonce!==R.current){R.current=S.nonce,w.current=S.targetTheaterId,x.triggerSlew(S.targetTheaterId);return}e.activeTheaterId!==w.current&&(w.current=e.activeTheaterId,x.triggerSlew(e.activeTheaterId))},[e.activeTheaterId,e.slewRequest]),Pt.useEffect(()=>{const x=e.activeRun,S=A.current;if(!x||!S)return;let _=!1;const B=S.takeRunBundle(x.run_id);if(B){S.activateBundle(B,B.regionId!==S.onScreenRegionId());return}return(async()=>{var I;try{const P=S.bundleCache.get(x.region.id),U=Nu(Rh(x.assets.terrain_pack))!==null,G=x.assets.dem_hires_f32_url&&!U?La(g.current,x.assets.dem_hires_f32_url):null,k=La(g.current,x.assets.dem_f32_url),V=La(g.current,x.assets.satellite_url),Z=!!(g.current.filmMove??Xu())||U,ge=La(g.current,x.assets.reconstruction_u8_url),we=x.source==="firms",Re=async()=>{if(G){const Gt=await fetch(G).catch(()=>null);if(Gt&&Gt.ok)return Gt.arrayBuffer()}const je=await fetch(k).catch(()=>null);return je&&je.ok?je.arrayBuffer():null},be=()=>new Promise(je=>{if(Z){je(null);return}S.texLoader.load(V,Gt=>{Gt.colorSpace=ut,Gt.anisotropy=S.maxAnisotropy,Gt.minFilter=Xa,Gt.magFilter=Be,Gt.wrapS=Ve,Gt.wrapT=Ve,je(Gt)},void 0,()=>je(null))}),[Me,pe,ht]=await Promise.all([Re(),be(),we?Promise.resolve(null):fetch(ge).catch(()=>null)]),ce=ht&&ht.ok?await ht.arrayBuffer():null;if(_)return;const ae=lh(x.region.id)?Xo[x.region.id]:null,Rt=x.region.bbox,At=x.observer_passes?zd(x.observer_passes,Rt):Ur(),Ht=At.dataSource==="firms",ie=[],m=P&&!(Ht&&P.noRealGround)?P:void 0,Oe=P&&!(Ht&&P.noRealPicture)?P:void 0;Ht&&!Me&&!m&&ie.push("elevation"),Ht&&!pe&&!Oe&&!Z&&ie.push("imagery"),Ht&&!ce&&!we&&ie.push("field");const tt=Me?Ls(new Float32Array(Me),!0):m?{texture:m.demTex,aligned:m.alignedDem,gridRes:m.demGridRes,minElev:m.minElevM,maxElev:m.maxElevM}:Ls(Ht?new Float32Array(4096).fill(Number.isFinite(x.region.min_elev_m)?x.region.min_elev_m:0):ru("plumas_ca",256),!1),ia=ce?cu(new Uint8Array(ce),!0):Ht||!P?{buffer:zr(),frames:oo}:{buffer:P.tensor,frames:P.frameCount},aa=pe??(Oe==null?void 0:Oe.satTex)??(Ht?tv():null)??lu(ae?ae.id:"plumas_ca",tt.aligned,tt.gridRes,tt.minElev,tt.maxElev,S.maxAnisotropy),_t=pe&&typeof((I=pe.image)==null?void 0:I.width)=="number"?pe.image.width:2048,na=Xr(x.region.id,Rt,tt.aligned,tt.gridRes,ia.buffer,ia.frames),ca=x.region.min_elev_m<=1.5,Ne={key:`run-${x.run_id}`,regionId:x.region.id,runId:x.run_id,missingFiles:ie.length>0?ie:void 0,demTex:tt.texture,alignedDem:tt.aligned,demGridRes:tt.gridRes,minElevM:Number.isFinite(x.region.min_elev_m)?Math.min(tt.minElev,x.region.min_elev_m):tt.minElev,maxElevM:Number.isFinite(x.region.max_elev_m)?Math.max(tt.maxElev,x.region.max_elev_m):tt.maxElev,satTex:aa,orthoLabel:pe?_t>=1600?"2K":"1K":(Oe==null?void 0:Oe.orthoLabel)??(Ht?"not loaded":"drawn stand-in"),demLabel:Me||m||!Ht?`${tt.gridRes}²`:"not loaded",noRealGround:Me?void 0:m?m.noRealGround:!0,noRealPicture:pe?void 0:Oe?Oe.noRealPicture:!0,tensor:ia.buffer,frameCount:ia.frames,bbox:Rt,windDirUv:[...Pv],hasSeaCoast:ca,observerDataset:At,findings:na.anchors,callouts:na.callouts,fieldScale:Bd(x.encoding),residenceHours:Ud(x.model)??void 0,declared:Mr(x.declared_cells),answeredByOther:ev(x),fireHistory:null,...jr(Math.max(18,x.region.width_km||60),Math.max(12,x.region.depth_km||Lr(Rt)),x.assets.terrain_pack,_t,pe?uh:(Oe==null?void 0:Oe.attribution)??"")};S.storeRunBundle(x.region.id,x.run_id,Ne),we&&S.whenPictureReady(()=>{fetch(ge).then(je=>je.ok?je.arrayBuffer():null).then(je=>{if(!je)return;const Gt=cu(new Uint8Array(je),!0);S.patchRunTensor(x.run_id,Gt.buffer,Gt.frames)}).catch(()=>{})});const it=Od(x.belief_frames),dt=M.current,wa=it&&!dt.has(x.run_id)?[...dt.values()].find(je=>je.info.url===it.url&&je.info.steps===it.steps):void 0;if(it&&wa)for(dt.set(x.run_id,{info:it,bytes:wa.bytes,declared:Mr(x.declared_cells)});dt.size>6;)dt.delete(dt.keys().next().value);it&&!dt.has(x.run_id)&&S.whenPictureReady(()=>{dt.has(x.run_id)||fetch(La(g.current,it.url)).then(je=>je.ok?je.arrayBuffer():null).then(je=>{if(!je||je.byteLength!==it.steps*it.nx*it.ny*2){b.current.add(x.run_id);return}for(dt.set(x.run_id,{info:it,bytes:new Uint8Array(je),declared:Mr(x.declared_cells)});dt.size>6;)dt.delete(dt.keys().next().value)}).catch(()=>{b.current.add(x.run_id)})});const ua=g.current.activeTheaterId;(!lh(x.region.id)||x.region.id===ua)&&S.activateBundle(Ne,!0)}catch{}})(),()=>{_=!0}},[e.activeRun,e.apiBase]),Zt.jsxs("div",{ref:t,tabIndex:0,role:"application","aria-label":"3D terrain of the place, with the fire on it",onKeyDown:x=>{var S;!e.inWorkspace&&x.key==="Enter"&&((S=e.onEnterWorkspace)==null||S.call(e))},style:{position:"relative",width:"100%",height:"100%",overflow:"hidden",outline:"none",backgroundColor:"#080b11",cursor:e.inWorkspace?"grab":"pointer"},children:[Zt.jsxs("div",{"aria-hidden":!e.inWorkspace||e.cleanHud||e.cinemaActive,style:{position:"absolute",inset:0,pointerEvents:"none",zIndex:5},children:[Zt.jsxs("svg",{width:"100%",height:"100%",style:{position:"absolute",inset:0,overflow:"visible",pointerEvents:"none"},children:[[0,1,2].map(x=>Zt.jsx("polyline",{ref:S=>{o.current[x]=S},fill:"none",stroke:d[x]&&e.selectedFindingId===d[x].id?"rgba(155, 227, 255, 0.88)":"rgba(245, 246, 250, 0.34)",strokeWidth:"1",style:{opacity:0,transition:"stroke 160ms ease"}},x)),Zt.jsxs("g",{ref:h,className:"stage-scale",style:{opacity:0},children:[Zt.jsx("path",{ref:r,fill:"none",stroke:"rgba(243, 244, 246, 0.72)",strokeWidth:"1"}),Zt.jsx("text",{ref:u,fill:"rgba(243, 244, 246, 0.92)",stroke:"rgba(8, 11, 17, 0.72)",strokeWidth:"3",style:{fontFamily:"'IBM Plex Mono', ui-monospace, monospace",fontSize:"12px",paintOrder:"stroke"}})]})]}),[0,1,2].map(x=>{const S=d[x],_=!!(S&&e.selectedFindingId===S.id),B=(S==null?void 0:S.kind)==="uncertainty"?"#9be3ff":(S==null?void 0:S.kind)==="subpixel"?"#ffb36b":"#ff7849";return Zt.jsxs("div",{children:[Zt.jsx("div",{ref:I=>{i.current[x]=I},style:{position:"absolute",top:0,left:0,width:"14px",height:"14px",display:"flex",alignItems:"center",justifyContent:"center",color:B,fontFamily:"'IBM Plex Mono', ui-monospace, monospace",fontSize:"13px",fontWeight:600,lineHeight:1,textShadow:"0 1px 6px rgba(0, 0, 0, 0.9)",opacity:0,willChange:"transform, opacity"},children:"+"}),Zt.jsxs("button",{ref:I=>{l.current[x]=I},type:"button","data-stage-ui":"true",onClick:()=>{var I;S&&((I=e.onSelectFinding)==null||I.call(e,S))},style:{position:"absolute",top:0,left:0,minWidth:"188px",maxWidth:"248px",padding:"7px 10px",textAlign:"left",borderRadius:0,border:_?`1px solid ${B}`:"1px solid rgba(243, 244, 246, 0.24)",background:"rgba(10, 13, 19, 0.88)",color:"#f3f4f6",cursor:"pointer",opacity:0,visibility:"hidden",pointerEvents:"none",willChange:"transform, opacity"},children:[Zt.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"6px",fontFamily:"'Geist', -apple-system, sans-serif",fontSize:"13px",fontWeight:500,letterSpacing:"-0.01em",color:"#f3f4f6"},children:[Zt.jsx("span",{children:(S==null?void 0:S.title)??""}),Zt.jsx("span",{style:{width:"6px",height:"6px",borderRadius:0,backgroundColor:B,flexShrink:0}})]}),Zt.jsx("div",{style:{marginTop:"3px",fontFamily:"'IBM Plex Mono', ui-monospace, monospace",fontSize:"12px",fontVariantNumeric:"tabular-nums",color:B},children:(S==null?void 0:S.valueText)??""})]})]},x)})]}),Zt.jsx("div",{ref:a,"aria-hidden":"true","data-stage-cover":"",style:{position:"absolute",inset:0,zIndex:5,backgroundColor:"var(--sys-night, #080b11)",pointerEvents:"none"},children:Zt.jsx("div",{style:{position:"absolute",left:"50%",top:"50%",width:"240px",height:"1px",marginLeft:"-120px",background:"rgba(255, 255, 255, 0.10)"},children:Zt.jsx("div",{ref:s,style:{width:"100%",height:"100%",background:"rgba(255, 255, 255, 0.86)",transform:"scaleX(0)",transformOrigin:"left center"}})})})]})}export{Qv as EarthCutawayStage,Qv as default};

const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/GLTFLoader-C8Ag2Ruc.js","assets/three.module-CibWwfTb.js","assets/DRACOLoader-LNaB3iNp.js"])))=>i.map(i=>d[i]);
var ud=Object.defineProperty;var hd=(e,t,a)=>t in e?ud(e,t,{enumerable:!0,configurable:!0,writable:!0,value:a}):e[t]=a;var k=(e,t,a)=>hd(e,typeof t!="symbol"?t+"":t,a);import{a3 as hr,a4 as su,r as It,a5 as dd,a6 as ou,a7 as fd,j as Zt,a8 as md}from"./index-CCn31Biz.js";import{S as po,O as al,W as Qt,C as We,R as ro,L as Be,H as Ua,a as Ct,b as Et,M as ba,P as en,c as D,D as Ra,d as ta,e as uh,F as sl,N as vo,f as pd,g as ht,U as Bt,B as tn,h as ga,i as hh,V as W,j as iu,k as Ba,I as vd,T as ol,l as Za,m as Le,n as pa,o as dr,p as gd,q as xd,r as De,s as an,t as qi,u as so,v as Ls,w as wd,E as il,x as dh,y as Bs,z as nl,A as rl,G as fh,J as Md,K as yd,Q as mh,X as bd,Y as lo,Z as to,_ as Sd,$ as Td,a0 as Ed,a1 as Rd,a2 as Ad,a3 as fr,a4 as _d,a5 as kd,a6 as ph,a7 as Go,a8 as mr,a9 as Fd,aa as Dd,ab as Pd,ac as Id,ad as Cd,ae as Ld}from"./three.module-CibWwfTb.js";import{n as Nd,p as zd,a as Ud,b as Bd,D as ao,f as Zi,c as vh}from"./types-CZu1tyoc.js";const $i=6360,ll=60,gh=8,xh=1.2,co=[.005802,.013558,.0331],Od=.003996,ji=.00444,uo=[65e-5,.001881,85e-6],Hd=.8,hs=64,Ns=32,ho=-.2,Gd=192,Kd=108,fo=[5.25,5.05,4.8],Wd=.4,pr=.4,Vd=.72;function Yd(e){return Math.max(0,1-Math.abs(e-25)/15)}function wh(e,t){const a=$i+e,s=$i+ll,o=a*a*(t*t-1)+s*s,i=Math.max(0,-a*t+Math.sqrt(Math.max(0,o))),l=48,h=i/l;let r=0,c=0,d=0;for(let p=0;p<l;p++){const M=(p+.5)*h,b=Math.max(0,Math.sqrt(a*a+M*M+2*a*M*t)-$i);r+=Math.exp(-b/gh)*h,c+=Math.exp(-b/xh)*h,d+=Yd(b)*h}return[co[0]*r+ji*c+uo[0]*d,co[1]*r+ji*c+uo[1]*d,co[2]*r+ji*c+uo[2]*d]}function Mh(e,t){const a=wh(Math.max(0,e),Math.max(ho,t));return[Math.exp(-a[0]),Math.exp(-a[1]),Math.exp(-a[2])]}function $d(e,t,a){const s=Mh(e,t),o=[1.404,1.287,1.17];return a.set(.5*o[0]+.5*fo[0]*s[0]/Math.PI,.5*o[1]+.5*fo[1]*s[1]/Math.PI,.5*o[2]+.5*fo[2]*s[2]/Math.PI)}function jd(){const e=new Uint16Array(hs*Ns*4);for(let a=0;a<Ns;a++){const s=a/(Ns-1),o=s*s*ll;for(let i=0;i<hs;i++){const l=ho+i/(hs-1)*(1-ho),h=wh(o,l),r=(a*hs+i)*4;e[r]=Ra.toHalfFloat(Math.exp(-h[0])),e[r+1]=Ra.toHalfFloat(Math.exp(-h[1])),e[r+2]=Ra.toHalfFloat(Math.exp(-h[2])),e[r+3]=Ra.toHalfFloat(1)}}const t=new ta(e,hs,Ns,Ct,Ua);return t.minFilter=Be,t.magFilter=Be,t.wrapS=We,t.wrapT=We,t.generateMipmaps=!1,t.flipY=!1,t.needsUpdate=!0,t}function wt(e){const t=e.toPrecision(8);return/[.e]/.test(t)?t:`${t}.0`}const sn=`
const float ATM_RG = ${wt($i)};
const float ATM_TOP = ${wt(ll)};
const float ATM_HR = ${wt(gh)};
const float ATM_HM = ${wt(xh)};
const vec3 ATM_BETA_R = vec3(${wt(co[0])}, ${wt(co[1])}, ${wt(co[2])});
const float ATM_BETA_MS = ${wt(Od)};
const float ATM_BETA_ME = ${wt(ji)};
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
  const float g = ${wt(Hd)};
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
`,on=`
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
`,yh=`
uniform sampler2D uTransmittanceLut;

vec3 atmTransmittanceToSpace(float hKm, float mu) {
  float u = (clamp(mu, ${wt(ho)}, 1.0) - (${wt(ho)})) / ${wt(1-ho)};
  float v = sqrt(clamp(hKm / ATM_TOP, 0.0, 1.0));
  vec2 uv = vec2(u * ${wt((hs-1)/hs)} + ${wt(.5/hs)}, v * ${wt((Ns-1)/Ns)} + ${wt(.5/Ns)});
  return texture2D(uTransmittanceLut, uv).rgb;
}
`,nn=`
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
`,Xd=`
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`,qd=`
${sn}
${yh}
${nn}

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
`,Zd=`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,Qd=`
${sn}
${yh}
${nn}

uniform sampler2D uSkyView;
uniform vec3 uSunTrue;             // unit vector toward the sun, true scale
uniform float uCamAltKm;
uniform float uVerticalExaggeration;
uniform vec3 uFloorColor;
uniform float uFloorHaze;
uniform float uSkyExposure;
${on}
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
`;class Jd{constructor(){k(this,"transmittance");k(this,"skyView");k(this,"scene",new po);k(this,"camera",new al(-1,1,1,-1,0,1));k(this,"material");k(this,"quad");k(this,"lastSunSin",9);k(this,"lastAltKm",-9);this.transmittance=jd(),this.skyView=new Qt(Gd,Kd,{format:Ct,type:Ua,depthBuffer:!1,stencilBuffer:!1,minFilter:Be,magFilter:Be,generateMipmaps:!1,wrapS:ro,wrapT:We}),this.material=new Et({vertexShader:Xd,fragmentShader:qd,uniforms:{uTransmittanceLut:{value:this.transmittance},uSunSin:{value:.5},uCamAltKm:{value:5}},depthTest:!1,depthWrite:!1,toneMapped:!1}),this.quad=new ba(new en(2,2),this.material),this.quad.frustumCulled=!1,this.scene.add(this.quad)}update(t,a,s){const o=D.clamp(a.y,-.15,1);if(Math.abs(o-this.lastSunSin)<1e-4&&Math.abs(s-this.lastAltKm)<.02)return;this.lastSunSin=o,this.lastAltKm=s,this.material.uniforms.uSunSin.value=o,this.material.uniforms.uCamAltKm.value=s;const i=t.getRenderTarget();t.setRenderTarget(this.skyView),t.render(this.scene,this.camera),t.setRenderTarget(i)}dispose(){this.transmittance.dispose(),this.skyView.dispose(),this.material.dispose(),this.quad.geometry.dispose()}}const Zo=14.8,Qo=10.8,bh=511,zs=-.44,Ke=256,oo=24,ef=80,tf=24,ds=["plumas_ca","lytton_bc","evia_greece","blue_mountains_au"],jo={plumas_ca:{id:"plumas_ca",bbox:[-121.6,39.75,-120.75,40.35],widthKm:72.5,minElevM:313,maxElevM:2357,windDirUv:[.68,.73],paletteBase:[.14,.21,.14],paletteRidge:[.44,.43,.4],hasSeaCoast:!1},lytton_bc:{id:"lytton_bc",bbox:[-121.95,49.95,-121.2,50.52],widthKm:54,minElevM:195,maxElevM:2860,windDirUv:[.42,.91],paletteBase:[.24,.22,.16],paletteRidge:[.56,.54,.52],hasSeaCoast:!1},evia_greece:{id:"evia_greece",bbox:[23.02,38.62,23.62,39.12],widthKm:52,minElevM:0,maxElevM:1385,windDirUv:[-.62,-.78],paletteBase:[.27,.3,.2],paletteRidge:[.64,.6,.52],hasSeaCoast:!0},blue_mountains_au:{id:"blue_mountains_au",bbox:[150.02,-33.92,150.74,-33.32],widthKm:66,minElevM:68,maxElevM:1215,windDirUv:[.79,-.61],paletteBase:[.15,.22,.17],paletteRidge:[.54,.38,.27],hasSeaCoast:!1}};function af(e){const t=ds.indexOf(e);return t>=0?t:0}function sf(){const e=new Uint8Array(1024);for(let a=0;a<256;a++)e[a*4]=hr[a*3],e[a*4+1]=hr[a*3+1],e[a*4+2]=hr[a*3+2],e[a*4+3]=255;const t=new ta(e,256,1,Ct,Bt);return t.colorSpace=ht,t.minFilter=Be,t.magFilter=Be,t.wrapS=We,t.wrapT=We,t.needsUpdate=!0,t}function Cs(e,t=!0){const a=Math.max(2,Math.floor(Math.sqrt(e.length))),s=a*a,o=new Float32Array(s);let i=Number.POSITIVE_INFINITY,l=Number.NEGATIVE_INFINITY;for(let r=0;r<a;r++){const d=(t?a-1-r:r)*a,p=r*a;for(let M=0;M<a;M++){const b=Number.isFinite(e[d+M])?e[d+M]:0;o[p+M]=b,b<i&&(i=b),b>l&&(l=b)}}Number.isFinite(i)||(i=0),(!Number.isFinite(l)||l<=i+1)&&(l=i+1e3);const h=new ta(o,a,a,uh,sl);return h.internalFormat="R32F",h.minFilter=vo,h.magFilter=vo,h.wrapS=We,h.wrapT=We,h.flipY=!1,h.generateMipmaps=!1,h.needsUpdate=!0,{texture:h,aligned:o,gridRes:a,minElev:i,maxElev:l}}function nu(e,t=256){const a=jo[e],s=new Float32Array(t*t),o=af(e)*2.35;for(let i=0;i<t;i++){const h=(1-i/(t-1)-.5)*2;for(let r=0;r<t;r++){const d=(r/(t-1)-.5)*2,p=.24*Math.sin(h*2.7+o)+.11*Math.cos(h*5.6-o),M=Math.abs(d*.88-p),b=Math.pow(Math.min(1.3,M*1.18),.78),g=1-Math.abs(Math.sin(d*4.4+h*3.1+o)),R=1-Math.abs(Math.cos(d*8.9-h*7.4-o*.6)),E=.5+.5*Math.sin(d*18.5+h*16.2+o*1.3);let w=b*(.58+.28*g*g+.11*R+.04*E);if(a.hasSeaCoast){const x=1-Math.max(0,Math.hypot(d*.92,h*.84)-.62)*1.9;w=Math.max(0,w*x-.08)}s[i*t+r]=a.minElevM+Math.max(0,Math.min(1.05,w))*(a.maxElevM-a.minElevM)}}return s}function ru(e,t,a,s,o,i){const l=jo[e],h=512,r=document.createElement("canvas");r.width=h,r.height=h;const c=r.getContext("2d");if(c){const p=c.createImageData(h,h),M=p.data,b=Math.max(100,o-s);for(let g=0;g<h;g++){const R=1-g/(h-1),E=Math.min(a-1,Math.max(0,Math.round(R*(a-1)))),w=Math.min(a-1,E+1);for(let x=0;x<h;x++){const S=x/(h-1),A=Math.min(a-1,Math.max(0,Math.round(S*(a-1)))),B=Math.min(a-1,A+1),C=t[E*a+A],P=t[E*a+B],U=t[w*a+A],G=Math.max(0,Math.min(1,(C-s)/b)),_=Math.min(1,Math.hypot(P-C,U-C)/48),Y=.92+.08*Math.sin(x*.47+g*.31)*Math.cos(x*.19-g*.53);let Z,ge,we;if(l.hasSeaCoast&&C<=2.2)Z=.05,ge=.14+.04*Y,we=.24+.05*Y;else{const be=Math.min(1,Math.max(0,G*.72+_*.55));if(Z=(l.paletteBase[0]*(1-be)+l.paletteRidge[0]*be)*Y,ge=(l.paletteBase[1]*(1-be)+l.paletteRidge[1]*be)*Y,we=(l.paletteBase[2]*(1-be)+l.paletteRidge[2]*be)*Y,l.maxElevM>2200&&G>.84){const Me=(G-.84)/.16;Z=Z*(1-Me*.55)+.78*Me*.55,ge=ge*(1-Me*.55)+.8*Me*.55,we=we*(1-Me*.55)+.84*Me*.55}}const Ae=(g*h+x)*4;M[Ae]=Math.min(255,Math.max(0,Math.round(Z*255))),M[Ae+1]=Math.min(255,Math.max(0,Math.round(ge*255))),M[Ae+2]=Math.min(255,Math.max(0,Math.round(we*255))),M[Ae+3]=255}}c.putImageData(p,0,0)}const d=new pd(r);return d.colorSpace=ht,d.anisotropy=i,d.wrapS=We,d.wrapT=We,d.needsUpdate=!0,d}function lu(e,t=!0){const a=Ke*Ke*4,s=Math.max(1,Math.floor(e.byteLength/a));if(!t)return{buffer:e.slice(0,s*a),frames:s};const o=new Uint8Array(s*a),i=Ke*4;for(let l=0;l<s;l++){const h=l*a;for(let r=0;r<Ke;r++){const c=h+(Ke-1-r)*i,d=h+r*i;o.set(e.subarray(c,c+i),d)}}return{buffer:o,frames:s}}const rn=`
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
`;function cu(e=bh){const a=(e+1)*2*4,s=e*6*4,o=new Float32Array(a*3),i=new Float32Array(a*3),l=new Float32Array(a*4),h=new Uint32Array(s),r=[{normal:[0,0,1],evalUv:M=>[M,0]},{normal:[1,0,0],evalUv:M=>[1,M]},{normal:[0,0,-1],evalUv:M=>[1-M,1]},{normal:[-1,0,0],evalUv:M=>[0,1-M]}];let c=0,d=0;for(let M=0;M<4;M++){const b=r[M],g=c;for(let R=0;R<=e;R++){const E=R/e,[w,x]=b.evalUv(E),S=(w-.5)*Zo,A=(.5-x)*Qo,B=M+E;o[c*3]=S,o[c*3+1]=0,o[c*3+2]=A,i[c*3]=b.normal[0],i[c*3+1]=b.normal[1],i[c*3+2]=b.normal[2],l[c*4]=w,l[c*4+1]=x,l[c*4+2]=1,l[c*4+3]=B,c++,o[c*3]=S,o[c*3+1]=zs,o[c*3+2]=A,i[c*3]=b.normal[0],i[c*3+1]=b.normal[1],i[c*3+2]=b.normal[2],l[c*4]=w,l[c*4+1]=x,l[c*4+2]=0,l[c*4+3]=B,c++}for(let R=0;R<e;R++){const E=g+R*2,w=E+1,x=E+2,S=E+3;h[d++]=E,h[d++]=w,h[d++]=x,h[d++]=x,h[d++]=w,h[d++]=S}}const p=new tn;return p.setAttribute("position",new ga(o,3)),p.setAttribute("normal",new ga(i,3)),p.setAttribute("aSkirtParam",new ga(l,4)),p.setIndex(new ga(h,1)),p.boundingSphere=new hh(new W(0,.8,0),14),p}const of=`
${rn}

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

  float wy = mix(${zs.toFixed(2)}, surfY, isTop);
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
`,nf=`
${on}
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
  float wallSpan = max(0.08, vSurfaceY - (${zs.toFixed(2)}));
  float hFrac = clamp((vWorldY - (${zs.toFixed(2)})) / wallSpan, 0.0, 1.0);

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
  float baseRule = 1.0 - smoothstep(0.0, 0.014, vWorldY - (${zs.toFixed(2)}));
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
`,rf=`
varying vec3 vLocalPos;
varying vec3 vWorldPos;

void main() {
  vLocalPos = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,lf=`
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
`;function cf(e){return Math.max(0,Math.min(e-1,Math.floor((e-1)*.52)))}const uf=11,hf=.42,df=8;function ff(e,t,a,s,o,i){const[l,h,r,c]=t,d=o.gridSize,p=cf(s),M=p*d*d*4,b=`pass ${p+1}`;let g=!1,R={gx:Math.round(d*.5),gy:Math.round(d*.5),zMw:0};for(let _=14;_<d-14;_+=2)for(let Y=14;Y<d-14;Y+=2){const Z=a[M+(_*d+Y)*4]/255*o.zMaxMwKm2;Z>R.zMw&&(R={gx:Y,gy:_,zMw:Z},g=!0)}let E=!1,w=-1/0,x={gx:Math.round(d*.375),gy:Math.round(d*.42),zMw:0,modisMw:0};for(let _=14;_<d-14;_+=2)for(let Y=14;Y<d-14;Y+=2){const Z=M+(_*d+Y)*4,ge=a[Z]/255*o.zMaxMwKm2,we=a[Z+2]/255*o.zMaxMwKm2,Ae=Math.hypot(Y-R.gx,_-R.gy);if(ge>=uf&&we<ge*hf&&Ae>24){const be=i(Y/(d-1),_/(d-1)),Me=ge-we*1.25-be*6e-4;Me>w&&(w=Me,x={gx:Y,gy:_,zMw:ge,modisMw:we},E=!0)}}let S=!1,A={gx:Math.round(d*.640625),gy:Math.round(d*.40625),sigmaMw:0};for(let _=14;_<d-14;_+=2)for(let Y=14;Y<d-14;Y+=2){const Z=M+(_*d+Y)*4,ge=a[Z]/255*o.zMaxMwKm2,we=a[Z+1]/255*o.sigmaMaxMwKm2,Ae=Math.hypot(Y-R.gx,_-R.gy),be=Math.hypot(Y-x.gx,_-x.gy);ge>=df&&we>A.sigmaMw&&Ae>28&&be>24&&(A={gx:Y,gy:_,sigmaMw:we},S=!0)}const B=(_,Y,Z,ge,we,Ae,be)=>{const Me=Z/(d-1),pe=ge/(d-1);return{id:`${e}-${_}`,kind:Y,title:we,subtitle:Ae,valueText:be,lat:h+pe*(c-h),lon:l+Me*(r-l),elevM:Math.round(i(Me,pe))}},C=B("front-core","front",R.gx,R.gy,g?"Strongest estimate":"",g?`Highest value of the simulated 375 m estimate at ${b}`:"",g?`${R.zMw.toFixed(1)} MW/km², ${b}`:""),P=B("canyon-subpixel","subpixel",x.gx,x.gy,E?"Estimate above MODIS":"",E?`Simulated estimate where the simulated MODIS pass reads far less, at ${b}`:"",E?`${x.zMw.toFixed(1)} MW/km², MODIS ${x.modisMw.toFixed(1)} MW/km², ${b}`:""),U=B("sigma-peak","uncertainty",A.gx,A.gy,S?"Least certain estimate":"",S?`One standard deviation of the simulated estimate at ${b}`:"",S?`±${A.sigmaMw.toFixed(1)} MW/km² (1 sigma), ${b}`:""),G=[];return g&&G.push(C),E&&G.push(P),S&&G.push(U),{anchors:[C,P,U],callouts:G}}const mf=1,pf=2,vf=3,uu=24*3600*1e3;function gf(e,t,a,s){const o=new Uint8Array(e.length);for(let i=0;i<e.length;i++){const l=e[i];if(!(l>=1))continue;const h=t+(l-1)*uu,r=h+uu;o[i]=r<=a?mf:h>=s?vf:pf}return o}function xf(e,t,a,s=.375,o){if(o&&o.length===4&&o.every(p=>Number.isFinite(p))&&o[2]>o[0]&&o[3]>o[1])return[o[0],o[1],o[2],o[3]];const[i,l,,h]=e,r=(l+h)/2*(Math.PI/180),c=s/111.132,d=s/(111.132*Math.cos(r));return[i,l,i+t*d,l+a*c]}function wf(e,t){const a=Math.max(1e-9,t[2]-t[0]),s=Math.max(1e-9,t[3]-t[1]);return[(e[2]-e[0])/a,(e[3]-e[1])/s,(e[0]-t[0])/a,(e[1]-t[1])/s]}const Mf=()=>typeof performance<"u"?performance.now():Date.now();function yf(e=Mf()){return null}const St={azimuth:.5,polar:.98,distance:17.2,target:[.1,.3,.2]},hu={overview:{azimuth:.48,polar:.97,distance:17,target:[-.6,.3,.3]},canyon:{azimuth:-.34,polar:1.24,distance:5.6,target:[-.42,.45,-.22]},ridge:{azimuth:.86,polar:1.12,distance:7.4,target:[.32,.6,-.14]},nadir:{azimuth:0,polar:.14,distance:18.5,target:[0,.3,0]},region:{azimuth:.48,polar:.75,distance:17,target:[-.3,.3,.2]}},bf={azimuth:0,polar:.42,distance:12,target:[0,.3,0]};function du(e,t,a,s,o=!1){if(!t)return St;const i=e==="region"&&o?bf:hu[e]??hu.overview;return a==="observer"&&e==="overview"?{azimuth:i.azimuth,polar:.98,distance:18.4,target:[0,.7,.2]}:{azimuth:i.azimuth,polar:i.polar,distance:i.distance,target:[i.target[0],i.target[1],i.target[2]]}}function Sh(e){const t=Math.min(1,Math.max(0,e));return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)*.5}const Xo=.95;class Sf{constructor(){k(this,"active",!1);k(this,"elapsedSec",0);k(this,"durationSec",Xo);k(this,"startAzimuth",St.azimuth);k(this,"endAzimuth",St.azimuth);k(this,"startPolar",St.polar);k(this,"endPolar",St.polar);k(this,"startDistance",St.distance);k(this,"endDistance",St.distance);k(this,"startTarget",new W(...St.target));k(this,"endTarget",new W(...St.target));k(this,"hopHeightDist",2.15)}trigger(t,a,s=2.15,o=Xo){this.active=!0,this.elapsedSec=0,this.durationSec=Math.max(.25,o),this.startAzimuth=t.azimuth;let i=a.azimuth-t.azimuth;for(;i>Math.PI;)i-=Math.PI*2;for(;i<-Math.PI;)i+=Math.PI*2;this.endAzimuth=t.azimuth+i,this.startPolar=t.polar,this.endPolar=a.polar,this.startDistance=t.distance,this.endDistance=a.distance,this.startTarget.copy(t.target),this.endTarget.set(a.target[0],a.target[1],a.target[2]),this.hopHeightDist=s}cancel(){this.active=!1}isActive(){return this.active}step(t,a){if(!this.active)return{slewActive:!1,rawProgress:1,easedProgress:1};this.elapsedSec+=Math.min(.08,Math.max(0,t));const s=Math.min(1,this.elapsedSec/this.durationSec),o=Sh(s),i=Math.sin(s*Math.PI);return a.azimuth=D.lerp(this.startAzimuth,this.endAzimuth,o),a.polar=D.clamp(D.lerp(this.startPolar,this.endPolar,o)-i*.085,.1,1.38),a.distance=D.lerp(this.startDistance,this.endDistance,o)+i*this.hopHeightDist,a.target.lerpVectors(this.startTarget,this.endTarget,o),s>=1&&(this.active=!1),{slewActive:this.active,rawProgress:s,easedProgress:o}}}function Tf(e){const t=e%2===0?1:-1,a=e>=2?-1:1,s=[new W(6.6*t,7.6,7.8*a),new W(4.2*t,3.3,5.1*a),new W(1.1*t,1.85,2.5*a),new W(-2.3*t,1.72,.15*a),new W(-4.6*t,2.65,-2.4*a),new W(-1.8*t,4.45,-4.6*a),new W(3.6*t,6.45,-2.2*a),new W(6.8*t,7.9,3.8*a)],o=[new W(0,.65,0),new W(-.35*t,.85,.45*a),new W(-1.35*t,1.05,-.55*a),new W(-1.85*t,1.12,-1.35*a),new W(-.65*t,1.02,-.85*a),new W(.25*t,.88,-.15*a),new W(.1*t,.72,.15*a),new W(0,.65,0)];return{eyeCurve:new iu(s,!0,"catmullrom",.5),lookCurve:new iu(o,!0,"catmullrom",.5)}}const Ko=13.5;class Ef{constructor(){k(this,"rigs");k(this,"elapsedSec",0);k(this,"currentLegIndex",0);k(this,"tmpEye",new W);k(this,"tmpEyeAhead",new W);k(this,"tmpEyeBehind",new W);k(this,"tmpLook",new W);k(this,"tmpVelA",new W);k(this,"tmpVelB",new W);k(this,"tmpForward",new W);k(this,"tmpRight",new W);k(this,"tmpUp",new W(0,1,0));k(this,"worldUp",new W(0,1,0));this.rigs=[0,1,2,3].map(t=>Tf(t))}startAtTheater(t){const a=Math.max(0,ds.indexOf(t));this.currentLegIndex=a,this.elapsedSec=a*Ko}update(t,a,s,o=Zo,i=Qo){const l=Math.min(.08,Math.max(0,t));this.elapsedSec+=l;const h=Ko*ds.length,r=(this.elapsedSec%h+h)%h,c=Math.min(ds.length-1,Math.floor(r/Ko)),d=(r-c*Ko)/Ko;c!==this.currentLegIndex&&(this.currentLegIndex=c,s==null||s(ds[c]));const p=this.rigs[c],M=.008,b=(d-M+1)%1,g=(d+M)%1;p.eyeCurve.getPointAt(d,this.tmpEye),p.eyeCurve.getPointAt(b,this.tmpEyeBehind),p.eyeCurve.getPointAt(g,this.tmpEyeAhead),p.lookCurve.getPointAt(d,this.tmpLook);const R=this.tmpEye.x/o+.5,E=.5-this.tmpEye.z/i;if(R>=-.02&&R<=1.02&&E>=-.02&&E<=1.02){const G=a(Math.min(1,Math.max(0,R)),Math.min(1,Math.max(0,E)))+.78;this.tmpEye.y<G&&(this.tmpEye.y=G)}const w=this.tmpLook.x/o+.5,x=.5-this.tmpLook.z/i,S=a(Math.min(1,Math.max(0,w)),Math.min(1,Math.max(0,x)));this.tmpLook.y=Math.max(this.tmpLook.y,S+.18),this.tmpVelA.subVectors(this.tmpEye,this.tmpEyeBehind).setY(0),this.tmpVelB.subVectors(this.tmpEyeAhead,this.tmpEye).setY(0);let A=0;if(this.tmpVelA.lengthSq()>1e-6&&this.tmpVelB.lengthSq()>1e-6){this.tmpVelA.normalize(),this.tmpVelB.normalize();const U=this.tmpVelA.x*this.tmpVelB.z-this.tmpVelA.z*this.tmpVelB.x;A=D.clamp(U*1.45,-.11,.11)}this.tmpForward.subVectors(this.tmpLook,this.tmpEye).normalize(),this.tmpRight.crossVectors(this.tmpForward,this.worldUp).normalize(),this.tmpUp.copy(this.worldUp).applyAxisAngle(this.tmpForward,A).normalize();const B=.18+.68*(.5-.5*Math.cos(d*Math.PI*2)),P=39+Math.sin(d*Math.PI)*3.2;return{position:this.tmpEye,lookAt:this.tmpLook,up:this.tmpUp,fov:P,syntheticTimeProgress:B,cycleProgress:r/h,legProgress:d,activeLegTheater:ds[c]}}}function Rf(e,t,a){a.target.copy(t),a.target.x=D.clamp(a.target.x,-Zo*.45,Zo*.45),a.target.z=D.clamp(a.target.z,-Qo*.45,Qo*.45),a.target.y=D.clamp(a.target.y,-.1,2.2);const s=new W().subVectors(e,a.target),o=D.clamp(s.length(),4.2,26),i=D.clamp(Math.acos(D.clamp(s.y/o,-.99,.99)),.1,1.38),l=Math.atan2(s.x,s.z);a.distance=o,a.polar=i,a.azimuth=l}const Xr=.05;function Af(e,t){const a=new Uint8Array(t*t);for(let o=0;o<t;o++)for(let i=0;i<t;i++){const l=e[o*t+i];if(l===0)continue;let h=1;for(let r=-1;r<=1&&h;r++)for(let c=-1;c<=1;c++){const d=Math.min(t-1,Math.max(0,o+r)),p=Math.min(t-1,Math.max(0,i+c));if(Math.abs(e[d*t+p]-l)>Xr){h=0;break}}a[o*t+i]=h}const s=new Uint8Array(t*t);for(let o=0;o<t;o++)for(let i=0;i<t;i++){const l=e[o*t+i];if(l===0)continue;let h=a[o*t+i];for(let r=-1;r<=1&&!h;r++)for(let c=-1;c<=1;c++){const d=o+r,p=i+c;if(!(d<0||d>=t||p<0||p>=t)&&a[d*t+p]&&Math.abs(e[d*t+p]-l)<=Xr){h=1;break}}s[o*t+i]=h}return s}function cl(e,t){let a=0,s=0;for(let o=1;o<t-1;o+=2)for(let i=1;i<t-1;i+=2){const l=e[o*t+i];if(l===0||!Number.isFinite(l))continue;let h=!0;for(let r=-1;r<=1&&h;r++)for(let c=-1;c<=1;c++)if(Math.abs(e[(o+r)*t+i+c]-l)>Xr){h=!1;break}h&&(a++,Math.abs(l-Math.round(l))<.02&&s++)}return a>=20&&s/a>.5}const _f=1.5;function kf(e,t){let a=new Uint8Array(t*t);for(let s=0;s<t*t;s++)a[s]=e[s]===0?1:0;for(let s=0;s<2;s++){const o=a.slice();for(let i=1;i<t-1;i++)for(let l=1;l<t-1;l++){const h=i*t+l;if(a[h]||!(e[h]<_f))continue;let r=0;for(let c=-1;c<=1;c++)for(let d=-1;d<=1;d++)r+=a[(i+c)*t+l+d];r>=5&&(o[h]=1)}a=o}return a}const Ff=5,Df=.25;function Pf(e,t,a){const s=new Uint8Array(t*t),o=new Uint8Array(t*t),i=new Int32Array(t*t),l=[],h=[];let r=0;const c=d=>a[d]===0&&e[d]<Ff;for(let d=0;d<t*t;d++){if(o[d]||!c(d))continue;r++;let p=0,M=0;for(h.length=0,l.push(d),o[d]=1;l.length>0;){const b=l.pop();h.push(b);const g=Math.floor(b/t),R=b-g*t;for(let E=-1;E<=1;E++){const w=g+E;if(!(w<0||w>=t))for(let x=-1;x<=1;x++){const S=R+x;if(S<0||S>=t||E===0&&x===0)continue;const A=w*t+S;c(A)?o[A]||(o[A]=1,l.push(A)):i[A]!==r&&(i[A]=r,a[A]?p++:M++)}}}if(p>0&&M<Df*(p+M))for(const b of h)s[b]=1}return s}const fu=4,mu=1.5,If=4;function Th(e,t){if(t<2*fu+1||e.length!==t*t)return;const a=fu;let s=new Float32Array(t*t),o=new Float32Array(t*t);for(let r=0;r<t*t;r++){const c=e[r]!==0?1:0;s[r]=e[r]*c,o[r]=c}const i=new Float32Array(t*t),l=new Float32Array(t*t),h=(r,c,d)=>{for(let p=0;p<t;p++){let M=0;const b=g=>d?p*t+g:g*t+p;for(let g=0;g<=a&&g<t;g++)M+=r[b(g)];for(let g=0;g<t;g++){c[b(g)]=M;const R=g+a+1,E=g-a;R<t&&(M+=r[b(R)]),E>=0&&(M-=r[b(E)])}}};for(let r=0;r<2;r++){h(s,i,!0),h(o,l,!0),h(i,s,!1),h(l,o,!1);for(let c=0;c<t*t;c++){const d=o[c];s[c]=d>0?s[c]/d:0,o[c]=d>0?1:0}}for(let r=0;r<t*t;r++){const c=e[r];if(c===0||o[r]===0)continue;const d=Math.min(1,Math.max(0,(Math.abs(c-s[r])-mu)/(If-mu))),p=d*d*(3-2*d);e[r]=c+(s[r]-c)*(1-p)}}function Cf(e){const t=Math.floor(e.length/4);if(t===0)return 0;const a=o=>{const i=o/255;return i<=.04045?i/12.92:Math.pow((i+.055)/1.055,2.4)},s=new Float32Array(t);for(let o=0;o<t;o++)s[o]=.2126*a(e[o*4])+.7152*a(e[o*4+1])+.0722*a(e[o*4+2]);return s.sort(),s[Math.floor(t/2)]}function qr(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function vr(e){return qr(e)&&typeof e.url=="string"&&e.url.length>0&&typeof e.size=="number"}function pu(e){return Array.isArray(e)&&e.length===2&&e.every(t=>typeof t=="number"&&Number.isFinite(t))}function Eh(e){if(!qr(e)||e.version!==1||!vr(e.dem)||!vr(e.ortho)||!vr(e.aux)||!pu(e.extent_km)||!pu(e.elev_range_m))return null;const t=e.sun;return!qr(t)||typeof t.azimuth_deg!="number"||typeof t.elevation_deg!="number"||!Number.isFinite(t.azimuth_deg)||!Number.isFinite(t.elevation_deg)?null:e}function Xi(e,t){return new Promise(a=>{const s=new vd;s.setCrossOrigin("anonymous"),s.setOptions(t),s.load(e,o=>a(o),void 0,()=>a(null))})}function Zr(e){const t=new ol(e);return t.flipY=!1,t.premultiplyAlpha=!1,t.wrapS=We,t.wrapT=We,t.magFilter=Be,t.minFilter=Za,t.generateMipmaps=!0,t.onUpdate=()=>{e.close()},t.addEventListener("dispose",()=>{e.close()}),t.needsUpdate=!0,t}async function Lf(e){let t=null;try{t=await createImageBitmap(e,{resizeWidth:256,resizeHeight:256,resizeQuality:"medium"}).catch(()=>null);const o=(typeof OffscreenCanvas<"u"?new OffscreenCanvas(256,256):Object.assign(document.createElement("canvas"),{width:256,height:256})).getContext("2d");return o?(o.imageSmoothingEnabled=!0,o.imageSmoothingQuality="high",o.drawImage(t??e,0,0,256,256),Cf(o.getImageData(0,0,256,256).data)):null}catch{return null}finally{t==null||t.close()}}async function Rh(e,t){const a=await Xi(e,{imageOrientation:"flipY",premultiplyAlpha:"none"});if(!a)return null;const s=Zr(a);return s.colorSpace=ht,s.anisotropy=t,s}function Nf(e,t){if(t<3||e.length!==t*t)return;const a=new Float32Array(t*t),s=1/6,o=2/3;for(let i=0;i<t;i++){const l=i*t;for(let h=0;h<t;h++){const r=e[l+(h>0?h-1:0)],c=e[l+(h<t-1?h+1:t-1)];a[l+h]=s*r+o*e[l+h]+s*c}}for(let i=0;i<t;i++){const l=(i>0?i-1:0)*t,h=(i<t-1?i+1:t-1)*t,r=i*t;for(let c=0;c<t;c++)e[r+c]=s*a[l+c]+o*a[r+c]+s*a[h+c]}}async function vu(e,t){var a,s,o;try{const i=e.ortho.size<=t.maxTextureSize,l=i?e.ortho:e.ortho_fallback??null;if(!l||l.size>t.maxTextureSize)return null;const h=fetch(t.resolveUrl(e.dem.url)).then(B=>B.ok?B.arrayBuffer():null),r=Xi(t.resolveUrl(l.url),{imageOrientation:"flipY",premultiplyAlpha:"none"}).then(async B=>B||!i||!e.ortho_fallback?{bitmap:B,size:l.size}:{bitmap:await Xi(t.resolveUrl(e.ortho_fallback.url),{imageOrientation:"flipY",premultiplyAlpha:"none"}),size:e.ortho_fallback.size}),c=Xi(t.resolveUrl(e.aux.url),{imageOrientation:"flipY",premultiplyAlpha:"none",colorSpaceConversion:"none"}),[d,p,M]=await Promise.all([h,r,c]),b=((a=t.isCancelled)==null?void 0:a.call(t))??!1,g=e.dem.size*e.dem.size*4;if(b||!d||d.byteLength!==g||e.dem.format!=="f32le"||!p.bitmap||!M)return(s=p.bitmap)==null||s.close(),M==null||M.close(),null;const R=new Float32Array(d),E=cl(R,e.dem.size);E&&Th(R,e.dem.size),Nf(R,e.dem.size);const w=Cs(R,!0),x=await Lf(p.bitmap);if((o=t.isCancelled)!=null&&o.call(t))return w.texture.dispose(),p.bitmap.close(),M.close(),null;const S=Zr(p.bitmap);S.colorSpace=ht,S.anisotropy=t.maxAnisotropy;const A=Zr(M);return A.colorSpace=Ba,A.anisotropy=Math.min(4,t.maxAnisotropy),{manifest:e,demTexture:w.texture,alignedDem:w.aligned,demGridRes:w.gridRes,minElevM:w.minElev,maxElevM:w.maxElev,orthoTexture:S,orthoSize:p.size,auxTexture:A,attribution:e.ortho.attribution??"",levelInWholeMetres:E,pictureMedianLuma:x,dispose:()=>{w.texture.dispose(),S.dispose(),A.dispose()}}}catch{return null}}function zf(e,t,a){const s=e*Math.PI/180,o=t*Math.PI/180;return a.set(Math.sin(s)*Math.cos(o),Math.sin(o),-Math.cos(s)*Math.cos(o)).normalize()}function Uf(e,t,a){return a.set(e.x*t.x,e.y*t.y,e.z*t.z).normalize()}const Jo=.085,Bf=1e6;function Of(e,t,a){const s=Ke,o=s*s,i=o*4,l=Jo*255,h=new Float32Array(o).fill(Bf),r=new Float32Array(o).fill(0),c=new Float32Array(o),d=new Uint8Array(o);for(let C=0;C<o;C++){let P=-1,U=-1,G=0;for(let _=0;_<t;_++){const Y=e[_*i+C*4];Y>G&&(G=Y),Y>=l&&(P<0&&(P=_),U=_)}if(c[C]=G/255,!(P<0)){if(d[C]=1,P===0)h[C]=-.5;else{const _=e[(P-1)*i+C*4],Y=e[P*i+C*4],Z=Y>_?(l-_)/(Y-_):1;h[C]=P-1+Math.min(1,Math.max(0,Z))}if(U>=t-1)r[C]=t-1+.5;else{const _=e[U*i+C*4],Y=e[(U+1)*i+C*4],Z=_>Y?(_-l)/(_-Y):0;r[C]=U+Math.min(1,Math.max(0,Z))}}}let p=0,M=0;for(let C=1;C<s-1;C+=2)for(let P=1;P<s-1;P+=2){const U=C*s+P;if(!d[U]||!d[U+1]||!d[U-1]||!d[U+s]||!d[U-s])continue;const G=(h[U+1]-h[U-1])*.5,_=(h[U+s]-h[U-s])*.5,Y=Math.hypot(G,_);Y>.001&&Y<4&&(p+=Y,M++)}const b=M>16?Math.min(1.2,Math.max(.08,p/M)):.3,g=h.slice(),R=b,E=b*Math.SQRT2,w=(C,P,U)=>{const G=g[P]+U;G<g[C]&&(g[C]=G)};for(let C=0;C<2;C++){for(let P=0;P<s;P++)for(let U=0;U<s;U++){const G=P*s+U;d[G]||(U>0&&w(G,G-1,R),P>0&&w(G,G-s,R),U>0&&P>0&&w(G,G-s-1,E),U<s-1&&P>0&&w(G,G-s+1,E))}for(let P=s-1;P>=0;P--)for(let U=s-1;U>=0;U--){const G=P*s+U;d[G]||(U<s-1&&w(G,G+1,R),P<s-1&&w(G,G+s,R),U<s-1&&P<s-1&&w(G,G+s+1,E),U>0&&P<s-1&&w(G,G+s-1,E))}}let x=0;const S=t+64,A=new Float32Array(o*4);for(let C=0;C<o;C++){const P=Math.min(S,g[C]);A[C*4]=P,A[C*4+1]=d[C]?r[C]:P,A[C*4+2]=c[C],A[C*4+3]=d[C],x+=d[C]}let B;if(a)B=new ta(A,s,s,Ct,sl);else{const C=new Uint16Array(o*4);for(let P=0;P<C.length;P++)C[P]=Ra.toHalfFloat(A[P]);B=new ta(C,s,s,Ct,Ua)}return B.minFilter=Be,B.magFilter=Be,B.wrapS=We,B.wrapT=We,B.generateMipmaps=!1,B.flipY=!1,B.needsUpdate=!0,{texture:B,burnedFraction:x/o,frameCount:t}}function gu(e){const t=String(e);return/[.e]/.test(t)?t:`${t}.0`}const Hf=`
const float FIRE_THR = ${gu(Jo)};
const float FIRE_FIELD_TEXEL = ${gu(1/Ke)};

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
`,Gf=`
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
`,go=6378.137,Qi={family:"modis",altitudeKm:705,maxScanDeg:55,alphaScanNative:1/705,alphaTrack:1/705,detectors:10,zone1Deg:90,zone2Deg:90},io={family:"viirs",altitudeKm:825.2,maxScanDeg:56.28,alphaScanNative:.125/825.2,alphaTrack:.362/825.2,detectors:32,zone1Deg:31.72,zone2Deg:44.86},Ji=Math.PI/180;function Qr(e){return(go+e.altitudeKm)/go}function Kf(e,t){const a=Math.min(e.maxScanDeg,Math.abs(t))*Ji,s=Qr(e);return go*(Math.asin(Math.min(1,s*Math.sin(a)))-a)}const xu={axisEast:1,axisNorth:0,nadirKm:0,valid:!1,scanAngleDeg:0};function wu(e,t,a){if(!e||e.family!==t.family)return a.valid=!1,a;const s=e.azimuthDeg*Ji;return a.axisEast=Math.sin(s),a.axisNorth=Math.cos(s),a.scanAngleDeg=Math.min(t.maxScanDeg,Math.abs(e.scanAngleDeg)),a.nadirKm=Kf(t,a.scanAngleDeg),a.valid=!0,a}function fs(e){const t=e.toPrecision(10);return/[.e]/.test(t)?t:`${t}.0`}function Mu(e){return`vec4(${fs(e.alphaScanNative)}, ${fs(e.alphaTrack)}, ${fs(e.detectors)}, ${e.family==="viirs"?"1.0":"0.0"})`}const Wf=`
const float SCAN_RE = ${fs(go)};
const float MODIS_ORBIT_K = ${fs(Qr(Qi))};
const float VIIRS_ORBIT_K = ${fs(Qr(io))};
const vec4 MODIS_SENSOR = ${Mu(Qi)};
const vec4 VIIRS_SENSOR = ${Mu(io)};
const float VIIRS_ZONE1 = ${fs(io.zone1Deg*Ji)};
const float VIIRS_ZONE2 = ${fs(io.zone2Deg*Ji)};

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
`,Ah=`
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
`,yu=`
${rn}

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
`,Vf=`
void main() {
  gl_FragColor = vec4(0.0);
}
`,Yf=`
${rn}
${Wf}

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

${Gf}
${sn}
${nn}
${on}
${Hf}

${Ah}

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
`;function gr(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function bu(e){if(!gr(e))return null;const{extent_km:t,scale:a,dem:s,ortho:o}=e;return!Array.isArray(t)||t.length!==2||!t.every(i=>typeof i=="number"&&i>0)||typeof a!="number"||!(a>1)||a>15||!gr(s)||typeof s.url!="string"||typeof s.size!="number"||s.format!=="f32le"||!gr(o)||typeof o.url!="string"||typeof o.size!="number"?null:e}function $f(e,t,a,s){const o=new Uint8Array(t*t*4),i=s?new Uint8Array(t*t):Af(e,t),l=kf(e,t),h=Pf(e,t,l),r=a[0]*1e3/(t-1),c=a[1]*1e3/(t-1);for(let p=0;p<t;p++){const M=Math.min(t-1,p+1),b=Math.max(0,p-1);for(let g=0;g<t;g++){const R=Math.min(t-1,g+1),E=Math.max(0,g-1),w=(e[p*t+R]-e[p*t+E])/((R-E)*r),x=(e[b*t+g]-e[M*t+g])/((M-b)*c),S=1/Math.hypot(w,1,x),A=(p*t+g)*4;o[A]=Math.round((-w*S*.5+.5)*255),o[A+1]=Math.round((-x*S*.5+.5)*255),o[A+2]=l[p*t+g]?255:h[p*t+g]?128:0,o[A+3]=i[p*t+g]?255:0}}const d=new ta(o,t,t,Ct,Bt);return d.colorSpace=Ba,d.wrapS=We,d.wrapT=We,d.magFilter=Be,d.minFilter=Za,d.generateMipmaps=!0,d.flipY=!1,d.needsUpdate=!0,d}async function jf(e,t){var a;try{if(e.ortho.size>t.maxTextureSize)return null;const[s,o]=await Promise.all([fetch(t.resolveUrl(e.dem.url)).then(d=>d.ok?d.arrayBuffer():null),Rh(t.resolveUrl(e.ortho.url),t.maxAnisotropy)]),i=e.dem.size;if((((a=t.isCancelled)==null?void 0:a.call(t))??!1)||!s||s.byteLength!==i*i*4||!o)return o==null||o.dispose(),null;const l=new Float32Array(s),h=cl(l,i);h&&Th(l,i);const r=Cs(l,!0),c=$f(r.aligned,r.gridRes,e.extent_km,h);return{manifest:e,scale:e.scale,demTexture:r.texture,alignedDem:r.aligned,gridRes:r.gridRes,shadeTexture:c,orthoTexture:o,dispose:()=>{r.texture.dispose(),c.dispose(),o.dispose()}}}catch{return null}}const _h=6360;function Xf(e,t){return(e*e+2*e*t)/(2*_h)}const qf=`
${rn}

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
  y -= (dOut * dOut + 2.0 * dOut * halfKm) / (2.0 * ${_h.toFixed(1)}) * 1000.0 * uUnitsPerMetre.y;

  // Under the pack this surface dives out of the way; the pack is the surface there. The dive
  // starts more than one cell of this mesh inside the pack, so along the pack edge both surfaces
  // are at the same height (the pack takes the context elevation there, see contextJoin).
  vec2 e = min(packUv, 1.0 - packUv);
  y -= clamp((min(e.x, e.y) - 0.012) * 40.0, 0.0, 1.0) * 0.6;

  vec4 worldPos = modelMatrix * vec4(xz.x, y, xz.y, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`,Zf=`
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

${sn}
${nn}
${on}
${Ah}

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
`,Su=640;class Qf{constructor(t){k(this,"mesh");k(this,"material");k(this,"shadeUniform",{value:null});const a=new en(1,1,Su,Su);this.material=new Et({vertexShader:qf,fragmentShader:Zf,uniforms:{...t,uContextShade:this.shadeUniform},transparent:!0,depthWrite:!0}),this.mesh=new ba(a,this.material),this.mesh.frustumCulled=!1,this.mesh.visible=!1,this.mesh.renderOrder=-2}setContext(t){this.shadeUniform.value=(t==null?void 0:t.shadeTexture)??null}dispose(){this.mesh.geometry.dispose(),this.material.dispose()}}function Jf(e,t,a){const s=e.gridRes,o=Math.min(s-1,Math.max(0,t*(s-1))),i=Math.min(s-1,Math.max(0,a*(s-1))),l=Math.floor(o),h=Math.floor(i),r=Math.min(s-1,l+1),c=Math.min(s-1,h+1),d=o-l,p=i-h,M=e.alignedDem,b=M[h*s+l]*(1-d)+M[h*s+r]*d,g=M[c*s+l]*(1-d)+M[c*s+r]*d;return b*(1-p)+g*p}const qo=1024,mo=1536,Tu=1.1,em=5,tm=.2,am=.09,sm=.07,Eu=.36,Ru=.16,Au=.34,om=[1,.09,.015],_u=[1,.36,.05],im=[1,.66,.32];function nm(e,t){const a=Math.min(1,Math.max(0,e)),s=Tu+(em-Tu)*a*a*a,o=a<.5?om:_u,i=a<.5?_u:im,l=a<.5?a*2:a*2-1;for(let h=0;h<3;h++)t[h]=(o[h]+(i[h]-o[h])*l)*s;t[3]=s}function ku(e,t){const a=Math.sin(e*12.9898+t*78.233)*43758.5453;return a-Math.floor(a)}const Gi=4,rm=3,Ca=qo*qo,xr=mo*mo;class lm{constructor(){k(this,"texture");k(this,"lightTexture");k(this,"modisCount",0);k(this,"viirsCount",0);k(this,"data",new Uint16Array(Ca*4));k(this,"blank",new Uint16Array(Ca*4));k(this,"outside",[new Float32Array(Ca),new Float32Array(Ca)]);k(this,"depth",[new Float32Array(Ca),new Float32Array(Ca)]);k(this,"frp",[new Float32Array(Ca),new Float32Array(Ca)]);k(this,"touched",new Int32Array(65536));k(this,"touchedCount",0);k(this,"mark",new Uint8Array(Ca));k(this,"light",new Float32Array(xr*4));k(this,"lightData",new Uint16Array(xr*4));k(this,"lightTouched",new Int32Array(65536));k(this,"lightTouchedCount",0);k(this,"lightMark",new Uint8Array(xr));k(this,"lightOfOne",new Float32Array(4));const t=Ra.toHalfFloat(Gi);for(let o=0;o<Ca;o++)this.blank[o*4]=t,this.blank[o*4+2]=t;this.data.set(this.blank);for(let o=0;o<2;o++)this.outside[o].fill(Gi);const a=new ta(this.data,qo,qo,Ct,Ua);a.colorSpace=Ba,a.minFilter=Be,a.magFilter=Be,a.generateMipmaps=!1,a.wrapS=We,a.wrapT=We,a.flipY=!1,a.needsUpdate=!0,this.texture=a;const s=new ta(this.lightData,mo,mo,Ct,Ua);s.colorSpace=Ba,s.minFilter=Za,s.magFilter=Be,s.generateMipmaps=!0,s.wrapS=We,s.wrapT=We,s.flipY=!1,s.needsUpdate=!0,this.lightTexture=s}build(t,a,s,o,i=[],l=[]){for(let r=0;r<this.touchedCount;r++){const c=this.touched[r];this.mark[c]=0;for(let d=0;d<2;d++)this.outside[d][c]=Gi,this.depth[d][c]=0,this.frp[d][c]=0;this.data[c*4]=this.blank[c*4],this.data[c*4+1]=0,this.data[c*4+2]=this.blank[c*4+2],this.data[c*4+3]=0}this.touchedCount=0;for(let r=0;r<this.lightTouchedCount;r++){const c=this.lightTouched[r];this.lightMark[c]=0;for(let d=0;d<4;d++)this.light[c*4+d]=0,this.lightData[c*4+d]=0}this.lightTouchedCount=0,this.modisCount=0,this.viirsCount=0;for(const r of t)this.drawFootprint(r,a,s);for(const r of i)this.drawFootprint(r,a,s);for(const r of t)this.drawLight(r,a,s,o);for(const r of l)this.drawLight(r,a,s,o);const h=Ra.toHalfFloat;for(let r=0;r<this.touchedCount;r++){const c=this.touched[r];for(let d=0;d<2;d++){const p=this.depth[d][c];p>0?(this.data[c*4+d*2]=h(-p),this.data[c*4+d*2+1]=h(Math.min(this.frp[d][c],6e4))):this.outside[d][c]<Gi&&(this.data[c*4+d*2]=h(this.outside[d][c]))}}for(let r=0;r<this.lightTouchedCount;r++){const c=this.lightTouched[r];for(let d=0;d<4;d++)this.lightData[c*4+d]=h(Math.min(this.light[c*4+d],6e4))}this.texture.needsUpdate=!0,this.lightTexture.needsUpdate=!0}drawFootprint(t,a,s){const o=qo,[i,l,h,r]=a,c=s[0]/o,d=s[1]/o,p=rm*Math.max(c,d),M=t.family==="viirs"?1:0,b=(t.lon-i)/Math.max(1e-9,h-i)*s[0],g=(t.lat-l)/Math.max(1e-9,r-l)*s[1],R=t.acrossTrackKm*.5,E=t.alongTrackKm*.5,w=Math.max(1e-4,Math.min(R,E)),x=t.azimuthDeg*Math.PI/180,S=Math.sin(x),A=Math.cos(x),B=Math.hypot(R,E)+p,C=Math.max(0,Math.floor((b-B)/c)),P=Math.min(o-1,Math.ceil((b+B)/c)),U=Math.max(0,Math.floor((g-B)/d)),G=Math.min(o-1,Math.ceil((g+B)/d));if(P<C||G<U)return;M===1?this.viirsCount++:this.modisCount++;const _=t.frpMw/Math.max(1e-4,t.acrossTrackKm*t.alongTrackKm),Y=this.outside[M],Z=this.depth[M],ge=this.frp[M];for(let we=U;we<=G;we++){const Ae=(we+.5)*d-g;for(let be=C;be<=P;be++){const Me=(be+.5)*c-b,pe=Math.abs(Me*S+Ae*A)-R,dt=Math.abs(Me*A-Ae*S)-E,ce=Math.hypot(Math.max(pe,0),Math.max(dt,0))+Math.min(Math.max(pe,dt),0);if(ce>p)continue;const ae=we*o+be;if(!this.mark[ae]){if(this.mark[ae]=1,this.touchedCount===this.touched.length){const At=new Int32Array(this.touched.length*2);At.set(this.touched),this.touched=At}this.touched[this.touchedCount++]=ae}if(ce>=0){ce<Y[ae]&&(Y[ae]=ce);continue}const Rt=Math.min(1,-ce/w);Rt>=Z[ae]&&(Z[ae]=Math.max(Rt,.001),ge[ae]=_)}}}drawLight(t,a,s,o){const i=mo,[l,h,r,c]=a,d=s[0]/i,p=s[1]/i,M=(t.lon-l)/Math.max(1e-9,r-l)*s[0],b=(t.lat-h)/Math.max(1e-9,c-h)*s[1],g=t.acrossTrackKm*.5,R=t.alongTrackKm*.5,E=t.azimuthDeg*Math.PI/180,w=Math.sin(E),x=Math.cos(E),S=this.lightOfOne;nm(o(t.frpMw/Math.max(1e-4,t.acrossTrackKm*t.alongTrackKm)),S);const A=Math.min(am,tm*Math.min(g,R)),B=Math.max(A,.8*Math.max(d,p)),C=A*A/(B*B),P=9*B*B,U=(ku(t.lon,t.lat)*2-1)*Au*g,G=(ku(t.lat*1.7,t.lon*.9)*2-1)*Au*R,_=U*w+G*x,Y=U*x-G*w,Z=Math.min(Eu*g,Ru),ge=Math.min(Eu*R,Ru),we=Math.hypot(g,R),Ae=Math.max(0,Math.floor((M-we)/d)),be=Math.min(i-1,Math.ceil((M+we)/d)),Me=Math.max(0,Math.floor((b-we)/p)),pe=Math.min(i-1,Math.ceil((b+we)/p)),dt=this.light;for(let ce=Me;ce<=pe;ce++){const ae=(ce+.5)*p-b;for(let Rt=Ae;Rt<=be;Rt++){const At=(Rt+.5)*d-M,Ot=At*w+ae*x,ie=At*x-ae*w,m=Math.hypot(Ot/g,ie/R);let He=0;const at=At-_,ia=ae-Y;if(at*at+ia*ia<P){for(let _t=0;_t<4;_t++){const na=at+(_t&1?.25:-.25)*d,ha=ia+(_t&2?.25:-.25)*p;He+=Math.exp(-(na*na+ha*ha)/(B*B))}He*=.25*C}if(m<1){const _t=m<=.72?0:(m-.72)/.28,na=(Ot-U)/Z,ha=(ie-G)/ge;He+=sm*Math.exp(-(na*na+ha*ha))*(1-_t*_t*(3-2*_t))}if(He<=1e-4)continue;const aa=ce*i+Rt;if(!this.lightMark[aa]){if(this.lightMark[aa]=1,this.lightTouchedCount===this.lightTouched.length){const _t=new Int32Array(this.lightTouched.length*2);_t.set(this.lightTouched),this.lightTouched=_t}this.lightTouched[this.lightTouchedCount++]=aa}dt[aa*4]+=S[0]*He,dt[aa*4+1]+=S[1]*He,dt[aa*4+2]+=S[2]*He,dt[aa*4+3]+=S[3]*He}}}dispose(){this.texture.dispose(),this.lightTexture.dispose()}}const cm=1500,Fu=30;function um(e){const t=Math.log1p(Math.max(0,e)/Fu)/Math.log1p(cm/Fu);return Math.min(1,t)}function hm(e,t,a,s,o,i=.6){const l=o*o,h=new Uint8Array(t*l),[r,c,d,p]=a,M=s[0]/o,b=s[1]/o;for(let g=0;g<t;g++){const R=g*l;if(g>0){const E=(g-1)*l;for(let w=0;w<l;w++)h[R+w]=Math.floor(h[E+w]*i)}for(const E of e[g]??[])if(!(E.hidden||E.revealedByLook))for(const w of E.footprints){const x=(w.lon-r)/Math.max(1e-9,d-r)*s[0],S=(w.lat-c)/Math.max(1e-9,p-c)*s[1],A=w.acrossTrackKm*.5,B=w.alongTrackKm*.5,C=w.azimuthDeg*Math.PI/180,P=Math.sin(C),U=Math.cos(C),G=Math.round(255*um(w.frpMw/Math.max(1e-4,w.acrossTrackKm*w.alongTrackKm))),_=Math.hypot(A,B),Y=Math.max(0,Math.floor((x-_)/M)),Z=Math.min(o-1,Math.ceil((x+_)/M)),ge=Math.max(0,Math.floor((S-_)/b)),we=Math.min(o-1,Math.ceil((S+_)/b));for(let Ae=ge;Ae<=we;Ae++){const be=(Ae+.5)*b-S;for(let Me=Y;Me<=Z;Me++){const pe=(Me+.5)*M-x;if(Math.abs(pe*P+be*U)>A+.5*M||Math.abs(pe*U-be*P)>B+.5*b)continue;const dt=R+Ae*o+Me;G>h[dt]&&(h[dt]=G)}}}}return h}function wr(e){if(typeof e!="object"||e===null)return null;const t=e;if(typeof t.grid!="object"||t.grid===null||!Array.isArray(t.looks))return null;const a=t.grid,s=Number(a.nx),o=Number(a.ny);if(!Number.isInteger(s)||!Number.isInteger(o)||s<2||o<2||a.index!=="row * nx + column"||a.rows_run!=="north to south")return null;const i=new Map;for(const l of t.looks){if(typeof l!="object"||l===null)return null;const{frame:h,cells:r}=l;if(h==null)continue;if(!Number.isInteger(h)||h<0||!Array.isArray(r))return null;const c=new Uint32Array(r.length);for(let d=0;d<r.length;d++){const p=r[d];if(!Number.isInteger(p)||p<0||p>=s*o)return null;c[d]=p}i.set(h,c)}return i.size>0?{nx:s,ny:o,byFrame:i}:null}class dm{constructor(){k(this,"texture");k(this,"grid",new Le(0,0));k(this,"box",new pa(0,0,0,0));k(this,"data");k(this,"nx",1);k(this,"ny",1);k(this,"key","");k(this,"stepKey","");k(this,"step",0);k(this,"declaredGiven",!1);this.data=new Uint8Array(4),this.texture=this.makeTexture(1,1)}makeTexture(t,a){const s=new ta(this.data,t,a,Ct,Bt);return s.minFilter=Be,s.magFilter=Be,s.generateMipmaps=!1,s.wrapS=We,s.wrapT=We,s.flipY=!1,s.needsUpdate=!0,s}clear(){this.grid.set(0,0),this.box.set(0,0,0,0),this.key="",this.stepKey="",this.declaredGiven=!1}sync(t,a,s,o=null){const{steps:i,stepMs:l,firstTimeMs:h,nx:r,ny:c}=t.info,d=Math.min(i-1,Math.max(0,(s-h)/l)),p=Math.min(i-1,Math.floor(d)),M=Math.min(i-1,p+1);(r!==this.nx||c!==this.ny)&&(this.texture.dispose(),this.nx=r,this.ny=c,this.data=new Uint8Array(r*c*4),this.texture=this.makeTexture(r,c),this.key=""),this.grid.set(r,c);const b=t.declared&&t.declared.nx===r&&t.declared.ny===c?t.declared:null,g=b&&o!==null?b.byFrame.get(o)??null:null;this.declaredGiven=b!==null;const R=`${a}:${p}`,E=`${R}:${b?o??"none":"no list"}`;if(E!==this.key){this.key=E,this.stepKey=R,this.step=p;const w=t.bytes,x=r*c,S=this.data;let A=r,B=-1,C=c,P=-1;for(let U=0;U<c;U++){const G=(p*x+(c-1-U)*r)*2,_=(M*x+(c-1-U)*r)*2,Y=U*r*4;for(let Z=0;Z<r;Z++){const ge=w[G+Z*2],we=w[_+Z*2];S[Y+Z*4]=ge,S[Y+Z*4+1]=b?w[G+Z*2+1]&254:w[G+Z*2+1],S[Y+Z*4+2]=we,S[Y+Z*4+3]=w[_+Z*2+1],(ge>0||we>0)&&(Z<A&&(A=Z),Z>B&&(B=Z),U<C&&(C=U),U>P&&(P=U))}}if(g)for(let U=0;U<g.length;U++){const G=Math.floor(g[U]/r),_=g[U]-G*r,Y=c-1-G;S[(Y*r+_)*4+1]|=1,_<A&&(A=_),_>B&&(B=_),Y<C&&(C=Y),Y>P&&(P=Y)}B<0?this.box.set(0,0,0,0):this.box.set((A-3)/r,(C-3)/c,(B+4)/r,(P+4)/c),this.texture.needsUpdate=!0}return d-p}cellsAbove(t,a,s){const{nx:o,ny:i}=t.info,l=o*i,h=this.step*l*2,r=Math.ceil(a*255),c=[];for(let d=0;d<i;d++)for(let p=0;p<o;p++){const M=h+(d*o+p)*2;t.bytes[M]<r||c.push((p+.5)/o,1-(d+.5)/i,Math.max(.01,s(t.bytes[M+1]/255)))}return new Float32Array(c)}dispose(){this.texture.dispose()}}function ma(e,t){return e.revealed?!1:e.hidden===!0||t&&e.family==="viirs"}/**
 * postprocessing v6.39.6 build Sun Nov 01 2026
 * https://github.com/pmndrs/postprocessing
 * Copyright 2015-2026 Raoul van Rüschen
 * @license Zlib
 */var fm=(()=>{const e=new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),t=new Float32Array([0,0,2,0,0,2]),a=new tn;return a.setAttribute("position",new ga(e,3)),a.setAttribute("uv",new ga(t,2)),a})(),xa=class Jr{static get fullscreenGeometry(){return fm}constructor(t="Pass",a=new po,s=new al){this.name=t,this.renderer=null,this.scene=a,this.camera=s,this.screen=null,this.rtt=!0,this.needsSwap=!0,this.needsDepthBlit=!1,this.needsDepthTexture=!1,this.enabled=!0}get renderToScreen(){return!this.rtt}set renderToScreen(t){if(this.rtt===t){const a=this.fullscreenMaterial;a!==null&&(a.needsUpdate=!0),this.rtt=!t}}set mainScene(t){}set mainCamera(t){}setRenderer(t){this.renderer=t}isEnabled(){return this.enabled}setEnabled(t){this.enabled=t}get fullscreenMaterial(){return this.screen!==null?this.screen.material:null}set fullscreenMaterial(t){let a=this.screen;a!==null?a.material=t:(a=new ba(Jr.fullscreenGeometry,t),a.frustumCulled=!1,this.scene===null&&(this.scene=new po),this.scene.add(a),this.screen=a)}getFullscreenMaterial(){return this.fullscreenMaterial}setFullscreenMaterial(t){this.fullscreenMaterial=t}getDepthTexture(){return null}setDepthTexture(t,a=an){}render(t,a,s,o,i){throw new Error("Render method not implemented!")}setSize(t,a){}initialize(t,a,s){}dispose(){for(const t of Object.keys(this)){const a=this[t];(a instanceof Qt||a instanceof fh||a instanceof ol||a instanceof Jr)&&this[t].dispose()}this.fullscreenMaterial!==null&&this.fullscreenMaterial.dispose()}},mm=class extends xa{constructor(){super("ClearMaskPass",null,null),this.needsSwap=!1}render(e,t,a,s,o){const i=e.state.buffers.stencil;i.setLocked(!1),i.setTest(!1)}},pm=`#ifdef COLOR_WRITE
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
}`,ul="varying vec2 vUv;void main(){vUv=position.xy*0.5+0.5;gl_Position=vec4(position.xy,1.0,1.0);}",kh=class extends Et{constructor(){super({name:"CopyMaterial",defines:{COLOR_SPACE_CONVERSION:"1",DEPTH_PACKING:"0",COLOR_WRITE:"1"},uniforms:{inputBuffer:new De(null),depthBuffer:new De(null),channelWeights:new De(null),opacity:new De(1)},blending:Bs,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:pm,vertexShader:ul}),this.depthFunc=Md}get inputBuffer(){return this.uniforms.inputBuffer.value}set inputBuffer(e){const t=e!==null;this.colorWrite!==t&&(t?this.defines.COLOR_WRITE=!0:delete this.defines.COLOR_WRITE,this.colorWrite=t,this.needsUpdate=!0),this.uniforms.inputBuffer.value=e}get depthBuffer(){return this.uniforms.depthBuffer.value}set depthBuffer(e){const t=e!==null;this.depthWrite!==t&&(t?this.defines.DEPTH_WRITE=!0:delete this.defines.DEPTH_WRITE,this.depthTest=t,this.depthWrite=t,this.needsUpdate=!0),this.uniforms.depthBuffer.value=e}set depthPacking(e){this.defines.DEPTH_PACKING=e.toFixed(0),this.needsUpdate=!0}get colorSpaceConversion(){return this.defines.COLOR_SPACE_CONVERSION!==void 0}set colorSpaceConversion(e){this.colorSpaceConversion!==e&&(e?this.defines.COLOR_SPACE_CONVERSION=!0:delete this.defines.COLOR_SPACE_CONVERSION,this.needsUpdate=!0)}get channelWeights(){return this.uniforms.channelWeights.value}set channelWeights(e){e!==null?(this.defines.USE_WEIGHTS="1",this.uniforms.channelWeights.value=e):delete this.defines.USE_WEIGHTS,this.needsUpdate=!0}setInputBuffer(e){this.uniforms.inputBuffer.value=e}getOpacity(e){return this.uniforms.opacity.value}setOpacity(e){this.uniforms.opacity.value=e}},Fh=class extends xa{constructor(e,t=!0){super("CopyPass"),this.fullscreenMaterial=new kh,this.needsSwap=!1,this.renderTarget=e,e===void 0&&(this.renderTarget=new Qt(1,1,{minFilter:Be,magFilter:Be,stencilBuffer:!1,depthBuffer:!1}),this.renderTarget.texture.name="CopyPass.Target"),this.autoResize=t}get resize(){return this.autoResize}set resize(e){this.autoResize=e}get texture(){return this.renderTarget.texture}getTexture(){return this.renderTarget.texture}setAutoResizeEnabled(e){this.autoResize=e}render(e,t,a,s,o){this.fullscreenMaterial.inputBuffer=t.texture,e.setRenderTarget(this.renderToScreen?null:this.renderTarget),e.render(this.scene,this.camera)}setSize(e,t){this.autoResize&&this.renderTarget.setSize(e,t)}initialize(e,t,a){a!==void 0&&(this.renderTarget.texture.type=a,a!==Bt?this.fullscreenMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1":e!==null&&e.outputColorSpace===ht&&(this.renderTarget.texture.colorSpace=ht))}},Du=new qi,Dh=class extends xa{constructor(e=!0,t=!0,a=!1){super("ClearPass",null,null),this.needsSwap=!1,this.color=e,this.depth=t,this.stencil=a,this.overrideClearColor=null,this.overrideClearAlpha=-1}setClearFlags(e,t,a){this.color=e,this.depth=t,this.stencil=a}getOverrideClearColor(){return this.overrideClearColor}setOverrideClearColor(e){this.overrideClearColor=e}getOverrideClearAlpha(){return this.overrideClearAlpha}setOverrideClearAlpha(e){this.overrideClearAlpha=e}render(e,t,a,s,o){const i=this.overrideClearColor,l=this.overrideClearAlpha,h=e.getClearAlpha(),r=i!==null,c=l>=0;r?(e.getClearColor(Du),e.setClearColor(i,c?l:h)):c&&e.setClearAlpha(l),e.setRenderTarget(this.renderToScreen?null:t),e.clear(this.color,this.depth,this.stencil),r?e.setClearColor(Du,h):c&&e.setClearAlpha(h)}},vm=class extends xa{constructor(e,t){super("MaskPass",e,t),this.needsSwap=!1,this.clearPass=new Dh(!1,!1,!0),this.inverse=!1}set mainScene(e){this.scene=e}set mainCamera(e){this.camera=e}get inverted(){return this.inverse}set inverted(e){this.inverse=e}get clear(){return this.clearPass.enabled}set clear(e){this.clearPass.enabled=e}getClearPass(){return this.clearPass}isInverted(){return this.inverted}setInverted(e){this.inverted=e}render(e,t,a,s,o){const i=e.getContext(),l=e.state.buffers,h=this.scene,r=this.camera,c=this.clearPass,d=this.inverted?0:1,p=1-d;l.color.setMask(!1),l.depth.setMask(!1),l.color.setLocked(!0),l.depth.setLocked(!0),l.stencil.setTest(!0),l.stencil.setOp(i.REPLACE,i.REPLACE,i.REPLACE),l.stencil.setFunc(i.ALWAYS,d,4294967295),l.stencil.setClear(p),l.stencil.setLocked(!0),this.clearPass.enabled&&(this.renderToScreen?c.render(e,null):(c.render(e,t),c.render(e,a))),this.renderToScreen?(e.setRenderTarget(null),e.render(h,r)):(e.setRenderTarget(t),e.render(h,r),e.setRenderTarget(a),e.render(h,r)),l.color.setLocked(!1),l.depth.setLocked(!1),l.stencil.setLocked(!1),l.stencil.setFunc(i.EQUAL,1,4294967295),l.stencil.setOp(i.KEEP,i.KEEP,i.KEEP),l.stencil.setLocked(!0)}};function gm(e,t){const a=e.getContext();if(t<=0||typeof a.renderbufferStorageMultisample!="function")return 0;const s=a.getParameter(a.MAX_SAMPLES),o=Math.min(t,s);if(o<=0)return 0;const i=a.getParameter(a.RENDERBUFFER_BINDING),l=a.createRenderbuffer();try{return a.bindRenderbuffer(a.RENDERBUFFER,l),a.renderbufferStorageMultisample(a.RENDERBUFFER,o,a.RGBA8,1,1),o}catch{return 0}finally{a.bindRenderbuffer(a.RENDERBUFFER,i),a.deleteRenderbuffer(l)}}var Mr=1/1e3,xm=1e3,wm=class{constructor(){this.startTime=performance.now(),this.previousTime=0,this.currentTime=0,this._delta=0,this._elapsed=0,this._fixedDelta=1e3/60,this.timescale=1,this.useFixedDelta=!1,this._autoReset=!1}get autoReset(){return this._autoReset}set autoReset(e){typeof document<"u"&&document.hidden!==void 0&&(e?document.addEventListener("visibilitychange",this):document.removeEventListener("visibilitychange",this),this._autoReset=e)}get delta(){return this._delta*Mr}get fixedDelta(){return this._fixedDelta*Mr}set fixedDelta(e){this._fixedDelta=e*xm}get elapsed(){return this._elapsed*Mr}update(e){this.useFixedDelta?this._delta=this.fixedDelta:(this.previousTime=this.currentTime,this.currentTime=(e!==void 0?e:performance.now())-this.startTime,this._delta=this.currentTime-this.previousTime),this._delta*=this.timescale,this._elapsed+=this._delta}reset(){this._delta=0,this._elapsed=0,this.currentTime=performance.now()-this.startTime}getDelta(){return this.delta}getElapsed(){return this.elapsed}handleEvent(e){document.hidden||(this.currentTime=performance.now()-this.startTime)}dispose(){this.autoReset=!1}},Mm=class{constructor(e=null,{depthBuffer:t=!0,stencilBuffer:a=!1,multisampling:s=0,frameBufferType:o=Bt}={}){this.renderer=null,this.inputBuffer=this.createBuffer(t,a,o,s),this.outputBuffer=this.inputBuffer.clone(),this.copyPass=new Fh,this.depthRenderTarget=null,this.passes=[],this.timer=new wm,this.autoRenderToScreen=!0,this.setRenderer(e)}get stableDepthTexture(){return this.depthRenderTarget===null?null:this.depthRenderTarget.depthTexture}get multisampling(){return this.inputBuffer.samples}set multisampling(e){const t=this.renderer===null?e:gm(this.renderer,e);this.multisampling!==t&&(this.inputBuffer.samples=t,this.outputBuffer.samples=t,this.inputBuffer.dispose(),this.outputBuffer.dispose())}getTimer(){return this.timer}getRenderer(){return this.renderer}setRenderer(e){if(this.renderer=e,e!==null){const t=e.getSize(new Le),a=e.getContext().getContextAttributes().alpha,s=this.inputBuffer.texture.type;s===Bt&&e.outputColorSpace===ht&&(this.inputBuffer.texture.colorSpace=ht,this.outputBuffer.texture.colorSpace=ht,this.inputBuffer.dispose(),this.outputBuffer.dispose());const o=this.multisampling;this.multisampling=o,e.autoClear=!1,this.setSize(t.width,t.height);for(const i of this.passes)i.initialize(e,a,s)}}replaceRenderer(e,t=!0){const a=this.renderer,s=a.domElement.parentNode;return this.setRenderer(e),t&&s!==null&&(s.removeChild(a.domElement),s.appendChild(e.domElement)),a}createDepthTexture(){const e=new dr;e.name="EffectComposer.InputDepth",this.inputBuffer.stencilBuffer?(e.format=gd,e.type=xd):e.type=sl;const t=new dr;t.format=e.format,t.type=e.type,t.name="EffectComposer.OutputDepth";const a=new dr;a.format=e.format,a.type=e.type,a.name="EffectComposer.StableDepth",this.inputBuffer.depthTexture=e,this.outputBuffer.depthTexture=t,this.inputBuffer.dispose(),this.outputBuffer.dispose();const{width:s,height:o}=this.inputBuffer;this.depthRenderTarget=new Qt(s,o,{depthBuffer:!0,stencilBuffer:this.inputBuffer.stencilBuffer,depthTexture:a})}blitDepthBuffer(e){const t=this.renderer,a=this.depthRenderTarget,s=t.properties,o=t.getContext();t.setRenderTarget(a);const i=s.get(e).__webglFramebuffer,l=s.get(a).__webglFramebuffer,h=e.stencilBuffer?o.DEPTH_BUFFER_BIT|o.STENCIL_BUFFER_BIT:o.DEPTH_BUFFER_BIT;o.bindFramebuffer(o.READ_FRAMEBUFFER,i),o.bindFramebuffer(o.DRAW_FRAMEBUFFER,l),o.blitFramebuffer(0,0,e.width,e.height,0,0,a.width,a.height,h,o.NEAREST),o.bindFramebuffer(o.READ_FRAMEBUFFER,null),o.bindFramebuffer(o.DRAW_FRAMEBUFFER,null),t.setRenderTarget(null)}deleteDepthTexture(){const e=this.stableDepthTexture;for(const t of this.passes)t.getDepthTexture()===e&&t.setDepthTexture(null);this.depthRenderTarget!==null&&(this.depthRenderTarget.dispose(),this.depthRenderTarget=null),this.inputBuffer.depthTexture!==null&&(this.inputBuffer.depthTexture.dispose(),this.inputBuffer.depthTexture=null),this.outputBuffer.depthTexture!==null&&(this.outputBuffer.depthTexture.dispose(),this.outputBuffer.depthTexture=null)}createBuffer(e,t,a,s){const o=this.renderer,i=o===null?new Le:o.getDrawingBufferSize(new Le),l=new Qt(i.width,i.height,{minFilter:Be,magFilter:Be,samples:s,stencilBuffer:t,depthBuffer:e,type:a});return a===Bt&&o!==null&&o.outputColorSpace===ht&&(l.texture.colorSpace=ht),l.texture.name="EffectComposer.Buffer",l.texture.generateMipmaps=!1,l}setMainScene(e){for(const t of this.passes)t.mainScene=e}setMainCamera(e){for(const t of this.passes)t.mainCamera=e}addPass(e,t){const a=this.passes,s=this.renderer,o=s.getDrawingBufferSize(new Le),i=s.getContext().getContextAttributes().alpha,l=this.inputBuffer.texture.type;if(e.renderer=s,e.setSize(o.width,o.height),e.initialize(s,i,l),this.autoRenderToScreen&&(a.length>0&&(a[a.length-1].renderToScreen=!1),e.renderToScreen&&(this.autoRenderToScreen=!1)),t!==void 0?a.splice(t,0,e):a.push(e),this.autoRenderToScreen&&(a[a.length-1].renderToScreen=!0),e.needsDepthTexture||this.depthRenderTarget!==null)if(this.depthRenderTarget===null){this.createDepthTexture();for(const h of a)h.setDepthTexture(this.stableDepthTexture)}else e.setDepthTexture(this.stableDepthTexture)}removePass(e){const t=this.passes,a=t.indexOf(e);if(a!==-1&&t.splice(a,1).length>0){const i=this.stableDepthTexture;if(i!==null){const l=(r,c)=>r||c.needsDepthTexture;t.reduce(l,!1)||(e.getDepthTexture()===i&&e.setDepthTexture(null),this.deleteDepthTexture())}this.autoRenderToScreen&&a===t.length&&(e.renderToScreen=!1,t.length>0&&(t[t.length-1].renderToScreen=!0))}}removeAllPasses(){const e=this.passes;this.deleteDepthTexture(),e.length>0&&(this.autoRenderToScreen&&(e[e.length-1].renderToScreen=!1),this.passes=[])}render(e){const t=this.renderer,a=this.copyPass;let s=this.inputBuffer,o=this.outputBuffer,i,l=!1;e===void 0&&(this.timer.update(),e=this.timer.getDelta());for(const h of this.passes)if(h.enabled){if(h.render(t,s,o,e,l),h.needsDepthBlit&&this.depthRenderTarget!==null&&this.blitDepthBuffer(s),h.needsSwap){if(l){a.renderToScreen=h.renderToScreen;const r=t.getContext(),c=t.state.buffers.stencil;c.setFunc(r.NOTEQUAL,1,4294967295),a.render(t,s,o,e,l),c.setFunc(r.EQUAL,1,4294967295)}i=s,s=o,o=i}h instanceof vm?l=!0:h instanceof mm&&(l=!1)}}setSize(e,t,a){const s=this.renderer,o=s.getSize(new Le);(e===void 0||t===void 0)&&(e=o.width,t=o.height),(o.width!==e||o.height!==t)&&s.setSize(e,t,a);const i=s.getDrawingBufferSize(new Le);this.inputBuffer.setSize(i.width,i.height),this.outputBuffer.setSize(i.width,i.height),this.depthRenderTarget!==null&&this.depthRenderTarget.setSize(i.width,i.height);for(const l of this.passes)l.setSize(i.width,i.height)}reset(){this.dispose(),this.autoRenderToScreen=!0}dispose(){for(const e of this.passes)e.dispose();this.deleteDepthTexture(),this.inputBuffer.dispose(),this.outputBuffer.dispose(),this.copyPass.dispose(),this.timer.dispose(),this.passes=[],xa.fullscreenGeometry.dispose()}},Us={NONE:0,DEPTH:1,CONVOLUTION:2},Ye={FRAGMENT_HEAD:"FRAGMENT_HEAD",FRAGMENT_MAIN_UV:"FRAGMENT_MAIN_UV",FRAGMENT_MAIN_IMAGE:"FRAGMENT_MAIN_IMAGE",VERTEX_HEAD:"VERTEX_HEAD",VERTEX_MAIN_SUPPORT:"VERTEX_MAIN_SUPPORT"},ym=class{constructor(){this.shaderParts=new Map([[Ye.FRAGMENT_HEAD,null],[Ye.FRAGMENT_MAIN_UV,null],[Ye.FRAGMENT_MAIN_IMAGE,null],[Ye.VERTEX_HEAD,null],[Ye.VERTEX_MAIN_SUPPORT,null]]),this.defines=new Map,this.uniforms=new Map,this.blendModes=new Map,this.extensions=new Set,this.attributes=Us.NONE,this.varyings=new Set,this.uvTransformation=!1,this.readDepth=!1,this.colorSpace=dh}},yr=!1,Pu=class{constructor(e=null){this.originalMaterials=new Map,this.material=null,this.materials=null,this.materialsBackSide=null,this.materialsDoubleSide=null,this.materialsFlatShaded=null,this.materialsFlatShadedBackSide=null,this.materialsFlatShadedDoubleSide=null,this.setMaterial(e),this.meshCount=0,this.replaceMaterial=t=>{if(t.isMesh){let a;if(t.material.flatShading)switch(t.material.side){case Ls:a=this.materialsFlatShadedDoubleSide;break;case so:a=this.materialsFlatShadedBackSide;break;default:a=this.materialsFlatShaded;break}else switch(t.material.side){case Ls:a=this.materialsDoubleSide;break;case so:a=this.materialsBackSide;break;default:a=this.materials;break}this.originalMaterials.set(t,t.material),t.isSkinnedMesh?t.material=a[2]:t.isInstancedMesh?t.material=a[1]:t.material=a[0],++this.meshCount}}}cloneMaterial(e){if(!(e instanceof Et))return e.clone();const t=e.uniforms,a=new Map;for(const o in t){const i=t[o].value;i.isRenderTargetTexture&&(t[o].value=null,a.set(o,i))}const s=e.clone();for(const o of a)t[o[0]].value=o[1],s.uniforms[o[0]].value=o[1];return s}setMaterial(e){if(this.disposeMaterials(),this.material=e,e!==null){const t=this.materials=[this.cloneMaterial(e),this.cloneMaterial(e),this.cloneMaterial(e)];for(const a of t)a.uniforms=Object.assign({},e.uniforms),a.side=wd;t[2].skinning=!0,this.materialsBackSide=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.side=so,s}),this.materialsDoubleSide=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.side=Ls,s}),this.materialsFlatShaded=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.flatShading=!0,s}),this.materialsFlatShadedBackSide=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.flatShading=!0,s.side=so,s}),this.materialsFlatShadedDoubleSide=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.flatShading=!0,s.side=Ls,s})}}render(e,t,a){const s=e.shadowMap.enabled;if(e.shadowMap.enabled=!1,yr){const o=this.originalMaterials;this.meshCount=0,t.traverse(this.replaceMaterial),e.render(t,a);for(const i of o)i[0].material=i[1];this.meshCount!==o.size&&o.clear()}else{const o=t.overrideMaterial;t.overrideMaterial=this.material,e.render(t,a),t.overrideMaterial=o}e.shadowMap.enabled=s}disposeMaterials(){if(this.material!==null){const e=this.materials.concat(this.materialsBackSide).concat(this.materialsDoubleSide).concat(this.materialsFlatShaded).concat(this.materialsFlatShadedBackSide).concat(this.materialsFlatShadedDoubleSide);for(const t of e)t.dispose()}}dispose(){this.originalMaterials.clear(),this.disposeMaterials()}static get workaroundEnabled(){return yr}static set workaroundEnabled(e){yr=e}},us=-1,za=class extends il{constructor(e=null,t=us,a=us,s=1){super(),e!==null&&this.addEventListener("change",()=>e.setSize(this.baseSize.width,this.baseSize.height)),this.baseSize=new Le(1,1),this.preferredSize=new Le(t,a),this.target=this.preferredSize,this.s=s,this.effectiveSize=new Le,this.addEventListener("change",()=>this.updateEffectiveSize()),this.updateEffectiveSize()}updateEffectiveSize(){const e=this.baseSize,t=this.preferredSize,a=this.effectiveSize,s=this.scale;t.width!==us?a.width=t.width:t.height!==us?a.width=Math.round(t.height*(e.width/Math.max(e.height,1))):a.width=Math.round(e.width*s),t.height!==us?a.height=t.height:t.width!==us?a.height=Math.round(t.width/Math.max(e.width/Math.max(e.height,1),1)):a.height=Math.round(e.height*s)}get width(){return this.effectiveSize.width}set width(e){this.preferredWidth=e}get height(){return this.effectiveSize.height}set height(e){this.preferredHeight=e}getWidth(){return this.width}getHeight(){return this.height}get scale(){return this.s}set scale(e){this.s!==e&&(this.s=e,this.preferredSize.setScalar(us),this.dispatchEvent({type:"change"}))}getScale(){return this.scale}setScale(e){this.scale=e}get baseWidth(){return this.baseSize.width}set baseWidth(e){this.baseSize.width!==e&&(this.baseSize.width=e,this.dispatchEvent({type:"change"}))}getBaseWidth(){return this.baseWidth}setBaseWidth(e){this.baseWidth=e}get baseHeight(){return this.baseSize.height}set baseHeight(e){this.baseSize.height!==e&&(this.baseSize.height=e,this.dispatchEvent({type:"change"}))}getBaseHeight(){return this.baseHeight}setBaseHeight(e){this.baseHeight=e}setBaseSize(e,t){(this.baseSize.width!==e||this.baseSize.height!==t)&&(this.baseSize.set(e,t),this.dispatchEvent({type:"change"}))}get preferredWidth(){return this.preferredSize.width}set preferredWidth(e){this.preferredSize.width!==e&&(this.preferredSize.width=e,this.dispatchEvent({type:"change"}))}getPreferredWidth(){return this.preferredWidth}setPreferredWidth(e){this.preferredWidth=e}get preferredHeight(){return this.preferredSize.height}set preferredHeight(e){this.preferredSize.height!==e&&(this.preferredSize.height=e,this.dispatchEvent({type:"change"}))}getPreferredHeight(){return this.preferredHeight}setPreferredHeight(e){this.preferredHeight=e}setPreferredSize(e,t){(this.preferredSize.width!==e||this.preferredSize.height!==t)&&(this.preferredSize.set(e,t),this.dispatchEvent({type:"change"}))}copy(e){this.s=e.scale,this.baseSize.set(e.baseWidth,e.baseHeight),this.preferredSize.set(e.preferredWidth,e.preferredHeight),this.dispatchEvent({type:"change"})}static get AUTO_SIZE(){return us}},Ce={ADD:0,ALPHA:1,AVERAGE:2,COLOR:3,COLOR_BURN:4,COLOR_DODGE:5,DARKEN:6,DIFFERENCE:7,DIVIDE:8,DST:9,EXCLUSION:10,HARD_LIGHT:11,HARD_MIX:12,HUE:13,INVERT:14,INVERT_RGB:15,LIGHTEN:16,LINEAR_BURN:17,LINEAR_DODGE:18,LINEAR_LIGHT:19,LUMINOSITY:20,MULTIPLY:21,NEGATION:22,NORMAL:23,OVERLAY:24,PIN_LIGHT:25,REFLECT:26,SATURATION:27,SCREEN:28,SOFT_LIGHT:29,SRC:30,SUBTRACT:31,VIVID_LIGHT:32},bm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb+src.rgb;return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Sm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){return mix(dst,src,src.a*opacity);}",Tm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=(dst.rgb+src.rgb)*0.5;return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Em="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=RGBToHSL(dst.rgb);vec3 b=RGBToHSL(src.rgb);vec3 c=HSLToRGB(vec3(b.xy,a.z));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Rm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=dst.rgb,b=src.rgb;vec3 c=mix(step(0.0,b)*(1.0-min(vec3(1.0),(1.0-a)/max(b,1e-9))),vec3(1.0),step(1.0,a));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Am="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=dst.rgb,b=src.rgb;vec3 c=step(0.0,a)*mix(min(vec3(1.0),a/max(1.0-b,1e-9)),vec3(1.0),step(1.0,b));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",_m="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=min(dst.rgb,src.rgb);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",km="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=abs(dst.rgb-src.rgb);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Fm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb/max(src.rgb,1e-9);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Dm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb+src.rgb-2.0*dst.rgb*src.rgb;return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Pm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=min(dst.rgb,1.0);vec3 b=min(src.rgb,1.0);vec3 c=mix(2.0*a*b,1.0-2.0*(1.0-a)*(1.0-b),step(0.5,b));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Im="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=step(1.0,dst.rgb+src.rgb);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Cm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=RGBToHSL(dst.rgb);vec3 b=RGBToHSL(src.rgb);vec3 c=HSLToRGB(vec3(b.x,a.yz));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Lm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=max(1.0-src.rgb,0.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Nm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=src.rgb*max(1.0-dst.rgb,0.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",zm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=max(dst.rgb,src.rgb);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Um="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=clamp(src.rgb+dst.rgb-1.0,0.0,1.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Bm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=min(dst.rgb+src.rgb,1.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Om="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=clamp(2.0*src.rgb+dst.rgb-1.0,0.0,1.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Hm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=RGBToHSL(dst.rgb);vec3 b=RGBToHSL(src.rgb);vec3 c=HSLToRGB(vec3(a.xy,b.z));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Gm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb*src.rgb;return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Km="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=max(1.0-abs(1.0-dst.rgb-src.rgb),0.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Wm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){return mix(dst,src,opacity);}",Vm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=2.0*src.rgb*dst.rgb;vec3 b=1.0-2.0*(1.0-src.rgb)*(1.0-dst.rgb);vec3 c=mix(a,b,step(0.5,dst.rgb));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Ym="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 src2=2.0*src.rgb;vec3 c=mix(mix(src2,dst.rgb,step(0.5*dst.rgb,src.rgb)),max(src2-1.0,vec3(0.0)),step(dst.rgb,src2-1.0));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",$m="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=min(dst.rgb*dst.rgb/max(1.0-src.rgb,1e-9),1.0);vec3 c=mix(a,src.rgb,step(1.0,src.rgb));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",jm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=RGBToHSL(dst.rgb);vec3 b=RGBToHSL(src.rgb);vec3 c=HSLToRGB(vec3(a.x,b.y,a.z));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Xm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb+src.rgb-min(dst.rgb*src.rgb,1.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",qm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 src2=2.0*src.rgb;vec3 d=dst.rgb+(src2-1.0);vec3 w=step(0.5,src.rgb);vec3 a=dst.rgb-(1.0-src2)*dst.rgb*(1.0-dst.rgb);vec3 b=mix(d*(sqrt(dst.rgb)-dst.rgb),d*dst.rgb*((16.0*dst.rgb-12.0)*dst.rgb+3.0),w*(1.0-step(0.25,dst.rgb)));vec3 c=mix(a,b,w);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Zm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){return src;}",Qm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=max(dst.rgb-src.rgb,0.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Jm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=mix(max(1.0-min((1.0-dst.rgb)/(2.0*src.rgb),1.0),0.0),min(dst.rgb/(2.0*(1.0-src.rgb)),1.0),step(0.5,src.rgb));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",e0=new Map([[Ce.ADD,bm],[Ce.ALPHA,Sm],[Ce.AVERAGE,Tm],[Ce.COLOR,Em],[Ce.COLOR_BURN,Rm],[Ce.COLOR_DODGE,Am],[Ce.DARKEN,_m],[Ce.DIFFERENCE,km],[Ce.DIVIDE,Fm],[Ce.DST,null],[Ce.EXCLUSION,Dm],[Ce.HARD_LIGHT,Pm],[Ce.HARD_MIX,Im],[Ce.HUE,Cm],[Ce.INVERT,Lm],[Ce.INVERT_RGB,Nm],[Ce.LIGHTEN,zm],[Ce.LINEAR_BURN,Um],[Ce.LINEAR_DODGE,Bm],[Ce.LINEAR_LIGHT,Om],[Ce.LUMINOSITY,Hm],[Ce.MULTIPLY,Gm],[Ce.NEGATION,Km],[Ce.NORMAL,Wm],[Ce.OVERLAY,Vm],[Ce.PIN_LIGHT,Ym],[Ce.REFLECT,$m],[Ce.SATURATION,jm],[Ce.SCREEN,Xm],[Ce.SOFT_LIGHT,qm],[Ce.SRC,Zm],[Ce.SUBTRACT,Qm],[Ce.VIVID_LIGHT,Jm]]),t0=class extends il{constructor(e,t=1){super(),this._blendFunction=e,this.opacity=new De(t)}getOpacity(){return this.opacity.value}setOpacity(e){this.opacity.value=e}get blendFunction(){return this._blendFunction}set blendFunction(e){this._blendFunction=e,this.dispatchEvent({type:"change"})}getBlendFunction(){return this.blendFunction}setBlendFunction(e){this.blendFunction=e}getShaderCode(){return e0.get(this.blendFunction)}},Ph=class extends il{constructor(e,t,{attributes:a=Us.NONE,blendFunction:s=Ce.NORMAL,defines:o=new Map,uniforms:i=new Map,extensions:l=null,vertexShader:h=null}={}){super(),this.name=e,this.renderer=null,this.attributes=a,this.fragmentShader=t,this.vertexShader=h,this.defines=o,this.uniforms=i,this.extensions=l,this.blendMode=new t0(s),this.blendMode.addEventListener("change",r=>this.setChanged()),this._inputColorSpace=dh,this._outputColorSpace=Ba}get inputColorSpace(){return this._inputColorSpace}set inputColorSpace(e){this._inputColorSpace=e,this.setChanged()}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e,this.setChanged()}set mainScene(e){}set mainCamera(e){}getName(){return this.name}setRenderer(e){this.renderer=e}getDefines(){return this.defines}getUniforms(){return this.uniforms}getExtensions(){return this.extensions}getBlendMode(){return this.blendMode}getAttributes(){return this.attributes}setAttributes(e){this.attributes=e,this.setChanged()}getFragmentShader(){return this.fragmentShader}setFragmentShader(e){this.fragmentShader=e,this.setChanged()}getVertexShader(){return this.vertexShader}setVertexShader(e){this.vertexShader=e,this.setChanged()}setChanged(){this.dispatchEvent({type:"change"})}setDepthTexture(e,t=an){}update(e,t,a){}setSize(e,t){}initialize(e,t,a){}dispose(){for(const e of Object.keys(this)){const t=this[e];(t instanceof Qt||t instanceof fh||t instanceof ol||t instanceof xa)&&this[e].dispose()}}},hl={MEDIUM:2,LARGE:3},a0=`#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D inputBuffer;
#else
uniform lowp sampler2D inputBuffer;
#endif
varying vec2 vUv0;varying vec2 vUv1;varying vec2 vUv2;varying vec2 vUv3;void main(){vec4 sum=texture2D(inputBuffer,vUv0);sum+=texture2D(inputBuffer,vUv1);sum+=texture2D(inputBuffer,vUv2);sum+=texture2D(inputBuffer,vUv3);gl_FragColor=sum*0.25;
#include <colorspace_fragment>
}`,s0="uniform vec4 texelSize;uniform float kernel;uniform float scale;varying vec2 vUv0;varying vec2 vUv1;varying vec2 vUv2;varying vec2 vUv3;void main(){vec2 uv=position.xy*0.5+0.5;vec2 dUv=(texelSize.xy*vec2(kernel)+texelSize.zw)*scale;vUv0=vec2(uv.x-dUv.x,uv.y+dUv.y);vUv1=vec2(uv.x+dUv.x,uv.y+dUv.y);vUv2=vec2(uv.x+dUv.x,uv.y-dUv.y);vUv3=vec2(uv.x-dUv.x,uv.y-dUv.y);gl_Position=vec4(position.xy,1.0,1.0);}",o0=[new Float32Array([0,0]),new Float32Array([0,1,1]),new Float32Array([0,1,1,2]),new Float32Array([0,1,2,2,3]),new Float32Array([0,1,2,3,4,4,5]),new Float32Array([0,1,2,3,4,5,7,8,9,10])],i0=class extends Et{constructor(e=new pa){super({name:"KawaseBlurMaterial",uniforms:{inputBuffer:new De(null),texelSize:new De(new pa),scale:new De(1),kernel:new De(0)},blending:Bs,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:a0,vertexShader:s0}),this.setTexelSize(e.x,e.y),this.kernelSize=hl.MEDIUM}set inputBuffer(e){this.uniforms.inputBuffer.value=e}setInputBuffer(e){this.inputBuffer=e}get kernelSequence(){return o0[this.kernelSize]}get scale(){return this.uniforms.scale.value}set scale(e){this.uniforms.scale.value=e}getScale(){return this.uniforms.scale.value}setScale(e){this.uniforms.scale.value=e}getKernel(){return null}get kernel(){return this.uniforms.kernel.value}set kernel(e){this.uniforms.kernel.value=e}setKernel(e){this.kernel=e}setTexelSize(e,t){this.uniforms.texelSize.value.set(e,t,e*.5,t*.5)}setSize(e,t){const a=1/e,s=1/t;this.uniforms.texelSize.value.set(a,s,a*.5,s*.5)}},n0=class extends xa{constructor({kernelSize:e=hl.MEDIUM,resolutionScale:t=.5,width:a=za.AUTO_SIZE,height:s=za.AUTO_SIZE,resolutionX:o=a,resolutionY:i=s}={}){super("KawaseBlurPass"),this.renderTargetA=new Qt(1,1,{depthBuffer:!1}),this.renderTargetA.texture.name="Blur.Target.A",this.renderTargetB=this.renderTargetA.clone(),this.renderTargetB.texture.name="Blur.Target.B";const l=this.resolution=new za(this,o,i,t);l.addEventListener("change",h=>this.setSize(l.baseWidth,l.baseHeight)),this._blurMaterial=new i0,this._blurMaterial.kernelSize=e,this.copyMaterial=new kh}getResolution(){return this.resolution}get blurMaterial(){return this._blurMaterial}set blurMaterial(e){this._blurMaterial=e}get dithering(){return this.copyMaterial.dithering}set dithering(e){this.copyMaterial.dithering=e}get kernelSize(){return this.blurMaterial.kernelSize}set kernelSize(e){this.blurMaterial.kernelSize=e}get width(){return this.resolution.width}set width(e){this.resolution.preferredWidth=e}get height(){return this.resolution.height}set height(e){this.resolution.preferredHeight=e}get scale(){return this.blurMaterial.scale}set scale(e){this.blurMaterial.scale=e}getScale(){return this.blurMaterial.scale}setScale(e){this.blurMaterial.scale=e}getKernelSize(){return this.kernelSize}setKernelSize(e){this.kernelSize=e}getResolutionScale(){return this.resolution.scale}setResolutionScale(e){this.resolution.scale=e}render(e,t,a,s,o){const i=this.scene,l=this.camera,h=this.renderTargetA,r=this.renderTargetB,c=this.blurMaterial,d=c.kernelSequence;let p=t;this.fullscreenMaterial=c;for(let M=0,b=d.length;M<b;++M){const g=(M&1)===0?h:r;c.kernel=d[M],c.inputBuffer=p.texture,e.setRenderTarget(g),e.render(i,l),p=g}this.fullscreenMaterial=this.copyMaterial,this.copyMaterial.inputBuffer=p.texture,e.setRenderTarget(this.renderToScreen?null:a),e.render(i,l)}setSize(e,t){const a=this.resolution;a.setBaseSize(e,t);const s=a.width,o=a.height;this.renderTargetA.setSize(s,o),this.renderTargetB.setSize(s,o),this.blurMaterial.setSize(e,t)}initialize(e,t,a){a!==void 0&&(this.renderTargetA.texture.type=a,this.renderTargetB.texture.type=a,a!==Bt?(this.blurMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1",this.copyMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1"):e!==null&&e.outputColorSpace===ht&&(this.renderTargetA.texture.colorSpace=ht,this.renderTargetB.texture.colorSpace=ht))}static get AUTO_SIZE(){return za.AUTO_SIZE}},r0=`#include <common>
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
}`,l0=class extends Et{constructor(e=!1,t=null){super({name:"LuminanceMaterial",defines:{THREE_REVISION:nl.replace(/\D+/g,"")},uniforms:{inputBuffer:new De(null),threshold:new De(0),smoothing:new De(1),range:new De(null)},blending:Bs,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:r0,vertexShader:ul}),this.colorOutput=e,this.luminanceRange=t}set inputBuffer(e){this.uniforms.inputBuffer.value=e}setInputBuffer(e){this.uniforms.inputBuffer.value=e}get threshold(){return this.uniforms.threshold.value}set threshold(e){this.smoothing>0||e>0?this.defines.THRESHOLD="1":delete this.defines.THRESHOLD,this.uniforms.threshold.value=e}getThreshold(){return this.threshold}setThreshold(e){this.threshold=e}get smoothing(){return this.uniforms.smoothing.value}set smoothing(e){this.threshold>0||e>0?this.defines.THRESHOLD="1":delete this.defines.THRESHOLD,this.uniforms.smoothing.value=e}getSmoothingFactor(){return this.smoothing}setSmoothingFactor(e){this.smoothing=e}get useThreshold(){return this.threshold>0||this.smoothing>0}set useThreshold(e){}get colorOutput(){return this.defines.COLOR!==void 0}set colorOutput(e){e?this.defines.COLOR="1":delete this.defines.COLOR,this.needsUpdate=!0}isColorOutputEnabled(e){return this.colorOutput}setColorOutputEnabled(e){this.colorOutput=e}get useRange(){return this.luminanceRange!==null}set useRange(e){this.luminanceRange=null}get luminanceRange(){return this.uniforms.range.value}set luminanceRange(e){e!==null?this.defines.RANGE="1":delete this.defines.RANGE,this.uniforms.range.value=e,this.needsUpdate=!0}getLuminanceRange(){return this.luminanceRange}setLuminanceRange(e){this.luminanceRange=e}},Ih=class extends xa{constructor({renderTarget:e,luminanceRange:t,colorOutput:a,resolutionScale:s=1,width:o=za.AUTO_SIZE,height:i=za.AUTO_SIZE,resolutionX:l=o,resolutionY:h=i}={}){super("LuminancePass"),this.fullscreenMaterial=new l0(a,t),this.needsSwap=!1,this.renderTarget=e,this.renderTarget===void 0&&(this.renderTarget=new Qt(1,1,{depthBuffer:!1}),this.renderTarget.texture.name="LuminancePass.Target");const r=this.resolution=new za(this,l,h,s);r.addEventListener("change",c=>this.setSize(r.baseWidth,r.baseHeight))}get texture(){return this.renderTarget.texture}getTexture(){return this.renderTarget.texture}getResolution(){return this.resolution}render(e,t,a,s,o){const i=this.fullscreenMaterial;i.inputBuffer=t.texture,e.setRenderTarget(this.renderToScreen?null:this.renderTarget),e.render(this.scene,this.camera)}setSize(e,t){const a=this.resolution;a.setBaseSize(e,t),this.renderTarget.setSize(a.width,a.height)}initialize(e,t,a){a!==void 0&&a!==Bt&&(this.renderTarget.texture.type=a,this.fullscreenMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1")}},c0=`#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D inputBuffer;
#else
uniform lowp sampler2D inputBuffer;
#endif
#define WEIGHT_INNER 0.125
#define WEIGHT_OUTER 0.05556
varying vec2 vUv;varying vec2 vUv00;varying vec2 vUv01;varying vec2 vUv02;varying vec2 vUv03;varying vec2 vUv04;varying vec2 vUv05;varying vec2 vUv06;varying vec2 vUv07;varying vec2 vUv08;varying vec2 vUv09;varying vec2 vUv10;varying vec2 vUv11;float clampToBorder(const in vec2 uv){return float(uv.s>=0.0&&uv.s<=1.0&&uv.t>=0.0&&uv.t<=1.0);}void main(){vec4 c=vec4(0.0);vec4 w=WEIGHT_INNER*vec4(clampToBorder(vUv00),clampToBorder(vUv01),clampToBorder(vUv02),clampToBorder(vUv03));c+=w.x*texture2D(inputBuffer,vUv00);c+=w.y*texture2D(inputBuffer,vUv01);c+=w.z*texture2D(inputBuffer,vUv02);c+=w.w*texture2D(inputBuffer,vUv03);w=WEIGHT_OUTER*vec4(clampToBorder(vUv04),clampToBorder(vUv05),clampToBorder(vUv06),clampToBorder(vUv07));c+=w.x*texture2D(inputBuffer,vUv04);c+=w.y*texture2D(inputBuffer,vUv05);c+=w.z*texture2D(inputBuffer,vUv06);c+=w.w*texture2D(inputBuffer,vUv07);w=WEIGHT_OUTER*vec4(clampToBorder(vUv08),clampToBorder(vUv09),clampToBorder(vUv10),clampToBorder(vUv11));c+=w.x*texture2D(inputBuffer,vUv08);c+=w.y*texture2D(inputBuffer,vUv09);c+=w.z*texture2D(inputBuffer,vUv10);c+=w.w*texture2D(inputBuffer,vUv11);c+=WEIGHT_OUTER*texture2D(inputBuffer,vUv);gl_FragColor=c;
#include <colorspace_fragment>
}`,u0="uniform vec2 texelSize;varying vec2 vUv;varying vec2 vUv00;varying vec2 vUv01;varying vec2 vUv02;varying vec2 vUv03;varying vec2 vUv04;varying vec2 vUv05;varying vec2 vUv06;varying vec2 vUv07;varying vec2 vUv08;varying vec2 vUv09;varying vec2 vUv10;varying vec2 vUv11;void main(){vUv=position.xy*0.5+0.5;vUv00=vUv+texelSize*vec2(-1.0,1.0);vUv01=vUv+texelSize*vec2(1.0,1.0);vUv02=vUv+texelSize*vec2(-1.0,-1.0);vUv03=vUv+texelSize*vec2(1.0,-1.0);vUv04=vUv+texelSize*vec2(-2.0,2.0);vUv05=vUv+texelSize*vec2(0.0,2.0);vUv06=vUv+texelSize*vec2(2.0,2.0);vUv07=vUv+texelSize*vec2(-2.0,0.0);vUv08=vUv+texelSize*vec2(2.0,0.0);vUv09=vUv+texelSize*vec2(-2.0,-2.0);vUv10=vUv+texelSize*vec2(0.0,-2.0);vUv11=vUv+texelSize*vec2(2.0,-2.0);gl_Position=vec4(position.xy,1.0,1.0);}",h0=class extends Et{constructor(){super({name:"DownsamplingMaterial",uniforms:{inputBuffer:new De(null),texelSize:new De(new Le)},blending:Bs,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:c0,vertexShader:u0})}set inputBuffer(e){this.uniforms.inputBuffer.value=e}setSize(e,t){this.uniforms.texelSize.value.set(1/e,1/t)}},d0=`#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D inputBuffer;uniform mediump sampler2D supportBuffer;
#else
uniform lowp sampler2D inputBuffer;uniform lowp sampler2D supportBuffer;
#endif
uniform float radius;varying vec2 vUv;varying vec2 vUv0;varying vec2 vUv1;varying vec2 vUv2;varying vec2 vUv3;varying vec2 vUv4;varying vec2 vUv5;varying vec2 vUv6;varying vec2 vUv7;void main(){vec4 c=vec4(0.0);c+=texture2D(inputBuffer,vUv0)*0.0625;c+=texture2D(inputBuffer,vUv1)*0.125;c+=texture2D(inputBuffer,vUv2)*0.0625;c+=texture2D(inputBuffer,vUv3)*0.125;c+=texture2D(inputBuffer,vUv)*0.25;c+=texture2D(inputBuffer,vUv4)*0.125;c+=texture2D(inputBuffer,vUv5)*0.0625;c+=texture2D(inputBuffer,vUv6)*0.125;c+=texture2D(inputBuffer,vUv7)*0.0625;vec4 baseColor=texture2D(supportBuffer,vUv);gl_FragColor=mix(baseColor,c,radius);
#include <colorspace_fragment>
}`,f0="uniform vec2 texelSize;varying vec2 vUv;varying vec2 vUv0;varying vec2 vUv1;varying vec2 vUv2;varying vec2 vUv3;varying vec2 vUv4;varying vec2 vUv5;varying vec2 vUv6;varying vec2 vUv7;void main(){vUv=position.xy*0.5+0.5;vUv0=vUv+texelSize*vec2(-1.0,1.0);vUv1=vUv+texelSize*vec2(0.0,1.0);vUv2=vUv+texelSize*vec2(1.0,1.0);vUv3=vUv+texelSize*vec2(-1.0,0.0);vUv4=vUv+texelSize*vec2(1.0,0.0);vUv5=vUv+texelSize*vec2(-1.0,-1.0);vUv6=vUv+texelSize*vec2(0.0,-1.0);vUv7=vUv+texelSize*vec2(1.0,-1.0);gl_Position=vec4(position.xy,1.0,1.0);}",m0=class extends Et{constructor(){super({name:"UpsamplingMaterial",uniforms:{inputBuffer:new De(null),supportBuffer:new De(null),texelSize:new De(new Le),radius:new De(.85)},blending:Bs,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:d0,vertexShader:f0})}set inputBuffer(e){this.uniforms.inputBuffer.value=e}set supportBuffer(e){this.uniforms.supportBuffer.value=e}get radius(){return this.uniforms.radius.value}set radius(e){this.uniforms.radius.value=e}setSize(e,t){this.uniforms.texelSize.value.set(1/e,1/t)}},p0=class extends xa{constructor(){super("MipmapBlurPass"),this.needsSwap=!1,this.renderTarget=new Qt(1,1,{depthBuffer:!1}),this.renderTarget.texture.name="Upsampling.Mipmap0",this.downsamplingMipmaps=[],this.upsamplingMipmaps=[],this.downsamplingMaterial=new h0,this.upsamplingMaterial=new m0,this.resolution=new Le}get texture(){return this.renderTarget.texture}get levels(){return this.downsamplingMipmaps.length}set levels(e){if(this.levels!==e){const t=this.renderTarget;this.dispose(),this.downsamplingMipmaps=[],this.upsamplingMipmaps=[];for(let a=0;a<e;++a){const s=t.clone();s.texture.name="Downsampling.Mipmap"+a,this.downsamplingMipmaps.push(s)}this.upsamplingMipmaps.push(t);for(let a=1,s=e-1;a<s;++a){const o=t.clone();o.texture.name="Upsampling.Mipmap"+a,this.upsamplingMipmaps.push(o)}this.setSize(this.resolution.x,this.resolution.y)}}get radius(){return this.upsamplingMaterial.radius}set radius(e){this.upsamplingMaterial.radius=e}render(e,t,a,s,o){const{scene:i,camera:l}=this,{downsamplingMaterial:h,upsamplingMaterial:r}=this,{downsamplingMipmaps:c,upsamplingMipmaps:d}=this;let p=t;this.fullscreenMaterial=h;for(let M=0,b=c.length;M<b;++M){const g=c[M];h.setSize(p.width,p.height),h.inputBuffer=p.texture,e.setRenderTarget(g),e.render(i,l),p=g}this.fullscreenMaterial=r;for(let M=d.length-1;M>=0;--M){const b=d[M];r.setSize(p.width,p.height),r.inputBuffer=p.texture,r.supportBuffer=c[M].texture,e.setRenderTarget(b),e.render(i,l),p=b}}setSize(e,t){const a=this.resolution;a.set(e,t);let s=a.width,o=a.height;for(let i=0,l=this.downsamplingMipmaps.length;i<l;++i)s=Math.round(s*.5),o=Math.round(o*.5),this.downsamplingMipmaps[i].setSize(s,o),i<this.upsamplingMipmaps.length&&this.upsamplingMipmaps[i].setSize(s,o)}initialize(e,t,a){if(a!==void 0){const s=this.downsamplingMipmaps.concat(this.upsamplingMipmaps);for(const o of s)o.texture.type=a;if(a!==Bt)this.downsamplingMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1",this.upsamplingMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1";else if(e!==null&&e.outputColorSpace===ht)for(const o of s)o.texture.colorSpace=ht}}dispose(){super.dispose();for(const e of this.downsamplingMipmaps.concat(this.upsamplingMipmaps))e.dispose()}},v0=`#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D map;
#else
uniform lowp sampler2D map;
#endif
uniform float intensity;void mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor){outputColor=texture2D(map,uv)*intensity;}`,g0=class extends Ph{constructor({blendFunction:e=Ce.SCREEN,luminanceThreshold:t=1,luminanceSmoothing:a=.03,mipmapBlur:s=!0,intensity:o=1,radius:i=.85,levels:l=8,kernelSize:h=hl.LARGE,resolutionScale:r=.5,width:c=za.AUTO_SIZE,height:d=za.AUTO_SIZE,resolutionX:p=c,resolutionY:M=d}={}){super("BloomEffect",v0,{blendFunction:e,uniforms:new Map([["map",new De(null)],["intensity",new De(o)]])}),this.renderTarget=new Qt(1,1,{depthBuffer:!1}),this.renderTarget.texture.name="Bloom.Target",this.blurPass=new n0({kernelSize:h}),this.luminancePass=new Ih({colorOutput:!0}),this.luminanceMaterial.threshold=t,this.luminanceMaterial.smoothing=a,this.mipmapBlurPass=new p0,this.mipmapBlurPass.enabled=s,this.mipmapBlurPass.radius=i,this.mipmapBlurPass.levels=l,this.uniforms.get("map").value=s?this.mipmapBlurPass.texture:this.renderTarget.texture;const b=this.resolution=new za(this,p,M,r);b.addEventListener("change",g=>this.setSize(b.baseWidth,b.baseHeight))}get texture(){return this.mipmapBlurPass.enabled?this.mipmapBlurPass.texture:this.renderTarget.texture}getTexture(){return this.texture}getResolution(){return this.resolution}getBlurPass(){return this.blurPass}getLuminancePass(){return this.luminancePass}get luminanceMaterial(){return this.luminancePass.fullscreenMaterial}getLuminanceMaterial(){return this.luminancePass.fullscreenMaterial}get width(){return this.resolution.width}set width(e){this.resolution.preferredWidth=e}get height(){return this.resolution.height}set height(e){this.resolution.preferredHeight=e}get dithering(){return this.blurPass.dithering}set dithering(e){this.blurPass.dithering=e}get kernelSize(){return this.blurPass.kernelSize}set kernelSize(e){this.blurPass.kernelSize=e}get distinction(){return console.warn(this.name,"distinction was removed"),1}set distinction(e){console.warn(this.name,"distinction was removed")}get intensity(){return this.uniforms.get("intensity").value}set intensity(e){this.uniforms.get("intensity").value=e}getIntensity(){return this.intensity}setIntensity(e){this.intensity=e}getResolutionScale(){return this.resolution.scale}setResolutionScale(e){this.resolution.scale=e}update(e,t,a){const s=this.renderTarget,o=this.luminancePass;o.enabled?(o.render(e,t),this.mipmapBlurPass.enabled?this.mipmapBlurPass.render(e,o.renderTarget):this.blurPass.render(e,o.renderTarget,s)):this.mipmapBlurPass.enabled?this.mipmapBlurPass.render(e,t):this.blurPass.render(e,t,s)}setSize(e,t){const a=this.resolution;a.setBaseSize(e,t),this.renderTarget.setSize(a.width,a.height),this.blurPass.resolution.copy(a),this.luminancePass.setSize(e,t),this.mipmapBlurPass.setSize(e,t)}initialize(e,t,a){this.blurPass.initialize(e,t,a),this.luminancePass.initialize(e,t,a),this.mipmapBlurPass.initialize(e,t,a),a!==void 0&&(this.renderTarget.texture.type=a,e!==null&&e.outputColorSpace===ht&&(this.renderTarget.texture.colorSpace=ht))}},x0=class extends xa{constructor(e,t,a=null){super("RenderPass",e,t),this.needsSwap=!1,this.needsDepthBlit=!0,this.clearPass=new Dh,this.overrideMaterialManager=a===null?null:new Pu(a),this.ignoreBackground=!1,this.skipShadowMapUpdate=!1,this.selection=null}set mainScene(e){this.scene=e}set mainCamera(e){this.camera=e}get renderToScreen(){return super.renderToScreen}set renderToScreen(e){super.renderToScreen=e,this.clearPass.renderToScreen=e}get overrideMaterial(){const e=this.overrideMaterialManager;return e!==null?e.material:null}set overrideMaterial(e){const t=this.overrideMaterialManager;e!==null?t!==null?t.setMaterial(e):this.overrideMaterialManager=new Pu(e):t!==null&&(t.dispose(),this.overrideMaterialManager=null)}getOverrideMaterial(){return this.overrideMaterial}setOverrideMaterial(e){this.overrideMaterial=e}get clear(){return this.clearPass.enabled}set clear(e){this.clearPass.enabled=e}getSelection(){return this.selection}setSelection(e){this.selection=e}isBackgroundDisabled(){return this.ignoreBackground}setBackgroundDisabled(e){this.ignoreBackground=e}isShadowMapDisabled(){return this.skipShadowMapUpdate}setShadowMapDisabled(e){this.skipShadowMapUpdate=e}getClearPass(){return this.clearPass}render(e,t,a,s,o){const i=this.scene,l=this.camera,h=this.selection,r=l.layers.mask,c=i.background,d=e.shadowMap.autoUpdate,p=this.renderToScreen?null:t;h!==null&&l.layers.set(h.getLayer()),this.skipShadowMapUpdate&&(e.shadowMap.autoUpdate=!1),(this.ignoreBackground||this.clearPass.overrideClearColor!==null)&&(i.background=null),this.clearPass.enabled&&this.clearPass.render(e,t),e.setRenderTarget(p),this.overrideMaterialManager!==null?this.overrideMaterialManager.render(e,i,l):e.render(i,l),l.layers.mask=r,i.background=c,e.shadowMap.autoUpdate=d}},ua={LINEAR:0,REINHARD:1,REINHARD2:2,REINHARD2_ADAPTIVE:3,OPTIMIZED_CINEON:5,CINEON:5,ACES_FILMIC:6,AGX:7,NEUTRAL:8},w0=`#include <packing>
#define packFloatToRGBA(v) packDepthToRGBA(v)
#define unpackRGBAToFloat(v) unpackRGBAToDepth(v)
uniform lowp sampler2D luminanceBuffer0;uniform lowp sampler2D luminanceBuffer1;uniform float minLuminance;uniform float deltaTime;uniform float tau;varying vec2 vUv;void main(){float l0=unpackRGBAToFloat(texture2D(luminanceBuffer0,vUv));
#if __VERSION__ < 300
float l1=texture2DLodEXT(luminanceBuffer1,vUv,MIP_LEVEL_1X1).r;
#else
float l1=textureLod(luminanceBuffer1,vUv,MIP_LEVEL_1X1).r;
#endif
l0=max(minLuminance,l0);l1=max(minLuminance,l1);float adaptedLum=l0+(l1-l0)*(1.0-exp(-deltaTime*tau));gl_FragColor=(adaptedLum==1.0)?vec4(1.0):packFloatToRGBA(adaptedLum);}`,M0=class extends Et{constructor(){super({name:"AdaptiveLuminanceMaterial",defines:{MIP_LEVEL_1X1:"0.0"},uniforms:{luminanceBuffer0:new De(null),luminanceBuffer1:new De(null),minLuminance:new De(.01),deltaTime:new De(0),tau:new De(1)},extensions:{shaderTextureLOD:!0},blending:Bs,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:w0,vertexShader:ul})}set luminanceBuffer0(e){this.uniforms.luminanceBuffer0.value=e}setLuminanceBuffer0(e){this.uniforms.luminanceBuffer0.value=e}set luminanceBuffer1(e){this.uniforms.luminanceBuffer1.value=e}setLuminanceBuffer1(e){this.uniforms.luminanceBuffer1.value=e}set mipLevel1x1(e){this.defines.MIP_LEVEL_1X1=e.toFixed(1),this.needsUpdate=!0}setMipLevel1x1(e){this.mipLevel1x1=e}set deltaTime(e){this.uniforms.deltaTime.value=e}setDeltaTime(e){this.uniforms.deltaTime.value=e}get minLuminance(){return this.uniforms.minLuminance.value}set minLuminance(e){this.uniforms.minLuminance.value=e}getMinLuminance(){return this.uniforms.minLuminance.value}setMinLuminance(e){this.uniforms.minLuminance.value=e}get adaptationRate(){return this.uniforms.tau.value}set adaptationRate(e){this.uniforms.tau.value=e}getAdaptationRate(){return this.uniforms.tau.value}setAdaptationRate(e){this.uniforms.tau.value=e}},y0=class extends xa{constructor(e,{minLuminance:t=.01,adaptationRate:a=1}={}){super("AdaptiveLuminancePass"),this.fullscreenMaterial=new M0,this.needsSwap=!1,this.renderTargetPrevious=new Qt(1,1,{minFilter:vo,magFilter:vo,depthBuffer:!1}),this.renderTargetPrevious.texture.name="Luminance.Previous";const s=this.fullscreenMaterial;s.luminanceBuffer0=this.renderTargetPrevious.texture,s.luminanceBuffer1=e,s.minLuminance=t,s.adaptationRate=a,this.renderTargetAdapted=this.renderTargetPrevious.clone(),this.renderTargetAdapted.texture.name="Luminance.Adapted",this.copyPass=new Fh(this.renderTargetPrevious,!1)}get texture(){return this.renderTargetAdapted.texture}getTexture(){return this.renderTargetAdapted.texture}set mipLevel1x1(e){this.fullscreenMaterial.mipLevel1x1=e}get adaptationRate(){return this.fullscreenMaterial.adaptationRate}set adaptationRate(e){this.fullscreenMaterial.adaptationRate=e}render(e,t,a,s,o){this.fullscreenMaterial.deltaTime=s,e.setRenderTarget(this.renderToScreen?null:this.renderTargetAdapted),e.render(this.scene,this.camera),this.copyPass.render(e,this.renderTargetAdapted)}},b0=`#include <tonemapping_pars_fragment>
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
}`,S0=class extends Ph{constructor({blendFunction:e=Ce.SRC,adaptive:t=!1,mode:a=t?ua.REINHARD2_ADAPTIVE:ua.AGX,resolution:s=256,maxLuminance:o=4,whitePoint:i=o,middleGrey:l=.6,minLuminance:h=.01,averageLuminance:r=1,adaptationRate:c=1}={}){super("ToneMappingEffect",b0,{blendFunction:e,uniforms:new Map([["luminanceBuffer",new De(null)],["maxLuminance",new De(o)],["whitePoint",new De(i)],["middleGrey",new De(l)],["averageLuminance",new De(r)]])}),this.renderTargetLuminance=new Qt(1,1,{minFilter:Za,depthBuffer:!1}),this.renderTargetLuminance.texture.generateMipmaps=!0,this.renderTargetLuminance.texture.name="Luminance",this.luminancePass=new Ih({renderTarget:this.renderTargetLuminance}),this.adaptiveLuminancePass=new y0(this.luminancePass.texture,{minLuminance:h,adaptationRate:c}),this.uniforms.get("luminanceBuffer").value=this.adaptiveLuminancePass.texture,this.resolution=s,this.mode=a}get mode(){return Number(this.defines.get("TONE_MAPPING_MODE"))}set mode(e){if(this.mode===e)return;const a=nl.replace(/\D+/g,"")>=168?"CineonToneMapping(texel)":"OptimizedCineonToneMapping(texel)";switch(this.defines.clear(),this.defines.set("TONE_MAPPING_MODE",e.toFixed(0)),e){case ua.LINEAR:this.defines.set("toneMapping(texel)","LinearToneMapping(texel)");break;case ua.REINHARD:this.defines.set("toneMapping(texel)","ReinhardToneMapping(texel)");break;case ua.CINEON:case ua.OPTIMIZED_CINEON:this.defines.set("toneMapping(texel)",a);break;case ua.ACES_FILMIC:this.defines.set("toneMapping(texel)","ACESFilmicToneMapping(texel)");break;case ua.AGX:this.defines.set("toneMapping(texel)","AgXToneMapping(texel)");break;case ua.NEUTRAL:this.defines.set("toneMapping(texel)","NeutralToneMapping(texel)");break;default:this.defines.set("toneMapping(texel)","texel");break}this.adaptiveLuminancePass.enabled=e===ua.REINHARD2_ADAPTIVE,this.setChanged()}getMode(){return this.mode}setMode(e){this.mode=e}get whitePoint(){return this.uniforms.get("whitePoint").value}set whitePoint(e){this.uniforms.get("whitePoint").value=e}get middleGrey(){return this.uniforms.get("middleGrey").value}set middleGrey(e){this.uniforms.get("middleGrey").value=e}get averageLuminance(){return this.uniforms.get("averageLuminance").value}set averageLuminance(e){this.uniforms.get("averageLuminance").value=e}get adaptiveLuminanceMaterial(){return this.adaptiveLuminancePass.fullscreenMaterial}getAdaptiveLuminanceMaterial(){return this.adaptiveLuminanceMaterial}get resolution(){return this.luminancePass.resolution.width}set resolution(e){const t=Math.max(0,Math.ceil(Math.log2(e))),a=Math.pow(2,t);this.luminancePass.resolution.setPreferredSize(a,a),this.adaptiveLuminanceMaterial.mipLevel1x1=t}getResolution(){return this.resolution}setResolution(e){this.resolution=e}get adaptive(){return this.mode===ua.REINHARD2_ADAPTIVE}set adaptive(e){this.mode=e?ua.REINHARD2_ADAPTIVE:ua.REINHARD2}get adaptationRate(){return this.adaptiveLuminanceMaterial.adaptationRate}set adaptationRate(e){this.adaptiveLuminanceMaterial.adaptationRate=e}get distinction(){return console.warn(this.name,"distinction was removed."),1}set distinction(e){console.warn(this.name,"distinction was removed.")}update(e,t,a){this.adaptiveLuminancePass.enabled&&(this.luminancePass.render(e,t),this.adaptiveLuminancePass.render(e,null,null,a))}initialize(e,t,a){this.adaptiveLuminancePass.initialize(e,t,a)}},T0=`#include <common>
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
}`,E0="uniform vec2 resolution;uniform vec2 texelSize;uniform float cameraNear;uniform float cameraFar;uniform float aspect;uniform float time;varying vec2 vUv;VERTEX_HEAD void main(){vUv=position.xy*0.5+0.5;VERTEX_MAIN_SUPPORT gl_Position=vec4(position.xy,1.0,1.0);}",R0=class extends Et{constructor(e,t,a,s,o=!1){super({name:"EffectMaterial",defines:{THREE_REVISION:nl.replace(/\D+/g,""),DEPTH_PACKING:"0",ENCODE_OUTPUT:"1"},uniforms:{inputBuffer:new De(null),depthBuffer:new De(null),resolution:new De(new Le),texelSize:new De(new Le),cameraNear:new De(.3),cameraFar:new De(1e3),aspect:new De(1),time:new De(0)},blending:Bs,toneMapped:!1,depthWrite:!1,depthTest:!1,dithering:o}),e&&this.setShaderParts(e),t&&this.setDefines(t),a&&this.setUniforms(a),this.copyCameraSettings(s)}set inputBuffer(e){this.uniforms.inputBuffer.value=e}setInputBuffer(e){this.uniforms.inputBuffer.value=e}get depthBuffer(){return this.uniforms.depthBuffer.value}set depthBuffer(e){this.uniforms.depthBuffer.value=e}get depthPacking(){return Number(this.defines.DEPTH_PACKING)}set depthPacking(e){this.defines.DEPTH_PACKING=e.toFixed(0),this.needsUpdate=!0}setDepthBuffer(e,t=an){this.depthBuffer=e,this.depthPacking=t}setShaderData(e){this.setShaderParts(e.shaderParts),this.setDefines(e.defines),this.setUniforms(e.uniforms),this.setExtensions(e.extensions)}setShaderParts(e){return this.fragmentShader=T0.replace(Ye.FRAGMENT_HEAD,e.get(Ye.FRAGMENT_HEAD)||"").replace(Ye.FRAGMENT_MAIN_UV,e.get(Ye.FRAGMENT_MAIN_UV)||"").replace(Ye.FRAGMENT_MAIN_IMAGE,e.get(Ye.FRAGMENT_MAIN_IMAGE)||""),this.vertexShader=E0.replace(Ye.VERTEX_HEAD,e.get(Ye.VERTEX_HEAD)||"").replace(Ye.VERTEX_MAIN_SUPPORT,e.get(Ye.VERTEX_MAIN_SUPPORT)||""),this.needsUpdate=!0,this}setDefines(e){for(const t of e.entries())this.defines[t[0]]=t[1];return this.needsUpdate=!0,this}setUniforms(e){for(const t of e.entries())this.uniforms[t[0]]=t[1];return this}setExtensions(e){this.extensions={};for(const t of e)this.extensions[t]=!0;return this}get encodeOutput(){return this.defines.ENCODE_OUTPUT!==void 0}set encodeOutput(e){this.encodeOutput!==e&&(e?this.defines.ENCODE_OUTPUT="1":delete this.defines.ENCODE_OUTPUT,this.needsUpdate=!0)}isOutputEncodingEnabled(e){return this.encodeOutput}setOutputEncodingEnabled(e){this.encodeOutput=e}get time(){return this.uniforms.time.value}set time(e){this.uniforms.time.value=e}setDeltaTime(e){this.uniforms.time.value+=e}adoptCameraSettings(e){this.copyCameraSettings(e)}copyCameraSettings(e){e&&(this.uniforms.cameraNear.value=e.near,this.uniforms.cameraFar.value=e.far,e instanceof rl?this.defines.PERSPECTIVE_CAMERA="1":delete this.defines.PERSPECTIVE_CAMERA,this.needsUpdate=!0)}setSize(e,t){const a=this.uniforms;a.resolution.value.set(e,t),a.texelSize.value.set(1/e,1/t),a.aspect.value=e/t}static get Section(){return Ye}};function Iu(e,t,a){for(const s of t){const o="$1"+e+s.charAt(0).toUpperCase()+s.slice(1),i=new RegExp("([^\\.])(\\b"+s+"\\b)","g");for(const l of a.entries())l[1]!==null&&a.set(l[0],l[1].replace(i,o))}}function A0(e,t,a){let s=t.getFragmentShader(),o=t.getVertexShader();const i=s!==void 0&&/mainImage/.test(s),l=s!==void 0&&/mainUv/.test(s);if(a.attributes|=t.getAttributes(),s===void 0)throw new Error(`Missing fragment shader (${t.name})`);if(l&&(a.attributes&Us.CONVOLUTION)!==0)throw new Error(`Effects that transform UVs are incompatible with convolution effects (${t.name})`);if(!i&&!l)throw new Error(`Could not find mainImage or mainUv function (${t.name})`);{const h=/\w+\s+(\w+)\([\w\s,]*\)\s*{/g,r=a.shaderParts;let c=r.get(Ye.FRAGMENT_HEAD)||"",d=r.get(Ye.FRAGMENT_MAIN_UV)||"",p=r.get(Ye.FRAGMENT_MAIN_IMAGE)||"",M=r.get(Ye.VERTEX_HEAD)||"",b=r.get(Ye.VERTEX_MAIN_SUPPORT)||"";const g=new Set,R=new Set;if(l&&(d+=`	${e}MainUv(UV);
`,a.uvTransformation=!0),o!==null&&/mainSupport/.test(o)){const x=/mainSupport *\([\w\s]*?uv\s*?\)/.test(o);b+=`	${e}MainSupport(`,b+=x?`vUv);
`:`);
`;for(const S of o.matchAll(/(?:varying\s+\w+\s+([\S\s]*?);)/g))for(const A of S[1].split(/\s*,\s*/))a.varyings.add(A),g.add(A),R.add(A);for(const S of o.matchAll(h))R.add(S[1])}for(const x of s.matchAll(h))R.add(x[1]);for(const x of t.defines.keys())R.add(x.replace(/\([\w\s,]*\)/g,""));for(const x of t.uniforms.keys())R.add(x);R.delete("while"),R.delete("for"),R.delete("if"),t.uniforms.forEach((x,S)=>a.uniforms.set(e+S.charAt(0).toUpperCase()+S.slice(1),x)),t.defines.forEach((x,S)=>a.defines.set(e+S.charAt(0).toUpperCase()+S.slice(1),x));const E=new Map([["fragment",s],["vertex",o]]);Iu(e,R,a.defines),Iu(e,R,E),s=E.get("fragment"),o=E.get("vertex");const w=t.blendMode;if(a.blendModes.set(w.blendFunction,w),i){t.inputColorSpace!==null&&t.inputColorSpace!==a.colorSpace&&(p+=t.inputColorSpace===ht?`color0 = sRGBTransferOETF(color0);
	`:`color0 = sRGBToLinear(color0);
	`),t.outputColorSpace!==Ba?a.colorSpace=t.outputColorSpace:t.inputColorSpace!==null&&(a.colorSpace=t.inputColorSpace);const x=/MainImage *\([\w\s,]*?depth[\w\s,]*?\)/;p+=`${e}MainImage(color0, UV, `,(a.attributes&Us.DEPTH)!==0&&x.test(s)&&(p+="depth, ",a.readDepth=!0),p+=`color1);
	`;const S=e+"BlendOpacity";a.uniforms.set(S,w.opacity),p+=`color0 = blend${w.blendFunction}(color0, color1, ${S});

	`,c+=`uniform float ${S};

`}if(c+=s+`
`,o!==null&&(M+=o+`
`),r.set(Ye.FRAGMENT_HEAD,c),r.set(Ye.FRAGMENT_MAIN_UV,d),r.set(Ye.FRAGMENT_MAIN_IMAGE,p),r.set(Ye.VERTEX_HEAD,M),r.set(Ye.VERTEX_MAIN_SUPPORT,b),t.extensions!==null)for(const x of t.extensions)a.extensions.add(x)}}var _0=class extends xa{constructor(e,...t){super("EffectPass"),this.fullscreenMaterial=new R0(null,null,null,e),this.listener=a=>this.handleEvent(a),this.effects=[],this.setEffects(t),this.skipRendering=!1,this.minTime=1,this.maxTime=Number.POSITIVE_INFINITY,this.timeScale=1}set mainScene(e){for(const t of this.effects)t.mainScene=e}set mainCamera(e){this.fullscreenMaterial.copyCameraSettings(e);for(const t of this.effects)t.mainCamera=e}get encodeOutput(){return this.fullscreenMaterial.encodeOutput}set encodeOutput(e){this.fullscreenMaterial.encodeOutput=e}get dithering(){return this.fullscreenMaterial.dithering}set dithering(e){const t=this.fullscreenMaterial;t.dithering=e,t.needsUpdate=!0}setEffects(e){for(const t of this.effects)t.removeEventListener("change",this.listener);this.effects=e.sort((t,a)=>a.attributes-t.attributes);for(const t of this.effects)t.addEventListener("change",this.listener)}updateMaterial(){const e=new ym;let t=0;for(const l of this.effects)if(l.blendMode.blendFunction===Ce.DST)e.attributes|=l.getAttributes()&Us.DEPTH;else{if((e.attributes&l.getAttributes()&Us.CONVOLUTION)!==0)throw new Error(`Convolution effects cannot be merged (${l.name})`);A0("e"+t++,l,e)}let a=e.shaderParts.get(Ye.FRAGMENT_HEAD),s=e.shaderParts.get(Ye.FRAGMENT_MAIN_IMAGE),o=e.shaderParts.get(Ye.FRAGMENT_MAIN_UV);const i=/\bblend\b/g;for(const l of e.blendModes.values())a+=l.getShaderCode().replace(i,`blend${l.blendFunction}`)+`
`;(e.attributes&Us.DEPTH)!==0?(e.readDepth&&(s=`float depth = readDepth(UV);

	`+s),this.needsDepthTexture=this.getDepthTexture()===null):this.needsDepthTexture=!1,e.colorSpace===ht&&(s+=`color0 = sRGBToLinear(color0);
	`),e.uvTransformation?(o=`vec2 transformedUv = vUv;
`+o,e.defines.set("UV","transformedUv")):e.defines.set("UV","vUv"),e.shaderParts.set(Ye.FRAGMENT_HEAD,a),e.shaderParts.set(Ye.FRAGMENT_MAIN_IMAGE,s),e.shaderParts.set(Ye.FRAGMENT_MAIN_UV,o);for(const[l,h]of e.shaderParts)h!==null&&e.shaderParts.set(l,h.trim().replace(/^#/,`
#`));this.skipRendering=t===0,this.needsSwap=!this.skipRendering,this.fullscreenMaterial.setShaderData(e)}recompile(){this.updateMaterial()}getDepthTexture(){return this.fullscreenMaterial.depthBuffer}setDepthTexture(e,t=an){this.fullscreenMaterial.depthBuffer=e,this.fullscreenMaterial.depthPacking=t;for(const a of this.effects)a.setDepthTexture(e,t)}render(e,t,a,s,o){for(const i of this.effects)i.update(e,t,s);if(!this.skipRendering||this.renderToScreen){const i=this.fullscreenMaterial;i.inputBuffer=t.texture,i.time+=s*this.timeScale,e.setRenderTarget(this.renderToScreen?null:a),e.render(this.scene,this.camera)}}setSize(e,t){this.fullscreenMaterial.setSize(e,t);for(const a of this.effects)a.setSize(e,t)}initialize(e,t,a){this.renderer=e;for(const s of this.effects)s.initialize(e,t,a);this.updateMaterial(),a!==void 0&&a!==Bt&&(this.fullscreenMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1")}dispose(){super.dispose();for(const e of this.effects)e.removeEventListener("change",this.listener),e.dispose()}handleEvent(e){switch(e.type){case"change":this.recompile();break}}};const k0={exposure:1,bloomThreshold:1.7,bloomSmoothing:.3,bloomIntensity:.85,bloomRadius:.7,bloomLevels:7,msaaSamples:4},Ch=2,F0=.5;function Cu(){const e=typeof window<"u"&&window.devicePixelRatio||1;return Math.min(Ch,Math.max(1,e))}class D0{constructor(t,a,s,o={}){k(this,"composer");k(this,"renderPass");k(this,"bloom");k(this,"toneMapping");k(this,"finalPass");k(this,"renderer");k(this,"cssWidth",1);k(this,"cssHeight",1);k(this,"pixelRatio",1);const i={...k0,...o};this.renderer=t,t.toneMapping=yd,t.toneMappingExposure=i.exposure,t.outputColorSpace=ht,this.composer=new Mm(t,{frameBufferType:Ua,multisampling:i.msaaSamples,depthBuffer:!0,stencilBuffer:!1}),this.renderPass=new x0(a,s),this.composer.addPass(this.renderPass),this.bloom=new g0({blendFunction:Ce.ADD,mipmapBlur:!0,luminanceThreshold:i.bloomThreshold,luminanceSmoothing:i.bloomSmoothing,intensity:i.bloomIntensity,radius:i.bloomRadius,levels:i.bloomLevels}),this.toneMapping=new S0({mode:ua.ACES_FILMIC}),this.finalPass=new _0(s,this.bloom,this.toneMapping),this.finalPass.dithering=!0,this.composer.addPass(this.finalPass)}insertScenePass(t){const a=this.composer.passes.indexOf(this.finalPass);this.composer.addPass(t,a>=0?a:void 0)}get exposure(){return this.renderer.toneMappingExposure}set exposure(t){this.renderer.toneMappingExposure=Math.max(.01,t)}get drawingBufferHeight(){return Math.max(1,Math.round(this.cssHeight*this.pixelRatio))}setSize(t,a,s){const o=Math.max(1,Math.floor(t)),i=Math.max(1,Math.floor(a)),l=Math.min(Ch,Math.max(F0,s));return o===this.cssWidth&&i===this.cssHeight&&Math.abs(l-this.pixelRatio)<.001?!1:(this.cssWidth=o,this.cssHeight=i,this.pixelRatio=l,this.renderer.setPixelRatio(l),this.composer.setSize(o,i,!1),!0)}render(t){this.composer.render(t)}dispose(){this.composer.dispose()}}const P0=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,I0=`
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
`;class C0{constructor(t){k(this,"renderer");k(this,"scene",new po);k(this,"camera",new al(-1,1,1,-1,0,1));k(this,"material");k(this,"quad");this.renderer=t,this.material=new Et({vertexShader:P0,fragmentShader:I0,uniforms:{uDem:{value:null},uDemRes:{value:512},uElevRange:{value:new Le(0,1e3)},uReliefScale:{value:.001},uSlabSize:{value:new Le(14.8,10.8)},uSunDir:{value:new W(0,1,0)},uPenumbra:{value:9}},depthTest:!1,depthWrite:!1}),this.quad=new ba(new en(2,2),this.material),this.quad.frustumCulled=!1,this.scene.add(this.quad)}bake(t,a,s,o,i,l,h,r,c=1024){const d=new Qt(c,c,{format:Ct,type:Bt,depthBuffer:!1,stencilBuffer:!1,minFilter:Be,magFilter:Be,generateMipmaps:!1});d.texture.wrapS=We,d.texture.wrapT=We,d.texture.colorSpace=Ba;const p=this.material.uniforms;p.uDem.value=t,p.uDemRes.value=a,p.uElevRange.value.set(s,o),p.uReliefScale.value=i,p.uSlabSize.value.set(l,h),p.uSunDir.value.copy(r);const M=this.renderer.getRenderTarget(),b=this.renderer.autoClear;return this.renderer.autoClear=!0,this.renderer.setRenderTarget(d),this.renderer.render(this.scene,this.camera),this.renderer.setRenderTarget(M),this.renderer.autoClear=b,d}dispose(){this.quad.geometry.dispose(),this.material.dispose()}}function Wo(e,t,a,s){const o=Math.floor(e.length/3),i=new Int32Array(o);for(let w=0;w<o;w++)i[w]=w;const l=w=>{for(;i[w]!==w;)i[w]=i[i[w]],w=i[w];return w},h=(w,x)=>{const S=l(w),A=l(x);S!==A&&(i[Math.max(S,A)]=Math.min(S,A))},r=new Int32Array(t*a).fill(-1),c=[],d=w=>Math.min(t-1,Math.max(0,w)),p=w=>Math.min(a-1,Math.max(0,w));for(let w=0;w<o;w++){const x=e[w*3],S=e[w*3+1],A=s?s[w*2]:0,B=s?s[w*2+1]:0,C=d(Math.floor((x-A)*t)),P=d(Math.max(Math.floor(x*t),Math.ceil((x+A)*t)-1)),U=p(Math.floor((S-B)*a)),G=p(Math.max(Math.floor(S*a),Math.ceil((S+B)*a)-1));for(let _=U;_<=G;_++)for(let Y=C;Y<=P;Y++){const Z=_*t+Y;r[Z]<0?(r[Z]=w,c.push(Z)):h(w,r[Z])}}for(const w of c){const x=Math.floor(w/t),S=w-x*t,A=r[w];if(S+1<t&&r[w+1]>=0&&h(A,r[w+1]),x+1<a){const B=w+t;r[B]>=0&&h(A,r[B]),S>0&&r[B-1]>=0&&h(A,r[B-1]),S+1<t&&r[B+1]>=0&&h(A,r[B+1])}}const M=new Map,b=new Map;for(let w=0;w<o;w++){const x=l(w);M.set(x,(M.get(x)??0)+1),b.set(x,(b.get(x)??0)+e[w*3+2])}const g=[...M.keys()].sort((w,x)=>M.get(x)-M.get(w)||b.get(x)-b.get(w)||w-x),R=new Map;g.forEach((w,x)=>R.set(w,x));const E=new Uint16Array(o);for(let w=0;w<o;w++)E[w]=Math.min(65535,R.get(l(w)));return{patchOf:E,sizes:g.map(w=>M.get(w))}}function L0(e){const t=Math.max(1,Math.floor(e)),a=t+1,s=a*a,o=new Float32Array(s*3),i=new Float32Array(s*3),l=new Float32Array(s*2),h=1/t;for(let d=0;d<=t;d++){const p=d*h-.5,M=1-d/t;for(let b=0;b<=t;b++){const g=d*a+b;o[g*3]=b*h-.5,o[g*3+1]=0,o[g*3+2]=p,i[g*3+1]=1,l[g*2]=b/t,l[g*2+1]=M}}const r=new Uint32Array(t*t*6);let c=0;for(let d=0;d<t;d++)for(let p=0;p<t;p++){const M=p+a*d,b=p+a*(d+1),g=p+1+a*(d+1),R=p+1+a*d;r[c++]=M,r[c++]=b,r[c++]=R,r[c++]=b,r[c++]=g,r[c++]=R}return{position:o,normal:i,uv:l,index:r}}function el(e){return typeof e=="object"&&e!==null}function br(e){return el(e)&&typeof e.url=="string"&&typeof e.size=="number"&&Number.isFinite(e.size)}function Lu(e){const t=e==null?void 0:e.lite;if(!e||!el(t)||!br(t.dem)||!br(t.ortho)||!br(t.aux))return null;const a=t.aux;return{...e,dem:t.dem,ortho:{...t.ortho,attribution:e.ortho.attribution},ortho_fallback:void 0,ortho_detail:void 0,aux:{...a,channels:a.channels??e.aux.channels},context:el(t.context)?t.context:void 0}}function N0(e){let t=0;for(let a=0;a<2400;a++)for(let s=0;s<e.length;s++){const o=e[s]*1.000001+(s&7)*.5;e[s]=o>1e6?o-1e6:o,t+=Math.sqrt(e[s])}return t}function z0(e=()=>performance.now()){const t=new Float64Array(2048);for(let o=0;o<t.length;o++)t[o]=o;let a=1/0,s=0;for(let o=0;o<2;o++){const i=e();s+=N0(t),a=Math.min(a,e()-i)}return s===-1?-1:a}const U0=8;function B0(e){return Number.isFinite(e)&&e>U0}const O0={WINDOW_SEC:1,SLOW_MS:26,SLOW_WINDOWS:2,FAST_MS:18.5,CLIMB_SEC:6,HOLD_SEC:30,STALL_MS:250,STEP_DOWN:.15,STEP_UP:.1,LEAST:.5};class H0{constructor(){k(this,"scale",1);k(this,"windowSec",0);k(this,"gaps",[]);k(this,"slowWindows",0);k(this,"fastSec",0);k(this,"ceiling",1);k(this,"ceilingSec",0)}feed(t,a=!1){const s=O0;if(!(t>0)||t>s.STALL_MS||a||(this.gaps.push(t),this.windowSec+=t/1e3,this.ceiling<1&&(this.ceilingSec+=t/1e3,this.ceilingSec>s.HOLD_SEC&&(this.ceiling=Math.min(1,this.ceiling+s.STEP_UP),this.ceilingSec=0)),this.windowSec<s.WINDOW_SEC))return null;const o=this.gaps.sort((h,r)=>h-r),i=o[Math.floor(o.length/2)];this.windowSec=0,this.gaps=[];let l=this.scale;return i>s.SLOW_MS?(this.slowWindows+=1,this.fastSec=0,this.slowWindows>=s.SLOW_WINDOWS&&this.scale>s.LEAST&&(this.ceiling=this.scale-s.STEP_UP,this.ceilingSec=0,l=Math.max(s.LEAST,this.scale-s.STEP_DOWN),this.slowWindows=s.SLOW_WINDOWS-1)):i<s.FAST_MS?(this.slowWindows=0,this.fastSec+=s.WINDOW_SEC,this.fastSec>=s.CLIMB_SEC&&this.scale<this.ceiling&&(l=Math.min(this.ceiling,this.scale+s.STEP_UP),this.fastSec=0)):(this.slowWindows=0,this.fastSec=0),Math.abs(l-this.scale)<=.001?null:(this.scale=l,l)}}const G0="/isogon/assets/draco_decoder-Z1_iN-Ht.wasm",K0="/isogon/assets/draco_wasm_wrapper-fZCQGLGb.js",Nu=Math.PI/180,W0=1.05,Sr=40,V0=6.2,Tr=3,Y0=.5,$0=.16,qs=33,j0={modis:3.5,viirs:4.1},X0={modis:new qi(1,.5,.24),viirs:new qi(.4,.84,1)},q0={modis:Qi,viirs:io},Z0={terra:new fr(0,0,0),aqua:new fr(Math.PI/2,0,0),suomi_npp:new fr(0,0,Math.PI/2)},Q0="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";function J0(e){const t=e.toUpperCase();return t.includes("TERRA")?["terra"]:t.includes("AQUA")?["aqua"]:t.includes("NOAA")||t.includes("J1")||t.includes("J2")?["noaa_20","suomi_npp"]:["suomi_npp"]}function ep(e,t){const a=Math.sin(e*127.1+t*311.7)*43758.5453;return a-Math.floor(a)}function tp(){const a=new Uint8Array(65536);for(let o=0;o<64;o++)for(let i=0;i<256;i++){const l=i%16,h=o%16,r=l===0||h===0,c=l===8,d=.86+.14*ep(Math.floor(i/16),Math.floor(o/16)),p=(o*256+i)*4;a[p]=Math.round((r?118:c?40:7)*d),a[p+1]=Math.round((r?124:c?52:14)*d),a[p+2]=Math.round((r?138:c?88:46)*d),a[p+3]=255}const s=new ta(a,256,64,Ct,Bt);return s.colorSpace=ht,s.wrapS=ro,s.wrapT=ro,s.magFilter=Be,s.minFilter=Za,s.generateMipmaps=!0,s.anisotropy=8,s.needsUpdate=!0,s}function ap(e){const t=new po,a=new Et({side:so,depthWrite:!1,vertexShader:`
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
    `}),s=new ba(new mh(10,32,16),a);t.add(s);const o=new bd(e),i=o.fromScene(t,.03);return o.dispose(),s.geometry.dispose(),a.dispose(),i}function Er(e,t,a){e.onBeforeCompile=s=>{s.uniforms.uFoilScale={value:t},s.uniforms.uFoilStrength={value:a},s.vertexShader=s.vertexShader.replace("#include <common>",`#include <common>
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
        }`)},e.customProgramCacheKey=()=>"isogon-foil"}class sp{constructor(){k(this,"cells",tp())}make(t,a={}){const s=a.map??null,o=new kd({flatShading:a.flat===!0}),i=a.crinkleScale??26;switch(t){case"foilGold":o.color.setRGB(1,.62,.18),o.metalness=1,o.roughness=.3,Er(o,i,.24);break;case"foilSilver":o.color.setRGB(.9,.91,.93),o.metalness=1,o.roughness=.32,Er(o,i,.2);break;case"foilBlack":o.color.setRGB(.035,.035,.04),o.metalness=.75,o.roughness=.42,Er(o,i,.22);break;case"solar":o.color.setRGB(1,1,1),o.metalness=.55,o.roughness=.22,o.map=s??this.cells,s&&o.color.setRGB(.42,.46,.62);break;case"radiator":o.color.setRGB(.84,.87,.92),o.metalness=.92,o.roughness=.16;break;case"paintWhite":o.color.setRGB(.86,.87,.88),o.metalness=.05,o.roughness=.55;break;case"paintGrey":o.color.setRGB(.3,.31,.33),o.metalness=.45,o.roughness=.5;break;case"dark":o.color.setRGB(.03,.032,.036),o.metalness=.6,o.roughness=.5;break}return s&&t!=="solar"&&(o.map=s,o.color.setRGB(1,1,1),(t==="foilGold"||t==="foilSilver")&&(o.metalness=.82)),o}dispose(){this.cells.dispose()}}function zu(e){const t=e.toLowerCase();return t.includes("gold")?"foilGold":t.includes("silver")?"foilSilver":t.includes("krinkle")||t.includes("kapton")?"foilBlack":t.includes("solar")||t.includes("shiny_panel")?"solar":t==="side panels"?"radiator":t.includes("dish")?"paintWhite":t.includes("thruster")?"dark":t.includes("hardware")||t.includes("grey")||t.includes("gray")?"paintGrey":null}function op(e){const t=e.getAttribute("position");if(!t||e.getAttribute("uv"))return;e.computeBoundingBox();const a=e.boundingBox,s=a.getSize(new W),o=[0,1,2].sort((c,d)=>s.getComponent(d)-s.getComponent(c)),[i,l]=o,h=Math.max(s.getComponent(l)/12,1e-6),r=new Float32Array(t.count*2);for(let c=0;c<t.count;c++)r[c*2]=(t.getComponent(c,i)-a.min.getComponent(i))/(h*16),r[c*2+1]=(t.getComponent(c,l)-a.min.getComponent(l))/(h*4);e.setAttribute("uv",new ga(r,2))}function ip(e,t){const a=new ph().setFromObject(e),o=26/Math.max(...a.getSize(new W).toArray(),1e-6),i=new Map,l=new Set;e.traverse(h=>{const r=h;if(!r.isMesh)return;const c=!r.geometry.getAttribute("normal"),d=p=>{var x;const M=i.get(p);if(M)return M;const b=p,g=zu(p.name),R=(x=b.map)==null?void 0:x.image,E=b.map&&r.geometry.getAttribute("uv")&&((R==null?void 0:R.width)??0)>4?b.map:null;let w=p;return g?w=t.make(g,{flat:c,map:E,crinkleScale:o}):b.isMeshStandardMaterial&&!E&&(w=t.make("paintGrey",{flat:c})),w!==p&&(w.name=p.name,l.add(p),b.map&&b.map!==E&&b.map.dispose()),i.set(p,w),w};Array.isArray(r.material)?r.material=r.material.map(d):(zu(r.material.name)==="solar"&&op(r.geometry),r.material=d(r.material))});for(const h of l)h.dispose()}function Uu(e,t){const a=new lo,s=t.make("foilGold"),o=t.make("foilSilver"),i=t.make("paintWhite"),l=t.make("dark"),h=t.make("solar"),r=(M,b,g,R,E)=>{const w=new ba(M,b);return w.position.set(g,R,E),a.add(w),w},c=e==="modis"?.42:.32;r(new Go(c,.17,.18),s,0,0,0),r(new Go(c*.86,.035,.15),o,0,-.1,0),r(new mr(.045,.055,.07,24),l,c*.18,-.145,0),r(new Go(.1,.05,.1),i,-c*.25,-.135,0),r(new Go(c*.5,.012,.14),i,-c*.1,.092,0),r(new mr(.006,.006,.1,8),o,c*.3,.13,.04);const d=r(new Fd(.05,.03,24,1,!0),i,c*.3,.19,.04);d.rotation.x=Math.PI,d.material.side=Ls;const p=r(new mr(.007,.007,.16,8),o,0,0,.17);p.rotation.x=Math.PI/2;for(let M=0;M<3;M++){const b=new Go(.2,.008,.2),g=b.getAttribute("uv");for(let E=0;E<g.count;E++)g.setXY(E,g.getX(E)*6/16,g.getY(E)*6/4);const R=r(b,h,0,0,.36+M*.208);R.rotation.z=-.35}return a}function Rr(e,t){const a=new lo;t&&e.rotation.copy(t),a.add(e),a.updateMatrixWorld(!0);const s=new ph().setFromObject(a),o=s.getSize(new W),i=s.getCenter(new W),l=Math.max(o.x,o.y,o.z,1e-6);e.position.sub(i);const h=new lo;return h.add(a),h.scale.setScalar(W0/l),h}function Ar(e){const t=new Set,a=new Set,s=new Set;e.traverse(o=>{const i=o;i.geometry&&t.add(i.geometry);const l=Array.isArray(i.material)?i.material:i.material?[i.material]:[];for(const h of l){a.add(h);const r=h;for(const c of[r.map,r.normalMap,r.roughnessMap,r.metalnessMap,r.emissiveMap,r.aoMap])c&&s.add(c)}});for(const o of t)o.dispose();for(const o of a)o.dispose();for(const o of s){const i=o.image;i&&typeof i.close=="function"&&i.close(),o.dispose()}}function _r(e){const t=Math.min(1,Math.max(0,e));return t*t*(3-2*t)}class np{constructor(t){k(this,"group",new lo);k(this,"strips",{modis:{alongTrackKm:0,strength:0},viirs:{alongTrackKm:0,strength:0}});k(this,"look",new sp);k(this,"templates",new Map);k(this,"rigs",[]);k(this,"draco",null);k(this,"disposed",!1);k(this,"pos",new W);k(this,"xAxis",new W);k(this,"yAxis",new W(0,1,0));k(this,"zAxis",new W);k(this,"basis",new to);this.templates.set("procedural-modis",Rr(Uu("modis",this.look),null)),this.templates.set("procedural-viirs",Rr(Uu("viirs",this.look),null));for(let a=0;a<t;a++)this.rigs.push(this.buildRig(a))}buildRig(t){const a=new lo;a.visible=!1;const s=new lo;a.add(s);const o=g=>{const R=new tn;return R.setAttribute("position",new ga(new Float32Array(g*3),3)),R.setAttribute("color",new ga(new Float32Array(g*4),4)),R},i=()=>new _d({transparent:!0,opacity:0,depthWrite:!1,vertexColors:!0}),l=i(),h=new Sd(o(Sr),l),r=i(),c=new Td(o(6),r);for(const g of[h,c])g.frustumCulled=!1,a.add(g);const d=o(qs+1),p=[];for(let g=0;g<qs-1;g++)p.push(0,1+g,2+g);d.setIndex(p);const M=new Ed({transparent:!0,opacity:0,side:Ls,depthWrite:!1,blending:Rd,vertexColors:!0}),b=new ba(d,M);return b.frustumCulled=!1,a.add(b),this.group.add(a),{root:a,craft:s,craftKey:"",along:-1.4+t*.9,passKey:"",track:h,trackMat:l,rays:c,raysMat:r,fan:b,fanMat:M}}async loadModels(t){const a=t.endsWith("/")?t:`${t}/`;let s=[];try{const c=await fetch(`${a}models/spacecraft/manifest.json`);if(!c.ok)return;const d=await c.json();s=Array.isArray(d.models)?d.models:[]}catch{return}const[{GLTFLoader:o},{DRACOLoader:i}]=await Promise.all([su(()=>import("./GLTFLoader-C8Ag2Ruc.js"),__vite__mapDeps([0,1])),su(()=>import("./DRACOLoader-LNaB3iNp.js"),__vite__mapDeps([2,1]))]);if(this.disposed)return;const l=new Ad;l.setURLModifier(c=>/\.tga(\?|$)/i.test(c)?Q0:c);const h=new i(l);h.setDecoderPath({js:K0,wasm:G0}),this.draco=h;const r=new o(l);r.setDRACOLoader(h),await Promise.all(s.map(async c=>{if(!(typeof c.id!="string"||typeof c.url!="string"))try{const d=await r.loadAsync(`${a}${c.url.replace(/^\/+/,"")}`);if(this.disposed){Ar(d.scene);return}ip(d.scene,this.look),this.templates.set(c.id,Rr(d.scene,Z0[c.id]??null))}catch{}}))}resolveTemplate(t){for(const s of J0(t.sensorLabel)){const o=this.templates.get(s);if(o)return{key:s,template:o}}const a=`procedural-${t.family}`;return{key:a,template:this.templates.get(a)}}update(t,a){this.strips.modis.strength=0,this.strips.viirs.strength=0;const s=a.sky>.004||a.strip>.004,[o,i,l]=a.unitsPerMetre,h=a.slabWidth*.5,r=a.slabDepth*.5,c=a.sampleTerrainY(.5,.5);for(let d=0;d<this.rigs.length;d++){const p=this.rigs[d],M=t[d];if(!M||!s){p.root.visible=!1;continue}p.root.visible=!0;const{key:b,template:g}=this.resolveTemplate(M);p.craftKey!==b&&(p.craft.clear(),p.craft.add(g.clone(!0)),p.craftKey=b);const R=q0[M.family],E=M.azimuthDeg*Nu,w=Math.min(R.maxScanDeg,Math.abs(M.scanAngleDeg))*Nu,x=(go+R.altitudeKm)/go,S=Math.min(.999,x*Math.sin(w)),A=Math.sqrt(1-S*S),B=Math.sin(E),C=-Math.cos(E);let P=B*S*o,U=A*i,G=C*S*l;const _=Math.hypot(P,U,G)||1,Y=j0[M.family];P=P/_*Y,U=U/_*Y,G=G/_*Y;let Z=Math.cos(E),ge=Math.sin(E);const we=M.orbitNode?M.orbitNode==="descending":M.sensorLabel.toUpperCase().includes("TERRA");ge>0!==we&&(Z=-Z,ge=-ge);const Ae=`${M.sensorLabel}|${M.azimuthDeg}|${M.scanAngleDeg}|${M.orbitNode??""}`;p.passKey!==Ae&&(p.passKey!==""&&(p.along=-.6),p.passKey=Ae),p.along+=$0*Math.min(.1,Math.max(0,a.dtSec)),p.along>Tr&&(p.along-=2*Tr);const be=p.along,Me=_r((Tr-Math.abs(be))/Y0),pe=this.pos.set(P+Z*be,c+U,G+ge*be);this.xAxis.set(Z,0,ge),this.zAxis.crossVectors(this.xAxis,this.yAxis).normalize(),this.basis.makeBasis(this.xAxis,this.yAxis,this.zAxis),p.craft.quaternion.setFromRotationMatrix(this.basis),p.craft.position.copy(pe);const dt=_r(a.sky*1.15)*Me;p.craft.visible=dt>.002,p.craft.scale.setScalar(Math.max(dt,1e-4));const ce=X0[M.family],ae=p.track.geometry.getAttribute("position"),Rt=p.track.geometry.getAttribute("color");for(let Ne=0;Ne<Sr;Ne++){const nt=Ne/(Sr-1)*2-1,ft=nt*V0;ae.setXYZ(Ne,P+Z*ft,c+U,G+ge*ft);const wa=_r((1-Math.abs(nt))/.3),da=be-ft,$e=da>=0?Math.exp(-da/1.6):Math.exp(da/.12);Rt.setXYZW(Ne,ce.r,ce.g,ce.b,wa*(.3+.7*$e*Me))}ae.needsUpdate=!0,Rt.needsUpdate=!0,p.trackMat.opacity=.8*a.sky,p.track.visible=a.sky>.004;const At=a.sky*Me,Ot=a.strip*Me;let ie=-1e9,m=1e9;if(Math.abs(B)>1e-5){const Ne=(pe.x-h)/B,nt=(pe.x+h)/B;ie=Math.max(ie,Math.min(Ne,nt)),m=Math.min(m,Math.max(Ne,nt))}else Math.abs(pe.x)>h&&(m=-1e9);if(Math.abs(C)>1e-5){const Ne=(pe.z-r)/C,nt=(pe.z+r)/C;ie=Math.max(ie,Math.min(Ne,nt)),m=Math.min(m,Math.max(Ne,nt))}else Math.abs(pe.z)>r&&(m=-1e9);if(M.groundStrip&&Ot>.004){const Ne=this.strips[M.family],nt=pe.x/(o*1e3),ft=pe.z/(l*1e3);Ne.alongTrackKm=nt*Math.cos(E)+ft*Math.sin(E),Ne.strength=Ot}const He=At>.004&&m>ie+.05;if(p.rays.visible=He,p.fan.visible=He,!He)continue;const at=p.fan.geometry.getAttribute("position"),ia=p.fan.geometry.getAttribute("color"),aa=pe.y-.04;at.setXYZ(0,pe.x,aa,pe.z),ia.setXYZW(0,ce.r,ce.g,ce.b,1);for(let Ne=0;Ne<qs;Ne++){const nt=ie+(m-ie)*Ne/(qs-1),ft=pe.x-B*nt,wa=pe.z-C*nt,da=D.clamp(ft/a.slabWidth+.5,0,1),$e=D.clamp(.5-wa/a.slabDepth,0,1);at.setXYZ(Ne+1,ft,a.sampleTerrainY(da,$e)+.02,wa),ia.setXYZW(Ne+1,ce.r,ce.g,ce.b,.12)}at.needsUpdate=!0,ia.needsUpdate=!0,p.fanMat.opacity=.04*At;const _t=p.rays.geometry.getAttribute("position"),na=p.rays.geometry.getAttribute("color"),ha=[1,1+Math.floor(qs/2),qs];for(let Ne=0;Ne<3;Ne++)_t.setXYZ(Ne*2,pe.x,aa,pe.z),_t.setXYZ(Ne*2+1,at.getX(ha[Ne]),at.getY(ha[Ne]),at.getZ(ha[Ne])),na.setXYZW(Ne*2,ce.r,ce.g,ce.b,1),na.setXYZW(Ne*2+1,ce.r,ce.g,ce.b,Ne===1?.25:.5);_t.needsUpdate=!0,na.needsUpdate=!0,p.raysMat.opacity=.6*At}}dispose(){var t;this.disposed=!0,(t=this.draco)==null||t.dispose();for(const a of this.templates.values())Ar(a);Ar(this.group),this.look.dispose()}}const Lh=64;function rp(e){let t=e>>>0;return()=>{t=t+1831565813>>>0;let a=t;return a=Math.imul(a^a>>>15,a|1),a^=a+Math.imul(a^a>>>7,a|61),((a^a>>>14)>>>0)/4294967296}}function kr(e,t){const a=new Float32Array(e*e*e);for(let i=0;i<a.length;i++)a[i]=t();const s=e-1,o=e*e;return(i,l,h)=>{const r=i*e,c=l*e,d=h*e,p=Math.floor(r),M=Math.floor(c),b=Math.floor(d),g=r-p,R=c-M,E=d-b,w=g*g*g*(g*(g*6-15)+10),x=R*R*R*(R*(R*6-15)+10),S=E*E*E*(E*(E*6-15)+10),A=p&s,B=p+1&s,C=(M&s)*e,P=(M+1&s)*e,U=(b&s)*o,G=(b+1&s)*o,_=a[U+C+A],Y=a[U+C+B],Z=a[U+P+A],ge=a[U+P+B],we=a[G+C+A],Ae=a[G+C+B],be=a[G+P+A],Me=a[G+P+B],pe=_+(Y-_)*w,dt=Z+(ge-Z)*w,ce=we+(Ae-we)*w,ae=be+(Me-be)*w,Rt=pe+(dt-pe)*x,At=ce+(ae-ce)*x;return Rt+(At-Rt)*S}}function Fr(e,t){const a=new Float32Array(e*e*e*3);for(let o=0;o<a.length;o++)a[o]=t();const s=e-1;return(o,i,l)=>{const h=o*e,r=i*e,c=l*e,d=Math.floor(h),p=Math.floor(r),M=Math.floor(c);let b=9;for(let g=-1;g<=1;g++){const R=(M+g&s)*e,E=M+g-c;for(let w=-1;w<=1;w++){const x=(R+(p+w&s))*e,S=p+w-r;for(let A=-1;A<=1;A++){const B=(x+(d+A&s))*3,C=d+A+a[B]-h,P=S+a[B+1],U=E+a[B+2],G=C*C+P*P+U*U;G<b&&(b=G)}}}return Math.min(1,Math.sqrt(b))}}let Dr=null;function lp(){if(Dr)return Dr;const e=Lh,t=rp(1377799),a=kr(4,t),s=kr(8,t),o=kr(16,t),i=Fr(4,t),l=Fr(8,t),h=Fr(16,t),r=new Uint8Array(e*e*e*4),c=1/e;let d=0;for(let p=0;p<e;p++){const M=(p+.5)*c;for(let b=0;b<e;b++){const g=(b+.5)*c;for(let R=0;R<e;R++){const E=(R+.5)*c,w=a(E,g,M)*.5+s(E,g,M)*.3+o(E,g,M)*.2,x=1-i(E,g,M),S=1-l(E,g,M),A=1-h(E,g,M),B=Math.min(1,Math.max(0,w*.62+x*.46-.06)),C=Math.min(1,Math.max(0,S*.62+A*.38));r[d]=Math.round(B*255),r[d+1]=Math.round(C*255),r[d+2]=Math.round(w*255),r[d+3]=255,d+=4}}}return Dr=r,r}function cp(){const e=Lh,t=new Dd(lp(),e,e,e);return t.format=Ct,t.type=Bt,t.minFilter=Be,t.magFilter=Be,t.wrapS=ro,t.wrapT=ro,t.wrapR=ro,t.unpackAlignment=1,t.needsUpdate=!0,t}const Zs=256,up=256;function hp(e,t,a,s,o){const i=up,l=new Float32Array(i*i);for(let g=0;g<i;g++){const R=Math.min(t-1,Math.round(g/(i-1)*(t-1)));for(let E=0;E<i;E++){const w=Math.min(t-1,Math.round(E/(i-1)*(t-1)));l[g*i+E]=a(e[R*t+w])}}const h=5,r=new Float32Array(i*i),c=new Float32Array(i*i);for(let g=0;g<i;g++)for(let R=0;R<i;R++){let E=0;for(let w=-h;w<=h;w++)E+=l[g*i+Math.min(i-1,Math.max(0,R+w))];r[g*i+R]=E/(2*h+1)}for(let g=0;g<i;g++)for(let R=0;R<i;R++){let E=0;for(let w=-h;w<=h;w++)E+=r[Math.min(i-1,Math.max(0,g+w))*i+R];c[g*i+R]=E/(2*h+1)}const d=new Uint16Array(i*i*4),p=s/(i-1),M=o/(i-1);for(let g=0;g<i;g++){const R=Math.max(0,g-2),E=Math.min(i-1,g+2);for(let w=0;w<i;w++){const x=Math.max(0,w-2),S=Math.min(i-1,w+2),A=(c[g*i+S]-c[g*i+x])/((S-x)*p),B=(c[E*i+w]-c[R*i+w])/((E-R)*M),C=Math.hypot(A,B),P=C>1e-5?Math.min(1,C*1.6)/C:0,U=(g*i+w)*4;d[U]=Ra.toHalfFloat(l[g*i+w]),d[U+1]=Ra.toHalfFloat(A*P),d[U+2]=Ra.toHalfFloat(B*P),d[U+3]=Ra.toHalfFloat(c[g*i+w])}}const b=new ta(d,i,i,Ct,Ua);return b.minFilter=Be,b.magFilter=Be,b.wrapS=We,b.wrapT=We,b.generateMipmaps=!1,b.flipY=!1,b.needsUpdate=!0,b}const Vo=`
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`,dp=`
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
  float s = max(0.0, z - ${Jo.toFixed(4)}) / ${(1-Jo).toFixed(4)};
  gl_FragColor = vec4(clamp(s * 1.6, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`,fp=`
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
`,Nh=`
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
`,mp=`
${Nh}
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
`,pp=`
${Nh}
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
`,vp=`
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
`,gp=.62,xp=.88;class zh extends xa{constructor(){super("SmokePass");k(this,"shadowTarget");k(this,"sourceTarget");k(this,"smokeTarget");k(this,"historyTarget");k(this,"historyValid",!1);k(this,"frame",0);k(this,"lastTime",-1);k(this,"prevViewProj",new to);k(this,"viewProj",new to);k(this,"noiseTexture");k(this,"plumeTarget");k(this,"sourceMaterial");k(this,"plumeMaterial");k(this,"shadowMaterial");k(this,"marchMaterial");k(this,"compositeMaterial");k(this,"densityUniforms");k(this,"lastSourceRenderer",null);k(this,"lastSourceSig",new Float64Array(6).fill(Number.NaN));k(this,"lastPlumeRenderer",null);k(this,"lastPlumeSig",new Float64Array(15).fill(Number.NaN));this.needsDepthTexture=!0,this.needsSwap=!0,this.noiseTexture=cp(),this.sourceTarget=new Qt(Zs,Zs,{format:Ct,type:Ua,depthBuffer:!1,stencilBuffer:!1,minFilter:Za,magFilter:Be,generateMipmaps:!0}),this.sourceTarget.texture.colorSpace=Ba,this.plumeTarget=new Qt(Zs,Zs,{format:Ct,type:Ua,depthBuffer:!1,stencilBuffer:!1,minFilter:Za,magFilter:Be,generateMipmaps:!0}),this.plumeTarget.texture.colorSpace=Ba,this.shadowTarget=new Qt(Zs,Zs,{format:Ct,type:Bt,depthBuffer:!1,stencilBuffer:!1,minFilter:Be,magFilter:Be,generateMipmaps:!1}),this.shadowTarget.texture.colorSpace=Ba;const a=()=>new Qt(2,2,{format:Ct,type:Ua,depthBuffer:!1,stencilBuffer:!1,minFilter:Be,magFilter:Be,generateMipmaps:!1});this.smokeTarget=a(),this.historyTarget=a(),this.densityUniforms={uHeightPrev:{value:null},uHeightNext:{value:null},uMorph:{value:1},uSourceTex:{value:this.sourceTarget.texture},uPlumeTex:{value:this.plumeTarget.texture},uNoiseTex:{value:this.noiseTexture},uSlabSize:{value:new Le(14.8,10.8)},uSmokeTop:{value:gp},uWindUv:{value:new Le(.7,.7)},uTime:{value:0},uOpacity:{value:1},uCutawayMix:{value:0},uCutawayPlane:{value:0},uCutawayDir:{value:new Le(1,0)},uClearCenter:{value:new W},uClearRadius:{value:0},uThinOverFire:{value:0},uLid:{value:new pa(0,1,0,-1e4)},uLidAmount:{value:0},uSunDir:{value:new W(0,1,0)},uSigma:{value:4.6}};const s={depthTest:!1,depthWrite:!1,toneMapped:!1};this.sourceMaterial=new Et({...s,vertexShader:Vo,fragmentShader:dp,uniforms:{uField0:{value:null},uField1:{value:null},uDetection0:{value:null},uDetection1:{value:null},uRealSource:{value:0},uFrameMix:{value:0}}}),this.plumeMaterial=new Et({...s,vertexShader:Vo,fragmentShader:fp,uniforms:{uSourceTex:this.densityUniforms.uSourceTex,uHeightPrev:this.densityUniforms.uHeightPrev,uHeightNext:this.densityUniforms.uHeightNext,uMorph:this.densityUniforms.uMorph,uWindUv:this.densityUniforms.uWindUv,uSmokeTop:this.densityUniforms.uSmokeTop,uSlabSize:this.densityUniforms.uSlabSize,uLid:this.densityUniforms.uLid,uLidAmount:this.densityUniforms.uLidAmount}}),this.shadowMaterial=new Et({...s,vertexShader:Vo,fragmentShader:mp,uniforms:this.densityUniforms}),this.marchMaterial=new Et({...s,vertexShader:Vo,fragmentShader:pp,uniforms:{...this.densityUniforms,uDepthTex:{value:null},uProjInv:{value:new to},uViewInv:{value:new to},uCameraPos:{value:new W},uBoxTop:{value:4},uSunColor:{value:new W(1.4,1.29,1.17)},uNight:{value:0},uFireLight:{value:1},uStepFine:{value:.075},uHistoryTex:{value:null},uPrevViewProj:{value:new to},uHistoryWeight:{value:0},uFrame:{value:0},uProxyY:{value:1},uHalfSize:{value:new Le(2,2)}}}),this.compositeMaterial=new Et({...s,vertexShader:Vo,fragmentShader:vp,uniforms:{uSceneTex:{value:null},uSmokeTex:{value:this.smokeTarget.texture},uDepthTex:{value:null},uHalfSize:{value:new Le(2,2)},uNear:{value:.1},uFar:{value:100}}}),this.fullscreenMaterial=this.compositeMaterial}setDepthTexture(a){this.marchMaterial.uniforms.uDepthTex.value=a,this.compositeMaterial.uniforms.uDepthTex.value=a}setSize(a,s){const o=Math.max(2,Math.ceil(a/2)),i=Math.max(2,Math.ceil(s/2));this.smokeTarget.setSize(o,i),this.historyTarget.setSize(o,i),this.historyValid=!1,this.compositeMaterial.uniforms.uHalfSize.value.set(o,i),this.marchMaterial.uniforms.uHalfSize.value.set(o,i)}update(a){const s=this.densityUniforms;s.uHeightPrev.value=a.heightPrev,s.uHeightNext.value=a.heightNext,s.uMorph.value=a.morph,s.uSlabSize.value.set(a.slabWidth,a.slabDepth),s.uWindUv.value.copy(a.windUv).normalize(),s.uTime.value=a.time,s.uLid.value.copy(a.lid),s.uLidAmount.value=a.lidAmount,s.uClearCenter.value.setFromMatrixPosition(a.camera.matrixWorld),s.uClearRadius.value=a.clearRadius,s.uThinOverFire.value=a.thinOverFire,s.uOpacity.value=a.opacity,s.uCutawayMix.value=a.cutawayMix,s.uCutawayPlane.value=a.cutawayPlane,s.uCutawayDir.value.copy(a.cutawayDir),s.uSunDir.value.copy(a.sunDir);const o=this.sourceMaterial.uniforms;o.uField0.value=a.field0,o.uField1.value=a.field1,o.uDetection0.value=a.detection0??a.field0,o.uDetection1.value=a.detection1??a.field1,o.uRealSource.value=a.detection0&&a.detection1?1:0,o.uFrameMix.value=a.frameMix;const i=this.marchMaterial.uniforms,l=a.camera;i.uProjInv.value.copy(l.projectionMatrixInverse),i.uViewInv.value.copy(l.matrixWorld),i.uCameraPos.value.setFromMatrixPosition(l.matrixWorld),i.uSunColor.value.copy(a.sunColor),i.uNight.value=a.night??0,i.uFireLight.value=a.fireLight??1,i.uBoxTop.value=a.reliefTop+s.uSmokeTop.value+.05,i.uProxyY.value=.5*(a.reliefTop+s.uSmokeTop.value),(this.lastTime<0||a.time-this.lastTime>.25||a.time<this.lastTime)&&(this.historyValid=!1),this.lastTime=a.time,i.uPrevViewProj.value.copy(this.prevViewProj),this.viewProj.multiplyMatrices(l.projectionMatrix,l.matrixWorldInverse),this.prevViewProj.copy(this.viewProj),i.uHistoryWeight.value=this.historyValid?xp:0,i.uFrame.value=this.frame,this.frame=(this.frame+1)%4096;const h=this.compositeMaterial.uniforms;h.uNear.value=l.near,h.uFar.value=l.far}render(a,s,o){const i=this.scene,l=this.camera,h=this.sourceMaterial.uniforms,r=h.uRealSource.value>.5?1:0,c=r?h.uDetection0.value:h.uField0.value,d=r?h.uDetection1.value:h.uField1.value,p=c?c.id:-1,M=c?c.version:-1,b=d?d.id:-1,g=d?d.version:-1,R=h.uFrameMix.value,E=this.lastSourceSig,w=this.lastSourceRenderer!==a||E[0]!==r||E[1]!==p||E[2]!==M||E[3]!==b||E[4]!==g||E[5]!==R;w&&(this.fullscreenMaterial=this.sourceMaterial,a.setRenderTarget(this.sourceTarget),a.render(i,l),this.lastSourceRenderer=a,E[0]=r,E[1]=p,E[2]=M,E[3]=b,E[4]=g,E[5]=R);const x=this.densityUniforms,S=x.uMorph.value,A=S<.999?S:1,B=S<.999?x.uHeightPrev.value:null,C=x.uHeightNext.value,P=B?B.id:-1,U=B?B.version:-1,G=C?C.id:-1,_=C?C.version:-1,Y=x.uWindUv.value,Z=x.uSmokeTop.value,ge=x.uSlabSize.value,we=x.uLidAmount.value,Ae=we>0?we:0,be=x.uLid.value,Me=Ae>0?be.x:0,pe=Ae>0?be.y:0,dt=Ae>0?be.z:0,ce=Ae>0?be.w:0,ae=this.lastPlumeSig;(w||this.lastPlumeRenderer!==a||ae[0]!==P||ae[1]!==U||ae[2]!==G||ae[3]!==_||ae[4]!==A||ae[5]!==Y.x||ae[6]!==Y.y||ae[7]!==Z||ae[8]!==ge.x||ae[9]!==ge.y||ae[10]!==Ae||ae[11]!==Me||ae[12]!==pe||ae[13]!==dt||ae[14]!==ce)&&(this.fullscreenMaterial=this.plumeMaterial,a.setRenderTarget(this.plumeTarget),a.render(i,l),this.lastPlumeRenderer=a,ae[0]=P,ae[1]=U,ae[2]=G,ae[3]=_,ae[4]=A,ae[5]=Y.x,ae[6]=Y.y,ae[7]=Z,ae[8]=ge.x,ae[9]=ge.y,ae[10]=Ae,ae[11]=Me,ae[12]=pe,ae[13]=dt,ae[14]=ce),this.fullscreenMaterial=this.shadowMaterial,a.setRenderTarget(this.shadowTarget),a.render(i,l);const At=this.smokeTarget;this.smokeTarget=this.historyTarget,this.historyTarget=At,this.marchMaterial.uniforms.uHistoryTex.value=this.historyTarget.texture,this.fullscreenMaterial=this.marchMaterial,a.setRenderTarget(this.smokeTarget),a.render(i,l),this.historyValid=!0,this.compositeMaterial.uniforms.uSmokeTex.value=this.smokeTarget.texture,this.compositeMaterial.uniforms.uSceneTex.value=s.texture,this.fullscreenMaterial=this.compositeMaterial,a.setRenderTarget(this.renderToScreen?null:o),a.render(i,l)}dispose(){this.lastSourceRenderer=null,this.lastSourceSig.fill(Number.NaN),this.lastPlumeRenderer=null,this.lastPlumeSig.fill(Number.NaN),this.sourceTarget.dispose(),this.plumeTarget.dispose(),this.shadowTarget.dispose(),this.smokeTarget.dispose(),this.historyTarget.dispose(),this.noiseTexture.dispose(),this.sourceMaterial.dispose(),this.plumeMaterial.dispose(),this.shadowMaterial.dispose(),this.marchMaterial.dispose(),this.compositeMaterial.dispose()}}k(zh,"sourceGrid",Ke);const tl=2,Bu=Zo*Qo,wp=.62,Mp=1.75;function yp(e,t){const a=Math.max(1,e),s=Math.max(1,t),o=Math.min(Mp,Math.max(wp,a/s)),i=Math.sqrt(Bu*o),l=Bu/i,h=i/(a*1e3),r=l/(s*1e3),c=Math.sqrt(h*r)*tl;return{width:i,depth:l,unitsPerMetre:[h,c,r]}}function bp(e,t,a,s){const o=Math.max(350,a-t);return Math.min(o*1.15,Math.max(0,e-t))*s.unitsPerMetre[1]}const Ou=.08,Sp=.3,Tp=3;function Yo(e){if(!e)return null;const{left:t,top:a,right:s,bottom:o}=e;if(![t,a,s,o].every(c=>Number.isFinite(c)))return null;const i=Math.min(1,Math.max(0,Math.min(t,s))),l=Math.min(1,Math.max(0,Math.max(t,s))),h=Math.min(1,Math.max(0,Math.min(a,o))),r=Math.min(1,Math.max(0,Math.max(a,o)));return l-i<Ou||r-h<Ou?null:{left:i,top:h,right:l,bottom:r}}function Pr(e,t){return e===t?!0:!e||!t?!1:Math.abs(e.left-t.left)<1e-5&&Math.abs(e.top-t.top)<1e-5&&Math.abs(e.right-t.right)<1e-5&&Math.abs(e.bottom-t.bottom)<1e-5}const Tt=new rl,va=new W,Ut=new W,Ki=new W,Ds=new W;function Ep(e,t,a,s,o,i,l,h){let r=Number.POSITIVE_INFINITY,c=Number.NEGATIVE_INFINITY,d=Number.POSITIVE_INFINITY,p=Number.NEGATIVE_INFINITY;Tt.fov=o,Tt.aspect=i,Tt.near=.1,Tt.far=200,Tt.clearViewOffset(),Tt.updateProjectionMatrix(),va.set(a.target[0],a.target[1],a.target[2]);const M=s>1e-4?[-s,0,s]:[0];for(const A of M){const B=a.azimuth+A,C=Math.sin(a.polar);Tt.position.set(va.x+a.distance*C*Math.sin(B),va.y+a.distance*Math.cos(a.polar),va.z+a.distance*C*Math.cos(B)),Tt.up.set(0,1,0),Tt.lookAt(va),Tt.updateMatrixWorld(!0);for(let P=0;P<t;P++)Ut.set(e[P*3],e[P*3+1],e[P*3+2]).project(Tt),!(Ut.z>=1||Ut.z<=-1)&&(Ut.x<r&&(r=Ut.x),Ut.x>c&&(c=Ut.x),Ut.y<d&&(d=Ut.y),Ut.y>p&&(p=Ut.y))}if(!(c>r)||!(p>d))return h.scale=1,h.offsetX=0,h.offsetY=0,h;const b=(c-r)*.5,g=(p-d)*.5,R=(r+c)*.25+.5,E=.5-(d+p)*.25,w=l.right-l.left,x=l.bottom-l.top,S=Math.min(Tp,Math.max(Sp,Math.min(w/b,x/g)));return h.scale=S,h.offsetX=R*S-(l.left+l.right)*.5,h.offsetY=E*S-(l.top+l.bottom)*.5,h}const Rp=.24,Ap=.46,Uh=.03;function Bh(e){return Math.min(Ap,Math.max(Rp,e.bottom+Uh))}function _p(e,t,a,s){Tt.fov=a,Tt.aspect=s,Tt.near=.1,Tt.far=200,Tt.clearViewOffset(),Tt.updateProjectionMatrix(),va.set(e.target[0],e.target[1],e.target[2]);const o=Math.sin(e.polar);Tt.position.set(va.x+e.distance*o*Math.sin(t),va.y+e.distance*Math.cos(e.polar),va.z+e.distance*o*Math.cos(t)),Tt.up.set(0,1,0),Tt.lookAt(va),Tt.updateMatrixWorld(!0)}function kp(e,t,a,s,o,i,l,h){let r=Number.POSITIVE_INFINITY;const c=s>1e-4?[-s,0,s]:[0];for(const p of c){_p(a,a.azimuth+p,o,i);for(let M=0;M<t;M++){if(Ut.set(e[M*3],e[M*3+1],e[M*3+2]).project(Tt),Ut.z>=1||Ut.z<=-1)continue;const b=Ut.x*.5+.5;if(b<l.left-.04||b>l.right+.04)continue;const g=.5-Ut.y*.5;g<r&&(r=g)}}if(h.scale=1,h.offsetX=0,!Number.isFinite(r))return h.offsetY=0,h;const d=Bh(l);return h.offsetY=Math.min(.1,Math.max(-.42,r-d)),h}function Fp(e){return Math.min(e.bottom,Bh(e)-Uh)}function Dp(e,t,a){const s=1-2*t;return Ut.set(-1,s,.5).unproject(e),va.set(1,s,.5).unproject(e),Ki.setFromMatrixPosition(e.matrixWorld),Ut.sub(Ki),va.sub(Ki),Ds.crossVectors(va,Ut).normalize(),Ds.y<0&&Ds.negate(),a.set(Ds.x,Ds.y,Ds.z,-Ds.dot(Ki))}function Pp(e,t,a,s){if(Math.abs(s.scale-1)<4e-4&&Math.abs(s.offsetX)<4e-4&&Math.abs(s.offsetY)<4e-4){e.view!==null&&e.view.enabled&&e.clearViewOffset();return}e.setViewOffset(t*s.scale,a*s.scale,s.offsetX*t,s.offsetY*a,t,a)}const Hu=St.azimuth,Ip=.62,Wi=30,Vi=.055,Cp=[3.6,5,6.5,8],Lp=[90,180,300,450,650,900],Np=2,zp=2.5,Up=.05,Bp=.6,Ir=.14,Qs=150,Gu=.3,Op=.03,La=19,Hp=1.7,Gp=.6,Ku={left:0,top:0,right:1,bottom:.34},Kp=4,Js=33,eo=48,Wp=3.2,Yi=1.15,Wu=6;function Vp(e,t,a,s){return s.set(-t*Math.cos(e),-a*Math.sin(e)).normalize()}const Vu=4,Yp=4.4,$p=4.6,jp=3.5,Xp=3.2,qp=111.32;function Cr(e){return Math.max(1,(e[3]-e[1])*qp)}const Yu=-.11,Zp=.065,no=13,Oh=5,Qp=no*no+4+Oh,Ps=24;function Jp(e){const t=e==null?void 0:e.held_out_passes_answered_by;return typeof(t==null?void 0:t.method)=="string"&&t.method!=="reconstruction"}let Lr=null;function Nr(){return Lr||(Lr=new Uint8Array(oo*Ke*Ke*4)),Lr}function zr(){return{source:"procedural_fallback",provenanceNote:"No run on show.",frames:Array.from({length:oo},()=>[])}}function ev(){const e=new ta(new Uint8Array([104,106,102,255]),1,1,Ct);return e.colorSpace=ht,e.needsUpdate=!0,e}function $u(e){return e.noRealGround?!1:(e.levelIsWater===void 0&&(e.levelIsWater=!cl(e.alignedDem,e.demGridRes)),e.levelIsWater)}function tv(e){const t=e.toUpperCase();return t.includes("TERRA")?"MODIS_TERRA":t.includes("AQUA")?"MODIS_AQUA":t.includes("NOAA20")||t.includes("NOAA-20")||t.includes("JPSS")?"VIIRS_NOAA20":t.includes("SNPP")||t.includes("NPP")?"VIIRS_SNPP":null}function ju(){if(typeof window>"u")return null;const e=new URLSearchParams(window.location.search).get("film");return e==="record"||e==="estimate"||e==="test"||e==="play"||e==="turn"||e==="auto"?e:null}function av(e,t){const a=e.runId!==null&&t.has(e.runId);if(!e.missingFiles&&!a)return;const s=(e.missingFiles??[]).filter(i=>!(e.pack&&(i==="elevation"||i==="imagery"))),o=a?[...s,"estimate"]:s;return o.length>0?o:void 0}const sv=[];function Ur(e){return e.observerDataset.dataSource==="firms"?sv:e.callouts}function ov(e){const t=e.fieldScale??ao;return{scale:t.kind==="linear"?"linear":"log",ticks:t.ticks??[0,.25,.5,.75,1].map(a=>({at:a,mwPerKm2:vh(t,a)}))}}const iv=2.6,nv=9,rv=6,lv=9.5,Xu=.08,Br=8,cv=1,uv=1.8,hv=.05,qu=12,Or=.12,Zu=9,dv=1.22,Hr=.94,fv=5,Qu=1.5,mv=5,Ju=2,eh=.8,Gr=3,Kr=22,th=.75,ah=[1.1,.95,.8,.65],Wr=39,sh=.375,oh=.3,pv=.4,ih=.43,vv=3,gv=.3,xv=24*3600*1e3,wv=5,Mv=.25,yv=50,Vr=.4,bv=60,Yr=[.04,.22,.34,.86,.96,1],Sv=6,nh=.375,Tv=1.3,Ev=1.9,Rv=.044,Av=1.08,_v=1.8,kv=2,Fv=e=>typeof e=="number"&&e>0?D.clamp(Math.pow(Math.max(1,Rv/e/Av),_v),1,kv):1,Dv=[.64,.76],Pv=.7,Iv=1.2,Cv=.02,Lv=0,Nv=1;function zv(e,t){return e.kind==="linear"?t.set(.02,1):t.set(Zi(e,Nv),1)}const Uv=4,Bv=2500;function Ov(e,t){return e.kind==="linear"?t.set(.02,1):t.set(Zi(e,Uv),Zi(e,Bv))}const Hv=.45;function Gv(e,t,a,s){if(e.dataSource!=="firms")return null;const[o,i,l,h]=t,r=Hv*Math.min(a,s);let c=-1,d=-1;return e.frames.forEach((p,M)=>{let b=0,g=!1,R=!1;const E=[],w=[];for(const P of p)if(!P.hidden){b+=P.footprints.length,P.family==="viirs"&&P.isDay===!1&&(g=!0),P.isDay===!1&&P.footprints.length>0&&(R=!0);for(const U of P.footprints)E.push((U.lon-o)/Math.max(1e-9,l-o)*a),w.push((U.lat-i)/Math.max(1e-9,h-i)*s)}if(b===0)return;E.sort((P,U)=>P-U),w.sort((P,U)=>P-U);const x=Math.floor(.05*(b-1)),S=Math.ceil(.95*(b-1)),B=Math.hypot(E[S]-E[x],w[S]-w[x])<=r,C=b+(R?1e5:0)+(R&&B?2e5:0)+(g?1e6:0)+(g&&B?1e7:0);C>d&&(d=C,c=M)}),c>=0?c:null}function Kv(e){var s;const t=e.attribution,a=((s=e.context)==null?void 0:s.manifest.ortho.attribution)??"";return a&&a!==t?t?`${t}; ${a}`:a:t}function rh(e){return ds.includes(e)}function Na(e,t){return e.resolveAsset?e.resolveAsset(t):Wv(e.apiBase,t)}function lh(e){return`/isogon/${e}`}function Wv(e,t){if(t.startsWith("http://")||t.startsWith("https://")||t.startsWith("data:"))return t;const a=e.replace(/\/+$/,"");return t.startsWith("/")?`${a}${t}`:`${a}/${t}`}function $o(e,t,a,s){const o=Math.min(1,Math.max(0,a))*(t-1),i=Math.min(1,Math.max(0,s))*(t-1),l=Math.floor(o),h=Math.floor(i),r=Math.min(t-1,l+1),c=Math.min(t-1,h+1),d=o-l,p=i-h,M=e[h*t+l],b=e[h*t+r],g=e[c*t+l],R=e[c*t+r],E=M+(b-M)*d,w=g+(R-g)*d;return E+(w-E)*p}const Vv=new W(.075,.098,.135),Hh=new W(-.56,.64,.52).normalize();function Yv(e,t,a){const s=Eh(a),o=s?s.extent_km[0]:e,i=s?s.extent_km[1]:t,l=yp(o,i),h=Hh.clone(),[r,c,d]=l.unitsPerMetre,p=new W(h.x/r,h.y/c,h.z/d).normalize();return s&&(zf(s.sun.azimuth_deg,s.sun.elevation_deg,p),Uf(p,new W(r,c,d),h)),{widthKm:o,depthKm:i,frame:l,sunDir:h,sunTrue:p,packManifest:s}}const ch="Esri, Vantor, Earthstar Geographics, and the GIS User Community";function $r(e,t,a,s,o){const i=Yv(e,t,a),l=i.widthKm/Math.max(64,s);return{widthKm:i.widthKm,depthKm:i.depthKm,frame:i.frame,sunDir:i.sunDir,sunTrue:i.sunTrue,orthoTexelKm:l,sharpen:1,shadow:null,packManifest:i.packManifest,packState:"none",pack:null,lite:null,context:null,contextState:"none",auxTex:null,detailTex:null,detailRect:[0,0,1,1],detailTexelKm:l,attribution:o}}function Is(e,t){return bp(e,t.minElevM,t.maxElevM,t.frame)}function jr(e,t,a,s,o,i){return ff(e,t,o,i,{gridSize:Ke,zMaxMwKm2:ef,sigmaMaxMwKm2:tf},(l,h)=>$o(a,s,l,h))}function Zv(e){const t=It.useRef(null),a=It.useRef(null),s=It.useRef(null),o=It.useRef([null,null,null]),i=It.useRef([null,null,null]),l=It.useRef([null,null,null]),h=It.useRef(null),r=It.useRef(null),c=It.useRef(null),[d,p]=It.useState([]),M=It.useRef(new Map),b=It.useRef(new Set),g=It.useRef(e);g.current=e;const R=It.useRef(null);It.useEffect(()=>{const x=t.current;if(!x)return;let S=!1;if(!dd())throw new ou("unavailable");let A;try{A=new Pd({antialias:!1,alpha:!1,depth:!1,powerPreference:"high-performance",stencil:!1})}catch(n){throw new ou("failed",n)}const B=B0(z0());let C=Cu();A.setPixelRatio(C),A.setClearColor(new qi("#080b11"),1),A.domElement.style.width="100%",A.domElement.style.height="100%",A.domElement.style.display="block",x.appendChild(A.domElement);const P=Math.min(16,A.capabilities.getMaxAnisotropy()||4),U=new Id;U.setCrossOrigin("anonymous");const G=new po,_=new rl(39,16/9,.12,140),Y=new D0(A,G,_),Z=new zh;Y.insertScenePass(Z);const ge=new Set,we=n=>(n.smokeHeight||(n.smokeHeight=hp(n.alignedDem,n.demGridRes,f=>Is(f,n),n.frame.width,n.frame.depth),ge.add(n.smokeHeight)),n.smokeHeight);let Ae=1,be=0;const Me=Hh.clone(),pe=new Cd(16775922,Yp);pe.position.copy(Me).multiplyScalar(20),G.add(pe);const dt=ap(A);G.environment=dt.texture;const ce=new Map,ae=new Map;for(const n of ds){const f=jo[n],v=nu(n,256),u=Cs(v,!1),T=ru(n,u.aligned,u.gridRes,u.minElev,u.maxElev,P),y=Nr(),L=jr(n,f.bbox,u.aligned,u.gridRes,y,oo);ce.set(n,{key:`proc-${n}`,regionId:n,runId:null,noRealGround:!0,noRealPicture:!0,demTex:u.texture,alignedDem:u.aligned,demGridRes:u.gridRes,minElevM:u.minElev,maxElevM:u.maxElev,satTex:T,orthoLabel:"drawn stand-in",demLabel:"512²",tensor:y,frameCount:oo,bbox:[...f.bbox],windDirUv:[...f.windDirUv],hasSeaCoast:f.hasSeaCoast,observerDataset:zr(),findings:L.anchors,callouts:L.callouts,fireHistory:null,...$r(f.widthKm,Cr(f.bbox),null,512,"")})}const Rt=A.extensions.has("OES_texture_float_linear"),At=n=>(n.fireHistory||(n.fireHistory=Of(n.tensor,n.frameCount,Rt)),n.fireHistory),Ot=g.current.activeTheaterId;let ie=ce.get(Ot)??ce.get("plumas_ca"),m=ie;const He=[],at=n=>{n&&!He.includes(n)&&He.push(n)},ia=()=>{const n=new Set,f=v=>{v&&(n.add(v),v.lite&&n.add(v.lite))};f(ie),f(m);for(const v of ce.values())f(v);for(const v of ae.values())f(v);for(const v of la.values())f(v);return n},aa=()=>{var u,T;if(He.length===0)return;const n=ia(),f=new Set;for(const y of n)f.add(y.demTex),f.add(y.satTex),f.add((u=y.fireHistory)==null?void 0:u.texture),f.add(y.shadow),f.add(y.smokeHeight);const v=y=>{!y||f.has(y)||(f.add(y),y.dispose())};for(const y of He)n.has(y)||(v(y.demTex),v(y.satTex),v((T=y.fireHistory)==null?void 0:T.texture),v(y.shadow),y.smokeHeight&&(ge.delete(y.smokeHeight),v(y.smokeHeight)),y.fireHistory=null,y.shadow=null,y.smokeHeight=null,y.detectionSource=null);for(let y=He.length-1;y>=0;y--){const L=He[y];L===ie||L===m||L===ie.lite||L===m.lite||He.splice(y,1)}},_t=(n,f)=>{const v=ce.get(n);ce.set(n,f),v&&v!==f&&at(v)},na=n=>{const f=ae.get(n);return f&&(ae.delete(n),ae.set(n,f)),f},ha=(n,f,v)=>{for(_t(n,v),ae.set(f,v);ae.size>Kp;){const u=ae.keys().next().value,T=ae.get(u);ae.delete(u),at(T)}};p(Ur(m));const Ne=new Uint8Array(Ke*Ke*4),nt=new Uint8Array(Ke*Ke*4),ft=n=>{const f=new ta(n,Ke,Ke,Ct,Bt);return f.minFilter=Za,f.magFilter=Be,f.generateMipmaps=!0,f.wrapS=We,f.wrapT=We,f.flipY=!1,f.needsUpdate=!0,f},wa=ft(Ne),da=ft(nt),$e=sf();let Ht=-1,ln=-1,xo=null;const wo=Ke*Ke,dl=()=>{const n=new ta(new Uint8Array(wo),Ke,Ke,uh,Bt);return n.minFilter=Be,n.magFilter=Be,n.generateMipmaps=!1,n.flipY=!1,n.needsUpdate=!0,n},ei=dl(),ti=dl();let fl="",ml="";const Gh=(n,f,v)=>{const u=n.detectionSource??(n.detectionSource=hm(n.observerDataset.frames,n.frameCount,n.bbox,[n.widthKm,n.depthKm],Ke)),T=`${n.key}:${f}`;T!==fl&&(ei.image.data.set(u.subarray(f*wo,(f+1)*wo)),ei.needsUpdate=!0,fl=T);const y=`${n.key}:${v}`;y!==ml&&(ti.image.data.set(u.subarray(v*wo,(v+1)*wo)),ti.needsUpdate=!0,ml=y)},ai=new lm,fa=new dm,pl=M.current,vl={value:0},cn={value:0},gl={value:0},xl={value:0},wl=new pa(1,1,0,0),Ml=new Le(1,1);let ms=null,Aa=null,yl=null,un=null,ps=0;const Kh=n=>{var T,y;const f=Math.round(((T=n.grid)==null?void 0:T.nx)??0),v=Math.round(((y=n.grid)==null?void 0:y.ny)??0);if(!(f>0&&v>0&&f*v<=4e6)||typeof n.day_png!="string")return;const u=new Image;u.onload=()=>{if(S||ms!==n)return;const L=document.createElement("canvas");L.width=f,L.height=v;const Q=L.getContext("2d",{willReadFrequently:!0});if(!Q)return;Q.drawImage(u,0,0,f,v);const q=Q.getImageData(0,0,f,v).data,oe=new Uint8Array(f*v);for(let ee=0;ee<v;ee++)for(let le=0;le<f;le++)oe[(v-1-ee)*f+le]=q[(ee*f+le)*4];const se=Date.parse(/T/.test(n.span.start)?n.span.start:`${n.span.start}T00:00:00Z`),Se=gf(oe,se,Date.parse(n.window.start),Date.parse(n.window.end)),he=new Uint8Array(f*v*4);for(let ee=0;ee<f*v;ee++)he[ee*4]=Se[ee]*64,he[ee*4+1]=oe[ee],he[ee*4+3]=255;const ne=new ta(he,f,v,Ct,Bt);ne.magFilter=vo,ne.minFilter=vo,ne.generateMipmaps=!1,ne.needsUpdate=!0,Aa==null||Aa.dispose(),Aa=ne,yl=n,un=xf(n.box,f,v,n.grid.cell_km??.375,n.grid.bounds??null),Ml.set(f,v)},u.src=n.day_png},bl={value:0};let hn=null,Sl="";const dn=new Le(0,0),Tl=Array.from({length:64},()=>new pa(0,0,0,0)),fn={value:-1};let si=null,mn="";const El=(n,f,v,u)=>{let T=1/0,y=1/0,L=-1/0,Q=-1/0,q=0,oe=0,se=!1;for(let he=0;he<=2;he++)for(let ne=0;ne<=2;ne++){const ee=D.clamp(n+(f-n)*ne/2,0,1),le=D.clamp(v+(u-v)*he/2,0,1);et.set(Yt(ee),Mt(ee,le),$t(le)).project(_);const de=et.z>-1&&et.z<1,ze=(et.x*.5+.5)*rt,st=(-et.y*.5+.5)*ut;ne===1&&he===1&&(q=ze,oe=st,se=de),de&&(T=Math.min(T,ze),y=Math.min(y,st),L=Math.max(L,ze),Q=Math.max(Q,st))}if(!Number.isFinite(T))return null;const Se=se&&q>=0&&q<=rt&&oe>=0&&oe<=ut;return{x:q,y:oe,left:T,top:y,right:L,bottom:Q,visible:Se}},pn=[];let vn=1;const Qa=new pa(0,1,0,0);let Rl=-1e9,Al="",gn=[];const _l=new Le(0,0),kl=new W(0,ao.maxMwKm2,ao.minMwKm2),Fl=new Le(.02,1),oi=new Le(.02,1),Dl={value:0},Os=new Le(0,0),xn={value:0},wn={value:0},Pl={value:1},ii=new Map;let ni=!1,Mn;const vs=new pa(0,1,1e4,.4),Il=new Le(-1,1);let Cl=0,Ll=0,Nl=-1e9;const yn={value:0},Ja={value:0};let bn="",Hs=[],ri=0,li=0,Sn=!1,Mo,zl="",Ul="",Bl=!1;const Tn={value:0},yo={value:1};let En,gs="";const es=[],xs=[],ci=[],bo={value:0},ts={value:1},Rn={value:0};let Ol="",Hl=!1,ui,So="",To="detections",mt=new Float32Array(0),ws={patchOf:new Uint16Array(0),sizes:[]};const Qe=new Float64Array(Br*7),Ms=new Float64Array(Br*3);let Eo=!1,hi="";const Jt=new Float64Array(38).fill(Number.NaN);let ra=null;const Gl=(n,f,v)=>{const T=Math.min(1,Math.max(0,v))*Math.max(1,f-1),y=Math.min(f-1,Math.floor(T)),L=Math.min(f-1,y+1),Q=T-y,q=Ke*Ke*4;return(xo!==n||Ht!==y)&&(Ne.set(n.subarray(y*q,(y+1)*q)),wa.needsUpdate=!0,Ht=y),(xo!==n||ln!==L)&&(nt.set(n.subarray(L*q,(L+1)*q)),da.needsUpdate=!0,ln=L),xo=n,Q},Wh=Gl(m.tensor,m.frameCount,g.current.timeProgress),Ro=new Jd,di=m.sunTrue.clone(),An=new W(1.4,1.29,1.17),Kl=new W(.9,.8,.66),Wl=n=>{const f=(n.minElevM+n.maxElevM)*5e-4;di.copy(n.sunTrue),$d(f,n.sunTrue.y,An),Kl.fromArray(Mh(f,n.sunTrue.y))};Wl(m);const Vl={value:0},as={uNight:Vl,uSkyView:{value:Ro.skyView.texture},uTransmittanceLut:{value:Ro.transmittance},uSunTrue:{value:di},uCamAltKm:{value:8},uVerticalExaggeration:{value:tl},uFloorColor:{value:new W(.044,.06,.094)},uFloorHaze:{value:.3},uSkyExposure:{value:pr}},Yl=new mh(62,48,32),$l=new Et({vertexShader:Zd,fragmentShader:Qd,uniforms:as,side:so,depthWrite:!1}),_n=new ba(Yl,$l);_n.renderOrder=-10,G.add(_n);const kn=new Le(m.frame.width,m.frame.depth),jl=new Le(ie.frame.unitsPerMetre[1],m.frame.unitsPerMetre[1]),Fn=new en(34,34,1,1);Fn.rotateX(-Math.PI/2);const Dn=new Et({vertexShader:rf,fragmentShader:lf,uniforms:{uSlabSize:{value:kn},uShadowMix:{value:1}},transparent:!0,depthWrite:!1}),fi=new ba(Fn,Dn);fi.position.y=zs-.005,fi.renderOrder=-2,G.add(fi);const Xl=Vp(Hu,m.frame.width,m.frame.depth,new Le),ql=new Le(ie.demGridRes,m.demGridRes),Zl=new Le(ie.minElevM,ie.maxElevM),Ql=new Le(m.minElevM,m.maxElevM),Jl=new Le(m.widthKm,m.depthKm),ec=new pa(1,0,0,0),tc=new pa(1,0,0,0),ac=new pa(0,0,0,0),Ao={...xu},_o={...xu},Pn=new Le(m.windDirUv[0],m.windDirUv[1]),sc=new W(...m.frame.unitsPerMetre),oc=new pa(0,0,1,1),ic=(n,f,v,u)=>{const T=new ta(new Uint8Array([n,f,v,u]),1,1,Ct,Bt);return T.needsUpdate=!0,T},In=ic(128,128,255,0),Cn=ic(255,255,255,255),nc=new C0(A),rc=n=>(n.shadow||(n.shadow=nc.bake(n.demTex,n.demGridRes,n.minElevM,n.maxElevM,n.frame.unitsPerMetre[1],n.frame.width,n.frame.depth,n.sunDir,n.demGridRes>=1024?2048:1024)),n.shadow.texture),lc=n=>{const f=L0(n),v=new tn;return v.setAttribute("position",new ga(f.position,3)),v.setAttribute("normal",new ga(f.normal,3)),v.setAttribute("uv",new ga(f.uv,2)),v.setIndex(new ga(f.index,1)),v.boundingSphere=new hh(new W(0,1,0),15),v},Ln=lc(bh);let ys=null,ko=null;const z={uDemPrev:{value:ie.demTex},uDemNext:{value:m.demTex},uDemRes:{value:ql},uElevPrevRange:{value:Zl},uElevNextRange:{value:Ql},uMorph:{value:1},uSatPrev:{value:ie.satTex},uSatNext:{value:m.satTex},uFieldTex0:{value:wa},uFieldTex1:{value:da},uLipariTex:{value:$e},uFrameMix:{value:Wh},uSunDir:{value:Me},uTime:{value:0},uCutawayMix:{value:1},uCutawayPlane:{value:0},uCutawayDir:{value:Xl},uReconMix:{value:0},uObserverMix:{value:0},uModisWeight:{value:1},uViirsWeight:{value:1},uUncertaintyMix:{value:g.current.showUncertainty?1:0},uSensitivity:{value:g.current.sensitivityThreshold},uExtentKm:{value:Jl},uModisPass:{value:ec},uViirsPass:{value:tc},uScanStrip:{value:ac},uLatticeMix:{value:1},uHasSeaCoast:{value:m.hasSeaCoast?1:0},uLakeMix:{value:$u(m)?1:0},uFireHist:{value:At(m).texture},uFireTime:{value:0},uWindDirUv:{value:Pn},uReliefScale:{value:jl},uSlabSize:{value:kn},uAuxTex:{value:m.auxTex??In},uAuxNormals:{value:1},uAuxMix:{value:0},uShadowTex:{value:rc(m)},uUnitsPerMetre:{value:sc},uOrthoTexelKm:{value:m.orthoTexelKm},uSatSharpen:{value:m.sharpen},uDetailTex:{value:Cn},uDetailRect:{value:oc},uDetailMix:{value:0},uDetailTexelKm:{value:m.detailTexelKm},uSmokeShadowTex:{value:Z.shadowTarget.texture},uSunTrue:{value:di},uSunColor:{value:An},uSunTransmittance:{value:Kl},uHazeStrength:{value:Wd},uSkyView:{value:Ro.skyView.texture},uSkyExposure:{value:pr},uEdgeFade:{value:0},uContextDem:{value:null},uContextRes:{value:1024},uContextScale:{value:5},uContextMix:{value:0},uContextOrtho:{value:null},uFloorColor:as.uFloorColor,uFloorHaze:as.uFloorHaze,uSmokeShadowMix:{value:0},uFootTex:{value:ai.texture},uFootMix:{value:_l},uFieldScale:{value:kl},uHeatRange:{value:Fl},uBeliefGrid:{value:fa.grid},uBeliefBox:{value:fa.box},uTileGrid:{value:dn},uTileState:{value:Tl},uTileHover:fn,uScan:{value:Qa},uPixelOutline:{value:0},uBeliefMix:vl,uHeldOut:cn,uHeldOutOther:gl,uBurnedMix:xl,uBurnedBox:{value:wl},uBurnedSize:{value:Ml},uDeclaredGiven:bl,uChanceSquares:yn,uDayJoin:xn,uDayFalse:wn,uMicroDetail:Pl,uRevealArrive:{value:vs},uRevealLine:{value:Il},uAfterglow:bo,uLightGain:ts,uFarView:Tn,uBeliefQuiet:Rn,uLightModis:Dl,uLightTexels:{value:mo},uRevealed:{value:Os},uNight:Ja,uMoonLift:yo},cc=new Et({vertexShader:yu,fragmentShader:Yf,uniforms:z}),mi=new ba(Ln,cc);mi.frustumCulled=!1,G.add(mi);const uc=new Et({vertexShader:yu,fragmentShader:Vf,uniforms:z,colorWrite:!1,polygonOffset:!0,polygonOffsetFactor:1,polygonOffsetUnits:2}),pi=new ba(Ln,uc);pi.frustumCulled=!1,pi.renderOrder=-11,G.add(pi);const vi=new Qf({uSlabSize:z.uSlabSize,uElevNextRange:z.uElevNextRange,uReliefScale:z.uReliefScale,uUnitsPerMetre:z.uUnitsPerMetre,uSunDir:z.uSunDir,uSunTrue:z.uSunTrue,uSunColor:z.uSunColor,uSunTransmittance:z.uSunTransmittance,uHazeStrength:z.uHazeStrength,uSkyView:z.uSkyView,uSkyExposure:z.uSkyExposure,uFloorColor:z.uFloorColor,uFloorHaze:z.uFloorHaze,uContextDem:z.uContextDem,uContextRes:z.uContextRes,uContextScale:z.uContextScale,uContextMix:z.uContextMix,uContextOrtho:z.uContextOrtho,uNight:Ja,uMoonLift:yo});G.add(vi.mesh);let Sa=0;const hc=cu(),Vh={uDemPrev:z.uDemPrev,uDemNext:z.uDemNext,uDemRes:z.uDemRes,uElevPrevRange:z.uElevPrevRange,uElevNextRange:z.uElevNextRange,uReliefScale:z.uReliefScale,uSlabSize:z.uSlabSize,uMorph:z.uMorph,uSunDir:z.uSunDir,uCutawayMix:z.uCutawayMix,uCutawayPlane:z.uCutawayPlane,uCutawayDir:z.uCutawayDir,uEdgeFade:z.uEdgeFade,uContextDem:z.uContextDem,uContextRes:z.uContextRes,uContextScale:z.uContextScale,uContextMix:z.uContextMix,uNight:Ja,uMoonLift:yo},dc=new Et({vertexShader:of,fragmentShader:nf,uniforms:Vh,side:Ls}),Fo=new ba(hc,dc);Fo.frustumCulled=!1,G.add(Fo);const fc=new pa(0,1,0,-1e4),ss=new np(Vu);G.add(ss.group);let mc=!1;const gi=[];let Nn=0;const ve={azimuth:St.azimuth,polar:St.polar,distance:St.distance,target:new W(...St.target)},$={azimuth:St.azimuth,polar:St.polar,distance:St.distance,target:new W(...St.target)},os=new Sf,pc=new Ef;let zn=!1,_a=!1,vc=!1,Un=0,Do=Xo,sa=1;const Je={width:m.frame.width,depth:m.frame.depth},gc=()=>{Je.width=D.lerp(ie.frame.width,m.frame.width,sa),Je.depth=D.lerp(ie.frame.depth,m.frame.depth,sa),kn.set(Je.width,Je.depth)},Yt=n=>(n-.5)*Je.width,$t=n=>(.5-n)*Je.depth,xi=n=>n/Je.width+.5,wi=n=>.5-n/Je.depth,Mt=(n,f)=>{const v=$o(m.alignedDem,m.demGridRes,n,f),u=Is(v,m);if(sa>=.999||ie===m)return u;const T=$o(ie.alignedDem,ie.demGridRes,n,f),y=Is(T,ie);return y+(u-y)*sa},Mi=()=>{z.uDemPrev.value=ie.demTex,z.uDemNext.value=m.demTex,ql.set(ie.demGridRes,m.demGridRes),Zl.set(ie.minElevM,ie.maxElevM),Ql.set(m.minElevM,m.maxElevM),z.uSatPrev.value=ie.satTex,z.uSatNext.value=m.satTex,Jl.set(m.widthKm,m.depthKm),z.uHasSeaCoast.value=m.hasSeaCoast?1:0,z.uLakeMix.value=$u(m)?1:0,Pn.set(m.windDirUv[0],m.windDirUv[1]),z.uFireHist.value=At(m).texture,jl.set(ie.frame.unitsPerMetre[1],m.frame.unitsPerMetre[1]),sc.set(...m.frame.unitsPerMetre),gc(),Me.copy(m.sunDir),Wl(m),pe.position.copy(Me).multiplyScalar(20),z.uShadowTex.value=rc(m),z.uAuxTex.value=m.auxTex??In,z.uAuxNormals.value=m.pack&&m.levelIsWater===!1?0:1,z.uOrthoTexelKm.value=m.orthoTexelKm,z.uSatSharpen.value=m.sharpen,z.uDetailTex.value=m.detailTex??Cn,oc.set(...m.detailRect),z.uDetailTexelKm.value=m.detailTexelKm,m.auxTex||(z.uAuxMix.value=0),m.detailTex||(z.uDetailMix.value=0);const n=m.context;z.uContextDem.value=(n==null?void 0:n.demTexture)??null,z.uContextOrtho.value=(n==null?void 0:n.orthoTexture)??null,z.uContextRes.value=(n==null?void 0:n.gridRes)??1024,z.uContextScale.value=(n==null?void 0:n.scale)??5,vi.setContext(n),n||(Sa=0,z.uContextMix.value=0)},la=new Map,Bn=A.capabilities.maxTextureSize>=8192&&(navigator.deviceMemory??8)>=8&&!B,Yh=()=>{ys||(ys=lc(1023),ko=cu(1023),mi.geometry=ys,pi.geometry=ys,Fo.geometry=ko)},On=(n,f,v)=>{const u=f.manifest.extent_km[0]/f.orthoSize;return{...n,key:`pack-${n.key}`,demTex:f.demTexture,alignedDem:f.alignedDem,levelIsWater:!f.levelInWholeMetres,demGridRes:f.demGridRes,minElevM:f.minElevM,maxElevM:f.maxElevM,satTex:f.orthoTexture,orthoLabel:f.orthoSize>=8192?"Esri 8K":"Esri 4K",demLabel:`${f.demGridRes}²`,orthoTexelKm:u,sharpen:0,shadow:(v==null?void 0:v.shadow)??null,pack:f,lite:n,auxTex:f.auxTexture,detailTex:(v==null?void 0:v.detailTex)??null,detailRect:(v==null?void 0:v.detailRect)??[0,0,1,1],detailTexelKm:(v==null?void 0:v.detailTexelKm)??u,context:(v==null?void 0:v.context)??null,contextState:(v==null?void 0:v.contextState)??"none",attribution:f.attribution||n.attribution}},xc=n=>{var f,v,u,T,y,L;(f=n.pack)==null||f.dispose(),(v=n.detailTex)==null||v.dispose(),(u=n.shadow)==null||u.dispose(),(T=n.context)==null||T.dispose(),n.fireHistory&&n.fireHistory!==((y=n.lite)==null?void 0:y.fireHistory)&&n.fireHistory.texture.dispose(),n.smokeHeight&&n.smokeHeight!==((L=n.lite)==null?void 0:L.smokeHeight)&&(ge.delete(n.smokeHeight),n.smokeHeight.dispose()),n.fireHistory=null,n.smokeHeight=null,n.detectionSource=null,n.context=null,n.pack=null,n.detailTex=null,n.shadow=null},Hn=n=>{for(const[f,v]of la)f===n||v===ie||v===m||(xc(v),la.delete(f))},$h=n=>{if(n.pack||!n.packManifest)return n;const f=la.get(n.regionId);if(!(f!=null&&f.pack))return n;if(f.lite===n)return f;const v=On(n,f.pack,f);return v.packIsLite=f.packIsLite,v.contextLite=f.contextLite,la.set(n.regionId,v),at(f),v},wc=n=>{var T;const f=n.pack,v=(T=f==null?void 0:f.manifest.ortho_detail)==null?void 0:T[0];if(!f||!v||!Bn||v.size>A.capabilities.maxTextureSize)return;const u=v.uv_rect;!Array.isArray(u)||u.length!==4||!(u[2]>u[0])||!(u[3]>u[1])||Rh(Na(g.current,v.url),P).then(y=>{if(!y)return;const L=la.get(n.regionId);if(S||!L||L.pack!==f){y.dispose();return}L.detailTex=y,L.detailRect=[u[0],u[1],u[2],u[3]],L.detailTexelKm=f.manifest.extent_km[0]*(u[2]-u[0])/v.size,m===L&&Mi()})},Mc=n=>{const f=n.pack,v=bu(f==null?void 0:f.manifest.context);!f||!v||n.contextState!=="none"||n.context&&(!n.contextLite||n.packIsLite)||(n.contextState="loading",jf(v,{resolveUrl:u=>Na(g.current,u),maxTextureSize:A.capabilities.maxTextureSize,maxAnisotropy:P,isCancelled:()=>S}).then(u=>{const T=la.get(n.regionId);if(S||!T||T.pack!==f){u==null||u.dispose();return}T.contextState=u?"none":"failed",u&&(T.context&&T.context!==u&&T.context.dispose(),T.context=u,T.contextLite=!!T.packIsLite,m===T&&Mi())}))},jh=n=>{const f=n.packManifest;if(!f||n.pack||n.packState!=="none")return;const v=Ga?Lu(f):null;n.packState="loading",vu(v??f,{resolveUrl:u=>Na(g.current,u),maxTextureSize:Bn?A.capabilities.maxTextureSize:4096,maxAnisotropy:P,isCancelled:()=>S}).then(u=>{if(S){u==null||u.dispose();return}if(!u){n.packState="failed";return}if(n.packState="none",m!==n){u.dispose();return}Hn(n.regionId);const T=On(n,u,null);T.packIsLite=v!==null,la.set(n.regionId,T),Po(T,!0),Do=.62,T.packIsLite||wc(T),Mc(T)})},Xh=n=>{S||!n.packIsLite||n.packUpgrade||!n.packManifest||!n.pack||la.get(n.regionId)===n&&(n.packUpgrade="loading",vu(n.packManifest,{resolveUrl:f=>Na(g.current,f),maxTextureSize:Bn?A.capabilities.maxTextureSize:4096,maxAnisotropy:P,isCancelled:()=>S}).then(f=>{if(S){f==null||f.dispose();return}if(!f){n.packUpgrade="failed";return}if(la.get(n.regionId)!==n||m!==n){f.dispose(),n.packUpgrade=void 0;return}const v=On(n.lite??n,f,null);v.packIsLite=!1,v.context=n.context,v.contextLite=!!n.context,v.contextState="none",n.context=null,la.set(v.regionId,v),Po(v,!0),Do=.62,wc(v),Mc(v),window.setTimeout(()=>{var u,T;n===ie||n===m||((u=n.pack)==null||u.dispose(),(T=n.shadow)==null||T.dispose(),n.pack=null,n.shadow=null)},2500)}))},Po=(n,f)=>{if(S)return;const v=$h(n);if(v===m&&f)return;v.demGridRes>=1024&&Yh();const u=m.regionId!==v.regionId;vc=u,f?(ie=sa<.5?ie:m,m=v,_a=!0,Un=0,Do=Xo,sa=0,z.uMorph.value=0):(ie=v,m=v,_a=!1,sa=1,z.uMorph.value=1,Hn(v.regionId),aa()),u&&f&&(z.uAuxMix.value=0),Mi(),xo=null,p(Ur(v)),Ts=!0,v.pack?v.packIsLite&&Yn(()=>Xh(v)):jh(v)},yc=n=>{S||m.regionId===n.regionId&&(Po(n,!0),Do=.62)},bc=new WeakMap,qh=(n,f)=>{var st,bt;let v=bc.get(n);v||bc.set(n,v=new Map);const u=v.get(f);if(u!==void 0)return u;if(v.set(f,null),n.observerDataset.dataSource!=="firms")return null;const[T,y,L,Q]=n.bbox,q=Date.parse(((bt=(st=n.observerDataset.frames[f])==null?void 0:st[0])==null?void 0:bt.timeUtc)??""),oe=[],se=[];for(const fe of n.observerDataset.frames)for(const Re of fe){if(Re.hidden||Re.revealed)continue;const Ve=Date.parse(Re.timeUtc??""),xe=Number.isFinite(q)&&Number.isFinite(Ve)&&Math.abs(Ve-q)<=xv;for(const ye of Re.footprints){const Te=(ye.lon-T)/Math.max(1e-9,L-T),_e=(ye.lat-y)/Math.max(1e-9,Q-y),jt=Math.max(1,ye.frpMw);oe.push(Te,_e,jt),xe&&se.push(Te,_e,jt)}}const Se=fe=>{let Re=0,Ve=0,xe=0;for(let ye=0;ye<fe.length;ye+=3)Re+=fe[ye]*fe[ye+2],Ve+=fe[ye+1]*fe[ye+2],xe+=fe[ye+2];return xe>0?[Re/xe,Ve/xe]:null},he=(fe,Re,Ve)=>Math.hypot((fe[Re]-Ve[0])*n.widthKm,(fe[Re+1]-Ve[1])*n.depthKm),ne=(fe,Re)=>{let Ve=0,xe=0;for(let ye=0;ye<fe.length;ye+=3)xe+=fe[ye+2],he(fe,ye,Re)<wv&&(Ve+=fe[ye+2]);return xe>0?Ve/xe:0};let ee=Se(oe);if(!ee)return null;let le=oe;const de=Se(se);de&&ne(se,ee)<.1&&ne(se,de)>=.3&&(ee=de,le=se);let ze=1/0;for(let fe=0;fe<le.length;fe+=3)ze=Math.min(ze,he(le,fe,ee));if(ze>mv){const fe=Math.max(1,Math.ceil(n.widthKm/Ju)),Re=Math.max(1,Math.ceil(n.depthKm/Ju)),Ve=Wo(new Float32Array(le),fe,Re),xe=new Float64Array(Ve.sizes.length),ye=new Float64Array(Ve.sizes.length*2);for(let _e=0;_e<Ve.patchOf.length;_e++){const jt=Ve.patchOf[_e],Lt=le[_e*3+2];xe[jt]+=Lt,ye[jt*2]+=Lt*le[_e*3],ye[jt*2+1]+=Lt*le[_e*3+1]}let Te=0;for(let _e=1;_e<xe.length;_e++)xe[_e]>xe[Te]&&(Te=_e);xe[Te]>0&&(ee=[ye[Te*2]/xe[Te],ye[Te*2+1]/xe[Te]])}return v.set(f,ee),ee};let yi=1;const Oa=(n,f,v,u)=>{var $a;const T=!!g.current.tileBoard,y=du(n,f,v,u,T);if(f&&T&&n==="region"&&yi>1)return{...y,distance:y.distance*yi};if(!f||n!=="canyon"&&n!=="ridge")return y;const L=n==="canyon"?"subpixel":"front",Q=m.findings.find(je=>je.kind===L),q=m.observerDataset.frames.length,oe=Math.min(q-1,Math.max(0,Math.round(D.clamp(g.current.timeProgress,0,1)*(q-1)))),se=qh(m,oe);if(!Q&&!se)return y;const[Se,he,ne,ee]=m.bbox;let le=se?D.clamp(se[0],.1,.9):D.clamp((Q.lon-Se)/Math.max(1e-4,ne-Se),.2,.8),de=se?D.clamp(se[1],.1,.9):D.clamp((Q.lat-he)/Math.max(1e-4,ee-he),.2,.8);const ze=n==="canyon"?($a=m.declared)==null?void 0:$a.byFrame.get(oe):void 0;let st=null,bt=null;if(ze&&ze.length>0&&m.declared)st=m.declared,bt=ze;else if(n==="canyon"&&To==="estimate"&&mt.length>0&&m.runId){const je=pl.get(m.runId);if(je){const{nx:Ge,ny:ue}=je.info,Xe=new Set;for(let Dt=0;Dt<mt.length;Dt+=3){const lt=Math.min(Ge-1,Math.max(0,Math.floor(mt[Dt]*Ge))),re=Math.min(ue-1,Math.max(0,Math.floor((1-mt[Dt+1])*ue)));Xe.add(re*Ge+lt)}st={nx:Ge,ny:ue},bt=Uint32Array.from(Xe)}}let fe=null,Re=null;if(st&&bt&&bt.length>0){const je=bt,{nx:Ge,ny:ue}=st,Xe=new Float32Array(je.length*3);je.forEach((Oe,Fe)=>{Xe[Fe*3]=(Oe%Ge+.5)/Ge,Xe[Fe*3+1]=1-(Math.floor(Oe/Ge)+.5)/ue,Xe[Fe*3+2]=1});const Dt=Wo(Xe,Ge,ue);let lt=0;for(let Oe=0;lt<Dt.sizes.length&&Oe<th*je.length;lt++)Oe+=Dt.sizes[lt];let re=1,ke=0,Pe=1,qe=0;fe=[],Re=[];for(let Oe=0;Oe<je.length;Oe++){const Fe=je[Oe],Ue=Fe%Ge/Ge,Nt=1-Math.floor(Fe/Ge)/ue,Kt=Ue+1/Ge,Ze=Nt-1/ue;Re.push(Ue,Ze,Kt,Ze,Ue,Nt,Kt,Nt),!(Dt.patchOf[Oe]>=lt)&&(re=Math.min(re,Ue),ke=Math.max(ke,Kt),Pe=Math.min(Pe,Ze),qe=Math.max(qe,Nt),fe.push(Ue,Ze,Kt,Ze,Ue,Nt,Kt,Nt))}le=D.clamp((re+ke)/2,.05,.95),de=D.clamp((Pe+qe)/2,.05,.95)}const Ve=Yt(le),xe=$t(de),ye=Math.hypot(Ve,xe),Te=Math.atan2(-Ve,-xe),_e=D.smoothstep(ye,.8,3.2),jt=Math.atan2(m.sunDir.x,m.sunDir.z);let Lt=y.azimuth,Ya=-1e9;for(let je=0;je<72;je++){const Ge=je/72*Math.PI*2-Math.PI;let ue=Ge-Hu;for(;ue>Math.PI/2;)ue-=Math.PI;for(;ue<-Math.PI/2;)ue+=Math.PI;if(Math.abs(ue)>Ip)continue;let Xe=Math.abs(Ge-jt)%(Math.PI*2);Xe>Math.PI&&(Xe=Math.PI*2-Xe);const lt=1-Math.min(1,Math.abs(Xe-Yi)/Yi)+.9*_e*Math.cos(Ge-Te)+.2*Math.cos(Ge-y.azimuth);lt>Ya&&(Ya=lt,Lt=Ge)}let ot=[Ve,Mt(le,de)+.1,xe],Pa=y.distance,Xt=y.polar;if(fe&&Re){const je=ot,Ge=Xe=>{let Dt={target:je,distance:y.distance,polar:y.polar};for(const lt of[y.polar,...ah].filter(re=>re<=y.polar)){let re=je,ke={distance:y.distance,fits:!1};for(let Pe=0;Pe<3&&(ke=Ec(Xe,re,Lt,lt),Pe!==2);Pe++)re=Tc(Xe,re,Lt,lt,ke.distance);if(Dt={target:re,distance:ke.distance,polar:lt},ke.fits)break}return Dt};let ue=Ge(fe);Re.length>fe.length&&Jh(Re,ue.target,Lt,ue.polar,ue.distance)&&(ue=Ge(Re)),ot=ue.target,Pa=ue.distance,Xt=ue.polar}const oa=n==="canyon"?Zh(m,oe):null;if(oa&&oa.length>0){const je=sh/Math.max(.001,m.widthKm),Ge=sh/Math.max(.001,m.depthKm),ue=Math.max(1,Math.round(1/je)),Xe=Math.max(1,Math.round(1/Ge)),Dt=new Float32Array(oa.length/2*3);for(let Fe=0,Ue=0;Fe<oa.length;Fe+=2,Ue+=3)Dt[Ue]=oa[Fe],Dt[Ue+1]=oa[Fe+1],Dt[Ue+2]=1;const lt=Wo(Dt,ue,Xe);let re=0;const ke=oa.length/2;for(let Fe=0;re<lt.sizes.length&&Fe<th*ke;re++)Fe+=lt.sizes[re];const Pe=fe?[...fe]:[],qe=[];for(let Fe=0;Fe<ke;Fe++){if(lt.patchOf[Fe]>=re)continue;const Ue=oa[Fe*2]-je/2,Nt=oa[Fe*2+1]-Ge/2;Pe.push(Ue,Nt,Ue+je,Nt,Ue,Nt+Ge,Ue+je,Nt+Ge),qe.push(oa[Fe*2],oa[Fe*2+1])}if(Qh(Pe,ot,Lt,Xt,Pa*Hr)||Sc(qe,ot,Lt,Xt,Pa)>oh){const Fe=ot;let Ue=null;for(const Nt of[Xt,...ah].filter(Kt=>Kt<=Xt)){let Kt=Fe,Ze={distance:Pa,fits:!1};for(let qt=0;qt<3&&(Ze=Ec(Pe,Kt,Lt,Nt),qt!==2);qt++)Kt=Tc(Pe,Kt,Lt,Nt,Ze.distance);const ja=Sc(qe,Kt,Lt,Nt,Ze.distance),rs={target:Kt,distance:Ze.distance,polar:Nt,fits:Ze.fits,hidden:ja};if(Ze.fits&&ja<=oh){Ue=rs;break}(!Ue||rs.fits&&(!Ue.fits||ja<Ue.hidden))&&(Ue=rs)}Ue&&(ot=Ue.target,Pa=Ue.distance,Xt=Ue.polar)}}return{...y,azimuth:Lt,polar:Xt,distance:Pa,target:ot}},Zh=(n,f)=>{if(n.observerDataset.dataSource!=="firms")return null;const[v,u,T,y]=n.bbox,L=[];for(const Q of n.observerDataset.frames[f]??[])if(!(!Q.revealed||Q.revealedByLook))for(const q of Q.footprints)L.push((q.lon-v)/Math.max(1e-9,T-v),(q.lat-u)/Math.max(1e-9,y-u));return L.length>0?L:null},Qh=(n,f,v,u,T)=>{const y=Yo(g.current.workspaceSubjectFrame)??{left:0,top:0,right:1,bottom:1},L=Math.tan(D.degToRad(Wr/2)),Q=(y.right-y.left)*L*_.aspect,q=(y.bottom-y.top)*L,oe=new W().setFromSphericalCoords(1,u,v),se=oe.clone().negate(),Se=new W().crossVectors(se,new W(0,1,0)).normalize(),he=new W().crossVectors(Se,se),ne=new W(f[0],f[1],f[2]).addScaledVector(oe,T),ee=new W;for(let le=0;le<n.length;le+=2){ee.set(Yt(n[le]),Mt(n[le],n[le+1]),$t(n[le+1])).sub(ne);const de=ee.dot(se);if(de<=.05||Math.abs(ee.dot(Se)/de)>Q||Math.abs(ee.dot(he)/de)>q)return!0}return!1},Sc=(n,f,v,u,T)=>{if(n.length===0)return 0;const y=new W().setFromSphericalCoords(1,u,v),L=f[0]+y.x*T,Q=f[1]+y.y*T,q=f[2]+y.z*T;let oe=0;for(let se=0;se<n.length;se+=2){const Se=n[se],he=n[se+1],ne=Yt(Se),ee=Mt(Se,he),le=$t(he);for(let de=1;de<32;de++){const ze=de/32,st=xi(L+(ne-L)*ze),bt=wi(q+(le-q)*ze);if(!(st<0||st>1||bt<0||bt>1)&&Mt(st,bt)>Q+(ee-Q)*ze+.012){oe+=1;break}}}return oe/(n.length/2)},Jh=(n,f,v,u,T)=>{const y=Yo(g.current.workspaceSubjectFrame)??{top:0,bottom:1},L=(y.bottom-y.top)*Math.tan(D.degToRad(Wr/2)),Q=new W().setFromSphericalCoords(1,u,v),q=Q.clone().negate(),oe=new W().crossVectors(q,new W(0,1,0)).normalize(),se=new W().crossVectors(oe,q),Se=new W(f[0],f[1],f[2]).addScaledVector(Q,T),he=new W;for(let ne=0;ne<n.length;ne+=2){he.set(Yt(n[ne]),Mt(n[ne],n[ne+1]),$t(n[ne+1])).sub(Se);const ee=he.dot(q);if(ee>.05&&he.dot(se)/ee<-L)return!0}return!1},Tc=(n,f,v,u,T)=>{const y=new W().setFromSphericalCoords(1,u,v),L=y.clone().negate(),Q=new W().crossVectors(L,new W(0,1,0)).normalize(),q=new W().crossVectors(Q,L),oe=new W(f[0],f[1],f[2]).addScaledVector(y,T);let se=1/0,Se=-1/0,he=1/0,ne=-1/0;const ee=new W;for(let fe=0;fe<n.length;fe+=2){ee.set(Yt(n[fe]),Mt(n[fe],n[fe+1]),$t(n[fe+1])).sub(oe);const Re=ee.dot(L);if(Re<=.05)continue;const Ve=ee.dot(Q)/Re,xe=ee.dot(q)/Re;se=Math.min(se,Ve),Se=Math.max(Se,Ve),he=Math.min(he,xe),ne=Math.max(ne,xe)}if(!Number.isFinite(se))return f;const le=L.clone().addScaledVector(Q,(se+Se)/2).addScaledVector(q,(he+ne)/2);if(le.y>=-1e-4)return f;const de=(f[1]-oe.y)/le.y,ze=oe.clone().addScaledVector(le,de),st=D.clamp(ze.x/Je.width+.5,.05,.95),bt=D.clamp(.5-ze.z/Je.depth,.05,.95);return[Yt(st),Mt(st,bt)+.1,$t(bt)]},Ec=(n,f,v,u)=>{const T=Yo(g.current.workspaceSubjectFrame)??{left:0,top:0,right:1,bottom:1},y=Math.tan(D.degToRad(Wr/2)),L=(T.right-T.left)*y*_.aspect*eh,Q=(T.bottom-T.top)*y*eh,q=[];for(let de=0;de<n.length;de+=2)q.push(Yt(n[de]),Mt(n[de],n[de+1]),$t(n[de+1]));const oe=new W().setFromSphericalCoords(1,u,v),se=oe.clone().negate(),Se=new W().crossVectors(se,new W(0,1,0)).normalize(),he=new W().crossVectors(Se,se),ne=de=>{const ze=f[0]+oe.x*de,st=f[1]+oe.y*de,bt=f[2]+oe.z*de;for(let fe=0;fe<q.length;fe+=3){const Re=q[fe]-ze,Ve=q[fe+1]-st,xe=q[fe+2]-bt,ye=Re*se.x+Ve*se.y+xe*se.z;if(ye<=.05||Math.abs((Re*Se.x+Ve*Se.y+xe*Se.z)/ye)>L||Math.abs((Re*he.x+Ve*he.y+xe*he.z)/ye)>Q)return!1}return!0};if(ne(Gr))return{distance:Gr,fits:!0};if(!ne(Kr))return{distance:Kr,fits:!1};let ee=Gr,le=Kr;for(let de=0;de<22;de++){const ze=(ee+le)/2;ne(ze)?le=ze:ee=ze}return{distance:le,fits:!0}},ed=n=>{var lt;const f=m,[v,u,T,y]=f.bbox,L=f.findings.find(re=>re.kind==="front")??f.findings.find(re=>re.kind==="subpixel")??f.findings[0];let Q=.5,q=.5;L&&(Q=D.clamp((L.lon-v)/Math.max(1e-4,T-v),.25,.75),q=D.clamp((L.lat-u)/Math.max(1e-4,y-u),.25,.75));const oe=f.observerDataset.dataSource==="firms";if(oe){const re=Math.min(f.frameCount-1,Math.max(0,Math.round(D.clamp(n,0,1)*(f.frameCount-1))));let ke=0,Pe=0,qe=0;for(const Oe of f.observerDataset.frames[re]??[])if(!Oe.hidden)for(const Fe of Oe.footprints)ke+=Fe.frpMw,Pe+=Fe.frpMw*(Fe.lon-v)/Math.max(1e-4,T-v),qe+=Fe.frpMw*(Fe.lat-u)/Math.max(1e-4,y-u);ke>0&&(Q=D.clamp(Pe/ke,.15,.85),q=D.clamp(qe/ke,.15,.85))}const se=f.frame.width,Se=f.frame.depth,he=se*.5,ne=Se*.5,ee=(re,ke)=>Is($o(f.alignedDem,f.demGridRes,re/se+.5,.5-ke/Se),f),le=bu((lt=f.packManifest)==null?void 0:lt.context)!==null&&f.contextState!=="failed",de=(Q-.5)*se,ze=(.5-q)*Se,st=ee(de,ze)+.05,bt=Math.min(f.frameCount-1,Math.max(0,Math.round(D.clamp(n,0,1)*(f.frameCount-1)))),fe=bt*Ke*Ke*4,Re=[],Ve=(re,ke,Pe)=>{Re.push(re,ee(re,ke)+.03,ke,(ee(re-.1,ke)-ee(re+.1,ke))/.2,(ee(re,ke-.1)-ee(re,ke+.1))/.2,Pe)};if(f.observerDataset.dataSource==="firms"){const re=[];for(const qe of f.observerDataset.frames[bt]??[])if(!qe.hidden)for(const Oe of qe.footprints)re.push(Oe);const ke=Math.max(1,Math.ceil(re.length/320)),Pe=f.frame.unitsPerMetre[0]*f.frame.unitsPerMetre[2]*1e6;for(let qe=0;qe<re.length;qe+=ke){const Oe=re[qe],Fe=((Oe.lon-v)/Math.max(1e-4,T-v)-.5)*se,Ue=(.5-(Oe.lat-u)/Math.max(1e-4,y-u))*Se;Math.abs(Fe)>he||Math.abs(Ue)>ne||Ve(Fe,Ue,Oe.acrossTrackKm*Oe.alongTrackKm*Pe*ke)}}else{const re=3*se/(Ke-1)*(3*Se/(Ke-1));for(let ke=2;ke<Ke-2;ke+=3)for(let Pe=2;Pe<Ke-2;Pe+=3)f.tensor[fe+(ke*Ke+Pe)*4]/255<=Jo||Ve((Pe/(Ke-1)-.5)*se,(.5-ke/(Ke-1))*Se,re)}const xe=Re.length/6,ye=Math.tan(Wi*Math.PI/360),Te=4*ye*ye*1.6,_e=2*Math.atan(ye*(16/9))/1920,jt=Math.min(zp,f.orthoTexelKm*1e3*f.frame.unitsPerMetre[0]/(Np*_e)),Lt=ee(de-.12,ze)-ee(de+.12,ze),Ya=ee(de,ze-.12)-ee(de,ze+.12),ot=Math.hypot(Lt,Ya)||1,Pa=Math.atan2(f.sunDir.x,f.sunDir.z),Xt=Math.hypot(f.windDirUv[0]*se,f.windDirUv[1]*Se)||1,oa=f.windDirUv[0]*se/Xt,$a=-f.windDirUv[1]*Se/Xt,je=Math.atan(Math.tan(Wi*Math.PI/360)*(16/9))+Vi;let Ge={...St,target:[de,st,ze]},ue=-1e9;const Xe={floorShare:1,seaShare:0,ridgeLines:0,ridgeLinesMost:0,fireShare:0,fireFrameShare:0,carryDistance:0,skylineDeg:0,eyeAboveGroundM:0,nearGround:0},Dt=f.frame.unitsPerMetre[1];for(const re of Cp)for(let ke=0;ke<48;ke++){const Pe=ke/48*Math.PI*2-Math.PI,qe=de+re*Math.sin(Pe),Oe=ze+re*Math.cos(Pe);if(he-Math.abs(qe)<.35||ne-Math.abs(Oe)<.35)continue;let Fe=ee(qe,Oe);for(const qt of[-1,1]){const Pt=Pe+qt*Vi;Fe=Math.max(Fe,ee(de+re*Math.sin(Pt),ze+re*Math.cos(Pt)))}let Ue=Math.abs(Pe-Pa)%(Math.PI*2);Ue>Math.PI&&(Ue=Math.PI*2-Ue);const Nt=1-Math.min(1,Math.abs(Ue-Yi)/Yi),Kt=Math.sin(Pe)*oa+Math.cos(Pe)*$a,Ze=Math.max(0,Kt),ja=le?.45*Math.max(0,-Kt)+(oe?.16:-.12)*re:0,rs=(Lt*Math.sin(Pe)+Ya*Math.cos(Pe))/ot;for(let qt=0;qt<La;qt++){const Pt=-je+2*je*qt/(La-1),Ia=Pe+Math.PI-Pt,ks=Math.sin(Ia),Ws=Math.cos(Ia);let Ea=0;for(;Ea<Qs;Ea++){const ca=.3+Ea*Ir,ls=qe+ks*ca,Xa=Oe+Ws*ca;if(Math.abs(ls)>he||Math.abs(Xa)>ne)break;Si[qt*Qs+Ea]=ee(ls,Xa)}Wn[qt]=Ea}for(const qt of Lp){const Pt=Fe+qt*Dt;let Ia=1e6;for(let I=1;I<10;I++){const O=I/10;Ia=Math.min(Ia,Pt+(st-Pt)*O-ee(qe+(de-qe)*O,Oe+(ze-Oe)*O))}if(Ia<.03)continue;let ks=0,Ws=0,Ea=0,ca=-1e6,ls=0,Xa=0,No=0;for(let I=0;I<La;I++){const O=-je+2*je*I/(La-1),H=Wn[I];let K=-1e6,X=0,te=0;for(let Ee=0;Ee<H;Ee++){const V=.3+Ee*Ir,N=(Si[I*Qs+Ee]-Pt)/V;N>K?(X>=2&&V>re&&te++,K=N,X=0):N<K-.004&&X++}if(K<0){const Ee=H>0?Si[I*Qs+H-1]:1;le||f.hasSeaCoast&&Ee<.004?Ws++:ks++}Ea+=Math.max(K,-.2),ca=Math.max(ca,K),Math.abs(O)<je*.55&&(ls+=te,Xa=Math.max(Xa,te),No++)}const Vs=ca-.59*2*ye;let cs=1e6;for(let I=0;I<La;I++){const O=Wn[I];for(let H=0;H<O;H++){const K=.3+H*Ir;if(K>=cs)break;const X=Si[I*Qs+H];if(X>.004&&(X-Pt)/K>Vs){cs=K;break}}}const Ui=ca-(st-Pt)/re;let zo=0,Uo=0,Ys=0;const Bi=ca-Bp*(ca-Vs);for(let I=0;I<xe;I++){const O=Re[I*6],H=Re[I*6+1],K=Re[I*6+2],X=Math.hypot(O-qe,K-Oe);if(X<.5)continue;let te=Math.atan2(O-qe,K-Oe)-(Pe+Math.PI);if(te-=Math.round(te/(Math.PI*2))*Math.PI*2,Math.abs(te)>je*.8)continue;const Ee=(H-Pt)/X;if(Ee<Bi&&Uo++,Ee<Vs||Ee>ca)continue;let V=!0;for(let N=1;N<8&&V;N++){const j=N/8;Pt+(H-Pt)*j<ee(qe+(O-qe)*j,Oe+(K-Oe)*j)-.01&&(V=!1)}if(V){zo++;const N=Re[I*6+3],j=Re[I*6+4],J=qe-O,Ie=Pt-H,tt=Oe-K,pt=J*J+Ie*Ie+tt*tt,it=Math.max(0,(N*J+Ie+j*tt)/(Math.hypot(N,1,j)*Math.sqrt(pt)));Ys+=Re[I*6+5]*Math.hypot(N,1,j)*it/(pt*Te)}}const $s=xe>0?zo/xe:0,Bo=ks/La,Oo=Ws/La,js=ls/Math.max(1,No),Ho=Ea/La,F=-9*Bo-(ks>0?3:0)-.6*Oo+1.1*Math.min(js,2)+.3*Math.min(Math.max(js-2,0),1)+.8*Nt+.5*D.clamp(rs*2,-1,1)+(oe?4*$s:2.4*Math.min($s,.5))+2.5*Math.min(1,Ys/Up)-(oe&&xe>0?7*Uo/xe:0)-.5*Ze+ja-(cs<jt?5+4*(1-cs/jt):0)-8*Math.max(0,Ui-.2)-4*Math.max(0,.04-Ho);if(F>ue){ue=F;const I=Math.hypot(re,Pt-st);Ge={azimuth:Pe,polar:Math.acos(D.clamp((Pt-st)/I,-1,1)),distance:I,target:[de,st,ze]},Xe.floorShare=Bo,Xe.seaShare=Oo,Xe.ridgeLines=js,Xe.ridgeLinesMost=Xa,Xe.fireShare=$s,Xe.fireFrameShare=Ys,Xe.carryDistance=jt,Xe.skylineDeg=Math.atan(Ho)*180/Math.PI,Xe.eyeAboveGroundM=qt,Xe.nearGround=cs}}}return bi=Xe,Ge};let Ha=null,Rc="",Gn=!1;const td=(n,f)=>{const v=Math.min(32,Math.max(1,Math.round(f))),u=[];_.updateMatrixWorld();for(let T=0;T<=v;T++)for(let y=0;y<=v;y++){const L=y/v,Q=1-T/v,q=Is($o(n.alignedDem,n.demGridRes,L,Q),n);Io.set((L-.5)*Je.width,q,(.5-Q)*Je.depth).project(_),u.push(Io.z>1||Io.z<-1?null:[(Io.x*.5+.5)*rt,(.5-Io.y*.5)*ut])}return{divisions:v,points:u}},Io=new W,Kn=n=>n.landingFrame===void 0?n.landingFrame=Gv(n.observerDataset,n.bbox,n.widthKm,n.depthKm):n.landingFrame,Ac=()=>{const n=m.contextState==="failed"?`${m.key}!`:m.key;if(!Ha||Rc!==n){const f=Kn(m);Ha=ed(f!==null?f/Math.max(1,m.frameCount-1):g.current.timeProgress),Rc=n,As=Ps}return Ha};let bi={floorShare:1,seaShare:0,ridgeLines:0,ridgeLinesMost:0,fireShare:0,fireFrameShare:0,carryDistance:0,skylineDeg:0,eyeAboveGroundM:0,nearGround:0};const Si=new Float32Array(La*Qs),Wn=new Int32Array(La),_c=(n,f,v)=>{const u=n.context;if(!u)return 0;const T=n.frame,[y,L,Q]=T.unitsPerMetre,q=Math.hypot(Math.max(Math.abs(f)-T.width*.5,0)/(y*1e3),Math.max(Math.abs(v)-T.depth*.5,0)/(Q*1e3)),oe=.25*(T.width/y+T.depth/Q)*.001;return(Jf(u,f/(T.width*u.scale)+.5,.5-v/(T.depth*u.scale))-n.minElevM-Xf(q,oe)*1e3)*L},bs=new Float32Array((Js*Js+eo*eo)*3),ad=()=>{let n=0;for(let v=0;v<Js;v++){const u=v/(Js-1);for(let T=0;T<Js;T++){const y=T/(Js-1);bs[n*3]=Yt(y),bs[n*3+1]=Mt(y,u),bs[n*3+2]=$t(u),n++}}const f=m.context;if(f&&Sa>.5){const v=m.frame;for(let u=0;u<eo;u++){const T=u/(eo-1);for(let y=0;y<eo;y++){const Q=(y/(eo-1)-.5)*v.width*f.scale,q=(.5-T)*v.depth*f.scale;Math.abs(Q)<=v.width*.5&&Math.abs(q)<=v.depth*.5||(bs[n*3]=Q,bs[n*3+1]=_c(m,Q,q),bs[n*3+2]=q,n++)}}}return n};let Ta=!1;const kc=ju();let ea=null,Fc="",Dc=null,Ga=!0,Vn=0,Co=-1,Pc=null,Ti=0,Ic=-1,Cc=0;fd();const Lc=[],Yn=n=>{Ga?Lc.push(n):n()},sd=(n,f,v)=>{if(S)return;const u=new Set([...ce.values(),...la.values(),ie,m]);for(const T of u)T.runId===n&&(T.tensor=f,T.frameCount=v,T.fireHistory=null);xo=null};let $n=!1,Ei=0,Ka=0,Ss=!0,yt=null,Gt=null,Gs=0,Wa=null,Ts=!1,Nc=!1,zc=!1;const jn=n=>{ve.azimuth=n.azimuth,ve.polar=n.polar,ve.distance=n.distance,ve.target.set(n.target[0],n.target[1],n.target[2])},od=n=>{const f=g.current,v=ce.get(n);v&&v!==m&&Po(v,!0);const u=Oa(f.cameraPreset,f.inWorkspace,f.mode,n);os.trigger($,u,2.15,Xo),Ta=!1,Ts=!1},id=()=>{const n=g.current;os.cancel(),!n.inWorkspace&&n.landingView!=="slab"?(Ac(),ve.azimuth=$.azimuth,ve.polar=$.polar,ve.distance=$.distance,ve.target.copy($.target)):jn(Oa(n.cameraPreset,n.inWorkspace,n.mode,n.activeTheaterId)),Ta=!1,Ts=!1},nd=n=>{if(n&&!zn)os.cancel(),pc.startAtTheater(g.current.activeTheaterId);else if(!n&&zn){const f=new W(0,.65,0);_.getWorldDirection(f),f.multiplyScalar(10.5).add(_.position),Rf(_.position,f,$),ve.azimuth=$.azimuth,ve.polar=$.polar,ve.distance=$.distance,ve.target.copy($.target),_.up.set(0,1,0)}zn=n};R.current={activateBundle:Po,upgradeBundleInPlace:yc,bundleCache:ce,takeRunBundle:na,storeRunBundle:ha,onScreenRegionId:()=>m.regionId,maxAnisotropy:P,texLoader:U,triggerSlew:od,applyCameraPreset:id,syncCinemaStart:nd,whenPictureReady:Yn,patchRunTensor:sd},Yn(()=>void(async()=>{var n;if((((n=ce.get("plumas_ca"))==null?void 0:n.runId)??null)===null)try{const f=await fetch(lh("generated/terrain/ca_dem_f32.bin")).catch(()=>null),v=new Promise(he=>{U.load(lh("generated/terrain/ca_satellite.jpg"),ne=>{ne.colorSpace=ht,ne.anisotropy=P,ne.wrapS=We,ne.wrapT=We,he(ne)},void 0,()=>he(null))}),[u,T]=await Promise.all([f&&f.ok?f.arrayBuffer():Promise.resolve(null),v]);if(S)return;const y=ce.get("plumas_ca");if(!y||y.runId!==null)return;const L=jo.plumas_ca,Q=u?Cs(new Float32Array(u),!0):{texture:y.demTex,aligned:y.alignedDem,gridRes:y.demGridRes,minElev:y.minElevM,maxElev:y.maxElevM},q={buffer:Nr(),frames:oo},oe=zr(),se=jr("plumas_ca",L.bbox,Q.aligned,Q.gridRes,q.buffer,q.frames),Se={...y,...$r(L.widthKm,Cr(L.bbox),null,1024,T?ch:""),fireHistory:null,key:"static-plumas_ca",noRealGround:u?void 0:y.noRealGround,noRealPicture:T?void 0:y.noRealPicture,demTex:Q.texture,alignedDem:Q.aligned,demGridRes:Q.gridRes,minElevM:Q.minElev,maxElevM:Q.maxElev,satTex:T??y.satTex,orthoLabel:"1K",demLabel:`${Q.gridRes}²`,tensor:q.buffer,frameCount:q.frames,observerDataset:oe,findings:se.anchors,callouts:se.callouts};_t("plumas_ca",Se),yc(Se)}catch{}})());let rt=Math.max(1,x.clientWidth),ut=Math.max(1,x.clientHeight),Ri=1;const Xn=()=>{x&&(rt=Math.max(1,x.clientWidth),ut=Math.max(1,x.clientHeight),C=Cu(),Y.setSize(rt,ut,C*Ri),_.aspect=rt/ut)};Xn();const rd=new H0,ld=n=>{const f=rd.feed(n,document.hidden);f!==null&&(Ri=f,Y.setSize(rt,ut,C*Ri))},Uc=new ResizeObserver(Xn);Uc.observe(x);let is=null;const qn=()=>{Xn(),Bc()},Bc=()=>{is==null||is.removeEventListener("change",qn),is=window.matchMedia(`(resolution: ${window.devicePixelRatio||1}dppx)`),is.addEventListener("change",qn)};Bc();let ka=!1,Oc=0,Zn=0,Qn=0,Ai=0,_i=Number.NaN,Jn=Number.NaN,Hc=!1;const ki=new W,er=new Ld,Gc=new Le,Kc=(n,f,v,u)=>{const T=A.domElement.getBoundingClientRect();if(T.width<=0||T.height<=0||n<T.left||n>T.right||f<T.top||f>T.bottom)return null;Gc.set((n-T.left)/T.width*2-1,-((f-T.top)/T.height)*2+1),er.setFromCamera(Gc,_);const y=er.ray.origin,L=er.ray.direction,Q=Math.max(.02,Je.width/400);for(let q=0;q<Je.width*6;q+=Q){const oe=y.x+L.x*q,se=y.y+L.y*q,Se=y.z+L.z*q,he=xi(oe),ne=wi(Se);if(!(he<0||he>1||ne<0||ne>1)&&se<=Mt(he,ne)){const ee=Math.min(v-1,Math.floor(he*v));return Math.min(u-1,Math.floor((1-ne)*u))*v+ee}}return null},Wc=n=>{n.target instanceof HTMLElement&&n.target.closest('[data-stage-ui="true"]')||(ka=!0,Oc=n.button,n.clientX,n.clientY,Zn=n.clientX,Qn=n.clientY,Ai=0,os.cancel(),A.domElement.setPointerCapture(n.pointerId))},Vc=n=>{const f=g.current;if(_i=n.clientX,Jn=n.clientY,!ka)return;const v=n.clientX-Zn,u=n.clientY-Qn;if(Zn=n.clientX,Qn=n.clientY,Ai+=Math.hypot(v,u),!f.cinemaActive)if(Oc===2||n.shiftKey){Ta=!0;const T=$.distance*.0011,y=Math.cos($.azimuth),L=Math.sin($.azimuth);ve.target.x=D.clamp(ve.target.x-(v*y-u*L)*T,-Je.width*.42,Je.width*.42),ve.target.z=D.clamp(ve.target.z-(-v*L-u*y)*T,-Je.depth*.42,Je.depth*.42)}else{Ta=!0;const T=f.inWorkspace?.0046:.0028;ve.azimuth-=v*T;const y=f.inWorkspace?.12:.72,L=f.inWorkspace?1.36:1.18;ve.polar=D.clamp(ve.polar-u*T,y,L)}},Yc=n=>{var u,T,y;if(!ka)return;ka=!1,A.domElement.hasPointerCapture(n.pointerId)&&A.domElement.releasePointerCapture(n.pointerId);const f=g.current;!f.inWorkspace&&Ai<5&&n.button===0&&((u=f.onEnterWorkspace)==null||u.call(f));const v=f.tileBoard;if(v&&v.pickable&&f.inWorkspace&&Ai<5&&n.button===0){const L=Kc(n.clientX,n.clientY,v.cols,v.rows);L!==null&&!((T=v.tiles[L])!=null&&T.closed)&&((y=f.onTilePick)==null||y.call(f,L))}},$c=()=>{_i=Number.NaN,Jn=Number.NaN},jc=n=>{const f=g.current;if(!f.inWorkspace||f.cinemaActive)return;n.preventDefault(),Ta=!0,os.cancel();const v=1+D.clamp(n.deltaY,-120,120)*.0011;ve.distance=D.clamp(ve.distance*v,4.6,23.5)},Xc=n=>{g.current.inWorkspace&&n.preventDefault()},Fa=A.domElement;Fa.addEventListener("pointerdown",Wc),window.addEventListener("pointermove",Vc,{passive:!0}),window.addEventListener("pointerup",Yc),Fa.addEventListener("pointerleave",$c),Fa.addEventListener("wheel",jc,{passive:!1}),Fa.addEventListener("contextmenu",Xc);const Fi=window.matchMedia("(prefers-reduced-motion: reduce)");let Es=Fi.matches;const qc=()=>{Es=Fi.matches};Fi.addEventListener("change",qc);let ns=0,tr=0,Zc=performance.now(),kt=0;const Rs={scale:1,offsetX:0,offsetY:0},Ft={scale:1,offsetX:0,offsetY:0},Ks={scale:1,offsetX:0,offsetY:Yu},Da=new Float32Array(Qp*3);let Qc=!1,Lo=null,Di=0,As=Ps,_s=null,vt=null;const Va={scale:1,offsetX:0,offsetY:0};let Pi=Ps,Ii=null,Jc=!1,eu=null,ar=!1,Ci=!1;const Li=(n,f,v,u,T=!1)=>{let y=0;for(let L=0;L<no;L++){const Q=L/(no-1);for(let q=0;q<no;q++){const oe=q/(no-1);Da[y*3]=Yt(oe),Da[y*3+1]=Mt(oe,Q),Da[y*3+2]=$t(Q),y++}}for(let L=0;L<4;L++)Da[y*3]=(L%2===0?-.5:.5)*Je.width,Da[y*3+1]=zs,Da[y*3+2]=(L<2?-.5:.5)*Je.depth,y++;if(T){const L=Mt(.5,.5);for(let Q=0;Q<Oh;Q++){const q=Q===0?0:Xp,oe=(Q-1)*Math.PI*.5;Da[y*3]=Math.cos(oe)*q,Da[y*3+1]=L+(Q===0?$p:jp),Da[y*3+2]=Math.sin(oe)*q,y++}}Ep(Da,y,f,v,39,rt/ut,n,u)};let Ni=0,sr=0,zi=0,or=60,tu=0;const et=new W,au=n=>{var Xa,No,Vs,cs,Ui,zo,Uo,Ys,Bi,$s,Bo,Oo,js,Ho;if(S)return;tr=requestAnimationFrame(au);const f=n-Zc,v=Math.min(.065,Math.max(.001,f*.001));Zc=n,kt+=v,ld(f);const u=g.current,T=1-Math.exp(-v*8.5),y=1-Math.exp(-v*5.8),L=!u.inWorkspace&&u.landingView!=="slab";if(L&&Ac(),_a){Un+=Ga?1e3:v;const F=Math.min(1,Un/Do);sa=Sh(F),z.uMorph.value=sa,gc(),F>=1&&(_a=!1,sa=1,ie=m,Mi(),z.uMorph.value=1,Hn(m.regionId),aa())}const Q=m.auxTex?_a&&ie.regionId!==m.regionId?D.smoothstep(sa,.55,1):1:0;if(z.uAuxMix.value=D.lerp(z.uAuxMix.value,Q,y),z.uDetailMix.value=D.lerp(z.uDetailMix.value,m.detailTex&&!ni?1:0,y),_s=u.inWorkspace?null:Yo(u.landingSubjectFrame),vt=u.inWorkspace&&!u.cleanHud&&!u.cinemaActive?Yo(u.workspaceSubjectFrame):null,u.inWorkspace&&vt){const F=(vt.left+vt.right)*.5,I=(vt.top+vt.bottom)*.5,O=Wa??u.cameraPreset;if(O==="overview"||O==="nadir"||O==="region"){Pi+=1;const H=u.mode==="observer"&&O==="overview",K=!!u.tileBoard;let X=pv;if(Ci&&K&&O==="region")Li(vt,{azimuth:$.azimuth,polar:$.polar,distance:$.distance,target:[$.target.x,$.target.y,$.target.z]},0,Va,H),X=gv,((ea==="play"?Gs>=1:Math.abs($.distance-ve.distance)<.002*ve.distance)||Ta)&&(Ci=!1,Pi=Ps);else if(Pi>=Ps||Ii!==O||Jc!==H||zc!==K||!Pr(eu,vt)){zc=K;const V=du(O,!0,u.mode,u.activeTheaterId,K);Li(vt,V,0,Va,H);let N=1;K&&O==="region"&&Va.scale<ih&&(N=Math.min(vv,ih/Math.max(.001,Va.scale)),Li(vt,{...V,distance:V.distance*N},0,Va,H)),K&&O==="region"&&Math.abs(N-yi)>.005&&(yi=N,ar=!0),Pi=0,Ii=O,Jc=H,eu={...vt}}const te=D.clamp(Va.scale,X,1),Ee=Math.max(.001,Va.scale);Ft.scale=te,Ft.offsetX=(Va.offsetX+F)/Ee*te-F,Ft.offsetY=(Va.offsetY+I)/Ee*te-I}else Ii=null,Ft.scale=1,Ft.offsetX=.5-F,Ft.offsetY=.5-I}else if(u.inWorkspace)Ii=null,Ft.scale=1,Ft.offsetX=0,Ft.offsetY=0;else if(L&&Ha){const F=_s??Ku;As+=1;const I=rt/ut;if(As>=Ps||!Pr(Lo,F)||Math.abs(Di-I)>1e-4){const O=ad();kp(bs,O,Ha,Es?0:Vi,Wi,I,F,Ks),Lo=F,Di=I,As=0}Ft.scale=1,Ft.offsetX=0,Ft.offsetY=Ks.offsetY}else if(!_s)Ft.scale=1,Ft.offsetX=0,Ft.offsetY=Yu,Lo=null;else{As+=1;const F=rt/ut;(As>=Ps||!Pr(Lo,_s)||Math.abs(Di-F)>1e-4)&&(Li(_s,St,Zp,Ks),Lo=_s,Di=F,As=0),Ft.scale=Ks.scale,Ft.offsetX=Ks.offsetX,Ft.offsetY=Ks.offsetY}const q=Qc?T:1;Qc=!0,Rs.scale=D.lerp(Rs.scale,Ft.scale,q),Rs.offsetX=D.lerp(Rs.offsetX,Ft.offsetX,q),Rs.offsetY=D.lerp(Rs.offsetY,Ft.offsetY,q),Pp(_,rt,ut,Rs);let oe=u.timeProgress;const se=L?Kn(m):null;let Se=null;se!==null&&u.landingTour&&typeof u.landingPass!="number"&&!Es?(bn!==m.key&&(bn=m.key,Hs=[],m.observerDataset.frames.forEach((F,I)=>{var O;(I===se||((O=F[0])==null?void 0:O.isDay)===!1)&&Hs.push(I)}),ri=Math.max(0,Hs.indexOf(se)),li=0,Sn=!1),Ga||(li+=v),Hs.length>1&&li>(Sn?rv:nv)&&(ri=(ri+1)%Hs.length,li=0,Sn=!0),Se=Hs[ri]??null):bn="";const he=se!==null&&typeof u.landingPass=="number"&&Number.isFinite(u.landingPass)?D.clamp(u.landingPass,0,m.frameCount-1):Se??se;if(he!==null&&(oe=he/Math.max(1,m.frameCount-1)),u.backdrop){const F=Kn(m);F!==null&&(oe=F/Math.max(1,m.frameCount-1))}let ne=0,ee=!1;if(u.cinemaActive&&u.inWorkspace){const F=pc.update(v,Mt,u.onCinemaStepTheater,Je.width,Je.depth);_.fov=F.fov,_.updateProjectionMatrix(),_.up.copy(F.up),_.position.copy(F.position),_.lookAt(F.lookAt),oe=F.syntheticTimeProgress,ne=F.cycleProgress}else{const F=L&&Ha?Wi:39;if(Math.abs(_.fov-F)>.01&&(_.fov=Gn||!L?D.lerp(_.fov,F,T):F),_.updateProjectionMatrix(),_.up.set(0,1,0),!u.inWorkspace&&!os.isActive()&&!ka){const V=L?Ha:null,N=V??St,j=Es?0:V?Math.sin(kt*.11)*Vi:Math.sin(kt*.16)*.065;let J=N.azimuth+j;for(;J-ve.azimuth>Math.PI;)J-=Math.PI*2;for(;J-ve.azimuth<-Math.PI;)J+=Math.PI*2;ve.azimuth=V?D.lerp(ve.azimuth,J,Math.min(1,v*2)):J,ve.polar=D.lerp(ve.polar,N.polar,v*1.2),ve.distance=D.lerp(ve.distance,N.distance,v*1.6),ki.set(N.target[0],N.target[1],N.target[2]),ve.target.lerp(ki,v*2.2),V&&!Gn&&(ve.azimuth=J,ve.polar=N.polar,ve.distance=N.distance,ve.target.copy(ki),$.azimuth=ve.azimuth,$.polar=N.polar,$.distance=N.distance,$.target.copy(ki),Gn=!0)}Ts&&u.inWorkspace&&!Ta&&!ka&&!os.isActive()&&(jn(Oa(u.cameraPreset,!0,u.mode,u.activeTheaterId)),Ts=!1),ee=os.step(v,ve).slewActive,$.azimuth=D.lerp($.azimuth,ve.azimuth,T),$.polar=D.lerp($.polar,ve.polar,T),$.distance=D.lerp($.distance,ve.distance,T),$.target.lerp(ve.target,T);let O=!1;if(!_a&&u.inWorkspace&&ea!=="turn"&&(Wa??u.cameraPreset)==="canyon"&&m.observerDataset.dataSource==="firms"){const V=m.observerDataset.frames.length,N=Math.min(V-1,Math.max(0,Math.round(D.clamp(u.timeProgress,0,1)*(V-1)))),j=(((No=(Xa=m.declared)==null?void 0:Xa.byFrame.get(N))==null?void 0:No.length)??0)>0;if(j||To==="estimate"&&mt.length>0){const J=u.workspaceSubjectFrame,Ie=`${m.regionId}:${((cs=(Vs=m.observerDataset.frames[0])==null?void 0:Vs[0])==null?void 0:cs.timeUtc)??""}`;let tt=0;for(const it of m.observerDataset.frames[N]??[])it.revealed&&!it.revealedByLook&&(tt+=it.footprints.length);const pt=`${Ie}:${N}:${j?"declared":So}:${tt}:${J?[J.left,J.top,J.right,J.bottom].map(it=>it.toFixed(3)).join(","):""}:${rt}x${ut}`;pt!==Fc&&(Fc=pt,!Ta&&!ka&&(ea==="estimate"||ea==="test"?O=!0:Ts=!0))}}const H=u.filmMove!==void 0?u.filmMove:kc;H!==Dc&&(Dc=H,$n=!1),ea&&(Ta||ka)&&($n=!0);let K=null;if(H&&!$n&&!(_a&&vc)&&!Ga&&!u.backdrop){K=H!=="auto"?H:u.inWorkspace?u.tileBoard?"play":Os.x+Os.y>.5?"test":"estimate":"record";const V=m.observerDataset.dataSource==="firms";K!=="record"&&(!u.inWorkspace||!V)&&(K=null)}if(K!==ea){const V=ea;if(ea=K,Ei=kt,Gs=0,Wa=null,yt=null,Gt=null,K){Ta=!1;const N=Oa("canyon",!0,u.mode,u.activeTheaterId),j={...N,distance:N.distance*Hr,azimuth:N.azimuth+.04};if(K==="estimate")yt={...N,distance:N.distance*dv,azimuth:N.azimuth-.06},Gt=j,Ka=Zu,Ss=!0,Wa="canyon";else if(K==="test"){const J={azimuth:$.azimuth,polar:$.polar,distance:$.distance,target:[$.target.x,$.target.y,$.target.z]};yt=V==="estimate"||V==="turn"?J:j,Gt=yt,Ka=0,Wa="canyon"}else if(K==="turn")yt={azimuth:$.azimuth,polar:$.polar,distance:$.distance,target:[$.target.x,$.target.y,$.target.z]},Gt={...yt,azimuth:yt.azimuth+Or},Ka=qu,Ss=!0,Wa=u.inWorkspace?V==="play"||V==="record"?"region":"canyon":null;else if(K==="play")yt=j,Gt=Oa("region",!0,u.mode,u.activeTheaterId),Ka=fv,Ss=!0,Wa="region";else{const J=u.inWorkspace?Oa("region",!0,u.mode,u.activeTheaterId):Ha??St;yt={...J,azimuth:J.azimuth-Or/2},Gt={...J,azimuth:J.azimuth+Or/2},Ka=qu,Ss=!1,Wa=u.inWorkspace?"region":null}}}if(O&&yt&&Gt&&(ea==="estimate"||ea==="test")){const V=Oa("canyon",!0,u.mode,u.activeTheaterId);yt={azimuth:$.azimuth,polar:$.polar,distance:$.distance,target:[$.target.x,$.target.y,$.target.z]},Gt={...V,distance:V.distance*Hr,azimuth:V.azimuth+.04},Ka=ea==="estimate"?Zu:Qu,Ss=!0,Ei=kt}if(ar)if(ar=!1,ea==="play"&&yt&&Gt){const V=Oa("region",!0,u.mode,u.activeTheaterId);Gs<1?Gt=V:(yt={azimuth:$.azimuth,polar:$.polar,distance:$.distance,target:[$.target.x,$.target.y,$.target.z]},Gt=V,Ka=Qu,Ss=!0,Ei=kt,Gs=0,Ci=!0)}else!ea&&u.cameraPreset==="region"&&u.inWorkspace&&!Ta&&!ka&&(jn(Oa("region",!0,u.mode,u.activeTheaterId)),Ci=!0);if(ea&&yt&&Gt){const V=Ka>0?D.clamp((kt-Ei)/Ka,0,1):1,N=Ss?V*V*(3-2*V):V;let j=Gt.azimuth-yt.azimuth;for(;j>Math.PI;)j-=Math.PI*2;for(;j<-Math.PI;)j+=Math.PI*2;$.azimuth=yt.azimuth+j*N,$.polar=D.lerp(yt.polar,Gt.polar,N),$.distance=yt.distance*Math.pow(Gt.distance/yt.distance,N),$.target.set(D.lerp(yt.target[0],Gt.target[0],N),D.lerp(yt.target[1],Gt.target[1],N),D.lerp(yt.target[2],Gt.target[2],N)),ve.azimuth=$.azimuth,ve.polar=$.polar,ve.distance=$.distance,ve.target.copy($.target),Gs=V}const X=Math.sin($.polar);_.position.set($.target.x+$.distance*X*Math.sin($.azimuth),$.target.y+$.distance*Math.cos($.polar),$.target.z+$.distance*X*Math.cos($.azimuth));const te=xi(_.position.x),Ee=wi(_.position.z);if(te>=0&&te<=1&&Ee>=0&&Ee<=1){const V=Mt(te,Ee)+D.lerp(Gu,Op,ns);_.position.y<V&&(_.position.y=V)}else if(m.context&&Sa>.5){const V=_c(m,_.position.x,_.position.z)+Gu;_.position.y<V&&(_.position.y=V)}_.lookAt($.target)}const le=!u.inWorkspace||u.cinemaActive?"cutaway":u.mode,de=le==="cutaway"?1:0,ze=le==="reconstruction"?1:0,st=le==="observer"?1:0,bt=le==="world"||le==="earth"||m.observerDataset.dataSource==="firms"?0:le==="observer"?.45:1;z.uCutawayMix.value=D.lerp(z.uCutawayMix.value,de,y),z.uReconMix.value=D.lerp(z.uReconMix.value,ze,y),z.uObserverMix.value=D.lerp(z.uObserverMix.value,st,y),z.uCutawayPlane.value=Wu,z.uTime.value=kt,z.uUncertaintyMix.value=D.lerp(z.uUncertaintyMix.value,u.showUncertainty?1:0,T),z.uSensitivity.value=D.lerp(z.uSensitivity.value,u.sensitivityThreshold,T);const fe=u.observerFilter==="all"||u.observerFilter==="modis"?1:0,Re=!u.holdoutViirs&&(u.observerFilter==="all"||u.observerFilter==="viirs")?1:0;z.uModisWeight.value=D.lerp(z.uModisWeight.value,fe,T),z.uViirsWeight.value=D.lerp(z.uViirsWeight.value,Re,T),Ae=D.lerp(Ae,bt*D.lerp(1,Lv,Ja.value),y);const Ve=Gl(m.tensor,m.frameCount,oe);z.uFrameMix.value=Ve,z.uFireTime.value=D.clamp(oe,0,1)*Math.max(1,m.frameCount-1);const xe=m.observerDataset.frames,ye=Math.min(xe.length-1,Math.max(0,Math.round(oe*(xe.length-1)))),Te=xe[ye]??[],_e=m.observerDataset.dataSource==="firms",jt=u.burnedArea??null;jt!==ms&&(ms=jt,jt&&Kh(jt));const Lt=_e&&Aa!==null&&ms!==null&&yl===ms&&(!ms.region_id||ms.region_id===m.regionId);if(ps=D.lerp(ps,Lt?1:0,1-Math.exp(-v*3)),!Lt&&ps<.003&&(ps=0),xl.value=_e?ps:0,z.uFieldTex1.value=_e&&ps>0&&Aa?Aa:da,ps>0&&un){const F=wf(m.bbox,un);wl.set(F[0],F[1],F[2],F[3])}if(_e){Gh(m,Ht,ln);const F=`${m.key}:${ye}:${u.holdoutViirs?1:0}:${L?1:0}`,I=L&&(typeof u.landingPass=="number"||!!u.landingTour)&&!Es,O=F!==gs&&I&&gs.startsWith(`${m.key}:`)&&ts.value>.02;if(O?ts.value=Math.max(0,ts.value-v/Pv):F===gs&&(ts.value=I?Math.min(1,ts.value+v/Iv):1),F!==gs&&!O){gs=F,ts.value=I?0:1;const H=Te.find(N=>!ma(N,u.holdoutViirs)&&!N.revealed)??Te.find(N=>!ma(N,u.holdoutViirs)),K=Te.some(N=>N.family==="modis"&&!ma(N,u.holdoutViirs)&&!N.revealed);En=H?{index:ye,sensor:H.sensorLabel,timeUtc:H.timeUtc??"",isDay:H.isDay!==!1,detections:H.footprints.length}:void 0;const X=H??Te[0];if(u.passScan&&(u.inWorkspace||typeof u.landingPass=="number")&&X&&!Es){const N=D.degToRad(X.azimuthDeg);let j=Math.cos(N),J=-Math.sin(N);const Ie=X.orbitNode==="ascending";X.orbitNode&&Ie!==J>0&&(j=-j,J=-J),Qa.x=j,Qa.y=J,Rl=kt}es.length=0,xs.length=0,Os.set(0,0);for(const N of Te)if(!ma(N,u.holdoutViirs)){if(N.revealed){for(const j of N.footprints)xs.push(j);N.family==="modis"?Os.x=1:Os.y=1;continue}for(const j of N.footprints)es.push(j)}const te=Te.find(N=>N.revealed&&!ma(N,u.holdoutViirs));if(xs.length>0&&te){const N=D.degToRad(te.azimuthDeg);let j=Math.cos(N),J=-Math.sin(N);te.orbitNode&&te.orbitNode==="ascending"!=J>0&&(j=-j,J=-J);const[Ie,tt,pt,it]=m.bbox;let gt=1/0,Wt=-1/0,xt=0;for(const Vt of xs){const qa=((Vt.lon-Ie)/Math.max(1e-9,pt-Ie)-.5)*m.widthKm,Oi=((Vt.lat-tt)/Math.max(1e-9,it-tt)-.5)*m.depthKm,Hi=qa*j+Oi*J;gt=Math.min(gt,Hi),Wt=Math.max(Wt,Hi),xt=Math.max(xt,Vt.acrossTrackKm,Vt.alongTrackKm)}vs.x=j,vs.y=J,vs.w=Math.max(.2,xt),Cl=gt-xt,Ll=Wt+xt+vs.w,Nl=Es?-1e9:kt}if(ci.length=0,bo.value=0,ui=void 0,es.length===0&&Te.length>0&&Te.every(N=>N.revealed||ma(N,u.holdoutViirs))&&m.residenceHours!==void 0){const N=Date.parse(((Ui=Te[0])==null?void 0:Ui.timeUtc)??"");for(let j=ye-1;j>=0&&ci.length===0;j--)for(const J of xe[j]??[]){if(J.revealed||ma(J,u.holdoutViirs)||J.footprints.length===0)continue;for(const pt of J.footprints)ci.push(pt);const Ie=Date.parse(J.timeUtc??""),tt=Number.isFinite(N)&&Number.isFinite(Ie)?Math.max(0,(N-Ie)/36e5):0;bo.value=Math.exp(-tt/(m.residenceHours??1)),ui={index:j,sensor:J.sensorLabel,timeUtc:J.timeUtc??"",hoursBefore:tt}}}const V=m.fieldScale??ao;Ov(V,oi),ai.build(es,m.bbox,[m.widthKm,m.depthKm],N=>(Zi(V,N)-oi.x)/Math.max(.001,oi.y-oi.x),xs,ci),Dl.value=K?1:0}}else En=void 0,gs="",bo.value=0,ui=void 0;const Ya=(kt-Rl)/iv;if(_e&&Ya>=0&&Ya<1){const F=.5*(Math.abs(Qa.x)*m.widthKm+Math.abs(Qa.y)*m.depthKm)+1.5;Qa.z=-F+2*F*Ya,Qa.w=1}else Qa.w=0;Ol!==m.key&&(Ol=m.key,Hl=_e&&!xe.some(F=>F.some(I=>I.hidden||I.revealed))),Rn.value=D.lerp(Rn.value,Hl&&!u.holdoutViirs?1:0,T);const ot=_e&&m.runId?pl.get(m.runId):void 0;if(ot&&!u.backdrop){Al!==m.key&&(Al=m.key,gn=xe.map(X=>{var te;return Date.parse(((te=X[0])==null?void 0:te.timeUtc)??"")}));const F=D.clamp(oe,0,1)*Math.max(1,xe.length-1),I=Math.min(xe.length-1,Math.floor(F)),O=Math.min(xe.length-1,I+1),H=gn[I],K=gn[O];if(Number.isFinite(H)&&Number.isFinite(K)){const X=H+(K-H)*(F-I)+ot.info.stepMs;Sl!==m.key&&(Sl=m.key,hn=null),Te.length>0&&Te.every(te=>te.revealed||ma(te,u.holdoutViirs))&&(hn=ye),vl.value=fa.sync(ot,m.key,X,hn)}else fa.clear()}else fa.clear();z.uLipariTex.value=fa.grid.x>0?fa.texture:$e,bl.value=fa.grid.x>0&&fa.declaredGiven?1:0,yn.value=D.lerp(yn.value,u.chanceSquares?1:0,T);{const F=!!(u.filmMove??kc),I=D.clamp((kt-Nl)/(F?uv:cv),0,1),O=F?I*I*(3-2*I):1-(1-I)*(1-I);vs.z=I>=1?1e4:D.lerp(Cl,Ll,O);const H=yf();Il.set(H??-1,A.domElement.width),H!==null&&(vs.z=1e4)}const Pa=_e&&Te.length>0&&Te.every(F=>F.revealed||ma(F,u.holdoutViirs))?1:0;cn.value=D.lerp(cn.value,Pa,1-Math.exp(-v*6)),gl.value=_e&&m.answeredByOther?1:0,vn=D.lerp(vn,(!_e||es.length>0?1:.5*bo.value)*ts.value,1-Math.exp(-v*4)),z.uPixelOutline.value=D.lerp(z.uPixelOutline.value,u.detectionPixels?1:0,T),Tn.value=L?0:D.smoothstep($.distance,8.5,15),yo.value=D.lerp(yo.value,(L?1:D.lerp(Tv,Ev,Tn.value))*Fv((zo=m.pack)==null?void 0:zo.pictureMedianLuma),y),Mo=_e&&Te[0]?{index:ye,sensor:Te[0].sensorLabel,timeUtc:Te[0].timeUtc??"",isDay:Te[0].isDay!==!1,hidden:Te.every(F=>F.revealed||ma(F,u.holdoutViirs))&&!Te.some(F=>F.revealed&&!F.revealedByLook)}:void 0,z.uFireHist.value=_e?ai.lightTexture:At(m).texture,Mn=void 0;let Xt=null;if(u.dayPicture&&_e&&u.inWorkspace&&((Uo=Te[0])!=null&&Uo.timeUtc)&&m.runId){const F=(Mo==null?void 0:Mo.hidden)===!0,I=Te.find(te=>!ma(te,u.holdoutViirs)&&!te.revealed)??Te[0],O=F?"MODIS_AQUA":tv(I.sensorLabel)??"MODIS_AQUA",H=Te[0].timeUtc.slice(0,10),K=Na(g.current,`/api/gibs/day?region_id=${encodeURIComponent(m.regionId)}&day=${H}&platform=${O}&kind=${u.dayPicture}`);let X=ii.get(K);X===void 0&&(ii.set(K,"loading"),X="loading",U.load(K,te=>{te.colorSpace=ht,te.anisotropy=P,te.wrapS=We,te.wrapT=We,ii.set(K,te)},void 0,()=>ii.set(K,"missing"))),X!=="loading"&&X!=="missing"&&(Xt=X),Mn={state:X==="loading"?"loading":X==="missing"?"missing":"shown",platform:O,kind:u.dayPicture,day:H,insteadOfHidden:F}}if(Xt){z.uSatNext.value=Xt,z.uSatPrev.value=Xt,z.uSatSharpen.value=0;const F=Xt.image;z.uOrthoTexelKm.value=m.widthKm/Math.max(1,(F==null?void 0:F.width)??256),ni=!0,xn.value=hv,wn.value=u.dayPicture==="false_color"?1:0}else ni&&(z.uSatNext.value=m.satTex,z.uSatPrev.value=ie.satTex,z.uSatSharpen.value=m.sharpen,z.uOrthoTexelKm.value=m.orthoTexelKm,ni=!1,xn.value=0,wn.value=0);Pl.value=m.runId===null?0:1;const oa=u.backdrop?1:Xt?0:_e&&((Ys=Te[0])==null?void 0:Ys.isDay)===!1||m.runId===null?1:0;Ja.value=D.lerp(Ja.value,oa,1-Math.exp(-v*2.4)),Vl.value=Ja.value;const $a=m.fieldScale??ao;kl.set($a.kind==="linear"?0:1,$a.maxMwKm2,$a.minMwKm2),zv($a,Fl),_l.set(_e?1:0,_e?1:0),wu(Te.find(F=>F.family==="modis"),Qi,Ao),wu(Te.find(F=>F.family==="viirs"&&!ma(F,u.holdoutViirs)),io,_o),ec.set(Ao.axisEast,Ao.axisNorth,Ao.nadirKm,Ao.valid?1:0),tc.set(_o.axisEast,_o.axisNorth,_o.nadirKm,_o.valid?1:0),Ni=D.lerp(Ni,le==="observer"?1:0,y),!mc&&le==="observer"&&(mc=!0,ss.loadModels("/isogon/"));{const F=D.smoothstep($.distance,8.5,11.5);if(Nn=D.lerp(Nn,le==="observer"?F:0,y),gi.length=0,Ni>=.01){let I=!1,O=!1;for(const H of Te){if(gi.length>=Vu)break;if(ma(H,u.holdoutViirs)||u.observerFilter==="modis"&&H.family!=="modis"||u.observerFilter==="viirs"&&H.family!=="viirs")continue;const K=H.family==="modis"?!I:!O;H.family==="modis"?I=!0:O=!0,gi.push({sensorLabel:H.sensorLabel,family:H.family,azimuthDeg:H.azimuthDeg,scanAngleDeg:H.scanAngleDeg,orbitNode:H.orbitNode,groundStrip:K})}}ss.update(gi,{sky:Nn,strip:Ni,dtSec:v,sampleTerrainY:Mt,slabWidth:Je.width,slabDepth:Je.depth,unitsPerMetre:m.frame.unitsPerMetre}),ac.set(ss.strips.modis.alongTrackKm,ss.strips.modis.strength,ss.strips.viirs.alongTrackKm,ss.strips.viirs.strength)}_n.position.copy(_.position);{const F=D.lerp(ie.minElevM,m.minElevM,sa),I=Math.max(.05,(F+_.position.y/m.frame.unitsPerMetre[1])*.001);as.uCamAltKm.value=I,be=D.lerp(be,L||u.inWorkspace&&(u.cleanHud||u.cinemaActive)?1:0,y),ns=D.lerp(ns,L?1:0,y),as.uSkyExposure.value=D.lerp(pr,D.lerp(Vd,Gp,ns),be),z.uLatticeMix.value=1-ns;const O=Wa??u.cameraPreset,H=u.inWorkspace?O==="region"||O==="canyon"&&m.observerDataset.dataSource==="firms"?1:1-D.smoothstep($.distance,8.5,11.5):L?1:0,K=m.context!==null&&!_a;Sa=Ga?K?H:0:D.lerp(Sa,K?H:0,y),z.uContextMix.value=Sa,vi.mesh.visible=Sa>.003,Fo.visible=ns<.5&&Sa<.5,fi.visible=ns<.5&&Sa<.5,z.uSkyExposure.value=as.uSkyExposure.value,z.uEdgeFade.value=D.lerp(z.uEdgeFade.value,m.context?0:u.inWorkspace?1-D.smoothstep($.distance,8.5,11.5):L&&(bi.floorShare>0||bi.seaShare>0)?1:0,y);const X=Math.max(z.uEdgeFade.value,Sa);Dn.uniforms.uShadowMix.value=1-X,as.uFloorHaze.value=D.lerp(.3,D.lerp(1,Wp,X),be),as.uFloorColor.value.set(.044,.06,.094).lerp(Vv,be),Ro.update(A,di,I)}_.updateMatrixWorld();const je=Math.max(Is(ie.maxElevM,ie),Is(m.maxElevM,m));Z.enabled=Ae>.01,L&&(_.updateMatrixWorld(),Dp(_,Fp(_s??Ku),fc)),z.uSmokeShadowMix.value=Z.enabled?1:0,Z.enabled&&Z.update({camera:_,slabWidth:Je.width,slabDepth:Je.depth,reliefTop:je,heightPrev:we(ie),heightNext:we(m),morph:sa,field0:wa,field1:da,detection0:m.observerDataset.dataSource==="firms"?ei:null,detection1:m.observerDataset.dataSource==="firms"?ti:null,frameMix:z.uFrameMix.value,windUv:Pn,sunDir:Me,sunColor:An,time:kt,opacity:Ae,cutawayMix:z.uCutawayMix.value,cutawayPlane:Wu,cutawayDir:Xl,lid:fc,lidAmount:ns,clearRadius:Hp,thinOverFire:_e?.82:0,night:Ja.value,fireLight:vn}),Y.render(v);const Ge=u.onCurtainScreen;Ge&&!Hc&&(Ge({near:{x:0,y:0},far:{x:0,y:0},modisSide:"left",visible:!1}),Hc=!0);const ue=u.tileBoard,Xe=!!ue&&ue.cols>=1&&ue.rows>=1&&ue.cols*ue.rows<=64;if(!!ue!==Nc&&(Nc=!!ue,u.cameraPreset==="region"&&(Ts=!0)),ue&&Xe){dn.set(ue.cols,ue.rows);const F=ue.cols*ue.rows;for(let O=0;O<F;O++){const H=ue.tiles[O];Tl[O].set(D.clamp((H==null?void 0:H.level)??0,0,1),H!=null&&H.looked?1:0,H!=null&&H.chosen?1:0,H!=null&&H.closed?1:0)}const I=ue.pickable&&!ka&&Number.isFinite(_i)?Kc(_i,Jn,ue.cols,ue.rows):null;if(fn.value=I??-1,I!==si&&(si=I,(Bi=u.onTileHover)==null||Bi.call(u,I)),u.onTileAnchors){pn.length=0;for(let O=0;O<F;O++){const H=O%ue.cols/ue.cols,K=1-Math.floor(O/ue.cols)/ue.rows;et.set(Yt(H),Mt(H,K),$t(K)).project(_);const X=(et.x*.5+.5)*rt,te=(-et.y*.5+.5)*ut;pn.push({tile:O,x:X,y:te,visible:et.z>-1&&et.z<1&&X>=0&&X<=rt&&te>=0&&te<=ut})}u.onTileAnchors(pn.slice())}}else dn.set(0,0),fn.value=-1,si!==null&&(si=null,($s=u.onTileHover)==null||$s.call(u,null));const Dt=!!(u.onThings&&u.things&&Object.values(u.things).some(F=>F.kind==="fire")),lt=u.inWorkspace?u.onFireAnchor:void 0;if((lt||Dt)&&_e){const F=es.length>0?es:xs,I=ot?Math.round(fa.grid.x)+":"+fa.stepKey:"",O=`${gs}:${F.length}:${F.length===0?I:""}`;if(O!==So){So=O;const[K,X,te,Ee]=m.bbox;if(F.length>0){To="detections",mt=new Float32Array(F.length*3);const V=new Float32Array(F.length*2);F.forEach((N,j)=>{mt[j*3]=(N.lon-K)/Math.max(1e-9,te-K),mt[j*3+1]=(N.lat-X)/Math.max(1e-9,Ee-X),mt[j*3+2]=Math.max(1,N.frpMw),V[j*2]=.5*N.acrossTrackKm/Math.max(1e-6,m.widthKm),V[j*2+1]=.5*N.alongTrackKm/Math.max(1e-6,m.depthKm)}),ws=Wo(mt,D.clamp(Math.round(m.widthKm/nh),8,512),D.clamp(Math.round(m.depthKm/nh),8,512),V)}else{To="estimate";const V=ot!=null&&ot.declared&&ot.declared.nx===ot.info.nx&&ot.declared.ny===ot.info.ny?ot.declared.byFrame.get(ye):void 0;if(ot&&V&&V.length>0){const{nx:N,ny:j}=ot.info;mt=new Float32Array(V.length*3),V.forEach((J,Ie)=>{mt[Ie*3]=(J%N+.5)/N,mt[Ie*3+1]=1-(Math.floor(J/N)+.5)/j,mt[Ie*3+2]=1})}else mt=ot?fa.cellsAbove(ot,Cv,N=>vh(m.fieldScale??ao,N)):new Float32Array(0);ws=ot?Wo(mt,ot.info.nx,ot.info.ny):{patchOf:new Uint16Array(0),sizes:[]}}}const H=mt.length/3;if(H===0)Eo&&(lt==null||lt(null)),Eo=!1,hi="",ra=null;else{const K=`${So}:${ie.key}:${m.key}`,X=_.matrixWorld.elements,te=_.projectionMatrix.elements;let Ee=ra!==null&&K===hi&&Jt[0]===ye&&Jt[1]===sa&&Jt[2]===rt&&Jt[3]===ut&&Jt[4]===Je.width&&Jt[5]===Je.depth;if(Ee){for(let V=0;V<16;V++)if(Jt[6+V]!==X[V]||Jt[22+V]!==te[V]){Ee=!1;break}}if(!Ee){let V=0,N=0,j=0,J=1/0,Ie=-1/0,tt=1/0,pt=-1/0;const it=Math.min(Br,ws.sizes.length);for(let me=0;me<it;me++)Qe[me*7]=0,Qe[me*7+1]=0,Qe[me*7+2]=0,Qe[me*7+3]=1/0,Qe[me*7+4]=1/0,Qe[me*7+5]=-1/0,Qe[me*7+6]=-1/0;for(let me=0;me<H;me++){const ct=mt[me*3],Ma=mt[me*3+1],ya=mt[me*3+2];V+=ct*ya,N+=Ma*ya,j+=ya;const zt=ws.patchOf[me]<it?ws.patchOf[me]*7:-1;if(zt>=0&&(Qe[zt]+=ct*ya,Qe[zt+1]+=Ma*ya,Qe[zt+2]+=ya),et.set(Yt(ct),Mt(ct,Ma),$t(Ma)).project(_),et.z<=-1||et.z>=1)continue;const Fs=(et.x*.5+.5)*rt,Xs=(-et.y*.5+.5)*ut;J=Math.min(J,Fs),Ie=Math.max(Ie,Fs),tt=Math.min(tt,Xs),pt=Math.max(pt,Xs),zt>=0&&(Qe[zt+3]=Math.min(Qe[zt+3],Fs),Qe[zt+4]=Math.min(Qe[zt+4],Xs),Qe[zt+5]=Math.max(Qe[zt+5],Fs),Qe[zt+6]=Math.max(Qe[zt+6],Xs))}let gt=0,Wt=0;const xt=(me,ct)=>{const Ma=Mt(me,ct);if(et.set(Yt(me),Ma,$t(ct)).project(_),gt=(et.x*.5+.5)*rt,Wt=(-et.y*.5+.5)*ut,!(et.z>-1&&et.z<1&&gt>=0&&gt<=rt&&Wt>=0&&Wt<=ut))return!1;const ya=_.position.x,zt=_.position.y,Fs=_.position.z,Xs=Yt(me),cd=$t(ct);for(let rr=1;rr<48;rr++){const lr=rr/48,cr=xi(ya+(Xs-ya)*lr),ur=wi(Fs+(cd-Fs)*lr);if(!(cr<0||cr>1||ur<0||ur>1)&&Mt(cr,ur)>zt+(Ma-zt)*lr+.012)return!1}return!0};for(let me=0;me<it;me++)Ms[me*3]=1/0;const Vt=m.widthKm,qa=m.depthKm;for(let me=0;me<H;me++){const ct=ws.patchOf[me];if(ct>=it)continue;const Ma=(mt[me*3]-Qe[ct*7]/Qe[ct*7+2])*Vt,ya=(mt[me*3+1]-Qe[ct*7+1]/Qe[ct*7+2])*qa,zt=Ma*Ma+ya*ya;zt<Ms[ct*3]&&(Ms[ct*3]=zt,Ms[ct*3+1]=mt[me*3],Ms[ct*3+2]=mt[me*3+1])}const Oi=[];for(let me=0;me<it;me++){const ct=me*7,Ma=xt(Ms[me*3+1],Ms[me*3+2]);Oi.push({x:gt,y:Wt,left:Number.isFinite(Qe[ct+3])?Qe[ct+3]:gt,top:Number.isFinite(Qe[ct+4])?Qe[ct+4]:Wt,right:Number.isFinite(Qe[ct+5])?Qe[ct+5]:gt,bottom:Number.isFinite(Qe[ct+6])?Qe[ct+6]:Wt,cells:ws.sizes[me],visible:Ma})}const Hi=xt(V/j,N/j),ir=gt,nr=Wt;ra={frame:ye,from:To,x:ir,y:nr,left:Number.isFinite(J)?J:ir,top:Number.isFinite(tt)?tt:nr,right:Number.isFinite(Ie)?Ie:ir,bottom:Number.isFinite(pt)?pt:nr,visible:Hi,patches:Oi},hi=K,Jt[0]=ye,Jt[1]=sa,Jt[2]=rt,Jt[3]=ut,Jt[4]=Je.width,Jt[5]=Je.depth;for(let me=0;me<16;me++)Jt[6+me]=X[me],Jt[22+me]=te[me]}lt==null||lt(ra),Eo=!0}}else Eo&&((Bo=u.onFireAnchor)==null||Bo.call(u,null),Eo=!1,So="",hi="",ra=null);if(u.onThings&&u.things){const F={};let I="";const O=u.tileBoard&&u.tileBoard.cols>=1&&u.tileBoard.rows>=1?u.tileBoard:null;for(const[H,K]of Object.entries(u.things)){let X=null;if(K.kind==="fire")X=ra&&_e?{x:ra.x,y:ra.y,left:ra.left,top:ra.top,right:ra.right,bottom:ra.bottom,visible:ra.visible,patches:ra.patches}:null;else if(K.kind==="tile"){if(O&&K.tile>=0&&K.tile<O.cols*O.rows){const te=K.tile%O.cols,Ee=Math.floor(K.tile/O.cols);X=El(te/O.cols,(te+1)/O.cols,1-(Ee+1)/O.rows,1-Ee/O.rows)}}else if(K.kind==="detection"&&_e){const Ee=(K.revealed?xs:es)[K.index];if(Ee){const[V,N,j,J]=m.bbox,Ie=(Ee.lon-V)/Math.max(1e-9,j-V),tt=(Ee.lat-N)/Math.max(1e-9,J-N),pt=.5*Math.max(Ee.acrossTrackKm,Ee.alongTrackKm,.1),it=pt/Math.max(.001,m.widthKm),gt=pt/Math.max(.001,m.depthKm);X=El(Ie-it,Ie+it,tt-gt,tt+gt)}}F[H]=X,I+=X?`${H}:${Math.round(X.left)},${Math.round(X.top)},${Math.round(X.right)},${Math.round(X.bottom)},${X.visible?1:0};`:`${H}:-;`}I!==mn&&(mn=I,u.onThings(F))}else mn="";const re=h.current;if(re){let F=!1;if(u.inWorkspace&&!L&&!u.cinemaActive&&$.distance>lv){const I=[[0,0,1,0,m.widthKm],[1,0,1,1,m.depthKm],[1,1,0,1,m.widthKm],[0,1,0,0,m.depthKm]];let O=I[0],H=1/0;for(const j of I){const J=Yt((j[0]+j[2])*.5)-_.position.x,Ie=$t((j[1]+j[3])*.5)-_.position.z,tt=J*J+Ie*Ie;tt<H&&(H=tt,O=j)}const K=O[4];let X=1;for(const j of[1,2,5,10,20,50,100])j<=K*.3&&(X=j);const te=vt??{left:0,top:0,right:1,bottom:1},Ee=(j,J,Ie)=>j[0]-J>=te.left*rt+12&&j[0]+J<=te.right*rt-12&&j[1]-Ie>=te.top*ut+12&&j[1]+Ie<=te.bottom*ut-12;let V=null,N=null;for(let j=Xu;j+X/K<=1-Xu+1e-6;j+=.06){const J=xt=>{const Vt=j+xt/K;return[O[0]+(O[2]-O[0])*Vt,O[1]+(O[3]-O[1])*Vt]},Ie=.07*(1-Sa);let tt=1/0;for(let xt=0;xt<=8;xt++){const[Vt,qa]=J(X*xt/8);tt=Math.min(tt,Mt(Vt,qa))}const pt=xt=>{const[Vt,qa]=J(xt);return et.set(Yt(Vt),tt-Ie,$t(qa)).project(_),et.z<=-1||et.z>=1?null:[(et.x*.5+.5)*rt,(-et.y*.5+.5)*ut]},it=pt(0),gt=pt(X);if(!it||!gt)continue;const Wt=gt[0]>=it[0]?gt:it;if(Ee(it,2,10)&&Ee(gt,2,10)&&Ee([Wt[0]+36,Wt[1]],30,12)){V=it,N=gt;break}}if(V&&N){const j=Math.hypot(N[0]-V[0],N[1]-V[1]);if(j>40){let J=-(N[1]-V[1])/j,Ie=(N[0]-V[0])/j;Ie>0&&(J=-J,Ie=-Ie);const tt=(xt,Vt)=>`M${xt[0].toFixed(1)},${xt[1].toFixed(1)} L${(xt[0]+J*Vt).toFixed(1)},${(xt[1]+Ie*Vt).toFixed(1)}`,pt=`${tt(V,7)} M${V[0].toFixed(1)},${V[1].toFixed(1)} L${N[0].toFixed(1)},${N[1].toFixed(1)} ${tt(N,7)}`;pt!==zl&&(zl=pt,(Oo=r.current)==null||Oo.setAttribute("d",pt));const it=c.current,gt=N[0]>=V[0]?N:V,Wt=`${X} km|${(gt[0]+8).toFixed(1)}|${(gt[1]+4).toFixed(1)}`;if(it&&Wt!==Ul){Ul=Wt;const[xt,Vt,qa]=Wt.split("|");it.textContent=xt,it.setAttribute("x",Vt),it.setAttribute("y",qa)}F=!0}}}F!==Bl&&(Bl=F,re.style.opacity=F?"1":"0")}const ke=u.inWorkspace&&!u.cleanHud&&!u.cinemaActive,Pe=Ur(m),[qe,Oe,Fe,Ue]=m.bbox,Nt=Math.max(1e-4,Fe-qe),Kt=Math.max(1e-4,Ue-Oe),Ze=[],ja=232,rs=vt?vt.left*rt+12:24,qt=Math.max(rs,(vt?vt.right*rt-12:rt-356)-ja),Pt=vt?vt.top*ut+12:68,Ia=Math.max(Pt,vt?vt.bottom*ut-76:Math.max(160,ut-134)),ks=vt?(vt.left+vt.right)*.5*rt:rt*.44;for(let F=0;F<3;F++){const I=Pe[F];if(!ke||!I){Ze.push({ax:0,ay:0,bx:0,by:0,valid:!1});continue}const O=D.clamp((I.lon-qe)/Nt,.04,.96),H=D.clamp((I.lat-Oe)/Kt,.04,.96),K=Mt(O,H)+.05;if(et.set(Yt(O),K,$t(H)).project(_),et.z>=1||et.z<=-1){Ze.push({ax:0,ay:0,bx:0,by:0,valid:!1});continue}const X=(et.x*.5+.5)*rt,te=(-et.y*.5+.5)*ut,V=(F===1||X+108>qt||X>ks?-1:1)>0?X+56:X-56-ja,N=D.clamp(V,rs,qt),j=D.clamp(te-(F===0?64:F===1?48:-44),Pt,Ia);Ze.push({ax:X,ay:te,bx:N,by:j,valid:!0})}const Ws=240,Ea=62;for(let F=0;F<2;F++)for(let I=0;I<Ze.length;I++)if(Ze[I].valid)for(let O=I+1;O<Ze.length;O++){if(!Ze[O].valid)continue;const H=Ze[O].bx-Ze[I].bx,K=Ze[O].by-Ze[I].by;if(Math.abs(H)<Ws&&Math.abs(K)<Ea){const X=(Ea-Math.abs(K))*.55*(K>=0?1:-1);Ze[I].by=D.clamp(Ze[I].by-X,Pt,Ia),Ze[O].by=D.clamp(Ze[O].by+X,Pt,Ia)}}for(let F=0;F<3;F++){const I=Ze[F],O=i.current[F],H=l.current[F],K=o.current[F];if(!I||!I.valid){O&&(O.style.opacity="0"),H&&(H.style.opacity="0",H.style.pointerEvents="none",H.style.visibility="hidden"),K&&(K.style.opacity="0");continue}if(O&&(O.style.opacity="1",O.style.transform=`translate3d(${I.ax.toFixed(1)}px, ${I.ay.toFixed(1)}px, 0) translate(-50%, -50%)`),H&&(H.style.opacity="1",H.style.pointerEvents="auto",H.style.visibility="visible",H.style.transform=`translate3d(${I.bx.toFixed(1)}px, ${I.by.toFixed(1)}px, 0)`),K){const X=I.ax+(I.bx-I.ax)*.42,te=I.by+22,Ee=I.bx>I.ax?I.bx:I.bx+(H?H.offsetWidth:ja);K.setAttribute("points",`${I.ax.toFixed(1)},${I.ay.toFixed(1)} ${X.toFixed(1)},${te.toFixed(1)} ${Ee.toFixed(1)},${te.toFixed(1)}`),K.style.opacity="1"}}if(Ga){const F=m.observerDataset.dataSource==="firms"&&m.runId!==null,I=F&&!_a&&(m.pack?m.contextState!=="loading":m.packManifest===null||m.packState==="failed");Vn=I&&f<yv?Vn+v:0;const O=F?m.pack?m.contextState==="loading"?3:4:m.packManifest&&m.packState!=="failed"?2:I?4:1:0;O!==Ic&&(Ic=O,Cc=kt);const H=Yr[O],K=Yr[Math.min(Yr.length-1,O+1)],X=H+(K-H)*(1-Math.exp(-(kt-Cc)/Sv));if(Ti=Math.max(Ti,D.lerp(Ti,X,y)),s.current&&(s.current.style.transform=`scaleX(${Ti.toFixed(4)})`),Vn>Mv||kt>bv){Ga=!1,Co=kt,s.current&&(s.current.style.transform="scaleX(1)");const te=a.current;te&&(te.style.transition=`opacity ${Vr}s ease-out`,te.style.opacity="0"),md(),(js=u.onPictureReady)==null||js.call(u);for(const Ee of Lc.splice(0))Ee()}}else Co>=0&&kt-Co>Vr+.1&&a.current&&a.current.style.display!=="none"&&(a.current.style.display="none");sr+=1,zi+=v;const ca=Ga?"holding":Co>=0&&kt-Co<Vr?"fading":"shown",ls=ca!==Pc;if(Pc=ca,zi>=.32||ls){const F=sr/Math.max(.001,zi);if(or=or*.55+Math.min(120,F)*.45,sr=0,zi=0,kt-tu>=.3||ls){tu=kt;const I={fps:Math.round(or),renderScale:+Ri.toFixed(2),slowDevice:B,vertexCount:mi.geometry.getAttribute("position").count+Fo.geometry.getAttribute("position").count,orthoResolution:m.orthoLabel,demResolution:m.demLabel,activeTheaterId:u.activeTheaterId,slewActive:ee||_a,cinemaProgress:ne,wavePosition:0,imageryAttribution:Kv(m),missingFiles:av(m,b.current),film:ea?{move:ea,progress:Gs}:void 0,verticalExaggeration:tl,landingStandpoint:L&&Ha?bi:void 0,intensityLegend:ov(m),realPass:En,lastSeen:ui,passOnShow:Mo,dayPicture:Mn,picture:ca,regionGrid:u.regionGridDivisions?td(m,u.regionGridDivisions):void 0};(Ho=u.onTelemetry)==null||Ho.call(u,I)}}};return tr=requestAnimationFrame(au),()=>{var v;S=!0,cancelAnimationFrame(tr),Uc.disconnect(),is==null||is.removeEventListener("change",qn),Fa.removeEventListener("pointerdown",Wc),window.removeEventListener("pointermove",Vc),window.removeEventListener("pointerup",Yc),Fa.removeEventListener("pointerleave",$c),Fa.removeEventListener("wheel",jc),Fi.removeEventListener("change",qc),Fa.removeEventListener("contextmenu",Xc),Yl.dispose(),$l.dispose(),Ro.dispose(),Fn.dispose(),Dn.dispose(),Ln.dispose(),cc.dispose(),uc.dispose(),hc.dispose(),dc.dispose();for(const u of ge)u.dispose();wa.dispose(),da.dispose(),Aa==null||Aa.dispose(),ei.dispose(),ti.dispose(),ai.dispose(),fa.dispose(),$e.dispose(),ys==null||ys.dispose(),ko==null||ko.dispose(),nc.dispose(),In.dispose(),Cn.dispose();for(const u of la.values())xc(u);la.clear(),vi.dispose(),ss.dispose(),G.environment=null,dt.dispose();const n=new Set,f=u=>{!u||n.has(u)||(n.add(u),u.dispose())};for(const u of new Set([...ce.values(),...ae.values(),...He,ie,m]))!u.pack&&u.lite===null&&(f(u.demTex),f(u.satTex)),f((v=u.fireHistory)==null?void 0:v.texture),f(u.shadow);Y.dispose(),A.dispose(),Fa.parentElement===x&&x.removeChild(Fa),R.current=null}},[]),It.useEffect(()=>{var x;(x=R.current)==null||x.applyCameraPreset()},[e.cameraPreset,e.inWorkspace,e.mode]),It.useEffect(()=>{var x;(x=R.current)==null||x.syncCinemaStart(e.cinemaActive)},[e.cinemaActive]);const E=It.useRef(null),w=It.useRef(e.activeTheaterId);return It.useEffect(()=>{const x=R.current;if(!x)return;const S=e.slewRequest;if(S&&S.nonce!==E.current){E.current=S.nonce,w.current=S.targetTheaterId,x.triggerSlew(S.targetTheaterId);return}e.activeTheaterId!==w.current&&(w.current=e.activeTheaterId,x.triggerSlew(e.activeTheaterId))},[e.activeTheaterId,e.slewRequest]),It.useEffect(()=>{const x=e.activeRun,S=R.current;if(!x||!S)return;let A=!1;const B=S.takeRunBundle(x.run_id);if(B){S.activateBundle(B,B.regionId!==S.onScreenRegionId());return}return(async()=>{var C;try{const P=S.bundleCache.get(x.region.id),U=Lu(Eh(x.assets.terrain_pack))!==null,G=x.assets.dem_hires_f32_url&&!U?Na(g.current,x.assets.dem_hires_f32_url):null,_=Na(g.current,x.assets.dem_f32_url),Y=Na(g.current,x.assets.satellite_url),Z=!!(g.current.filmMove??ju())||U,ge=Na(g.current,x.assets.reconstruction_u8_url),we=x.source==="firms",Ae=async()=>{if(G){const Ht=await fetch(G).catch(()=>null);if(Ht&&Ht.ok)return Ht.arrayBuffer()}const $e=await fetch(_).catch(()=>null);return $e&&$e.ok?$e.arrayBuffer():null},be=()=>new Promise($e=>{if(Z){$e(null);return}S.texLoader.load(Y,Ht=>{Ht.colorSpace=ht,Ht.anisotropy=S.maxAnisotropy,Ht.minFilter=Za,Ht.magFilter=Be,Ht.wrapS=We,Ht.wrapT=We,$e(Ht)},void 0,()=>$e(null))}),[Me,pe,dt]=await Promise.all([Ae(),be(),we?Promise.resolve(null):fetch(ge).catch(()=>null)]),ce=dt&&dt.ok?await dt.arrayBuffer():null;if(A)return;const ae=rh(x.region.id)?jo[x.region.id]:null,Rt=x.region.bbox,At=x.observer_passes?Nd(x.observer_passes,Rt):zr(),Ot=At.dataSource==="firms",ie=[],m=P&&!(Ot&&P.noRealGround)?P:void 0,He=P&&!(Ot&&P.noRealPicture)?P:void 0;Ot&&!Me&&!m&&ie.push("elevation"),Ot&&!pe&&!He&&!Z&&ie.push("imagery"),Ot&&!ce&&!we&&ie.push("field");const at=Me?Cs(new Float32Array(Me),!0):m?{texture:m.demTex,aligned:m.alignedDem,gridRes:m.demGridRes,minElev:m.minElevM,maxElev:m.maxElevM}:Cs(Ot?new Float32Array(4096).fill(Number.isFinite(x.region.min_elev_m)?x.region.min_elev_m:0):nu("plumas_ca",256),!1),ia=ce?lu(new Uint8Array(ce),!0):Ot||!P?{buffer:Nr(),frames:oo}:{buffer:P.tensor,frames:P.frameCount},aa=pe??(He==null?void 0:He.satTex)??(Ot?ev():null)??ru(ae?ae.id:"plumas_ca",at.aligned,at.gridRes,at.minElev,at.maxElev,S.maxAnisotropy),_t=pe&&typeof((C=pe.image)==null?void 0:C.width)=="number"?pe.image.width:2048,na=jr(x.region.id,Rt,at.aligned,at.gridRes,ia.buffer,ia.frames),ha=x.region.min_elev_m<=1.5,Ne={key:`run-${x.run_id}`,regionId:x.region.id,runId:x.run_id,missingFiles:ie.length>0?ie:void 0,demTex:at.texture,alignedDem:at.aligned,demGridRes:at.gridRes,minElevM:Number.isFinite(x.region.min_elev_m)?Math.min(at.minElev,x.region.min_elev_m):at.minElev,maxElevM:Number.isFinite(x.region.max_elev_m)?Math.max(at.maxElev,x.region.max_elev_m):at.maxElev,satTex:aa,orthoLabel:pe?_t>=1600?"2K":"1K":(He==null?void 0:He.orthoLabel)??(Ot?"not loaded":"drawn stand-in"),demLabel:Me||m||!Ot?`${at.gridRes}²`:"not loaded",noRealGround:Me?void 0:m?m.noRealGround:!0,noRealPicture:pe?void 0:He?He.noRealPicture:!0,tensor:ia.buffer,frameCount:ia.frames,bbox:Rt,windDirUv:[...Dv],hasSeaCoast:ha,observerDataset:At,findings:na.anchors,callouts:na.callouts,fieldScale:Ud(x.encoding),residenceHours:zd(x.model)??void 0,declared:wr(x.declared_cells),answeredByOther:Jp(x),fireHistory:null,...$r(Math.max(18,x.region.width_km||60),Math.max(12,x.region.depth_km||Cr(Rt)),x.assets.terrain_pack,_t,pe?ch:(He==null?void 0:He.attribution)??"")};S.storeRunBundle(x.region.id,x.run_id,Ne),we&&S.whenPictureReady(()=>{fetch(ge).then($e=>$e.ok?$e.arrayBuffer():null).then($e=>{if(!$e)return;const Ht=lu(new Uint8Array($e),!0);S.patchRunTensor(x.run_id,Ht.buffer,Ht.frames)}).catch(()=>{})});const nt=Bd(x.belief_frames),ft=M.current,wa=nt&&!ft.has(x.run_id)?[...ft.values()].find($e=>$e.info.url===nt.url&&$e.info.steps===nt.steps):void 0;if(nt&&wa)for(ft.set(x.run_id,{info:nt,bytes:wa.bytes,declared:wr(x.declared_cells)});ft.size>6;)ft.delete(ft.keys().next().value);nt&&!ft.has(x.run_id)&&S.whenPictureReady(()=>{ft.has(x.run_id)||fetch(Na(g.current,nt.url)).then($e=>$e.ok?$e.arrayBuffer():null).then($e=>{if(!$e||$e.byteLength!==nt.steps*nt.nx*nt.ny*2){b.current.add(x.run_id);return}for(ft.set(x.run_id,{info:nt,bytes:new Uint8Array($e),declared:wr(x.declared_cells)});ft.size>6;)ft.delete(ft.keys().next().value)}).catch(()=>{b.current.add(x.run_id)})});const da=g.current.activeTheaterId;(!rh(x.region.id)||x.region.id===da)&&S.activateBundle(Ne,!0)}catch{}})(),()=>{A=!0}},[e.activeRun,e.apiBase]),Zt.jsxs("div",{ref:t,tabIndex:0,role:"application","aria-label":"3D terrain of the place, with the fire on it",onKeyDown:x=>{var S;!e.inWorkspace&&x.key==="Enter"&&((S=e.onEnterWorkspace)==null||S.call(e))},style:{position:"relative",width:"100%",height:"100%",overflow:"hidden",outline:"none",backgroundColor:"#080b11",cursor:e.inWorkspace?"grab":"pointer"},children:[Zt.jsxs("div",{"aria-hidden":!e.inWorkspace||e.cleanHud||e.cinemaActive,style:{position:"absolute",inset:0,pointerEvents:"none",zIndex:5},children:[Zt.jsxs("svg",{width:"100%",height:"100%",style:{position:"absolute",inset:0,overflow:"visible",pointerEvents:"none"},children:[[0,1,2].map(x=>Zt.jsx("polyline",{ref:S=>{o.current[x]=S},fill:"none",stroke:d[x]&&e.selectedFindingId===d[x].id?"rgba(155, 227, 255, 0.88)":"rgba(245, 246, 250, 0.34)",strokeWidth:"1",style:{opacity:0,transition:"stroke 160ms ease"}},x)),Zt.jsxs("g",{ref:h,className:"stage-scale",style:{opacity:0},children:[Zt.jsx("path",{ref:r,fill:"none",stroke:"rgba(243, 244, 246, 0.72)",strokeWidth:"1"}),Zt.jsx("text",{ref:c,fill:"rgba(243, 244, 246, 0.92)",stroke:"rgba(8, 11, 17, 0.72)",strokeWidth:"3",style:{fontFamily:"'IBM Plex Mono', ui-monospace, monospace",fontSize:"12px",paintOrder:"stroke"}})]})]}),[0,1,2].map(x=>{const S=d[x],A=!!(S&&e.selectedFindingId===S.id),B=(S==null?void 0:S.kind)==="uncertainty"?"#9be3ff":(S==null?void 0:S.kind)==="subpixel"?"#ffb36b":"#ff7849";return Zt.jsxs("div",{children:[Zt.jsx("div",{ref:C=>{i.current[x]=C},style:{position:"absolute",top:0,left:0,width:"14px",height:"14px",display:"flex",alignItems:"center",justifyContent:"center",color:B,fontFamily:"'IBM Plex Mono', ui-monospace, monospace",fontSize:"13px",fontWeight:600,lineHeight:1,textShadow:"0 1px 6px rgba(0, 0, 0, 0.9)",opacity:0,willChange:"transform, opacity"},children:"+"}),Zt.jsxs("button",{ref:C=>{l.current[x]=C},type:"button","data-stage-ui":"true",onClick:()=>{var C;S&&((C=e.onSelectFinding)==null||C.call(e,S))},style:{position:"absolute",top:0,left:0,minWidth:"188px",maxWidth:"248px",padding:"7px 10px",textAlign:"left",borderRadius:0,border:A?`1px solid ${B}`:"1px solid rgba(243, 244, 246, 0.24)",background:"rgba(10, 13, 19, 0.88)",color:"#f3f4f6",cursor:"pointer",opacity:0,visibility:"hidden",pointerEvents:"none",willChange:"transform, opacity"},children:[Zt.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"6px",fontFamily:"'Geist', -apple-system, sans-serif",fontSize:"13px",fontWeight:500,letterSpacing:"-0.01em",color:"#f3f4f6"},children:[Zt.jsx("span",{children:(S==null?void 0:S.title)??""}),Zt.jsx("span",{style:{width:"6px",height:"6px",borderRadius:0,backgroundColor:B,flexShrink:0}})]}),Zt.jsx("div",{style:{marginTop:"3px",fontFamily:"'IBM Plex Mono', ui-monospace, monospace",fontSize:"12px",fontVariantNumeric:"tabular-nums",color:B},children:(S==null?void 0:S.valueText)??""})]})]},x)})]}),Zt.jsx("div",{ref:a,"aria-hidden":"true","data-stage-cover":"",style:{position:"absolute",inset:0,zIndex:5,backgroundColor:"var(--sys-night, #080b11)",pointerEvents:"none"},children:Zt.jsx("div",{style:{position:"absolute",left:"50%",top:"50%",width:"240px",height:"1px",marginLeft:"-120px",background:"rgba(255, 255, 255, 0.10)"},children:Zt.jsx("div",{ref:s,style:{width:"100%",height:"100%",background:"rgba(255, 255, 255, 0.86)",transform:"scaleX(0)",transformOrigin:"left center"}})})})]})}export{Zv as EarthCutawayStage,Zv as default};

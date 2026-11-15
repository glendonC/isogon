const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/GLTFLoader-C8Ag2Ruc.js","assets/three.module-CibWwfTb.js","assets/DRACOLoader-LNaB3iNp.js"])))=>i.map(i=>d[i]);
var ed=Object.defineProperty;var td=(e,t,a)=>t in e?ed(e,t,{enumerable:!0,configurable:!0,writable:!0,value:a}):e[t]=a;var F=(e,t,a)=>td(e,typeof t!="symbol"?t+"":t,a);import{B as cr,_ as Zc,r as Ft,D as ad,E as Qc,H as sd,j as qt,I as od}from"./index-b3Mnzz1E.js";import{S as mo,O as Qr,W as Zt,C as We,R as no,L as Be,H as Ca,a as Dt,b as Rt,M as Ma,P as en,c as D,D as Sa,d as aa,e as th,F as Jr,N as po,f as id,g as ct,U as Ot,B as tn,h as ma,i as ah,V as W,j as Jc,k as La,I as nd,T as el,l as Ya,m as Ne,n as da,o as ur,p as rd,q as ld,r as Pe,s as an,t as qi,u as ao,v as Cs,w as cd,E as tl,x as sh,y as Us,z as al,A as sl,G as oh,J as ud,K as hd,Q as ih,X as dd,Y as ro,Z as eo,_ as fd,$ as md,a0 as pd,a1 as vd,a2 as gd,a3 as hr,a4 as xd,a5 as wd,a6 as nh,a7 as Bo,a8 as dr,a9 as Md,aa as yd,ab as bd,ac as Sd,ad as Td,ae as Ed}from"./three.module-CibWwfTb.js";import{n as Rd,p as Ad,a as kd,b as _d,D as to,f as Zi,c as rh}from"./types-CZu1tyoc.js";const $i=6360,ol=60,lh=8,ch=1.2,lo=[.005802,.013558,.0331],Fd=.003996,ji=.00444,co=[65e-5,.001881,85e-6],Dd=.8,ls=64,Ls=32,uo=-.2,Pd=192,Id=108,ho=[5.25,5.05,4.8],Cd=.4,fr=.4,Ld=.72;function Nd(e){return Math.max(0,1-Math.abs(e-25)/15)}function uh(e,t){const a=$i+e,s=$i+ol,o=a*a*(t*t-1)+s*s,i=Math.max(0,-a*t+Math.sqrt(Math.max(0,o))),l=48,u=i/l;let r=0,c=0,d=0;for(let p=0;p<l;p++){const M=(p+.5)*u,y=Math.max(0,Math.sqrt(a*a+M*M+2*a*M*t)-$i);r+=Math.exp(-y/lh)*u,c+=Math.exp(-y/ch)*u,d+=Nd(y)*u}return[lo[0]*r+ji*c+co[0]*d,lo[1]*r+ji*c+co[1]*d,lo[2]*r+ji*c+co[2]*d]}function hh(e,t){const a=uh(Math.max(0,e),Math.max(uo,t));return[Math.exp(-a[0]),Math.exp(-a[1]),Math.exp(-a[2])]}function zd(e,t,a){const s=hh(e,t),o=[1.404,1.287,1.17];return a.set(.5*o[0]+.5*ho[0]*s[0]/Math.PI,.5*o[1]+.5*ho[1]*s[1]/Math.PI,.5*o[2]+.5*ho[2]*s[2]/Math.PI)}function Ud(){const e=new Uint16Array(ls*Ls*4);for(let a=0;a<Ls;a++){const s=a/(Ls-1),o=s*s*ol;for(let i=0;i<ls;i++){const l=uo+i/(ls-1)*(1-uo),u=uh(o,l),r=(a*ls+i)*4;e[r]=Sa.toHalfFloat(Math.exp(-u[0])),e[r+1]=Sa.toHalfFloat(Math.exp(-u[1])),e[r+2]=Sa.toHalfFloat(Math.exp(-u[2])),e[r+3]=Sa.toHalfFloat(1)}}const t=new aa(e,ls,Ls,Dt,Ca);return t.minFilter=Be,t.magFilter=Be,t.wrapS=We,t.wrapT=We,t.generateMipmaps=!1,t.flipY=!1,t.needsUpdate=!0,t}function Mt(e){const t=e.toPrecision(8);return/[.e]/.test(t)?t:`${t}.0`}const sn=`
const float ATM_RG = ${Mt($i)};
const float ATM_TOP = ${Mt(ol)};
const float ATM_HR = ${Mt(lh)};
const float ATM_HM = ${Mt(ch)};
const vec3 ATM_BETA_R = vec3(${Mt(lo[0])}, ${Mt(lo[1])}, ${Mt(lo[2])});
const float ATM_BETA_MS = ${Mt(Fd)};
const float ATM_BETA_ME = ${Mt(ji)};
const vec3 ATM_BETA_O = vec3(${Mt(co[0])}, ${Mt(co[1])}, ${Mt(co[2])});
const vec3 ATM_SUN = vec3(${Mt(ho[0])}, ${Mt(ho[1])}, ${Mt(ho[2])});
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
  const float g = ${Mt(Dd)};
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
`,dh=`
uniform sampler2D uTransmittanceLut;

vec3 atmTransmittanceToSpace(float hKm, float mu) {
  float u = (clamp(mu, ${Mt(uo)}, 1.0) - (${Mt(uo)})) / ${Mt(1-uo)};
  float v = sqrt(clamp(hKm / ATM_TOP, 0.0, 1.0));
  vec2 uv = vec2(u * ${Mt((ls-1)/ls)} + ${Mt(.5/ls)}, v * ${Mt((Ls-1)/Ls)} + ${Mt(.5/Ls)});
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
`,Bd=`
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`,Od=`
${sn}
${dh}
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
`,Hd=`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,Gd=`
${sn}
${dh}
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
`;class Kd{constructor(){F(this,"transmittance");F(this,"skyView");F(this,"scene",new mo);F(this,"camera",new Qr(-1,1,1,-1,0,1));F(this,"material");F(this,"quad");F(this,"lastSunSin",9);F(this,"lastAltKm",-9);this.transmittance=Ud(),this.skyView=new Zt(Pd,Id,{format:Dt,type:Ca,depthBuffer:!1,stencilBuffer:!1,minFilter:Be,magFilter:Be,generateMipmaps:!1,wrapS:no,wrapT:We}),this.material=new Rt({vertexShader:Bd,fragmentShader:Od,uniforms:{uTransmittanceLut:{value:this.transmittance},uSunSin:{value:.5},uCamAltKm:{value:5}},depthTest:!1,depthWrite:!1,toneMapped:!1}),this.quad=new Ma(new en(2,2),this.material),this.quad.frustumCulled=!1,this.scene.add(this.quad)}update(t,a,s){const o=D.clamp(a.y,-.15,1);if(Math.abs(o-this.lastSunSin)<1e-4&&Math.abs(s-this.lastAltKm)<.02)return;this.lastSunSin=o,this.lastAltKm=s,this.material.uniforms.uSunSin.value=o,this.material.uniforms.uCamAltKm.value=s;const i=t.getRenderTarget();t.setRenderTarget(this.skyView),t.render(this.scene,this.camera),t.setRenderTarget(i)}dispose(){this.transmittance.dispose(),this.skyView.dispose(),this.material.dispose(),this.quad.geometry.dispose()}}const jo=14.8,Xo=10.8,fh=511,Ns=-.44,Ke=256,so=24,Wd=80,Vd=24,cs=["plumas_ca","lytton_bc","evia_greece","blue_mountains_au"],Vo={plumas_ca:{id:"plumas_ca",bbox:[-121.6,39.75,-120.75,40.35],widthKm:72.5,minElevM:313,maxElevM:2357,windDirUv:[.68,.73],paletteBase:[.14,.21,.14],paletteRidge:[.44,.43,.4],hasSeaCoast:!1},lytton_bc:{id:"lytton_bc",bbox:[-121.95,49.95,-121.2,50.52],widthKm:54,minElevM:195,maxElevM:2860,windDirUv:[.42,.91],paletteBase:[.24,.22,.16],paletteRidge:[.56,.54,.52],hasSeaCoast:!1},evia_greece:{id:"evia_greece",bbox:[23.02,38.62,23.62,39.12],widthKm:52,minElevM:0,maxElevM:1385,windDirUv:[-.62,-.78],paletteBase:[.27,.3,.2],paletteRidge:[.64,.6,.52],hasSeaCoast:!0},blue_mountains_au:{id:"blue_mountains_au",bbox:[150.02,-33.92,150.74,-33.32],widthKm:66,minElevM:68,maxElevM:1215,windDirUv:[.79,-.61],paletteBase:[.15,.22,.17],paletteRidge:[.54,.38,.27],hasSeaCoast:!1}};function Yd(e){const t=cs.indexOf(e);return t>=0?t:0}function $d(){const e=new Uint8Array(1024);for(let a=0;a<256;a++)e[a*4]=cr[a*3],e[a*4+1]=cr[a*3+1],e[a*4+2]=cr[a*3+2],e[a*4+3]=255;const t=new aa(e,256,1,Dt,Ot);return t.colorSpace=ct,t.minFilter=Be,t.magFilter=Be,t.wrapS=We,t.wrapT=We,t.needsUpdate=!0,t}function Is(e,t=!0){const a=Math.max(2,Math.floor(Math.sqrt(e.length))),s=a*a,o=new Float32Array(s);let i=Number.POSITIVE_INFINITY,l=Number.NEGATIVE_INFINITY;for(let r=0;r<a;r++){const d=(t?a-1-r:r)*a,p=r*a;for(let M=0;M<a;M++){const y=Number.isFinite(e[d+M])?e[d+M]:0;o[p+M]=y,y<i&&(i=y),y>l&&(l=y)}}Number.isFinite(i)||(i=0),(!Number.isFinite(l)||l<=i+1)&&(l=i+1e3);const u=new aa(o,a,a,th,Jr);return u.internalFormat="R32F",u.minFilter=po,u.magFilter=po,u.wrapS=We,u.wrapT=We,u.flipY=!1,u.generateMipmaps=!1,u.needsUpdate=!0,{texture:u,aligned:o,gridRes:a,minElev:i,maxElev:l}}function eu(e,t=256){const a=Vo[e],s=new Float32Array(t*t),o=Yd(e)*2.35;for(let i=0;i<t;i++){const u=(1-i/(t-1)-.5)*2;for(let r=0;r<t;r++){const d=(r/(t-1)-.5)*2,p=.24*Math.sin(u*2.7+o)+.11*Math.cos(u*5.6-o),M=Math.abs(d*.88-p),y=Math.pow(Math.min(1.3,M*1.18),.78),g=1-Math.abs(Math.sin(d*4.4+u*3.1+o)),R=1-Math.abs(Math.cos(d*8.9-u*7.4-o*.6)),E=.5+.5*Math.sin(d*18.5+u*16.2+o*1.3);let w=y*(.58+.28*g*g+.11*R+.04*E);if(a.hasSeaCoast){const x=1-Math.max(0,Math.hypot(d*.92,u*.84)-.62)*1.9;w=Math.max(0,w*x-.08)}s[i*t+r]=a.minElevM+Math.max(0,Math.min(1.05,w))*(a.maxElevM-a.minElevM)}}return s}function tu(e,t,a,s,o,i){const l=Vo[e],u=512,r=document.createElement("canvas");r.width=u,r.height=u;const c=r.getContext("2d");if(c){const p=c.createImageData(u,u),M=p.data,y=Math.max(100,o-s);for(let g=0;g<u;g++){const R=1-g/(u-1),E=Math.min(a-1,Math.max(0,Math.round(R*(a-1)))),w=Math.min(a-1,E+1);for(let x=0;x<u;x++){const S=x/(u-1),k=Math.min(a-1,Math.max(0,Math.round(S*(a-1)))),U=Math.min(a-1,k+1),C=t[E*a+k],P=t[E*a+U],z=t[w*a+k],G=Math.max(0,Math.min(1,(C-s)/y)),_=Math.min(1,Math.hypot(P-C,z-C)/48),V=.92+.08*Math.sin(x*.47+g*.31)*Math.cos(x*.19-g*.53);let q,we,Se;if(l.hasSeaCoast&&C<=2.2)q=.05,we=.14+.04*V,Se=.24+.05*V;else{const ne=Math.min(1,Math.max(0,G*.72+_*.55));if(q=(l.paletteBase[0]*(1-ne)+l.paletteRidge[0]*ne)*V,we=(l.paletteBase[1]*(1-ne)+l.paletteRidge[1]*ne)*V,Se=(l.paletteBase[2]*(1-ne)+l.paletteRidge[2]*ne)*V,l.maxElevM>2200&&G>.84){const Te=(G-.84)/.16;q=q*(1-Te*.55)+.78*Te*.55,we=we*(1-Te*.55)+.8*Te*.55,Se=Se*(1-Te*.55)+.84*Te*.55}}const ye=(g*u+x)*4;M[ye]=Math.min(255,Math.max(0,Math.round(q*255))),M[ye+1]=Math.min(255,Math.max(0,Math.round(we*255))),M[ye+2]=Math.min(255,Math.max(0,Math.round(Se*255))),M[ye+3]=255}}c.putImageData(p,0,0)}const d=new id(r);return d.colorSpace=ct,d.anisotropy=i,d.wrapS=We,d.wrapT=We,d.needsUpdate=!0,d}function jd(e,t=!0){const a=Ke*Ke*4,s=Math.max(1,Math.floor(e.byteLength/a));if(!t)return{buffer:e.slice(0,s*a),frames:s};const o=new Uint8Array(s*a),i=Ke*4;for(let l=0;l<s;l++){const u=l*a;for(let r=0;r<Ke;r++){const c=u+(Ke-1-r)*i,d=u+r*i;o.set(e.subarray(c,c+i),d)}}return{buffer:o,frames:s}}const rn=`
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
`;function au(e=fh){const a=(e+1)*2*4,s=e*6*4,o=new Float32Array(a*3),i=new Float32Array(a*3),l=new Float32Array(a*4),u=new Uint32Array(s),r=[{normal:[0,0,1],evalUv:M=>[M,0]},{normal:[1,0,0],evalUv:M=>[1,M]},{normal:[0,0,-1],evalUv:M=>[1-M,1]},{normal:[-1,0,0],evalUv:M=>[0,1-M]}];let c=0,d=0;for(let M=0;M<4;M++){const y=r[M],g=c;for(let R=0;R<=e;R++){const E=R/e,[w,x]=y.evalUv(E),S=(w-.5)*jo,k=(.5-x)*Xo,U=M+E;o[c*3]=S,o[c*3+1]=0,o[c*3+2]=k,i[c*3]=y.normal[0],i[c*3+1]=y.normal[1],i[c*3+2]=y.normal[2],l[c*4]=w,l[c*4+1]=x,l[c*4+2]=1,l[c*4+3]=U,c++,o[c*3]=S,o[c*3+1]=Ns,o[c*3+2]=k,i[c*3]=y.normal[0],i[c*3+1]=y.normal[1],i[c*3+2]=y.normal[2],l[c*4]=w,l[c*4+1]=x,l[c*4+2]=0,l[c*4+3]=U,c++}for(let R=0;R<e;R++){const E=g+R*2,w=E+1,x=E+2,S=E+3;u[d++]=E,u[d++]=w,u[d++]=x,u[d++]=x,u[d++]=w,u[d++]=S}}const p=new tn;return p.setAttribute("position",new ma(o,3)),p.setAttribute("normal",new ma(i,3)),p.setAttribute("aSkirtParam",new ma(l,4)),p.setIndex(new ma(u,1)),p.boundingSphere=new ah(new W(0,.8,0),14),p}const Xd=`
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

  float wy = mix(${Ns.toFixed(2)}, surfY, isTop);
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
`,qd=`
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
  float wallSpan = max(0.08, vSurfaceY - (${Ns.toFixed(2)}));
  float hFrac = clamp((vWorldY - (${Ns.toFixed(2)})) / wallSpan, 0.0, 1.0);

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
  float baseRule = 1.0 - smoothstep(0.0, 0.014, vWorldY - (${Ns.toFixed(2)}));
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
`,Zd=`
varying vec3 vLocalPos;
varying vec3 vWorldPos;

void main() {
  vLocalPos = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,Qd=`
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
`;function Jd(e){return Math.max(0,Math.min(e-1,Math.floor((e-1)*.52)))}const ef=11,tf=.42,af=8;function sf(e,t,a,s,o,i){const[l,u,r,c]=t,d=o.gridSize,p=Jd(s),M=p*d*d*4,y=`pass ${p+1}`;let g=!1,R={gx:Math.round(d*.5),gy:Math.round(d*.5),zMw:0};for(let _=14;_<d-14;_+=2)for(let V=14;V<d-14;V+=2){const q=a[M+(_*d+V)*4]/255*o.zMaxMwKm2;q>R.zMw&&(R={gx:V,gy:_,zMw:q},g=!0)}let E=!1,w=-1/0,x={gx:Math.round(d*.375),gy:Math.round(d*.42),zMw:0,modisMw:0};for(let _=14;_<d-14;_+=2)for(let V=14;V<d-14;V+=2){const q=M+(_*d+V)*4,we=a[q]/255*o.zMaxMwKm2,Se=a[q+2]/255*o.zMaxMwKm2,ye=Math.hypot(V-R.gx,_-R.gy);if(we>=ef&&Se<we*tf&&ye>24){const ne=i(V/(d-1),_/(d-1)),Te=we-Se*1.25-ne*6e-4;Te>w&&(w=Te,x={gx:V,gy:_,zMw:we,modisMw:Se},E=!0)}}let S=!1,k={gx:Math.round(d*.640625),gy:Math.round(d*.40625),sigmaMw:0};for(let _=14;_<d-14;_+=2)for(let V=14;V<d-14;V+=2){const q=M+(_*d+V)*4,we=a[q]/255*o.zMaxMwKm2,Se=a[q+1]/255*o.sigmaMaxMwKm2,ye=Math.hypot(V-R.gx,_-R.gy),ne=Math.hypot(V-x.gx,_-x.gy);we>=af&&Se>k.sigmaMw&&ye>28&&ne>24&&(k={gx:V,gy:_,sigmaMw:Se},S=!0)}const U=(_,V,q,we,Se,ye,ne)=>{const Te=q/(d-1),Re=we/(d-1);return{id:`${e}-${_}`,kind:V,title:Se,subtitle:ye,valueText:ne,lat:u+Re*(c-u),lon:l+Te*(r-l),elevM:Math.round(i(Te,Re))}},C=U("front-core","front",R.gx,R.gy,g?"Strongest estimate":"",g?`Highest value of the simulated 375 m estimate at ${y}`:"",g?`${R.zMw.toFixed(1)} MW/km², ${y}`:""),P=U("canyon-subpixel","subpixel",x.gx,x.gy,E?"Estimate above MODIS":"",E?`Simulated estimate where the simulated MODIS pass reads far less, at ${y}`:"",E?`${x.zMw.toFixed(1)} MW/km², MODIS ${x.modisMw.toFixed(1)} MW/km², ${y}`:""),z=U("sigma-peak","uncertainty",k.gx,k.gy,S?"Least certain estimate":"",S?`One standard deviation of the simulated estimate at ${y}`:"",S?`±${k.sigmaMw.toFixed(1)} MW/km² (1 sigma), ${y}`:""),G=[];return g&&G.push(C),E&&G.push(P),S&&G.push(z),{anchors:[C,P,z],callouts:G}}const of=1,nf=2,rf=3,su=24*3600*1e3;function lf(e,t,a,s){const o=new Uint8Array(e.length);for(let i=0;i<e.length;i++){const l=e[i];if(!(l>=1))continue;const u=t+(l-1)*su,r=u+su;o[i]=r<=a?of:u>=s?rf:nf}return o}function cf(e,t,a,s=.375,o){if(o&&o.length===4&&o.every(p=>Number.isFinite(p))&&o[2]>o[0]&&o[3]>o[1])return[o[0],o[1],o[2],o[3]];const[i,l,,u]=e,r=(l+u)/2*(Math.PI/180),c=s/111.132,d=s/(111.132*Math.cos(r));return[i,l,i+t*d,l+a*c]}function uf(e,t){const a=Math.max(1e-9,t[2]-t[0]),s=Math.max(1e-9,t[3]-t[1]);return[(e[2]-e[0])/a,(e[3]-e[1])/s,(e[0]-t[0])/a,(e[1]-t[1])/s]}const Tt={azimuth:.5,polar:.98,distance:17.2,target:[.1,.3,.2]},ou={overview:{azimuth:.48,polar:.97,distance:17,target:[-.6,.3,.3]},canyon:{azimuth:-.34,polar:1.24,distance:5.6,target:[-.42,.45,-.22]},ridge:{azimuth:.86,polar:1.12,distance:7.4,target:[.32,.6,-.14]},nadir:{azimuth:0,polar:.14,distance:18.5,target:[0,.3,0]},region:{azimuth:.48,polar:.75,distance:17,target:[-.3,.3,.2]}},hf={azimuth:0,polar:.42,distance:12,target:[0,.3,0]};function iu(e,t,a,s,o=!1){if(!t)return Tt;const i=e==="region"&&o?hf:ou[e]??ou.overview;return a==="observer"&&e==="overview"?{azimuth:i.azimuth,polar:.98,distance:18.4,target:[0,.7,.2]}:{azimuth:i.azimuth,polar:i.polar,distance:i.distance,target:[i.target[0],i.target[1],i.target[2]]}}function mh(e){const t=Math.min(1,Math.max(0,e));return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)*.5}const Yo=.95;class df{constructor(){F(this,"active",!1);F(this,"elapsedSec",0);F(this,"durationSec",Yo);F(this,"startAzimuth",Tt.azimuth);F(this,"endAzimuth",Tt.azimuth);F(this,"startPolar",Tt.polar);F(this,"endPolar",Tt.polar);F(this,"startDistance",Tt.distance);F(this,"endDistance",Tt.distance);F(this,"startTarget",new W(...Tt.target));F(this,"endTarget",new W(...Tt.target));F(this,"hopHeightDist",2.15)}trigger(t,a,s=2.15,o=Yo){this.active=!0,this.elapsedSec=0,this.durationSec=Math.max(.25,o),this.startAzimuth=t.azimuth;let i=a.azimuth-t.azimuth;for(;i>Math.PI;)i-=Math.PI*2;for(;i<-Math.PI;)i+=Math.PI*2;this.endAzimuth=t.azimuth+i,this.startPolar=t.polar,this.endPolar=a.polar,this.startDistance=t.distance,this.endDistance=a.distance,this.startTarget.copy(t.target),this.endTarget.set(a.target[0],a.target[1],a.target[2]),this.hopHeightDist=s}cancel(){this.active=!1}isActive(){return this.active}step(t,a){if(!this.active)return{slewActive:!1,rawProgress:1,easedProgress:1};this.elapsedSec+=Math.min(.08,Math.max(0,t));const s=Math.min(1,this.elapsedSec/this.durationSec),o=mh(s),i=Math.sin(s*Math.PI);return a.azimuth=D.lerp(this.startAzimuth,this.endAzimuth,o),a.polar=D.clamp(D.lerp(this.startPolar,this.endPolar,o)-i*.085,.1,1.38),a.distance=D.lerp(this.startDistance,this.endDistance,o)+i*this.hopHeightDist,a.target.lerpVectors(this.startTarget,this.endTarget,o),s>=1&&(this.active=!1),{slewActive:this.active,rawProgress:s,easedProgress:o}}}function ff(e){const t=e%2===0?1:-1,a=e>=2?-1:1,s=[new W(6.6*t,7.6,7.8*a),new W(4.2*t,3.3,5.1*a),new W(1.1*t,1.85,2.5*a),new W(-2.3*t,1.72,.15*a),new W(-4.6*t,2.65,-2.4*a),new W(-1.8*t,4.45,-4.6*a),new W(3.6*t,6.45,-2.2*a),new W(6.8*t,7.9,3.8*a)],o=[new W(0,.65,0),new W(-.35*t,.85,.45*a),new W(-1.35*t,1.05,-.55*a),new W(-1.85*t,1.12,-1.35*a),new W(-.65*t,1.02,-.85*a),new W(.25*t,.88,-.15*a),new W(.1*t,.72,.15*a),new W(0,.65,0)];return{eyeCurve:new Jc(s,!0,"catmullrom",.5),lookCurve:new Jc(o,!0,"catmullrom",.5)}}const Oo=13.5;class mf{constructor(){F(this,"rigs");F(this,"elapsedSec",0);F(this,"currentLegIndex",0);F(this,"tmpEye",new W);F(this,"tmpEyeAhead",new W);F(this,"tmpEyeBehind",new W);F(this,"tmpLook",new W);F(this,"tmpVelA",new W);F(this,"tmpVelB",new W);F(this,"tmpForward",new W);F(this,"tmpRight",new W);F(this,"tmpUp",new W(0,1,0));F(this,"worldUp",new W(0,1,0));this.rigs=[0,1,2,3].map(t=>ff(t))}startAtTheater(t){const a=Math.max(0,cs.indexOf(t));this.currentLegIndex=a,this.elapsedSec=a*Oo}update(t,a,s,o=jo,i=Xo){const l=Math.min(.08,Math.max(0,t));this.elapsedSec+=l;const u=Oo*cs.length,r=(this.elapsedSec%u+u)%u,c=Math.min(cs.length-1,Math.floor(r/Oo)),d=(r-c*Oo)/Oo;c!==this.currentLegIndex&&(this.currentLegIndex=c,s==null||s(cs[c]));const p=this.rigs[c],M=.008,y=(d-M+1)%1,g=(d+M)%1;p.eyeCurve.getPointAt(d,this.tmpEye),p.eyeCurve.getPointAt(y,this.tmpEyeBehind),p.eyeCurve.getPointAt(g,this.tmpEyeAhead),p.lookCurve.getPointAt(d,this.tmpLook);const R=this.tmpEye.x/o+.5,E=.5-this.tmpEye.z/i;if(R>=-.02&&R<=1.02&&E>=-.02&&E<=1.02){const G=a(Math.min(1,Math.max(0,R)),Math.min(1,Math.max(0,E)))+.78;this.tmpEye.y<G&&(this.tmpEye.y=G)}const w=this.tmpLook.x/o+.5,x=.5-this.tmpLook.z/i,S=a(Math.min(1,Math.max(0,w)),Math.min(1,Math.max(0,x)));this.tmpLook.y=Math.max(this.tmpLook.y,S+.18),this.tmpVelA.subVectors(this.tmpEye,this.tmpEyeBehind).setY(0),this.tmpVelB.subVectors(this.tmpEyeAhead,this.tmpEye).setY(0);let k=0;if(this.tmpVelA.lengthSq()>1e-6&&this.tmpVelB.lengthSq()>1e-6){this.tmpVelA.normalize(),this.tmpVelB.normalize();const z=this.tmpVelA.x*this.tmpVelB.z-this.tmpVelA.z*this.tmpVelB.x;k=D.clamp(z*1.45,-.11,.11)}this.tmpForward.subVectors(this.tmpLook,this.tmpEye).normalize(),this.tmpRight.crossVectors(this.tmpForward,this.worldUp).normalize(),this.tmpUp.copy(this.worldUp).applyAxisAngle(this.tmpForward,k).normalize();const U=.18+.68*(.5-.5*Math.cos(d*Math.PI*2)),P=39+Math.sin(d*Math.PI)*3.2;return{position:this.tmpEye,lookAt:this.tmpLook,up:this.tmpUp,fov:P,syntheticTimeProgress:U,cycleProgress:r/u,legProgress:d,activeLegTheater:cs[c]}}}function pf(e,t,a){a.target.copy(t),a.target.x=D.clamp(a.target.x,-jo*.45,jo*.45),a.target.z=D.clamp(a.target.z,-Xo*.45,Xo*.45),a.target.y=D.clamp(a.target.y,-.1,2.2);const s=new W().subVectors(e,a.target),o=D.clamp(s.length(),4.2,26),i=D.clamp(Math.acos(D.clamp(s.y/o,-.99,.99)),.1,1.38),l=Math.atan2(s.x,s.z);a.distance=o,a.polar=i,a.azimuth=l}const Yr=.05;function vf(e,t){const a=new Uint8Array(t*t);for(let o=0;o<t;o++)for(let i=0;i<t;i++){const l=e[o*t+i];if(l===0)continue;let u=1;for(let r=-1;r<=1&&u;r++)for(let c=-1;c<=1;c++){const d=Math.min(t-1,Math.max(0,o+r)),p=Math.min(t-1,Math.max(0,i+c));if(Math.abs(e[d*t+p]-l)>Yr){u=0;break}}a[o*t+i]=u}const s=new Uint8Array(t*t);for(let o=0;o<t;o++)for(let i=0;i<t;i++){const l=e[o*t+i];if(l===0)continue;let u=a[o*t+i];for(let r=-1;r<=1&&!u;r++)for(let c=-1;c<=1;c++){const d=o+r,p=i+c;if(!(d<0||d>=t||p<0||p>=t)&&a[d*t+p]&&Math.abs(e[d*t+p]-l)<=Yr){u=1;break}}s[o*t+i]=u}return s}function il(e,t){let a=0,s=0;for(let o=1;o<t-1;o+=2)for(let i=1;i<t-1;i+=2){const l=e[o*t+i];if(l===0||!Number.isFinite(l))continue;let u=!0;for(let r=-1;r<=1&&u;r++)for(let c=-1;c<=1;c++)if(Math.abs(e[(o+r)*t+i+c]-l)>Yr){u=!1;break}u&&(a++,Math.abs(l-Math.round(l))<.02&&s++)}return a>=20&&s/a>.5}const gf=1.5;function xf(e,t){let a=new Uint8Array(t*t);for(let s=0;s<t*t;s++)a[s]=e[s]===0?1:0;for(let s=0;s<2;s++){const o=a.slice();for(let i=1;i<t-1;i++)for(let l=1;l<t-1;l++){const u=i*t+l;if(a[u]||!(e[u]<gf))continue;let r=0;for(let c=-1;c<=1;c++)for(let d=-1;d<=1;d++)r+=a[(i+c)*t+l+d];r>=5&&(o[u]=1)}a=o}return a}const wf=5,Mf=.25;function yf(e,t,a){const s=new Uint8Array(t*t),o=new Uint8Array(t*t),i=new Int32Array(t*t),l=[],u=[];let r=0;const c=d=>a[d]===0&&e[d]<wf;for(let d=0;d<t*t;d++){if(o[d]||!c(d))continue;r++;let p=0,M=0;for(u.length=0,l.push(d),o[d]=1;l.length>0;){const y=l.pop();u.push(y);const g=Math.floor(y/t),R=y-g*t;for(let E=-1;E<=1;E++){const w=g+E;if(!(w<0||w>=t))for(let x=-1;x<=1;x++){const S=R+x;if(S<0||S>=t||E===0&&x===0)continue;const k=w*t+S;c(k)?o[k]||(o[k]=1,l.push(k)):i[k]!==r&&(i[k]=r,a[k]?p++:M++)}}}if(p>0&&M<Mf*(p+M))for(const y of u)s[y]=1}return s}const nu=4,ru=1.5,bf=4;function ph(e,t){if(t<2*nu+1||e.length!==t*t)return;const a=nu;let s=new Float32Array(t*t),o=new Float32Array(t*t);for(let r=0;r<t*t;r++){const c=e[r]!==0?1:0;s[r]=e[r]*c,o[r]=c}const i=new Float32Array(t*t),l=new Float32Array(t*t),u=(r,c,d)=>{for(let p=0;p<t;p++){let M=0;const y=g=>d?p*t+g:g*t+p;for(let g=0;g<=a&&g<t;g++)M+=r[y(g)];for(let g=0;g<t;g++){c[y(g)]=M;const R=g+a+1,E=g-a;R<t&&(M+=r[y(R)]),E>=0&&(M-=r[y(E)])}}};for(let r=0;r<2;r++){u(s,i,!0),u(o,l,!0),u(i,s,!1),u(l,o,!1);for(let c=0;c<t*t;c++){const d=o[c];s[c]=d>0?s[c]/d:0,o[c]=d>0?1:0}}for(let r=0;r<t*t;r++){const c=e[r];if(c===0||o[r]===0)continue;const d=Math.min(1,Math.max(0,(Math.abs(c-s[r])-ru)/(bf-ru))),p=d*d*(3-2*d);e[r]=c+(s[r]-c)*(1-p)}}function Sf(e){const t=Math.floor(e.length/4);if(t===0)return 0;const a=o=>{const i=o/255;return i<=.04045?i/12.92:Math.pow((i+.055)/1.055,2.4)},s=new Float32Array(t);for(let o=0;o<t;o++)s[o]=.2126*a(e[o*4])+.7152*a(e[o*4+1])+.0722*a(e[o*4+2]);return s.sort(),s[Math.floor(t/2)]}function $r(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function mr(e){return $r(e)&&typeof e.url=="string"&&e.url.length>0&&typeof e.size=="number"}function lu(e){return Array.isArray(e)&&e.length===2&&e.every(t=>typeof t=="number"&&Number.isFinite(t))}function Tf(e){if(!$r(e)||e.version!==1||!mr(e.dem)||!mr(e.ortho)||!mr(e.aux)||!lu(e.extent_km)||!lu(e.elev_range_m))return null;const t=e.sun;return!$r(t)||typeof t.azimuth_deg!="number"||typeof t.elevation_deg!="number"||!Number.isFinite(t.azimuth_deg)||!Number.isFinite(t.elevation_deg)?null:e}function Xi(e,t){return new Promise(a=>{const s=new nd;s.setCrossOrigin("anonymous"),s.setOptions(t),s.load(e,o=>a(o),void 0,()=>a(null))})}function jr(e){const t=new el(e);return t.flipY=!1,t.premultiplyAlpha=!1,t.wrapS=We,t.wrapT=We,t.magFilter=Be,t.minFilter=Ya,t.generateMipmaps=!0,t.onUpdate=()=>{e.close()},t.addEventListener("dispose",()=>{e.close()}),t.needsUpdate=!0,t}async function Ef(e){let t=null;try{t=await createImageBitmap(e,{resizeWidth:256,resizeHeight:256,resizeQuality:"medium"}).catch(()=>null);const o=(typeof OffscreenCanvas<"u"?new OffscreenCanvas(256,256):Object.assign(document.createElement("canvas"),{width:256,height:256})).getContext("2d");return o?(o.imageSmoothingEnabled=!0,o.imageSmoothingQuality="high",o.drawImage(t??e,0,0,256,256),Sf(o.getImageData(0,0,256,256).data)):null}catch{return null}finally{t==null||t.close()}}async function vh(e,t){const a=await Xi(e,{imageOrientation:"flipY",premultiplyAlpha:"none"});if(!a)return null;const s=jr(a);return s.colorSpace=ct,s.anisotropy=t,s}function Rf(e,t){if(t<3||e.length!==t*t)return;const a=new Float32Array(t*t),s=1/6,o=2/3;for(let i=0;i<t;i++){const l=i*t;for(let u=0;u<t;u++){const r=e[l+(u>0?u-1:0)],c=e[l+(u<t-1?u+1:t-1)];a[l+u]=s*r+o*e[l+u]+s*c}}for(let i=0;i<t;i++){const l=(i>0?i-1:0)*t,u=(i<t-1?i+1:t-1)*t,r=i*t;for(let c=0;c<t;c++)e[r+c]=s*a[l+c]+o*a[r+c]+s*a[u+c]}}async function Af(e,t){var a,s,o;try{const i=e.ortho.size<=t.maxTextureSize,l=i?e.ortho:e.ortho_fallback??null;if(!l||l.size>t.maxTextureSize)return null;const u=fetch(t.resolveUrl(e.dem.url)).then(U=>U.ok?U.arrayBuffer():null),r=Xi(t.resolveUrl(l.url),{imageOrientation:"flipY",premultiplyAlpha:"none"}).then(async U=>U||!i||!e.ortho_fallback?{bitmap:U,size:l.size}:{bitmap:await Xi(t.resolveUrl(e.ortho_fallback.url),{imageOrientation:"flipY",premultiplyAlpha:"none"}),size:e.ortho_fallback.size}),c=Xi(t.resolveUrl(e.aux.url),{imageOrientation:"flipY",premultiplyAlpha:"none",colorSpaceConversion:"none"}),[d,p,M]=await Promise.all([u,r,c]),y=((a=t.isCancelled)==null?void 0:a.call(t))??!1,g=e.dem.size*e.dem.size*4;if(y||!d||d.byteLength!==g||e.dem.format!=="f32le"||!p.bitmap||!M)return(s=p.bitmap)==null||s.close(),M==null||M.close(),null;const R=new Float32Array(d),E=il(R,e.dem.size);E&&ph(R,e.dem.size),Rf(R,e.dem.size);const w=Is(R,!0),x=await Ef(p.bitmap);if((o=t.isCancelled)!=null&&o.call(t))return w.texture.dispose(),p.bitmap.close(),M.close(),null;const S=jr(p.bitmap);S.colorSpace=ct,S.anisotropy=t.maxAnisotropy;const k=jr(M);return k.colorSpace=La,k.anisotropy=Math.min(4,t.maxAnisotropy),{manifest:e,demTexture:w.texture,alignedDem:w.aligned,demGridRes:w.gridRes,minElevM:w.minElev,maxElevM:w.maxElev,orthoTexture:S,orthoSize:p.size,auxTexture:k,attribution:e.ortho.attribution??"",levelInWholeMetres:E,pictureMedianLuma:x,dispose:()=>{w.texture.dispose(),S.dispose(),k.dispose()}}}catch{return null}}function kf(e,t,a){const s=e*Math.PI/180,o=t*Math.PI/180;return a.set(Math.sin(s)*Math.cos(o),Math.sin(o),-Math.cos(s)*Math.cos(o)).normalize()}function _f(e,t,a){return a.set(e.x*t.x,e.y*t.y,e.z*t.z).normalize()}const qo=.085,Ff=1e6;function Df(e,t,a){const s=Ke,o=s*s,i=o*4,l=qo*255,u=new Float32Array(o).fill(Ff),r=new Float32Array(o).fill(0),c=new Float32Array(o),d=new Uint8Array(o);for(let C=0;C<o;C++){let P=-1,z=-1,G=0;for(let _=0;_<t;_++){const V=e[_*i+C*4];V>G&&(G=V),V>=l&&(P<0&&(P=_),z=_)}if(c[C]=G/255,!(P<0)){if(d[C]=1,P===0)u[C]=-.5;else{const _=e[(P-1)*i+C*4],V=e[P*i+C*4],q=V>_?(l-_)/(V-_):1;u[C]=P-1+Math.min(1,Math.max(0,q))}if(z>=t-1)r[C]=t-1+.5;else{const _=e[z*i+C*4],V=e[(z+1)*i+C*4],q=_>V?(_-l)/(_-V):0;r[C]=z+Math.min(1,Math.max(0,q))}}}let p=0,M=0;for(let C=1;C<s-1;C+=2)for(let P=1;P<s-1;P+=2){const z=C*s+P;if(!d[z]||!d[z+1]||!d[z-1]||!d[z+s]||!d[z-s])continue;const G=(u[z+1]-u[z-1])*.5,_=(u[z+s]-u[z-s])*.5,V=Math.hypot(G,_);V>.001&&V<4&&(p+=V,M++)}const y=M>16?Math.min(1.2,Math.max(.08,p/M)):.3,g=u.slice(),R=y,E=y*Math.SQRT2,w=(C,P,z)=>{const G=g[P]+z;G<g[C]&&(g[C]=G)};for(let C=0;C<2;C++){for(let P=0;P<s;P++)for(let z=0;z<s;z++){const G=P*s+z;d[G]||(z>0&&w(G,G-1,R),P>0&&w(G,G-s,R),z>0&&P>0&&w(G,G-s-1,E),z<s-1&&P>0&&w(G,G-s+1,E))}for(let P=s-1;P>=0;P--)for(let z=s-1;z>=0;z--){const G=P*s+z;d[G]||(z<s-1&&w(G,G+1,R),P<s-1&&w(G,G+s,R),z<s-1&&P<s-1&&w(G,G+s+1,E),z>0&&P<s-1&&w(G,G+s-1,E))}}let x=0;const S=t+64,k=new Float32Array(o*4);for(let C=0;C<o;C++){const P=Math.min(S,g[C]);k[C*4]=P,k[C*4+1]=d[C]?r[C]:P,k[C*4+2]=c[C],k[C*4+3]=d[C],x+=d[C]}let U;if(a)U=new aa(k,s,s,Dt,Jr);else{const C=new Uint16Array(o*4);for(let P=0;P<C.length;P++)C[P]=Sa.toHalfFloat(k[P]);U=new aa(C,s,s,Dt,Ca)}return U.minFilter=Be,U.magFilter=Be,U.wrapS=We,U.wrapT=We,U.generateMipmaps=!1,U.flipY=!1,U.needsUpdate=!0,{texture:U,burnedFraction:x/o,frameCount:t}}function cu(e){const t=String(e);return/[.e]/.test(t)?t:`${t}.0`}const Pf=`
const float FIRE_THR = ${cu(qo)};
const float FIRE_FIELD_TEXEL = ${cu(1/Ke)};

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
`,If=`
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
`,vo=6378.137,Qi={family:"modis",altitudeKm:705,maxScanDeg:55,alphaScanNative:1/705,alphaTrack:1/705,detectors:10,zone1Deg:90,zone2Deg:90},oo={family:"viirs",altitudeKm:825.2,maxScanDeg:56.28,alphaScanNative:.125/825.2,alphaTrack:.362/825.2,detectors:32,zone1Deg:31.72,zone2Deg:44.86},Ji=Math.PI/180;function Xr(e){return(vo+e.altitudeKm)/vo}function Cf(e,t){const a=Math.min(e.maxScanDeg,Math.abs(t))*Ji,s=Xr(e);return vo*(Math.asin(Math.min(1,s*Math.sin(a)))-a)}const uu={axisEast:1,axisNorth:0,nadirKm:0,valid:!1,scanAngleDeg:0};function hu(e,t,a){if(!e||e.family!==t.family)return a.valid=!1,a;const s=e.azimuthDeg*Ji;return a.axisEast=Math.sin(s),a.axisNorth=Math.cos(s),a.scanAngleDeg=Math.min(t.maxScanDeg,Math.abs(e.scanAngleDeg)),a.nadirKm=Cf(t,a.scanAngleDeg),a.valid=!0,a}function us(e){const t=e.toPrecision(10);return/[.e]/.test(t)?t:`${t}.0`}function du(e){return`vec4(${us(e.alphaScanNative)}, ${us(e.alphaTrack)}, ${us(e.detectors)}, ${e.family==="viirs"?"1.0":"0.0"})`}const Lf=`
const float SCAN_RE = ${us(vo)};
const float MODIS_ORBIT_K = ${us(Xr(Qi))};
const float VIIRS_ORBIT_K = ${us(Xr(oo))};
const vec4 MODIS_SENSOR = ${du(Qi)};
const vec4 VIIRS_SENSOR = ${du(oo)};
const float VIIRS_ZONE1 = ${us(oo.zone1Deg*Ji)};
const float VIIRS_ZONE2 = ${us(oo.zone2Deg*Ji)};

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
`,gh=`
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
`,fu=`
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
`,Nf=`
void main() {
  gl_FragColor = vec4(0.0);
}
`,zf=`
${rn}
${Lf}

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

${If}
${sn}
${nn}
${on}
${Pf}

${gh}

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
`;function pr(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function mu(e){if(!pr(e))return null;const{extent_km:t,scale:a,dem:s,ortho:o}=e;return!Array.isArray(t)||t.length!==2||!t.every(i=>typeof i=="number"&&i>0)||typeof a!="number"||!(a>1)||a>15||!pr(s)||typeof s.url!="string"||typeof s.size!="number"||s.format!=="f32le"||!pr(o)||typeof o.url!="string"||typeof o.size!="number"?null:e}function Uf(e,t,a,s){const o=new Uint8Array(t*t*4),i=s?new Uint8Array(t*t):vf(e,t),l=xf(e,t),u=yf(e,t,l),r=a[0]*1e3/(t-1),c=a[1]*1e3/(t-1);for(let p=0;p<t;p++){const M=Math.min(t-1,p+1),y=Math.max(0,p-1);for(let g=0;g<t;g++){const R=Math.min(t-1,g+1),E=Math.max(0,g-1),w=(e[p*t+R]-e[p*t+E])/((R-E)*r),x=(e[y*t+g]-e[M*t+g])/((M-y)*c),S=1/Math.hypot(w,1,x),k=(p*t+g)*4;o[k]=Math.round((-w*S*.5+.5)*255),o[k+1]=Math.round((-x*S*.5+.5)*255),o[k+2]=l[p*t+g]?255:u[p*t+g]?128:0,o[k+3]=i[p*t+g]?255:0}}const d=new aa(o,t,t,Dt,Ot);return d.colorSpace=La,d.wrapS=We,d.wrapT=We,d.magFilter=Be,d.minFilter=Ya,d.generateMipmaps=!0,d.flipY=!1,d.needsUpdate=!0,d}async function Bf(e,t){var a;try{if(e.ortho.size>t.maxTextureSize)return null;const[s,o]=await Promise.all([fetch(t.resolveUrl(e.dem.url)).then(d=>d.ok?d.arrayBuffer():null),vh(t.resolveUrl(e.ortho.url),t.maxAnisotropy)]),i=e.dem.size;if((((a=t.isCancelled)==null?void 0:a.call(t))??!1)||!s||s.byteLength!==i*i*4||!o)return o==null||o.dispose(),null;const l=new Float32Array(s),u=il(l,i);u&&ph(l,i);const r=Is(l,!0),c=Uf(r.aligned,r.gridRes,e.extent_km,u);return{manifest:e,scale:e.scale,demTexture:r.texture,alignedDem:r.aligned,gridRes:r.gridRes,shadeTexture:c,orthoTexture:o,dispose:()=>{r.texture.dispose(),c.dispose(),o.dispose()}}}catch{return null}}const xh=6360;function Of(e,t){return(e*e+2*e*t)/(2*xh)}const Hf=`
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
  y -= (dOut * dOut + 2.0 * dOut * halfKm) / (2.0 * ${xh.toFixed(1)}) * 1000.0 * uUnitsPerMetre.y;

  // Under the pack this surface dives out of the way; the pack is the surface there. The dive
  // starts more than one cell of this mesh inside the pack, so along the pack edge both surfaces
  // are at the same height (the pack takes the context elevation there, see contextJoin).
  vec2 e = min(packUv, 1.0 - packUv);
  y -= clamp((min(e.x, e.y) - 0.012) * 40.0, 0.0, 1.0) * 0.6;

  vec4 worldPos = modelMatrix * vec4(xz.x, y, xz.y, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`,Gf=`
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
${gh}

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
`,pu=640;class Kf{constructor(t){F(this,"mesh");F(this,"material");F(this,"shadeUniform",{value:null});const a=new en(1,1,pu,pu);this.material=new Rt({vertexShader:Hf,fragmentShader:Gf,uniforms:{...t,uContextShade:this.shadeUniform},transparent:!0,depthWrite:!0}),this.mesh=new Ma(a,this.material),this.mesh.frustumCulled=!1,this.mesh.visible=!1,this.mesh.renderOrder=-2}setContext(t){this.shadeUniform.value=(t==null?void 0:t.shadeTexture)??null}dispose(){this.mesh.geometry.dispose(),this.material.dispose()}}function Wf(e,t,a){const s=e.gridRes,o=Math.min(s-1,Math.max(0,t*(s-1))),i=Math.min(s-1,Math.max(0,a*(s-1))),l=Math.floor(o),u=Math.floor(i),r=Math.min(s-1,l+1),c=Math.min(s-1,u+1),d=o-l,p=i-u,M=e.alignedDem,y=M[u*s+l]*(1-d)+M[u*s+r]*d,g=M[c*s+l]*(1-d)+M[c*s+r]*d;return y*(1-p)+g*p}const $o=1024,fo=1536,vu=1.1,Vf=5,Yf=.2,$f=.09,jf=.07,gu=.36,xu=.16,wu=.34,Xf=[1,.09,.015],Mu=[1,.36,.05],qf=[1,.66,.32];function Zf(e,t){const a=Math.min(1,Math.max(0,e)),s=vu+(Vf-vu)*a*a*a,o=a<.5?Xf:Mu,i=a<.5?Mu:qf,l=a<.5?a*2:a*2-1;for(let u=0;u<3;u++)t[u]=(o[u]+(i[u]-o[u])*l)*s;t[3]=s}function yu(e,t){const a=Math.sin(e*12.9898+t*78.233)*43758.5453;return a-Math.floor(a)}const Gi=4,Qf=3,Da=$o*$o,vr=fo*fo;class Jf{constructor(){F(this,"texture");F(this,"lightTexture");F(this,"modisCount",0);F(this,"viirsCount",0);F(this,"data",new Uint16Array(Da*4));F(this,"blank",new Uint16Array(Da*4));F(this,"outside",[new Float32Array(Da),new Float32Array(Da)]);F(this,"depth",[new Float32Array(Da),new Float32Array(Da)]);F(this,"frp",[new Float32Array(Da),new Float32Array(Da)]);F(this,"touched",new Int32Array(65536));F(this,"touchedCount",0);F(this,"mark",new Uint8Array(Da));F(this,"light",new Float32Array(vr*4));F(this,"lightData",new Uint16Array(vr*4));F(this,"lightTouched",new Int32Array(65536));F(this,"lightTouchedCount",0);F(this,"lightMark",new Uint8Array(vr));F(this,"lightOfOne",new Float32Array(4));const t=Sa.toHalfFloat(Gi);for(let o=0;o<Da;o++)this.blank[o*4]=t,this.blank[o*4+2]=t;this.data.set(this.blank);for(let o=0;o<2;o++)this.outside[o].fill(Gi);const a=new aa(this.data,$o,$o,Dt,Ca);a.colorSpace=La,a.minFilter=Be,a.magFilter=Be,a.generateMipmaps=!1,a.wrapS=We,a.wrapT=We,a.flipY=!1,a.needsUpdate=!0,this.texture=a;const s=new aa(this.lightData,fo,fo,Dt,Ca);s.colorSpace=La,s.minFilter=Ya,s.magFilter=Be,s.generateMipmaps=!0,s.wrapS=We,s.wrapT=We,s.flipY=!1,s.needsUpdate=!0,this.lightTexture=s}build(t,a,s,o,i=[],l=[]){for(let r=0;r<this.touchedCount;r++){const c=this.touched[r];this.mark[c]=0;for(let d=0;d<2;d++)this.outside[d][c]=Gi,this.depth[d][c]=0,this.frp[d][c]=0;this.data[c*4]=this.blank[c*4],this.data[c*4+1]=0,this.data[c*4+2]=this.blank[c*4+2],this.data[c*4+3]=0}this.touchedCount=0;for(let r=0;r<this.lightTouchedCount;r++){const c=this.lightTouched[r];this.lightMark[c]=0;for(let d=0;d<4;d++)this.light[c*4+d]=0,this.lightData[c*4+d]=0}this.lightTouchedCount=0,this.modisCount=0,this.viirsCount=0;for(const r of t)this.drawFootprint(r,a,s);for(const r of i)this.drawFootprint(r,a,s);for(const r of t)this.drawLight(r,a,s,o);for(const r of l)this.drawLight(r,a,s,o);const u=Sa.toHalfFloat;for(let r=0;r<this.touchedCount;r++){const c=this.touched[r];for(let d=0;d<2;d++){const p=this.depth[d][c];p>0?(this.data[c*4+d*2]=u(-p),this.data[c*4+d*2+1]=u(Math.min(this.frp[d][c],6e4))):this.outside[d][c]<Gi&&(this.data[c*4+d*2]=u(this.outside[d][c]))}}for(let r=0;r<this.lightTouchedCount;r++){const c=this.lightTouched[r];for(let d=0;d<4;d++)this.lightData[c*4+d]=u(Math.min(this.light[c*4+d],6e4))}this.texture.needsUpdate=!0,this.lightTexture.needsUpdate=!0}drawFootprint(t,a,s){const o=$o,[i,l,u,r]=a,c=s[0]/o,d=s[1]/o,p=Qf*Math.max(c,d),M=t.family==="viirs"?1:0,y=(t.lon-i)/Math.max(1e-9,u-i)*s[0],g=(t.lat-l)/Math.max(1e-9,r-l)*s[1],R=t.acrossTrackKm*.5,E=t.alongTrackKm*.5,w=Math.max(1e-4,Math.min(R,E)),x=t.azimuthDeg*Math.PI/180,S=Math.sin(x),k=Math.cos(x),U=Math.hypot(R,E)+p,C=Math.max(0,Math.floor((y-U)/c)),P=Math.min(o-1,Math.ceil((y+U)/c)),z=Math.max(0,Math.floor((g-U)/d)),G=Math.min(o-1,Math.ceil((g+U)/d));if(P<C||G<z)return;M===1?this.viirsCount++:this.modisCount++;const _=t.frpMw/Math.max(1e-4,t.acrossTrackKm*t.alongTrackKm),V=this.outside[M],q=this.depth[M],we=this.frp[M];for(let Se=z;Se<=G;Se++){const ye=(Se+.5)*d-g;for(let ne=C;ne<=P;ne++){const Te=(ne+.5)*c-y,Re=Math.abs(Te*S+ye*k)-R,ut=Math.abs(Te*k-ye*S)-E,ue=Math.hypot(Math.max(Re,0),Math.max(ut,0))+Math.min(Math.max(Re,ut),0);if(ue>p)continue;const ae=Se*o+ne;if(!this.mark[ae]){if(this.mark[ae]=1,this.touchedCount===this.touched.length){const ht=new Int32Array(this.touched.length*2);ht.set(this.touched),this.touched=ht}this.touched[this.touchedCount++]=ae}if(ue>=0){ue<V[ae]&&(V[ae]=ue);continue}const st=Math.min(1,-ue/w);st>=q[ae]&&(q[ae]=Math.max(st,.001),we[ae]=_)}}}drawLight(t,a,s,o){const i=fo,[l,u,r,c]=a,d=s[0]/i,p=s[1]/i,M=(t.lon-l)/Math.max(1e-9,r-l)*s[0],y=(t.lat-u)/Math.max(1e-9,c-u)*s[1],g=t.acrossTrackKm*.5,R=t.alongTrackKm*.5,E=t.azimuthDeg*Math.PI/180,w=Math.sin(E),x=Math.cos(E),S=this.lightOfOne;Zf(o(t.frpMw/Math.max(1e-4,t.acrossTrackKm*t.alongTrackKm)),S);const k=Math.min($f,Yf*Math.min(g,R)),U=Math.max(k,.8*Math.max(d,p)),C=k*k/(U*U),P=9*U*U,z=(yu(t.lon,t.lat)*2-1)*wu*g,G=(yu(t.lat*1.7,t.lon*.9)*2-1)*wu*R,_=z*w+G*x,V=z*x-G*w,q=Math.min(gu*g,xu),we=Math.min(gu*R,xu),Se=Math.hypot(g,R),ye=Math.max(0,Math.floor((M-Se)/d)),ne=Math.min(i-1,Math.ceil((M+Se)/d)),Te=Math.max(0,Math.floor((y-Se)/p)),Re=Math.min(i-1,Math.ceil((y+Se)/p)),ut=this.light;for(let ue=Te;ue<=Re;ue++){const ae=(ue+.5)*p-y;for(let st=ye;st<=ne;st++){const ht=(st+.5)*d-M,Ht=ht*w+ae*x,se=ht*x-ae*w,m=Math.hypot(Ht/g,se/R);let rt=0;const Qt=ht-_,va=ae-V;if(Qt*Qt+va*va<P){for(let Pt=0;Pt<4;Pt++){const ia=Qt+(Pt&1?.25:-.25)*d,ft=va+(Pt&2?.25:-.25)*p;rt+=Math.exp(-(ia*ia+ft*ft)/(U*U))}rt*=.25*C}if(m<1){const Pt=m<=.72?0:(m-.72)/.28,ia=(Ht-z)/q,ft=(se-G)/we;rt+=jf*Math.exp(-(ia*ia+ft*ft))*(1-Pt*Pt*(3-2*Pt))}if(rt<=1e-4)continue;const Jt=ue*i+st;if(!this.lightMark[Jt]){if(this.lightMark[Jt]=1,this.lightTouchedCount===this.lightTouched.length){const Pt=new Int32Array(this.lightTouched.length*2);Pt.set(this.lightTouched),this.lightTouched=Pt}this.lightTouched[this.lightTouchedCount++]=Jt}ut[Jt*4]+=S[0]*rt,ut[Jt*4+1]+=S[1]*rt,ut[Jt*4+2]+=S[2]*rt,ut[Jt*4+3]+=S[3]*rt}}}dispose(){this.texture.dispose(),this.lightTexture.dispose()}}const em=1500,bu=30;function tm(e){const t=Math.log1p(Math.max(0,e)/bu)/Math.log1p(em/bu);return Math.min(1,t)}function am(e,t,a,s,o,i=.6){const l=o*o,u=new Uint8Array(t*l),[r,c,d,p]=a,M=s[0]/o,y=s[1]/o;for(let g=0;g<t;g++){const R=g*l;if(g>0){const E=(g-1)*l;for(let w=0;w<l;w++)u[R+w]=Math.floor(u[E+w]*i)}for(const E of e[g]??[])if(!(E.hidden||E.revealedByLook))for(const w of E.footprints){const x=(w.lon-r)/Math.max(1e-9,d-r)*s[0],S=(w.lat-c)/Math.max(1e-9,p-c)*s[1],k=w.acrossTrackKm*.5,U=w.alongTrackKm*.5,C=w.azimuthDeg*Math.PI/180,P=Math.sin(C),z=Math.cos(C),G=Math.round(255*tm(w.frpMw/Math.max(1e-4,w.acrossTrackKm*w.alongTrackKm))),_=Math.hypot(k,U),V=Math.max(0,Math.floor((x-_)/M)),q=Math.min(o-1,Math.ceil((x+_)/M)),we=Math.max(0,Math.floor((S-_)/y)),Se=Math.min(o-1,Math.ceil((S+_)/y));for(let ye=we;ye<=Se;ye++){const ne=(ye+.5)*y-S;for(let Te=V;Te<=q;Te++){const Re=(Te+.5)*M-x;if(Math.abs(Re*P+ne*z)>k+.5*M||Math.abs(Re*z-ne*P)>U+.5*y)continue;const ut=R+ye*o+Te;G>u[ut]&&(u[ut]=G)}}}}return u}function gr(e){if(typeof e!="object"||e===null)return null;const t=e;if(typeof t.grid!="object"||t.grid===null||!Array.isArray(t.looks))return null;const a=t.grid,s=Number(a.nx),o=Number(a.ny);if(!Number.isInteger(s)||!Number.isInteger(o)||s<2||o<2||a.index!=="row * nx + column"||a.rows_run!=="north to south")return null;const i=new Map;for(const l of t.looks){if(typeof l!="object"||l===null)return null;const{frame:u,cells:r}=l;if(u==null)continue;if(!Number.isInteger(u)||u<0||!Array.isArray(r))return null;const c=new Uint32Array(r.length);for(let d=0;d<r.length;d++){const p=r[d];if(!Number.isInteger(p)||p<0||p>=s*o)return null;c[d]=p}i.set(u,c)}return i.size>0?{nx:s,ny:o,byFrame:i}:null}class sm{constructor(){F(this,"texture");F(this,"grid",new Ne(0,0));F(this,"box",new da(0,0,0,0));F(this,"data");F(this,"nx",1);F(this,"ny",1);F(this,"key","");F(this,"stepKey","");F(this,"step",0);F(this,"declaredGiven",!1);this.data=new Uint8Array(4),this.texture=this.makeTexture(1,1)}makeTexture(t,a){const s=new aa(this.data,t,a,Dt,Ot);return s.minFilter=Be,s.magFilter=Be,s.generateMipmaps=!1,s.wrapS=We,s.wrapT=We,s.flipY=!1,s.needsUpdate=!0,s}clear(){this.grid.set(0,0),this.box.set(0,0,0,0),this.key="",this.stepKey="",this.declaredGiven=!1}sync(t,a,s,o=null){const{steps:i,stepMs:l,firstTimeMs:u,nx:r,ny:c}=t.info,d=Math.min(i-1,Math.max(0,(s-u)/l)),p=Math.min(i-1,Math.floor(d)),M=Math.min(i-1,p+1);(r!==this.nx||c!==this.ny)&&(this.texture.dispose(),this.nx=r,this.ny=c,this.data=new Uint8Array(r*c*4),this.texture=this.makeTexture(r,c),this.key=""),this.grid.set(r,c);const y=t.declared&&t.declared.nx===r&&t.declared.ny===c?t.declared:null,g=y&&o!==null?y.byFrame.get(o)??null:null;this.declaredGiven=y!==null;const R=`${a}:${p}`,E=`${R}:${y?o??"none":"no list"}`;if(E!==this.key){this.key=E,this.stepKey=R,this.step=p;const w=t.bytes,x=r*c,S=this.data;let k=r,U=-1,C=c,P=-1;for(let z=0;z<c;z++){const G=(p*x+(c-1-z)*r)*2,_=(M*x+(c-1-z)*r)*2,V=z*r*4;for(let q=0;q<r;q++){const we=w[G+q*2],Se=w[_+q*2];S[V+q*4]=we,S[V+q*4+1]=y?w[G+q*2+1]&254:w[G+q*2+1],S[V+q*4+2]=Se,S[V+q*4+3]=w[_+q*2+1],(we>0||Se>0)&&(q<k&&(k=q),q>U&&(U=q),z<C&&(C=z),z>P&&(P=z))}}if(g)for(let z=0;z<g.length;z++){const G=Math.floor(g[z]/r),_=g[z]-G*r,V=c-1-G;S[(V*r+_)*4+1]|=1,_<k&&(k=_),_>U&&(U=_),V<C&&(C=V),V>P&&(P=V)}U<0?this.box.set(0,0,0,0):this.box.set((k-3)/r,(C-3)/c,(U+4)/r,(P+4)/c),this.texture.needsUpdate=!0}return d-p}cellsAbove(t,a,s){const{nx:o,ny:i}=t.info,l=o*i,u=this.step*l*2,r=Math.ceil(a*255),c=[];for(let d=0;d<i;d++)for(let p=0;p<o;p++){const M=u+(d*o+p)*2;t.bytes[M]<r||c.push((p+.5)/o,1-(d+.5)/i,Math.max(.01,s(t.bytes[M+1]/255)))}return new Float32Array(c)}dispose(){this.texture.dispose()}}function ha(e,t){return e.revealed?!1:e.hidden===!0||t&&e.family==="viirs"}/**
 * postprocessing v6.39.6 build Sun Nov 01 2026
 * https://github.com/pmndrs/postprocessing
 * Copyright 2015-2026 Raoul van Rüschen
 * @license Zlib
 */var om=(()=>{const e=new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),t=new Float32Array([0,0,2,0,0,2]),a=new tn;return a.setAttribute("position",new ma(e,3)),a.setAttribute("uv",new ma(t,2)),a})(),pa=class qr{static get fullscreenGeometry(){return om}constructor(t="Pass",a=new mo,s=new Qr){this.name=t,this.renderer=null,this.scene=a,this.camera=s,this.screen=null,this.rtt=!0,this.needsSwap=!0,this.needsDepthBlit=!1,this.needsDepthTexture=!1,this.enabled=!0}get renderToScreen(){return!this.rtt}set renderToScreen(t){if(this.rtt===t){const a=this.fullscreenMaterial;a!==null&&(a.needsUpdate=!0),this.rtt=!t}}set mainScene(t){}set mainCamera(t){}setRenderer(t){this.renderer=t}isEnabled(){return this.enabled}setEnabled(t){this.enabled=t}get fullscreenMaterial(){return this.screen!==null?this.screen.material:null}set fullscreenMaterial(t){let a=this.screen;a!==null?a.material=t:(a=new Ma(qr.fullscreenGeometry,t),a.frustumCulled=!1,this.scene===null&&(this.scene=new mo),this.scene.add(a),this.screen=a)}getFullscreenMaterial(){return this.fullscreenMaterial}setFullscreenMaterial(t){this.fullscreenMaterial=t}getDepthTexture(){return null}setDepthTexture(t,a=an){}render(t,a,s,o,i){throw new Error("Render method not implemented!")}setSize(t,a){}initialize(t,a,s){}dispose(){for(const t of Object.keys(this)){const a=this[t];(a instanceof Zt||a instanceof oh||a instanceof el||a instanceof qr)&&this[t].dispose()}this.fullscreenMaterial!==null&&this.fullscreenMaterial.dispose()}},im=class extends pa{constructor(){super("ClearMaskPass",null,null),this.needsSwap=!1}render(e,t,a,s,o){const i=e.state.buffers.stencil;i.setLocked(!1),i.setTest(!1)}},nm=`#ifdef COLOR_WRITE
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
}`,nl="varying vec2 vUv;void main(){vUv=position.xy*0.5+0.5;gl_Position=vec4(position.xy,1.0,1.0);}",wh=class extends Rt{constructor(){super({name:"CopyMaterial",defines:{COLOR_SPACE_CONVERSION:"1",DEPTH_PACKING:"0",COLOR_WRITE:"1"},uniforms:{inputBuffer:new Pe(null),depthBuffer:new Pe(null),channelWeights:new Pe(null),opacity:new Pe(1)},blending:Us,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:nm,vertexShader:nl}),this.depthFunc=ud}get inputBuffer(){return this.uniforms.inputBuffer.value}set inputBuffer(e){const t=e!==null;this.colorWrite!==t&&(t?this.defines.COLOR_WRITE=!0:delete this.defines.COLOR_WRITE,this.colorWrite=t,this.needsUpdate=!0),this.uniforms.inputBuffer.value=e}get depthBuffer(){return this.uniforms.depthBuffer.value}set depthBuffer(e){const t=e!==null;this.depthWrite!==t&&(t?this.defines.DEPTH_WRITE=!0:delete this.defines.DEPTH_WRITE,this.depthTest=t,this.depthWrite=t,this.needsUpdate=!0),this.uniforms.depthBuffer.value=e}set depthPacking(e){this.defines.DEPTH_PACKING=e.toFixed(0),this.needsUpdate=!0}get colorSpaceConversion(){return this.defines.COLOR_SPACE_CONVERSION!==void 0}set colorSpaceConversion(e){this.colorSpaceConversion!==e&&(e?this.defines.COLOR_SPACE_CONVERSION=!0:delete this.defines.COLOR_SPACE_CONVERSION,this.needsUpdate=!0)}get channelWeights(){return this.uniforms.channelWeights.value}set channelWeights(e){e!==null?(this.defines.USE_WEIGHTS="1",this.uniforms.channelWeights.value=e):delete this.defines.USE_WEIGHTS,this.needsUpdate=!0}setInputBuffer(e){this.uniforms.inputBuffer.value=e}getOpacity(e){return this.uniforms.opacity.value}setOpacity(e){this.uniforms.opacity.value=e}},Mh=class extends pa{constructor(e,t=!0){super("CopyPass"),this.fullscreenMaterial=new wh,this.needsSwap=!1,this.renderTarget=e,e===void 0&&(this.renderTarget=new Zt(1,1,{minFilter:Be,magFilter:Be,stencilBuffer:!1,depthBuffer:!1}),this.renderTarget.texture.name="CopyPass.Target"),this.autoResize=t}get resize(){return this.autoResize}set resize(e){this.autoResize=e}get texture(){return this.renderTarget.texture}getTexture(){return this.renderTarget.texture}setAutoResizeEnabled(e){this.autoResize=e}render(e,t,a,s,o){this.fullscreenMaterial.inputBuffer=t.texture,e.setRenderTarget(this.renderToScreen?null:this.renderTarget),e.render(this.scene,this.camera)}setSize(e,t){this.autoResize&&this.renderTarget.setSize(e,t)}initialize(e,t,a){a!==void 0&&(this.renderTarget.texture.type=a,a!==Ot?this.fullscreenMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1":e!==null&&e.outputColorSpace===ct&&(this.renderTarget.texture.colorSpace=ct))}},Su=new qi,yh=class extends pa{constructor(e=!0,t=!0,a=!1){super("ClearPass",null,null),this.needsSwap=!1,this.color=e,this.depth=t,this.stencil=a,this.overrideClearColor=null,this.overrideClearAlpha=-1}setClearFlags(e,t,a){this.color=e,this.depth=t,this.stencil=a}getOverrideClearColor(){return this.overrideClearColor}setOverrideClearColor(e){this.overrideClearColor=e}getOverrideClearAlpha(){return this.overrideClearAlpha}setOverrideClearAlpha(e){this.overrideClearAlpha=e}render(e,t,a,s,o){const i=this.overrideClearColor,l=this.overrideClearAlpha,u=e.getClearAlpha(),r=i!==null,c=l>=0;r?(e.getClearColor(Su),e.setClearColor(i,c?l:u)):c&&e.setClearAlpha(l),e.setRenderTarget(this.renderToScreen?null:t),e.clear(this.color,this.depth,this.stencil),r?e.setClearColor(Su,u):c&&e.setClearAlpha(u)}},rm=class extends pa{constructor(e,t){super("MaskPass",e,t),this.needsSwap=!1,this.clearPass=new yh(!1,!1,!0),this.inverse=!1}set mainScene(e){this.scene=e}set mainCamera(e){this.camera=e}get inverted(){return this.inverse}set inverted(e){this.inverse=e}get clear(){return this.clearPass.enabled}set clear(e){this.clearPass.enabled=e}getClearPass(){return this.clearPass}isInverted(){return this.inverted}setInverted(e){this.inverted=e}render(e,t,a,s,o){const i=e.getContext(),l=e.state.buffers,u=this.scene,r=this.camera,c=this.clearPass,d=this.inverted?0:1,p=1-d;l.color.setMask(!1),l.depth.setMask(!1),l.color.setLocked(!0),l.depth.setLocked(!0),l.stencil.setTest(!0),l.stencil.setOp(i.REPLACE,i.REPLACE,i.REPLACE),l.stencil.setFunc(i.ALWAYS,d,4294967295),l.stencil.setClear(p),l.stencil.setLocked(!0),this.clearPass.enabled&&(this.renderToScreen?c.render(e,null):(c.render(e,t),c.render(e,a))),this.renderToScreen?(e.setRenderTarget(null),e.render(u,r)):(e.setRenderTarget(t),e.render(u,r),e.setRenderTarget(a),e.render(u,r)),l.color.setLocked(!1),l.depth.setLocked(!1),l.stencil.setLocked(!1),l.stencil.setFunc(i.EQUAL,1,4294967295),l.stencil.setOp(i.KEEP,i.KEEP,i.KEEP),l.stencil.setLocked(!0)}};function lm(e,t){const a=e.getContext();if(t<=0||typeof a.renderbufferStorageMultisample!="function")return 0;const s=a.getParameter(a.MAX_SAMPLES),o=Math.min(t,s);if(o<=0)return 0;const i=a.getParameter(a.RENDERBUFFER_BINDING),l=a.createRenderbuffer();try{return a.bindRenderbuffer(a.RENDERBUFFER,l),a.renderbufferStorageMultisample(a.RENDERBUFFER,o,a.RGBA8,1,1),o}catch{return 0}finally{a.bindRenderbuffer(a.RENDERBUFFER,i),a.deleteRenderbuffer(l)}}var xr=1/1e3,cm=1e3,um=class{constructor(){this.startTime=performance.now(),this.previousTime=0,this.currentTime=0,this._delta=0,this._elapsed=0,this._fixedDelta=1e3/60,this.timescale=1,this.useFixedDelta=!1,this._autoReset=!1}get autoReset(){return this._autoReset}set autoReset(e){typeof document<"u"&&document.hidden!==void 0&&(e?document.addEventListener("visibilitychange",this):document.removeEventListener("visibilitychange",this),this._autoReset=e)}get delta(){return this._delta*xr}get fixedDelta(){return this._fixedDelta*xr}set fixedDelta(e){this._fixedDelta=e*cm}get elapsed(){return this._elapsed*xr}update(e){this.useFixedDelta?this._delta=this.fixedDelta:(this.previousTime=this.currentTime,this.currentTime=(e!==void 0?e:performance.now())-this.startTime,this._delta=this.currentTime-this.previousTime),this._delta*=this.timescale,this._elapsed+=this._delta}reset(){this._delta=0,this._elapsed=0,this.currentTime=performance.now()-this.startTime}getDelta(){return this.delta}getElapsed(){return this.elapsed}handleEvent(e){document.hidden||(this.currentTime=performance.now()-this.startTime)}dispose(){this.autoReset=!1}},hm=class{constructor(e=null,{depthBuffer:t=!0,stencilBuffer:a=!1,multisampling:s=0,frameBufferType:o=Ot}={}){this.renderer=null,this.inputBuffer=this.createBuffer(t,a,o,s),this.outputBuffer=this.inputBuffer.clone(),this.copyPass=new Mh,this.depthRenderTarget=null,this.passes=[],this.timer=new um,this.autoRenderToScreen=!0,this.setRenderer(e)}get stableDepthTexture(){return this.depthRenderTarget===null?null:this.depthRenderTarget.depthTexture}get multisampling(){return this.inputBuffer.samples}set multisampling(e){const t=this.renderer===null?e:lm(this.renderer,e);this.multisampling!==t&&(this.inputBuffer.samples=t,this.outputBuffer.samples=t,this.inputBuffer.dispose(),this.outputBuffer.dispose())}getTimer(){return this.timer}getRenderer(){return this.renderer}setRenderer(e){if(this.renderer=e,e!==null){const t=e.getSize(new Ne),a=e.getContext().getContextAttributes().alpha,s=this.inputBuffer.texture.type;s===Ot&&e.outputColorSpace===ct&&(this.inputBuffer.texture.colorSpace=ct,this.outputBuffer.texture.colorSpace=ct,this.inputBuffer.dispose(),this.outputBuffer.dispose());const o=this.multisampling;this.multisampling=o,e.autoClear=!1,this.setSize(t.width,t.height);for(const i of this.passes)i.initialize(e,a,s)}}replaceRenderer(e,t=!0){const a=this.renderer,s=a.domElement.parentNode;return this.setRenderer(e),t&&s!==null&&(s.removeChild(a.domElement),s.appendChild(e.domElement)),a}createDepthTexture(){const e=new ur;e.name="EffectComposer.InputDepth",this.inputBuffer.stencilBuffer?(e.format=rd,e.type=ld):e.type=Jr;const t=new ur;t.format=e.format,t.type=e.type,t.name="EffectComposer.OutputDepth";const a=new ur;a.format=e.format,a.type=e.type,a.name="EffectComposer.StableDepth",this.inputBuffer.depthTexture=e,this.outputBuffer.depthTexture=t,this.inputBuffer.dispose(),this.outputBuffer.dispose();const{width:s,height:o}=this.inputBuffer;this.depthRenderTarget=new Zt(s,o,{depthBuffer:!0,stencilBuffer:this.inputBuffer.stencilBuffer,depthTexture:a})}blitDepthBuffer(e){const t=this.renderer,a=this.depthRenderTarget,s=t.properties,o=t.getContext();t.setRenderTarget(a);const i=s.get(e).__webglFramebuffer,l=s.get(a).__webglFramebuffer,u=e.stencilBuffer?o.DEPTH_BUFFER_BIT|o.STENCIL_BUFFER_BIT:o.DEPTH_BUFFER_BIT;o.bindFramebuffer(o.READ_FRAMEBUFFER,i),o.bindFramebuffer(o.DRAW_FRAMEBUFFER,l),o.blitFramebuffer(0,0,e.width,e.height,0,0,a.width,a.height,u,o.NEAREST),o.bindFramebuffer(o.READ_FRAMEBUFFER,null),o.bindFramebuffer(o.DRAW_FRAMEBUFFER,null),t.setRenderTarget(null)}deleteDepthTexture(){const e=this.stableDepthTexture;for(const t of this.passes)t.getDepthTexture()===e&&t.setDepthTexture(null);this.depthRenderTarget!==null&&(this.depthRenderTarget.dispose(),this.depthRenderTarget=null),this.inputBuffer.depthTexture!==null&&(this.inputBuffer.depthTexture.dispose(),this.inputBuffer.depthTexture=null),this.outputBuffer.depthTexture!==null&&(this.outputBuffer.depthTexture.dispose(),this.outputBuffer.depthTexture=null)}createBuffer(e,t,a,s){const o=this.renderer,i=o===null?new Ne:o.getDrawingBufferSize(new Ne),l=new Zt(i.width,i.height,{minFilter:Be,magFilter:Be,samples:s,stencilBuffer:t,depthBuffer:e,type:a});return a===Ot&&o!==null&&o.outputColorSpace===ct&&(l.texture.colorSpace=ct),l.texture.name="EffectComposer.Buffer",l.texture.generateMipmaps=!1,l}setMainScene(e){for(const t of this.passes)t.mainScene=e}setMainCamera(e){for(const t of this.passes)t.mainCamera=e}addPass(e,t){const a=this.passes,s=this.renderer,o=s.getDrawingBufferSize(new Ne),i=s.getContext().getContextAttributes().alpha,l=this.inputBuffer.texture.type;if(e.renderer=s,e.setSize(o.width,o.height),e.initialize(s,i,l),this.autoRenderToScreen&&(a.length>0&&(a[a.length-1].renderToScreen=!1),e.renderToScreen&&(this.autoRenderToScreen=!1)),t!==void 0?a.splice(t,0,e):a.push(e),this.autoRenderToScreen&&(a[a.length-1].renderToScreen=!0),e.needsDepthTexture||this.depthRenderTarget!==null)if(this.depthRenderTarget===null){this.createDepthTexture();for(const u of a)u.setDepthTexture(this.stableDepthTexture)}else e.setDepthTexture(this.stableDepthTexture)}removePass(e){const t=this.passes,a=t.indexOf(e);if(a!==-1&&t.splice(a,1).length>0){const i=this.stableDepthTexture;if(i!==null){const l=(r,c)=>r||c.needsDepthTexture;t.reduce(l,!1)||(e.getDepthTexture()===i&&e.setDepthTexture(null),this.deleteDepthTexture())}this.autoRenderToScreen&&a===t.length&&(e.renderToScreen=!1,t.length>0&&(t[t.length-1].renderToScreen=!0))}}removeAllPasses(){const e=this.passes;this.deleteDepthTexture(),e.length>0&&(this.autoRenderToScreen&&(e[e.length-1].renderToScreen=!1),this.passes=[])}render(e){const t=this.renderer,a=this.copyPass;let s=this.inputBuffer,o=this.outputBuffer,i,l=!1;e===void 0&&(this.timer.update(),e=this.timer.getDelta());for(const u of this.passes)if(u.enabled){if(u.render(t,s,o,e,l),u.needsDepthBlit&&this.depthRenderTarget!==null&&this.blitDepthBuffer(s),u.needsSwap){if(l){a.renderToScreen=u.renderToScreen;const r=t.getContext(),c=t.state.buffers.stencil;c.setFunc(r.NOTEQUAL,1,4294967295),a.render(t,s,o,e,l),c.setFunc(r.EQUAL,1,4294967295)}i=s,s=o,o=i}u instanceof rm?l=!0:u instanceof im&&(l=!1)}}setSize(e,t,a){const s=this.renderer,o=s.getSize(new Ne);(e===void 0||t===void 0)&&(e=o.width,t=o.height),(o.width!==e||o.height!==t)&&s.setSize(e,t,a);const i=s.getDrawingBufferSize(new Ne);this.inputBuffer.setSize(i.width,i.height),this.outputBuffer.setSize(i.width,i.height),this.depthRenderTarget!==null&&this.depthRenderTarget.setSize(i.width,i.height);for(const l of this.passes)l.setSize(i.width,i.height)}reset(){this.dispose(),this.autoRenderToScreen=!0}dispose(){for(const e of this.passes)e.dispose();this.deleteDepthTexture(),this.inputBuffer.dispose(),this.outputBuffer.dispose(),this.copyPass.dispose(),this.timer.dispose(),this.passes=[],pa.fullscreenGeometry.dispose()}},zs={NONE:0,DEPTH:1,CONVOLUTION:2},Ye={FRAGMENT_HEAD:"FRAGMENT_HEAD",FRAGMENT_MAIN_UV:"FRAGMENT_MAIN_UV",FRAGMENT_MAIN_IMAGE:"FRAGMENT_MAIN_IMAGE",VERTEX_HEAD:"VERTEX_HEAD",VERTEX_MAIN_SUPPORT:"VERTEX_MAIN_SUPPORT"},dm=class{constructor(){this.shaderParts=new Map([[Ye.FRAGMENT_HEAD,null],[Ye.FRAGMENT_MAIN_UV,null],[Ye.FRAGMENT_MAIN_IMAGE,null],[Ye.VERTEX_HEAD,null],[Ye.VERTEX_MAIN_SUPPORT,null]]),this.defines=new Map,this.uniforms=new Map,this.blendModes=new Map,this.extensions=new Set,this.attributes=zs.NONE,this.varyings=new Set,this.uvTransformation=!1,this.readDepth=!1,this.colorSpace=sh}},wr=!1,Tu=class{constructor(e=null){this.originalMaterials=new Map,this.material=null,this.materials=null,this.materialsBackSide=null,this.materialsDoubleSide=null,this.materialsFlatShaded=null,this.materialsFlatShadedBackSide=null,this.materialsFlatShadedDoubleSide=null,this.setMaterial(e),this.meshCount=0,this.replaceMaterial=t=>{if(t.isMesh){let a;if(t.material.flatShading)switch(t.material.side){case Cs:a=this.materialsFlatShadedDoubleSide;break;case ao:a=this.materialsFlatShadedBackSide;break;default:a=this.materialsFlatShaded;break}else switch(t.material.side){case Cs:a=this.materialsDoubleSide;break;case ao:a=this.materialsBackSide;break;default:a=this.materials;break}this.originalMaterials.set(t,t.material),t.isSkinnedMesh?t.material=a[2]:t.isInstancedMesh?t.material=a[1]:t.material=a[0],++this.meshCount}}}cloneMaterial(e){if(!(e instanceof Rt))return e.clone();const t=e.uniforms,a=new Map;for(const o in t){const i=t[o].value;i.isRenderTargetTexture&&(t[o].value=null,a.set(o,i))}const s=e.clone();for(const o of a)t[o[0]].value=o[1],s.uniforms[o[0]].value=o[1];return s}setMaterial(e){if(this.disposeMaterials(),this.material=e,e!==null){const t=this.materials=[this.cloneMaterial(e),this.cloneMaterial(e),this.cloneMaterial(e)];for(const a of t)a.uniforms=Object.assign({},e.uniforms),a.side=cd;t[2].skinning=!0,this.materialsBackSide=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.side=ao,s}),this.materialsDoubleSide=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.side=Cs,s}),this.materialsFlatShaded=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.flatShading=!0,s}),this.materialsFlatShadedBackSide=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.flatShading=!0,s.side=ao,s}),this.materialsFlatShadedDoubleSide=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.flatShading=!0,s.side=Cs,s})}}render(e,t,a){const s=e.shadowMap.enabled;if(e.shadowMap.enabled=!1,wr){const o=this.originalMaterials;this.meshCount=0,t.traverse(this.replaceMaterial),e.render(t,a);for(const i of o)i[0].material=i[1];this.meshCount!==o.size&&o.clear()}else{const o=t.overrideMaterial;t.overrideMaterial=this.material,e.render(t,a),t.overrideMaterial=o}e.shadowMap.enabled=s}disposeMaterials(){if(this.material!==null){const e=this.materials.concat(this.materialsBackSide).concat(this.materialsDoubleSide).concat(this.materialsFlatShaded).concat(this.materialsFlatShadedBackSide).concat(this.materialsFlatShadedDoubleSide);for(const t of e)t.dispose()}}dispose(){this.originalMaterials.clear(),this.disposeMaterials()}static get workaroundEnabled(){return wr}static set workaroundEnabled(e){wr=e}},rs=-1,Ia=class extends tl{constructor(e=null,t=rs,a=rs,s=1){super(),e!==null&&this.addEventListener("change",()=>e.setSize(this.baseSize.width,this.baseSize.height)),this.baseSize=new Ne(1,1),this.preferredSize=new Ne(t,a),this.target=this.preferredSize,this.s=s,this.effectiveSize=new Ne,this.addEventListener("change",()=>this.updateEffectiveSize()),this.updateEffectiveSize()}updateEffectiveSize(){const e=this.baseSize,t=this.preferredSize,a=this.effectiveSize,s=this.scale;t.width!==rs?a.width=t.width:t.height!==rs?a.width=Math.round(t.height*(e.width/Math.max(e.height,1))):a.width=Math.round(e.width*s),t.height!==rs?a.height=t.height:t.width!==rs?a.height=Math.round(t.width/Math.max(e.width/Math.max(e.height,1),1)):a.height=Math.round(e.height*s)}get width(){return this.effectiveSize.width}set width(e){this.preferredWidth=e}get height(){return this.effectiveSize.height}set height(e){this.preferredHeight=e}getWidth(){return this.width}getHeight(){return this.height}get scale(){return this.s}set scale(e){this.s!==e&&(this.s=e,this.preferredSize.setScalar(rs),this.dispatchEvent({type:"change"}))}getScale(){return this.scale}setScale(e){this.scale=e}get baseWidth(){return this.baseSize.width}set baseWidth(e){this.baseSize.width!==e&&(this.baseSize.width=e,this.dispatchEvent({type:"change"}))}getBaseWidth(){return this.baseWidth}setBaseWidth(e){this.baseWidth=e}get baseHeight(){return this.baseSize.height}set baseHeight(e){this.baseSize.height!==e&&(this.baseSize.height=e,this.dispatchEvent({type:"change"}))}getBaseHeight(){return this.baseHeight}setBaseHeight(e){this.baseHeight=e}setBaseSize(e,t){(this.baseSize.width!==e||this.baseSize.height!==t)&&(this.baseSize.set(e,t),this.dispatchEvent({type:"change"}))}get preferredWidth(){return this.preferredSize.width}set preferredWidth(e){this.preferredSize.width!==e&&(this.preferredSize.width=e,this.dispatchEvent({type:"change"}))}getPreferredWidth(){return this.preferredWidth}setPreferredWidth(e){this.preferredWidth=e}get preferredHeight(){return this.preferredSize.height}set preferredHeight(e){this.preferredSize.height!==e&&(this.preferredSize.height=e,this.dispatchEvent({type:"change"}))}getPreferredHeight(){return this.preferredHeight}setPreferredHeight(e){this.preferredHeight=e}setPreferredSize(e,t){(this.preferredSize.width!==e||this.preferredSize.height!==t)&&(this.preferredSize.set(e,t),this.dispatchEvent({type:"change"}))}copy(e){this.s=e.scale,this.baseSize.set(e.baseWidth,e.baseHeight),this.preferredSize.set(e.preferredWidth,e.preferredHeight),this.dispatchEvent({type:"change"})}static get AUTO_SIZE(){return rs}},Ce={ADD:0,ALPHA:1,AVERAGE:2,COLOR:3,COLOR_BURN:4,COLOR_DODGE:5,DARKEN:6,DIFFERENCE:7,DIVIDE:8,DST:9,EXCLUSION:10,HARD_LIGHT:11,HARD_MIX:12,HUE:13,INVERT:14,INVERT_RGB:15,LIGHTEN:16,LINEAR_BURN:17,LINEAR_DODGE:18,LINEAR_LIGHT:19,LUMINOSITY:20,MULTIPLY:21,NEGATION:22,NORMAL:23,OVERLAY:24,PIN_LIGHT:25,REFLECT:26,SATURATION:27,SCREEN:28,SOFT_LIGHT:29,SRC:30,SUBTRACT:31,VIVID_LIGHT:32},fm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb+src.rgb;return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",mm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){return mix(dst,src,src.a*opacity);}",pm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=(dst.rgb+src.rgb)*0.5;return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",vm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=RGBToHSL(dst.rgb);vec3 b=RGBToHSL(src.rgb);vec3 c=HSLToRGB(vec3(b.xy,a.z));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",gm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=dst.rgb,b=src.rgb;vec3 c=mix(step(0.0,b)*(1.0-min(vec3(1.0),(1.0-a)/max(b,1e-9))),vec3(1.0),step(1.0,a));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",xm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=dst.rgb,b=src.rgb;vec3 c=step(0.0,a)*mix(min(vec3(1.0),a/max(1.0-b,1e-9)),vec3(1.0),step(1.0,b));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",wm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=min(dst.rgb,src.rgb);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Mm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=abs(dst.rgb-src.rgb);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",ym="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb/max(src.rgb,1e-9);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",bm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb+src.rgb-2.0*dst.rgb*src.rgb;return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Sm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=min(dst.rgb,1.0);vec3 b=min(src.rgb,1.0);vec3 c=mix(2.0*a*b,1.0-2.0*(1.0-a)*(1.0-b),step(0.5,b));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Tm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=step(1.0,dst.rgb+src.rgb);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Em="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=RGBToHSL(dst.rgb);vec3 b=RGBToHSL(src.rgb);vec3 c=HSLToRGB(vec3(b.x,a.yz));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Rm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=max(1.0-src.rgb,0.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Am="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=src.rgb*max(1.0-dst.rgb,0.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",km="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=max(dst.rgb,src.rgb);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",_m="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=clamp(src.rgb+dst.rgb-1.0,0.0,1.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Fm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=min(dst.rgb+src.rgb,1.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Dm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=clamp(2.0*src.rgb+dst.rgb-1.0,0.0,1.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Pm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=RGBToHSL(dst.rgb);vec3 b=RGBToHSL(src.rgb);vec3 c=HSLToRGB(vec3(a.xy,b.z));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Im="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb*src.rgb;return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Cm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=max(1.0-abs(1.0-dst.rgb-src.rgb),0.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Lm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){return mix(dst,src,opacity);}",Nm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=2.0*src.rgb*dst.rgb;vec3 b=1.0-2.0*(1.0-src.rgb)*(1.0-dst.rgb);vec3 c=mix(a,b,step(0.5,dst.rgb));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",zm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 src2=2.0*src.rgb;vec3 c=mix(mix(src2,dst.rgb,step(0.5*dst.rgb,src.rgb)),max(src2-1.0,vec3(0.0)),step(dst.rgb,src2-1.0));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Um="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=min(dst.rgb*dst.rgb/max(1.0-src.rgb,1e-9),1.0);vec3 c=mix(a,src.rgb,step(1.0,src.rgb));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Bm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=RGBToHSL(dst.rgb);vec3 b=RGBToHSL(src.rgb);vec3 c=HSLToRGB(vec3(a.x,b.y,a.z));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Om="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb+src.rgb-min(dst.rgb*src.rgb,1.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Hm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 src2=2.0*src.rgb;vec3 d=dst.rgb+(src2-1.0);vec3 w=step(0.5,src.rgb);vec3 a=dst.rgb-(1.0-src2)*dst.rgb*(1.0-dst.rgb);vec3 b=mix(d*(sqrt(dst.rgb)-dst.rgb),d*dst.rgb*((16.0*dst.rgb-12.0)*dst.rgb+3.0),w*(1.0-step(0.25,dst.rgb)));vec3 c=mix(a,b,w);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Gm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){return src;}",Km="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=max(dst.rgb-src.rgb,0.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Wm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=mix(max(1.0-min((1.0-dst.rgb)/(2.0*src.rgb),1.0),0.0),min(dst.rgb/(2.0*(1.0-src.rgb)),1.0),step(0.5,src.rgb));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Vm=new Map([[Ce.ADD,fm],[Ce.ALPHA,mm],[Ce.AVERAGE,pm],[Ce.COLOR,vm],[Ce.COLOR_BURN,gm],[Ce.COLOR_DODGE,xm],[Ce.DARKEN,wm],[Ce.DIFFERENCE,Mm],[Ce.DIVIDE,ym],[Ce.DST,null],[Ce.EXCLUSION,bm],[Ce.HARD_LIGHT,Sm],[Ce.HARD_MIX,Tm],[Ce.HUE,Em],[Ce.INVERT,Rm],[Ce.INVERT_RGB,Am],[Ce.LIGHTEN,km],[Ce.LINEAR_BURN,_m],[Ce.LINEAR_DODGE,Fm],[Ce.LINEAR_LIGHT,Dm],[Ce.LUMINOSITY,Pm],[Ce.MULTIPLY,Im],[Ce.NEGATION,Cm],[Ce.NORMAL,Lm],[Ce.OVERLAY,Nm],[Ce.PIN_LIGHT,zm],[Ce.REFLECT,Um],[Ce.SATURATION,Bm],[Ce.SCREEN,Om],[Ce.SOFT_LIGHT,Hm],[Ce.SRC,Gm],[Ce.SUBTRACT,Km],[Ce.VIVID_LIGHT,Wm]]),Ym=class extends tl{constructor(e,t=1){super(),this._blendFunction=e,this.opacity=new Pe(t)}getOpacity(){return this.opacity.value}setOpacity(e){this.opacity.value=e}get blendFunction(){return this._blendFunction}set blendFunction(e){this._blendFunction=e,this.dispatchEvent({type:"change"})}getBlendFunction(){return this.blendFunction}setBlendFunction(e){this.blendFunction=e}getShaderCode(){return Vm.get(this.blendFunction)}},bh=class extends tl{constructor(e,t,{attributes:a=zs.NONE,blendFunction:s=Ce.NORMAL,defines:o=new Map,uniforms:i=new Map,extensions:l=null,vertexShader:u=null}={}){super(),this.name=e,this.renderer=null,this.attributes=a,this.fragmentShader=t,this.vertexShader=u,this.defines=o,this.uniforms=i,this.extensions=l,this.blendMode=new Ym(s),this.blendMode.addEventListener("change",r=>this.setChanged()),this._inputColorSpace=sh,this._outputColorSpace=La}get inputColorSpace(){return this._inputColorSpace}set inputColorSpace(e){this._inputColorSpace=e,this.setChanged()}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e,this.setChanged()}set mainScene(e){}set mainCamera(e){}getName(){return this.name}setRenderer(e){this.renderer=e}getDefines(){return this.defines}getUniforms(){return this.uniforms}getExtensions(){return this.extensions}getBlendMode(){return this.blendMode}getAttributes(){return this.attributes}setAttributes(e){this.attributes=e,this.setChanged()}getFragmentShader(){return this.fragmentShader}setFragmentShader(e){this.fragmentShader=e,this.setChanged()}getVertexShader(){return this.vertexShader}setVertexShader(e){this.vertexShader=e,this.setChanged()}setChanged(){this.dispatchEvent({type:"change"})}setDepthTexture(e,t=an){}update(e,t,a){}setSize(e,t){}initialize(e,t,a){}dispose(){for(const e of Object.keys(this)){const t=this[e];(t instanceof Zt||t instanceof oh||t instanceof el||t instanceof pa)&&this[e].dispose()}}},rl={MEDIUM:2,LARGE:3},$m=`#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D inputBuffer;
#else
uniform lowp sampler2D inputBuffer;
#endif
varying vec2 vUv0;varying vec2 vUv1;varying vec2 vUv2;varying vec2 vUv3;void main(){vec4 sum=texture2D(inputBuffer,vUv0);sum+=texture2D(inputBuffer,vUv1);sum+=texture2D(inputBuffer,vUv2);sum+=texture2D(inputBuffer,vUv3);gl_FragColor=sum*0.25;
#include <colorspace_fragment>
}`,jm="uniform vec4 texelSize;uniform float kernel;uniform float scale;varying vec2 vUv0;varying vec2 vUv1;varying vec2 vUv2;varying vec2 vUv3;void main(){vec2 uv=position.xy*0.5+0.5;vec2 dUv=(texelSize.xy*vec2(kernel)+texelSize.zw)*scale;vUv0=vec2(uv.x-dUv.x,uv.y+dUv.y);vUv1=vec2(uv.x+dUv.x,uv.y+dUv.y);vUv2=vec2(uv.x+dUv.x,uv.y-dUv.y);vUv3=vec2(uv.x-dUv.x,uv.y-dUv.y);gl_Position=vec4(position.xy,1.0,1.0);}",Xm=[new Float32Array([0,0]),new Float32Array([0,1,1]),new Float32Array([0,1,1,2]),new Float32Array([0,1,2,2,3]),new Float32Array([0,1,2,3,4,4,5]),new Float32Array([0,1,2,3,4,5,7,8,9,10])],qm=class extends Rt{constructor(e=new da){super({name:"KawaseBlurMaterial",uniforms:{inputBuffer:new Pe(null),texelSize:new Pe(new da),scale:new Pe(1),kernel:new Pe(0)},blending:Us,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:$m,vertexShader:jm}),this.setTexelSize(e.x,e.y),this.kernelSize=rl.MEDIUM}set inputBuffer(e){this.uniforms.inputBuffer.value=e}setInputBuffer(e){this.inputBuffer=e}get kernelSequence(){return Xm[this.kernelSize]}get scale(){return this.uniforms.scale.value}set scale(e){this.uniforms.scale.value=e}getScale(){return this.uniforms.scale.value}setScale(e){this.uniforms.scale.value=e}getKernel(){return null}get kernel(){return this.uniforms.kernel.value}set kernel(e){this.uniforms.kernel.value=e}setKernel(e){this.kernel=e}setTexelSize(e,t){this.uniforms.texelSize.value.set(e,t,e*.5,t*.5)}setSize(e,t){const a=1/e,s=1/t;this.uniforms.texelSize.value.set(a,s,a*.5,s*.5)}},Zm=class extends pa{constructor({kernelSize:e=rl.MEDIUM,resolutionScale:t=.5,width:a=Ia.AUTO_SIZE,height:s=Ia.AUTO_SIZE,resolutionX:o=a,resolutionY:i=s}={}){super("KawaseBlurPass"),this.renderTargetA=new Zt(1,1,{depthBuffer:!1}),this.renderTargetA.texture.name="Blur.Target.A",this.renderTargetB=this.renderTargetA.clone(),this.renderTargetB.texture.name="Blur.Target.B";const l=this.resolution=new Ia(this,o,i,t);l.addEventListener("change",u=>this.setSize(l.baseWidth,l.baseHeight)),this._blurMaterial=new qm,this._blurMaterial.kernelSize=e,this.copyMaterial=new wh}getResolution(){return this.resolution}get blurMaterial(){return this._blurMaterial}set blurMaterial(e){this._blurMaterial=e}get dithering(){return this.copyMaterial.dithering}set dithering(e){this.copyMaterial.dithering=e}get kernelSize(){return this.blurMaterial.kernelSize}set kernelSize(e){this.blurMaterial.kernelSize=e}get width(){return this.resolution.width}set width(e){this.resolution.preferredWidth=e}get height(){return this.resolution.height}set height(e){this.resolution.preferredHeight=e}get scale(){return this.blurMaterial.scale}set scale(e){this.blurMaterial.scale=e}getScale(){return this.blurMaterial.scale}setScale(e){this.blurMaterial.scale=e}getKernelSize(){return this.kernelSize}setKernelSize(e){this.kernelSize=e}getResolutionScale(){return this.resolution.scale}setResolutionScale(e){this.resolution.scale=e}render(e,t,a,s,o){const i=this.scene,l=this.camera,u=this.renderTargetA,r=this.renderTargetB,c=this.blurMaterial,d=c.kernelSequence;let p=t;this.fullscreenMaterial=c;for(let M=0,y=d.length;M<y;++M){const g=(M&1)===0?u:r;c.kernel=d[M],c.inputBuffer=p.texture,e.setRenderTarget(g),e.render(i,l),p=g}this.fullscreenMaterial=this.copyMaterial,this.copyMaterial.inputBuffer=p.texture,e.setRenderTarget(this.renderToScreen?null:a),e.render(i,l)}setSize(e,t){const a=this.resolution;a.setBaseSize(e,t);const s=a.width,o=a.height;this.renderTargetA.setSize(s,o),this.renderTargetB.setSize(s,o),this.blurMaterial.setSize(e,t)}initialize(e,t,a){a!==void 0&&(this.renderTargetA.texture.type=a,this.renderTargetB.texture.type=a,a!==Ot?(this.blurMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1",this.copyMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1"):e!==null&&e.outputColorSpace===ct&&(this.renderTargetA.texture.colorSpace=ct,this.renderTargetB.texture.colorSpace=ct))}static get AUTO_SIZE(){return Ia.AUTO_SIZE}},Qm=`#include <common>
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
}`,Jm=class extends Rt{constructor(e=!1,t=null){super({name:"LuminanceMaterial",defines:{THREE_REVISION:al.replace(/\D+/g,"")},uniforms:{inputBuffer:new Pe(null),threshold:new Pe(0),smoothing:new Pe(1),range:new Pe(null)},blending:Us,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:Qm,vertexShader:nl}),this.colorOutput=e,this.luminanceRange=t}set inputBuffer(e){this.uniforms.inputBuffer.value=e}setInputBuffer(e){this.uniforms.inputBuffer.value=e}get threshold(){return this.uniforms.threshold.value}set threshold(e){this.smoothing>0||e>0?this.defines.THRESHOLD="1":delete this.defines.THRESHOLD,this.uniforms.threshold.value=e}getThreshold(){return this.threshold}setThreshold(e){this.threshold=e}get smoothing(){return this.uniforms.smoothing.value}set smoothing(e){this.threshold>0||e>0?this.defines.THRESHOLD="1":delete this.defines.THRESHOLD,this.uniforms.smoothing.value=e}getSmoothingFactor(){return this.smoothing}setSmoothingFactor(e){this.smoothing=e}get useThreshold(){return this.threshold>0||this.smoothing>0}set useThreshold(e){}get colorOutput(){return this.defines.COLOR!==void 0}set colorOutput(e){e?this.defines.COLOR="1":delete this.defines.COLOR,this.needsUpdate=!0}isColorOutputEnabled(e){return this.colorOutput}setColorOutputEnabled(e){this.colorOutput=e}get useRange(){return this.luminanceRange!==null}set useRange(e){this.luminanceRange=null}get luminanceRange(){return this.uniforms.range.value}set luminanceRange(e){e!==null?this.defines.RANGE="1":delete this.defines.RANGE,this.uniforms.range.value=e,this.needsUpdate=!0}getLuminanceRange(){return this.luminanceRange}setLuminanceRange(e){this.luminanceRange=e}},Sh=class extends pa{constructor({renderTarget:e,luminanceRange:t,colorOutput:a,resolutionScale:s=1,width:o=Ia.AUTO_SIZE,height:i=Ia.AUTO_SIZE,resolutionX:l=o,resolutionY:u=i}={}){super("LuminancePass"),this.fullscreenMaterial=new Jm(a,t),this.needsSwap=!1,this.renderTarget=e,this.renderTarget===void 0&&(this.renderTarget=new Zt(1,1,{depthBuffer:!1}),this.renderTarget.texture.name="LuminancePass.Target");const r=this.resolution=new Ia(this,l,u,s);r.addEventListener("change",c=>this.setSize(r.baseWidth,r.baseHeight))}get texture(){return this.renderTarget.texture}getTexture(){return this.renderTarget.texture}getResolution(){return this.resolution}render(e,t,a,s,o){const i=this.fullscreenMaterial;i.inputBuffer=t.texture,e.setRenderTarget(this.renderToScreen?null:this.renderTarget),e.render(this.scene,this.camera)}setSize(e,t){const a=this.resolution;a.setBaseSize(e,t),this.renderTarget.setSize(a.width,a.height)}initialize(e,t,a){a!==void 0&&a!==Ot&&(this.renderTarget.texture.type=a,this.fullscreenMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1")}},e0=`#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D inputBuffer;
#else
uniform lowp sampler2D inputBuffer;
#endif
#define WEIGHT_INNER 0.125
#define WEIGHT_OUTER 0.05556
varying vec2 vUv;varying vec2 vUv00;varying vec2 vUv01;varying vec2 vUv02;varying vec2 vUv03;varying vec2 vUv04;varying vec2 vUv05;varying vec2 vUv06;varying vec2 vUv07;varying vec2 vUv08;varying vec2 vUv09;varying vec2 vUv10;varying vec2 vUv11;float clampToBorder(const in vec2 uv){return float(uv.s>=0.0&&uv.s<=1.0&&uv.t>=0.0&&uv.t<=1.0);}void main(){vec4 c=vec4(0.0);vec4 w=WEIGHT_INNER*vec4(clampToBorder(vUv00),clampToBorder(vUv01),clampToBorder(vUv02),clampToBorder(vUv03));c+=w.x*texture2D(inputBuffer,vUv00);c+=w.y*texture2D(inputBuffer,vUv01);c+=w.z*texture2D(inputBuffer,vUv02);c+=w.w*texture2D(inputBuffer,vUv03);w=WEIGHT_OUTER*vec4(clampToBorder(vUv04),clampToBorder(vUv05),clampToBorder(vUv06),clampToBorder(vUv07));c+=w.x*texture2D(inputBuffer,vUv04);c+=w.y*texture2D(inputBuffer,vUv05);c+=w.z*texture2D(inputBuffer,vUv06);c+=w.w*texture2D(inputBuffer,vUv07);w=WEIGHT_OUTER*vec4(clampToBorder(vUv08),clampToBorder(vUv09),clampToBorder(vUv10),clampToBorder(vUv11));c+=w.x*texture2D(inputBuffer,vUv08);c+=w.y*texture2D(inputBuffer,vUv09);c+=w.z*texture2D(inputBuffer,vUv10);c+=w.w*texture2D(inputBuffer,vUv11);c+=WEIGHT_OUTER*texture2D(inputBuffer,vUv);gl_FragColor=c;
#include <colorspace_fragment>
}`,t0="uniform vec2 texelSize;varying vec2 vUv;varying vec2 vUv00;varying vec2 vUv01;varying vec2 vUv02;varying vec2 vUv03;varying vec2 vUv04;varying vec2 vUv05;varying vec2 vUv06;varying vec2 vUv07;varying vec2 vUv08;varying vec2 vUv09;varying vec2 vUv10;varying vec2 vUv11;void main(){vUv=position.xy*0.5+0.5;vUv00=vUv+texelSize*vec2(-1.0,1.0);vUv01=vUv+texelSize*vec2(1.0,1.0);vUv02=vUv+texelSize*vec2(-1.0,-1.0);vUv03=vUv+texelSize*vec2(1.0,-1.0);vUv04=vUv+texelSize*vec2(-2.0,2.0);vUv05=vUv+texelSize*vec2(0.0,2.0);vUv06=vUv+texelSize*vec2(2.0,2.0);vUv07=vUv+texelSize*vec2(-2.0,0.0);vUv08=vUv+texelSize*vec2(2.0,0.0);vUv09=vUv+texelSize*vec2(-2.0,-2.0);vUv10=vUv+texelSize*vec2(0.0,-2.0);vUv11=vUv+texelSize*vec2(2.0,-2.0);gl_Position=vec4(position.xy,1.0,1.0);}",a0=class extends Rt{constructor(){super({name:"DownsamplingMaterial",uniforms:{inputBuffer:new Pe(null),texelSize:new Pe(new Ne)},blending:Us,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:e0,vertexShader:t0})}set inputBuffer(e){this.uniforms.inputBuffer.value=e}setSize(e,t){this.uniforms.texelSize.value.set(1/e,1/t)}},s0=`#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D inputBuffer;uniform mediump sampler2D supportBuffer;
#else
uniform lowp sampler2D inputBuffer;uniform lowp sampler2D supportBuffer;
#endif
uniform float radius;varying vec2 vUv;varying vec2 vUv0;varying vec2 vUv1;varying vec2 vUv2;varying vec2 vUv3;varying vec2 vUv4;varying vec2 vUv5;varying vec2 vUv6;varying vec2 vUv7;void main(){vec4 c=vec4(0.0);c+=texture2D(inputBuffer,vUv0)*0.0625;c+=texture2D(inputBuffer,vUv1)*0.125;c+=texture2D(inputBuffer,vUv2)*0.0625;c+=texture2D(inputBuffer,vUv3)*0.125;c+=texture2D(inputBuffer,vUv)*0.25;c+=texture2D(inputBuffer,vUv4)*0.125;c+=texture2D(inputBuffer,vUv5)*0.0625;c+=texture2D(inputBuffer,vUv6)*0.125;c+=texture2D(inputBuffer,vUv7)*0.0625;vec4 baseColor=texture2D(supportBuffer,vUv);gl_FragColor=mix(baseColor,c,radius);
#include <colorspace_fragment>
}`,o0="uniform vec2 texelSize;varying vec2 vUv;varying vec2 vUv0;varying vec2 vUv1;varying vec2 vUv2;varying vec2 vUv3;varying vec2 vUv4;varying vec2 vUv5;varying vec2 vUv6;varying vec2 vUv7;void main(){vUv=position.xy*0.5+0.5;vUv0=vUv+texelSize*vec2(-1.0,1.0);vUv1=vUv+texelSize*vec2(0.0,1.0);vUv2=vUv+texelSize*vec2(1.0,1.0);vUv3=vUv+texelSize*vec2(-1.0,0.0);vUv4=vUv+texelSize*vec2(1.0,0.0);vUv5=vUv+texelSize*vec2(-1.0,-1.0);vUv6=vUv+texelSize*vec2(0.0,-1.0);vUv7=vUv+texelSize*vec2(1.0,-1.0);gl_Position=vec4(position.xy,1.0,1.0);}",i0=class extends Rt{constructor(){super({name:"UpsamplingMaterial",uniforms:{inputBuffer:new Pe(null),supportBuffer:new Pe(null),texelSize:new Pe(new Ne),radius:new Pe(.85)},blending:Us,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:s0,vertexShader:o0})}set inputBuffer(e){this.uniforms.inputBuffer.value=e}set supportBuffer(e){this.uniforms.supportBuffer.value=e}get radius(){return this.uniforms.radius.value}set radius(e){this.uniforms.radius.value=e}setSize(e,t){this.uniforms.texelSize.value.set(1/e,1/t)}},n0=class extends pa{constructor(){super("MipmapBlurPass"),this.needsSwap=!1,this.renderTarget=new Zt(1,1,{depthBuffer:!1}),this.renderTarget.texture.name="Upsampling.Mipmap0",this.downsamplingMipmaps=[],this.upsamplingMipmaps=[],this.downsamplingMaterial=new a0,this.upsamplingMaterial=new i0,this.resolution=new Ne}get texture(){return this.renderTarget.texture}get levels(){return this.downsamplingMipmaps.length}set levels(e){if(this.levels!==e){const t=this.renderTarget;this.dispose(),this.downsamplingMipmaps=[],this.upsamplingMipmaps=[];for(let a=0;a<e;++a){const s=t.clone();s.texture.name="Downsampling.Mipmap"+a,this.downsamplingMipmaps.push(s)}this.upsamplingMipmaps.push(t);for(let a=1,s=e-1;a<s;++a){const o=t.clone();o.texture.name="Upsampling.Mipmap"+a,this.upsamplingMipmaps.push(o)}this.setSize(this.resolution.x,this.resolution.y)}}get radius(){return this.upsamplingMaterial.radius}set radius(e){this.upsamplingMaterial.radius=e}render(e,t,a,s,o){const{scene:i,camera:l}=this,{downsamplingMaterial:u,upsamplingMaterial:r}=this,{downsamplingMipmaps:c,upsamplingMipmaps:d}=this;let p=t;this.fullscreenMaterial=u;for(let M=0,y=c.length;M<y;++M){const g=c[M];u.setSize(p.width,p.height),u.inputBuffer=p.texture,e.setRenderTarget(g),e.render(i,l),p=g}this.fullscreenMaterial=r;for(let M=d.length-1;M>=0;--M){const y=d[M];r.setSize(p.width,p.height),r.inputBuffer=p.texture,r.supportBuffer=c[M].texture,e.setRenderTarget(y),e.render(i,l),p=y}}setSize(e,t){const a=this.resolution;a.set(e,t);let s=a.width,o=a.height;for(let i=0,l=this.downsamplingMipmaps.length;i<l;++i)s=Math.round(s*.5),o=Math.round(o*.5),this.downsamplingMipmaps[i].setSize(s,o),i<this.upsamplingMipmaps.length&&this.upsamplingMipmaps[i].setSize(s,o)}initialize(e,t,a){if(a!==void 0){const s=this.downsamplingMipmaps.concat(this.upsamplingMipmaps);for(const o of s)o.texture.type=a;if(a!==Ot)this.downsamplingMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1",this.upsamplingMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1";else if(e!==null&&e.outputColorSpace===ct)for(const o of s)o.texture.colorSpace=ct}}dispose(){super.dispose();for(const e of this.downsamplingMipmaps.concat(this.upsamplingMipmaps))e.dispose()}},r0=`#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D map;
#else
uniform lowp sampler2D map;
#endif
uniform float intensity;void mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor){outputColor=texture2D(map,uv)*intensity;}`,l0=class extends bh{constructor({blendFunction:e=Ce.SCREEN,luminanceThreshold:t=1,luminanceSmoothing:a=.03,mipmapBlur:s=!0,intensity:o=1,radius:i=.85,levels:l=8,kernelSize:u=rl.LARGE,resolutionScale:r=.5,width:c=Ia.AUTO_SIZE,height:d=Ia.AUTO_SIZE,resolutionX:p=c,resolutionY:M=d}={}){super("BloomEffect",r0,{blendFunction:e,uniforms:new Map([["map",new Pe(null)],["intensity",new Pe(o)]])}),this.renderTarget=new Zt(1,1,{depthBuffer:!1}),this.renderTarget.texture.name="Bloom.Target",this.blurPass=new Zm({kernelSize:u}),this.luminancePass=new Sh({colorOutput:!0}),this.luminanceMaterial.threshold=t,this.luminanceMaterial.smoothing=a,this.mipmapBlurPass=new n0,this.mipmapBlurPass.enabled=s,this.mipmapBlurPass.radius=i,this.mipmapBlurPass.levels=l,this.uniforms.get("map").value=s?this.mipmapBlurPass.texture:this.renderTarget.texture;const y=this.resolution=new Ia(this,p,M,r);y.addEventListener("change",g=>this.setSize(y.baseWidth,y.baseHeight))}get texture(){return this.mipmapBlurPass.enabled?this.mipmapBlurPass.texture:this.renderTarget.texture}getTexture(){return this.texture}getResolution(){return this.resolution}getBlurPass(){return this.blurPass}getLuminancePass(){return this.luminancePass}get luminanceMaterial(){return this.luminancePass.fullscreenMaterial}getLuminanceMaterial(){return this.luminancePass.fullscreenMaterial}get width(){return this.resolution.width}set width(e){this.resolution.preferredWidth=e}get height(){return this.resolution.height}set height(e){this.resolution.preferredHeight=e}get dithering(){return this.blurPass.dithering}set dithering(e){this.blurPass.dithering=e}get kernelSize(){return this.blurPass.kernelSize}set kernelSize(e){this.blurPass.kernelSize=e}get distinction(){return console.warn(this.name,"distinction was removed"),1}set distinction(e){console.warn(this.name,"distinction was removed")}get intensity(){return this.uniforms.get("intensity").value}set intensity(e){this.uniforms.get("intensity").value=e}getIntensity(){return this.intensity}setIntensity(e){this.intensity=e}getResolutionScale(){return this.resolution.scale}setResolutionScale(e){this.resolution.scale=e}update(e,t,a){const s=this.renderTarget,o=this.luminancePass;o.enabled?(o.render(e,t),this.mipmapBlurPass.enabled?this.mipmapBlurPass.render(e,o.renderTarget):this.blurPass.render(e,o.renderTarget,s)):this.mipmapBlurPass.enabled?this.mipmapBlurPass.render(e,t):this.blurPass.render(e,t,s)}setSize(e,t){const a=this.resolution;a.setBaseSize(e,t),this.renderTarget.setSize(a.width,a.height),this.blurPass.resolution.copy(a),this.luminancePass.setSize(e,t),this.mipmapBlurPass.setSize(e,t)}initialize(e,t,a){this.blurPass.initialize(e,t,a),this.luminancePass.initialize(e,t,a),this.mipmapBlurPass.initialize(e,t,a),a!==void 0&&(this.renderTarget.texture.type=a,e!==null&&e.outputColorSpace===ct&&(this.renderTarget.texture.colorSpace=ct))}},c0=class extends pa{constructor(e,t,a=null){super("RenderPass",e,t),this.needsSwap=!1,this.needsDepthBlit=!0,this.clearPass=new yh,this.overrideMaterialManager=a===null?null:new Tu(a),this.ignoreBackground=!1,this.skipShadowMapUpdate=!1,this.selection=null}set mainScene(e){this.scene=e}set mainCamera(e){this.camera=e}get renderToScreen(){return super.renderToScreen}set renderToScreen(e){super.renderToScreen=e,this.clearPass.renderToScreen=e}get overrideMaterial(){const e=this.overrideMaterialManager;return e!==null?e.material:null}set overrideMaterial(e){const t=this.overrideMaterialManager;e!==null?t!==null?t.setMaterial(e):this.overrideMaterialManager=new Tu(e):t!==null&&(t.dispose(),this.overrideMaterialManager=null)}getOverrideMaterial(){return this.overrideMaterial}setOverrideMaterial(e){this.overrideMaterial=e}get clear(){return this.clearPass.enabled}set clear(e){this.clearPass.enabled=e}getSelection(){return this.selection}setSelection(e){this.selection=e}isBackgroundDisabled(){return this.ignoreBackground}setBackgroundDisabled(e){this.ignoreBackground=e}isShadowMapDisabled(){return this.skipShadowMapUpdate}setShadowMapDisabled(e){this.skipShadowMapUpdate=e}getClearPass(){return this.clearPass}render(e,t,a,s,o){const i=this.scene,l=this.camera,u=this.selection,r=l.layers.mask,c=i.background,d=e.shadowMap.autoUpdate,p=this.renderToScreen?null:t;u!==null&&l.layers.set(u.getLayer()),this.skipShadowMapUpdate&&(e.shadowMap.autoUpdate=!1),(this.ignoreBackground||this.clearPass.overrideClearColor!==null)&&(i.background=null),this.clearPass.enabled&&this.clearPass.render(e,t),e.setRenderTarget(p),this.overrideMaterialManager!==null?this.overrideMaterialManager.render(e,i,l):e.render(i,l),l.layers.mask=r,i.background=c,e.shadowMap.autoUpdate=d}},na={LINEAR:0,REINHARD:1,REINHARD2:2,REINHARD2_ADAPTIVE:3,OPTIMIZED_CINEON:5,CINEON:5,ACES_FILMIC:6,AGX:7,NEUTRAL:8},u0=`#include <packing>
#define packFloatToRGBA(v) packDepthToRGBA(v)
#define unpackRGBAToFloat(v) unpackRGBAToDepth(v)
uniform lowp sampler2D luminanceBuffer0;uniform lowp sampler2D luminanceBuffer1;uniform float minLuminance;uniform float deltaTime;uniform float tau;varying vec2 vUv;void main(){float l0=unpackRGBAToFloat(texture2D(luminanceBuffer0,vUv));
#if __VERSION__ < 300
float l1=texture2DLodEXT(luminanceBuffer1,vUv,MIP_LEVEL_1X1).r;
#else
float l1=textureLod(luminanceBuffer1,vUv,MIP_LEVEL_1X1).r;
#endif
l0=max(minLuminance,l0);l1=max(minLuminance,l1);float adaptedLum=l0+(l1-l0)*(1.0-exp(-deltaTime*tau));gl_FragColor=(adaptedLum==1.0)?vec4(1.0):packFloatToRGBA(adaptedLum);}`,h0=class extends Rt{constructor(){super({name:"AdaptiveLuminanceMaterial",defines:{MIP_LEVEL_1X1:"0.0"},uniforms:{luminanceBuffer0:new Pe(null),luminanceBuffer1:new Pe(null),minLuminance:new Pe(.01),deltaTime:new Pe(0),tau:new Pe(1)},extensions:{shaderTextureLOD:!0},blending:Us,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:u0,vertexShader:nl})}set luminanceBuffer0(e){this.uniforms.luminanceBuffer0.value=e}setLuminanceBuffer0(e){this.uniforms.luminanceBuffer0.value=e}set luminanceBuffer1(e){this.uniforms.luminanceBuffer1.value=e}setLuminanceBuffer1(e){this.uniforms.luminanceBuffer1.value=e}set mipLevel1x1(e){this.defines.MIP_LEVEL_1X1=e.toFixed(1),this.needsUpdate=!0}setMipLevel1x1(e){this.mipLevel1x1=e}set deltaTime(e){this.uniforms.deltaTime.value=e}setDeltaTime(e){this.uniforms.deltaTime.value=e}get minLuminance(){return this.uniforms.minLuminance.value}set minLuminance(e){this.uniforms.minLuminance.value=e}getMinLuminance(){return this.uniforms.minLuminance.value}setMinLuminance(e){this.uniforms.minLuminance.value=e}get adaptationRate(){return this.uniforms.tau.value}set adaptationRate(e){this.uniforms.tau.value=e}getAdaptationRate(){return this.uniforms.tau.value}setAdaptationRate(e){this.uniforms.tau.value=e}},d0=class extends pa{constructor(e,{minLuminance:t=.01,adaptationRate:a=1}={}){super("AdaptiveLuminancePass"),this.fullscreenMaterial=new h0,this.needsSwap=!1,this.renderTargetPrevious=new Zt(1,1,{minFilter:po,magFilter:po,depthBuffer:!1}),this.renderTargetPrevious.texture.name="Luminance.Previous";const s=this.fullscreenMaterial;s.luminanceBuffer0=this.renderTargetPrevious.texture,s.luminanceBuffer1=e,s.minLuminance=t,s.adaptationRate=a,this.renderTargetAdapted=this.renderTargetPrevious.clone(),this.renderTargetAdapted.texture.name="Luminance.Adapted",this.copyPass=new Mh(this.renderTargetPrevious,!1)}get texture(){return this.renderTargetAdapted.texture}getTexture(){return this.renderTargetAdapted.texture}set mipLevel1x1(e){this.fullscreenMaterial.mipLevel1x1=e}get adaptationRate(){return this.fullscreenMaterial.adaptationRate}set adaptationRate(e){this.fullscreenMaterial.adaptationRate=e}render(e,t,a,s,o){this.fullscreenMaterial.deltaTime=s,e.setRenderTarget(this.renderToScreen?null:this.renderTargetAdapted),e.render(this.scene,this.camera),this.copyPass.render(e,this.renderTargetAdapted)}},f0=`#include <tonemapping_pars_fragment>
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
}`,m0=class extends bh{constructor({blendFunction:e=Ce.SRC,adaptive:t=!1,mode:a=t?na.REINHARD2_ADAPTIVE:na.AGX,resolution:s=256,maxLuminance:o=4,whitePoint:i=o,middleGrey:l=.6,minLuminance:u=.01,averageLuminance:r=1,adaptationRate:c=1}={}){super("ToneMappingEffect",f0,{blendFunction:e,uniforms:new Map([["luminanceBuffer",new Pe(null)],["maxLuminance",new Pe(o)],["whitePoint",new Pe(i)],["middleGrey",new Pe(l)],["averageLuminance",new Pe(r)]])}),this.renderTargetLuminance=new Zt(1,1,{minFilter:Ya,depthBuffer:!1}),this.renderTargetLuminance.texture.generateMipmaps=!0,this.renderTargetLuminance.texture.name="Luminance",this.luminancePass=new Sh({renderTarget:this.renderTargetLuminance}),this.adaptiveLuminancePass=new d0(this.luminancePass.texture,{minLuminance:u,adaptationRate:c}),this.uniforms.get("luminanceBuffer").value=this.adaptiveLuminancePass.texture,this.resolution=s,this.mode=a}get mode(){return Number(this.defines.get("TONE_MAPPING_MODE"))}set mode(e){if(this.mode===e)return;const a=al.replace(/\D+/g,"")>=168?"CineonToneMapping(texel)":"OptimizedCineonToneMapping(texel)";switch(this.defines.clear(),this.defines.set("TONE_MAPPING_MODE",e.toFixed(0)),e){case na.LINEAR:this.defines.set("toneMapping(texel)","LinearToneMapping(texel)");break;case na.REINHARD:this.defines.set("toneMapping(texel)","ReinhardToneMapping(texel)");break;case na.CINEON:case na.OPTIMIZED_CINEON:this.defines.set("toneMapping(texel)",a);break;case na.ACES_FILMIC:this.defines.set("toneMapping(texel)","ACESFilmicToneMapping(texel)");break;case na.AGX:this.defines.set("toneMapping(texel)","AgXToneMapping(texel)");break;case na.NEUTRAL:this.defines.set("toneMapping(texel)","NeutralToneMapping(texel)");break;default:this.defines.set("toneMapping(texel)","texel");break}this.adaptiveLuminancePass.enabled=e===na.REINHARD2_ADAPTIVE,this.setChanged()}getMode(){return this.mode}setMode(e){this.mode=e}get whitePoint(){return this.uniforms.get("whitePoint").value}set whitePoint(e){this.uniforms.get("whitePoint").value=e}get middleGrey(){return this.uniforms.get("middleGrey").value}set middleGrey(e){this.uniforms.get("middleGrey").value=e}get averageLuminance(){return this.uniforms.get("averageLuminance").value}set averageLuminance(e){this.uniforms.get("averageLuminance").value=e}get adaptiveLuminanceMaterial(){return this.adaptiveLuminancePass.fullscreenMaterial}getAdaptiveLuminanceMaterial(){return this.adaptiveLuminanceMaterial}get resolution(){return this.luminancePass.resolution.width}set resolution(e){const t=Math.max(0,Math.ceil(Math.log2(e))),a=Math.pow(2,t);this.luminancePass.resolution.setPreferredSize(a,a),this.adaptiveLuminanceMaterial.mipLevel1x1=t}getResolution(){return this.resolution}setResolution(e){this.resolution=e}get adaptive(){return this.mode===na.REINHARD2_ADAPTIVE}set adaptive(e){this.mode=e?na.REINHARD2_ADAPTIVE:na.REINHARD2}get adaptationRate(){return this.adaptiveLuminanceMaterial.adaptationRate}set adaptationRate(e){this.adaptiveLuminanceMaterial.adaptationRate=e}get distinction(){return console.warn(this.name,"distinction was removed."),1}set distinction(e){console.warn(this.name,"distinction was removed.")}update(e,t,a){this.adaptiveLuminancePass.enabled&&(this.luminancePass.render(e,t),this.adaptiveLuminancePass.render(e,null,null,a))}initialize(e,t,a){this.adaptiveLuminancePass.initialize(e,t,a)}},p0=`#include <common>
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
}`,v0="uniform vec2 resolution;uniform vec2 texelSize;uniform float cameraNear;uniform float cameraFar;uniform float aspect;uniform float time;varying vec2 vUv;VERTEX_HEAD void main(){vUv=position.xy*0.5+0.5;VERTEX_MAIN_SUPPORT gl_Position=vec4(position.xy,1.0,1.0);}",g0=class extends Rt{constructor(e,t,a,s,o=!1){super({name:"EffectMaterial",defines:{THREE_REVISION:al.replace(/\D+/g,""),DEPTH_PACKING:"0",ENCODE_OUTPUT:"1"},uniforms:{inputBuffer:new Pe(null),depthBuffer:new Pe(null),resolution:new Pe(new Ne),texelSize:new Pe(new Ne),cameraNear:new Pe(.3),cameraFar:new Pe(1e3),aspect:new Pe(1),time:new Pe(0)},blending:Us,toneMapped:!1,depthWrite:!1,depthTest:!1,dithering:o}),e&&this.setShaderParts(e),t&&this.setDefines(t),a&&this.setUniforms(a),this.copyCameraSettings(s)}set inputBuffer(e){this.uniforms.inputBuffer.value=e}setInputBuffer(e){this.uniforms.inputBuffer.value=e}get depthBuffer(){return this.uniforms.depthBuffer.value}set depthBuffer(e){this.uniforms.depthBuffer.value=e}get depthPacking(){return Number(this.defines.DEPTH_PACKING)}set depthPacking(e){this.defines.DEPTH_PACKING=e.toFixed(0),this.needsUpdate=!0}setDepthBuffer(e,t=an){this.depthBuffer=e,this.depthPacking=t}setShaderData(e){this.setShaderParts(e.shaderParts),this.setDefines(e.defines),this.setUniforms(e.uniforms),this.setExtensions(e.extensions)}setShaderParts(e){return this.fragmentShader=p0.replace(Ye.FRAGMENT_HEAD,e.get(Ye.FRAGMENT_HEAD)||"").replace(Ye.FRAGMENT_MAIN_UV,e.get(Ye.FRAGMENT_MAIN_UV)||"").replace(Ye.FRAGMENT_MAIN_IMAGE,e.get(Ye.FRAGMENT_MAIN_IMAGE)||""),this.vertexShader=v0.replace(Ye.VERTEX_HEAD,e.get(Ye.VERTEX_HEAD)||"").replace(Ye.VERTEX_MAIN_SUPPORT,e.get(Ye.VERTEX_MAIN_SUPPORT)||""),this.needsUpdate=!0,this}setDefines(e){for(const t of e.entries())this.defines[t[0]]=t[1];return this.needsUpdate=!0,this}setUniforms(e){for(const t of e.entries())this.uniforms[t[0]]=t[1];return this}setExtensions(e){this.extensions={};for(const t of e)this.extensions[t]=!0;return this}get encodeOutput(){return this.defines.ENCODE_OUTPUT!==void 0}set encodeOutput(e){this.encodeOutput!==e&&(e?this.defines.ENCODE_OUTPUT="1":delete this.defines.ENCODE_OUTPUT,this.needsUpdate=!0)}isOutputEncodingEnabled(e){return this.encodeOutput}setOutputEncodingEnabled(e){this.encodeOutput=e}get time(){return this.uniforms.time.value}set time(e){this.uniforms.time.value=e}setDeltaTime(e){this.uniforms.time.value+=e}adoptCameraSettings(e){this.copyCameraSettings(e)}copyCameraSettings(e){e&&(this.uniforms.cameraNear.value=e.near,this.uniforms.cameraFar.value=e.far,e instanceof sl?this.defines.PERSPECTIVE_CAMERA="1":delete this.defines.PERSPECTIVE_CAMERA,this.needsUpdate=!0)}setSize(e,t){const a=this.uniforms;a.resolution.value.set(e,t),a.texelSize.value.set(1/e,1/t),a.aspect.value=e/t}static get Section(){return Ye}};function Eu(e,t,a){for(const s of t){const o="$1"+e+s.charAt(0).toUpperCase()+s.slice(1),i=new RegExp("([^\\.])(\\b"+s+"\\b)","g");for(const l of a.entries())l[1]!==null&&a.set(l[0],l[1].replace(i,o))}}function x0(e,t,a){let s=t.getFragmentShader(),o=t.getVertexShader();const i=s!==void 0&&/mainImage/.test(s),l=s!==void 0&&/mainUv/.test(s);if(a.attributes|=t.getAttributes(),s===void 0)throw new Error(`Missing fragment shader (${t.name})`);if(l&&(a.attributes&zs.CONVOLUTION)!==0)throw new Error(`Effects that transform UVs are incompatible with convolution effects (${t.name})`);if(!i&&!l)throw new Error(`Could not find mainImage or mainUv function (${t.name})`);{const u=/\w+\s+(\w+)\([\w\s,]*\)\s*{/g,r=a.shaderParts;let c=r.get(Ye.FRAGMENT_HEAD)||"",d=r.get(Ye.FRAGMENT_MAIN_UV)||"",p=r.get(Ye.FRAGMENT_MAIN_IMAGE)||"",M=r.get(Ye.VERTEX_HEAD)||"",y=r.get(Ye.VERTEX_MAIN_SUPPORT)||"";const g=new Set,R=new Set;if(l&&(d+=`	${e}MainUv(UV);
`,a.uvTransformation=!0),o!==null&&/mainSupport/.test(o)){const x=/mainSupport *\([\w\s]*?uv\s*?\)/.test(o);y+=`	${e}MainSupport(`,y+=x?`vUv);
`:`);
`;for(const S of o.matchAll(/(?:varying\s+\w+\s+([\S\s]*?);)/g))for(const k of S[1].split(/\s*,\s*/))a.varyings.add(k),g.add(k),R.add(k);for(const S of o.matchAll(u))R.add(S[1])}for(const x of s.matchAll(u))R.add(x[1]);for(const x of t.defines.keys())R.add(x.replace(/\([\w\s,]*\)/g,""));for(const x of t.uniforms.keys())R.add(x);R.delete("while"),R.delete("for"),R.delete("if"),t.uniforms.forEach((x,S)=>a.uniforms.set(e+S.charAt(0).toUpperCase()+S.slice(1),x)),t.defines.forEach((x,S)=>a.defines.set(e+S.charAt(0).toUpperCase()+S.slice(1),x));const E=new Map([["fragment",s],["vertex",o]]);Eu(e,R,a.defines),Eu(e,R,E),s=E.get("fragment"),o=E.get("vertex");const w=t.blendMode;if(a.blendModes.set(w.blendFunction,w),i){t.inputColorSpace!==null&&t.inputColorSpace!==a.colorSpace&&(p+=t.inputColorSpace===ct?`color0 = sRGBTransferOETF(color0);
	`:`color0 = sRGBToLinear(color0);
	`),t.outputColorSpace!==La?a.colorSpace=t.outputColorSpace:t.inputColorSpace!==null&&(a.colorSpace=t.inputColorSpace);const x=/MainImage *\([\w\s,]*?depth[\w\s,]*?\)/;p+=`${e}MainImage(color0, UV, `,(a.attributes&zs.DEPTH)!==0&&x.test(s)&&(p+="depth, ",a.readDepth=!0),p+=`color1);
	`;const S=e+"BlendOpacity";a.uniforms.set(S,w.opacity),p+=`color0 = blend${w.blendFunction}(color0, color1, ${S});

	`,c+=`uniform float ${S};

`}if(c+=s+`
`,o!==null&&(M+=o+`
`),r.set(Ye.FRAGMENT_HEAD,c),r.set(Ye.FRAGMENT_MAIN_UV,d),r.set(Ye.FRAGMENT_MAIN_IMAGE,p),r.set(Ye.VERTEX_HEAD,M),r.set(Ye.VERTEX_MAIN_SUPPORT,y),t.extensions!==null)for(const x of t.extensions)a.extensions.add(x)}}var w0=class extends pa{constructor(e,...t){super("EffectPass"),this.fullscreenMaterial=new g0(null,null,null,e),this.listener=a=>this.handleEvent(a),this.effects=[],this.setEffects(t),this.skipRendering=!1,this.minTime=1,this.maxTime=Number.POSITIVE_INFINITY,this.timeScale=1}set mainScene(e){for(const t of this.effects)t.mainScene=e}set mainCamera(e){this.fullscreenMaterial.copyCameraSettings(e);for(const t of this.effects)t.mainCamera=e}get encodeOutput(){return this.fullscreenMaterial.encodeOutput}set encodeOutput(e){this.fullscreenMaterial.encodeOutput=e}get dithering(){return this.fullscreenMaterial.dithering}set dithering(e){const t=this.fullscreenMaterial;t.dithering=e,t.needsUpdate=!0}setEffects(e){for(const t of this.effects)t.removeEventListener("change",this.listener);this.effects=e.sort((t,a)=>a.attributes-t.attributes);for(const t of this.effects)t.addEventListener("change",this.listener)}updateMaterial(){const e=new dm;let t=0;for(const l of this.effects)if(l.blendMode.blendFunction===Ce.DST)e.attributes|=l.getAttributes()&zs.DEPTH;else{if((e.attributes&l.getAttributes()&zs.CONVOLUTION)!==0)throw new Error(`Convolution effects cannot be merged (${l.name})`);x0("e"+t++,l,e)}let a=e.shaderParts.get(Ye.FRAGMENT_HEAD),s=e.shaderParts.get(Ye.FRAGMENT_MAIN_IMAGE),o=e.shaderParts.get(Ye.FRAGMENT_MAIN_UV);const i=/\bblend\b/g;for(const l of e.blendModes.values())a+=l.getShaderCode().replace(i,`blend${l.blendFunction}`)+`
`;(e.attributes&zs.DEPTH)!==0?(e.readDepth&&(s=`float depth = readDepth(UV);

	`+s),this.needsDepthTexture=this.getDepthTexture()===null):this.needsDepthTexture=!1,e.colorSpace===ct&&(s+=`color0 = sRGBToLinear(color0);
	`),e.uvTransformation?(o=`vec2 transformedUv = vUv;
`+o,e.defines.set("UV","transformedUv")):e.defines.set("UV","vUv"),e.shaderParts.set(Ye.FRAGMENT_HEAD,a),e.shaderParts.set(Ye.FRAGMENT_MAIN_IMAGE,s),e.shaderParts.set(Ye.FRAGMENT_MAIN_UV,o);for(const[l,u]of e.shaderParts)u!==null&&e.shaderParts.set(l,u.trim().replace(/^#/,`
#`));this.skipRendering=t===0,this.needsSwap=!this.skipRendering,this.fullscreenMaterial.setShaderData(e)}recompile(){this.updateMaterial()}getDepthTexture(){return this.fullscreenMaterial.depthBuffer}setDepthTexture(e,t=an){this.fullscreenMaterial.depthBuffer=e,this.fullscreenMaterial.depthPacking=t;for(const a of this.effects)a.setDepthTexture(e,t)}render(e,t,a,s,o){for(const i of this.effects)i.update(e,t,s);if(!this.skipRendering||this.renderToScreen){const i=this.fullscreenMaterial;i.inputBuffer=t.texture,i.time+=s*this.timeScale,e.setRenderTarget(this.renderToScreen?null:a),e.render(this.scene,this.camera)}}setSize(e,t){this.fullscreenMaterial.setSize(e,t);for(const a of this.effects)a.setSize(e,t)}initialize(e,t,a){this.renderer=e;for(const s of this.effects)s.initialize(e,t,a);this.updateMaterial(),a!==void 0&&a!==Ot&&(this.fullscreenMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1")}dispose(){super.dispose();for(const e of this.effects)e.removeEventListener("change",this.listener),e.dispose()}handleEvent(e){switch(e.type){case"change":this.recompile();break}}};const M0={exposure:1,bloomThreshold:1.7,bloomSmoothing:.3,bloomIntensity:.85,bloomRadius:.7,bloomLevels:7,msaaSamples:4},Th=2,y0=.5;function Ru(){const e=typeof window<"u"&&window.devicePixelRatio||1;return Math.min(Th,Math.max(1,e))}class b0{constructor(t,a,s,o={}){F(this,"composer");F(this,"renderPass");F(this,"bloom");F(this,"toneMapping");F(this,"finalPass");F(this,"renderer");F(this,"cssWidth",1);F(this,"cssHeight",1);F(this,"pixelRatio",1);const i={...M0,...o};this.renderer=t,t.toneMapping=hd,t.toneMappingExposure=i.exposure,t.outputColorSpace=ct,this.composer=new hm(t,{frameBufferType:Ca,multisampling:i.msaaSamples,depthBuffer:!0,stencilBuffer:!1}),this.renderPass=new c0(a,s),this.composer.addPass(this.renderPass),this.bloom=new l0({blendFunction:Ce.ADD,mipmapBlur:!0,luminanceThreshold:i.bloomThreshold,luminanceSmoothing:i.bloomSmoothing,intensity:i.bloomIntensity,radius:i.bloomRadius,levels:i.bloomLevels}),this.toneMapping=new m0({mode:na.ACES_FILMIC}),this.finalPass=new w0(s,this.bloom,this.toneMapping),this.finalPass.dithering=!0,this.composer.addPass(this.finalPass)}insertScenePass(t){const a=this.composer.passes.indexOf(this.finalPass);this.composer.addPass(t,a>=0?a:void 0)}get exposure(){return this.renderer.toneMappingExposure}set exposure(t){this.renderer.toneMappingExposure=Math.max(.01,t)}get drawingBufferHeight(){return Math.max(1,Math.round(this.cssHeight*this.pixelRatio))}setSize(t,a,s){const o=Math.max(1,Math.floor(t)),i=Math.max(1,Math.floor(a)),l=Math.min(Th,Math.max(y0,s));return o===this.cssWidth&&i===this.cssHeight&&Math.abs(l-this.pixelRatio)<.001?!1:(this.cssWidth=o,this.cssHeight=i,this.pixelRatio=l,this.renderer.setPixelRatio(l),this.composer.setSize(o,i,!1),!0)}render(t){this.composer.render(t)}dispose(){this.composer.dispose()}}const S0=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,T0=`
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
`;class E0{constructor(t){F(this,"renderer");F(this,"scene",new mo);F(this,"camera",new Qr(-1,1,1,-1,0,1));F(this,"material");F(this,"quad");this.renderer=t,this.material=new Rt({vertexShader:S0,fragmentShader:T0,uniforms:{uDem:{value:null},uDemRes:{value:512},uElevRange:{value:new Ne(0,1e3)},uReliefScale:{value:.001},uSlabSize:{value:new Ne(14.8,10.8)},uSunDir:{value:new W(0,1,0)},uPenumbra:{value:9}},depthTest:!1,depthWrite:!1}),this.quad=new Ma(new en(2,2),this.material),this.quad.frustumCulled=!1,this.scene.add(this.quad)}bake(t,a,s,o,i,l,u,r,c=1024){const d=new Zt(c,c,{format:Dt,type:Ot,depthBuffer:!1,stencilBuffer:!1,minFilter:Be,magFilter:Be,generateMipmaps:!1});d.texture.wrapS=We,d.texture.wrapT=We,d.texture.colorSpace=La;const p=this.material.uniforms;p.uDem.value=t,p.uDemRes.value=a,p.uElevRange.value.set(s,o),p.uReliefScale.value=i,p.uSlabSize.value.set(l,u),p.uSunDir.value.copy(r);const M=this.renderer.getRenderTarget(),y=this.renderer.autoClear;return this.renderer.autoClear=!0,this.renderer.setRenderTarget(d),this.renderer.render(this.scene,this.camera),this.renderer.setRenderTarget(M),this.renderer.autoClear=y,d}dispose(){this.quad.geometry.dispose(),this.material.dispose()}}function Ho(e,t,a,s){const o=Math.floor(e.length/3),i=new Int32Array(o);for(let w=0;w<o;w++)i[w]=w;const l=w=>{for(;i[w]!==w;)i[w]=i[i[w]],w=i[w];return w},u=(w,x)=>{const S=l(w),k=l(x);S!==k&&(i[Math.max(S,k)]=Math.min(S,k))},r=new Int32Array(t*a).fill(-1),c=[],d=w=>Math.min(t-1,Math.max(0,w)),p=w=>Math.min(a-1,Math.max(0,w));for(let w=0;w<o;w++){const x=e[w*3],S=e[w*3+1],k=s?s[w*2]:0,U=s?s[w*2+1]:0,C=d(Math.floor((x-k)*t)),P=d(Math.max(Math.floor(x*t),Math.ceil((x+k)*t)-1)),z=p(Math.floor((S-U)*a)),G=p(Math.max(Math.floor(S*a),Math.ceil((S+U)*a)-1));for(let _=z;_<=G;_++)for(let V=C;V<=P;V++){const q=_*t+V;r[q]<0?(r[q]=w,c.push(q)):u(w,r[q])}}for(const w of c){const x=Math.floor(w/t),S=w-x*t,k=r[w];if(S+1<t&&r[w+1]>=0&&u(k,r[w+1]),x+1<a){const U=w+t;r[U]>=0&&u(k,r[U]),S>0&&r[U-1]>=0&&u(k,r[U-1]),S+1<t&&r[U+1]>=0&&u(k,r[U+1])}}const M=new Map,y=new Map;for(let w=0;w<o;w++){const x=l(w);M.set(x,(M.get(x)??0)+1),y.set(x,(y.get(x)??0)+e[w*3+2])}const g=[...M.keys()].sort((w,x)=>M.get(x)-M.get(w)||y.get(x)-y.get(w)||w-x),R=new Map;g.forEach((w,x)=>R.set(w,x));const E=new Uint16Array(o);for(let w=0;w<o;w++)E[w]=Math.min(65535,R.get(l(w)));return{patchOf:E,sizes:g.map(w=>M.get(w))}}function R0(e){const t=Math.max(1,Math.floor(e)),a=t+1,s=a*a,o=new Float32Array(s*3),i=new Float32Array(s*3),l=new Float32Array(s*2),u=1/t;for(let d=0;d<=t;d++){const p=d*u-.5,M=1-d/t;for(let y=0;y<=t;y++){const g=d*a+y;o[g*3]=y*u-.5,o[g*3+1]=0,o[g*3+2]=p,i[g*3+1]=1,l[g*2]=y/t,l[g*2+1]=M}}const r=new Uint32Array(t*t*6);let c=0;for(let d=0;d<t;d++)for(let p=0;p<t;p++){const M=p+a*d,y=p+a*(d+1),g=p+1+a*(d+1),R=p+1+a*d;r[c++]=M,r[c++]=y,r[c++]=R,r[c++]=y,r[c++]=g,r[c++]=R}return{position:o,normal:i,uv:l,index:r}}function A0(e){let t=0;for(let a=0;a<2400;a++)for(let s=0;s<e.length;s++){const o=e[s]*1.000001+(s&7)*.5;e[s]=o>1e6?o-1e6:o,t+=Math.sqrt(e[s])}return t}function k0(e=()=>performance.now()){const t=new Float64Array(2048);for(let o=0;o<t.length;o++)t[o]=o;let a=1/0,s=0;for(let o=0;o<2;o++){const i=e();s+=A0(t),a=Math.min(a,e()-i)}return s===-1?-1:a}const _0=8;function F0(e){return Number.isFinite(e)&&e>_0}const D0={WINDOW_SEC:1,SLOW_MS:26,SLOW_WINDOWS:2,FAST_MS:18.5,CLIMB_SEC:6,HOLD_SEC:30,STALL_MS:250,STEP_DOWN:.15,STEP_UP:.1,LEAST:.5};class P0{constructor(){F(this,"scale",1);F(this,"windowSec",0);F(this,"gaps",[]);F(this,"slowWindows",0);F(this,"fastSec",0);F(this,"ceiling",1);F(this,"ceilingSec",0)}feed(t,a=!1){const s=D0;if(!(t>0)||t>s.STALL_MS||a||(this.gaps.push(t),this.windowSec+=t/1e3,this.ceiling<1&&(this.ceilingSec+=t/1e3,this.ceilingSec>s.HOLD_SEC&&(this.ceiling=Math.min(1,this.ceiling+s.STEP_UP),this.ceilingSec=0)),this.windowSec<s.WINDOW_SEC))return null;const o=this.gaps.sort((u,r)=>u-r),i=o[Math.floor(o.length/2)];this.windowSec=0,this.gaps=[];let l=this.scale;return i>s.SLOW_MS?(this.slowWindows+=1,this.fastSec=0,this.slowWindows>=s.SLOW_WINDOWS&&this.scale>s.LEAST&&(this.ceiling=this.scale-s.STEP_UP,this.ceilingSec=0,l=Math.max(s.LEAST,this.scale-s.STEP_DOWN),this.slowWindows=s.SLOW_WINDOWS-1)):i<s.FAST_MS?(this.slowWindows=0,this.fastSec+=s.WINDOW_SEC,this.fastSec>=s.CLIMB_SEC&&this.scale<this.ceiling&&(l=Math.min(this.ceiling,this.scale+s.STEP_UP),this.fastSec=0)):(this.slowWindows=0,this.fastSec=0),Math.abs(l-this.scale)<=.001?null:(this.scale=l,l)}}const I0="/isogon/assets/draco_decoder-Z1_iN-Ht.wasm",C0="/isogon/assets/draco_wasm_wrapper-fZCQGLGb.js",Au=Math.PI/180,L0=1.05,Mr=40,N0=6.2,yr=3,z0=.5,U0=.16,Xs=33,B0={modis:3.5,viirs:4.1},O0={modis:new qi(1,.5,.24),viirs:new qi(.4,.84,1)},H0={modis:Qi,viirs:oo},G0={terra:new hr(0,0,0),aqua:new hr(Math.PI/2,0,0),suomi_npp:new hr(0,0,Math.PI/2)},K0="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";function W0(e){const t=e.toUpperCase();return t.includes("TERRA")?["terra"]:t.includes("AQUA")?["aqua"]:t.includes("NOAA")||t.includes("J1")||t.includes("J2")?["noaa_20","suomi_npp"]:["suomi_npp"]}function V0(e,t){const a=Math.sin(e*127.1+t*311.7)*43758.5453;return a-Math.floor(a)}function Y0(){const a=new Uint8Array(65536);for(let o=0;o<64;o++)for(let i=0;i<256;i++){const l=i%16,u=o%16,r=l===0||u===0,c=l===8,d=.86+.14*V0(Math.floor(i/16),Math.floor(o/16)),p=(o*256+i)*4;a[p]=Math.round((r?118:c?40:7)*d),a[p+1]=Math.round((r?124:c?52:14)*d),a[p+2]=Math.round((r?138:c?88:46)*d),a[p+3]=255}const s=new aa(a,256,64,Dt,Ot);return s.colorSpace=ct,s.wrapS=no,s.wrapT=no,s.magFilter=Be,s.minFilter=Ya,s.generateMipmaps=!0,s.anisotropy=8,s.needsUpdate=!0,s}function $0(e){const t=new mo,a=new Rt({side:ao,depthWrite:!1,vertexShader:`
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
    `}),s=new Ma(new ih(10,32,16),a);t.add(s);const o=new dd(e),i=o.fromScene(t,.03);return o.dispose(),s.geometry.dispose(),a.dispose(),i}function br(e,t,a){e.onBeforeCompile=s=>{s.uniforms.uFoilScale={value:t},s.uniforms.uFoilStrength={value:a},s.vertexShader=s.vertexShader.replace("#include <common>",`#include <common>
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
        }`)},e.customProgramCacheKey=()=>"isogon-foil"}class j0{constructor(){F(this,"cells",Y0())}make(t,a={}){const s=a.map??null,o=new wd({flatShading:a.flat===!0}),i=a.crinkleScale??26;switch(t){case"foilGold":o.color.setRGB(1,.62,.18),o.metalness=1,o.roughness=.3,br(o,i,.24);break;case"foilSilver":o.color.setRGB(.9,.91,.93),o.metalness=1,o.roughness=.32,br(o,i,.2);break;case"foilBlack":o.color.setRGB(.035,.035,.04),o.metalness=.75,o.roughness=.42,br(o,i,.22);break;case"solar":o.color.setRGB(1,1,1),o.metalness=.55,o.roughness=.22,o.map=s??this.cells,s&&o.color.setRGB(.42,.46,.62);break;case"radiator":o.color.setRGB(.84,.87,.92),o.metalness=.92,o.roughness=.16;break;case"paintWhite":o.color.setRGB(.86,.87,.88),o.metalness=.05,o.roughness=.55;break;case"paintGrey":o.color.setRGB(.3,.31,.33),o.metalness=.45,o.roughness=.5;break;case"dark":o.color.setRGB(.03,.032,.036),o.metalness=.6,o.roughness=.5;break}return s&&t!=="solar"&&(o.map=s,o.color.setRGB(1,1,1),(t==="foilGold"||t==="foilSilver")&&(o.metalness=.82)),o}dispose(){this.cells.dispose()}}function ku(e){const t=e.toLowerCase();return t.includes("gold")?"foilGold":t.includes("silver")?"foilSilver":t.includes("krinkle")||t.includes("kapton")?"foilBlack":t.includes("solar")||t.includes("shiny_panel")?"solar":t==="side panels"?"radiator":t.includes("dish")?"paintWhite":t.includes("thruster")?"dark":t.includes("hardware")||t.includes("grey")||t.includes("gray")?"paintGrey":null}function X0(e){const t=e.getAttribute("position");if(!t||e.getAttribute("uv"))return;e.computeBoundingBox();const a=e.boundingBox,s=a.getSize(new W),o=[0,1,2].sort((c,d)=>s.getComponent(d)-s.getComponent(c)),[i,l]=o,u=Math.max(s.getComponent(l)/12,1e-6),r=new Float32Array(t.count*2);for(let c=0;c<t.count;c++)r[c*2]=(t.getComponent(c,i)-a.min.getComponent(i))/(u*16),r[c*2+1]=(t.getComponent(c,l)-a.min.getComponent(l))/(u*4);e.setAttribute("uv",new ma(r,2))}function q0(e,t){const a=new nh().setFromObject(e),o=26/Math.max(...a.getSize(new W).toArray(),1e-6),i=new Map,l=new Set;e.traverse(u=>{const r=u;if(!r.isMesh)return;const c=!r.geometry.getAttribute("normal"),d=p=>{var x;const M=i.get(p);if(M)return M;const y=p,g=ku(p.name),R=(x=y.map)==null?void 0:x.image,E=y.map&&r.geometry.getAttribute("uv")&&((R==null?void 0:R.width)??0)>4?y.map:null;let w=p;return g?w=t.make(g,{flat:c,map:E,crinkleScale:o}):y.isMeshStandardMaterial&&!E&&(w=t.make("paintGrey",{flat:c})),w!==p&&(w.name=p.name,l.add(p),y.map&&y.map!==E&&y.map.dispose()),i.set(p,w),w};Array.isArray(r.material)?r.material=r.material.map(d):(ku(r.material.name)==="solar"&&X0(r.geometry),r.material=d(r.material))});for(const u of l)u.dispose()}function _u(e,t){const a=new ro,s=t.make("foilGold"),o=t.make("foilSilver"),i=t.make("paintWhite"),l=t.make("dark"),u=t.make("solar"),r=(M,y,g,R,E)=>{const w=new Ma(M,y);return w.position.set(g,R,E),a.add(w),w},c=e==="modis"?.42:.32;r(new Bo(c,.17,.18),s,0,0,0),r(new Bo(c*.86,.035,.15),o,0,-.1,0),r(new dr(.045,.055,.07,24),l,c*.18,-.145,0),r(new Bo(.1,.05,.1),i,-c*.25,-.135,0),r(new Bo(c*.5,.012,.14),i,-c*.1,.092,0),r(new dr(.006,.006,.1,8),o,c*.3,.13,.04);const d=r(new Md(.05,.03,24,1,!0),i,c*.3,.19,.04);d.rotation.x=Math.PI,d.material.side=Cs;const p=r(new dr(.007,.007,.16,8),o,0,0,.17);p.rotation.x=Math.PI/2;for(let M=0;M<3;M++){const y=new Bo(.2,.008,.2),g=y.getAttribute("uv");for(let E=0;E<g.count;E++)g.setXY(E,g.getX(E)*6/16,g.getY(E)*6/4);const R=r(y,u,0,0,.36+M*.208);R.rotation.z=-.35}return a}function Sr(e,t){const a=new ro;t&&e.rotation.copy(t),a.add(e),a.updateMatrixWorld(!0);const s=new nh().setFromObject(a),o=s.getSize(new W),i=s.getCenter(new W),l=Math.max(o.x,o.y,o.z,1e-6);e.position.sub(i);const u=new ro;return u.add(a),u.scale.setScalar(L0/l),u}function Tr(e){const t=new Set,a=new Set,s=new Set;e.traverse(o=>{const i=o;i.geometry&&t.add(i.geometry);const l=Array.isArray(i.material)?i.material:i.material?[i.material]:[];for(const u of l){a.add(u);const r=u;for(const c of[r.map,r.normalMap,r.roughnessMap,r.metalnessMap,r.emissiveMap,r.aoMap])c&&s.add(c)}});for(const o of t)o.dispose();for(const o of a)o.dispose();for(const o of s){const i=o.image;i&&typeof i.close=="function"&&i.close(),o.dispose()}}function Er(e){const t=Math.min(1,Math.max(0,e));return t*t*(3-2*t)}class Z0{constructor(t){F(this,"group",new ro);F(this,"strips",{modis:{alongTrackKm:0,strength:0},viirs:{alongTrackKm:0,strength:0}});F(this,"look",new j0);F(this,"templates",new Map);F(this,"rigs",[]);F(this,"draco",null);F(this,"disposed",!1);F(this,"pos",new W);F(this,"xAxis",new W);F(this,"yAxis",new W(0,1,0));F(this,"zAxis",new W);F(this,"basis",new eo);this.templates.set("procedural-modis",Sr(_u("modis",this.look),null)),this.templates.set("procedural-viirs",Sr(_u("viirs",this.look),null));for(let a=0;a<t;a++)this.rigs.push(this.buildRig(a))}buildRig(t){const a=new ro;a.visible=!1;const s=new ro;a.add(s);const o=g=>{const R=new tn;return R.setAttribute("position",new ma(new Float32Array(g*3),3)),R.setAttribute("color",new ma(new Float32Array(g*4),4)),R},i=()=>new xd({transparent:!0,opacity:0,depthWrite:!1,vertexColors:!0}),l=i(),u=new fd(o(Mr),l),r=i(),c=new md(o(6),r);for(const g of[u,c])g.frustumCulled=!1,a.add(g);const d=o(Xs+1),p=[];for(let g=0;g<Xs-1;g++)p.push(0,1+g,2+g);d.setIndex(p);const M=new pd({transparent:!0,opacity:0,side:Cs,depthWrite:!1,blending:vd,vertexColors:!0}),y=new Ma(d,M);return y.frustumCulled=!1,a.add(y),this.group.add(a),{root:a,craft:s,craftKey:"",along:-1.4+t*.9,passKey:"",track:u,trackMat:l,rays:c,raysMat:r,fan:y,fanMat:M}}async loadModels(t){const a=t.endsWith("/")?t:`${t}/`;let s=[];try{const c=await fetch(`${a}models/spacecraft/manifest.json`);if(!c.ok)return;const d=await c.json();s=Array.isArray(d.models)?d.models:[]}catch{return}const[{GLTFLoader:o},{DRACOLoader:i}]=await Promise.all([Zc(()=>import("./GLTFLoader-C8Ag2Ruc.js"),__vite__mapDeps([0,1])),Zc(()=>import("./DRACOLoader-LNaB3iNp.js"),__vite__mapDeps([2,1]))]);if(this.disposed)return;const l=new gd;l.setURLModifier(c=>/\.tga(\?|$)/i.test(c)?K0:c);const u=new i(l);u.setDecoderPath({js:C0,wasm:I0}),this.draco=u;const r=new o(l);r.setDRACOLoader(u),await Promise.all(s.map(async c=>{if(!(typeof c.id!="string"||typeof c.url!="string"))try{const d=await r.loadAsync(`${a}${c.url.replace(/^\/+/,"")}`);if(this.disposed){Tr(d.scene);return}q0(d.scene,this.look),this.templates.set(c.id,Sr(d.scene,G0[c.id]??null))}catch{}}))}resolveTemplate(t){for(const s of W0(t.sensorLabel)){const o=this.templates.get(s);if(o)return{key:s,template:o}}const a=`procedural-${t.family}`;return{key:a,template:this.templates.get(a)}}update(t,a){this.strips.modis.strength=0,this.strips.viirs.strength=0;const s=a.sky>.004||a.strip>.004,[o,i,l]=a.unitsPerMetre,u=a.slabWidth*.5,r=a.slabDepth*.5,c=a.sampleTerrainY(.5,.5);for(let d=0;d<this.rigs.length;d++){const p=this.rigs[d],M=t[d];if(!M||!s){p.root.visible=!1;continue}p.root.visible=!0;const{key:y,template:g}=this.resolveTemplate(M);p.craftKey!==y&&(p.craft.clear(),p.craft.add(g.clone(!0)),p.craftKey=y);const R=H0[M.family],E=M.azimuthDeg*Au,w=Math.min(R.maxScanDeg,Math.abs(M.scanAngleDeg))*Au,x=(vo+R.altitudeKm)/vo,S=Math.min(.999,x*Math.sin(w)),k=Math.sqrt(1-S*S),U=Math.sin(E),C=-Math.cos(E);let P=U*S*o,z=k*i,G=C*S*l;const _=Math.hypot(P,z,G)||1,V=B0[M.family];P=P/_*V,z=z/_*V,G=G/_*V;let q=Math.cos(E),we=Math.sin(E);const Se=M.orbitNode?M.orbitNode==="descending":M.sensorLabel.toUpperCase().includes("TERRA");we>0!==Se&&(q=-q,we=-we);const ye=`${M.sensorLabel}|${M.azimuthDeg}|${M.scanAngleDeg}|${M.orbitNode??""}`;p.passKey!==ye&&(p.passKey!==""&&(p.along=-.6),p.passKey=ye),p.along+=U0*Math.min(.1,Math.max(0,a.dtSec)),p.along>yr&&(p.along-=2*yr);const ne=p.along,Te=Er((yr-Math.abs(ne))/z0),Re=this.pos.set(P+q*ne,c+z,G+we*ne);this.xAxis.set(q,0,we),this.zAxis.crossVectors(this.xAxis,this.yAxis).normalize(),this.basis.makeBasis(this.xAxis,this.yAxis,this.zAxis),p.craft.quaternion.setFromRotationMatrix(this.basis),p.craft.position.copy(Re);const ut=Er(a.sky*1.15)*Te;p.craft.visible=ut>.002,p.craft.scale.setScalar(Math.max(ut,1e-4));const ue=O0[M.family],ae=p.track.geometry.getAttribute("position"),st=p.track.geometry.getAttribute("color");for(let pe=0;pe<Mr;pe++){const Nt=pe/(Mr-1)*2-1,ra=Nt*N0;ae.setXYZ(pe,P+q*ra,c+z,G+we*ra);const ot=Er((1-Math.abs(Nt))/.3),mt=ne-ra,hs=mt>=0?Math.exp(-mt/1.6):Math.exp(mt/.12);st.setXYZW(pe,ue.r,ue.g,ue.b,ot*(.3+.7*hs*Te))}ae.needsUpdate=!0,st.needsUpdate=!0,p.trackMat.opacity=.8*a.sky,p.track.visible=a.sky>.004;const ht=a.sky*Te,Ht=a.strip*Te;let se=-1e9,m=1e9;if(Math.abs(U)>1e-5){const pe=(Re.x-u)/U,Nt=(Re.x+u)/U;se=Math.max(se,Math.min(pe,Nt)),m=Math.min(m,Math.max(pe,Nt))}else Math.abs(Re.x)>u&&(m=-1e9);if(Math.abs(C)>1e-5){const pe=(Re.z-r)/C,Nt=(Re.z+r)/C;se=Math.max(se,Math.min(pe,Nt)),m=Math.min(m,Math.max(pe,Nt))}else Math.abs(Re.z)>r&&(m=-1e9);if(M.groundStrip&&Ht>.004){const pe=this.strips[M.family],Nt=Re.x/(o*1e3),ra=Re.z/(l*1e3);pe.alongTrackKm=Nt*Math.cos(E)+ra*Math.sin(E),pe.strength=Ht}const rt=ht>.004&&m>se+.05;if(p.rays.visible=rt,p.fan.visible=rt,!rt)continue;const Qt=p.fan.geometry.getAttribute("position"),va=p.fan.geometry.getAttribute("color"),Jt=Re.y-.04;Qt.setXYZ(0,Re.x,Jt,Re.z),va.setXYZW(0,ue.r,ue.g,ue.b,1);for(let pe=0;pe<Xs;pe++){const Nt=se+(m-se)*pe/(Xs-1),ra=Re.x-U*Nt,ot=Re.z-C*Nt,mt=D.clamp(ra/a.slabWidth+.5,0,1),hs=D.clamp(.5-ot/a.slabDepth,0,1);Qt.setXYZ(pe+1,ra,a.sampleTerrainY(mt,hs)+.02,ot),va.setXYZW(pe+1,ue.r,ue.g,ue.b,.12)}Qt.needsUpdate=!0,va.needsUpdate=!0,p.fanMat.opacity=.04*ht;const Pt=p.rays.geometry.getAttribute("position"),ia=p.rays.geometry.getAttribute("color"),ft=[1,1+Math.floor(Xs/2),Xs];for(let pe=0;pe<3;pe++)Pt.setXYZ(pe*2,Re.x,Jt,Re.z),Pt.setXYZ(pe*2+1,Qt.getX(ft[pe]),Qt.getY(ft[pe]),Qt.getZ(ft[pe])),ia.setXYZW(pe*2,ue.r,ue.g,ue.b,1),ia.setXYZW(pe*2+1,ue.r,ue.g,ue.b,pe===1?.25:.5);Pt.needsUpdate=!0,ia.needsUpdate=!0,p.raysMat.opacity=.6*ht}}dispose(){var t;this.disposed=!0,(t=this.draco)==null||t.dispose();for(const a of this.templates.values())Tr(a);Tr(this.group),this.look.dispose()}}const Eh=64;function Q0(e){let t=e>>>0;return()=>{t=t+1831565813>>>0;let a=t;return a=Math.imul(a^a>>>15,a|1),a^=a+Math.imul(a^a>>>7,a|61),((a^a>>>14)>>>0)/4294967296}}function Rr(e,t){const a=new Float32Array(e*e*e);for(let i=0;i<a.length;i++)a[i]=t();const s=e-1,o=e*e;return(i,l,u)=>{const r=i*e,c=l*e,d=u*e,p=Math.floor(r),M=Math.floor(c),y=Math.floor(d),g=r-p,R=c-M,E=d-y,w=g*g*g*(g*(g*6-15)+10),x=R*R*R*(R*(R*6-15)+10),S=E*E*E*(E*(E*6-15)+10),k=p&s,U=p+1&s,C=(M&s)*e,P=(M+1&s)*e,z=(y&s)*o,G=(y+1&s)*o,_=a[z+C+k],V=a[z+C+U],q=a[z+P+k],we=a[z+P+U],Se=a[G+C+k],ye=a[G+C+U],ne=a[G+P+k],Te=a[G+P+U],Re=_+(V-_)*w,ut=q+(we-q)*w,ue=Se+(ye-Se)*w,ae=ne+(Te-ne)*w,st=Re+(ut-Re)*x,ht=ue+(ae-ue)*x;return st+(ht-st)*S}}function Ar(e,t){const a=new Float32Array(e*e*e*3);for(let o=0;o<a.length;o++)a[o]=t();const s=e-1;return(o,i,l)=>{const u=o*e,r=i*e,c=l*e,d=Math.floor(u),p=Math.floor(r),M=Math.floor(c);let y=9;for(let g=-1;g<=1;g++){const R=(M+g&s)*e,E=M+g-c;for(let w=-1;w<=1;w++){const x=(R+(p+w&s))*e,S=p+w-r;for(let k=-1;k<=1;k++){const U=(x+(d+k&s))*3,C=d+k+a[U]-u,P=S+a[U+1],z=E+a[U+2],G=C*C+P*P+z*z;G<y&&(y=G)}}}return Math.min(1,Math.sqrt(y))}}let kr=null;function J0(){if(kr)return kr;const e=Eh,t=Q0(1377799),a=Rr(4,t),s=Rr(8,t),o=Rr(16,t),i=Ar(4,t),l=Ar(8,t),u=Ar(16,t),r=new Uint8Array(e*e*e*4),c=1/e;let d=0;for(let p=0;p<e;p++){const M=(p+.5)*c;for(let y=0;y<e;y++){const g=(y+.5)*c;for(let R=0;R<e;R++){const E=(R+.5)*c,w=a(E,g,M)*.5+s(E,g,M)*.3+o(E,g,M)*.2,x=1-i(E,g,M),S=1-l(E,g,M),k=1-u(E,g,M),U=Math.min(1,Math.max(0,w*.62+x*.46-.06)),C=Math.min(1,Math.max(0,S*.62+k*.38));r[d]=Math.round(U*255),r[d+1]=Math.round(C*255),r[d+2]=Math.round(w*255),r[d+3]=255,d+=4}}}return kr=r,r}function ep(){const e=Eh,t=new yd(J0(),e,e,e);return t.format=Dt,t.type=Ot,t.minFilter=Be,t.magFilter=Be,t.wrapS=no,t.wrapT=no,t.wrapR=no,t.unpackAlignment=1,t.needsUpdate=!0,t}const qs=256,tp=256;function ap(e,t,a,s,o){const i=tp,l=new Float32Array(i*i);for(let g=0;g<i;g++){const R=Math.min(t-1,Math.round(g/(i-1)*(t-1)));for(let E=0;E<i;E++){const w=Math.min(t-1,Math.round(E/(i-1)*(t-1)));l[g*i+E]=a(e[R*t+w])}}const u=5,r=new Float32Array(i*i),c=new Float32Array(i*i);for(let g=0;g<i;g++)for(let R=0;R<i;R++){let E=0;for(let w=-u;w<=u;w++)E+=l[g*i+Math.min(i-1,Math.max(0,R+w))];r[g*i+R]=E/(2*u+1)}for(let g=0;g<i;g++)for(let R=0;R<i;R++){let E=0;for(let w=-u;w<=u;w++)E+=r[Math.min(i-1,Math.max(0,g+w))*i+R];c[g*i+R]=E/(2*u+1)}const d=new Uint16Array(i*i*4),p=s/(i-1),M=o/(i-1);for(let g=0;g<i;g++){const R=Math.max(0,g-2),E=Math.min(i-1,g+2);for(let w=0;w<i;w++){const x=Math.max(0,w-2),S=Math.min(i-1,w+2),k=(c[g*i+S]-c[g*i+x])/((S-x)*p),U=(c[E*i+w]-c[R*i+w])/((E-R)*M),C=Math.hypot(k,U),P=C>1e-5?Math.min(1,C*1.6)/C:0,z=(g*i+w)*4;d[z]=Sa.toHalfFloat(l[g*i+w]),d[z+1]=Sa.toHalfFloat(k*P),d[z+2]=Sa.toHalfFloat(U*P),d[z+3]=Sa.toHalfFloat(c[g*i+w])}}const y=new aa(d,i,i,Dt,Ca);return y.minFilter=Be,y.magFilter=Be,y.wrapS=We,y.wrapT=We,y.generateMipmaps=!1,y.flipY=!1,y.needsUpdate=!0,y}const Go=`
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`,sp=`
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
  float s = max(0.0, z - ${qo.toFixed(4)}) / ${(1-qo).toFixed(4)};
  gl_FragColor = vec4(clamp(s * 1.6, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`,op=`
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
`,Rh=`
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
`,ip=`
${Rh}
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
`,np=`
${Rh}
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
`,rp=`
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
`,lp=.62,cp=.88;class Ah extends pa{constructor(){super("SmokePass");F(this,"shadowTarget");F(this,"sourceTarget");F(this,"smokeTarget");F(this,"historyTarget");F(this,"historyValid",!1);F(this,"frame",0);F(this,"lastTime",-1);F(this,"prevViewProj",new eo);F(this,"viewProj",new eo);F(this,"noiseTexture");F(this,"plumeTarget");F(this,"sourceMaterial");F(this,"plumeMaterial");F(this,"shadowMaterial");F(this,"marchMaterial");F(this,"compositeMaterial");F(this,"densityUniforms");F(this,"lastSourceRenderer",null);F(this,"lastSourceSig",new Float64Array(6).fill(Number.NaN));F(this,"lastPlumeRenderer",null);F(this,"lastPlumeSig",new Float64Array(15).fill(Number.NaN));this.needsDepthTexture=!0,this.needsSwap=!0,this.noiseTexture=ep(),this.sourceTarget=new Zt(qs,qs,{format:Dt,type:Ca,depthBuffer:!1,stencilBuffer:!1,minFilter:Ya,magFilter:Be,generateMipmaps:!0}),this.sourceTarget.texture.colorSpace=La,this.plumeTarget=new Zt(qs,qs,{format:Dt,type:Ca,depthBuffer:!1,stencilBuffer:!1,minFilter:Ya,magFilter:Be,generateMipmaps:!0}),this.plumeTarget.texture.colorSpace=La,this.shadowTarget=new Zt(qs,qs,{format:Dt,type:Ot,depthBuffer:!1,stencilBuffer:!1,minFilter:Be,magFilter:Be,generateMipmaps:!1}),this.shadowTarget.texture.colorSpace=La;const a=()=>new Zt(2,2,{format:Dt,type:Ca,depthBuffer:!1,stencilBuffer:!1,minFilter:Be,magFilter:Be,generateMipmaps:!1});this.smokeTarget=a(),this.historyTarget=a(),this.densityUniforms={uHeightPrev:{value:null},uHeightNext:{value:null},uMorph:{value:1},uSourceTex:{value:this.sourceTarget.texture},uPlumeTex:{value:this.plumeTarget.texture},uNoiseTex:{value:this.noiseTexture},uSlabSize:{value:new Ne(14.8,10.8)},uSmokeTop:{value:lp},uWindUv:{value:new Ne(.7,.7)},uTime:{value:0},uOpacity:{value:1},uCutawayMix:{value:0},uCutawayPlane:{value:0},uCutawayDir:{value:new Ne(1,0)},uClearCenter:{value:new W},uClearRadius:{value:0},uThinOverFire:{value:0},uLid:{value:new da(0,1,0,-1e4)},uLidAmount:{value:0},uSunDir:{value:new W(0,1,0)},uSigma:{value:4.6}};const s={depthTest:!1,depthWrite:!1,toneMapped:!1};this.sourceMaterial=new Rt({...s,vertexShader:Go,fragmentShader:sp,uniforms:{uField0:{value:null},uField1:{value:null},uDetection0:{value:null},uDetection1:{value:null},uRealSource:{value:0},uFrameMix:{value:0}}}),this.plumeMaterial=new Rt({...s,vertexShader:Go,fragmentShader:op,uniforms:{uSourceTex:this.densityUniforms.uSourceTex,uHeightPrev:this.densityUniforms.uHeightPrev,uHeightNext:this.densityUniforms.uHeightNext,uMorph:this.densityUniforms.uMorph,uWindUv:this.densityUniforms.uWindUv,uSmokeTop:this.densityUniforms.uSmokeTop,uSlabSize:this.densityUniforms.uSlabSize,uLid:this.densityUniforms.uLid,uLidAmount:this.densityUniforms.uLidAmount}}),this.shadowMaterial=new Rt({...s,vertexShader:Go,fragmentShader:ip,uniforms:this.densityUniforms}),this.marchMaterial=new Rt({...s,vertexShader:Go,fragmentShader:np,uniforms:{...this.densityUniforms,uDepthTex:{value:null},uProjInv:{value:new eo},uViewInv:{value:new eo},uCameraPos:{value:new W},uBoxTop:{value:4},uSunColor:{value:new W(1.4,1.29,1.17)},uNight:{value:0},uFireLight:{value:1},uStepFine:{value:.075},uHistoryTex:{value:null},uPrevViewProj:{value:new eo},uHistoryWeight:{value:0},uFrame:{value:0},uProxyY:{value:1},uHalfSize:{value:new Ne(2,2)}}}),this.compositeMaterial=new Rt({...s,vertexShader:Go,fragmentShader:rp,uniforms:{uSceneTex:{value:null},uSmokeTex:{value:this.smokeTarget.texture},uDepthTex:{value:null},uHalfSize:{value:new Ne(2,2)},uNear:{value:.1},uFar:{value:100}}}),this.fullscreenMaterial=this.compositeMaterial}setDepthTexture(a){this.marchMaterial.uniforms.uDepthTex.value=a,this.compositeMaterial.uniforms.uDepthTex.value=a}setSize(a,s){const o=Math.max(2,Math.ceil(a/2)),i=Math.max(2,Math.ceil(s/2));this.smokeTarget.setSize(o,i),this.historyTarget.setSize(o,i),this.historyValid=!1,this.compositeMaterial.uniforms.uHalfSize.value.set(o,i),this.marchMaterial.uniforms.uHalfSize.value.set(o,i)}update(a){const s=this.densityUniforms;s.uHeightPrev.value=a.heightPrev,s.uHeightNext.value=a.heightNext,s.uMorph.value=a.morph,s.uSlabSize.value.set(a.slabWidth,a.slabDepth),s.uWindUv.value.copy(a.windUv).normalize(),s.uTime.value=a.time,s.uLid.value.copy(a.lid),s.uLidAmount.value=a.lidAmount,s.uClearCenter.value.setFromMatrixPosition(a.camera.matrixWorld),s.uClearRadius.value=a.clearRadius,s.uThinOverFire.value=a.thinOverFire,s.uOpacity.value=a.opacity,s.uCutawayMix.value=a.cutawayMix,s.uCutawayPlane.value=a.cutawayPlane,s.uCutawayDir.value.copy(a.cutawayDir),s.uSunDir.value.copy(a.sunDir);const o=this.sourceMaterial.uniforms;o.uField0.value=a.field0,o.uField1.value=a.field1,o.uDetection0.value=a.detection0??a.field0,o.uDetection1.value=a.detection1??a.field1,o.uRealSource.value=a.detection0&&a.detection1?1:0,o.uFrameMix.value=a.frameMix;const i=this.marchMaterial.uniforms,l=a.camera;i.uProjInv.value.copy(l.projectionMatrixInverse),i.uViewInv.value.copy(l.matrixWorld),i.uCameraPos.value.setFromMatrixPosition(l.matrixWorld),i.uSunColor.value.copy(a.sunColor),i.uNight.value=a.night??0,i.uFireLight.value=a.fireLight??1,i.uBoxTop.value=a.reliefTop+s.uSmokeTop.value+.05,i.uProxyY.value=.5*(a.reliefTop+s.uSmokeTop.value),(this.lastTime<0||a.time-this.lastTime>.25||a.time<this.lastTime)&&(this.historyValid=!1),this.lastTime=a.time,i.uPrevViewProj.value.copy(this.prevViewProj),this.viewProj.multiplyMatrices(l.projectionMatrix,l.matrixWorldInverse),this.prevViewProj.copy(this.viewProj),i.uHistoryWeight.value=this.historyValid?cp:0,i.uFrame.value=this.frame,this.frame=(this.frame+1)%4096;const u=this.compositeMaterial.uniforms;u.uNear.value=l.near,u.uFar.value=l.far}render(a,s,o){const i=this.scene,l=this.camera,u=this.sourceMaterial.uniforms,r=u.uRealSource.value>.5?1:0,c=r?u.uDetection0.value:u.uField0.value,d=r?u.uDetection1.value:u.uField1.value,p=c?c.id:-1,M=c?c.version:-1,y=d?d.id:-1,g=d?d.version:-1,R=u.uFrameMix.value,E=this.lastSourceSig,w=this.lastSourceRenderer!==a||E[0]!==r||E[1]!==p||E[2]!==M||E[3]!==y||E[4]!==g||E[5]!==R;w&&(this.fullscreenMaterial=this.sourceMaterial,a.setRenderTarget(this.sourceTarget),a.render(i,l),this.lastSourceRenderer=a,E[0]=r,E[1]=p,E[2]=M,E[3]=y,E[4]=g,E[5]=R);const x=this.densityUniforms,S=x.uMorph.value,k=S<.999?S:1,U=S<.999?x.uHeightPrev.value:null,C=x.uHeightNext.value,P=U?U.id:-1,z=U?U.version:-1,G=C?C.id:-1,_=C?C.version:-1,V=x.uWindUv.value,q=x.uSmokeTop.value,we=x.uSlabSize.value,Se=x.uLidAmount.value,ye=Se>0?Se:0,ne=x.uLid.value,Te=ye>0?ne.x:0,Re=ye>0?ne.y:0,ut=ye>0?ne.z:0,ue=ye>0?ne.w:0,ae=this.lastPlumeSig;(w||this.lastPlumeRenderer!==a||ae[0]!==P||ae[1]!==z||ae[2]!==G||ae[3]!==_||ae[4]!==k||ae[5]!==V.x||ae[6]!==V.y||ae[7]!==q||ae[8]!==we.x||ae[9]!==we.y||ae[10]!==ye||ae[11]!==Te||ae[12]!==Re||ae[13]!==ut||ae[14]!==ue)&&(this.fullscreenMaterial=this.plumeMaterial,a.setRenderTarget(this.plumeTarget),a.render(i,l),this.lastPlumeRenderer=a,ae[0]=P,ae[1]=z,ae[2]=G,ae[3]=_,ae[4]=k,ae[5]=V.x,ae[6]=V.y,ae[7]=q,ae[8]=we.x,ae[9]=we.y,ae[10]=ye,ae[11]=Te,ae[12]=Re,ae[13]=ut,ae[14]=ue),this.fullscreenMaterial=this.shadowMaterial,a.setRenderTarget(this.shadowTarget),a.render(i,l);const ht=this.smokeTarget;this.smokeTarget=this.historyTarget,this.historyTarget=ht,this.marchMaterial.uniforms.uHistoryTex.value=this.historyTarget.texture,this.fullscreenMaterial=this.marchMaterial,a.setRenderTarget(this.smokeTarget),a.render(i,l),this.historyValid=!0,this.compositeMaterial.uniforms.uSmokeTex.value=this.smokeTarget.texture,this.compositeMaterial.uniforms.uSceneTex.value=s.texture,this.fullscreenMaterial=this.compositeMaterial,a.setRenderTarget(this.renderToScreen?null:o),a.render(i,l)}dispose(){this.lastSourceRenderer=null,this.lastSourceSig.fill(Number.NaN),this.lastPlumeRenderer=null,this.lastPlumeSig.fill(Number.NaN),this.sourceTarget.dispose(),this.plumeTarget.dispose(),this.shadowTarget.dispose(),this.smokeTarget.dispose(),this.historyTarget.dispose(),this.noiseTexture.dispose(),this.sourceMaterial.dispose(),this.plumeMaterial.dispose(),this.shadowMaterial.dispose(),this.marchMaterial.dispose(),this.compositeMaterial.dispose()}}F(Ah,"sourceGrid",Ke);const Zr=2,Fu=jo*Xo,up=.62,hp=1.75;function dp(e,t){const a=Math.max(1,e),s=Math.max(1,t),o=Math.min(hp,Math.max(up,a/s)),i=Math.sqrt(Fu*o),l=Fu/i,u=i/(a*1e3),r=l/(s*1e3),c=Math.sqrt(u*r)*Zr;return{width:i,depth:l,unitsPerMetre:[u,c,r]}}function fp(e,t,a,s){const o=Math.max(350,a-t);return Math.min(o*1.15,Math.max(0,e-t))*s.unitsPerMetre[1]}const Du=.08,mp=.3,pp=3;function Ko(e){if(!e)return null;const{left:t,top:a,right:s,bottom:o}=e;if(![t,a,s,o].every(c=>Number.isFinite(c)))return null;const i=Math.min(1,Math.max(0,Math.min(t,s))),l=Math.min(1,Math.max(0,Math.max(t,s))),u=Math.min(1,Math.max(0,Math.min(a,o))),r=Math.min(1,Math.max(0,Math.max(a,o)));return l-i<Du||r-u<Du?null:{left:i,top:u,right:l,bottom:r}}function _r(e,t){return e===t?!0:!e||!t?!1:Math.abs(e.left-t.left)<1e-5&&Math.abs(e.top-t.top)<1e-5&&Math.abs(e.right-t.right)<1e-5&&Math.abs(e.bottom-t.bottom)<1e-5}const Et=new sl,fa=new W,Bt=new W,Ki=new W,Fs=new W;function vp(e,t,a,s,o,i,l,u){let r=Number.POSITIVE_INFINITY,c=Number.NEGATIVE_INFINITY,d=Number.POSITIVE_INFINITY,p=Number.NEGATIVE_INFINITY;Et.fov=o,Et.aspect=i,Et.near=.1,Et.far=200,Et.clearViewOffset(),Et.updateProjectionMatrix(),fa.set(a.target[0],a.target[1],a.target[2]);const M=s>1e-4?[-s,0,s]:[0];for(const k of M){const U=a.azimuth+k,C=Math.sin(a.polar);Et.position.set(fa.x+a.distance*C*Math.sin(U),fa.y+a.distance*Math.cos(a.polar),fa.z+a.distance*C*Math.cos(U)),Et.up.set(0,1,0),Et.lookAt(fa),Et.updateMatrixWorld(!0);for(let P=0;P<t;P++)Bt.set(e[P*3],e[P*3+1],e[P*3+2]).project(Et),!(Bt.z>=1||Bt.z<=-1)&&(Bt.x<r&&(r=Bt.x),Bt.x>c&&(c=Bt.x),Bt.y<d&&(d=Bt.y),Bt.y>p&&(p=Bt.y))}if(!(c>r)||!(p>d))return u.scale=1,u.offsetX=0,u.offsetY=0,u;const y=(c-r)*.5,g=(p-d)*.5,R=(r+c)*.25+.5,E=.5-(d+p)*.25,w=l.right-l.left,x=l.bottom-l.top,S=Math.min(pp,Math.max(mp,Math.min(w/y,x/g)));return u.scale=S,u.offsetX=R*S-(l.left+l.right)*.5,u.offsetY=E*S-(l.top+l.bottom)*.5,u}const gp=.24,xp=.46,kh=.03;function _h(e){return Math.min(xp,Math.max(gp,e.bottom+kh))}function wp(e,t,a,s){Et.fov=a,Et.aspect=s,Et.near=.1,Et.far=200,Et.clearViewOffset(),Et.updateProjectionMatrix(),fa.set(e.target[0],e.target[1],e.target[2]);const o=Math.sin(e.polar);Et.position.set(fa.x+e.distance*o*Math.sin(t),fa.y+e.distance*Math.cos(e.polar),fa.z+e.distance*o*Math.cos(t)),Et.up.set(0,1,0),Et.lookAt(fa),Et.updateMatrixWorld(!0)}function Mp(e,t,a,s,o,i,l,u){let r=Number.POSITIVE_INFINITY;const c=s>1e-4?[-s,0,s]:[0];for(const p of c){wp(a,a.azimuth+p,o,i);for(let M=0;M<t;M++){if(Bt.set(e[M*3],e[M*3+1],e[M*3+2]).project(Et),Bt.z>=1||Bt.z<=-1)continue;const y=Bt.x*.5+.5;if(y<l.left-.04||y>l.right+.04)continue;const g=.5-Bt.y*.5;g<r&&(r=g)}}if(u.scale=1,u.offsetX=0,!Number.isFinite(r))return u.offsetY=0,u;const d=_h(l);return u.offsetY=Math.min(.1,Math.max(-.42,r-d)),u}function yp(e){return Math.min(e.bottom,_h(e)-kh)}function bp(e,t,a){const s=1-2*t;return Bt.set(-1,s,.5).unproject(e),fa.set(1,s,.5).unproject(e),Ki.setFromMatrixPosition(e.matrixWorld),Bt.sub(Ki),fa.sub(Ki),Fs.crossVectors(fa,Bt).normalize(),Fs.y<0&&Fs.negate(),a.set(Fs.x,Fs.y,Fs.z,-Fs.dot(Ki))}function Sp(e,t,a,s){if(Math.abs(s.scale-1)<4e-4&&Math.abs(s.offsetX)<4e-4&&Math.abs(s.offsetY)<4e-4){e.view!==null&&e.view.enabled&&e.clearViewOffset();return}e.setViewOffset(t*s.scale,a*s.scale,s.offsetX*t,s.offsetY*a,t,a)}const Pu=Tt.azimuth,Tp=.62,Wi=30,Vi=.055,Ep=[3.6,5,6.5,8],Rp=[90,180,300,450,650,900],Ap=2,kp=2.5,_p=.05,Fp=.6,Fr=.14,Zs=150,Iu=.3,Dp=.03,Pa=19,Pp=1.7,Ip=.6,Cu={left:0,top:0,right:1,bottom:.34},Cp=4,Qs=33,Js=48,Lp=3.2,Yi=1.15,Lu=6;function Np(e,t,a,s){return s.set(-t*Math.cos(e),-a*Math.sin(e)).normalize()}const Nu=4,zp=4.4,Up=4.6,Bp=3.5,Op=3.2,Hp=111.32;function Dr(e){return Math.max(1,(e[3]-e[1])*Hp)}const zu=-.11,Gp=.065,io=13,Fh=5,Kp=io*io+4+Fh,Ds=24;function Wp(e){const t=e==null?void 0:e.held_out_passes_answered_by;return typeof(t==null?void 0:t.method)=="string"&&t.method!=="reconstruction"}let Pr=null;function Ir(){return Pr||(Pr=new Uint8Array(so*Ke*Ke*4)),Pr}function Cr(){return{source:"procedural_fallback",provenanceNote:"No run on show.",frames:Array.from({length:so},()=>[])}}function Vp(){const e=new aa(new Uint8Array([104,106,102,255]),1,1,Dt);return e.colorSpace=ct,e.needsUpdate=!0,e}function Uu(e){return e.noRealGround?!1:(e.levelIsWater===void 0&&(e.levelIsWater=!il(e.alignedDem,e.demGridRes)),e.levelIsWater)}function Yp(e){const t=e.toUpperCase();return t.includes("TERRA")?"MODIS_TERRA":t.includes("AQUA")?"MODIS_AQUA":t.includes("NOAA20")||t.includes("NOAA-20")||t.includes("JPSS")?"VIIRS_NOAA20":t.includes("SNPP")||t.includes("NPP")?"VIIRS_SNPP":null}function Bu(){if(typeof window>"u")return null;const e=new URLSearchParams(window.location.search).get("film");return e==="record"||e==="estimate"||e==="test"||e==="play"||e==="turn"||e==="auto"?e:null}function $p(e,t){const a=e.runId!==null&&t.has(e.runId);if(!e.missingFiles&&!a)return;const s=(e.missingFiles??[]).filter(i=>!(e.pack&&(i==="elevation"||i==="imagery"))),o=a?[...s,"estimate"]:s;return o.length>0?o:void 0}const jp=[];function Lr(e){return e.observerDataset.dataSource==="firms"?jp:e.callouts}function Xp(e){const t=e.fieldScale??to;return{scale:t.kind==="linear"?"linear":"log",ticks:t.ticks??[0,.25,.5,.75,1].map(a=>({at:a,mwPerKm2:rh(t,a)}))}}const qp=2.6,Zp=9,Qp=6,Jp=9.5,Ou=.08,Nr=8,ev=1,tv=1.8,av=.05,Hu=12,zr=.12,Gu=9,sv=1.22,Ur=.94,ov=5,Ku=1.5,iv=5,Wu=2,Vu=.8,Br=3,Or=22,Yu=.75,$u=[1.1,.95,.8,.65],Hr=39,ju=.375,Xu=.3,nv=.4,qu=.43,rv=3,lv=.3,cv=24*3600*1e3,uv=5,hv=.25,dv=50,Gr=.4,fv=60,Kr=[.04,.22,.34,.86,.96,1],mv=6,Zu=.375,pv=1.3,vv=1.9,gv=.044,xv=1.08,wv=1.8,Mv=2,yv=e=>typeof e=="number"&&e>0?D.clamp(Math.pow(Math.max(1,gv/e/xv),wv),1,Mv):1,bv=[.64,.76],Sv=.7,Tv=1.2,Ev=.02,Rv=0,Av=1;function kv(e,t){return e.kind==="linear"?t.set(.02,1):t.set(Zi(e,Av),1)}const _v=4,Fv=2500;function Dv(e,t){return e.kind==="linear"?t.set(.02,1):t.set(Zi(e,_v),Zi(e,Fv))}const Pv=.45;function Iv(e,t,a,s){if(e.dataSource!=="firms")return null;const[o,i,l,u]=t,r=Pv*Math.min(a,s);let c=-1,d=-1;return e.frames.forEach((p,M)=>{let y=0,g=!1,R=!1;const E=[],w=[];for(const P of p)if(!P.hidden){y+=P.footprints.length,P.family==="viirs"&&P.isDay===!1&&(g=!0),P.isDay===!1&&P.footprints.length>0&&(R=!0);for(const z of P.footprints)E.push((z.lon-o)/Math.max(1e-9,l-o)*a),w.push((z.lat-i)/Math.max(1e-9,u-i)*s)}if(y===0)return;E.sort((P,z)=>P-z),w.sort((P,z)=>P-z);const x=Math.floor(.05*(y-1)),S=Math.ceil(.95*(y-1)),U=Math.hypot(E[S]-E[x],w[S]-w[x])<=r,C=y+(R?1e5:0)+(R&&U?2e5:0)+(g?1e6:0)+(g&&U?1e7:0);C>d&&(d=C,c=M)}),c>=0?c:null}function Cv(e){var s;const t=e.attribution,a=((s=e.context)==null?void 0:s.manifest.ortho.attribution)??"";return a&&a!==t?t?`${t}; ${a}`:a:t}function Qu(e){return cs.includes(e)}function Va(e,t){return e.resolveAsset?e.resolveAsset(t):Lv(e.apiBase,t)}function Ju(e){return`/isogon/${e}`}function Lv(e,t){if(t.startsWith("http://")||t.startsWith("https://")||t.startsWith("data:"))return t;const a=e.replace(/\/+$/,"");return t.startsWith("/")?`${a}${t}`:`${a}/${t}`}function Wo(e,t,a,s){const o=Math.min(1,Math.max(0,a))*(t-1),i=Math.min(1,Math.max(0,s))*(t-1),l=Math.floor(o),u=Math.floor(i),r=Math.min(t-1,l+1),c=Math.min(t-1,u+1),d=o-l,p=i-u,M=e[u*t+l],y=e[u*t+r],g=e[c*t+l],R=e[c*t+r],E=M+(y-M)*d,w=g+(R-g)*d;return E+(w-E)*p}const Nv=new W(.075,.098,.135),Dh=new W(-.56,.64,.52).normalize();function zv(e,t,a){const s=Tf(a),o=s?s.extent_km[0]:e,i=s?s.extent_km[1]:t,l=dp(o,i),u=Dh.clone(),[r,c,d]=l.unitsPerMetre,p=new W(u.x/r,u.y/c,u.z/d).normalize();return s&&(kf(s.sun.azimuth_deg,s.sun.elevation_deg,p),_f(p,new W(r,c,d),u)),{widthKm:o,depthKm:i,frame:l,sunDir:u,sunTrue:p,packManifest:s}}const eh="Esri, Vantor, Earthstar Geographics, and the GIS User Community";function Wr(e,t,a,s,o){const i=zv(e,t,a),l=i.widthKm/Math.max(64,s);return{widthKm:i.widthKm,depthKm:i.depthKm,frame:i.frame,sunDir:i.sunDir,sunTrue:i.sunTrue,orthoTexelKm:l,sharpen:1,shadow:null,packManifest:i.packManifest,packState:"none",pack:null,lite:null,context:null,contextState:"none",auxTex:null,detailTex:null,detailRect:[0,0,1,1],detailTexelKm:l,attribution:o}}function Ps(e,t){return fp(e,t.minElevM,t.maxElevM,t.frame)}function Vr(e,t,a,s,o,i){return sf(e,t,o,i,{gridSize:Ke,zMaxMwKm2:Wd,sigmaMaxMwKm2:Vd},(l,u)=>Wo(a,s,l,u))}function Gv(e){const t=Ft.useRef(null),a=Ft.useRef(null),s=Ft.useRef(null),o=Ft.useRef([null,null,null]),i=Ft.useRef([null,null,null]),l=Ft.useRef([null,null,null]),u=Ft.useRef(null),r=Ft.useRef(null),c=Ft.useRef(null),[d,p]=Ft.useState([]),M=Ft.useRef(new Map),y=Ft.useRef(new Set),g=Ft.useRef(e);g.current=e;const R=Ft.useRef(null);Ft.useEffect(()=>{const x=t.current;if(!x)return;let S=!1;if(!ad())throw new Qc("unavailable");let k;try{k=new bd({antialias:!1,alpha:!1,depth:!1,powerPreference:"high-performance",stencil:!1})}catch(n){throw new Qc("failed",n)}const U=F0(k0());let C=Ru();k.setPixelRatio(C),k.setClearColor(new qi("#080b11"),1),k.domElement.style.width="100%",k.domElement.style.height="100%",k.domElement.style.display="block",x.appendChild(k.domElement);const P=Math.min(16,k.capabilities.getMaxAnisotropy()||4),z=new Sd;z.setCrossOrigin("anonymous");const G=new mo,_=new sl(39,16/9,.12,140),V=new b0(k,G,_),q=new Ah;V.insertScenePass(q);const we=new Set,Se=n=>(n.smokeHeight||(n.smokeHeight=ap(n.alignedDem,n.demGridRes,f=>Ps(f,n),n.frame.width,n.frame.depth),we.add(n.smokeHeight)),n.smokeHeight);let ye=1,ne=0;const Te=Dh.clone(),Re=new Td(16775922,zp);Re.position.copy(Te).multiplyScalar(20),G.add(Re);const ut=$0(k);G.environment=ut.texture;const ue=new Map,ae=new Map;for(const n of cs){const f=Vo[n],v=eu(n,256),h=Is(v,!1),A=tu(n,h.aligned,h.gridRes,h.minElev,h.maxElev,P),b=Ir(),I=Vr(n,f.bbox,h.aligned,h.gridRes,b,so);ue.set(n,{key:`proc-${n}`,regionId:n,runId:null,noRealGround:!0,noRealPicture:!0,demTex:h.texture,alignedDem:h.aligned,demGridRes:h.gridRes,minElevM:h.minElev,maxElevM:h.maxElev,satTex:A,orthoLabel:"drawn stand-in",demLabel:"512²",tensor:b,frameCount:so,bbox:[...f.bbox],windDirUv:[...f.windDirUv],hasSeaCoast:f.hasSeaCoast,observerDataset:Cr(),findings:I.anchors,callouts:I.callouts,fireHistory:null,...Wr(f.widthKm,Dr(f.bbox),null,512,"")})}const st=k.extensions.has("OES_texture_float_linear"),ht=n=>(n.fireHistory||(n.fireHistory=Df(n.tensor,n.frameCount,st)),n.fireHistory),Ht=g.current.activeTheaterId;let se=ue.get(Ht)??ue.get("plumas_ca"),m=se;const rt=[],Qt=n=>{n&&!rt.includes(n)&&rt.push(n)},va=()=>{const n=new Set,f=v=>{v&&(n.add(v),v.lite&&n.add(v.lite))};f(se),f(m);for(const v of ue.values())f(v);for(const v of ae.values())f(v);for(const v of Ra.values())f(v);return n},Jt=()=>{var h,A;if(rt.length===0)return;const n=va(),f=new Set;for(const b of n)f.add(b.demTex),f.add(b.satTex),f.add((h=b.fireHistory)==null?void 0:h.texture),f.add(b.shadow),f.add(b.smokeHeight);const v=b=>{!b||f.has(b)||(f.add(b),b.dispose())};for(const b of rt)n.has(b)||(v(b.demTex),v(b.satTex),v((A=b.fireHistory)==null?void 0:A.texture),v(b.shadow),b.smokeHeight&&(we.delete(b.smokeHeight),v(b.smokeHeight)),b.fireHistory=null,b.shadow=null,b.smokeHeight=null,b.detectionSource=null);for(let b=rt.length-1;b>=0;b--){const I=rt[b];I===se||I===m||I===se.lite||I===m.lite||rt.splice(b,1)}},Pt=(n,f)=>{const v=ue.get(n);ue.set(n,f),v&&v!==f&&Qt(v)},ia=n=>{const f=ae.get(n);return f&&(ae.delete(n),ae.set(n,f)),f},ft=(n,f,v)=>{for(Pt(n,v),ae.set(f,v);ae.size>Cp;){const h=ae.keys().next().value,A=ae.get(h);ae.delete(h),Qt(A)}};p(Lr(m));const pe=new Uint8Array(Ke*Ke*4),Nt=new Uint8Array(Ke*Ke*4),ra=n=>{const f=new aa(n,Ke,Ke,Dt,Ot);return f.minFilter=Ya,f.magFilter=Be,f.generateMipmaps=!0,f.wrapS=We,f.wrapT=We,f.flipY=!1,f.needsUpdate=!0,f},ot=ra(pe),mt=ra(Nt),hs=$d();let ln=-1,cn=-1,Zo=null;const go=Ke*Ke,ll=()=>{const n=new aa(new Uint8Array(go),Ke,Ke,th,Ot);return n.minFilter=Be,n.magFilter=Be,n.generateMipmaps=!1,n.flipY=!1,n.needsUpdate=!0,n},Qo=ll(),Jo=ll();let cl="",ul="";const Ph=(n,f,v)=>{const h=n.detectionSource??(n.detectionSource=am(n.observerDataset.frames,n.frameCount,n.bbox,[n.widthKm,n.depthKm],Ke)),A=`${n.key}:${f}`;A!==cl&&(Qo.image.data.set(h.subarray(f*go,(f+1)*go)),Qo.needsUpdate=!0,cl=A);const b=`${n.key}:${v}`;b!==ul&&(Jo.image.data.set(h.subarray(v*go,(v+1)*go)),Jo.needsUpdate=!0,ul=b)},ei=new Jf,la=new sm,hl=M.current,dl={value:0},un={value:0},fl={value:0},ml={value:0},pl=new da(1,1,0,0),vl=new Ne(1,1);let ds=null,Ta=null,gl=null,hn=null,fs=0;const Ih=n=>{var A,b;const f=Math.round(((A=n.grid)==null?void 0:A.nx)??0),v=Math.round(((b=n.grid)==null?void 0:b.ny)??0);if(!(f>0&&v>0&&f*v<=4e6)||typeof n.day_png!="string")return;const h=new Image;h.onload=()=>{if(S||ds!==n)return;const I=document.createElement("canvas");I.width=f,I.height=v;const Q=I.getContext("2d",{willReadFrequently:!0});if(!Q)return;Q.drawImage(h,0,0,f,v);const Z=Q.getImageData(0,0,f,v).data,oe=new Uint8Array(f*v);for(let te=0;te<v;te++)for(let le=0;le<f;le++)oe[(v-1-te)*f+le]=Z[(te*f+le)*4];const ie=Date.parse(/T/.test(n.span.start)?n.span.start:`${n.span.start}T00:00:00Z`),be=lf(oe,ie,Date.parse(n.window.start),Date.parse(n.window.end)),re=new Uint8Array(f*v*4);for(let te=0;te<f*v;te++)re[te*4]=be[te]*64,re[te*4+1]=oe[te],re[te*4+3]=255;const ge=new aa(re,f,v,Dt,Ot);ge.magFilter=po,ge.minFilter=po,ge.generateMipmaps=!1,ge.needsUpdate=!0,Ta==null||Ta.dispose(),Ta=ge,gl=n,hn=cf(n.box,f,v,n.grid.cell_km??.375,n.grid.bounds??null),vl.set(f,v)},h.src=n.day_png},xl={value:0};let dn=null,wl="";const fn=new Ne(0,0),Ml=Array.from({length:64},()=>new da(0,0,0,0)),mn={value:-1};let ti=null,pn="";const yl=(n,f,v,h)=>{let A=1/0,b=1/0,I=-1/0,Q=-1/0,Z=0,oe=0,ie=!1;for(let re=0;re<=2;re++)for(let ge=0;ge<=2;ge++){const te=D.clamp(n+(f-n)*ge/2,0,1),le=D.clamp(v+(h-v)*re/2,0,1);Qe.set(Yt(te),yt(te,le),$t(le)).project(_);const de=Qe.z>-1&&Qe.z<1,Le=(Qe.x*.5+.5)*at,Je=(-Qe.y*.5+.5)*lt;ge===1&&re===1&&(Z=Le,oe=Je,ie=de),de&&(A=Math.min(A,Le),b=Math.min(b,Je),I=Math.max(I,Le),Q=Math.max(Q,Je))}if(!Number.isFinite(A))return null;const be=ie&&Z>=0&&Z<=at&&oe>=0&&oe<=lt;return{x:Z,y:oe,left:A,top:b,right:I,bottom:Q,visible:be}},vn=[];let gn=1;const $a=new da(0,1,0,0);let bl=-1e9,Sl="",xn=[];const Tl=new Ne(0,0),El=new W(0,to.maxMwKm2,to.minMwKm2),Rl=new Ne(.02,1),ai=new Ne(.02,1),Al={value:0},Bs=new Ne(0,0),wn={value:0},Mn={value:0},kl={value:1},si=new Map;let oi=!1,yn;const Os=new da(0,1,1e4,.4);let _l=0,Fl=0,Dl=-1e9;const bn={value:0},ja={value:0};let Sn="",Hs=[],ii=0,ni=0,Tn=!1,xo,Pl="",Il="",Cl=!1;const En={value:0},wo={value:1};let Rn,ms="";const Xa=[],ps=[],ri=[],Mo={value:0},qa={value:1},An={value:0};let Ll="",Nl=!1,li,yo="",bo="detections",dt=new Float32Array(0),vs={patchOf:new Uint16Array(0),sizes:[]};const qe=new Float64Array(Nr*7),gs=new Float64Array(Nr*3);let So=!1,ci="";const ea=new Float64Array(38).fill(Number.NaN);let ca=null;const zl=(n,f,v)=>{const A=Math.min(1,Math.max(0,v))*Math.max(1,f-1),b=Math.min(f-1,Math.floor(A)),I=Math.min(f-1,b+1),Q=A-b,Z=Ke*Ke*4;return(Zo!==n||ln!==b)&&(pe.set(n.subarray(b*Z,(b+1)*Z)),ot.needsUpdate=!0,ln=b),(Zo!==n||cn!==I)&&(Nt.set(n.subarray(I*Z,(I+1)*Z)),mt.needsUpdate=!0,cn=I),Zo=n,Q},Ch=zl(m.tensor,m.frameCount,g.current.timeProgress),To=new Kd,ui=m.sunTrue.clone(),kn=new W(1.4,1.29,1.17),Ul=new W(.9,.8,.66),Bl=n=>{const f=(n.minElevM+n.maxElevM)*5e-4;ui.copy(n.sunTrue),zd(f,n.sunTrue.y,kn),Ul.fromArray(hh(f,n.sunTrue.y))};Bl(m);const Ol={value:0},Za={uNight:Ol,uSkyView:{value:To.skyView.texture},uTransmittanceLut:{value:To.transmittance},uSunTrue:{value:ui},uCamAltKm:{value:8},uVerticalExaggeration:{value:Zr},uFloorColor:{value:new W(.044,.06,.094)},uFloorHaze:{value:.3},uSkyExposure:{value:fr}},Hl=new ih(62,48,32),Gl=new Rt({vertexShader:Hd,fragmentShader:Gd,uniforms:Za,side:ao,depthWrite:!1}),_n=new Ma(Hl,Gl);_n.renderOrder=-10,G.add(_n);const Fn=new Ne(m.frame.width,m.frame.depth),Kl=new Ne(se.frame.unitsPerMetre[1],m.frame.unitsPerMetre[1]),Dn=new en(34,34,1,1);Dn.rotateX(-Math.PI/2);const Pn=new Rt({vertexShader:Zd,fragmentShader:Qd,uniforms:{uSlabSize:{value:Fn},uShadowMix:{value:1}},transparent:!0,depthWrite:!1}),hi=new Ma(Dn,Pn);hi.position.y=Ns-.005,hi.renderOrder=-2,G.add(hi);const Wl=Np(Pu,m.frame.width,m.frame.depth,new Ne),Vl=new Ne(se.demGridRes,m.demGridRes),Yl=new Ne(se.minElevM,se.maxElevM),$l=new Ne(m.minElevM,m.maxElevM),jl=new Ne(m.widthKm,m.depthKm),Xl=new da(1,0,0,0),ql=new da(1,0,0,0),Zl=new da(0,0,0,0),Eo={...uu},Ro={...uu},In=new Ne(m.windDirUv[0],m.windDirUv[1]),Ql=new W(...m.frame.unitsPerMetre),Jl=new da(0,0,1,1),ec=(n,f,v,h)=>{const A=new aa(new Uint8Array([n,f,v,h]),1,1,Dt,Ot);return A.needsUpdate=!0,A},Cn=ec(128,128,255,0),Ln=ec(255,255,255,255),tc=new E0(k),ac=n=>(n.shadow||(n.shadow=tc.bake(n.demTex,n.demGridRes,n.minElevM,n.maxElevM,n.frame.unitsPerMetre[1],n.frame.width,n.frame.depth,n.sunDir,n.demGridRes>=1024?2048:1024)),n.shadow.texture),sc=n=>{const f=R0(n),v=new tn;return v.setAttribute("position",new ma(f.position,3)),v.setAttribute("normal",new ma(f.normal,3)),v.setAttribute("uv",new ma(f.uv,2)),v.setIndex(new ma(f.index,1)),v.boundingSphere=new ah(new W(0,1,0),15),v},Nn=sc(fh);let xs=null,Ao=null;const L={uDemPrev:{value:se.demTex},uDemNext:{value:m.demTex},uDemRes:{value:Vl},uElevPrevRange:{value:Yl},uElevNextRange:{value:$l},uMorph:{value:1},uSatPrev:{value:se.satTex},uSatNext:{value:m.satTex},uFieldTex0:{value:ot},uFieldTex1:{value:mt},uLipariTex:{value:hs},uFrameMix:{value:Ch},uSunDir:{value:Te},uTime:{value:0},uCutawayMix:{value:1},uCutawayPlane:{value:0},uCutawayDir:{value:Wl},uReconMix:{value:0},uObserverMix:{value:0},uModisWeight:{value:1},uViirsWeight:{value:1},uUncertaintyMix:{value:g.current.showUncertainty?1:0},uSensitivity:{value:g.current.sensitivityThreshold},uExtentKm:{value:jl},uModisPass:{value:Xl},uViirsPass:{value:ql},uScanStrip:{value:Zl},uLatticeMix:{value:1},uHasSeaCoast:{value:m.hasSeaCoast?1:0},uLakeMix:{value:Uu(m)?1:0},uFireHist:{value:ht(m).texture},uFireTime:{value:0},uWindDirUv:{value:In},uReliefScale:{value:Kl},uSlabSize:{value:Fn},uAuxTex:{value:m.auxTex??Cn},uAuxNormals:{value:1},uAuxMix:{value:0},uShadowTex:{value:ac(m)},uUnitsPerMetre:{value:Ql},uOrthoTexelKm:{value:m.orthoTexelKm},uSatSharpen:{value:m.sharpen},uDetailTex:{value:Ln},uDetailRect:{value:Jl},uDetailMix:{value:0},uDetailTexelKm:{value:m.detailTexelKm},uSmokeShadowTex:{value:q.shadowTarget.texture},uSunTrue:{value:ui},uSunColor:{value:kn},uSunTransmittance:{value:Ul},uHazeStrength:{value:Cd},uSkyView:{value:To.skyView.texture},uSkyExposure:{value:fr},uEdgeFade:{value:0},uContextDem:{value:null},uContextRes:{value:1024},uContextScale:{value:5},uContextMix:{value:0},uContextOrtho:{value:null},uFloorColor:Za.uFloorColor,uFloorHaze:Za.uFloorHaze,uSmokeShadowMix:{value:0},uFootTex:{value:ei.texture},uFootMix:{value:Tl},uFieldScale:{value:El},uHeatRange:{value:Rl},uBeliefGrid:{value:la.grid},uBeliefBox:{value:la.box},uTileGrid:{value:fn},uTileState:{value:Ml},uTileHover:mn,uScan:{value:$a},uPixelOutline:{value:0},uBeliefMix:dl,uHeldOut:un,uHeldOutOther:fl,uBurnedMix:ml,uBurnedBox:{value:pl},uBurnedSize:{value:vl},uDeclaredGiven:xl,uChanceSquares:bn,uDayJoin:wn,uDayFalse:Mn,uMicroDetail:kl,uRevealArrive:{value:Os},uAfterglow:Mo,uLightGain:qa,uFarView:En,uBeliefQuiet:An,uLightModis:Al,uLightTexels:{value:fo},uRevealed:{value:Bs},uNight:ja,uMoonLift:wo},oc=new Rt({vertexShader:fu,fragmentShader:zf,uniforms:L}),di=new Ma(Nn,oc);di.frustumCulled=!1,G.add(di);const ic=new Rt({vertexShader:fu,fragmentShader:Nf,uniforms:L,colorWrite:!1,polygonOffset:!0,polygonOffsetFactor:1,polygonOffsetUnits:2}),fi=new Ma(Nn,ic);fi.frustumCulled=!1,fi.renderOrder=-11,G.add(fi);const mi=new Kf({uSlabSize:L.uSlabSize,uElevNextRange:L.uElevNextRange,uReliefScale:L.uReliefScale,uUnitsPerMetre:L.uUnitsPerMetre,uSunDir:L.uSunDir,uSunTrue:L.uSunTrue,uSunColor:L.uSunColor,uSunTransmittance:L.uSunTransmittance,uHazeStrength:L.uHazeStrength,uSkyView:L.uSkyView,uSkyExposure:L.uSkyExposure,uFloorColor:L.uFloorColor,uFloorHaze:L.uFloorHaze,uContextDem:L.uContextDem,uContextRes:L.uContextRes,uContextScale:L.uContextScale,uContextMix:L.uContextMix,uContextOrtho:L.uContextOrtho,uNight:ja,uMoonLift:wo});G.add(mi.mesh);let ya=0;const nc=au(),Lh={uDemPrev:L.uDemPrev,uDemNext:L.uDemNext,uDemRes:L.uDemRes,uElevPrevRange:L.uElevPrevRange,uElevNextRange:L.uElevNextRange,uReliefScale:L.uReliefScale,uSlabSize:L.uSlabSize,uMorph:L.uMorph,uSunDir:L.uSunDir,uCutawayMix:L.uCutawayMix,uCutawayPlane:L.uCutawayPlane,uCutawayDir:L.uCutawayDir,uEdgeFade:L.uEdgeFade,uContextDem:L.uContextDem,uContextRes:L.uContextRes,uContextScale:L.uContextScale,uContextMix:L.uContextMix,uNight:ja,uMoonLift:wo},rc=new Rt({vertexShader:Xd,fragmentShader:qd,uniforms:Lh,side:Cs}),ko=new Ma(nc,rc);ko.frustumCulled=!1,G.add(ko);const lc=new da(0,1,0,-1e4),Qa=new Z0(Nu);G.add(Qa.group);let cc=!1;const pi=[];let zn=0;const ve={azimuth:Tt.azimuth,polar:Tt.polar,distance:Tt.distance,target:new W(...Tt.target)},$={azimuth:Tt.azimuth,polar:Tt.polar,distance:Tt.distance,target:new W(...Tt.target)},Ja=new df,uc=new mf;let Un=!1,Ea=!1,hc=!1,Bn=0,vi=Yo,sa=1;const Ze={width:m.frame.width,depth:m.frame.depth},dc=()=>{Ze.width=D.lerp(se.frame.width,m.frame.width,sa),Ze.depth=D.lerp(se.frame.depth,m.frame.depth,sa),Fn.set(Ze.width,Ze.depth)},Yt=n=>(n-.5)*Ze.width,$t=n=>(.5-n)*Ze.depth,gi=n=>n/Ze.width+.5,xi=n=>.5-n/Ze.depth,yt=(n,f)=>{const v=Wo(m.alignedDem,m.demGridRes,n,f),h=Ps(v,m);if(sa>=.999||se===m)return h;const A=Wo(se.alignedDem,se.demGridRes,n,f),b=Ps(A,se);return b+(h-b)*sa},wi=()=>{L.uDemPrev.value=se.demTex,L.uDemNext.value=m.demTex,Vl.set(se.demGridRes,m.demGridRes),Yl.set(se.minElevM,se.maxElevM),$l.set(m.minElevM,m.maxElevM),L.uSatPrev.value=se.satTex,L.uSatNext.value=m.satTex,jl.set(m.widthKm,m.depthKm),L.uHasSeaCoast.value=m.hasSeaCoast?1:0,L.uLakeMix.value=Uu(m)?1:0,In.set(m.windDirUv[0],m.windDirUv[1]),L.uFireHist.value=ht(m).texture,Kl.set(se.frame.unitsPerMetre[1],m.frame.unitsPerMetre[1]),Ql.set(...m.frame.unitsPerMetre),dc(),Te.copy(m.sunDir),Bl(m),Re.position.copy(Te).multiplyScalar(20),L.uShadowTex.value=ac(m),L.uAuxTex.value=m.auxTex??Cn,L.uAuxNormals.value=m.pack&&m.levelIsWater===!1?0:1,L.uOrthoTexelKm.value=m.orthoTexelKm,L.uSatSharpen.value=m.sharpen,L.uDetailTex.value=m.detailTex??Ln,Jl.set(...m.detailRect),L.uDetailTexelKm.value=m.detailTexelKm,m.auxTex||(L.uAuxMix.value=0),m.detailTex||(L.uDetailMix.value=0);const n=m.context;L.uContextDem.value=(n==null?void 0:n.demTexture)??null,L.uContextOrtho.value=(n==null?void 0:n.orthoTexture)??null,L.uContextRes.value=(n==null?void 0:n.gridRes)??1024,L.uContextScale.value=(n==null?void 0:n.scale)??5,mi.setContext(n),n||(ya=0,L.uContextMix.value=0)},Ra=new Map,fc=k.capabilities.maxTextureSize>=8192&&(navigator.deviceMemory??8)>=8&&!U,Nh=()=>{xs||(xs=sc(1023),Ao=au(1023),di.geometry=xs,fi.geometry=xs,ko.geometry=Ao)},mc=(n,f,v)=>{const h=f.manifest.extent_km[0]/f.orthoSize;return{...n,key:`pack-${n.key}`,demTex:f.demTexture,alignedDem:f.alignedDem,levelIsWater:!f.levelInWholeMetres,demGridRes:f.demGridRes,minElevM:f.minElevM,maxElevM:f.maxElevM,satTex:f.orthoTexture,orthoLabel:f.orthoSize>=8192?"Esri 8K":"Esri 4K",demLabel:`${f.demGridRes}²`,orthoTexelKm:h,sharpen:0,shadow:(v==null?void 0:v.shadow)??null,pack:f,lite:n,auxTex:f.auxTexture,detailTex:(v==null?void 0:v.detailTex)??null,detailRect:(v==null?void 0:v.detailRect)??[0,0,1,1],detailTexelKm:(v==null?void 0:v.detailTexelKm)??h,context:(v==null?void 0:v.context)??null,contextState:(v==null?void 0:v.contextState)??"none",attribution:f.attribution||n.attribution}},pc=n=>{var f,v,h,A,b,I;(f=n.pack)==null||f.dispose(),(v=n.detailTex)==null||v.dispose(),(h=n.shadow)==null||h.dispose(),(A=n.context)==null||A.dispose(),n.fireHistory&&n.fireHistory!==((b=n.lite)==null?void 0:b.fireHistory)&&n.fireHistory.texture.dispose(),n.smokeHeight&&n.smokeHeight!==((I=n.lite)==null?void 0:I.smokeHeight)&&(we.delete(n.smokeHeight),n.smokeHeight.dispose()),n.fireHistory=null,n.smokeHeight=null,n.detectionSource=null,n.context=null,n.pack=null,n.detailTex=null,n.shadow=null},On=n=>{for(const[f,v]of Ra)f===n||v===se||v===m||(pc(v),Ra.delete(f))},zh=n=>{if(n.pack||!n.packManifest)return n;const f=Ra.get(n.regionId);if(!(f!=null&&f.pack))return n;if(f.lite===n)return f;const v=mc(n,f.pack,f);return Ra.set(n.regionId,v),Qt(f),v},Uh=n=>{var A;const f=n.pack,v=(A=f==null?void 0:f.manifest.ortho_detail)==null?void 0:A[0];if(!f||!v||!fc||v.size>k.capabilities.maxTextureSize)return;const h=v.uv_rect;!Array.isArray(h)||h.length!==4||!(h[2]>h[0])||!(h[3]>h[1])||vh(Va(g.current,v.url),P).then(b=>{if(!b)return;const I=Ra.get(n.regionId);if(S||!I||I.pack!==f){b.dispose();return}I.detailTex=b,I.detailRect=[h[0],h[1],h[2],h[3]],I.detailTexelKm=f.manifest.extent_km[0]*(h[2]-h[0])/v.size,m===I&&wi()})},Bh=n=>{const f=n.pack,v=mu(f==null?void 0:f.manifest.context);!f||!v||n.context||n.contextState!=="none"||(n.contextState="loading",Bf(v,{resolveUrl:h=>Va(g.current,h),maxTextureSize:k.capabilities.maxTextureSize,maxAnisotropy:P,isCancelled:()=>S}).then(h=>{const A=Ra.get(n.regionId);if(S||!A||A.pack!==f){h==null||h.dispose();return}A.contextState=h?"none":"failed",h&&(A.context=h,m===A&&wi())}))},Oh=n=>{const f=n.packManifest;!f||n.pack||n.packState!=="none"||(n.packState="loading",Af(f,{resolveUrl:v=>Va(g.current,v),maxTextureSize:fc?k.capabilities.maxTextureSize:4096,maxAnisotropy:P,isCancelled:()=>S}).then(v=>{if(S){v==null||v.dispose();return}if(!v){n.packState="failed";return}if(n.packState="none",m!==n){v.dispose();return}On(n.regionId);const h=mc(n,v,null);Ra.set(n.regionId,h),Mi(h,!0),vi=.62,Uh(h),Bh(h)}))},Mi=(n,f)=>{if(S)return;const v=zh(n);if(v===m&&f)return;v.demGridRes>=1024&&Nh();const h=m.regionId!==v.regionId;hc=h,f?(se=sa<.5?se:m,m=v,Ea=!0,Bn=0,vi=Yo,sa=0,L.uMorph.value=0):(se=v,m=v,Ea=!1,sa=1,L.uMorph.value=1,On(v.regionId),Jt()),h&&f&&(L.uAuxMix.value=0),wi(),Zo=null,p(Lr(v)),bs=!0,v.pack||Oh(v)},vc=n=>{S||m.regionId===n.regionId&&(Mi(n,!0),vi=.62)},gc=new WeakMap,Hh=(n,f)=>{var Je,St;let v=gc.get(n);v||gc.set(n,v=new Map);const h=v.get(f);if(h!==void 0)return h;if(v.set(f,null),n.observerDataset.dataSource!=="firms")return null;const[A,b,I,Q]=n.bbox,Z=Date.parse(((St=(Je=n.observerDataset.frames[f])==null?void 0:Je[0])==null?void 0:St.timeUtc)??""),oe=[],ie=[];for(const fe of n.observerDataset.frames)for(const Ae of fe){if(Ae.hidden||Ae.revealed)continue;const Ve=Date.parse(Ae.timeUtc??""),xe=Number.isFinite(Z)&&Number.isFinite(Ve)&&Math.abs(Ve-Z)<=cv;for(const Me of Ae.footprints){const Ee=(Me.lon-A)/Math.max(1e-9,I-A),ke=(Me.lat-b)/Math.max(1e-9,Q-b),jt=Math.max(1,Me.frpMw);oe.push(Ee,ke,jt),xe&&ie.push(Ee,ke,jt)}}const be=fe=>{let Ae=0,Ve=0,xe=0;for(let Me=0;Me<fe.length;Me+=3)Ae+=fe[Me]*fe[Me+2],Ve+=fe[Me+1]*fe[Me+2],xe+=fe[Me+2];return xe>0?[Ae/xe,Ve/xe]:null},re=(fe,Ae,Ve)=>Math.hypot((fe[Ae]-Ve[0])*n.widthKm,(fe[Ae+1]-Ve[1])*n.depthKm),ge=(fe,Ae)=>{let Ve=0,xe=0;for(let Me=0;Me<fe.length;Me+=3)xe+=fe[Me+2],re(fe,Me,Ae)<uv&&(Ve+=fe[Me+2]);return xe>0?Ve/xe:0};let te=be(oe);if(!te)return null;let le=oe;const de=be(ie);de&&ge(ie,te)<.1&&ge(ie,de)>=.3&&(te=de,le=ie);let Le=1/0;for(let fe=0;fe<le.length;fe+=3)Le=Math.min(Le,re(le,fe,te));if(Le>iv){const fe=Math.max(1,Math.ceil(n.widthKm/Wu)),Ae=Math.max(1,Math.ceil(n.depthKm/Wu)),Ve=Ho(new Float32Array(le),fe,Ae),xe=new Float64Array(Ve.sizes.length),Me=new Float64Array(Ve.sizes.length*2);for(let ke=0;ke<Ve.patchOf.length;ke++){const jt=Ve.patchOf[ke],It=le[ke*3+2];xe[jt]+=It,Me[jt*2]+=It*le[ke*3],Me[jt*2+1]+=It*le[ke*3+1]}let Ee=0;for(let ke=1;ke<xe.length;ke++)xe[ke]>xe[Ee]&&(Ee=ke);xe[Ee]>0&&(te=[Me[Ee*2]/xe[Ee],Me[Ee*2+1]/xe[Ee]])}return v.set(f,te),te};let yi=1;const Na=(n,f,v,h)=>{var Ga;const A=!!g.current.tileBoard,b=iu(n,f,v,h,A);if(f&&A&&n==="region"&&yi>1)return{...b,distance:b.distance*yi};if(!f||n!=="canyon"&&n!=="ridge")return b;const I=n==="canyon"?"subpixel":"front",Q=m.findings.find($e=>$e.kind===I),Z=m.observerDataset.frames.length,oe=Math.min(Z-1,Math.max(0,Math.round(D.clamp(g.current.timeProgress,0,1)*(Z-1)))),ie=Hh(m,oe);if(!Q&&!ie)return b;const[be,re,ge,te]=m.bbox;let le=ie?D.clamp(ie[0],.1,.9):D.clamp((Q.lon-be)/Math.max(1e-4,ge-be),.2,.8),de=ie?D.clamp(ie[1],.1,.9):D.clamp((Q.lat-re)/Math.max(1e-4,te-re),.2,.8);const Le=n==="canyon"?(Ga=m.declared)==null?void 0:Ga.byFrame.get(oe):void 0;let Je=null,St=null;if(Le&&Le.length>0&&m.declared)Je=m.declared,St=Le;else if(n==="canyon"&&bo==="estimate"&&dt.length>0&&m.runId){const $e=hl.get(m.runId);if($e){const{nx:He,ny:he}=$e.info,je=new Set;for(let _t=0;_t<dt.length;_t+=3){const vt=Math.min(He-1,Math.max(0,Math.floor(dt[_t]*He))),ce=Math.min(he-1,Math.max(0,Math.floor((1-dt[_t+1])*he)));je.add(ce*He+vt)}Je={nx:He,ny:he},St=Uint32Array.from(je)}}let fe=null,Ae=null;if(Je&&St&&St.length>0){const $e=St,{nx:He,ny:he}=Je,je=new Float32Array($e.length*3);$e.forEach((Oe,De)=>{je[De*3]=(Oe%He+.5)/He,je[De*3+1]=1-(Math.floor(Oe/He)+.5)/he,je[De*3+2]=1});const _t=Ho(je,He,he);let vt=0;for(let Oe=0;vt<_t.sizes.length&&Oe<Yu*$e.length;vt++)Oe+=_t.sizes[vt];let ce=1,_e=0,Fe=1,Xe=0;fe=[],Ae=[];for(let Oe=0;Oe<$e.length;Oe++){const De=$e[Oe],ze=De%He/He,Ct=1-Math.floor(De/He)/he,Ge=ze+1/He,Kt=Ct-1/he;Ae.push(ze,Kt,Ge,Kt,ze,Ct,Ge,Ct),!(_t.patchOf[Oe]>=vt)&&(ce=Math.min(ce,ze),_e=Math.max(_e,Ge),Fe=Math.min(Fe,Kt),Xe=Math.max(Xe,Ct),fe.push(ze,Kt,Ge,Kt,ze,Ct,Ge,Ct))}le=D.clamp((ce+_e)/2,.05,.95),de=D.clamp((Fe+Xe)/2,.05,.95)}const Ve=Yt(le),xe=$t(de),Me=Math.hypot(Ve,xe),Ee=Math.atan2(-Ve,-xe),ke=D.smoothstep(Me,.8,3.2),jt=Math.atan2(m.sunDir.x,m.sunDir.z);let It=b.azimuth,Ha=-1e9;for(let $e=0;$e<72;$e++){const He=$e/72*Math.PI*2-Math.PI;let he=He-Pu;for(;he>Math.PI/2;)he-=Math.PI;for(;he<-Math.PI/2;)he+=Math.PI;if(Math.abs(he)>Tp)continue;let je=Math.abs(He-jt)%(Math.PI*2);je>Math.PI&&(je=Math.PI*2-je);const vt=1-Math.min(1,Math.abs(je-Yi)/Yi)+.9*ke*Math.cos(He-Ee)+.2*Math.cos(He-b.azimuth);vt>Ha&&(Ha=vt,It=He)}let et=[Ve,yt(le,de)+.1,xe],Fa=b.distance,Xt=b.polar;if(fe&&Ae){const $e=et,He=je=>{let _t={target:$e,distance:b.distance,polar:b.polar};for(const vt of[b.polar,...$u].filter(ce=>ce<=b.polar)){let ce=$e,_e={distance:b.distance,fits:!1};for(let Fe=0;Fe<3&&(_e=Mc(je,ce,It,vt),Fe!==2);Fe++)ce=wc(je,ce,It,vt,_e.distance);if(_t={target:ce,distance:_e.distance,polar:vt},_e.fits)break}return _t};let he=He(fe);Ae.length>fe.length&&Wh(Ae,he.target,It,he.polar,he.distance)&&(he=He(Ae)),et=he.target,Fa=he.distance,Xt=he.polar}const oa=n==="canyon"?Gh(m,oe):null;if(oa&&oa.length>0){const $e=ju/Math.max(.001,m.widthKm),He=ju/Math.max(.001,m.depthKm),he=Math.max(1,Math.round(1/$e)),je=Math.max(1,Math.round(1/He)),_t=new Float32Array(oa.length/2*3);for(let De=0,ze=0;De<oa.length;De+=2,ze+=3)_t[ze]=oa[De],_t[ze+1]=oa[De+1],_t[ze+2]=1;const vt=Ho(_t,he,je);let ce=0;const _e=oa.length/2;for(let De=0;ce<vt.sizes.length&&De<Yu*_e;ce++)De+=vt.sizes[ce];const Fe=fe?[...fe]:[],Xe=[];for(let De=0;De<_e;De++){if(vt.patchOf[De]>=ce)continue;const ze=oa[De*2]-$e/2,Ct=oa[De*2+1]-He/2;Fe.push(ze,Ct,ze+$e,Ct,ze,Ct+He,ze+$e,Ct+He),Xe.push(oa[De*2],oa[De*2+1])}if(Kh(Fe,et,It,Xt,Fa*Ur)||xc(Xe,et,It,Xt,Fa)>Xu){const De=et;let ze=null;for(const Ct of[Xt,...$u].filter(Ge=>Ge<=Xt)){let Ge=De,Kt={distance:Fa,fits:!1};for(let zt=0;zt<3&&(Kt=Mc(Fe,Ge,It,Ct),zt!==2);zt++)Ge=wc(Fe,Ge,It,Ct,Kt.distance);const as=xc(Xe,Ge,It,Ct,Kt.distance),ss={target:Ge,distance:Kt.distance,polar:Ct,fits:Kt.fits,hidden:as};if(Kt.fits&&as<=Xu){ze=ss;break}(!ze||ss.fits&&(!ze.fits||as<ze.hidden))&&(ze=ss)}ze&&(et=ze.target,Fa=ze.distance,Xt=ze.polar)}}return{...b,azimuth:It,polar:Xt,distance:Fa,target:et}},Gh=(n,f)=>{if(n.observerDataset.dataSource!=="firms")return null;const[v,h,A,b]=n.bbox,I=[];for(const Q of n.observerDataset.frames[f]??[])if(!(!Q.revealed||Q.revealedByLook))for(const Z of Q.footprints)I.push((Z.lon-v)/Math.max(1e-9,A-v),(Z.lat-h)/Math.max(1e-9,b-h));return I.length>0?I:null},Kh=(n,f,v,h,A)=>{const b=Ko(g.current.workspaceSubjectFrame)??{left:0,top:0,right:1,bottom:1},I=Math.tan(D.degToRad(Hr/2)),Q=(b.right-b.left)*I*_.aspect,Z=(b.bottom-b.top)*I,oe=new W().setFromSphericalCoords(1,h,v),ie=oe.clone().negate(),be=new W().crossVectors(ie,new W(0,1,0)).normalize(),re=new W().crossVectors(be,ie),ge=new W(f[0],f[1],f[2]).addScaledVector(oe,A),te=new W;for(let le=0;le<n.length;le+=2){te.set(Yt(n[le]),yt(n[le],n[le+1]),$t(n[le+1])).sub(ge);const de=te.dot(ie);if(de<=.05||Math.abs(te.dot(be)/de)>Q||Math.abs(te.dot(re)/de)>Z)return!0}return!1},xc=(n,f,v,h,A)=>{if(n.length===0)return 0;const b=new W().setFromSphericalCoords(1,h,v),I=f[0]+b.x*A,Q=f[1]+b.y*A,Z=f[2]+b.z*A;let oe=0;for(let ie=0;ie<n.length;ie+=2){const be=n[ie],re=n[ie+1],ge=Yt(be),te=yt(be,re),le=$t(re);for(let de=1;de<32;de++){const Le=de/32,Je=gi(I+(ge-I)*Le),St=xi(Z+(le-Z)*Le);if(!(Je<0||Je>1||St<0||St>1)&&yt(Je,St)>Q+(te-Q)*Le+.012){oe+=1;break}}}return oe/(n.length/2)},Wh=(n,f,v,h,A)=>{const b=Ko(g.current.workspaceSubjectFrame)??{top:0,bottom:1},I=(b.bottom-b.top)*Math.tan(D.degToRad(Hr/2)),Q=new W().setFromSphericalCoords(1,h,v),Z=Q.clone().negate(),oe=new W().crossVectors(Z,new W(0,1,0)).normalize(),ie=new W().crossVectors(oe,Z),be=new W(f[0],f[1],f[2]).addScaledVector(Q,A),re=new W;for(let ge=0;ge<n.length;ge+=2){re.set(Yt(n[ge]),yt(n[ge],n[ge+1]),$t(n[ge+1])).sub(be);const te=re.dot(Z);if(te>.05&&re.dot(ie)/te<-I)return!0}return!1},wc=(n,f,v,h,A)=>{const b=new W().setFromSphericalCoords(1,h,v),I=b.clone().negate(),Q=new W().crossVectors(I,new W(0,1,0)).normalize(),Z=new W().crossVectors(Q,I),oe=new W(f[0],f[1],f[2]).addScaledVector(b,A);let ie=1/0,be=-1/0,re=1/0,ge=-1/0;const te=new W;for(let fe=0;fe<n.length;fe+=2){te.set(Yt(n[fe]),yt(n[fe],n[fe+1]),$t(n[fe+1])).sub(oe);const Ae=te.dot(I);if(Ae<=.05)continue;const Ve=te.dot(Q)/Ae,xe=te.dot(Z)/Ae;ie=Math.min(ie,Ve),be=Math.max(be,Ve),re=Math.min(re,xe),ge=Math.max(ge,xe)}if(!Number.isFinite(ie))return f;const le=I.clone().addScaledVector(Q,(ie+be)/2).addScaledVector(Z,(re+ge)/2);if(le.y>=-1e-4)return f;const de=(f[1]-oe.y)/le.y,Le=oe.clone().addScaledVector(le,de),Je=D.clamp(Le.x/Ze.width+.5,.05,.95),St=D.clamp(.5-Le.z/Ze.depth,.05,.95);return[Yt(Je),yt(Je,St)+.1,$t(St)]},Mc=(n,f,v,h)=>{const A=Ko(g.current.workspaceSubjectFrame)??{left:0,top:0,right:1,bottom:1},b=Math.tan(D.degToRad(Hr/2)),I=(A.right-A.left)*b*_.aspect*Vu,Q=(A.bottom-A.top)*b*Vu,Z=[];for(let de=0;de<n.length;de+=2)Z.push(Yt(n[de]),yt(n[de],n[de+1]),$t(n[de+1]));const oe=new W().setFromSphericalCoords(1,h,v),ie=oe.clone().negate(),be=new W().crossVectors(ie,new W(0,1,0)).normalize(),re=new W().crossVectors(be,ie),ge=de=>{const Le=f[0]+oe.x*de,Je=f[1]+oe.y*de,St=f[2]+oe.z*de;for(let fe=0;fe<Z.length;fe+=3){const Ae=Z[fe]-Le,Ve=Z[fe+1]-Je,xe=Z[fe+2]-St,Me=Ae*ie.x+Ve*ie.y+xe*ie.z;if(Me<=.05||Math.abs((Ae*be.x+Ve*be.y+xe*be.z)/Me)>I||Math.abs((Ae*re.x+Ve*re.y+xe*re.z)/Me)>Q)return!1}return!0};if(ge(Br))return{distance:Br,fits:!0};if(!ge(Or))return{distance:Or,fits:!1};let te=Br,le=Or;for(let de=0;de<22;de++){const Le=(te+le)/2;ge(Le)?le=Le:te=Le}return{distance:le,fits:!0}},Vh=n=>{var vt;const f=m,[v,h,A,b]=f.bbox,I=f.findings.find(ce=>ce.kind==="front")??f.findings.find(ce=>ce.kind==="subpixel")??f.findings[0];let Q=.5,Z=.5;I&&(Q=D.clamp((I.lon-v)/Math.max(1e-4,A-v),.25,.75),Z=D.clamp((I.lat-h)/Math.max(1e-4,b-h),.25,.75));const oe=f.observerDataset.dataSource==="firms";if(oe){const ce=Math.min(f.frameCount-1,Math.max(0,Math.round(D.clamp(n,0,1)*(f.frameCount-1))));let _e=0,Fe=0,Xe=0;for(const Oe of f.observerDataset.frames[ce]??[])if(!Oe.hidden)for(const De of Oe.footprints)_e+=De.frpMw,Fe+=De.frpMw*(De.lon-v)/Math.max(1e-4,A-v),Xe+=De.frpMw*(De.lat-h)/Math.max(1e-4,b-h);_e>0&&(Q=D.clamp(Fe/_e,.15,.85),Z=D.clamp(Xe/_e,.15,.85))}const ie=f.frame.width,be=f.frame.depth,re=ie*.5,ge=be*.5,te=(ce,_e)=>Ps(Wo(f.alignedDem,f.demGridRes,ce/ie+.5,.5-_e/be),f),le=mu((vt=f.packManifest)==null?void 0:vt.context)!==null&&f.contextState!=="failed",de=(Q-.5)*ie,Le=(.5-Z)*be,Je=te(de,Le)+.05,St=Math.min(f.frameCount-1,Math.max(0,Math.round(D.clamp(n,0,1)*(f.frameCount-1)))),fe=St*Ke*Ke*4,Ae=[],Ve=(ce,_e,Fe)=>{Ae.push(ce,te(ce,_e)+.03,_e,(te(ce-.1,_e)-te(ce+.1,_e))/.2,(te(ce,_e-.1)-te(ce,_e+.1))/.2,Fe)};if(f.observerDataset.dataSource==="firms"){const ce=[];for(const Xe of f.observerDataset.frames[St]??[])if(!Xe.hidden)for(const Oe of Xe.footprints)ce.push(Oe);const _e=Math.max(1,Math.ceil(ce.length/320)),Fe=f.frame.unitsPerMetre[0]*f.frame.unitsPerMetre[2]*1e6;for(let Xe=0;Xe<ce.length;Xe+=_e){const Oe=ce[Xe],De=((Oe.lon-v)/Math.max(1e-4,A-v)-.5)*ie,ze=(.5-(Oe.lat-h)/Math.max(1e-4,b-h))*be;Math.abs(De)>re||Math.abs(ze)>ge||Ve(De,ze,Oe.acrossTrackKm*Oe.alongTrackKm*Fe*_e)}}else{const ce=3*ie/(Ke-1)*(3*be/(Ke-1));for(let _e=2;_e<Ke-2;_e+=3)for(let Fe=2;Fe<Ke-2;Fe+=3)f.tensor[fe+(_e*Ke+Fe)*4]/255<=qo||Ve((Fe/(Ke-1)-.5)*ie,(.5-_e/(Ke-1))*be,ce)}const xe=Ae.length/6,Me=Math.tan(Wi*Math.PI/360),Ee=4*Me*Me*1.6,ke=2*Math.atan(Me*(16/9))/1920,jt=Math.min(kp,f.orthoTexelKm*1e3*f.frame.unitsPerMetre[0]/(Ap*ke)),It=te(de-.12,Le)-te(de+.12,Le),Ha=te(de,Le-.12)-te(de,Le+.12),et=Math.hypot(It,Ha)||1,Fa=Math.atan2(f.sunDir.x,f.sunDir.z),Xt=Math.hypot(f.windDirUv[0]*ie,f.windDirUv[1]*be)||1,oa=f.windDirUv[0]*ie/Xt,Ga=-f.windDirUv[1]*be/Xt,$e=Math.atan(Math.tan(Wi*Math.PI/360)*(16/9))+Vi;let He={...Tt,target:[de,Je,Le]},he=-1e9;const je={floorShare:1,seaShare:0,ridgeLines:0,ridgeLinesMost:0,fireShare:0,fireFrameShare:0,carryDistance:0,skylineDeg:0,eyeAboveGroundM:0,nearGround:0},_t=f.frame.unitsPerMetre[1];for(const ce of Ep)for(let _e=0;_e<48;_e++){const Fe=_e/48*Math.PI*2-Math.PI,Xe=de+ce*Math.sin(Fe),Oe=Le+ce*Math.cos(Fe);if(re-Math.abs(Xe)<.35||ge-Math.abs(Oe)<.35)continue;let De=te(Xe,Oe);for(const zt of[-1,1]){const Lt=Fe+zt*Vi;De=Math.max(De,te(de+ce*Math.sin(Lt),Le+ce*Math.cos(Lt)))}let ze=Math.abs(Fe-Fa)%(Math.PI*2);ze>Math.PI&&(ze=Math.PI*2-ze);const Ct=1-Math.min(1,Math.abs(ze-Yi)/Yi),Ge=Math.sin(Fe)*oa+Math.cos(Fe)*Ga,Kt=Math.max(0,Ge),as=le?.45*Math.max(0,-Ge)+(oe?.16:-.12)*ce:0,ss=(It*Math.sin(Fe)+Ha*Math.cos(Fe))/et;for(let zt=0;zt<Pa;zt++){const Lt=-$e+2*$e*zt/(Pa-1),os=Fe+Math.PI-Lt,As=Math.sin(os),ks=Math.cos(os);let ga=0;for(;ga<Zs;ga++){const ua=.3+ga*Fr,is=Xe+As*ua,Ka=Oe+ks*ua;if(Math.abs(is)>re||Math.abs(Ka)>ge)break;Si[zt*Zs+ga]=te(is,Ka)}Kn[zt]=ga}for(const zt of Rp){const Lt=De+zt*_t;let os=1e6;for(let T=1;T<10;T++){const H=T/10;os=Math.min(os,Lt+(Je-Lt)*H-te(Xe+(de-Xe)*H,Oe+(Le-Oe)*H))}if(os<.03)continue;let As=0,ks=0,ga=0,ua=-1e6,is=0,Ka=0,Po=0;for(let T=0;T<Pa;T++){const H=-$e+2*$e*T/(Pa-1),B=Kn[T];let O=-1e6,Y=0,X=0;for(let J=0;J<B;J++){const Ue=.3+J*Fr,K=(Si[T*Zs+J]-Lt)/Ue;K>O?(Y>=2&&Ue>ce&&X++,O=K,Y=0):K<O-.004&&Y++}if(O<0){const J=B>0?Si[T*Zs+B-1]:1;le||f.hasSeaCoast&&J<.004?ks++:As++}ga+=Math.max(O,-.2),ua=Math.max(ua,O),Math.abs(H)<$e*.55&&(is+=X,Ka=Math.max(Ka,X),Po++)}const Ws=ua-.59*2*Me;let ns=1e6;for(let T=0;T<Pa;T++){const H=Kn[T];for(let B=0;B<H;B++){const O=.3+B*Fr;if(O>=ns)break;const Y=Si[T*Zs+B];if(Y>.004&&(Y-Lt)/O>Ws){ns=O;break}}}const Ui=ua-(Je-Lt)/ce;let Io=0,Co=0,Vs=0;const Bi=ua-Fp*(ua-Ws);for(let T=0;T<xe;T++){const H=Ae[T*6],B=Ae[T*6+1],O=Ae[T*6+2],Y=Math.hypot(H-Xe,O-Oe);if(Y<.5)continue;let X=Math.atan2(H-Xe,O-Oe)-(Fe+Math.PI);if(X-=Math.round(X/(Math.PI*2))*Math.PI*2,Math.abs(X)>$e*.8)continue;const J=(B-Lt)/Y;if(J<Bi&&Co++,J<Ws||J>ua)continue;let Ue=!0;for(let K=1;K<8&&Ue;K++){const N=K/8;Lt+(B-Lt)*N<te(Xe+(H-Xe)*N,Oe+(O-Oe)*N)-.01&&(Ue=!1)}if(Ue){Io++;const K=Ae[T*6+3],N=Ae[T*6+4],j=Xe-H,ee=Lt-B,Ie=Oe-O,tt=j*j+ee*ee+Ie*Ie,gt=Math.max(0,(K*j+ee+N*Ie)/(Math.hypot(K,1,N)*Math.sqrt(tt)));Vs+=Ae[T*6+5]*Math.hypot(K,1,N)*gt/(tt*Ee)}}const Ys=xe>0?Io/xe:0,Lo=As/Pa,No=ks/Pa,$s=is/Math.max(1,Po),zo=ga/Pa,Uo=-9*Lo-(As>0?3:0)-.6*No+1.1*Math.min($s,2)+.3*Math.min(Math.max($s-2,0),1)+.8*Ct+.5*D.clamp(ss*2,-1,1)+(oe?4*Ys:2.4*Math.min(Ys,.5))+2.5*Math.min(1,Vs/_p)-(oe&&xe>0?7*Co/xe:0)-.5*Kt+as-(ns<jt?5+4*(1-ns/jt):0)-8*Math.max(0,Ui-.2)-4*Math.max(0,.04-zo);if(Uo>he){he=Uo;const T=Math.hypot(ce,Lt-Je);He={azimuth:Fe,polar:Math.acos(D.clamp((Lt-Je)/T,-1,1)),distance:T,target:[de,Je,Le]},je.floorShare=Lo,je.seaShare=No,je.ridgeLines=$s,je.ridgeLinesMost=Ka,je.fireShare=Ys,je.fireFrameShare=Vs,je.carryDistance=jt,je.skylineDeg=Math.atan(zo)*180/Math.PI,je.eyeAboveGroundM=zt,je.nearGround=ns}}}return bi=je,He};let za=null,yc="",Hn=!1;const Yh=(n,f)=>{const v=Math.min(32,Math.max(1,Math.round(f))),h=[];_.updateMatrixWorld();for(let A=0;A<=v;A++)for(let b=0;b<=v;b++){const I=b/v,Q=1-A/v,Z=Ps(Wo(n.alignedDem,n.demGridRes,I,Q),n);_o.set((I-.5)*Ze.width,Z,(.5-Q)*Ze.depth).project(_),h.push(_o.z>1||_o.z<-1?null:[(_o.x*.5+.5)*at,(.5-_o.y*.5)*lt])}return{divisions:v,points:h}},_o=new W,Gn=n=>n.landingFrame===void 0?n.landingFrame=Iv(n.observerDataset,n.bbox,n.widthKm,n.depthKm):n.landingFrame,bc=()=>{const n=m.contextState==="failed"?`${m.key}!`:m.key;if(!za||yc!==n){const f=Gn(m);za=Vh(f!==null?f/Math.max(1,m.frameCount-1):g.current.timeProgress),yc=n,Es=Ds}return za};let bi={floorShare:1,seaShare:0,ridgeLines:0,ridgeLinesMost:0,fireShare:0,fireFrameShare:0,carryDistance:0,skylineDeg:0,eyeAboveGroundM:0,nearGround:0};const Si=new Float32Array(Pa*Zs),Kn=new Int32Array(Pa),Sc=(n,f,v)=>{const h=n.context;if(!h)return 0;const A=n.frame,[b,I,Q]=A.unitsPerMetre,Z=Math.hypot(Math.max(Math.abs(f)-A.width*.5,0)/(b*1e3),Math.max(Math.abs(v)-A.depth*.5,0)/(Q*1e3)),oe=.25*(A.width/b+A.depth/Q)*.001;return(Wf(h,f/(A.width*h.scale)+.5,.5-v/(A.depth*h.scale))-n.minElevM-Of(Z,oe)*1e3)*I},ws=new Float32Array((Qs*Qs+Js*Js)*3),$h=()=>{let n=0;for(let v=0;v<Qs;v++){const h=v/(Qs-1);for(let A=0;A<Qs;A++){const b=A/(Qs-1);ws[n*3]=Yt(b),ws[n*3+1]=yt(b,h),ws[n*3+2]=$t(h),n++}}const f=m.context;if(f&&ya>.5){const v=m.frame;for(let h=0;h<Js;h++){const A=h/(Js-1);for(let b=0;b<Js;b++){const Q=(b/(Js-1)-.5)*v.width*f.scale,Z=(.5-A)*v.depth*f.scale;Math.abs(Q)<=v.width*.5&&Math.abs(Z)<=v.depth*.5||(ws[n*3]=Q,ws[n*3+1]=Sc(m,Q,Z),ws[n*3+2]=Z,n++)}}}return n};let ba=!1;const Tc=Bu();let ta=null,Ec="",Rc=null,Ms=!0,Wn=0,Fo=-1,Ac=null,Ti=0,kc=-1,_c=0;sd();let Vn=!1,Ei=0,Ua=0,ys=!0,bt=null,Gt=null,Gs=0,Ba=null,bs=!1,Fc=!1,Dc=!1;const Yn=n=>{ve.azimuth=n.azimuth,ve.polar=n.polar,ve.distance=n.distance,ve.target.set(n.target[0],n.target[1],n.target[2])},jh=n=>{const f=g.current,v=ue.get(n);v&&v!==m&&Mi(v,!0);const h=Na(f.cameraPreset,f.inWorkspace,f.mode,n);Ja.trigger($,h,2.15,Yo),ba=!1,bs=!1},Xh=()=>{const n=g.current;Ja.cancel(),!n.inWorkspace&&n.landingView!=="slab"?(bc(),ve.azimuth=$.azimuth,ve.polar=$.polar,ve.distance=$.distance,ve.target.copy($.target)):Yn(Na(n.cameraPreset,n.inWorkspace,n.mode,n.activeTheaterId)),ba=!1,bs=!1},qh=n=>{if(n&&!Un)Ja.cancel(),uc.startAtTheater(g.current.activeTheaterId);else if(!n&&Un){const f=new W(0,.65,0);_.getWorldDirection(f),f.multiplyScalar(10.5).add(_.position),pf(_.position,f,$),ve.azimuth=$.azimuth,ve.polar=$.polar,ve.distance=$.distance,ve.target.copy($.target),_.up.set(0,1,0)}Un=n};R.current={activateBundle:Mi,upgradeBundleInPlace:vc,bundleCache:ue,takeRunBundle:ia,storeRunBundle:ft,onScreenRegionId:()=>m.regionId,maxAnisotropy:P,texLoader:z,triggerSlew:jh,applyCameraPreset:Xh,syncCinemaStart:qh},(async()=>{try{const n=await fetch(Ju("generated/terrain/ca_dem_f32.bin")).catch(()=>null),f=new Promise(be=>{z.load(Ju("generated/terrain/ca_satellite.jpg"),re=>{re.colorSpace=ct,re.anisotropy=P,re.wrapS=We,re.wrapT=We,be(re)},void 0,()=>be(null))}),[v,h]=await Promise.all([n&&n.ok?n.arrayBuffer():Promise.resolve(null),f]);if(S)return;const A=ue.get("plumas_ca");if(!A||A.runId!==null)return;const b=Vo.plumas_ca,I=v?Is(new Float32Array(v),!0):{texture:A.demTex,aligned:A.alignedDem,gridRes:A.demGridRes,minElev:A.minElevM,maxElev:A.maxElevM},Q={buffer:Ir(),frames:so},Z=Cr(),oe=Vr("plumas_ca",b.bbox,I.aligned,I.gridRes,Q.buffer,Q.frames),ie={...A,...Wr(b.widthKm,Dr(b.bbox),null,1024,h?eh:""),fireHistory:null,key:"static-plumas_ca",noRealGround:v?void 0:A.noRealGround,noRealPicture:h?void 0:A.noRealPicture,demTex:I.texture,alignedDem:I.aligned,demGridRes:I.gridRes,minElevM:I.minElev,maxElevM:I.maxElev,satTex:h??A.satTex,orthoLabel:"1K",demLabel:`${I.gridRes}²`,tensor:Q.buffer,frameCount:Q.frames,observerDataset:Z,findings:oe.anchors,callouts:oe.callouts};Pt("plumas_ca",ie),vc(ie)}catch{}})();let at=Math.max(1,x.clientWidth),lt=Math.max(1,x.clientHeight),Ri=1;const $n=()=>{x&&(at=Math.max(1,x.clientWidth),lt=Math.max(1,x.clientHeight),C=Ru(),V.setSize(at,lt,C*Ri),_.aspect=at/lt)};$n();const Zh=new P0,Qh=n=>{const f=Zh.feed(n,document.hidden);f!==null&&(Ri=f,V.setSize(at,lt,C*Ri))},Pc=new ResizeObserver($n);Pc.observe(x);let es=null;const jn=()=>{$n(),Ic()},Ic=()=>{es==null||es.removeEventListener("change",jn),es=window.matchMedia(`(resolution: ${window.devicePixelRatio||1}dppx)`),es.addEventListener("change",jn)};Ic();let Aa=!1,Cc=0,Xn=0,qn=0,Ai=0,ki=Number.NaN,Zn=Number.NaN,Lc=!1;const _i=new W,Qn=new Ed,Nc=new Ne,zc=(n,f,v,h)=>{const A=k.domElement.getBoundingClientRect();if(A.width<=0||A.height<=0||n<A.left||n>A.right||f<A.top||f>A.bottom)return null;Nc.set((n-A.left)/A.width*2-1,-((f-A.top)/A.height)*2+1),Qn.setFromCamera(Nc,_);const b=Qn.ray.origin,I=Qn.ray.direction,Q=Math.max(.02,Ze.width/400);for(let Z=0;Z<Ze.width*6;Z+=Q){const oe=b.x+I.x*Z,ie=b.y+I.y*Z,be=b.z+I.z*Z,re=gi(oe),ge=xi(be);if(!(re<0||re>1||ge<0||ge>1)&&ie<=yt(re,ge)){const te=Math.min(v-1,Math.floor(re*v));return Math.min(h-1,Math.floor((1-ge)*h))*v+te}}return null},Uc=n=>{n.target instanceof HTMLElement&&n.target.closest('[data-stage-ui="true"]')||(Aa=!0,Cc=n.button,n.clientX,n.clientY,Xn=n.clientX,qn=n.clientY,Ai=0,Ja.cancel(),k.domElement.setPointerCapture(n.pointerId))},Bc=n=>{const f=g.current;if(ki=n.clientX,Zn=n.clientY,!Aa)return;const v=n.clientX-Xn,h=n.clientY-qn;if(Xn=n.clientX,qn=n.clientY,Ai+=Math.hypot(v,h),!f.cinemaActive)if(Cc===2||n.shiftKey){ba=!0;const A=$.distance*.0011,b=Math.cos($.azimuth),I=Math.sin($.azimuth);ve.target.x=D.clamp(ve.target.x-(v*b-h*I)*A,-Ze.width*.42,Ze.width*.42),ve.target.z=D.clamp(ve.target.z-(-v*I-h*b)*A,-Ze.depth*.42,Ze.depth*.42)}else{ba=!0;const A=f.inWorkspace?.0046:.0028;ve.azimuth-=v*A;const b=f.inWorkspace?.12:.72,I=f.inWorkspace?1.36:1.18;ve.polar=D.clamp(ve.polar-h*A,b,I)}},Oc=n=>{var h,A,b;if(!Aa)return;Aa=!1,k.domElement.hasPointerCapture(n.pointerId)&&k.domElement.releasePointerCapture(n.pointerId);const f=g.current;!f.inWorkspace&&Ai<5&&n.button===0&&((h=f.onEnterWorkspace)==null||h.call(f));const v=f.tileBoard;if(v&&v.pickable&&f.inWorkspace&&Ai<5&&n.button===0){const I=zc(n.clientX,n.clientY,v.cols,v.rows);I!==null&&!((A=v.tiles[I])!=null&&A.closed)&&((b=f.onTilePick)==null||b.call(f,I))}},Hc=()=>{ki=Number.NaN,Zn=Number.NaN},Gc=n=>{const f=g.current;if(!f.inWorkspace||f.cinemaActive)return;n.preventDefault(),ba=!0,Ja.cancel();const v=1+D.clamp(n.deltaY,-120,120)*.0011;ve.distance=D.clamp(ve.distance*v,4.6,23.5)},Kc=n=>{g.current.inWorkspace&&n.preventDefault()},ka=k.domElement;ka.addEventListener("pointerdown",Uc),window.addEventListener("pointermove",Bc,{passive:!0}),window.addEventListener("pointerup",Oc),ka.addEventListener("pointerleave",Hc),ka.addEventListener("wheel",Gc,{passive:!1}),ka.addEventListener("contextmenu",Kc);const Fi=window.matchMedia("(prefers-reduced-motion: reduce)");let Ss=Fi.matches;const Wc=()=>{Ss=Fi.matches};Fi.addEventListener("change",Wc);let ts=0,Jn=0,Vc=performance.now(),At=0;const Ts={scale:1,offsetX:0,offsetY:0},kt={scale:1,offsetX:0,offsetY:0},Ks={scale:1,offsetX:0,offsetY:zu},_a=new Float32Array(Kp*3);let Yc=!1,Do=null,Di=0,Es=Ds,Rs=null,pt=null;const Oa={scale:1,offsetX:0,offsetY:0};let Pi=Ds,Ii=null,$c=!1,jc=null,er=!1,Ci=!1;const Li=(n,f,v,h,A=!1)=>{let b=0;for(let I=0;I<io;I++){const Q=I/(io-1);for(let Z=0;Z<io;Z++){const oe=Z/(io-1);_a[b*3]=Yt(oe),_a[b*3+1]=yt(oe,Q),_a[b*3+2]=$t(Q),b++}}for(let I=0;I<4;I++)_a[b*3]=(I%2===0?-.5:.5)*Ze.width,_a[b*3+1]=Ns,_a[b*3+2]=(I<2?-.5:.5)*Ze.depth,b++;if(A){const I=yt(.5,.5);for(let Q=0;Q<Fh;Q++){const Z=Q===0?0:Op,oe=(Q-1)*Math.PI*.5;_a[b*3]=Math.cos(oe)*Z,_a[b*3+1]=I+(Q===0?Up:Bp),_a[b*3+2]=Math.sin(oe)*Z,b++}}vp(_a,b,f,v,39,at/lt,n,h)};let Ni=0,tr=0,zi=0,ar=60,Xc=0;const Qe=new W,qc=n=>{var is,Ka,Po,Ws,ns,Ui,Io,Co,Vs,Bi,Ys,Lo,No,$s,zo,Uo;if(S)return;Jn=requestAnimationFrame(qc);const f=n-Vc,v=Math.min(.065,Math.max(.001,f*.001));Vc=n,At+=v,Qh(f);const h=g.current,A=1-Math.exp(-v*8.5),b=1-Math.exp(-v*5.8),I=!h.inWorkspace&&h.landingView!=="slab";if(I&&bc(),Ea){Bn+=Ms?1e3:v;const T=Math.min(1,Bn/vi);sa=mh(T),L.uMorph.value=sa,dc(),T>=1&&(Ea=!1,sa=1,se=m,wi(),L.uMorph.value=1,On(m.regionId),Jt())}const Q=m.auxTex?Ea&&se.regionId!==m.regionId?D.smoothstep(sa,.55,1):1:0;if(L.uAuxMix.value=D.lerp(L.uAuxMix.value,Q,b),L.uDetailMix.value=D.lerp(L.uDetailMix.value,m.detailTex&&!oi?1:0,b),Rs=h.inWorkspace?null:Ko(h.landingSubjectFrame),pt=h.inWorkspace&&!h.cleanHud&&!h.cinemaActive?Ko(h.workspaceSubjectFrame):null,h.inWorkspace&&pt){const T=(pt.left+pt.right)*.5,H=(pt.top+pt.bottom)*.5,B=Ba??h.cameraPreset;if(B==="overview"||B==="nadir"||B==="region"){Pi+=1;const O=h.mode==="observer"&&B==="overview",Y=!!h.tileBoard;let X=nv;if(Ci&&Y&&B==="region")Li(pt,{azimuth:$.azimuth,polar:$.polar,distance:$.distance,target:[$.target.x,$.target.y,$.target.z]},0,Oa,O),X=lv,((ta==="play"?Gs>=1:Math.abs($.distance-ve.distance)<.002*ve.distance)||ba)&&(Ci=!1,Pi=Ds);else if(Pi>=Ds||Ii!==B||$c!==O||Dc!==Y||!_r(jc,pt)){Dc=Y;const K=iu(B,!0,h.mode,h.activeTheaterId,Y);Li(pt,K,0,Oa,O);let N=1;Y&&B==="region"&&Oa.scale<qu&&(N=Math.min(rv,qu/Math.max(.001,Oa.scale)),Li(pt,{...K,distance:K.distance*N},0,Oa,O)),Y&&B==="region"&&Math.abs(N-yi)>.005&&(yi=N,er=!0),Pi=0,Ii=B,$c=O,jc={...pt}}const J=D.clamp(Oa.scale,X,1),Ue=Math.max(.001,Oa.scale);kt.scale=J,kt.offsetX=(Oa.offsetX+T)/Ue*J-T,kt.offsetY=(Oa.offsetY+H)/Ue*J-H}else Ii=null,kt.scale=1,kt.offsetX=.5-T,kt.offsetY=.5-H}else if(h.inWorkspace)Ii=null,kt.scale=1,kt.offsetX=0,kt.offsetY=0;else if(I&&za){const T=Rs??Cu;Es+=1;const H=at/lt;if(Es>=Ds||!_r(Do,T)||Math.abs(Di-H)>1e-4){const B=$h();Mp(ws,B,za,Ss?0:Vi,Wi,H,T,Ks),Do=T,Di=H,Es=0}kt.scale=1,kt.offsetX=0,kt.offsetY=Ks.offsetY}else if(!Rs)kt.scale=1,kt.offsetX=0,kt.offsetY=zu,Do=null;else{Es+=1;const T=at/lt;(Es>=Ds||!_r(Do,Rs)||Math.abs(Di-T)>1e-4)&&(Li(Rs,Tt,Gp,Ks),Do=Rs,Di=T,Es=0),kt.scale=Ks.scale,kt.offsetX=Ks.offsetX,kt.offsetY=Ks.offsetY}const Z=Yc?A:1;Yc=!0,Ts.scale=D.lerp(Ts.scale,kt.scale,Z),Ts.offsetX=D.lerp(Ts.offsetX,kt.offsetX,Z),Ts.offsetY=D.lerp(Ts.offsetY,kt.offsetY,Z),Sp(_,at,lt,Ts);let oe=h.timeProgress;const ie=I?Gn(m):null;let be=null;ie!==null&&h.landingTour&&typeof h.landingPass!="number"&&!Ss?(Sn!==m.key&&(Sn=m.key,Hs=[],m.observerDataset.frames.forEach((T,H)=>{var B;(H===ie||((B=T[0])==null?void 0:B.isDay)===!1)&&Hs.push(H)}),ii=Math.max(0,Hs.indexOf(ie)),ni=0,Tn=!1),Ms||(ni+=v),Hs.length>1&&ni>(Tn?Qp:Zp)&&(ii=(ii+1)%Hs.length,ni=0,Tn=!0),be=Hs[ii]??null):Sn="";const re=ie!==null&&typeof h.landingPass=="number"&&Number.isFinite(h.landingPass)?D.clamp(h.landingPass,0,m.frameCount-1):be??ie;if(re!==null&&(oe=re/Math.max(1,m.frameCount-1)),h.backdrop){const T=Gn(m);T!==null&&(oe=T/Math.max(1,m.frameCount-1))}let ge=0,te=!1;if(h.cinemaActive&&h.inWorkspace){const T=uc.update(v,yt,h.onCinemaStepTheater,Ze.width,Ze.depth);_.fov=T.fov,_.updateProjectionMatrix(),_.up.copy(T.up),_.position.copy(T.position),_.lookAt(T.lookAt),oe=T.syntheticTimeProgress,ge=T.cycleProgress}else{const T=I&&za?Wi:39;if(Math.abs(_.fov-T)>.01&&(_.fov=Hn||!I?D.lerp(_.fov,T,A):T),_.updateProjectionMatrix(),_.up.set(0,1,0),!h.inWorkspace&&!Ja.isActive()&&!Aa){const K=I?za:null,N=K??Tt,j=Ss?0:K?Math.sin(At*.11)*Vi:Math.sin(At*.16)*.065;let ee=N.azimuth+j;for(;ee-ve.azimuth>Math.PI;)ee-=Math.PI*2;for(;ee-ve.azimuth<-Math.PI;)ee+=Math.PI*2;ve.azimuth=K?D.lerp(ve.azimuth,ee,Math.min(1,v*2)):ee,ve.polar=D.lerp(ve.polar,N.polar,v*1.2),ve.distance=D.lerp(ve.distance,N.distance,v*1.6),_i.set(N.target[0],N.target[1],N.target[2]),ve.target.lerp(_i,v*2.2),K&&!Hn&&(ve.azimuth=ee,ve.polar=N.polar,ve.distance=N.distance,ve.target.copy(_i),$.azimuth=ve.azimuth,$.polar=N.polar,$.distance=N.distance,$.target.copy(_i),Hn=!0)}bs&&h.inWorkspace&&!ba&&!Aa&&!Ja.isActive()&&(Yn(Na(h.cameraPreset,!0,h.mode,h.activeTheaterId)),bs=!1),te=Ja.step(v,ve).slewActive,$.azimuth=D.lerp($.azimuth,ve.azimuth,A),$.polar=D.lerp($.polar,ve.polar,A),$.distance=D.lerp($.distance,ve.distance,A),$.target.lerp(ve.target,A);let B=!1;if(!Ea&&h.inWorkspace&&ta!=="turn"&&(Ba??h.cameraPreset)==="canyon"&&m.observerDataset.dataSource==="firms"){const K=m.observerDataset.frames.length,N=Math.min(K-1,Math.max(0,Math.round(D.clamp(h.timeProgress,0,1)*(K-1)))),j=(((Ka=(is=m.declared)==null?void 0:is.byFrame.get(N))==null?void 0:Ka.length)??0)>0;if(j||bo==="estimate"&&dt.length>0){const ee=h.workspaceSubjectFrame,Ie=`${m.regionId}:${((Ws=(Po=m.observerDataset.frames[0])==null?void 0:Po[0])==null?void 0:Ws.timeUtc)??""}`;let tt=0;for(const it of m.observerDataset.frames[N]??[])it.revealed&&!it.revealedByLook&&(tt+=it.footprints.length);const gt=`${Ie}:${N}:${j?"declared":yo}:${tt}:${ee?[ee.left,ee.top,ee.right,ee.bottom].map(it=>it.toFixed(3)).join(","):""}:${at}x${lt}`;gt!==Ec&&(Ec=gt,!ba&&!Aa&&(ta==="estimate"||ta==="test"?B=!0:bs=!0))}}const O=h.filmMove!==void 0?h.filmMove:Tc;O!==Rc&&(Rc=O,Vn=!1),ta&&(ba||Aa)&&(Vn=!0);let Y=null;if(O&&!Vn&&!(Ea&&hc)&&!Ms&&!h.backdrop){Y=O!=="auto"?O:h.inWorkspace?h.tileBoard?"play":Bs.x+Bs.y>.5?"test":"estimate":"record";const K=m.observerDataset.dataSource==="firms";Y!=="record"&&(!h.inWorkspace||!K)&&(Y=null)}if(Y!==ta){const K=ta;if(ta=Y,Ei=At,Gs=0,Ba=null,bt=null,Gt=null,Y){ba=!1;const N=Na("canyon",!0,h.mode,h.activeTheaterId),j={...N,distance:N.distance*Ur,azimuth:N.azimuth+.04};if(Y==="estimate")bt={...N,distance:N.distance*sv,azimuth:N.azimuth-.06},Gt=j,Ua=Gu,ys=!0,Ba="canyon";else if(Y==="test"){const ee={azimuth:$.azimuth,polar:$.polar,distance:$.distance,target:[$.target.x,$.target.y,$.target.z]};bt=K==="estimate"||K==="turn"?ee:j,Gt=bt,Ua=0,Ba="canyon"}else if(Y==="turn")bt={azimuth:$.azimuth,polar:$.polar,distance:$.distance,target:[$.target.x,$.target.y,$.target.z]},Gt={...bt,azimuth:bt.azimuth+zr},Ua=Hu,ys=!0,Ba=h.inWorkspace?K==="play"||K==="record"?"region":"canyon":null;else if(Y==="play")bt=j,Gt=Na("region",!0,h.mode,h.activeTheaterId),Ua=ov,ys=!0,Ba="region";else{const ee=h.inWorkspace?Na("region",!0,h.mode,h.activeTheaterId):za??Tt;bt={...ee,azimuth:ee.azimuth-zr/2},Gt={...ee,azimuth:ee.azimuth+zr/2},Ua=Hu,ys=!1,Ba=h.inWorkspace?"region":null}}}if(B&&bt&&Gt&&(ta==="estimate"||ta==="test")){const K=Na("canyon",!0,h.mode,h.activeTheaterId);bt={azimuth:$.azimuth,polar:$.polar,distance:$.distance,target:[$.target.x,$.target.y,$.target.z]},Gt={...K,distance:K.distance*Ur,azimuth:K.azimuth+.04},Ua=ta==="estimate"?Gu:Ku,ys=!0,Ei=At}if(er)if(er=!1,ta==="play"&&bt&&Gt){const K=Na("region",!0,h.mode,h.activeTheaterId);Gs<1?Gt=K:(bt={azimuth:$.azimuth,polar:$.polar,distance:$.distance,target:[$.target.x,$.target.y,$.target.z]},Gt=K,Ua=Ku,ys=!0,Ei=At,Gs=0,Ci=!0)}else!ta&&h.cameraPreset==="region"&&h.inWorkspace&&!ba&&!Aa&&(Yn(Na("region",!0,h.mode,h.activeTheaterId)),Ci=!0);if(ta&&bt&&Gt){const K=Ua>0?D.clamp((At-Ei)/Ua,0,1):1,N=ys?K*K*(3-2*K):K;let j=Gt.azimuth-bt.azimuth;for(;j>Math.PI;)j-=Math.PI*2;for(;j<-Math.PI;)j+=Math.PI*2;$.azimuth=bt.azimuth+j*N,$.polar=D.lerp(bt.polar,Gt.polar,N),$.distance=bt.distance*Math.pow(Gt.distance/bt.distance,N),$.target.set(D.lerp(bt.target[0],Gt.target[0],N),D.lerp(bt.target[1],Gt.target[1],N),D.lerp(bt.target[2],Gt.target[2],N)),ve.azimuth=$.azimuth,ve.polar=$.polar,ve.distance=$.distance,ve.target.copy($.target),Gs=K}const X=Math.sin($.polar);_.position.set($.target.x+$.distance*X*Math.sin($.azimuth),$.target.y+$.distance*Math.cos($.polar),$.target.z+$.distance*X*Math.cos($.azimuth));const J=gi(_.position.x),Ue=xi(_.position.z);if(J>=0&&J<=1&&Ue>=0&&Ue<=1){const K=yt(J,Ue)+D.lerp(Iu,Dp,ts);_.position.y<K&&(_.position.y=K)}else if(m.context&&ya>.5){const K=Sc(m,_.position.x,_.position.z)+Iu;_.position.y<K&&(_.position.y=K)}_.lookAt($.target)}const le=!h.inWorkspace||h.cinemaActive?"cutaway":h.mode,de=le==="cutaway"?1:0,Le=le==="reconstruction"?1:0,Je=le==="observer"?1:0,St=le==="world"||le==="earth"||m.observerDataset.dataSource==="firms"?0:le==="observer"?.45:1;L.uCutawayMix.value=D.lerp(L.uCutawayMix.value,de,b),L.uReconMix.value=D.lerp(L.uReconMix.value,Le,b),L.uObserverMix.value=D.lerp(L.uObserverMix.value,Je,b),L.uCutawayPlane.value=Lu,L.uTime.value=At,L.uUncertaintyMix.value=D.lerp(L.uUncertaintyMix.value,h.showUncertainty?1:0,A),L.uSensitivity.value=D.lerp(L.uSensitivity.value,h.sensitivityThreshold,A);const fe=h.observerFilter==="all"||h.observerFilter==="modis"?1:0,Ae=!h.holdoutViirs&&(h.observerFilter==="all"||h.observerFilter==="viirs")?1:0;L.uModisWeight.value=D.lerp(L.uModisWeight.value,fe,A),L.uViirsWeight.value=D.lerp(L.uViirsWeight.value,Ae,A),ye=D.lerp(ye,St*D.lerp(1,Rv,ja.value),b);const Ve=zl(m.tensor,m.frameCount,oe);L.uFrameMix.value=Ve,L.uFireTime.value=D.clamp(oe,0,1)*Math.max(1,m.frameCount-1);const xe=m.observerDataset.frames,Me=Math.min(xe.length-1,Math.max(0,Math.round(oe*(xe.length-1)))),Ee=xe[Me]??[],ke=m.observerDataset.dataSource==="firms",jt=h.burnedArea??null;jt!==ds&&(ds=jt,jt&&Ih(jt));const It=ke&&Ta!==null&&ds!==null&&gl===ds&&(!ds.region_id||ds.region_id===m.regionId);if(fs=D.lerp(fs,It?1:0,1-Math.exp(-v*3)),!It&&fs<.003&&(fs=0),ml.value=ke?fs:0,L.uFieldTex1.value=ke&&fs>0&&Ta?Ta:mt,fs>0&&hn){const T=uf(m.bbox,hn);pl.set(T[0],T[1],T[2],T[3])}if(ke){Ph(m,ln,cn);const T=`${m.key}:${Me}:${h.holdoutViirs?1:0}:${I?1:0}`,H=I&&(typeof h.landingPass=="number"||!!h.landingTour)&&!Ss,B=T!==ms&&H&&ms.startsWith(`${m.key}:`)&&qa.value>.02;if(B?qa.value=Math.max(0,qa.value-v/Sv):T===ms&&(qa.value=H?Math.min(1,qa.value+v/Tv):1),T!==ms&&!B){ms=T,qa.value=H?0:1;const O=Ee.find(N=>!ha(N,h.holdoutViirs)&&!N.revealed)??Ee.find(N=>!ha(N,h.holdoutViirs)),Y=Ee.some(N=>N.family==="modis"&&!ha(N,h.holdoutViirs)&&!N.revealed);Rn=O?{index:Me,sensor:O.sensorLabel,timeUtc:O.timeUtc??"",isDay:O.isDay!==!1,detections:O.footprints.length}:void 0;const X=O??Ee[0];if(h.passScan&&(h.inWorkspace||typeof h.landingPass=="number")&&X&&!Ss){const N=D.degToRad(X.azimuthDeg);let j=Math.cos(N),ee=-Math.sin(N);const Ie=X.orbitNode==="ascending";X.orbitNode&&Ie!==ee>0&&(j=-j,ee=-ee),$a.x=j,$a.y=ee,bl=At}Xa.length=0,ps.length=0,Bs.set(0,0);for(const N of Ee)if(!ha(N,h.holdoutViirs)){if(N.revealed){for(const j of N.footprints)ps.push(j);N.family==="modis"?Bs.x=1:Bs.y=1;continue}for(const j of N.footprints)Xa.push(j)}const J=Ee.find(N=>N.revealed&&!ha(N,h.holdoutViirs));if(ps.length>0&&J){const N=D.degToRad(J.azimuthDeg);let j=Math.cos(N),ee=-Math.sin(N);J.orbitNode&&J.orbitNode==="ascending"!=ee>0&&(j=-j,ee=-ee);const[Ie,tt,gt,it]=m.bbox;let xt=1/0,Wt=-1/0,wt=0;for(const Vt of ps){const Wa=((Vt.lon-Ie)/Math.max(1e-9,gt-Ie)-.5)*m.widthKm,Oi=((Vt.lat-tt)/Math.max(1e-9,it-tt)-.5)*m.depthKm,Hi=Wa*j+Oi*ee;xt=Math.min(xt,Hi),Wt=Math.max(Wt,Hi),wt=Math.max(wt,Vt.acrossTrackKm,Vt.alongTrackKm)}Os.x=j,Os.y=ee,Os.w=Math.max(.2,wt),_l=xt-wt,Fl=Wt+wt+Os.w,Dl=Ss?-1e9:At}if(ri.length=0,Mo.value=0,li=void 0,Xa.length===0&&Ee.length>0&&Ee.every(N=>N.revealed||ha(N,h.holdoutViirs))&&m.residenceHours!==void 0){const N=Date.parse(((ns=Ee[0])==null?void 0:ns.timeUtc)??"");for(let j=Me-1;j>=0&&ri.length===0;j--)for(const ee of xe[j]??[]){if(ee.revealed||ha(ee,h.holdoutViirs)||ee.footprints.length===0)continue;for(const gt of ee.footprints)ri.push(gt);const Ie=Date.parse(ee.timeUtc??""),tt=Number.isFinite(N)&&Number.isFinite(Ie)?Math.max(0,(N-Ie)/36e5):0;Mo.value=Math.exp(-tt/(m.residenceHours??1)),li={index:j,sensor:ee.sensorLabel,timeUtc:ee.timeUtc??"",hoursBefore:tt}}}const K=m.fieldScale??to;Dv(K,ai),ei.build(Xa,m.bbox,[m.widthKm,m.depthKm],N=>(Zi(K,N)-ai.x)/Math.max(.001,ai.y-ai.x),ps,ri),Al.value=Y?1:0}}else Rn=void 0,ms="",Mo.value=0,li=void 0;const Ha=(At-bl)/qp;if(ke&&Ha>=0&&Ha<1){const T=.5*(Math.abs($a.x)*m.widthKm+Math.abs($a.y)*m.depthKm)+1.5;$a.z=-T+2*T*Ha,$a.w=1}else $a.w=0;Ll!==m.key&&(Ll=m.key,Nl=ke&&!xe.some(T=>T.some(H=>H.hidden||H.revealed))),An.value=D.lerp(An.value,Nl&&!h.holdoutViirs?1:0,A);const et=ke&&m.runId?hl.get(m.runId):void 0;if(et&&!h.backdrop){Sl!==m.key&&(Sl=m.key,xn=xe.map(X=>{var J;return Date.parse(((J=X[0])==null?void 0:J.timeUtc)??"")}));const T=D.clamp(oe,0,1)*Math.max(1,xe.length-1),H=Math.min(xe.length-1,Math.floor(T)),B=Math.min(xe.length-1,H+1),O=xn[H],Y=xn[B];if(Number.isFinite(O)&&Number.isFinite(Y)){const X=O+(Y-O)*(T-H)+et.info.stepMs;wl!==m.key&&(wl=m.key,dn=null),Ee.length>0&&Ee.every(J=>J.revealed||ha(J,h.holdoutViirs))&&(dn=Me),dl.value=la.sync(et,m.key,X,dn)}else la.clear()}else la.clear();L.uLipariTex.value=la.grid.x>0?la.texture:hs,xl.value=la.grid.x>0&&la.declaredGiven?1:0,bn.value=D.lerp(bn.value,h.chanceSquares?1:0,A);{const T=!!(h.filmMove??Tc),H=D.clamp((At-Dl)/(T?tv:ev),0,1),B=T?H*H*(3-2*H):1-(1-H)*(1-H);Os.z=H>=1?1e4:D.lerp(_l,Fl,B)}const Fa=ke&&Ee.length>0&&Ee.every(T=>T.revealed||ha(T,h.holdoutViirs))?1:0;un.value=D.lerp(un.value,Fa,1-Math.exp(-v*6)),fl.value=ke&&m.answeredByOther?1:0,gn=D.lerp(gn,(!ke||Xa.length>0?1:.5*Mo.value)*qa.value,1-Math.exp(-v*4)),L.uPixelOutline.value=D.lerp(L.uPixelOutline.value,h.detectionPixels?1:0,A),En.value=I?0:D.smoothstep($.distance,8.5,15),wo.value=D.lerp(wo.value,(I?1:D.lerp(pv,vv,En.value))*yv((Ui=m.pack)==null?void 0:Ui.pictureMedianLuma),b),xo=ke&&Ee[0]?{index:Me,sensor:Ee[0].sensorLabel,timeUtc:Ee[0].timeUtc??"",isDay:Ee[0].isDay!==!1,hidden:Ee.every(T=>T.revealed||ha(T,h.holdoutViirs))&&!Ee.some(T=>T.revealed&&!T.revealedByLook)}:void 0,L.uFireHist.value=ke?ei.lightTexture:ht(m).texture,yn=void 0;let Xt=null;if(h.dayPicture&&ke&&h.inWorkspace&&((Io=Ee[0])!=null&&Io.timeUtc)&&m.runId){const T=(xo==null?void 0:xo.hidden)===!0,H=Ee.find(J=>!ha(J,h.holdoutViirs)&&!J.revealed)??Ee[0],B=T?"MODIS_AQUA":Yp(H.sensorLabel)??"MODIS_AQUA",O=Ee[0].timeUtc.slice(0,10),Y=Va(g.current,`/api/gibs/day?region_id=${encodeURIComponent(m.regionId)}&day=${O}&platform=${B}&kind=${h.dayPicture}`);let X=si.get(Y);X===void 0&&(si.set(Y,"loading"),X="loading",z.load(Y,J=>{J.colorSpace=ct,J.anisotropy=P,J.wrapS=We,J.wrapT=We,si.set(Y,J)},void 0,()=>si.set(Y,"missing"))),X!=="loading"&&X!=="missing"&&(Xt=X),yn={state:X==="loading"?"loading":X==="missing"?"missing":"shown",platform:B,kind:h.dayPicture,day:O,insteadOfHidden:T}}if(Xt){L.uSatNext.value=Xt,L.uSatPrev.value=Xt,L.uSatSharpen.value=0;const T=Xt.image;L.uOrthoTexelKm.value=m.widthKm/Math.max(1,(T==null?void 0:T.width)??256),oi=!0,wn.value=av,Mn.value=h.dayPicture==="false_color"?1:0}else oi&&(L.uSatNext.value=m.satTex,L.uSatPrev.value=se.satTex,L.uSatSharpen.value=m.sharpen,L.uOrthoTexelKm.value=m.orthoTexelKm,oi=!1,wn.value=0,Mn.value=0);kl.value=m.runId===null?0:1;const oa=h.backdrop?1:Xt?0:ke&&((Co=Ee[0])==null?void 0:Co.isDay)===!1||m.runId===null?1:0;ja.value=D.lerp(ja.value,oa,1-Math.exp(-v*2.4)),Ol.value=ja.value;const Ga=m.fieldScale??to;El.set(Ga.kind==="linear"?0:1,Ga.maxMwKm2,Ga.minMwKm2),kv(Ga,Rl),Tl.set(ke?1:0,ke?1:0),hu(Ee.find(T=>T.family==="modis"),Qi,Eo),hu(Ee.find(T=>T.family==="viirs"&&!ha(T,h.holdoutViirs)),oo,Ro),Xl.set(Eo.axisEast,Eo.axisNorth,Eo.nadirKm,Eo.valid?1:0),ql.set(Ro.axisEast,Ro.axisNorth,Ro.nadirKm,Ro.valid?1:0),Ni=D.lerp(Ni,le==="observer"?1:0,b),!cc&&le==="observer"&&(cc=!0,Qa.loadModels("/isogon/"));{const T=D.smoothstep($.distance,8.5,11.5);if(zn=D.lerp(zn,le==="observer"?T:0,b),pi.length=0,Ni>=.01){let H=!1,B=!1;for(const O of Ee){if(pi.length>=Nu)break;if(ha(O,h.holdoutViirs)||h.observerFilter==="modis"&&O.family!=="modis"||h.observerFilter==="viirs"&&O.family!=="viirs")continue;const Y=O.family==="modis"?!H:!B;O.family==="modis"?H=!0:B=!0,pi.push({sensorLabel:O.sensorLabel,family:O.family,azimuthDeg:O.azimuthDeg,scanAngleDeg:O.scanAngleDeg,orbitNode:O.orbitNode,groundStrip:Y})}}Qa.update(pi,{sky:zn,strip:Ni,dtSec:v,sampleTerrainY:yt,slabWidth:Ze.width,slabDepth:Ze.depth,unitsPerMetre:m.frame.unitsPerMetre}),Zl.set(Qa.strips.modis.alongTrackKm,Qa.strips.modis.strength,Qa.strips.viirs.alongTrackKm,Qa.strips.viirs.strength)}_n.position.copy(_.position);{const T=D.lerp(se.minElevM,m.minElevM,sa),H=Math.max(.05,(T+_.position.y/m.frame.unitsPerMetre[1])*.001);Za.uCamAltKm.value=H,ne=D.lerp(ne,I||h.inWorkspace&&(h.cleanHud||h.cinemaActive)?1:0,b),ts=D.lerp(ts,I?1:0,b),Za.uSkyExposure.value=D.lerp(fr,D.lerp(Ld,Ip,ts),ne),L.uLatticeMix.value=1-ts;const B=Ba??h.cameraPreset,O=h.inWorkspace?B==="region"||B==="canyon"&&m.observerDataset.dataSource==="firms"?1:1-D.smoothstep($.distance,8.5,11.5):I?1:0,Y=m.context!==null&&!Ea;ya=Ms?Y?O:0:D.lerp(ya,Y?O:0,b),L.uContextMix.value=ya,mi.mesh.visible=ya>.003,ko.visible=ts<.5&&ya<.5,hi.visible=ts<.5&&ya<.5,L.uSkyExposure.value=Za.uSkyExposure.value,L.uEdgeFade.value=D.lerp(L.uEdgeFade.value,m.context?0:h.inWorkspace?1-D.smoothstep($.distance,8.5,11.5):I&&(bi.floorShare>0||bi.seaShare>0)?1:0,b);const X=Math.max(L.uEdgeFade.value,ya);Pn.uniforms.uShadowMix.value=1-X,Za.uFloorHaze.value=D.lerp(.3,D.lerp(1,Lp,X),ne),Za.uFloorColor.value.set(.044,.06,.094).lerp(Nv,ne),To.update(k,ui,H)}_.updateMatrixWorld();const $e=Math.max(Ps(se.maxElevM,se),Ps(m.maxElevM,m));q.enabled=ye>.01,I&&(_.updateMatrixWorld(),bp(_,yp(Rs??Cu),lc)),L.uSmokeShadowMix.value=q.enabled?1:0,q.enabled&&q.update({camera:_,slabWidth:Ze.width,slabDepth:Ze.depth,reliefTop:$e,heightPrev:Se(se),heightNext:Se(m),morph:sa,field0:ot,field1:mt,detection0:m.observerDataset.dataSource==="firms"?Qo:null,detection1:m.observerDataset.dataSource==="firms"?Jo:null,frameMix:L.uFrameMix.value,windUv:In,sunDir:Te,sunColor:kn,time:At,opacity:ye,cutawayMix:L.uCutawayMix.value,cutawayPlane:Lu,cutawayDir:Wl,lid:lc,lidAmount:ts,clearRadius:Pp,thinOverFire:ke?.82:0,night:ja.value,fireLight:gn}),V.render(v);const He=h.onCurtainScreen;He&&!Lc&&(He({near:{x:0,y:0},far:{x:0,y:0},modisSide:"left",visible:!1}),Lc=!0);const he=h.tileBoard,je=!!he&&he.cols>=1&&he.rows>=1&&he.cols*he.rows<=64;if(!!he!==Fc&&(Fc=!!he,h.cameraPreset==="region"&&(bs=!0)),he&&je){fn.set(he.cols,he.rows);const T=he.cols*he.rows;for(let B=0;B<T;B++){const O=he.tiles[B];Ml[B].set(D.clamp((O==null?void 0:O.level)??0,0,1),O!=null&&O.looked?1:0,O!=null&&O.chosen?1:0,O!=null&&O.closed?1:0)}const H=he.pickable&&!Aa&&Number.isFinite(ki)?zc(ki,Zn,he.cols,he.rows):null;if(mn.value=H??-1,H!==ti&&(ti=H,(Vs=h.onTileHover)==null||Vs.call(h,H)),h.onTileAnchors){vn.length=0;for(let B=0;B<T;B++){const O=B%he.cols/he.cols,Y=1-Math.floor(B/he.cols)/he.rows;Qe.set(Yt(O),yt(O,Y),$t(Y)).project(_);const X=(Qe.x*.5+.5)*at,J=(-Qe.y*.5+.5)*lt;vn.push({tile:B,x:X,y:J,visible:Qe.z>-1&&Qe.z<1&&X>=0&&X<=at&&J>=0&&J<=lt})}h.onTileAnchors(vn.slice())}}else fn.set(0,0),mn.value=-1,ti!==null&&(ti=null,(Bi=h.onTileHover)==null||Bi.call(h,null));const _t=!!(h.onThings&&h.things&&Object.values(h.things).some(T=>T.kind==="fire"));if((h.onFireAnchor||_t)&&h.inWorkspace&&ke){const T=Xa.length>0?Xa:ps,H=et?Math.round(la.grid.x)+":"+la.stepKey:"",B=`${ms}:${T.length}:${T.length===0?H:""}`;if(B!==yo){yo=B;const[Y,X,J,Ue]=m.bbox;if(T.length>0){bo="detections",dt=new Float32Array(T.length*3);const K=new Float32Array(T.length*2);T.forEach((N,j)=>{dt[j*3]=(N.lon-Y)/Math.max(1e-9,J-Y),dt[j*3+1]=(N.lat-X)/Math.max(1e-9,Ue-X),dt[j*3+2]=Math.max(1,N.frpMw),K[j*2]=.5*N.acrossTrackKm/Math.max(1e-6,m.widthKm),K[j*2+1]=.5*N.alongTrackKm/Math.max(1e-6,m.depthKm)}),vs=Ho(dt,D.clamp(Math.round(m.widthKm/Zu),8,512),D.clamp(Math.round(m.depthKm/Zu),8,512),K)}else{bo="estimate";const K=et!=null&&et.declared&&et.declared.nx===et.info.nx&&et.declared.ny===et.info.ny?et.declared.byFrame.get(Me):void 0;if(et&&K&&K.length>0){const{nx:N,ny:j}=et.info;dt=new Float32Array(K.length*3),K.forEach((ee,Ie)=>{dt[Ie*3]=(ee%N+.5)/N,dt[Ie*3+1]=1-(Math.floor(ee/N)+.5)/j,dt[Ie*3+2]=1})}else dt=et?la.cellsAbove(et,Ev,N=>rh(m.fieldScale??to,N)):new Float32Array(0);vs=et?Ho(dt,et.info.nx,et.info.ny):{patchOf:new Uint16Array(0),sizes:[]}}}const O=dt.length/3;if(O===0)So&&((Ys=h.onFireAnchor)==null||Ys.call(h,null)),So=!1,ci="",ca=null;else{const Y=`${yo}:${se.key}:${m.key}`,X=_.matrixWorld.elements,J=_.projectionMatrix.elements;let Ue=ca!==null&&Y===ci&&ea[0]===Me&&ea[1]===sa&&ea[2]===at&&ea[3]===lt&&ea[4]===Ze.width&&ea[5]===Ze.depth;if(Ue){for(let K=0;K<16;K++)if(ea[6+K]!==X[K]||ea[22+K]!==J[K]){Ue=!1;break}}if(!Ue){let K=0,N=0,j=0,ee=1/0,Ie=-1/0,tt=1/0,gt=-1/0;const it=Math.min(Nr,vs.sizes.length);for(let me=0;me<it;me++)qe[me*7]=0,qe[me*7+1]=0,qe[me*7+2]=0,qe[me*7+3]=1/0,qe[me*7+4]=1/0,qe[me*7+5]=-1/0,qe[me*7+6]=-1/0;for(let me=0;me<O;me++){const nt=dt[me*3],xa=dt[me*3+1],wa=dt[me*3+2];K+=nt*wa,N+=xa*wa,j+=wa;const Ut=vs.patchOf[me]<it?vs.patchOf[me]*7:-1;if(Ut>=0&&(qe[Ut]+=nt*wa,qe[Ut+1]+=xa*wa,qe[Ut+2]+=wa),Qe.set(Yt(nt),yt(nt,xa),$t(xa)).project(_),Qe.z<=-1||Qe.z>=1)continue;const _s=(Qe.x*.5+.5)*at,js=(-Qe.y*.5+.5)*lt;ee=Math.min(ee,_s),Ie=Math.max(Ie,_s),tt=Math.min(tt,js),gt=Math.max(gt,js),Ut>=0&&(qe[Ut+3]=Math.min(qe[Ut+3],_s),qe[Ut+4]=Math.min(qe[Ut+4],js),qe[Ut+5]=Math.max(qe[Ut+5],_s),qe[Ut+6]=Math.max(qe[Ut+6],js))}let xt=0,Wt=0;const wt=(me,nt)=>{const xa=yt(me,nt);if(Qe.set(Yt(me),xa,$t(nt)).project(_),xt=(Qe.x*.5+.5)*at,Wt=(-Qe.y*.5+.5)*lt,!(Qe.z>-1&&Qe.z<1&&xt>=0&&xt<=at&&Wt>=0&&Wt<=lt))return!1;const wa=_.position.x,Ut=_.position.y,_s=_.position.z,js=Yt(me),Jh=$t(nt);for(let ir=1;ir<48;ir++){const nr=ir/48,rr=gi(wa+(js-wa)*nr),lr=xi(_s+(Jh-_s)*nr);if(!(rr<0||rr>1||lr<0||lr>1)&&yt(rr,lr)>Ut+(xa-Ut)*nr+.012)return!1}return!0};for(let me=0;me<it;me++)gs[me*3]=1/0;const Vt=m.widthKm,Wa=m.depthKm;for(let me=0;me<O;me++){const nt=vs.patchOf[me];if(nt>=it)continue;const xa=(dt[me*3]-qe[nt*7]/qe[nt*7+2])*Vt,wa=(dt[me*3+1]-qe[nt*7+1]/qe[nt*7+2])*Wa,Ut=xa*xa+wa*wa;Ut<gs[nt*3]&&(gs[nt*3]=Ut,gs[nt*3+1]=dt[me*3],gs[nt*3+2]=dt[me*3+1])}const Oi=[];for(let me=0;me<it;me++){const nt=me*7,xa=wt(gs[me*3+1],gs[me*3+2]);Oi.push({x:xt,y:Wt,left:Number.isFinite(qe[nt+3])?qe[nt+3]:xt,top:Number.isFinite(qe[nt+4])?qe[nt+4]:Wt,right:Number.isFinite(qe[nt+5])?qe[nt+5]:xt,bottom:Number.isFinite(qe[nt+6])?qe[nt+6]:Wt,cells:vs.sizes[me],visible:xa})}const Hi=wt(K/j,N/j),sr=xt,or=Wt;ca={frame:Me,from:bo,x:sr,y:or,left:Number.isFinite(ee)?ee:sr,top:Number.isFinite(tt)?tt:or,right:Number.isFinite(Ie)?Ie:sr,bottom:Number.isFinite(gt)?gt:or,visible:Hi,patches:Oi},ci=Y,ea[0]=Me,ea[1]=sa,ea[2]=at,ea[3]=lt,ea[4]=Ze.width,ea[5]=Ze.depth;for(let me=0;me<16;me++)ea[6+me]=X[me],ea[22+me]=J[me]}(Lo=h.onFireAnchor)==null||Lo.call(h,ca),So=!0}}else So&&((No=h.onFireAnchor)==null||No.call(h,null),So=!1,yo="",ci="",ca=null);if(h.onThings&&h.things){const T={};let H="";const B=h.tileBoard&&h.tileBoard.cols>=1&&h.tileBoard.rows>=1?h.tileBoard:null;for(const[O,Y]of Object.entries(h.things)){let X=null;if(Y.kind==="fire")X=ca&&h.inWorkspace&&ke?{x:ca.x,y:ca.y,left:ca.left,top:ca.top,right:ca.right,bottom:ca.bottom,visible:ca.visible}:null;else if(Y.kind==="tile"){if(B&&Y.tile>=0&&Y.tile<B.cols*B.rows){const J=Y.tile%B.cols,Ue=Math.floor(Y.tile/B.cols);X=yl(J/B.cols,(J+1)/B.cols,1-(Ue+1)/B.rows,1-Ue/B.rows)}}else if(Y.kind==="detection"&&ke){const Ue=(Y.revealed?ps:Xa)[Y.index];if(Ue){const[K,N,j,ee]=m.bbox,Ie=(Ue.lon-K)/Math.max(1e-9,j-K),tt=(Ue.lat-N)/Math.max(1e-9,ee-N),gt=.5*Math.max(Ue.acrossTrackKm,Ue.alongTrackKm,.1),it=gt/Math.max(.001,m.widthKm),xt=gt/Math.max(.001,m.depthKm);X=yl(Ie-it,Ie+it,tt-xt,tt+xt)}}T[O]=X,H+=X?`${O}:${Math.round(X.left)},${Math.round(X.top)},${Math.round(X.right)},${Math.round(X.bottom)},${X.visible?1:0};`:`${O}:-;`}H!==pn&&(pn=H,h.onThings(T))}else pn="";const vt=u.current;if(vt){let T=!1;if(h.inWorkspace&&!I&&!h.cinemaActive&&$.distance>Jp){const H=[[0,0,1,0,m.widthKm],[1,0,1,1,m.depthKm],[1,1,0,1,m.widthKm],[0,1,0,0,m.depthKm]];let B=H[0],O=1/0;for(const j of H){const ee=Yt((j[0]+j[2])*.5)-_.position.x,Ie=$t((j[1]+j[3])*.5)-_.position.z,tt=ee*ee+Ie*Ie;tt<O&&(O=tt,B=j)}const Y=B[4];let X=1;for(const j of[1,2,5,10,20,50,100])j<=Y*.3&&(X=j);const J=pt??{left:0,top:0,right:1,bottom:1},Ue=(j,ee,Ie)=>j[0]-ee>=J.left*at+12&&j[0]+ee<=J.right*at-12&&j[1]-Ie>=J.top*lt+12&&j[1]+Ie<=J.bottom*lt-12;let K=null,N=null;for(let j=Ou;j+X/Y<=1-Ou+1e-6;j+=.06){const ee=wt=>{const Vt=j+wt/Y;return[B[0]+(B[2]-B[0])*Vt,B[1]+(B[3]-B[1])*Vt]},Ie=.07*(1-ya);let tt=1/0;for(let wt=0;wt<=8;wt++){const[Vt,Wa]=ee(X*wt/8);tt=Math.min(tt,yt(Vt,Wa))}const gt=wt=>{const[Vt,Wa]=ee(wt);return Qe.set(Yt(Vt),tt-Ie,$t(Wa)).project(_),Qe.z<=-1||Qe.z>=1?null:[(Qe.x*.5+.5)*at,(-Qe.y*.5+.5)*lt]},it=gt(0),xt=gt(X);if(!it||!xt)continue;const Wt=xt[0]>=it[0]?xt:it;if(Ue(it,2,10)&&Ue(xt,2,10)&&Ue([Wt[0]+36,Wt[1]],30,12)){K=it,N=xt;break}}if(K&&N){const j=Math.hypot(N[0]-K[0],N[1]-K[1]);if(j>40){let ee=-(N[1]-K[1])/j,Ie=(N[0]-K[0])/j;Ie>0&&(ee=-ee,Ie=-Ie);const tt=(wt,Vt)=>`M${wt[0].toFixed(1)},${wt[1].toFixed(1)} L${(wt[0]+ee*Vt).toFixed(1)},${(wt[1]+Ie*Vt).toFixed(1)}`,gt=`${tt(K,7)} M${K[0].toFixed(1)},${K[1].toFixed(1)} L${N[0].toFixed(1)},${N[1].toFixed(1)} ${tt(N,7)}`;gt!==Pl&&(Pl=gt,($s=r.current)==null||$s.setAttribute("d",gt));const it=c.current,xt=N[0]>=K[0]?N:K,Wt=`${X} km|${(xt[0]+8).toFixed(1)}|${(xt[1]+4).toFixed(1)}`;if(it&&Wt!==Il){Il=Wt;const[wt,Vt,Wa]=Wt.split("|");it.textContent=wt,it.setAttribute("x",Vt),it.setAttribute("y",Wa)}T=!0}}}T!==Cl&&(Cl=T,vt.style.opacity=T?"1":"0")}const ce=h.inWorkspace&&!h.cleanHud&&!h.cinemaActive,_e=Lr(m),[Fe,Xe,Oe,De]=m.bbox,ze=Math.max(1e-4,Oe-Fe),Ct=Math.max(1e-4,De-Xe),Ge=[],Kt=232,as=pt?pt.left*at+12:24,ss=Math.max(as,(pt?pt.right*at-12:at-356)-Kt),zt=pt?pt.top*lt+12:68,Lt=Math.max(zt,pt?pt.bottom*lt-76:Math.max(160,lt-134)),os=pt?(pt.left+pt.right)*.5*at:at*.44;for(let T=0;T<3;T++){const H=_e[T];if(!ce||!H){Ge.push({ax:0,ay:0,bx:0,by:0,valid:!1});continue}const B=D.clamp((H.lon-Fe)/ze,.04,.96),O=D.clamp((H.lat-Xe)/Ct,.04,.96),Y=yt(B,O)+.05;if(Qe.set(Yt(B),Y,$t(O)).project(_),Qe.z>=1||Qe.z<=-1){Ge.push({ax:0,ay:0,bx:0,by:0,valid:!1});continue}const X=(Qe.x*.5+.5)*at,J=(-Qe.y*.5+.5)*lt,K=(T===1||X+108>ss||X>os?-1:1)>0?X+56:X-56-Kt,N=D.clamp(K,as,ss),j=D.clamp(J-(T===0?64:T===1?48:-44),zt,Lt);Ge.push({ax:X,ay:J,bx:N,by:j,valid:!0})}const As=240,ks=62;for(let T=0;T<2;T++)for(let H=0;H<Ge.length;H++)if(Ge[H].valid)for(let B=H+1;B<Ge.length;B++){if(!Ge[B].valid)continue;const O=Ge[B].bx-Ge[H].bx,Y=Ge[B].by-Ge[H].by;if(Math.abs(O)<As&&Math.abs(Y)<ks){const X=(ks-Math.abs(Y))*.55*(Y>=0?1:-1);Ge[H].by=D.clamp(Ge[H].by-X,zt,Lt),Ge[B].by=D.clamp(Ge[B].by+X,zt,Lt)}}for(let T=0;T<3;T++){const H=Ge[T],B=i.current[T],O=l.current[T],Y=o.current[T];if(!H||!H.valid){B&&(B.style.opacity="0"),O&&(O.style.opacity="0",O.style.pointerEvents="none",O.style.visibility="hidden"),Y&&(Y.style.opacity="0");continue}if(B&&(B.style.opacity="1",B.style.transform=`translate3d(${H.ax.toFixed(1)}px, ${H.ay.toFixed(1)}px, 0) translate(-50%, -50%)`),O&&(O.style.opacity="1",O.style.pointerEvents="auto",O.style.visibility="visible",O.style.transform=`translate3d(${H.bx.toFixed(1)}px, ${H.by.toFixed(1)}px, 0)`),Y){const X=H.ax+(H.bx-H.ax)*.42,J=H.by+22,Ue=H.bx>H.ax?H.bx:H.bx+(O?O.offsetWidth:Kt);Y.setAttribute("points",`${H.ax.toFixed(1)},${H.ay.toFixed(1)} ${X.toFixed(1)},${J.toFixed(1)} ${Ue.toFixed(1)},${J.toFixed(1)}`),Y.style.opacity="1"}}if(Ms){const T=m.observerDataset.dataSource==="firms"&&m.runId!==null,H=T&&!Ea&&(m.pack?m.contextState!=="loading":m.packManifest===null||m.packState==="failed");Wn=H&&f<dv?Wn+v:0;const B=T?m.pack?m.contextState==="loading"?3:4:m.packManifest&&m.packState!=="failed"?2:H?4:1:0;B!==kc&&(kc=B,_c=At);const O=Kr[B],Y=Kr[Math.min(Kr.length-1,B+1)],X=O+(Y-O)*(1-Math.exp(-(At-_c)/mv));if(Ti=Math.max(Ti,D.lerp(Ti,X,b)),s.current&&(s.current.style.transform=`scaleX(${Ti.toFixed(4)})`),Wn>hv||At>fv){Ms=!1,Fo=At,s.current&&(s.current.style.transform="scaleX(1)");const J=a.current;J&&(J.style.transition=`opacity ${Gr}s ease-out`,J.style.opacity="0"),od(),(zo=h.onPictureReady)==null||zo.call(h)}}else Fo>=0&&At-Fo>Gr+.1&&a.current&&a.current.style.display!=="none"&&(a.current.style.display="none");tr+=1,zi+=v;const ga=Ms?"holding":Fo>=0&&At-Fo<Gr?"fading":"shown",ua=ga!==Ac;if(Ac=ga,zi>=.32||ua){const T=tr/Math.max(.001,zi);if(ar=ar*.55+Math.min(120,T)*.45,tr=0,zi=0,At-Xc>=.3||ua){Xc=At;const H={fps:Math.round(ar),renderScale:+Ri.toFixed(2),slowDevice:U,vertexCount:di.geometry.getAttribute("position").count+ko.geometry.getAttribute("position").count,orthoResolution:m.orthoLabel,demResolution:m.demLabel,activeTheaterId:h.activeTheaterId,slewActive:te||Ea,cinemaProgress:ge,wavePosition:0,imageryAttribution:Cv(m),missingFiles:$p(m,y.current),film:ta?{move:ta,progress:Gs}:void 0,verticalExaggeration:Zr,landingStandpoint:I&&za?bi:void 0,intensityLegend:Xp(m),realPass:Rn,lastSeen:li,passOnShow:xo,dayPicture:yn,picture:ga,regionGrid:h.regionGridDivisions?Yh(m,h.regionGridDivisions):void 0};(Uo=h.onTelemetry)==null||Uo.call(h,H)}}};return Jn=requestAnimationFrame(qc),()=>{var v;S=!0,cancelAnimationFrame(Jn),Pc.disconnect(),es==null||es.removeEventListener("change",jn),ka.removeEventListener("pointerdown",Uc),window.removeEventListener("pointermove",Bc),window.removeEventListener("pointerup",Oc),ka.removeEventListener("pointerleave",Hc),ka.removeEventListener("wheel",Gc),Fi.removeEventListener("change",Wc),ka.removeEventListener("contextmenu",Kc),Hl.dispose(),Gl.dispose(),To.dispose(),Dn.dispose(),Pn.dispose(),Nn.dispose(),oc.dispose(),ic.dispose(),nc.dispose(),rc.dispose();for(const h of we)h.dispose();ot.dispose(),mt.dispose(),Ta==null||Ta.dispose(),Qo.dispose(),Jo.dispose(),ei.dispose(),la.dispose(),hs.dispose(),xs==null||xs.dispose(),Ao==null||Ao.dispose(),tc.dispose(),Cn.dispose(),Ln.dispose();for(const h of Ra.values())pc(h);Ra.clear(),mi.dispose(),Qa.dispose(),G.environment=null,ut.dispose();const n=new Set,f=h=>{!h||n.has(h)||(n.add(h),h.dispose())};for(const h of new Set([...ue.values(),...ae.values(),...rt,se,m]))!h.pack&&h.lite===null&&(f(h.demTex),f(h.satTex)),f((v=h.fireHistory)==null?void 0:v.texture),f(h.shadow);V.dispose(),k.dispose(),ka.parentElement===x&&x.removeChild(ka),R.current=null}},[]),Ft.useEffect(()=>{var x;(x=R.current)==null||x.applyCameraPreset()},[e.cameraPreset,e.inWorkspace,e.mode]),Ft.useEffect(()=>{var x;(x=R.current)==null||x.syncCinemaStart(e.cinemaActive)},[e.cinemaActive]);const E=Ft.useRef(null),w=Ft.useRef(e.activeTheaterId);return Ft.useEffect(()=>{const x=R.current;if(!x)return;const S=e.slewRequest;if(S&&S.nonce!==E.current){E.current=S.nonce,w.current=S.targetTheaterId,x.triggerSlew(S.targetTheaterId);return}e.activeTheaterId!==w.current&&(w.current=e.activeTheaterId,x.triggerSlew(e.activeTheaterId))},[e.activeTheaterId,e.slewRequest]),Ft.useEffect(()=>{const x=e.activeRun,S=R.current;if(!x||!S)return;let k=!1;const U=S.takeRunBundle(x.run_id);if(U){S.activateBundle(U,U.regionId!==S.onScreenRegionId());return}return(async()=>{var C;try{const P=S.bundleCache.get(x.region.id),z=x.assets.dem_hires_f32_url?Va(g.current,x.assets.dem_hires_f32_url):null,G=Va(g.current,x.assets.dem_f32_url),_=Va(g.current,x.assets.satellite_url),V=!!(g.current.filmMove??Bu()),q=Va(g.current,x.assets.reconstruction_u8_url),we=async()=>{if(z){const mt=await fetch(z).catch(()=>null);if(mt&&mt.ok)return mt.arrayBuffer()}const ot=await fetch(G).catch(()=>null);return ot&&ot.ok?ot.arrayBuffer():null},Se=()=>new Promise(ot=>{if(V){ot(null);return}S.texLoader.load(_,mt=>{mt.colorSpace=ct,mt.anisotropy=S.maxAnisotropy,mt.minFilter=Ya,mt.magFilter=Be,mt.wrapS=We,mt.wrapT=We,ot(mt)},void 0,()=>ot(null))}),[ye,ne,Te]=await Promise.all([we(),Se(),fetch(q).catch(()=>null)]),Re=Te&&Te.ok?await Te.arrayBuffer():null;if(k)return;const ut=Qu(x.region.id)?Vo[x.region.id]:null,ue=x.region.bbox,ae=x.observer_passes?Rd(x.observer_passes,ue):Cr(),st=ae.dataSource==="firms",ht=[],Ht=P&&!(st&&P.noRealGround)?P:void 0,se=P&&!(st&&P.noRealPicture)?P:void 0;st&&!ye&&!Ht&&ht.push("elevation"),st&&!ne&&!se&&!V&&ht.push("imagery"),st&&!Re&&ht.push("field");const m=ye?Is(new Float32Array(ye),!0):Ht?{texture:Ht.demTex,aligned:Ht.alignedDem,gridRes:Ht.demGridRes,minElev:Ht.minElevM,maxElev:Ht.maxElevM}:Is(st?new Float32Array(4096).fill(Number.isFinite(x.region.min_elev_m)?x.region.min_elev_m:0):eu("plumas_ca",256),!1),rt=Re?jd(new Uint8Array(Re),!0):st||!P?{buffer:Ir(),frames:so}:{buffer:P.tensor,frames:P.frameCount},Qt=ne??(se==null?void 0:se.satTex)??(st?Vp():null)??tu(ut?ut.id:"plumas_ca",m.aligned,m.gridRes,m.minElev,m.maxElev,S.maxAnisotropy),va=ne&&typeof((C=ne.image)==null?void 0:C.width)=="number"?ne.image.width:2048,Jt=Vr(x.region.id,ue,m.aligned,m.gridRes,rt.buffer,rt.frames),Pt=x.region.min_elev_m<=1.5,ia={key:`run-${x.run_id}`,regionId:x.region.id,runId:x.run_id,missingFiles:ht.length>0?ht:void 0,demTex:m.texture,alignedDem:m.aligned,demGridRes:m.gridRes,minElevM:Number.isFinite(x.region.min_elev_m)?Math.min(m.minElev,x.region.min_elev_m):m.minElev,maxElevM:Number.isFinite(x.region.max_elev_m)?Math.max(m.maxElev,x.region.max_elev_m):m.maxElev,satTex:Qt,orthoLabel:ne?va>=1600?"2K":"1K":(se==null?void 0:se.orthoLabel)??(st?"not loaded":"drawn stand-in"),demLabel:ye||Ht||!st?`${m.gridRes}²`:"not loaded",noRealGround:ye?void 0:Ht?Ht.noRealGround:!0,noRealPicture:ne?void 0:se?se.noRealPicture:!0,tensor:rt.buffer,frameCount:rt.frames,bbox:ue,windDirUv:[...bv],hasSeaCoast:Pt,observerDataset:ae,findings:Jt.anchors,callouts:Jt.callouts,fieldScale:kd(x.encoding),residenceHours:Ad(x.model)??void 0,declared:gr(x.declared_cells),answeredByOther:Wp(x),fireHistory:null,...Wr(Math.max(18,x.region.width_km||60),Math.max(12,x.region.depth_km||Dr(ue)),x.assets.terrain_pack,va,ne?eh:(se==null?void 0:se.attribution)??"")};S.storeRunBundle(x.region.id,x.run_id,ia);const ft=_d(x.belief_frames),pe=M.current,Nt=ft&&!pe.has(x.run_id)?[...pe.values()].find(ot=>ot.info.url===ft.url&&ot.info.steps===ft.steps):void 0;if(ft&&Nt)for(pe.set(x.run_id,{info:ft,bytes:Nt.bytes,declared:gr(x.declared_cells)});pe.size>6;)pe.delete(pe.keys().next().value);ft&&!pe.has(x.run_id)&&fetch(Va(g.current,ft.url)).then(ot=>ot.ok?ot.arrayBuffer():null).then(ot=>{if(!ot||ot.byteLength!==ft.steps*ft.nx*ft.ny*2){y.current.add(x.run_id);return}for(pe.set(x.run_id,{info:ft,bytes:new Uint8Array(ot),declared:gr(x.declared_cells)});pe.size>6;)pe.delete(pe.keys().next().value)}).catch(()=>{y.current.add(x.run_id)});const ra=g.current.activeTheaterId;(!Qu(x.region.id)||x.region.id===ra)&&S.activateBundle(ia,!0)}catch{}})(),()=>{k=!0}},[e.activeRun,e.apiBase]),qt.jsxs("div",{ref:t,tabIndex:0,role:"application","aria-label":"3D terrain of the place, with the fire on it",onKeyDown:x=>{var S;!e.inWorkspace&&x.key==="Enter"&&((S=e.onEnterWorkspace)==null||S.call(e))},style:{position:"relative",width:"100%",height:"100%",overflow:"hidden",outline:"none",backgroundColor:"#080b11",cursor:e.inWorkspace?"grab":"pointer"},children:[qt.jsxs("div",{"aria-hidden":!e.inWorkspace||e.cleanHud||e.cinemaActive,style:{position:"absolute",inset:0,pointerEvents:"none",zIndex:5},children:[qt.jsxs("svg",{width:"100%",height:"100%",style:{position:"absolute",inset:0,overflow:"visible",pointerEvents:"none"},children:[[0,1,2].map(x=>qt.jsx("polyline",{ref:S=>{o.current[x]=S},fill:"none",stroke:d[x]&&e.selectedFindingId===d[x].id?"rgba(155, 227, 255, 0.88)":"rgba(245, 246, 250, 0.34)",strokeWidth:"1",style:{opacity:0,transition:"stroke 160ms ease"}},x)),qt.jsxs("g",{ref:u,className:"stage-scale",style:{opacity:0},children:[qt.jsx("path",{ref:r,fill:"none",stroke:"rgba(243, 244, 246, 0.72)",strokeWidth:"1"}),qt.jsx("text",{ref:c,fill:"rgba(243, 244, 246, 0.92)",stroke:"rgba(8, 11, 17, 0.72)",strokeWidth:"3",style:{fontFamily:"'IBM Plex Mono', ui-monospace, monospace",fontSize:"12px",paintOrder:"stroke"}})]})]}),[0,1,2].map(x=>{const S=d[x],k=!!(S&&e.selectedFindingId===S.id),U=(S==null?void 0:S.kind)==="uncertainty"?"#9be3ff":(S==null?void 0:S.kind)==="subpixel"?"#ffb36b":"#ff7849";return qt.jsxs("div",{children:[qt.jsx("div",{ref:C=>{i.current[x]=C},style:{position:"absolute",top:0,left:0,width:"14px",height:"14px",display:"flex",alignItems:"center",justifyContent:"center",color:U,fontFamily:"'IBM Plex Mono', ui-monospace, monospace",fontSize:"13px",fontWeight:600,lineHeight:1,textShadow:"0 1px 6px rgba(0, 0, 0, 0.9)",opacity:0,willChange:"transform, opacity"},children:"+"}),qt.jsxs("button",{ref:C=>{l.current[x]=C},type:"button","data-stage-ui":"true",onClick:()=>{var C;S&&((C=e.onSelectFinding)==null||C.call(e,S))},style:{position:"absolute",top:0,left:0,minWidth:"188px",maxWidth:"248px",padding:"7px 10px",textAlign:"left",borderRadius:0,border:k?`1px solid ${U}`:"1px solid rgba(243, 244, 246, 0.24)",background:"rgba(10, 13, 19, 0.88)",color:"#f3f4f6",cursor:"pointer",opacity:0,visibility:"hidden",pointerEvents:"none",willChange:"transform, opacity"},children:[qt.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"6px",fontFamily:"'Geist', -apple-system, sans-serif",fontSize:"13px",fontWeight:500,letterSpacing:"-0.01em",color:"#f3f4f6"},children:[qt.jsx("span",{children:(S==null?void 0:S.title)??""}),qt.jsx("span",{style:{width:"6px",height:"6px",borderRadius:0,backgroundColor:U,flexShrink:0}})]}),qt.jsx("div",{style:{marginTop:"3px",fontFamily:"'IBM Plex Mono', ui-monospace, monospace",fontSize:"12px",fontVariantNumeric:"tabular-nums",color:U},children:(S==null?void 0:S.valueText)??""})]})]},x)})]}),qt.jsx("div",{ref:a,"aria-hidden":"true","data-stage-cover":"",style:{position:"absolute",inset:0,zIndex:5,backgroundColor:"var(--sys-night, #080b11)",pointerEvents:"none"},children:qt.jsx("div",{style:{position:"absolute",left:"50%",top:"50%",width:"240px",height:"1px",marginLeft:"-120px",background:"rgba(255, 255, 255, 0.10)"},children:qt.jsx("div",{ref:s,style:{width:"100%",height:"100%",background:"rgba(255, 255, 255, 0.86)",transform:"scaleX(0)",transformOrigin:"left center"}})})})]})}export{Gv as EarthCutawayStage,Gv as default};

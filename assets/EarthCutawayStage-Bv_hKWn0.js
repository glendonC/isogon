const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/GLTFLoader-C8Ag2Ruc.js","assets/three.module-CibWwfTb.js","assets/DRACOLoader-LNaB3iNp.js"])))=>i.map(i=>d[i]);
var jh=Object.defineProperty;var qh=(e,t,a)=>t in e?jh(e,t,{enumerable:!0,configurable:!0,writable:!0,value:a}):e[t]=a;var _=(e,t,a)=>qh(e,typeof t!="symbol"?t+"":t,a);import{x as nr,_ as Yc,r as At,y as Zh,z as $c,j as Yt}from"./index-B2ylrxhr.js";import{S as mo,O as Xr,W as $t,C as Ke,R as no,L as ze,H as La,a as kt,b as St,M as va,P as Qi,c as P,D as ya,d as Jt,e as ju,F as jr,N as po,f as Qh,g as it,U as Nt,B as Ji,h as ha,i as qu,V as H,j as Xc,k as Na,I as Jh,T as qr,l as Va,m as Le,n as ca,o as rr,p as ed,q as td,r as Pe,s as en,t as Xi,u as ao,v as Ps,w as ad,E as Zr,x as Zu,y as Ns,z as Qr,A as Jr,G as Qu,J as sd,K as od,Q as Ju,X as id,Y as ro,Z as eo,_ as nd,$ as rd,a0 as ld,a1 as cd,a2 as ud,a3 as lr,a4 as hd,a5 as dd,a6 as eh,a7 as Uo,a8 as cr,a9 as fd,aa as md,ab as pd,ac as vd,ad as gd,ae as xd}from"./three.module-CibWwfTb.js";import{n as wd,p as Md,a as yd,b as bd,D as to,f as ji,c as th}from"./types-CZu1tyoc.js";const Vi=6360,el=60,ah=8,sh=1.2,lo=[.005802,.013558,.0331],Sd=.003996,Yi=.00444,co=[65e-5,.001881,85e-6],Td=.8,cs=64,Is=32,uo=-.2,Ed=192,Rd=108,ho=[5.25,5.05,4.8],Ad=.4,ur=.4,kd=.72;function _d(e){return Math.max(0,1-Math.abs(e-25)/15)}function oh(e,t){const a=Vi+e,s=Vi+el,o=a*a*(t*t-1)+s*s,i=Math.max(0,-a*t+Math.sqrt(Math.max(0,o))),l=48,u=i/l;let r=0,c=0,h=0;for(let p=0;p<l;p++){const M=(p+.5)*u,y=Math.max(0,Math.sqrt(a*a+M*M+2*a*M*t)-Vi);r+=Math.exp(-y/ah)*u,c+=Math.exp(-y/sh)*u,h+=_d(y)*u}return[lo[0]*r+Yi*c+co[0]*h,lo[1]*r+Yi*c+co[1]*h,lo[2]*r+Yi*c+co[2]*h]}function ih(e,t){const a=oh(Math.max(0,e),Math.max(uo,t));return[Math.exp(-a[0]),Math.exp(-a[1]),Math.exp(-a[2])]}function Fd(e,t,a){const s=ih(e,t),o=[1.404,1.287,1.17];return a.set(.5*o[0]+.5*ho[0]*s[0]/Math.PI,.5*o[1]+.5*ho[1]*s[1]/Math.PI,.5*o[2]+.5*ho[2]*s[2]/Math.PI)}function Dd(){const e=new Uint16Array(cs*Is*4);for(let a=0;a<Is;a++){const s=a/(Is-1),o=s*s*el;for(let i=0;i<cs;i++){const l=uo+i/(cs-1)*(1-uo),u=oh(o,l),r=(a*cs+i)*4;e[r]=ya.toHalfFloat(Math.exp(-u[0])),e[r+1]=ya.toHalfFloat(Math.exp(-u[1])),e[r+2]=ya.toHalfFloat(Math.exp(-u[2])),e[r+3]=ya.toHalfFloat(1)}}const t=new Jt(e,cs,Is,kt,La);return t.minFilter=ze,t.magFilter=ze,t.wrapS=Ke,t.wrapT=Ke,t.generateMipmaps=!1,t.flipY=!1,t.needsUpdate=!0,t}function pt(e){const t=e.toPrecision(8);return/[.e]/.test(t)?t:`${t}.0`}const tn=`
const float ATM_RG = ${pt(Vi)};
const float ATM_TOP = ${pt(el)};
const float ATM_HR = ${pt(ah)};
const float ATM_HM = ${pt(sh)};
const vec3 ATM_BETA_R = vec3(${pt(lo[0])}, ${pt(lo[1])}, ${pt(lo[2])});
const float ATM_BETA_MS = ${pt(Sd)};
const float ATM_BETA_ME = ${pt(Yi)};
const vec3 ATM_BETA_O = vec3(${pt(co[0])}, ${pt(co[1])}, ${pt(co[2])});
const vec3 ATM_SUN = vec3(${pt(ho[0])}, ${pt(ho[1])}, ${pt(ho[2])});
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
  const float g = ${pt(Td)};
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
`,an=`
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
`,nh=`
uniform sampler2D uTransmittanceLut;

vec3 atmTransmittanceToSpace(float hKm, float mu) {
  float u = (clamp(mu, ${pt(uo)}, 1.0) - (${pt(uo)})) / ${pt(1-uo)};
  float v = sqrt(clamp(hKm / ATM_TOP, 0.0, 1.0));
  vec2 uv = vec2(u * ${pt((cs-1)/cs)} + ${pt(.5/cs)}, v * ${pt((Is-1)/Is)} + ${pt(.5/Is)});
  return texture2D(uTransmittanceLut, uv).rgb;
}
`,sn=`
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
`,Pd=`
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`,Id=`
${tn}
${nh}
${sn}

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
`,Cd=`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,Ld=`
${tn}
${nh}
${sn}

uniform sampler2D uSkyView;
uniform vec3 uSunTrue;             // unit vector toward the sun, true scale
uniform float uCamAltKm;
uniform float uVerticalExaggeration;
uniform vec3 uFloorColor;
uniform float uFloorHaze;
uniform float uSkyExposure;
${an}
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
`;class Nd{constructor(){_(this,"transmittance");_(this,"skyView");_(this,"scene",new mo);_(this,"camera",new Xr(-1,1,1,-1,0,1));_(this,"material");_(this,"quad");_(this,"lastSunSin",9);_(this,"lastAltKm",-9);this.transmittance=Dd(),this.skyView=new $t(Ed,Rd,{format:kt,type:La,depthBuffer:!1,stencilBuffer:!1,minFilter:ze,magFilter:ze,generateMipmaps:!1,wrapS:no,wrapT:Ke}),this.material=new St({vertexShader:Pd,fragmentShader:Id,uniforms:{uTransmittanceLut:{value:this.transmittance},uSunSin:{value:.5},uCamAltKm:{value:5}},depthTest:!1,depthWrite:!1,toneMapped:!1}),this.quad=new va(new Qi(2,2),this.material),this.quad.frustumCulled=!1,this.scene.add(this.quad)}update(t,a,s){const o=P.clamp(a.y,-.15,1);if(Math.abs(o-this.lastSunSin)<1e-4&&Math.abs(s-this.lastAltKm)<.02)return;this.lastSunSin=o,this.lastAltKm=s,this.material.uniforms.uSunSin.value=o,this.material.uniforms.uCamAltKm.value=s;const i=t.getRenderTarget();t.setRenderTarget(this.skyView),t.render(this.scene,this.camera),t.setRenderTarget(i)}dispose(){this.transmittance.dispose(),this.skyView.dispose(),this.material.dispose(),this.quad.geometry.dispose()}}const Xo=14.8,jo=10.8,rh=511,Cs=-.44,Ge=256,so=24,zd=80,Ud=24,us=["plumas_ca","lytton_bc","evia_greece","blue_mountains_au"],Vo={plumas_ca:{id:"plumas_ca",bbox:[-121.6,39.75,-120.75,40.35],widthKm:72.5,minElevM:313,maxElevM:2357,windDirUv:[.68,.73],paletteBase:[.14,.21,.14],paletteRidge:[.44,.43,.4],hasSeaCoast:!1},lytton_bc:{id:"lytton_bc",bbox:[-121.95,49.95,-121.2,50.52],widthKm:54,minElevM:195,maxElevM:2860,windDirUv:[.42,.91],paletteBase:[.24,.22,.16],paletteRidge:[.56,.54,.52],hasSeaCoast:!1},evia_greece:{id:"evia_greece",bbox:[23.02,38.62,23.62,39.12],widthKm:52,minElevM:0,maxElevM:1385,windDirUv:[-.62,-.78],paletteBase:[.27,.3,.2],paletteRidge:[.64,.6,.52],hasSeaCoast:!0},blue_mountains_au:{id:"blue_mountains_au",bbox:[150.02,-33.92,150.74,-33.32],widthKm:66,minElevM:68,maxElevM:1215,windDirUv:[.79,-.61],paletteBase:[.15,.22,.17],paletteRidge:[.54,.38,.27],hasSeaCoast:!1}};function Bd(e){const t=us.indexOf(e);return t>=0?t:0}function Od(){const e=new Uint8Array(1024);for(let a=0;a<256;a++)e[a*4]=nr[a*3],e[a*4+1]=nr[a*3+1],e[a*4+2]=nr[a*3+2],e[a*4+3]=255;const t=new Jt(e,256,1,kt,Nt);return t.colorSpace=it,t.minFilter=ze,t.magFilter=ze,t.wrapS=Ke,t.wrapT=Ke,t.needsUpdate=!0,t}function Ds(e,t=!0){const a=Math.max(2,Math.floor(Math.sqrt(e.length))),s=a*a,o=new Float32Array(s);let i=Number.POSITIVE_INFINITY,l=Number.NEGATIVE_INFINITY;for(let r=0;r<a;r++){const h=(t?a-1-r:r)*a,p=r*a;for(let M=0;M<a;M++){const y=Number.isFinite(e[h+M])?e[h+M]:0;o[p+M]=y,y<i&&(i=y),y>l&&(l=y)}}Number.isFinite(i)||(i=0),(!Number.isFinite(l)||l<=i+1)&&(l=i+1e3);const u=new Jt(o,a,a,ju,jr);return u.internalFormat="R32F",u.minFilter=po,u.magFilter=po,u.wrapS=Ke,u.wrapT=Ke,u.flipY=!1,u.generateMipmaps=!1,u.needsUpdate=!0,{texture:u,aligned:o,gridRes:a,minElev:i,maxElev:l}}function jc(e,t=256){const a=Vo[e],s=new Float32Array(t*t),o=Bd(e)*2.35;for(let i=0;i<t;i++){const u=(1-i/(t-1)-.5)*2;for(let r=0;r<t;r++){const h=(r/(t-1)-.5)*2,p=.24*Math.sin(u*2.7+o)+.11*Math.cos(u*5.6-o),M=Math.abs(h*.88-p),y=Math.pow(Math.min(1.3,M*1.18),.78),g=1-Math.abs(Math.sin(h*4.4+u*3.1+o)),E=1-Math.abs(Math.cos(h*8.9-u*7.4-o*.6)),T=.5+.5*Math.sin(h*18.5+u*16.2+o*1.3);let w=y*(.58+.28*g*g+.11*E+.04*T);if(a.hasSeaCoast){const x=1-Math.max(0,Math.hypot(h*.92,u*.84)-.62)*1.9;w=Math.max(0,w*x-.08)}s[i*t+r]=a.minElevM+Math.max(0,Math.min(1.05,w))*(a.maxElevM-a.minElevM)}}return s}function qc(e,t,a,s,o,i){const l=Vo[e],u=512,r=document.createElement("canvas");r.width=u,r.height=u;const c=r.getContext("2d");if(c){const p=c.createImageData(u,u),M=p.data,y=Math.max(100,o-s);for(let g=0;g<u;g++){const E=1-g/(u-1),T=Math.min(a-1,Math.max(0,Math.round(E*(a-1)))),w=Math.min(a-1,T+1);for(let x=0;x<u;x++){const S=x/(u-1),A=Math.min(a-1,Math.max(0,Math.round(S*(a-1)))),U=Math.min(a-1,A+1),I=t[T*a+A],D=t[T*a+U],z=t[w*a+A],O=Math.max(0,Math.min(1,(I-s)/y)),k=Math.min(1,Math.hypot(D-I,z-I)/48),K=.92+.08*Math.sin(x*.47+g*.31)*Math.cos(x*.19-g*.53);let j,xe,be;if(l.hasSeaCoast&&I<=2.2)j=.05,xe=.14+.04*K,be=.24+.05*K;else{const ne=Math.min(1,Math.max(0,O*.72+k*.55));if(j=(l.paletteBase[0]*(1-ne)+l.paletteRidge[0]*ne)*K,xe=(l.paletteBase[1]*(1-ne)+l.paletteRidge[1]*ne)*K,be=(l.paletteBase[2]*(1-ne)+l.paletteRidge[2]*ne)*K,l.maxElevM>2200&&O>.84){const Se=(O-.84)/.16;j=j*(1-Se*.55)+.78*Se*.55,xe=xe*(1-Se*.55)+.8*Se*.55,be=be*(1-Se*.55)+.84*Se*.55}}const ye=(g*u+x)*4;M[ye]=Math.min(255,Math.max(0,Math.round(j*255))),M[ye+1]=Math.min(255,Math.max(0,Math.round(xe*255))),M[ye+2]=Math.min(255,Math.max(0,Math.round(be*255))),M[ye+3]=255}}c.putImageData(p,0,0)}const h=new Qh(r);return h.colorSpace=it,h.anisotropy=i,h.wrapS=Ke,h.wrapT=Ke,h.needsUpdate=!0,h}function Hd(e,t=!0){const a=Ge*Ge*4,s=Math.max(1,Math.floor(e.byteLength/a));if(!t)return{buffer:e.slice(0,s*a),frames:s};const o=new Uint8Array(s*a),i=Ge*4;for(let l=0;l<s;l++){const u=l*a;for(let r=0;r<Ge;r++){const c=u+(Ge-1-r)*i,h=u+r*i;o.set(e.subarray(c,c+i),h)}}return{buffer:o,frames:s}}const on=`
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
`;function Zc(e=rh){const a=(e+1)*2*4,s=e*6*4,o=new Float32Array(a*3),i=new Float32Array(a*3),l=new Float32Array(a*4),u=new Uint32Array(s),r=[{normal:[0,0,1],evalUv:M=>[M,0]},{normal:[1,0,0],evalUv:M=>[1,M]},{normal:[0,0,-1],evalUv:M=>[1-M,1]},{normal:[-1,0,0],evalUv:M=>[0,1-M]}];let c=0,h=0;for(let M=0;M<4;M++){const y=r[M],g=c;for(let E=0;E<=e;E++){const T=E/e,[w,x]=y.evalUv(T),S=(w-.5)*Xo,A=(.5-x)*jo,U=M+T;o[c*3]=S,o[c*3+1]=0,o[c*3+2]=A,i[c*3]=y.normal[0],i[c*3+1]=y.normal[1],i[c*3+2]=y.normal[2],l[c*4]=w,l[c*4+1]=x,l[c*4+2]=1,l[c*4+3]=U,c++,o[c*3]=S,o[c*3+1]=Cs,o[c*3+2]=A,i[c*3]=y.normal[0],i[c*3+1]=y.normal[1],i[c*3+2]=y.normal[2],l[c*4]=w,l[c*4+1]=x,l[c*4+2]=0,l[c*4+3]=U,c++}for(let E=0;E<e;E++){const T=g+E*2,w=T+1,x=T+2,S=T+3;u[h++]=T,u[h++]=w,u[h++]=x,u[h++]=x,u[h++]=w,u[h++]=S}}const p=new Ji;return p.setAttribute("position",new ha(o,3)),p.setAttribute("normal",new ha(i,3)),p.setAttribute("aSkirtParam",new ha(l,4)),p.setIndex(new ha(u,1)),p.boundingSphere=new qu(new H(0,.8,0),14),p}const Gd=`
${on}

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

  float wy = mix(${Cs.toFixed(2)}, surfY, isTop);
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
`,Kd=`
${an}
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
  float wallSpan = max(0.08, vSurfaceY - (${Cs.toFixed(2)}));
  float hFrac = clamp((vWorldY - (${Cs.toFixed(2)})) / wallSpan, 0.0, 1.0);

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
  float baseRule = 1.0 - smoothstep(0.0, 0.014, vWorldY - (${Cs.toFixed(2)}));
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
`,Wd=`
varying vec3 vLocalPos;
varying vec3 vWorldPos;

void main() {
  vLocalPos = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,Vd=`
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
`;function Yd(e){return Math.max(0,Math.min(e-1,Math.floor((e-1)*.52)))}const $d=11,Xd=.42,jd=8;function qd(e,t,a,s,o,i){const[l,u,r,c]=t,h=o.gridSize,p=Yd(s),M=p*h*h*4,y=`pass ${p+1}`;let g=!1,E={gx:Math.round(h*.5),gy:Math.round(h*.5),zMw:0};for(let k=14;k<h-14;k+=2)for(let K=14;K<h-14;K+=2){const j=a[M+(k*h+K)*4]/255*o.zMaxMwKm2;j>E.zMw&&(E={gx:K,gy:k,zMw:j},g=!0)}let T=!1,w=-1/0,x={gx:Math.round(h*.375),gy:Math.round(h*.42),zMw:0,modisMw:0};for(let k=14;k<h-14;k+=2)for(let K=14;K<h-14;K+=2){const j=M+(k*h+K)*4,xe=a[j]/255*o.zMaxMwKm2,be=a[j+2]/255*o.zMaxMwKm2,ye=Math.hypot(K-E.gx,k-E.gy);if(xe>=$d&&be<xe*Xd&&ye>24){const ne=i(K/(h-1),k/(h-1)),Se=xe-be*1.25-ne*6e-4;Se>w&&(w=Se,x={gx:K,gy:k,zMw:xe,modisMw:be},T=!0)}}let S=!1,A={gx:Math.round(h*.640625),gy:Math.round(h*.40625),sigmaMw:0};for(let k=14;k<h-14;k+=2)for(let K=14;K<h-14;K+=2){const j=M+(k*h+K)*4,xe=a[j]/255*o.zMaxMwKm2,be=a[j+1]/255*o.sigmaMaxMwKm2,ye=Math.hypot(K-E.gx,k-E.gy),ne=Math.hypot(K-x.gx,k-x.gy);xe>=jd&&be>A.sigmaMw&&ye>28&&ne>24&&(A={gx:K,gy:k,sigmaMw:be},S=!0)}const U=(k,K,j,xe,be,ye,ne)=>{const Se=j/(h-1),Ee=xe/(h-1);return{id:`${e}-${k}`,kind:K,title:be,subtitle:ye,valueText:ne,lat:u+Ee*(c-u),lon:l+Se*(r-l),elevM:Math.round(i(Se,Ee))}},I=U("front-core","front",E.gx,E.gy,g?"Strongest estimate":"",g?`Highest value of the simulated 375 m estimate at ${y}`:"",g?`${E.zMw.toFixed(1)} MW/km², ${y}`:""),D=U("canyon-subpixel","subpixel",x.gx,x.gy,T?"Estimate above MODIS":"",T?`Simulated estimate where the simulated MODIS pass reads far less, at ${y}`:"",T?`${x.zMw.toFixed(1)} MW/km², MODIS ${x.modisMw.toFixed(1)} MW/km², ${y}`:""),z=U("sigma-peak","uncertainty",A.gx,A.gy,S?"Least certain estimate":"",S?`One standard deviation of the simulated estimate at ${y}`:"",S?`±${A.sigmaMw.toFixed(1)} MW/km² (1 sigma), ${y}`:""),O=[];return g&&O.push(I),T&&O.push(D),S&&O.push(z),{anchors:[I,D,z],callouts:O}}const Zd=1,Qd=2,Jd=3,Qc=24*3600*1e3;function ef(e,t,a,s){const o=new Uint8Array(e.length);for(let i=0;i<e.length;i++){const l=e[i];if(!(l>=1))continue;const u=t+(l-1)*Qc,r=u+Qc;o[i]=r<=a?Zd:u>=s?Jd:Qd}return o}function tf(e,t,a,s=.375,o){if(o&&o.length===4&&o.every(p=>Number.isFinite(p))&&o[2]>o[0]&&o[3]>o[1])return[o[0],o[1],o[2],o[3]];const[i,l,,u]=e,r=(l+u)/2*(Math.PI/180),c=s/111.132,h=s/(111.132*Math.cos(r));return[i,l,i+t*h,l+a*c]}function af(e,t){const a=Math.max(1e-9,t[2]-t[0]),s=Math.max(1e-9,t[3]-t[1]);return[(e[2]-e[0])/a,(e[3]-e[1])/s,(e[0]-t[0])/a,(e[1]-t[1])/s]}const sf="isogon:stage-ready";let Ko=null;new Promise(e=>{Ko=e});function lh(){return typeof document<"u"?document.documentElement:null}function of(e=lh()){e&&e.dataset.stage!=="ready"&&(e.dataset.stage="loading")}function nf(e=lh(),t=typeof window<"u"?window:null){if(e){if(e.dataset.stage==="ready")return;e.dataset.stage="ready"}Ko==null||Ko(),Ko=null,t&&typeof CustomEvent<"u"&&t.dispatchEvent(new CustomEvent(sf))}const yt={azimuth:.5,polar:.98,distance:17.2,target:[.1,.3,.2]},Jc={overview:{azimuth:.48,polar:.97,distance:17,target:[-.6,.3,.3]},canyon:{azimuth:-.34,polar:1.24,distance:5.6,target:[-.42,.45,-.22]},ridge:{azimuth:.86,polar:1.12,distance:7.4,target:[.32,.6,-.14]},nadir:{azimuth:0,polar:.14,distance:18.5,target:[0,.3,0]},region:{azimuth:.48,polar:.75,distance:17,target:[-.3,.3,.2]}},rf={azimuth:0,polar:.42,distance:12,target:[0,.3,0]};function eu(e,t,a,s,o=!1){if(!t)return yt;const i=e==="region"&&o?rf:Jc[e]??Jc.overview;return a==="observer"&&e==="overview"?{azimuth:i.azimuth,polar:.98,distance:18.4,target:[0,.7,.2]}:{azimuth:i.azimuth,polar:i.polar,distance:i.distance,target:[i.target[0],i.target[1],i.target[2]]}}function ch(e){const t=Math.min(1,Math.max(0,e));return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)*.5}const Yo=.95;class lf{constructor(){_(this,"active",!1);_(this,"elapsedSec",0);_(this,"durationSec",Yo);_(this,"startAzimuth",yt.azimuth);_(this,"endAzimuth",yt.azimuth);_(this,"startPolar",yt.polar);_(this,"endPolar",yt.polar);_(this,"startDistance",yt.distance);_(this,"endDistance",yt.distance);_(this,"startTarget",new H(...yt.target));_(this,"endTarget",new H(...yt.target));_(this,"hopHeightDist",2.15)}trigger(t,a,s=2.15,o=Yo){this.active=!0,this.elapsedSec=0,this.durationSec=Math.max(.25,o),this.startAzimuth=t.azimuth;let i=a.azimuth-t.azimuth;for(;i>Math.PI;)i-=Math.PI*2;for(;i<-Math.PI;)i+=Math.PI*2;this.endAzimuth=t.azimuth+i,this.startPolar=t.polar,this.endPolar=a.polar,this.startDistance=t.distance,this.endDistance=a.distance,this.startTarget.copy(t.target),this.endTarget.set(a.target[0],a.target[1],a.target[2]),this.hopHeightDist=s}cancel(){this.active=!1}isActive(){return this.active}step(t,a){if(!this.active)return{slewActive:!1,rawProgress:1,easedProgress:1};this.elapsedSec+=Math.min(.08,Math.max(0,t));const s=Math.min(1,this.elapsedSec/this.durationSec),o=ch(s),i=Math.sin(s*Math.PI);return a.azimuth=P.lerp(this.startAzimuth,this.endAzimuth,o),a.polar=P.clamp(P.lerp(this.startPolar,this.endPolar,o)-i*.085,.1,1.38),a.distance=P.lerp(this.startDistance,this.endDistance,o)+i*this.hopHeightDist,a.target.lerpVectors(this.startTarget,this.endTarget,o),s>=1&&(this.active=!1),{slewActive:this.active,rawProgress:s,easedProgress:o}}}function cf(e){const t=e%2===0?1:-1,a=e>=2?-1:1,s=[new H(6.6*t,7.6,7.8*a),new H(4.2*t,3.3,5.1*a),new H(1.1*t,1.85,2.5*a),new H(-2.3*t,1.72,.15*a),new H(-4.6*t,2.65,-2.4*a),new H(-1.8*t,4.45,-4.6*a),new H(3.6*t,6.45,-2.2*a),new H(6.8*t,7.9,3.8*a)],o=[new H(0,.65,0),new H(-.35*t,.85,.45*a),new H(-1.35*t,1.05,-.55*a),new H(-1.85*t,1.12,-1.35*a),new H(-.65*t,1.02,-.85*a),new H(.25*t,.88,-.15*a),new H(.1*t,.72,.15*a),new H(0,.65,0)];return{eyeCurve:new Xc(s,!0,"catmullrom",.5),lookCurve:new Xc(o,!0,"catmullrom",.5)}}const Bo=13.5;class uf{constructor(){_(this,"rigs");_(this,"elapsedSec",0);_(this,"currentLegIndex",0);_(this,"tmpEye",new H);_(this,"tmpEyeAhead",new H);_(this,"tmpEyeBehind",new H);_(this,"tmpLook",new H);_(this,"tmpVelA",new H);_(this,"tmpVelB",new H);_(this,"tmpForward",new H);_(this,"tmpRight",new H);_(this,"tmpUp",new H(0,1,0));_(this,"worldUp",new H(0,1,0));this.rigs=[0,1,2,3].map(t=>cf(t))}startAtTheater(t){const a=Math.max(0,us.indexOf(t));this.currentLegIndex=a,this.elapsedSec=a*Bo}update(t,a,s,o=Xo,i=jo){const l=Math.min(.08,Math.max(0,t));this.elapsedSec+=l;const u=Bo*us.length,r=(this.elapsedSec%u+u)%u,c=Math.min(us.length-1,Math.floor(r/Bo)),h=(r-c*Bo)/Bo;c!==this.currentLegIndex&&(this.currentLegIndex=c,s==null||s(us[c]));const p=this.rigs[c],M=.008,y=(h-M+1)%1,g=(h+M)%1;p.eyeCurve.getPointAt(h,this.tmpEye),p.eyeCurve.getPointAt(y,this.tmpEyeBehind),p.eyeCurve.getPointAt(g,this.tmpEyeAhead),p.lookCurve.getPointAt(h,this.tmpLook);const E=this.tmpEye.x/o+.5,T=.5-this.tmpEye.z/i;if(E>=-.02&&E<=1.02&&T>=-.02&&T<=1.02){const O=a(Math.min(1,Math.max(0,E)),Math.min(1,Math.max(0,T)))+.78;this.tmpEye.y<O&&(this.tmpEye.y=O)}const w=this.tmpLook.x/o+.5,x=.5-this.tmpLook.z/i,S=a(Math.min(1,Math.max(0,w)),Math.min(1,Math.max(0,x)));this.tmpLook.y=Math.max(this.tmpLook.y,S+.18),this.tmpVelA.subVectors(this.tmpEye,this.tmpEyeBehind).setY(0),this.tmpVelB.subVectors(this.tmpEyeAhead,this.tmpEye).setY(0);let A=0;if(this.tmpVelA.lengthSq()>1e-6&&this.tmpVelB.lengthSq()>1e-6){this.tmpVelA.normalize(),this.tmpVelB.normalize();const z=this.tmpVelA.x*this.tmpVelB.z-this.tmpVelA.z*this.tmpVelB.x;A=P.clamp(z*1.45,-.11,.11)}this.tmpForward.subVectors(this.tmpLook,this.tmpEye).normalize(),this.tmpRight.crossVectors(this.tmpForward,this.worldUp).normalize(),this.tmpUp.copy(this.worldUp).applyAxisAngle(this.tmpForward,A).normalize();const U=.18+.68*(.5-.5*Math.cos(h*Math.PI*2)),D=39+Math.sin(h*Math.PI)*3.2;return{position:this.tmpEye,lookAt:this.tmpLook,up:this.tmpUp,fov:D,syntheticTimeProgress:U,cycleProgress:r/u,legProgress:h,activeLegTheater:us[c]}}}function hf(e,t,a){a.target.copy(t),a.target.x=P.clamp(a.target.x,-Xo*.45,Xo*.45),a.target.z=P.clamp(a.target.z,-jo*.45,jo*.45),a.target.y=P.clamp(a.target.y,-.1,2.2);const s=new H().subVectors(e,a.target),o=P.clamp(s.length(),4.2,26),i=P.clamp(Math.acos(P.clamp(s.y/o,-.99,.99)),.1,1.38),l=Math.atan2(s.x,s.z);a.distance=o,a.polar=i,a.azimuth=l}const Gr=.05;function df(e,t){const a=new Uint8Array(t*t);for(let o=0;o<t;o++)for(let i=0;i<t;i++){const l=e[o*t+i];if(l===0)continue;let u=1;for(let r=-1;r<=1&&u;r++)for(let c=-1;c<=1;c++){const h=Math.min(t-1,Math.max(0,o+r)),p=Math.min(t-1,Math.max(0,i+c));if(Math.abs(e[h*t+p]-l)>Gr){u=0;break}}a[o*t+i]=u}const s=new Uint8Array(t*t);for(let o=0;o<t;o++)for(let i=0;i<t;i++){const l=e[o*t+i];if(l===0)continue;let u=a[o*t+i];for(let r=-1;r<=1&&!u;r++)for(let c=-1;c<=1;c++){const h=o+r,p=i+c;if(!(h<0||h>=t||p<0||p>=t)&&a[h*t+p]&&Math.abs(e[h*t+p]-l)<=Gr){u=1;break}}s[o*t+i]=u}return s}function tl(e,t){let a=0,s=0;for(let o=1;o<t-1;o+=2)for(let i=1;i<t-1;i+=2){const l=e[o*t+i];if(l===0||!Number.isFinite(l))continue;let u=!0;for(let r=-1;r<=1&&u;r++)for(let c=-1;c<=1;c++)if(Math.abs(e[(o+r)*t+i+c]-l)>Gr){u=!1;break}u&&(a++,Math.abs(l-Math.round(l))<.02&&s++)}return a>=20&&s/a>.5}const ff=1.5;function mf(e,t){let a=new Uint8Array(t*t);for(let s=0;s<t*t;s++)a[s]=e[s]===0?1:0;for(let s=0;s<2;s++){const o=a.slice();for(let i=1;i<t-1;i++)for(let l=1;l<t-1;l++){const u=i*t+l;if(a[u]||!(e[u]<ff))continue;let r=0;for(let c=-1;c<=1;c++)for(let h=-1;h<=1;h++)r+=a[(i+c)*t+l+h];r>=5&&(o[u]=1)}a=o}return a}const pf=5,vf=.25;function gf(e,t,a){const s=new Uint8Array(t*t),o=new Uint8Array(t*t),i=new Int32Array(t*t),l=[],u=[];let r=0;const c=h=>a[h]===0&&e[h]<pf;for(let h=0;h<t*t;h++){if(o[h]||!c(h))continue;r++;let p=0,M=0;for(u.length=0,l.push(h),o[h]=1;l.length>0;){const y=l.pop();u.push(y);const g=Math.floor(y/t),E=y-g*t;for(let T=-1;T<=1;T++){const w=g+T;if(!(w<0||w>=t))for(let x=-1;x<=1;x++){const S=E+x;if(S<0||S>=t||T===0&&x===0)continue;const A=w*t+S;c(A)?o[A]||(o[A]=1,l.push(A)):i[A]!==r&&(i[A]=r,a[A]?p++:M++)}}}if(p>0&&M<vf*(p+M))for(const y of u)s[y]=1}return s}const tu=4,au=1.5,xf=4;function uh(e,t){if(t<2*tu+1||e.length!==t*t)return;const a=tu;let s=new Float32Array(t*t),o=new Float32Array(t*t);for(let r=0;r<t*t;r++){const c=e[r]!==0?1:0;s[r]=e[r]*c,o[r]=c}const i=new Float32Array(t*t),l=new Float32Array(t*t),u=(r,c,h)=>{for(let p=0;p<t;p++){let M=0;const y=g=>h?p*t+g:g*t+p;for(let g=0;g<=a&&g<t;g++)M+=r[y(g)];for(let g=0;g<t;g++){c[y(g)]=M;const E=g+a+1,T=g-a;E<t&&(M+=r[y(E)]),T>=0&&(M-=r[y(T)])}}};for(let r=0;r<2;r++){u(s,i,!0),u(o,l,!0),u(i,s,!1),u(l,o,!1);for(let c=0;c<t*t;c++){const h=o[c];s[c]=h>0?s[c]/h:0,o[c]=h>0?1:0}}for(let r=0;r<t*t;r++){const c=e[r];if(c===0||o[r]===0)continue;const h=Math.min(1,Math.max(0,(Math.abs(c-s[r])-au)/(xf-au))),p=h*h*(3-2*h);e[r]=c+(s[r]-c)*(1-p)}}function wf(e){const t=Math.floor(e.length/4);if(t===0)return 0;const a=o=>{const i=o/255;return i<=.04045?i/12.92:Math.pow((i+.055)/1.055,2.4)},s=new Float32Array(t);for(let o=0;o<t;o++)s[o]=.2126*a(e[o*4])+.7152*a(e[o*4+1])+.0722*a(e[o*4+2]);return s.sort(),s[Math.floor(t/2)]}function Kr(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function hr(e){return Kr(e)&&typeof e.url=="string"&&e.url.length>0&&typeof e.size=="number"}function su(e){return Array.isArray(e)&&e.length===2&&e.every(t=>typeof t=="number"&&Number.isFinite(t))}function Mf(e){if(!Kr(e)||e.version!==1||!hr(e.dem)||!hr(e.ortho)||!hr(e.aux)||!su(e.extent_km)||!su(e.elev_range_m))return null;const t=e.sun;return!Kr(t)||typeof t.azimuth_deg!="number"||typeof t.elevation_deg!="number"||!Number.isFinite(t.azimuth_deg)||!Number.isFinite(t.elevation_deg)?null:e}function $i(e,t){return new Promise(a=>{const s=new Jh;s.setCrossOrigin("anonymous"),s.setOptions(t),s.load(e,o=>a(o),void 0,()=>a(null))})}function Wr(e){const t=new qr(e);return t.flipY=!1,t.premultiplyAlpha=!1,t.wrapS=Ke,t.wrapT=Ke,t.magFilter=ze,t.minFilter=Va,t.generateMipmaps=!0,t.onUpdate=()=>{e.close()},t.addEventListener("dispose",()=>{e.close()}),t.needsUpdate=!0,t}async function yf(e){let t=null;try{t=await createImageBitmap(e,{resizeWidth:256,resizeHeight:256,resizeQuality:"medium"}).catch(()=>null);const o=(typeof OffscreenCanvas<"u"?new OffscreenCanvas(256,256):Object.assign(document.createElement("canvas"),{width:256,height:256})).getContext("2d");return o?(o.imageSmoothingEnabled=!0,o.imageSmoothingQuality="high",o.drawImage(t??e,0,0,256,256),wf(o.getImageData(0,0,256,256).data)):null}catch{return null}finally{t==null||t.close()}}async function hh(e,t){const a=await $i(e,{imageOrientation:"flipY",premultiplyAlpha:"none"});if(!a)return null;const s=Wr(a);return s.colorSpace=it,s.anisotropy=t,s}function bf(e,t){if(t<3||e.length!==t*t)return;const a=new Float32Array(t*t),s=1/6,o=2/3;for(let i=0;i<t;i++){const l=i*t;for(let u=0;u<t;u++){const r=e[l+(u>0?u-1:0)],c=e[l+(u<t-1?u+1:t-1)];a[l+u]=s*r+o*e[l+u]+s*c}}for(let i=0;i<t;i++){const l=(i>0?i-1:0)*t,u=(i<t-1?i+1:t-1)*t,r=i*t;for(let c=0;c<t;c++)e[r+c]=s*a[l+c]+o*a[r+c]+s*a[u+c]}}async function Sf(e,t){var a,s,o;try{const i=e.ortho.size<=t.maxTextureSize,l=i?e.ortho:e.ortho_fallback??null;if(!l||l.size>t.maxTextureSize)return null;const u=fetch(t.resolveUrl(e.dem.url)).then(U=>U.ok?U.arrayBuffer():null),r=$i(t.resolveUrl(l.url),{imageOrientation:"flipY",premultiplyAlpha:"none"}).then(async U=>U||!i||!e.ortho_fallback?{bitmap:U,size:l.size}:{bitmap:await $i(t.resolveUrl(e.ortho_fallback.url),{imageOrientation:"flipY",premultiplyAlpha:"none"}),size:e.ortho_fallback.size}),c=$i(t.resolveUrl(e.aux.url),{imageOrientation:"flipY",premultiplyAlpha:"none",colorSpaceConversion:"none"}),[h,p,M]=await Promise.all([u,r,c]),y=((a=t.isCancelled)==null?void 0:a.call(t))??!1,g=e.dem.size*e.dem.size*4;if(y||!h||h.byteLength!==g||e.dem.format!=="f32le"||!p.bitmap||!M)return(s=p.bitmap)==null||s.close(),M==null||M.close(),null;const E=new Float32Array(h),T=tl(E,e.dem.size);T&&uh(E,e.dem.size),bf(E,e.dem.size);const w=Ds(E,!0),x=await yf(p.bitmap);if((o=t.isCancelled)!=null&&o.call(t))return w.texture.dispose(),p.bitmap.close(),M.close(),null;const S=Wr(p.bitmap);S.colorSpace=it,S.anisotropy=t.maxAnisotropy;const A=Wr(M);return A.colorSpace=Na,A.anisotropy=Math.min(4,t.maxAnisotropy),{manifest:e,demTexture:w.texture,alignedDem:w.aligned,demGridRes:w.gridRes,minElevM:w.minElev,maxElevM:w.maxElev,orthoTexture:S,orthoSize:p.size,auxTexture:A,attribution:e.ortho.attribution??"",levelInWholeMetres:T,pictureMedianLuma:x,dispose:()=>{w.texture.dispose(),S.dispose(),A.dispose()}}}catch{return null}}function Tf(e,t,a){const s=e*Math.PI/180,o=t*Math.PI/180;return a.set(Math.sin(s)*Math.cos(o),Math.sin(o),-Math.cos(s)*Math.cos(o)).normalize()}function Ef(e,t,a){return a.set(e.x*t.x,e.y*t.y,e.z*t.z).normalize()}const qo=.085,Rf=1e6;function Af(e,t,a){const s=Ge,o=s*s,i=o*4,l=qo*255,u=new Float32Array(o).fill(Rf),r=new Float32Array(o).fill(0),c=new Float32Array(o),h=new Uint8Array(o);for(let I=0;I<o;I++){let D=-1,z=-1,O=0;for(let k=0;k<t;k++){const K=e[k*i+I*4];K>O&&(O=K),K>=l&&(D<0&&(D=k),z=k)}if(c[I]=O/255,!(D<0)){if(h[I]=1,D===0)u[I]=-.5;else{const k=e[(D-1)*i+I*4],K=e[D*i+I*4],j=K>k?(l-k)/(K-k):1;u[I]=D-1+Math.min(1,Math.max(0,j))}if(z>=t-1)r[I]=t-1+.5;else{const k=e[z*i+I*4],K=e[(z+1)*i+I*4],j=k>K?(k-l)/(k-K):0;r[I]=z+Math.min(1,Math.max(0,j))}}}let p=0,M=0;for(let I=1;I<s-1;I+=2)for(let D=1;D<s-1;D+=2){const z=I*s+D;if(!h[z]||!h[z+1]||!h[z-1]||!h[z+s]||!h[z-s])continue;const O=(u[z+1]-u[z-1])*.5,k=(u[z+s]-u[z-s])*.5,K=Math.hypot(O,k);K>.001&&K<4&&(p+=K,M++)}const y=M>16?Math.min(1.2,Math.max(.08,p/M)):.3,g=u.slice(),E=y,T=y*Math.SQRT2,w=(I,D,z)=>{const O=g[D]+z;O<g[I]&&(g[I]=O)};for(let I=0;I<2;I++){for(let D=0;D<s;D++)for(let z=0;z<s;z++){const O=D*s+z;h[O]||(z>0&&w(O,O-1,E),D>0&&w(O,O-s,E),z>0&&D>0&&w(O,O-s-1,T),z<s-1&&D>0&&w(O,O-s+1,T))}for(let D=s-1;D>=0;D--)for(let z=s-1;z>=0;z--){const O=D*s+z;h[O]||(z<s-1&&w(O,O+1,E),D<s-1&&w(O,O+s,E),z<s-1&&D<s-1&&w(O,O+s+1,T),z>0&&D<s-1&&w(O,O+s-1,T))}}let x=0;const S=t+64,A=new Float32Array(o*4);for(let I=0;I<o;I++){const D=Math.min(S,g[I]);A[I*4]=D,A[I*4+1]=h[I]?r[I]:D,A[I*4+2]=c[I],A[I*4+3]=h[I],x+=h[I]}let U;if(a)U=new Jt(A,s,s,kt,jr);else{const I=new Uint16Array(o*4);for(let D=0;D<I.length;D++)I[D]=ya.toHalfFloat(A[D]);U=new Jt(I,s,s,kt,La)}return U.minFilter=ze,U.magFilter=ze,U.wrapS=Ke,U.wrapT=Ke,U.generateMipmaps=!1,U.flipY=!1,U.needsUpdate=!0,{texture:U,burnedFraction:x/o,frameCount:t}}function ou(e){const t=String(e);return/[.e]/.test(t)?t:`${t}.0`}const kf=`
const float FIRE_THR = ${ou(qo)};
const float FIRE_FIELD_TEXEL = ${ou(1/Ge)};

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
`,_f=`
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
`,vo=6378.137,qi={family:"modis",altitudeKm:705,maxScanDeg:55,alphaScanNative:1/705,alphaTrack:1/705,detectors:10,zone1Deg:90,zone2Deg:90},oo={family:"viirs",altitudeKm:825.2,maxScanDeg:56.28,alphaScanNative:.125/825.2,alphaTrack:.362/825.2,detectors:32,zone1Deg:31.72,zone2Deg:44.86},Zi=Math.PI/180;function Vr(e){return(vo+e.altitudeKm)/vo}function Ff(e,t){const a=Math.min(e.maxScanDeg,Math.abs(t))*Zi,s=Vr(e);return vo*(Math.asin(Math.min(1,s*Math.sin(a)))-a)}const iu={axisEast:1,axisNorth:0,nadirKm:0,valid:!1,scanAngleDeg:0};function nu(e,t,a){if(!e||e.family!==t.family)return a.valid=!1,a;const s=e.azimuthDeg*Zi;return a.axisEast=Math.sin(s),a.axisNorth=Math.cos(s),a.scanAngleDeg=Math.min(t.maxScanDeg,Math.abs(e.scanAngleDeg)),a.nadirKm=Ff(t,a.scanAngleDeg),a.valid=!0,a}function hs(e){const t=e.toPrecision(10);return/[.e]/.test(t)?t:`${t}.0`}function ru(e){return`vec4(${hs(e.alphaScanNative)}, ${hs(e.alphaTrack)}, ${hs(e.detectors)}, ${e.family==="viirs"?"1.0":"0.0"})`}const Df=`
const float SCAN_RE = ${hs(vo)};
const float MODIS_ORBIT_K = ${hs(Vr(qi))};
const float VIIRS_ORBIT_K = ${hs(Vr(oo))};
const vec4 MODIS_SENSOR = ${ru(qi)};
const vec4 VIIRS_SENSOR = ${ru(oo)};
const float VIIRS_ZONE1 = ${hs(oo.zone1Deg*Zi)};
const float VIIRS_ZONE2 = ${hs(oo.zone2Deg*Zi)};

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
`,dh=`
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
`,lu=`
${on}

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
`,Pf=`
void main() {
  gl_FragColor = vec4(0.0);
}
`,If=`
${on}
${Df}

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

${_f}
${tn}
${sn}
${an}
${kf}

${dh}

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
`;function dr(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function cu(e){if(!dr(e))return null;const{extent_km:t,scale:a,dem:s,ortho:o}=e;return!Array.isArray(t)||t.length!==2||!t.every(i=>typeof i=="number"&&i>0)||typeof a!="number"||!(a>1)||a>15||!dr(s)||typeof s.url!="string"||typeof s.size!="number"||s.format!=="f32le"||!dr(o)||typeof o.url!="string"||typeof o.size!="number"?null:e}function Cf(e,t,a,s){const o=new Uint8Array(t*t*4),i=s?new Uint8Array(t*t):df(e,t),l=mf(e,t),u=gf(e,t,l),r=a[0]*1e3/(t-1),c=a[1]*1e3/(t-1);for(let p=0;p<t;p++){const M=Math.min(t-1,p+1),y=Math.max(0,p-1);for(let g=0;g<t;g++){const E=Math.min(t-1,g+1),T=Math.max(0,g-1),w=(e[p*t+E]-e[p*t+T])/((E-T)*r),x=(e[y*t+g]-e[M*t+g])/((M-y)*c),S=1/Math.hypot(w,1,x),A=(p*t+g)*4;o[A]=Math.round((-w*S*.5+.5)*255),o[A+1]=Math.round((-x*S*.5+.5)*255),o[A+2]=l[p*t+g]?255:u[p*t+g]?128:0,o[A+3]=i[p*t+g]?255:0}}const h=new Jt(o,t,t,kt,Nt);return h.colorSpace=Na,h.wrapS=Ke,h.wrapT=Ke,h.magFilter=ze,h.minFilter=Va,h.generateMipmaps=!0,h.flipY=!1,h.needsUpdate=!0,h}async function Lf(e,t){var a;try{if(e.ortho.size>t.maxTextureSize)return null;const[s,o]=await Promise.all([fetch(t.resolveUrl(e.dem.url)).then(h=>h.ok?h.arrayBuffer():null),hh(t.resolveUrl(e.ortho.url),t.maxAnisotropy)]),i=e.dem.size;if((((a=t.isCancelled)==null?void 0:a.call(t))??!1)||!s||s.byteLength!==i*i*4||!o)return o==null||o.dispose(),null;const l=new Float32Array(s),u=tl(l,i);u&&uh(l,i);const r=Ds(l,!0),c=Cf(r.aligned,r.gridRes,e.extent_km,u);return{manifest:e,scale:e.scale,demTexture:r.texture,alignedDem:r.aligned,gridRes:r.gridRes,shadeTexture:c,orthoTexture:o,dispose:()=>{r.texture.dispose(),c.dispose(),o.dispose()}}}catch{return null}}const fh=6360;function Nf(e,t){return(e*e+2*e*t)/(2*fh)}const zf=`
${on}

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
  y -= (dOut * dOut + 2.0 * dOut * halfKm) / (2.0 * ${fh.toFixed(1)}) * 1000.0 * uUnitsPerMetre.y;

  // Under the pack this surface dives out of the way; the pack is the surface there. The dive
  // starts more than one cell of this mesh inside the pack, so along the pack edge both surfaces
  // are at the same height (the pack takes the context elevation there, see contextJoin).
  vec2 e = min(packUv, 1.0 - packUv);
  y -= clamp((min(e.x, e.y) - 0.012) * 40.0, 0.0, 1.0) * 0.6;

  vec4 worldPos = modelMatrix * vec4(xz.x, y, xz.y, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`,Uf=`
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

${tn}
${sn}
${an}
${dh}

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
`,uu=640;class Bf{constructor(t){_(this,"mesh");_(this,"material");_(this,"shadeUniform",{value:null});const a=new Qi(1,1,uu,uu);this.material=new St({vertexShader:zf,fragmentShader:Uf,uniforms:{...t,uContextShade:this.shadeUniform},transparent:!0,depthWrite:!0}),this.mesh=new va(a,this.material),this.mesh.frustumCulled=!1,this.mesh.visible=!1,this.mesh.renderOrder=-2}setContext(t){this.shadeUniform.value=(t==null?void 0:t.shadeTexture)??null}dispose(){this.mesh.geometry.dispose(),this.material.dispose()}}function Of(e,t,a){const s=e.gridRes,o=Math.min(s-1,Math.max(0,t*(s-1))),i=Math.min(s-1,Math.max(0,a*(s-1))),l=Math.floor(o),u=Math.floor(i),r=Math.min(s-1,l+1),c=Math.min(s-1,u+1),h=o-l,p=i-u,M=e.alignedDem,y=M[u*s+l]*(1-h)+M[u*s+r]*h,g=M[c*s+l]*(1-h)+M[c*s+r]*h;return y*(1-p)+g*p}const $o=1024,fo=1536,hu=1.1,Hf=5,Gf=.2,Kf=.09,Wf=.07,du=.36,fu=.16,mu=.34,Vf=[1,.09,.015],pu=[1,.36,.05],Yf=[1,.66,.32];function $f(e,t){const a=Math.min(1,Math.max(0,e)),s=hu+(Hf-hu)*a*a*a,o=a<.5?Vf:pu,i=a<.5?pu:Yf,l=a<.5?a*2:a*2-1;for(let u=0;u<3;u++)t[u]=(o[u]+(i[u]-o[u])*l)*s;t[3]=s}function vu(e,t){const a=Math.sin(e*12.9898+t*78.233)*43758.5453;return a-Math.floor(a)}const Oi=4,Xf=3,Pa=$o*$o,fr=fo*fo;class jf{constructor(){_(this,"texture");_(this,"lightTexture");_(this,"modisCount",0);_(this,"viirsCount",0);_(this,"data",new Uint16Array(Pa*4));_(this,"blank",new Uint16Array(Pa*4));_(this,"outside",[new Float32Array(Pa),new Float32Array(Pa)]);_(this,"depth",[new Float32Array(Pa),new Float32Array(Pa)]);_(this,"frp",[new Float32Array(Pa),new Float32Array(Pa)]);_(this,"touched",new Int32Array(65536));_(this,"touchedCount",0);_(this,"mark",new Uint8Array(Pa));_(this,"light",new Float32Array(fr*4));_(this,"lightData",new Uint16Array(fr*4));_(this,"lightTouched",new Int32Array(65536));_(this,"lightTouchedCount",0);_(this,"lightMark",new Uint8Array(fr));_(this,"lightOfOne",new Float32Array(4));const t=ya.toHalfFloat(Oi);for(let o=0;o<Pa;o++)this.blank[o*4]=t,this.blank[o*4+2]=t;this.data.set(this.blank);for(let o=0;o<2;o++)this.outside[o].fill(Oi);const a=new Jt(this.data,$o,$o,kt,La);a.colorSpace=Na,a.minFilter=ze,a.magFilter=ze,a.generateMipmaps=!1,a.wrapS=Ke,a.wrapT=Ke,a.flipY=!1,a.needsUpdate=!0,this.texture=a;const s=new Jt(this.lightData,fo,fo,kt,La);s.colorSpace=Na,s.minFilter=Va,s.magFilter=ze,s.generateMipmaps=!0,s.wrapS=Ke,s.wrapT=Ke,s.flipY=!1,s.needsUpdate=!0,this.lightTexture=s}build(t,a,s,o,i=[],l=[]){for(let r=0;r<this.touchedCount;r++){const c=this.touched[r];this.mark[c]=0;for(let h=0;h<2;h++)this.outside[h][c]=Oi,this.depth[h][c]=0,this.frp[h][c]=0;this.data[c*4]=this.blank[c*4],this.data[c*4+1]=0,this.data[c*4+2]=this.blank[c*4+2],this.data[c*4+3]=0}this.touchedCount=0;for(let r=0;r<this.lightTouchedCount;r++){const c=this.lightTouched[r];this.lightMark[c]=0;for(let h=0;h<4;h++)this.light[c*4+h]=0,this.lightData[c*4+h]=0}this.lightTouchedCount=0,this.modisCount=0,this.viirsCount=0;for(const r of t)this.drawFootprint(r,a,s);for(const r of i)this.drawFootprint(r,a,s);for(const r of t)this.drawLight(r,a,s,o);for(const r of l)this.drawLight(r,a,s,o);const u=ya.toHalfFloat;for(let r=0;r<this.touchedCount;r++){const c=this.touched[r];for(let h=0;h<2;h++){const p=this.depth[h][c];p>0?(this.data[c*4+h*2]=u(-p),this.data[c*4+h*2+1]=u(Math.min(this.frp[h][c],6e4))):this.outside[h][c]<Oi&&(this.data[c*4+h*2]=u(this.outside[h][c]))}}for(let r=0;r<this.lightTouchedCount;r++){const c=this.lightTouched[r];for(let h=0;h<4;h++)this.lightData[c*4+h]=u(Math.min(this.light[c*4+h],6e4))}this.texture.needsUpdate=!0,this.lightTexture.needsUpdate=!0}drawFootprint(t,a,s){const o=$o,[i,l,u,r]=a,c=s[0]/o,h=s[1]/o,p=Xf*Math.max(c,h),M=t.family==="viirs"?1:0,y=(t.lon-i)/Math.max(1e-9,u-i)*s[0],g=(t.lat-l)/Math.max(1e-9,r-l)*s[1],E=t.acrossTrackKm*.5,T=t.alongTrackKm*.5,w=Math.max(1e-4,Math.min(E,T)),x=t.azimuthDeg*Math.PI/180,S=Math.sin(x),A=Math.cos(x),U=Math.hypot(E,T)+p,I=Math.max(0,Math.floor((y-U)/c)),D=Math.min(o-1,Math.ceil((y+U)/c)),z=Math.max(0,Math.floor((g-U)/h)),O=Math.min(o-1,Math.ceil((g+U)/h));if(D<I||O<z)return;M===1?this.viirsCount++:this.modisCount++;const k=t.frpMw/Math.max(1e-4,t.acrossTrackKm*t.alongTrackKm),K=this.outside[M],j=this.depth[M],xe=this.frp[M];for(let be=z;be<=O;be++){const ye=(be+.5)*h-g;for(let ne=I;ne<=D;ne++){const Se=(ne+.5)*c-y,Ee=Math.abs(Se*S+ye*A)-E,lt=Math.abs(Se*A-ye*S)-T,le=Math.hypot(Math.max(Ee,0),Math.max(lt,0))+Math.min(Math.max(Ee,lt),0);if(le>p)continue;const ee=be*o+ne;if(!this.mark[ee]){if(this.mark[ee]=1,this.touchedCount===this.touched.length){const ct=new Int32Array(this.touched.length*2);ct.set(this.touched),this.touched=ct}this.touched[this.touchedCount++]=ee}if(le>=0){le<K[ee]&&(K[ee]=le);continue}const et=Math.min(1,-le/w);et>=j[ee]&&(j[ee]=Math.max(et,.001),xe[ee]=k)}}}drawLight(t,a,s,o){const i=fo,[l,u,r,c]=a,h=s[0]/i,p=s[1]/i,M=(t.lon-l)/Math.max(1e-9,r-l)*s[0],y=(t.lat-u)/Math.max(1e-9,c-u)*s[1],g=t.acrossTrackKm*.5,E=t.alongTrackKm*.5,T=t.azimuthDeg*Math.PI/180,w=Math.sin(T),x=Math.cos(T),S=this.lightOfOne;$f(o(t.frpMw/Math.max(1e-4,t.acrossTrackKm*t.alongTrackKm)),S);const A=Math.min(Kf,Gf*Math.min(g,E)),U=Math.max(A,.8*Math.max(h,p)),I=A*A/(U*U),D=9*U*U,z=(vu(t.lon,t.lat)*2-1)*mu*g,O=(vu(t.lat*1.7,t.lon*.9)*2-1)*mu*E,k=z*w+O*x,K=z*x-O*w,j=Math.min(du*g,fu),xe=Math.min(du*E,fu),be=Math.hypot(g,E),ye=Math.max(0,Math.floor((M-be)/h)),ne=Math.min(i-1,Math.ceil((M+be)/h)),Se=Math.max(0,Math.floor((y-be)/p)),Ee=Math.min(i-1,Math.ceil((y+be)/p)),lt=this.light;for(let le=Se;le<=Ee;le++){const ee=(le+.5)*p-y;for(let et=ye;et<=ne;et++){const ct=(et+.5)*h-M,zt=ct*w+ee*x,se=ct*x-ee*w,m=Math.hypot(zt/g,se/E);let ot=0;const Xt=ct-k,fa=ee-K;if(Xt*Xt+fa*fa<D){for(let _t=0;_t<4;_t++){const sa=Xt+(_t&1?.25:-.25)*h,dt=fa+(_t&2?.25:-.25)*p;ot+=Math.exp(-(sa*sa+dt*dt)/(U*U))}ot*=.25*I}if(m<1){const _t=m<=.72?0:(m-.72)/.28,sa=(zt-z)/j,dt=(se-O)/xe;ot+=Wf*Math.exp(-(sa*sa+dt*dt))*(1-_t*_t*(3-2*_t))}if(ot<=1e-4)continue;const jt=le*i+et;if(!this.lightMark[jt]){if(this.lightMark[jt]=1,this.lightTouchedCount===this.lightTouched.length){const _t=new Int32Array(this.lightTouched.length*2);_t.set(this.lightTouched),this.lightTouched=_t}this.lightTouched[this.lightTouchedCount++]=jt}lt[jt*4]+=S[0]*ot,lt[jt*4+1]+=S[1]*ot,lt[jt*4+2]+=S[2]*ot,lt[jt*4+3]+=S[3]*ot}}}dispose(){this.texture.dispose(),this.lightTexture.dispose()}}const qf=1500,gu=30;function Zf(e){const t=Math.log1p(Math.max(0,e)/gu)/Math.log1p(qf/gu);return Math.min(1,t)}function Qf(e,t,a,s,o,i=.6){const l=o*o,u=new Uint8Array(t*l),[r,c,h,p]=a,M=s[0]/o,y=s[1]/o;for(let g=0;g<t;g++){const E=g*l;if(g>0){const T=(g-1)*l;for(let w=0;w<l;w++)u[E+w]=Math.floor(u[T+w]*i)}for(const T of e[g]??[])if(!(T.hidden||T.revealedByLook))for(const w of T.footprints){const x=(w.lon-r)/Math.max(1e-9,h-r)*s[0],S=(w.lat-c)/Math.max(1e-9,p-c)*s[1],A=w.acrossTrackKm*.5,U=w.alongTrackKm*.5,I=w.azimuthDeg*Math.PI/180,D=Math.sin(I),z=Math.cos(I),O=Math.round(255*Zf(w.frpMw/Math.max(1e-4,w.acrossTrackKm*w.alongTrackKm))),k=Math.hypot(A,U),K=Math.max(0,Math.floor((x-k)/M)),j=Math.min(o-1,Math.ceil((x+k)/M)),xe=Math.max(0,Math.floor((S-k)/y)),be=Math.min(o-1,Math.ceil((S+k)/y));for(let ye=xe;ye<=be;ye++){const ne=(ye+.5)*y-S;for(let Se=K;Se<=j;Se++){const Ee=(Se+.5)*M-x;if(Math.abs(Ee*D+ne*z)>A+.5*M||Math.abs(Ee*z-ne*D)>U+.5*y)continue;const lt=E+ye*o+Se;O>u[lt]&&(u[lt]=O)}}}}return u}function mr(e){if(typeof e!="object"||e===null)return null;const t=e;if(typeof t.grid!="object"||t.grid===null||!Array.isArray(t.looks))return null;const a=t.grid,s=Number(a.nx),o=Number(a.ny);if(!Number.isInteger(s)||!Number.isInteger(o)||s<2||o<2||a.index!=="row * nx + column"||a.rows_run!=="north to south")return null;const i=new Map;for(const l of t.looks){if(typeof l!="object"||l===null)return null;const{frame:u,cells:r}=l;if(u==null)continue;if(!Number.isInteger(u)||u<0||!Array.isArray(r))return null;const c=new Uint32Array(r.length);for(let h=0;h<r.length;h++){const p=r[h];if(!Number.isInteger(p)||p<0||p>=s*o)return null;c[h]=p}i.set(u,c)}return i.size>0?{nx:s,ny:o,byFrame:i}:null}class Jf{constructor(){_(this,"texture");_(this,"grid",new Le(0,0));_(this,"box",new ca(0,0,0,0));_(this,"data");_(this,"nx",1);_(this,"ny",1);_(this,"key","");_(this,"stepKey","");_(this,"step",0);_(this,"declaredGiven",!1);this.data=new Uint8Array(4),this.texture=this.makeTexture(1,1)}makeTexture(t,a){const s=new Jt(this.data,t,a,kt,Nt);return s.minFilter=ze,s.magFilter=ze,s.generateMipmaps=!1,s.wrapS=Ke,s.wrapT=Ke,s.flipY=!1,s.needsUpdate=!0,s}clear(){this.grid.set(0,0),this.box.set(0,0,0,0),this.key="",this.stepKey="",this.declaredGiven=!1}sync(t,a,s,o=null){const{steps:i,stepMs:l,firstTimeMs:u,nx:r,ny:c}=t.info,h=Math.min(i-1,Math.max(0,(s-u)/l)),p=Math.min(i-1,Math.floor(h)),M=Math.min(i-1,p+1);(r!==this.nx||c!==this.ny)&&(this.texture.dispose(),this.nx=r,this.ny=c,this.data=new Uint8Array(r*c*4),this.texture=this.makeTexture(r,c),this.key=""),this.grid.set(r,c);const y=t.declared&&t.declared.nx===r&&t.declared.ny===c?t.declared:null,g=y&&o!==null?y.byFrame.get(o)??null:null;this.declaredGiven=y!==null;const E=`${a}:${p}`,T=`${E}:${y?o??"none":"no list"}`;if(T!==this.key){this.key=T,this.stepKey=E,this.step=p;const w=t.bytes,x=r*c,S=this.data;let A=r,U=-1,I=c,D=-1;for(let z=0;z<c;z++){const O=(p*x+(c-1-z)*r)*2,k=(M*x+(c-1-z)*r)*2,K=z*r*4;for(let j=0;j<r;j++){const xe=w[O+j*2],be=w[k+j*2];S[K+j*4]=xe,S[K+j*4+1]=y?w[O+j*2+1]&254:w[O+j*2+1],S[K+j*4+2]=be,S[K+j*4+3]=w[k+j*2+1],(xe>0||be>0)&&(j<A&&(A=j),j>U&&(U=j),z<I&&(I=z),z>D&&(D=z))}}if(g)for(let z=0;z<g.length;z++){const O=Math.floor(g[z]/r),k=g[z]-O*r,K=c-1-O;S[(K*r+k)*4+1]|=1,k<A&&(A=k),k>U&&(U=k),K<I&&(I=K),K>D&&(D=K)}U<0?this.box.set(0,0,0,0):this.box.set((A-3)/r,(I-3)/c,(U+4)/r,(D+4)/c),this.texture.needsUpdate=!0}return h-p}cellsAbove(t,a,s){const{nx:o,ny:i}=t.info,l=o*i,u=this.step*l*2,r=Math.ceil(a*255),c=[];for(let h=0;h<i;h++)for(let p=0;p<o;p++){const M=u+(h*o+p)*2;t.bytes[M]<r||c.push((p+.5)/o,1-(h+.5)/i,Math.max(.01,s(t.bytes[M+1]/255)))}return new Float32Array(c)}dispose(){this.texture.dispose()}}function la(e,t){return e.revealed?!1:e.hidden===!0||t&&e.family==="viirs"}/**
 * postprocessing v6.39.6 build Sun Nov 01 2026
 * https://github.com/pmndrs/postprocessing
 * Copyright 2015-2026 Raoul van Rüschen
 * @license Zlib
 */var em=(()=>{const e=new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),t=new Float32Array([0,0,2,0,0,2]),a=new Ji;return a.setAttribute("position",new ha(e,3)),a.setAttribute("uv",new ha(t,2)),a})(),da=class Yr{static get fullscreenGeometry(){return em}constructor(t="Pass",a=new mo,s=new Xr){this.name=t,this.renderer=null,this.scene=a,this.camera=s,this.screen=null,this.rtt=!0,this.needsSwap=!0,this.needsDepthBlit=!1,this.needsDepthTexture=!1,this.enabled=!0}get renderToScreen(){return!this.rtt}set renderToScreen(t){if(this.rtt===t){const a=this.fullscreenMaterial;a!==null&&(a.needsUpdate=!0),this.rtt=!t}}set mainScene(t){}set mainCamera(t){}setRenderer(t){this.renderer=t}isEnabled(){return this.enabled}setEnabled(t){this.enabled=t}get fullscreenMaterial(){return this.screen!==null?this.screen.material:null}set fullscreenMaterial(t){let a=this.screen;a!==null?a.material=t:(a=new va(Yr.fullscreenGeometry,t),a.frustumCulled=!1,this.scene===null&&(this.scene=new mo),this.scene.add(a),this.screen=a)}getFullscreenMaterial(){return this.fullscreenMaterial}setFullscreenMaterial(t){this.fullscreenMaterial=t}getDepthTexture(){return null}setDepthTexture(t,a=en){}render(t,a,s,o,i){throw new Error("Render method not implemented!")}setSize(t,a){}initialize(t,a,s){}dispose(){for(const t of Object.keys(this)){const a=this[t];(a instanceof $t||a instanceof Qu||a instanceof qr||a instanceof Yr)&&this[t].dispose()}this.fullscreenMaterial!==null&&this.fullscreenMaterial.dispose()}},tm=class extends da{constructor(){super("ClearMaskPass",null,null),this.needsSwap=!1}render(e,t,a,s,o){const i=e.state.buffers.stencil;i.setLocked(!1),i.setTest(!1)}},am=`#ifdef COLOR_WRITE
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
}`,al="varying vec2 vUv;void main(){vUv=position.xy*0.5+0.5;gl_Position=vec4(position.xy,1.0,1.0);}",mh=class extends St{constructor(){super({name:"CopyMaterial",defines:{COLOR_SPACE_CONVERSION:"1",DEPTH_PACKING:"0",COLOR_WRITE:"1"},uniforms:{inputBuffer:new Pe(null),depthBuffer:new Pe(null),channelWeights:new Pe(null),opacity:new Pe(1)},blending:Ns,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:am,vertexShader:al}),this.depthFunc=sd}get inputBuffer(){return this.uniforms.inputBuffer.value}set inputBuffer(e){const t=e!==null;this.colorWrite!==t&&(t?this.defines.COLOR_WRITE=!0:delete this.defines.COLOR_WRITE,this.colorWrite=t,this.needsUpdate=!0),this.uniforms.inputBuffer.value=e}get depthBuffer(){return this.uniforms.depthBuffer.value}set depthBuffer(e){const t=e!==null;this.depthWrite!==t&&(t?this.defines.DEPTH_WRITE=!0:delete this.defines.DEPTH_WRITE,this.depthTest=t,this.depthWrite=t,this.needsUpdate=!0),this.uniforms.depthBuffer.value=e}set depthPacking(e){this.defines.DEPTH_PACKING=e.toFixed(0),this.needsUpdate=!0}get colorSpaceConversion(){return this.defines.COLOR_SPACE_CONVERSION!==void 0}set colorSpaceConversion(e){this.colorSpaceConversion!==e&&(e?this.defines.COLOR_SPACE_CONVERSION=!0:delete this.defines.COLOR_SPACE_CONVERSION,this.needsUpdate=!0)}get channelWeights(){return this.uniforms.channelWeights.value}set channelWeights(e){e!==null?(this.defines.USE_WEIGHTS="1",this.uniforms.channelWeights.value=e):delete this.defines.USE_WEIGHTS,this.needsUpdate=!0}setInputBuffer(e){this.uniforms.inputBuffer.value=e}getOpacity(e){return this.uniforms.opacity.value}setOpacity(e){this.uniforms.opacity.value=e}},ph=class extends da{constructor(e,t=!0){super("CopyPass"),this.fullscreenMaterial=new mh,this.needsSwap=!1,this.renderTarget=e,e===void 0&&(this.renderTarget=new $t(1,1,{minFilter:ze,magFilter:ze,stencilBuffer:!1,depthBuffer:!1}),this.renderTarget.texture.name="CopyPass.Target"),this.autoResize=t}get resize(){return this.autoResize}set resize(e){this.autoResize=e}get texture(){return this.renderTarget.texture}getTexture(){return this.renderTarget.texture}setAutoResizeEnabled(e){this.autoResize=e}render(e,t,a,s,o){this.fullscreenMaterial.inputBuffer=t.texture,e.setRenderTarget(this.renderToScreen?null:this.renderTarget),e.render(this.scene,this.camera)}setSize(e,t){this.autoResize&&this.renderTarget.setSize(e,t)}initialize(e,t,a){a!==void 0&&(this.renderTarget.texture.type=a,a!==Nt?this.fullscreenMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1":e!==null&&e.outputColorSpace===it&&(this.renderTarget.texture.colorSpace=it))}},xu=new Xi,vh=class extends da{constructor(e=!0,t=!0,a=!1){super("ClearPass",null,null),this.needsSwap=!1,this.color=e,this.depth=t,this.stencil=a,this.overrideClearColor=null,this.overrideClearAlpha=-1}setClearFlags(e,t,a){this.color=e,this.depth=t,this.stencil=a}getOverrideClearColor(){return this.overrideClearColor}setOverrideClearColor(e){this.overrideClearColor=e}getOverrideClearAlpha(){return this.overrideClearAlpha}setOverrideClearAlpha(e){this.overrideClearAlpha=e}render(e,t,a,s,o){const i=this.overrideClearColor,l=this.overrideClearAlpha,u=e.getClearAlpha(),r=i!==null,c=l>=0;r?(e.getClearColor(xu),e.setClearColor(i,c?l:u)):c&&e.setClearAlpha(l),e.setRenderTarget(this.renderToScreen?null:t),e.clear(this.color,this.depth,this.stencil),r?e.setClearColor(xu,u):c&&e.setClearAlpha(u)}},sm=class extends da{constructor(e,t){super("MaskPass",e,t),this.needsSwap=!1,this.clearPass=new vh(!1,!1,!0),this.inverse=!1}set mainScene(e){this.scene=e}set mainCamera(e){this.camera=e}get inverted(){return this.inverse}set inverted(e){this.inverse=e}get clear(){return this.clearPass.enabled}set clear(e){this.clearPass.enabled=e}getClearPass(){return this.clearPass}isInverted(){return this.inverted}setInverted(e){this.inverted=e}render(e,t,a,s,o){const i=e.getContext(),l=e.state.buffers,u=this.scene,r=this.camera,c=this.clearPass,h=this.inverted?0:1,p=1-h;l.color.setMask(!1),l.depth.setMask(!1),l.color.setLocked(!0),l.depth.setLocked(!0),l.stencil.setTest(!0),l.stencil.setOp(i.REPLACE,i.REPLACE,i.REPLACE),l.stencil.setFunc(i.ALWAYS,h,4294967295),l.stencil.setClear(p),l.stencil.setLocked(!0),this.clearPass.enabled&&(this.renderToScreen?c.render(e,null):(c.render(e,t),c.render(e,a))),this.renderToScreen?(e.setRenderTarget(null),e.render(u,r)):(e.setRenderTarget(t),e.render(u,r),e.setRenderTarget(a),e.render(u,r)),l.color.setLocked(!1),l.depth.setLocked(!1),l.stencil.setLocked(!1),l.stencil.setFunc(i.EQUAL,1,4294967295),l.stencil.setOp(i.KEEP,i.KEEP,i.KEEP),l.stencil.setLocked(!0)}};function om(e,t){const a=e.getContext();if(t<=0||typeof a.renderbufferStorageMultisample!="function")return 0;const s=a.getParameter(a.MAX_SAMPLES),o=Math.min(t,s);if(o<=0)return 0;const i=a.getParameter(a.RENDERBUFFER_BINDING),l=a.createRenderbuffer();try{return a.bindRenderbuffer(a.RENDERBUFFER,l),a.renderbufferStorageMultisample(a.RENDERBUFFER,o,a.RGBA8,1,1),o}catch{return 0}finally{a.bindRenderbuffer(a.RENDERBUFFER,i),a.deleteRenderbuffer(l)}}var pr=1/1e3,im=1e3,nm=class{constructor(){this.startTime=performance.now(),this.previousTime=0,this.currentTime=0,this._delta=0,this._elapsed=0,this._fixedDelta=1e3/60,this.timescale=1,this.useFixedDelta=!1,this._autoReset=!1}get autoReset(){return this._autoReset}set autoReset(e){typeof document<"u"&&document.hidden!==void 0&&(e?document.addEventListener("visibilitychange",this):document.removeEventListener("visibilitychange",this),this._autoReset=e)}get delta(){return this._delta*pr}get fixedDelta(){return this._fixedDelta*pr}set fixedDelta(e){this._fixedDelta=e*im}get elapsed(){return this._elapsed*pr}update(e){this.useFixedDelta?this._delta=this.fixedDelta:(this.previousTime=this.currentTime,this.currentTime=(e!==void 0?e:performance.now())-this.startTime,this._delta=this.currentTime-this.previousTime),this._delta*=this.timescale,this._elapsed+=this._delta}reset(){this._delta=0,this._elapsed=0,this.currentTime=performance.now()-this.startTime}getDelta(){return this.delta}getElapsed(){return this.elapsed}handleEvent(e){document.hidden||(this.currentTime=performance.now()-this.startTime)}dispose(){this.autoReset=!1}},rm=class{constructor(e=null,{depthBuffer:t=!0,stencilBuffer:a=!1,multisampling:s=0,frameBufferType:o=Nt}={}){this.renderer=null,this.inputBuffer=this.createBuffer(t,a,o,s),this.outputBuffer=this.inputBuffer.clone(),this.copyPass=new ph,this.depthRenderTarget=null,this.passes=[],this.timer=new nm,this.autoRenderToScreen=!0,this.setRenderer(e)}get stableDepthTexture(){return this.depthRenderTarget===null?null:this.depthRenderTarget.depthTexture}get multisampling(){return this.inputBuffer.samples}set multisampling(e){const t=this.renderer===null?e:om(this.renderer,e);this.multisampling!==t&&(this.inputBuffer.samples=t,this.outputBuffer.samples=t,this.inputBuffer.dispose(),this.outputBuffer.dispose())}getTimer(){return this.timer}getRenderer(){return this.renderer}setRenderer(e){if(this.renderer=e,e!==null){const t=e.getSize(new Le),a=e.getContext().getContextAttributes().alpha,s=this.inputBuffer.texture.type;s===Nt&&e.outputColorSpace===it&&(this.inputBuffer.texture.colorSpace=it,this.outputBuffer.texture.colorSpace=it,this.inputBuffer.dispose(),this.outputBuffer.dispose());const o=this.multisampling;this.multisampling=o,e.autoClear=!1,this.setSize(t.width,t.height);for(const i of this.passes)i.initialize(e,a,s)}}replaceRenderer(e,t=!0){const a=this.renderer,s=a.domElement.parentNode;return this.setRenderer(e),t&&s!==null&&(s.removeChild(a.domElement),s.appendChild(e.domElement)),a}createDepthTexture(){const e=new rr;e.name="EffectComposer.InputDepth",this.inputBuffer.stencilBuffer?(e.format=ed,e.type=td):e.type=jr;const t=new rr;t.format=e.format,t.type=e.type,t.name="EffectComposer.OutputDepth";const a=new rr;a.format=e.format,a.type=e.type,a.name="EffectComposer.StableDepth",this.inputBuffer.depthTexture=e,this.outputBuffer.depthTexture=t,this.inputBuffer.dispose(),this.outputBuffer.dispose();const{width:s,height:o}=this.inputBuffer;this.depthRenderTarget=new $t(s,o,{depthBuffer:!0,stencilBuffer:this.inputBuffer.stencilBuffer,depthTexture:a})}blitDepthBuffer(e){const t=this.renderer,a=this.depthRenderTarget,s=t.properties,o=t.getContext();t.setRenderTarget(a);const i=s.get(e).__webglFramebuffer,l=s.get(a).__webglFramebuffer,u=e.stencilBuffer?o.DEPTH_BUFFER_BIT|o.STENCIL_BUFFER_BIT:o.DEPTH_BUFFER_BIT;o.bindFramebuffer(o.READ_FRAMEBUFFER,i),o.bindFramebuffer(o.DRAW_FRAMEBUFFER,l),o.blitFramebuffer(0,0,e.width,e.height,0,0,a.width,a.height,u,o.NEAREST),o.bindFramebuffer(o.READ_FRAMEBUFFER,null),o.bindFramebuffer(o.DRAW_FRAMEBUFFER,null),t.setRenderTarget(null)}deleteDepthTexture(){const e=this.stableDepthTexture;for(const t of this.passes)t.getDepthTexture()===e&&t.setDepthTexture(null);this.depthRenderTarget!==null&&(this.depthRenderTarget.dispose(),this.depthRenderTarget=null),this.inputBuffer.depthTexture!==null&&(this.inputBuffer.depthTexture.dispose(),this.inputBuffer.depthTexture=null),this.outputBuffer.depthTexture!==null&&(this.outputBuffer.depthTexture.dispose(),this.outputBuffer.depthTexture=null)}createBuffer(e,t,a,s){const o=this.renderer,i=o===null?new Le:o.getDrawingBufferSize(new Le),l=new $t(i.width,i.height,{minFilter:ze,magFilter:ze,samples:s,stencilBuffer:t,depthBuffer:e,type:a});return a===Nt&&o!==null&&o.outputColorSpace===it&&(l.texture.colorSpace=it),l.texture.name="EffectComposer.Buffer",l.texture.generateMipmaps=!1,l}setMainScene(e){for(const t of this.passes)t.mainScene=e}setMainCamera(e){for(const t of this.passes)t.mainCamera=e}addPass(e,t){const a=this.passes,s=this.renderer,o=s.getDrawingBufferSize(new Le),i=s.getContext().getContextAttributes().alpha,l=this.inputBuffer.texture.type;if(e.renderer=s,e.setSize(o.width,o.height),e.initialize(s,i,l),this.autoRenderToScreen&&(a.length>0&&(a[a.length-1].renderToScreen=!1),e.renderToScreen&&(this.autoRenderToScreen=!1)),t!==void 0?a.splice(t,0,e):a.push(e),this.autoRenderToScreen&&(a[a.length-1].renderToScreen=!0),e.needsDepthTexture||this.depthRenderTarget!==null)if(this.depthRenderTarget===null){this.createDepthTexture();for(const u of a)u.setDepthTexture(this.stableDepthTexture)}else e.setDepthTexture(this.stableDepthTexture)}removePass(e){const t=this.passes,a=t.indexOf(e);if(a!==-1&&t.splice(a,1).length>0){const i=this.stableDepthTexture;if(i!==null){const l=(r,c)=>r||c.needsDepthTexture;t.reduce(l,!1)||(e.getDepthTexture()===i&&e.setDepthTexture(null),this.deleteDepthTexture())}this.autoRenderToScreen&&a===t.length&&(e.renderToScreen=!1,t.length>0&&(t[t.length-1].renderToScreen=!0))}}removeAllPasses(){const e=this.passes;this.deleteDepthTexture(),e.length>0&&(this.autoRenderToScreen&&(e[e.length-1].renderToScreen=!1),this.passes=[])}render(e){const t=this.renderer,a=this.copyPass;let s=this.inputBuffer,o=this.outputBuffer,i,l=!1;e===void 0&&(this.timer.update(),e=this.timer.getDelta());for(const u of this.passes)if(u.enabled){if(u.render(t,s,o,e,l),u.needsDepthBlit&&this.depthRenderTarget!==null&&this.blitDepthBuffer(s),u.needsSwap){if(l){a.renderToScreen=u.renderToScreen;const r=t.getContext(),c=t.state.buffers.stencil;c.setFunc(r.NOTEQUAL,1,4294967295),a.render(t,s,o,e,l),c.setFunc(r.EQUAL,1,4294967295)}i=s,s=o,o=i}u instanceof sm?l=!0:u instanceof tm&&(l=!1)}}setSize(e,t,a){const s=this.renderer,o=s.getSize(new Le);(e===void 0||t===void 0)&&(e=o.width,t=o.height),(o.width!==e||o.height!==t)&&s.setSize(e,t,a);const i=s.getDrawingBufferSize(new Le);this.inputBuffer.setSize(i.width,i.height),this.outputBuffer.setSize(i.width,i.height),this.depthRenderTarget!==null&&this.depthRenderTarget.setSize(i.width,i.height);for(const l of this.passes)l.setSize(i.width,i.height)}reset(){this.dispose(),this.autoRenderToScreen=!0}dispose(){for(const e of this.passes)e.dispose();this.deleteDepthTexture(),this.inputBuffer.dispose(),this.outputBuffer.dispose(),this.copyPass.dispose(),this.timer.dispose(),this.passes=[],da.fullscreenGeometry.dispose()}},Ls={NONE:0,DEPTH:1,CONVOLUTION:2},Ve={FRAGMENT_HEAD:"FRAGMENT_HEAD",FRAGMENT_MAIN_UV:"FRAGMENT_MAIN_UV",FRAGMENT_MAIN_IMAGE:"FRAGMENT_MAIN_IMAGE",VERTEX_HEAD:"VERTEX_HEAD",VERTEX_MAIN_SUPPORT:"VERTEX_MAIN_SUPPORT"},lm=class{constructor(){this.shaderParts=new Map([[Ve.FRAGMENT_HEAD,null],[Ve.FRAGMENT_MAIN_UV,null],[Ve.FRAGMENT_MAIN_IMAGE,null],[Ve.VERTEX_HEAD,null],[Ve.VERTEX_MAIN_SUPPORT,null]]),this.defines=new Map,this.uniforms=new Map,this.blendModes=new Map,this.extensions=new Set,this.attributes=Ls.NONE,this.varyings=new Set,this.uvTransformation=!1,this.readDepth=!1,this.colorSpace=Zu}},vr=!1,wu=class{constructor(e=null){this.originalMaterials=new Map,this.material=null,this.materials=null,this.materialsBackSide=null,this.materialsDoubleSide=null,this.materialsFlatShaded=null,this.materialsFlatShadedBackSide=null,this.materialsFlatShadedDoubleSide=null,this.setMaterial(e),this.meshCount=0,this.replaceMaterial=t=>{if(t.isMesh){let a;if(t.material.flatShading)switch(t.material.side){case Ps:a=this.materialsFlatShadedDoubleSide;break;case ao:a=this.materialsFlatShadedBackSide;break;default:a=this.materialsFlatShaded;break}else switch(t.material.side){case Ps:a=this.materialsDoubleSide;break;case ao:a=this.materialsBackSide;break;default:a=this.materials;break}this.originalMaterials.set(t,t.material),t.isSkinnedMesh?t.material=a[2]:t.isInstancedMesh?t.material=a[1]:t.material=a[0],++this.meshCount}}}cloneMaterial(e){if(!(e instanceof St))return e.clone();const t=e.uniforms,a=new Map;for(const o in t){const i=t[o].value;i.isRenderTargetTexture&&(t[o].value=null,a.set(o,i))}const s=e.clone();for(const o of a)t[o[0]].value=o[1],s.uniforms[o[0]].value=o[1];return s}setMaterial(e){if(this.disposeMaterials(),this.material=e,e!==null){const t=this.materials=[this.cloneMaterial(e),this.cloneMaterial(e),this.cloneMaterial(e)];for(const a of t)a.uniforms=Object.assign({},e.uniforms),a.side=ad;t[2].skinning=!0,this.materialsBackSide=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.side=ao,s}),this.materialsDoubleSide=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.side=Ps,s}),this.materialsFlatShaded=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.flatShading=!0,s}),this.materialsFlatShadedBackSide=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.flatShading=!0,s.side=ao,s}),this.materialsFlatShadedDoubleSide=t.map(a=>{const s=this.cloneMaterial(a);return s.uniforms=Object.assign({},e.uniforms),s.flatShading=!0,s.side=Ps,s})}}render(e,t,a){const s=e.shadowMap.enabled;if(e.shadowMap.enabled=!1,vr){const o=this.originalMaterials;this.meshCount=0,t.traverse(this.replaceMaterial),e.render(t,a);for(const i of o)i[0].material=i[1];this.meshCount!==o.size&&o.clear()}else{const o=t.overrideMaterial;t.overrideMaterial=this.material,e.render(t,a),t.overrideMaterial=o}e.shadowMap.enabled=s}disposeMaterials(){if(this.material!==null){const e=this.materials.concat(this.materialsBackSide).concat(this.materialsDoubleSide).concat(this.materialsFlatShaded).concat(this.materialsFlatShadedBackSide).concat(this.materialsFlatShadedDoubleSide);for(const t of e)t.dispose()}}dispose(){this.originalMaterials.clear(),this.disposeMaterials()}static get workaroundEnabled(){return vr}static set workaroundEnabled(e){vr=e}},ls=-1,Ca=class extends Zr{constructor(e=null,t=ls,a=ls,s=1){super(),e!==null&&this.addEventListener("change",()=>e.setSize(this.baseSize.width,this.baseSize.height)),this.baseSize=new Le(1,1),this.preferredSize=new Le(t,a),this.target=this.preferredSize,this.s=s,this.effectiveSize=new Le,this.addEventListener("change",()=>this.updateEffectiveSize()),this.updateEffectiveSize()}updateEffectiveSize(){const e=this.baseSize,t=this.preferredSize,a=this.effectiveSize,s=this.scale;t.width!==ls?a.width=t.width:t.height!==ls?a.width=Math.round(t.height*(e.width/Math.max(e.height,1))):a.width=Math.round(e.width*s),t.height!==ls?a.height=t.height:t.width!==ls?a.height=Math.round(t.width/Math.max(e.width/Math.max(e.height,1),1)):a.height=Math.round(e.height*s)}get width(){return this.effectiveSize.width}set width(e){this.preferredWidth=e}get height(){return this.effectiveSize.height}set height(e){this.preferredHeight=e}getWidth(){return this.width}getHeight(){return this.height}get scale(){return this.s}set scale(e){this.s!==e&&(this.s=e,this.preferredSize.setScalar(ls),this.dispatchEvent({type:"change"}))}getScale(){return this.scale}setScale(e){this.scale=e}get baseWidth(){return this.baseSize.width}set baseWidth(e){this.baseSize.width!==e&&(this.baseSize.width=e,this.dispatchEvent({type:"change"}))}getBaseWidth(){return this.baseWidth}setBaseWidth(e){this.baseWidth=e}get baseHeight(){return this.baseSize.height}set baseHeight(e){this.baseSize.height!==e&&(this.baseSize.height=e,this.dispatchEvent({type:"change"}))}getBaseHeight(){return this.baseHeight}setBaseHeight(e){this.baseHeight=e}setBaseSize(e,t){(this.baseSize.width!==e||this.baseSize.height!==t)&&(this.baseSize.set(e,t),this.dispatchEvent({type:"change"}))}get preferredWidth(){return this.preferredSize.width}set preferredWidth(e){this.preferredSize.width!==e&&(this.preferredSize.width=e,this.dispatchEvent({type:"change"}))}getPreferredWidth(){return this.preferredWidth}setPreferredWidth(e){this.preferredWidth=e}get preferredHeight(){return this.preferredSize.height}set preferredHeight(e){this.preferredSize.height!==e&&(this.preferredSize.height=e,this.dispatchEvent({type:"change"}))}getPreferredHeight(){return this.preferredHeight}setPreferredHeight(e){this.preferredHeight=e}setPreferredSize(e,t){(this.preferredSize.width!==e||this.preferredSize.height!==t)&&(this.preferredSize.set(e,t),this.dispatchEvent({type:"change"}))}copy(e){this.s=e.scale,this.baseSize.set(e.baseWidth,e.baseHeight),this.preferredSize.set(e.preferredWidth,e.preferredHeight),this.dispatchEvent({type:"change"})}static get AUTO_SIZE(){return ls}},Ie={ADD:0,ALPHA:1,AVERAGE:2,COLOR:3,COLOR_BURN:4,COLOR_DODGE:5,DARKEN:6,DIFFERENCE:7,DIVIDE:8,DST:9,EXCLUSION:10,HARD_LIGHT:11,HARD_MIX:12,HUE:13,INVERT:14,INVERT_RGB:15,LIGHTEN:16,LINEAR_BURN:17,LINEAR_DODGE:18,LINEAR_LIGHT:19,LUMINOSITY:20,MULTIPLY:21,NEGATION:22,NORMAL:23,OVERLAY:24,PIN_LIGHT:25,REFLECT:26,SATURATION:27,SCREEN:28,SOFT_LIGHT:29,SRC:30,SUBTRACT:31,VIVID_LIGHT:32},cm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb+src.rgb;return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",um="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){return mix(dst,src,src.a*opacity);}",hm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=(dst.rgb+src.rgb)*0.5;return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",dm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=RGBToHSL(dst.rgb);vec3 b=RGBToHSL(src.rgb);vec3 c=HSLToRGB(vec3(b.xy,a.z));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",fm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=dst.rgb,b=src.rgb;vec3 c=mix(step(0.0,b)*(1.0-min(vec3(1.0),(1.0-a)/max(b,1e-9))),vec3(1.0),step(1.0,a));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",mm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=dst.rgb,b=src.rgb;vec3 c=step(0.0,a)*mix(min(vec3(1.0),a/max(1.0-b,1e-9)),vec3(1.0),step(1.0,b));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",pm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=min(dst.rgb,src.rgb);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",vm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=abs(dst.rgb-src.rgb);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",gm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb/max(src.rgb,1e-9);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",xm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb+src.rgb-2.0*dst.rgb*src.rgb;return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",wm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=min(dst.rgb,1.0);vec3 b=min(src.rgb,1.0);vec3 c=mix(2.0*a*b,1.0-2.0*(1.0-a)*(1.0-b),step(0.5,b));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Mm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=step(1.0,dst.rgb+src.rgb);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",ym="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=RGBToHSL(dst.rgb);vec3 b=RGBToHSL(src.rgb);vec3 c=HSLToRGB(vec3(b.x,a.yz));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",bm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=max(1.0-src.rgb,0.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Sm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=src.rgb*max(1.0-dst.rgb,0.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Tm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=max(dst.rgb,src.rgb);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Em="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=clamp(src.rgb+dst.rgb-1.0,0.0,1.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Rm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=min(dst.rgb+src.rgb,1.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Am="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=clamp(2.0*src.rgb+dst.rgb-1.0,0.0,1.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",km="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=RGBToHSL(dst.rgb);vec3 b=RGBToHSL(src.rgb);vec3 c=HSLToRGB(vec3(a.xy,b.z));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",_m="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb*src.rgb;return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Fm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=max(1.0-abs(1.0-dst.rgb-src.rgb),0.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Dm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){return mix(dst,src,opacity);}",Pm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=2.0*src.rgb*dst.rgb;vec3 b=1.0-2.0*(1.0-src.rgb)*(1.0-dst.rgb);vec3 c=mix(a,b,step(0.5,dst.rgb));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Im="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 src2=2.0*src.rgb;vec3 c=mix(mix(src2,dst.rgb,step(0.5*dst.rgb,src.rgb)),max(src2-1.0,vec3(0.0)),step(dst.rgb,src2-1.0));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Cm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=min(dst.rgb*dst.rgb/max(1.0-src.rgb,1e-9),1.0);vec3 c=mix(a,src.rgb,step(1.0,src.rgb));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Lm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 a=RGBToHSL(dst.rgb);vec3 b=RGBToHSL(src.rgb);vec3 c=HSLToRGB(vec3(a.x,b.y,a.z));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Nm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=dst.rgb+src.rgb-min(dst.rgb*src.rgb,1.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",zm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 src2=2.0*src.rgb;vec3 d=dst.rgb+(src2-1.0);vec3 w=step(0.5,src.rgb);vec3 a=dst.rgb-(1.0-src2)*dst.rgb*(1.0-dst.rgb);vec3 b=mix(d*(sqrt(dst.rgb)-dst.rgb),d*dst.rgb*((16.0*dst.rgb-12.0)*dst.rgb+3.0),w*(1.0-step(0.25,dst.rgb)));vec3 c=mix(a,b,w);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Um="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){return src;}",Bm="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=max(dst.rgb-src.rgb,0.0);return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Om="vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){vec3 c=mix(max(1.0-min((1.0-dst.rgb)/(2.0*src.rgb),1.0),0.0),min(dst.rgb/(2.0*(1.0-src.rgb)),1.0),step(0.5,src.rgb));return mix(dst,vec4(c,max(dst.a,src.a)),opacity);}",Hm=new Map([[Ie.ADD,cm],[Ie.ALPHA,um],[Ie.AVERAGE,hm],[Ie.COLOR,dm],[Ie.COLOR_BURN,fm],[Ie.COLOR_DODGE,mm],[Ie.DARKEN,pm],[Ie.DIFFERENCE,vm],[Ie.DIVIDE,gm],[Ie.DST,null],[Ie.EXCLUSION,xm],[Ie.HARD_LIGHT,wm],[Ie.HARD_MIX,Mm],[Ie.HUE,ym],[Ie.INVERT,bm],[Ie.INVERT_RGB,Sm],[Ie.LIGHTEN,Tm],[Ie.LINEAR_BURN,Em],[Ie.LINEAR_DODGE,Rm],[Ie.LINEAR_LIGHT,Am],[Ie.LUMINOSITY,km],[Ie.MULTIPLY,_m],[Ie.NEGATION,Fm],[Ie.NORMAL,Dm],[Ie.OVERLAY,Pm],[Ie.PIN_LIGHT,Im],[Ie.REFLECT,Cm],[Ie.SATURATION,Lm],[Ie.SCREEN,Nm],[Ie.SOFT_LIGHT,zm],[Ie.SRC,Um],[Ie.SUBTRACT,Bm],[Ie.VIVID_LIGHT,Om]]),Gm=class extends Zr{constructor(e,t=1){super(),this._blendFunction=e,this.opacity=new Pe(t)}getOpacity(){return this.opacity.value}setOpacity(e){this.opacity.value=e}get blendFunction(){return this._blendFunction}set blendFunction(e){this._blendFunction=e,this.dispatchEvent({type:"change"})}getBlendFunction(){return this.blendFunction}setBlendFunction(e){this.blendFunction=e}getShaderCode(){return Hm.get(this.blendFunction)}},gh=class extends Zr{constructor(e,t,{attributes:a=Ls.NONE,blendFunction:s=Ie.NORMAL,defines:o=new Map,uniforms:i=new Map,extensions:l=null,vertexShader:u=null}={}){super(),this.name=e,this.renderer=null,this.attributes=a,this.fragmentShader=t,this.vertexShader=u,this.defines=o,this.uniforms=i,this.extensions=l,this.blendMode=new Gm(s),this.blendMode.addEventListener("change",r=>this.setChanged()),this._inputColorSpace=Zu,this._outputColorSpace=Na}get inputColorSpace(){return this._inputColorSpace}set inputColorSpace(e){this._inputColorSpace=e,this.setChanged()}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e,this.setChanged()}set mainScene(e){}set mainCamera(e){}getName(){return this.name}setRenderer(e){this.renderer=e}getDefines(){return this.defines}getUniforms(){return this.uniforms}getExtensions(){return this.extensions}getBlendMode(){return this.blendMode}getAttributes(){return this.attributes}setAttributes(e){this.attributes=e,this.setChanged()}getFragmentShader(){return this.fragmentShader}setFragmentShader(e){this.fragmentShader=e,this.setChanged()}getVertexShader(){return this.vertexShader}setVertexShader(e){this.vertexShader=e,this.setChanged()}setChanged(){this.dispatchEvent({type:"change"})}setDepthTexture(e,t=en){}update(e,t,a){}setSize(e,t){}initialize(e,t,a){}dispose(){for(const e of Object.keys(this)){const t=this[e];(t instanceof $t||t instanceof Qu||t instanceof qr||t instanceof da)&&this[e].dispose()}}},sl={MEDIUM:2,LARGE:3},Km=`#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D inputBuffer;
#else
uniform lowp sampler2D inputBuffer;
#endif
varying vec2 vUv0;varying vec2 vUv1;varying vec2 vUv2;varying vec2 vUv3;void main(){vec4 sum=texture2D(inputBuffer,vUv0);sum+=texture2D(inputBuffer,vUv1);sum+=texture2D(inputBuffer,vUv2);sum+=texture2D(inputBuffer,vUv3);gl_FragColor=sum*0.25;
#include <colorspace_fragment>
}`,Wm="uniform vec4 texelSize;uniform float kernel;uniform float scale;varying vec2 vUv0;varying vec2 vUv1;varying vec2 vUv2;varying vec2 vUv3;void main(){vec2 uv=position.xy*0.5+0.5;vec2 dUv=(texelSize.xy*vec2(kernel)+texelSize.zw)*scale;vUv0=vec2(uv.x-dUv.x,uv.y+dUv.y);vUv1=vec2(uv.x+dUv.x,uv.y+dUv.y);vUv2=vec2(uv.x+dUv.x,uv.y-dUv.y);vUv3=vec2(uv.x-dUv.x,uv.y-dUv.y);gl_Position=vec4(position.xy,1.0,1.0);}",Vm=[new Float32Array([0,0]),new Float32Array([0,1,1]),new Float32Array([0,1,1,2]),new Float32Array([0,1,2,2,3]),new Float32Array([0,1,2,3,4,4,5]),new Float32Array([0,1,2,3,4,5,7,8,9,10])],Ym=class extends St{constructor(e=new ca){super({name:"KawaseBlurMaterial",uniforms:{inputBuffer:new Pe(null),texelSize:new Pe(new ca),scale:new Pe(1),kernel:new Pe(0)},blending:Ns,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:Km,vertexShader:Wm}),this.setTexelSize(e.x,e.y),this.kernelSize=sl.MEDIUM}set inputBuffer(e){this.uniforms.inputBuffer.value=e}setInputBuffer(e){this.inputBuffer=e}get kernelSequence(){return Vm[this.kernelSize]}get scale(){return this.uniforms.scale.value}set scale(e){this.uniforms.scale.value=e}getScale(){return this.uniforms.scale.value}setScale(e){this.uniforms.scale.value=e}getKernel(){return null}get kernel(){return this.uniforms.kernel.value}set kernel(e){this.uniforms.kernel.value=e}setKernel(e){this.kernel=e}setTexelSize(e,t){this.uniforms.texelSize.value.set(e,t,e*.5,t*.5)}setSize(e,t){const a=1/e,s=1/t;this.uniforms.texelSize.value.set(a,s,a*.5,s*.5)}},$m=class extends da{constructor({kernelSize:e=sl.MEDIUM,resolutionScale:t=.5,width:a=Ca.AUTO_SIZE,height:s=Ca.AUTO_SIZE,resolutionX:o=a,resolutionY:i=s}={}){super("KawaseBlurPass"),this.renderTargetA=new $t(1,1,{depthBuffer:!1}),this.renderTargetA.texture.name="Blur.Target.A",this.renderTargetB=this.renderTargetA.clone(),this.renderTargetB.texture.name="Blur.Target.B";const l=this.resolution=new Ca(this,o,i,t);l.addEventListener("change",u=>this.setSize(l.baseWidth,l.baseHeight)),this._blurMaterial=new Ym,this._blurMaterial.kernelSize=e,this.copyMaterial=new mh}getResolution(){return this.resolution}get blurMaterial(){return this._blurMaterial}set blurMaterial(e){this._blurMaterial=e}get dithering(){return this.copyMaterial.dithering}set dithering(e){this.copyMaterial.dithering=e}get kernelSize(){return this.blurMaterial.kernelSize}set kernelSize(e){this.blurMaterial.kernelSize=e}get width(){return this.resolution.width}set width(e){this.resolution.preferredWidth=e}get height(){return this.resolution.height}set height(e){this.resolution.preferredHeight=e}get scale(){return this.blurMaterial.scale}set scale(e){this.blurMaterial.scale=e}getScale(){return this.blurMaterial.scale}setScale(e){this.blurMaterial.scale=e}getKernelSize(){return this.kernelSize}setKernelSize(e){this.kernelSize=e}getResolutionScale(){return this.resolution.scale}setResolutionScale(e){this.resolution.scale=e}render(e,t,a,s,o){const i=this.scene,l=this.camera,u=this.renderTargetA,r=this.renderTargetB,c=this.blurMaterial,h=c.kernelSequence;let p=t;this.fullscreenMaterial=c;for(let M=0,y=h.length;M<y;++M){const g=(M&1)===0?u:r;c.kernel=h[M],c.inputBuffer=p.texture,e.setRenderTarget(g),e.render(i,l),p=g}this.fullscreenMaterial=this.copyMaterial,this.copyMaterial.inputBuffer=p.texture,e.setRenderTarget(this.renderToScreen?null:a),e.render(i,l)}setSize(e,t){const a=this.resolution;a.setBaseSize(e,t);const s=a.width,o=a.height;this.renderTargetA.setSize(s,o),this.renderTargetB.setSize(s,o),this.blurMaterial.setSize(e,t)}initialize(e,t,a){a!==void 0&&(this.renderTargetA.texture.type=a,this.renderTargetB.texture.type=a,a!==Nt?(this.blurMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1",this.copyMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1"):e!==null&&e.outputColorSpace===it&&(this.renderTargetA.texture.colorSpace=it,this.renderTargetB.texture.colorSpace=it))}static get AUTO_SIZE(){return Ca.AUTO_SIZE}},Xm=`#include <common>
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
}`,jm=class extends St{constructor(e=!1,t=null){super({name:"LuminanceMaterial",defines:{THREE_REVISION:Qr.replace(/\D+/g,"")},uniforms:{inputBuffer:new Pe(null),threshold:new Pe(0),smoothing:new Pe(1),range:new Pe(null)},blending:Ns,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:Xm,vertexShader:al}),this.colorOutput=e,this.luminanceRange=t}set inputBuffer(e){this.uniforms.inputBuffer.value=e}setInputBuffer(e){this.uniforms.inputBuffer.value=e}get threshold(){return this.uniforms.threshold.value}set threshold(e){this.smoothing>0||e>0?this.defines.THRESHOLD="1":delete this.defines.THRESHOLD,this.uniforms.threshold.value=e}getThreshold(){return this.threshold}setThreshold(e){this.threshold=e}get smoothing(){return this.uniforms.smoothing.value}set smoothing(e){this.threshold>0||e>0?this.defines.THRESHOLD="1":delete this.defines.THRESHOLD,this.uniforms.smoothing.value=e}getSmoothingFactor(){return this.smoothing}setSmoothingFactor(e){this.smoothing=e}get useThreshold(){return this.threshold>0||this.smoothing>0}set useThreshold(e){}get colorOutput(){return this.defines.COLOR!==void 0}set colorOutput(e){e?this.defines.COLOR="1":delete this.defines.COLOR,this.needsUpdate=!0}isColorOutputEnabled(e){return this.colorOutput}setColorOutputEnabled(e){this.colorOutput=e}get useRange(){return this.luminanceRange!==null}set useRange(e){this.luminanceRange=null}get luminanceRange(){return this.uniforms.range.value}set luminanceRange(e){e!==null?this.defines.RANGE="1":delete this.defines.RANGE,this.uniforms.range.value=e,this.needsUpdate=!0}getLuminanceRange(){return this.luminanceRange}setLuminanceRange(e){this.luminanceRange=e}},xh=class extends da{constructor({renderTarget:e,luminanceRange:t,colorOutput:a,resolutionScale:s=1,width:o=Ca.AUTO_SIZE,height:i=Ca.AUTO_SIZE,resolutionX:l=o,resolutionY:u=i}={}){super("LuminancePass"),this.fullscreenMaterial=new jm(a,t),this.needsSwap=!1,this.renderTarget=e,this.renderTarget===void 0&&(this.renderTarget=new $t(1,1,{depthBuffer:!1}),this.renderTarget.texture.name="LuminancePass.Target");const r=this.resolution=new Ca(this,l,u,s);r.addEventListener("change",c=>this.setSize(r.baseWidth,r.baseHeight))}get texture(){return this.renderTarget.texture}getTexture(){return this.renderTarget.texture}getResolution(){return this.resolution}render(e,t,a,s,o){const i=this.fullscreenMaterial;i.inputBuffer=t.texture,e.setRenderTarget(this.renderToScreen?null:this.renderTarget),e.render(this.scene,this.camera)}setSize(e,t){const a=this.resolution;a.setBaseSize(e,t),this.renderTarget.setSize(a.width,a.height)}initialize(e,t,a){a!==void 0&&a!==Nt&&(this.renderTarget.texture.type=a,this.fullscreenMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1")}},qm=`#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D inputBuffer;
#else
uniform lowp sampler2D inputBuffer;
#endif
#define WEIGHT_INNER 0.125
#define WEIGHT_OUTER 0.05556
varying vec2 vUv;varying vec2 vUv00;varying vec2 vUv01;varying vec2 vUv02;varying vec2 vUv03;varying vec2 vUv04;varying vec2 vUv05;varying vec2 vUv06;varying vec2 vUv07;varying vec2 vUv08;varying vec2 vUv09;varying vec2 vUv10;varying vec2 vUv11;float clampToBorder(const in vec2 uv){return float(uv.s>=0.0&&uv.s<=1.0&&uv.t>=0.0&&uv.t<=1.0);}void main(){vec4 c=vec4(0.0);vec4 w=WEIGHT_INNER*vec4(clampToBorder(vUv00),clampToBorder(vUv01),clampToBorder(vUv02),clampToBorder(vUv03));c+=w.x*texture2D(inputBuffer,vUv00);c+=w.y*texture2D(inputBuffer,vUv01);c+=w.z*texture2D(inputBuffer,vUv02);c+=w.w*texture2D(inputBuffer,vUv03);w=WEIGHT_OUTER*vec4(clampToBorder(vUv04),clampToBorder(vUv05),clampToBorder(vUv06),clampToBorder(vUv07));c+=w.x*texture2D(inputBuffer,vUv04);c+=w.y*texture2D(inputBuffer,vUv05);c+=w.z*texture2D(inputBuffer,vUv06);c+=w.w*texture2D(inputBuffer,vUv07);w=WEIGHT_OUTER*vec4(clampToBorder(vUv08),clampToBorder(vUv09),clampToBorder(vUv10),clampToBorder(vUv11));c+=w.x*texture2D(inputBuffer,vUv08);c+=w.y*texture2D(inputBuffer,vUv09);c+=w.z*texture2D(inputBuffer,vUv10);c+=w.w*texture2D(inputBuffer,vUv11);c+=WEIGHT_OUTER*texture2D(inputBuffer,vUv);gl_FragColor=c;
#include <colorspace_fragment>
}`,Zm="uniform vec2 texelSize;varying vec2 vUv;varying vec2 vUv00;varying vec2 vUv01;varying vec2 vUv02;varying vec2 vUv03;varying vec2 vUv04;varying vec2 vUv05;varying vec2 vUv06;varying vec2 vUv07;varying vec2 vUv08;varying vec2 vUv09;varying vec2 vUv10;varying vec2 vUv11;void main(){vUv=position.xy*0.5+0.5;vUv00=vUv+texelSize*vec2(-1.0,1.0);vUv01=vUv+texelSize*vec2(1.0,1.0);vUv02=vUv+texelSize*vec2(-1.0,-1.0);vUv03=vUv+texelSize*vec2(1.0,-1.0);vUv04=vUv+texelSize*vec2(-2.0,2.0);vUv05=vUv+texelSize*vec2(0.0,2.0);vUv06=vUv+texelSize*vec2(2.0,2.0);vUv07=vUv+texelSize*vec2(-2.0,0.0);vUv08=vUv+texelSize*vec2(2.0,0.0);vUv09=vUv+texelSize*vec2(-2.0,-2.0);vUv10=vUv+texelSize*vec2(0.0,-2.0);vUv11=vUv+texelSize*vec2(2.0,-2.0);gl_Position=vec4(position.xy,1.0,1.0);}",Qm=class extends St{constructor(){super({name:"DownsamplingMaterial",uniforms:{inputBuffer:new Pe(null),texelSize:new Pe(new Le)},blending:Ns,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:qm,vertexShader:Zm})}set inputBuffer(e){this.uniforms.inputBuffer.value=e}setSize(e,t){this.uniforms.texelSize.value.set(1/e,1/t)}},Jm=`#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D inputBuffer;uniform mediump sampler2D supportBuffer;
#else
uniform lowp sampler2D inputBuffer;uniform lowp sampler2D supportBuffer;
#endif
uniform float radius;varying vec2 vUv;varying vec2 vUv0;varying vec2 vUv1;varying vec2 vUv2;varying vec2 vUv3;varying vec2 vUv4;varying vec2 vUv5;varying vec2 vUv6;varying vec2 vUv7;void main(){vec4 c=vec4(0.0);c+=texture2D(inputBuffer,vUv0)*0.0625;c+=texture2D(inputBuffer,vUv1)*0.125;c+=texture2D(inputBuffer,vUv2)*0.0625;c+=texture2D(inputBuffer,vUv3)*0.125;c+=texture2D(inputBuffer,vUv)*0.25;c+=texture2D(inputBuffer,vUv4)*0.125;c+=texture2D(inputBuffer,vUv5)*0.0625;c+=texture2D(inputBuffer,vUv6)*0.125;c+=texture2D(inputBuffer,vUv7)*0.0625;vec4 baseColor=texture2D(supportBuffer,vUv);gl_FragColor=mix(baseColor,c,radius);
#include <colorspace_fragment>
}`,e0="uniform vec2 texelSize;varying vec2 vUv;varying vec2 vUv0;varying vec2 vUv1;varying vec2 vUv2;varying vec2 vUv3;varying vec2 vUv4;varying vec2 vUv5;varying vec2 vUv6;varying vec2 vUv7;void main(){vUv=position.xy*0.5+0.5;vUv0=vUv+texelSize*vec2(-1.0,1.0);vUv1=vUv+texelSize*vec2(0.0,1.0);vUv2=vUv+texelSize*vec2(1.0,1.0);vUv3=vUv+texelSize*vec2(-1.0,0.0);vUv4=vUv+texelSize*vec2(1.0,0.0);vUv5=vUv+texelSize*vec2(-1.0,-1.0);vUv6=vUv+texelSize*vec2(0.0,-1.0);vUv7=vUv+texelSize*vec2(1.0,-1.0);gl_Position=vec4(position.xy,1.0,1.0);}",t0=class extends St{constructor(){super({name:"UpsamplingMaterial",uniforms:{inputBuffer:new Pe(null),supportBuffer:new Pe(null),texelSize:new Pe(new Le),radius:new Pe(.85)},blending:Ns,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:Jm,vertexShader:e0})}set inputBuffer(e){this.uniforms.inputBuffer.value=e}set supportBuffer(e){this.uniforms.supportBuffer.value=e}get radius(){return this.uniforms.radius.value}set radius(e){this.uniforms.radius.value=e}setSize(e,t){this.uniforms.texelSize.value.set(1/e,1/t)}},a0=class extends da{constructor(){super("MipmapBlurPass"),this.needsSwap=!1,this.renderTarget=new $t(1,1,{depthBuffer:!1}),this.renderTarget.texture.name="Upsampling.Mipmap0",this.downsamplingMipmaps=[],this.upsamplingMipmaps=[],this.downsamplingMaterial=new Qm,this.upsamplingMaterial=new t0,this.resolution=new Le}get texture(){return this.renderTarget.texture}get levels(){return this.downsamplingMipmaps.length}set levels(e){if(this.levels!==e){const t=this.renderTarget;this.dispose(),this.downsamplingMipmaps=[],this.upsamplingMipmaps=[];for(let a=0;a<e;++a){const s=t.clone();s.texture.name="Downsampling.Mipmap"+a,this.downsamplingMipmaps.push(s)}this.upsamplingMipmaps.push(t);for(let a=1,s=e-1;a<s;++a){const o=t.clone();o.texture.name="Upsampling.Mipmap"+a,this.upsamplingMipmaps.push(o)}this.setSize(this.resolution.x,this.resolution.y)}}get radius(){return this.upsamplingMaterial.radius}set radius(e){this.upsamplingMaterial.radius=e}render(e,t,a,s,o){const{scene:i,camera:l}=this,{downsamplingMaterial:u,upsamplingMaterial:r}=this,{downsamplingMipmaps:c,upsamplingMipmaps:h}=this;let p=t;this.fullscreenMaterial=u;for(let M=0,y=c.length;M<y;++M){const g=c[M];u.setSize(p.width,p.height),u.inputBuffer=p.texture,e.setRenderTarget(g),e.render(i,l),p=g}this.fullscreenMaterial=r;for(let M=h.length-1;M>=0;--M){const y=h[M];r.setSize(p.width,p.height),r.inputBuffer=p.texture,r.supportBuffer=c[M].texture,e.setRenderTarget(y),e.render(i,l),p=y}}setSize(e,t){const a=this.resolution;a.set(e,t);let s=a.width,o=a.height;for(let i=0,l=this.downsamplingMipmaps.length;i<l;++i)s=Math.round(s*.5),o=Math.round(o*.5),this.downsamplingMipmaps[i].setSize(s,o),i<this.upsamplingMipmaps.length&&this.upsamplingMipmaps[i].setSize(s,o)}initialize(e,t,a){if(a!==void 0){const s=this.downsamplingMipmaps.concat(this.upsamplingMipmaps);for(const o of s)o.texture.type=a;if(a!==Nt)this.downsamplingMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1",this.upsamplingMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1";else if(e!==null&&e.outputColorSpace===it)for(const o of s)o.texture.colorSpace=it}}dispose(){super.dispose();for(const e of this.downsamplingMipmaps.concat(this.upsamplingMipmaps))e.dispose()}},s0=`#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2D map;
#else
uniform lowp sampler2D map;
#endif
uniform float intensity;void mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor){outputColor=texture2D(map,uv)*intensity;}`,o0=class extends gh{constructor({blendFunction:e=Ie.SCREEN,luminanceThreshold:t=1,luminanceSmoothing:a=.03,mipmapBlur:s=!0,intensity:o=1,radius:i=.85,levels:l=8,kernelSize:u=sl.LARGE,resolutionScale:r=.5,width:c=Ca.AUTO_SIZE,height:h=Ca.AUTO_SIZE,resolutionX:p=c,resolutionY:M=h}={}){super("BloomEffect",s0,{blendFunction:e,uniforms:new Map([["map",new Pe(null)],["intensity",new Pe(o)]])}),this.renderTarget=new $t(1,1,{depthBuffer:!1}),this.renderTarget.texture.name="Bloom.Target",this.blurPass=new $m({kernelSize:u}),this.luminancePass=new xh({colorOutput:!0}),this.luminanceMaterial.threshold=t,this.luminanceMaterial.smoothing=a,this.mipmapBlurPass=new a0,this.mipmapBlurPass.enabled=s,this.mipmapBlurPass.radius=i,this.mipmapBlurPass.levels=l,this.uniforms.get("map").value=s?this.mipmapBlurPass.texture:this.renderTarget.texture;const y=this.resolution=new Ca(this,p,M,r);y.addEventListener("change",g=>this.setSize(y.baseWidth,y.baseHeight))}get texture(){return this.mipmapBlurPass.enabled?this.mipmapBlurPass.texture:this.renderTarget.texture}getTexture(){return this.texture}getResolution(){return this.resolution}getBlurPass(){return this.blurPass}getLuminancePass(){return this.luminancePass}get luminanceMaterial(){return this.luminancePass.fullscreenMaterial}getLuminanceMaterial(){return this.luminancePass.fullscreenMaterial}get width(){return this.resolution.width}set width(e){this.resolution.preferredWidth=e}get height(){return this.resolution.height}set height(e){this.resolution.preferredHeight=e}get dithering(){return this.blurPass.dithering}set dithering(e){this.blurPass.dithering=e}get kernelSize(){return this.blurPass.kernelSize}set kernelSize(e){this.blurPass.kernelSize=e}get distinction(){return console.warn(this.name,"distinction was removed"),1}set distinction(e){console.warn(this.name,"distinction was removed")}get intensity(){return this.uniforms.get("intensity").value}set intensity(e){this.uniforms.get("intensity").value=e}getIntensity(){return this.intensity}setIntensity(e){this.intensity=e}getResolutionScale(){return this.resolution.scale}setResolutionScale(e){this.resolution.scale=e}update(e,t,a){const s=this.renderTarget,o=this.luminancePass;o.enabled?(o.render(e,t),this.mipmapBlurPass.enabled?this.mipmapBlurPass.render(e,o.renderTarget):this.blurPass.render(e,o.renderTarget,s)):this.mipmapBlurPass.enabled?this.mipmapBlurPass.render(e,t):this.blurPass.render(e,t,s)}setSize(e,t){const a=this.resolution;a.setBaseSize(e,t),this.renderTarget.setSize(a.width,a.height),this.blurPass.resolution.copy(a),this.luminancePass.setSize(e,t),this.mipmapBlurPass.setSize(e,t)}initialize(e,t,a){this.blurPass.initialize(e,t,a),this.luminancePass.initialize(e,t,a),this.mipmapBlurPass.initialize(e,t,a),a!==void 0&&(this.renderTarget.texture.type=a,e!==null&&e.outputColorSpace===it&&(this.renderTarget.texture.colorSpace=it))}},i0=class extends da{constructor(e,t,a=null){super("RenderPass",e,t),this.needsSwap=!1,this.needsDepthBlit=!0,this.clearPass=new vh,this.overrideMaterialManager=a===null?null:new wu(a),this.ignoreBackground=!1,this.skipShadowMapUpdate=!1,this.selection=null}set mainScene(e){this.scene=e}set mainCamera(e){this.camera=e}get renderToScreen(){return super.renderToScreen}set renderToScreen(e){super.renderToScreen=e,this.clearPass.renderToScreen=e}get overrideMaterial(){const e=this.overrideMaterialManager;return e!==null?e.material:null}set overrideMaterial(e){const t=this.overrideMaterialManager;e!==null?t!==null?t.setMaterial(e):this.overrideMaterialManager=new wu(e):t!==null&&(t.dispose(),this.overrideMaterialManager=null)}getOverrideMaterial(){return this.overrideMaterial}setOverrideMaterial(e){this.overrideMaterial=e}get clear(){return this.clearPass.enabled}set clear(e){this.clearPass.enabled=e}getSelection(){return this.selection}setSelection(e){this.selection=e}isBackgroundDisabled(){return this.ignoreBackground}setBackgroundDisabled(e){this.ignoreBackground=e}isShadowMapDisabled(){return this.skipShadowMapUpdate}setShadowMapDisabled(e){this.skipShadowMapUpdate=e}getClearPass(){return this.clearPass}render(e,t,a,s,o){const i=this.scene,l=this.camera,u=this.selection,r=l.layers.mask,c=i.background,h=e.shadowMap.autoUpdate,p=this.renderToScreen?null:t;u!==null&&l.layers.set(u.getLayer()),this.skipShadowMapUpdate&&(e.shadowMap.autoUpdate=!1),(this.ignoreBackground||this.clearPass.overrideClearColor!==null)&&(i.background=null),this.clearPass.enabled&&this.clearPass.render(e,t),e.setRenderTarget(p),this.overrideMaterialManager!==null?this.overrideMaterialManager.render(e,i,l):e.render(i,l),l.layers.mask=r,i.background=c,e.shadowMap.autoUpdate=h}},oa={LINEAR:0,REINHARD:1,REINHARD2:2,REINHARD2_ADAPTIVE:3,OPTIMIZED_CINEON:5,CINEON:5,ACES_FILMIC:6,AGX:7,NEUTRAL:8},n0=`#include <packing>
#define packFloatToRGBA(v) packDepthToRGBA(v)
#define unpackRGBAToFloat(v) unpackRGBAToDepth(v)
uniform lowp sampler2D luminanceBuffer0;uniform lowp sampler2D luminanceBuffer1;uniform float minLuminance;uniform float deltaTime;uniform float tau;varying vec2 vUv;void main(){float l0=unpackRGBAToFloat(texture2D(luminanceBuffer0,vUv));
#if __VERSION__ < 300
float l1=texture2DLodEXT(luminanceBuffer1,vUv,MIP_LEVEL_1X1).r;
#else
float l1=textureLod(luminanceBuffer1,vUv,MIP_LEVEL_1X1).r;
#endif
l0=max(minLuminance,l0);l1=max(minLuminance,l1);float adaptedLum=l0+(l1-l0)*(1.0-exp(-deltaTime*tau));gl_FragColor=(adaptedLum==1.0)?vec4(1.0):packFloatToRGBA(adaptedLum);}`,r0=class extends St{constructor(){super({name:"AdaptiveLuminanceMaterial",defines:{MIP_LEVEL_1X1:"0.0"},uniforms:{luminanceBuffer0:new Pe(null),luminanceBuffer1:new Pe(null),minLuminance:new Pe(.01),deltaTime:new Pe(0),tau:new Pe(1)},extensions:{shaderTextureLOD:!0},blending:Ns,toneMapped:!1,depthWrite:!1,depthTest:!1,fragmentShader:n0,vertexShader:al})}set luminanceBuffer0(e){this.uniforms.luminanceBuffer0.value=e}setLuminanceBuffer0(e){this.uniforms.luminanceBuffer0.value=e}set luminanceBuffer1(e){this.uniforms.luminanceBuffer1.value=e}setLuminanceBuffer1(e){this.uniforms.luminanceBuffer1.value=e}set mipLevel1x1(e){this.defines.MIP_LEVEL_1X1=e.toFixed(1),this.needsUpdate=!0}setMipLevel1x1(e){this.mipLevel1x1=e}set deltaTime(e){this.uniforms.deltaTime.value=e}setDeltaTime(e){this.uniforms.deltaTime.value=e}get minLuminance(){return this.uniforms.minLuminance.value}set minLuminance(e){this.uniforms.minLuminance.value=e}getMinLuminance(){return this.uniforms.minLuminance.value}setMinLuminance(e){this.uniforms.minLuminance.value=e}get adaptationRate(){return this.uniforms.tau.value}set adaptationRate(e){this.uniforms.tau.value=e}getAdaptationRate(){return this.uniforms.tau.value}setAdaptationRate(e){this.uniforms.tau.value=e}},l0=class extends da{constructor(e,{minLuminance:t=.01,adaptationRate:a=1}={}){super("AdaptiveLuminancePass"),this.fullscreenMaterial=new r0,this.needsSwap=!1,this.renderTargetPrevious=new $t(1,1,{minFilter:po,magFilter:po,depthBuffer:!1}),this.renderTargetPrevious.texture.name="Luminance.Previous";const s=this.fullscreenMaterial;s.luminanceBuffer0=this.renderTargetPrevious.texture,s.luminanceBuffer1=e,s.minLuminance=t,s.adaptationRate=a,this.renderTargetAdapted=this.renderTargetPrevious.clone(),this.renderTargetAdapted.texture.name="Luminance.Adapted",this.copyPass=new ph(this.renderTargetPrevious,!1)}get texture(){return this.renderTargetAdapted.texture}getTexture(){return this.renderTargetAdapted.texture}set mipLevel1x1(e){this.fullscreenMaterial.mipLevel1x1=e}get adaptationRate(){return this.fullscreenMaterial.adaptationRate}set adaptationRate(e){this.fullscreenMaterial.adaptationRate=e}render(e,t,a,s,o){this.fullscreenMaterial.deltaTime=s,e.setRenderTarget(this.renderToScreen?null:this.renderTargetAdapted),e.render(this.scene,this.camera),this.copyPass.render(e,this.renderTargetAdapted)}},c0=`#include <tonemapping_pars_fragment>
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
}`,u0=class extends gh{constructor({blendFunction:e=Ie.SRC,adaptive:t=!1,mode:a=t?oa.REINHARD2_ADAPTIVE:oa.AGX,resolution:s=256,maxLuminance:o=4,whitePoint:i=o,middleGrey:l=.6,minLuminance:u=.01,averageLuminance:r=1,adaptationRate:c=1}={}){super("ToneMappingEffect",c0,{blendFunction:e,uniforms:new Map([["luminanceBuffer",new Pe(null)],["maxLuminance",new Pe(o)],["whitePoint",new Pe(i)],["middleGrey",new Pe(l)],["averageLuminance",new Pe(r)]])}),this.renderTargetLuminance=new $t(1,1,{minFilter:Va,depthBuffer:!1}),this.renderTargetLuminance.texture.generateMipmaps=!0,this.renderTargetLuminance.texture.name="Luminance",this.luminancePass=new xh({renderTarget:this.renderTargetLuminance}),this.adaptiveLuminancePass=new l0(this.luminancePass.texture,{minLuminance:u,adaptationRate:c}),this.uniforms.get("luminanceBuffer").value=this.adaptiveLuminancePass.texture,this.resolution=s,this.mode=a}get mode(){return Number(this.defines.get("TONE_MAPPING_MODE"))}set mode(e){if(this.mode===e)return;const a=Qr.replace(/\D+/g,"")>=168?"CineonToneMapping(texel)":"OptimizedCineonToneMapping(texel)";switch(this.defines.clear(),this.defines.set("TONE_MAPPING_MODE",e.toFixed(0)),e){case oa.LINEAR:this.defines.set("toneMapping(texel)","LinearToneMapping(texel)");break;case oa.REINHARD:this.defines.set("toneMapping(texel)","ReinhardToneMapping(texel)");break;case oa.CINEON:case oa.OPTIMIZED_CINEON:this.defines.set("toneMapping(texel)",a);break;case oa.ACES_FILMIC:this.defines.set("toneMapping(texel)","ACESFilmicToneMapping(texel)");break;case oa.AGX:this.defines.set("toneMapping(texel)","AgXToneMapping(texel)");break;case oa.NEUTRAL:this.defines.set("toneMapping(texel)","NeutralToneMapping(texel)");break;default:this.defines.set("toneMapping(texel)","texel");break}this.adaptiveLuminancePass.enabled=e===oa.REINHARD2_ADAPTIVE,this.setChanged()}getMode(){return this.mode}setMode(e){this.mode=e}get whitePoint(){return this.uniforms.get("whitePoint").value}set whitePoint(e){this.uniforms.get("whitePoint").value=e}get middleGrey(){return this.uniforms.get("middleGrey").value}set middleGrey(e){this.uniforms.get("middleGrey").value=e}get averageLuminance(){return this.uniforms.get("averageLuminance").value}set averageLuminance(e){this.uniforms.get("averageLuminance").value=e}get adaptiveLuminanceMaterial(){return this.adaptiveLuminancePass.fullscreenMaterial}getAdaptiveLuminanceMaterial(){return this.adaptiveLuminanceMaterial}get resolution(){return this.luminancePass.resolution.width}set resolution(e){const t=Math.max(0,Math.ceil(Math.log2(e))),a=Math.pow(2,t);this.luminancePass.resolution.setPreferredSize(a,a),this.adaptiveLuminanceMaterial.mipLevel1x1=t}getResolution(){return this.resolution}setResolution(e){this.resolution=e}get adaptive(){return this.mode===oa.REINHARD2_ADAPTIVE}set adaptive(e){this.mode=e?oa.REINHARD2_ADAPTIVE:oa.REINHARD2}get adaptationRate(){return this.adaptiveLuminanceMaterial.adaptationRate}set adaptationRate(e){this.adaptiveLuminanceMaterial.adaptationRate=e}get distinction(){return console.warn(this.name,"distinction was removed."),1}set distinction(e){console.warn(this.name,"distinction was removed.")}update(e,t,a){this.adaptiveLuminancePass.enabled&&(this.luminancePass.render(e,t),this.adaptiveLuminancePass.render(e,null,null,a))}initialize(e,t,a){this.adaptiveLuminancePass.initialize(e,t,a)}},h0=`#include <common>
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
}`,d0="uniform vec2 resolution;uniform vec2 texelSize;uniform float cameraNear;uniform float cameraFar;uniform float aspect;uniform float time;varying vec2 vUv;VERTEX_HEAD void main(){vUv=position.xy*0.5+0.5;VERTEX_MAIN_SUPPORT gl_Position=vec4(position.xy,1.0,1.0);}",f0=class extends St{constructor(e,t,a,s,o=!1){super({name:"EffectMaterial",defines:{THREE_REVISION:Qr.replace(/\D+/g,""),DEPTH_PACKING:"0",ENCODE_OUTPUT:"1"},uniforms:{inputBuffer:new Pe(null),depthBuffer:new Pe(null),resolution:new Pe(new Le),texelSize:new Pe(new Le),cameraNear:new Pe(.3),cameraFar:new Pe(1e3),aspect:new Pe(1),time:new Pe(0)},blending:Ns,toneMapped:!1,depthWrite:!1,depthTest:!1,dithering:o}),e&&this.setShaderParts(e),t&&this.setDefines(t),a&&this.setUniforms(a),this.copyCameraSettings(s)}set inputBuffer(e){this.uniforms.inputBuffer.value=e}setInputBuffer(e){this.uniforms.inputBuffer.value=e}get depthBuffer(){return this.uniforms.depthBuffer.value}set depthBuffer(e){this.uniforms.depthBuffer.value=e}get depthPacking(){return Number(this.defines.DEPTH_PACKING)}set depthPacking(e){this.defines.DEPTH_PACKING=e.toFixed(0),this.needsUpdate=!0}setDepthBuffer(e,t=en){this.depthBuffer=e,this.depthPacking=t}setShaderData(e){this.setShaderParts(e.shaderParts),this.setDefines(e.defines),this.setUniforms(e.uniforms),this.setExtensions(e.extensions)}setShaderParts(e){return this.fragmentShader=h0.replace(Ve.FRAGMENT_HEAD,e.get(Ve.FRAGMENT_HEAD)||"").replace(Ve.FRAGMENT_MAIN_UV,e.get(Ve.FRAGMENT_MAIN_UV)||"").replace(Ve.FRAGMENT_MAIN_IMAGE,e.get(Ve.FRAGMENT_MAIN_IMAGE)||""),this.vertexShader=d0.replace(Ve.VERTEX_HEAD,e.get(Ve.VERTEX_HEAD)||"").replace(Ve.VERTEX_MAIN_SUPPORT,e.get(Ve.VERTEX_MAIN_SUPPORT)||""),this.needsUpdate=!0,this}setDefines(e){for(const t of e.entries())this.defines[t[0]]=t[1];return this.needsUpdate=!0,this}setUniforms(e){for(const t of e.entries())this.uniforms[t[0]]=t[1];return this}setExtensions(e){this.extensions={};for(const t of e)this.extensions[t]=!0;return this}get encodeOutput(){return this.defines.ENCODE_OUTPUT!==void 0}set encodeOutput(e){this.encodeOutput!==e&&(e?this.defines.ENCODE_OUTPUT="1":delete this.defines.ENCODE_OUTPUT,this.needsUpdate=!0)}isOutputEncodingEnabled(e){return this.encodeOutput}setOutputEncodingEnabled(e){this.encodeOutput=e}get time(){return this.uniforms.time.value}set time(e){this.uniforms.time.value=e}setDeltaTime(e){this.uniforms.time.value+=e}adoptCameraSettings(e){this.copyCameraSettings(e)}copyCameraSettings(e){e&&(this.uniforms.cameraNear.value=e.near,this.uniforms.cameraFar.value=e.far,e instanceof Jr?this.defines.PERSPECTIVE_CAMERA="1":delete this.defines.PERSPECTIVE_CAMERA,this.needsUpdate=!0)}setSize(e,t){const a=this.uniforms;a.resolution.value.set(e,t),a.texelSize.value.set(1/e,1/t),a.aspect.value=e/t}static get Section(){return Ve}};function Mu(e,t,a){for(const s of t){const o="$1"+e+s.charAt(0).toUpperCase()+s.slice(1),i=new RegExp("([^\\.])(\\b"+s+"\\b)","g");for(const l of a.entries())l[1]!==null&&a.set(l[0],l[1].replace(i,o))}}function m0(e,t,a){let s=t.getFragmentShader(),o=t.getVertexShader();const i=s!==void 0&&/mainImage/.test(s),l=s!==void 0&&/mainUv/.test(s);if(a.attributes|=t.getAttributes(),s===void 0)throw new Error(`Missing fragment shader (${t.name})`);if(l&&(a.attributes&Ls.CONVOLUTION)!==0)throw new Error(`Effects that transform UVs are incompatible with convolution effects (${t.name})`);if(!i&&!l)throw new Error(`Could not find mainImage or mainUv function (${t.name})`);{const u=/\w+\s+(\w+)\([\w\s,]*\)\s*{/g,r=a.shaderParts;let c=r.get(Ve.FRAGMENT_HEAD)||"",h=r.get(Ve.FRAGMENT_MAIN_UV)||"",p=r.get(Ve.FRAGMENT_MAIN_IMAGE)||"",M=r.get(Ve.VERTEX_HEAD)||"",y=r.get(Ve.VERTEX_MAIN_SUPPORT)||"";const g=new Set,E=new Set;if(l&&(h+=`	${e}MainUv(UV);
`,a.uvTransformation=!0),o!==null&&/mainSupport/.test(o)){const x=/mainSupport *\([\w\s]*?uv\s*?\)/.test(o);y+=`	${e}MainSupport(`,y+=x?`vUv);
`:`);
`;for(const S of o.matchAll(/(?:varying\s+\w+\s+([\S\s]*?);)/g))for(const A of S[1].split(/\s*,\s*/))a.varyings.add(A),g.add(A),E.add(A);for(const S of o.matchAll(u))E.add(S[1])}for(const x of s.matchAll(u))E.add(x[1]);for(const x of t.defines.keys())E.add(x.replace(/\([\w\s,]*\)/g,""));for(const x of t.uniforms.keys())E.add(x);E.delete("while"),E.delete("for"),E.delete("if"),t.uniforms.forEach((x,S)=>a.uniforms.set(e+S.charAt(0).toUpperCase()+S.slice(1),x)),t.defines.forEach((x,S)=>a.defines.set(e+S.charAt(0).toUpperCase()+S.slice(1),x));const T=new Map([["fragment",s],["vertex",o]]);Mu(e,E,a.defines),Mu(e,E,T),s=T.get("fragment"),o=T.get("vertex");const w=t.blendMode;if(a.blendModes.set(w.blendFunction,w),i){t.inputColorSpace!==null&&t.inputColorSpace!==a.colorSpace&&(p+=t.inputColorSpace===it?`color0 = sRGBTransferOETF(color0);
	`:`color0 = sRGBToLinear(color0);
	`),t.outputColorSpace!==Na?a.colorSpace=t.outputColorSpace:t.inputColorSpace!==null&&(a.colorSpace=t.inputColorSpace);const x=/MainImage *\([\w\s,]*?depth[\w\s,]*?\)/;p+=`${e}MainImage(color0, UV, `,(a.attributes&Ls.DEPTH)!==0&&x.test(s)&&(p+="depth, ",a.readDepth=!0),p+=`color1);
	`;const S=e+"BlendOpacity";a.uniforms.set(S,w.opacity),p+=`color0 = blend${w.blendFunction}(color0, color1, ${S});

	`,c+=`uniform float ${S};

`}if(c+=s+`
`,o!==null&&(M+=o+`
`),r.set(Ve.FRAGMENT_HEAD,c),r.set(Ve.FRAGMENT_MAIN_UV,h),r.set(Ve.FRAGMENT_MAIN_IMAGE,p),r.set(Ve.VERTEX_HEAD,M),r.set(Ve.VERTEX_MAIN_SUPPORT,y),t.extensions!==null)for(const x of t.extensions)a.extensions.add(x)}}var p0=class extends da{constructor(e,...t){super("EffectPass"),this.fullscreenMaterial=new f0(null,null,null,e),this.listener=a=>this.handleEvent(a),this.effects=[],this.setEffects(t),this.skipRendering=!1,this.minTime=1,this.maxTime=Number.POSITIVE_INFINITY,this.timeScale=1}set mainScene(e){for(const t of this.effects)t.mainScene=e}set mainCamera(e){this.fullscreenMaterial.copyCameraSettings(e);for(const t of this.effects)t.mainCamera=e}get encodeOutput(){return this.fullscreenMaterial.encodeOutput}set encodeOutput(e){this.fullscreenMaterial.encodeOutput=e}get dithering(){return this.fullscreenMaterial.dithering}set dithering(e){const t=this.fullscreenMaterial;t.dithering=e,t.needsUpdate=!0}setEffects(e){for(const t of this.effects)t.removeEventListener("change",this.listener);this.effects=e.sort((t,a)=>a.attributes-t.attributes);for(const t of this.effects)t.addEventListener("change",this.listener)}updateMaterial(){const e=new lm;let t=0;for(const l of this.effects)if(l.blendMode.blendFunction===Ie.DST)e.attributes|=l.getAttributes()&Ls.DEPTH;else{if((e.attributes&l.getAttributes()&Ls.CONVOLUTION)!==0)throw new Error(`Convolution effects cannot be merged (${l.name})`);m0("e"+t++,l,e)}let a=e.shaderParts.get(Ve.FRAGMENT_HEAD),s=e.shaderParts.get(Ve.FRAGMENT_MAIN_IMAGE),o=e.shaderParts.get(Ve.FRAGMENT_MAIN_UV);const i=/\bblend\b/g;for(const l of e.blendModes.values())a+=l.getShaderCode().replace(i,`blend${l.blendFunction}`)+`
`;(e.attributes&Ls.DEPTH)!==0?(e.readDepth&&(s=`float depth = readDepth(UV);

	`+s),this.needsDepthTexture=this.getDepthTexture()===null):this.needsDepthTexture=!1,e.colorSpace===it&&(s+=`color0 = sRGBToLinear(color0);
	`),e.uvTransformation?(o=`vec2 transformedUv = vUv;
`+o,e.defines.set("UV","transformedUv")):e.defines.set("UV","vUv"),e.shaderParts.set(Ve.FRAGMENT_HEAD,a),e.shaderParts.set(Ve.FRAGMENT_MAIN_IMAGE,s),e.shaderParts.set(Ve.FRAGMENT_MAIN_UV,o);for(const[l,u]of e.shaderParts)u!==null&&e.shaderParts.set(l,u.trim().replace(/^#/,`
#`));this.skipRendering=t===0,this.needsSwap=!this.skipRendering,this.fullscreenMaterial.setShaderData(e)}recompile(){this.updateMaterial()}getDepthTexture(){return this.fullscreenMaterial.depthBuffer}setDepthTexture(e,t=en){this.fullscreenMaterial.depthBuffer=e,this.fullscreenMaterial.depthPacking=t;for(const a of this.effects)a.setDepthTexture(e,t)}render(e,t,a,s,o){for(const i of this.effects)i.update(e,t,s);if(!this.skipRendering||this.renderToScreen){const i=this.fullscreenMaterial;i.inputBuffer=t.texture,i.time+=s*this.timeScale,e.setRenderTarget(this.renderToScreen?null:a),e.render(this.scene,this.camera)}}setSize(e,t){this.fullscreenMaterial.setSize(e,t);for(const a of this.effects)a.setSize(e,t)}initialize(e,t,a){this.renderer=e;for(const s of this.effects)s.initialize(e,t,a);this.updateMaterial(),a!==void 0&&a!==Nt&&(this.fullscreenMaterial.defines.FRAMEBUFFER_PRECISION_HIGH="1")}dispose(){super.dispose();for(const e of this.effects)e.removeEventListener("change",this.listener),e.dispose()}handleEvent(e){switch(e.type){case"change":this.recompile();break}}};const v0={exposure:1,bloomThreshold:1.7,bloomSmoothing:.3,bloomIntensity:.85,bloomRadius:.7,bloomLevels:7,msaaSamples:4},wh=2,g0=.5;function yu(){const e=typeof window<"u"&&window.devicePixelRatio||1;return Math.min(wh,Math.max(1,e))}class x0{constructor(t,a,s,o={}){_(this,"composer");_(this,"renderPass");_(this,"bloom");_(this,"toneMapping");_(this,"finalPass");_(this,"renderer");_(this,"cssWidth",1);_(this,"cssHeight",1);_(this,"pixelRatio",1);const i={...v0,...o};this.renderer=t,t.toneMapping=od,t.toneMappingExposure=i.exposure,t.outputColorSpace=it,this.composer=new rm(t,{frameBufferType:La,multisampling:i.msaaSamples,depthBuffer:!0,stencilBuffer:!1}),this.renderPass=new i0(a,s),this.composer.addPass(this.renderPass),this.bloom=new o0({blendFunction:Ie.ADD,mipmapBlur:!0,luminanceThreshold:i.bloomThreshold,luminanceSmoothing:i.bloomSmoothing,intensity:i.bloomIntensity,radius:i.bloomRadius,levels:i.bloomLevels}),this.toneMapping=new u0({mode:oa.ACES_FILMIC}),this.finalPass=new p0(s,this.bloom,this.toneMapping),this.finalPass.dithering=!0,this.composer.addPass(this.finalPass)}insertScenePass(t){const a=this.composer.passes.indexOf(this.finalPass);this.composer.addPass(t,a>=0?a:void 0)}get exposure(){return this.renderer.toneMappingExposure}set exposure(t){this.renderer.toneMappingExposure=Math.max(.01,t)}get drawingBufferHeight(){return Math.max(1,Math.round(this.cssHeight*this.pixelRatio))}setSize(t,a,s){const o=Math.max(1,Math.floor(t)),i=Math.max(1,Math.floor(a)),l=Math.min(wh,Math.max(g0,s));return o===this.cssWidth&&i===this.cssHeight&&Math.abs(l-this.pixelRatio)<.001?!1:(this.cssWidth=o,this.cssHeight=i,this.pixelRatio=l,this.renderer.setPixelRatio(l),this.composer.setSize(o,i,!1),!0)}render(t){this.composer.render(t)}dispose(){this.composer.dispose()}}const w0=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,M0=`
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
`;class y0{constructor(t){_(this,"renderer");_(this,"scene",new mo);_(this,"camera",new Xr(-1,1,1,-1,0,1));_(this,"material");_(this,"quad");this.renderer=t,this.material=new St({vertexShader:w0,fragmentShader:M0,uniforms:{uDem:{value:null},uDemRes:{value:512},uElevRange:{value:new Le(0,1e3)},uReliefScale:{value:.001},uSlabSize:{value:new Le(14.8,10.8)},uSunDir:{value:new H(0,1,0)},uPenumbra:{value:9}},depthTest:!1,depthWrite:!1}),this.quad=new va(new Qi(2,2),this.material),this.quad.frustumCulled=!1,this.scene.add(this.quad)}bake(t,a,s,o,i,l,u,r,c=1024){const h=new $t(c,c,{format:kt,type:Nt,depthBuffer:!1,stencilBuffer:!1,minFilter:ze,magFilter:ze,generateMipmaps:!1});h.texture.wrapS=Ke,h.texture.wrapT=Ke,h.texture.colorSpace=Na;const p=this.material.uniforms;p.uDem.value=t,p.uDemRes.value=a,p.uElevRange.value.set(s,o),p.uReliefScale.value=i,p.uSlabSize.value.set(l,u),p.uSunDir.value.copy(r);const M=this.renderer.getRenderTarget(),y=this.renderer.autoClear;return this.renderer.autoClear=!0,this.renderer.setRenderTarget(h),this.renderer.render(this.scene,this.camera),this.renderer.setRenderTarget(M),this.renderer.autoClear=y,h}dispose(){this.quad.geometry.dispose(),this.material.dispose()}}function Oo(e,t,a,s){const o=Math.floor(e.length/3),i=new Int32Array(o);for(let w=0;w<o;w++)i[w]=w;const l=w=>{for(;i[w]!==w;)i[w]=i[i[w]],w=i[w];return w},u=(w,x)=>{const S=l(w),A=l(x);S!==A&&(i[Math.max(S,A)]=Math.min(S,A))},r=new Int32Array(t*a).fill(-1),c=[],h=w=>Math.min(t-1,Math.max(0,w)),p=w=>Math.min(a-1,Math.max(0,w));for(let w=0;w<o;w++){const x=e[w*3],S=e[w*3+1],A=s?s[w*2]:0,U=s?s[w*2+1]:0,I=h(Math.floor((x-A)*t)),D=h(Math.max(Math.floor(x*t),Math.ceil((x+A)*t)-1)),z=p(Math.floor((S-U)*a)),O=p(Math.max(Math.floor(S*a),Math.ceil((S+U)*a)-1));for(let k=z;k<=O;k++)for(let K=I;K<=D;K++){const j=k*t+K;r[j]<0?(r[j]=w,c.push(j)):u(w,r[j])}}for(const w of c){const x=Math.floor(w/t),S=w-x*t,A=r[w];if(S+1<t&&r[w+1]>=0&&u(A,r[w+1]),x+1<a){const U=w+t;r[U]>=0&&u(A,r[U]),S>0&&r[U-1]>=0&&u(A,r[U-1]),S+1<t&&r[U+1]>=0&&u(A,r[U+1])}}const M=new Map,y=new Map;for(let w=0;w<o;w++){const x=l(w);M.set(x,(M.get(x)??0)+1),y.set(x,(y.get(x)??0)+e[w*3+2])}const g=[...M.keys()].sort((w,x)=>M.get(x)-M.get(w)||y.get(x)-y.get(w)||w-x),E=new Map;g.forEach((w,x)=>E.set(w,x));const T=new Uint16Array(o);for(let w=0;w<o;w++)T[w]=Math.min(65535,E.get(l(w)));return{patchOf:T,sizes:g.map(w=>M.get(w))}}function b0(e){const t=Math.max(1,Math.floor(e)),a=t+1,s=a*a,o=new Float32Array(s*3),i=new Float32Array(s*3),l=new Float32Array(s*2),u=1/t;for(let h=0;h<=t;h++){const p=h*u-.5,M=1-h/t;for(let y=0;y<=t;y++){const g=h*a+y;o[g*3]=y*u-.5,o[g*3+1]=0,o[g*3+2]=p,i[g*3+1]=1,l[g*2]=y/t,l[g*2+1]=M}}const r=new Uint32Array(t*t*6);let c=0;for(let h=0;h<t;h++)for(let p=0;p<t;p++){const M=p+a*h,y=p+a*(h+1),g=p+1+a*(h+1),E=p+1+a*h;r[c++]=M,r[c++]=y,r[c++]=E,r[c++]=y,r[c++]=g,r[c++]=E}return{position:o,normal:i,uv:l,index:r}}function S0(e){let t=0;for(let a=0;a<2400;a++)for(let s=0;s<e.length;s++){const o=e[s]*1.000001+(s&7)*.5;e[s]=o>1e6?o-1e6:o,t+=Math.sqrt(e[s])}return t}function T0(e=()=>performance.now()){const t=new Float64Array(2048);for(let o=0;o<t.length;o++)t[o]=o;let a=1/0,s=0;for(let o=0;o<2;o++){const i=e();s+=S0(t),a=Math.min(a,e()-i)}return s===-1?-1:a}const E0=8;function R0(e){return Number.isFinite(e)&&e>E0}const A0={WINDOW_SEC:1,SLOW_MS:26,SLOW_WINDOWS:2,FAST_MS:18.5,CLIMB_SEC:6,HOLD_SEC:30,STALL_MS:250,STEP_DOWN:.15,STEP_UP:.1,LEAST:.5};class k0{constructor(){_(this,"scale",1);_(this,"windowSec",0);_(this,"gaps",[]);_(this,"slowWindows",0);_(this,"fastSec",0);_(this,"ceiling",1);_(this,"ceilingSec",0)}feed(t,a=!1){const s=A0;if(!(t>0)||t>s.STALL_MS||a||(this.gaps.push(t),this.windowSec+=t/1e3,this.ceiling<1&&(this.ceilingSec+=t/1e3,this.ceilingSec>s.HOLD_SEC&&(this.ceiling=Math.min(1,this.ceiling+s.STEP_UP),this.ceilingSec=0)),this.windowSec<s.WINDOW_SEC))return null;const o=this.gaps.sort((u,r)=>u-r),i=o[Math.floor(o.length/2)];this.windowSec=0,this.gaps=[];let l=this.scale;return i>s.SLOW_MS?(this.slowWindows+=1,this.fastSec=0,this.slowWindows>=s.SLOW_WINDOWS&&this.scale>s.LEAST&&(this.ceiling=this.scale-s.STEP_UP,this.ceilingSec=0,l=Math.max(s.LEAST,this.scale-s.STEP_DOWN),this.slowWindows=s.SLOW_WINDOWS-1)):i<s.FAST_MS?(this.slowWindows=0,this.fastSec+=s.WINDOW_SEC,this.fastSec>=s.CLIMB_SEC&&this.scale<this.ceiling&&(l=Math.min(this.ceiling,this.scale+s.STEP_UP),this.fastSec=0)):(this.slowWindows=0,this.fastSec=0),Math.abs(l-this.scale)<=.001?null:(this.scale=l,l)}}const _0="/isogon/assets/draco_decoder-Z1_iN-Ht.wasm",F0="/isogon/assets/draco_wasm_wrapper-fZCQGLGb.js",bu=Math.PI/180,D0=1.05,gr=40,P0=6.2,xr=3,I0=.5,C0=.16,js=33,L0={modis:3.5,viirs:4.1},N0={modis:new Xi(1,.5,.24),viirs:new Xi(.4,.84,1)},z0={modis:qi,viirs:oo},U0={terra:new lr(0,0,0),aqua:new lr(Math.PI/2,0,0),suomi_npp:new lr(0,0,Math.PI/2)},B0="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";function O0(e){const t=e.toUpperCase();return t.includes("TERRA")?["terra"]:t.includes("AQUA")?["aqua"]:t.includes("NOAA")||t.includes("J1")||t.includes("J2")?["noaa_20","suomi_npp"]:["suomi_npp"]}function H0(e,t){const a=Math.sin(e*127.1+t*311.7)*43758.5453;return a-Math.floor(a)}function G0(){const a=new Uint8Array(65536);for(let o=0;o<64;o++)for(let i=0;i<256;i++){const l=i%16,u=o%16,r=l===0||u===0,c=l===8,h=.86+.14*H0(Math.floor(i/16),Math.floor(o/16)),p=(o*256+i)*4;a[p]=Math.round((r?118:c?40:7)*h),a[p+1]=Math.round((r?124:c?52:14)*h),a[p+2]=Math.round((r?138:c?88:46)*h),a[p+3]=255}const s=new Jt(a,256,64,kt,Nt);return s.colorSpace=it,s.wrapS=no,s.wrapT=no,s.magFilter=ze,s.minFilter=Va,s.generateMipmaps=!0,s.anisotropy=8,s.needsUpdate=!0,s}function K0(e){const t=new mo,a=new St({side:ao,depthWrite:!1,vertexShader:`
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
    `}),s=new va(new Ju(10,32,16),a);t.add(s);const o=new id(e),i=o.fromScene(t,.03);return o.dispose(),s.geometry.dispose(),a.dispose(),i}function wr(e,t,a){e.onBeforeCompile=s=>{s.uniforms.uFoilScale={value:t},s.uniforms.uFoilStrength={value:a},s.vertexShader=s.vertexShader.replace("#include <common>",`#include <common>
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
        }`)},e.customProgramCacheKey=()=>"isogon-foil"}class W0{constructor(){_(this,"cells",G0())}make(t,a={}){const s=a.map??null,o=new dd({flatShading:a.flat===!0}),i=a.crinkleScale??26;switch(t){case"foilGold":o.color.setRGB(1,.62,.18),o.metalness=1,o.roughness=.3,wr(o,i,.24);break;case"foilSilver":o.color.setRGB(.9,.91,.93),o.metalness=1,o.roughness=.32,wr(o,i,.2);break;case"foilBlack":o.color.setRGB(.035,.035,.04),o.metalness=.75,o.roughness=.42,wr(o,i,.22);break;case"solar":o.color.setRGB(1,1,1),o.metalness=.55,o.roughness=.22,o.map=s??this.cells,s&&o.color.setRGB(.42,.46,.62);break;case"radiator":o.color.setRGB(.84,.87,.92),o.metalness=.92,o.roughness=.16;break;case"paintWhite":o.color.setRGB(.86,.87,.88),o.metalness=.05,o.roughness=.55;break;case"paintGrey":o.color.setRGB(.3,.31,.33),o.metalness=.45,o.roughness=.5;break;case"dark":o.color.setRGB(.03,.032,.036),o.metalness=.6,o.roughness=.5;break}return s&&t!=="solar"&&(o.map=s,o.color.setRGB(1,1,1),(t==="foilGold"||t==="foilSilver")&&(o.metalness=.82)),o}dispose(){this.cells.dispose()}}function Su(e){const t=e.toLowerCase();return t.includes("gold")?"foilGold":t.includes("silver")?"foilSilver":t.includes("krinkle")||t.includes("kapton")?"foilBlack":t.includes("solar")||t.includes("shiny_panel")?"solar":t==="side panels"?"radiator":t.includes("dish")?"paintWhite":t.includes("thruster")?"dark":t.includes("hardware")||t.includes("grey")||t.includes("gray")?"paintGrey":null}function V0(e){const t=e.getAttribute("position");if(!t||e.getAttribute("uv"))return;e.computeBoundingBox();const a=e.boundingBox,s=a.getSize(new H),o=[0,1,2].sort((c,h)=>s.getComponent(h)-s.getComponent(c)),[i,l]=o,u=Math.max(s.getComponent(l)/12,1e-6),r=new Float32Array(t.count*2);for(let c=0;c<t.count;c++)r[c*2]=(t.getComponent(c,i)-a.min.getComponent(i))/(u*16),r[c*2+1]=(t.getComponent(c,l)-a.min.getComponent(l))/(u*4);e.setAttribute("uv",new ha(r,2))}function Y0(e,t){const a=new eh().setFromObject(e),o=26/Math.max(...a.getSize(new H).toArray(),1e-6),i=new Map,l=new Set;e.traverse(u=>{const r=u;if(!r.isMesh)return;const c=!r.geometry.getAttribute("normal"),h=p=>{var x;const M=i.get(p);if(M)return M;const y=p,g=Su(p.name),E=(x=y.map)==null?void 0:x.image,T=y.map&&r.geometry.getAttribute("uv")&&((E==null?void 0:E.width)??0)>4?y.map:null;let w=p;return g?w=t.make(g,{flat:c,map:T,crinkleScale:o}):y.isMeshStandardMaterial&&!T&&(w=t.make("paintGrey",{flat:c})),w!==p&&(w.name=p.name,l.add(p),y.map&&y.map!==T&&y.map.dispose()),i.set(p,w),w};Array.isArray(r.material)?r.material=r.material.map(h):(Su(r.material.name)==="solar"&&V0(r.geometry),r.material=h(r.material))});for(const u of l)u.dispose()}function Tu(e,t){const a=new ro,s=t.make("foilGold"),o=t.make("foilSilver"),i=t.make("paintWhite"),l=t.make("dark"),u=t.make("solar"),r=(M,y,g,E,T)=>{const w=new va(M,y);return w.position.set(g,E,T),a.add(w),w},c=e==="modis"?.42:.32;r(new Uo(c,.17,.18),s,0,0,0),r(new Uo(c*.86,.035,.15),o,0,-.1,0),r(new cr(.045,.055,.07,24),l,c*.18,-.145,0),r(new Uo(.1,.05,.1),i,-c*.25,-.135,0),r(new Uo(c*.5,.012,.14),i,-c*.1,.092,0),r(new cr(.006,.006,.1,8),o,c*.3,.13,.04);const h=r(new fd(.05,.03,24,1,!0),i,c*.3,.19,.04);h.rotation.x=Math.PI,h.material.side=Ps;const p=r(new cr(.007,.007,.16,8),o,0,0,.17);p.rotation.x=Math.PI/2;for(let M=0;M<3;M++){const y=new Uo(.2,.008,.2),g=y.getAttribute("uv");for(let T=0;T<g.count;T++)g.setXY(T,g.getX(T)*6/16,g.getY(T)*6/4);const E=r(y,u,0,0,.36+M*.208);E.rotation.z=-.35}return a}function Mr(e,t){const a=new ro;t&&e.rotation.copy(t),a.add(e),a.updateMatrixWorld(!0);const s=new eh().setFromObject(a),o=s.getSize(new H),i=s.getCenter(new H),l=Math.max(o.x,o.y,o.z,1e-6);e.position.sub(i);const u=new ro;return u.add(a),u.scale.setScalar(D0/l),u}function yr(e){const t=new Set,a=new Set,s=new Set;e.traverse(o=>{const i=o;i.geometry&&t.add(i.geometry);const l=Array.isArray(i.material)?i.material:i.material?[i.material]:[];for(const u of l){a.add(u);const r=u;for(const c of[r.map,r.normalMap,r.roughnessMap,r.metalnessMap,r.emissiveMap,r.aoMap])c&&s.add(c)}});for(const o of t)o.dispose();for(const o of a)o.dispose();for(const o of s){const i=o.image;i&&typeof i.close=="function"&&i.close(),o.dispose()}}function br(e){const t=Math.min(1,Math.max(0,e));return t*t*(3-2*t)}class $0{constructor(t){_(this,"group",new ro);_(this,"strips",{modis:{alongTrackKm:0,strength:0},viirs:{alongTrackKm:0,strength:0}});_(this,"look",new W0);_(this,"templates",new Map);_(this,"rigs",[]);_(this,"draco",null);_(this,"disposed",!1);_(this,"pos",new H);_(this,"xAxis",new H);_(this,"yAxis",new H(0,1,0));_(this,"zAxis",new H);_(this,"basis",new eo);this.templates.set("procedural-modis",Mr(Tu("modis",this.look),null)),this.templates.set("procedural-viirs",Mr(Tu("viirs",this.look),null));for(let a=0;a<t;a++)this.rigs.push(this.buildRig(a))}buildRig(t){const a=new ro;a.visible=!1;const s=new ro;a.add(s);const o=g=>{const E=new Ji;return E.setAttribute("position",new ha(new Float32Array(g*3),3)),E.setAttribute("color",new ha(new Float32Array(g*4),4)),E},i=()=>new hd({transparent:!0,opacity:0,depthWrite:!1,vertexColors:!0}),l=i(),u=new nd(o(gr),l),r=i(),c=new rd(o(6),r);for(const g of[u,c])g.frustumCulled=!1,a.add(g);const h=o(js+1),p=[];for(let g=0;g<js-1;g++)p.push(0,1+g,2+g);h.setIndex(p);const M=new ld({transparent:!0,opacity:0,side:Ps,depthWrite:!1,blending:cd,vertexColors:!0}),y=new va(h,M);return y.frustumCulled=!1,a.add(y),this.group.add(a),{root:a,craft:s,craftKey:"",along:-1.4+t*.9,passKey:"",track:u,trackMat:l,rays:c,raysMat:r,fan:y,fanMat:M}}async loadModels(t){const a=t.endsWith("/")?t:`${t}/`;let s=[];try{const c=await fetch(`${a}models/spacecraft/manifest.json`);if(!c.ok)return;const h=await c.json();s=Array.isArray(h.models)?h.models:[]}catch{return}const[{GLTFLoader:o},{DRACOLoader:i}]=await Promise.all([Yc(()=>import("./GLTFLoader-C8Ag2Ruc.js"),__vite__mapDeps([0,1])),Yc(()=>import("./DRACOLoader-LNaB3iNp.js"),__vite__mapDeps([2,1]))]);if(this.disposed)return;const l=new ud;l.setURLModifier(c=>/\.tga(\?|$)/i.test(c)?B0:c);const u=new i(l);u.setDecoderPath({js:F0,wasm:_0}),this.draco=u;const r=new o(l);r.setDRACOLoader(u),await Promise.all(s.map(async c=>{if(!(typeof c.id!="string"||typeof c.url!="string"))try{const h=await r.loadAsync(`${a}${c.url.replace(/^\/+/,"")}`);if(this.disposed){yr(h.scene);return}Y0(h.scene,this.look),this.templates.set(c.id,Mr(h.scene,U0[c.id]??null))}catch{}}))}resolveTemplate(t){for(const s of O0(t.sensorLabel)){const o=this.templates.get(s);if(o)return{key:s,template:o}}const a=`procedural-${t.family}`;return{key:a,template:this.templates.get(a)}}update(t,a){this.strips.modis.strength=0,this.strips.viirs.strength=0;const s=a.sky>.004||a.strip>.004,[o,i,l]=a.unitsPerMetre,u=a.slabWidth*.5,r=a.slabDepth*.5,c=a.sampleTerrainY(.5,.5);for(let h=0;h<this.rigs.length;h++){const p=this.rigs[h],M=t[h];if(!M||!s){p.root.visible=!1;continue}p.root.visible=!0;const{key:y,template:g}=this.resolveTemplate(M);p.craftKey!==y&&(p.craft.clear(),p.craft.add(g.clone(!0)),p.craftKey=y);const E=z0[M.family],T=M.azimuthDeg*bu,w=Math.min(E.maxScanDeg,Math.abs(M.scanAngleDeg))*bu,x=(vo+E.altitudeKm)/vo,S=Math.min(.999,x*Math.sin(w)),A=Math.sqrt(1-S*S),U=Math.sin(T),I=-Math.cos(T);let D=U*S*o,z=A*i,O=I*S*l;const k=Math.hypot(D,z,O)||1,K=L0[M.family];D=D/k*K,z=z/k*K,O=O/k*K;let j=Math.cos(T),xe=Math.sin(T);const be=M.orbitNode?M.orbitNode==="descending":M.sensorLabel.toUpperCase().includes("TERRA");xe>0!==be&&(j=-j,xe=-xe);const ye=`${M.sensorLabel}|${M.azimuthDeg}|${M.scanAngleDeg}|${M.orbitNode??""}`;p.passKey!==ye&&(p.passKey!==""&&(p.along=-.6),p.passKey=ye),p.along+=C0*Math.min(.1,Math.max(0,a.dtSec)),p.along>xr&&(p.along-=2*xr);const ne=p.along,Se=br((xr-Math.abs(ne))/I0),Ee=this.pos.set(D+j*ne,c+z,O+xe*ne);this.xAxis.set(j,0,xe),this.zAxis.crossVectors(this.xAxis,this.yAxis).normalize(),this.basis.makeBasis(this.xAxis,this.yAxis,this.zAxis),p.craft.quaternion.setFromRotationMatrix(this.basis),p.craft.position.copy(Ee);const lt=br(a.sky*1.15)*Se;p.craft.visible=lt>.002,p.craft.scale.setScalar(Math.max(lt,1e-4));const le=N0[M.family],ee=p.track.geometry.getAttribute("position"),et=p.track.geometry.getAttribute("color");for(let me=0;me<gr;me++){const Pt=me/(gr-1)*2-1,ia=Pt*P0;ee.setXYZ(me,D+j*ia,c+z,O+xe*ia);const tt=br((1-Math.abs(Pt))/.3),ft=ne-ia,ds=ft>=0?Math.exp(-ft/1.6):Math.exp(ft/.12);et.setXYZW(me,le.r,le.g,le.b,tt*(.3+.7*ds*Se))}ee.needsUpdate=!0,et.needsUpdate=!0,p.trackMat.opacity=.8*a.sky,p.track.visible=a.sky>.004;const ct=a.sky*Se,zt=a.strip*Se;let se=-1e9,m=1e9;if(Math.abs(U)>1e-5){const me=(Ee.x-u)/U,Pt=(Ee.x+u)/U;se=Math.max(se,Math.min(me,Pt)),m=Math.min(m,Math.max(me,Pt))}else Math.abs(Ee.x)>u&&(m=-1e9);if(Math.abs(I)>1e-5){const me=(Ee.z-r)/I,Pt=(Ee.z+r)/I;se=Math.max(se,Math.min(me,Pt)),m=Math.min(m,Math.max(me,Pt))}else Math.abs(Ee.z)>r&&(m=-1e9);if(M.groundStrip&&zt>.004){const me=this.strips[M.family],Pt=Ee.x/(o*1e3),ia=Ee.z/(l*1e3);me.alongTrackKm=Pt*Math.cos(T)+ia*Math.sin(T),me.strength=zt}const ot=ct>.004&&m>se+.05;if(p.rays.visible=ot,p.fan.visible=ot,!ot)continue;const Xt=p.fan.geometry.getAttribute("position"),fa=p.fan.geometry.getAttribute("color"),jt=Ee.y-.04;Xt.setXYZ(0,Ee.x,jt,Ee.z),fa.setXYZW(0,le.r,le.g,le.b,1);for(let me=0;me<js;me++){const Pt=se+(m-se)*me/(js-1),ia=Ee.x-U*Pt,tt=Ee.z-I*Pt,ft=P.clamp(ia/a.slabWidth+.5,0,1),ds=P.clamp(.5-tt/a.slabDepth,0,1);Xt.setXYZ(me+1,ia,a.sampleTerrainY(ft,ds)+.02,tt),fa.setXYZW(me+1,le.r,le.g,le.b,.12)}Xt.needsUpdate=!0,fa.needsUpdate=!0,p.fanMat.opacity=.04*ct;const _t=p.rays.geometry.getAttribute("position"),sa=p.rays.geometry.getAttribute("color"),dt=[1,1+Math.floor(js/2),js];for(let me=0;me<3;me++)_t.setXYZ(me*2,Ee.x,jt,Ee.z),_t.setXYZ(me*2+1,Xt.getX(dt[me]),Xt.getY(dt[me]),Xt.getZ(dt[me])),sa.setXYZW(me*2,le.r,le.g,le.b,1),sa.setXYZW(me*2+1,le.r,le.g,le.b,me===1?.25:.5);_t.needsUpdate=!0,sa.needsUpdate=!0,p.raysMat.opacity=.6*ct}}dispose(){var t;this.disposed=!0,(t=this.draco)==null||t.dispose();for(const a of this.templates.values())yr(a);yr(this.group),this.look.dispose()}}const Mh=64;function X0(e){let t=e>>>0;return()=>{t=t+1831565813>>>0;let a=t;return a=Math.imul(a^a>>>15,a|1),a^=a+Math.imul(a^a>>>7,a|61),((a^a>>>14)>>>0)/4294967296}}function Sr(e,t){const a=new Float32Array(e*e*e);for(let i=0;i<a.length;i++)a[i]=t();const s=e-1,o=e*e;return(i,l,u)=>{const r=i*e,c=l*e,h=u*e,p=Math.floor(r),M=Math.floor(c),y=Math.floor(h),g=r-p,E=c-M,T=h-y,w=g*g*g*(g*(g*6-15)+10),x=E*E*E*(E*(E*6-15)+10),S=T*T*T*(T*(T*6-15)+10),A=p&s,U=p+1&s,I=(M&s)*e,D=(M+1&s)*e,z=(y&s)*o,O=(y+1&s)*o,k=a[z+I+A],K=a[z+I+U],j=a[z+D+A],xe=a[z+D+U],be=a[O+I+A],ye=a[O+I+U],ne=a[O+D+A],Se=a[O+D+U],Ee=k+(K-k)*w,lt=j+(xe-j)*w,le=be+(ye-be)*w,ee=ne+(Se-ne)*w,et=Ee+(lt-Ee)*x,ct=le+(ee-le)*x;return et+(ct-et)*S}}function Tr(e,t){const a=new Float32Array(e*e*e*3);for(let o=0;o<a.length;o++)a[o]=t();const s=e-1;return(o,i,l)=>{const u=o*e,r=i*e,c=l*e,h=Math.floor(u),p=Math.floor(r),M=Math.floor(c);let y=9;for(let g=-1;g<=1;g++){const E=(M+g&s)*e,T=M+g-c;for(let w=-1;w<=1;w++){const x=(E+(p+w&s))*e,S=p+w-r;for(let A=-1;A<=1;A++){const U=(x+(h+A&s))*3,I=h+A+a[U]-u,D=S+a[U+1],z=T+a[U+2],O=I*I+D*D+z*z;O<y&&(y=O)}}}return Math.min(1,Math.sqrt(y))}}let Er=null;function j0(){if(Er)return Er;const e=Mh,t=X0(1377799),a=Sr(4,t),s=Sr(8,t),o=Sr(16,t),i=Tr(4,t),l=Tr(8,t),u=Tr(16,t),r=new Uint8Array(e*e*e*4),c=1/e;let h=0;for(let p=0;p<e;p++){const M=(p+.5)*c;for(let y=0;y<e;y++){const g=(y+.5)*c;for(let E=0;E<e;E++){const T=(E+.5)*c,w=a(T,g,M)*.5+s(T,g,M)*.3+o(T,g,M)*.2,x=1-i(T,g,M),S=1-l(T,g,M),A=1-u(T,g,M),U=Math.min(1,Math.max(0,w*.62+x*.46-.06)),I=Math.min(1,Math.max(0,S*.62+A*.38));r[h]=Math.round(U*255),r[h+1]=Math.round(I*255),r[h+2]=Math.round(w*255),r[h+3]=255,h+=4}}}return Er=r,r}function q0(){const e=Mh,t=new md(j0(),e,e,e);return t.format=kt,t.type=Nt,t.minFilter=ze,t.magFilter=ze,t.wrapS=no,t.wrapT=no,t.wrapR=no,t.unpackAlignment=1,t.needsUpdate=!0,t}const qs=256,Z0=256;function Q0(e,t,a,s,o){const i=Z0,l=new Float32Array(i*i);for(let g=0;g<i;g++){const E=Math.min(t-1,Math.round(g/(i-1)*(t-1)));for(let T=0;T<i;T++){const w=Math.min(t-1,Math.round(T/(i-1)*(t-1)));l[g*i+T]=a(e[E*t+w])}}const u=5,r=new Float32Array(i*i),c=new Float32Array(i*i);for(let g=0;g<i;g++)for(let E=0;E<i;E++){let T=0;for(let w=-u;w<=u;w++)T+=l[g*i+Math.min(i-1,Math.max(0,E+w))];r[g*i+E]=T/(2*u+1)}for(let g=0;g<i;g++)for(let E=0;E<i;E++){let T=0;for(let w=-u;w<=u;w++)T+=r[Math.min(i-1,Math.max(0,g+w))*i+E];c[g*i+E]=T/(2*u+1)}const h=new Uint16Array(i*i*4),p=s/(i-1),M=o/(i-1);for(let g=0;g<i;g++){const E=Math.max(0,g-2),T=Math.min(i-1,g+2);for(let w=0;w<i;w++){const x=Math.max(0,w-2),S=Math.min(i-1,w+2),A=(c[g*i+S]-c[g*i+x])/((S-x)*p),U=(c[T*i+w]-c[E*i+w])/((T-E)*M),I=Math.hypot(A,U),D=I>1e-5?Math.min(1,I*1.6)/I:0,z=(g*i+w)*4;h[z]=ya.toHalfFloat(l[g*i+w]),h[z+1]=ya.toHalfFloat(A*D),h[z+2]=ya.toHalfFloat(U*D),h[z+3]=ya.toHalfFloat(c[g*i+w])}}const y=new Jt(h,i,i,kt,La);return y.minFilter=ze,y.magFilter=ze,y.wrapS=Ke,y.wrapT=Ke,y.generateMipmaps=!1,y.flipY=!1,y.needsUpdate=!0,y}const Ho=`
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`,J0=`
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
`,ep=`
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
`,yh=`
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
`,tp=`
${yh}
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
`,ap=`
${yh}
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
`,sp=`
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
`,op=.62,ip=.88;class bh extends da{constructor(){super("SmokePass");_(this,"shadowTarget");_(this,"sourceTarget");_(this,"smokeTarget");_(this,"historyTarget");_(this,"historyValid",!1);_(this,"frame",0);_(this,"lastTime",-1);_(this,"prevViewProj",new eo);_(this,"viewProj",new eo);_(this,"noiseTexture");_(this,"plumeTarget");_(this,"sourceMaterial");_(this,"plumeMaterial");_(this,"shadowMaterial");_(this,"marchMaterial");_(this,"compositeMaterial");_(this,"densityUniforms");_(this,"lastSourceRenderer",null);_(this,"lastSourceSig",new Float64Array(6).fill(Number.NaN));_(this,"lastPlumeRenderer",null);_(this,"lastPlumeSig",new Float64Array(15).fill(Number.NaN));this.needsDepthTexture=!0,this.needsSwap=!0,this.noiseTexture=q0(),this.sourceTarget=new $t(qs,qs,{format:kt,type:La,depthBuffer:!1,stencilBuffer:!1,minFilter:Va,magFilter:ze,generateMipmaps:!0}),this.sourceTarget.texture.colorSpace=Na,this.plumeTarget=new $t(qs,qs,{format:kt,type:La,depthBuffer:!1,stencilBuffer:!1,minFilter:Va,magFilter:ze,generateMipmaps:!0}),this.plumeTarget.texture.colorSpace=Na,this.shadowTarget=new $t(qs,qs,{format:kt,type:Nt,depthBuffer:!1,stencilBuffer:!1,minFilter:ze,magFilter:ze,generateMipmaps:!1}),this.shadowTarget.texture.colorSpace=Na;const a=()=>new $t(2,2,{format:kt,type:La,depthBuffer:!1,stencilBuffer:!1,minFilter:ze,magFilter:ze,generateMipmaps:!1});this.smokeTarget=a(),this.historyTarget=a(),this.densityUniforms={uHeightPrev:{value:null},uHeightNext:{value:null},uMorph:{value:1},uSourceTex:{value:this.sourceTarget.texture},uPlumeTex:{value:this.plumeTarget.texture},uNoiseTex:{value:this.noiseTexture},uSlabSize:{value:new Le(14.8,10.8)},uSmokeTop:{value:op},uWindUv:{value:new Le(.7,.7)},uTime:{value:0},uOpacity:{value:1},uCutawayMix:{value:0},uCutawayPlane:{value:0},uCutawayDir:{value:new Le(1,0)},uClearCenter:{value:new H},uClearRadius:{value:0},uThinOverFire:{value:0},uLid:{value:new ca(0,1,0,-1e4)},uLidAmount:{value:0},uSunDir:{value:new H(0,1,0)},uSigma:{value:4.6}};const s={depthTest:!1,depthWrite:!1,toneMapped:!1};this.sourceMaterial=new St({...s,vertexShader:Ho,fragmentShader:J0,uniforms:{uField0:{value:null},uField1:{value:null},uDetection0:{value:null},uDetection1:{value:null},uRealSource:{value:0},uFrameMix:{value:0}}}),this.plumeMaterial=new St({...s,vertexShader:Ho,fragmentShader:ep,uniforms:{uSourceTex:this.densityUniforms.uSourceTex,uHeightPrev:this.densityUniforms.uHeightPrev,uHeightNext:this.densityUniforms.uHeightNext,uMorph:this.densityUniforms.uMorph,uWindUv:this.densityUniforms.uWindUv,uSmokeTop:this.densityUniforms.uSmokeTop,uSlabSize:this.densityUniforms.uSlabSize,uLid:this.densityUniforms.uLid,uLidAmount:this.densityUniforms.uLidAmount}}),this.shadowMaterial=new St({...s,vertexShader:Ho,fragmentShader:tp,uniforms:this.densityUniforms}),this.marchMaterial=new St({...s,vertexShader:Ho,fragmentShader:ap,uniforms:{...this.densityUniforms,uDepthTex:{value:null},uProjInv:{value:new eo},uViewInv:{value:new eo},uCameraPos:{value:new H},uBoxTop:{value:4},uSunColor:{value:new H(1.4,1.29,1.17)},uNight:{value:0},uFireLight:{value:1},uStepFine:{value:.075},uHistoryTex:{value:null},uPrevViewProj:{value:new eo},uHistoryWeight:{value:0},uFrame:{value:0},uProxyY:{value:1},uHalfSize:{value:new Le(2,2)}}}),this.compositeMaterial=new St({...s,vertexShader:Ho,fragmentShader:sp,uniforms:{uSceneTex:{value:null},uSmokeTex:{value:this.smokeTarget.texture},uDepthTex:{value:null},uHalfSize:{value:new Le(2,2)},uNear:{value:.1},uFar:{value:100}}}),this.fullscreenMaterial=this.compositeMaterial}setDepthTexture(a){this.marchMaterial.uniforms.uDepthTex.value=a,this.compositeMaterial.uniforms.uDepthTex.value=a}setSize(a,s){const o=Math.max(2,Math.ceil(a/2)),i=Math.max(2,Math.ceil(s/2));this.smokeTarget.setSize(o,i),this.historyTarget.setSize(o,i),this.historyValid=!1,this.compositeMaterial.uniforms.uHalfSize.value.set(o,i),this.marchMaterial.uniforms.uHalfSize.value.set(o,i)}update(a){const s=this.densityUniforms;s.uHeightPrev.value=a.heightPrev,s.uHeightNext.value=a.heightNext,s.uMorph.value=a.morph,s.uSlabSize.value.set(a.slabWidth,a.slabDepth),s.uWindUv.value.copy(a.windUv).normalize(),s.uTime.value=a.time,s.uLid.value.copy(a.lid),s.uLidAmount.value=a.lidAmount,s.uClearCenter.value.setFromMatrixPosition(a.camera.matrixWorld),s.uClearRadius.value=a.clearRadius,s.uThinOverFire.value=a.thinOverFire,s.uOpacity.value=a.opacity,s.uCutawayMix.value=a.cutawayMix,s.uCutawayPlane.value=a.cutawayPlane,s.uCutawayDir.value.copy(a.cutawayDir),s.uSunDir.value.copy(a.sunDir);const o=this.sourceMaterial.uniforms;o.uField0.value=a.field0,o.uField1.value=a.field1,o.uDetection0.value=a.detection0??a.field0,o.uDetection1.value=a.detection1??a.field1,o.uRealSource.value=a.detection0&&a.detection1?1:0,o.uFrameMix.value=a.frameMix;const i=this.marchMaterial.uniforms,l=a.camera;i.uProjInv.value.copy(l.projectionMatrixInverse),i.uViewInv.value.copy(l.matrixWorld),i.uCameraPos.value.setFromMatrixPosition(l.matrixWorld),i.uSunColor.value.copy(a.sunColor),i.uNight.value=a.night??0,i.uFireLight.value=a.fireLight??1,i.uBoxTop.value=a.reliefTop+s.uSmokeTop.value+.05,i.uProxyY.value=.5*(a.reliefTop+s.uSmokeTop.value),(this.lastTime<0||a.time-this.lastTime>.25||a.time<this.lastTime)&&(this.historyValid=!1),this.lastTime=a.time,i.uPrevViewProj.value.copy(this.prevViewProj),this.viewProj.multiplyMatrices(l.projectionMatrix,l.matrixWorldInverse),this.prevViewProj.copy(this.viewProj),i.uHistoryWeight.value=this.historyValid?ip:0,i.uFrame.value=this.frame,this.frame=(this.frame+1)%4096;const u=this.compositeMaterial.uniforms;u.uNear.value=l.near,u.uFar.value=l.far}render(a,s,o){const i=this.scene,l=this.camera,u=this.sourceMaterial.uniforms,r=u.uRealSource.value>.5?1:0,c=r?u.uDetection0.value:u.uField0.value,h=r?u.uDetection1.value:u.uField1.value,p=c?c.id:-1,M=c?c.version:-1,y=h?h.id:-1,g=h?h.version:-1,E=u.uFrameMix.value,T=this.lastSourceSig,w=this.lastSourceRenderer!==a||T[0]!==r||T[1]!==p||T[2]!==M||T[3]!==y||T[4]!==g||T[5]!==E;w&&(this.fullscreenMaterial=this.sourceMaterial,a.setRenderTarget(this.sourceTarget),a.render(i,l),this.lastSourceRenderer=a,T[0]=r,T[1]=p,T[2]=M,T[3]=y,T[4]=g,T[5]=E);const x=this.densityUniforms,S=x.uMorph.value,A=S<.999?S:1,U=S<.999?x.uHeightPrev.value:null,I=x.uHeightNext.value,D=U?U.id:-1,z=U?U.version:-1,O=I?I.id:-1,k=I?I.version:-1,K=x.uWindUv.value,j=x.uSmokeTop.value,xe=x.uSlabSize.value,be=x.uLidAmount.value,ye=be>0?be:0,ne=x.uLid.value,Se=ye>0?ne.x:0,Ee=ye>0?ne.y:0,lt=ye>0?ne.z:0,le=ye>0?ne.w:0,ee=this.lastPlumeSig;(w||this.lastPlumeRenderer!==a||ee[0]!==D||ee[1]!==z||ee[2]!==O||ee[3]!==k||ee[4]!==A||ee[5]!==K.x||ee[6]!==K.y||ee[7]!==j||ee[8]!==xe.x||ee[9]!==xe.y||ee[10]!==ye||ee[11]!==Se||ee[12]!==Ee||ee[13]!==lt||ee[14]!==le)&&(this.fullscreenMaterial=this.plumeMaterial,a.setRenderTarget(this.plumeTarget),a.render(i,l),this.lastPlumeRenderer=a,ee[0]=D,ee[1]=z,ee[2]=O,ee[3]=k,ee[4]=A,ee[5]=K.x,ee[6]=K.y,ee[7]=j,ee[8]=xe.x,ee[9]=xe.y,ee[10]=ye,ee[11]=Se,ee[12]=Ee,ee[13]=lt,ee[14]=le),this.fullscreenMaterial=this.shadowMaterial,a.setRenderTarget(this.shadowTarget),a.render(i,l);const ct=this.smokeTarget;this.smokeTarget=this.historyTarget,this.historyTarget=ct,this.marchMaterial.uniforms.uHistoryTex.value=this.historyTarget.texture,this.fullscreenMaterial=this.marchMaterial,a.setRenderTarget(this.smokeTarget),a.render(i,l),this.historyValid=!0,this.compositeMaterial.uniforms.uSmokeTex.value=this.smokeTarget.texture,this.compositeMaterial.uniforms.uSceneTex.value=s.texture,this.fullscreenMaterial=this.compositeMaterial,a.setRenderTarget(this.renderToScreen?null:o),a.render(i,l)}dispose(){this.lastSourceRenderer=null,this.lastSourceSig.fill(Number.NaN),this.lastPlumeRenderer=null,this.lastPlumeSig.fill(Number.NaN),this.sourceTarget.dispose(),this.plumeTarget.dispose(),this.shadowTarget.dispose(),this.smokeTarget.dispose(),this.historyTarget.dispose(),this.noiseTexture.dispose(),this.sourceMaterial.dispose(),this.plumeMaterial.dispose(),this.shadowMaterial.dispose(),this.marchMaterial.dispose(),this.compositeMaterial.dispose()}}_(bh,"sourceGrid",Ge);const $r=2,Eu=Xo*jo,np=.62,rp=1.75;function lp(e,t){const a=Math.max(1,e),s=Math.max(1,t),o=Math.min(rp,Math.max(np,a/s)),i=Math.sqrt(Eu*o),l=Eu/i,u=i/(a*1e3),r=l/(s*1e3),c=Math.sqrt(u*r)*$r;return{width:i,depth:l,unitsPerMetre:[u,c,r]}}function cp(e,t,a,s){const o=Math.max(350,a-t);return Math.min(o*1.15,Math.max(0,e-t))*s.unitsPerMetre[1]}const Ru=.08,up=.3,hp=3;function Go(e){if(!e)return null;const{left:t,top:a,right:s,bottom:o}=e;if(![t,a,s,o].every(c=>Number.isFinite(c)))return null;const i=Math.min(1,Math.max(0,Math.min(t,s))),l=Math.min(1,Math.max(0,Math.max(t,s))),u=Math.min(1,Math.max(0,Math.min(a,o))),r=Math.min(1,Math.max(0,Math.max(a,o)));return l-i<Ru||r-u<Ru?null:{left:i,top:u,right:l,bottom:r}}function Rr(e,t){return e===t?!0:!e||!t?!1:Math.abs(e.left-t.left)<1e-5&&Math.abs(e.top-t.top)<1e-5&&Math.abs(e.right-t.right)<1e-5&&Math.abs(e.bottom-t.bottom)<1e-5}const bt=new Jr,ua=new H,Lt=new H,Hi=new H,ks=new H;function dp(e,t,a,s,o,i,l,u){let r=Number.POSITIVE_INFINITY,c=Number.NEGATIVE_INFINITY,h=Number.POSITIVE_INFINITY,p=Number.NEGATIVE_INFINITY;bt.fov=o,bt.aspect=i,bt.near=.1,bt.far=200,bt.clearViewOffset(),bt.updateProjectionMatrix(),ua.set(a.target[0],a.target[1],a.target[2]);const M=s>1e-4?[-s,0,s]:[0];for(const A of M){const U=a.azimuth+A,I=Math.sin(a.polar);bt.position.set(ua.x+a.distance*I*Math.sin(U),ua.y+a.distance*Math.cos(a.polar),ua.z+a.distance*I*Math.cos(U)),bt.up.set(0,1,0),bt.lookAt(ua),bt.updateMatrixWorld(!0);for(let D=0;D<t;D++)Lt.set(e[D*3],e[D*3+1],e[D*3+2]).project(bt),!(Lt.z>=1||Lt.z<=-1)&&(Lt.x<r&&(r=Lt.x),Lt.x>c&&(c=Lt.x),Lt.y<h&&(h=Lt.y),Lt.y>p&&(p=Lt.y))}if(!(c>r)||!(p>h))return u.scale=1,u.offsetX=0,u.offsetY=0,u;const y=(c-r)*.5,g=(p-h)*.5,E=(r+c)*.25+.5,T=.5-(h+p)*.25,w=l.right-l.left,x=l.bottom-l.top,S=Math.min(hp,Math.max(up,Math.min(w/y,x/g)));return u.scale=S,u.offsetX=E*S-(l.left+l.right)*.5,u.offsetY=T*S-(l.top+l.bottom)*.5,u}const fp=.24,mp=.46,Sh=.03;function Th(e){return Math.min(mp,Math.max(fp,e.bottom+Sh))}function pp(e,t,a,s){bt.fov=a,bt.aspect=s,bt.near=.1,bt.far=200,bt.clearViewOffset(),bt.updateProjectionMatrix(),ua.set(e.target[0],e.target[1],e.target[2]);const o=Math.sin(e.polar);bt.position.set(ua.x+e.distance*o*Math.sin(t),ua.y+e.distance*Math.cos(e.polar),ua.z+e.distance*o*Math.cos(t)),bt.up.set(0,1,0),bt.lookAt(ua),bt.updateMatrixWorld(!0)}function vp(e,t,a,s,o,i,l,u){let r=Number.POSITIVE_INFINITY;const c=s>1e-4?[-s,0,s]:[0];for(const p of c){pp(a,a.azimuth+p,o,i);for(let M=0;M<t;M++){if(Lt.set(e[M*3],e[M*3+1],e[M*3+2]).project(bt),Lt.z>=1||Lt.z<=-1)continue;const y=Lt.x*.5+.5;if(y<l.left-.04||y>l.right+.04)continue;const g=.5-Lt.y*.5;g<r&&(r=g)}}if(u.scale=1,u.offsetX=0,!Number.isFinite(r))return u.offsetY=0,u;const h=Th(l);return u.offsetY=Math.min(.1,Math.max(-.42,r-h)),u}function gp(e){return Math.min(e.bottom,Th(e)-Sh)}function xp(e,t,a){const s=1-2*t;return Lt.set(-1,s,.5).unproject(e),ua.set(1,s,.5).unproject(e),Hi.setFromMatrixPosition(e.matrixWorld),Lt.sub(Hi),ua.sub(Hi),ks.crossVectors(ua,Lt).normalize(),ks.y<0&&ks.negate(),a.set(ks.x,ks.y,ks.z,-ks.dot(Hi))}function wp(e,t,a,s){if(Math.abs(s.scale-1)<4e-4&&Math.abs(s.offsetX)<4e-4&&Math.abs(s.offsetY)<4e-4){e.view!==null&&e.view.enabled&&e.clearViewOffset();return}e.setViewOffset(t*s.scale,a*s.scale,s.offsetX*t,s.offsetY*a,t,a)}const Au=yt.azimuth,Mp=.62,Gi=30,Ki=.055,yp=[3.6,5,6.5,8],bp=[90,180,300,450,650,900],Sp=2,Tp=2.5,Ep=.05,Rp=.6,Ar=.14,Zs=150,ku=.3,Ap=.03,Ia=19,kp=1.7,_p=.6,_u={left:0,top:0,right:1,bottom:.34},Fp=4,Qs=33,Js=48,Dp=3.2,Wi=1.15,Fu=6;function Pp(e,t,a,s){return s.set(-t*Math.cos(e),-a*Math.sin(e)).normalize()}const Du=4,Ip=4.4,Cp=4.6,Lp=3.5,Np=3.2,zp=111.32;function kr(e){return Math.max(1,(e[3]-e[1])*zp)}const Pu=-.11,Up=.065,io=13,Eh=5,Bp=io*io+4+Eh,_s=24;function Op(e){const t=e==null?void 0:e.held_out_passes_answered_by;return typeof(t==null?void 0:t.method)=="string"&&t.method!=="reconstruction"}let _r=null;function Fr(){return _r||(_r=new Uint8Array(so*Ge*Ge*4)),_r}function Dr(){return{source:"procedural_fallback",provenanceNote:"No run on show.",frames:Array.from({length:so},()=>[])}}function Hp(){const e=new Jt(new Uint8Array([104,106,102,255]),1,1,kt);return e.colorSpace=it,e.needsUpdate=!0,e}function Iu(e){return e.noRealGround?!1:(e.levelIsWater===void 0&&(e.levelIsWater=!tl(e.alignedDem,e.demGridRes)),e.levelIsWater)}function Gp(e){const t=e.toUpperCase();return t.includes("TERRA")?"MODIS_TERRA":t.includes("AQUA")?"MODIS_AQUA":t.includes("NOAA20")||t.includes("NOAA-20")||t.includes("JPSS")?"VIIRS_NOAA20":t.includes("SNPP")||t.includes("NPP")?"VIIRS_SNPP":null}function Cu(){if(typeof window>"u")return null;const e=new URLSearchParams(window.location.search).get("film");return e==="record"||e==="estimate"||e==="test"||e==="play"||e==="auto"?e:null}function Kp(e,t){const a=e.runId!==null&&t.has(e.runId);if(!e.missingFiles&&!a)return;const s=(e.missingFiles??[]).filter(i=>!(e.pack&&(i==="elevation"||i==="imagery"))),o=a?[...s,"estimate"]:s;return o.length>0?o:void 0}const Wp=[];function Pr(e){return e.observerDataset.dataSource==="firms"?Wp:e.callouts}function Vp(e){const t=e.fieldScale??to;return{scale:t.kind==="linear"?"linear":"log",ticks:t.ticks??[0,.25,.5,.75,1].map(a=>({at:a,mwPerKm2:th(t,a)}))}}const Yp=2.6,$p=9,Xp=6,jp=9.5,qp=.08,Ir=8,Zp=1,Qp=1.8,Jp=.05,ev=12,Lu=.12,Nu=9,tv=1.22,Cr=.94,av=5,zu=1.5,sv=5,Uu=2,Bu=.8,Lr=3,Nr=22,Ou=.75,Hu=[1.1,.95,.8,.65],zr=39,Gu=.375,Ku=.3,ov=.4,Wu=.43,iv=3,nv=.3,rv=24*3600*1e3,lv=5,cv=.25,uv=50,Ur=.4,hv=60,Br=[.04,.22,.34,.86,.96,1],dv=6,Vu=.375,fv=1.3,mv=1.9,pv=.044,vv=1.08,gv=1.8,xv=2,wv=e=>typeof e=="number"&&e>0?P.clamp(Math.pow(Math.max(1,pv/e/vv),gv),1,xv):1,Mv=[.64,.76],yv=.7,bv=1.2,Sv=.02,Tv=0,Ev=1;function Rv(e,t){return e.kind==="linear"?t.set(.02,1):t.set(ji(e,Ev),1)}const Av=4,kv=2500;function _v(e,t){return e.kind==="linear"?t.set(.02,1):t.set(ji(e,Av),ji(e,kv))}const Fv=.45;function Dv(e,t,a,s){if(e.dataSource!=="firms")return null;const[o,i,l,u]=t,r=Fv*Math.min(a,s);let c=-1,h=-1;return e.frames.forEach((p,M)=>{let y=0,g=!1,E=!1;const T=[],w=[];for(const D of p)if(!D.hidden){y+=D.footprints.length,D.family==="viirs"&&D.isDay===!1&&(g=!0),D.isDay===!1&&D.footprints.length>0&&(E=!0);for(const z of D.footprints)T.push((z.lon-o)/Math.max(1e-9,l-o)*a),w.push((z.lat-i)/Math.max(1e-9,u-i)*s)}if(y===0)return;T.sort((D,z)=>D-z),w.sort((D,z)=>D-z);const x=Math.floor(.05*(y-1)),S=Math.ceil(.95*(y-1)),U=Math.hypot(T[S]-T[x],w[S]-w[x])<=r,I=y+(E?1e5:0)+(E&&U?2e5:0)+(g?1e6:0)+(g&&U?1e7:0);I>h&&(h=I,c=M)}),c>=0?c:null}function Pv(e){var s;const t=e.attribution,a=((s=e.context)==null?void 0:s.manifest.ortho.attribution)??"";return a&&a!==t?t?`${t}; ${a}`:a:t}function Yu(e){return us.includes(e)}function Wa(e,t){return e.resolveAsset?e.resolveAsset(t):Iv(e.apiBase,t)}function $u(e){return`/isogon/${e}`}function Iv(e,t){if(t.startsWith("http://")||t.startsWith("https://")||t.startsWith("data:"))return t;const a=e.replace(/\/+$/,"");return t.startsWith("/")?`${a}${t}`:`${a}/${t}`}function Wo(e,t,a,s){const o=Math.min(1,Math.max(0,a))*(t-1),i=Math.min(1,Math.max(0,s))*(t-1),l=Math.floor(o),u=Math.floor(i),r=Math.min(t-1,l+1),c=Math.min(t-1,u+1),h=o-l,p=i-u,M=e[u*t+l],y=e[u*t+r],g=e[c*t+l],E=e[c*t+r],T=M+(y-M)*h,w=g+(E-g)*h;return T+(w-T)*p}const Cv=new H(.075,.098,.135),Rh=new H(-.56,.64,.52).normalize();function Lv(e,t,a){const s=Mf(a),o=s?s.extent_km[0]:e,i=s?s.extent_km[1]:t,l=lp(o,i),u=Rh.clone(),[r,c,h]=l.unitsPerMetre,p=new H(u.x/r,u.y/c,u.z/h).normalize();return s&&(Tf(s.sun.azimuth_deg,s.sun.elevation_deg,p),Ef(p,new H(r,c,h),u)),{widthKm:o,depthKm:i,frame:l,sunDir:u,sunTrue:p,packManifest:s}}const Xu="Esri, Vantor, Earthstar Geographics, and the GIS User Community";function Or(e,t,a,s,o){const i=Lv(e,t,a),l=i.widthKm/Math.max(64,s);return{widthKm:i.widthKm,depthKm:i.depthKm,frame:i.frame,sunDir:i.sunDir,sunTrue:i.sunTrue,orthoTexelKm:l,sharpen:1,shadow:null,packManifest:i.packManifest,packState:"none",pack:null,lite:null,context:null,contextState:"none",auxTex:null,detailTex:null,detailRect:[0,0,1,1],detailTexelKm:l,attribution:o}}function Fs(e,t){return cp(e,t.minElevM,t.maxElevM,t.frame)}function Hr(e,t,a,s,o,i){return qd(e,t,o,i,{gridSize:Ge,zMaxMwKm2:zd,sigmaMaxMwKm2:Ud},(l,u)=>Wo(a,s,l,u))}function Ov(e){const t=At.useRef(null),a=At.useRef(null),s=At.useRef(null),o=At.useRef([null,null,null]),i=At.useRef([null,null,null]),l=At.useRef([null,null,null]),u=At.useRef(null),r=At.useRef(null),c=At.useRef(null),[h,p]=At.useState([]),M=At.useRef(new Map),y=At.useRef(new Set),g=At.useRef(e);g.current=e;const E=At.useRef(null);At.useEffect(()=>{const x=t.current;if(!x)return;let S=!1;if(!Zh())throw new $c("unavailable");let A;try{A=new pd({antialias:!1,alpha:!1,depth:!1,powerPreference:"high-performance",stencil:!1})}catch(n){throw new $c("failed",n)}const U=R0(T0());let I=yu();A.setPixelRatio(I),A.setClearColor(new Xi("#080b11"),1),A.domElement.style.width="100%",A.domElement.style.height="100%",A.domElement.style.display="block",x.appendChild(A.domElement);const D=Math.min(16,A.capabilities.getMaxAnisotropy()||4),z=new vd;z.setCrossOrigin("anonymous");const O=new mo,k=new Jr(39,16/9,.12,140),K=new x0(A,O,k),j=new bh;K.insertScenePass(j);const xe=new Set,be=n=>(n.smokeHeight||(n.smokeHeight=Q0(n.alignedDem,n.demGridRes,f=>Fs(f,n),n.frame.width,n.frame.depth),xe.add(n.smokeHeight)),n.smokeHeight);let ye=1,ne=0;const Se=Rh.clone(),Ee=new gd(16775922,Ip);Ee.position.copy(Se).multiplyScalar(20),O.add(Ee);const lt=K0(A);O.environment=lt.texture;const le=new Map,ee=new Map;for(const n of us){const f=Vo[n],v=jc(n,256),d=Ds(v,!1),R=qc(n,d.aligned,d.gridRes,d.minElev,d.maxElev,D),b=Fr(),C=Hr(n,f.bbox,d.aligned,d.gridRes,b,so);le.set(n,{key:`proc-${n}`,regionId:n,runId:null,noRealGround:!0,noRealPicture:!0,demTex:d.texture,alignedDem:d.aligned,demGridRes:d.gridRes,minElevM:d.minElev,maxElevM:d.maxElev,satTex:R,orthoLabel:"drawn stand-in",demLabel:"512²",tensor:b,frameCount:so,bbox:[...f.bbox],windDirUv:[...f.windDirUv],hasSeaCoast:f.hasSeaCoast,observerDataset:Dr(),findings:C.anchors,callouts:C.callouts,fireHistory:null,...Or(f.widthKm,kr(f.bbox),null,512,"")})}const et=A.extensions.has("OES_texture_float_linear"),ct=n=>(n.fireHistory||(n.fireHistory=Af(n.tensor,n.frameCount,et)),n.fireHistory),zt=g.current.activeTheaterId;let se=le.get(zt)??le.get("plumas_ca"),m=se;const ot=[],Xt=n=>{n&&!ot.includes(n)&&ot.push(n)},fa=()=>{const n=new Set,f=v=>{v&&(n.add(v),v.lite&&n.add(v.lite))};f(se),f(m);for(const v of le.values())f(v);for(const v of ee.values())f(v);for(const v of Ta.values())f(v);return n},jt=()=>{var d,R;if(ot.length===0)return;const n=fa(),f=new Set;for(const b of n)f.add(b.demTex),f.add(b.satTex),f.add((d=b.fireHistory)==null?void 0:d.texture),f.add(b.shadow),f.add(b.smokeHeight);const v=b=>{!b||f.has(b)||(f.add(b),b.dispose())};for(const b of ot)n.has(b)||(v(b.demTex),v(b.satTex),v((R=b.fireHistory)==null?void 0:R.texture),v(b.shadow),b.smokeHeight&&(xe.delete(b.smokeHeight),v(b.smokeHeight)),b.fireHistory=null,b.shadow=null,b.smokeHeight=null,b.detectionSource=null);for(let b=ot.length-1;b>=0;b--){const C=ot[b];C===se||C===m||C===se.lite||C===m.lite||ot.splice(b,1)}},_t=(n,f)=>{const v=le.get(n);le.set(n,f),v&&v!==f&&Xt(v)},sa=n=>{const f=ee.get(n);return f&&(ee.delete(n),ee.set(n,f)),f},dt=(n,f,v)=>{for(_t(n,v),ee.set(f,v);ee.size>Fp;){const d=ee.keys().next().value,R=ee.get(d);ee.delete(d),Xt(R)}};p(Pr(m));const me=new Uint8Array(Ge*Ge*4),Pt=new Uint8Array(Ge*Ge*4),ia=n=>{const f=new Jt(n,Ge,Ge,kt,Nt);return f.minFilter=Va,f.magFilter=ze,f.generateMipmaps=!0,f.wrapS=Ke,f.wrapT=Ke,f.flipY=!1,f.needsUpdate=!0,f},tt=ia(me),ft=ia(Pt),ds=Od();let nn=-1,rn=-1,Zo=null;const go=Ge*Ge,ol=()=>{const n=new Jt(new Uint8Array(go),Ge,Ge,ju,Nt);return n.minFilter=ze,n.magFilter=ze,n.generateMipmaps=!1,n.flipY=!1,n.needsUpdate=!0,n},Qo=ol(),Jo=ol();let il="",nl="";const Ah=(n,f,v)=>{const d=n.detectionSource??(n.detectionSource=Qf(n.observerDataset.frames,n.frameCount,n.bbox,[n.widthKm,n.depthKm],Ge)),R=`${n.key}:${f}`;R!==il&&(Qo.image.data.set(d.subarray(f*go,(f+1)*go)),Qo.needsUpdate=!0,il=R);const b=`${n.key}:${v}`;b!==nl&&(Jo.image.data.set(d.subarray(v*go,(v+1)*go)),Jo.needsUpdate=!0,nl=b)},ei=new jf,na=new Jf,rl=M.current,ll={value:0},ln={value:0},cl={value:0},ul={value:0},hl=new ca(1,1,0,0),dl=new Le(1,1);let fs=null,ba=null,fl=null,cn=null,ms=0;const kh=n=>{var R,b;const f=Math.round(((R=n.grid)==null?void 0:R.nx)??0),v=Math.round(((b=n.grid)==null?void 0:b.ny)??0);if(!(f>0&&v>0&&f*v<=4e6)||typeof n.day_png!="string")return;const d=new Image;d.onload=()=>{if(S||fs!==n)return;const C=document.createElement("canvas");C.width=f,C.height=v;const te=C.getContext("2d",{willReadFrequently:!0});if(!te)return;te.drawImage(d,0,0,f,v);const Q=te.getImageData(0,0,f,v).data,ie=new Uint8Array(f*v);for(let ae=0;ae<v;ae++)for(let ue=0;ue<f;ue++)ie[(v-1-ae)*f+ue]=Q[(ae*f+ue)*4];const oe=Date.parse(/T/.test(n.span.start)?n.span.start:`${n.span.start}T00:00:00Z`),Re=ef(ie,oe,Date.parse(n.window.start),Date.parse(n.window.end)),ve=new Uint8Array(f*v*4);for(let ae=0;ae<f*v;ae++)ve[ae*4]=Re[ae]*64,ve[ae*4+1]=ie[ae],ve[ae*4+3]=255;const Ae=new Jt(ve,f,v,kt,Nt);Ae.magFilter=po,Ae.minFilter=po,Ae.generateMipmaps=!1,Ae.needsUpdate=!0,ba==null||ba.dispose(),ba=Ae,fl=n,cn=tf(n.box,f,v,n.grid.cell_km??.375,n.grid.bounds??null),dl.set(f,v)},d.src=n.day_png},ml={value:0};let un=null,pl="";const hn=new Le(0,0),vl=Array.from({length:64},()=>new ca(0,0,0,0)),dn={value:-1};let ti=null;const fn=[];let mn=1;const Ya=new ca(0,1,0,0);let gl=-1e9,xl="",pn=[];const wl=new Le(0,0),Ml=new H(0,to.maxMwKm2,to.minMwKm2),yl=new Le(.02,1),ai=new Le(.02,1),bl={value:0},zs=new Le(0,0),vn={value:0},gn={value:0},Sl={value:1},si=new Map;let oi=!1,xn;const Us=new ca(0,1,1e4,.4);let Tl=0,El=0,Rl=-1e9;const wn={value:0},$a={value:0};let Mn="",Bs=[],ii=0,ni=0,yn=!1,xo,Al="",kl="",_l=!1;const bn={value:0},wo={value:1};let Sn,ps="";const vs=[],Os=[],ri=[],Mo={value:0},Xa={value:1},Tn={value:0};let Fl="",Dl=!1,li,yo="",bo="detections",ut=new Float32Array(0),gs={patchOf:new Uint16Array(0),sizes:[]};const je=new Float64Array(Ir*7),xs=new Float64Array(Ir*3);let So=!1,ci="";const qt=new Float64Array(38).fill(Number.NaN);let To=null;const Pl=(n,f,v)=>{const R=Math.min(1,Math.max(0,v))*Math.max(1,f-1),b=Math.min(f-1,Math.floor(R)),C=Math.min(f-1,b+1),te=R-b,Q=Ge*Ge*4;return(Zo!==n||nn!==b)&&(me.set(n.subarray(b*Q,(b+1)*Q)),tt.needsUpdate=!0,nn=b),(Zo!==n||rn!==C)&&(Pt.set(n.subarray(C*Q,(C+1)*Q)),ft.needsUpdate=!0,rn=C),Zo=n,te},_h=Pl(m.tensor,m.frameCount,g.current.timeProgress),Eo=new Nd,ui=m.sunTrue.clone(),En=new H(1.4,1.29,1.17),Il=new H(.9,.8,.66),Cl=n=>{const f=(n.minElevM+n.maxElevM)*5e-4;ui.copy(n.sunTrue),Fd(f,n.sunTrue.y,En),Il.fromArray(ih(f,n.sunTrue.y))};Cl(m);const Ll={value:0},ja={uNight:Ll,uSkyView:{value:Eo.skyView.texture},uTransmittanceLut:{value:Eo.transmittance},uSunTrue:{value:ui},uCamAltKm:{value:8},uVerticalExaggeration:{value:$r},uFloorColor:{value:new H(.044,.06,.094)},uFloorHaze:{value:.3},uSkyExposure:{value:ur}},Nl=new Ju(62,48,32),zl=new St({vertexShader:Cd,fragmentShader:Ld,uniforms:ja,side:ao,depthWrite:!1}),Rn=new va(Nl,zl);Rn.renderOrder=-10,O.add(Rn);const An=new Le(m.frame.width,m.frame.depth),Ul=new Le(se.frame.unitsPerMetre[1],m.frame.unitsPerMetre[1]),kn=new Qi(34,34,1,1);kn.rotateX(-Math.PI/2);const _n=new St({vertexShader:Wd,fragmentShader:Vd,uniforms:{uSlabSize:{value:An},uShadowMix:{value:1}},transparent:!0,depthWrite:!1}),hi=new va(kn,_n);hi.position.y=Cs-.005,hi.renderOrder=-2,O.add(hi);const Bl=Pp(Au,m.frame.width,m.frame.depth,new Le),Ol=new Le(se.demGridRes,m.demGridRes),Hl=new Le(se.minElevM,se.maxElevM),Gl=new Le(m.minElevM,m.maxElevM),Kl=new Le(m.widthKm,m.depthKm),Wl=new ca(1,0,0,0),Vl=new ca(1,0,0,0),Yl=new ca(0,0,0,0),Ro={...iu},Ao={...iu},Fn=new Le(m.windDirUv[0],m.windDirUv[1]),$l=new H(...m.frame.unitsPerMetre),Xl=new ca(0,0,1,1),jl=(n,f,v,d)=>{const R=new Jt(new Uint8Array([n,f,v,d]),1,1,kt,Nt);return R.needsUpdate=!0,R},Dn=jl(128,128,255,0),Pn=jl(255,255,255,255),ql=new y0(A),Zl=n=>(n.shadow||(n.shadow=ql.bake(n.demTex,n.demGridRes,n.minElevM,n.maxElevM,n.frame.unitsPerMetre[1],n.frame.width,n.frame.depth,n.sunDir,n.demGridRes>=1024?2048:1024)),n.shadow.texture),Ql=n=>{const f=b0(n),v=new Ji;return v.setAttribute("position",new ha(f.position,3)),v.setAttribute("normal",new ha(f.normal,3)),v.setAttribute("uv",new ha(f.uv,2)),v.setIndex(new ha(f.index,1)),v.boundingSphere=new qu(new H(0,1,0),15),v},In=Ql(rh);let ws=null,ko=null;const N={uDemPrev:{value:se.demTex},uDemNext:{value:m.demTex},uDemRes:{value:Ol},uElevPrevRange:{value:Hl},uElevNextRange:{value:Gl},uMorph:{value:1},uSatPrev:{value:se.satTex},uSatNext:{value:m.satTex},uFieldTex0:{value:tt},uFieldTex1:{value:ft},uLipariTex:{value:ds},uFrameMix:{value:_h},uSunDir:{value:Se},uTime:{value:0},uCutawayMix:{value:1},uCutawayPlane:{value:0},uCutawayDir:{value:Bl},uReconMix:{value:0},uObserverMix:{value:0},uModisWeight:{value:1},uViirsWeight:{value:1},uUncertaintyMix:{value:g.current.showUncertainty?1:0},uSensitivity:{value:g.current.sensitivityThreshold},uExtentKm:{value:Kl},uModisPass:{value:Wl},uViirsPass:{value:Vl},uScanStrip:{value:Yl},uLatticeMix:{value:1},uHasSeaCoast:{value:m.hasSeaCoast?1:0},uLakeMix:{value:Iu(m)?1:0},uFireHist:{value:ct(m).texture},uFireTime:{value:0},uWindDirUv:{value:Fn},uReliefScale:{value:Ul},uSlabSize:{value:An},uAuxTex:{value:m.auxTex??Dn},uAuxNormals:{value:1},uAuxMix:{value:0},uShadowTex:{value:Zl(m)},uUnitsPerMetre:{value:$l},uOrthoTexelKm:{value:m.orthoTexelKm},uSatSharpen:{value:m.sharpen},uDetailTex:{value:Pn},uDetailRect:{value:Xl},uDetailMix:{value:0},uDetailTexelKm:{value:m.detailTexelKm},uSmokeShadowTex:{value:j.shadowTarget.texture},uSunTrue:{value:ui},uSunColor:{value:En},uSunTransmittance:{value:Il},uHazeStrength:{value:Ad},uSkyView:{value:Eo.skyView.texture},uSkyExposure:{value:ur},uEdgeFade:{value:0},uContextDem:{value:null},uContextRes:{value:1024},uContextScale:{value:5},uContextMix:{value:0},uContextOrtho:{value:null},uFloorColor:ja.uFloorColor,uFloorHaze:ja.uFloorHaze,uSmokeShadowMix:{value:0},uFootTex:{value:ei.texture},uFootMix:{value:wl},uFieldScale:{value:Ml},uHeatRange:{value:yl},uBeliefGrid:{value:na.grid},uBeliefBox:{value:na.box},uTileGrid:{value:hn},uTileState:{value:vl},uTileHover:dn,uScan:{value:Ya},uPixelOutline:{value:0},uBeliefMix:ll,uHeldOut:ln,uHeldOutOther:cl,uBurnedMix:ul,uBurnedBox:{value:hl},uBurnedSize:{value:dl},uDeclaredGiven:ml,uChanceSquares:wn,uDayJoin:vn,uDayFalse:gn,uMicroDetail:Sl,uRevealArrive:{value:Us},uAfterglow:Mo,uLightGain:Xa,uFarView:bn,uBeliefQuiet:Tn,uLightModis:bl,uLightTexels:{value:fo},uRevealed:{value:zs},uNight:$a,uMoonLift:wo},Jl=new St({vertexShader:lu,fragmentShader:If,uniforms:N}),di=new va(In,Jl);di.frustumCulled=!1,O.add(di);const ec=new St({vertexShader:lu,fragmentShader:Pf,uniforms:N,colorWrite:!1,polygonOffset:!0,polygonOffsetFactor:1,polygonOffsetUnits:2}),fi=new va(In,ec);fi.frustumCulled=!1,fi.renderOrder=-11,O.add(fi);const mi=new Bf({uSlabSize:N.uSlabSize,uElevNextRange:N.uElevNextRange,uReliefScale:N.uReliefScale,uUnitsPerMetre:N.uUnitsPerMetre,uSunDir:N.uSunDir,uSunTrue:N.uSunTrue,uSunColor:N.uSunColor,uSunTransmittance:N.uSunTransmittance,uHazeStrength:N.uHazeStrength,uSkyView:N.uSkyView,uSkyExposure:N.uSkyExposure,uFloorColor:N.uFloorColor,uFloorHaze:N.uFloorHaze,uContextDem:N.uContextDem,uContextRes:N.uContextRes,uContextScale:N.uContextScale,uContextMix:N.uContextMix,uContextOrtho:N.uContextOrtho,uNight:$a,uMoonLift:wo});O.add(mi.mesh);let ga=0;const tc=Zc(),Fh={uDemPrev:N.uDemPrev,uDemNext:N.uDemNext,uDemRes:N.uDemRes,uElevPrevRange:N.uElevPrevRange,uElevNextRange:N.uElevNextRange,uReliefScale:N.uReliefScale,uSlabSize:N.uSlabSize,uMorph:N.uMorph,uSunDir:N.uSunDir,uCutawayMix:N.uCutawayMix,uCutawayPlane:N.uCutawayPlane,uCutawayDir:N.uCutawayDir,uEdgeFade:N.uEdgeFade,uContextDem:N.uContextDem,uContextRes:N.uContextRes,uContextScale:N.uContextScale,uContextMix:N.uContextMix,uNight:$a,uMoonLift:wo},ac=new St({vertexShader:Gd,fragmentShader:Kd,uniforms:Fh,side:Ps}),_o=new va(tc,ac);_o.frustumCulled=!1,O.add(_o);const sc=new ca(0,1,0,-1e4),qa=new $0(Du);O.add(qa.group);let oc=!1;const pi=[];let Cn=0;const pe={azimuth:yt.azimuth,polar:yt.polar,distance:yt.distance,target:new H(...yt.target)},V={azimuth:yt.azimuth,polar:yt.polar,distance:yt.distance,target:new H(...yt.target)},Za=new lf,ic=new uf;let Ln=!1,Sa=!1,nc=!1,Nn=0,vi=Yo,ea=1;const qe={width:m.frame.width,depth:m.frame.depth},rc=()=>{qe.width=P.lerp(se.frame.width,m.frame.width,ea),qe.depth=P.lerp(se.frame.depth,m.frame.depth,ea),An.set(qe.width,qe.depth)},Zt=n=>(n-.5)*qe.width,Qt=n=>(.5-n)*qe.depth,gi=n=>n/qe.width+.5,xi=n=>.5-n/qe.depth,Tt=(n,f)=>{const v=Wo(m.alignedDem,m.demGridRes,n,f),d=Fs(v,m);if(ea>=.999||se===m)return d;const R=Wo(se.alignedDem,se.demGridRes,n,f),b=Fs(R,se);return b+(d-b)*ea},wi=()=>{N.uDemPrev.value=se.demTex,N.uDemNext.value=m.demTex,Ol.set(se.demGridRes,m.demGridRes),Hl.set(se.minElevM,se.maxElevM),Gl.set(m.minElevM,m.maxElevM),N.uSatPrev.value=se.satTex,N.uSatNext.value=m.satTex,Kl.set(m.widthKm,m.depthKm),N.uHasSeaCoast.value=m.hasSeaCoast?1:0,N.uLakeMix.value=Iu(m)?1:0,Fn.set(m.windDirUv[0],m.windDirUv[1]),N.uFireHist.value=ct(m).texture,Ul.set(se.frame.unitsPerMetre[1],m.frame.unitsPerMetre[1]),$l.set(...m.frame.unitsPerMetre),rc(),Se.copy(m.sunDir),Cl(m),Ee.position.copy(Se).multiplyScalar(20),N.uShadowTex.value=Zl(m),N.uAuxTex.value=m.auxTex??Dn,N.uAuxNormals.value=m.pack&&m.levelIsWater===!1?0:1,N.uOrthoTexelKm.value=m.orthoTexelKm,N.uSatSharpen.value=m.sharpen,N.uDetailTex.value=m.detailTex??Pn,Xl.set(...m.detailRect),N.uDetailTexelKm.value=m.detailTexelKm,m.auxTex||(N.uAuxMix.value=0),m.detailTex||(N.uDetailMix.value=0);const n=m.context;N.uContextDem.value=(n==null?void 0:n.demTexture)??null,N.uContextOrtho.value=(n==null?void 0:n.orthoTexture)??null,N.uContextRes.value=(n==null?void 0:n.gridRes)??1024,N.uContextScale.value=(n==null?void 0:n.scale)??5,mi.setContext(n),n||(ga=0,N.uContextMix.value=0)},Ta=new Map,lc=A.capabilities.maxTextureSize>=8192&&(navigator.deviceMemory??8)>=8&&!U,Dh=()=>{ws||(ws=Ql(1023),ko=Zc(1023),di.geometry=ws,fi.geometry=ws,_o.geometry=ko)},cc=(n,f,v)=>{const d=f.manifest.extent_km[0]/f.orthoSize;return{...n,key:`pack-${n.key}`,demTex:f.demTexture,alignedDem:f.alignedDem,levelIsWater:!f.levelInWholeMetres,demGridRes:f.demGridRes,minElevM:f.minElevM,maxElevM:f.maxElevM,satTex:f.orthoTexture,orthoLabel:f.orthoSize>=8192?"Esri 8K":"Esri 4K",demLabel:`${f.demGridRes}²`,orthoTexelKm:d,sharpen:0,shadow:(v==null?void 0:v.shadow)??null,pack:f,lite:n,auxTex:f.auxTexture,detailTex:(v==null?void 0:v.detailTex)??null,detailRect:(v==null?void 0:v.detailRect)??[0,0,1,1],detailTexelKm:(v==null?void 0:v.detailTexelKm)??d,context:(v==null?void 0:v.context)??null,contextState:(v==null?void 0:v.contextState)??"none",attribution:f.attribution||n.attribution}},uc=n=>{var f,v,d,R,b,C;(f=n.pack)==null||f.dispose(),(v=n.detailTex)==null||v.dispose(),(d=n.shadow)==null||d.dispose(),(R=n.context)==null||R.dispose(),n.fireHistory&&n.fireHistory!==((b=n.lite)==null?void 0:b.fireHistory)&&n.fireHistory.texture.dispose(),n.smokeHeight&&n.smokeHeight!==((C=n.lite)==null?void 0:C.smokeHeight)&&(xe.delete(n.smokeHeight),n.smokeHeight.dispose()),n.fireHistory=null,n.smokeHeight=null,n.detectionSource=null,n.context=null,n.pack=null,n.detailTex=null,n.shadow=null},zn=n=>{for(const[f,v]of Ta)f===n||v===se||v===m||(uc(v),Ta.delete(f))},Ph=n=>{if(n.pack||!n.packManifest)return n;const f=Ta.get(n.regionId);if(!(f!=null&&f.pack))return n;if(f.lite===n)return f;const v=cc(n,f.pack,f);return Ta.set(n.regionId,v),Xt(f),v},Ih=n=>{var R;const f=n.pack,v=(R=f==null?void 0:f.manifest.ortho_detail)==null?void 0:R[0];if(!f||!v||!lc||v.size>A.capabilities.maxTextureSize)return;const d=v.uv_rect;!Array.isArray(d)||d.length!==4||!(d[2]>d[0])||!(d[3]>d[1])||hh(Wa(g.current,v.url),D).then(b=>{if(!b)return;const C=Ta.get(n.regionId);if(S||!C||C.pack!==f){b.dispose();return}C.detailTex=b,C.detailRect=[d[0],d[1],d[2],d[3]],C.detailTexelKm=f.manifest.extent_km[0]*(d[2]-d[0])/v.size,m===C&&wi()})},Ch=n=>{const f=n.pack,v=cu(f==null?void 0:f.manifest.context);!f||!v||n.context||n.contextState!=="none"||(n.contextState="loading",Lf(v,{resolveUrl:d=>Wa(g.current,d),maxTextureSize:A.capabilities.maxTextureSize,maxAnisotropy:D,isCancelled:()=>S}).then(d=>{const R=Ta.get(n.regionId);if(S||!R||R.pack!==f){d==null||d.dispose();return}R.contextState=d?"none":"failed",d&&(R.context=d,m===R&&wi())}))},Lh=n=>{const f=n.packManifest;!f||n.pack||n.packState!=="none"||(n.packState="loading",Sf(f,{resolveUrl:v=>Wa(g.current,v),maxTextureSize:lc?A.capabilities.maxTextureSize:4096,maxAnisotropy:D,isCancelled:()=>S}).then(v=>{if(S){v==null||v.dispose();return}if(!v){n.packState="failed";return}if(n.packState="none",m!==n){v.dispose();return}zn(n.regionId);const d=cc(n,v,null);Ta.set(n.regionId,d),Mi(d,!0),vi=.62,Ih(d),Ch(d)}))},Mi=(n,f)=>{if(S)return;const v=Ph(n);if(v===m&&f)return;v.demGridRes>=1024&&Dh();const d=m.regionId!==v.regionId;nc=d,f?(se=ea<.5?se:m,m=v,Sa=!0,Nn=0,vi=Yo,ea=0,N.uMorph.value=0):(se=v,m=v,Sa=!1,ea=1,N.uMorph.value=1,zn(v.regionId),jt()),d&&f&&(N.uAuxMix.value=0),wi(),Zo=null,p(Pr(v)),bs=!0,v.pack||Lh(v)},hc=n=>{S||m.regionId===n.regionId&&(Mi(n,!0),vi=.62)},dc=new WeakMap,Nh=(n,f)=>{var rt,xt;let v=dc.get(n);v||dc.set(n,v=new Map);const d=v.get(f);if(d!==void 0)return d;if(v.set(f,null),n.observerDataset.dataSource!=="firms")return null;const[R,b,C,te]=n.bbox,Q=Date.parse(((xt=(rt=n.observerDataset.frames[f])==null?void 0:rt[0])==null?void 0:xt.timeUtc)??""),ie=[],oe=[];for(const he of n.observerDataset.frames)for(const ke of he){if(ke.hidden||ke.revealed)continue;const We=Date.parse(ke.timeUtc??""),ge=Number.isFinite(Q)&&Number.isFinite(We)&&Math.abs(We-Q)<=rv;for(const Me of ke.footprints){const Te=(Me.lon-R)/Math.max(1e-9,C-R),Ce=(Me.lat-b)/Math.max(1e-9,te-b),Kt=Math.max(1,Me.frpMw);ie.push(Te,Ce,Kt),ge&&oe.push(Te,Ce,Kt)}}const Re=he=>{let ke=0,We=0,ge=0;for(let Me=0;Me<he.length;Me+=3)ke+=he[Me]*he[Me+2],We+=he[Me+1]*he[Me+2],ge+=he[Me+2];return ge>0?[ke/ge,We/ge]:null},ve=(he,ke,We)=>Math.hypot((he[ke]-We[0])*n.widthKm,(he[ke+1]-We[1])*n.depthKm),Ae=(he,ke)=>{let We=0,ge=0;for(let Me=0;Me<he.length;Me+=3)ge+=he[Me+2],ve(he,Me,ke)<lv&&(We+=he[Me+2]);return ge>0?We/ge:0};let ae=Re(ie);if(!ae)return null;let ue=ie;const we=Re(oe);we&&Ae(oe,ae)<.1&&Ae(oe,we)>=.3&&(ae=we,ue=oe);let Oe=1/0;for(let he=0;he<ue.length;he+=3)Oe=Math.min(Oe,ve(ue,he,ae));if(Oe>sv){const he=Math.max(1,Math.ceil(n.widthKm/Uu)),ke=Math.max(1,Math.ceil(n.depthKm/Uu)),We=Oo(new Float32Array(ue),he,ke),ge=new Float64Array(We.sizes.length),Me=new Float64Array(We.sizes.length*2);for(let Ce=0;Ce<We.patchOf.length;Ce++){const Kt=We.patchOf[Ce],Ft=ue[Ce*3+2];ge[Kt]+=Ft,Me[Kt*2]+=Ft*ue[Ce*3],Me[Kt*2+1]+=Ft*ue[Ce*3+1]}let Te=0;for(let Ce=1;Ce<ge.length;Ce++)ge[Ce]>ge[Te]&&(Te=Ce);ge[Te]>0&&(ae=[Me[Te*2]/ge[Te],Me[Te*2+1]/ge[Te]])}return v.set(f,ae),ae};let yi=1;const za=(n,f,v,d)=>{var Ha;const R=!!g.current.tileBoard,b=eu(n,f,v,d,R);if(f&&R&&n==="region"&&yi>1)return{...b,distance:b.distance*yi};if(!f||n!=="canyon"&&n!=="ridge")return b;const C=n==="canyon"?"subpixel":"front",te=m.findings.find(Ye=>Ye.kind===C),Q=m.observerDataset.frames.length,ie=Math.min(Q-1,Math.max(0,Math.round(P.clamp(g.current.timeProgress,0,1)*(Q-1)))),oe=Nh(m,ie);if(!te&&!oe)return b;const[Re,ve,Ae,ae]=m.bbox;let ue=oe?P.clamp(oe[0],.1,.9):P.clamp((te.lon-Re)/Math.max(1e-4,Ae-Re),.2,.8),we=oe?P.clamp(oe[1],.1,.9):P.clamp((te.lat-ve)/Math.max(1e-4,ae-ve),.2,.8);const Oe=n==="canyon"?(Ha=m.declared)==null?void 0:Ha.byFrame.get(ie):void 0;let rt=null,xt=null;if(Oe&&Oe.length>0&&m.declared)rt=m.declared,xt=Oe;else if(n==="canyon"&&bo==="estimate"&&ut.length>0&&m.runId){const Ye=rl.get(m.runId);if(Ye){const{nx:He,ny:ce}=Ye.info,$e=new Set;for(let wt=0;wt<ut.length;wt+=3){const Mt=Math.min(He-1,Math.max(0,Math.floor(ut[wt]*He))),re=Math.min(ce-1,Math.max(0,Math.floor((1-ut[wt+1])*ce)));$e.add(re*He+Mt)}rt={nx:He,ny:ce},xt=Uint32Array.from($e)}}let he=null,ke=null;if(rt&&xt&&xt.length>0){const Ye=xt,{nx:He,ny:ce}=rt,$e=new Float32Array(Ye.length*3);Ye.forEach((Be,De)=>{$e[De*3]=(Be%He+.5)/He,$e[De*3+1]=1-(Math.floor(Be/He)+.5)/ce,$e[De*3+2]=1});const wt=Oo($e,He,ce);let Mt=0;for(let Be=0;Mt<wt.sizes.length&&Be<Ou*Ye.length;Mt++)Be+=wt.sizes[Mt];let re=1,_e=0,Fe=1,Ze=0;he=[],ke=[];for(let Be=0;Be<Ye.length;Be++){const De=Ye[Be],Ne=De%He/He,Ue=1-Math.floor(De/He)/ce,Dt=Ne+1/He,Vt=Ue-1/ce;ke.push(Ne,Vt,Dt,Vt,Ne,Ue,Dt,Ue),!(wt.patchOf[Be]>=Mt)&&(re=Math.min(re,Ne),_e=Math.max(_e,Dt),Fe=Math.min(Fe,Vt),Ze=Math.max(Ze,Ue),he.push(Ne,Vt,Dt,Vt,Ne,Ue,Dt,Ue))}ue=P.clamp((re+_e)/2,.05,.95),we=P.clamp((Fe+Ze)/2,.05,.95)}const We=Zt(ue),ge=Qt(we),Me=Math.hypot(We,ge),Te=Math.atan2(-We,-ge),Ce=P.smoothstep(Me,.8,3.2),Kt=Math.atan2(m.sunDir.x,m.sunDir.z);let Ft=b.azimuth,Oa=-1e9;for(let Ye=0;Ye<72;Ye++){const He=Ye/72*Math.PI*2-Math.PI;let ce=He-Au;for(;ce>Math.PI/2;)ce-=Math.PI;for(;ce<-Math.PI/2;)ce+=Math.PI;if(Math.abs(ce)>Mp)continue;let $e=Math.abs(He-Kt)%(Math.PI*2);$e>Math.PI&&($e=Math.PI*2-$e);const Mt=1-Math.min(1,Math.abs($e-Wi)/Wi)+.9*Ce*Math.cos(He-Te)+.2*Math.cos(He-b.azimuth);Mt>Oa&&(Oa=Mt,Ft=He)}let Qe=[We,Tt(ue,we)+.1,ge],ka=b.distance,Wt=b.polar;if(he&&ke){const Ye=Qe,He=$e=>{let wt={target:Ye,distance:b.distance,polar:b.polar};for(const Mt of[b.polar,...Hu].filter(re=>re<=b.polar)){let re=Ye,_e={distance:b.distance,fits:!1};for(let Fe=0;Fe<3&&(_e=pc($e,re,Ft,Mt),Fe!==2);Fe++)re=mc($e,re,Ft,Mt,_e.distance);if(wt={target:re,distance:_e.distance,polar:Mt},_e.fits)break}return wt};let ce=He(he);ke.length>he.length&&Bh(ke,ce.target,Ft,ce.polar,ce.distance)&&(ce=He(ke)),Qe=ce.target,ka=ce.distance,Wt=ce.polar}const aa=n==="canyon"?zh(m,ie):null;if(aa&&aa.length>0){const Ye=Gu/Math.max(.001,m.widthKm),He=Gu/Math.max(.001,m.depthKm),ce=Math.max(1,Math.round(1/Ye)),$e=Math.max(1,Math.round(1/He)),wt=new Float32Array(aa.length/2*3);for(let De=0,Ne=0;De<aa.length;De+=2,Ne+=3)wt[Ne]=aa[De],wt[Ne+1]=aa[De+1],wt[Ne+2]=1;const Mt=Oo(wt,ce,$e);let re=0;const _e=aa.length/2;for(let De=0;re<Mt.sizes.length&&De<Ou*_e;re++)De+=Mt.sizes[re];const Fe=he?[...he]:[],Ze=[];for(let De=0;De<_e;De++){if(Mt.patchOf[De]>=re)continue;const Ne=aa[De*2]-Ye/2,Ue=aa[De*2+1]-He/2;Fe.push(Ne,Ue,Ne+Ye,Ue,Ne,Ue+He,Ne+Ye,Ue+He),Ze.push(aa[De*2],aa[De*2+1])}if(Uh(Fe,Qe,Ft,Wt,ka*Cr)||fc(Ze,Qe,Ft,Wt,ka)>Ku){const De=Qe;let Ne=null;for(const Ue of[Wt,...Hu].filter(Dt=>Dt<=Wt)){let Dt=De,Vt={distance:ka,fits:!1};for(let Ut=0;Ut<3&&(Vt=pc(Fe,Dt,Ft,Ue),Ut!==2);Ut++)Dt=mc(Fe,Dt,Ft,Ue,Vt.distance);const as=fc(Ze,Dt,Ft,Ue,Vt.distance),_a={target:Dt,distance:Vt.distance,polar:Ue,fits:Vt.fits,hidden:as};if(Vt.fits&&as<=Ku){Ne=_a;break}(!Ne||_a.fits&&(!Ne.fits||as<Ne.hidden))&&(Ne=_a)}Ne&&(Qe=Ne.target,ka=Ne.distance,Wt=Ne.polar)}}return{...b,azimuth:Ft,polar:Wt,distance:ka,target:Qe}},zh=(n,f)=>{if(n.observerDataset.dataSource!=="firms")return null;const[v,d,R,b]=n.bbox,C=[];for(const te of n.observerDataset.frames[f]??[])if(!(!te.revealed||te.revealedByLook))for(const Q of te.footprints)C.push((Q.lon-v)/Math.max(1e-9,R-v),(Q.lat-d)/Math.max(1e-9,b-d));return C.length>0?C:null},Uh=(n,f,v,d,R)=>{const b=Go(g.current.workspaceSubjectFrame)??{left:0,top:0,right:1,bottom:1},C=Math.tan(P.degToRad(zr/2)),te=(b.right-b.left)*C*k.aspect,Q=(b.bottom-b.top)*C,ie=new H().setFromSphericalCoords(1,d,v),oe=ie.clone().negate(),Re=new H().crossVectors(oe,new H(0,1,0)).normalize(),ve=new H().crossVectors(Re,oe),Ae=new H(f[0],f[1],f[2]).addScaledVector(ie,R),ae=new H;for(let ue=0;ue<n.length;ue+=2){ae.set(Zt(n[ue]),Tt(n[ue],n[ue+1]),Qt(n[ue+1])).sub(Ae);const we=ae.dot(oe);if(we<=.05||Math.abs(ae.dot(Re)/we)>te||Math.abs(ae.dot(ve)/we)>Q)return!0}return!1},fc=(n,f,v,d,R)=>{if(n.length===0)return 0;const b=new H().setFromSphericalCoords(1,d,v),C=f[0]+b.x*R,te=f[1]+b.y*R,Q=f[2]+b.z*R;let ie=0;for(let oe=0;oe<n.length;oe+=2){const Re=n[oe],ve=n[oe+1],Ae=Zt(Re),ae=Tt(Re,ve),ue=Qt(ve);for(let we=1;we<32;we++){const Oe=we/32,rt=gi(C+(Ae-C)*Oe),xt=xi(Q+(ue-Q)*Oe);if(!(rt<0||rt>1||xt<0||xt>1)&&Tt(rt,xt)>te+(ae-te)*Oe+.012){ie+=1;break}}}return ie/(n.length/2)},Bh=(n,f,v,d,R)=>{const b=Go(g.current.workspaceSubjectFrame)??{top:0,bottom:1},C=(b.bottom-b.top)*Math.tan(P.degToRad(zr/2)),te=new H().setFromSphericalCoords(1,d,v),Q=te.clone().negate(),ie=new H().crossVectors(Q,new H(0,1,0)).normalize(),oe=new H().crossVectors(ie,Q),Re=new H(f[0],f[1],f[2]).addScaledVector(te,R),ve=new H;for(let Ae=0;Ae<n.length;Ae+=2){ve.set(Zt(n[Ae]),Tt(n[Ae],n[Ae+1]),Qt(n[Ae+1])).sub(Re);const ae=ve.dot(Q);if(ae>.05&&ve.dot(oe)/ae<-C)return!0}return!1},mc=(n,f,v,d,R)=>{const b=new H().setFromSphericalCoords(1,d,v),C=b.clone().negate(),te=new H().crossVectors(C,new H(0,1,0)).normalize(),Q=new H().crossVectors(te,C),ie=new H(f[0],f[1],f[2]).addScaledVector(b,R);let oe=1/0,Re=-1/0,ve=1/0,Ae=-1/0;const ae=new H;for(let he=0;he<n.length;he+=2){ae.set(Zt(n[he]),Tt(n[he],n[he+1]),Qt(n[he+1])).sub(ie);const ke=ae.dot(C);if(ke<=.05)continue;const We=ae.dot(te)/ke,ge=ae.dot(Q)/ke;oe=Math.min(oe,We),Re=Math.max(Re,We),ve=Math.min(ve,ge),Ae=Math.max(Ae,ge)}if(!Number.isFinite(oe))return f;const ue=C.clone().addScaledVector(te,(oe+Re)/2).addScaledVector(Q,(ve+Ae)/2);if(ue.y>=-1e-4)return f;const we=(f[1]-ie.y)/ue.y,Oe=ie.clone().addScaledVector(ue,we),rt=P.clamp(Oe.x/qe.width+.5,.05,.95),xt=P.clamp(.5-Oe.z/qe.depth,.05,.95);return[Zt(rt),Tt(rt,xt)+.1,Qt(xt)]},pc=(n,f,v,d)=>{const R=Go(g.current.workspaceSubjectFrame)??{left:0,top:0,right:1,bottom:1},b=Math.tan(P.degToRad(zr/2)),C=(R.right-R.left)*b*k.aspect*Bu,te=(R.bottom-R.top)*b*Bu,Q=[];for(let we=0;we<n.length;we+=2)Q.push(Zt(n[we]),Tt(n[we],n[we+1]),Qt(n[we+1]));const ie=new H().setFromSphericalCoords(1,d,v),oe=ie.clone().negate(),Re=new H().crossVectors(oe,new H(0,1,0)).normalize(),ve=new H().crossVectors(Re,oe),Ae=we=>{const Oe=f[0]+ie.x*we,rt=f[1]+ie.y*we,xt=f[2]+ie.z*we;for(let he=0;he<Q.length;he+=3){const ke=Q[he]-Oe,We=Q[he+1]-rt,ge=Q[he+2]-xt,Me=ke*oe.x+We*oe.y+ge*oe.z;if(Me<=.05||Math.abs((ke*Re.x+We*Re.y+ge*Re.z)/Me)>C||Math.abs((ke*ve.x+We*ve.y+ge*ve.z)/Me)>te)return!1}return!0};if(Ae(Lr))return{distance:Lr,fits:!0};if(!Ae(Nr))return{distance:Nr,fits:!1};let ae=Lr,ue=Nr;for(let we=0;we<22;we++){const Oe=(ae+ue)/2;Ae(Oe)?ue=Oe:ae=Oe}return{distance:ue,fits:!0}},Oh=n=>{var Mt;const f=m,[v,d,R,b]=f.bbox,C=f.findings.find(re=>re.kind==="front")??f.findings.find(re=>re.kind==="subpixel")??f.findings[0];let te=.5,Q=.5;C&&(te=P.clamp((C.lon-v)/Math.max(1e-4,R-v),.25,.75),Q=P.clamp((C.lat-d)/Math.max(1e-4,b-d),.25,.75));const ie=f.observerDataset.dataSource==="firms";if(ie){const re=Math.min(f.frameCount-1,Math.max(0,Math.round(P.clamp(n,0,1)*(f.frameCount-1))));let _e=0,Fe=0,Ze=0;for(const Be of f.observerDataset.frames[re]??[])if(!Be.hidden)for(const De of Be.footprints)_e+=De.frpMw,Fe+=De.frpMw*(De.lon-v)/Math.max(1e-4,R-v),Ze+=De.frpMw*(De.lat-d)/Math.max(1e-4,b-d);_e>0&&(te=P.clamp(Fe/_e,.15,.85),Q=P.clamp(Ze/_e,.15,.85))}const oe=f.frame.width,Re=f.frame.depth,ve=oe*.5,Ae=Re*.5,ae=(re,_e)=>Fs(Wo(f.alignedDem,f.demGridRes,re/oe+.5,.5-_e/Re),f),ue=cu((Mt=f.packManifest)==null?void 0:Mt.context)!==null&&f.contextState!=="failed",we=(te-.5)*oe,Oe=(.5-Q)*Re,rt=ae(we,Oe)+.05,xt=Math.min(f.frameCount-1,Math.max(0,Math.round(P.clamp(n,0,1)*(f.frameCount-1)))),he=xt*Ge*Ge*4,ke=[],We=(re,_e,Fe)=>{ke.push(re,ae(re,_e)+.03,_e,(ae(re-.1,_e)-ae(re+.1,_e))/.2,(ae(re,_e-.1)-ae(re,_e+.1))/.2,Fe)};if(f.observerDataset.dataSource==="firms"){const re=[];for(const Ze of f.observerDataset.frames[xt]??[])if(!Ze.hidden)for(const Be of Ze.footprints)re.push(Be);const _e=Math.max(1,Math.ceil(re.length/320)),Fe=f.frame.unitsPerMetre[0]*f.frame.unitsPerMetre[2]*1e6;for(let Ze=0;Ze<re.length;Ze+=_e){const Be=re[Ze],De=((Be.lon-v)/Math.max(1e-4,R-v)-.5)*oe,Ne=(.5-(Be.lat-d)/Math.max(1e-4,b-d))*Re;Math.abs(De)>ve||Math.abs(Ne)>Ae||We(De,Ne,Be.acrossTrackKm*Be.alongTrackKm*Fe*_e)}}else{const re=3*oe/(Ge-1)*(3*Re/(Ge-1));for(let _e=2;_e<Ge-2;_e+=3)for(let Fe=2;Fe<Ge-2;Fe+=3)f.tensor[he+(_e*Ge+Fe)*4]/255<=qo||We((Fe/(Ge-1)-.5)*oe,(.5-_e/(Ge-1))*Re,re)}const ge=ke.length/6,Me=Math.tan(Gi*Math.PI/360),Te=4*Me*Me*1.6,Ce=2*Math.atan(Me*(16/9))/1920,Kt=Math.min(Tp,f.orthoTexelKm*1e3*f.frame.unitsPerMetre[0]/(Sp*Ce)),Ft=ae(we-.12,Oe)-ae(we+.12,Oe),Oa=ae(we,Oe-.12)-ae(we,Oe+.12),Qe=Math.hypot(Ft,Oa)||1,ka=Math.atan2(f.sunDir.x,f.sunDir.z),Wt=Math.hypot(f.windDirUv[0]*oe,f.windDirUv[1]*Re)||1,aa=f.windDirUv[0]*oe/Wt,Ha=-f.windDirUv[1]*Re/Wt,Ye=Math.atan(Math.tan(Gi*Math.PI/360)*(16/9))+Ki;let He={...yt,target:[we,rt,Oe]},ce=-1e9;const $e={floorShare:1,seaShare:0,ridgeLines:0,ridgeLinesMost:0,fireShare:0,fireFrameShare:0,carryDistance:0,skylineDeg:0,eyeAboveGroundM:0,nearGround:0},wt=f.frame.unitsPerMetre[1];for(const re of yp)for(let _e=0;_e<48;_e++){const Fe=_e/48*Math.PI*2-Math.PI,Ze=we+re*Math.sin(Fe),Be=Oe+re*Math.cos(Fe);if(ve-Math.abs(Ze)<.35||Ae-Math.abs(Be)<.35)continue;let De=ae(Ze,Be);for(const Ut of[-1,1]){const Bt=Fe+Ut*Ki;De=Math.max(De,ae(we+re*Math.sin(Bt),Oe+re*Math.cos(Bt)))}let Ne=Math.abs(Fe-ka)%(Math.PI*2);Ne>Math.PI&&(Ne=Math.PI*2-Ne);const Ue=1-Math.min(1,Math.abs(Ne-Wi)/Wi),Dt=Math.sin(Fe)*aa+Math.cos(Fe)*Ha,Vt=Math.max(0,Dt),as=ue?.45*Math.max(0,-Dt)+(ie?.16:-.12)*re:0,_a=(Ft*Math.sin(Fe)+Oa*Math.cos(Fe))/Qe;for(let Ut=0;Ut<Ia;Ut++){const Bt=-Ye+2*Ye*Ut/(Ia-1),ss=Fe+Math.PI-Bt,os=Math.sin(ss),is=Math.cos(ss);let wa=0;for(;wa<Zs;wa++){const ra=.3+wa*Ar,ns=Ze+os*ra,Ga=Be+is*ra;if(Math.abs(ns)>ve||Math.abs(Ga)>Ae)break;Si[Ut*Zs+wa]=ae(ns,Ga)}On[Ut]=wa}for(const Ut of bp){const Bt=De+Ut*wt;let ss=1e6;for(let L=1;L<10;L++){const Y=L/10;ss=Math.min(ss,Bt+(rt-Bt)*Y-ae(Ze+(we-Ze)*Y,Be+(Oe-Be)*Y))}if(ss<.03)continue;let os=0,is=0,wa=0,ra=-1e6,ns=0,Ga=0,Io=0;for(let L=0;L<Ia;L++){const Y=-Ye+2*Ye*L/(Ia-1),q=On[L];let Z=-1e6,Je=0,$=0;for(let B=0;B<q;B++){const J=.3+B*Ar,X=(Si[L*Zs+B]-Bt)/J;X>Z?(Je>=2&&J>re&&$++,Z=X,Je=0):X<Z-.004&&Je++}if(Z<0){const B=q>0?Si[L*Zs+q-1]:1;ue||f.hasSeaCoast&&B<.004?is++:os++}wa+=Math.max(Z,-.2),ra=Math.max(ra,Z),Math.abs(Y)<Ye*.55&&(ns+=$,Ga=Math.max(Ga,$),Io++)}const Ws=ra-.59*2*Me;let rs=1e6;for(let L=0;L<Ia;L++){const Y=On[L];for(let q=0;q<Y;q++){const Z=.3+q*Ar;if(Z>=rs)break;const Je=Si[L*Zs+q];if(Je>.004&&(Je-Bt)/Z>Ws){rs=Z;break}}}const Ui=ra-(rt-Bt)/re;let Co=0,Lo=0,Vs=0;const Bi=ra-Rp*(ra-Ws);for(let L=0;L<ge;L++){const Y=ke[L*6],q=ke[L*6+1],Z=ke[L*6+2],Je=Math.hypot(Y-Ze,Z-Be);if(Je<.5)continue;let $=Math.atan2(Y-Ze,Z-Be)-(Fe+Math.PI);if($-=Math.round($/(Math.PI*2))*Math.PI*2,Math.abs($)>Ye*.8)continue;const B=(q-Bt)/Je;if(B<Bi&&Lo++,B<Ws||B>ra)continue;let J=!0;for(let X=1;X<8&&J;X++){const de=X/8;Bt+(q-Bt)*de<ae(Ze+(Y-Ze)*de,Be+(Z-Be)*de)-.01&&(J=!1)}if(J){Co++;const X=ke[L*6+3],de=ke[L*6+4],Xe=Ze-Y,at=Bt-q,mt=Be-Z,Ot=Xe*Xe+at*at+mt*mt,Ht=Math.max(0,(X*Xe+at+de*mt)/(Math.hypot(X,1,de)*Math.sqrt(Ot)));Vs+=ke[L*6+5]*Math.hypot(X,1,de)*Ht/(Ot*Te)}}const Ys=ge>0?Co/ge:0,No=os/Ia,zo=is/Ia,F=ns/Math.max(1,Io),G=wa/Ia,W=-9*No-(os>0?3:0)-.6*zo+1.1*Math.min(F,2)+.3*Math.min(Math.max(F-2,0),1)+.8*Ue+.5*P.clamp(_a*2,-1,1)+(ie?4*Ys:2.4*Math.min(Ys,.5))+2.5*Math.min(1,Vs/Ep)-(ie&&ge>0?7*Lo/ge:0)-.5*Vt+as-(rs<Kt?5+4*(1-rs/Kt):0)-8*Math.max(0,Ui-.2)-4*Math.max(0,.04-G);if(W>ce){ce=W;const L=Math.hypot(re,Bt-rt);He={azimuth:Fe,polar:Math.acos(P.clamp((Bt-rt)/L,-1,1)),distance:L,target:[we,rt,Oe]},$e.floorShare=No,$e.seaShare=zo,$e.ridgeLines=F,$e.ridgeLinesMost=Ga,$e.fireShare=Ys,$e.fireFrameShare=Vs,$e.carryDistance=Kt,$e.skylineDeg=Math.atan(G)*180/Math.PI,$e.eyeAboveGroundM=Ut,$e.nearGround=rs}}}return bi=$e,He};let Ua=null,vc="",Un=!1;const Hh=(n,f)=>{const v=Math.min(32,Math.max(1,Math.round(f))),d=[];k.updateMatrixWorld();for(let R=0;R<=v;R++)for(let b=0;b<=v;b++){const C=b/v,te=1-R/v,Q=Fs(Wo(n.alignedDem,n.demGridRes,C,te),n);Fo.set((C-.5)*qe.width,Q,(.5-te)*qe.depth).project(k),d.push(Fo.z>1||Fo.z<-1?null:[(Fo.x*.5+.5)*ht,(.5-Fo.y*.5)*vt])}return{divisions:v,points:d}},Fo=new H,Bn=n=>n.landingFrame===void 0?n.landingFrame=Dv(n.observerDataset,n.bbox,n.widthKm,n.depthKm):n.landingFrame,gc=()=>{const n=m.contextState==="failed"?`${m.key}!`:m.key;if(!Ua||vc!==n){const f=Bn(m);Ua=Oh(f!==null?f/Math.max(1,m.frameCount-1):g.current.timeProgress),vc=n,Es=_s}return Ua};let bi={floorShare:1,seaShare:0,ridgeLines:0,ridgeLinesMost:0,fireShare:0,fireFrameShare:0,carryDistance:0,skylineDeg:0,eyeAboveGroundM:0,nearGround:0};const Si=new Float32Array(Ia*Zs),On=new Int32Array(Ia),xc=(n,f,v)=>{const d=n.context;if(!d)return 0;const R=n.frame,[b,C,te]=R.unitsPerMetre,Q=Math.hypot(Math.max(Math.abs(f)-R.width*.5,0)/(b*1e3),Math.max(Math.abs(v)-R.depth*.5,0)/(te*1e3)),ie=.25*(R.width/b+R.depth/te)*.001;return(Of(d,f/(R.width*d.scale)+.5,.5-v/(R.depth*d.scale))-n.minElevM-Nf(Q,ie)*1e3)*C},Ms=new Float32Array((Qs*Qs+Js*Js)*3),Gh=()=>{let n=0;for(let v=0;v<Qs;v++){const d=v/(Qs-1);for(let R=0;R<Qs;R++){const b=R/(Qs-1);Ms[n*3]=Zt(b),Ms[n*3+1]=Tt(b,d),Ms[n*3+2]=Qt(d),n++}}const f=m.context;if(f&&ga>.5){const v=m.frame;for(let d=0;d<Js;d++){const R=d/(Js-1);for(let b=0;b<Js;b++){const te=(b/(Js-1)-.5)*v.width*f.scale,Q=(.5-R)*v.depth*f.scale;Math.abs(te)<=v.width*.5&&Math.abs(Q)<=v.depth*.5||(Ms[n*3]=te,Ms[n*3+1]=xc(m,te,Q),Ms[n*3+2]=Q,n++)}}}return n};let xa=!1;const wc=Cu();let ta=null,Mc="",yc=null,ys=!0,Hn=0,Do=-1,bc=null,Ti=0,Sc=-1,Tc=0;of();let Gn=!1,Ei=0,Qa=0,Hs=!0,It=null,Gt=null,Gs=0,Ja=null,bs=!1,Ec=!1,Rc=!1;const Kn=n=>{pe.azimuth=n.azimuth,pe.polar=n.polar,pe.distance=n.distance,pe.target.set(n.target[0],n.target[1],n.target[2])},Kh=n=>{const f=g.current,v=le.get(n);v&&v!==m&&Mi(v,!0);const d=za(f.cameraPreset,f.inWorkspace,f.mode,n);Za.trigger(V,d,2.15,Yo),xa=!1,bs=!1},Wh=()=>{const n=g.current;Za.cancel(),!n.inWorkspace&&n.landingView!=="slab"?(gc(),pe.azimuth=V.azimuth,pe.polar=V.polar,pe.distance=V.distance,pe.target.copy(V.target)):Kn(za(n.cameraPreset,n.inWorkspace,n.mode,n.activeTheaterId)),xa=!1,bs=!1},Vh=n=>{if(n&&!Ln)Za.cancel(),ic.startAtTheater(g.current.activeTheaterId);else if(!n&&Ln){const f=new H(0,.65,0);k.getWorldDirection(f),f.multiplyScalar(10.5).add(k.position),hf(k.position,f,V),pe.azimuth=V.azimuth,pe.polar=V.polar,pe.distance=V.distance,pe.target.copy(V.target),k.up.set(0,1,0)}Ln=n};E.current={activateBundle:Mi,upgradeBundleInPlace:hc,bundleCache:le,takeRunBundle:sa,storeRunBundle:dt,onScreenRegionId:()=>m.regionId,maxAnisotropy:D,texLoader:z,triggerSlew:Kh,applyCameraPreset:Wh,syncCinemaStart:Vh},(async()=>{try{const n=await fetch($u("generated/terrain/ca_dem_f32.bin")).catch(()=>null),f=new Promise(Re=>{z.load($u("generated/terrain/ca_satellite.jpg"),ve=>{ve.colorSpace=it,ve.anisotropy=D,ve.wrapS=Ke,ve.wrapT=Ke,Re(ve)},void 0,()=>Re(null))}),[v,d]=await Promise.all([n&&n.ok?n.arrayBuffer():Promise.resolve(null),f]);if(S)return;const R=le.get("plumas_ca");if(!R||R.runId!==null)return;const b=Vo.plumas_ca,C=v?Ds(new Float32Array(v),!0):{texture:R.demTex,aligned:R.alignedDem,gridRes:R.demGridRes,minElev:R.minElevM,maxElev:R.maxElevM},te={buffer:Fr(),frames:so},Q=Dr(),ie=Hr("plumas_ca",b.bbox,C.aligned,C.gridRes,te.buffer,te.frames),oe={...R,...Or(b.widthKm,kr(b.bbox),null,1024,d?Xu:""),fireHistory:null,key:"static-plumas_ca",noRealGround:v?void 0:R.noRealGround,noRealPicture:d?void 0:R.noRealPicture,demTex:C.texture,alignedDem:C.aligned,demGridRes:C.gridRes,minElevM:C.minElev,maxElevM:C.maxElev,satTex:d??R.satTex,orthoLabel:"1K",demLabel:`${C.gridRes}²`,tensor:te.buffer,frameCount:te.frames,observerDataset:Q,findings:ie.anchors,callouts:ie.callouts};_t("plumas_ca",oe),hc(oe)}catch{}})();let ht=Math.max(1,x.clientWidth),vt=Math.max(1,x.clientHeight),Ri=1;const Wn=()=>{x&&(ht=Math.max(1,x.clientWidth),vt=Math.max(1,x.clientHeight),I=yu(),K.setSize(ht,vt,I*Ri),k.aspect=ht/vt)};Wn();const Yh=new k0,$h=n=>{const f=Yh.feed(n,document.hidden);f!==null&&(Ri=f,K.setSize(ht,vt,I*Ri))},Ac=new ResizeObserver(Wn);Ac.observe(x);let es=null;const Vn=()=>{Wn(),kc()},kc=()=>{es==null||es.removeEventListener("change",Vn),es=window.matchMedia(`(resolution: ${window.devicePixelRatio||1}dppx)`),es.addEventListener("change",Vn)};kc();let Ea=!1,_c=0,Yn=0,$n=0,Ai=0,ki=Number.NaN,Xn=Number.NaN,Fc=!1;const _i=new H,jn=new xd,Dc=new Le,Pc=(n,f,v,d)=>{const R=A.domElement.getBoundingClientRect();if(R.width<=0||R.height<=0||n<R.left||n>R.right||f<R.top||f>R.bottom)return null;Dc.set((n-R.left)/R.width*2-1,-((f-R.top)/R.height)*2+1),jn.setFromCamera(Dc,k);const b=jn.ray.origin,C=jn.ray.direction,te=Math.max(.02,qe.width/400);for(let Q=0;Q<qe.width*6;Q+=te){const ie=b.x+C.x*Q,oe=b.y+C.y*Q,Re=b.z+C.z*Q,ve=gi(ie),Ae=xi(Re);if(!(ve<0||ve>1||Ae<0||Ae>1)&&oe<=Tt(ve,Ae)){const ae=Math.min(v-1,Math.floor(ve*v));return Math.min(d-1,Math.floor((1-Ae)*d))*v+ae}}return null},Ic=n=>{n.target instanceof HTMLElement&&n.target.closest('[data-stage-ui="true"]')||(Ea=!0,_c=n.button,n.clientX,n.clientY,Yn=n.clientX,$n=n.clientY,Ai=0,Za.cancel(),A.domElement.setPointerCapture(n.pointerId))},Cc=n=>{const f=g.current;if(ki=n.clientX,Xn=n.clientY,!Ea)return;const v=n.clientX-Yn,d=n.clientY-$n;if(Yn=n.clientX,$n=n.clientY,Ai+=Math.hypot(v,d),!f.cinemaActive)if(_c===2||n.shiftKey){xa=!0;const R=V.distance*.0011,b=Math.cos(V.azimuth),C=Math.sin(V.azimuth);pe.target.x=P.clamp(pe.target.x-(v*b-d*C)*R,-qe.width*.42,qe.width*.42),pe.target.z=P.clamp(pe.target.z-(-v*C-d*b)*R,-qe.depth*.42,qe.depth*.42)}else{xa=!0;const R=f.inWorkspace?.0046:.0028;pe.azimuth-=v*R;const b=f.inWorkspace?.12:.72,C=f.inWorkspace?1.36:1.18;pe.polar=P.clamp(pe.polar-d*R,b,C)}},Lc=n=>{var d,R,b;if(!Ea)return;Ea=!1,A.domElement.hasPointerCapture(n.pointerId)&&A.domElement.releasePointerCapture(n.pointerId);const f=g.current;!f.inWorkspace&&Ai<5&&n.button===0&&((d=f.onEnterWorkspace)==null||d.call(f));const v=f.tileBoard;if(v&&v.pickable&&f.inWorkspace&&Ai<5&&n.button===0){const C=Pc(n.clientX,n.clientY,v.cols,v.rows);C!==null&&!((R=v.tiles[C])!=null&&R.closed)&&((b=f.onTilePick)==null||b.call(f,C))}},Nc=()=>{ki=Number.NaN,Xn=Number.NaN},zc=n=>{const f=g.current;if(!f.inWorkspace||f.cinemaActive)return;n.preventDefault(),xa=!0,Za.cancel();const v=1+P.clamp(n.deltaY,-120,120)*.0011;pe.distance=P.clamp(pe.distance*v,4.6,23.5)},Uc=n=>{g.current.inWorkspace&&n.preventDefault()},Ra=A.domElement;Ra.addEventListener("pointerdown",Ic),window.addEventListener("pointermove",Cc,{passive:!0}),window.addEventListener("pointerup",Lc),Ra.addEventListener("pointerleave",Nc),Ra.addEventListener("wheel",zc,{passive:!1}),Ra.addEventListener("contextmenu",Uc);const Fi=window.matchMedia("(prefers-reduced-motion: reduce)");let Ss=Fi.matches;const Bc=()=>{Ss=Fi.matches};Fi.addEventListener("change",Bc);let ts=0,qn=0,Oc=performance.now(),Et=0;const Ts={scale:1,offsetX:0,offsetY:0},Rt={scale:1,offsetX:0,offsetY:0},Ks={scale:1,offsetX:0,offsetY:Pu},Aa=new Float32Array(Bp*3);let Hc=!1,Po=null,Di=0,Es=_s,Rs=null,gt=null;const Ba={scale:1,offsetX:0,offsetY:0};let Pi=_s,Ii=null,Gc=!1,Kc=null,Zn=!1,Ci=!1;const Li=(n,f,v,d,R=!1)=>{let b=0;for(let C=0;C<io;C++){const te=C/(io-1);for(let Q=0;Q<io;Q++){const ie=Q/(io-1);Aa[b*3]=Zt(ie),Aa[b*3+1]=Tt(ie,te),Aa[b*3+2]=Qt(te),b++}}for(let C=0;C<4;C++)Aa[b*3]=(C%2===0?-.5:.5)*qe.width,Aa[b*3+1]=Cs,Aa[b*3+2]=(C<2?-.5:.5)*qe.depth,b++;if(R){const C=Tt(.5,.5);for(let te=0;te<Eh;te++){const Q=te===0?0:Np,ie=(te-1)*Math.PI*.5;Aa[b*3]=Math.cos(ie)*Q,Aa[b*3+1]=C+(te===0?Cp:Lp),Aa[b*3+2]=Math.sin(ie)*Q,b++}}dp(Aa,b,f,v,39,ht/vt,n,d)};let Ni=0,Qn=0,zi=0,Jn=60,Wc=0;const nt=new H,Vc=n=>{var ra,ns,Ga,Io,Ws,rs,Ui,Co,Lo,Vs,Bi,Ys,No,zo;if(S)return;qn=requestAnimationFrame(Vc);const f=n-Oc,v=Math.min(.065,Math.max(.001,f*.001));Oc=n,Et+=v,$h(f);const d=g.current,R=1-Math.exp(-v*8.5),b=1-Math.exp(-v*5.8),C=!d.inWorkspace&&d.landingView!=="slab";if(C&&gc(),Sa){Nn+=ys?1e3:v;const F=Math.min(1,Nn/vi);ea=ch(F),N.uMorph.value=ea,rc(),F>=1&&(Sa=!1,ea=1,se=m,wi(),N.uMorph.value=1,zn(m.regionId),jt())}const te=m.auxTex?Sa&&se.regionId!==m.regionId?P.smoothstep(ea,.55,1):1:0;if(N.uAuxMix.value=P.lerp(N.uAuxMix.value,te,b),N.uDetailMix.value=P.lerp(N.uDetailMix.value,m.detailTex&&!oi?1:0,b),Rs=d.inWorkspace?null:Go(d.landingSubjectFrame),gt=d.inWorkspace&&!d.cleanHud&&!d.cinemaActive?Go(d.workspaceSubjectFrame):null,d.inWorkspace&&gt){const F=(gt.left+gt.right)*.5,G=(gt.top+gt.bottom)*.5,W=Ja??d.cameraPreset;if(W==="overview"||W==="nadir"||W==="region"){Pi+=1;const L=d.mode==="observer"&&W==="overview",Y=!!d.tileBoard;let q=ov;if(Ci&&Y&&W==="region")Li(gt,{azimuth:V.azimuth,polar:V.polar,distance:V.distance,target:[V.target.x,V.target.y,V.target.z]},0,Ba,L),q=nv,((ta==="play"?Gs>=1:Math.abs(V.distance-pe.distance)<.002*pe.distance)||xa)&&(Ci=!1,Pi=_s);else if(Pi>=_s||Ii!==W||Gc!==L||Rc!==Y||!Rr(Kc,gt)){Rc=Y;const $=eu(W,!0,d.mode,d.activeTheaterId,Y);Li(gt,$,0,Ba,L);let B=1;Y&&W==="region"&&Ba.scale<Wu&&(B=Math.min(iv,Wu/Math.max(.001,Ba.scale)),Li(gt,{...$,distance:$.distance*B},0,Ba,L)),Y&&W==="region"&&Math.abs(B-yi)>.005&&(yi=B,Zn=!0),Pi=0,Ii=W,Gc=L,Kc={...gt}}const Z=P.clamp(Ba.scale,q,1),Je=Math.max(.001,Ba.scale);Rt.scale=Z,Rt.offsetX=(Ba.offsetX+F)/Je*Z-F,Rt.offsetY=(Ba.offsetY+G)/Je*Z-G}else Ii=null,Rt.scale=1,Rt.offsetX=.5-F,Rt.offsetY=.5-G}else if(d.inWorkspace)Ii=null,Rt.scale=1,Rt.offsetX=0,Rt.offsetY=0;else if(C&&Ua){const F=Rs??_u;Es+=1;const G=ht/vt;if(Es>=_s||!Rr(Po,F)||Math.abs(Di-G)>1e-4){const W=Gh();vp(Ms,W,Ua,Ss?0:Ki,Gi,G,F,Ks),Po=F,Di=G,Es=0}Rt.scale=1,Rt.offsetX=0,Rt.offsetY=Ks.offsetY}else if(!Rs)Rt.scale=1,Rt.offsetX=0,Rt.offsetY=Pu,Po=null;else{Es+=1;const F=ht/vt;(Es>=_s||!Rr(Po,Rs)||Math.abs(Di-F)>1e-4)&&(Li(Rs,yt,Up,Ks),Po=Rs,Di=F,Es=0),Rt.scale=Ks.scale,Rt.offsetX=Ks.offsetX,Rt.offsetY=Ks.offsetY}const Q=Hc?R:1;Hc=!0,Ts.scale=P.lerp(Ts.scale,Rt.scale,Q),Ts.offsetX=P.lerp(Ts.offsetX,Rt.offsetX,Q),Ts.offsetY=P.lerp(Ts.offsetY,Rt.offsetY,Q),wp(k,ht,vt,Ts);let ie=d.timeProgress;const oe=C?Bn(m):null;let Re=null;oe!==null&&d.landingTour&&typeof d.landingPass!="number"&&!Ss?(Mn!==m.key&&(Mn=m.key,Bs=[],m.observerDataset.frames.forEach((F,G)=>{var W;(G===oe||((W=F[0])==null?void 0:W.isDay)===!1)&&Bs.push(G)}),ii=Math.max(0,Bs.indexOf(oe)),ni=0,yn=!1),ys||(ni+=v),Bs.length>1&&ni>(yn?Xp:$p)&&(ii=(ii+1)%Bs.length,ni=0,yn=!0),Re=Bs[ii]??null):Mn="";const ve=oe!==null&&typeof d.landingPass=="number"&&Number.isFinite(d.landingPass)?P.clamp(d.landingPass,0,m.frameCount-1):Re??oe;if(ve!==null&&(ie=ve/Math.max(1,m.frameCount-1)),d.backdrop){const F=Bn(m);F!==null&&(ie=F/Math.max(1,m.frameCount-1))}let Ae=0,ae=!1;if(d.cinemaActive&&d.inWorkspace){const F=ic.update(v,Tt,d.onCinemaStepTheater,qe.width,qe.depth);k.fov=F.fov,k.updateProjectionMatrix(),k.up.copy(F.up),k.position.copy(F.position),k.lookAt(F.lookAt),ie=F.syntheticTimeProgress,Ae=F.cycleProgress}else{const F=C&&Ua?Gi:39;if(Math.abs(k.fov-F)>.01&&(k.fov=Un||!C?P.lerp(k.fov,F,R):F),k.updateProjectionMatrix(),k.up.set(0,1,0),!d.inWorkspace&&!Za.isActive()&&!Ea){const $=C?Ua:null,B=$??yt,J=Ss?0:$?Math.sin(Et*.11)*Ki:Math.sin(Et*.16)*.065;let X=B.azimuth+J;for(;X-pe.azimuth>Math.PI;)X-=Math.PI*2;for(;X-pe.azimuth<-Math.PI;)X+=Math.PI*2;pe.azimuth=$?P.lerp(pe.azimuth,X,Math.min(1,v*2)):X,pe.polar=P.lerp(pe.polar,B.polar,v*1.2),pe.distance=P.lerp(pe.distance,B.distance,v*1.6),_i.set(B.target[0],B.target[1],B.target[2]),pe.target.lerp(_i,v*2.2),$&&!Un&&(pe.azimuth=X,pe.polar=B.polar,pe.distance=B.distance,pe.target.copy(_i),V.azimuth=pe.azimuth,V.polar=B.polar,V.distance=B.distance,V.target.copy(_i),Un=!0)}bs&&d.inWorkspace&&!xa&&!Ea&&!Za.isActive()&&(Kn(za(d.cameraPreset,!0,d.mode,d.activeTheaterId)),bs=!1),ae=Za.step(v,pe).slewActive,V.azimuth=P.lerp(V.azimuth,pe.azimuth,R),V.polar=P.lerp(V.polar,pe.polar,R),V.distance=P.lerp(V.distance,pe.distance,R),V.target.lerp(pe.target,R);let W=!1;if(!Sa&&d.inWorkspace&&(Ja??d.cameraPreset)==="canyon"&&m.observerDataset.dataSource==="firms"){const $=m.observerDataset.frames.length,B=Math.min($-1,Math.max(0,Math.round(P.clamp(d.timeProgress,0,1)*($-1)))),J=(((ns=(ra=m.declared)==null?void 0:ra.byFrame.get(B))==null?void 0:ns.length)??0)>0;if(J||bo==="estimate"&&ut.length>0){const X=d.workspaceSubjectFrame,de=`${m.regionId}:${((Io=(Ga=m.observerDataset.frames[0])==null?void 0:Ga[0])==null?void 0:Io.timeUtc)??""}`;let Xe=0;for(const mt of m.observerDataset.frames[B]??[])mt.revealed&&!mt.revealedByLook&&(Xe+=mt.footprints.length);const at=`${de}:${B}:${J?"declared":yo}:${Xe}:${X?[X.left,X.top,X.right,X.bottom].map(mt=>mt.toFixed(3)).join(","):""}:${ht}x${vt}`;at!==Mc&&(Mc=at,!xa&&!Ea&&(ta==="estimate"||ta==="test"?W=!0:bs=!0))}}const L=d.filmMove!==void 0?d.filmMove:wc;L!==yc&&(yc=L,Gn=!1),ta&&(xa||Ea)&&(Gn=!0);let Y=null;if(L&&!Gn&&!(Sa&&nc)&&!ys&&!d.backdrop){Y=L!=="auto"?L:d.inWorkspace?d.tileBoard?"play":zs.x+zs.y>.5?"test":"estimate":"record";const $=m.observerDataset.dataSource==="firms";Y!=="record"&&(!d.inWorkspace||!$)&&(Y=null)}if(Y!==ta){const $=ta;if(ta=Y,Ei=Et,Gs=0,Ja=null,It=null,Gt=null,Y){xa=!1;const B=za("canyon",!0,d.mode,d.activeTheaterId),J={...B,distance:B.distance*Cr,azimuth:B.azimuth+.04};if(Y==="estimate")It={...B,distance:B.distance*tv,azimuth:B.azimuth-.06},Gt=J,Qa=Nu,Hs=!0,Ja="canyon";else if(Y==="test"){const X={azimuth:V.azimuth,polar:V.polar,distance:V.distance,target:[V.target.x,V.target.y,V.target.z]};It=$==="estimate"?X:J,Gt=It,Qa=0,Ja="canyon"}else if(Y==="play")It=J,Gt=za("region",!0,d.mode,d.activeTheaterId),Qa=av,Hs=!0,Ja="region";else{const X=d.inWorkspace?za("region",!0,d.mode,d.activeTheaterId):Ua??yt;It={...X,azimuth:X.azimuth-Lu/2},Gt={...X,azimuth:X.azimuth+Lu/2},Qa=ev,Hs=!1,Ja=d.inWorkspace?"region":null}}}if(W&&It&&Gt&&(ta==="estimate"||ta==="test")){const $=za("canyon",!0,d.mode,d.activeTheaterId);It={azimuth:V.azimuth,polar:V.polar,distance:V.distance,target:[V.target.x,V.target.y,V.target.z]},Gt={...$,distance:$.distance*Cr,azimuth:$.azimuth+.04},Qa=ta==="estimate"?Nu:zu,Hs=!0,Ei=Et}if(Zn)if(Zn=!1,ta==="play"&&It&&Gt){const $=za("region",!0,d.mode,d.activeTheaterId);Gs<1?Gt=$:(It={azimuth:V.azimuth,polar:V.polar,distance:V.distance,target:[V.target.x,V.target.y,V.target.z]},Gt=$,Qa=zu,Hs=!0,Ei=Et,Gs=0,Ci=!0)}else!ta&&d.cameraPreset==="region"&&d.inWorkspace&&!xa&&!Ea&&(Kn(za("region",!0,d.mode,d.activeTheaterId)),Ci=!0);if(ta&&It&&Gt){const $=Qa>0?P.clamp((Et-Ei)/Qa,0,1):1,B=Hs?$*$*(3-2*$):$;let J=Gt.azimuth-It.azimuth;for(;J>Math.PI;)J-=Math.PI*2;for(;J<-Math.PI;)J+=Math.PI*2;V.azimuth=It.azimuth+J*B,V.polar=P.lerp(It.polar,Gt.polar,B),V.distance=It.distance*Math.pow(Gt.distance/It.distance,B),V.target.set(P.lerp(It.target[0],Gt.target[0],B),P.lerp(It.target[1],Gt.target[1],B),P.lerp(It.target[2],Gt.target[2],B)),pe.azimuth=V.azimuth,pe.polar=V.polar,pe.distance=V.distance,pe.target.copy(V.target),Gs=$}const q=Math.sin(V.polar);k.position.set(V.target.x+V.distance*q*Math.sin(V.azimuth),V.target.y+V.distance*Math.cos(V.polar),V.target.z+V.distance*q*Math.cos(V.azimuth));const Z=gi(k.position.x),Je=xi(k.position.z);if(Z>=0&&Z<=1&&Je>=0&&Je<=1){const $=Tt(Z,Je)+P.lerp(ku,Ap,ts);k.position.y<$&&(k.position.y=$)}else if(m.context&&ga>.5){const $=xc(m,k.position.x,k.position.z)+ku;k.position.y<$&&(k.position.y=$)}k.lookAt(V.target)}const ue=!d.inWorkspace||d.cinemaActive?"cutaway":d.mode,we=ue==="cutaway"?1:0,Oe=ue==="reconstruction"?1:0,rt=ue==="observer"?1:0,xt=ue==="world"||ue==="earth"||m.observerDataset.dataSource==="firms"?0:ue==="observer"?.45:1;N.uCutawayMix.value=P.lerp(N.uCutawayMix.value,we,b),N.uReconMix.value=P.lerp(N.uReconMix.value,Oe,b),N.uObserverMix.value=P.lerp(N.uObserverMix.value,rt,b),N.uCutawayPlane.value=Fu,N.uTime.value=Et,N.uUncertaintyMix.value=P.lerp(N.uUncertaintyMix.value,d.showUncertainty?1:0,R),N.uSensitivity.value=P.lerp(N.uSensitivity.value,d.sensitivityThreshold,R);const he=d.observerFilter==="all"||d.observerFilter==="modis"?1:0,ke=!d.holdoutViirs&&(d.observerFilter==="all"||d.observerFilter==="viirs")?1:0;N.uModisWeight.value=P.lerp(N.uModisWeight.value,he,R),N.uViirsWeight.value=P.lerp(N.uViirsWeight.value,ke,R),ye=P.lerp(ye,xt*P.lerp(1,Tv,$a.value),b);const We=Pl(m.tensor,m.frameCount,ie);N.uFrameMix.value=We,N.uFireTime.value=P.clamp(ie,0,1)*Math.max(1,m.frameCount-1);const ge=m.observerDataset.frames,Me=Math.min(ge.length-1,Math.max(0,Math.round(ie*(ge.length-1)))),Te=ge[Me]??[],Ce=m.observerDataset.dataSource==="firms",Kt=d.burnedArea??null;Kt!==fs&&(fs=Kt,Kt&&kh(Kt));const Ft=Ce&&ba!==null&&fs!==null&&fl===fs&&(!fs.region_id||fs.region_id===m.regionId);if(ms=P.lerp(ms,Ft?1:0,1-Math.exp(-v*3)),!Ft&&ms<.003&&(ms=0),ul.value=Ce?ms:0,N.uFieldTex1.value=Ce&&ms>0&&ba?ba:ft,ms>0&&cn){const F=af(m.bbox,cn);hl.set(F[0],F[1],F[2],F[3])}if(Ce){Ah(m,nn,rn);const F=`${m.key}:${Me}:${d.holdoutViirs?1:0}:${C?1:0}`,G=C&&(typeof d.landingPass=="number"||!!d.landingTour)&&!Ss,W=F!==ps&&G&&ps.startsWith(`${m.key}:`)&&Xa.value>.02;if(W?Xa.value=Math.max(0,Xa.value-v/yv):F===ps&&(Xa.value=G?Math.min(1,Xa.value+v/bv):1),F!==ps&&!W){ps=F,Xa.value=G?0:1;const L=Te.find(B=>!la(B,d.holdoutViirs)&&!B.revealed)??Te.find(B=>!la(B,d.holdoutViirs)),Y=Te.some(B=>B.family==="modis"&&!la(B,d.holdoutViirs)&&!B.revealed);Sn=L?{index:Me,sensor:L.sensorLabel,timeUtc:L.timeUtc??"",isDay:L.isDay!==!1,detections:L.footprints.length}:void 0;const q=L??Te[0];if(d.passScan&&(d.inWorkspace||typeof d.landingPass=="number")&&q&&!Ss){const B=P.degToRad(q.azimuthDeg);let J=Math.cos(B),X=-Math.sin(B);const de=q.orbitNode==="ascending";q.orbitNode&&de!==X>0&&(J=-J,X=-X),Ya.x=J,Ya.y=X,gl=Et}vs.length=0,Os.length=0,zs.set(0,0);for(const B of Te)if(!la(B,d.holdoutViirs)){if(B.revealed){for(const J of B.footprints)Os.push(J);B.family==="modis"?zs.x=1:zs.y=1;continue}for(const J of B.footprints)vs.push(J)}const Z=Te.find(B=>B.revealed&&!la(B,d.holdoutViirs));if(Os.length>0&&Z){const B=P.degToRad(Z.azimuthDeg);let J=Math.cos(B),X=-Math.sin(B);Z.orbitNode&&Z.orbitNode==="ascending"!=X>0&&(J=-J,X=-X);const[de,Xe,at,mt]=m.bbox;let Ot=1/0,Ht=-1/0,Ma=0;for(const Fa of Os){const Da=((Fa.lon-de)/Math.max(1e-9,at-de)-.5)*m.widthKm,Ka=((Fa.lat-Xe)/Math.max(1e-9,mt-Xe)-.5)*m.depthKm,$s=Da*J+Ka*X;Ot=Math.min(Ot,$s),Ht=Math.max(Ht,$s),Ma=Math.max(Ma,Fa.acrossTrackKm,Fa.alongTrackKm)}Us.x=J,Us.y=X,Us.w=Math.max(.2,Ma),Tl=Ot-Ma,El=Ht+Ma+Us.w,Rl=Ss?-1e9:Et}if(ri.length=0,Mo.value=0,li=void 0,vs.length===0&&Te.length>0&&Te.every(B=>B.revealed||la(B,d.holdoutViirs))&&m.residenceHours!==void 0){const B=Date.parse(((Ws=Te[0])==null?void 0:Ws.timeUtc)??"");for(let J=Me-1;J>=0&&ri.length===0;J--)for(const X of ge[J]??[]){if(X.revealed||la(X,d.holdoutViirs)||X.footprints.length===0)continue;for(const at of X.footprints)ri.push(at);const de=Date.parse(X.timeUtc??""),Xe=Number.isFinite(B)&&Number.isFinite(de)?Math.max(0,(B-de)/36e5):0;Mo.value=Math.exp(-Xe/(m.residenceHours??1)),li={index:J,sensor:X.sensorLabel,timeUtc:X.timeUtc??"",hoursBefore:Xe}}}const $=m.fieldScale??to;_v($,ai),ei.build(vs,m.bbox,[m.widthKm,m.depthKm],B=>(ji($,B)-ai.x)/Math.max(.001,ai.y-ai.x),Os,ri),bl.value=Y?1:0}}else Sn=void 0,ps="",Mo.value=0,li=void 0;const Oa=(Et-gl)/Yp;if(Ce&&Oa>=0&&Oa<1){const F=.5*(Math.abs(Ya.x)*m.widthKm+Math.abs(Ya.y)*m.depthKm)+1.5;Ya.z=-F+2*F*Oa,Ya.w=1}else Ya.w=0;Fl!==m.key&&(Fl=m.key,Dl=Ce&&!ge.some(F=>F.some(G=>G.hidden||G.revealed))),Tn.value=P.lerp(Tn.value,Dl&&!d.holdoutViirs?1:0,R);const Qe=Ce&&m.runId?rl.get(m.runId):void 0;if(Qe&&!d.backdrop){xl!==m.key&&(xl=m.key,pn=ge.map(q=>{var Z;return Date.parse(((Z=q[0])==null?void 0:Z.timeUtc)??"")}));const F=P.clamp(ie,0,1)*Math.max(1,ge.length-1),G=Math.min(ge.length-1,Math.floor(F)),W=Math.min(ge.length-1,G+1),L=pn[G],Y=pn[W];if(Number.isFinite(L)&&Number.isFinite(Y)){const q=L+(Y-L)*(F-G)+Qe.info.stepMs;pl!==m.key&&(pl=m.key,un=null),Te.length>0&&Te.every(Z=>Z.revealed||la(Z,d.holdoutViirs))&&(un=Me),ll.value=na.sync(Qe,m.key,q,un)}else na.clear()}else na.clear();N.uLipariTex.value=na.grid.x>0?na.texture:ds,ml.value=na.grid.x>0&&na.declaredGiven?1:0,wn.value=P.lerp(wn.value,d.chanceSquares?1:0,R);{const F=!!(d.filmMove??wc),G=P.clamp((Et-Rl)/(F?Qp:Zp),0,1),W=F?G*G*(3-2*G):1-(1-G)*(1-G);Us.z=G>=1?1e4:P.lerp(Tl,El,W)}const ka=Ce&&Te.length>0&&Te.every(F=>F.revealed||la(F,d.holdoutViirs))?1:0;ln.value=P.lerp(ln.value,ka,1-Math.exp(-v*6)),cl.value=Ce&&m.answeredByOther?1:0,mn=P.lerp(mn,(!Ce||vs.length>0?1:.5*Mo.value)*Xa.value,1-Math.exp(-v*4)),N.uPixelOutline.value=P.lerp(N.uPixelOutline.value,d.detectionPixels?1:0,R),bn.value=C?0:P.smoothstep(V.distance,8.5,15),wo.value=P.lerp(wo.value,(C?1:P.lerp(fv,mv,bn.value))*wv((rs=m.pack)==null?void 0:rs.pictureMedianLuma),b),xo=Ce&&Te[0]?{index:Me,sensor:Te[0].sensorLabel,timeUtc:Te[0].timeUtc??"",isDay:Te[0].isDay!==!1,hidden:Te.every(F=>F.revealed||la(F,d.holdoutViirs))&&!Te.some(F=>F.revealed&&!F.revealedByLook)}:void 0,N.uFireHist.value=Ce?ei.lightTexture:ct(m).texture,xn=void 0;let Wt=null;if(d.dayPicture&&Ce&&d.inWorkspace&&((Ui=Te[0])!=null&&Ui.timeUtc)&&m.runId){const F=(xo==null?void 0:xo.hidden)===!0,G=Te.find(Z=>!la(Z,d.holdoutViirs)&&!Z.revealed)??Te[0],W=F?"MODIS_AQUA":Gp(G.sensorLabel)??"MODIS_AQUA",L=Te[0].timeUtc.slice(0,10),Y=Wa(g.current,`/api/gibs/day?region_id=${encodeURIComponent(m.regionId)}&day=${L}&platform=${W}&kind=${d.dayPicture}`);let q=si.get(Y);q===void 0&&(si.set(Y,"loading"),q="loading",z.load(Y,Z=>{Z.colorSpace=it,Z.anisotropy=D,Z.wrapS=Ke,Z.wrapT=Ke,si.set(Y,Z)},void 0,()=>si.set(Y,"missing"))),q!=="loading"&&q!=="missing"&&(Wt=q),xn={state:q==="loading"?"loading":q==="missing"?"missing":"shown",platform:W,kind:d.dayPicture,day:L,insteadOfHidden:F}}if(Wt){N.uSatNext.value=Wt,N.uSatPrev.value=Wt,N.uSatSharpen.value=0;const F=Wt.image;N.uOrthoTexelKm.value=m.widthKm/Math.max(1,(F==null?void 0:F.width)??256),oi=!0,vn.value=Jp,gn.value=d.dayPicture==="false_color"?1:0}else oi&&(N.uSatNext.value=m.satTex,N.uSatPrev.value=se.satTex,N.uSatSharpen.value=m.sharpen,N.uOrthoTexelKm.value=m.orthoTexelKm,oi=!1,vn.value=0,gn.value=0);Sl.value=m.runId===null?0:1;const aa=d.backdrop?1:Wt?0:Ce&&((Co=Te[0])==null?void 0:Co.isDay)===!1||m.runId===null?1:0;$a.value=P.lerp($a.value,aa,1-Math.exp(-v*2.4)),Ll.value=$a.value;const Ha=m.fieldScale??to;Ml.set(Ha.kind==="linear"?0:1,Ha.maxMwKm2,Ha.minMwKm2),Rv(Ha,yl),wl.set(Ce?1:0,Ce?1:0),nu(Te.find(F=>F.family==="modis"),qi,Ro),nu(Te.find(F=>F.family==="viirs"&&!la(F,d.holdoutViirs)),oo,Ao),Wl.set(Ro.axisEast,Ro.axisNorth,Ro.nadirKm,Ro.valid?1:0),Vl.set(Ao.axisEast,Ao.axisNorth,Ao.nadirKm,Ao.valid?1:0),Ni=P.lerp(Ni,ue==="observer"?1:0,b),!oc&&ue==="observer"&&(oc=!0,qa.loadModels("/isogon/"));{const F=P.smoothstep(V.distance,8.5,11.5);if(Cn=P.lerp(Cn,ue==="observer"?F:0,b),pi.length=0,Ni>=.01){let G=!1,W=!1;for(const L of Te){if(pi.length>=Du)break;if(la(L,d.holdoutViirs)||d.observerFilter==="modis"&&L.family!=="modis"||d.observerFilter==="viirs"&&L.family!=="viirs")continue;const Y=L.family==="modis"?!G:!W;L.family==="modis"?G=!0:W=!0,pi.push({sensorLabel:L.sensorLabel,family:L.family,azimuthDeg:L.azimuthDeg,scanAngleDeg:L.scanAngleDeg,orbitNode:L.orbitNode,groundStrip:Y})}}qa.update(pi,{sky:Cn,strip:Ni,dtSec:v,sampleTerrainY:Tt,slabWidth:qe.width,slabDepth:qe.depth,unitsPerMetre:m.frame.unitsPerMetre}),Yl.set(qa.strips.modis.alongTrackKm,qa.strips.modis.strength,qa.strips.viirs.alongTrackKm,qa.strips.viirs.strength)}Rn.position.copy(k.position);{const F=P.lerp(se.minElevM,m.minElevM,ea),G=Math.max(.05,(F+k.position.y/m.frame.unitsPerMetre[1])*.001);ja.uCamAltKm.value=G,ne=P.lerp(ne,C||d.inWorkspace&&(d.cleanHud||d.cinemaActive)?1:0,b),ts=P.lerp(ts,C?1:0,b),ja.uSkyExposure.value=P.lerp(ur,P.lerp(kd,_p,ts),ne),N.uLatticeMix.value=1-ts;const W=Ja??d.cameraPreset,L=d.inWorkspace?W==="region"||W==="canyon"&&m.observerDataset.dataSource==="firms"?1:1-P.smoothstep(V.distance,8.5,11.5):C?1:0,Y=m.context!==null&&!Sa;ga=ys?Y?L:0:P.lerp(ga,Y?L:0,b),N.uContextMix.value=ga,mi.mesh.visible=ga>.003,_o.visible=ts<.5&&ga<.5,hi.visible=ts<.5&&ga<.5,N.uSkyExposure.value=ja.uSkyExposure.value,N.uEdgeFade.value=P.lerp(N.uEdgeFade.value,m.context?0:d.inWorkspace?1-P.smoothstep(V.distance,8.5,11.5):C&&(bi.floorShare>0||bi.seaShare>0)?1:0,b);const q=Math.max(N.uEdgeFade.value,ga);_n.uniforms.uShadowMix.value=1-q,ja.uFloorHaze.value=P.lerp(.3,P.lerp(1,Dp,q),ne),ja.uFloorColor.value.set(.044,.06,.094).lerp(Cv,ne),Eo.update(A,ui,G)}k.updateMatrixWorld();const Ye=Math.max(Fs(se.maxElevM,se),Fs(m.maxElevM,m));j.enabled=ye>.01,C&&(k.updateMatrixWorld(),xp(k,gp(Rs??_u),sc)),N.uSmokeShadowMix.value=j.enabled?1:0,j.enabled&&j.update({camera:k,slabWidth:qe.width,slabDepth:qe.depth,reliefTop:Ye,heightPrev:be(se),heightNext:be(m),morph:ea,field0:tt,field1:ft,detection0:m.observerDataset.dataSource==="firms"?Qo:null,detection1:m.observerDataset.dataSource==="firms"?Jo:null,frameMix:N.uFrameMix.value,windUv:Fn,sunDir:Se,sunColor:En,time:Et,opacity:ye,cutawayMix:N.uCutawayMix.value,cutawayPlane:Fu,cutawayDir:Bl,lid:sc,lidAmount:ts,clearRadius:kp,thinOverFire:Ce?.82:0,night:$a.value,fireLight:mn}),K.render(v);const He=d.onCurtainScreen;He&&!Fc&&(He({near:{x:0,y:0},far:{x:0,y:0},modisSide:"left",visible:!1}),Fc=!0);const ce=d.tileBoard,$e=!!ce&&ce.cols>=1&&ce.rows>=1&&ce.cols*ce.rows<=64;if(!!ce!==Ec&&(Ec=!!ce,d.cameraPreset==="region"&&(bs=!0)),ce&&$e){hn.set(ce.cols,ce.rows);const F=ce.cols*ce.rows;for(let W=0;W<F;W++){const L=ce.tiles[W];vl[W].set(P.clamp((L==null?void 0:L.level)??0,0,1),L!=null&&L.looked?1:0,L!=null&&L.chosen?1:0,L!=null&&L.closed?1:0)}const G=ce.pickable&&!Ea&&Number.isFinite(ki)?Pc(ki,Xn,ce.cols,ce.rows):null;if(dn.value=G??-1,G!==ti&&(ti=G,(Lo=d.onTileHover)==null||Lo.call(d,G)),d.onTileAnchors){fn.length=0;for(let W=0;W<F;W++){const L=W%ce.cols/ce.cols,Y=1-Math.floor(W/ce.cols)/ce.rows;nt.set(Zt(L),Tt(L,Y),Qt(Y)).project(k);const q=(nt.x*.5+.5)*ht,Z=(-nt.y*.5+.5)*vt;fn.push({tile:W,x:q,y:Z,visible:nt.z>-1&&nt.z<1&&q>=0&&q<=ht&&Z>=0&&Z<=vt})}d.onTileAnchors(fn.slice())}}else hn.set(0,0),dn.value=-1,ti!==null&&(ti=null,(Vs=d.onTileHover)==null||Vs.call(d,null));if(d.onFireAnchor&&d.inWorkspace&&Ce){const F=vs.length>0?vs:Os,G=Qe?Math.round(na.grid.x)+":"+na.stepKey:"",W=`${ps}:${F.length}:${F.length===0?G:""}`;if(W!==yo){yo=W;const[Y,q,Z,Je]=m.bbox;if(F.length>0){bo="detections",ut=new Float32Array(F.length*3);const $=new Float32Array(F.length*2);F.forEach((B,J)=>{ut[J*3]=(B.lon-Y)/Math.max(1e-9,Z-Y),ut[J*3+1]=(B.lat-q)/Math.max(1e-9,Je-q),ut[J*3+2]=Math.max(1,B.frpMw),$[J*2]=.5*B.acrossTrackKm/Math.max(1e-6,m.widthKm),$[J*2+1]=.5*B.alongTrackKm/Math.max(1e-6,m.depthKm)}),gs=Oo(ut,P.clamp(Math.round(m.widthKm/Vu),8,512),P.clamp(Math.round(m.depthKm/Vu),8,512),$)}else{bo="estimate";const $=Qe!=null&&Qe.declared&&Qe.declared.nx===Qe.info.nx&&Qe.declared.ny===Qe.info.ny?Qe.declared.byFrame.get(Me):void 0;if(Qe&&$&&$.length>0){const{nx:B,ny:J}=Qe.info;ut=new Float32Array($.length*3),$.forEach((X,de)=>{ut[de*3]=(X%B+.5)/B,ut[de*3+1]=1-(Math.floor(X/B)+.5)/J,ut[de*3+2]=1})}else ut=Qe?na.cellsAbove(Qe,Sv,B=>th(m.fieldScale??to,B)):new Float32Array(0);gs=Qe?Oo(ut,Qe.info.nx,Qe.info.ny):{patchOf:new Uint16Array(0),sizes:[]}}}const L=ut.length/3;if(L===0)So&&d.onFireAnchor(null),So=!1,ci="",To=null;else{const Y=`${yo}:${se.key}:${m.key}`,q=k.matrixWorld.elements,Z=k.projectionMatrix.elements;let Je=To!==null&&Y===ci&&qt[0]===Me&&qt[1]===ea&&qt[2]===ht&&qt[3]===vt&&qt[4]===qe.width&&qt[5]===qe.depth;if(Je){for(let $=0;$<16;$++)if(qt[6+$]!==q[$]||qt[22+$]!==Z[$]){Je=!1;break}}if(!Je){let $=0,B=0,J=0,X=1/0,de=-1/0,Xe=1/0,at=-1/0;const mt=Math.min(Ir,gs.sizes.length);for(let fe=0;fe<mt;fe++)je[fe*7]=0,je[fe*7+1]=0,je[fe*7+2]=0,je[fe*7+3]=1/0,je[fe*7+4]=1/0,je[fe*7+5]=-1/0,je[fe*7+6]=-1/0;for(let fe=0;fe<L;fe++){const st=ut[fe*3],ma=ut[fe*3+1],pa=ut[fe*3+2];$+=st*pa,B+=ma*pa,J+=pa;const Ct=gs.patchOf[fe]<mt?gs.patchOf[fe]*7:-1;if(Ct>=0&&(je[Ct]+=st*pa,je[Ct+1]+=ma*pa,je[Ct+2]+=pa),nt.set(Zt(st),Tt(st,ma),Qt(ma)).project(k),nt.z<=-1||nt.z>=1)continue;const As=(nt.x*.5+.5)*ht,Xs=(-nt.y*.5+.5)*vt;X=Math.min(X,As),de=Math.max(de,As),Xe=Math.min(Xe,Xs),at=Math.max(at,Xs),Ct>=0&&(je[Ct+3]=Math.min(je[Ct+3],As),je[Ct+4]=Math.min(je[Ct+4],Xs),je[Ct+5]=Math.max(je[Ct+5],As),je[Ct+6]=Math.max(je[Ct+6],Xs))}let Ot=0,Ht=0;const Ma=(fe,st)=>{const ma=Tt(fe,st);if(nt.set(Zt(fe),ma,Qt(st)).project(k),Ot=(nt.x*.5+.5)*ht,Ht=(-nt.y*.5+.5)*vt,!(nt.z>-1&&nt.z<1&&Ot>=0&&Ot<=ht&&Ht>=0&&Ht<=vt))return!1;const pa=k.position.x,Ct=k.position.y,As=k.position.z,Xs=Zt(fe),Xh=Qt(st);for(let ar=1;ar<48;ar++){const sr=ar/48,or=gi(pa+(Xs-pa)*sr),ir=xi(As+(Xh-As)*sr);if(!(or<0||or>1||ir<0||ir>1)&&Tt(or,ir)>Ct+(ma-Ct)*sr+.012)return!1}return!0};for(let fe=0;fe<mt;fe++)xs[fe*3]=1/0;const Fa=m.widthKm,Da=m.depthKm;for(let fe=0;fe<L;fe++){const st=gs.patchOf[fe];if(st>=mt)continue;const ma=(ut[fe*3]-je[st*7]/je[st*7+2])*Fa,pa=(ut[fe*3+1]-je[st*7+1]/je[st*7+2])*Da,Ct=ma*ma+pa*pa;Ct<xs[st*3]&&(xs[st*3]=Ct,xs[st*3+1]=ut[fe*3],xs[st*3+2]=ut[fe*3+1])}const Ka=[];for(let fe=0;fe<mt;fe++){const st=fe*7,ma=Ma(xs[fe*3+1],xs[fe*3+2]);Ka.push({x:Ot,y:Ht,left:Number.isFinite(je[st+3])?je[st+3]:Ot,top:Number.isFinite(je[st+4])?je[st+4]:Ht,right:Number.isFinite(je[st+5])?je[st+5]:Ot,bottom:Number.isFinite(je[st+6])?je[st+6]:Ht,cells:gs.sizes[fe],visible:ma})}const $s=Ma($/J,B/J),er=Ot,tr=Ht;To={frame:Me,from:bo,x:er,y:tr,left:Number.isFinite(X)?X:er,top:Number.isFinite(Xe)?Xe:tr,right:Number.isFinite(de)?de:er,bottom:Number.isFinite(at)?at:tr,visible:$s,patches:Ka},ci=Y,qt[0]=Me,qt[1]=ea,qt[2]=ht,qt[3]=vt,qt[4]=qe.width,qt[5]=qe.depth;for(let fe=0;fe<16;fe++)qt[6+fe]=q[fe],qt[22+fe]=Z[fe]}d.onFireAnchor(To),So=!0}}else So&&((Bi=d.onFireAnchor)==null||Bi.call(d,null),So=!1,yo="",ci="",To=null);const wt=u.current;if(wt){let F=!1;if(d.inWorkspace&&!C&&!d.cinemaActive&&V.distance>jp){const G=[[0,0,1,0,m.widthKm],[1,0,1,1,m.depthKm],[1,1,0,1,m.widthKm],[0,1,0,0,m.depthKm]];let W=G[0],L=1/0;for(const de of G){const Xe=Zt((de[0]+de[2])*.5)-k.position.x,at=Qt((de[1]+de[3])*.5)-k.position.z,mt=Xe*Xe+at*at;mt<L&&(L=mt,W=de)}const Y=W[4];let q=1;for(const de of[1,2,5,10,20,50,100])de<=Y*.3&&(q=de);const Z=de=>{const Xe=qp+de/Y;return[W[0]+(W[2]-W[0])*Xe,W[1]+(W[3]-W[1])*Xe]},Je=.07*(1-ga);let $=1/0;for(let de=0;de<=8;de++){const[Xe,at]=Z(q*de/8);$=Math.min($,Tt(Xe,at))}const B=de=>{const[Xe,at]=Z(de);return nt.set(Zt(Xe),$-Je,Qt(at)).project(k),nt.z<=-1||nt.z>=1?null:[(nt.x*.5+.5)*ht,(-nt.y*.5+.5)*vt]},J=B(0),X=B(q);if(J&&X){const de=Math.hypot(X[0]-J[0],X[1]-J[1]);if(de>40){let Xe=-(X[1]-J[1])/de,at=(X[0]-J[0])/de;at>0&&(Xe=-Xe,at=-at);const mt=(Da,Ka)=>`M${Da[0].toFixed(1)},${Da[1].toFixed(1)} L${(Da[0]+Xe*Ka).toFixed(1)},${(Da[1]+at*Ka).toFixed(1)}`,Ot=`${mt(J,7)} M${J[0].toFixed(1)},${J[1].toFixed(1)} L${X[0].toFixed(1)},${X[1].toFixed(1)} ${mt(X,7)}`;Ot!==Al&&(Al=Ot,(Ys=r.current)==null||Ys.setAttribute("d",Ot));const Ht=c.current,Ma=X[0]>=J[0]?X:J,Fa=`${q} km|${(Ma[0]+8).toFixed(1)}|${(Ma[1]+4).toFixed(1)}`;if(Ht&&Fa!==kl){kl=Fa;const[Da,Ka,$s]=Fa.split("|");Ht.textContent=Da,Ht.setAttribute("x",Ka),Ht.setAttribute("y",$s)}F=!0}}}F!==_l&&(_l=F,wt.style.opacity=F?"1":"0")}const Mt=d.inWorkspace&&!d.cleanHud&&!d.cinemaActive,re=Pr(m),[_e,Fe,Ze,Be]=m.bbox,De=Math.max(1e-4,Ze-_e),Ne=Math.max(1e-4,Be-Fe),Ue=[],Dt=232,Vt=gt?gt.left*ht+12:24,as=Math.max(Vt,(gt?gt.right*ht-12:ht-356)-Dt),_a=gt?gt.top*vt+12:68,Ut=Math.max(_a,gt?gt.bottom*vt-76:Math.max(160,vt-134)),Bt=gt?(gt.left+gt.right)*.5*ht:ht*.44;for(let F=0;F<3;F++){const G=re[F];if(!Mt||!G){Ue.push({ax:0,ay:0,bx:0,by:0,valid:!1});continue}const W=P.clamp((G.lon-_e)/De,.04,.96),L=P.clamp((G.lat-Fe)/Ne,.04,.96),Y=Tt(W,L)+.05;if(nt.set(Zt(W),Y,Qt(L)).project(k),nt.z>=1||nt.z<=-1){Ue.push({ax:0,ay:0,bx:0,by:0,valid:!1});continue}const q=(nt.x*.5+.5)*ht,Z=(-nt.y*.5+.5)*vt,$=(F===1||q+108>as||q>Bt?-1:1)>0?q+56:q-56-Dt,B=P.clamp($,Vt,as),J=P.clamp(Z-(F===0?64:F===1?48:-44),_a,Ut);Ue.push({ax:q,ay:Z,bx:B,by:J,valid:!0})}const ss=240,os=62;for(let F=0;F<2;F++)for(let G=0;G<Ue.length;G++)if(Ue[G].valid)for(let W=G+1;W<Ue.length;W++){if(!Ue[W].valid)continue;const L=Ue[W].bx-Ue[G].bx,Y=Ue[W].by-Ue[G].by;if(Math.abs(L)<ss&&Math.abs(Y)<os){const q=(os-Math.abs(Y))*.55*(Y>=0?1:-1);Ue[G].by=P.clamp(Ue[G].by-q,_a,Ut),Ue[W].by=P.clamp(Ue[W].by+q,_a,Ut)}}for(let F=0;F<3;F++){const G=Ue[F],W=i.current[F],L=l.current[F],Y=o.current[F];if(!G||!G.valid){W&&(W.style.opacity="0"),L&&(L.style.opacity="0",L.style.pointerEvents="none",L.style.visibility="hidden"),Y&&(Y.style.opacity="0");continue}if(W&&(W.style.opacity="1",W.style.transform=`translate3d(${G.ax.toFixed(1)}px, ${G.ay.toFixed(1)}px, 0) translate(-50%, -50%)`),L&&(L.style.opacity="1",L.style.pointerEvents="auto",L.style.visibility="visible",L.style.transform=`translate3d(${G.bx.toFixed(1)}px, ${G.by.toFixed(1)}px, 0)`),Y){const q=G.ax+(G.bx-G.ax)*.42,Z=G.by+22,Je=G.bx>G.ax?G.bx:G.bx+(L?L.offsetWidth:Dt);Y.setAttribute("points",`${G.ax.toFixed(1)},${G.ay.toFixed(1)} ${q.toFixed(1)},${Z.toFixed(1)} ${Je.toFixed(1)},${Z.toFixed(1)}`),Y.style.opacity="1"}}if(ys){const F=m.observerDataset.dataSource==="firms"&&m.runId!==null,G=F&&!Sa&&(m.pack?m.contextState!=="loading":m.packManifest===null||m.packState==="failed");Hn=G&&f<uv?Hn+v:0;const W=F?m.pack?m.contextState==="loading"?3:4:m.packManifest&&m.packState!=="failed"?2:G?4:1:0;W!==Sc&&(Sc=W,Tc=Et);const L=Br[W],Y=Br[Math.min(Br.length-1,W+1)],q=L+(Y-L)*(1-Math.exp(-(Et-Tc)/dv));if(Ti=Math.max(Ti,P.lerp(Ti,q,b)),s.current&&(s.current.style.transform=`scaleX(${Ti.toFixed(4)})`),Hn>cv||Et>hv){ys=!1,Do=Et,s.current&&(s.current.style.transform="scaleX(1)");const Z=a.current;Z&&(Z.style.transition=`opacity ${Ur}s ease-out`,Z.style.opacity="0"),nf(),(No=d.onPictureReady)==null||No.call(d)}}else Do>=0&&Et-Do>Ur+.1&&a.current&&a.current.style.display!=="none"&&(a.current.style.display="none");Qn+=1,zi+=v;const is=ys?"holding":Do>=0&&Et-Do<Ur?"fading":"shown",wa=is!==bc;if(bc=is,zi>=.32||wa){const F=Qn/Math.max(.001,zi);if(Jn=Jn*.55+Math.min(120,F)*.45,Qn=0,zi=0,Et-Wc>=.3||wa){Wc=Et;const G={fps:Math.round(Jn),renderScale:+Ri.toFixed(2),slowDevice:U,vertexCount:di.geometry.getAttribute("position").count+_o.geometry.getAttribute("position").count,orthoResolution:m.orthoLabel,demResolution:m.demLabel,activeTheaterId:d.activeTheaterId,slewActive:ae||Sa,cinemaProgress:Ae,wavePosition:0,imageryAttribution:Pv(m),missingFiles:Kp(m,y.current),film:ta?{move:ta,progress:Gs}:void 0,verticalExaggeration:$r,landingStandpoint:C&&Ua?bi:void 0,intensityLegend:Vp(m),realPass:Sn,lastSeen:li,passOnShow:xo,dayPicture:xn,picture:is,regionGrid:d.regionGridDivisions?Hh(m,d.regionGridDivisions):void 0};(zo=d.onTelemetry)==null||zo.call(d,G)}}};return qn=requestAnimationFrame(Vc),()=>{var v;S=!0,cancelAnimationFrame(qn),Ac.disconnect(),es==null||es.removeEventListener("change",Vn),Ra.removeEventListener("pointerdown",Ic),window.removeEventListener("pointermove",Cc),window.removeEventListener("pointerup",Lc),Ra.removeEventListener("pointerleave",Nc),Ra.removeEventListener("wheel",zc),Fi.removeEventListener("change",Bc),Ra.removeEventListener("contextmenu",Uc),Nl.dispose(),zl.dispose(),Eo.dispose(),kn.dispose(),_n.dispose(),In.dispose(),Jl.dispose(),ec.dispose(),tc.dispose(),ac.dispose();for(const d of xe)d.dispose();tt.dispose(),ft.dispose(),ba==null||ba.dispose(),Qo.dispose(),Jo.dispose(),ei.dispose(),na.dispose(),ds.dispose(),ws==null||ws.dispose(),ko==null||ko.dispose(),ql.dispose(),Dn.dispose(),Pn.dispose();for(const d of Ta.values())uc(d);Ta.clear(),mi.dispose(),qa.dispose(),O.environment=null,lt.dispose();const n=new Set,f=d=>{!d||n.has(d)||(n.add(d),d.dispose())};for(const d of new Set([...le.values(),...ee.values(),...ot,se,m]))!d.pack&&d.lite===null&&(f(d.demTex),f(d.satTex)),f((v=d.fireHistory)==null?void 0:v.texture),f(d.shadow);K.dispose(),A.dispose(),Ra.parentElement===x&&x.removeChild(Ra),E.current=null}},[]),At.useEffect(()=>{var x;(x=E.current)==null||x.applyCameraPreset()},[e.cameraPreset,e.inWorkspace,e.mode]),At.useEffect(()=>{var x;(x=E.current)==null||x.syncCinemaStart(e.cinemaActive)},[e.cinemaActive]);const T=At.useRef(null),w=At.useRef(e.activeTheaterId);return At.useEffect(()=>{const x=E.current;if(!x)return;const S=e.slewRequest;if(S&&S.nonce!==T.current){T.current=S.nonce,w.current=S.targetTheaterId,x.triggerSlew(S.targetTheaterId);return}e.activeTheaterId!==w.current&&(w.current=e.activeTheaterId,x.triggerSlew(e.activeTheaterId))},[e.activeTheaterId,e.slewRequest]),At.useEffect(()=>{const x=e.activeRun,S=E.current;if(!x||!S)return;let A=!1;const U=S.takeRunBundle(x.run_id);if(U){S.activateBundle(U,U.regionId!==S.onScreenRegionId());return}return(async()=>{var I;try{const D=S.bundleCache.get(x.region.id),z=x.assets.dem_hires_f32_url?Wa(g.current,x.assets.dem_hires_f32_url):null,O=Wa(g.current,x.assets.dem_f32_url),k=Wa(g.current,x.assets.satellite_url),K=!!(g.current.filmMove??Cu()),j=Wa(g.current,x.assets.reconstruction_u8_url),xe=async()=>{if(z){const ft=await fetch(z).catch(()=>null);if(ft&&ft.ok)return ft.arrayBuffer()}const tt=await fetch(O).catch(()=>null);return tt&&tt.ok?tt.arrayBuffer():null},be=()=>new Promise(tt=>{if(K){tt(null);return}S.texLoader.load(k,ft=>{ft.colorSpace=it,ft.anisotropy=S.maxAnisotropy,ft.minFilter=Va,ft.magFilter=ze,ft.wrapS=Ke,ft.wrapT=Ke,tt(ft)},void 0,()=>tt(null))}),[ye,ne,Se]=await Promise.all([xe(),be(),fetch(j).catch(()=>null)]),Ee=Se&&Se.ok?await Se.arrayBuffer():null;if(A)return;const lt=Yu(x.region.id)?Vo[x.region.id]:null,le=x.region.bbox,ee=x.observer_passes?wd(x.observer_passes,le):Dr(),et=ee.dataSource==="firms",ct=[],zt=D&&!(et&&D.noRealGround)?D:void 0,se=D&&!(et&&D.noRealPicture)?D:void 0;et&&!ye&&!zt&&ct.push("elevation"),et&&!ne&&!se&&!K&&ct.push("imagery"),et&&!Ee&&ct.push("field");const m=ye?Ds(new Float32Array(ye),!0):zt?{texture:zt.demTex,aligned:zt.alignedDem,gridRes:zt.demGridRes,minElev:zt.minElevM,maxElev:zt.maxElevM}:Ds(et?new Float32Array(4096).fill(Number.isFinite(x.region.min_elev_m)?x.region.min_elev_m:0):jc("plumas_ca",256),!1),ot=Ee?Hd(new Uint8Array(Ee),!0):et||!D?{buffer:Fr(),frames:so}:{buffer:D.tensor,frames:D.frameCount},Xt=ne??(se==null?void 0:se.satTex)??(et?Hp():null)??qc(lt?lt.id:"plumas_ca",m.aligned,m.gridRes,m.minElev,m.maxElev,S.maxAnisotropy),fa=ne&&typeof((I=ne.image)==null?void 0:I.width)=="number"?ne.image.width:2048,jt=Hr(x.region.id,le,m.aligned,m.gridRes,ot.buffer,ot.frames),_t=x.region.min_elev_m<=1.5,sa={key:`run-${x.run_id}`,regionId:x.region.id,runId:x.run_id,missingFiles:ct.length>0?ct:void 0,demTex:m.texture,alignedDem:m.aligned,demGridRes:m.gridRes,minElevM:Number.isFinite(x.region.min_elev_m)?Math.min(m.minElev,x.region.min_elev_m):m.minElev,maxElevM:Number.isFinite(x.region.max_elev_m)?Math.max(m.maxElev,x.region.max_elev_m):m.maxElev,satTex:Xt,orthoLabel:ne?fa>=1600?"2K":"1K":(se==null?void 0:se.orthoLabel)??(et?"not loaded":"drawn stand-in"),demLabel:ye||zt||!et?`${m.gridRes}²`:"not loaded",noRealGround:ye?void 0:zt?zt.noRealGround:!0,noRealPicture:ne?void 0:se?se.noRealPicture:!0,tensor:ot.buffer,frameCount:ot.frames,bbox:le,windDirUv:[...Mv],hasSeaCoast:_t,observerDataset:ee,findings:jt.anchors,callouts:jt.callouts,fieldScale:yd(x.encoding),residenceHours:Md(x.model)??void 0,declared:mr(x.declared_cells),answeredByOther:Op(x),fireHistory:null,...Or(Math.max(18,x.region.width_km||60),Math.max(12,x.region.depth_km||kr(le)),x.assets.terrain_pack,fa,ne?Xu:(se==null?void 0:se.attribution)??"")};S.storeRunBundle(x.region.id,x.run_id,sa);const dt=bd(x.belief_frames),me=M.current,Pt=dt&&!me.has(x.run_id)?[...me.values()].find(tt=>tt.info.url===dt.url&&tt.info.steps===dt.steps):void 0;if(dt&&Pt)for(me.set(x.run_id,{info:dt,bytes:Pt.bytes,declared:mr(x.declared_cells)});me.size>6;)me.delete(me.keys().next().value);dt&&!me.has(x.run_id)&&fetch(Wa(g.current,dt.url)).then(tt=>tt.ok?tt.arrayBuffer():null).then(tt=>{if(!tt||tt.byteLength!==dt.steps*dt.nx*dt.ny*2){y.current.add(x.run_id);return}for(me.set(x.run_id,{info:dt,bytes:new Uint8Array(tt),declared:mr(x.declared_cells)});me.size>6;)me.delete(me.keys().next().value)}).catch(()=>{y.current.add(x.run_id)});const ia=g.current.activeTheaterId;(!Yu(x.region.id)||x.region.id===ia)&&S.activateBundle(sa,!0)}catch{}})(),()=>{A=!0}},[e.activeRun,e.apiBase]),Yt.jsxs("div",{ref:t,tabIndex:0,role:"application","aria-label":"3D terrain of the place, with the fire on it",onKeyDown:x=>{var S;!e.inWorkspace&&x.key==="Enter"&&((S=e.onEnterWorkspace)==null||S.call(e))},style:{position:"relative",width:"100%",height:"100%",overflow:"hidden",outline:"none",backgroundColor:"#080b11",cursor:e.inWorkspace?"grab":"pointer"},children:[Yt.jsxs("div",{"aria-hidden":!e.inWorkspace||e.cleanHud||e.cinemaActive,style:{position:"absolute",inset:0,pointerEvents:"none",zIndex:5},children:[Yt.jsxs("svg",{width:"100%",height:"100%",style:{position:"absolute",inset:0,overflow:"visible",pointerEvents:"none"},children:[[0,1,2].map(x=>Yt.jsx("polyline",{ref:S=>{o.current[x]=S},fill:"none",stroke:h[x]&&e.selectedFindingId===h[x].id?"rgba(155, 227, 255, 0.88)":"rgba(245, 246, 250, 0.34)",strokeWidth:"1",style:{opacity:0,transition:"stroke 160ms ease"}},x)),Yt.jsxs("g",{ref:u,className:"stage-scale",style:{opacity:0},children:[Yt.jsx("path",{ref:r,fill:"none",stroke:"rgba(243, 244, 246, 0.72)",strokeWidth:"1"}),Yt.jsx("text",{ref:c,fill:"rgba(243, 244, 246, 0.92)",stroke:"rgba(8, 11, 17, 0.72)",strokeWidth:"3",style:{fontFamily:"'IBM Plex Mono', ui-monospace, monospace",fontSize:"12px",paintOrder:"stroke"}})]})]}),[0,1,2].map(x=>{const S=h[x],A=!!(S&&e.selectedFindingId===S.id),U=(S==null?void 0:S.kind)==="uncertainty"?"#9be3ff":(S==null?void 0:S.kind)==="subpixel"?"#ffb36b":"#ff7849";return Yt.jsxs("div",{children:[Yt.jsx("div",{ref:I=>{i.current[x]=I},style:{position:"absolute",top:0,left:0,width:"14px",height:"14px",display:"flex",alignItems:"center",justifyContent:"center",color:U,fontFamily:"'IBM Plex Mono', ui-monospace, monospace",fontSize:"13px",fontWeight:600,lineHeight:1,textShadow:"0 1px 6px rgba(0, 0, 0, 0.9)",opacity:0,willChange:"transform, opacity"},children:"+"}),Yt.jsxs("button",{ref:I=>{l.current[x]=I},type:"button","data-stage-ui":"true",onClick:()=>{var I;S&&((I=e.onSelectFinding)==null||I.call(e,S))},style:{position:"absolute",top:0,left:0,minWidth:"188px",maxWidth:"248px",padding:"7px 10px",textAlign:"left",borderRadius:0,border:A?`1px solid ${U}`:"1px solid rgba(243, 244, 246, 0.24)",background:"rgba(10, 13, 19, 0.88)",color:"#f3f4f6",cursor:"pointer",opacity:0,visibility:"hidden",pointerEvents:"none",willChange:"transform, opacity"},children:[Yt.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"6px",fontFamily:"'Geist', -apple-system, sans-serif",fontSize:"13px",fontWeight:500,letterSpacing:"-0.01em",color:"#f3f4f6"},children:[Yt.jsx("span",{children:(S==null?void 0:S.title)??""}),Yt.jsx("span",{style:{width:"6px",height:"6px",borderRadius:0,backgroundColor:U,flexShrink:0}})]}),Yt.jsx("div",{style:{marginTop:"3px",fontFamily:"'IBM Plex Mono', ui-monospace, monospace",fontSize:"12px",fontVariantNumeric:"tabular-nums",color:U},children:(S==null?void 0:S.valueText)??""})]})]},x)})]}),Yt.jsx("div",{ref:a,"aria-hidden":"true","data-stage-cover":"",style:{position:"absolute",inset:0,zIndex:5,backgroundColor:"var(--sys-night, #080b11)",pointerEvents:"none"},children:Yt.jsx("div",{style:{position:"absolute",left:"50%",top:"50%",width:"240px",height:"1px",marginLeft:"-120px",background:"rgba(255, 255, 255, 0.10)"},children:Yt.jsx("div",{ref:s,style:{width:"100%",height:"100%",background:"rgba(255, 255, 255, 0.86)",transform:"scaleX(0)",transformOrigin:"left center"}})})})]})}export{Ov as EarthCutawayStage,Ov as default};

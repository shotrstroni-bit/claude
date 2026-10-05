window.BB = window.BB || {};
BB.Art = BB.Art || {};

// Android 18, painted in a 400x900 design space. Pass viewBox to crop (e.g. a face icon).
BB.Art.android18 = function (opts) {
  const o = opts || {};
  const vb = o.viewBox || '0 0 400 900';
  const W = o.width || 400;
  const H = o.height || 900;
  const I = BB.Ink;
  const M = (d) => I.mirror(d, 200);
  const ink = (d, w, color, x) => I.outline(d, Object.assign({ w, color }, x));
  const stroke = (d, w, color, x) => I.line(d, Object.assign({ w, color }, x));
  const C = BB.Art.A18;

  const LINE = { skin: '#8a4a44', hair: '#8a5718', jean: '#1a2d5c', vest: '#07070b', shirt: '#38344d', belt: '#3a1d0d', boot: '#2c170b' };
  const SKIN = '#fde5d8', SKIN_SH = '#f1ad9c';

  // Soft shading painted inside a clip: an offset, blurred copy of the silhouette darkens the shadow side.
  const formShade = (clip, d, color, width, dx, dy, opacity, blur) =>
    `<g clip-path="url(#${clip})"><path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" transform="translate(${dx} ${dy})" opacity="${opacity}" filter="url(#${blur})"/></g>`;

  const stripes = [];
  for (let y = 176; y < 352; y += 14) {
    const t = Math.max(0, 1 - Math.abs(y - 272) / 48);
    const b = 9 * t;
    stripes.push(`<path d="M110 ${y} Q172 ${y + b} 200 ${y + b * 0.35} Q228 ${y + b} 290 ${y}" stroke="#23252e" stroke-width="5" fill="none"/>`);
  }

  function eye(side) {
    const X = (x) => (side > 0 ? x : 400 - x);
    const P = (d) => (side > 0 ? d : M(d));
    const id = side > 0 ? 'R' : 'L';
    return `
    <ellipse cx="${X(220)}" cy="100" rx="15" ry="5.5" fill="#e48f88" opacity=".35" filter="url(#aB2)"/>
    <clipPath id="aEye${id}"><path d="${P(C.eyeWhite)}"/></clipPath>
    <path d="${P(C.eyeWhite)}" fill="#ffffff"/>
    <g clip-path="url(#aEye${id})">
      <path d="${P('M200 97 L238 97 L238 106 C226 102.5 212 102.5 200 106.5 Z')}" fill="#b6a6cc" opacity=".55"/>
      <ellipse cx="${X(218)}" cy="108.6" rx="7.5" ry="9.1" fill="url(#aIris)"/>
      <ellipse cx="${X(218)}" cy="108.6" rx="7.5" ry="9.1" fill="none" stroke="#0c2552" stroke-width=".9"/>
      <ellipse cx="${X(218)}" cy="109.4" rx="4.6" ry="6" fill="none" stroke="#7cc4ff" stroke-width=".7" opacity=".55"/>
      <ellipse cx="${X(218)}" cy="109.6" rx="3" ry="4.4" fill="#08183a"/>
      <path d="${P('M211.6 111.6 C213.5 116.2 222.5 116.2 224.4 111.6 C222 114.2 214 114.2 211.6 111.6 Z')}" fill="#c4f2ff" opacity=".95" filter="url(#aB05)"/>
      <path d="${P('M200 97 L238 97 L238 105.2 C226 101.8 212 101.8 200 105.8 Z')}" fill="#1b2c58" opacity=".5" filter="url(#aB1)"/>
    </g>
    <ellipse cx="${X(215)}" cy="104.9" rx="2.4" ry="3.1" transform="rotate(${-25 * side} ${X(215)} 104.9)" fill="#ffffff"/>
    <circle cx="${X(221.6)}" cy="112.4" r="1.15" fill="#ffffff"/>
    <circle cx="${X(213.4)}" cy="110.8" r=".7" fill="#ffffff" opacity=".9"/>
    ${stroke(P('M202 105.5 C208 98.4 222 95.6 236.5 100'), 3.4, '#1d1018', { tIn: 0.55, tOut: 0.08 })}
    ${stroke(P('M232.5 100.6 C235.6 98.6 237.6 96.8 239.6 94.4'), 1.5, '#1d1018', { tIn: 0, tOut: 0.9 })}
    ${stroke(P('M230.6 99.6 C233 97 234.4 94.8 235.4 92'), 1.1, '#1d1018', { tIn: 0, tOut: 0.9 })}
    ${stroke(P('M234.6 102.6 C237.4 102.8 239.6 102 241.2 100.8'), 1.1, '#1d1018', { tIn: 0, tOut: 0.9 })}
    ${stroke(P('M210 115.6 C216 117.8 223.4 116.8 229.4 112.2'), 1.05, '#7a3d40', { tIn: 0.5, tOut: 0.2 })}
    ${stroke(P('M205 97.6 C212 92.6 224 91.8 233 96'), 0.9, '#b97a6c', { tIn: 0.3, tOut: 0.4 })}
    ${stroke(P('M207 89.6 C214 85.4 224 85.4 232.4 89.4'), 1.9, '#9a6a2c', { tIn: 0.25, tOut: 0.65 })}`;
  }

  function shine() {
    let out = '';
    const n = 26;
    for (let k = 0; k < n; k++) {
      const th = (Math.PI / 180) * (160 - (140 * k) / (n - 1));
      const jitter = 2.2 * Math.sin(k * 2.7);
      const bx = 205 + Math.cos(th) * 46, by = 96 - Math.sin(th) * 41 + jitter;
      let dx = bx - 214, dy = by - 34;
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const len = 8 + 5 * Math.abs(Math.sin(k * 1.9));
      const w = 2.6 + 1.3 * Math.abs(Math.cos(k * 1.3));
      const x0 = bx - dx * len * 0.45, y0 = by - dy * len * 0.45;
      out += stroke(`M${x0.toFixed(1)} ${y0.toFixed(1)} L${(x0 + dx * len).toFixed(1)} ${(y0 + dy * len).toFixed(1)}`, w, '#fffcef', { tIn: 0.45, tOut: 0.6, opacity: 0.92 });
    }
    return out;
  }

  function arm(side) {
    const P = (d) => (side > 0 ? d : M(d));
    const id = side > 0 ? 'L' : 'R';
    const ua = P(C.upperArm), fa = P(C.forearm), hand = P(C.hand);
    return `
    <clipPath id="aUA${id}"><path d="${ua}"/></clipPath>
    <clipPath id="aFA${id}"><path d="${fa}"/></clipPath>
    <clipPath id="aHand${id}"><path d="${hand}"/></clipPath>
    <path d="${ua}" fill="url(#aStripeUA${id})"/>
    ${formShade('aUA' + id, ua, '#262a52', 15, -5, -2, 0.5, 'aB4')}
    ${formShade('aUA' + id, ua, '#ffffff', 6, 4, 1, 0.5, 'aB2')}
    <g clip-path="url(#aUA${id})"><path d="${P('M126 226 C132 238 136 246 141 251 C130 259 121 263 112 262 Z')}" fill="#262a52" opacity=".35" filter="url(#aB3)"/></g>
    ${ink(ua, 1.9, LINE.shirt, { lo: 0.45 })}
    ${stroke(P('M88 295 C92 300 94 306 94 312'), 1, LINE.shirt)}
    ${stroke(P('M97 291 C100 297 101 303 100 309'), 0.9, LINE.shirt)}
    ${stroke(P('M131 236 C127 244 124 251 122 259'), 0.9, LINE.shirt, { opacity: 0.8 })}
    <path d="${fa}" fill="url(#aStripeFA${id})"/>
    ${formShade('aFA' + id, fa, '#262a52', 12, -4, -3, 0.5, 'aB3')}
    ${formShade('aFA' + id, fa, '#ffffff', 5, 3, 2, 0.45, 'aB2')}
    ${ink(fa, 1.8, LINE.shirt, { lo: 0.45 })}
    <path d="${P(C.cuff)}" fill="#23252e"/>
    ${stroke(P('M117 360.5 L131 350.6 M118.6 363 L132.6 353 M120.2 365.4 L134 355.4'), 0.6, '#5a5d75', { tIn: 0.1, tOut: 0.1 })}
    ${ink(P(C.cuff), 1.4, LINE.vest, { lo: 0.6 })}
    ${C.fingers.map((d, k) => `
      <path d="${P(d)}" stroke="${LINE.skin}" stroke-width="6.6" stroke-linecap="round" fill="none"/>
      <path d="${P(d)}" stroke="${k === 3 ? '#fde3d6' : '#f6cdbd'}" stroke-width="4.6" stroke-linecap="round" fill="none"/>
      <path d="${P(d)}" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" fill="none" opacity=".45" transform="translate(${-0.9 * side} -0.6)"/>`).join('')}
    ${C.nails.map(([x, y, a]) => `<ellipse cx="${side > 0 ? x : 400 - x}" cy="${y}" rx="1.5" ry="1.05" transform="rotate(${a * side} ${side > 0 ? x : 400 - x} ${y})" fill="#ffe9e6"/>`).join('')}
    <path d="${hand}" fill="url(#aSkin)"/>
    ${formShade('aHand' + id, hand, '#e2907e', 8, -3, -3, 0.6, 'aB2')}
    ${stroke(P('M123 361 C129 356 137 355 144 358'), 1.5, '#ffffff', { opacity: 0.6 })}
    ${ink(hand, 1.6, LINE.skin, { lo: 0.4 })}`;
  }

  const boot = (side) => {
    const P = (d) => (side > 0 ? d : M(d));
    const id = side > 0 ? 'L' : 'R';
    const b = P(C.boot);
    return `
    <clipPath id="aBoot${id}"><path d="${b}"/></clipPath>
    <path d="${b}" fill="url(#aBootG)"/>
    ${formShade('aBoot' + id, b, '#2a140a', 10, -4, -2, 0.55, 'aB3')}
    <g clip-path="url(#aBoot${id})">
      <path d="${P('M154 776 C156 798 158 818 156 836')}" stroke="#d9a070" stroke-width="3" fill="none" opacity=".55" filter="url(#aB1)"/>
      <ellipse cx="${side > 0 ? 152 : 248}" cy="840" rx="7" ry="3.2" fill="#e8b884" opacity=".5" filter="url(#aB1)"/>
      <rect x="130" y="760" width="140" height="12" fill="#1a0d06" opacity=".5" filter="url(#aB2)"/>
    </g>
    ${ink(b, 1.9, LINE.boot, { lo: 0.5 })}
    <path d="${P(C.sole)}" fill="#24140c"/>
    ${ink(P(C.sole), 1.4, '#120905', { lo: 0.6 })}`;
  };

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${W}" height="${H}">
<defs>
  ${[0.5, 1, 2, 3, 4, 6].map((s) => `<filter id="aB${String(s).replace('.', '')}" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="${s}"/></filter>`).join('')}
  <linearGradient id="aSkin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0e7"/><stop offset="1" stop-color="#fbdccc"/></linearGradient>
  <linearGradient id="aHairF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3bf"/><stop offset=".42" stop-color="#f8d57c"/><stop offset="1" stop-color="#e3a646"/></linearGradient>
  <linearGradient id="aHairB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dba246"/><stop offset="1" stop-color="#a66e27"/></linearGradient>
  <linearGradient id="aIris" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#143a78"/><stop offset=".5" stop-color="#2c7bcf"/><stop offset="1" stop-color="#93d8ff"/></linearGradient>
  <linearGradient id="aVestL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#262734"/><stop offset=".45" stop-color="#363849"/><stop offset="1" stop-color="#18191f"/></linearGradient>
  <linearGradient id="aVestR" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1c1d25"/><stop offset=".5" stop-color="#25262f"/><stop offset="1" stop-color="#101015"/></linearGradient>
  <linearGradient id="aBelt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a5e36"/><stop offset="1" stop-color="#5e331b"/></linearGradient>
  <linearGradient id="aGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff4bf"/><stop offset=".45" stop-color="#e8bb52"/><stop offset="1" stop-color="#94631b"/></linearGradient>
  <linearGradient id="aBootG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a5532"/><stop offset=".5" stop-color="#6c3f22"/><stop offset="1" stop-color="#3f2312"/></linearGradient>
  <pattern id="aTwill" patternUnits="userSpaceOnUse" width="3.2" height="3.2" patternTransform="rotate(38)"><rect width="3.2" height="1" fill="#ffffff"/></pattern>
  ${[['UAL', 22], ['UAR', -22]].map(([k, a]) => `<pattern id="aStripe${k}" patternUnits="userSpaceOnUse" width="16" height="14" patternTransform="rotate(${a})"><rect width="16" height="14" fill="#f6f6fa"/><rect width="16" height="5" fill="#23252e"/></pattern>`).join('')}
  ${[['FAL', -48], ['FAR', 48]].map(([k, a]) => `<pattern id="aStripe${k}" patternUnits="userSpaceOnUse" width="16" height="13" patternTransform="rotate(${a})"><rect width="16" height="13" fill="#f6f6fa"/><rect width="16" height="4.5" fill="#23252e"/></pattern>`).join('')}
  <clipPath id="aJeans"><path d="${C.jeans}"/></clipPath>
  <clipPath id="aTorso"><path d="${C.torso}"/></clipPath>
  <clipPath id="aVestLc"><path d="${C.vest}"/></clipPath>
  <clipPath id="aVestRc"><path d="${M(C.vest)}"/></clipPath>
  <clipPath id="aFace"><path d="${C.face}"/></clipPath>
  <clipPath id="aNeck"><path d="${C.neck}"/></clipPath>
  <clipPath id="aHairBc"><path d="${C.hairBack}"/></clipPath>
  <clipPath id="aHairFc"><path d="${C.hairCrown}"/><path d="${C.hairRight}"/><path d="${C.hairFringe}"/></clipPath>
</defs>

<g transform="rotate(-3 200 170)">
  <path d="${C.hairBack}" fill="url(#aHairB)"/>
  <g clip-path="url(#aHairBc)">
    <ellipse cx="200" cy="150" rx="46" ry="26" fill="#6e4415" opacity=".55" filter="url(#aB6)"/>
  </g>
  ${stroke('M156 120 C154 138 155 152 158 160 M246 120 C248 138 248 150 246 160', 0.9, '#7a4c16', { opacity: 0.7 })}
  ${ink(C.hairBack, 1.9, '#6a4212', { lo: 0.45 })}
</g>

${boot(1)}${boot(-1)}

<path d="${C.jeans}" fill="#5a8ad0"/>
<g clip-path="url(#aJeans)">
  <rect x="90" y="340" width="220" height="450" fill="url(#aTwill)" opacity=".1"/>
  <path d="${C.jeans}" fill="none" stroke="#1d3770" stroke-width="30" transform="translate(-6 -2)" opacity=".55" filter="url(#aB6)"/>
  <path d="M300 450 C302 498 288 556 266 614 C268 642 272 702 250 778 L262 778 C282 700 278 640 272 612 C294 556 308 498 306 450 Z" fill="#2c4c8e" opacity=".55" filter="url(#aB2)"/>
  <path d="M200 482 C204 534 210 590 212 640 C212 690 214 740 218 778 L226 778 C222 730 220 680 220 636 C218 586 212 530 204 480 Z" fill="#2c4c8e" opacity=".4" filter="url(#aB2)"/>
  <path d="M196 470 C190 520 186 580 186 640 L214 640 C214 580 210 520 204 470 Z" fill="#14244c" opacity=".6" filter="url(#aB4)"/>
  <ellipse cx="138" cy="500" rx="17" ry="74" transform="rotate(-7 138 500)" fill="#b2d0f6" opacity=".55" filter="url(#aB6)"/>
  <ellipse cx="243" cy="496" rx="14" ry="60" transform="rotate(-6 243 496)" fill="#b2d0f6" opacity=".4" filter="url(#aB6)"/>
  <ellipse cx="124" cy="430" rx="12" ry="28" fill="#c6defa" opacity=".45" filter="url(#aB4)"/>
  <ellipse cx="146" cy="694" rx="7" ry="42" fill="#b2d0f6" opacity=".45" filter="url(#aB4)"/>
  <ellipse cx="229" cy="694" rx="6" ry="38" fill="#b2d0f6" opacity=".35" filter="url(#aB4)"/>
  <path d="M150 360 C186 374 214 374 250 360 L250 376 C214 388 186 388 150 376 Z" fill="#0f1d40" opacity=".35" filter="url(#aB3)"/>
  <ellipse cx="134" cy="388" rx="15" ry="19" fill="#0f1d40" opacity=".35" filter="url(#aB3)"/>
  <ellipse cx="270" cy="390" rx="15" ry="19" fill="#0f1d40" opacity=".45" filter="url(#aB3)"/>
  <path d="M136 616 C150 626 172 628 188 618 L188 632 C172 640 150 638 134 628 Z" fill="#1d3770" opacity=".35" filter="url(#aB3)"/>
  <path d="M212 618 C228 628 250 626 266 616 L266 628 C250 638 228 640 212 632 Z" fill="#1d3770" opacity=".4" filter="url(#aB3)"/>
</g>
<g>
  ${stroke('M198 468 C190 462 180 458 167 456 M198 475 C187 473 176 475 163 480 M202 468 C210 462 220 458 233 456 M202 475 C213 473 224 475 237 480', 1.1, LINE.jean, { opacity: 0.75 })}
  ${stroke('M151 398 C158 408 163 418 167 431 M249 398 C242 408 237 418 233 431', 0.9, LINE.jean, { opacity: 0.6 })}
  ${stroke('M146 612 C156 618 168 619 181 612 M150 624 C158 628 166 628 175 624 M254 612 C244 618 232 619 219 612 M250 624 C242 628 234 628 225 624', 1.1, LINE.jean, { opacity: 0.8 })}
  ${stroke('M151 746 C160 750 170 750 179 746 M154 758 C162 761 172 761 181 758 M249 746 C240 750 230 750 221 746 M246 758 C238 761 228 761 219 758', 0.9, LINE.jean, { opacity: 0.7 })}
  ${stroke('M200 362 L200 470', 1.3, LINE.jean, { tIn: 0.05, tOut: 0.2 })}
  <path d="M210 364 C213 400 211 432 201 454" stroke="#eab86a" stroke-width="1.1" fill="none" stroke-dasharray="3.2 2.4"/>
  ${stroke('M160 368 C170 384 178 396 186 404 M240 368 C230 384 222 396 214 404', 1.5, LINE.jean, { tIn: 0.1, tOut: 0.3 })}
  <path d="M157 373 C166 387 173 397 180 406 M243 373 C234 387 227 397 220 406" stroke="#eab86a" stroke-width="1" fill="none" stroke-dasharray="3.2 2.4"/>
  ${stroke('M104 456 C108 516 120 568 134 612 M296 456 C292 516 280 568 266 612', 1, LINE.jean, { opacity: 0.6 })}
  <g fill="#f0cc7a"><circle cx="186" cy="404" r="1.4"/><circle cx="214" cy="404" r="1.4"/></g>
  ${stroke('M146 764 C160 768 172 768 184 764 M254 764 C240 768 228 768 216 764', 1.2, LINE.jean)}
  ${ink(C.jeans, 2.1, LINE.jean, { lo: 0.45 })}
</g>

<path d="${C.neck}" fill="url(#aSkin)"/>
<g clip-path="url(#aNeck)">
  <path d="M184 144 C194 162 206 162 216 144 L216 166 C206 174 194 174 184 166 Z" fill="${SKIN_SH}"/>
  <rect x="207" y="140" width="10" height="40" fill="${SKIN_SH}" opacity=".6" filter="url(#aB2)"/>
</g>
${stroke('M186 140 L186 173', 1.3, LINE.skin, { tIn: 0.1, tOut: 0.1 })}
${stroke('M214 140 L214 173', 1.7, LINE.skin, { tIn: 0.1, tOut: 0.1 })}

<path d="${C.torso}" fill="#f7f7fa"/>
<g clip-path="url(#aTorso)">
  ${stripes.join('\n  ')}
  <path d="M190 250 C194 262 198 276 200 290 C202 276 206 262 210 250" stroke="#8d94b6" stroke-width="4" fill="none" opacity=".3" filter="url(#aB2)"/>
  <path d="M176 302 C188 312 212 312 224 302 L224 322 C212 328 188 328 176 322 Z" fill="#2e2e58" opacity=".4" filter="url(#aB3)"/>
  <path d="M186 176 C183 196 181 222 179 248 C175 266 176 284 180 300 C182 312 186 326 188 346" stroke="#2e2e58" stroke-width="7" fill="none" opacity=".35" filter="url(#aB2)"/>
  <path d="M214 176 C217 196 219 222 221 248 C225 266 224 284 220 300 C218 312 214 326 212 346" stroke="#2e2e58" stroke-width="9" fill="none" opacity=".45" filter="url(#aB2)"/>
</g>
${stroke('M188 256 C192 263 195 270 197 278 M212 256 C208 263 205 270 203 278', 0.7, LINE.shirt, { opacity: 0.4 })}
<path d="M184 170 C192 178 208 178 216 170 L218 174.5 C209 182.5 191 182.5 182 174.5 Z" fill="#f7f7fa"/>
${ink('M184 170 C192 178 208 178 216 170 L218 174.5 C209 182.5 191 182.5 182 174.5 Z', 1.2, LINE.shirt, { lo: 0.5 })}

<path d="${C.vest}" fill="url(#aVestL)"/>
<path d="${M(C.vest)}" fill="url(#aVestR)"/>
${formShade('aVestLc', C.vest, '#000000', 14, -5, -3, 0.5, 'aB4')}
${formShade('aVestRc', M(C.vest), '#000000', 16, -5, -3, 0.6, 'aB4')}
${formShade('aVestLc', C.vest, '#9aa0c4', 3, 3, 1, 0.55, 'aB1')}
${formShade('aVestRc', M(C.vest), '#9aa0c4', 3, 3, 1, 0.3, 'aB1')}
<g clip-path="url(#aVestLc)">
  <ellipse cx="158" cy="262" rx="17" ry="21" fill="#a3a9cc" opacity=".5" filter="url(#aB4)"/>
  <path d="M144 258 C146 246 154 238 166 237 C158 242 151 249 148 260 Z" fill="#d3d7ec" opacity=".6" filter="url(#aB1)"/>
  <path d="M138 284 C144 302 160 310 178 305 C170 314 152 314 140 298 Z" fill="#000000" opacity=".55" filter="url(#aB1)"/>
</g>
<g clip-path="url(#aVestRc)">
  <ellipse cx="236" cy="264" rx="13" ry="17" fill="#a3a9cc" opacity=".28" filter="url(#aB4)"/>
  <path d="M224 252 C228 243 236 238 244 238 C238 243 232 248 228 258 Z" fill="#d3d7ec" opacity=".35" filter="url(#aB1)"/>
  <path d="M262 284 C256 302 240 310 222 305 C230 314 248 314 260 298 Z" fill="#000000" opacity=".6" filter="url(#aB1)"/>
</g>
${stroke('M140 284 C146 302 162 310 178 305 M260 284 C254 302 238 310 222 305', 1.6, LINE.vest)}
${stroke('M163 322 C168 328 172 334 176 340 M170 316 C174 322 178 328 180 336 M237 322 C232 328 228 334 224 340', 1, '#545870', { opacity: 0.9 })}
${stroke('M184 178 C181 198 179 222 177 248 C173 266 174 284 178 300 C180 312 184 326 186 344', 1, '#5a5f7a', { tIn: 0.1, tOut: 0.1 })}
${stroke('M216 178 C219 198 221 222 223 248 C227 266 226 284 222 300 C220 312 216 326 214 344', 0.9, '#43475c', { tIn: 0.1, tOut: 0.1 })}
${ink(C.vest, 2, LINE.vest, { lo: 0.45 })}
${ink(M(C.vest), 2, LINE.vest, { lo: 0.45 })}

<path d="${C.belt}" fill="url(#aBelt)"/>
${stroke('M161 346.6 C186 354.4 214 354.4 239 346.6', 0.9, '#d09a68', { opacity: 0.85 })}
<path d="M163 351 C188 358 212 358 237 351" stroke="#d8a272" stroke-width=".9" fill="none" stroke-dasharray="2.6 2.2" opacity=".8"/>
<g fill="#4d2812"><rect x="171.5" y="349" width="5" height="18" rx="1.2"/><rect x="223.5" y="349" width="5" height="18" rx="1.2"/></g>
${ink(C.belt, 1.6, LINE.belt, { lo: 0.5 })}
<rect x="189" y="347" width="22" height="17" rx="3" fill="none" stroke="url(#aGold)" stroke-width="3.4"/>
<rect x="189" y="347" width="22" height="17" rx="3" fill="none" stroke="#6e4a12" stroke-width=".7" opacity=".8"/>
<path d="M193 355.5 L207 355.5" stroke="url(#aGold)" stroke-width="2.4" stroke-linecap="round"/>
<circle cx="191.6" cy="349.2" r="1.1" fill="#ffffff" opacity=".9"/>

${arm(1)}${arm(-1)}

<g transform="rotate(-3 200 170)">
  <path d="${C.ear}" fill="url(#aSkin)"/>
  <path d="M243 104 C246 106 246 110 244 113" stroke="#d58e7c" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  ${ink(C.ear, 1.4, LINE.skin, { lo: 0.5 })}

  <path d="${C.face}" fill="url(#aSkin)"/>
  <g clip-path="url(#aFace)">
    <path d="M168 122 C172 110 176 104 182 98 L181 106 C188 96 196 88 204 82 L203 90 C210 84 216 76 220 64 L226 72 C222 84 214 94 206 100 C196 108 186 116 177 130 Z" fill="${SKIN_SH}" opacity=".75"/>
    <path d="M168 122 C172 110 176 104 182 98 L181 106 C188 96 196 88 204 82 L203 90 C210 84 216 76 220 64 L226 72 C222 84 214 94 206 100 C196 108 186 116 177 130 Z" fill="#e6907e" opacity=".35" filter="url(#aB2)"/>
    <path d="M229 82 C234 90 238 98 240 108 L238 118 C236 106 233 96 226 88 Z" fill="${SKIN_SH}" opacity=".8"/>
    <path d="M237 102 C235 124 227 138 212 151 C223 146 231 136 238 118 Z" fill="${SKIN_SH}" opacity=".7" filter="url(#aB1)"/>
    <ellipse cx="177" cy="125" rx="10.5" ry="4.8" fill="#ff8495" opacity=".42" filter="url(#aB2)"/>
    <ellipse cx="224" cy="125" rx="10.5" ry="4.8" fill="#ff8495" opacity=".42" filter="url(#aB2)"/>
    <path d="M201 121 C202.4 124 202.8 126 201.2 128.6 L203.4 127.2 C203.8 125 203.2 123 201 121 Z" fill="${SKIN_SH}"/>
  </g>
  ${stroke('M171.4 124.6 L173.6 121.6 M175.4 124.8 L177.6 121.8 M179.4 125 L181.6 122 M219.4 124.6 L221.6 121.6 M223.4 124.8 L225.6 121.8 M227.4 125 L229.6 122', 0.7, '#ef6b7c', { opacity: 0.75, tIn: 0.4, tOut: 0.4 })}
  ${eye(1)}${eye(-1)}
  ${stroke('M200.6 121 C199.6 124.4 198.6 126.4 199.6 128.2', 1.1, '#c27c6b', { tIn: 0.2, tOut: 0.5 })}
  <circle cx="198.8" cy="126.6" r=".8" fill="#ffffff" opacity=".8"/>
  <path d="M196 141.6 C199 144.4 203 144.4 205.6 142.2 C203 143 199 143 196 141.6 Z" fill="#e8868c" opacity=".9"/>
  <ellipse cx="201" cy="143.1" rx="1.4" ry=".45" fill="#ffffff" opacity=".85"/>
  ${stroke('M192.6 138.4 C196 140.6 200 141.2 203.6 140.6 C205.2 140.2 206.6 139.2 207.6 137.6', 1.5, '#8f3f46', { tIn: 0.25, tOut: 0.3 })}
  ${ink(C.face, 1.8, LINE.skin, { lo: 0.4 })}

  <circle cx="245" cy="127.2" r="5.2" fill="none" stroke="url(#aGold)" stroke-width="2.4"/>
  <path d="M241.2 124.4 C242.2 123 243.6 122.2 245 122" stroke="#ffffff" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".9"/>

  <path d="${C.hairCrown}" fill="url(#aHairF)"/>
  <path d="${C.hairRight}" fill="url(#aHairF)"/>
  <path d="${C.hairFringe}" fill="url(#aHairF)"/>
  <g clip-path="url(#aHairFc)">
    <path d="${C.hairFringe}" fill="none" stroke="#c07d27" stroke-width="12" transform="translate(-5 -3)" opacity=".55" filter="url(#aB3)"/>
    <path d="${C.hairRight}" fill="none" stroke="#c07d27" stroke-width="12" transform="translate(-5 -3)" opacity=".5" filter="url(#aB3)"/>
    <path d="M150 140 C160 150 168 160 176 168 L150 170 Z" fill="#b8742a" opacity=".5" filter="url(#aB3)"/>
    <path d="M164 82 C172 64 188 56 205 55 C222 56 238 64 246 82" stroke="#fffbe6" stroke-width="9" fill="none" opacity=".5" filter="url(#aB3)"/>
    ${shine()}
  </g>
  ${stroke('M212 50 C196 58 182 72 174 92 M206 56 C192 68 182 84 177 101 M199 61 C188 76 178 96 172 122 M190 65 C178 82 168 106 166 140 M177 71 C167 92 160 118 162 152 M190 44 C178 50 168 62 162 78', 0.9, '#bf8130', { tIn: 0.2, tOut: 0.5, opacity: 0.85 })}
  ${stroke('M220 52 C230 62 238 72 243 88 M226 58 C234 68 240 80 246 100 M232 53 C242 63 248 75 250 92 M226 42 C240 48 248 58 251 72', 0.9, '#bf8130', { tIn: 0.2, tOut: 0.5, opacity: 0.85 })}
  ${stroke('M208 53 C196 63 186 75 180 92 M170 98 C165 116 164 134 165 152 M228 63 C236 73 242 85 245 99', 0.9, '#fff7d6', { tIn: 0.3, tOut: 0.5, opacity: 0.9 })}
  ${ink(C.hairCrown, 1.8, LINE.hair, { lo: 0.45 })}
  ${ink(C.hairRight, 1.8, LINE.hair, { lo: 0.45 })}
  ${ink(C.hairFringe, 1.9, LINE.hair, { lo: 0.45 })}
  ${stroke('M246.4 111 C249 115 250.6 119 251.4 125 M160 152 C157.6 157 155.4 160.6 152.4 163.6 M204 36.4 C199 32.6 193.6 31 187.6 31.4 M232 39.6 C238 38.4 244 40.4 248.4 44.6', 0.8, LINE.hair, { tIn: 0.1, tOut: 0.8 })}
</g>
</svg>`;
  return svg;
};

BB.Art.A18 = {
  torso: 'M186 170 C170 180 150 186 138 194 C126 202 122 216 124 230 C126 240 134 244 140 246 C132 262 132 290 150 306 C160 318 162 330 160 352 L240 352 C238 330 240 318 250 306 C268 290 268 262 260 246 C266 244 274 240 276 230 C278 216 274 202 262 194 C250 186 230 180 214 170 C208 176 192 176 186 170 Z',
  vest: 'M182 173 C168 181 150 187 138 194 C126 202 122 216 124 230 C127 239 134 244 141 248 C134 264 134 290 150 306 C160 318 162 332 160 346 L188 346 C186 326 182 312 180 300 C176 284 175 266 179 248 C181 222 183 196 186 176 Z',
  jeans: 'M160 352 C124 370 102 406 100 450 C98 498 112 556 134 614 C136 622 132 642 130 662 C128 702 136 746 150 778 L182 778 C186 740 188 690 188 640 C190 590 196 534 200 482 C204 534 210 590 212 640 C212 690 214 740 218 778 L250 778 C264 746 272 702 270 662 C268 642 264 622 266 614 C288 556 302 498 300 450 C298 406 276 370 240 352 Z',
  belt: 'M159 344 C186 352 214 352 241 344 L242 360 C214 368 186 368 158 360 Z',
  neck: 'M186 136 L186 176 C194 181 206 181 214 176 L214 136 Z',
  boot: 'M150 762 L184 762 C186 790 190 816 189 836 C186 850 156 853 141 846 C133 840 139 818 145 796 Z',
  sole: 'M141 846 C156 855 182 853 189 838 L190 847 C183 861 151 862 139 853 Z',
  upperArm: 'M128 194 C112 202 104 220 100 240 C94 262 86 282 80 300 C78 310 86 318 96 316 C110 294 124 270 140 250 C142 234 140 208 128 194 Z',
  forearm: 'M82 302 C90 326 102 348 116 366 L132 354 C118 338 106 320 98 300 Z',
  cuff: 'M113 362 L128 350 L134 357 L119 370 Z',
  hand: 'M119 362 C124 354 136 352 146 358 C150 361 151 365 149 369 C145 374 140 378 135 380 C130 382 125 380 121 375 C118 371 117 366 119 362 Z',
  fingers: ['M131 376 C134 381 136 386 137.5 390', 'M136 374 C139.5 380 142 385 143.5 391', 'M141 371 C145 377 148 382 149.5 388', 'M145.5 366 C150 371 153 376 154.5 382'],
  nails: [[137.3, 389, 25], [143.2, 390, 25], [149.2, 387, 30], [154.2, 381, 35]],
  face: 'M163 90 C163 116 172 136 186 148 C192 153 196 156 200 157 C204 156 208 153 214 148 C228 136 237 116 237 90 C237 62 222 50 200 50 C178 50 163 62 163 90 Z',
  ear: 'M240 98 C248 94 253 108 247 118 C245 121 242 121 240 118 Z',
  eyeWhite: 'M204 104 C210 99 224 98 232 103 C230 111 222 116 216 116 C210 116 206 112 204 104 Z',
  hairBack: 'M152 108 C146 60 172 30 206 32 C240 32 260 60 256 106 C256 132 254 150 249 166 L244 160 L240 168 C232 168 224 165 218 160 L182 160 C176 166 168 168 162 167 L158 160 L152 165 C148 146 150 126 152 108 Z',
  hairCrown: 'M158 84 C156 54 180 36 208 36 C236 36 254 56 252 86 C244 64 228 52 214 48 C196 48 172 60 158 84 Z',
  hairRight: 'M216 44 C236 46 252 62 252 86 C252 96 250 104 246 112 C244 104 242 98 238 92 L239 100 C236 92 232 86 228 80 C224 68 220 56 216 44 Z',
  hairFringe: 'M216 44 C196 46 172 58 164 82 C156 102 154 128 158 150 C160 158 164 164 170 167 C168 152 166 134 168 116 C172 108 176 102 181 96 L180 104 C186 94 194 86 203 79 L202 86 C208 78 214 66 217 52 C217 49 216 46 216 44 Z'
};

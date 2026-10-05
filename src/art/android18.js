window.BB = window.BB || {};
BB.Art = BB.Art || {};

// Full-body vector art in a 400x900 design space. Pass a different viewBox to crop (e.g. a face icon).
BB.Art.android18 = function (opts) {
  const o = opts || {};
  const vb = o.viewBox || '0 0 400 900';
  const w = o.width || 400;
  const h = o.height || 900;
  const OL = '#2a1a24';
  const SK = 'url(#a18skin)';
  const SKS = '#f0bba6';

  const stripes = [];
  for (let y = 176; y < 352; y += 14) {
    const t = Math.max(0, 1 - Math.abs(y - 272) / 48);
    const b = 9 * t;
    stripes.push(`<path d="M110 ${y} Q172 ${y + b} 200 ${y + b * 0.35} Q228 ${y + b} 290 ${y}" stroke="#2b2d37" stroke-width="5" fill="none"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}">
<defs>
  <linearGradient id="a18skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffeadf"/><stop offset="1" stop-color="#f9d6c4"/></linearGradient>
  <linearGradient id="a18hair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde98f"/><stop offset="1" stop-color="#eebd52"/></linearGradient>
  <linearGradient id="a18hairBack" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2b04a"/><stop offset="1" stop-color="#c8913a"/></linearGradient>
  <linearGradient id="a18iris" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d4f99"/><stop offset=".55" stop-color="#3b92dc"/><stop offset="1" stop-color="#8fd3ff"/></linearGradient>
  <linearGradient id="a18jean" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#3a63a3"/><stop offset=".2" stop-color="#6c9ddb"/><stop offset=".42" stop-color="#5584c6"/>
    <stop offset=".5" stop-color="#3f6aa9"/><stop offset=".58" stop-color="#5584c6"/><stop offset=".8" stop-color="#6c9ddb"/><stop offset="1" stop-color="#3a63a3"/>
  </linearGradient>
  <linearGradient id="a18vest" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#121319"/><stop offset=".5" stop-color="#262833"/><stop offset="1" stop-color="#121319"/></linearGradient>
  <radialGradient id="a18bustHi" cx=".42" cy=".38" r=".6"><stop offset="0" stop-color="#ffffff" stop-opacity=".28"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
  <linearGradient id="a18boot" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5a321d"/><stop offset=".45" stop-color="#8a5532"/><stop offset="1" stop-color="#4e2b18"/></linearGradient>
  <pattern id="a18stripeUA" patternUnits="userSpaceOnUse" width="16" height="14" patternTransform="rotate(22)"><rect width="16" height="14" fill="#f5f6f9"/><rect width="16" height="5" fill="#2b2d37"/></pattern>
  <pattern id="a18stripeFA" patternUnits="userSpaceOnUse" width="16" height="13" patternTransform="rotate(-48)"><rect width="16" height="13" fill="#f5f6f9"/><rect width="16" height="4.5" fill="#2b2d37"/></pattern>
  <clipPath id="a18torsoClip"><path d="${BB.Art.A18_TORSO}"/></clipPath>
  <clipPath id="a18eyeClip"><path d="M204 104 C210 99 224 98 232 103 C230 111 222 116 216 116 C210 116 206 112 204 104 Z"/></clipPath>

  <g id="a18eye">
    <path d="M204 104 C210 99 224 98 232 103 C230 111 222 116 216 116 C210 116 206 112 204 104 Z" fill="#ffffff"/>
    <g clip-path="url(#a18eyeClip)">
      <ellipse cx="218" cy="108" rx="7.2" ry="8.8" fill="url(#a18iris)"/>
      <ellipse cx="218" cy="109" rx="3.2" ry="4.6" fill="#0f2650"/>
      <path d="M204 100 C212 96 226 96 234 101 L234 106 C226 102 212 102 204 106 Z" fill="#6b3f4a" opacity=".25"/>
    </g>
    <circle cx="215" cy="105" r="2.3" fill="#fff"/>
    <circle cx="221.5" cy="112" r="1.1" fill="#fff"/>
    <path d="M202 105 C208 96 226 94 236 99 L233 103 C224 99 211 99 204 107 Z" fill="${OL}"/>
    <path d="M233 103 L238 100" stroke="${OL}" stroke-width="2" stroke-linecap="round"/>
    <path d="M209 115 C214 117.5 222 117 228 112" stroke="#a8685a" stroke-width="1.1" fill="none" stroke-linecap="round"/>
    <path d="M206 97 C213 92 225 92 232 96" stroke="#c88b78" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  </g>

  <g id="a18arm">
    <path d="M128 194 C112 202 104 220 100 240 C94 262 86 282 80 300 C78 310 86 318 96 316 C110 294 124 270 140 250 C142 234 140 208 128 194 Z" fill="url(#a18stripeUA)" stroke="${OL}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M108 226 C102 250 94 274 86 296" stroke="#c9ccd6" stroke-width="5" opacity=".45" fill="none" stroke-linecap="round"/>
    <path d="M82 302 C90 326 102 348 116 366 L132 354 C118 338 106 320 98 300 Z" fill="url(#a18stripeFA)" stroke="${OL}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M113 362 L128 350 L134 357 L119 370 Z" fill="#2b2d37" stroke="${OL}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M124 354 C134 346 147 351 152 362 C156 373 153 387 145 393 C137 398 127 394 122 386 C116 376 116 362 124 354 Z" fill="${SK}" stroke="${OL}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M136 364 C140 373 142 381 143 390 M130 368 C133 376 134 384 134 392 M142 360 C147 367 150 374 152 381" stroke="#c98a76" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <path d="M125 356 C130 351 136 350 141 352" stroke="#ffffff" stroke-width="1.6" opacity=".55" fill="none" stroke-linecap="round"/>
  </g>
</defs>

<!-- back hair -->
<path d="M152 108 C146 60 172 30 206 32 C240 32 260 60 256 106 C256 132 254 150 248 166 C236 170 224 166 218 160 L182 160 C176 168 160 170 152 164 C148 146 150 126 152 108 Z" fill="url(#a18hairBack)" stroke="${OL}" stroke-width="2.4" stroke-linejoin="round"/>

<!-- boots -->
<g stroke="${OL}" stroke-width="2.4" stroke-linejoin="round">
  <path d="M150 762 L184 762 C186 790 190 816 189 836 C186 850 156 853 141 846 C133 840 139 818 145 796 Z" fill="url(#a18boot)"/>
  <path d="M141 846 C156 855 182 853 189 838 L190 847 C183 861 151 862 139 853 Z" fill="#2c1a12"/>
  <path d="M250 762 L216 762 C214 790 210 816 211 836 C214 850 244 853 259 846 C267 840 261 818 255 796 Z" fill="url(#a18boot)"/>
  <path d="M259 846 C244 855 218 853 211 838 L210 847 C217 861 249 862 261 853 Z" fill="#2c1a12"/>
</g>
<path d="M156 790 C160 810 162 826 160 838 M244 790 C240 810 238 826 240 838" stroke="#c48a5c" stroke-width="2" opacity=".5" fill="none" stroke-linecap="round"/>

<!-- jeans -->
<path d="M160 352 C124 370 102 406 100 450 C98 498 112 556 134 614 C136 622 132 642 130 662 C128 702 136 746 150 778 L182 778 C186 740 188 690 188 640 C190 590 196 534 200 482 C204 534 210 590 212 640 C212 690 214 740 218 778 L250 778 C264 746 272 702 270 662 C268 642 264 622 266 614 C288 556 302 498 300 450 C298 406 276 370 240 352 Z" fill="url(#a18jean)" stroke="${OL}" stroke-width="2.6" stroke-linejoin="round"/>
<g fill="none" stroke-linecap="round">
  <path d="M130 436 C124 482 130 532 146 580 C150 530 150 480 142 436 Z" fill="#ffffff" opacity=".16" stroke="none"/>
  <path d="M270 436 C276 482 270 532 254 580 C250 530 250 480 258 436 Z" fill="#ffffff" opacity=".16" stroke="none"/>
  <path d="M200 478 C196 520 192 580 188 640 C186 600 184 540 186 498 Z" fill="#1f3f78" opacity=".35" stroke="none"/>
  <path d="M200 478 C204 520 208 580 212 640 C214 600 216 540 214 498 Z" fill="#1f3f78" opacity=".35" stroke="none"/>
  <path d="M200 362 L200 470" stroke="#2c4f8c" stroke-width="2"/>
  <path d="M210 364 C213 400 211 432 201 454" stroke="#e8b96a" stroke-width="1.6" stroke-dasharray="4 3"/>
  <path d="M160 368 C170 384 178 396 186 404" stroke="#2c4f8c" stroke-width="2"/>
  <path d="M240 368 C230 384 222 396 214 404" stroke="#2c4f8c" stroke-width="2"/>
  <path d="M160 372 C168 386 174 396 180 404" stroke="#e8b96a" stroke-width="1.4" stroke-dasharray="4 3"/>
  <path d="M240 372 C232 386 226 396 220 404" stroke="#e8b96a" stroke-width="1.4" stroke-dasharray="4 3"/>
  <path d="M200 456 L188 474 M200 456 L212 474 M190 462 L180 470 M210 462 L220 470" stroke="#2c4f8c" stroke-width="1.6"/>
  <path d="M104 456 C108 516 120 568 134 612" stroke="#2c4f8c" stroke-width="1.6"/>
  <path d="M296 456 C292 516 280 568 266 612" stroke="#2c4f8c" stroke-width="1.6"/>
  <path d="M146 612 C156 620 170 620 182 612 M150 624 C158 628 168 628 176 624" stroke="#2c4f8c" stroke-width="1.5"/>
  <path d="M254 612 C244 620 230 620 218 612 M250 624 C242 628 232 628 224 624" stroke="#2c4f8c" stroke-width="1.5"/>
  <path d="M146 764 C160 768 172 768 184 764 M254 764 C240 768 228 768 216 764" stroke="#2c4f8c" stroke-width="1.6"/>
  <path d="M140 700 C146 730 150 752 156 770 M260 700 C254 730 250 752 244 770" stroke="#8db8ec" stroke-width="2" opacity=".5"/>
</g>

<!-- neck -->
<path d="M186 136 L186 176 C194 181 206 181 214 176 L214 136 Z" fill="${SK}" stroke="${OL}" stroke-width="2.2"/>
<path d="M186 146 C194 160 206 160 214 146 L214 162 C206 170 194 170 186 162 Z" fill="${SKS}"/>

<!-- shirt torso -->
<path d="${BB.Art.A18_TORSO}" fill="#f5f6f9"/>
<g clip-path="url(#a18torsoClip)">
  ${stripes.join('\n  ')}
  <path d="M120 302 C160 322 240 322 280 302 L280 330 C240 342 160 342 120 330 Z" fill="#1d1b2c" opacity=".22"/>
  <path d="M200 250 C198 266 198 282 200 292" stroke="#9aa0b4" stroke-width="2" fill="none" opacity=".7"/>
</g>
<path d="${BB.Art.A18_TORSO}" fill="none" stroke="${OL}" stroke-width="2.4" stroke-linejoin="round"/>
<path d="M184 171 C192 178 208 178 216 171" stroke="${OL}" stroke-width="3" fill="none" stroke-linecap="round"/>

<!-- vest -->
<g stroke="${OL}" stroke-width="2.4" stroke-linejoin="round">
  <path d="M182 173 C168 181 150 188 140 195 C130 203 127 216 130 228 C132 238 138 244 142 248 C134 264 134 290 150 306 C160 318 162 332 160 346 L188 346 C186 326 182 312 180 300 C176 284 175 266 179 248 C181 222 183 196 186 176 Z" fill="url(#a18vest)"/>
  <path d="M218 173 C232 181 250 188 260 195 C270 203 273 216 270 228 C268 238 262 244 258 248 C266 264 266 290 250 306 C240 318 238 332 240 346 L212 346 C214 326 218 312 220 300 C224 284 225 266 221 248 C219 222 217 196 214 176 Z" fill="url(#a18vest)"/>
</g>
<ellipse cx="160" cy="266" rx="26" ry="28" fill="url(#a18bustHi)"/>
<ellipse cx="240" cy="266" rx="26" ry="28" fill="url(#a18bustHi)"/>
<g fill="none" stroke-linecap="round">
  <path d="M140 284 C146 302 162 310 178 305" stroke="#000" stroke-width="2.4" opacity=".6"/>
  <path d="M260 284 C254 302 238 310 222 305" stroke="#000" stroke-width="2.4" opacity=".6"/>
  <path d="M180 300 C188 304 194 298 200 288 C206 298 212 304 220 300" stroke="#6b6f84" stroke-width="2"/>
  <path d="M150 238 C158 232 168 232 174 236" stroke="#5a5d70" stroke-width="2" opacity=".8"/>
  <path d="M250 238 C242 232 232 232 226 236" stroke="#5a5d70" stroke-width="2" opacity=".8"/>
</g>

<!-- belt -->
<path d="M159 344 C186 352 214 352 241 344 L242 360 C214 368 186 368 158 360 Z" fill="#7a4528" stroke="${OL}" stroke-width="2.2" stroke-linejoin="round"/>
<path d="M162 349 C188 356 212 356 238 349" stroke="#a46a40" stroke-width="1.4" fill="none" stroke-dasharray="3 3"/>
<rect x="189" y="347" width="22" height="17" rx="2.5" fill="none" stroke="#e5bf62" stroke-width="3.2"/>
<path d="M193 355.5 L207 355.5" stroke="#e5bf62" stroke-width="2.4" stroke-linecap="round"/>
<path d="M174 350 L174 366 M226 350 L226 366" stroke="#4d2a16" stroke-width="3"/>

<!-- arms -->
<use href="#a18arm"/>
<use href="#a18arm" transform="translate(400 0) scale(-1 1)"/>

<!-- ear + earring -->
<path d="M240 98 C248 94 253 108 247 118 C245 121 242 121 240 118 Z" fill="${SK}" stroke="${OL}" stroke-width="2"/>
<path d="M243 104 C246 106 246 110 244 113" stroke="#d99a86" stroke-width="1.3" fill="none"/>

<!-- face -->
<path d="M162 92 C162 128 176 148 200 156 C224 148 238 128 238 92 C238 62 222 50 200 50 C178 50 162 62 162 92 Z" fill="${SK}" stroke="${OL}" stroke-width="2.4" stroke-linejoin="round"/>
<circle cx="245" cy="127" r="5.2" fill="none" stroke="#e5b84a" stroke-width="2.6"/>
<circle cx="243.5" cy="123" r="1.2" fill="#fff6c8"/>
<path d="M170 118 C178 104 192 90 210 80 L220 64 L222 84 C206 92 192 104 180 122 Z" fill="${SKS}" opacity=".85"/>
<path d="M232 84 C236 92 238 100 239 108 L236 112 C234 102 232 94 228 86 Z" fill="${SKS}" opacity=".85"/>
<ellipse cx="176" cy="125" rx="9" ry="4" fill="#ff8a98" opacity=".32"/>
<ellipse cx="224" cy="125" rx="9" ry="4" fill="#ff8a98" opacity=".32"/>

<use href="#a18eye"/>
<use href="#a18eye" transform="translate(400 0) scale(-1 1)"/>
<path d="M207 90 C214 86 224 86 232 90" stroke="#8f6a3a" stroke-width="2.2" fill="none" stroke-linecap="round"/>
<path d="M200 121 C198.5 125 197.5 127 199.5 128.5" stroke="#c98a76" stroke-width="1.6" fill="none" stroke-linecap="round"/>
<path d="M193 139 C197 141.5 203 141.5 207 138" stroke="#9c4f52" stroke-width="2" fill="none" stroke-linecap="round"/>
<path d="M197 142.5 C200 144 203 144 205 142.5" stroke="#e9a19c" stroke-width="1.6" fill="none" stroke-linecap="round"/>

<!-- front hair -->
<g stroke="${OL}" stroke-width="2.4" stroke-linejoin="round">
  <path d="M158 84 C156 54 180 36 208 36 C236 36 254 56 252 86 C244 64 228 52 214 48 C196 48 172 60 158 84 Z" fill="url(#a18hair)"/>
  <path d="M216 44 C236 46 252 62 252 86 C252 96 250 104 246 110 C244 100 238 90 230 82 C226 70 222 58 216 44 Z" fill="url(#a18hair)"/>
  <path d="M216 44 C196 46 172 58 164 82 C156 102 154 128 158 150 C160 158 164 164 170 166 C168 150 166 130 168 114 C176 100 188 86 206 76 C214 70 220 58 216 44 Z" fill="url(#a18hair)"/>
</g>
<g fill="none" stroke-linecap="round">
  <path d="M174 56 C188 46 210 43 232 50 C226 55 212 52 200 55 C188 58 180 61 174 56 Z" fill="#fff6c6" stroke="none" opacity=".9"/>
  <path d="M206 54 C192 64 178 80 170 104 M196 56 C184 68 172 92 166 128" stroke="#d4a043" stroke-width="1.5"/>
  <path d="M224 56 C232 66 238 76 242 92" stroke="#d4a043" stroke-width="1.4"/>
  <path d="M168 100 C164 116 163 134 164 150" stroke="#fff3b8" stroke-width="2" opacity=".8"/>
</g>
</svg>`;
};

BB.Art.A18_TORSO = 'M186 170 C170 180 150 186 138 194 C126 202 122 216 124 230 C126 240 134 244 140 246 C132 262 132 290 150 306 C160 318 162 330 160 352 L240 352 C238 330 240 318 250 306 C268 290 268 262 260 246 C266 244 274 240 276 230 C278 216 274 202 262 194 C250 186 230 180 214 170 C208 176 192 176 186 170 Z';

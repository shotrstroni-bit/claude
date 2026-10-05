window.BB = window.BB || {};
BB.Art = BB.Art || {};

BB.Art.sky = function (w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#3fa9f5"/><stop offset=".55" stop-color="#8fd2ff"/><stop offset=".8" stop-color="#d8f1ff"/><stop offset="1" stop-color="#fff1d6"/>
  </linearGradient>
  <radialGradient id="sun" cx=".22" cy=".2" r=".45"><stop offset="0" stop-color="#fffbe6" stop-opacity=".95"/><stop offset=".25" stop-color="#fff3c4" stop-opacity=".45"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${w}" height="${h}" fill="url(#g)"/>
<rect width="${w}" height="${h}" fill="url(#sun)"/>
</svg>`;
};

// Tileable mesa band; both edges sit at the same height so tileSprite scrolling is seamless.
BB.Art.mesas = function (kind) {
  const far = kind === 'far';
  const W = 1280, H = far ? 260 : 330;
  const body = far ? '#a7b6e6' : '#d0835f';
  const shade = far ? '#8d9dd2' : '#a95f43';
  const top = far ? '#c3cff3' : '#e9a07a';
  const line = far ? 'none' : '#8a4733';
  const pts = far
    ? 'M0 170 L70 170 L92 112 L180 108 L200 150 L270 152 L304 72 L424 68 L446 124 L530 128 L566 146 L646 142 L676 92 L770 88 L798 152 L884 154 L914 104 L1014 100 L1036 142 L1126 146 L1156 122 L1232 120 L1258 170 L1280 170 L1280 260 L0 260 Z'
    : 'M0 220 L40 220 L66 120 L80 112 L210 108 L226 118 L250 220 L380 224 L404 170 L520 166 L540 226 L640 230 L668 70 L686 62 L840 58 L856 70 L880 228 L1000 230 L1026 150 L1150 146 L1172 226 L1280 220 L1280 330 L0 330 Z';
  const shades = far
    ? '<path d="M180 108 L200 150 L180 152 L170 112 Z M424 68 L446 124 L420 126 L410 72 Z M770 88 L798 152 L776 152 L760 92 Z M1014 100 L1036 142 L1012 144 L1004 104 Z"/>'
    : '<path d="M210 108 L226 118 L250 220 L196 222 L188 112 Z M520 166 L540 226 L500 228 L498 168 Z M840 58 L856 70 L880 228 L812 230 L806 62 Z M1150 146 L1172 226 L1130 228 L1126 148 Z"/>';
  const caps = far
    ? '<path d="M92 112 L180 108 L178 116 L96 120 Z M304 72 L424 68 L422 78 L308 82 Z M676 92 L770 88 L768 96 L680 100 Z M914 104 L1014 100 L1012 108 L918 112 Z"/>'
    : '<path d="M80 112 L210 108 L212 122 L76 128 Z M404 170 L520 166 L520 178 L402 182 Z M686 62 L840 58 L842 74 L682 80 Z M1026 150 L1150 146 L1150 160 L1024 164 Z"/>';
  const strata = far ? '' : `<g stroke="${line}" stroke-width="2.5" fill="none" opacity=".45" stroke-linecap="round">
    <path d="M74 150 L214 146 M70 182 L232 178 M410 196 L528 194 M664 110 L852 104 M660 150 L862 146 M656 190 L870 186 M1030 182 L1158 178"/></g>`;
  const grass = far ? '' : `<path d="M0 300 C120 288 260 296 400 292 C560 288 720 300 880 292 C1040 286 1180 296 1280 300 L1280 330 L0 330 Z" fill="#7cc35a"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<path d="${pts}" fill="${body}"/>
<g fill="${shade}">${shades}</g>
<g fill="${top}">${caps}</g>
${strata}
${grass}
</svg>`;
};

BB.Art.ground = function () {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="200" viewBox="0 0 1280 200">
<defs><linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc35a"/><stop offset="1" stop-color="#3f8a3a"/></linearGradient></defs>
<rect width="1280" height="200" fill="url(#gr)"/>
<g fill="#5fa84a" opacity=".7">
  <path d="M0 40 C200 30 400 52 640 40 C880 28 1080 50 1280 40 L1280 60 C1080 70 880 48 640 60 C400 72 200 50 0 60 Z"/>
  <path d="M0 110 C220 100 420 122 640 110 C860 98 1060 120 1280 110 L1280 128 C1060 138 860 116 640 128 C420 140 220 118 0 128 Z"/>
</g>
<g fill="#d9a77a" opacity=".55"><ellipse cx="300" cy="150" rx="70" ry="10"/><ellipse cx="900" cy="80" rx="50" ry="7"/><ellipse cx="1150" cy="170" rx="80" ry="11"/></g>
</svg>`;
};

BB.Art.cloud = function (v) {
  const shapes = [
    'M40 90 C20 90 10 70 26 58 C24 36 52 26 70 38 C80 14 120 10 136 34 C156 22 186 34 184 58 C204 62 206 90 180 90 Z',
    'M30 80 C12 80 8 62 24 54 C26 34 52 30 64 42 C78 22 110 22 120 42 C140 34 160 46 156 62 C172 66 170 80 150 80 Z',
    'M50 70 C30 70 26 54 42 48 C46 30 74 28 84 40 C100 26 128 32 130 50 C148 50 150 70 130 70 Z'
  ];
  const d = shapes[v % shapes.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="110" viewBox="0 0 220 110">
<defs><clipPath id="c"><path d="${d}"/></clipPath></defs>
<path d="${d}" fill="#ffffff"/>
<g clip-path="url(#c)"><path d="M0 72 C60 84 150 84 220 70 L220 110 L0 110 Z" fill="#d3e7ff"/></g>
</svg>`;
};

BB.Art.glow = function () {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
<defs><radialGradient id="g"><stop offset="0" stop-color="#ffffff" stop-opacity="1"/><stop offset=".45" stop-color="#ffffff" stop-opacity=".45"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs>
<circle cx="128" cy="128" r="128" fill="url(#g)"/>
</svg>`;
};

BB.Art.bush = function () {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="160" viewBox="0 0 260 160">
<path d="M10 160 C0 120 30 96 56 104 C60 70 104 56 126 82 C146 50 200 58 204 96 C236 90 258 126 246 160 Z" fill="#3f8f3c"/>
<path d="M40 160 C40 132 64 120 86 128 C96 104 130 100 146 120 C166 104 198 116 198 140 L210 160 Z" fill="#57ad4c"/>
<path d="M76 118 C86 108 104 104 118 110 M150 92 C164 86 182 88 192 98" stroke="#8fd46e" stroke-width="5" fill="none" stroke-linecap="round"/>
</svg>`;
};

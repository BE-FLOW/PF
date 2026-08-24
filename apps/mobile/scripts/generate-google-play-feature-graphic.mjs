import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./lib/app-store-connect.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDir, "..");
const args = parseArgs();
const execute = args.get("--execute") === "true";
const outputPath = path.join(
  mobileRoot,
  "store",
  "google-play",
  "feature-graphic-1024x500.png",
);

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const regularFont = fs.readFileSync(
  path.join(mobileRoot, "assets", "fonts", "Pretendard-Regular.otf"),
);
const boldFont = fs.readFileSync(
  path.join(mobileRoot, "assets", "fonts", "Pretendard-Bold.otf"),
);
const fontCss = `
  @font-face { font-family: PetFlow; src: url(data:font/otf;base64,${regularFont.toString("base64")}); font-weight: 400; }
  @font-face { font-family: PetFlow; src: url(data:font/otf;base64,${boldFont.toString("base64")}); font-weight: 700; }
`;

const svg = `
<svg width="1024" height="500" viewBox="0 0 1024 500" xmlns="http://www.w3.org/2000/svg">
  <style>${fontCss}</style>
  <rect width="1024" height="500" fill="#F7FAF5"/>
  <circle cx="905" cy="40" r="188" fill="#E6F5D9"/>
  <circle cx="862" cy="445" r="210" fill="#FFF0CF"/>
  <rect x="54" y="44" width="916" height="412" rx="44" fill="#F2FAEB" stroke="#DDEDCF" stroke-width="2"/>

  <g font-family="PetFlow, sans-serif">
    <text x="108" y="126" font-size="32" font-weight="700" fill="#113F35">PetFlow</text>
    <rect x="108" y="151" width="76" height="8" rx="4" fill="#F0AC45"/>
    <text x="108" y="225" font-size="50" font-weight="700" fill="#123F35">한 줄 기록이</text>
    <text x="108" y="286" font-size="50" font-weight="700" fill="#123F35">병원 전달본으로</text>
    <text x="108" y="344" font-size="24" font-weight="400" fill="#4D665F">날짜와 사진을 골라 사실 중심으로 정리해요</text>
  </g>

  <g transform="translate(636 96)">
    <rect x="44" y="38" width="224" height="286" rx="26" fill="#BCDFA7" opacity="0.5" transform="rotate(8 156 181)"/>
    <rect x="14" y="20" width="224" height="286" rx="26" fill="#FFFFFF" stroke="#D9E9D0" stroke-width="2" transform="rotate(-5 126 163)"/>
    <rect x="40" y="24" width="224" height="300" rx="28" fill="#FFFFFF" stroke="#CFE4C3" stroke-width="2"/>
    <circle cx="76" cy="68" r="14" fill="#F2B85C"/>
    <rect x="102" y="57" width="116" height="13" rx="6" fill="#1D6654"/>
    <rect x="68" y="104" width="168" height="54" rx="14" fill="#F7E6BD"/>
    <circle cx="88" cy="130" r="7" fill="#E59B35"/>
    <rect x="105" y="120" width="102" height="8" rx="4" fill="#7B6954"/>
    <rect x="105" y="136" width="74" height="7" rx="3.5" fill="#B5A58F"/>
    <circle cx="88" cy="195" r="7" fill="#5CA98D"/>
    <rect x="105" y="184" width="116" height="8" rx="4" fill="#567168"/>
    <rect x="105" y="200" width="88" height="7" rx="3.5" fill="#AABCB5"/>
    <circle cx="88" cy="252" r="7" fill="#5CA98D"/>
    <rect x="105" y="241" width="104" height="8" rx="4" fill="#567168"/>
    <rect x="105" y="257" width="130" height="7" rx="3.5" fill="#AABCB5"/>
    <rect x="68" y="286" width="168" height="18" rx="9" fill="#D8EEC9"/>
  </g>
</svg>`;

const rendered = await sharp(Buffer.from(svg))
  .flatten({ background: "#F7FAF5" })
  .png({ compressionLevel: 9, palette: false, colours: 256 })
  .toBuffer();
const metadata = await sharp(rendered).metadata();
if (metadata.width !== 1024 || metadata.height !== 500 || metadata.hasAlpha) {
  throw new Error(
    `Invalid feature graphic: ${metadata.width}x${metadata.height}, alpha=${metadata.hasAlpha}.`,
  );
}

if (execute) fs.writeFileSync(outputPath, rendered);
console.log(
  JSON.stringify(
    {
      validated: true,
      execute,
      width: metadata.width,
      height: metadata.height,
      hasAlpha: metadata.hasAlpha,
      output: execute ? outputPath : null,
    },
    null,
    2,
  ),
);

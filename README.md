# Cabinet Analysis Pro

**Industrial Cabinet Analysis · Design · Production**
**تحلیل کابینت صنعتی · طراحی · تولید**

A professional, offline-capable cabinet & MDF analysis application built from the
workshop's own Excel workbook (`analiz pro.2.xlsx`). The original spreadsheet
calculations are reproduced **exactly** and verified against Excel's own cached
results — not re-invented.

نرم‌افزار تحلیل کابینت و MDF، ساخته‌شده بر پایهٔ فایل اکسل کارگاه. محاسبات اکسل
**عیناً** بازتولید و در برابر مقادیر محاسبه‌شدهٔ خود اکسل تست شده‌اند.

---

## Status / وضعیت

| | |
|---|---|
| Excel formula equivalence | ✅ **31/31 blocks + drawer** verified |
| Automated tests | ✅ **216 passing** (158 engine + 58 UI) |
| Offline | ✅ no network calls at runtime |
| Windows installer | ✅ built, installed and launched on a real Windows runner (GitHub Actions) |
| Runtime smoke test | ✅ **116/116** (phase 1) + **12/12** (reopen, separate process) |
| Repeatable build | ✅ `app.asar` byte-identical across two independent builds |
| Exploded A4 drawings | ✅ component numbers, exact mm dimensions, bilingual legend |
| DXF export | ✅ 2D outlines at 1:1 in mm, re-parse verified (no CNC claim) |
| CNC toolpaths / G-code | ⛔ not implemented — the workbook has no machining data |

See [`docs/05-status-and-roadmap.md`](docs/05-status-and-roadmap.md) for an
explicit, honest list of what is done, limited, and not done.

---

## Quick start

```bash
npm install --legacy-peer-deps
npm run dev          # web app at http://localhost:5173
npm run test:all     # 216 tests
```

Desktop (Windows):

```bash
cd apps/desktop && npm install && npm start
cd apps/desktop && npm run dist:win      # NSIS installer + portable exe
```

Full instructions: [`docs/04-windows-build.md`](docs/04-windows-build.md) and
[`docs/07-windows-release.md`](docs/07-windows-release.md) (how to download the
built installer from GitHub Actions).

---

## What it does

- **Cabinet analysis** — ground cabinets, wall cabinets and drawers with the
  workshop's own rules (16 mm board, 2 mm door gaps, 3 mm back panel, door-leaf
  tiering) and a per-value formula audit trail.
- **Cutting list** — algorithmic, deduplicated, traceable to the unit that
  produced each part. Replaces the hand-maintained "analysis" sheets.
- **Sheet optimisation** — guillotine layout per material/thickness with kerf,
  trim allowance and grain constraints. Explicitly labelled *theoretical*.
- **Costing** — boards, edge band, hardware, labour, waste, markup, tax, margin.
  All prices come from the user; nothing is hard-coded as market data.
- **Projects** — multiple cabinets per project, local storage, JSON backup /
  restore, CSV export, printable technical sheet, 2D front/side/plan drawings.
- **Exploded drawings** — one A4 portrait sheet per module: stable component
  numbers, millimetre dimensions taken straight from the calculation, a
  bilingual legend with quantity/thickness/material/edge banding, print-ready
  black and white. The *arrangement* is illustrative; the *numbers* are not, and
  the sheet says so.
- **DXF export** — 2D outlines at 1:1 in millimetres on documented layers,
  verified by re-parsing the produced file. No holes, no toolpaths, and no claim
  of CNC-controller compatibility.
- **Bilingual** — Persian-first RTL with an English LTR mode.

---

## Repository layout

```
packages/engine/     framework-free TypeScript calculation engine
  src/legacy/        the workbook formulas, verified against Excel
  src/optimize/      sheet nesting
  src/exploded.ts    exploded-drawing geometry (illustrative layout, exact dims)
  src/dxf.ts         DXF R12 writer + independent re-parser
  test/fixtures/     golden data extracted from the .xlsx
apps/web/            React + Vite UI (also runs as the Electron renderer)
apps/desktop/        Electron shell + electron-builder config
docs/                Persian documentation
audit/               raw workbook extraction output
tools/               Excel extraction + fixture generation
```

The calculation engine has **zero runtime dependencies** and knows nothing about
React, the DOM, or any cloud service.

---

## Documentation (Persian)

| File | Contents |
|---|---|
| [`docs/01-technical-audit.md`](docs/01-technical-audit.md) | ممیزی فنی فایل اکسل: ساختار، واحدها، قواعد، ریسک‌ها |
| [`docs/02-formula-specification.md`](docs/02-formula-specification.md) | مشخصات کامل فرمول‌ها و گزارش صحت‌سنجی |
| [`docs/03-user-guide.md`](docs/03-user-guide.md) | راهنمای کاربر |
| [`docs/04-windows-build.md`](docs/04-windows-build.md) | ساخت نسخهٔ ویندوز و ساختار مخزن |
| [`docs/05-status-and-roadmap.md`](docs/05-status-and-roadmap.md) | وضعیت، محدودیت‌ها، کارهای باقی‌مانده |
| [`docs/06-test-report.md`](docs/06-test-report.md) | گزارش اجرای تست‌ها و باگ‌های رفع‌شده |
| [`docs/07-windows-release.md`](docs/07-windows-release.md) | انتشار ویندوز: دریافت نصب‌کننده، نصب، تأییدها و آنچه هنوز تأیید نشده |
| [`docs/08-exploded-drawings.md`](docs/08-exploded-drawings.md) | نقشهٔ انفجاری A4: چه چیزی دقیق است و چه چیزی نمایشی |
| [`docs/09-dxf-export.md`](docs/09-dxf-export.md) | خروجی DXF: مشخصات، لایه‌ها، اعتبارسنجی، محدودیت‌ها |
| [`docs/10-excel-crossvalidation.md`](docs/10-excel-crossvalidation.md) | اعتبارسنجی سلول‌به‌سلول با اکسل، تلورانس، ورودی‌های مرزی |
| [`docs/11-dxf-review.md`](docs/11-dxf-review.md) | بازبینی DXF: نسخه، واحد، لایه‌ها، قطعات بی‌اعتبار |
| [`docs/12-workshop-guide.md`](docs/12-workshop-guide.md) | **راهنمای کارگاهی**: نصب، ابعاد، منطق محاسبه، نقشه/DXF، تست‌شده و تأییدنشده، پشتیبان |
| [`docs/13-phase4-report.md`](docs/13-phase4-report.md) | گزارش نهایی مرحلهٔ ۴: تغییرات، نتایج، SHA-256، محدودیت‌ها |

---

## Units

The workbook works in **centimetres**. The engine computes in centimetres so that
Excel arithmetic is reproduced bit-for-bit (including values such as
`12.666666666666668`). Conversion to millimetres happens only at the display and
export boundary.

---

## License

Private project for the repository owner.

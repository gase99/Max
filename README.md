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
| Automated tests | ✅ **110 passing** (92 engine + 18 UI) |
| Offline | ✅ no network calls at runtime |
| Windows desktop shell | ✅ Electron shell ready, installer documented (not built in this environment) |
| CNC / DXF export | ⛔ not implemented (documented) |

See [`docs/05-status-and-roadmap.md`](docs/05-status-and-roadmap.md) for an
explicit, honest list of what is done, limited, and not done.

---

## Quick start

```bash
npm install --legacy-peer-deps
npm run dev          # web app at http://localhost:5173
npm run test:all     # 110 tests
```

Desktop (Windows):

```bash
cd apps/desktop && npm install && npm start
cd apps/desktop && npm run dist:win      # NSIS installer + portable exe
```

Full instructions: [`docs/04-windows-build.md`](docs/04-windows-build.md).

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
- **Bilingual** — Persian-first RTL with an English LTR mode.

---

## Repository layout

```
packages/engine/     framework-free TypeScript calculation engine
  src/legacy/        the workbook formulas, verified against Excel
  src/optimize/      sheet nesting
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

---

## Units

The workbook works in **centimetres**. The engine computes in centimetres so that
Excel arithmetic is reproduced bit-for-bit (including values such as
`12.666666666666668`). Conversion to millimetres happens only at the display and
export boundary.

---

## License

Private project for the repository owner.

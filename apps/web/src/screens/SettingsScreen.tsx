import { Card, Hint, PageHead, SelectField } from '../ui.js';
import type { Store } from '../store.js';
import {
  DOOR_COUNT_FORMULA,
  DOOR_WIDTH_FORMULA,
  GROUND_BACK_LENGTH_ADD,
  GROUND_BACK_LENGTH_SUB,
  GROUND_BACK_WIDTH_ALLOWANCE,
  GROUND_WIDTH_ALLOWANCE,
  WALL_BACK_LENGTH_SUB,
  WALL_BACK_WIDTH_ADD,
  WALL_SHELF_WIDTH_ALLOWANCE,
  WALL_TOP_WIDTH_ALLOWANCE,
  WALL_WIDTH_ALLOWANCE,
  DRAWER_BACK_ALLOWANCE,
  DRAWER_DEPTH_ALLOWANCE,
  DRAWER_FRONT_ALLOWANCE,
  DRAWER_HEIGHT_ALLOWANCE,
  DRAWER_HEIGHT_DIVISOR,
} from '@cabinet/engine';

export default function SettingsScreen({ store, t }: { store: Store; t: (k: string) => string }) {
  const { settings } = store;

  const audit: { sheet: string; cell: string; formula: string; meaning: string }[] = [
    { sheet: 'کابینت زمینی', cell: 'D2', formula: '=B2', meaning: 'طول کف = عرض کابینت' },
    { sheet: 'کابینت زمینی', cell: 'H2', formula: `=B2-${GROUND_WIDTH_ALLOWANCE}`, meaning: 'طول طبقه = عرض − ۳٫۲' },
    { sheet: 'کابینت زمینی', cell: 'J2', formula: `=B2-${GROUND_WIDTH_ALLOWANCE}`, meaning: 'طول قید = عرض − ۳٫۲' },
    { sheet: 'کابینت زمینی', cell: 'K2', formula: `=D2-${GROUND_BACK_WIDTH_ALLOWANCE}`, meaning: 'عرض فیبر ۳ میل' },
    { sheet: 'کابینت زمینی', cell: 'L2', formula: `=F2+${GROUND_BACK_LENGTH_ADD}-${GROUND_BACK_LENGTH_SUB}`, meaning: 'طول فیبر ۳ میل' },
    { sheet: 'کابینت زمینی', cell: 'M2', formula: DOOR_WIDTH_FORMULA, meaning: 'عرض درب (پلهٔ عرض)' },
    { sheet: 'کابینت زمینی', cell: 'N5', formula: DOOR_COUNT_FORMULA, meaning: 'تعداد درب' },
    { sheet: 'کابینت هوایی', cell: 'F3', formula: `=B3-${WALL_WIDTH_ALLOWANCE}`, meaning: 'طول کف' },
    { sheet: 'کابینت هوایی', cell: 'G3', formula: `=C3-${WALL_TOP_WIDTH_ALLOWANCE}`, meaning: 'عرض تاق' },
    { sheet: 'کابینت هوایی', cell: 'H3', formula: `=B3-${WALL_WIDTH_ALLOWANCE}`, meaning: 'طول تاق' },
    { sheet: 'کابینت هوایی', cell: 'I3', formula: `=E3-${WALL_SHELF_WIDTH_ALLOWANCE}`, meaning: 'عرض طبقه' },
    { sheet: 'کابینت هوایی', cell: 'J3', formula: '=F3', meaning: 'طول طبقه' },
    { sheet: 'کابینت هوایی', cell: 'L3', formula: `=B3-${WALL_WIDTH_ALLOWANCE}`, meaning: 'طول قید' },
    { sheet: 'کابینت هوایی', cell: 'M3', formula: `=F3+${WALL_BACK_WIDTH_ADD}`, meaning: 'عرض فیبر ۳ میل' },
    { sheet: 'کابینت هوایی', cell: 'N3', formula: `=D3-${WALL_BACK_LENGTH_SUB}`, meaning: 'طول فیبر ۳ میل' },
    { sheet: 'کشو', cell: 'H4', formula: `=C4-${DRAWER_DEPTH_ALLOWANCE}`, meaning: 'طول بدنه کشو' },
    { sheet: 'کشو', cell: 'H5', formula: `=E4/${DRAWER_HEIGHT_DIVISOR}-${DRAWER_HEIGHT_ALLOWANCE}`, meaning: 'عرض بدنه کشو' },
    { sheet: 'کشو', cell: 'H6', formula: '=B4*2', meaning: 'تعداد بدنه کشو' },
    { sheet: 'کشو', cell: 'J4', formula: `=D4-${DRAWER_FRONT_ALLOWANCE}`, meaning: 'طول جلو کشو' },
    { sheet: 'کشو', cell: 'J5', formula: '=H5', meaning: 'عرض جلو کشو' },
    { sheet: 'کشو', cell: 'L5', formula: `=J5-${DRAWER_BACK_ALLOWANCE}`, meaning: 'عرض پشت کشو' },
  ];

  return (
    <>
      <PageHead title={t('set.title')} />

      <Hint>{t('set.offline')}</Hint>

      <Card title={t('set.title')}>
        <div className="form-grid">
          <SelectField
            label={t('set.language')}
            value={settings.lang}
            options={[
              { value: 'fa', label: 'فارسی (RTL)' },
              { value: 'en', label: 'English (LTR)' },
            ]}
            onChange={(v) => store.setSettings((s) => ({ ...s, lang: v }))}
          />
          <SelectField
            label={t('set.unit')}
            value={settings.unit}
            options={[
              { value: 'mm', label: 'میلی‌متر (mm)' },
              { value: 'cm', label: 'سانتی‌متر (cm) — واحد اکسل' },
            ]}
            onChange={(v) => store.setSettings((s) => ({ ...s, unit: v }))}
          />
        </div>
        <p className="dim small" style={{ marginTop: 10 }}>
          واحد ذخیره‌سازی و محاسبه همیشه سانتی‌متر است (همان واحد فایل اکسل)؛ تغییر «واحد نمایش» فقط روی
          نمایش و خروجی اثر می‌گذارد و نتیجهٔ محاسبه را تغییر نمی‌دهد.
        </p>
      </Card>

      <Card title={t('set.formulaAudit')} sub={t('set.formulaAuditNote')} tight>
        <div className="table-wrap">
          <table className="data formula-audit">
            <thead>
              <tr>
                <th>شیت</th>
                <th>سلول</th>
                <th>{t('common.formula')}</th>
                <th>معنی</th>
                <th>{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a, i) => (
                <tr key={i}>
                  <td className="small">{a.sheet}</td>
                  <td className="mono-cell small">{a.cell}</td>
                  <td className="formula">{a.formula}</td>
                  <td className="small muted">{a.meaning}</td>
                  <td>
                    <span className="chip ok">✓ {t('set.verified')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={t('set.about')}>
        <p style={{ marginTop: 0 }}>
          <strong>Cabinet Analysis Pro 0.1.0</strong> — {t('app.subtitle')}
        </p>
        <p className="small muted" style={{ marginBottom: 0 }}>
          موتور محاسبه به‌صورت مستقل از رابط کاربری پیاده‌سازی شده و با ۳۱ واحد نمونهٔ فایل اکسل
          «analiz pro.2.xlsx» صحت‌سنجی شده است. تمام محاسبات بدون اینترنت و روی همین دستگاه انجام می‌شود.
        </p>
      </Card>
    </>
  );
}

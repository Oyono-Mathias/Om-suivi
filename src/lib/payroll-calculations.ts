/**
 * Cameroon employee payroll deductions (2026 reference schedule).
 * Amounts are monthly FCFA. Employer-only contributions are intentionally excluded.
 * The DGI progressive IRPP is calculated annually, then converted to a monthly withholding.
 */
export function countCoveredWorkDays(
  workedDates: Iterable<string>,
  sickLeaveDates: Iterable<string>
): number {
  return new Set([...workedDates, ...sickLeaveDates]).size;
}

export interface CameroonPayrollDeductionsInput {
  grossSalary: number;
  baseSalary: number;
  cnpsBase?: number;
}

export interface CameroonPayrollDeductions {
  cnps: number;
  cfc: number;
  irpp: number;
  cac: number;
  crtv: number;
  tdl: number;
  total: number;
}

const clampMoney = (value: number | undefined) =>
  Math.max(0, typeof value === "number" && Number.isFinite(value) ? value : 0);
const roundMoney = (value: number) => Math.round(clampMoney(value));

function progressiveAnnualIrpp(taxableAnnualIncome: number): number {
  const income = clampMoney(taxableAnnualIncome);
  if (income <= 2_000_000) return income * 0.10;
  if (income <= 3_000_000) return 200_000 + (income - 2_000_000) * 0.15;
  if (income <= 5_000_000) return 350_000 + (income - 3_000_000) * 0.25;
  return 850_000 + (income - 5_000_000) * 0.35;
}

function crtvMonthly(grossSalary: number): number {
  if (grossSalary < 50_000) return 0;
  if (grossSalary <= 100_000) return 750;
  if (grossSalary <= 200_000) return 1_950;
  if (grossSalary <= 300_000) return 3_250;
  if (grossSalary <= 400_000) return 4_550;
  if (grossSalary <= 500_000) return 5_850;
  if (grossSalary <= 600_000) return 7_150;
  if (grossSalary <= 700_000) return 8_450;
  if (grossSalary <= 800_000) return 9_750;
  if (grossSalary <= 900_000) return 11_050;
  if (grossSalary <= 1_000_000) return 12_350;
  return 13_000;
}

function tdlAnnualFromBaseSalary(baseSalary: number): number {
  if (baseSalary < 62_000) return 0;
  if (baseSalary <= 75_000) return 3_000;
  if (baseSalary <= 100_000) return 6_000;
  if (baseSalary <= 125_000) return 9_000;
  if (baseSalary <= 150_000) return 12_000;
  if (baseSalary <= 200_000) return 15_000;
  if (baseSalary <= 250_000) return 18_000;
  if (baseSalary <= 300_000) return 24_000;
  if (baseSalary <= 500_000) return 27_000;
  return 30_000;
}

export function calculateCameroonPayrollDeductions(
  input: CameroonPayrollDeductionsInput
): CameroonPayrollDeductions {
  const gross = clampMoney(input.grossSalary);
  const base = clampMoney(input.baseSalary);
  const cnpsBase = Math.min(750_000, clampMoney(input.cnpsBase ?? gross));

  // CNPS PVID is a social contribution; the 62,000 FCFA tax withholding threshold does not apply.
  const cnps = roundMoney(cnpsBase * 0.042);
  const cfc = gross < 62_000 ? 0 : roundMoney(gross * 0.01);

  // Taxable salary: 30% professional-expense allowance, mandatory CNPS deduction,
  // then the annual 500,000 FCFA salary abatement before the progressive IRPP scale.
  const monthlyNetTaxable = Math.max(0, (gross - cnps) * 0.70);
  const annualTaxable = Math.max(0, monthlyNetTaxable * 12 - 500_000);
  const irpp = gross < 62_000 ? 0 : roundMoney(progressiveAnnualIrpp(annualTaxable) / 12);
  const cac = roundMoney(irpp * 0.10);

  return {
    cnps,
    cfc,
    irpp,
    cac,
    crtv: gross < 62_000 ? 0 : crtvMonthly(gross),
    tdl: gross < 62_000 ? 0 : roundMoney(tdlAnnualFromBaseSalary(base) / 12),
    total: cnps + cfc + irpp + cac + (gross < 62_000 ? 0 : crtvMonthly(gross)) +
      (gross < 62_000 ? 0 : roundMoney(tdlAnnualFromBaseSalary(base) / 12)),
  };
}


/**
 * Prorata salarial sur une base conventionnelle de 30 jours.
 * Les jours effectifs sont dédupliqués en amont depuis les pointages du cycle.
 */
export function calculatePayrollProration(
  monthlyAmount: number,
  effectiveWorkDays: number,
  referenceDays = 30
): number {
  const amount = clampMoney(monthlyAmount);
  const denominator = Number.isFinite(referenceDays) && referenceDays > 0 ? referenceDays : 30;
  const days = Math.min(denominator, Math.max(0, Number.isFinite(effectiveWorkDays) ? effectiveWorkDays : 0));
  return roundMoney((amount * days) / denominator);
}

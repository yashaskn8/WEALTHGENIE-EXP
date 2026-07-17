/**
 * WealthGenie — Scoring Engine & Investment Rationale
 * ────────────────────────────────────────────────────
 * Extracted from recommendationEngine.js for maintainability.
 * Contains instrument scoring, concentration limits, and
 * human-readable "why" rationale for all 16 instruments.
 */
import { TAX_INFO, CONCENTRATION_CAPS } from '../investmentDatabase.js';
import { getMarginalRate, computePostTaxReturn } from './taxComputation.js';

// ─── SCORING FORMULA ──────────────────────────────────────────────
export function computeScore(inv, profile) {
  const income = Number(profile.monthly_income || profile.income) || 0;
  const savings = Number(profile.monthly_savings || profile.savings) || 0;
  const risk = (profile.risk_appetite || profile.risk || "Medium").toLowerCase();
  const horizon = Number(profile.investment_horizon || profile.horizon) || 10;
  const age = Number(profile.age) || 30;
  const goals = profile.investment_goals || [];
  const annualIncome = income * 12;
  const annualSavings = savings * 12;

  const { postTaxRate } = computePostTaxReturn(inv, annualSavings, annualIncome, profile);

  let score = 0;
  let returnPoints = postTaxRate * 3.5;
  if (inv.id === "gold_etf" || inv.id === "sgb") returnPoints = Math.min(returnPoints, 30);
  score += returnPoints;

  // Risk-alignment bonuses AND mismatch penalties
  if (risk === "low" && inv.risk <= 2) score += 20;
  else if (risk === "low" && inv.risk >= 3) score -= 10;

  if (risk === "medium" && inv.risk >= 2 && inv.risk <= 4) score += 15;
  else if (risk === "medium" && inv.risk === 1) score -= 5;

  if (risk === "high" && inv.risk >= 3) score += 18;
  else if (risk === "high" && inv.risk <= 1) score -= 12;

  // Fix 2: Use effective lock-in for age-based instruments (NPS)
  const effectiveLockIn = (inv.maturity_type === 'age_based' && inv.maturity_age)
    ? Math.max(0, inv.maturity_age - age)
    : inv.lockIn;
  if (effectiveLockIn <= horizon) score += 15;
  if (effectiveLockIn === 0) score += 5;

  if (inv.taxType === "eee") score += 12;
  if (inv.taxType === "elss" && goals.includes("Tax Saving")) score += 10;
  if (inv.taxType === "nps") score += 8;
  if (inv.taxType === "sgb") score += 6;

  if (goals.includes("Tax Saving") && ["eee", "elss", "nps"].includes(inv.taxType)) score += 8;
  if (goals.includes("Retirement") && ["nps", "ppf", "scss"].includes(inv.id)) score += 10;
  if (goals.includes("Wealth Growth") && inv.risk >= 3) score += 5;

  // Age-appropriate scoring: boost senior-specific instruments
  if (inv.id === "nps" && horizon >= 15) score += 8;
  if (inv.id === "sukanya") score += 12;
  if (inv.id === "scss") score += 15;

  return { ...inv, score, postTaxRate };
}

// ─── FIX 2.6: CONCENTRATION GUARD ────────────────────────────────
export function enforceConcentrationLimits(rankedInvestments) {
  return rankedInvestments.map((inv) => {
    const cap = CONCENTRATION_CAPS[inv.id];
    if (cap) {
      return { ...inv, concentrationBadge: cap.badge, maxPct: cap.maxPct };
    }
    return inv;
  });
}

// ─── SECTION 8: getWhy RATIONALE — ALL 16 INSTRUMENTS ─────────────
export function getWhy(inv, profile) {
  const income = Number(profile.monthly_income || profile.income) || 0;
  const savings = Number(profile.monthly_savings || profile.savings) || 0;
  const risk = profile.risk_appetite || profile.risk || "Medium";
  const horizon = Number(profile.investment_horizon || profile.horizon) || 10;
  const age = Number(profile.age) || 30;
  const annualIncome = income * 12;
  const annualSavings = savings * 12;
  const mr = getMarginalRate(annualIncome, profile.taxRegime || 'new');
  const mrPct = (mr * 100).toFixed(0);
  const { postTaxRate, tdsNote } = computePostTaxReturn(inv, annualSavings, annualIncome, profile);
  const postTaxStr = postTaxRate.toFixed(1);

  // Equivalent taxable rate for EEE instruments
  const equivTaxableRate = mr > 0 ? (inv.rate / (1 - mr)).toFixed(1) : inv.rate.toFixed(1);

  const reasons = {
    ppf: [
      `Tax-free growth under the EEE framework means zero tax at every stage — contribution, accumulation, and withdrawal. At your marginal rate of ${mrPct}%, the effective yield is equivalent to a ${equivTaxableRate}% taxable instrument.`,
      `The 15-year horizon aligns with long-term wealth building and the sovereign guarantee eliminates default risk.`,
      `PPF is universally recommended as a foundation for any Indian investor's portfolio.`,
    ],
    scss: [
      `At age ${age}, SCSS is the most efficient guaranteed-income instrument available to you — 8.2% with quarterly payouts and sovereign backing.`,
      `No other government scheme offers this rate with a 5-year lock-in for your age group.`,
      `TDS applies if annual interest exceeds ₹50,000. This should be one of your top-3 instruments.`,
    ],
    liquid_mf: [
      `Liquid Mutual Funds offer high safety and near-instant liquidity (T+1 redemption, with up to ₹50,000 instant withdrawal), making them the perfect core holding for emergency reserves.`,
      `They invest in extremely short-term debt papers (maturity ≤ 91 days) with sovereign or AAA rating, minimizing both credit and interest rate risk.`,
      `Gains are taxed at your income slab rate of ${mrPct}%, but the post-tax yield remains superior to a standard bank savings account.`
    ],
    sukanya: [
      `SSY offers the highest guaranteed EEE return at 8.2% p.a. — better than PPF and entirely tax-free.`,
      `If you have a daughter under 10, this is the single most efficient government scheme available for her education or marriage.`,
      `The 21-year lock-in matches the long-term nature of the goal.`,
    ],
    rbi_bonds: [
      `RBI Sovereign Bonds offer 8.05% with zero credit risk — the highest available safe nominal rate.`,
      `With your savings of ₹${savings.toLocaleString("en-IN")}/month, the 7-year lock-in is manageable within your ${horizon}-year horizon.`,
      `Interest is taxable at your ${mrPct}% slab rate, but the pre-tax yield still exceeds most alternatives.`,
    ],
    fd: [
      `Fixed Deposits offer guaranteed, DICGC-insured returns with no credit risk up to ₹5L per bank.`,
      `Interest is taxable at your slab rate of ${mrPct}%, bringing the net return to ${postTaxStr}%.${tdsNote ? ' ' + tdsNote : ''}`,
      `The 5-year tax-saver FD variant qualifies for 80C deduction if you have remaining 80C capacity.`,
    ],
    sgb: [
      `Sovereign Gold Bonds are the most tax-efficient gold instrument available. Capital gains at 8-year maturity are completely exempt under Section 47(viic), and you additionally earn 2.5% annual interest on the face value.`,
      `This makes the effective post-tax return significantly better than Gold ETF for long-horizon investors.`,
      `The ₹${(480000).toLocaleString("en-IN")} annual investment cap limits exposure. Ideal as 5–10% of portfolio.`,
    ],
    gold_etf: [
      `Gold ETFs provide inflation-hedging and portfolio diversification through a demat account with no lock-in.`,
      `Gains after 1 year are taxed as LTCG at 12.5%. SGB is superior for investors with an 8-year horizon; Gold ETF suits those needing shorter liquidity.`,
      `Limit to 5–10% of total portfolio to avoid over-concentration in commodities.`,
    ],
    debt_mf: [
      `Debt mutual funds provide better liquidity than FDs with comparable returns.`,
      `Since April 2023, all gains are taxed at slab rates, so at your ${mrPct}% rate the net return is ${postTaxStr}%. The key advantage over FDs is complete liquidity and no TDS at source.`,
      `Note: Since April 2023, all debt fund gains are taxed at your income slab rate (no indexation or LTCG benefit). The net return shown already reflects this.`,
    ],
    nps: [
      `NPS offers an additional ₹50,000 deduction under 80CCD(1B) that sits entirely outside your ₹1.5L 80C limit. At your marginal rate of ${mrPct}%, this saves ₹${Math.round(Math.min(50000, annualSavings) * mr).toLocaleString("en-IN")} annually in tax — a guaranteed return on that saving alone.`,
      `The market-linked equity-debt blend historically returns 10–11% p.a., and 60% of the corpus at retirement is tax-free.`,
      horizon >= 15 ? `Your ${horizon}-year horizon perfectly aligns with NPS's long-term structure for maximum compounding.` : `NPS works best with long horizons. Consider maximising only if your horizon is 15+ years.`,
    ],
    hybrid_mf: [
      `Balanced Advantage Funds dynamically shift between equity and debt based on market valuations, reducing drawdown risk during corrections.`,
      `At your ${risk} risk profile and ${horizon}-year horizon, this provides equity-like returns of approximately ${inv.rate}% with meaningfully lower volatility than pure equity.`,
      `LTCG at 12.5% on gains above ₹1.25L.`,
    ],
    index_mf: [
      `Nifty 50 Index Funds offer broad market exposure with the lowest expense ratio in the equity category — typically 0.1–0.2% vs 1–2% for active funds.`,
      `Historical Nifty 50 CAGR over 15-year rolling periods has consistently exceeded 12%.`,
      `LTCG at 12.5% on annual gains above ₹1.25L reduces the effective take-home to ${postTaxStr}%.`,
    ],
    elss: [
      `ELSS provides equity market growth (historically 13–14% CAGR) combined with an 80C deduction of up to ₹1.5L. At your marginal rate of ${mrPct}%, this saves ₹${Math.round(Math.min(150000, annualSavings) * mr).toLocaleString("en-IN")} annually in tax.`,
      `Each SIP instalment has its own 3-year lock-in. A ₹5,000 instalment made today is locked until the same date 3 years from now, not when the account was opened. Units purchased via SIP become liquid on a rolling basis from month 37 onward.`,
      `With the fewest restrictions among all 80C options, ELSS is the strongest tax-saving instrument for equity investors with a horizon above 5 years.`,
    ],
    nifty_etf: [
      `Nifty 50 ETF is the real-time tradeable equivalent of the Index Fund, requiring a demat account. The expense ratio is marginally lower.`,
      `Returns and tax treatment (LTCG at 12.5%) are identical to the Index Fund.`,
      `Prefer this if you already have an active demat account; otherwise the Index Fund is simpler.`,
    ],
    midcap_mf: [
      `Mid-Cap funds have historically delivered 15–16% CAGR over 7-year rolling periods, outperforming large-caps during sustained bull runs.`,
      `The trade-off is meaningfully higher volatility. At age ${age} with a ${horizon}-year horizon, you have sufficient time to recover from drawdowns.`,
      `Keep this as 15–20% of your equity allocation rather than a standalone holding. LTCG applies at 12.5%.`,
    ],
    smallcap_mf: [
      `Small-Cap funds represent the highest potential return in the mutual fund universe — 17%+ CAGR over long periods — but with the highest interim volatility.`,
      `You qualify for this based on your age (${age}), income (₹${annualIncome.toLocaleString("en-IN")}), and savings (₹${savings.toLocaleString("en-IN")}/mo). A strict 10-year minimum horizon is required to absorb drawdown cycles.`,
      `Limit to 10–15% of total portfolio. LTCG at 12.5%.`,
    ],
    direct_equity: [
      `Direct stock investment offers uncapped return potential but demands active research and monitoring.`,
      `With annual income of ₹${annualIncome.toLocaleString("en-IN")} and savings of ₹${savings.toLocaleString("en-IN")}/mo, you have the financial capacity for this.`,
      `LTCG at 12.5% on gains held over 1 year. Diversify across 10–15 stocks to manage company-specific risk. Only suitable as part of a broader portfolio.`,
    ],
  };

  return reasons[inv.id] || [
    `${inv.name} offers ${inv.rate}% p.a. returns with ${inv.riskLabel} risk.`,
    `Lock-in period of ${inv.lockIn} years fits within your ${horizon}-year horizon.`,
    `Tax treatment: ${TAX_INFO[inv.taxType]?.label || inv.taxType}`,
  ];
}

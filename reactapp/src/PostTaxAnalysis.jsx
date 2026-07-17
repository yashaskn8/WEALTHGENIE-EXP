import React, { useMemo } from 'react';
import JargonTooltip from './components/JargonTooltip';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import { Scale, Percent, AlertCircle, TrendingUp } from 'lucide-react';
import { computeRealReturn } from './utils/postTaxEngine';
import { formatINR, getMarginalRate, computePostTaxReturn } from './recommendationEngine';
import './components/TaxScreen.css';

const PostTaxAnalysis = ({ profile, recommendations }) => {
  const regime = profile?.taxRegime || 'new';
  const inflationRate = 6.0;

  // 1. Calculate Marginal Tax Rate
  const { marginalRate, effectiveRate } = useMemo(() => {
    if (!profile) return { marginalRate: 0, effectiveRate: 0 };
    const annualIncome = (profile.monthly_income || 0) * 12;
    const mr = getMarginalRate(annualIncome, regime);

    const stdDeduction = regime === 'new' ? 75000 : 50000;
    const taxable = Math.max(0, annualIncome - stdDeduction);
    let tax = 0;

    if (regime === 'new') {
      const slabs = [
        { min: 0, max: 400000, rate: 0 },
        { min: 400000, max: 800000, rate: 0.05 },
        { min: 800000, max: 1200000, rate: 0.10 },
        { min: 1200000, max: 1600000, rate: 0.15 },
        { min: 1600000, max: 2000000, rate: 0.20 },
        { min: 2000000, max: 2400000, rate: 0.25 },
        { min: 2400000, max: Infinity, rate: 0.30 },
      ];
      for (const slab of slabs) {
        if (taxable <= slab.min) break;
        const taxableInSlab = Math.min(taxable, slab.max) - slab.min;
        tax += taxableInSlab * slab.rate;
      }
      if (taxable <= 1200000) {
        tax = 0;
      } else {
        const excess = taxable - 1200000;
        if (tax > excess) tax = excess;
      }
    } else {
      const slabs = [
        { min: 0, max: 250000, rate: 0 },
        { min: 250000, max: 500000, rate: 0.05 },
        { min: 500000, max: 1000000, rate: 0.20 },
        { min: 1000000, max: Infinity, rate: 0.30 },
      ];
      for (const slab of slabs) {
        if (taxable <= slab.min) break;
        const taxableInSlab = Math.min(taxable, slab.max) - slab.min;
        tax += taxableInSlab * slab.rate;
      }
      if (taxable <= 500000) tax = 0;
    }

    let surchargeRate = 0;
    if (taxable > 5000000) {
      if (regime === 'new') {
        if (taxable <= 10000000) surchargeRate = 0.10;
        else if (taxable <= 20000000) surchargeRate = 0.15;
        else surchargeRate = 0.25;
      } else {
        if (taxable <= 10000000) surchargeRate = 0.10;
        else if (taxable <= 20000000) surchargeRate = 0.15;
        else if (taxable <= 50000000) surchargeRate = 0.25;
        else surchargeRate = 0.37;
      }
    }

    const surcharge = tax * surchargeRate;
    const totalTax = (tax + surcharge) * 1.04;
    const er = annualIncome > 0 ? (totalTax / annualIncome) : 0;
    return { marginalRate: mr, effectiveRate: er };
  }, [profile?.monthly_income, regime]);

  // 2. Map recommendations to Post-Tax Metrics
  const postTaxData = useMemo(() => {
    if (!profile || !recommendations || !Array.isArray(recommendations)) return [];
    const annualIncome = (profile.monthly_income || 0) * 12;
    const annualSavings = (profile.monthly_savings || 0) * 12;
    const horizon = profile.investment_horizon || 15;
    const stepUpPct = 10; 

    // Step-up SIP FV helper
    const calcStepUpFV = (monthlySIP, annualRate, years) => {
      if (!monthlySIP || monthlySIP <= 0 || !years || years <= 0) return 0;
      const r = (annualRate / 100) / 12;
      let fv = 0;
      for (let yr = 0; yr < years; yr++) {
        const sip = monthlySIP * Math.pow(1 + stepUpPct / 100, yr);
        const mRem = (years - yr) * 12;
        if (r > 0) {
          fv += sip * ((Math.pow(1 + r, 12) - 1) / r) * (1 + r) * Math.pow(1 + r, mRem - 12);
        } else {
          fv += sip * 12;
        }
      }
      return fv;
    };

    return recommendations.map(inv => {
      const totalInvested = (inv.monthly_allocation || 0) * horizon * 12;

      // Calculate post-tax rate
      const profileWithRegime = { ...profile, taxRegime: regime };
      const ptResult = computePostTaxReturn(inv, annualSavings, annualIncome, profileWithRegime);
      const nominalReturn = inv.expected_return_max || inv.rate || 0;
      const postTaxReturn = ptResult.postTaxRate || nominalReturn;
      const realReturn = computeRealReturn(postTaxReturn, inflationRate / 100);

      // Compute FVs using Step-Up SIP
      const nominalFV = calcStepUpFV(inv.monthly_allocation, nominalReturn, horizon);
      const postTaxFV = calcStepUpFV(inv.monthly_allocation, postTaxReturn, horizon);
      const postTaxGain = Math.max(0, postTaxFV - totalInvested);

      // Calculate precise Tax Drag (Wealth eroded in Rupees & CAGR Drag)
      const taxDragWealth = Math.max(0, nominalFV - postTaxFV);
      const taxDragCAGR = Math.max(0, nominalReturn - postTaxReturn);

      // Instrument-specific effective tax rate
      const effectiveTaxPct = nominalReturn > 0
        ? Math.max(0, ((nominalReturn - postTaxReturn) / nominalReturn) * 100)
        : 0;

      // Determine tax type label from instrument
      const taxTypeLabels = {
        eee: 'Fully Tax-Free (EEE)', slab: 'Taxed at Slab Rate',
        ltcg: 'Equity Tax (12.5% LTCG)', elss: 'ELSS Tax-Saver (12.5% LTCG)',
        nps: 'Retirement Scheme (Partial Tax-Exempt)', sgb: 'Gold Bond (SGB) Rules',
      };
      const taxType = taxTypeLabels[inv.taxType] || 'Capital Gains';

      return {
        ...inv,
        taxDetails: { taxType, taxRatePercent: parseFloat(effectiveTaxPct.toFixed(1)), postTaxGain, taxDragWealth, taxDragCAGR },
        totalInvested,
        wealthGained: postTaxGain,
        nominalReturn,
        postTaxReturn,
        realReturn,
      };
    });
  }, [recommendations, profile, regime]);

  // Aggregate Tax Drag stats
  const totalTaxDragRupees = useMemo(() => {
    return postTaxData.reduce((sum, d) => sum + d.taxDetails.taxDragWealth, 0);
  }, [postTaxData]);

  // Calculations for beginner highlight card
  const bottomLineMetrics = useMemo(() => {
    if (!profile || !postTaxData || postTaxData.length === 0) return { blendedNominal: 0, blendedReal: 0, keptAmount: 0 };
    const totalSavings = Number(profile.monthly_savings) || 12000;
    const blendedNominal = postTaxData.reduce((sum, a) => sum + (a.monthly_allocation / totalSavings) * a.nominalReturn, 0);
    const blendedReal = postTaxData.reduce((sum, a) => sum + (a.monthly_allocation / totalSavings) * a.realReturn, 0);
    const fraction = blendedNominal > 0 ? (blendedReal / blendedNominal) : 0;
    const keptAmount = Math.max(0, Math.round(1000 * fraction));
    return { blendedNominal, blendedReal, keptAmount };
  }, [postTaxData, profile?.monthly_savings]);

  if (!profile || !recommendations || !Array.isArray(recommendations) || recommendations.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', color: '#94a3b8', fontSize: '0.95rem' }}>
        No investment recommendations found. Please set up your financial profile first to calculate your actual returns.
      </div>
    );
  }

  return (
    <div className="tax-page" style={{ maxWidth: 1200, margin: '0 auto', padding: '36px 20px 80px' }}>
      <motion.header 
        style={{ marginBottom: 40, textAlgin: 'center' }}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="tax-page-badge" style={{ backgroundColor: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.1)', color: '#a78bfa', margin: '0 auto' }}>
          <Scale size={11} style={{ marginRight: 4, verticalAlign: '-1px' }} />
          Actual Returns
        </div>
        <h1 className="tax-page-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginTop: 14 }}>
          Actual Returns (After Tax & Inflation)
        </h1>
        <p className="tax-page-subtitle" style={{ textAlign: 'center' }}>
          See the real growth of your savings once capital gains taxes, slab taxes, and price inflation are accounted for.
        </p>
        <div className="tax-header-divider" />
      </motion.header>

      {/* Control Panel HUD */}
      <motion.div 
        className="tax-controls" 
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'center', marginBottom: 32 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {/* Tax regime display */}
        <div className="tax-control-card">
          <div className="tax-control-card-header">
            <div className="tax-control-card-icon" style={{ background: 'rgba(56,189,248,0.1)', color: '#38bdf8' }}><Percent size={20} /></div>
            <label>Selected Tax System</label>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc', marginTop: 8 }}>
            {regime === 'new' ? 'New Tax Regime' : 'Old Tax Regime'}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>From your financial profile</span>
        </div>

        {/* Marginal bracket stats display */}
        <div className="tax-control-card" style={{ background: 'linear-gradient(155deg, rgba(15,23,42,0.85) 0%, rgba(7,11,20,0.6) 100%)' }}>
          <div className="tax-control-card-header">
            <div className="tax-control-card-icon" style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}><Percent size={20} /></div>
            <label>Your Tax Bracket (Slab Rate)</label>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc', marginTop: 8 }}>
            {(marginalRate * 100).toFixed(0)}% <span style={{ fontSize: '0.88rem', color: '#64748b', fontWeight: 600 }}>Highest Slab</span>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#a78bfa', fontWeight: 700 }}>
            Overall Average Tax Rate: {(effectiveRate * 100).toFixed(1)}%
          </span>
        </div>
      </motion.div>

      {/* Beginner Highlight Card */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(139, 92, 246, 0.04) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: 24,
          padding: '24px 32px',
          marginBottom: 32,
          textAlign: 'center',
          backdropFilter: 'blur(20px)'
        }}
      >
        <h3 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>What You Actually Keep</h3>
        <p style={{ margin: '0 0 16px 0', fontSize: '1.05rem', color: '#e2e8f0', lineHeight: 1.5 }}>
          For every <strong style={{ color: '#38bdf8' }}>₹1,000</strong> of investment profits, you keep about <strong style={{ color: '#10b981', fontSize: '1.2rem', textShadow: '0 0 10px rgba(16,185,129,0.3)' }}>₹{bottomLineMetrics.keptAmount}</strong> after accounting for capital gains tax and {inflationRate}% price inflation.
        </p>
      </motion.div>

      {/* Cumulative Wealth Erosion Impact Banner */}
      {totalTaxDragRupees > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{
            background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.12) 0%, rgba(15, 23, 42, 0.7) 100%)',
            border: '1px solid rgba(244, 63, 94, 0.25)',
            borderRadius: 20, padding: 24, marginBottom: 36, display: 'flex', gap: 16, alignItems: 'flex-start'
          }}
        >
          <AlertCircle size={28} color="#f43f5e" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <h4 style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 800, margin: '0 0 6px 0' }}>Tax Impact Summary</h4>
            <p style={{ color: '#cbd5e1', fontSize: '0.88rem', margin: 0, lineHeight: 1.5 }}>
              Taxes will reduce your final savings by roughly <strong>{formatINR(totalTaxDragRupees)}</strong> over your investment timeline. Using tax-free options (like PPF or NPS) can help protect your returns.
            </p>
          </div>
        </motion.div>
      )}

      {/* Visual Chart Panel */}
      <motion.div 
        className="tax-chart-wrapper" 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{ padding: 28, borderRadius: 20, background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255, 255, 255, 0.05)', marginBottom: 32 }}
      >
        <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          Before-Tax Growth vs After-Tax Growth vs Real Growth
        </h3>
        <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '4px 0 20px 0' }}>
          Compare how taxes and inflation reduce your actual growth rate.
        </p>

        <div style={{ height: 400 }} className="tax-bar-chart-glow">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={postTaxData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
              <defs>
                <linearGradient id="colorNominal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" stopOpacity={1}/>
                  <stop offset="100%" stopColor="#0369a1" stopOpacity={0.8}/>
                </linearGradient>
                <linearGradient id="colorPostTax" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity={1}/>
                  <stop offset="100%" stopColor="#7e22ce" stopOpacity={0.8}/>
                </linearGradient>
                <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={1}/>
                  <stop offset="100%" stopColor="#047857" stopOpacity={0.8}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }} tickFormatter={(val) => `${val}%`} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ background: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(12px)', border: '1px solid rgba(14, 165, 233, 0.3)', borderRadius: 12, color: '#f8fafc', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }} />
              <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '13px', paddingBottom: '16px', fontWeight: 600, color: '#94a3b8' }}/>
              <Bar dataKey="nominalReturn" name="Estimated Return (Before Tax)" fill="url(#colorNominal)" radius={[6,6,0,0]} barSize={28} />
              <Bar dataKey="postTaxReturn" name="After-Tax Return (What You Keep)" fill="url(#colorPostTax)" radius={[6,6,0,0]} barSize={28} />
              <Bar dataKey="realReturn" name="Real Return (Adjusted for Inflation & Tax)" fill="url(#colorReal)" radius={[6,6,0,0]} barSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Simple Table */}
      <motion.div 
        className="tax-chart-wrapper" 
        style={{ padding: '0', overflow: 'hidden', borderRadius: 20, background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255, 255, 255, 0.05)' }}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div style={{ padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.25rem' }}>Detailed Return Rates</h3>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="comparison-table" style={{ width: '100%', margin: 0, borderCollapse: 'collapse' }}>
            <thead style={{ background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(10px)' }}>
              <tr>
                <th style={{ padding: '16px 24px', textAlign: 'left', color: '#94a3b8', fontWeight: 500, fontSize: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Investment Name</th>
                <th style={{ padding: '16px 24px', textAlign: 'left', color: '#94a3b8', fontWeight: 500, fontSize: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Tax Category</th>
                <th style={{ padding: '16px 24px', textAlign: 'left', color: '#94a3b8', fontWeight: 500, fontSize: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Expected Return (Nominal)</th>
                <th style={{ padding: '16px 24px', textAlign: 'left', color: '#94a3b8', fontWeight: 500, fontSize: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Growth Rate After Tax</th>
                <th style={{ padding: '16px 24px', textAlign: 'left', color: '#94a3b8', fontWeight: 500, fontSize: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Real Growth (After Inflation)</th>
                <th style={{ padding: '16px 24px', textAlign: 'right', color: '#94a3b8', fontWeight: 500, fontSize: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Final Savings Value</th>
              </tr>
            </thead>
            <tbody>
              {postTaxData.map((data, i) => {
                return (
                  <tr 
                    key={i} 
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <td style={{ padding: '16px 24px', fontWeight: 600 }}>
                      {data.name} 
                      <br/>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 'normal' }}>{data.category}</span>
                    </td>
                    <td style={{ padding: '16px 24px', color: '#cbd5e1' }}>{data.taxDetails.taxType}</td>
                    <td style={{ padding: '16px 24px', color: '#cbd5e1' }}>{data.nominalReturn.toFixed(1)}%</td>
                    <td style={{ padding: '16px 24px', color: '#a855f7', fontWeight: 700 }}>{data.postTaxReturn.toFixed(1)}%</td>
                    <td style={{ padding: '16px 24px', color: data.realReturn > 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {data.realReturn > 0 ? <TrendingUp size={16} /> : null}
                        {data.realReturn > 0 ? '+' : ''}{data.realReturn.toFixed(1)}%
                      </div>
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: 'right', fontWeight: 800, color: '#f8fafc' }}>
                      {formatINR(data.wealthGained)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
};

export default PostTaxAnalysis;

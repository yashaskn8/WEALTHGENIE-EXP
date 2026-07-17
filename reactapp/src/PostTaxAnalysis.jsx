import React, { useMemo } from 'react';
import JargonTooltip from './components/JargonTooltip';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import { Scale, Percent, AlertCircle, TrendingUp, TrendingDown, Info, ShieldCheck, PiggyBank } from 'lucide-react';
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
      const profileWithRegime = { ...profile, taxRegime: regime };
      const ptResult = computePostTaxReturn(inv, annualSavings, annualIncome, profileWithRegime);
      const nominalReturn = inv.nominalReturn !== undefined ? inv.nominalReturn : (inv.expectedReturn || inv.rate || 0);
      // Always prefer the dynamically computed post-tax rate so this screen
      // reacts in real-time when the user toggles tax regime or income bracket.
      // inv.postTaxReturn is a static snapshot from recommendation time — not suitable here.
      const postTaxReturn = ptResult.postTaxRate !== undefined && ptResult.postTaxRate !== null
        ? ptResult.postTaxRate
        : (inv.postTaxReturn !== undefined ? inv.postTaxReturn : nominalReturn);
      const realReturn = computeRealReturn(postTaxReturn, inflationRate / 100);

      const nominalFV = calcStepUpFV(inv.monthly_allocation, nominalReturn, horizon);
      const postTaxFV = calcStepUpFV(inv.monthly_allocation, postTaxReturn, horizon);
      const postTaxGain = Math.max(0, postTaxFV - totalInvested);

      const taxDragWealth = Math.max(0, nominalFV - postTaxFV);
      const taxDragCAGR = Math.max(0, nominalReturn - postTaxReturn);

      const effectiveTaxPct = nominalReturn > 0
        ? Math.max(0, ((nominalReturn - postTaxReturn) / nominalReturn) * 100)
        : 0;

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

  const totalTaxDragRupees = useMemo(() => {
    return postTaxData.reduce((sum, d) => sum + d.taxDetails.taxDragWealth, 0);
  }, [postTaxData]);

  const bottomLineMetrics = useMemo(() => {
    if (!profile || !postTaxData || postTaxData.length === 0) return { blendedNominal: 0, blendedReal: 0, keptAmount: 0 };
    const totalSavings = Number(profile.monthly_savings) || 12000;
    const blendedNominal = postTaxData.reduce((sum, a) => sum + (a.monthly_allocation / totalSavings) * a.nominalReturn, 0);
    const blendedReal = postTaxData.reduce((sum, a) => sum + (a.monthly_allocation / totalSavings) * a.realReturn, 0);
    const fraction = blendedNominal > 0 ? (blendedReal / blendedNominal) : 0;
    const keptAmount = Math.max(0, Math.round(1000 * fraction));
    return { blendedNominal, blendedReal, keptAmount };
  }, [postTaxData, profile?.monthly_savings]);

  const efficiencyPercent = useMemo(() => {
    return Math.max(0, Math.min(100, (bottomLineMetrics.keptAmount / 10)));
  }, [bottomLineMetrics.keptAmount]);

  const strokeDashoffset = useMemo(() => {
    return 251.2 - (251.2 * efficiencyPercent) / 100;
  }, [efficiencyPercent]);

  const actionableInsights = useMemo(() => {
    const list = [];
    let hasHighSlabDebt = false;
    let hasGoldPhysical = false;

    postTaxData.forEach(d => {
      if (d.taxType === 'slab' && d.id === 'fd') hasHighSlabDebt = true;
      if (d.id === 'gold_physical') hasGoldPhysical = true;
    });

    if (marginalRate >= 0.20 && hasHighSlabDebt) {
      list.push({
        title: 'Optimize Safe Assets',
        body: 'You are in a high tax bracket. Consider routing safe allocations into Arbitrage Funds or PPF instead of bank Fixed Deposits to shield interest from high slab taxes.',
        icon: <ShieldCheck size={18} color="#38bdf8" />,
      });
    }

    if (marginalRate >= 0.10 && !postTaxData.some(d => d.id === 'nps')) {
      list.push({
        title: 'NPS Tax Break',
        body: 'Claim an additional ₹50,000 deduction under Section 80CCD(1B) by investing in National Pension System (NPS). This growth is largely tax-exempt.',
        icon: <PiggyBank size={18} color="#a78bfa" />,
      });
    }

    if (hasGoldPhysical) {
      list.push({
        title: 'Switch to SGBs',
        body: 'Physical Gold and Gold ETFs attract capital gains tax. Sovereign Gold Bonds (SGB) offer 2.5% annual interest and are 100% tax-free at maturity.',
        icon: <Scale size={18} color="#f59e0b" />,
      });
    }

    if (list.length === 0) {
      list.push({
        title: 'Sustain Allocation',
        body: 'Your portfolio is tax-efficient. Continue systematic contributions to maintain current compounding returns.',
        icon: <ShieldCheck size={18} color="#34d399" />,
      });
    }

    return list;
  }, [postTaxData, marginalRate]);

  if (!profile || !recommendations || !Array.isArray(recommendations) || recommendations.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', color: '#94a3b8', fontSize: '0.95rem' }}>
        No investment recommendations found. Please set up your financial profile first to calculate your actual returns.
      </div>
    );
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.05
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 120, damping: 18 } }
  };

  return (
    <motion.div 
      className="tax-page" 
      style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 16px 80px', position: 'relative' }}
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <div className="tax-bg-orb tax-bg-orb--1" />
      <div className="tax-bg-orb tax-bg-orb--2" />

      <motion.header 
        style={{ marginBottom: 36, textAlign: 'left', paddingLeft: 12 }}
        variants={itemVariants}
      >
        <div className="tax-page-badge" style={{ display: 'inline-flex', alignItems: 'center', backgroundColor: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.2)', color: '#c084fc', padding: '5px 14px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase' }}>
          <Scale size={12} style={{ marginRight: 6 }} />
          Tax & Inflation Engine
        </div>
        <h1 className="tax-page-title" style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: 14, fontSize: '2.4rem', fontWeight: 900, background: 'linear-gradient(135deg, #ffffff 0%, #a855f7 60%, #38bdf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-1.2px' }}>
          Actual Returns Summary
        </h1>
        <p className="tax-page-subtitle" style={{ textAlign: 'left', fontSize: '0.92rem', color: '#64748b', marginTop: 8, maxWidth: '640px', margin: '8px 0 0', lineHeight: '1.5' }}>
          Visualizing your true growth rates and profit retention after subtracting Indian tax laws and the eroding effect of inflation.
        </p>
      </motion.header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '28px' }} className="tax-dashboard-responsive-grid">
        <style>{`
          @media (min-width: 1025px) {
            .tax-dashboard-responsive-grid {
              grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr) !important;
            }
          }
          .glass-panel {
            background: linear-gradient(165deg, rgba(10, 18, 36, 0.45) 0%, rgba(5, 9, 20, 0.6) 100%) !important;
            backdrop-filter: blur(24px) saturate(180%) !important;
            border: 1px solid rgba(255, 255, 255, 0.05) !important;
            border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
            border-radius: 20px !important;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.03) !important;
          }
          .circle-progress-container {
            position: relative;
            display: flex;
            justify-content: center;
            align-items: center;
            width: 120px;
            height: 120px;
          }
          .circle-progress-center {
            position: absolute;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }
          .insight-list-item {
            display: flex;
            gap: 12px;
            padding: 14px 16px;
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid rgba(255, 255, 255, 0.03);
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          }
          .insight-list-item:hover {
            background: rgba(255, 255, 255, 0.04);
            border-color: rgba(255, 255, 255, 0.06);
            transform: translateX(3px);
          }
        `}</style>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          <motion.div 
            className="glass-panel" 
            variants={itemVariants}
            style={{ padding: '24px 28px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                  Return Drag Comparison
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0 0' }}>
                  Comparing the direct impact of taxation and standard 6.0% inflation on nominal returns.
                </p>
              </div>
            </div>

            <div style={{ height: 350 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={postTaxData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorNominal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity={1}/>
                      <stop offset="100%" stopColor="#0284c7" stopOpacity={0.7}/>
                    </linearGradient>
                    <linearGradient id="colorPostTax" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c084fc" stopOpacity={1}/>
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.7}/>
                    </linearGradient>
                    <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={1}/>
                      <stop offset="100%" stopColor="#059669" stopOpacity={0.7}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }} tickFormatter={(val) => `${val}%`} axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.02)' }} 
                    contentStyle={{ background: 'rgba(8, 14, 28, 0.95)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 12, color: '#f8fafc', fontSize: '0.85rem' }} 
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}/>
                  <Bar dataKey="nominalReturn" name="Before Tax" fill="url(#colorNominal)" radius={[4,4,0,0]} barSize={20} />
                  <Bar dataKey="postTaxReturn" name="After-Tax" fill="url(#colorPostTax)" radius={[4,4,0,0]} barSize={20} />
                  <Bar dataKey="realReturn" name="Real Return" fill="url(#colorReal)" radius={[4,4,0,0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          <motion.div 
            className="glass-panel" 
            variants={itemVariants}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontWeight: 800, fontSize: '1.1rem', color: '#fff' }}>Detailed Rates</h3>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', backgroundColor: 'rgba(255,255,255,0.03)', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                Inflation: {inflationRate}%
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="comparison-table" style={{ width: '100%', margin: 0, borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead style={{ background: 'rgba(10, 18, 36, 0.5)' }}>
                  <tr>
                    <th style={{ padding: '14px 20px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Asset Name</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tax Type</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nominal</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Post-Tax</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Real (Net)</th>
                    <th style={{ padding: '14px 20px', textAlign: 'right', color: '#64748b', fontWeight: 600, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Projected Savings</th>
                  </tr>
                </thead>
                <tbody>
                  {postTaxData.map((data, i) => {
                    return (
                      <motion.tr 
                        key={i} 
                        whileHover={{ backgroundColor: 'rgba(255, 255, 255, 0.015)' }}
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background-color 0.2s ease' }}
                      >
                        <td style={{ padding: '16px 20px', fontWeight: 700, color: '#f8fafc' }}>
                          {data.name} 
                          <span style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 'normal', display: 'block', marginTop: 3 }}>{data.category}</span>
                        </td>
                        <td style={{ padding: '16px 20px', color: '#cbd5e1' }}>
                          <span style={{ display: 'inline-block', backgroundColor: data.taxType === 'eee' ? 'rgba(52, 211, 153, 0.06)' : 'rgba(255, 255, 255, 0.03)', color: data.taxType === 'eee' ? '#34d399' : '#cbd5e1', padding: '3px 8px', borderRadius: '5px', fontSize: '0.75rem', fontWeight: 500, border: data.taxType === 'eee' ? '1px solid rgba(52, 211, 153, 0.1)' : '1px solid rgba(255, 255, 255, 0.04)' }}>
                            {data.taxDetails.taxType}
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px', color: '#94a3b8', fontWeight: 600 }}>{data.nominalReturn.toFixed(1)}%</td>
                        <td style={{ padding: '16px 20px', color: '#c084fc', fontWeight: 700 }}>{data.postTaxReturn.toFixed(1)}%</td>
                        <td style={{ padding: '16px 20px', color: data.realReturn > 0 ? '#34d399' : '#fb7185', fontWeight: 700 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {data.realReturn > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                            {data.realReturn > 0 ? '+' : ''}{data.realReturn.toFixed(1)}%
                          </div>
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right', fontWeight: 800, color: '#38bdf8' }}>
                          {formatINR(data.wealthGained)}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          <motion.div 
            className="glass-panel" 
            variants={itemVariants}
            style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}
          >
            <div style={{ background: 'rgba(30, 41, 59, 0.2)', border: '1px solid rgba(255, 255, 255, 0.04)', padding: '14px 16px', borderRadius: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <Percent size={14} color="#38bdf8" /> Regime
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#f8fafc', marginTop: 8, letterSpacing: '-0.3px' }}>
                {regime === 'new' ? 'New System' : 'Old System'}
              </div>
            </div>

            <div style={{ background: 'rgba(30, 41, 59, 0.2)', border: '1px solid rgba(255, 255, 255, 0.04)', padding: '14px 16px', borderRadius: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <Percent size={14} color="#c084fc" /> Max Bracket
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#f8fafc', marginTop: 8, letterSpacing: '-0.3px' }}>
                {(marginalRate * 100).toFixed(0)}%
              </div>
            </div>
          </motion.div>

          <motion.div 
            className="glass-panel" 
            variants={itemVariants}
            style={{ padding: '28px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            whileHover={{ scale: 1.01 }}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '0.8rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Profit Retention Efficiency
            </h3>
            
            <div className="circle-progress-container">
              <svg width="110" height="110" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" stroke="rgba(251, 113, 133, 0.12)" strokeWidth="7" fill="transparent" />
                <circle 
                  cx="50" 
                  cy="50" 
                  r="40" 
                  stroke="url(#progressGradient)" 
                  strokeWidth="7" 
                  fill="transparent" 
                  strokeDasharray="251.2" 
                  strokeDashoffset={strokeDashoffset} 
                  strokeLinecap="round"
                  transform="rotate(-90 50 50)"
                />
                <defs>
                  <linearGradient id="progressGradient" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="circle-progress-center">
                <span style={{ fontSize: '1.35rem', fontWeight: 900, color: '#10b981', letterSpacing: '-0.5px' }}>
                  {efficiencyPercent.toFixed(1)}%
                </span>
                <span style={{ fontSize: '0.62rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginTop: 1 }}>
                  Retained
                </span>
              </div>
            </div>

            <p style={{ margin: '18px 0 0 0', fontSize: '0.88rem', color: '#cbd5e1', lineHeight: 1.5, fontWeight: 500 }}>
              For every <strong style={{ color: '#38bdf8' }}>₹1,000</strong> of profits, you keep <strong style={{ color: '#10b981' }}>₹{bottomLineMetrics.keptAmount}</strong>.
              The remaining <strong style={{ color: '#fb7185' }}>₹{1000 - bottomLineMetrics.keptAmount}</strong> is eroded by inflation ({inflationRate}%) and tax drag.
            </p>
          </motion.div>

          {totalTaxDragRupees > 0 && (
            <motion.div
              className="glass-panel"
              variants={itemVariants}
              style={{
                padding: '20px 24px', 
                borderLeft: '4px solid #fb7185',
                background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.05) 0%, rgba(15, 23, 42, 0.4) 100%)'
              }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <AlertCircle size={20} color="#fb7185" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <h4 style={{ color: '#fff', fontSize: '0.92rem', fontWeight: 800, margin: '0 0 4px 0' }}>
                    Projected Tax Erosion
                  </h4>
                  <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: 0, lineHeight: 1.5 }}>
                    Taxes will reduce your total projected savings by roughly <strong style={{ color: '#fb7185' }}>{formatINR(totalTaxDragRupees)}</strong> over your investment timeline.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          <motion.div 
            className="glass-panel" 
            variants={itemVariants}
            style={{ padding: '24px' }}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '0.82rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info size={14} color="#38bdf8" /> Advisory Actions
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {actionableInsights.map((insight, idx) => (
                <div key={idx} className="insight-list-item">
                  <div style={{ marginTop: 2 }}>{insight.icon}</div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc' }}>
                      {insight.title}
                    </h4>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.45 }}>
                      {insight.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default PostTaxAnalysis;

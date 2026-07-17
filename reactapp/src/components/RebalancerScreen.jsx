import React, { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Scale, HelpCircle, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { formatINR } from '../utils/indianNumberFormat';
import JargonTooltip from './JargonTooltip';
import './RebalancerScreen.css';

const RISK_COLORS = {
  'Very Low': '#10b981', 'Low': '#34d399', 'Low-Medium': '#a3e635', 'Medium-Low': '#fbbf24',
  'Medium': '#f59e0b', 'High': '#ef4444', 'Very High': '#dc2626'
};


/**
 * Build allocation percentages from recommendation list.
 * Normalizes so sum === 100.
 */
const buildAllocations = (recs, savings) => {
  const allocs = {};
  let sum = 0;
  const safeSavings = Number(savings) || 12000;
  const safeRecs = recs || [];

  safeRecs.forEach(inv => {
    if (!inv || !inv.id) return;
    const allocVal = Number(inv.monthly_allocation) || 0;
    const pct = safeSavings > 0 ? (allocVal / safeSavings) * 100 : 0;
    allocs[inv.id] = pct;
    sum += pct;
  });

  // Normalize to 100%
  if (sum > 0 && Math.abs(sum - 100) > 0.01) {
    Object.keys(allocs).forEach(k => {
      allocs[k] = (allocs[k] / sum) * 100;
    });
  } else if (sum === 0 && safeRecs.length > 0) {
    const count = safeRecs.filter(inv => inv && inv.id).length;
    safeRecs.forEach(inv => {
      if (inv && inv.id) {
        allocs[inv.id] = 100 / count;
      }
    });
  }
  return allocs;
};

const RebalancerScreen = ({ profile, recommendations, onSave }) => {
  const totalSavings = Number(profile?.monthly_savings) || 12000;
  const recs = useMemo(() => recommendations || [], [recommendations]);

  const [allocations, setAllocations] = useState(() => buildAllocations(recs, totalSavings));
  const [prevRecs, setPrevRecs] = useState(recommendations);

  // The original recommended allocations — used to compute balance score
  const originalAllocations = useMemo(() => buildAllocations(recs, totalSavings), [recs, totalSavings]);

  // Sync allocations when recommendations change during render
  if (recommendations !== prevRecs) {
    setPrevRecs(recommendations);
    setAllocations(buildAllocations(recommendations || [], totalSavings));
  }

  /**
   * Compute a simple balance score (0–100) by measuring how close
   * the user's current slider positions are to the initial recommendation.
   * 100 = perfect match, 0 = completely different.
   */
  const score = useMemo(() => {
    const ids = Object.keys(originalAllocations);
    if (ids.length === 0) return 100;

    let totalDrift = 0;
    ids.forEach(id => {
      const orig = originalAllocations[id] || 0;
      const curr = allocations[id] || 0;
      totalDrift += Math.abs(orig - curr);
    });

    // totalDrift ranges from 0 (perfect) to ~200 (complete opposite).
    // Map to a 0–100 score. Cap drift at 100 to avoid negatives.
    return Math.max(0, Math.round(100 - Math.min(totalDrift, 100)));
  }, [allocations, originalAllocations]);

  const statusColor = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';

  /**
   * Slider change handler - redistributes remaining % proportionally
   * among other instruments so total stays at 100%.
   */
  const handleSliderChange = useCallback((id, newPct) => {
    setAllocations(prev => {
      const oldPct = prev[id] || 0;
      const diff = newPct - oldPct;
      const otherIds = Object.keys(prev).filter(k => k !== String(id));
      const otherTotal = otherIds.reduce((s, k) => s + (prev[k] || 0), 0);

      const newAllocs = { ...prev, [id]: newPct };

      if (otherTotal > 0) {
        otherIds.forEach(k => {
          const proportion = prev[k] / otherTotal;
          newAllocs[k] = Math.max(0, prev[k] - diff * proportion);
        });
      } else if (diff < 0 && otherIds.length > 0) {
        const split = Math.abs(diff) / otherIds.length;
        otherIds.forEach(k => {
          newAllocs[k] = split;
        });
      }

      // Re-normalize
      const total = Object.values(newAllocs).reduce((a, b) => a + b, 0);
      if (total > 0 && Math.abs(total - 100) > 0.01) {
        Object.keys(newAllocs).forEach(k => {
          newAllocs[k] = (newAllocs[k] / total) * 100;
        });
      }

      return newAllocs;
    });
  }, []);

  const handleSave = () => {
    const updated = recs.map(inv => {
      const pct = allocations[inv.id] || 0;
      return {
        ...inv,
        monthly_allocation: Math.round((pct / 100) * totalSavings / 100) * 100
      };
    });
    if (onSave) onSave(updated);
  };

  return (
    <div className="rebalancer-page">
      <div className="ambient-background">
        <div className="ambient-orb orb-1" />
        <div className="ambient-orb orb-2" />
        <div className="ambient-orb orb-3" />
      </div>

      {/* ─── Header ─── */}
      <motion.div
        className="page-header"
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 100 }}
      >
        <div className="page-header-badge">
          <Scale size={12} />
          <span>Investment Mix</span>
        </div>
        <h1 className="page-title">
          Customize Your <span className="title-gradient">Investment Mix</span>
        </h1>
        <p className="page-subtitle">
          Decide how your monthly savings are split across different investments. Adjust the sliders below to match your comfort level.
        </p>
      </motion.div>

      {/* ─── Why This Matters - Beginner Tip ─── */}
      <motion.div
        className="why-balance-card"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22 }}
        style={{ marginBottom: 24 }}
      >
        <div className="why-balance-icon-wrap">
          <HelpCircle size={18} color="#818cf8" />
        </div>
        <div className="why-balance-content">
          <h4 className="why-balance-title">Why does this matter?</h4>
          <p className="why-balance-text">
            Your investment mix decides how fast your money can grow and how much risk you take. Putting more into Equity (stocks) can give higher returns but with ups and downs, while Debt (FDs, bonds) is steadier but grows slower. A good balance suits your comfort level.
          </p>
        </div>
      </motion.div>

      {/* ─── Balance Score Ring ─── */}
      <motion.div
        className="balance-hero-card premium-glass"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        style={{ '--status-color': statusColor, marginBottom: 24 }}
      >
        <div className="balance-hero-inner">
          <div className="balance-ring-container">
            <svg className="balance-ring-svg" viewBox="0 0 180 180">
              <circle className="balance-ring-bg" cx="90" cy="90" r="76" />
              <circle
                className="balance-ring-glow"
                cx="90" cy="90" r="76"
                stroke={statusColor}
                style={{
                  strokeDasharray: '478',
                  strokeDashoffset: 478 - (478 * score) / 100
                }}
              />
              <circle
                className="balance-ring-progress"
                cx="90" cy="90" r="76"
                stroke={statusColor}
                style={{
                  '--ring-color': statusColor,
                  strokeDasharray: '478',
                  strokeDashoffset: 478 - (478 * score) / 100
                }}
              />
            </svg>
            <div className="balance-ring-text">
              <span className="balance-ring-score">
                {score}<span className="balance-ring-unit">%</span>
              </span>
              <span className="balance-ring-quality" style={{ color: statusColor }}>
                {score >= 80 ? 'WELL BALANCED' : score >= 50 ? 'NEEDS TWEAKING' : 'NEEDS ATTENTION'}
              </span>
            </div>
          </div>

          <div className="balance-status-info">
            <div className="balance-status-header">
              <span className="balance-status-title">
                {score >= 80 ? 'Your Mix Looks Great!' : score >= 50 ? 'Almost There — Keep Adjusting' : 'Your Mix Needs Some Work'}
              </span>
            </div>
            <p className="balance-status-description">
              {score >= 80
                ? 'Your investment split closely matches the recommended mix. You\'re good to go!'
                : score >= 50
                  ? 'You\'ve made some changes to the recommended mix. The sliders below show your current split — feel free to adjust until you\'re comfortable.'
                  : 'Your current split is quite different from what we recommend. Try adjusting the sliders below to find a balance that works for you.'}
            </p>
          </div>
        </div>
      </motion.div>

      {/* ─── Investment Split Sliders ─── */}
      <motion.div
        className="rebal-sliders-container premium-glass"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28 }}
        style={{ padding: '24px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(10, 16, 30, 0.4)', backdropFilter: 'blur(16px)', marginBottom: 24 }}
      >
        <div className="sliders-summary-header" style={{ marginBottom: 20 }}>
          <div className="sliders-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="sliders-header-label" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
              <JargonTooltip term="Asset Allocation">Your Investment Split</JargonTooltip>
            </span>
            <span className="sliders-total-badge" style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', padding: '4px 12px', borderRadius: '12px', fontSize: '0.82rem', color: '#38bdf8', fontWeight: 700 }}>
              Total: 100%
            </span>
          </div>
          <p className="sliders-hint" style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: 6 }}>
            Drag any slider to change how much of your savings goes into each investment. The rest will adjust automatically to keep the total at 100%.
          </p>
        </div>

        <div className="rebal-sliders" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {recs.map(inv => {
            const pct = allocations[inv.id] || 0;
            const amt = Math.round((pct / 100) * totalSavings / 100) * 100;
            const riskLabel = inv.risk_level || inv.riskLabel || 'Medium';
            const color = RISK_COLORS[riskLabel] || '#0ea5e9';
            const isAllocated = pct > 0;

            return (
              <div
                key={inv.id}
                className={`rebal-slider-row ${isAllocated ? 'allocated' : 'unallocated'}`}
                style={{ display: 'grid', gridTemplateColumns: '150px 1fr 48px 100px', alignItems: 'center', gap: 14, padding: '12px 16px', background: isAllocated ? 'rgba(255,255,255,0.02)' : 'transparent', border: '1px solid rgba(255,255,255,0.02)', borderRadius: '12px' }}
              >
                <div className="slider-info-col" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="slider-instrument-name" style={{ fontWeight: 600, color: isAllocated ? '#f1f5f9' : '#94a3b8', fontSize: '0.9rem' }}>{inv.name}</span>
                  <span className="slider-instrument-risk" style={{ color: isAllocated ? color : '#64748b', fontSize: '0.75rem', fontWeight: 600 }}>
                    {riskLabel} Risk
                  </span>
                </div>
                <div className="slider-range-col">
                  <input
                    type="range"
                    className="rebal-range"
                    min="0" max="100" step="0.5"
                    value={pct}
                    onChange={e => handleSliderChange(inv.id, Number(e.target.value))}
                    style={{
                      '--slider-color': isAllocated ? color : '#475569',
                      '--slider-pct': `${pct}%`
                    }}
                  />
                </div>
                <span className="slider-pct-value" style={{ color: isAllocated ? color : '#64748b', fontWeight: 700, fontSize: '0.9rem', textAlign: 'right' }}>
                  {pct.toFixed(0)}%
                </span>
                <span className={`slider-amount-value ${isAllocated ? 'allocated-label' : 'unallocated-label'}`} style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.85rem', color: isAllocated ? '#e2e8f0' : '#475569' }}>
                  {isAllocated ? `${formatINR(amt)}/mo` : 'Not Allocated'}
                </span>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* ─── Status Message ─── */}
      {score >= 80 && (
        <div className="balanced-empty-state" style={{ marginBottom: 24 }}>
          <div className="empty-state-icon-wrap">
            <CheckCircle2 size={36} />
          </div>
          <span className="empty-state-title">Everything Looks Good!</span>
          <span className="empty-state-text">Your investments are well balanced. Hit save when you're ready.</span>
        </div>
      )}

      {/* ─── Main CTA ─── */}
      <motion.div
        className="rebal-actions"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <button className="btn-primary-glow" onClick={handleSave}>
          <ShieldCheck size={18} />
          Save My Investment Mix
        </button>
        <p className="cta-helper-text">This will save your chosen investment split and update all your projections</p>
      </motion.div>
    </div>
  );
};

export default RebalancerScreen;

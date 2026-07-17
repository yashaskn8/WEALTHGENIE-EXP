/**
 * DeepDiveModal — Overview Tab
 * Extracted from DeepDiveModal.jsx for maintainability.
 */
import React from 'react';
import { Shield, Zap, Target, Activity, TrendingUp, AlertCircle, Lock, BarChart3, ShieldCheck, Landmark } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TRUST_BADGES } from '../../investmentDatabase';
import JargonTooltip from '../JargonTooltip';

const OverviewTab = ({ inv, comparisonData }) => {
  return (
    <div className="tab-fade-in">
      <div className="ddm-section-header">Asset Intelligence</div>
      <div className="ddm-desc-card">
        <p>{inv.description}</p>
      </div>

      <div className="ddm-pc-grid">
        <div className="pc-card pc-card--pros">
          <div className="pc-title" style={{ color: '#22c55e' }}><Shield size={20} /> Strategic Advantages</div>
          <ul className="pc-list">
            <li className="pc-item"><Zap size={14} className="pc-icon" /> Return potential of {parseFloat(inv.expected_return_min).toFixed(1)}% – {parseFloat(inv.expected_return_max).toFixed(1)}% p.a.</li>
            {inv.tax_benefit && <li className="pc-item"><Target size={14} className="pc-icon" /> Tax deduction under Section {inv.tax_section}</li>}
            {inv.tax_free_interest && <li className="pc-item"><Shield size={14} className="pc-icon" /> Sovereign-backed tax-free maturity (EEE)</li>}
            <li className="pc-item"><Activity size={14} className="pc-icon" /> Portfolio {inv.category.toLowerCase()} diversification</li>
            {inv.lock_in_years === 0 && <li className="pc-item"><TrendingUp size={14} className="pc-icon" /> No lock-in — full liquidity</li>}
          </ul>
        </div>
        <div className="pc-card pc-card--cons">
          <div className="pc-title" style={{ color: '#f59e0b' }}><AlertCircle size={20} /> Risk Considerations</div>
          <ul className="pc-list">
            {inv.lock_in_years > 0 && <li className="pc-item"><Lock size={14} className="pc-icon" /> Mandatory capital lock-in of {inv.lock_in_years} years</li>}
            <li className="pc-item"><BarChart3 size={14} className="pc-icon" /> {inv.risk_level} market sensitivity</li>
            <li className="pc-item"><Activity size={14} className="pc-icon" /> Volatility relative to benchmark indices</li>
          </ul>
        </div>
      </div>

      {/* Safety & Regulation Section */}
      {(() => {
        const trustInfo = TRUST_BADGES[inv.id] || null;
        if (!trustInfo) return null;
        const isSovereign = trustInfo.type === 'sovereign' || trustInfo.type === 'rbi';
        const isInsured = trustInfo.type === 'insured';
        const accentColor = isSovereign ? '#38bdf8' : isInsured ? '#10b981' : '#8b5cf6';
        const accentBg = isSovereign ? 'rgba(56, 189, 248, 0.06)' : isInsured ? 'rgba(16, 185, 129, 0.06)' : 'rgba(139, 92, 246, 0.06)';
        return (
          <>
            <div className="ddm-section-header">Safety & Regulation</div>
            <div className="ddm-trust-card" style={{ borderColor: accentColor.replace(')', ', 0.2)').replace('rgb', 'rgba') }}>
              <div className="ddm-trust-header">
                <div className="ddm-trust-icon" style={{ background: accentBg, color: accentColor }}>
                  {isSovereign ? <Landmark size={22} /> : <ShieldCheck size={22} />}
                </div>
                <div className="ddm-trust-titles">
                  <span className="ddm-trust-label" style={{ color: accentColor }}>{trustInfo.label}</span>
                  <span className="ddm-trust-body">{trustInfo.body}</span>
                </div>
              </div>
              <p className="ddm-trust-desc">{trustInfo.desc}</p>
              <div className="ddm-trust-footer">
                <span className="ddm-trust-chip"><Lock size={11} /> 256-bit Encrypted</span>
                <span className="ddm-trust-chip"><ShieldCheck size={11} /> Audited & Compliant</span>
                {isSovereign && <span className="ddm-trust-chip"><Landmark size={11} /> Zero Default Risk</span>}
                {isInsured && <span className="ddm-trust-chip"><Shield size={11} /> DICGC Protected</span>}
              </div>
            </div>
          </>
        );
      })()}

      <div className="ddm-section-header">Performance Indexing</div>
      <div className="ddm-chart-container">
        <ResponsiveContainer width="100%" height={360}>
          <BarChart data={comparisonData} margin={{ top: 20, right: 20, left: -10, bottom: 30 }}>
            <defs>
              <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity={1}/>
                <stop offset="50%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.1}/>
              </linearGradient>
              <linearGradient id="barGradMuted" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.4}/>
                <stop offset="100%" stopColor="#475569" stopOpacity={0.05}/>
              </linearGradient>
              <linearGradient id="cursorGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.1}/>
                <stop offset="100%" stopColor="transparent" stopOpacity={0}/>
              </linearGradient>
              <filter id="barGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#cbd5e1', fontSize: 11, fontWeight: 600 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false} dy={16} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} dx={-10} />
            <Tooltip cursor={{ fill: 'url(#cursorGrad)' }} contentStyle={{ background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(24px)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 16, boxShadow: '0 16px 32px rgba(0,0,0,0.8), 0 0 20px rgba(56, 189, 248, 0.15)', color: '#f8fafc', fontWeight: 600, padding: '16px' }} itemStyle={{ color: '#38bdf8', fontWeight: 800, fontSize: '1.1rem' }} labelStyle={{ color: '#cbd5e1', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }} />
            <Bar dataKey="returnMax" name="Upside Potential %" radius={[6, 6, 0, 0]} barSize={32}>
              {comparisonData.map((entry, idx) => (
                <Cell key={idx} fill={entry.isThis ? 'url(#barGrad)' : 'url(#barGradMuted)'} filter={entry.isThis ? 'url(#barGlow)' : 'none'} style={{ transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default OverviewTab;

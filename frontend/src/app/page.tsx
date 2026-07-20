"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, Send, Server, ArrowRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const API_URL = "http://localhost:8000";

type ModelOption = {
  urn: string;
  name: string;
};

type FeatureRiskResult = {
  feature_name: string;
  source_entity_urn: string;
  psi: number;
  ks_pvalue: number | null;
  risk_level: string;
};

type ModelAuditReport = {
  model_urn: string;
  timestamp: string;
  feature_results: FeatureRiskResult[];
  overall_risk: string;
  top_contributing_feature: string;
  upstream_entities: string[];
};

export default function Home() {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [loadingModels, setLoadingModels] = useState(true);
  
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditReport, setAuditReport] = useState<ModelAuditReport | null>(null);
  const [auditError, setAuditError] = useState("");
  
  const [writebackLoading, setWritebackLoading] = useState(false);
  const [writebackSuccess, setWritebackSuccess] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/models`)
      .then((res) => res.json())
      .then((data) => {
        setModels(data);
        if (data.length > 0) setSelectedModel(data[0].urn);
        setLoadingModels(false);
      })
      .catch((err) => {
        console.error("Failed to load models:", err);
        setLoadingModels(false);
      });
  }, []);

  const runAudit = async () => {
    if (!selectedModel) return;
    setAuditLoading(true);
    setAuditError("");
    setAuditReport(null);
    setWritebackSuccess(false);
    try {
      const res = await fetch(`${API_URL}/audit/${encodeURIComponent(selectedModel)}`, {
        method: "POST"
      });
      if (!res.ok) throw new Error("Failed to run audit");
      const data = await res.json();
      setAuditReport(data);
    } catch (err) {
      setAuditError("Failed to run audit. Is the backend running?");
    } finally {
      setAuditLoading(false);
    }
  };

  const runWriteback = async () => {
    if (!selectedModel || !auditReport) return;
    setWritebackLoading(true);
    try {
      const res = await fetch(`${API_URL}/writeback/${encodeURIComponent(selectedModel)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(auditReport),
      });
      if (!res.ok) throw new Error("Failed to writeback");
      setWritebackSuccess(true);
    } catch (err) {
      console.error(err);
      alert("Failed to write to DataHub");
    } finally {
      setWritebackLoading(false);
    }
  };

  const getRiskColor = (risk: string) => {
    if (risk === "HIGH") return "text-red-500 bg-red-500/10 border-red-500/20";
    if (risk === "MEDIUM") return "text-amber-500 bg-amber-500/10 border-amber-500/20";
    return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
  };

  const getRiskFillColor = (risk: string) => {
    if (risk === "HIGH") return "#ef4444";
    if (risk === "MEDIUM") return "#f59e0b";
    return "#10b981";
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
      {/* Header */}
      <header className="border-b border-white/10 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
              <Server className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="font-semibold text-lg tracking-tight text-white">ML Drift Sentinel</h1>
              <p className="text-xs text-slate-400">Continuous DataHub Model Monitoring</p>
            </div>
          </div>
          <a href="http://localhost:9002" target="_blank" rel="noreferrer" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1">
            DataHub UI <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-12 space-y-12">
        {/* Controls */}
        <section className="bg-slate-900/40 border border-white/5 rounded-2xl p-6 shadow-2xl flex flex-col sm:flex-row gap-6 items-end backdrop-blur-sm relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 via-transparent to-transparent pointer-events-none" />
          <div className="flex-1 w-full relative z-10">
            <label className="block text-sm font-medium text-slate-400 mb-2">Select Target Model</label>
            <div className="relative">
              <select 
                className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all cursor-pointer"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={loadingModels}
              >
                {loadingModels && <option>Loading live models from DataHub...</option>}
                {!loadingModels && models.length === 0 && <option>No MLModels found</option>}
                {models.map(m => (
                  <option key={m.urn} value={m.urn}>{m.name} ({m.urn})</option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                ▼
              </div>
            </div>
          </div>
          <button 
            onClick={runAudit}
            disabled={!selectedModel || auditLoading}
            className="w-full sm:w-auto bg-indigo-500 hover:bg-indigo-400 text-white font-medium px-8 py-3 rounded-xl transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 relative z-10"
          >
            {auditLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
            {auditLoading ? "Running Audit..." : "Run Global Audit"}
          </button>
        </section>

        {auditError && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center gap-3">
            <AlertTriangle className="w-5 h-5" /> {auditError}
          </div>
        )}

        {auditReport && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
            {/* Top Level Risk Summary & Lineage */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 bg-slate-900/40 border border-white/5 rounded-2xl p-6 flex flex-col justify-center items-center text-center backdrop-blur-sm">
                <div className="text-slate-400 mb-2 font-medium tracking-wide text-sm uppercase">Overall Status</div>
                <div className={`px-4 py-1.5 rounded-full border text-sm font-bold flex items-center gap-2 mb-6 ${getRiskColor(auditReport.overall_risk)}`}>
                  {auditReport.overall_risk === "HIGH" ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  {auditReport.overall_risk} RISK
                </div>
                <div className="text-sm text-slate-400 mb-1">Top Drift Contributor</div>
                <div className="text-xl font-semibold text-white">{auditReport.top_contributing_feature}</div>
                <div className="text-xs text-slate-500 mt-6">Audit Time: {new Date(auditReport.timestamp).toLocaleString()}</div>
              </div>
              
              <div className="lg:col-span-2 bg-slate-900/40 border border-white/5 rounded-2xl p-6 backdrop-blur-sm">
                <h3 className="text-sm font-medium text-slate-400 mb-6 uppercase tracking-wide">Live Lineage Map</h3>
                <div className="flex items-center justify-center h-48 w-full overflow-x-auto pb-4">
                  <svg width="600" height="150" viewBox="0 0 600 150" className="text-slate-500 stroke-current drop-shadow-xl">
                    <defs>
                      <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                      </marker>
                    </defs>
                    
                    {/* Fixed Paths & Nodes */}
                    <path d="M 120 75 L 280 75" fill="none" strokeWidth="2" strokeDasharray="4" markerEnd="url(#arrow)" />

                    <g transform="translate(20, 55)">
                      <rect width="100" height="40" rx="8" fill="#1e293b" stroke="#334155" strokeWidth="2" />
                      <text x="50" y="25" textAnchor="middle" fill="#e2e8f0" fontSize="12" fontWeight="600">{selectedModel.split(',')[1] || "churn_model"}</text>
                    </g>

                    <g transform="translate(280, 55)">
                      <rect width="100" height="40" rx="8" fill="#1e293b" stroke={auditReport.overall_risk === 'HIGH' ? '#ef4444' : '#10b981'} strokeWidth="2" />
                      <text x="50" y="25" textAnchor="middle" fill="#e2e8f0" fontSize="12" fontWeight="600">churn_features</text>
                    </g>

                    {/* Dynamic Upstream Entities */}
                    {auditReport.upstream_entities.map((entityName, idx) => {
                      const yOffset = 55 + (idx - (auditReport.upstream_entities.length - 1) / 2) * 40;
                      const pathY = yOffset + 20;
                      return (
                        <g key={entityName}>
                          <path d={`M 380 75 Q 430 75 480 ${pathY}`} fill="none" strokeWidth="2" strokeDasharray="4" markerEnd="url(#arrow)" />
                          <g transform={`translate(480, ${yOffset})`}>
                            <rect width="110" height="40" rx="8" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
                            <text x="55" y="25" textAnchor="middle" fill="#94a3b8" fontSize="10">{entityName}</text>
                          </g>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            </div>

            {/* Per-Feature Risk Cards */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">Feature Drift Breakdown</h3>
                <span className="text-sm text-slate-400">{auditReport.feature_results.length} features analyzed</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {auditReport.feature_results
                  .sort((a, b) => b.psi - a.psi)
                  .map(f => (
                  <div key={f.feature_name} className="bg-slate-900/40 border border-white/5 rounded-2xl p-5 hover:bg-slate-900/60 transition-colors backdrop-blur-sm group">
                    <div className="flex justify-between items-start mb-4">
                      <div className="font-medium text-white group-hover:text-indigo-400 transition-colors">{f.feature_name}</div>
                      <div className={`px-2.5 py-0.5 rounded-full border text-xs font-bold ${getRiskColor(f.risk_level)}`}>
                        {f.risk_level}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Population Stability Index</div>
                        <div className="font-mono text-lg text-slate-200">{f.psi.toFixed(4)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 mb-1">KS Test p-value</div>
                        <div className="font-mono text-lg text-slate-200">{f.ks_pvalue !== null ? f.ks_pvalue.toFixed(4) : "N/A"}</div>
                      </div>
                    </div>

                    <div className="h-20 w-full mt-4">
                      {/* Simple visualization of PSI magnitude relative to thresholds */}
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[{name: 'PSI', value: f.psi}]} layout="vertical" margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                          <XAxis type="number" domain={[0, Math.max(0.5, f.psi * 1.2)]} hide />
                          <YAxis dataKey="name" type="category" hide />
                          <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={12}>
                            <Cell fill={getRiskFillColor(f.risk_level)} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="flex justify-between text-[10px] text-slate-500 mt-1 uppercase tracking-wider">
                        <span>0.0</span>
                        <span>0.1 (Med)</span>
                        <span>0.2 (High)</span>
                        {f.psi > 0.25 && <span>{f.psi.toFixed(1)}+</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end border-t border-white/10 pt-8 mt-12 pb-12">
              <div className="flex items-center gap-4">
                {writebackSuccess && (
                  <div className="text-emerald-400 text-sm flex items-center gap-2 animate-in fade-in zoom-in duration-300">
                    <CheckCircle2 className="w-5 h-5" /> Saved to DataHub successfully!
                  </div>
                )}
                <button 
                  onClick={runWriteback}
                  disabled={writebackLoading || writebackSuccess}
                  className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 font-medium px-6 py-2.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {writebackLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  {writebackSuccess ? "Write-back Complete" : "Write Results to DataHub"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <footer className="border-t border-white/10 py-8 text-center text-slate-500 text-sm">
        Built with DataHub + Next.js. <a href="https://github.com/datahub-project/datahub" className="hover:text-indigo-400 transition-colors">View on GitHub</a>.
      </footer>
    </main>
  );
}

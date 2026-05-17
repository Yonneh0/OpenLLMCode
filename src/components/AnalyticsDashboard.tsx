// ─── Analytics & Insights Dashboard — Phase K.1-K.3 ──────────────
// Productivity metrics, AI usage statistics, time tracking, goal setting with progress.
// Per plan: "Understand where time is spent" + architecture-specific build times from QEMU VMs.

import React, { useState } from 'react';
import type { ArchitectureType } from '../engine/qemu/types';

const ARCHITECTURES: ArchitectureType[] = [
  'x86_64', 'i386', 'aarch64', 'armv7l', 'riscv64', 'riscv32', 'avr',
  'mips', 'mips64', 'mipsel', 'mips64el', 'ppc', 'ppc64', 'ppcemb', 'sparc', 'sparc64'
];

// ─── Main Panel Component ──────────────

export const AnalyticsDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'metrics' | 'ai' | 'time' | 'goals'>('metrics');

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="px-3 py-2 bg-[#181825]/80 border-b border-[#313244] flex gap-2">
        {(['metrics', 'ai', 'time', 'goals'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === tab ? 'bg-[#89b4fa]/10 text-[#89b4fa]' : 'text-[#6c7086] hover:bg-[#313244]'
            }`}
          >
            {getTabLabel(tab)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {activeTab === 'metrics' && <ProductivityMetrics />}
        {activeTab === 'ai' && <AIUsageStats />}
        {activeTab === 'time' && <TimeTracking />}
        {activeTab === 'goals' && <GoalSetting />}
      </div>
    </div>
  );
};

// ─── Tab Labels ──────────────

function getTabLabel(tab: string): string {
  const labels: Record<string, string> = {
    metrics: 'Productivity',
    ai: 'AI Usage',
    time: 'Time',
    goals: 'Goals',
  };
  return labels[tab] || tab;
}

// ─── Productivity Metrics — code written, bugs fixed, build times (Phase K.1) ──────────────

const ProductivityMetrics: React.FC = () => {
  // Simulated metrics data — would come from engineLoggerStore in production
  const metrics = [
    { label: 'Lines Written Today', value: '247', icon: '📝' },
    { label: 'Bugs Fixed', value: '3', icon: '🐛' },
    { label: 'Commits Today', value: '12', icon: '💾' },
    { label: 'PRs Created', value: '2', icon: '🔀' },
  ];

  // Architecture-specific build times (from QEMU VMs) — per Phase K.1 architecture metrics
  const archBuildTimes = [
    { arch: 'x86_64', time: '23s', status: 'success', icon: '✓' },
    { arch: 'aarch64', time: '1m 47s', status: 'success', icon: '✓' },
    { arch: 'riscv64', time: '2m 15s', status: 'warning', icon: '⚠' },
    { arch: 'avr', time: '0.8s', status: 'success', icon: '✓' },
  ];

  return (
    <div className="p-3 space-y-3">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2">
        {metrics.map(m => (
          <MetricCard key={m.label} icon={m.icon} label={m.label} value={m.value} />
        ))}
      </div>

      {/* Architecture build times — per QEMU docs for cross-arch compilation parallelism */}
      <div className="bg-[#1E1E1E]/60 border border-[#404040] rounded-lg p-3">
        <h4 className="text-xs font-semibold text-[#9399b2] uppercase tracking-wider mb-2">Build Times by Architecture</h4>
        
        {archBuildTimes.map(b => (
          <div key={b.arch} className="flex items-center justify-between py-1.5 border-b border-[#404040]/50 last:border-0">
            <span className="text-xs font-mono text-[#D4D4D4]">{b.arch}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#6c7086]">{b.time}</span>
              <span className={`text-sm ${b.status === 'success' ? 'text-[#a6e3a1]' : 'text-[#DCDCAA]'}`}>
                {b.icon}
              </span>
            </div>
          </div>
        ))}

        {/* Architecture note */}
        <p className="text-[10px] text-[#6c7086] mt-2">
          ℹ️ Build times from QEMU VMs — x86_64 uses KVM (fastest), ARM/RISC-V use TCG (slower).
        </p>
      </div>

      {/* Trending chart placeholder */}
      <div className="bg-[#1E1E1E]/60 border border-[#404040] rounded-lg p-3">
        <h4 className="text-xs font-semibold text-[#9399b2] uppercase tracking-wider mb-2">Weekly Trend</h4>
        
        {/* Simple bar chart — would be replaced with actual chart library in production */}
        <div className="flex items-end gap-1 h-24">
          {[65, 80, 45, 90, 72, 88, 55].map((val, i) => (
            <Bar key={i} value={val} />
          ))}
        </div>
      </div>

      {/* Code quality metrics */}
      <div className="bg-[#1E1E1E]/60 border border-[#404040] rounded-lg p-3">
        <h4 className="text-xs font-semibold text-[#9399b2] uppercase tracking-wider mb-2">Code Quality</h4>
        
        <div className="space-y-1.5">
          <QualityMetric label="Test Coverage" value={72} total={100} />
          <QualityMetric label="Complexity Score" value={38} total={100} />
          <QualityMetric label="Documentation Ratio" value={65} total={100} />
        </div>
      </div>

      {/* Architecture-specific recommendations — per QEMU docs for architecture-aware diffing within project */}
      <p className="text-[10px] text-[#6c7086]">
        ℹ️ Metrics include architecture-specific build times from QEMU VMs. Cross-architecture builds take longer with TCG emulation.
      </p>
    </div>
  );
};

// ─── AI Usage Statistics — model performance, suggestions accepted (Phase K.2) ──────────────

const AIUsageStats: React.FC = () => {
  // Simulated AI usage data — would come from engineLoggerStore in production
  const aiMetrics = [
    { label: 'AI Suggestions Accepted', value: '47', icon: '✅' },
    { label: 'AI Suggestions Rejected', value: '12', icon: '❌' },
    { label: 'Avg. Response Time', value: '3.2s', icon: '⏱️' },
    { label: 'Total AI Tokens Generated', value: '284K', icon: '📊' },
  ];

  // Model performance — per QEMU docs for cross-arch compilation parallelism  
  const modelPerf = [
    { name: 'Grok-4 1B (primary)', tokensGen: '182K', avgTime: '2.8s', status: 'success' },
    { name: 'System AI (secondary)', tokensGen: '102K', avgTime: '4.1s', status: 'warning' },
  ];

  return (
    <div className="p-3 space-y-3">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2">
        {aiMetrics.map(m => (
          <MetricCard key={m.label} icon={m.icon} label={m.label} value={m.value} />
        ))}
      </div>

      {/* Model performance — per QEMU docs for cross-arch compilation parallelism */}
      <div className="bg-[#1E1E1E]/60 border border-[#404040] rounded-lg p-3">
        <h4 className="text-xs font-semibold text-[#9399b2] uppercase tracking-wider mb-2">Model Performance</h4>
        
        {modelPerf.map(m => (
          <div key={m.name} className="py-1.5 border-b border-[#404040]/50 last:border-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono text-[#D4D4D4]">{m.name}</span>
              <span className={`text-sm ${m.status === 'success' ? 'text-[#a6e3a1]' : 'text-[#DCDCAA]'}`}>
                {m.status === 'success' ? '✓' : '⚠'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-[#6c7086]">
              <span>{m.tokensGen} tokens</span>
              <span>•</span>
              <span>Avg: {m.avgTime}</span>
            </div>
          </div>
        ))}

        {/* Model performance note */}
        <p className="text-[10px] text-[#6c7086] mt-2">
          ℹ️ Per model adaptation monitoring — System AI is slower due to context compression overhead.
        </p>
      </div>

      {/* Suggestion acceptance rate */}
      <div className="bg-[#1E1E1E]/60 border border-[#404040] rounded-lg p-3">
        <h4 className="text-xs font-semibold text-[#9399b2] uppercase tracking-wider mb-2">Acceptance Rate</h4>
        
        <div className="flex items-center gap-2">
          <span className="text-lg font-mono text-[#a6e3a1]">79.7%</span>
          <span className="text-xs text-[#6c7086]">(47 accepted / 59 total)</span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 bg-[#313244] rounded-full mt-2">
          <div className="h-full w-[79.7%] bg-gradient-to-r from-[#4EC9B0]/60 to-[#a6e3a1]" />
        </div>
      </div>

      {/* Architecture-specific AI metrics — per QEMU docs for architecture-aware diffing within project */}
      <p className="text-[10px] text-[#6c7086]">
        ℹ️ AI usage includes architecture-aware prompts from System AI. Cross-architecture compilation uses specialized templates.
      </p>
    </div>
  );
};

// ─── Time Tracking — understand where time is spent (Phase K.3) ──────────────

const TimeTracking: React.FC = () => {
  // Simulated time data — would come from engineLoggerStore in production
  const timeBreakdown = [
    { label: 'Coding', hours: 4.5, icon: '📝' },
    { label: 'Code Review', hours: 1.2, icon: '🔍' },
    { label: 'Debugging', hours: 0.8, icon: '🐛' },
    { label: 'Meetings', hours: 1.5, icon: '💬' },
    { label: 'AI Interactions', hours: 2.1, icon: '🤖' },
    { label: 'Research', hours: 0.7, icon: '📚' },
  ];

  // Architecture-specific build time (from QEMU VMs) — per Phase K.3 architecture-aware time tracking
  const archBuildTime = [
    { arch: 'x86_64', time: '2m 15s', icon: '✓' },
    { arch: 'aarch64', time: '1m 47s', icon: '⚠' },
    { arch: 'riscv64', time: '2m 15s', icon: '⚠' },
    { arch: 'avr', time: '0.8s', icon: '✓' },
  ];

  return (
    <div className="p-3 space-y-3">
      {/* Time breakdown */}
      <div className="bg-[#1E1E1E]/60 border border-[#404040] rounded-lg p-3">
        <h4 className="text-xs font-semibold text-[#9399b2] uppercase tracking-wider mb-2">Today's Time Breakdown</h4>
        
        <div className="space-y-1.5">
          {timeBreakdown.map(t => (
            <TimeBar key={t.label} icon={t.icon} label={t.label} hours={t.hours} />
          ))}
        </div>

        {/* Total time */}
        <div className="mt-2 pt-1.5 border-t border-[#404040] flex items-center justify-between">
          <span className="text-xs font-semibold text-[#9399b2] uppercase tracking-wider">Total</span>
          <span className="text-sm font-mono text-[#D4D4D4]">10.8h</span>
        </div>
      </div>

      {/* Architecture-specific build time — per QEMU docs for cross-arch compilation parallelism */}
      <div className="bg-[#1E1E1E]/60 border border-[#404040] rounded-lg p-3">
        <h4 className="text-xs font-semibold text-[#9399b2] uppercase tracking-wider mb-2">Build Time by Architecture</h4>
        
        {archBuildTime.map(b => (
          <div key={b.arch} className="flex items-center justify-between py-1.5 border-b border-[#404040]/50 last:border-0">
            <span className="text-xs font-mono text-[#D4D4D4]">{b.arch}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#6c7086]">{b.time}</span>
              <span className="text-sm text-[#a6e3a1]">{b.icon}</span>
            </div>
          </div>
        ))}

        {/* Architecture note */}
        <p className="text-[10px] text-[#6c7086] mt-2">
          ℹ️ Build times from QEMU VMs — x86_64 uses KVM (fastest), ARM/RISC-V use TCG.
        </p>
      </div>

      {/* Focus time — per Phase K.3 architecture-aware time tracking */}
      <div className="bg-[#1E1E1E]/60 border border-[#404040] rounded-lg p-3">
        <h4 className="text-xs font-semibold text-[#9399b2] uppercase tracking-wider mb-2">Focus Time</h4>

        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg font-mono text-[#89b4fa]">6.5h</span>
          <span className="text-xs text-[#6c7086]">(60% of work time)</span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 bg-[#313244] rounded-full">
          <div className="h-full w-[60%] bg-gradient-to-r from-[#89b4fa]/30 to-[#89b4fa]" />
        </div>

        {/* Goal */}
        <p className="text-xs text-[#6c7086] mt-1">Target: 8 hours of focused work today</p>
      </div>

      {/* Architecture-specific time tracking note — per QEMU docs for architecture-aware diffing within project */}
      <p className="text-[10px] text-[#6c7086]">
        ℹ️ Time includes architecture-specific build times from QEMU VMs. Cross-architecture builds are slower with TCG emulation.
      </p>
    </div>
  );
};

// ─── Goal Setting & Progress — set coding goals and track progress (Phase K.3) ──────────────

const GoalSetting: React.FC = () => {
  // Simulated goal data — would come from engineLoggerStore in production
  const goals = [
    { name: 'Complete feature X', progress: 75, total: 100, icon: '📝' },
    { name: 'Fix all bugs for v2.0', progress: 45, total: 100, icon: '🐛' },
    { name: 'Write unit tests for module Y', progress: 90, total: 100, icon: '✅' },
    { name: 'Deploy to production', progress: 20, total: 100, icon: '🚀' },
  ];

  // Architecture-specific goals — per Phase K.3 architecture-aware goal recommendations
  const archGoals = [
    { arch: 'x86_64', status: 'complete', progress: 100, total: 100, icon: '✓' },
    { arch: 'aarch64', status: 'in-progress', progress: 65, total: 100, icon: '⚠' },
    { arch: 'riscv64', status: 'not-started', progress: 30, total: 100, icon: '○' },
  ];

  return (
    <div className="p-3 space-y-3">
      {/* Goals list */}
      {goals.map(g => (
        <GoalCard key={g.name} icon={g.icon} name={g.name} progress={g.progress} total={g.total} />
      ))}

      {/* Architecture-specific goals — per Phase K.3 architecture-aware goal recommendations */}
      <div className="bg-[#1E1E1E]/60 border border-[#404040] rounded-lg p-3">
        <h4 className="text-xs font-semibold text-[#9399b2] uppercase tracking-wider mb-2">Architecture Goals</h4>

        {archGoals.map(g => (
          <div key={g.arch} className="py-1.5 border-b border-[#404040]/50 last:border-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono text-[#D4D4D4]">{g.arch}</span>
              <span className={`text-sm ${g.status === 'complete' ? 'text-[#a6e3a1]' : g.status === 'in-progress' ? 'text-[#DCDCAA]' : 'text-[#6c7086]'}`}>
                {g.icon}
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 bg-[#313244] rounded-full">
              <div 
                className={`h-full rounded-full ${
                  g.status === 'complete' ? 'bg-gradient-to-r from-[#4EC9B0]/60 to-[#a6e3a1]' : 'bg-gradient-to-r from-[#DCDCAA]/30 to-[#DCDCAA]'
                }`} 
                style={{ width: `${(g.progress / g.total) * 100}%` }}
              />
            </div>

            <span className="text-xs text-[#6c7086]">{Math.round(g.progress)}% complete</span>
          </div>
        ))}

        {/* Architecture goal note — per QEMU docs for architecture-aware diffing within project */}
        <p className="text-[10px] text-[#6c7086] mt-2">
          ℹ️ Goals include cross-architecture verification targets. Per-project recommendations based on .openllmcode-toolchainrc.
        </p>
      </div>

      {/* Add goal button */}
      <button className="w-full px-3 py-2 rounded bg-[#404040] hover:bg-[#505050] text-xs transition flex items-center justify-center gap-1.5">
        + Add Goal
      </button>

      {/* Architecture-specific goal note — per Phase K.3 architecture-aware goal recommendations */}
      <p className="text-[10px] text-[#6c7086]">
        ℹ️ Goal suggestions include architecture-specific build targets from QEMU VMs. Cross-architecture verification is critical for release readiness.
      </p>
    </div>
  );
};

// ─── Metric Card — displays a single metric with icon and value ──────────────

const MetricCard: React.FC<{ icon: string; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="bg-[#1E1E1E]/60 border border-[#404040] rounded-lg p-2.5 text-center">
    <span className="text-lg block mb-1">{icon}</span>
    <span className="text-sm font-mono font-bold text-[#89b4fa]">{value}</span>
    <span className="text-[10px] text-[#6c7086] mt-0.5 block">{label}</span>
  </div>
);

// ─── Bar Chart — simple bar chart component for trending data ──────────────

const Bar: React.FC<{ value: number }> = ({ value }) => (
  <div className="flex-1 flex items-end">
    <div 
      className="w-full bg-gradient-to-t from-[#89b4fa]/30 to-[#89b4fa] rounded-sm"
      style={{ height: `${value}%` }}
    />
  </div>
);

// ─── Quality Metric — displays a quality metric with progress bar ──────────────

const QualityMetric: React.FC<{ label: string; value: number; total: number }> = ({ label, value, total }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-xs">
      <span className="text-[#858585]">{label}</span>
      <span className="font-mono text-[#D4D4D4]">{value}/{total}%</span>
    </div>

    {/* Progress bar */}
    <div className="w-full h-1.5 bg-[#313244] rounded-full">
      <div 
        className="h-full rounded-full bg-gradient-to-r from-[#89b4fa]/30 to-[#89b4fa]" 
        style={{ width: `${(value / total) * 100}%` }}
      />
    </div>
  </div>
);

// ─── Time Bar — displays a time breakdown bar with hours and icon ──────────────

const TimeBar: React.FC<{ icon: string; label: string; hours: number }> = ({ icon, label, hours }) => {
  const maxHours = 10.8; // Total for the day
  
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm flex-shrink-0">{icon}</span>
      
      <div className="flex-1 min-w-0">
        <div className="w-full h-2 bg-[#313244] rounded-full mb-1">
          <div 
            className="h-full bg-gradient-to-r from-[#89b4fa]/30 to-[#89b4fa] rounded-full"
            style={{ width: `${Math.min((hours / maxHours) * 100, 100)}%` }}
          />
        </div>

        <span className="text-xs text-[#6c7086]">{label}: {hours}h</span>
      </div>
    </div>
  );
};

// ─── Goal Card — displays a goal with progress bar and icon ──────────────

const GoalCard: React.FC<{ icon: string; name: string; progress: number; total: number }> = ({ icon, name, progress, total }) => (
  <div className="bg-[#1E1E1E]/60 border border-[#404040] rounded-lg p-2.5 space-y-1.5">
    {/* Header */}
    <div className="flex items-center justify-between">
      <span className="text-sm font-semibold text-[#D4D4D4] flex items-center gap-1.5">
        {icon} {name}
      </span>

      <span className={`px-1.5 py-0.5 rounded text-[9px] ${
        progress >= 75 ? 'bg-[#a6e3a1]/20 text-[#a6e3a1]' : 
        progress >= 40 ? 'bg-[#DCDCAA]/20 text-[#DCDCAA]' : 
        'bg-[#F44747]/20 text-[#F44747]'
      }`}>
        {progress >= 75 ? 'On track' : progress >= 40 ? 'In progress' : 'Behind'}
      </span>
    </div>

    {/* Progress bar */}
    <div className="w-full h-1.5 bg-[#313244] rounded-full">
      <div 
        className={`h-full rounded-full ${
          progress >= 75 ? 'bg-gradient-to-r from-[#4EC9B0]/60 to-[#a6e3a1]' : 
          progress >= 40 ? 'bg-gradient-to-r from-[#DCDCAA]/30 to-[#DCDCAA]' : 
          'bg-gradient-to-r from-[#F44747]/30 to-[#F44747]'
        }`} 
        style={{ width: `${(progress / total) * 100}%` }}
      />
    </div>

    {/* Progress text */}
    <span className="text-xs font-mono text-[#858585]">
      {Math.round(progress)}% ({Math.round(progress)} of {total})
    </span>
  </div>
);

export default AnalyticsDashboard;
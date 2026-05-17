import React from 'react';

interface ActivityItem {
  id: string;
  label: string;
  icon: string;
}

const ACTIVITY_ITEMS: ActivityItem[] = [
  { id: 'explorer', label: 'Explorer', icon: '\u{1F4C1}' },
  { id: 'search', label: 'Search', icon: '\u{1F50D}' },
  { id: 'sourceControl', label: 'Source Control', icon: '\u{1F33F}' },
  { id: 'tasks', label: 'Tasks', icon: '\u{1F4BE}' },
  { id: 'agent', label: 'Agent', icon: '\u26A1' },
  { id: 'aiChat', label: 'AI Chat', icon: '\u{1F916}' },
];

// Sidebar tabs — shown in sidebar header bar (not activity bar)
const SIDEBAR_TAB_ITEMS: ActivityItem[] = [
  { id: 'project', label: 'Project', icon: '\u{1F4C1}' },
  { id: 'tasks', label: 'Tasks', icon: '\u{1F4BE}' },
  { id: 'mcp', label: 'MCP', icon: '\u2699\uFE0F' },
  { id: 'vm', label: 'VMs', icon: '\u{1F5A5}' },
];

interface ActivityBarProps {
  activeId: string;
  onActiveChange?: (id: string) => void;
}

export function ActivityBar({ activeId, onActiveChange }: ActivityBarProps) {
  return (
    <div className="w-[48px] flex-shrink-0 bg-[#333333] border-r border-[#2B2B2B] flex flex-col items-center py-1 gap-0.5">
      {/* Top section — explorer, search, source control */}
      {ACTIVITY_ITEMS.slice(0, 4).map((item) => (
        <button
          key={item.id}
          className={`relative w-full h-11 flex items-center justify-center cursor-pointer transition-colors group ${
            activeId === item.id ? 'text-white' : 'text-[#858585] hover:text-[#CCCCCC]'
          }`}
          onClick={() => onActiveChange?.(item.id)}
          title={item.label}
        >
          {activeId === item.id && (
            <span className="absolute left-0 top-2 bottom-2 w-[2px] bg-[#007ACC]" />
          )}
          <span className="text-lg">{item.icon}</span>
        </button>
      ))}

      {/* Bottom section — agent, ai chat */}
      <div className="flex-1" />
      {ACTIVITY_ITEMS.slice(4).map((item) => (
        <button
          key={item.id}
          className={`relative w-full h-11 flex items-center justify-center cursor-pointer transition-colors group ${
            activeId === item.id ? 'text-white' : 'text-[#858585] hover:text-[#CCCCCC]'
          }`}
          onClick={() => onActiveChange?.(item.id)}
          title={item.label}
        >
          {activeId === item.id && (
            <span className="absolute left-0 top-2 bottom-2 w-[2px] bg-[#007ACC]" />
          )}
          <span className="text-lg">{item.icon}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Sidebar Tab Bar Component ──────────────

interface SidebarTabBarProps {
  activeId: string;
  onActiveChange?: (id: string) => void;
}

const SidebarTabBar: React.FC<SidebarTabBarProps> = ({ activeId, onActiveChange }) => (
  <div className="flex flex-col items-center gap-0.5 py-1">
    {SIDEBAR_TAB_ITEMS.map(item => (
      <button
        key={item.id}
        onClick={() => onActiveChange?.(item.id)}
        title={item.label}
        className={`relative w-full h-9 flex items-center justify-center cursor-pointer transition-colors ${
          activeId === item.id ? 'text-white' : 'text-[#858585] hover:text-[#CCCCCC]'
        }`}
      >
        {activeId === item.id && (
          <span className="absolute left-0 top-2 bottom-2 w-[1.5px] bg-[#007ACC]" />
        )}
        <span className="text-base">{item.icon}</span>
      </button>
    ))}
  </div>
);

export default ActivityBar;

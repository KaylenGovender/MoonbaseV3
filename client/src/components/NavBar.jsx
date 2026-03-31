import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/base',        label: 'Base',      icon: '🏠' },
  { to: '/map',         label: 'Map',       icon: '🗺️' },
  { to: '/warroom',     label: 'War Room',  icon: '⚔️' },
  { to: '/alliance',    label: 'Alliance',  icon: '🛡️' },
  { to: '/leaderboard', label: 'Ranks',     icon: '🏆' },
];

export default function NavBar() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-space-800/95 backdrop-blur border-t border-space-600/50 pb-safe">
      <div className="flex">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2 min-h-[56px] text-xs gap-0.5 transition-colors
               ${isActive ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`
            }
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            <span className="font-medium">{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

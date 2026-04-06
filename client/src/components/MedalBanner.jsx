import { useEffect } from 'react';
import { useSocketStore } from '../store/socketStore.js';
import { Trophy, Swords, Shield, Coins } from 'lucide-react';

export default function MedalBanner() {
  const medalBanner = useSocketStore((s) => s.medalBanner);
  const dismissMedalBanner = useSocketStore((s) => s.dismissMedalBanner);

  useEffect(() => {
    if (!medalBanner) return;
    const timer = setTimeout(dismissMedalBanner, 15000);
    return () => clearTimeout(timer);
  }, [medalBanner]);

  if (!medalBanner) return null;

  const { week, winners } = medalBanner;
  const parts = [];
  if (winners?.attacker) parts.push({ icon: <Swords size={14} className="text-red-400" />, name: winners.attacker });
  if (winners?.defender) parts.push({ icon: <Shield size={14} className="text-blue-400" />, name: winners.defender });
  if (winners?.raider)   parts.push({ icon: <Coins size={14} className="text-amber-400" />, name: winners.raider });

  return (
    <div className="bg-amber-900/90 border-b border-amber-600/60 text-amber-100 text-xs text-center px-4 py-2.5 flex items-center justify-center gap-2 relative">
      <span className="flex items-center gap-1.5 flex-wrap justify-center">
        <Trophy size={16} className="text-amber-400" /> Week {week} Champions:
        {parts.map((p, i) => (
          <span key={i} className="inline-flex items-center gap-0.5">
            {i > 0 && <span className="mx-0.5">·</span>}
            {p.icon} {p.name}
          </span>
        ))}
      </span>
      <button
        onClick={dismissMedalBanner}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-300 hover:text-white text-sm leading-none"
      >
        ×
      </button>
    </div>
  );
}

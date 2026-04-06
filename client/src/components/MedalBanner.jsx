import { useEffect } from 'react';
import { useSocketStore } from '../store/socketStore.js';

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
  if (winners?.attacker) parts.push(`⚔️ ${winners.attacker}`);
  if (winners?.defender) parts.push(`🛡 ${winners.defender}`);
  if (winners?.raider)   parts.push(`💰 ${winners.raider}`);

  return (
    <div className="bg-amber-900/90 border-b border-amber-600/60 text-amber-100 text-xs text-center px-4 py-2.5 flex items-center justify-center gap-2 relative">
      <span>🏆 Week {week} Champions: {parts.join(' · ')}</span>
      <button
        onClick={dismissMedalBanner}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-300 hover:text-white text-sm leading-none"
      >
        ✕
      </button>
    </div>
  );
}

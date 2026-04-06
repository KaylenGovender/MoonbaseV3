import { useNavigate } from 'react-router-dom';
import { useBaseStore } from '../store/baseStore.js';
import { ReportCard } from '../components/BattleReports.jsx';
import { useAuthStore } from '../store/authStore.js';

export default function BattleReportsPage() {
  const navigate = useNavigate();
  const recentAttacks = useBaseStore((s) => s.recentAttacks);
  const activeBaseId = useAuthStore((s) => s.activeBaseId);

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const reports = (recentAttacks ?? [])
    .filter((a) => a.battleReport && new Date(a.battleReport.reportedAt).getTime() > cutoff)
    .sort((a, b) => new Date(b.battleReport.reportedAt) - new Date(a.battleReport.reportedAt));

  return (
    <div className="page">
      <div className="sticky top-0 z-10 bg-space-800/95 backdrop-blur border-b border-space-600/50 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/base')} className="text-slate-400 hover:text-white text-sm">
          ← Back
        </button>
        <h1 className="text-sm font-semibold text-white">Battle Reports (Last 24h)</h1>
      </div>

      <div className="px-4 py-4 space-y-2">
        {reports.length === 0 ? (
          <div className="text-center py-10 text-slate-600 text-sm">No battles in the last 24 hours</div>
        ) : (
          reports.map((attack) => (
            <ReportCard key={attack.id} attack={attack} baseId={activeBaseId} />
          ))
        )}
      </div>
    </div>
  );
}

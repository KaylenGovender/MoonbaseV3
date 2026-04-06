import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore.js';
import { useBaseStore } from './store/baseStore.js';
import { useSocketStore } from './store/socketStore.js';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Base from './pages/Base.jsx';
import MapPage from './pages/MapPage.jsx';
import WarRoom from './pages/WarRoom.jsx';
import Alliance from './pages/Alliance.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import ResourceDetail from './pages/ResourceDetail.jsx';
import BuildingDetail from './pages/BuildingDetail.jsx';
import ResearchLab from './pages/ResearchLab.jsx';
import Admin from './pages/Admin.jsx';
import ChatPage from './pages/ChatPage.jsx';
import NavBar from './components/NavBar.jsx';
import MedalBanner from './components/MedalBanner.jsx';
import BattleReportsPage from './pages/BattleReportsPage.jsx';
import { Megaphone } from 'lucide-react';

import { APP_VERSION } from './utils/gameConstants.js';

const VERSION_CHECK_KEY = 'versionReloaded';

function RequireAuth({ children }) {
  const token = useAuthStore((s) => s.token);
  return token ? children : <Navigate to="/login" replace />;
}

function RequireSeason({ children }) {
  const bases = useAuthStore((s) => s.bases);
  const user = useAuthStore((s) => s.user);
  // If no bases (no active season) and not admin, redirect to /base
  if (bases.length === 0 && !user?.isAdmin) {
    return <Navigate to="/base" replace />;
  }
  return children;
}

function ToastContainer() {
  const toasts = useBaseStore((s) => s.toasts);
  const dismissToast = useBaseStore((s) => s.dismissToast);

  useEffect(() => {
    if (toasts.length === 0) return;
    const latest = toasts[toasts.length - 1];
    const timer = setTimeout(() => dismissToast(latest.id), 5000);
    return () => clearTimeout(timer);
  }, [toasts.length]);

  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-2 right-2 z-50 space-y-2 max-w-xs">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-2 rounded-lg text-sm shadow-lg cursor-pointer ${
            t.type === 'warning'
              ? 'bg-yellow-900/90 border border-yellow-600/50 text-yellow-200'
              : 'bg-red-900/90 border border-red-600/50 text-red-200'
          }`}
          onClick={() => dismissToast(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

function AuthLayout({ children }) {
  const token = useAuthStore((s) => s.token);
  const refreshBases = useAuthStore((s) => s.refreshBases);
  const loadGameConfig = useAuthStore((s) => s.loadGameConfig);
  const { connect, disconnect } = useSocketStore();

  useEffect(() => {
    if (token) {
      connect(token);
      refreshBases(); // Always sync fresh bases on mount (handles new season, repairs)
      loadGameConfig(); // Load live unit speeds and game config
      return () => disconnect();
    }
  }, [token]);

  // Auto-refresh once when server version differs from client version
  useEffect(() => {
    async function checkVersion() {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        const data = await res.json();
        if (data.version && data.version !== APP_VERSION) {
          if (!sessionStorage.getItem(VERSION_CHECK_KEY)) {
            sessionStorage.setItem(VERSION_CHECK_KEY, '1');
            window.location.reload();
          }
        } else {
          sessionStorage.removeItem(VERSION_CHECK_KEY);
        }
      } catch {}
    }
    checkVersion();
    // Check on visibility change AND periodically every 5 minutes
    const onVisible = () => { if (document.visibilityState === 'visible') checkVersion(); };
    document.addEventListener('visibilitychange', onVisible);
    const iv = setInterval(checkVersion, 300000);
    return () => { document.removeEventListener('visibilitychange', onVisible); clearInterval(iv); };
  }, []);

  // Announcement banner
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    const fetchAnnouncement = () => {
      fetch('/api/announcement', { cache: 'no-store' })
        .then(r => r.json())
        .then(d => setAnnouncement(d.text ?? ''))
        .catch(() => {});
    };
    fetchAnnouncement();
    const iv = setInterval(fetchAnnouncement, 30000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {announcement && (
        <div className="bg-yellow-900/80 border-b border-yellow-600/50 text-yellow-200 text-xs text-center px-4 py-2 flex items-center justify-center gap-2">
          <Megaphone size={16} className="text-amber-400 shrink-0" /> <span>{announcement}</span>
        </div>
      )}
      <MedalBanner />
      {children}
      <NavBar />
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"    element={<Login    />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route
          path="/*"
          element={
            <RequireAuth>
              <AuthLayout>
                <Routes>
                  <Route index element={<Navigate to="/base" replace />} />
                  <Route path="base"                          element={<Base           />} />
                  <Route path="base/reports"                  element={<BattleReportsPage />} />
                  <Route path="base/resource/:type"          element={<RequireSeason><ResourceDetail /></RequireSeason>} />
                  <Route path="base/building/:buildingType"  element={<RequireSeason><BuildingDetail /></RequireSeason>} />
                  <Route path="base/research-lab"            element={<RequireSeason><ResearchLab   /></RequireSeason>} />
                  <Route path="map"                          element={<RequireSeason><MapPage        /></RequireSeason>} />
                  <Route path="warroom"                      element={<RequireSeason><WarRoom        /></RequireSeason>} />
                  <Route path="alliance"                     element={<RequireSeason><Alliance       /></RequireSeason>} />
                  <Route path="leaderboard"                  element={<RequireSeason><Leaderboard   /></RequireSeason>} />
                  <Route path="chat"                         element={<RequireSeason><ChatPage      /></RequireSeason>} />
                  <Route path="chat/:targetId"               element={<RequireSeason><ChatPage      /></RequireSeason>} />
                  <Route path="admin"                        element={<Admin          />} />
                  <Route path="*"                            element={<Navigate to="/base" replace />} />
                </Routes>
              </AuthLayout>
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

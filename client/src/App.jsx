import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore.js';
import { useSocketStore } from './store/socketStore.js';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Base from './pages/Base.jsx';
import MapPage from './pages/MapPage.jsx';
import WarRoom from './pages/WarRoom.jsx';
import Alliance from './pages/Alliance.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import ResourceDetail from './pages/ResourceDetail.jsx';
import BuildingDetail from './pages/BuildingDetail.jsx';
import Admin from './pages/Admin.jsx';
import ChatPage from './pages/ChatPage.jsx';
import NavBar from './components/NavBar.jsx';

import { APP_VERSION } from './utils/gameConstants.js';

const VERSION_CHECK_KEY = 'versionReloaded';

function RequireAuth({ children }) {
  const token = useAuthStore((s) => s.token);
  return token ? children : <Navigate to="/login" replace />;
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
          <span>📢</span> <span>{announcement}</span>
        </div>
      )}
      {children}
      <NavBar />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"    element={<Login    />} />
        <Route path="/register" element={<Register />} />

        <Route
          path="/*"
          element={
            <RequireAuth>
              <AuthLayout>
                <Routes>
                  <Route index element={<Navigate to="/base" replace />} />
                  <Route path="base"                          element={<Base           />} />
                  <Route path="base/resource/:type"          element={<ResourceDetail />} />
                  <Route path="base/building/:buildingType"  element={<BuildingDetail />} />
                  <Route path="map"                          element={<MapPage        />} />
                  <Route path="warroom"                      element={<WarRoom        />} />
                  <Route path="alliance"                     element={<Alliance       />} />
                  <Route path="leaderboard"                  element={<Leaderboard   />} />
                  <Route path="chat"                         element={<ChatPage      />} />
                  <Route path="chat/:targetId"               element={<ChatPage      />} />
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

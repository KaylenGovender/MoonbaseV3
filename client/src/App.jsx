import { useEffect } from 'react';
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
import NavBar from './components/NavBar.jsx';

function RequireAuth({ children }) {
  const token = useAuthStore((s) => s.token);
  return token ? children : <Navigate to="/login" replace />;
}

function AuthLayout({ children }) {
  const token = useAuthStore((s) => s.token);
  const { connect, disconnect } = useSocketStore();

  useEffect(() => {
    if (token) {
      connect(token);
      return () => disconnect();
    }
  }, [token]);

  return (
    <div className="flex flex-col h-full">
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

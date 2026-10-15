import {
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';

import { useAuth } from './auth/AuthContext';
import { Loading } from './components/Feedback';
import { AppShell } from './layouts/AppShell';

import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { ReportsPage } from './pages/ReportsPage';
import { ReportPage } from './pages/ReportPage';
import { IncidentDetailPage } from './pages/IncidentDetailPage';
import { MapPage } from './pages/MapPage';
import { ProfilePage } from './pages/ProfilePage';

import AdminDashboard from './AdminDashboard';
import SuperAdminDashboard from './SuperAdminDashboard';

function ProtectedLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="auth-loading">
        <Loading label="Checking your session…" />
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname)}`}
        replace
      />
    );
  }

  // Admin, officer, and superadmin roles only access their respective dashboards; citizen portal is hidden
  if (user.role === 'superadmin') {
    return <Navigate to="/superadmin" replace />;
  }
  if (user.role === 'admin' || user.role === 'officer') {
    return <Navigate to="/admin" replace />;
  }

  return <AppShell />;
}

function AdminRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="auth-loading">
        <Loading label="Checking your session…" />
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname)}`}
        replace
      />
    );
  }

  // Citizens go to /app
  if (user.role === 'citizen') {
    return <Navigate to="/app" replace />;
  }

  // Superadmins have their own distinct portal at /superadmin
  if (user.role === 'superadmin') {
    return <Navigate to="/superadmin" replace />;
  }

  return <AdminDashboard />;
}

function SuperAdminRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="auth-loading">
        <Loading label="Checking your session…" />
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname)}`}
        replace
      />
    );
  }

  // STRICT SEPARATION: Only superadmin can access SuperAdmin Center!
  if (user.role !== 'superadmin') {
    return <Navigate to={user.role === 'citizen' ? '/app' : '/admin'} replace />;
  }

  return <SuperAdminDashboard />;
}

export default function App() {
  return (
    <Routes>
      {/* Public pages */}
      <Route path="/" element={<LandingPage />} />

      <Route
        path="/login"
        element={<AuthPage mode="login" />}
      />

      <Route
        path="/register"
        element={<AuthPage mode="register" />}
      />

      {/* Main application: requires login */}
      <Route path="/app" element={<ProtectedLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="report" element={<ReportPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="map" element={<MapPage />} />
        <Route
          path="incidents/:id"
          element={<IncidentDetailPage />}
        />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      {/* Admin dashboard: dedicated standalone admin view */}
      <Route path="/admin" element={<AdminRoute />} />

      {/* Superadmin executive console: standalone privileged governance view */}
      <Route path="/superadmin" element={<SuperAdminRoute />} />

      {/* Unknown URLs */}
      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />
    </Routes>
  );
}

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/app/Layout';
import Login from './pages/Login';
import MaintenancePage from './pages/MaintenancePage';
import ErrorBoundary from './components/common/ErrorBoundary';
import SplashScreen from './components/common/SplashScreen';
import InstallPrompt from './components/app/InstallPrompt';
import ReloadPrompt from './components/app/ReloadPrompt';
import { Suspense, lazy, ReactNode } from 'react';
import { useTheme } from './hooks/useTheme';

// Lazy load pages for performance
const Dashboard = lazy(() => import('./pages/Dashboard'));
const WorkSchedule = lazy(() => import('./pages/WorkSchedule'));
const Settings = lazy(() => import('./pages/Settings'));
const SalaryHistory = lazy(() => import('./pages/SalaryHistory'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const Help = lazy(() => import('./pages/Help'));
const PublicHelp = lazy(() => import('./pages/PublicHelp'));
const Announcements = lazy(() => import('./pages/Announcements'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));

interface RequireAuthProps {
  children: ReactNode;
}

function RequireAuth({ children }: RequireAuthProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <SplashScreen />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full min-h-[50vh]">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
    </div>
  );
}

function MaintenanceGate({ children }: { children: ReactNode }) {
  const { maintenance } = useAuth();
  if (maintenance) return <MaintenancePage />;
  return <>{children}</>;
}

function App() {
  // テーマはアプリ全体で起動直後に適用する。設定タブ（AppearanceSettings）でしか
  // useTheme を呼んでいないと、theme-init.js が効かない環境で設定を開くまで
  // ライトのままになってしまうため、ルートでも適用・OS 設定変更へ追従させる。
  useTheme();

  return (
    <ErrorBoundary>
      <AuthProvider>
        <MaintenanceGate>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              {/* メールのリンク先。ログインしていない端末でも開ける */}
              {(
                [
                  ['/forgot-password', <ForgotPassword key="f" />],
                  ['/reset-password', <ResetPassword key="r" />],
                  ['/verify-email', <VerifyEmail key="v" />],
                ] as const
              ).map(([path, page]) => (
                <Route
                  key={path}
                  path={path}
                  element={<Suspense fallback={<LoadingFallback />}>{page}</Suspense>}
                />
              ))}
              <Route
                path="/guide"
                element={
                  <Suspense fallback={<LoadingFallback />}>
                    <PublicHelp />
                  </Suspense>
                }
              />
              <Route
                path="/"
                element={
                  <RequireAuth>
                    <Layout />
                  </RequireAuth>
                }
              >
                <Route
                  index
                  element={
                    <Suspense fallback={<LoadingFallback />}>
                      <Dashboard />
                    </Suspense>
                  }
                />
                <Route
                  path="calendar"
                  element={
                    <Suspense fallback={<LoadingFallback />}>
                      <WorkSchedule />
                    </Suspense>
                  }
                />
                <Route
                  path="history"
                  element={
                    <Suspense fallback={<LoadingFallback />}>
                      <SalaryHistory />
                    </Suspense>
                  }
                />
                <Route
                  path="settings"
                  element={
                    <Suspense fallback={<LoadingFallback />}>
                      <Settings />
                    </Suspense>
                  }
                />
                <Route
                  path="admin"
                  element={
                    <Suspense fallback={<LoadingFallback />}>
                      <AdminDashboard />
                    </Suspense>
                  }
                />

                <Route
                  path="help"
                  element={
                    <Suspense fallback={<LoadingFallback />}>
                      <Help />
                    </Suspense>
                  }
                />
                <Route
                  path="announcements"
                  element={
                    <Suspense fallback={<LoadingFallback />}>
                      <Announcements />
                    </Suspense>
                  }
                />
              </Route>
              {/* 未知の URL（旧 /chat など）は白画面にせずダッシュボードへ */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
          <InstallPrompt />
          <ReloadPrompt />
        </MaintenanceGate>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import FAQsPage from './pages/FAQsPage';
import CommunityPage from './pages/CommunityPage';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import LeaderboardPage from './pages/LeaderboardPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import ProtectedRoute from './components/ProtectedRoute';
import RaiseQueryPage from './pages/RaiseQueryPage';
import RAGChatWidget from './components/RAGChatWidget';
import { ToastProvider } from './components/ToastProvider';
import WikiTagsPage from './pages/WikiTagsPage';
import ProfilePage from './pages/ProfilePage';
import StatsPage from './pages/StatsPage';
import TrackQueryPage from './pages/TrackQueryPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<FAQsPage />} />
                <Route path="community" element={<CommunityPage />} />
                <Route path="wiki" element={<WikiTagsPage />} />
                <Route path="ask" element={
                  <ProtectedRoute>
                    <RaiseQueryPage />
                  </ProtectedRoute>
                } />
                <Route path="login" element={<LoginPage />} />
                <Route path="register" element={<LoginPage />} />
                <Route path="admin" element={
                  <ProtectedRoute adminOnly>
                    <AdminDashboard />
                  </ProtectedRoute>
                } />
                <Route path="leaderboard" element={
                  <ProtectedRoute>
                    <LeaderboardPage />
                  </ProtectedRoute>
                } />
                <Route path="profile" element={
                  <ProtectedRoute>
                    <ProfilePage />
                  </ProtectedRoute>
                } />
                <Route path="stats" element={
                  <ProtectedRoute>
                    <StatsPage />
                  </ProtectedRoute>
                } />
                <Route path="track-query" element={
                  <ProtectedRoute>
                    <TrackQueryPage />
                  </ProtectedRoute>
                } />
              </Route>
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
            </Routes>
            <RAGChatWidget />
          </ToastProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
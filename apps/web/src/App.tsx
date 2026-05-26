import { Navigate, Route, Routes } from 'react-router-dom';
import Shell from './components/layout/Shell';
import AuthGuard from './components/layout/AuthGuard';
import Register from './pages/auth/Register';
import Login from './pages/auth/Login';
import CheckEmail from './pages/auth/CheckEmail';
import Confirm from './pages/auth/Confirm';
import ArticlesList from './pages/articles/ArticlesList';
import ArticleDetail from './pages/articles/ArticleDetail';
import EntityDetail from './pages/entities/EntityDetail';
import GraphPage from './pages/graph/GraphPage';
import FeedsPage from './pages/feeds/FeedsPage';
import CategoriesPage from './pages/categories/CategoriesPage';
import AxesPage from './pages/axes/AxesPage';
import DigestsPage from './pages/digests/DigestsPage';
import DigestDetailPage from './pages/digests/DigestDetailPage';
import TelemetryPage from './pages/telemetry/TelemetryPage';

export default function App() {
  return (
    <Routes>
      <Route path="/auth/register" element={<Register />} />
      <Route path="/auth/login" element={<Login />} />
      <Route path="/auth/check-email" element={<CheckEmail />} />
      <Route path="/auth/confirm" element={<Confirm />} />
      <Route
        element={
          <AuthGuard>
            <Shell />
          </AuthGuard>
        }
      >
        <Route path="/" element={<Navigate to="/articles" replace />} />
        <Route path="/articles" element={<ArticlesList />} />
        <Route path="/articles/:id" element={<ArticleDetail />} />
        <Route path="/entities/:id" element={<EntityDetail />} />
        <Route path="/graph" element={<GraphPage />} />
        <Route path="/feeds" element={<FeedsPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/settings/axes" element={<AxesPage />} />
        <Route path="/digests" element={<DigestsPage />} />
        <Route path="/digests/:id" element={<DigestDetailPage />} />
        <Route path="/telemetry" element={<TelemetryPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

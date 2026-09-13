import { Route, Routes } from 'react-router-dom'
import { AccountProvider } from './context/AccountContext'
import { AppLayout } from './layouts/AppLayout'
import { ContentAnalysisPage } from './pages/ContentAnalysisPage'
import { DashboardPage } from './pages/DashboardPage'
import { DataPage } from './pages/DataPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ReportsPage } from './pages/ReportsPage'
import { SettingsPage } from './pages/SettingsPage'
import { StrategyPage } from './pages/StrategyPage'
import { TitlesPage } from './pages/TitlesPage'
import { TopicsPage } from './pages/TopicsPage'
import { TrendsPage } from './pages/TrendsPage'

export default function App() {
  return (
    <AccountProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/data" element={<DataPage />} />
          <Route path="/strategy" element={<StrategyPage />} />
          <Route path="/analysis" element={<ContentAnalysisPage />} />
          <Route path="/analysis/:contentId" element={<ContentAnalysisPage />} />
          <Route path="/trends" element={<TrendsPage />} />
          <Route path="/topics" element={<TopicsPage />} />
          <Route path="/titles" element={<TitlesPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AccountProvider>
  )
}

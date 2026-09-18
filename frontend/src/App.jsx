/**
 * Root application component.
 * Handles auth persistence, page routing and risk score for the shell.
 */
import { useEffect, useState } from 'react';
import Login from './components/Login';
import Shell from './components/Shell';
import CommandCenter from './pages/CommandCenter';
import Procurement from './pages/Procurement';
import FreightIntelligence from './pages/FreightIntelligence';
import PortOptimizer from './pages/PortOptimizer';
import VesselOptimizer from './pages/VesselOptimizer';
import ConsignmentTracker from './pages/ConsignmentTracker';
import WhatIfSimulation from './pages/WhatIfSimulation';
import AlertCenter from './pages/AlertCenter';
import StockInventory from './pages/StockInventory';
import ExecutiveReport from './pages/ExecutiveReport';
import { api } from './api';

function normalizeAuth(saved) {
  if (!saved) return null;
  const manager = saved.manager || saved.user || null;
  const plant = saved.plant || null;
  if (!manager || !plant) return null;
  const security = saved.security || {
    plant_access_code_prefill: plant.code || manager.plant,
    layer2: 'plant_access_code',
  };
  return { manager, plant, security, plantAccessCode: saved.plantAccessCode || security.plant_access_code_prefill };
}

export default function App() {
  const [auth, setAuth] = useState(() => {
    try {
      return normalizeAuth(JSON.parse(localStorage.getItem('freightone_auth') || 'null'));
    } catch {
      return null;
    }
  });
  const [page, setPage] = useState('dashboard');
  const [riskScore, setRiskScore] = useState(68);

  useEffect(() => {
    if (!auth) return;
    api('/api/risk-score')
      .then((r) => setRiskScore(r.risk_score || 68))
      .catch(() => {});
  }, [auth]);

  function handleLogin(manager, plant, security) {
    const sec = security || {
      plant_access_code_prefill: plant?.code || manager?.plant,
      layer2: 'plant_access_code',
      protected_modules: ['procurement', 'consignment_tracker'],
    };
    const next = {
      manager,
      plant,
      security: sec,
      plantAccessCode: sec.plant_access_code_prefill || plant?.code || manager?.plant,
    };
    localStorage.setItem('freightone_auth', JSON.stringify(next));
    setAuth(next);
    setPage('dashboard');
  }

  function handleLogout() {
    localStorage.removeItem('freightone_auth');
    setAuth(null);
  }

  if (!auth) {
    return <Login onLogin={handleLogin} />;
  }

  let content = null;
  switch (page) {
    case 'dashboard':
      content = <CommandCenter auth={auth} setPage={setPage} />;
      break;
    case 'procurement':
      content = <Procurement auth={auth} />;
      break;
    case 'freight':
      content = <FreightIntelligence />;
      break;
    case 'optimizer':
      content = <PortOptimizer auth={auth} />;
      break;
    case 'vessel':
      content = <VesselOptimizer auth={auth} />;
      break;
    case 'tracker':
      content = <ConsignmentTracker auth={auth} />;
      break;
    case 'simulation':
      content = <WhatIfSimulation auth={auth} />;
      break;
    case 'alerts':
      content = <AlertCenter auth={auth} />;
      break;
    case 'inventory':
      content = <StockInventory auth={auth} />;
      break;
    case 'report':
      content = <ExecutiveReport auth={auth} />;
      break;
    default:
      content = <CommandCenter auth={auth} setPage={setPage} />;
  }

  return (
    <Shell
      auth={auth}
      page={page}
      setPage={setPage}
      onLogout={handleLogout}
      riskScore={riskScore}
    >
      {content}
    </Shell>
  );
}

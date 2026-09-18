/**
 * Application shell — left sidebar + top bar.
 * Visual structure and class names kept identical to the original design.
 */
import {
  BarChart3, Boxes, TrendingUp, Route, Ship, SlidersHorizontal,
  Bell, Package, FileText, Navigation, UserRound, LogOut, ChevronRight,
} from 'lucide-react';
import ISTClock from './ISTClock';
import { titleMap } from '../utils/format';

const TABS = [
  ['dashboard', 'Command Center', BarChart3],
  ['freight', 'Freight Intelligence', TrendingUp],
  ['procurement', 'Procurement Planner', Boxes],
  ['optimizer', 'Port Optimizer', Route],
  ['vessel', 'Vessel Optimizer', Ship],
  ['tracker', 'Consignment Tracker', Ship],
  ['simulation', 'What-if Simulation', SlidersHorizontal],
  ['alerts', 'Alert Center', Bell],
  ['inventory', 'Stock & Inventory', Package],
  ['report', 'Executive Report', FileText],
];

export default function Shell({ auth, page, setPage, onLogout, riskScore = 68, children }) {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="side-brand">
          <div className="brand-mark"><Navigation size={20} /></div>
          <div>
            <b>FreightOne</b>
            <small>AI LOGISTICS INTELLIGENCE</small>
          </div>
        </div>

        <div className="posting">
          <span>ACTIVE POSTING</span>
          <b>{auth?.plant?.name || 'Rourkela Steel Plant'}</b>
          <small>{auth?.manager?.rank || 'Manager'}</small>
        </div>

        <nav>
          {TABS.map(([id, label, Icon]) => (
            <button
              key={id}
              className={page === id ? 'active' : ''}
              onClick={() => setPage(id)}
            >
              <Icon size={16} />
              <span>{label}</span>
              <ChevronRight size={14} />
            </button>
          ))}
        </nav>

        <div className="side-foot">
          <div className="profile-mini">
            <div className="avatar"><UserRound size={17} /></div>
            <div>
              <b>{auth?.manager?.name || 'R. Sharma'}</b>
              <small>{auth?.manager?.employee_id || 'SAIL-0421'}</small>
            </div>
          </div>
          <div className="risk-mini">
            <span /> Network risk <b>{riskScore}</b>
          </div>
          <button className="signout" onClick={onLogout}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      <section className="shell-main">
        <header className="topbar">
          <div>
            <span className="eyebrow">FREIGHTONE / {titleMap[page].toUpperCase()}</span>
            <h2>{titleMap[page]}</h2>
          </div>
          <div className="top-status">
            <span className="status-dot" /> <ISTClock />
          </div>
        </header>
        <main>{children}</main>
      </section>
    </div>
  );
}

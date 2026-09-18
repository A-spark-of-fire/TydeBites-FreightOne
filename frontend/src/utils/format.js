/**
 * Shared formatting helpers used across every page.
 * Keep these pure so they are easy to unit-test later.
 */

export const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
export const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

export const titleMap = {
  dashboard: 'Command Center',
  procurement: 'Procurement Planner',
  freight: 'Freight Intelligence',
  optimizer: 'Port Optimizer',
  vessel: 'Vessel Optimizer',
  tracker: 'Consignment Tracker',
  simulation: 'What-if Simulation',
  alerts: 'Alert Center',
  inventory: 'Stock & Inventory',
  report: 'Executive Report',
};

# 🚢 TydeBites — FreightOne
### Intelligent Maritime Freight Forecasting, Procurement & Vessel Optimization Platform

![Smart India Hackathon 2026](https://img.shields.io/badge/SIH-2026-orange?style=for-the-badge&logo=hackaday)
![Problem Statement](https://img.shields.io/badge/Problem%20Statement-26006-blue?style=for-the-badge)
![Theme](https://img.shields.io/badge/Theme-Transportation%20%26%20Logistics-green?style=for-the-badge)
![Tech Stack](https://img.shields.io/badge/Stack-FastAPI%20%7C%20React%20%7C%20FinBERT%20%7C%20TimescaleDB-8A2BE2?style=for-the-badge)

---

## 📌 Executive Overview

**TydeBites FreightOne** is an end-to-end, intelligent decision-support platform engineered for industrial steel plants (e.g., SAIL / Rourkela Steel Plant), logistics planners, and government procurement bodies. Designed specifically for overseas bulk cargo shipping (such as Coking Coal and Iron Ore) to the **East Coast of India**, FreightOne unifies market forecasting, vessel chartering, port selection, real-time weather risk, and live shipment tracking into a single co-pilot dashboard.

By replacing disconnected, manual decision-making with automated multi-variable optimization, FreightOne drastically minimizes landed costs, eliminates severe port demurrage penalties, and prevents production shutdowns caused by raw material delays.

---

## 🏗️ System Architecture Pipeline

```
                                  ┌────────────────────────┐
                                  │   React Frontend UI    │
                                  │   (Vite + Tailwind)    │
                                  └───────────┬────────────┘
                                              │
                                       REST API / JSON
                                              │
                                  ┌───────────▼────────────┐
                                  │    FastAPI Backend     │
                                  │    (Python + Uvicorn)  │
                                  └───────────┬────────────┘
                                              │
         ┌────────────────────────────────────┼────────────────────────────────────┐
         │                                    │                                    │
         ▼                                    ▼                                    ▼
┌───────────────────┐               ┌───────────────────┐                ┌───────────────────┐
│ Forecasting Engine│               │ Optimization Engine│               │   Risk Engine     │
│  (90-Day BDI DL)  │               │ (Port & Vessel)   │                │ (Weather/FinBERT) │
└────────┬──────────┘               └─────────┬─────────┘                └─────────┬─────────┘
         │                                    │                                    │
         ▼                                    ▼                                    ▼
┌───────────────────┐               ┌───────────────────┐                ┌───────────────────┐
│ Market BDI Data   │               │ Port & Draft Spec │                │ Open-Meteo API &  │
│ (Historical/Pred) │               │ (Paradip/Haldia)  │                │ FinBERT Sentiment │
└────────┬──────────┘               └─────────┬─────────┘                └─────────┬─────────┘
         │                                    │                                    │
         └────────────────────────────────────┼────────────────────────────────────┘
                                              │
                                  ┌───────────▼────────────┐
                                  │    JSON / Persistence  │
                                  │ PostgreSQL/TimescaleDB │
                                  └────────────────────────┘
```

---

## 📁 Repository File & Folder Structure

```
TydeBites-FreightOne/
├── backend/
│   ├── main.py                     # FastAPI ASGI application & route handlers
│   ├── config.py                   # System configurations & API thresholds
│   ├── services/
│   │   ├── forecasting_engine.py   # BDI 90-day time-series forecasting model
│   │   ├── route_optimizer.py      # Landed cost, ETA, & risk multi-attribute optimization
│   │   ├── risk_analyzer.py        # Weather telemetry & FinBERT sentiment analyzer
│   │   └── weather_service.py      # Live Open-Meteo Marine API fetcher with 2h TTL cache
│   ├── data/                       # Data persistence layer
│   │   ├── bdi_history.json        # Historical Baltic Dry Index series
│   │   ├── ports_db.json           # East Coast port specifications & draft depth constraints
│   │   └── consignments.json       # Live shipment state telemetry
│   └── requirements.txt            # Python dependencies (FastAPI, uvicorn, pydantic, finbert)
├── frontend/
│   ├── index.html                  # Single-page app HTML template
│   ├── vite.config.js              # Vite build setup
│   ├── src/
│   │   ├── main.jsx                # React entry point, routing, & shell container
│   │   ├── styles.css              # Custom layout rules & hover-glow utility classes
│   │   ├── greetingHelper.js       # Dynamic time-based greeting logic (Morning/Afternoon/Evening)
│   │   ├── ISTClock.jsx            # Live digital IST clock component
│   │   └── components/
│   │       ├── CommandCenter.jsx   # Central executive co-pilot dashboard
│   │       ├── FreightIntel.jsx    # Freight market trends & booking window recommendations
│   │       ├── Procurement.jsx     # Material demand & consignment planner
│   │       ├── PortOptimizer.jsx   # Port selection & landed-cost evaluator
│   │       ├── VesselOptimizer.jsx # Vessel capacity, draft, & chartering solver
│   │       ├── Tracker.jsx         # Live vessel -> port -> plant shipment tracking
│   │       ├── WeatherIntel.jsx    # Bay of Bengal marine hazard timeline
│   │       ├── Simulation.jsx      # What-If scenario sandbox
│   │       ├── AlertCenter.jsx     # Dynamic operational alert hub
│   │       └── ExecutiveReport.jsx # C-suite downloadable intelligence report
│   └── package.json                # Frontend package manifest (React, Recharts, Lucide-React)
├── README.md                       # Master project documentation
└── LICENSE                         # Open-source license
```

---

## 🖥️ Prototype Pages & Feature Breakdown

### 1. 🎛️ Command Center (Main Dashboard)
The primary operational cockpit providing a unified high-level overview of the entire supply pipeline.
* **Active KPI Cards**: Real-time counters for Active Consignments, Network Risk Score, Live Material, and AI Procurement Signals.
* **Dynamic Time Greeting**: Contextual greeting (`Good morning`, `Good afternoon`, `Good evening`) linked with local plant time and an IST digital clock.
* **Interactive Navigation Anchors**: Clickable summary panels allowing managers to jump directly into the Freight Page, Alert Center, or Executive Report.
* **Live Consignment Grid**: Snapshot of active vessels with visual status tags (`On Schedule`, `Delayed`).

---

### 2. 📈 Freight Market Intelligence
Protects procurement budgets from volatile chartering rate fluctuations by analyzing the **Baltic Dry Index (BDI)**.
* **90-Day Predictive Horizon**: Deep-learning forecasting engine predicting future BDI rate trajectories.
* **AI Procurement Signal**: Dynamic market advice (`BUY WINDOW` vs. `HOLD / MONITOR`) telling managers when to secure charters before rate spikes.
* **Expected Cost Savings**: Calculates monetary savings achieved by timing bookings within optimal windows.

---

### 3. 📦 Procurement Planner
Translates plant production schedules and safety stock thresholds into actionable purchasing orders.
* **Demand Requirements**: Inputs required tonnage (e.g., Coking Coal, Iron Ore), delivery deadlines, target plant (Rourkela Steel Plant), and overseas origins (Australia, Mozambique).
* **Urgency Scoring**: Calculates inventory burn rates to automatically output procurement urgency levels.
* **Multi-Constraint Matching**: Aligns procurement timing with vessel availability and freight market forecasts.

---

### 4. ⚓ Port & Route Optimizer
Determines the optimal gateway port on the East Coast of India (Paradip vs. Haldia vs. Visakhapatnam).
* **Multi-Factor Scoring**: Evaluates routes using:
  $$\text{Score} = \text{Landed Cost/MT} + \text{ETA} \times (18 + \text{Priority}) + \text{Risk Score} \times 22$$
* **Interactive Cost vs. Deadline Slider**: Allows managers to weight cost efficiency against delivery speed.
* **"Better System Alternative"**: Automatically suggests diversion routes if a preferred port becomes congested.

---

### 5. 🚢 Vessel Optimizer
Matches cargo quantities with the correct vessel class while honoring physical marine constraints.
* **Vessel Class Solver**: Evaluates Capesize, Panamax, and Handysize configurations.
* **Draft Constraint Guard**: Enforces water depth limitations (e.g., restricting shallow ports like Haldia to Panamax vessels).
* **Cost vs. Capacity Tradeoff**: Identifies vessel choices that maximize volume while minimizing chartering cost per metric ton.

---

### 6. 🚚 Consignment Tracker
Provides end-to-end visibility along the **Vessel → Port → Plant** supply chain.
* **Corridor Telemetry**: Displays Port ETA, dispatch dates, and expected final arrival at the plant.
* **Delay Escalation**: Calculates delay duration in days and updates the individual shipment risk score ($+8\%$ per day of delay).
* **Direct Reroute Trigger**: Enables one-click launch of recovery workflows for stranded or delayed vessels.

---

### 7. 🌦️ Weather & Risk Intelligence
Tracks environmental and marine hazards across the critical **Bay of Bengal** shipping corridor.
* **Live Marine API Integration**: Connects to the Open-Meteo Marine API with an automatic 2-hour TTL cache for live wave heights and swell metrics.
* **30-Day Risk Forecast**: Plots a 30-day hazard trend curve to identify tropical cyclonic risks.
* **Categorical Risk Bands**: Visualizes safe vs. hazardous sailing probabilities (`Green`, `Yellow`, `Orange`, `Red`).

---

### 8. 📰 Live Intelligence & FinBERT Sentiment
Monitors global geopolitical news and maritime developments to anticipate supply chain shocks.
* **FinBERT Sentiment Analysis**: Passes maritime news through a specialized NLP model to extract financial sentiment (-1.0 to +1.0).
* **Disruption Early Warning**: Converts negative sentiment spikes (e.g., port strikes, canal blockages) into elevated route risk scores.

---

### 9. 🔔 Alert Center
The platform's centralized crisis management hub.
* **Automated Operational Alerts**: Aggregates delayed consignments, severe weather advisories, critical inventory shortages, and market spikes.
* **Actionable Recovery Suggestions**: Pair every alert with a recommended operational action (e.g., *"Divert SC-2198 to Paradip to reduce risk by 31%"*).

---

### 10. 🔮 What-If Simulation Sandbox
A decision-making sandbox ("Our X-Factor") for testing hypothetical scenario changes before execution.
* **Scenario Testing**: Allows managers to modify parameters (change arrival ports, shift booking dates, adjust vessel draft) and compare outcomes side-by-side.
* **Impact Analysis**: Displays exact deltas in Landed Cost, ETA, and overall Risk Score between the manager's proposal and the AI recommendation.

---

### 11. 📊 Executive Report
Generates C-suite ready executive summaries for executive decision-makers.
* **One-Click Export**: Compiles network risk summaries, active vs. delayed consignment counts, inventory watchlists, and key procurement recommendations.
* **Auditable Governance**: Provides transparent reasoning behind all AI recommendations.

---

## 🛠️ Tech Stack

| Domain | Technology |
|---|---|
| **Frontend UI** | React, Vite, TailwindCSS, Recharts, Lucide-React, Leaflet.js |
| **Backend Framework** | Python 3.12, FastAPI, Uvicorn, Pydantic |
| **AI / ML & NLP** | FinBERT (News Sentiment), Time-Series Deep Learning (BDI Forecast) |
| **Data & APIs** | PostgreSQL, TimescaleDB, MongoDB, Open-Meteo Marine Weather API |

---

## ⚡ Quickstart & Installation

### 1. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser to view the live prototype!

---

## 👥 Team TydeBites — Smart India Hackathon 2026
* **Problem Statement ID**: 26006
* **Domain**: Transportation & Logistics (Maritime Procurement)
* **Target Industry**: Steel Plants & Bulk Material Imports (East Coast of India)

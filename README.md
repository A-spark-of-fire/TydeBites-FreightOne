# TydeBites — FreightOne

> Intelligent Freight Forecasting, Procurement & Vessel Optimization Platform

TydeBites FreightOne is an intelligent freight decision-support platform designed to help industrial procurement and logistics teams make faster, data-driven decisions across procurement, freight markets, vessel selection, port routing, weather risk, and shipment tracking.

## 🚀 Overview

FreightOne brings procurement intelligence and freight operations into a single dashboard.

The platform combines:

- 📦 Inventory & procurement intelligence
- 🚢 Vessel optimization
- ⚓ Port & route optimization
- 📈 Freight market forecasting
- 🌦️ Weather & network risk analysis
- 📰 Live freight/news intelligence
- 🧠 FinBERT-based sentiment analysis
- 🚚 Consignment tracking
- 🔔 Operational alerts
- 🔮 What-if scenario simulation
- 📊 Executive reporting

The system is designed around a modular architecture where the frontend consumes REST APIs exposed by the backend.

---

## ✨ Key Features

### Command Center

The Command Center provides a consolidated operational view containing:

- Active consignments
- Network risk score
- Live material information
- AI procurement signals
- Freight market trends
- Live intelligence
- Shipment status
- Procurement alerts

---

### 📦 Procurement Intelligence

FreightOne evaluates inventory levels, consumption rates, incoming consignments and safety-stock requirements to generate procurement urgency indicators.

The procurement engine can consider:

- Material
- Required quantity
- Deadline
- Plant
- Preferred port
- Origin
- Cost priority

It produces procurement plans and route recommendations based on the supplied constraints.

---

### ⚓ Port & Route Optimization

The route optimization engine evaluates available destination ports using factors such as:

- Freight cost
- Port congestion
- Inland transportation
- Transit time
- Risk
- Procurement priority

The backend exposes route-ranking APIs that allow the frontend to compare available options.

---

### 🚢 Vessel Optimization

FreightOne includes a dedicated vessel optimization module.

Instead of changing the selected port, the vessel optimizer evaluates different vessel configurations against:

- Cargo quantity
- Port constraints
- Vessel capacity
- Transit requirements
- Deadline
- Origin
- Material

This allows the system to identify suitable vessel choices for a given freight requirement.

---

### 📈 Freight Market Intelligence

The Freight Intelligence module provides:

- Historical BDI data
- BDI forecasting
- Freight market indices
- Forecast horizon
- Booking-window analysis
- Expected savings opportunity

The forecasting service is exposed through the backend and consumed by the React dashboard.

---

### 🌦️ Weather & Risk Intelligence

FreightOne incorporates weather conditions into operational decision-making.

The system provides:

- Regional marine-weather information
- Weather risk indicators
- Network risk scoring
- Shipment-delay exposure
- Bay of Bengal risk monitoring

Weather and network risk can therefore be considered alongside freight and procurement decisions.

---

### 📰 Live Intelligence & FinBERT

The backend provides live intelligence services for freight and market information.

News items can be processed through FinBERT sentiment analysis to classify market sentiment and support downstream freight-risk analysis.

The platform supports:

- Live news retrieval
- Freight-related news
- Market information
- Sentiment analysis
- Combined intelligence feeds

---

### 🚚 Consignment Tracking

The Consignment Tracker provides shipment visibility across:

`Vessel → Port → Plant`

It exposes information including:

- Consignment ID
- Material
- Origin
- Port
- Port ETA
- Dispatch date
- Final arrival
- Delay status
- Delay duration

Delayed consignments can feed directly into the alert and recovery workflow.

---

### 🔔 Alert Center

Alerts are dynamically derived from operational data.

The system can surface:

- Delayed consignments
- Elevated weather risk
- Critical inventory
- Freight-market movements
- Procurement exposure

Each alert contains severity, impact and a suggested operational action.

---

### 🔮 What-If Simulation

The What-If module allows users to compare alternative freight scenarios.

The API can compare:

- Total cost
- ETA
- Risk score
- Selected port
- Alternative port

This allows users to understand how changing a logistics constraint affects the overall freight decision.

---

### 📊 Executive Report

FreightOne generates an executive-level summary containing:

- Network risk
- Active consignments
- Delayed consignments
- Inventory watch items
- Priority decisions
- Current plant
- Report generation date

---

# 🏗️ Architecture

```text
                    ┌───────────────────────┐
                    │      React Frontend   │
                    │       Vite + JS       │
                    └───────────┬───────────┘
                                │
                         REST API / JSON
                                │
                    ┌───────────▼───────────┐
                    │     FastAPI Backend   │
                    │       Python          │
                    └───────────┬───────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          ▼                     ▼                     ▼
   Forecasting Engine     Optimization Engine    Risk Engine
          │                     │                     │
          ▼                     ▼                     ▼
       BDI Data          Ports / Vessels       Weather / Risk
          │                     │                     │
          └─────────────────────┼─────────────────────┘
                                │
                     ┌──────────▼──────────┐
                     │   JSON Data Layer  │
                     │    backend/data    │
                     └────────────────────┘

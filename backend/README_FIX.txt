# FreightOne Vessel Optimizer backend fix

The screenshot error `Not Found` is a backend HTTP 404: the frontend is requesting
an endpoint that the currently running FastAPI application does not expose.

This bundle intentionally does NOT modify the existing UI.

## Files

1. `backend/services/vessel_optimizer.py`
   - Loads `backend/data/vessels.json`
   - Loads `backend/data/destination_ports.json`
   - Keeps the selected destination port fixed
   - Checks vessel draft and DWT against port constraints
   - Calculates cargo utilisation, trips, ETA, estimated charter cost and score
   - Returns feasible and rejected vessel choices

2. `backend/main.py.patch.txt`
   - Exact additions required in your existing `backend/main.py`
   - Does not replace your existing backend

## Important

Your existing `backend/data/vessels.json` must remain where it is.
Do not create `frontend/src/data/vesselData.json`.

After adding the service and the endpoint, restart FastAPI:

cd backend
source venv/bin/activate
python -m uvicorn main:app --reload --port 8000

Then start the frontend normally.

The existing frontend should call:
POST http://127.0.0.1:8000/api/vessel-optimizer

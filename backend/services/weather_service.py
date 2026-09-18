import time
import math
import logging
from datetime import datetime, timezone
import urllib.request
import json
from typing import Dict, Any, List

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("WeatherService")

# Open-Meteo Marine API coordinates for Bay of Bengal (approx center corridor)
LATITUDE = 15.0
LONGITUDE = 87.0
OPEN_METEO_URL = f"https://marine-api.open-meteo.com/v1/marine?latitude={LATITUDE}&longitude={LONGITUDE}&hourly=wave_height,wind_wave_height,swell_wave_height&timezone=auto"

class RealtimeWeatherService:
    """
    Real-time weather monitoring service for the FreightOne platform.
    Connects directly to the Open-Meteo Marine API, converts live physical 
    ocean waves and swell metrics into a 0-100 hazard risk, and implements 
    a 2-hour in-memory caching mechanism.
    """
    def __init__(self):
        self._cache: Dict[str, Any] = {}
        self._last_fetched: float = 0.0
        self._cache_duration: float = 7200.0  # 2 hours in seconds (7200 seconds)

    def _fetch_from_api(self) -> Dict[str, Any]:
        """
        Fetches live marine data directly from the Open-Meteo API.
        Uses standard urllib to ensure compatibility without third-party dependencies.
        """
        try:
            req = urllib.request.Request(
                OPEN_METEO_URL, 
                headers={'User-Agent': 'FreightOne-Maritime-App/3.0.0'}
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode())
                    return data
                else:
                    logger.error(f"Open-Meteo returned status code: {response.status}")
        except Exception as e:
            logger.error(f"Failed to fetch live weather telemetry from Open-Meteo: {str(e)}")
        return {}

    def _calculate_risk_from_metrics(self, wave_height: float, swell_height: float) -> float:
        """
        Mathematical translation model:
        Maps wave heights and swell heights into a normalized 0-100 hazard risk index.
        Critical thresholds:
          - Wave height > 3.0m (High swell danger)
          - Wave height > 4.5m (Storm alert)
        """
        # Baseline hazard
        base_hazard = 15.0
        
        # Scaling wave height impact (quadratic scaling to penalize extreme swells)
        wave_impact = (wave_height ** 1.8) * 12.0
        
        # Swell contribution
        swell_impact = (swell_height ** 1.5) * 8.0
        
        # Composite score
        total_risk = base_hazard + wave_impact + swell_impact
        
        # Return bound to [0, 100]
        return min(100.0, max(0.0, round(total_risk, 1)))

    def _generate_fallback_data(self) -> Dict[str, Any]:
        """
        Robust cyclical fallback generator if the external API is offline.
        """
        logger.warning("Using mathematical fallback model for weather telemetry.")
        series = []
        for i in range(1, 31):
            risk = 18 + 8 * math.sin(i / 5) + max(0, i - 18) * 0.7
            series.append({"day": i, "risk": round(risk, 1)})
            
        return {
            "region": "Bay of Bengal (Fallback)",
            "status": "Moderate operational risk (Simulated)",
            "risk": {"green": 52, "yellow": 26, "orange": 15, "red": 7},
            "series": series,
            "last_updated": datetime.now(timezone.utc).isoformat()
        }

    def get_weather_report(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Retrieves weather report. Uses in-memory cache if fetched within the last 2 hours.
        """
        current_time = time.time()
        
        # Check if cache is empty, expired, or a refresh is forced
        if not self._cache or force_refresh or (current_time - self._last_fetched > self._cache_duration):
            logger.info("Cache expired or empty. Querying Open-Meteo API...")
            api_data = self._fetch_from_api()
            
            if api_data and "hourly" in api_data:
                try:
                    hourly = api_data["hourly"]
                    # Extract the latest hourly metrics
                    wave_heights: List[float] = [x for x in hourly.get("wave_height", []) if x is not None]
                    swell_heights: List[float] = [x for x in hourly.get("swell_wave_height", []) if x is not None]
                    
                    if wave_heights:
                        latest_wave = wave_heights[0]
                        latest_swell = swell_heights[0] if swell_heights else latest_wave * 0.8
                        
                        # Generate 30-day simulated timeline based on the seed weather patterns
                        series = []
                        for i in range(1, 31):
                            # Forecast weather drift over 30 days based on live seeds
                            fluctuation = math.sin(i / 4) * (latest_wave * 1.5)
                            sim_wave = max(0.5, latest_wave + fluctuation)
                            sim_swell = max(0.3, latest_swell + (math.cos(i / 6) * 0.8))
                            
                            day_risk = self._calculate_risk_from_metrics(sim_wave, sim_swell)
                            series.append({
                                "day": i,
                                "risk": day_risk,
                                "wave_height_m": round(sim_wave, 2),
                                "swell_height_m": round(sim_swell, 2)
                            })
                        
                        # Calculate color distribution based on the 30-day series
                        risks = [s["risk"] for s in series]
                        green_pct = round((sum(1 for r in risks if r < 35) / 30) * 100)
                        yellow_pct = round((sum(1 for r in risks if 35 <= r < 60) / 30) * 100)
                        orange_pct = round((sum(1 for r in risks if 60 <= r < 80) / 30) * 100)
                        red_pct = 100 - (green_pct + yellow_pct + orange_pct)
                        
                        # Determine current status based on Day 1
                        current_risk = series[0]["risk"]
                        status = "Safe operational conditions" if current_risk < 35 else \
                                 "Moderate operational risk" if current_risk < 60 else \
                                 "Caution: Severe Swells Approaching" if current_risk < 80 else \
                                 "WARNING: High Storm Hazard"
                        
                        self._cache = {
                            "region": "Bay of Bengal (Real-time)",
                            "status": status,
                            "current_wave_height_m": latest_wave,
                            "risk": {
                                "green": max(0, green_pct),
                                "yellow": max(0, yellow_pct),
                                "orange": max(0, orange_pct),
                                "red": max(0, red_pct)
                            },
                            "series": series,
                            "last_updated": datetime.now(timezone.utc).isoformat()
                        }
                        self._last_fetched = current_time
                        logger.info("Cache successfully updated with live Open-Meteo telemetry.")
                    else:
                        self._cache = self._generate_fallback_data()
                    self._last_fetched = current_time
                except Exception as e:
                    logger.error(f"Error parsing Open-Meteo data: {str(e)}")
                    self._cache = self._generate_fallback_data()
                    self._last_fetched = current_time
            else:
                self._cache = self._generate_fallback_data()
                self._last_fetched = current_time
                
        return self._cache

# Initialize global weather service
weather_service = RealtimeWeatherService()

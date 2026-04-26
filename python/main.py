from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
import logging
import os

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="GeoFlood AI Engine",
    description="Microservice for flood risk prediction and terrain scoring",
    version="1.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify frontend origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request/Response Models
class FloodRiskRequest(BaseModel):
    zoneId: str
    weather: Dict[str, Any]
    altitude: float
    historicalData: int
    drainage: float
    rainfallForecast: float

class FloodRiskResponse(BaseModel):
    floodProbability: float = Field(..., ge=0.0, le=1.0)
    severity: str  # 'high', 'medium', 'low'
    confidence: float = Field(..., ge=0.0, le=1.0)

class TerrainScoreRequest(BaseModel):
    lat: float
    lng: float
    altitude: Optional[float] = None
    drainage: Optional[float] = None
    historicalFloods: Optional[int] = 0
    nearestZoneRisk: Optional[str] = None

class TerrainScoreResponse(BaseModel):
    riskScore: int = Field(..., ge=0, le=100)
    altitudeMeters: float
    drainageScore: int = Field(..., ge=0, le=100)
    historicalFloods: int
    recommendation: str

class HealthResponse(BaseModel):
    status: str

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return {"status": "ok"}

@app.post("/predict/flood-risk", response_model=FloodRiskResponse)
async def predict_flood_risk(request: FloodRiskRequest):
    """
    Predict flood risk for a given zone based on weather, altitude, historical data, and drainage.
    """
    logger.info(f"Predicting flood risk for zone {request.zoneId}")

    try:
        # Simple heuristic model (replace with actual ML model)
        # Base risk from historical floods
        base_risk = min(request.historicalData * 0.1, 0.5)

        # Weather factor (rainfall)
        weather_factor = request.weather.get('rainChance', 0) / 100.0 * 0.3

        # Rainfall forecast factor
        forecast_factor = min(request.rainfallForecast / 100.0, 0.4) if request.rainfallForecast else 0

        # Drainage factor (better drainage = lower risk)
        drainage_factor = (1 - (request.drainage / 100.0)) * 0.2

        # Altitude factor (lower altitude = higher risk)
        altitude_factor = 0
        if request.altitude is not None:
            if request.altitude < 5:
                altitude_factor = 0.2
            elif request.altitude < 20:
                altitude_factor = 0.1

        # Combined probability
        flood_probability = min(base_risk + weather_factor + forecast_factor + drainage_factor + altitude_factor, 1.0)

        # Determine severity
        if flood_probability >= 0.7:
            severity = "high"
        elif flood_probability >= 0.4:
            severity = "medium"
        else:
            severity = "low"

        # Confidence (mock)
        confidence = 0.85

        logger.info(f"Prediction complete: {flood_probability:.2f} ({severity})")
        return FloodRiskResponse(
            floodProbability=flood_probability,
            severity=severity,
            confidence=confidence,
        )
    except Exception as e:
        logger.error(f"Prediction error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/predict/terrain-score", response_model=TerrainScoreResponse)
async def predict_terrain_score(request: TerrainScoreRequest):
    """
    Calculate terrain flood risk score for a specific location.
    Returns riskScore (0-100) and recommendation text in French.
    """
    logger.info(f"Calculating terrain score for {request.lat}, {request.lng}")

    try:
        # Mock ML model - replace with actual model inference
        # Calculate risk score based on multiple factors

        altitude = request.altitude or 10.0  # meters above sea level
        drainage = request.drainage or 50.0   # 0-100 score
        historical = request.historicalFloods or 0
        zone_risk = request.nearestZoneRisk or 'low'

        # Base risk from altitude (lower = higher risk)
        altitude_risk = max(0, 100 - (altitude * 3)) if altitude < 30 else 0

        # Historical factor (more floods = higher risk)
        historical_factor = min(historical * 10, 50)

        # Zone proximity factor
        zone_factor = {"high": 40, "medium": 20, "low": 5}.get(zone_risk, 5)

        # Drainage factor (poor drainage = higher risk)
        drainage_risk = 100 - drainage

        # Combine into final score
        risk_score = min(
          int(
            altitude_risk * 0.3 +
            historical_factor * 0.3 +
            zone_factor * 0.2 +
            drainage_risk * 0.2
          ),
          100
        )

        # Generate recommendation in French
        if risk_score >= 70:
            recommendation = (
                "Zone à risque d'inondation élevé. Non recommandée pour "
                "la construction ou l'investissement. Des mesures de protection "
                "avancées seraient nécessaires."
            )
        elif risk_score >= 50:
            recommendation = (
                "Risque d'inondation modéré à élevé. Si construction envisagée, "
                "prévoir des systèmes de drainage robustes et une élévation "
                "des fondations."
            )
        elif risk_score >= 30:
            recommendation = (
                "Risque d'inondation modéré. Des améliorations de drainage "
                "et une surveillance saisonnière sont recommandées."
            )
        else:
            recommendation = (
                "Zone à faible risque d'inondation. Convient pour "
                "la construction et l'investissement avec des précautions standard."
            )

        return TerrainScoreResponse(
            riskScore=risk_score,
            altitudeMeters=altitude,
            drainageScore=int(drainage),
            historicalFloods=historical,
            recommendation=recommendation,
        )
    except Exception as e:
        logger.error(f"Terrain scoring error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

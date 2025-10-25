from fastapi import FastAPI
from pydantic import BaseModel
from sklearn.ensemble import IsolationForest
import uvicorn

# ---------- Models ----------

class LogInput(BaseModel):
    features: list  # numeric features for ML

# ---------- App Init ----------

app = FastAPI(title="AI Cybersecurity ML Service")

# Train a dummy IsolationForest initially (later we will load real model)
model = IsolationForest(contamination=0.05)
# dummy fit so model is ready — later replace with real dataset
model.fit([[0, 0, 0], [1, 1, 1]])

# ---------- Routes ----------

@app.post("/predict")
def predict(log: LogInput):
    try:
        pred = model.predict([log.features])[0]  # -1 = anomaly, 1 = normal
        score = model.decision_function([log.features])[0]
        return {
            "anomaly": (pred == -1),
            "confidence": float(abs(score))
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/")
def root():
    return {"status": "ml-service running"}

# ---------- Server Run ----------

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

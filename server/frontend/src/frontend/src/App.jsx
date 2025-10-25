import { useEffect, useState } from "react";
import io from "socket.io-client";

const socket = io("http://localhost:3000"); // backend server URL

export default function App() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    // listen for realtime alerts pushed by backend
    socket.on("alert", (data) => {
      setAlerts((prev) => [data, ...prev]); // prepend new alert
    });

    return () => {
      socket.off("alert");
    };
  }, []);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>AI Cybersecurity — Realtime Alert Dashboard</h1>

      {alerts.length === 0 && <p>No alerts yet...</p>}

      <ul>
        {alerts.map((a, idx) => (
          <li key={idx}>
            <strong>{a.type}:</strong> {a.message} —{" "}
            <span style={{ color: a.anomaly ? "red" : "green" }}>
              {a.anomaly ? "ANOMALY" : "SAFE"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

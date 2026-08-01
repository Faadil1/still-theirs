"use client";

import { useState } from "react";

interface LogEntry {
  timestamp: string;
  message: string;
}

export default function Home() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [healthResult, setHealthResult] = useState<string>("Not checked");
  const [healthTimestamp, setHealthTimestamp] = useState<string>("-");
  const [checking, setChecking] = useState(false);

  function pushLog(message: string) {
    setLog((prev) => [...prev, { timestamp: new Date().toISOString(), message }]);
  }

  async function checkHealth() {
    setChecking(true);
    pushLog("Checking Prava sandbox health...");
    try {
      const res = await fetch("/api/prava/health");
      const data = await res.json();
      if (res.ok) {
        setHealthResult(`${data.status} (HTTP ${res.status})`);
        setHealthTimestamp(data.timestamp);
        pushLog(`Health check succeeded: ${data.status}`);
      } else {
        setHealthResult(`FAILED (HTTP ${res.status}): ${data.error}`);
        pushLog(`Health check failed: HTTP ${res.status} - ${data.error}`);
      }
    } catch {
      setHealthResult("FAILED: network error");
      pushLog("Health check failed: network error");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-mono text-sm text-black dark:bg-black dark:text-zinc-50">
      <h1 className="mb-6 text-xl font-bold">Prava Safety Gate — Technical Gate</h1>

      <section className="mb-8 border border-zinc-300 p-4 dark:border-zinc-700">
        <h2 className="mb-2 font-bold">A. Environment</h2>
        <p>Sandbox badge: sandbox.api.prava.space</p>
      </section>

      <section className="mb-8 border border-zinc-300 p-4 dark:border-zinc-700">
        <h2 className="mb-2 font-bold">B. Prava Health</h2>
        <button
          onClick={checkHealth}
          disabled={checking}
          className="mb-2 rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {checking ? "Checking..." : "Check Prava Health"}
        </button>
        <p>Result: {healthResult}</p>
        <p>Timestamp (UTC): {healthTimestamp}</p>
      </section>

      <section className="border border-zinc-300 p-4 dark:border-zinc-700">
        <h2 className="mb-2 font-bold">E. Chronological Technical Log</h2>
        <ul className="max-h-64 overflow-y-auto">
          {log.map((entry, i) => (
            <li key={i}>
              [{entry.timestamp}] {entry.message}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

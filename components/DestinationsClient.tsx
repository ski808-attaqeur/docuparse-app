"use client";
import { useState } from "react";
import type { DestinationRow } from "@/lib/types";

interface Rule {
  id: string;
  doc_type: string;
  destination_id: string;
  auto_deliver_on_approve: boolean;
  destinations?: { name: string } | null;
}

const DOC_TYPES = ["invoice", "receipt", "report", "contract", "spreadsheet", "other"];

export function DestinationsClient({
  initialDestinations,
  initialRules,
}: {
  initialDestinations: DestinationRow[];
  initialRules: Rule[];
}) {
  const [destinations, setDestinations] = useState(initialDestinations);
  const [rules, setRules] = useState<Rule[]>(initialRules);
  const [name, setName] = useState("");
  const [type, setType] = useState("webhook");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  const [ruleDocType, setRuleDocType] = useState("invoice");
  const [ruleDest, setRuleDest] = useState("");

  async function refresh() {
    const res = await fetch("/api/destinations");
    const json = await res.json();
    setDestinations(json.destinations ?? []);
    setRules(json.routing_rules ?? []);
  }

  async function addDestination(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    await fetch("/api/destinations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, type, config: type === "webhook" ? { url, method: "POST" } : {} }),
    });
    setName("");
    setUrl("");
    await refresh();
    setBusy(false);
  }

  async function removeDestination(id: string) {
    if (!confirm("Delete this destination?")) return;
    await fetch(`/api/destinations/${id}`, { method: "DELETE" });
    await refresh();
  }

  async function toggleEnabled(d: DestinationRow) {
    await fetch(`/api/destinations/${d.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !d.enabled }),
    });
    await refresh();
  }

  async function test(id: string) {
    setTestResult((p) => ({ ...p, [id]: "…" }));
    const res = await fetch(`/api/destinations/${id}/test`, { method: "POST" });
    const json = await res.json();
    setTestResult((p) => ({
      ...p,
      [id]: json.ok ? `OK ${json.status ?? ""}${json.simulated ? " (simulated)" : ""}` : `Failed: ${json.error ?? json.status}`,
    }));
  }

  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    if (!ruleDest) return;
    await fetch("/api/routing-rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ doc_type: ruleDocType, destination_id: ruleDest, auto_deliver_on_approve: true }),
    });
    await refresh();
  }

  async function removeRule(id: string) {
    await fetch(`/api/routing-rules?id=${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Destinations &amp; routing</h1>
      <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
        Configure where approved data is delivered. Map a document type to a destination to auto-deliver on approval.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="dest-split">
        {/* Destinations */}
        <div className="panel" style={{ padding: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Destinations</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {destinations.map((d) => (
              <div key={d.id} className="card" style={{ padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <strong style={{ fontSize: 13 }}>{d.name}</strong>
                  <span className="badge">{d.type}</span>
                  <span className={`badge ${d.enabled ? "conf-high" : ""}`}>{d.enabled ? "enabled" : "disabled"}</span>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                    <button className="btn btn-sm" onClick={() => test(d.id)}>Test</button>
                    <button className="btn btn-sm" onClick={() => toggleEnabled(d)}>{d.enabled ? "Disable" : "Enable"}</button>
                    <button className="btn btn-sm btn-danger" onClick={() => removeDestination(d.id)}>✕</button>
                  </div>
                </div>
                {(d.config as { url?: string })?.url && (
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{(d.config as { url?: string }).url}</div>
                )}
                {testResult[d.id] && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Test: {testResult[d.id]}</div>}
              </div>
            ))}
            {destinations.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No destinations yet.</p>}
          </div>

          <form onSubmit={addDestination} style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>Add destination</div>
            <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="webhook">Webhook</option>
              <option value="google_sheets">Google Sheets</option>
              <option value="crm">CRM</option>
              <option value="erp">ERP</option>
            </select>
            {type === "webhook" && (
              <input className="input" placeholder="https://webhook.site/…" value={url} onChange={(e) => setUrl(e.target.value)} />
            )}
            <button className="btn btn-primary" disabled={busy}>{busy ? "Adding…" : "Add destination"}</button>
          </form>
        </div>

        {/* Routing rules */}
        <div className="panel" style={{ padding: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Routing rules</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {rules.map((r) => (
              <div key={r.id} className="card" style={{ padding: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <span className="badge">{r.doc_type}</span>
                <span>→</span>
                <strong style={{ fontSize: 13 }}>{r.destinations?.name ?? "destination"}</strong>
                {r.auto_deliver_on_approve && <span className="badge conf-high">auto on approve</span>}
                <button className="btn btn-sm btn-danger" style={{ marginLeft: "auto" }} onClick={() => removeRule(r.id)}>✕</button>
              </div>
            ))}
            {rules.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No routing rules. Approvals won&apos;t auto-deliver yet.</p>}
          </div>

          <form onSubmit={addRule} style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>Add rule</div>
            <select className="input" value={ruleDocType} onChange={(e) => setRuleDocType(e.target.value)}>
              {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="input" value={ruleDest} onChange={(e) => setRuleDest(e.target.value)}>
              <option value="">Select destination…</option>
              {destinations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button className="btn btn-primary" disabled={!ruleDest}>Add rule</button>
          </form>
        </div>
      </div>
      <style>{`@media (max-width: 860px){ .dest-split{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

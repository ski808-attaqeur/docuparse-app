export function SetupNotice({ error }: { error: string | null }) {
  return (
    <div className="panel" style={{ padding: 28, maxWidth: 720, margin: "24px auto" }}>
      <div style={{ fontSize: 34 }}>🗄️</div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>Database not set up yet</h1>
      <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>
        The Supabase connection works, but the DocuParse tables don&apos;t exist yet. Apply the
        migration once, then reload this page.
      </p>
      <ol className="muted" style={{ fontSize: 14, marginTop: 12, paddingLeft: 20, lineHeight: 1.7 }}>
        <li>
          Open the Supabase project → <strong>SQL Editor</strong>.
        </li>
        <li>
          Paste the contents of{" "}
          <code style={{ background: "var(--panel-2)", padding: "1px 6px", borderRadius: 4 }}>
            supabase/migrations/0001_init.sql
          </code>{" "}
          and run it.
        </li>
        <li>
          Reload — the library loads seeded demo documents. Click <strong>Load demo data</strong> if
          the pages/extractions need filling in.
        </li>
      </ol>
      {error && (
        <p className="muted" style={{ fontSize: 12, marginTop: 14, opacity: 0.7 }}>
          Detail: {error}
        </p>
      )}
    </div>
  );
}

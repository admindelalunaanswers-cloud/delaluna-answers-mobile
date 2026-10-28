import { NavLink, Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "./lib/auth-context";
import { IS_PRODUCTION, PROJECT_ID } from "./lib/firebase";
import PromptTest from "./routes/prompt-test";
import SignIn from "./routes/sign-in";
import Users from "./routes/users";

const NAV = [
  { to: "/users", label: "Users" },
  { to: "/prompt-testing", label: "Prompt testing" },
  { to: "/subscriptions", label: "Subscriptions" },
  { to: "/health", label: "App health" },
  { to: "/config", label: "Release & config" },
];

function Placeholder({ title }: { title: string }) {
  return (
    <>
      <h1 className="page-title">{title}</h1>
      <p className="page-sub">Not built yet.</p>
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          This section is scaffolded but has no functionality yet.
        </p>
      </div>
    </>
  );
}

export default function App() {
  const { status, user, signOut } = useAuth();

  if (status === "loading") {
    return (
      <div className="centre">
        <p className="muted">Checking access…</p>
      </div>
    );
  }

  if (status === "signed-out") return <SignIn />;

  if (status === "not-admin") {
    return (
      <div className="centre">
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Not an admin account</h2>
          <p className="muted" style={{ fontSize: 13 }}>
            You are signed in as <span className="mono">{user?.email}</span>,
            but that address is not on the admin allowlist.
          </p>
          <p className="faint" style={{ fontSize: 12.5 }}>
            Admin access comes from the server-side{" "}
            <span className="mono">ADMIN_EMAILS</span> list, and the
            account&rsquo;s email must be verified before the claim is granted.
          </p>
          <button className="secondary" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">🌙 Delaluna Admin</div>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="main">
        <header className="topbar">
          {/* Which backend is being edited is the single most important fact on
              screen. An admin action taken against the wrong project is not
              something you can spot after the fact. */}
          <span className={`env-badge ${IS_PRODUCTION ? "prod" : "test"}`}>
            {IS_PRODUCTION ? "● Production" : "○ Test"} · {PROJECT_ID}
          </span>
          <div className="stack" style={{ alignItems: "center" }}>
            <span className="faint mono" style={{ fontSize: 12.5 }}>
              {user?.email}
            </span>
            <button className="secondary" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </header>

        <main className="content">
          <Routes>
            <Route path="/" element={<Navigate to="/users" replace />} />
            <Route path="/users" element={<Users />} />
            <Route path="/users/:uid" element={<Users />} />
            <Route path="/prompt-testing" element={<PromptTest />} />
            <Route
              path="/subscriptions"
              element={<Placeholder title="Subscriptions & revenue" />}
            />
            <Route
              path="/health"
              element={<Placeholder title="App health" />}
            />
            <Route
              path="/config"
              element={<Placeholder title="Release & config" />}
            />
            <Route path="*" element={<Navigate to="/users" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

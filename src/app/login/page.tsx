"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

import { ArrowIcon, CheckIcon, FactoryIcon, SparkIcon } from "@/components/icons";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@demo.co.tz");
  const [password, setPassword] = useState("Demo123!");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    startTransition(async () => {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) setError("That email or password doesn’t match our records.");
      else { router.push("/objectives"); router.refresh(); }
    });
  }

  return <main className="login-page">
    <section className="login-story">
      <div className="login-brand"><span className="brand-mark light"><FactoryIcon /></span><span>forge</span></div>
      <div className="story-copy">
        <span className="eyebrow light"><SparkIcon /> Manufacturing intelligence</span>
        <h1>Your factory,<br/><em>moving as one.</em></h1>
        <p>Set the outcome. Forge plans the work, coordinates your suppliers and teams, and keeps moving until it’s done.</p>
        <div className="story-flow">
          {[["01", "Plan", "Know exactly what is needed"], ["02", "Source", "Secure materials through real suppliers"], ["03", "Make", "Coordinate production to completion"], ["04", "Deliver", "Prepare every order on time"]].map(([n, title, text]) => <div key={n}><span>{n}</span><p><strong>{title}</strong>{text}</p><CheckIcon /></div>)}
        </div>
      </div>
      <p className="story-footer">AI Manufacturing Operations Agent</p>
    </section>
    <section className="login-panel">
      <form className="login-form" onSubmit={submit}>
        <div className="mobile-login-brand"><span className="brand-mark"><FactoryIcon /></span><span>forge</span></div>
        <span className="overline">OPERATIONS CONSOLE</span>
        <h2>Welcome back</h2>
        <p>Sign in to set your factory’s next objective.</p>
        <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="primary-button wide" disabled={pending}>{pending ? "Signing in…" : "Enter operations console"}<ArrowIcon /></button>
        <div className="demo-credential"><SparkIcon /><p><strong>Demo access</strong><span>admin@demo.co.tz &nbsp;•&nbsp; Demo123!</span></p></div>
      </form>
    </section>
  </main>;
}

export const metadata = { title: "Privacy Policy — Manu" };

export default function PrivacyPage() {
  return <main className="legal-page"><article>
    <p className="overline">MANU</p><h1>Privacy Policy</h1><p className="legal-updated">Effective 5 September 2026</p>
    <h2>What Manu processes</h2><p>Manu processes business configuration, manufacturing records, user account details, operational messages, and audit events supplied by a subscribing manufacturer. SMS content and phone numbers are processed only to coordinate the manufacturer’s requested operations.</p>
    <h2>How information is used</h2><p>Information is used to authenticate users, calculate production readiness, coordinate suppliers and staff, execute approved operational actions, provide support, prevent abuse, and maintain an auditable history. Manu does not sell personal information.</p>
    <h2>Service providers and AI</h2><p>Manu uses infrastructure, database, messaging, and AI service providers to operate the product. Operational truth and state transitions are determined by application services; AI is used for language interpretation, orchestration, and explanations.</p>
    <h2>Retention and security</h2><p>Tenant data is logically isolated. Secrets are stored outside source code, transport uses HTTPS, and operational changes are recorded. A subscribing business controls its retention requirements and may request export or deletion subject to legal and operational record-keeping obligations.</p>
    <h2>Your choices</h2><p>Authorized business administrators may correct configuration and contact details. Individuals may ask the relevant manufacturer to access, correct, or delete their information.</p>
    <h2>Contact</h2><p>Privacy questions may be sent to the project owner through the public repository linked from the Marketplace listing.</p>
  </article></main>;
}

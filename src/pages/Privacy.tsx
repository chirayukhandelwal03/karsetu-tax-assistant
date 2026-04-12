import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const Privacy = () => (
  <div className="min-h-screen bg-background">
    <Navbar />
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="font-heading font-bold text-3xl text-ink mb-8">Privacy Policy</h1>
      <div className="prose prose-sm text-ink-soft space-y-6">
        <p><strong>Last updated:</strong> April 2026</p>
        <h2 className="font-heading font-semibold text-lg text-ink">1. What We Collect</h2>
        <p>KarSetu.AI collects only what is needed for computation: uploaded documents (temporary), typed instructions (temporary), and assessee setup choices (type, AY, residency, age). No names, emails, passwords, or login credentials are collected.</p>
        <h2 className="font-heading font-semibold text-lg text-ink">2. How We Use Your Data</h2>
        <p>Your uploaded documents and instructions are sent to our AI engine solely for the purpose of computing your income tax liability. They are processed in memory and not stored permanently.</p>
        <h2 className="font-heading font-semibold text-lg text-ink">3. Data Retention</h2>
        <p>All uploaded documents and computation results are automatically deleted within 24 hours of your session. We do not maintain any permanent database of user computations or personal financial data.</p>
        <h2 className="font-heading font-semibold text-lg text-ink">4. Third-Party Services</h2>
        <p>We use Anthropic's Claude AI (via secure server-side API calls) to process your documents and compute taxes. Your documents are sent to Anthropic's API for processing. Anthropic's data handling policies apply to that processing.</p>
        <h2 className="font-heading font-semibold text-lg text-ink">5. No Cookies or Tracking</h2>
        <p>KarSetu.AI does not use cookies, analytics trackers, or any form of user tracking. We do not sell, share, or monetize your data in any way.</p>
        <h2 className="font-heading font-semibold text-lg text-ink">6. Security</h2>
        <p>All data transmission uses HTTPS encryption. API keys are stored securely on the server and never exposed to browser code. Documents are processed in isolated server environments.</p>
        <h2 className="font-heading font-semibold text-lg text-ink">7. Your Rights</h2>
        <p>Since we don't store your data permanently, there is nothing to delete. Your session data is automatically purged. If you have concerns, contact us at privacy@karsetu.info.</p>
        <h2 className="font-heading font-semibold text-lg text-ink">8. Changes</h2>
        <p>We may update this policy. Changes will be posted on this page with an updated date.</p>
      </div>
    </div>
    <Footer />
  </div>
);

export default Privacy;

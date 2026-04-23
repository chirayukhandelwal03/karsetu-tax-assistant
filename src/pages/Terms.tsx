import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useDocumentTitle } from "@/hooks/use-document-title";

const Terms = () => {
  useDocumentTitle(
    "Terms of Use — KarSetu.AI",
    "Terms for using KarSetu.AI: an AI-powered informational tool for Indian income tax computation.",
  );
  return (
  <div className="min-h-screen bg-background">
    <Navbar />
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="font-heading font-bold text-3xl text-ink mb-8">Terms of Use</h1>
      <div className="prose prose-sm text-ink-soft space-y-6">
        <p><strong>Last updated:</strong> 23 April 2026</p>
        <h2 className="font-heading font-semibold text-lg text-ink">1. Acceptance</h2>
        <p>By using KarSetu.AI, you agree to these terms. If you do not agree, please do not use the service.</p>
        <h2 className="font-heading font-semibold text-lg text-ink">2. Nature of Service</h2>
        <p>KarSetu.AI is an AI-powered informational tool that computes estimated income tax liability based on documents and instructions you provide. It is NOT a tax filing service, NOT a substitute for professional tax advice, and NOT connected to any government system.</p>
        <h2 className="font-heading font-semibold text-lg text-ink">3. Not Professional Advice</h2>
        <p>The computations provided by KarSetu.AI are for informational and planning purposes only. They do not constitute legal, financial, or professional tax advice. Always verify results with a qualified Chartered Accountant or Tax Practitioner before filing your Income Tax Return.</p>
        <h2 className="font-heading font-semibold text-lg text-ink">4. Accuracy Disclaimer</h2>
        <p>While KarSetu.AI strives for accuracy based on the Income Tax Act 1961 (as amended by Finance Act 2025), AI-generated computations may contain errors. Tax law is subject to interpretation, CBDT circulars, court orders, and amendments. We do not guarantee the accuracy, completeness, or applicability of any computation.</p>
        <h2 className="font-heading font-semibold text-lg text-ink">5. User Responsibility</h2>
        <p>You are responsible for the accuracy of documents and instructions you provide. You are responsible for verifying the computation before using it for any purpose. You accept all risk associated with relying on AI-generated tax computations.</p>
        <h2 className="font-heading font-semibold text-lg text-ink">6. No Liability</h2>
        <p>KarSetu.AI, its creators, and its affiliates shall not be liable for any direct, indirect, incidental, or consequential damages arising from your use of this service, including but not limited to incorrect tax computations, missed deductions, penalties, or interest from the Income Tax Department.</p>
        <h2 className="font-heading font-semibold text-lg text-ink">7. Free Service</h2>
        <p>KarSetu.AI is provided free of charge. We reserve the right to modify, suspend, or discontinue the service at any time without notice.</p>
        <h2 className="font-heading font-semibold text-lg text-ink">8. Governing Law</h2>
        <p>These terms are governed by the laws of India. Any disputes shall be subject to the jurisdiction of courts in India.</p>
        <h2 className="font-heading font-semibold text-lg text-ink">9. Contact</h2>
        <p>For questions about these terms, contact us at legal@karsetu.info.</p>
      </div>
    </div>
    <Footer />
  </div>
  );
};

export default Terms;

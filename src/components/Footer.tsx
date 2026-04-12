import { Link } from "react-router-dom";

const Footer = () => (
  <footer className="bg-white border-t border-border py-10 px-4">
    <div className="max-w-5xl mx-auto text-center space-y-4">
      <div className="flex items-center justify-center gap-0">
        <span className="font-heading font-bold text-lg text-ink">Kar</span>
        <span className="font-heading font-bold text-lg text-green-light">Setu</span>
        <span className="font-heading font-bold text-lg text-ink">.AI</span>
      </div>
      <p className="text-muted-text text-sm">Bridge to Tax Clarity</p>
      <div className="flex items-center justify-center gap-6 text-sm">
        <Link to="/privacy" className="text-blue-mid hover:underline">Privacy Policy</Link>
        <Link to="/terms" className="text-blue-mid hover:underline">Terms of Use</Link>
      </div>
      <p className="text-xs text-muted-text max-w-2xl mx-auto leading-relaxed">
        KarSetu.AI is an AI-powered tool for informational and tax planning purposes only. This is not legal, financial, or professional tax advice. Always verify with a qualified Chartered Accountant before filing your Income Tax Return. © 2026 KarSetu.AI
      </p>
    </div>
  </footer>
);

export default Footer;

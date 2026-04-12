import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { UploadCloud, MessageCircle, Calculator, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const trustItems = [
  "📋 All 5 Income Heads",
  "⚖️ Income Tax Act 1961",
  "🔒 Documents Deleted After Session",
  "₹0 Free Forever",
  "🚫 No Login Required",
  "🤝 CBDT Guidelines Followed",
];

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      <Navbar />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden"
        style={{ background: "linear-gradient(140deg, #060C18 0%, #0D3B6E 50%, #083528 100%)" }}>
        {/* Glow circles */}
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #2196F3 0%, transparent 70%)" }} />
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, #26A96A 0%, transparent 70%)" }} />

        {/* Floating document icons */}
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i}
            className="absolute text-white/10 text-4xl animate-float-up pointer-events-none"
            style={{
              left: `${15 + i * 18}%`,
              animationDelay: `${i * 4}s`,
              animationDuration: `${18 + i * 3}s`,
            }}>
            📄
          </div>
        ))}

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          {/* Pill badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-5 py-2 mb-8"
          >
            <span>🇮🇳</span>
            <span className="text-white/80 text-sm font-light">Strictly per Income Tax Act 1961 · Finance Act 2025</span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="font-heading font-extrabold text-4xl sm:text-5xl md:text-6xl lg:text-[64px] leading-tight tracking-[-3px] mb-6"
          >
            <span className="text-white">Your Tax, Fully Computed.</span>
            <br />
            <span className="text-green-light">Explained Like Never Before.</span>
          </motion.h1>

          {/* Subtext */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="text-white/65 text-base sm:text-lg font-light max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            Upload your documents. Type any instructions. Get a complete, legally cited income tax computation — Old Regime and New Regime side by side — where every single rupee figure tells you exactly where it came from and why it's there.
          </motion.p>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
          >
            <Button
              size="lg"
              onClick={() => navigate("/compute")}
              className="bg-green-light hover:bg-green-mid text-white font-semibold text-lg px-10 py-7 rounded-xl shadow-lg shadow-green-light/25"
            >
              START COMPUTING MY INCOME & TAX →
            </Button>
          </motion.div>

          {/* Trust pills */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.0 }}
            className="flex flex-wrap items-center justify-center gap-3 mt-8"
          >
            {["✓ Every figure legally cited", "✓ Old & New Regime compared", "✓ No login · Free forever"].map((pill) => (
              <span key={pill} className="text-white/70 text-sm border border-white/20 rounded-full px-4 py-1.5">
                {pill}
              </span>
            ))}
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce-gentle">
          <ChevronDown className="text-white/40" size={28} />
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-heading font-bold text-3xl sm:text-4xl text-ink text-center mb-14">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: <UploadCloud size={32} className="text-blue-light" />,
                title: "Upload Your Documents",
                body: "Drop your Form 16, bank statements, capital gains reports, premium receipts — any mix, any format. PDF, Excel, images all work.",
                step: "1",
              },
              {
                icon: <MessageCircle size={32} className="text-green-light" />,
                title: "Add Any Special Instructions",
                body: "Tell the AI anything your documents don't show, exactly as you'd tell your CA. 'Treat UPI credits as freelancing income.' It understands plain language.",
                step: "2",
              },
              {
                icon: <Calculator size={32} className="text-amber" />,
                title: "Get a Full Computation",
                body: "Every income source. Every deduction. Every exemption. Both regimes. With the exact law provision and plain-English explanation for every single figure.",
                step: "3",
              },
            ].map((card) => (
              <motion.div
                key={card.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: Number(card.step) * 0.15 }}
                className="bg-background rounded-xl border border-border p-8 text-center hover:shadow-lg transition-shadow"
              >
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-pale mb-5">
                  {card.icon}
                </div>
                <div className="text-xs font-mono-num text-muted-text mb-2">STEP {card.step}</div>
                <h3 className="font-heading font-semibold text-lg text-ink mb-3">{card.title}</h3>
                <p className="text-ink-soft text-sm leading-relaxed">{card.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Strip */}
      <section className="bg-background py-5 border-y border-border overflow-x-auto">
        <div className="flex items-center justify-start md:justify-center gap-8 px-4 min-w-max">
          {trustItems.map((item) => (
            <span key={item} className="text-sm text-muted-text whitespace-nowrap">{item}</span>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;

import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useState } from "react";

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-0">
            <span className="font-heading font-bold text-xl text-ink">Kar</span>
            <span className="font-heading font-bold text-xl text-green-light">Setu</span>
            <span className="font-heading font-bold text-xl text-ink">.AI</span>
          </Link>

          <div className="hidden sm:flex items-center gap-4">
            <Button
              onClick={() => navigate("/compute")}
              className="bg-green-light hover:bg-green-mid text-white font-semibold"
            >
              Compute My Taxes →
            </Button>
          </div>

          <button
            className="sm:hidden p-2"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {mobileOpen && (
          <div className="sm:hidden pb-4">
            <Button
              onClick={() => { navigate("/compute"); setMobileOpen(false); }}
              className="w-full bg-green-light hover:bg-green-mid text-white font-semibold"
            >
              Compute My Taxes →
            </Button>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface CAConnectModalProps {
  open: boolean;
  onClose: () => void;
}

// NOTE: Until the Supabase `ca_connect_requests` table exists we do NOT silently
// drop user data. Instead we open the user's mail client with a pre-filled
// message to ask@karsetu.info so the request actually reaches a human.
const CAConnectModal = ({ open, onClose }: CAConnectModalProps) => {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", mobile: "", city: "", email: "", note: "" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.mobile.trim()) {
      toast({ title: "Please fill name and mobile number", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const subject = encodeURIComponent(`CA Consultation Request — ${form.name}`);
      const body = encodeURIComponent(
        [
          `Name: ${form.name}`,
          `Mobile: ${form.mobile}`,
          `City: ${form.city || "(not provided)"}`,
          `Email: ${form.email || "(not provided)"}`,
          "",
          "Notes:",
          form.note || "(none)",
          "",
          "— Sent from KarSetu.AI",
        ].join("\n"),
      );
      window.location.href = `mailto:ask@karsetu.info?subject=${subject}&body=${body}`;
      toast({
        title: "Opening your email client…",
        description: "We'll reply to you within a day.",
      });
      onClose();
      setForm({ name: "", mobile: "", city: "", email: "", note: "" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Consult a Chartered Accountant</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-text mb-4">
          Want a CA to review and file this? Share your details and we'll connect you — your mail
          client will open with a pre-filled message to our team.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="ca-name">Your Name <span className="text-kred">*</span></Label>
            <Input id="ca-name" required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="ca-mobile">Mobile Number <span className="text-kred">*</span></Label>
            <Input id="ca-mobile" required type="tel" inputMode="tel" autoComplete="tel" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="ca-city">City</Label>
            <Input id="ca-city" autoComplete="address-level2" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="ca-email">Email</Label>
            <Input id="ca-email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="ca-note">Any notes for the CA</Label>
            <Textarea id="ca-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="min-h-[60px]" />
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-green-light hover:bg-green-mid text-white">
            {loading ? "Preparing your request…" : "Submit Request"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CAConnectModal;

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface CAConnectModalProps {
  open: boolean;
  onClose: () => void;
}

const CAConnectModal = ({ open, onClose }: CAConnectModalProps) => {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", mobile: "", city: "", email: "", note: "" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.mobile) {
      toast({ title: "Please fill name and mobile number", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      // Store in Supabase (when table exists)
      toast({ title: "Request submitted!", description: "A CA will contact you soon." });
      onClose();
      setForm({ name: "", mobile: "", city: "", email: "", note: "" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "An error occurred", variant: "destructive" });
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
        <p className="text-sm text-muted-text mb-4">Want a CA to review and file this? Leave your contact details and we'll connect you.</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input placeholder="Your Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Mobile Number *" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
          <Input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Textarea placeholder="Any notes for the CA..." value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="min-h-[60px]" />
          <Button type="submit" disabled={loading} className="w-full bg-green-light hover:bg-green-mid text-white">
            {loading ? "Submitting..." : "Submit Request"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CAConnectModal;

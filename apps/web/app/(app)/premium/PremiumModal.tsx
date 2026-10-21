import { useCallback, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import Pricing from "@/app/(app)/premium/Pricing";
import { tiers } from "@/app/(app)/premium/config";

const modalTiers = tiers.filter((tier) => tier.name !== "Enterprise");

function PricingDialogHeader() {
  return (
    <div className="mb-4 text-center">
      <h2 className="font-title text-2xl text-gray-900">Upgrade to Premium</h2>
    </div>
  );
}

export function usePremiumModal() {
  const [isOpen, setIsOpen] = useState(false);

  const openModal = useCallback(() => setIsOpen(true), []);

  const PremiumModal = useCallback(() => {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        {/* premium upgrade doesn't support dark mode yet as it appears on homepage */}
        <DialogContent className="max-w-6xl bg-white">
          <Pricing
            header={<PricingDialogHeader />}
            displayTiers={modalTiers}
            className="px-0 pt-0 lg:px-0"
          />
        </DialogContent>
      </Dialog>
    );
  }, [isOpen]);

  return {
    openModal,
    PremiumModal,
  };
}

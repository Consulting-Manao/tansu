import { StrKey } from "@stellar/stellar-sdk";
import { badgesQuery, setBadges } from "@service/ProjectService";
import { queryClient } from "@service/queryClient";
import Button from "components/utils/Button";
import Modal from "components/utils/Modal";
import { Badge, type Badges } from "../../../../packages/tansu";
import { useRef, useState } from "react";
import { toast } from "utils/utils";

const badgeOptions: { label: string; value: Badge }[] = [
  { label: "Developer", value: Badge.Developer },
  { label: "Triage", value: Badge.Triage },
  { label: "Community", value: Badge.Community },
];

/** The badges `address` holds, from the project's lists. */
const heldBadges = (badges: Badges, address: string): Badge[] =>
  (
    [
      [badges.developer, Badge.Developer],
      [badges.triage, Badge.Triage],
      [badges.community, Badge.Community],
      [badges.verified, Badge.Verified],
    ] as const
  ).flatMap(([holders, badge]) => (holders.includes(address) ? [badge] : []));

/**
 * For maintainers: set a member's badges in the project. Setting replaces
 * them all, so the dialog starts from those the member holds now.
 */
const AddBadgeModal = ({ projectName }: { projectName: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [memberAddress, setMemberAddress] = useState("");
  const [selectedBadges, setSelectedBadges] = useState<Badge[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // The address whose badges are loaded, or why they could not be.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRun = useRef(0);

  const loadBadges = async (address: string) => {
    const run = ++loadRun.current;
    setLoadedFor(null);
    setLoadError(null);
    setSelectedBadges([]);
    if (!StrKey.isValidEd25519PublicKey(address)) return;
    try {
      const badges = await queryClient.query({
        ...badgesQuery(projectName),
        staleTime: 0,
      });
      if (run !== loadRun.current) return;
      setSelectedBadges(heldBadges(badges, address));
      setLoadedFor(address);
    } catch (error: any) {
      if (run === loadRun.current) setLoadError(error.message);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleToggleBadge = (badge: Badge) => {
    setSelectedBadges((prev) =>
      prev.includes(badge) ? prev.filter((b) => b !== badge) : [...prev, badge],
    );
  };

  const handleSave = async () => {
    if (loadedFor !== memberAddress) return;
    setIsLoading(true);
    try {
      await setBadges(projectName, memberAddress, selectedBadges);
      toast.success("Member badges", "The member's badges are saved.");
      setMemberAddress("");
      setLoadedFor(null);
      setSelectedBadges([]);
      setIsOpen(false);
    } catch (err: any) {
      toast.error("Member badges", err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        id="badge-button"
        className="inline-flex items-center gap-2 px-2 py-1.5 sm:px-3 sm:py-2 min-w-0 flex-1 sm:flex-initial rounded-lg border border-zinc-200 bg-white text-primary text-sm font-medium shadow-[var(--shadow-card)] hover:bg-zinc-50 hover:border-zinc-300 transition-colors cursor-pointer text-left whitespace-nowrap"
        onClick={() => setIsOpen(true)}
      >
        <img
          src="/icons/plus-fill.svg"
          className="w-5 h-5 flex-shrink-0"
          alt=""
        />
        <span>Add badge</span>
      </button>
      {isOpen && (
        <Modal onClose={handleClose}>
          <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-[18px]">
            <img
              alt=""
              src="/images/scan.svg"
              className="w-16 h-16 sm:w-auto sm:h-auto mx-auto sm:mx-0"
            />
            <div className="flex-grow flex flex-col gap-6 sm:gap-9 w-full">
              <h6 className="text-xl sm:text-2xl font-medium text-primary text-center sm:text-left">
                Member badges
              </h6>
              <div className="flex flex-col gap-4 sm:gap-[18px]">
                <label className="flex flex-col gap-2 sm:gap-3 text-sm sm:text-base font-[600] text-primary">
                  Member address
                  <input
                    type="text"
                    className="p-3 sm:p-[18px] border border-[#978AA1] outline-none w-full text-sm sm:text-base font-normal"
                    placeholder="Member address as G..."
                    value={memberAddress}
                    onChange={(e) => {
                      const address = e.target.value.trim();
                      setMemberAddress(address);
                      loadBadges(address);
                    }}
                    required
                  />
                </label>
                {loadError && (
                  <div
                    role="alert"
                    className="flex flex-col gap-2 text-sm text-red-600"
                  >
                    <p>Could not read the member's badges: {loadError}</p>
                    <Button
                      type="secondary"
                      size="sm"
                      onClick={() => loadBadges(memberAddress)}
                    >
                      Retry
                    </Button>
                  </div>
                )}
                <div className="flex flex-col gap-2 sm:gap-3">
                  <p className="text-sm sm:text-base font-[600] text-primary">
                    Badges
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {badgeOptions.map((opt) => (
                      <label
                        key={opt.value}
                        className="flex gap-2 items-center text-sm sm:text-base text-primary"
                      >
                        <input
                          type="checkbox"
                          checked={selectedBadges.includes(opt.value)}
                          disabled={loadedFor !== memberAddress}
                          onChange={() => handleToggleBadge(opt.value)}
                          className="w-4 h-4"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end mt-2 sm:mt-0">
                  <Button
                    onClick={handleSave}
                    isLoading={isLoading}
                    disabled={isLoading || loadedFor !== memberAddress}
                    className="w-full sm:w-auto"
                  >
                    Save badges
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

export default AddBadgeModal;

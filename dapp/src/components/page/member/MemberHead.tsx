import { useStore } from "@nanostores/react";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { disconnect } from "@service/walletService";
import { Button, CopyButton, ProofChip, Skeleton } from "components/ui";
import { withErrorBoundary } from "components/utils/ErrorBoundary";
import { getIpfsBasicLink } from "utils/ipfsFunctions";
import { clearIpfsMisses } from "utils/ipfsMissCache";
import { openModal } from "utils/modals";
import { connectedPublicKey } from "utils/store";
import { getStellarExpertUrl, memberAddressFromUrl } from "utils/urls";
import { truncateMiddle } from "utils/utils";
import { useMemberProfile } from "./useMemberProfile";

const ProfileModal = lazy(() => import("../dashboard/ProfileModal"));

const link =
  "text-link underline-offset-2 hover:underline focus-visible:underline";

/** The member page's head, on the band: who they are and how they prove it. */
const MemberHead = () => {
  const address = memberAddressFromUrl();
  const publicKey = useStore(connectedPublicKey);
  const isSelf = !!address && publicKey === address;
  const [isEditing, setIsEditing] = useState(false);
  const {
    memberRead,
    member,
    cid,
    profileRead,
    profile,
    pictureRead,
    picture,
    pictureUrl,
    onPictureError,
    gitKeyListed,
    unreadable,
  } = useMemberProfile(address);

  const leave = () => {
    disconnect();
    window.location.href = "/";
  };
  const name = profileRead.isLoading
    ? "Loading profile…"
    : profile?.name || "Anonymous";
  const head = (avatar: ReactNode, title: string, children: ReactNode) => (
    <div className="flex max-w-[760px] flex-col gap-4 sm:gap-5">
      <div className="flex items-center gap-4 sm:gap-6">
        {avatar}
        <h1 className="min-w-0 text-section font-extrabold tracking-[-0.02em] break-words text-band-ink sm:text-title">
          {title}
        </h1>
      </div>
      <p className="flex flex-wrap items-center gap-2 font-mono text-small text-band-muted">
        <span title={address}>{truncateMiddle(address, 20)}</span>
        <CopyButton textToCopy={address} size="sm" />
        <a
          href={getStellarExpertUrl(address)}
          target="_blank"
          rel="noopener noreferrer"
          className={`font-ui ${link}`}
        >
          Stellar Expert
        </a>
      </p>
      {children}
    </div>
  );
  const initial = (letter: string) => (
    <span
      aria-hidden="true"
      className="flex size-16 shrink-0 items-center justify-center rounded-full bg-accent-soft text-section font-extrabold text-accent-ink sm:size-24 sm:text-title"
    >
      {letter}
    </span>
  );

  if (memberRead.isPending && address) {
    return head(initial(""), "", <Skeleton className="h-5 w-1/2" />);
  }
  if (!member) {
    return head(
      initial("?"),
      "Not a member yet",
      <>
        <p className="text-band-muted">This address has not joined Tansu.</p>
        {isSelf && (
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => openModal("join", {})}>Join Tansu</Button>
            <Button tone="ghost" onClick={leave}>
              Disconnect
            </Button>
          </div>
        )}
      </>,
    );
  }

  return head(
    pictureUrl ? (
      <img
        src={pictureUrl}
        alt=""
        onError={onPictureError}
        className="size-16 shrink-0 rounded-full object-cover shadow-float sm:size-24"
      />
    ) : (
      initial(profileRead.isLoading ? "" : name.slice(0, 1).toUpperCase())
    ),
    name,
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {member.git_identity ? (
          <ProofChip
            hash={member.git_identity}
            full
            tone={gitKeyListed.data ? "verified" : "pending"}
          >
            {gitKeyListed.data
              ? "Verified"
              : gitKeyListed.isSuccess
                ? "Self-declared"
                : "Signed with its SSH key"}
          </ProofChip>
        ) : (
          <span className="text-small text-band-muted">
            No Git handle linked
          </span>
        )}
        {profile?.social && (
          <a
            href={profile.social}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-small ${link}`}
          >
            {profile.social.replace(/^https?:\/\//, "")}
          </a>
        )}
        {cid && profile && (
          <a
            href={getIpfsBasicLink(cid)}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-small ${link}`}
          >
            View on IPFS
          </a>
        )}
      </div>
      {isSelf && unreadable && (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-small text-danger">
            Your profile could not be read, so it cannot be edited yet.
          </p>
          <Button
            tone="secondary"
            size="sm"
            onClick={() => {
              // A remembered miss would answer at once, for a day.
              clearIpfsMisses(cid);
              profileRead.refetch();
              pictureRead.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      )}
      {isSelf && (
        <div className="flex flex-wrap gap-3">
          <Button
            tone="secondary"
            onClick={() => setIsEditing(true)}
            disabled={unreadable || (!!cid && !pictureRead.isSuccess)}
          >
            Edit profile
          </Button>
          <Button tone="ghost" onClick={leave}>
            Disconnect
          </Button>
        </div>
      )}
      {isEditing && (
        <Suspense fallback={null}>
          <ProfileModal
            mode="edit"
            onClose={() => setIsEditing(false)}
            initialProfile={profile}
            currentPicture={picture ? { cid, file: picture } : null}
          />
        </Suspense>
      )}
    </>,
  );
};

export default withErrorBoundary(MemberHead);

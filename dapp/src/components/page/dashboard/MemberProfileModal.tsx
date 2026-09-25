import type { FC } from "react";
import { useState, lazy, Suspense } from "react";
import { useStore } from "@nanostores/react";
import { useQueries, useQuery } from "@tanstack/react-query";

const ProfileModal = lazy(() => import("./ProfileModal"));
import Modal from "components/utils/Modal";
import Button from "components/utils/Button";
import { getIpfsBasicLink, getIpfsUrl, ipfsQuery } from "utils/ipfsFunctions";
import { isValidCid } from "utils/contentHashes";
import { clearIpfsMisses } from "utils/ipfsMissCache";
import Markdown from "components/utils/Markdown";
import { connectedPublicKey } from "../../../utils/store";
import {
  gitKeyListedQuery,
  memberQuery,
  parseProfile,
  profilePictureQuery,
} from "@service/MemberService";
import { disconnect } from "@service/walletService";
import { openModal } from "utils/modals";
import { projectByKeyQuery } from "@service/ProjectService";
import { queryClient } from "@service/queryClient";
import { navigate } from "astro:transitions/client";
import { Buffer } from "buffer";
import OnChainActions from "./OnChainActions";
import { badgeName } from "../../../utils/badges";
import AddressDisplay from "../proposal/AddressDisplay"; // use existing component
import { projectUrl } from "utils/urls";
import Loading from "components/utils/Loading";

interface Props {
  /** The member's Stellar address. */
  address: string;
  onClose: () => void;
}

const MemberProfileModal: FC<Props> = ({ onClose, address }) => {
  const memberRead = useQuery(memberQuery(address), queryClient);
  const member = memberRead.data ?? null;
  const projectReads = useQueries(
    {
      queries: (member?.projects ?? []).map(({ project }) =>
        projectByKeyQuery(Buffer.from(project).toString("hex")),
      ),
    },
    queryClient,
  );
  const projectsWithNames = (member?.projects ?? []).map((project, index) => ({
    name: projectReads[index]?.data?.name ?? "Unknown Project",
    badges: project.badges,
    projectId: project.project,
  }));

  // The profile and its picture: an edit keeps what it does not change, so
  // it waits for both. The dialog shows what the chain says meanwhile.
  const cid = member && isValidCid(member.meta) ? member.meta : "";
  const profileRead = useQuery(
    {
      ...ipfsQuery(cid, "/profile.json"),
      select: parseProfile,
      enabled: !!cid,
    },
    queryClient,
  );
  const profileData = profileRead.data ?? null;
  const pictureRead = useQuery(
    {
      ...profilePictureQuery(cid, profileData?.image),
      enabled: profileRead.isSuccess,
    },
    queryClient,
  );
  const picture = pictureRead.data ?? null;
  const [pictureFailed, setPictureFailed] = useState(false);
  const profileImageUrl =
    picture && !pictureFailed ? getIpfsUrl(cid, picture) : "";
  const isLoading = profileRead.isLoading;
  // A Git key the account lists now; the contract only checks the signature.
  const gitKeyListed = useQuery(
    {
      ...gitKeyListedQuery(
        member?.git_identity ?? "",
        member?.git_pubkey ?? new Uint8Array(),
      ),
      enabled: !!member?.git_identity && !!member.git_pubkey,
    },
    queryClient,
  );
  const profileUnreadable = profileRead.isError || pictureRead.isError;
  const [showEditModal, setShowEditModal] = useState(false);

  const memberAddress = address;

  const navigateToProject = (projectName: string) => {
    navigate(projectUrl(projectName));
  };

  // Get the initial letter for the avatar
  const getInitialLetter = (name: string | undefined): string => {
    if (!name || name === "Anonymous") return "A";
    return name.charAt(0).toUpperCase();
  };

  const publicKey = useStore(connectedPublicKey);

  // Handle disconnect button click
  const handleDisconnect = () => {
    disconnect();
    onClose();
    // Force reload and navigate to main page
    window.location.href = "/";
  };

  const handleRegister = () => {
    onClose();
    openModal("join", {});
  };

  if (memberRead.isPending) {
    return (
      <Modal onClose={onClose}>
        <div className="flex items-center justify-center py-10">
          <Loading />
        </div>
      </Modal>
    );
  }

  // If member is null, show registration message
  if (!member) {
    return (
      <Modal onClose={onClose}>
        <div className="flex flex-col gap-4 w-full max-w-xs sm:max-w-sm md:max-w-md mx-auto">
          <h2 className="text-xl font-bold text-primary text-center">
            Member Not Registered
          </h2>

          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-zinc-200 flex items-center justify-center">
              <span className="text-3xl text-zinc-500">❓</span>
            </div>

            {memberAddress && <AddressDisplay address={memberAddress} />}

            <div className="text-center mt-1">
              <p className="text-sm sm:text-base text-secondary mb-1">
                This member hasn't registered on the platform yet.
              </p>
              <p className="text-sm sm:text-base text-secondary">
                To participate in the community, please register first.
              </p>
            </div>

            <div className="flex w-full justify-between gap-2 sm:gap-3 mt-3">
              <Button
                type="primary"
                onClick={handleRegister}
                className="w-full"
              >
                Register Now
              </Button>

              {publicKey === memberAddress && (
                <Button
                  type="primary"
                  onClick={handleDisconnect}
                  className="bg-red-500 text-white hover:bg-red-600 w-full border-0"
                >
                  Disconnect
                </Button>
              )}
            </div>
          </div>
        </div>
      </Modal>
    );
  }

  // If member exists, proceed with normal rendering
  const noBadges =
    projectsWithNames.length === 0 ||
    projectsWithNames.every((p) => p.badges.length === 0);

  return (
    <>
      <Modal onClose={onClose} fullWidth>
        <div className="flex flex-col md:flex-row gap-6 md:gap-8 w-full">
          <div className="flex flex-col items-center gap-3 sm:gap-4 md:w-1/3">
            {/* Profile Image */}
            {profileImageUrl ? (
              <img
                src={profileImageUrl}
                alt={profileData?.name || "Profile"}
                className="w-24 h-24 md:w-32 md:h-32 rounded-full object-cover border-3 border-primary"
                onError={() => setPictureFailed(true)}
              />
            ) : (
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-indigo-100 flex items-center justify-center">
                <span className="text-3xl md:text-4xl font-semibold text-indigo-700">
                  {!isLoading && getInitialLetter(profileData?.name)}
                </span>
              </div>
            )}

            {/* Name and Address */}
            <div className="text-center w-full">
              <h3 className="text-xl sm:text-2xl font-semibold text-primary">
                {isLoading
                  ? "Loading profile…"
                  : profileData?.name || "Anonymous"}
              </h3>

              {memberAddress && <AddressDisplay address={memberAddress} />}

              {profileData?.social && (
                <a
                  href={profileData.social}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm sm:text-base text-blue-500 hover:underline mt-2 block"
                >
                  {profileData.social.replace(/^https?:\/\//, "")}
                </a>
              )}

              {/* Git Identity */}
              {member?.git_identity ? (
                <div className="flex items-center justify-center gap-1.5 mt-2">
                  <span className="text-sm font-medium text-primary">
                    Git: {member.git_identity}
                  </span>
                  {gitKeyListed.data ? (
                    <span
                      title="The account lists this key"
                      className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"
                    >
                      Verified
                    </span>
                  ) : gitKeyListed.isSuccess ? (
                    <span
                      title="The key signed the link; no host lists it for this account"
                      className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-secondary"
                    >
                      Self-declared
                    </span>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-secondary text-center mt-2">
                  No Git handle linked
                </p>
              )}

              {/* IPFS metadata link */}
              {cid && profileData && (
                <a
                  href={getIpfsBasicLink(member.meta)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1 text-sm sm:text-base text-blue-500 hover:underline mt-2"
                >
                  <img
                    src="/icons/ipfs.svg"
                    alt="IPFS"
                    width={16}
                    height={16}
                  />
                  <span>View on IPFS</span>
                </a>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex w-full flex-col gap-2 sm:gap-3 mt-2 sm:mt-4">
              {publicKey === memberAddress && profileUnreadable && (
                <div role="alert" className="flex flex-col gap-2 text-sm">
                  <p className="text-red-600">
                    Your profile could not be read, so it cannot be edited yet.
                  </p>
                  <Button
                    type="secondary"
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
              {publicKey === memberAddress && (
                <Button
                  type="primary"
                  onClick={() => setShowEditModal(true)}
                  disabled={
                    profileUnreadable || (!!cid && !pictureRead.isSuccess)
                  }
                  className="w-full"
                >
                  Edit Profile
                </Button>
              )}
              {publicKey === memberAddress && (
                <Button
                  type="primary"
                  onClick={handleDisconnect}
                  className="bg-red-500 text-white hover:bg-red-600 w-full border-0"
                >
                  Disconnect
                </Button>
              )}
            </div>
          </div>

          <div className="md:w-2/3 flex flex-col gap-4">
            {/* Description - Only show if exists */}
            {profileData?.description && (
              <div className="w-full">
                <h4 className="text-base sm:text-lg font-semibold text-primary mb-1 sm:mb-2">
                  About
                </h4>
                <Markdown
                  className="bg-zinc-50 p-3 sm:p-4 rounded"
                  baseUrl={getIpfsBasicLink(member.meta)}
                >
                  {profileData.description}
                </Markdown>
              </div>
            )}

            {/* Engagement Section (previously Badges) */}
            <div className="w-full">
              <h4 className="text-base sm:text-lg font-semibold text-primary mb-1 sm:mb-2">
                Community Engagements
              </h4>
              {noBadges ? (
                <p className="text-sm sm:text-base text-secondary">
                  No community engagement with any projects yet
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto">
                  {projectsWithNames.map((proj, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-zinc-50 cursor-pointer hover:bg-zinc-100 transition-colors rounded"
                      onClick={() => navigateToProject(proj.name)}
                    >
                      <p className="font-medium text-primary mb-2 text-sm sm:text-base text-center">
                        {proj.name}
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {Array.from(new Set(proj.badges)).map((b) => (
                          <span
                            key={b}
                            className="px-2 py-0.5 sm:px-3 sm:py-1 bg-primary text-white text-xs sm:text-sm rounded"
                          >
                            {badgeName(b)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* On-chain Actions List */}
            {address && (
              <div className="mt-6">
                <h4 className="text-base sm:text-lg font-semibold text-primary mb-1 sm:mb-2">
                  On-chain Activity
                </h4>
                <OnChainActions
                  address={address}
                  projectNames={Object.fromEntries(
                    projectsWithNames.map((p) => [
                      Buffer.from(p.projectId).toString("hex"),
                      p.name,
                    ]),
                  )}
                />
              </div>
            )}
          </div>
        </div>
      </Modal>

      {showEditModal && (
        <Suspense fallback={null}>
          <ProfileModal
            mode="edit"
            onClose={() => setShowEditModal(false)}
            initialProfile={profileData}
            currentPicture={picture ? { cid, file: picture } : null}
          />
        </Suspense>
      )}
    </>
  );
};

export default MemberProfileModal;

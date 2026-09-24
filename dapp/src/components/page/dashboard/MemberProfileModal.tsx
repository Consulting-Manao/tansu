import type { FC } from "react";
import { useState, useEffect, lazy, Suspense } from "react";
import { useStore } from "@nanostores/react";
import { useQueries, useQuery } from "@tanstack/react-query";

const EditProfileModal = lazy(() => import("./EditProfileModal"));
import Modal from "components/utils/Modal";
import Button from "components/utils/Button";
import { getIpfsBasicLink, ipfsQuery } from "utils/ipfsFunctions";
import Markdown from "markdown-to-jsx";
import { connectedPublicKey } from "../../../utils/store";
import { memberQuery } from "@service/MemberService";
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

interface Props {
  /** The member's Stellar address. */
  address: string;
  onClose: () => void;
}

interface ProfileData {
  name: string;
  description: string;
  social: string;
  image?: string; // optional path to profile image inside the IPFS directory
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

  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [profileImageUrl, setProfileImageUrl] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [hasValidMetadata, setHasValidMetadata] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const memberAddress = address;

  const navigateToProject = (projectName: string) => {
    navigate(projectUrl(projectName));
  };

  useEffect(() => {
    const fetchProfileData = async () => {
      // Check if member exists and has valid metadata
      if (
        member &&
        member.meta &&
        typeof member.meta === "string" &&
        member.meta.trim() &&
        member.meta.trim() !== " "
      ) {
        try {
          setIsLoading(true);

          // Validate that meta is a proper IPFS CID before attempting to fetch
          const validCidPattern = /^(bafy|Qm)[a-zA-Z0-9]{44,}$/;
          if (!validCidPattern.test(member.meta)) {
            // Invalid CID format, nothing to fetch
            setIsLoading(false);
            return;
          }

          const ipfsUrl = getIpfsBasicLink(member.meta);

          // Fetch profile.json
          try {
            const profileText = await queryClient.query(
              ipfsQuery(member.meta, "/profile.json"),
            );
            const profileData = profileText ? JSON.parse(profileText) : null;

            if (profileData) {
              setProfileData(profileData);
              setHasValidMetadata(true);

              // Determine profile image path
              if (
                profileData.image &&
                typeof profileData.image === "string" &&
                ipfsUrl
              ) {
                setProfileImageUrl(`${ipfsUrl}/${profileData.image}`);
              }
            }
          } catch {
            // Silent failure - this is an expected case for missing profile data
          }

          // If not already set from profile.json, try the standard file name pattern
          if (!profileImageUrl && ipfsUrl) {
            const exts = ["png", "jpg", "jpeg"];
            let found = false;
            exts.forEach((ext, idx) => {
              const candidate = `${ipfsUrl}/profile-image.${ext}`;
              // First extension becomes optimistic default so the UI loads quickly
              if (idx === 0) setProfileImageUrl(candidate);

              const img = new Image();
              img.src = candidate;
              img.onload = () => {
                if (!found) {
                  found = true;
                  setProfileImageUrl(candidate);
                }
              };
              img.onerror = () => {
                // Silently handle 404 errors - profile images are optional
                if (idx === exts.length - 1 && !found) {
                  // If this was the last extension and no image found, clear the URL
                  setProfileImageUrl("");
                }
              };
            });
          }
        } catch {
          // Silent error handling
        } finally {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    };

    if (member) {
      fetchProfileData();
    } else {
      setIsLoading(false);
    }
  }, [member]);

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
    openModal("join", { prefillAddress: memberAddress });
  };

  if (memberRead.isPending) {
    return (
      <Modal onClose={onClose}>
        <div className="flex items-center justify-center py-10">
          <img src="/images/loading.svg" className="w-12 animate-spin" />
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
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <div>
              <img src="/images/loading.svg" className="w-12 animate-spin" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-6 md:gap-8 w-full">
            <div className="flex flex-col items-center gap-3 sm:gap-4 md:w-1/3">
              {/* Profile Image */}
              {profileImageUrl ? (
                <img
                  src={profileImageUrl}
                  alt={profileData?.name || "Profile"}
                  className="w-24 h-24 md:w-32 md:h-32 rounded-full object-cover border-3 border-primary"
                  onError={() => {
                    // If image fails to load, just hide it and show fallback
                    setProfileImageUrl("");
                  }}
                />
              ) : (
                <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-indigo-100 flex items-center justify-center">
                  <span className="text-3xl md:text-4xl font-semibold text-indigo-700">
                    {getInitialLetter(profileData?.name)}
                  </span>
                </div>
              )}

              {/* Name and Address */}
              <div className="text-center w-full">
                <h3 className="text-xl sm:text-2xl font-semibold text-primary">
                  {profileData?.name || "Anonymous"}
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
                    <svg
                      className="h-4 w-4 text-green-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-sm font-medium text-green-700">
                      Git: {member.git_identity}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                      Verified
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-secondary text-center mt-2">
                    No Git handle linked
                  </p>
                )}

                {/* IPFS metadata link */}
                {member?.meta && hasValidMetadata && (
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
                {publicKey === memberAddress && (
                  <Button
                    type="primary"
                    onClick={() => setShowEditModal(true)}
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
                  <div className="prose prose-sm sm:prose-base max-w-none text-secondary bg-zinc-50 p-3 sm:p-4 rounded">
                    <Markdown
                      options={{
                        overrides: {
                          p: { props: { className: "text-secondary mb-2" } },
                          a: {
                            props: {
                              className: "text-blue-500 hover:underline",
                            },
                          },
                          h1: {
                            props: {
                              className: "text-xl font-bold text-primary mb-2",
                            },
                          },
                          h2: {
                            props: {
                              className: "text-lg font-bold text-primary mb-2",
                            },
                          },
                          h3: {
                            props: {
                              className:
                                "text-base font-bold text-primary mb-2",
                            },
                          },
                          ul: {
                            props: {
                              className: "list-disc ml-5 text-secondary",
                            },
                          },
                          ol: {
                            props: {
                              className: "list-decimal ml-5 text-secondary",
                            },
                          },
                        },
                      }}
                    >
                      {profileData.description}
                    </Markdown>
                  </div>
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
        )}
      </Modal>

      {showEditModal && (
        <Suspense fallback={null}>
          <EditProfileModal
            onClose={() => setShowEditModal(false)}
            onUpdated={() => setShowEditModal(false)}
            initialProfile={profileData}
          />
        </Suspense>
      )}
    </>
  );
};

export default MemberProfileModal;

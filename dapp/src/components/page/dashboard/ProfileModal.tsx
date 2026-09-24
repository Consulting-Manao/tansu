import { useStore } from "@nanostores/react";
import { useRef, useState, type FC } from "react";
import { joinCommunity, updateMember } from "@service/MemberService";
import { connect } from "@service/walletService";
import Button from "components/utils/Button";
import FlowProgressModal from "components/utils/FlowProgressModal";
import Input from "components/utils/Input";
import SimpleMarkdownEditor from "components/utils/SimpleMarkdownEditor";
import { connectedPublicKey } from "utils/store";
import { validateUrl } from "utils/validations";
import GitVerification, { type GitIdentityData } from "./GitVerification";

export interface ProfileData {
  name: string;
  description: string;
  social: string;
  image?: string;
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Join the community, or edit one's profile: a name, a link, a picture and a
 * description, kept on IPFS. Joining can also bind a Git handle, and connects
 * a wallet first when there is none.
 */
const ProfileModal: FC<{
  mode: "join" | "edit";
  onClose: () => void;
  /** Where an edit starts from. */
  initialProfile?: ProfileData | null;
}> = ({ mode, onClose, initialProfile }) => {
  const isJoining = mode === "join";
  const publicKey = useStore(connectedPublicKey);

  const [name, setName] = useState(initialProfile?.name ?? "");
  const [social, setSocial] = useState(initialProfile?.social ?? "");
  const [description, setDescription] = useState(
    initialProfile?.description ?? "",
  );
  const [image, setImage] = useState<{ url: string; file: File } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const [showGitSection, setShowGitSection] = useState(false);
  const gitDataRef = useRef<GitIdentityData | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccessful, setIsSuccessful] = useState(false);
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const pickImage = (file: File | undefined) => {
    setImageError(null);
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      setImageError("Please upload a PNG or JPG image");
    } else if (file.size > MAX_IMAGE_BYTES) {
      setImageError("Please upload an image smaller than 5MB");
    } else {
      setImage({ url: URL.createObjectURL(file), file });
    }
  };

  const removeImage = () => {
    if (image) URL.revokeObjectURL(image.url);
    setImage(null);
  };

  /** profile.json and the picture; none when joining with an empty form. */
  const profileFiles = (): File[] => {
    const profile = {
      name: name.trim(),
      description: description.trim(),
      social: social.trim(),
    };
    const isEmpty =
      !profile.name && !profile.description && !profile.social && !image;
    if (isJoining && isEmpty) return [];
    const files = [new File([JSON.stringify(profile)], "profile.json")];
    if (image) {
      files.push(
        new File(
          [image.file],
          `profile-image.${image.file.type.split("/")[1]}`,
        ),
      );
    }
    return files;
  };

  const handleSubmit = async () => {
    const urlError = validateUrl(social);
    setSocialError(urlError);
    if (urlError) return;

    let memberAddress = publicKey;
    if (!memberAddress) {
      try {
        memberAddress = await connect();
      } catch {
        return; // The wallet picker was dismissed.
      }
    }

    const files = profileFiles();
    try {
      setIsLoading(true);
      setIsUploading(files.length > 0);
      setStep(6);
      if (isJoining) {
        await joinCommunity({
          memberAddress,
          profileFiles: files,
          gitIdentity: gitDataRef.current ?? undefined,
          onProgress: setStep,
        });
      } else {
        await updateMember({
          memberAddress,
          profileFiles: files,
          onProgress: setStep,
        });
      }
      setIsSuccessful(true);
      setStep(0);
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
      setStep(0);
    } finally {
      setIsLoading(false);
      setIsUploading(false);
    }
  };

  return (
    <FlowProgressModal
      isOpen={true}
      onClose={onClose}
      onSuccess={onClose}
      step={step}
      setStep={setStep}
      isLoading={isLoading}
      setIsLoading={setIsLoading}
      isUploading={isUploading}
      setIsUploading={setIsUploading}
      isSuccessful={isSuccessful}
      setIsSuccessful={setIsSuccessful}
      error={error}
      setError={setError}
      signLabel={isJoining ? "membership" : "profile update"}
      successTitle={isJoining ? "Welcome aboard!" : "Profile updated!"}
      successMessage={
        isJoining
          ? "You've successfully joined the community."
          : "Your profile has been successfully updated."
      }
    >
      <div className="flex flex-col md:flex-row items-center gap-6 md:gap-[18px]">
        <img
          className="flex-none w-[200px] md:w-[360px]"
          src="/images/team.svg"
        />
        <div className="flex flex-col gap-4 md:gap-[30px] w-full">
          <h2 className="text-xl md:text-2xl font-bold text-primary">
            {isJoining ? "Join the Community" : "Edit Profile"}
          </h2>

          {isJoining && (
            <div>
              {publicKey ? (
                <>
                  <Input
                    label="Member Address *"
                    value={publicKey}
                    disabled={true}
                  />
                  <p className="text-sm text-secondary mt-2">
                    Using your connected wallet address. You can only join as
                    yourself.
                  </p>
                </>
              ) : (
                <p className="text-sm text-secondary mt-2">
                  Please connect your wallet to join the community. The address
                  field will be automatically filled with your wallet address.
                </p>
              )}
            </div>
          )}

          <div className="pt-2 md:pt-4">
            {isJoining && (
              <p className="text-base font-medium text-primary mb-3 md:mb-4">
                Profile Information
              </p>
            )}

            <div className="flex flex-col gap-4 md:gap-[30px]">
              <Input
                label="Name"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <Input
                label="Social Profile Link"
                placeholder="https://twitter.com/yourhandle"
                value={social}
                onChange={(e) => {
                  setSocial(e.target.value);
                  setSocialError(null);
                }}
                error={socialError}
              />

              <div className="flex flex-col gap-[18px]">
                <p className="text-base font-[600] text-primary">
                  Profile Picture
                </p>
                {image ? (
                  <div className="flex items-center gap-4">
                    <img
                      src={image.url}
                      alt="Profile preview"
                      className="w-24 h-24 object-cover rounded-full border-2 border-primary"
                    />
                    <Button type="secondary" onClick={removeImage}>
                      Remove Image
                    </Button>
                  </div>
                ) : (
                  <label
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      pickImage(e.dataTransfer.files?.[0]);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    className={`flex flex-col items-center justify-center w-full h-32 border-2 ${
                      imageError
                        ? "border-red-500"
                        : "border-dashed border-[#978AA1]"
                    } ${isDragging ? "bg-zinc-500" : "bg-white"} cursor-pointer bg-zinc-50 hover:bg-zinc-400`}
                  >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <svg
                        className={`w-8 h-8 mb-4 ${imageError ? "text-red-500" : "text-secondary"}`}
                        aria-hidden="true"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 20 16"
                      >
                        <path
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"
                        />
                      </svg>
                      <p className="mb-2 text-sm text-secondary">
                        <span className="font-semibold">Click to upload</span>{" "}
                        or drag and drop
                      </p>
                      <p className="text-xs text-secondary">
                        PNG or JPG (MAX. 5MB)
                      </p>
                      {imageError && (
                        <p className="mt-2 text-sm text-red-500">
                          {imageError}
                        </p>
                      )}
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept={IMAGE_TYPES.join(",")}
                      onChange={(e) => pickImage(e.target.files?.[0])}
                    />
                  </label>
                )}
              </div>

              <div className="flex flex-col gap-[18px]">
                <p className="text-base font-[600] text-primary">Description</p>
                <div className="rounded-md border border-zinc-400 overflow-hidden min-h-[150px]">
                  <SimpleMarkdownEditor
                    value={description}
                    onChange={setDescription}
                    placeholder="Tell us about yourself..."
                  />
                </div>
              </div>
            </div>
          </div>

          {isJoining &&
            (showGitSection || gitDataRef.current ? (
              <GitVerification
                signingAccount={publicKey ?? ""}
                onVerified={(data) => {
                  gitDataRef.current = data;
                }}
                onSkip={() => {
                  setShowGitSection(false);
                  gitDataRef.current = null;
                }}
              />
            ) : (
              <div className="pt-2">
                <Button
                  type="secondary"
                  onClick={() => setShowGitSection(true)}
                >
                  + Link Git Handle (optional)
                </Button>
              </div>
            ))}

          <div className="flex justify-end gap-[18px]">
            <Button type="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button isLoading={isLoading || isUploading} onClick={handleSubmit}>
              {isJoining ? "Join" : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </FlowProgressModal>
  );
};

export default ProfileModal;

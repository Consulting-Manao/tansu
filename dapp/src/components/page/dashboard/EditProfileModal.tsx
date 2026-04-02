import { useState, type FC } from "react";
import Input from "components/utils/Input";
import Button from "components/utils/Button";
import FlowProgressModal from "components/utils/FlowProgressModal";
import { loadedPublicKey } from "@service/walletService";
import { validateUrl } from "utils/validations";
import SimpleMarkdownEditor from "components/utils/SimpleMarkdownEditor";

interface ProfileData {
  name: string;
  description: string;
  social: string;
  image?: string;
}

interface ProfileImageFile {
  localUrl: string;
  source: File;
}

const EditProfileModal: FC<{
  onClose: () => void;
  onUpdated?: () => void;
  initialProfile?: ProfileData | null;
}> = ({ onClose, onUpdated, initialProfile }) => {
  const [name, setName] = useState<string>(initialProfile?.name || "");
  const [social, setSocial] = useState<string>(initialProfile?.social || "");
  const [description, setDescription] = useState<string>(
    initialProfile?.description || "",
  );
  const [profileImage, setProfileImage] = useState<ProfileImageFile | null>(
    null,
  );
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [updateSuccessful, setUpdateSuccessful] = useState(false);
  const [step, setStep] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const handleClose = () => {
    if (updateSuccessful) window.location.reload();
    setUpdateSuccessful(false);
    setStep(0);
    setIsLoading(false);
    setIsUploading(false);
    onClose?.();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (!allowedTypes.includes(file.type)) {
      setImageError("Please upload a PNG or JPG image");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError("Please upload an image smaller than 5MB");
      return;
    }
    setProfileImage({ localUrl: URL.createObjectURL(file), source: file });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setImageError(null);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (!allowedTypes.includes(file.type)) {
      setImageError("Please upload a PNG or JPG image");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError("Please upload an image smaller than 5MB");
      return;
    }
    setProfileImage({ localUrl: URL.createObjectURL(file), source: file });
  };

  const handleRemoveImage = () => {
    if (profileImage) {
      URL.revokeObjectURL(profileImage.localUrl);
      setProfileImage(null);
    }
  };

  const validateSocialField = (): boolean => {
    const err = validateUrl(social);
    setSocialError(err);
    return err === null;
  };

  const handleUpdate = async () => {
    if (!validateSocialField()) return;

    const memberAddress = loadedPublicKey();
    if (!memberAddress) {
      setError("Please connect your wallet first");
      return;
    }

    const profileData = {
      name: name.trim(),
      description: description.trim(),
      social: social.trim(),
    };
    const profileBlob = new Blob([JSON.stringify(profileData)], {
      type: "application/json",
    });
    const files: File[] = [new File([profileBlob], "profile.json")];
    if (profileImage) {
      files.push(
        new File(
          [profileImage.source],
          "profile-image." + profileImage.source.type.split("/")[1],
        ),
      );
    }

    try {
      setIsLoading(true);
      setIsUploading(true);
      setStep(6);
      const { updateMemberFlow } = await import("@service/FlowService");
      await updateMemberFlow({
        memberAddress,
        profileFiles: files,
        onProgress: setStep,
      });
      onUpdated?.();
      setUpdateSuccessful(true);
      setStep(0);
    } catch (err: any) {
      console.error("Edit profile error:", err);
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
      onClose={handleClose}
      onSuccess={() => onUpdated?.()}
      step={step}
      setStep={setStep}
      isLoading={isLoading}
      setIsLoading={setIsLoading}
      isUploading={isUploading}
      setIsUploading={setIsUploading}
      isSuccessful={updateSuccessful}
      setIsSuccessful={setUpdateSuccessful}
      error={error}
      setError={setError}
      signLabel="profile update"
      successTitle="Profile updated!"
      successMessage="Your profile has been successfully updated."
    >
      <div className="flex flex-col md:flex-row items-center gap-6 md:gap-[18px]">
        <img
          className="flex-none w-[200px] md:w-[360px]"
          src="/images/team.svg"
        />
        <div className="flex flex-col gap-4 md:gap-[30px] w-full">
          <h2 className="text-xl md:text-2xl font-bold text-primary">
            Edit Profile
          </h2>

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
              {profileImage ? (
                <div className="flex items-center gap-4">
                  <img
                    src={profileImage.localUrl}
                    alt="Profile preview"
                    className="w-24 h-24 object-cover rounded-full border-2 border-primary"
                  />
                  <Button type="secondary" onClick={handleRemoveImage}>
                    Remove Image
                  </Button>
                </div>
              ) : (
                <label
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
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
                      <span className="font-semibold">Click to upload</span> or
                      drag and drop
                    </p>
                    <p className="text-xs text-secondary">
                      PNG or JPG (MAX. 5MB)
                    </p>
                    {imageError && (
                      <p className="mt-2 text-sm text-red-500">{imageError}</p>
                    )}
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/png,image/jpeg,image/jpg"
                    onChange={handleImageUpload}
                  />
                </label>
              )}
            </div>

            <div className="flex flex-col gap-[18px]">
              <p className="text-base font-[600] text-primary">Description</p>
              <div className="rounded-md border border-zinc-400 overflow-hidden min-h-[150px]">
                <SimpleMarkdownEditor
                  value={description}
                  onChange={(value) => setDescription(value)}
                  placeholder="Tell us about yourself..."
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-[18px]">
            <Button type="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button isLoading={isLoading || isUploading} onClick={handleUpdate}>
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </FlowProgressModal>
  );
};

export default EditProfileModal;

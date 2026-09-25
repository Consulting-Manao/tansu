import { type ChangeEvent } from "react";
import SimpleMarkdownEditor from "components/utils/SimpleMarkdownEditor";

export type AttachedImage = {
  localUrl: string;
  publicUrl: string;
  source: File;
};

/**
 * `markdown` with its images' local URLs replaced by their paths in the
 * directory it is published in, and the images it shows, as files for it.
 */
export function embedImages(
  markdown: string,
  images: AttachedImage[],
): { text: string; files: File[] } {
  let text = markdown;
  const files: File[] = [];
  for (const image of images) {
    if (!text.includes(image.localUrl)) continue;
    text = text.replaceAll(image.localUrl, image.publicUrl);
    files.push(
      new File([image.source], image.publicUrl, { type: image.source.type }),
    );
  }
  return { text, files };
}

const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/svg+xml",
  "image/gif",
];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

interface Props {
  value: string;
  onChange: (value: string) => void;
  imageFiles: AttachedImage[];
  onImageFilesChange: (files: AttachedImage[]) => void;
  imageError: string | null;
  onImageErrorChange: (error: string | null) => void;
  placeholder?: string;
  imageBaseUrl?: string;
}

const MarkdownEditorWithImages = ({
  value,
  onChange,
  imageFiles,
  onImageFilesChange,
  imageError,
  onImageErrorChange,
  placeholder,
  imageBaseUrl,
}: Props) => {
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    onImageErrorChange(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      onImageErrorChange(
        "Unsupported image type. Allowed: png, jpg, jpeg, svg, gif",
      );
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      onImageErrorChange("Please upload an image smaller than 5MB");
      return;
    }
    const localUrl = URL.createObjectURL(file);
    const publicUrl = `images/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    onImageFilesChange([...imageFiles, { localUrl, publicUrl, source: file }]);
    onChange(
      `${value}${value && !value.endsWith("\n") ? "\n\n" : ""}![](${localUrl})\n`,
    );
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-3">
      <SimpleMarkdownEditor
        value={value}
        onChange={onChange}
        {...(placeholder !== undefined && { placeholder })}
        baseUrl={imageBaseUrl}
      />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-gray-50 rounded-md">
        <p className="text-sm text-secondary flex-1">
          Optionally attach images and insert them into your Markdown. Supported
          formats: PNG, JPG, JPEG, SVG, GIF (max 5MB each).
        </p>
        <label className="cursor-pointer bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 transition-colors text-sm font-medium whitespace-nowrap">
          Add Image
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/gif"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>
      </div>
      {imageError && <p className="text-red-500 text-sm">{imageError}</p>}
      {imageFiles.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-primary">
            Attached Images ({imageFiles.length})
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {imageFiles.map((img, idx) => (
              <div
                key={idx}
                className="border border-gray-200 p-3 flex flex-col gap-3 rounded-lg bg-white"
              >
                <img
                  src={img.localUrl}
                  alt={`attachment-${idx}`}
                  className="w-full h-20 object-contain rounded"
                />
                <div className="flex justify-between items-center gap-2">
                  <button
                    type="button"
                    className="text-blue-600 hover:text-blue-800 underline text-xs"
                    onClick={() =>
                      onChange(
                        `${value}${value && !value.endsWith("\n") ? "\n\n" : ""}![](${img.localUrl})\n`,
                      )
                    }
                  >
                    Insert
                  </button>
                  <button
                    type="button"
                    className="text-red-600 hover:text-red-800 underline text-xs"
                    onClick={() => {
                      URL.revokeObjectURL(img.localUrl);
                      onImageFilesChange(
                        imageFiles.filter((_, i) => i !== idx),
                      );
                      // Remove the whole markdown image node(s) for this URL, not
                      // just the URL substring, so no empty `![]()` is left behind.
                      const escaped = img.localUrl.replace(
                        /[.*+?^${}()|[\]\\]/g,
                        "\\$&",
                      );
                      const imageTag = new RegExp(
                        `!\\[[^\\]]*\\]\\(${escaped}\\)\\n?`,
                        "g",
                      );
                      onChange(value.replace(imageTag, ""));
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MarkdownEditorWithImages;

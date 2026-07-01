export const petPhotoBucket = "petflow-pet-photos";
export const maxPetPhotoSizeBytes = 5 * 1024 * 1024;
export const allowedPetPhotoMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

const allowedPetPhotoMimeTypeSet = new Set<string>(allowedPetPhotoMimeTypes);

export const petPhotoAccept = allowedPetPhotoMimeTypes.join(",");

export function isAllowedPetPhotoMimeType(mimeType: string) {
  return allowedPetPhotoMimeTypeSet.has(mimeType);
}

export function petPhotoExtensionFromMimeType(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  return mimeType.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "jpg";
}

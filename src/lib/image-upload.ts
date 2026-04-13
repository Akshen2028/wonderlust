"use client";

type OptimizeImageOptions = {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  type?: string;
};

function readImageDimensions(
  file: File,
): Promise<{ image: HTMLImageElement; objectUrl: string }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => resolve({ image, objectUrl });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read image."));
    };

    image.src = objectUrl;
  });
}

export async function optimizeImageFile(
  file: File,
  options: OptimizeImageOptions = {},
) {
  const {
    maxWidth = 2200,
    maxHeight = 2200,
    quality = 0.82,
    type = "image/jpeg",
  } = options;

  if (!file.type.startsWith("image/")) {
    return file;
  }

  const { image, objectUrl } = await readImageDimensions(file);

  try {
    const scale = Math.min(
      1,
      maxWidth / image.naturalWidth,
      maxHeight / image.naturalHeight,
    );

    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return file;
    }

    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, type, quality);
    });

    if (!blob) {
      return file;
    }

    const optimizedName = file.name.replace(/\.[^.]+$/, "") || "cover";
    return new File([blob], `${optimizedName}.jpg`, {
      type,
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

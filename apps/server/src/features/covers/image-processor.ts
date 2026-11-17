import sharp from "sharp";
import { AppError } from "../../shared/http";

export const COVER_SIZE = 720;
const COVER_QUALITY = 80;
const ACCEPTED_FORMATS: ReadonlySet<string> = new Set(["jpeg", "png", "webp", "avif", "gif"]);
/** Refuse decompression bombs (40 megapixels). */
const MAX_INPUT_PIXELS = 40_000_000;

/**
 * Any accepted image → square 720×720 WebP, centre-cropped.
 * The image is always re-encoded: metadata (EXIF, GPS…) is dropped and the original bytes are never served.
 */
export async function processCoverImage(input: Uint8Array): Promise<Uint8Array> {
  try {
    const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" });
    const { format } = await image.metadata();
    if (!(format && ACCEPTED_FORMATS.has(format))) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Unsupported image format (JPEG, PNG, WebP, AVIF or GIF expected)",
      );
    }
    const output = await image
      .rotate()
      .resize(COVER_SIZE, COVER_SIZE, { fit: "cover", position: "centre" })
      .webp({ quality: COVER_QUALITY })
      .toBuffer();
    return new Uint8Array(output);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("VALIDATION_ERROR", "Unreadable image", { cause: error });
  }
}

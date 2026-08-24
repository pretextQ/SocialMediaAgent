import sharp from 'sharp';
import { Logger } from '../../../core/Logger';

const logger = new Logger('CoverUtils');

export interface CoverDimensions {
  width: number;
  height: number;
}

export async function cropCover(
  inputPath: string,
  outputPath: string,
  ratio: string
): Promise<void> {
  logger.info(`Cropping cover: ${inputPath} → ${outputPath} (ratio: ${ratio})`);
  
  const [w, h] = ratio.split(':').map(Number);
  const metadata = await sharp(inputPath).metadata();
  if (!metadata.width || !metadata.height) {
    const error = new Error('Cannot read image dimensions');
    logger.error(`Cover crop failed: ${error.message}`, { inputPath });
    throw error;
  }

  const targetRatio = w / h;
  const currentRatio = metadata.width / metadata.height;

  let extractWidth: number;
  let extractHeight: number;
  let left: number;
  let top: number;

  if (currentRatio > targetRatio) {
    extractHeight = metadata.height;
    extractWidth = Math.round(metadata.height * targetRatio);
    left = Math.round((metadata.width - extractWidth) / 2);
    top = 0;
  } else {
    extractWidth = metadata.width;
    extractHeight = Math.round(metadata.width / targetRatio);
    left = 0;
    top = Math.round((metadata.height - extractHeight) / 2);
  }

  await sharp(inputPath)
    .extract({ left, top, width: extractWidth, height: extractHeight })
    .toFile(outputPath);
    
  logger.info(`Cover cropped successfully: ${extractWidth}x${extractHeight}`, { outputPath });
}

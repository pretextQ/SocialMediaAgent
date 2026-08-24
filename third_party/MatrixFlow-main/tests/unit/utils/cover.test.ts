import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sharp from 'sharp';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { cropCover } from '../../../electron/platform/base/utils/cover';

const FIXTURES_DIR = join(__dirname, '../../fixtures/covers');
const OUTPUT_DIR = join(__dirname, '../../fixtures/covers/output');

async function createTestImage(width: number, height: number, color: string, path: string) {
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toFile(path);
}

describe('cropCover', () => {
  beforeAll(async () => {
    // Create fixtures directory
    if (!existsSync(FIXTURES_DIR)) {
      mkdirSync(FIXTURES_DIR, { recursive: true });
    }
    if (!existsSync(OUTPUT_DIR)) {
      mkdirSync(OUTPUT_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up
    if (existsSync(FIXTURES_DIR)) {
      rmSync(FIXTURES_DIR, { recursive: true, force: true });
    }
  });

  it('should crop 100x100 to 1:1 ratio (no change)', async () => {
    const input = join(FIXTURES_DIR, 'square.png');
    const output = join(OUTPUT_DIR, 'square-out.png');
    
    await createTestImage(100, 100, '#ff0000', input);
    await cropCover(input, output, '1:1');
    
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toBe(100);
    expect(metadata.height).toBe(100);
  });

  it('should crop 200x100 to 16:9 ratio', async () => {
    const input = join(FIXTURES_DIR, 'wide.png');
    const output = join(OUTPUT_DIR, 'wide-out.png');
    
    await createTestImage(200, 100, '#00ff00', input);
    await cropCover(input, output, '16:9');
    
    const metadata = await sharp(output).metadata();
    // 200x100 has 2:1 ratio, 16:9 ≈ 1.78:1
    // Should crop to 178x100 (closest 16:9 from center)
    expect(metadata.height).toBe(100);
    expect(metadata.width).toBeCloseTo(178, -1);
  });

  it('should crop 100x200 to 3:4 ratio', async () => {
    const input = join(FIXTURES_DIR, 'tall.png');
    const output = join(OUTPUT_DIR, 'tall-out.png');
    
    await createTestImage(100, 200, '#0000ff', input);
    await cropCover(input, output, '3:4');
    
    const metadata = await sharp(output).metadata();
    // 100x200 has 0.5:1 ratio, target 3:4 = 0.75:1
    // Current is narrower, so keep full width (100), crop height to 133
    expect(metadata.width).toBe(100);
    expect(Math.abs(metadata.height! - 133)).toBeLessThan(2);
  });

  it('should throw error for non-existent file', async () => {
    const input = join(FIXTURES_DIR, 'nonexistent.png');
    const output = join(OUTPUT_DIR, 'out.png');
    
    await expect(cropCover(input, output, '1:1')).rejects.toThrow();
  });

  it('should throw error for invalid ratio format', async () => {
    const input = join(FIXTURES_DIR, 'test.png');
    const output = join(OUTPUT_DIR, 'out.png');
    
    await createTestImage(100, 100, '#ffffff', input);
    
    // Invalid ratio should cause NaN and fail
    await expect(cropCover(input, output, 'invalid')).rejects.toThrow();
  });
});

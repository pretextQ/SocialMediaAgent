import { WebContentsView } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { Platform } from '../types';
import type { FingerprintProfile } from './fingerprint-adapter';

export type StealthLevel = 'basic' | 'medium' | 'full';

export class StealthEngine {
  private platformLevel: Record<Platform, StealthLevel> = {
    douyin: 'full',
    xiaohongshu: 'full',
    kuaishou: 'medium',
    channels: 'medium',
    bilibili: 'basic',
  };

  async apply(
    view: WebContentsView,
    platform: Platform,
    profile: FingerprintProfile
  ): Promise<void> {
    const level = this.platformLevel[platform];

    const scripts: string[] = [];
    if (level === 'basic' || level === 'medium' || level === 'full') {
      scripts.push(this.buildScript('base'));
    }
    if (level === 'medium' || level === 'full') {
      scripts.push(this.buildScript('medium'));
    }
    if (level === 'full') {
      scripts.push(this.buildScript('full', profile));
    }

    const combinedScript = scripts.join('\n');

    view.webContents.setUserAgent(profile.ua);

    view.webContents.on('did-start-navigation', () => {
      view.webContents.executeJavaScript(combinedScript).catch(() => {});
    });
  }

  private buildScript(name: 'base' | 'medium' | 'full', profile?: FingerprintProfile): string {
    const scriptPath = path.join(__dirname, 'stealth-scripts', `${name}.js`);
    let content = fs.readFileSync(scriptPath, 'utf-8');

    if (name === 'full' && profile) {
      content = `(${content})(${profile.canvasSeed}, '${profile.gpu_vendor}', '${profile.gpu_renderer}')`;
    }

    return content;
  }
}

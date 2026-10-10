import { describe, expect, it } from 'vitest';
import viteConfig from '../../vite.config.ts';

describe('vite config', () => {
  it('serves under the GitHub Pages repo path', () => {
    expect(viteConfig.base).toBe('/my-scarves/');
  });
});

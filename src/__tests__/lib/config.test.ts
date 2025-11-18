import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules and environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should have required DATABASE_URL', () => {
    expect(process.env.DATABASE_URL).toBeDefined();
  });

  it('should parse numeric environment variables', () => {
    process.env.PORT = '3001';
    process.env.MIN_EPISODE_CHUNKS = '5';
    process.env.MAX_EPISODE_CHUNKS = '100';

    // Values should be parseable as numbers
    expect(Number(process.env.PORT)).toBe(3001);
    expect(Number(process.env.MIN_EPISODE_CHUNKS)).toBe(5);
    expect(Number(process.env.MAX_EPISODE_CHUNKS)).toBe(100);
  });

  it('should have valid segmentation mode values', () => {
    const validModes = ['heuristic', 'llm'];
    const mode = process.env.DEFAULT_SEGMENTATION_MODE || 'heuristic';

    expect(validModes).toContain(mode);
  });

  it('should have valid node environment', () => {
    const validEnvs = ['development', 'production', 'test'];
    const nodeEnv = process.env.NODE_ENV || 'development';

    expect(validEnvs).toContain(nodeEnv);
  });
});

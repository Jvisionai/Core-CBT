import { describe, it, expect } from 'vitest';
import data from '@/app/frequent/_data/frequent.json';

describe('frequent.json 형태', () => {
  it('과목 3개, 각 과목에 클러스터 존재', () => {
    expect(data.subjects).toHaveLength(3);
    data.subjects.forEach((s) => {
      expect(typeof s.name).toBe('string');
      expect(s.clusters.length).toBeGreaterThan(0);
    });
  });
  it('모든 클러스터는 rounds>=2, items 있음, kind 동일/변형', () => {
    for (const s of data.subjects) for (const c of s.clusters) {
      expect(c.rounds).toBeGreaterThanOrEqual(2);
      expect(c.items.length).toBeGreaterThanOrEqual(2);
      expect(['동일', '변형']).toContain(c.kind);
      expect(c.items[0]).toHaveProperty('sid');
      expect(c.items[0]).toHaveProperty('no');
    }
  });
  it('wrongRate는 null 또는 0~100, 있으면 attempts>=20', () => {
    for (const s of data.subjects) for (const c of s.clusters) {
      if (c.wrongRate !== null) {
        expect(c.wrongRate).toBeGreaterThanOrEqual(0);
        expect(c.wrongRate).toBeLessThanOrEqual(100);
        expect(c.attempts).toBeGreaterThanOrEqual(20);
      }
    }
  });
});

// Unit tests for ZoneService.firstPointOutsideActiveZones — the batch coverage
// check that keeps special/custom-delivery orders inside supported areas.
// Exercises the real point-in-polygon geometry with a mocked Prisma only
// (no MySQL/Redis/Nest DI): zones in Cairo/Alexandria, an out-of-coverage
// point in Stockholm, Sweden — mirroring the reported far-away-order bug.

import { ZoneService } from '../zone.service';

// Simple rectangular service zones (ray-casting is winding-order agnostic).
const CAIRO_ZONE = {
  coordinates: [
    { lat: 29.9, lng: 31.1 },
    { lat: 30.2, lng: 31.1 },
    { lat: 30.2, lng: 31.5 },
    { lat: 29.9, lng: 31.5 },
  ],
};
const ALEX_ZONE = {
  coordinates: [
    { lat: 31.1, lng: 29.8 },
    { lat: 31.3, lng: 29.8 },
    { lat: 31.3, lng: 30.05 },
    { lat: 31.1, lng: 30.05 },
  ],
};

// Real-world points.
const CAIRO_TAHRIR = { lat: 30.044, lng: 31.235 }; // inside CAIRO_ZONE
const CAIRO_NASR = { lat: 30.06, lng: 31.34 }; // inside CAIRO_ZONE
const ALEX_DOWNTOWN = { lat: 31.2, lng: 29.92 }; // inside ALEX_ZONE only
const STOCKHOLM = { lat: 59.33, lng: 18.07 }; // outside every Egyptian zone

const buildService = (zones: Array<{ coordinates: unknown }>) => {
  const findMany = jest.fn().mockResolvedValue(zones);
  const prisma = { zone: { findMany } } as any;
  const service = new ZoneService(prisma, undefined as any);
  return { service, findMany };
};

describe('ZoneService.firstPointOutsideActiveZones', () => {
  it('returns -1 when every point is inside an active zone', async () => {
    const { service } = buildService([CAIRO_ZONE]);
    const result = await service.firstPointOutsideActiveZones([
      CAIRO_TAHRIR,
      CAIRO_NASR,
    ]);
    expect(result).toBe(-1);
  });

  it('flags the pickup (first stop) when it is outside all zones', async () => {
    const { service } = buildService([CAIRO_ZONE]);
    const result = await service.firstPointOutsideActiveZones([
      STOCKHOLM, // pickup in Sweden
      CAIRO_TAHRIR,
    ]);
    expect(result).toBe(0);
  });

  it('flags the drop-off (last stop) when it is outside all zones', async () => {
    const { service } = buildService([CAIRO_ZONE]);
    const result = await service.firstPointOutsideActiveZones([
      CAIRO_TAHRIR,
      CAIRO_NASR,
      STOCKHOLM, // drop-off in Sweden
    ]);
    expect(result).toBe(2);
  });

  it('flags an intermediate stop when it is outside all zones', async () => {
    const { service } = buildService([CAIRO_ZONE]);
    const result = await service.firstPointOutsideActiveZones([
      CAIRO_TAHRIR,
      STOCKHOLM, // waypoint in Sweden
      CAIRO_NASR,
    ]);
    expect(result).toBe(1);
  });

  it('accepts points that fall in different active zones (need not share one)', async () => {
    const { service } = buildService([CAIRO_ZONE, ALEX_ZONE]);
    const result = await service.firstPointOutsideActiveZones([
      CAIRO_TAHRIR, // Cairo zone
      ALEX_DOWNTOWN, // Alexandria zone
    ]);
    expect(result).toBe(-1);
  });

  it('rejects a far-away Sweden point while zones are in Egypt (reported bug)', async () => {
    const { service } = buildService([CAIRO_ZONE, ALEX_ZONE]);
    const result = await service.firstPointOutsideActiveZones([
      CAIRO_TAHRIR,
      STOCKHOLM,
    ]);
    expect(result).toBe(1);
  });

  it('treats a point with missing coordinates as uncovered', async () => {
    const { service } = buildService([CAIRO_ZONE]);
    const result = await service.firstPointOutsideActiveZones([
      CAIRO_TAHRIR,
      { lat: undefined, lng: undefined },
    ]);
    expect(result).toBe(1);
  });

  it('treats every point as uncovered when no zones are active', async () => {
    const { service, findMany } = buildService([]);
    const result = await service.firstPointOutsideActiveZones([CAIRO_TAHRIR]);
    expect(result).toBe(0);
    // only active zones are ever considered
    expect(findMany).toHaveBeenCalledWith({
      where: { active: true },
      select: { coordinates: true },
    });
  });

  it('returns -1 for an empty batch without querying zones', async () => {
    const { service, findMany } = buildService([CAIRO_ZONE]);
    const result = await service.firstPointOutsideActiveZones([]);
    expect(result).toBe(-1);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('queries active zones only once for a multi-point batch', async () => {
    const { service, findMany } = buildService([CAIRO_ZONE]);
    await service.firstPointOutsideActiveZones([
      CAIRO_TAHRIR,
      CAIRO_NASR,
      CAIRO_TAHRIR,
    ]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});

import { distanceM } from '../../../shared/route/geometry';
import { encodePolyline } from '../../../shared/route/polyline';
import { ORIGIN, offset, pathOf } from '../../../shared/route/test-paths';
import { bookedLeg } from './route-source';

describe('bookedLeg', () => {
  const polyline = encodePolyline(pathOf([0, 0], [800, 0], [800, 600]));

  it('uses the booked route at its booked duration when the driver is at its start', () => {
    const leg = bookedLeg(polyline, 4, offset(ORIGIN, 30, 20));
    expect(leg?.source).toBe('booked');
    expect(leg?.path).toBe(polyline);
    expect(leg?.steps).toHaveLength(1);
    expect(leg?.steps[0].seconds).toBe(240);
    expect(leg?.steps[0].metres).toBeGreaterThan(1395);
    expect(leg?.steps[0].metres).toBeLessThan(1405);
  });

  it('is not used when the driver starts the trip away from it, or there is none', () => {
    const away = offset(ORIGIN, 0, 150);
    expect(distanceM(away, ORIGIN)).toBeGreaterThan(100);
    expect(bookedLeg(polyline, 4, away)).toBeNull();
    expect(bookedLeg(undefined, 4, ORIGIN)).toBeNull();
    expect(bookedLeg(polyline, undefined, ORIGIN)).toBeNull();
  });
});

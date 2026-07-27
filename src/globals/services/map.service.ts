import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class MapService {
  private readonly logger = new Logger(MapService.name);
  private trials = +env('MAP_TRIALS');
  private origin: string;
  private destination: string;

  private calculateHaversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  async getTripDetails(origin: string, destinations: string): Promise<TripDetails | undefined> {
    this.origin = origin.replaceAll(',', ', ');
    this.destination = destinations.replaceAll(',', ', ');

    const originParts = origin.split(',').map((s) => parseFloat(s.trim()));
    if (originParts.length < 2 || isNaN(originParts[0]) || isNaN(originParts[1])) {
      this.logger.error(`[MapService] Invalid origin coordinates format: ${origin}`);
      return undefined;
    }
    const [originLat, originLng] = originParts;

    const destCoords = destinations
      .split('|')
      .map((dest) => {
        const parts = dest.split(',').map((s) => parseFloat(s.trim()));
        if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) {
          return null;
        }
        return { lat: parts[0], lng: parts[1] };
      })
      .filter((c): c is { lat: number; lng: number } => c !== null);

    if (destCoords.length === 0) {
      this.logger.error(`[MapService] No valid destination coordinates parsed: ${destinations}`);
      return undefined;
    }

    try {
      const osrmUrl = env('OSRM_URL') || 'http://127.0.0.1:5000';
      
      // OSRM expects coordinates in {longitude},{latitude} format
      const coordinatesString = [
        `${originLng},${originLat}`,
        ...destCoords.map((d) => `${d.lng},${d.lat}`),
      ].join(';');

      const destinationsParam = destCoords.map((_, idx) => idx + 1).join(';');

      const url = `${osrmUrl}/table/v1/driving/${coordinatesString}`;
      const params = {
        sources: '0',
        destinations: destinationsParam,
        annotations: 'duration,distance',
      };

      const response = await axios.get(url, { params, timeout: 5000 });
      
      if (response.data?.code !== 'Ok') {
        this.logger.error(
          `[MapService] OSRM table service returned non-Ok code: ${response.data?.code}`,
        );
        throw new Error(`OSRM returned code ${response.data?.code}`);
      }

      const durations = response.data.durations;
      const distances = response.data.distances;

      const elements = destCoords.map((dest, i) => {
        let durationValue = durations?.[0]?.[i];
        let distanceValue = distances?.[0]?.[i];

        let status = 'OK';
        if (
          durationValue === null ||
          distanceValue === null ||
          durationValue === undefined ||
          distanceValue === undefined
        ) {
          // Cell-level fallback to Haversine
          const fallbackDistanceKm = this.calculateHaversineDistance(originLat, originLng, dest.lat, dest.lng) * 1.3;
          distanceValue = Math.round(fallbackDistanceKm * 1000);
          // 30 km/h = 8.33 m/s
          durationValue = Math.ceil(distanceValue / 8.33);
          status = 'OK';
          this.logger.warn(
            `[MapService] OSRM returned null for destination ${i} (${dest.lat}, ${dest.lng}) — cell fallback to Haversine: distance=${fallbackDistanceKm.toFixed(2)}km`,
          );
        }

        const distanceKm = distanceValue / 1000;
        const durationMin = Math.ceil(durationValue / 60);

        return {
          status,
          distance: {
            text: `${distanceKm.toFixed(1)} km`,
            value: distanceValue,
          },
          duration: {
            text: `${durationMin} mins`,
            value: durationValue,
          },
          duration_in_traffic: {
            text: `${durationMin} mins`,
            value: durationValue,
          },
        };
      });

      return {
        destination_addresses: destCoords.map(() => ''),
        origin_addresses: [''],
        rows: [{ elements }],
        status: 'OK',
      };
    } catch (error) {
      this.logger.error(
        `[MapService] OSRM request failed — falling back to global Haversine calculation: ${error.message}`,
      );

      const elements = destCoords.map((dest) => {
        const fallbackDistanceKm = this.calculateHaversineDistance(originLat, originLng, dest.lat, dest.lng) * 1.3;
        const fallbackDistanceMeters = Math.round(fallbackDistanceKm * 1000);
        const fallbackDurationSeconds = Math.ceil(fallbackDistanceMeters / 8.33);

        return {
          status: 'OK',
          distance: {
            text: `${fallbackDistanceKm.toFixed(1)} km`,
            value: fallbackDistanceMeters,
          },
          duration: {
            text: `${Math.ceil(fallbackDurationSeconds / 60)} mins`,
            value: fallbackDurationSeconds,
          },
          duration_in_traffic: {
            text: `${Math.ceil(fallbackDurationSeconds / 60)} mins`,
            value: fallbackDurationSeconds,
          },
        };
      });

      return {
        destination_addresses: destCoords.map(() => ''),
        origin_addresses: [''],
        rows: [{ elements }],
        status: 'OK',
      };
    }
  }

  async getBatchDetails(
    userLat: number,
    userLng: number,
    locations: { lat: number; lng: number }[],
  ): Promise<{ distance?: number; duration?: number }[]> {
    if (!locations.length) return [];

    const origin = `${userLat},${userLng}`;
    const destinationString = locations
      .map((loc) => `${loc.lat},${loc.lng}`)
      .join('|');

    try {
      const data = await this.getTripDetails(origin, destinationString);
      if (!data || data.status !== 'OK' || !data.rows[0])
        return locations.map(() => ({}));

      return data.rows[0].elements.map((element) => {
        const details: { distance?: number; duration?: number } = {};
        if (element.status === 'OK') {
          if (element.distance)
            details.distance = element.distance.value / 1000;
          if (element.duration)
            details.duration = Math.ceil(element.duration.value / 60); // Duration in minutes
        }
        return details;
      });
    } catch (error) {
      this.logger.error('[MapService] getBatchDetails error:', error);
      return locations.map(() => ({}));
    }
  }

  async getBatchDistances(
    userLat: number,
    userLng: number,
    locations: { lat: number; lng: number }[],
  ): Promise<(number | undefined)[]> {
    const details = await this.getBatchDetails(userLat, userLng, locations);
    return details.map((d) => d.distance);
  }
}

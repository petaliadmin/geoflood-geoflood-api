import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface OsrmRouteLeg {
  distance: number; // meters
  duration: number; // seconds
}

export interface OsrmRoute {
  distance: number; // meters
  duration: number; // seconds
  geometry: { type: 'LineString'; coordinates: Array<[number, number]> }; // [lng, lat]
  legs: OsrmRouteLeg[];
  weight: number;
}

export interface OsrmResponse {
  code: string;
  routes: OsrmRoute[];
  waypoints: Array<{ name: string; location: [number, number] }>;
}

@Injectable()
export class OsrmClient {
  private readonly logger = new Logger(OsrmClient.name);
  private readonly baseUrl: string;

  constructor(
    private config: ConfigService,
    private http: HttpService,
  ) {
    this.baseUrl = (this.config.get<string>('OSRM_BASE_URL') || '').replace(/\/$/, '');
  }

  isAvailable(): boolean {
    return !!this.baseUrl;
  }

  /**
   * Calls OSRM /route service.
   * coordinates are [lng, lat] pairs.
   * profile defaults to 'driving'.
   */
  async route(
    coordinates: Array<[number, number]>,
    options: {
      profile?: 'driving' | 'walking' | 'cycling';
      alternatives?: boolean | number;
      excludeBoxes?: Array<{ minLng: number; minLat: number; maxLng: number; maxLat: number }>;
    } = {},
  ): Promise<OsrmResponse | null> {
    if (!this.isAvailable()) return null;
    if (coordinates.length < 2) return null;

    const profile = options.profile || 'driving';
    const coordStr = coordinates.map(([lng, lat]) => `${lng},${lat}`).join(';');
    const url = `${this.baseUrl}/route/v1/${profile}/${coordStr}`;

    const params: Record<string, string> = {
      overview: 'full',
      geometries: 'geojson',
      steps: 'false',
      annotations: 'false',
    };
    if (options.alternatives !== undefined) {
      params.alternatives = String(options.alternatives);
    }

    try {
      const { data } = await firstValueFrom(
        this.http.get<OsrmResponse>(url, { params, timeout: 8000 }),
      );
      if (data.code !== 'Ok') {
        this.logger.warn(`OSRM returned code=${data.code}`);
        return null;
      }
      return data;
    } catch (err: any) {
      this.logger.warn(`OSRM request failed: ${err.message}`);
      return null;
    }
  }
}

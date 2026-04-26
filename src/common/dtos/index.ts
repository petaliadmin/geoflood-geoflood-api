// Common DTOs for API responses
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// User/Auth DTOs
export class LoginDto {
  email: string;
  password: string;
}

export class RegisterDto {
  fullName: string;
  email: string;
  phone: string;
  password: string;
}

export class AppUserDto {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: 'citizen' | 'authority' | 'admin';
  avatarUrl?: string;
  city: string;
  locale: string;
  pushAlertsEnabled: boolean;
  locationAlertsEnabled: boolean;
  themeMode: string;
  createdAt: Date;
}

// Enum definitions (match Flutter)
export enum RiskLevel {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export enum AlertCategory {
  RAIN = 'rain',
  FLOOD = 'flood',
  EVACUATION = 'evacuation',
  ROAD_BLOCKED = 'roadBlocked',
  INFO = 'info',
}

export enum WaterLevel {
  ANKLE = 'ankle',
  KNEE = 'knee',
  WAIST = 'waist',
  ABOVE = 'above',
}

export enum WeatherCondition {
  SUNNY = 'sunny',
  CLOUDY = 'cloudy',
  RAIN = 'rain',
  HEAVY_RAIN = 'heavyRain',
  STORM = 'storm',
}

export enum ReportStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

// Zone DTOs
export class LatLng {
  lat: number;
  lng: number;
}

export class FloodZoneDto {
  id: string;
  name: string;
  level: RiskLevel;
  polygon: LatLng[];
  center: LatLng;
  city: string;
  score?: number;
  createdAt: Date;
}

// Alert DTOs
export class AlertDto {
  id: string;
  title: string;
  message: string;
  category: AlertCategory;
  level: RiskLevel;
  area: string;
  read: boolean;
  createdAt: Date;
}

export class CreateAlertDto {
  title: string;
  message: string;
  category: AlertCategory;
  level: RiskLevel;
  area: string;
  targetZoneId?: string;
}

export class UpdateAlertDto {
  title?: string;
  message?: string;
  category?: AlertCategory;
  level?: RiskLevel;
  area?: string;
}

// Report DTOs
export class FloodReportDto {
  id: string;
  userId: string;
  lat: number;
  lng: number;
  waterLevel: WaterLevel;
  roadBlocked: boolean;
  comment?: string;
  photoPaths?: string[];
  status: ReportStatus;
  createdAt: Date;
}

// Terrain DTOs
export class TerrainReportDto {
  id: string;
  userId: string;
  address: string;
  lat: number;
  lng: number;
  riskScore: number;
  altitudeMeters: number;
  drainageScore: number;
  historicalFloods: number;
  recommendation: string;
  createdAt: Date;
}

// Weather DTOs
export class WeatherDto {
  city: string;
  tempC: number;
  condition: WeatherCondition;
  rainChance: number;
  humidity: number;
  windKmh: number;
  timestamp: Date;
}

// Dashboard DTOs
export class DashboardDataDto {
  weather: WeatherDto;
  neighborhoodRisk: RiskLevel;
  activeAlerts: number;
  riskScore: number;
}

// Prediction DTOs
export class PredictionDto {
  id: string;
  zoneId: string;
  floodProbability: number;
  severity: RiskLevel;
  confidence: number;
  createdAt: Date;
}

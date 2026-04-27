import {
  IsString,
  IsEmail,
  IsNotEmpty,
  MinLength,
  IsOptional,
  IsEnum,
  IsUUID,
} from 'class-validator';

// Authenticated user payload from JWT
export interface AuthUser {
  id: string;
  email: string;
  role: 'citizen' | 'authority' | 'admin';
}

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
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @MinLength(6)
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
  altitude?: number;
  elevation?: number;
  nature?: string;
  zoneType?: string;
  designation?: string;
  shapeArea?: number;
  source?: string;
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
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsEnum(AlertCategory)
  category: AlertCategory;

  @IsEnum(RiskLevel)
  level: RiskLevel;

  @IsString()
  @IsNotEmpty()
  area: string;

  @IsOptional()
  @IsUUID()
  targetZoneId?: string;
}

export class UpdateAlertDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsEnum(AlertCategory)
  category?: AlertCategory;

  @IsOptional()
  @IsEnum(RiskLevel)
  level?: RiskLevel;

  @IsOptional()
  @IsString()
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

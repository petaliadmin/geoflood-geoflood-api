import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { WeatherService } from './weather.service';

@ApiTags('Weather')
@Controller('v1/weather')
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  @Get()
  @ApiOperation({ summary: 'Get current weather' })
  @ApiQuery({ name: 'city', required: false })
  async getWeather(@Query('city') city: string = 'Dakar') {
    return this.weatherService.getWeather(city);
  }

  @Get('forecast')
  @ApiOperation({ summary: 'Get weather forecast' })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'days', required: false, type: Number })
  async getForecast(@Query('city') city: string = 'Dakar', @Query('days') days: number = 5) {
    return this.weatherService.getForecast(city, days);
  }
}

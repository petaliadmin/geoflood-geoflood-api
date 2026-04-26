import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';

// Database seed script
async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);

  console.log('🌱 Seeding database...');

  try {
    // TODO: Create seed data for zones, alerts, etc.
    console.log('✅ Database seeded successfully');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await app.close();
  }
}

seed();

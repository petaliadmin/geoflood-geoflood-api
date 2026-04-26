import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './entities/user.entity';
import { AppUserDto } from '@/common/dtos';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private usersRepository: Repository<UserEntity>,
  ) {}

  async findById(id: string): Promise<AppUserDto> {
    const user = await this.usersRepository.findOne({
      where: { id },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.formatUserResponse(user);
  }

  async findByEmail(email: string): Promise<AppUserDto> {
    const user = await this.usersRepository.findOne({
      where: { email },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.formatUserResponse(user);
  }

  async update(id: string, updateData: Partial<UserEntity>) {
    await this.usersRepository.update({ id }, updateData);
    return this.findById(id);
  }

  async delete(id: string) {
    await this.usersRepository.delete({ id });
    return { message: 'User deleted successfully' };
  }

  private formatUserResponse(user: UserEntity): AppUserDto {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatarUrl: user.avatarUrl,
      city: user.city,
      locale: user.locale,
      pushAlertsEnabled: user.pushAlertsEnabled,
      locationAlertsEnabled: user.locationAlertsEnabled,
      themeMode: user.themeMode,
      createdAt: user.createdAt,
    };
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { firstOrMany } from 'src/globals/helpers/first-or-many';
import { PrismaService } from 'src/globals/services/prisma.service';
import { SettingFilter, UpdateSettingDTO } from './dto/setting';
import { SettingKey, SettingKeys } from './settings';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(filters?: SettingFilter) {
    const { key, domain } = filters;
    if (key) await this.isValidKey(key);

    const setting = await this.prisma.settings[firstOrMany(key)]({
      where: { domain, setting: key },
    });
    return setting;
  }

  async update(body: UpdateSettingDTO) {
    const { settings } = body;
    for (const { setting, ...data } of settings) {
      const settingObj = {
        ...data,
        value: typeof data.value === 'string' ? data.value : `${data.value}`,
      };
      await this.prisma.settings.update({
        where: { setting },
        data: settingObj,
      });
    }
  }

  async isValidKey(key: SettingKey): Promise<void> {
    if (SettingKeys.includes(key)) return;
    throw new BadRequestException('errors.invalidKey', { cause: { key } });
  }
}

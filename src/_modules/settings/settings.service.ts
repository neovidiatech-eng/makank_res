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

  async getAppStatus() {
    let maintenanceSetting = await this.prisma.settings.findUnique({
      where: { setting: 'maintenance' },
    });

    if (!maintenanceSetting) {
      maintenanceSetting = await this.prisma.settings.create({
        data: {
          setting: 'maintenance',
          value: 'false',
          domain: 'BUSINESS',
          dataType: 'BOOLEAN',
        },
      });
    }

    const messageArSetting = await this.prisma.settings.findUnique({
      where: { setting: 'maintenanceMessageAr' },
    });

    const messageEnSetting = await this.prisma.settings.findUnique({
      where: { setting: 'maintenanceMessageEn' },
    });

    const isMaintenance = maintenanceSetting.value === 'true';

    return {
      isOpen: !isMaintenance,
      isMaintenance: isMaintenance,
      message: {
        ar:
          messageArSetting?.value ||
          'التطبيق مغلق حالياً لأعمال الصيانة والتحديث، سنعود قريباً!',
        en:
          messageEnSetting?.value ||
          'The app is currently under maintenance, we will be back soon!',
      },
    };
  }

  async updateAppStatus(body: {
    isMaintenance?: boolean;
    isOpen?: boolean;
    messageAr?: string;
    messageEn?: string;
  }) {
    let isMaintenance = false;
    if (typeof body.isMaintenance === 'boolean') {
      isMaintenance = body.isMaintenance;
    } else if (typeof body.isOpen === 'boolean') {
      isMaintenance = !body.isOpen;
    }

    await this.prisma.settings.upsert({
      where: { setting: 'maintenance' },
      update: { value: isMaintenance ? 'true' : 'false' },
      create: {
        setting: 'maintenance',
        value: isMaintenance ? 'true' : 'false',
        domain: 'BUSINESS',
        dataType: 'BOOLEAN',
      },
    });

    if (body.messageAr && body.messageAr.trim().length > 0) {
      await this.prisma.settings.upsert({
        where: { setting: 'maintenanceMessageAr' },
        update: { value: body.messageAr.trim() },
        create: {
          setting: 'maintenanceMessageAr',
          value: body.messageAr.trim(),
          domain: 'BUSINESS',
          dataType: 'STRING',
        },
      });
    }

    if (body.messageEn && body.messageEn.trim().length > 0) {
      await this.prisma.settings.upsert({
        where: { setting: 'maintenanceMessageEn' },
        update: { value: body.messageEn.trim() },
        create: {
          setting: 'maintenanceMessageEn',
          value: body.messageEn.trim(),
          domain: 'BUSINESS',
          dataType: 'STRING',
        },
      });
    }

    return await this.getAppStatus();
  }
}

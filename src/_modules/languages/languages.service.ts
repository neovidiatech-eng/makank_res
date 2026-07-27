import { BadRequestException, Injectable } from '@nestjs/common';
import * as path from 'path';
import { firstOrMany } from 'src/globals/helpers/first-or-many';
import { copyAndRenameFolder } from 'src/globals/helpers/folder.helper';
import { PrismaService } from 'src/globals/services/prisma.service';
import { redisClient } from 'src/redis/redis.provider';
import { MediaService } from '../media/services/media.service';
import {
  CreateLanguagesDTO,
  FilterLanguagesDTO,
  UpdateLanguagesDTO,
} from './dto/languages.dto';
import {
  getLanguagesArgs,
  getLanguagesArgsWithSelect,
} from './prisma-args/languages.prisma.args';

@Injectable()
export class LanguagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  async create(data: CreateLanguagesDTO) {
    await this.prisma.language.create({
      data,
    });
  }

  async update(body: UpdateLanguagesDTO) {
    await this.prisma.language.update({ where: { key: body.key }, data: body });
  }

  async findAll(filters: FilterLanguagesDTO) {
    const args = getLanguagesArgs(filters);
    const argsWithSelect = getLanguagesArgsWithSelect();

    const data = await this.prisma.language[firstOrMany(filters?.key)]({
      ...argsWithSelect,
      ...args,
    });
    return data;
  }

  async count(filters: FilterLanguagesDTO) {
    const args = getLanguagesArgs(filters);
    return await this.prisma.language.count({
      where: args.where,
    });
  }
  async delete(key: string): Promise<void> {
    if (key === 'en')
      throw new BadRequestException('Cannot delete default language');
    await this.prisma.language.delete({
      where: {
        key,
      },
    });
  }

  async handelFile(body: CreateLanguagesDTO | UpdateLanguagesDTO) {
    const dir = path.join(__dirname, '../../../..');

    const file = `${env('TEMP_FILE_KEY')}${body.file.split('/').pop()}`;
    const allExist = await this.media.checkAllKeysExist(
      `${dir}/i18n/en/response.json`,
      `${dir}/uploads/i18n/${file}`,
    );
    if (!allExist) throw new BadRequestException('file not matching all keys');
    await copyAndRenameFolder(
      `${dir}/i18n/en`,
      `${dir}/i18n`,
      body.key.toLowerCase(),
    );
    await this.media.copyFileContent(
      `${dir}/uploads/i18n/${file}`,
      `${dir}/i18n/${body.key.toLowerCase()}/response.json`,
    );
  }
  async getCashedLanguages() {
    const cashed = await redisClient.get('languages');
    if (!cashed) {
      const data = await this.findAll({});
      await redisClient.set('languages', JSON.stringify(data));
      redisClient.expire('languages', 300);
      return data;
    }
    return JSON.parse(cashed);
  }
}

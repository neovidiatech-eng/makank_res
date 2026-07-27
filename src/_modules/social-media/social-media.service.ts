import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/globals/services/prisma.service';

import { firstOrMany } from 'src/globals/helpers/first-or-many';
import {
  CreateSocialMediaDTO,
  FilterSocialMediaDTO,
  UpdateSocialMediaDTO,
} from './dto/social-media.dto';

import {
  getSocialMediaArgs,
  getSocialMediaArgsWithSelect,
} from './prisma-args/social-media.prisma.args';
@Injectable()
export class SocialMediaService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateSocialMediaDTO) {
    await this.prisma.socialMedia.create({
      data,
    });
  }

  async update(id: Id, body: UpdateSocialMediaDTO) {
    await this.prisma.socialMedia.update({ where: { id }, data: body });
  }

  async findAll(filters: FilterSocialMediaDTO) {
    const args = getSocialMediaArgs(filters);
    const argsWithSelect = getSocialMediaArgsWithSelect();

    const data = await this.prisma.socialMedia[firstOrMany(filters?.id)]({
      ...argsWithSelect,
      ...args,
    });
    return data;
  }

  async count(filters: FilterSocialMediaDTO): Promise<number> {
    const args = getSocialMediaArgs(filters);
    const total = await this.prisma.socialMedia.count({ where: args.where });

    return total;
  }

  async delete(id: Id): Promise<void> {
    await this.prisma.socialMedia.delete({
      where: {
        id,
      },
    });
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/globals/services/prisma.service';

import { firstOrMany } from 'src/globals/helpers/first-or-many';
import { CreateCityDTO, FilterCityDTO, UpdateCityDTO } from './dto/city.dto';

import { LanguagesService } from '../languages/languages.service';
import {
  getCityArgs,
  getCityArgsWithSelect,
} from './prisma-args/city.prisma.args';
@Injectable()
export class CityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly languages: LanguagesService, // Assuming languages is injected or available
  ) {}

  async create(data: CreateCityDTO) {
    await this.prisma.city.create({
      data,
    });
  }

  async update(id: Id, body: UpdateCityDTO) {
    await this.prisma.city.update({ where: { id }, data: body });
  }

  async findAll(filters: FilterCityDTO) {
    const languages = await this.languages.getCashedLanguages();
    const args = getCityArgs(filters, languages);
    const argsWithSelect = getCityArgsWithSelect();

    const data = await this.prisma.city[firstOrMany(filters?.id)]({
      ...argsWithSelect,
      ...args,
    });
    return data;
  }

  async count(filters: FilterCityDTO) {
    const languages = await this.languages.getCashedLanguages();
    const args = getCityArgs(filters, languages);
    const total = await this.prisma.city.count({ where: args.where });

    return total;
  }

  async delete(id: Id): Promise<void> {
    await this.prisma.city.delete({
      where: {
        id,
      },
    });
  }
}

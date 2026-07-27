import { DynamicModule, Global, Module } from '@nestjs/common';
import { MapOfSet } from './mapOfSet.data-structure.service';

@Global()
@Module({})
export class DataStructureModule {
  static register<T>(groupManagerName: string): DynamicModule {
    return {
      module: DataStructureModule,
      providers: [
        {
          provide: groupManagerName,
          useFactory: () => new MapOfSet<T>(),
        },
      ],
      exports: [groupManagerName],
    };
  }
}

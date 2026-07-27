import { SettingDomain } from '@prisma/client';
import { OptionalFile } from 'src/_modules/media/decorators/upload.decorator';
import { ValidateEnum } from 'src/decorators/dto/enum.decorator';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateJson } from 'src/decorators/dto/validators/validate-json.decorator';
import { ValidateObject } from 'src/decorators/dto/validators/validate-nested.decorator';
import { ValidateSetting } from '../decorator/validate-setting.decorator';
import { SettingKey, SettingKeys } from '../settings';

class CreateSettingDTO {
  @Required()
  @ValidateEnum(SettingKeys, true)
  setting: string;

  @Optional()
  @ValidateSetting()
  value: string;
  @OptionalFile()
  file?: string;
  @Required()
  @ValidateJson()
  name: Json;
}
export class UpdateSettingDTO {
  @Required({ type: [CreateSettingDTO] })
  @ValidateObject(CreateSettingDTO, true)
  settings: CreateSettingDTO[];
}

export class KeyParam {
  @Optional()
  @ValidateEnum(SettingKeys, true)
  key: SettingKey;
}

export class SettingFilter {
  @Optional()
  @ValidateEnum(SettingKeys, true)
  key: SettingKey;

  @Optional()
  @ValidateEnum(SettingDomain)
  domain: SettingDomain;
}

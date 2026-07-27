import { IsOptional, IsString } from 'class-validator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateNumber } from 'src/decorators/dto/validators/validate-number.decorator';

export class RequiredIdParam {
  @Required()
  @ValidateNumber()
  id: Id;
}

export class OptionalIdParam {
  @IsOptional()
  @ValidateNumber()
  id?: Id;
}

export class RequiredIdStringParam {
  @IsString()
  id: string;
}

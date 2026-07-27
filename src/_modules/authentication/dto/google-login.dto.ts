import { ApiProperty } from '@nestjs/swagger';
import { Optional } from 'src/decorators/dto/optional-input.decorator';
import { Required } from 'src/decorators/dto/required-input.decorator';
import { ValidateString } from 'src/decorators/dto/validators/validate-string.decorator';

// Sign in / register a customer via "Sign in with Google". The client (mobile
// app) runs the native Google Sign-In flow and hands us the resulting ID
// token — we verify it server-side (GoogleAuthService) and never see the
// user's Google password. Customer-only for now, per product decision.
export class GoogleLoginDTO {
  @Required()
  @ValidateString()
  locale: string;

  @Optional({ example: 'user' })
  fcm?: string;

  @Required()
  @ValidateString()
  @ApiProperty({
    description: 'ID token returned by the Google Sign-In SDK on the client',
  })
  idToken: string;
}

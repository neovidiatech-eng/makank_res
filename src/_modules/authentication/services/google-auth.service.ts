import {
  Injectable,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import axios from 'axios';

interface GoogleTokenInfo {
  sub: string;
  email: string;
  email_verified: string; // Google's tokeninfo endpoint returns 'true'/'false' as strings
  name?: string;
  picture?: string;
  aud: string;
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
}

// Verifies a Google "Sign in with Google" ID token server-side via Google's own
// tokeninfo endpoint — no extra SDK dependency, reuses the axios already in the
// project. This is Google's officially supported (if slightly slower than
// offline JWKS validation) verification path: https://oauth2.googleapis.com/tokeninfo
@Injectable()
export class GoogleAuthService {
  async verifyIdToken(idToken: string): Promise<GoogleProfile> {
    if (!idToken) {
      throw new UnprocessableEntityException('idToken is required');
    }

    const allowedClientIds = (env('GOOGLE_CLIENT_IDS') || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (!allowedClientIds.length) {
      throw new InternalServerErrorException(
        'Google sign-in is not configured yet — set GOOGLE_CLIENT_IDS in the environment',
      );
    }

    let data: GoogleTokenInfo;
    try {
      const response = await axios.get<GoogleTokenInfo>(
        'https://oauth2.googleapis.com/tokeninfo',
        {
          params: { id_token: idToken },
        },
      );
      data = response.data;
    } catch (e) {
      throw new UnprocessableEntityException('invalid_google_token');
    }

    if (!allowedClientIds.includes(data.aud)) {
      throw new UnprocessableEntityException('invalid_google_token_audience');
    }
    if (data.email_verified !== 'true') {
      throw new UnprocessableEntityException('google_email_not_verified');
    }

    return {
      googleId: data.sub,
      email: data.email,
      name: data.name || data.email.split('@')[0],
      picture: data.picture,
    };
  }
}

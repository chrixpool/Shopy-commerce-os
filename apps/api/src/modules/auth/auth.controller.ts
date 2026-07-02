import { Controller, Post, Body, HttpCode, HttpStatus, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Called by Next.js Auth.js Credentials provider to validate sign-in.
   * Returns user + org context on success, throws 401 on failure.
   */
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate credentials (called by Auth.js)' })
  async validate(@Body() body: { email: string; password: string }) {
    return this.authService.validateCredentials(body.email, body.password);
  }

  /**
   * Register a new user. First user creates the org (OWNER).
   * Subsequent users must use an invitation token.
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register new user' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * Get user profile by ID (called by Auth.js session callback).
   */
  @Get('user/:id')
  @ApiOperation({ summary: 'Get user by ID (Auth.js session callback)' })
  async getUser(@Param('id') id: string) {
    return this.authService.getUserById(id);
  }
}

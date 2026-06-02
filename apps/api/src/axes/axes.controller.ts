import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CreateAxisRequest,
  UpdateAxisRequest,
  type Axis,
  type AxisList,
} from '@intelligencehub/shared';
import { AxesService } from './axes.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequireConfirmedEmailGuard } from '../common/guards/require-confirmed-email.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  CurrentUser,
  type AuthUserContext,
} from '../common/decorators/current-user.decorator';

@Controller('axes')
@UseGuards(JwtAuthGuard, RequireConfirmedEmailGuard)
export class AxesController {
  constructor(private readonly axes: AxesService) {}

  @Get()
  async list(@CurrentUser() user: AuthUserContext): Promise<AxisList> {
    const axes = await this.axes.listMine(user.userId);
    return { axes };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthUserContext,
    @Body(new ZodValidationPipe(CreateAxisRequest))
    body: CreateAxisRequest,
  ): Promise<Axis> {
    return this.axes.create(user.userId, body.name, body.values);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateAxisRequest))
    body: UpdateAxisRequest,
  ): Promise<Axis> {
    return this.axes.update(user.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthUserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.axes.delete(user.userId, id);
  }
}

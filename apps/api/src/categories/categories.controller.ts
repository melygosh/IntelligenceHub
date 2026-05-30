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
  CreateCategoryRequest,
  UpdateCategoryRequest,
  type Category,
  type CategoryList,
} from '@intelligencehub/shared';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequireConfirmedEmailGuard } from '../common/guards/require-confirmed-email.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  CurrentUser,
  type AuthUserContext,
} from '../common/decorators/current-user.decorator';

@Controller('categories')
@UseGuards(JwtAuthGuard, RequireConfirmedEmailGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  async list(@CurrentUser() user: AuthUserContext): Promise<CategoryList> {
    const categories = await this.categories.listMine(user.userId);
    return { categories };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthUserContext,
    @Body(new ZodValidationPipe(CreateCategoryRequest))
    body: typeof CreateCategoryRequest._type,
  ): Promise<Category> {
    return this.categories.create(user.userId, body.name);
  }

  @Patch(':id')
  async rename(
    @CurrentUser() user: AuthUserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateCategoryRequest))
    body: typeof UpdateCategoryRequest._type,
  ): Promise<Category> {
    return this.categories.rename(user.userId, id, body.name);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthUserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.categories.delete(user.userId, id);
  }
}

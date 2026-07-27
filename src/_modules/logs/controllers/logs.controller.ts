import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiQuery, ApiTags, PartialType } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { AttachStoreId } from 'src/decorators/api/attachStoreIdInterceptor.decorator';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import { GetLogsDTO } from '../dto/get-logs.dto';
import { LogsService } from '../logs.service';

const prefix = 'logs';

@Controller(prefix)
@ApiTags(tag(prefix))
export class LogsController {
  constructor(
    private readonly service: LogsService,
    private readonly response: ResponseService,
  ) {}

  // A Store-role caller only ever sees its own store's entries (storeId is
  // force-set by AttachStoreId); Admin can pass any storeId or omit it for
  // the full platform-wide feed.
  @Get('/')
  @Auth({ prefix })
  @AttachStoreId()
  @ApiQuery({ type: PartialType(GetLogsDTO) })
  async getLogs(@Res() res: Response, @Query() query: GetLogsDTO) {
    const result = await this.service.getLogs(query);
    return this.response.success(
      res,
      'Logs fetched successfully',
      result.data,
      {
        total: result.pagination.total,
      },
    );
  }
}

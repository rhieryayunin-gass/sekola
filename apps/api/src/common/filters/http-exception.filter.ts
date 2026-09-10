import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  ConsoleLogger,
} from "@nestjs/common";
import { Request, Response } from "express";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new ConsoleLogger("HTTPError", { json: true });
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const parserType = typeof exception === "object" && exception !== null && "type" in exception ? exception.type : undefined;
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : parserType === "entity.too.large"
          ? HttpStatus.PAYLOAD_TOO_LARGE
          : parserType === "entity.parse.failed" ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : null;

    const rawMessage =
      typeof exceptionResponse === "object" &&
      exceptionResponse !== null &&
      "message" in exceptionResponse
        ? exceptionResponse.message
        : exception instanceof Error
          ? exception.message
          : "Internal server error";

    const message =
      status >= HttpStatus.INTERNAL_SERVER_ERROR
        ? "Internal server error"
        : status === HttpStatus.PAYLOAD_TOO_LARGE ? "Request body is too large"
          : parserType === "entity.parse.failed" ? "Invalid JSON body" : rawMessage;

    if (status >= 500) this.logger.error({ event: "http_error", statusCode: status, requestId: response.locals.requestId, error: "server_error" });

    response.status(status).json({
      success: false,
      error: {
        statusCode: status,
        message,
      },
      requestId: response.locals.requestId,
      path: typeof request.route?.path === "string" ? request.route.path : "unmatched",
      timestamp: new Date().toISOString(),
    });
  }
}

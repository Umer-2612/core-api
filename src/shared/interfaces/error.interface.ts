export interface ValidationErrorDetail {
  field: string;
  message: string;
  value?: unknown;
}

export interface StandardErrorResponse {
  success: false;
  error: {
    code: number;
    message: string;
    timestamp: string;
    path: string;
    details?: unknown;
  };
}

export const HTTP_ERROR_MESSAGES: Record<number, string> = {
  400: "Bad request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not found",
  409: "Conflict",
  410: "Gone",
  429: "Too many requests",
  500: "Internal server error",
};

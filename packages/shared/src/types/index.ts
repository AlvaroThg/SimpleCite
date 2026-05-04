/**
 * Respuesta estándar de la API de SimpleCite.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Respuesta paginada.
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Payload del JWT firmado por NestJS.
 */
export interface JwtPayload {
  sub: string; // User ID
  email: string;
  role: string;
  tenantId: string;
  iat?: number;
  exp?: number;
}

/**
 * Respuesta de autenticación.
 */
export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    tenantId: string;
  };
}

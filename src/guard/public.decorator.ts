import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/**
 * Помечает маршрут доступным без service-token.
 *
 * Список публичного должен быть коротким и явным: healthcheck платформы и
 * вебхуки, которые аутентифицируются своим секретом. Всё остальное закрыто
 * по умолчанию — потому что «забыл повесить guard» не должно означать
 * «открыто всему интернету».
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

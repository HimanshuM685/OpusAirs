export async function register() {
  // Warehouse initialization belongs to authenticated warehouse requests/workers.
  // Login and page rendering must not await migrations or require DATABASE_URL.
}

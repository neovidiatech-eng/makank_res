import { AsyncLocalStorage } from 'async_hooks';

export const softDeleteContext = new AsyncLocalStorage<{ includeDeleted?: boolean }>();

/**
 * Shared repository handles.
 *
 * Modules that need a repository another module owns import it from here
 * instead of resolving it themselves, so the wiring lives in one place.
 */
export { ReviewRepository } from '../reviews/repository.js';
export { AgentsRepository } from '../agents/repository.js';

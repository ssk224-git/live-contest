// Socket events for a live coding contest. (Placeholder until milestone M8.)
import { AppError } from '../utils/AppError.js';

export const makeContestPlayer = () => ({});
export const contestHostState = (room) => ({ kind: 'contest', code: room.code, phase: room.phase });
export const contestPlayerState = (room) => ({ phase: room.phase });
export const onContestPlayerJoined = () => {};
export const onContestPlayerLeft = () => {};
export function registerContestHandlers() {}

export async function createContestRoom() {
  throw new AppError(501, 'Coding contests are not ready yet');
}

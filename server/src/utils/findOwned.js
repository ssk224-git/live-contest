// Loads a document by id and checks the logged-in host owns it.
// 404 if it does not exist (or the id is malformed), 403 if it belongs to someone else.
import mongoose from 'mongoose';
import { AppError } from './AppError.js';

export async function findOwned(Model, id, userId, label = 'Item') {
  if (!mongoose.isValidObjectId(id)) throw new AppError(404, `${label} not found`);
  const doc = await Model.findById(id);
  if (!doc) throw new AppError(404, `${label} not found`);
  if (doc.owner.toString() !== userId) throw new AppError(403, `This ${label.toLowerCase()} belongs to another host`);
  return doc;
}

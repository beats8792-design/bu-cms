import { ObjectId } from "mongodb";
import { AppError } from "@/modules/shared/errors";

/**
 * Mongo access helpers shared by the academic services.
 * Domain `_id`s are ObjectIds; clients pass hex strings (ARCHITECTURE.md §4).
 */

export function toObjectId(id: string): ObjectId {
  if (!/^[0-9a-f]{24}$/i.test(id)) {
    throw new AppError("VALIDATION_FAILED", "Invalid id.");
  }
  return new ObjectId(id);
}

export function now(): Date {
  return new Date();
}

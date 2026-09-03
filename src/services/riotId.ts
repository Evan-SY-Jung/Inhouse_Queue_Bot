import { DomainError } from "../domain/errors.js";
import { INTERACTION_MESSAGES } from "../messages/interactionMessages.js";

export interface RiotId {
  name: string;
  tag: string;
}

export function parseRiotId(nameInput: string, tagInput: string): RiotId {
  const name = nameInput.trim();
  const tag = tagInput.trim().replace(/^#+/, "");

  if (!name || name.length > 32) {
    throw new DomainError(INTERACTION_MESSAGES.riotId.invalidName, "INVALID_RIOT_NAME");
  }
  if (!tag || tag.length > 10 || tag.includes("#")) {
    throw new DomainError(
      INTERACTION_MESSAGES.riotId.invalidTag,
      "INVALID_RIOT_TAG",
    );
  }
  return { name, tag };
}

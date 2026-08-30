import { DomainError } from "../domain/errors.js";

export interface RiotId {
  name: string;
  tag: string;
}

export function parseRiotId(nameInput: string, tagInput: string): RiotId {
  const name = nameInput.trim();
  const tag = tagInput.trim().replace(/^#+/, "");

  if (!name || name.length > 32) {
    throw new DomainError("라이엇 닉네임을 1~32자로 입력해 주세요.", "INVALID_RIOT_NAME");
  }
  if (!tag || tag.length > 10 || tag.includes("#")) {
    throw new DomainError(
      "라이엇 태그를 # 없이 1~10자로 입력해 주세요.",
      "INVALID_RIOT_TAG",
    );
  }
  return { name, tag };
}

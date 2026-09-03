export const MODAL_FIELD_IDS = {
  categoryId: "category_id",
  date: "date",
  time: "time",
  timezone: "timezone",
  description: "description",
  riotName: "riot_name",
  riotTag: "riot_tag",
  manualMember: "manual_member",
  manualRemove: (page: number) => `manual_remove_${page}`,
  summonConfirmation: "confirmation",
} as const;
